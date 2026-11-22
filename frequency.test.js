"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const engine = require("./grid-engine.js");

// Exercise the shipped import, dispatch and topology code with a manual clock and no canvas.
const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");
const window = { GridboxEngine: engine, performance, setTimeout() {}, clearTimeout() {} };
const elements = new Map();
function element() {
  const el = {
    strokes: [], getBoundingClientRect: () => ({ width: 800, height: 600 }),
    classList: { toggle() {} }, querySelectorAll: () => [], handlers: {},
    addEventListener(name, callback) { this.handlers[name] = callback; }
  };
  const ctx = new Proxy({
    canvas: el, stroke() { el.strokes.push(ctx.strokeStyle); }, measureText: () => ({ width: 8 })
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  el.getContext = () => ctx;
  return el;
}
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  },
  createElement: element, querySelectorAll: () => []
};
Function("window", read("world.js"))(window);
Function("window", read("demo-grid.js"))(window);
Function("window", read("sensors.js"))(window);
const source = read("app.js");
const bootstrap = source.lastIndexOf("  bindEvents();");
assert.ok(bootstrap > 0);
Function("window", "document", "requestAnimationFrame", source.slice(0, bootstrap) + `
  draw = renderProperties = () => {};
  window.test = {state, loadDemo, importGridText, serializeGrid, startSimulation, tripLines, recloseLines,
    validateLine, runSimulationStep, getNode, renderNodeProperties, paintNetworkLayer, hitTestNode, hitTestLine,
    rotatePlaceableNodes, batteryVisualDimensions, setSelection, bindBatteryCommand, batteryCommandControls,
    frequencyHistory, stopSimulation, bulkNodeControlsHtml,
    sensorPlacement, sensorFrequency, hasSensorReference, commandedPower, setMode, removeSelection,
    advanceRotorFrame: ms => paintRotors(rotorTime + ms), rotorAngle: node => rotorAngles.get(node),
    sample: () => world.isWater(1200, 400)};
}());`)(window, document, () => 1);
const app = window.test;
const state = app.state;
const tick = () => app.runSimulationStep({ advanceSeconds: 1 });
const demo = JSON.parse(window.GridboxDemo);
app.loadDemo();
assert.deepEqual(state.errors, []);
assert.deepEqual(state.warnings, []);
assert.equal(state.nodes.length, demo.nodes.length);
assert.equal(state.lines.length, demo.lines.length);
assert.deepEqual(app.serializeGrid().world, demo.world);
assert.deepEqual(state.camera, demo.camera);
state.nodes[0].name = "Edited demo";
app.startSimulation();
tick();
assert.deepEqual(state.errors, []);
app.loadDemo();
assert.equal(state.running, false);
assert.equal(state.elapsedSeconds, demo.elapsedSeconds);
assert.equal(state.nodes[0].name, demo.nodes[0].name);
const near = (actual, wanted, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - wanted) <= tolerance, `expected ${actual} within ${tolerance} of ${wanted}`);
const bus = (id, type, powerKw, x, extra = {}) => ({
  id, type, x, y: 0, minPowerKw: type === "source" ? 0 : 1, maxPowerKw: 10000,
  powerKw, sourceType: "generic", powerProfile: "constant", ...extra
});
const wheel = (id, x, mass = 8000) => bus(id, "flywheel", 0, x, { flywheelMass: mass });
const line = (from, to) => ({ id: from + "-" + to, from, to, type: "distribution", variant: "thick-2" });
function load(nodes, lines) {
  app.importGridText(JSON.stringify({ version: 8, worldSeed: 421, nodes, lines }));
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.warnings, []);
  app.startSimulation();
  assert.deepEqual(state.errors, []);
}

for (const model of engine.flywheels) {
  for (const [type, sign] of [["source", 1], ["load", -1]]) {
    load([wheel("R", 0, model.mass), bus("P", type, 1000, 10), bus("start","source",1,-10)],
      [line("P", "R"), line("start","R")]);
    app.tripLines([state.lines[1]]);
    const r = app.getNode("R");
    near(r.frequencyHz, 60);
    const losses = state.lines[0].lossKw;
    assert.ok(losses > 0);
    near(r.effectivePowerKw, -sign * 1000 + losses, 0.05);
    const solves = window.GridboxPerformance.snapshot().solveCount;
    tick();
    near(r.frequencyHz, 60 + (sign * 1000 - losses) / model.kwSecondsPerHz, 0.0001);
    assert.equal(window.GridboxPerformance.snapshot().solveCount, solves);
  }
}
assert.deepEqual([59, 60, 61].map(engine.visualRpm), [30, 60, 120]);

