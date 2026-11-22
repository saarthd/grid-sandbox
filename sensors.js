(function () {
  "use strict";

  const sourceSlots = { coal: 1, gas: 3, nuclear: 2, hydro: 2 };
  function slots(node) {
    if (!node) return 0;
    if (node.type === "tower" || node.type === "pole") return 2;
    if (node.type === "source") return sourceSlots[node.sourceType] || 0;
    if (node.type === "battery") return 4;
    return node.type === "load" ? 1 : 0;
  }

  const eligible = node => Boolean(slots(node)) &&
    (!["source", "load"].includes(node.type) || node.powerProfile === "constant");
  const switching = node => node?.type === "pole" || node?.type === "tower";
  const actions = node => switching(node) ? ["none", "trip", "reclose"] : ["none", "increase", "decrease"];
  function normalize(raw = {}) {
    const rule = (r, hz) => ({
      hz: Number.isFinite(r?.hz) ? Math.max(59, Math.min(61, r.hz)) : hz,
      action: ["trip", "reclose", "increase", "decrease"].includes(r?.action) ? r.action : "none",
      kw: Number.isFinite(r?.kw) ? Math.max(0, Math.min(100000, Math.round(r.kw))) : 500
    });
    const excess = rule(raw.excess, 60.4), deficit = rule(raw.deficit, 59.6);
    if (excess.hz <= deficit.hz) { excess.hz = 60.4; deficit.hz = 59.6; }
    return { targetId: String(raw.targetId ?? ""), lineId: String(raw.lineId ?? ""),
      mode: raw.mode === "auto" ? "auto" : "idle",
      law: raw.mode === "auto" && ["excess", "deficit"].includes(raw.law) ? raw.law : "normal", excess, deficit };
  }

  function nextLaw(config, hz) {
    const lo = config.deficit.hz, hi = config.excess.hz;
    const band = Math.min(0.10, (hi - lo) / 3);
    if (hz > hi) return "excess";
    if (hz < lo) return "deficit";
    if (config.law === "excess" && hz > hi - band) return "excess";
    if (config.law === "deficit" && hz < lo + band) return "deficit";
    return "normal";
  }

  class Controller {
    constructor() {
      this.offsets = new Map();
      this.switches = new Map();
      this.previousCommand = new WeakMap();
    }
    // Manual switching and overload protection supersede a previously issued command.
    externalSwitch(line) {
      const entry = this.switches.get(line.id);
      if (entry) { entry.base = line.online; entry.baseTripped = line.tripped; }
    }
    sample(sensors, getNode, getLine, frequency) {
      if (!sensors.length && !this.offsets.size && !this.switches.size) return {};
      const offsets = new Map(), intents = new Map(), newTrips = new Set(), newRecloses = new Set();
      let visual = false, topology = false;
      for (const sensor of sensors) {
        const cfg = sensor.sensor, target = getNode(cfg.targetId);
        const prev = cfg.law;
        if (!eligible(target) && cfg.mode === "auto") { cfg.mode = "idle"; visual = true; }
        if (cfg.mode !== "auto") cfg.law = "normal";
        else {
          const hz = frequency(target);
          if (Number.isFinite(hz)) cfg.law = nextLaw(cfg, hz);
          // Loss of telemetry holds the last law; never undo a trip just because it split the island.
        }
        visual ||= prev !== cfg.law;
        if (cfg.law === "normal") { this.previousCommand.delete(sensor); continue; }
        const r = cfg[cfg.law];
        if (switching(target)) {
          const line = getLine(cfg.lineId);
          if (!line || (line.from !== target.id && line.to !== target.id) || !["trip","reclose"].includes(r.action)) {
            this.previousCommand.delete(sensor);
            continue;
          }
          const previous = this.previousCommand.get(sensor);
          if (!previous || previous.line !== line || previous.law !== cfg.law || previous.action !== r.action) {
            (r.action === "trip" ? newTrips : newRecloses).add(line.id);
            this.previousCommand.set(sensor, { line, law: cfg.law, action: r.action });
          }
          if (r.action === "trip" || (r.action === "reclose" && !intents.has(line.id))) intents.set(line.id, r.action);
        } else if (r.action === "increase" || r.action === "decrease") {
          offsets.set(target.id, (offsets.get(target.id) || 0) + (r.action === "increase" ? r.kw : -r.kw));
        }
      }
      const powerNodes = [];
      for (const [id, kw] of offsets) if (kw !== (this.offsets.get(id) || 0)) powerNodes.push(id);
      for (const [id, kw] of this.offsets) if (kw && !offsets.has(id)) powerNodes.push(id);
      this.offsets = offsets;
      const set = (line, online, tripped = !online) => {
        if (!line || (line.online === online && line.tripped === tripped)) return;
        line.online = online;
        line.tripped = tripped;
        topology = true;
      };
      for (const [id, entry] of this.switches) {
        if (intents.has(id)) continue;
        set(getLine(id), entry.base, entry.baseTripped);
        this.switches.delete(id);
      }
      for (const [id, intent] of intents) {
        const entry = this.switches.get(id), line = getLine(id);
        if (entry?.intent === intent && !(intent === "trip" ? newTrips : newRecloses).has(id)) continue;
        this.switches.set(id, { intent, base: entry ? entry.base : line.online, baseTripped: entry ? entry.baseTripped : line.tripped });
        set(line, intent === "reclose");
      }
      return { visual, powerNodes, topology };
    }
  }
  window.GridboxSensors = { slots, eligible, switching, actions, normalize, nextLaw, Controller };
}());