load([wheel("R", 0), bus("A", "source", 6000, -20), bus("B", "source", 3000, 20),
  bus("D", "load", 2000, 10)], [line("A", "R"), line("B", "R"), line("D", "R")]);
tick();
near(app.getNode("R").frequencyHz, 61);
assert.equal(app.getNode("R").frequencyRelay, "high");
assert.ok(app.getNode("A").curtailedKw > 0);
near(app.getNode("A").curtailedKw / app.getNode("B").curtailedKw, 2);
app.paintNetworkLayer({ width: 800, height: 600 });
assert.ok(elements.get("rotorLayer").strokes.includes("#151a1e"));
assert.ok(elements.get("alarmLayer").strokes.includes("#df3029"));
assert.ok(elements.get("alarmLayer").strokes.includes("#f77a0b"));
app.renderNodeProperties(app.getNode("R"));
assert.match(elements.get("properties").innerHTML, /915\.0 rpm/);
const protectedSolves = window.GridboxPerformance.snapshot().solveCount;
tick(); tick();
assert.equal(window.GridboxPerformance.snapshot().solveCount, protectedSolves);
app.getNode("A").powerKw = 0;
app.getNode("B").powerKw = 1900;
state.simulationNeedsSolve = true;
tick();
assert.ok(app.getNode("R").frequencyHz < 61 && app.getNode("R").frequencyHz > 60.8);
assert.equal(app.getNode("R").frequencyRelay, "high");
tick(); tick(); tick(); tick();
assert.equal(app.getNode("R").frequencyRelay, "normal");

load([wheel("R", 0), bus("A", "load", 6000, -20), bus("B", "load", 3000, 20),
  bus("P", "source", 2500, 10)], [line("A", "R"), line("B", "R"), line("P", "R")]);
tick();
near(app.getNode("R").frequencyHz, 59);
assert.equal(app.getNode("R").frequencyRelay, "low");
assert.ok(app.getNode("B").unservedKw > 0);
near(app.getNode("A").unservedKw / app.getNode("B").unservedKw, 2);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.deepEqual(state.warnings, []);
assert.equal(app.getNode("R").frequencyRelay, "low");
near(app.getNode("R").frequencyHz, 59);

load([wheel("X", 0), wheel("Y", 20, 12000), bus("S", "source", 1000, -10)],
  [line("X", "Y"), line("X", "S")]);
tick();
const x = app.getNode("X"), y = app.getNode("Y");
const [m, n] = engine.flywheels;
near(x.frequencyHz, y.frequencyHz);
near(x.frequencyHz, 60 + 1000 / (m.kwSecondsPerHz + n.kwSecondsPerHz), 0.001);
const separationHz = y.frequencyHz;
app.tripLines([state.lines[0]]);
for (let i = 0; i < 10; i++) tick();
assert.ok(x.frequencyHz > y.frequencyHz);
assert.equal(y.rotorActive, false);
assert.equal(y.rotorSpinning, true);
assert.equal(y.frequencyHz, separationHz);
near(y.effectivePowerKw, 0);
assert.equal(app.frequencyHistory.at(-1).readings.length, 1);
app.renderNodeProperties(y);
assert.match(elements.get("properties").innerHTML, /\(coasting\)/);
assert.ok(elements.get("properties").innerHTML.includes((15 * separationHz).toFixed(1) + " rpm"));
app.paintNetworkLayer({ width: 800, height: 600 });
const angle = app.rotorAngle(y);
app.advanceRotorFrame(100);
near(app.rotorAngle(y), (angle + 0.1 * 2 * Math.PI * engine.visualRpm(separationHz) / 60) % (2 * Math.PI));
const mergedHz = (m.inertia * x.frequencyHz + n.inertia * y.frequencyHz) / (m.inertia + n.inertia);
app.importGridText(JSON.stringify(app.serializeGrid()));
app.startSimulation();
assert.equal(app.getNode("Y").rotorSpinning, true);
assert.equal(app.getNode("Y").frequencyHz, separationHz);
app.recloseLines([state.lines[0]]);
near(app.getNode("X").frequencyHz, mergedHz);
near(app.getNode("Y").frequencyHz, mergedHz);
assert.equal(app.getNode("Y").rotorActive, true);

// Two live islands: sum all spinning inertia on each side, not the number of wheels.
load([wheel("A", 0), wheel("B", 10, 12000), bus("G", "source", 500, -10),
  wheel("C", 30, 16000), bus("P", "source", 20, 40), bus("D", "load", 400, 50)],
  [line("A", "B"), line("G", "A"), line("C", "P"), line("C", "D"),
    { ...line("B", "C"), online: false, tripped: true }]);
tick();
const leftHz = app.getNode("A").frequencyHz, rightHz = app.getNode("C").frequencyHz;
assert.ok(leftHz > 60 && rightHz < 60);
const expected = (70000 * leftHz + 128000 * rightHz) / 198000;
app.recloseLines([state.lines[4]]);
assert.ok(elements.get("networkSummary").textContent.includes("total inertia " + (198000).toLocaleString() + " kg·m²"));
for (const id of ["A", "B", "C"]) near(app.getNode(id).frequencyHz, expected, 1e-10);

load([bus("pole", "pole", 0, 0), wheel("small", 10), wheel("large", 30, 12000)], [line("pole", "small")]);
for (const scale of [0.22, 1, 4]) {
  state.camera.scale = scale;
  for (const [x, id] of [[0, "pole"], [10, "small"]]) {
    assert.equal(app.hitTestNode({ x: x + 1.5, y: -1.5 }).id, id);
    assert.equal(app.hitTestNode({ x, y: 1.51 }), null);
  }
  for (const x of [1.51, 5, 8.49]) {
    assert.equal(app.hitTestNode({ x, y: 0 }), null);
    assert.equal(app.hitTestLine({ x, y: 0 }), state.lines[0]);
  }
  assert.equal(app.hitTestNode({ x: 34, y: 0 }).id, "large");
}

// Both islands need a power and voltage solve on startup. Only X crosses a relay.
load([wheel("X", 0), bus("A", "source", 3000, -10), wheel("Y", 50), bus("B", "load", 100, 60), bus("G","source",1,70)],
  [line("A", "X"), line("B", "Y"), line("G","Y")]);
const solvedMatrices = new Set();
window.GridboxEngine = { ...engine, solve(matrix, ...args) {
  solvedMatrices.add(matrix);
  return engine.solve(matrix, ...args);
} };
tick();
window.GridboxEngine = engine;
assert.equal(solvedMatrices.size, 2);
near(app.getNode("X").frequencyHz, 61);
assert.ok(app.getNode("Y").frequencyHz < 60);
load([wheel("R", 0), bus("L", "load", 8000, 10), bus("G","source",1,20)],
  [{ ...line("R", "L"), variant: "thin-1" }, line("G","L")]);
assert.equal(state.lines[0].tripped, true);
app.recloseLines([state.lines[0]]);
assert.equal(state.lines[0].online, true);
tick();
assert.equal(state.lines[0].tripped, true);
near(app.getNode("R").frequencyHz, 60);

load([wheel("R", 0), bus("D", "load", 2000, 10), bus("B", "battery", 0, -10,
  { batteryCapacityGJ: 10, batteryEnergyGJ: 0.0014, batteryRateMw: 1, batterySetpointMw: 1 })], [line("D", "R"), line("B", "R")]);
tick();
near(app.getNode("B").batteryEnergyGJ, 0.0004);
near(app.getNode("R").frequencyHz, 60 - 0.421, 0.002);
tick(); tick();
assert.equal(app.getNode("B").batteryEnergyGJ, 0);
near(app.getNode("R").frequencyHz, 59);
load([wheel("R", 0), bus("S", "source", 900, 10), bus("B", "battery", 0, -10,
  { batteryCapacityGJ: 10, batteryEnergyGJ: 2, batteryRateMw: 1, batterySetpointMw: -0.8 })], [line("S", "R"), line("B", "R")]);
tick();
near(app.getNode("R").frequencyHz, 60.0421, 0.001);
assert.ok(app.getNode("B").batteryEnergyGJ > 2);
const saved = app.serializeGrid(), water = app.sample();
assert.ok(saved.world.generatorVersion && saved.world.generatorSignature);
saved.worldSeed++; // The descriptor takes precedence over deprecated aliases.
app.importGridText("\uFEFF" + JSON.stringify(saved));
assert.deepEqual(state.errors, []);
assert.deepEqual(state.warnings, []);
assert.equal(app.sample(), water);
assert.deepEqual(app.serializeGrid().world, saved.world);
near(app.getNode("B").batteryEnergyGJ, saved.nodes.find(node => node.id === "B").batteryEnergyGJ, 1e-12);
app.importGridText(JSON.stringify({ ...saved, world: { ...saved.world, generatorSignature: "unknown" } }));
assert.match(state.errors[0], /incompatible/);
app.importGridText('{"nodes":[],"lines":[]}');
assert.match(state.warnings[0], /no world seed/);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.deepEqual(state.warnings, []);
load([bus("L", "load", 800, 0)], []);
assert.match(elements.get("networkSummary").textContent, /total inertia 0 kg·m²/);
assert.equal(app.getNode("L").unservedKw, 800);
load([wheel("R", 0), bus("J", "joint", 0, 100)], []);
assert.match(app.validateLine("R", "J", "transmission"), /100 kV/);
assert.equal(app.validateLine("R", "J", "distribution"), "");
assert.equal(app.getNode("R").rotorActive, false);
assert.equal(app.frequencyHistory.at(-1).readings.length, 0);
load([wheel("dead", 0), bus("L","load",1000,20)], [line("dead","L")]);
assert.equal(app.getNode("dead").rotorActive, false);
assert.equal(app.getNode("dead").rotorSpinning, false);
assert.equal(app.getNode("L").unservedKw, 1000);
load([wheel("R", 0), bus("S", "source", 8000, -10)],
  [{ ...line("S", "R"), variant: "thin-1" }]);
assert.equal(state.lines[0].tripped, true, "Charging the wheel must also trip an undersized feeder");
assert.equal(app.getNode("R").rotorActive, false);
assert.equal(app.getNode("R").rotorSpinning, false);

load([wheel("R1", 0), wheel("R2", 100), bus("S1", "source", 1, 10), bus("S2", "source", 2, 110)],
  [line("S1", "R1"), line("S2", "R2")]);
for (let i = 0; i < 65; i++) tick();
assert.equal(app.frequencyHistory.length, 61);
const readings = app.frequencyHistory.at(-1).readings;
assert.equal(readings.length, 2);
assert.ok(readings[1].slope > readings[0].slope && readings[0].slope > 0);
assert.match(elements.get("frequencyLegend").innerHTML, /RoCoF \+[\d.]+ Hz\/s/);
assert.equal(app.frequencyHistory[0].t, 5);

const bat = id => bus(id, "battery", 0, 0, {batteryCapacityGJ: 100, batteryRateMw: 2, batteryEnergyGJ: 10});
load([bat("A"), bat("B"), wheel("R", 30, 20000)], [line("A", "R"), line("B", "R")]);
const batteries = [app.getNode("A"), app.getNode("B")];
assert.equal(batteries[0].batteryPowerKw, 0);
app.bindBatteryCommand(batteries);
const input = elements.get("batteryCommand");
const slider = elements.get("batteryCommandSlider");
for (const maxRate of [1, 2, 3.333, 10, 40]) {
  for (const b of batteries) b.batteryRateMw = maxRate;
  const commands = [];
  for (let pos = -50; pos <= 50; pos++) {
    slider.value = String(pos);
    slider.handlers.input();
    const kw = Number(input.value) * 1000;
    near(kw, Math.round(kw));
    commands.push(Math.round(kw));
  }
  assert.equal(new Set(commands).size, 101);
  assert.equal(commands[0], -maxRate * 1000);
  assert.equal(commands[50], 0);
  assert.equal(commands[100], maxRate * 1000);
  assert.ok(commands.every((kw, i) => kw === -commands[100 - i]));
}
for (const b of batteries) b.batteryRateMw = 2;
slider.value = "-1";
slider.handlers.change();
for (const b of batteries) near(b.batterySetpointMw, -0.04);
input.value = "4";
input.handlers.keydown({key:"Enter", preventDefault() {}});
for (const b of batteries) near(b.batteryPowerKw, 2000);
tick();
for (const b of batteries) near(b.batteryEnergyGJ, 9.998);
input.value = "-1.5";
input.handlers.keydown({key:"Enter", preventDefault() {}});
tick();
for (const b of batteries) near(b.batteryEnergyGJ, 9.9995);
app.stopSimulation("", false);
app.setSelection([{type:"node", id:"A"},{type:"node", id:"B"}], false);
const before = app.batteryVisualDimensions(batteries[0]);
app.rotatePlaceableNodes();
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.equal(app.getNode("A").batterySetpointMw, -1.5);
assert.equal(app.getNode("B").batteryRotation, 90);
assert.equal(app.batteryVisualDimensions(app.getNode("A")).width, before.height);
app.getNode("B").batteryRateMw = 3;
assert.doesNotMatch(app.batteryCommandControls(state.nodes.slice(0, 2)), /id="batteryCommand"/);

for (const sourceType of ["wind","solar","geothermal"]) {
  load([bus("R","source",100,10,{sourceType,powerProfile:"constant"}),
    bus("C","source",100,20,{sourceType:"coal"})], []);
  assert.equal(app.getNode("R").powerProfile, "variable");
  app.stopSimulation("", false);
  app.renderNodeProperties(app.getNode("R"));
  assert.match(elements.get("properties").innerHTML, /data-power-profile="constant"[^>]* disabled/);
  assert.match(app.bulkNodeControlsHtml(state.nodes), /data-bulk-power-profile="constant"[^>]* disabled/);
}
load([bus("S","source",100,10,{sourceType:"coal",powerProfile:"constant"})], []);
assert.equal(app.getNode("S").powerProfile, "constant");
app.stopSimulation("", false);
app.renderNodeProperties(app.getNode("S"));
assert.match(elements.get("properties").innerHTML, /data-power-profile="variable" class="">/);
app.getNode("S").powerProfile = "variable";
app.getNode("S").variabilityIndex = 3;
app.startSimulation();
assert.equal(app.getNode("S").variabilityIndex, 3);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.equal(app.getNode("S").powerProfile, "variable");
app.importGridText(JSON.stringify({version:7,worldSeed:421,nodes:[wheel("legacy",0,8000)],lines:[]}));
assert.equal(app.getNode("legacy").flywheelMass,16000);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.equal(app.getNode("legacy").flywheelMass,16000);
const rules = window.GridboxSensors;
const sensor = (id, targetId, options = {}) => ({
  id, type: "sensor", x: -50, y: 30, sensor: { targetId, mode: "auto", ...options }
});
const low = (hz, kw) => ({ hz, kw, action: "increase" });
const gas = bus("G", "source", 1000, 0, { sourceType: "gas", maxPowerKw: 5000 });
load([gas, bus("D","load",2000,10), wheel("R",20), sensor("s1","G",{deficit:low(59.6,500)}),
  sensor("s2","G",{deficit:low(59.4,1000)})], [line("G","R"),line("D","R")]);
const generation = () => app.commandedPower(app.getNode("G"));
assert.equal(generation(), 1000);
tick();
assert.equal(generation(), 1500);
tick();
assert.equal(generation(), 2500);
assert.equal(app.getNode("G").effectivePowerKw, 2500);
assert.equal(app.getNode("G").powerKw, 1000);
app.stopSimulation("",false);
assert.equal(app.frequencyHistory.at(-1).t, 2);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.equal(generation(), 2500);
app.startSimulation();
assert.equal(generation(), 2500);
tick();
assert.equal(generation(), 1500);
const editSensor = (nodeId, input, value) => {
  app.renderNodeProperties(app.getNode(nodeId));
  elements.get(input).handlers.change({ target: { value } });
};
editSensor("s1","deficitKw","700");
assert.equal(generation(), 1700);
app.getNode("D").powerKw = 500;
state.simulationNeedsSolve = true;
tick();
assert.equal(generation(), 1000);
assert.equal(app.getNode("s1").sensor.law, "normal");

// Changing a battery request must not mutate the manual dispatch or bypass its limits.
load([gas, bus("D","load",2000,10), wheel("R",20), bat("B"),
  sensor("b","B",{deficit:low(59.6,3500)})], [line("G","R"),line("D","R"),line("B","R")]);
tick();
assert.equal(app.getNode("B").batteryPowerKw, 2000);
assert.equal(app.getNode("B").batterySetpointMw, 0);
editSensor("b","deficitAction","decrease");
assert.equal(app.getNode("B").batteryPowerKw, -2000);
editSensor("b","sensorMode","idle");
assert.equal(app.getNode("B").batteryPowerKw, 0);

// Opening this feeder separates the measuring pole from its only flywheel.
const feeder = line("pole","R");
load([gas, wheel("R",20), bus("pole","pole",0,10), sensor("relay","pole",{
  lineId:feeder.id, excess:{hz:60.2, action:"trip"}})], [line("G","R"),feeder]);
tick();
assert.equal(state.lines[1].tripped, true);
assert.equal(app.sensorFrequency(app.getNode("pole")), null);
const countAtTrip = window.GridboxPerformance.snapshot().solveCount;
app.runSimulationStep({advanceSeconds:0});
assert.equal(window.GridboxPerformance.snapshot().solveCount, countAtTrip);
assert.equal(state.lines[1].tripped, true);
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.equal(state.lines[1].tripped, true);
app.startSimulation();
assert.equal(app.getNode("relay").sensor.law, "excess");
assert.equal(state.lines[1].tripped, true);
editSensor("relay","sensorMode","idle");
assert.equal(state.lines[1].online, true);
app.tripLines([state.lines[1]]);
editSensor("relay","sensorMode","auto");
assert.equal(app.getNode("relay").sensor.mode, "idle");
assert.equal(elements.get("sensorAuto").disabled, true);

// Real breaker protection still runs after an automated close on an overloaded feeder.
load([bus("G","source",7000,0,{sourceType:"gas"}), wheel("R",30), bus("P","pole",0,20),
  bus("D","load",6000,40),sensor("breaker","P",{lineId:"P-D",excess:{hz:60.1,action:"reclose"}})],
  [line("G","R"),line("R","P"),{...line("P","D"),variant:"thin-1",online:false,tripped:true}]);
tick();
assert.equal(app.getNode("breaker").sensor.law,"excess");
assert.equal(state.lines[2].tripped,true);
assert.equal(state.lastTripCount,1);
const countAtOverload = window.GridboxPerformance.snapshot().solveCount;
tick();
assert.equal(window.GridboxPerformance.snapshot().solveCount,countAtOverload);
editSensor("breaker","sensorMode","idle");
assert.equal(state.lines[2].tripped,true);

load([gas, bus("D","load",2000,10),wheel("R",20),sensor("LS","D",{deficit:{hz:59.6,action:"decrease",kw:600}})],
  [line("G","R"),line("D","R")]);
tick();
assert.equal(app.getNode("D").effectivePowerKw,-1400);
app.getNode("D").powerKw = 250;
state.simulationNeedsSolve = true;
app.runSimulationStep({advanceSeconds:0});
assert.equal(app.commandedPower(app.getNode("D")),1);
editSensor("LS","sensorMode","idle");
assert.equal(app.commandedPower(app.getNode("D")),250);
editSensor("LS","deficitHz","60.5");
assert.equal(app.getNode("LS").sensor.deficit.hz,59.6);

// A reclose is a single command, not a repeated attempt to defeat protection.
const breaker = {...feeder, online:false, tripped:true};
const ctl = new rules.Controller(), pole = {id:"pole",type:"pole"};
const relay = action => ({sensor:rules.normalize({targetId:"pole",lineId:breaker.id,mode:"auto",excess:{hz:60.3,action}})});
const close = relay("reclose"), trip = relay("trip");
const poll = (controls, f) => ctl.sample(controls, () => pole, () => breaker, () => f);
poll([close,trip],60.4);
assert.equal(breaker.tripped,true);
poll([close],60.4);
assert.equal(breaker.online,true);
Object.assign(breaker,{online:false,tripped:true});
ctl.externalSwitch(breaker);
assert.equal(poll([close],60.25).topology,false);
assert.equal(breaker.tripped,true);
poll([close],60.1);
assert.equal(breaker.tripped,true);
assert.deepEqual(["coal","gas","nuclear","hydro","wind","solar","geothermal"].map(sourceType =>
  rules.slots({type:"source",sourceType})),[1,3,2,2,0,0,0]);
assert.deepEqual(["load","battery","tower","pole","joint","flywheel","sensor"].map(type =>
  rules.slots({type})),[1,4,2,2,0,0,0]);
assert.equal(rules.eligible({type:"load",powerProfile:"variable"}),false);
assert.equal(rules.eligible({...gas,powerProfile:"variable"}),false);

// Two-click placement, slot limits, a true 3 m radius, and cascading deletion.
load([bus("D","load",100,0), wheel("R",30)], [line("D","R")]);
app.stopSimulation("",false);
app.setMode("sensor");
const point = {x:60,y:50};
app.sensorPlacement(point);
app.sensorPlacement(point,app.getNode("R"));
assert.ok(state.connecting);
assert.equal(state.nodes.length,2);
app.sensorPlacement(point,app.getNode("D"));
const placed = state.nodes.at(-1);
assert.equal(placed.sensor.mode,"idle");
assert.equal(placed.sensor.targetId,"D");
assert.equal(app.hitTestNode({x:63,y:50}),placed);
assert.equal(app.hitTestNode({x:63,y:51}),null);
assert.equal(state.lines.length,1);
assert.ok(app.validateLine(placed.id,"R","distribution"));
app.sensorPlacement(point);
app.sensorPlacement(point,app.getNode("D"));
assert.equal(state.nodes.length,3);
app.setMode("select");
app.setSelection([{type:"node",id:"D"}],false);
app.removeSelection();
assert.equal(app.getNode(placed.id),undefined);
load([bat("B")], []);
app.stopSimulation("",false);
app.setMode("sensor");
for (let i = 0; i < 5; i++) {
  const location = { x: 10 * (i + 1), y: 10 };
  app.sensorPlacement(location);
  app.sensorPlacement(location, app.getNode("B"));
  assert.equal(state.nodes.length, 1 + Math.min(i + 1, 4));
}
app.importGridText(JSON.stringify(app.serializeGrid()));
assert.deepEqual(state.warnings, []);
assert.equal(state.nodes.filter(n => n.sensor?.targetId === "B").length, 4);
console.log("Frequency, protection, sensors, battery, island and save compatibility checks passed.");

// Optional local city benchmark; the provided file is only read.
if (process.argv[2]) {
  app.importGridText(fs.readFileSync(process.argv[2], "utf8"));
  assert.deepEqual(state.errors, []);
  const city = app.serializeGrid();
  const yard = city.nodes.find(node => node.type === "joint");
  assert.ok(yard);
  city.nodes.push({ ...wheel("bench-rotor", yard.x + 10, 20000), y: yard.y + 10 });
  city.lines.push(line("bench-rotor", yard.id));
  const targets = city.nodes.filter(rules.eligible);
  for (const [i, target] of targets.entries()) {
    const branch = rules.switching(target);
    const s = sensor("bench-sensor-" + i, target.id, {
      deficit: {hz:59.6, kw:25, action:branch ? "none" : target.type === "load" ? "decrease" : "increase"},
      excess: {hz:60.4, kw:25, action:branch ? "none" : target.type === "load" ? "increase" : "decrease"}
    });
    city.nodes.push({...s, x:target.x + 10, y:target.y + 10});
  }
  app.importGridText(JSON.stringify(city));
  const t0 = performance.now();
  app.startSimulation();
  const startMs = performance.now() - t0;
  const cached = [], solved = [];
  for (let i = 0; i < 60; i++) {
    const count = window.GridboxPerformance.snapshot().solveCount;
    const start = performance.now();
    tick();
    (window.GridboxPerformance.snapshot().solveCount === count ? cached : solved).push(performance.now() - start);
  }
  assert.deepEqual(state.errors, []);
  const report = values => values.length ? (values.reduce((a,b) => a+b, 0) / values.length).toFixed(2) : "n/a";
  console.log(`${city.nodes.length} nodes (including ${targets.length} sensors), ${city.lines.length} lines: startup ${startMs.toFixed(1)} ms; ${cached.length} cached ticks averaged ${report(cached)} ms; ${solved.length} solve ticks averaged ${report(solved)} ms (no rendering).`);
}
