(function () {
  "use strict";

  const canvas = document.getElementById("gridCanvas");
  const ctx = canvas.getContext("2d");
  const propertiesEl = document.getElementById("properties");
  const solveButton = document.getElementById("solveButton");
  const demoButton = document.getElementById("demoButton");
  const saveButton = document.getElementById("saveButton");
  const loadSavedButton = document.getElementById("loadSavedButton");
  const importFileInput = document.getElementById("importFileInput");
  const clearButton = document.getElementById("clearButton");
  const deleteButton = document.getElementById("deleteButton");
  const zoomInButton = document.getElementById("zoomInButton");
  const zoomOutButton = document.getElementById("zoomOutButton");
  const zoomReadout = document.getElementById("zoomReadout");
  const canvasStatus = document.getElementById("canvasStatus");
  const networkSummary = document.getElementById("networkSummary");
  const warningSummary = document.getElementById("warningSummary");
  const solveBadge = document.getElementById("solveBadge");

  const CLICK_RADIUS_M = 5;
  const SOURCE_RADIUS_M = 12;
  const JOINT_RADIUS_M = 10;
  const BATTERY_WIDTH_M = 18;
  const BATTERY_HEIGHT_M = 10;
  const POLE_RADIUS_M = 1.6;
  const TOWER_SIZE_M = 8;
  const DEFAULT_LINE_VARIANT = "thin-2";
  const BASE_VOLTAGE = 10000;
  const TRANSMISSION_RATIO = 10;
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 0.22;

  const LINE_VARIANTS = {
    "thin-1": { label: "1x thin wire", currentLimitA: 500, wireCount: 1, thicknessM: 0.45 },
    "thin-2": { label: "2x thin wire", currentLimitA: 1000, wireCount: 2, thicknessM: 0.45 },
    "thick-1": { label: "1x thick wire", currentLimitA: 2000, wireCount: 1, thicknessM: 1.05 },
    "thick-2": { label: "2x thick wire", currentLimitA: 4000, wireCount: 2, thicknessM: 1.05 }
  };

  const colors = {
    bg: "#edf2f5",
    grid: "#d8e1e7",
    gridStrong: "#b8c8d1",
    text: "#1e2a31",
    muted: "#60707a",
    panel: "rgba(255,255,255,0.92)",
    selected: "#f4c542",
    source: "#e7a52d",
    joint: "#7b65c7",
    load: "#2f6fab",
    battery: "#2b9a64",
    pole: "#6b3a12",
    tower: "#ffffff",
    towerLine: "#aeb8bf",
    distribution: "#008a80",
    transmission: "#bd3e55",
    tripped: "#c73535",
    offline: "#8d9aa2"
  };

  const state = {
    nodes: [],
    lines: [],
    mode: "select",
    selected: null,
    connecting: null,
    nextNodeId: 1,
    nextLineId: 1,
    camera: { x: 0, y: 0, scale: 1 },
    pointer: {
      down: false,
      button: 0,
      id: null,
      startScreen: null,
      lastScreen: null,
      startWorld: null,
      action: null,
      dragNodeId: null
    },
    solved: false,
    dirty: true,
    warnings: [],
    errors: [],
    lastTripCount: 0,
    nodeClipboard: null,
    placement: {
      jointType: "joint",
      distributionVariant: DEFAULT_LINE_VARIANT,
      transmissionVariant: DEFAULT_LINE_VARIANT
    }
  };

  function nodeDefaults(type, x, y) {
    const id = state.nextNodeId++;
    const labels = {
      source: "Source",
      joint: "Substation",
      pole: "Pole",
      tower: "Tower",
      load: "Load",
      battery: "Battery"
    };

    return {
      id: `N${id}`,
      type,
      name: `${labels[type]} ${id}`,
      display: type === "joint" ? `S${id % 10}` : "",
      x,
      y,
      powerKw: type === "source" ? 7500 : type === "load" ? 3000 : 0,
      maxPowerKw: type === "source" ? 10000 : type === "load" ? 10000 : 0,
      voltage: BASE_VOLTAGE,
      effectivePowerKw: 0,
      batteryPowerKw: 0,
      lineNetKw: 0,
      curtailedKw: 0,
      unservedKw: 0,
      island: 0
    };
  }

  function lineDefaults(from, to, type) {
    return {
      id: `L${state.nextLineId++}`,
      from,
      to,
      type,
      variant: DEFAULT_LINE_VARIANT,
      online: true,
      tripped: false,
      currentA: 0,
      powerKw: 0,
      fromPowerKw: 0,
      toPowerKw: 0,
      lossKw: 0,
      lengthM: 0,
      resistance: 0,
      island: 0
    };
  }

  function resetSolution() {
    state.nodes.forEach((node) => {
      node.voltage = BASE_VOLTAGE;
      node.effectivePowerKw = 0;
      node.batteryPowerKw = 0;
      node.lineNetKw = 0;
      node.curtailedKw = 0;
      node.unservedKw = 0;
      node.island = 0;
    });
    state.lines.forEach((line) => {
      line.currentA = 0;
      line.powerKw = 0;
      line.fromPowerKw = 0;
      line.toPowerKw = 0;
      line.lossKw = 0;
      line.island = 0;
      updateLineGeometry(line);
    });
  }

  function setDirty(message) {
    state.dirty = true;
    state.solved = false;
    state.warnings = [];
    state.errors = [];
    state.lastTripCount = 0;
    resetSolution();
    setCanvasStatus(message || "Edited");
    renderAll();
  }

  function setCanvasStatus(message) {
    canvasStatus.textContent = message;
  }

  function getNode(id) {
    return state.nodes.find((node) => node.id === id);
  }

  function getLine(id) {
    return state.lines.find((line) => line.id === id);
  }

  function nodeColor(type) {
    return colors[type] || colors.joint;
  }

  function lineColor(type) {
    return type === "transmission" ? colors.transmission : colors.distribution;
  }

  function lineVoltageKv(line) {
    return line.type === "transmission" ? 100 : 10;
  }

  function lineVariant(line) {
    return LINE_VARIANTS[line.variant] || LINE_VARIANTS[DEFAULT_LINE_VARIANT];
  }

  function lineCurrentLimitA(line) {
    return lineVariant(line).currentLimitA;
  }

  function lineVariantOptions(selected) {
    return Object.entries(LINE_VARIANTS).map(([value, variant]) => {
      const active = value === selected ? " selected" : "";
      return `<option value="${value}"${active}>${variant.label} (${variant.currentLimitA} A)</option>`;
    }).join("");
  }

  function jointTypeOptions(selected) {
    const options = [
      ["joint", "Substation"],
      ["pole", "Pole"],
      ["tower", "Tower"]
    ];
    return options.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
  }

  function jointTypeLabel(value) {
    return {
      joint: "Substation",
      pole: "Pole",
      tower: "Tower"
    }[value] || "Joint";
  }

  function resistanceFor(line) {
    const perMeter = line.type === "transmission" ? 0.0001 : 0.001;
    return Math.max(line.lengthM * perMeter, 0.0001);
  }

  function updateLineGeometry(line) {
    const from = getNode(line.from);
    const to = getNode(line.to);
    if (!from || !to) return;
    line.lengthM = distance(from.x, from.y, to.x, to.y);
    line.resistance = resistanceFor(line);
  }

  function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.hypot(dx, dy);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatKw(value, digits) {
    const abs = Math.abs(value);
    const sign = value < -0.05 ? "-" : "";
    const precision = typeof digits === "number" ? digits : abs >= 1000 ? 0 : 1;
    return `${sign}${abs.toLocaleString(undefined, { maximumFractionDigits: precision })} kW`;
  }

  function formatSignedKw(value, digits) {
    if (Math.abs(value) < 0.05) return "0 kW";
    const precision = typeof digits === "number" ? digits : Math.abs(value) >= 1000 ? 0 : 1;
    return `${value > 0 ? "+" : "-"}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: precision })} kW`;
  }

  function formatCurrent(value) {
    const abs = Math.abs(value);
    return `${abs.toLocaleString(undefined, { maximumFractionDigits: abs >= 100 ? 0 : 1 })} A`;
  }

  function formatVoltage(node, level) {
    const kv = level === "transmission" ? (node.voltage * TRANSMISSION_RATIO) / 1000 : node.voltage / 1000;
    return `${kv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kV`;
  }

  function formatLength(meters) {
    if (meters >= 1000) {
      return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;
    }
    return `${meters.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`;
  }

  function powerStepForMax(maxKw) {
    const max = Number(maxKw) || 0;
    if (max <= 100) return 1;
    if (max <= 1000) return 10;
    return 100;
  }

  function screenToWorld(x, y) {
    return {
      x: (x - state.camera.x) / state.camera.scale,
      y: (y - state.camera.y) / state.camera.scale
    };
  }

  function worldToScreen(x, y) {
    return {
      x: x * state.camera.scale + state.camera.x,
      y: y * state.camera.scale + state.camera.y
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function setMode(mode) {
    state.mode = mode;
    state.connecting = null;
    document.querySelectorAll(".tool-button[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    const messages = {
      select: "Select",
      source: "Add source",
      joint: `Add ${jointTypeLabel(state.placement.jointType)}`,
      load: "Add load",
      battery: "Add battery",
      "line-distribution": `Draw 10 kV ${lineVariant({ variant: state.placement.distributionVariant }).label}`,
      "line-transmission": `Draw 100 kV ${lineVariant({ variant: state.placement.transmissionVariant }).label}`
    };
    setCanvasStatus(messages[mode] || "Ready");
    draw();
  }

  function selectItem(type, id) {
    state.selected = type && id ? { type, id } : null;
    renderAll();
  }

  function selectedNode() {
    return state.selected && state.selected.type === "node" ? getNode(state.selected.id) : null;
  }

  function selectedLine() {
    return state.selected && state.selected.type === "line" ? getLine(state.selected.id) : null;
  }

  function isTransmissionEndpoint(node) {
    return node && (node.type === "joint" || node.type === "tower");
  }

  function isDistributionEndpoint(node) {
    return node && node.type !== "tower";
  }

  function validateLine(fromId, toId, type) {
    if (fromId === toId) return "Choose a second node";
    const from = getNode(fromId);
    const to = getNode(toId);
    if (!from || !to) return "Missing node";
    const duplicate = state.lines.some((line) => {
      return (line.from === fromId && line.to === toId) || (line.from === toId && line.to === fromId);
    });
    if (duplicate) return "Line already exists";
    if (type === "transmission" && (!isTransmissionEndpoint(from) || !isTransmissionEndpoint(to))) {
      return "100 kV lines connect substations or towers";
    }
    if (type === "distribution" && (!isDistributionEndpoint(from) || !isDistributionEndpoint(to))) {
      return "10 kV lines connect poles, substations, sources, loads, or batteries";
    }
    if (type === "distribution") {
      return "";
    }
    return "";
  }

  function addNode(type, point) {
    const actualType = type === "joint" ? state.placement.jointType : type;
    const node = nodeDefaults(actualType, snap(point.x), snap(point.y));
    state.nodes.push(node);
    selectItem("node", node.id);
    setDirty(`${node.name} added`);
  }

  function addLine(fromId, toId, type) {
    const message = validateLine(fromId, toId, type);
    if (message) {
      setCanvasStatus(message);
      state.connecting = null;
      draw();
      return false;
    }
    const line = lineDefaults(fromId, toId, type);
    line.variant = type === "transmission" ? state.placement.transmissionVariant : state.placement.distributionVariant;
    updateLineGeometry(line);
    state.lines.push(line);
    selectItem("line", line.id);
    setDirty(`${line.id} added`);
    return true;
  }

  function snap(value) {
    return Math.round(value / 10) * 10;
  }

  function removeSelection() {
    if (!state.selected) return;
    if (state.selected.type === "node") {
      const id = state.selected.id;
      state.nodes = state.nodes.filter((node) => node.id !== id);
      state.lines = state.lines.filter((line) => line.from !== id && line.to !== id);
    } else if (state.selected.type === "line") {
      state.lines = state.lines.filter((line) => line.id !== state.selected.id);
    }
    state.selected = null;
    setDirty("Deleted");
  }

  function copySelectedNode() {
    const node = selectedNode();
    if (!node) {
      setCanvasStatus("Select a node to copy");
      return;
    }
    state.nodeClipboard = {
      type: node.type,
      name: node.name,
      display: node.display || "",
      x: node.x,
      y: node.y,
      powerKw: node.powerKw || 0,
      maxPowerKw: node.maxPowerKw || 0
    };
    setCanvasStatus(`${node.name} copied`);
    renderProperties();
  }

  function pasteCopiedNode() {
    if (!state.nodeClipboard) {
      setCanvasStatus("No copied node");
      return;
    }
    const copied = state.nodeClipboard;
    const anchor = selectedNode() || copied;
    const node = nodeDefaults(copied.type, snap(anchor.x + 30), snap(anchor.y + 30));
    node.name = uniqueNodeName(`${copied.name} copy`);
    node.display = copied.type === "joint" ? String(copied.display || copied.name).slice(0, 2).toUpperCase() : "";
    node.powerKw = Number(copied.powerKw) || 0;
    node.maxPowerKw = Number(copied.maxPowerKw) || 0;
    normalizeNode(node);
    state.nodes.push(node);
    state.selected = { type: "node", id: node.id };
    setDirty(`${node.name} pasted`);
  }

  function uniqueNodeName(baseName) {
    const names = new Set(state.nodes.map((node) => node.name));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName} ${index}`)) index += 1;
    return `${baseName} ${index}`;
  }

  function isTextEditingTarget(target) {
    if (!target) return false;
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
  }

  function hitTestNode(world) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const node = state.nodes[i];
      if (distance(world.x, world.y, node.x, node.y) <= CLICK_RADIUS_M) {
        return node;
      }
    }
    return null;
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return distance(point.x, point.y, a.x, a.y);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    return distance(point.x, point.y, x, y);
  }

  function hitTestLine(world) {
    let best = null;
    let bestDistance = Infinity;
    const tolerance = 9 / state.camera.scale;
    state.lines.forEach((line) => {
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (!from || !to) return;
      const d = distanceToSegment(world, from, to);
      if (d < tolerance && d < bestDistance) {
        best = line;
        bestDistance = d;
      }
    });
    return best;
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function onPointerDown(event) {
    canvas.setPointerCapture(event.pointerId);
    const screen = pointerPosition(event);
    const world = screenToWorld(screen.x, screen.y);
    const node = hitTestNode(world);
    const line = hitTestLine(world);

    state.pointer = {
      down: true,
      button: event.button,
      id: event.pointerId,
      startScreen: screen,
      lastScreen: screen,
      startWorld: world,
      action: null,
      dragNodeId: null
    };

    if (state.mode.startsWith("line-")) {
      if (node) {
        handleLineClick(node);
      }
      return;
    }

    if (state.mode !== "select") {
      addNode(state.mode, world);
      return;
    }

    if (node) {
      selectItem("node", node.id);
      state.pointer.action = "drag-node";
      state.pointer.dragNodeId = node.id;
      return;
    }

    if (line) {
      selectItem("line", line.id);
      return;
    }

    selectItem(null, null);
    state.pointer.action = "pan";
  }

  function handleLineClick(node) {
    const type = state.mode === "line-transmission" ? "transmission" : "distribution";
    if (!state.connecting) {
      state.connecting = { from: node.id, type };
      selectItem("node", node.id);
      setCanvasStatus(type === "transmission" ? "100 kV start selected" : "10 kV start selected");
      draw();
      return;
    }
    if (state.connecting.type !== type) {
      state.connecting = { from: node.id, type };
      selectItem("node", node.id);
      draw();
      return;
    }
    addLine(state.connecting.from, node.id, type);
    state.connecting = null;
    draw();
  }

  function onPointerMove(event) {
    if (!state.pointer.down) return;
    const screen = pointerPosition(event);
    const dx = screen.x - state.pointer.lastScreen.x;
    const dy = screen.y - state.pointer.lastScreen.y;
    state.pointer.lastScreen = screen;

    if (state.pointer.action === "drag-node") {
      const node = getNode(state.pointer.dragNodeId);
      if (!node) return;
      const world = screenToWorld(screen.x, screen.y);
      node.x = snap(world.x);
      node.y = snap(world.y);
      state.lines.forEach(updateLineGeometry);
      state.dirty = true;
      state.solved = false;
      resetSolution();
      updateSummaries();
      renderProperties();
      draw();
      return;
    }

    if (state.pointer.action === "pan") {
      state.camera.x += dx;
      state.camera.y += dy;
      draw();
    }
  }

  function onPointerUp(event) {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.pointer.down = false;
    state.pointer.action = null;
    state.pointer.dragNodeId = null;
  }

  function onWheel(event) {
    event.preventDefault();
    const screen = pointerPosition(event);
    const before = screenToWorld(screen.x, screen.y);
    const delta = event.deltaY < 0 ? 1.12 : 0.89;
    state.camera.scale = clamp(state.camera.scale * delta, MIN_ZOOM, MAX_ZOOM);
    state.camera.x = screen.x - before.x * state.camera.scale;
    state.camera.y = screen.y - before.y * state.camera.scale;
    renderAll();
  }

  function zoomBy(factor) {
    const rect = canvas.getBoundingClientRect();
    const screen = { x: rect.width / 2, y: rect.height / 2 };
    const before = screenToWorld(screen.x, screen.y);
    state.camera.scale = clamp(state.camera.scale * factor, MIN_ZOOM, MAX_ZOOM);
    state.camera.x = screen.x - before.x * state.camera.scale;
    state.camera.y = screen.y - before.y * state.camera.scale;
    renderAll();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, rect.width, rect.height);
    drawGrid(rect);
    drawLines();
    drawConnectionPreview();
    drawNodes();
    ctx.restore();
    zoomReadout.textContent = `${Math.round(state.camera.scale * 100)}%`;
  }

  function drawGrid(rect) {
    const scale = state.camera.scale;
    const base = chooseGridStep(scale);
    const leftTop = screenToWorld(0, 0);
    const rightBottom = screenToWorld(rect.width, rect.height);
    const startX = Math.floor(leftTop.x / base) * base;
    const endX = Math.ceil(rightBottom.x / base) * base;
    const startY = Math.floor(leftTop.y / base) * base;
    const endY = Math.ceil(rightBottom.y / base) * base;

    ctx.lineWidth = 1;
    for (let x = startX; x <= endX; x += base) {
      const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
      ctx.strokeStyle = Math.abs(x % (base * 5)) < 0.01 ? colors.gridStrong : colors.grid;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, rect.height);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += base) {
      const sy = Math.round(worldToScreen(0, y).y) + 0.5;
      ctx.strokeStyle = Math.abs(y % (base * 5)) < 0.01 ? colors.gridStrong : colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(rect.width, sy);
      ctx.stroke();
    }
  }

  function chooseGridStep(scale) {
    if (scale > 3.15) return 10;
    if (scale > 1.7) return 20;
    if (scale > 0.85) return 50;
    if (scale > 0.45) return 100;
    return 250;
  }

  function drawLines() {
    state.lines.forEach((line) => {
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (!from || !to) return;
      const a = worldToScreen(from.x, from.y);
      const b = worldToScreen(to.x, to.y);
      const selected = state.selected && state.selected.type === "line" && state.selected.id === line.id;
      const color = line.tripped ? colors.tripped : line.online ? "#111820" : colors.offline;

      if (selected) {
        ctx.save();
        ctx.strokeStyle = colors.selected;
        ctx.lineWidth = Math.max(1, (lineVariant(line).thicknessM + 2.2) * state.camera.scale);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      drawLineBundle(from, to, line, color);
      ctx.restore();
    });
  }

  function drawLineBundle(from, to, line, color) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const variant = lineVariant(line);
    const offsets = wireOffsetsM(line);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    ctx.strokeStyle = color;
    ctx.lineWidth = variant.thicknessM * state.camera.scale;
    ctx.lineCap = "round";
    if (!line.online || line.tripped) ctx.setLineDash([6 * state.camera.scale, 4 * state.camera.scale]);
    ctx.beginPath();
    offsets.forEach((offsetM) => {
      const startM = nodeBoundaryDistanceM(from, ux, uy, offsetM);
      const endM = nodeBoundaryDistanceM(to, -ux, -uy, offsetM);
      const start = worldToScreen(from.x + nx * offsetM + ux * startM, from.y + ny * offsetM + uy * startM);
      const end = worldToScreen(to.x + nx * offsetM - ux * endM, to.y + ny * offsetM - uy * endM);
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    });
    ctx.stroke();
  }

  function wireOffsetsM(line) {
    const variant = lineVariant(line);
    if (variant.wireCount === 1) return [0];
    const spacingM = line.type === "distribution" ? POLE_RADIUS_M * 1.85 : TOWER_SIZE_M * 0.88;
    return [-spacingM / 2, spacingM / 2];
  }

  function nodeBoundaryDistanceM(node, ux, uy, offsetM) {
    if (node.type === "pole") {
      const radius = POLE_RADIUS_M;
      return Math.sqrt(Math.max(0, radius * radius - offsetM * offsetM));
    }
    if (node.type === "source" || node.type === "joint") {
      const radius = node.type === "source" ? SOURCE_RADIUS_M : JOINT_RADIUS_M;
      return Math.sqrt(Math.max(0, radius * radius - offsetM * offsetM));
    }
    if (node.type === "tower") {
      return distanceToBoxBoundary(TOWER_SIZE_M / 2, TOWER_SIZE_M / 2, ux, uy, offsetM);
    }
    if (node.type === "load") {
      const half = loadSizeM(node) / 2;
      return distanceToBoxBoundary(half, half, ux, uy, offsetM);
    }
    if (node.type === "battery") {
      return distanceToBoxBoundary(BATTERY_WIDTH_M / 2, BATTERY_HEIGHT_M / 2, ux, uy, offsetM);
    }
    return nodeVisualRadiusM(node);
  }

  function distanceToBoxBoundary(halfW, halfH, ux, uy, offsetM) {
    const nx = -uy;
    const ny = ux;
    const x0 = nx * offsetM;
    const y0 = ny * offsetM;
    const candidates = [];
    if (Math.abs(ux) > 1e-6) {
      const tx = (Math.sign(ux) * halfW - x0) / ux;
      const y = y0 + uy * tx;
      if (tx >= 0 && y >= -halfH - 1e-6 && y <= halfH + 1e-6) candidates.push(tx);
    }
    if (Math.abs(uy) > 1e-6) {
      const ty = (Math.sign(uy) * halfH - y0) / uy;
      const x = x0 + ux * ty;
      if (ty >= 0 && x >= -halfW - 1e-6 && x <= halfW + 1e-6) candidates.push(ty);
    }
    return candidates.length ? Math.min(...candidates) : Math.min(halfW, halfH);
  }

  function drawConnectionPreview() {
    if (!state.connecting || !state.pointer.lastScreen) return;
    const from = getNode(state.connecting.from);
    if (!from) return;
    const a = worldToScreen(from.x, from.y);
    const b = state.pointer.lastScreen;
    ctx.save();
    ctx.strokeStyle = "#111820";
    ctx.lineWidth = lineVariant({ variant: DEFAULT_LINE_VARIANT }).thicknessM * state.camera.scale;
    ctx.setLineDash([6 * state.camera.scale, 4 * state.camera.scale]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawNodes(labelBoxes) {
    state.nodes.forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      const selected = state.selected && state.selected.type === "node" && state.selected.id === node.id;
      const connecting = state.connecting && state.connecting.from === node.id;
      drawNodeShape(node, p, selected || connecting);
    });
  }

  function drawNodeShape(node, p, selected) {
    const fill = nodeColor(node.type);
    const scale = state.camera.scale;
    ctx.save();
    if (selected) {
      ctx.fillStyle = "rgba(244,197,66,0.38)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, (nodeVisualRadiusM(node) + 3) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = "rgba(15, 24, 31, 0.18)";
    ctx.shadowBlur = 2.5 * scale;
    ctx.shadowOffsetY = 0.8 * scale;
    ctx.fillStyle = fill;
    ctx.strokeStyle = node.type === "tower" ? colors.towerLine : "#ffffff";
    ctx.lineWidth = 0.7 * scale;

    if (node.type === "joint") {
      drawHexagon(p.x, p.y, JOINT_RADIUS_M * scale);
    } else if (node.type === "tower") {
      const size = TOWER_SIZE_M * scale;
      ctx.beginPath();
      ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
    } else if (node.type === "pole") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POLE_RADIUS_M * scale, 0, Math.PI * 2);
    } else if (node.type === "battery") {
      roundedRect(p.x - BATTERY_WIDTH_M * scale / 2, p.y - BATTERY_HEIGHT_M * scale / 2, BATTERY_WIDTH_M * scale, BATTERY_HEIGHT_M * scale, 1.5 * scale);
    } else if (node.type === "load") {
      const size = loadSizeM(node) * scale;
      ctx.beginPath();
      ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, SOURCE_RADIUS_M * scale, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    drawNodeInlineText(node, p);
    ctx.restore();
  }

  function nodeVisualRadiusM(node) {
    if (node.type === "source") return SOURCE_RADIUS_M;
    if (node.type === "joint") return JOINT_RADIUS_M;
    if (node.type === "pole") return POLE_RADIUS_M;
    if (node.type === "tower") return Math.SQRT2 * TOWER_SIZE_M / 2;
    if (node.type === "load") return Math.SQRT2 * loadSizeM(node) / 2;
    if (node.type === "battery") return Math.hypot(BATTERY_WIDTH_M, BATTERY_HEIGHT_M) / 2;
    return 8;
  }

  function loadSizeM(node) {
    const maxKw = node.maxPowerKw || node.powerKw || 0;
    if (maxKw <= 99) return 5;
    if (maxKw <= 999) return 10;
    return 20;
  }

  function drawHexagon(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + (Math.PI * 2 * i) / 6;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawNodeInlineText(node, p) {
    const scale = state.camera.scale;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (node.type === "source" || node.type === "load") {
      ctx.font = `800 ${Math.max(1, 3.1 * scale)}px Inter, Segoe UI, sans-serif`;
      ctx.fillText(String(Math.round(node.powerKw || 0)), p.x, p.y);
    } else if (node.type === "joint") {
      ctx.font = `850 ${Math.max(1, 4.1 * scale)}px Inter, Segoe UI, sans-serif`;
      ctx.fillText((node.display || "").slice(0, 2).toUpperCase(), p.x, p.y - 1.2 * scale);
    } else if (node.type === "tower") {
      ctx.strokeStyle = colors.towerLine;
      ctx.lineWidth = 0.45 * scale;
      ctx.lineCap = "square";
      const half = TOWER_SIZE_M * scale / 2;
      ctx.beginPath();
      ctx.moveTo(p.x - half, p.y - half);
      ctx.lineTo(p.x + half, p.y + half);
      ctx.moveTo(p.x + half, p.y - half);
      ctx.lineTo(p.x - half, p.y + half);
      ctx.stroke();
    } else if (node.type === "battery") {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.6 * scale;
      ctx.strokeRect(p.x - 5 * scale, p.y - 3 * scale, 8 * scale, 6 * scale);
      ctx.beginPath();
      ctx.moveTo(p.x + 3 * scale, p.y - 1.2 * scale);
      ctx.lineTo(p.x + 5 * scale, p.y - 1.2 * scale);
      ctx.lineTo(p.x + 5 * scale, p.y + 1.2 * scale);
      ctx.lineTo(p.x + 3 * scale, p.y + 1.2 * scale);
      ctx.moveTo(p.x - 3 * scale, p.y);
      ctx.lineTo(p.x + 1.3 * scale, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function activeLevels(node) {
    let distribution = ["source", "load", "battery"].includes(node.type);
    let transmission = false;
    state.lines.forEach((line) => {
      if (line.from !== node.id && line.to !== node.id) return;
      if (line.type === "distribution") distribution = true;
      if (line.type === "transmission") transmission = true;
    });
    return { distribution, transmission };
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function solveGrid() {
    state.warnings = [];
    state.errors = [];
    state.lastTripCount = 0;
    resetSolution();
    state.lines.forEach((line) => {
      updateLineGeometry(line);
      if (!line.tripped) line.online = line.online !== false;
    });

    let pass = 0;
    let trippedThisSolve = 0;
    while (pass < 10) {
      pass += 1;
      state.warnings = [];
      state.errors = [];
      resetNumericsOnly();
      const components = buildComponents();
      computePowerFlows(components);
      solveVoltages(components);
      const overloads = state.lines.filter((line) => {
        return line.online && !line.tripped && Math.abs(line.currentA) > lineCurrentLimitA(line) + 0.01;
      });
      if (!overloads.length) break;
      overloads.forEach((line) => {
        line.tripped = true;
        line.online = false;
        trippedThisSolve += 1;
      });
    }

    state.lastTripCount = trippedThisSolve;
    computeNodeLineTotals();
    state.solved = true;
    state.dirty = false;
    if (trippedThisSolve) {
      state.warnings.push(`${trippedThisSolve} line${trippedThisSolve === 1 ? "" : "s"} tripped above its current rating.`);
    }
    setCanvasStatus(trippedThisSolve ? "Solved with trips" : "Solved");
    renderAll();
  }

  function resetNumericsOnly() {
    state.nodes.forEach((node) => {
      node.effectivePowerKw = 0;
      node.batteryPowerKw = 0;
      node.lineNetKw = 0;
      node.curtailedKw = 0;
      node.unservedKw = 0;
      node.island = 0;
    });
    state.lines.forEach((line) => {
      line.currentA = 0;
      line.powerKw = 0;
      line.fromPowerKw = 0;
      line.toPowerKw = 0;
      line.lossKw = 0;
      line.island = 0;
      updateLineGeometry(line);
    });
  }

  function buildComponents() {
    const adjacency = new Map();
    state.nodes.forEach((node) => adjacency.set(node.id, []));
    state.lines.forEach((line) => {
      if (!line.online || line.tripped) return;
      if (!adjacency.has(line.from) || !adjacency.has(line.to)) return;
      adjacency.get(line.from).push(line.to);
      adjacency.get(line.to).push(line.from);
    });

    const visited = new Set();
    const components = [];
    state.nodes.forEach((start) => {
      if (visited.has(start.id)) return;
      const queue = [start.id];
      const nodeIds = [];
      visited.add(start.id);
      while (queue.length) {
        const id = queue.shift();
        nodeIds.push(id);
        adjacency.get(id).forEach((next) => {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        });
      }
      const index = components.length + 1;
      const lines = state.lines.filter((line) => {
        return line.online && !line.tripped && nodeIds.includes(line.from) && nodeIds.includes(line.to);
      });
      nodeIds.forEach((id) => {
        const node = getNode(id);
        if (node) node.island = index;
      });
      lines.forEach((line) => {
        line.island = index;
      });
      components.push({ index, nodeIds, lines });
    });
    return components;
  }

  function prepareComponentPower(components, componentLossKw) {
    components.forEach((component) => {
      const nodes = component.nodeIds.map(getNode).filter(Boolean);
      const sources = nodes.filter((node) => node.type === "source");
      const loads = nodes.filter((node) => node.type === "load");
      const batteries = nodes.filter((node) => node.type === "battery");
      const sourceKw = sources.reduce((sum, node) => sum + node.powerKw, 0);
      const loadKw = loads.reduce((sum, node) => sum + node.powerKw, 0);
      const targetLossKw = componentLossKw ? componentLossKw.get(component.index) || 0 : 0;

      sources.forEach((node) => {
        node.effectivePowerKw = node.powerKw;
        node.curtailedKw = 0;
      });
      loads.forEach((node) => {
        node.effectivePowerKw = -node.powerKw;
        node.unservedKw = 0;
      });

      const net = sourceKw - loadKw;
      if (batteries.length) {
        const share = (targetLossKw - net) / batteries.length;
        batteries.forEach((node) => {
          node.batteryPowerKw = share;
          node.effectivePowerKw = share;
        });
        return;
      }

      const requiredNet = targetLossKw;
      const mismatch = net - requiredNet;
      if (Math.abs(mismatch) < 0.05) return;

      if (mismatch > 0.05) {
        const curtailed = Math.min(mismatch, sourceKw);
        sources.forEach((node) => {
          const share = sourceKw > 0 ? curtailed * (node.powerKw / sourceKw) : 0;
          node.curtailedKw = share;
          node.effectivePowerKw = Math.max(0, node.powerKw - share);
        });
        state.warnings.push(`Island ${component.index} has ${formatKw(mismatch)} excess generation after losses and no battery.`);
      } else {
        const deficit = Math.min(-mismatch, loadKw);
        loads.forEach((node) => {
          const share = loadKw > 0 ? deficit * (node.powerKw / loadKw) : 0;
          node.unservedKw = share;
          node.effectivePowerKw = -Math.max(0, node.powerKw - share);
        });
        state.warnings.push(`Island ${component.index} has ${formatKw(-mismatch)} unserved load after losses and no battery.`);
      }
    });
  }

  function solveVoltages(components) {
    components.forEach((component) => {
      const nodes = component.nodeIds.map(getNode).filter(Boolean);
      nodes.forEach((node) => {
        if (!Number.isFinite(node.voltage)) node.voltage = BASE_VOLTAGE;
      });
      if (nodes.length === 0) return;

      const slack = chooseSlack(nodes);
      slack.voltage = BASE_VOLTAGE;
      if (nodes.length === 1) return;

      const unknowns = nodes.filter((node) => node.id !== slack.id);
      const idx = new Map(unknowns.map((node, index) => [node.id, index]));
      const n = unknowns.length;
      let converged = false;

      for (let iteration = 0; iteration < 80; iteration += 1) {
        const oldVoltages = unknowns.map((node) => node.voltage);
        const A = Array.from({ length: n }, () => Array(n).fill(0));
        const B = Array(n).fill(0);

        component.lines.forEach((line) => {
          const from = getNode(line.from);
          const to = getNode(line.to);
          if (!from || !to) return;
          const ratio = line.type === "transmission" ? TRANSMISSION_RATIO : 1;
          const g = (ratio * ratio) / line.resistance;
          stampConductance(A, B, idx, slack, from, to, g);
        });

        unknowns.forEach((node) => {
          const i = idx.get(node.id);
          const vSafe = Math.max(Math.abs(node.voltage), 100);
          B[i] += (node.effectivePowerKw * 1000) / vSafe;
        });

        let solved;
        try {
          solved = solveLinear(A, B);
        } catch (error) {
          state.errors.push(`Island ${component.index} could not be solved.`);
          return;
        }

        let maxDelta = 0;
        unknowns.forEach((node, index) => {
          const next = clamp(solved[index], 500, 18000);
          maxDelta = Math.max(maxDelta, Math.abs(next - oldVoltages[index]));
          node.voltage = next;
        });
        if (maxDelta < 0.01) {
          converged = true;
          break;
        }
      }

      if (!converged) {
        state.warnings.push(`Island ${component.index} reached the iteration limit.`);
      }
    });
  }

  function chooseSlack(nodes) {
    return nodes.find((node) => node.type === "source")
      || nodes.find((node) => node.type === "battery")
      || nodes.find((node) => node.type === "joint")
      || nodes[0];
  }

  function stampConductance(A, B, idx, slack, from, to, g) {
    const fromUnknown = idx.has(from.id);
    const toUnknown = idx.has(to.id);

    if (fromUnknown) {
      const i = idx.get(from.id);
      A[i][i] += g;
      if (toUnknown) A[i][idx.get(to.id)] -= g;
      else if (to.id === slack.id) B[i] += g * slack.voltage;
    }

    if (toUnknown) {
      const i = idx.get(to.id);
      A[i][i] += g;
      if (fromUnknown) A[i][idx.get(from.id)] -= g;
      else if (from.id === slack.id) B[i] += g * slack.voltage;
    }
  }

  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat(b[i]));
    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) {
        throw new Error("Singular matrix");
      }
      if (pivot !== col) {
        const tmp = M[pivot];
        M[pivot] = M[col];
        M[col] = tmp;
      }
      const pivotValue = M[col][col];
      for (let j = col; j <= n; j += 1) M[col][j] /= pivotValue;
      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = M[row][col];
        if (Math.abs(factor) < 1e-18) continue;
        for (let j = col; j <= n; j += 1) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }
    return M.map((row) => row[n]);
  }

  function computeLineFlows() {
    state.lines.forEach((line) => {
      updateLineGeometry(line);
      if (!line.online || line.tripped) {
        line.currentA = 0;
        line.powerKw = 0;
        line.fromPowerKw = 0;
        line.toPowerKw = 0;
        line.lossKw = 0;
        return;
      }
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (!from || !to) return;
      const ratio = line.type === "transmission" ? TRANSMISSION_RATIO : 1;
      line.currentA = ratio * (from.voltage - to.voltage) / line.resistance;
      const transferKw = line.currentA * lineVoltageKv(line);
      const lossKw = (line.currentA * line.currentA * line.resistance) / 1000;
      setLinePower(line, transferKw, lossKw);
    });
  }

  function computePowerFlows(components) {
    state.lines.forEach((line) => {
      if (!line.online || line.tripped) {
        line.currentA = 0;
        line.powerKw = 0;
        line.fromPowerKw = 0;
        line.toPowerKw = 0;
        line.lossKw = 0;
      }
    });

    let componentLossKw = new Map(components.map((component) => [component.index, 0]));
    let previousMaxDelta = Infinity;

    for (let iteration = 0; iteration < 16; iteration += 1) {
      prepareComponentPower(components, componentLossKw);
      const lossShareByNode = buildLossShareByNode(components);
      components.forEach((component) => solveComponentPowerFlow(component, lossShareByNode));

      const nextLossKw = new Map();
      let maxDelta = 0;
      components.forEach((component) => {
        const total = component.lines.reduce((sum, line) => sum + line.lossKw, 0);
        nextLossKw.set(component.index, total);
        maxDelta = Math.max(maxDelta, Math.abs(total - (componentLossKw.get(component.index) || 0)));
      });

      componentLossKw = nextLossKw;
      if (maxDelta < 0.02 || Math.abs(maxDelta - previousMaxDelta) < 0.001) break;
      previousMaxDelta = maxDelta;
    }

    prepareComponentPower(components, componentLossKw);
    const lossShareByNode = buildLossShareByNode(components);
    components.forEach((component) => solveComponentPowerFlow(component, lossShareByNode));
  }

  function solveComponentPowerFlow(component, lossShareByNode) {
      const nodes = component.nodeIds.map(getNode).filter(Boolean);
      if (!nodes.length || !component.lines.length) {
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }
      const slack = chooseSlack(nodes);
      const unknowns = nodes.filter((node) => node.id !== slack.id);
      if (!unknowns.length) {
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }

      const idx = new Map(unknowns.map((node, index) => [node.id, index]));
      const n = unknowns.length;
      const A = Array.from({ length: n }, () => Array(n).fill(0));
      const B = Array(n).fill(0);

      component.lines.forEach((line) => {
        const from = getNode(line.from);
        const to = getNode(line.to);
        if (!from || !to) return;
        stampPowerWeight(A, idx, from, to, linePowerWeight(line));
      });

      unknowns.forEach((node) => {
        B[idx.get(node.id)] += node.effectivePowerKw - (lossShareByNode.get(node.id) || 0);
      });

      let solved;
      try {
        solved = solveLinear(A, B);
      } catch (error) {
        state.errors.push(`Island ${component.index} power flow could not be solved.`);
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }

      const angle = new Map([[slack.id, 0]]);
      unknowns.forEach((node, index) => {
        angle.set(node.id, solved[index]);
      });

      component.lines.forEach((line) => {
        const fromAngle = angle.get(line.from) || 0;
        const toAngle = angle.get(line.to) || 0;
        const transferKw = linePowerWeight(line) * (fromAngle - toAngle);
        const lossKw = estimateLineLossKw(line, transferKw);
        setLinePower(line, transferKw, lossKw);
      });
  }

  function linePowerWeight(line) {
    const voltage = lineVoltageKv(line);
    return (voltage * voltage) / Math.max(line.resistance, 0.0001);
  }

  function buildLossShareByNode(components) {
    const shares = new Map(state.nodes.map((node) => [node.id, 0]));
    components.forEach((component) => {
      component.lines.forEach((line) => {
        if (!line.online || line.tripped) return;
        shares.set(line.from, (shares.get(line.from) || 0) + line.lossKw / 2);
        shares.set(line.to, (shares.get(line.to) || 0) + line.lossKw / 2);
      });
    });
    return shares;
  }

  function estimateLineLossKw(line, transferKw) {
    const voltageKv = lineVoltageKv(line);
    let lossKw = line.lossKw || 0;
    for (let i = 0; i < 5; i += 1) {
      const sendingEndKw = Math.abs(transferKw) + lossKw / 2;
      const currentA = sendingEndKw / voltageKv;
      lossKw = (currentA * currentA * line.resistance) / 1000;
    }
    return lossKw;
  }

  function setLinePower(line, transferKw, lossKw) {
    line.powerKw = Math.abs(transferKw) < 0.001 ? 0 : transferKw;
    line.lossKw = Math.max(0, lossKw);
    const direction = Math.sign(line.powerKw);
    const ratedPowerKw = Math.abs(line.powerKw) + line.lossKw / 2;
    line.currentA = direction === 0 ? 0 : direction * (ratedPowerKw / lineVoltageKv(line));
    line.fromPowerKw = line.powerKw + line.lossKw / 2;
    line.toPowerKw = -line.powerKw + line.lossKw / 2;
  }

  function stampPowerWeight(A, idx, from, to, weight) {
    const fromUnknown = idx.has(from.id);
    const toUnknown = idx.has(to.id);

    if (fromUnknown) {
      const i = idx.get(from.id);
      A[i][i] += weight;
      if (toUnknown) A[i][idx.get(to.id)] -= weight;
    }

    if (toUnknown) {
      const i = idx.get(to.id);
      A[i][i] += weight;
      if (fromUnknown) A[i][idx.get(from.id)] -= weight;
    }
  }

  function computeNodeLineTotals() {
    state.nodes.forEach((node) => {
      node.lineNetKw = 0;
    });
    state.lines.forEach((line) => {
      if (!line.online || line.tripped) return;
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (from) from.lineNetKw += line.fromPowerKw;
      if (to) to.lineNetKw += line.toPowerKw;
    });
  }

  function recloseLine(line) {
    line.tripped = false;
    line.online = true;
    setCanvasStatus(`${line.id} reclosed`);
    state.dirty = true;
    state.solved = false;
    renderAll();
  }

  function batteryText(node) {
    if (!state.solved) return "0 kW";
    if (Math.abs(node.batteryPowerKw) < 0.05) return "Idle 0 kW";
    return node.batteryPowerKw > 0
      ? `Discharge ${formatKw(node.batteryPowerKw)}`
      : `Charge ${formatKw(Math.abs(node.batteryPowerKw))}`;
  }

  function lineFlowText(line, nodeId) {
    if (!state.solved || !line.online || line.tripped) return "0 kW";
    const value = lineEndPowerKw(line, nodeId);
    if (Math.abs(value) < 0.05) return "0 kW";
    return `${value > 0 ? "Out" : "In"} ${formatKw(Math.abs(value), 1)}`;
  }

  function lineEndPowerKw(line, nodeId) {
    if (line.from === nodeId) return line.fromPowerKw || 0;
    if (line.to === nodeId) return line.toPowerKw || 0;
    return 0;
  }

  function lineDirectionText(line) {
    if (!state.solved || !line.online || Math.abs(line.currentA) < 0.1) return "No flow";
    const from = getNode(line.from);
    const to = getNode(line.to);
    return line.currentA >= 0 ? `${from.name} to ${to.name}` : `${to.name} to ${from.name}`;
  }

  function renderProperties() {
    const node = selectedNode();
    const line = selectedLine();
    if (node) {
      renderNodeProperties(node);
    } else if (line) {
      renderLineProperties(line);
    } else {
      renderNetworkProperties();
    }
  }

  function renderNodeProperties(node) {
    const levels = activeLevels(node);
    const incident = state.lines.filter((line) => line.from === node.id || line.to === node.id);
    const slider = node.type === "source" || node.type === "load";
    const sliderTitle = node.type === "source" ? "Output" : "Demand";
    const maxCap = node.type === "source" ? 100000 : 10000;
    const configuredMax = Number(node.maxPowerKw);
    const sliderMax = clamp(Number.isFinite(configuredMax) ? configuredMax : maxCap, 0, maxCap);
    const sliderStep = powerStepForMax(sliderMax);
    const flowRows = incident.map((line) => flowRowHtml(line, node.id)).join("");

    propertiesEl.innerHTML = `
      <div class="prop-group">
        <h3>${escapeHtml(node.name)}</h3>
        <div class="field">
          <label for="nodeName">Name</label>
          <input id="nodeName" type="text" value="${escapeAttr(node.name)}">
        </div>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Type</span><span class="readout-value">${labelType(node.type)}</span></div>
          <div class="readout-row"><span class="readout-label">Position</span><span class="readout-value">${Math.round(node.x)}, ${Math.round(node.y)} m</span></div>
        </div>
        ${node.type === "joint" ? `
          <div class="field" style="margin-top: 13px;">
            <label for="nodeDisplay">Display</label>
            <input id="nodeDisplay" type="text" maxlength="2" value="${escapeAttr((node.display || "").slice(0, 2).toUpperCase())}">
          </div>
        ` : ""}
      </div>
      ${slider ? `
        <div class="prop-group">
          <h3>${sliderTitle}</h3>
          <div class="field">
            <div class="field-row">
              <label for="maxPowerNumber">Maximum</label>
              <span class="field-value">${node.type === "source" ? "100,000 kW cap" : "10,000 kW cap"}</span>
            </div>
            <input id="maxPowerNumber" type="number" min="0" max="${maxCap}" step="${sliderStep}" value="${sliderMax}">
          </div>
          <div class="field">
            <div class="field-row">
              <label for="powerSlider">Actual ${sliderTitle.toLowerCase()}</label>
              <span class="field-value" id="powerReadout">${formatKw(node.powerKw)}</span>
            </div>
            <input id="powerSlider" type="range" min="0" max="${sliderMax}" step="${sliderStep}" value="${node.powerKw}">
            <input id="powerNumber" type="number" min="0" max="${sliderMax}" step="${sliderStep}" value="${node.powerKw}">
          </div>
        </div>
      ` : ""}
      <div class="prop-group">
        <h3>Solve Readout</h3>
        <div class="readout-list">
          ${levels.distribution ? `<div class="readout-row"><span class="readout-label">10 kV bus</span><span class="readout-value">${state.solved ? formatVoltage(node, "distribution") : "--"}</span></div>` : ""}
          ${levels.transmission ? `<div class="readout-row"><span class="readout-label">100 kV bus</span><span class="readout-value">${state.solved ? formatVoltage(node, "transmission") : "--"}</span></div>` : ""}
          ${node.type === "battery" ? `<div class="readout-row"><span class="readout-label">Battery power</span><span class="readout-value">${batteryText(node)}</span></div>` : ""}
          ${node.type === "source" ? `<div class="readout-row"><span class="readout-label">Generated</span><span class="readout-value">${state.solved ? formatKw(node.effectivePowerKw) : "--"}</span></div>` : ""}
          ${node.type === "load" ? `<div class="readout-row"><span class="readout-label">Served load</span><span class="readout-value">${state.solved ? formatKw(Math.max(0, -node.effectivePowerKw)) : "--"}</span></div>` : ""}
          <div class="readout-row"><span class="readout-label">Line net (+out)</span><span class="readout-value">${state.solved ? formatSignedKw(node.lineNetKw, 1) : "--"}</span></div>
          ${node.curtailedKw > 0.05 ? `<div class="readout-row"><span class="readout-label">Curtailed</span><span class="readout-value">${formatKw(node.curtailedKw)}</span></div>` : ""}
          ${node.unservedKw > 0.05 ? `<div class="readout-row"><span class="readout-label">Unserved</span><span class="readout-value">${formatKw(node.unservedKw)}</span></div>` : ""}
        </div>
      </div>
      <div class="prop-group">
        <h3>Connected Lines</h3>
        <div class="flow-table">${flowRows || `<p class="empty-note">No connected lines.</p>`}</div>
      </div>
      <div class="field-row">
        <button class="mini-button" type="button" id="copyNodeInline">Copy</button>
        <button class="mini-button" type="button" id="pasteNodeInline"${state.nodeClipboard ? "" : " disabled"}>Paste</button>
        <button class="mini-button danger" type="button" id="deleteSelectedInline">Delete</button>
      </div>
    `;

    document.getElementById("nodeName").addEventListener("input", (event) => {
      node.name = event.target.value || node.id;
      state.dirty = true;
      draw();
      updateSummaries();
    });

    const displayInput = document.getElementById("nodeDisplay");
    if (displayInput) {
      displayInput.addEventListener("input", (event) => {
        node.display = event.target.value.slice(0, 2).toUpperCase();
        event.target.value = node.display;
        state.dirty = true;
        draw();
      });
    }

    if (slider) {
      const range = document.getElementById("powerSlider");
      const number = document.getElementById("powerNumber");
      const maxNumber = document.getElementById("maxPowerNumber");
      const readout = document.getElementById("powerReadout");
      const setPowerControlScale = (max) => {
        const step = powerStepForMax(max);
        range.step = step;
        number.step = step;
        maxNumber.step = step;
      };
      const updatePower = (value) => {
        const activeMax = clamp(Number.isFinite(Number(node.maxPowerKw)) ? Number(node.maxPowerKw) : sliderMax, 0, maxCap);
        const next = clamp(Number(value) || 0, 0, activeMax);
        node.powerKw = next;
        range.value = next;
        number.value = next;
        readout.textContent = formatKw(next);
        state.dirty = true;
        state.solved = false;
        resetSolution();
        updateSummaries();
        draw();
      };
      range.addEventListener("input", (event) => updatePower(event.target.value));
      number.addEventListener("input", (event) => updatePower(event.target.value));
      maxNumber.addEventListener("input", (event) => {
        const nextMax = clamp(Number(event.target.value) || 0, 0, maxCap);
        node.maxPowerKw = nextMax;
        if (node.powerKw > nextMax) node.powerKw = nextMax;
        range.max = nextMax;
        number.max = nextMax;
        setPowerControlScale(nextMax);
        range.value = node.powerKw;
        number.value = node.powerKw;
        readout.textContent = formatKw(node.powerKw);
        state.dirty = true;
        state.solved = false;
        resetSolution();
        updateSummaries();
        draw();
      });
    }

    document.getElementById("copyNodeInline").addEventListener("click", copySelectedNode);
    document.getElementById("pasteNodeInline").addEventListener("click", pasteCopiedNode);
    document.getElementById("deleteSelectedInline").addEventListener("click", removeSelection);
  }

  function renderLineProperties(line) {
    updateLineGeometry(line);
    const from = getNode(line.from);
    const to = getNode(line.to);
    propertiesEl.innerHTML = `
      <div class="prop-group">
        <h3>${line.id}</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Nodes</span><span class="readout-value">${escapeHtml(from.name)} - ${escapeHtml(to.name)}</span></div>
          <div class="readout-row"><span class="readout-label">Length</span><span class="readout-value">${formatLength(line.lengthM)}</span></div>
          <div class="readout-row"><span class="readout-label">Resistance</span><span class="readout-value">${line.resistance.toFixed(3)} ohm</span></div>
        </div>
      </div>
      <div class="prop-group">
        <h3>Line Type</h3>
        <div class="segmented">
          <button type="button" data-line-type="distribution" class="${line.type === "distribution" ? "active" : ""}">10 kV</button>
          <button type="button" data-line-type="transmission" class="${line.type === "transmission" ? "active" : ""}">100 kV</button>
        </div>
      </div>
      <div class="prop-group">
        <h3>Construction</h3>
        <div class="field">
          <label for="lineVariant">Wire set</label>
          <select id="lineVariant">${lineVariantOptions(line.variant)}</select>
        </div>
      </div>
      <div class="prop-group">
        <h3>Status</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">State</span><span class="readout-value">${line.tripped ? "Tripped" : line.online ? "In service" : "Offline"}</span></div>
          <div class="readout-row"><span class="readout-label">Rating</span><span class="readout-value">${lineCurrentLimitA(line)} A</span></div>
          <div class="readout-row"><span class="readout-label">Current</span><span class="readout-value">${state.solved ? formatCurrent(line.currentA) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">Transfer</span><span class="readout-value">${state.solved ? formatSignedKw(line.powerKw, 1) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">${escapeHtml(from.name)} end</span><span class="readout-value">${state.solved ? lineFlowText(line, from.id) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">${escapeHtml(to.name)} end</span><span class="readout-value">${state.solved ? lineFlowText(line, to.id) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">Direction</span><span class="readout-value">${lineDirectionText(line)}</span></div>
          <div class="readout-row"><span class="readout-label">Loss</span><span class="readout-value">${state.solved ? formatKw(line.lossKw) : "--"}</span></div>
        </div>
        <div class="field-row" style="margin-top: 12px;">
          <button class="mini-button ${line.tripped ? "ok" : "danger"}" type="button" id="tripLine">${line.tripped ? "Reclose" : "Trip line"}</button>
          <button class="mini-button danger" type="button" id="deleteSelectedInline">Delete</button>
        </div>
      </div>
    `;

    document.querySelectorAll("[data-line-type]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextType = button.dataset.lineType;
        const message = validateLineTypeChange(line, nextType);
        if (message) {
          setCanvasStatus(message);
          return;
        }
        line.type = nextType;
        line.tripped = false;
        line.online = true;
        updateLineGeometry(line);
        setDirty(`${line.id} changed`);
      });
    });

    document.getElementById("lineVariant").addEventListener("change", (event) => {
      line.variant = event.target.value;
      setDirty(`${line.id} construction changed`);
    });

    document.getElementById("tripLine").addEventListener("click", () => {
      if (!line.tripped) {
        line.online = false;
        line.tripped = true;
        line.currentA = 0;
        line.powerKw = 0;
        line.fromPowerKw = 0;
        line.toPowerKw = 0;
        line.lossKw = 0;
        setCanvasStatus(`${line.id} tripped manually`);
        state.dirty = true;
        state.solved = false;
        renderAll();
      } else {
        recloseLine(line);
      }
    });
    document.getElementById("deleteSelectedInline").addEventListener("click", removeSelection);
  }

  function validateLineTypeChange(line, nextType) {
    const from = getNode(line.from);
    const to = getNode(line.to);
    if (!from || !to) return "Missing endpoint";
    if (nextType === "transmission" && (!isTransmissionEndpoint(from) || !isTransmissionEndpoint(to))) return "100 kV lines connect substations or towers";
    if (nextType === "distribution" && (!isDistributionEndpoint(from) || !isDistributionEndpoint(to))) return "10 kV lines cannot connect to towers";
    return "";
  }

  function renderNetworkProperties() {
    const totals = computeTotals();
    const warnings = state.warnings.concat(state.errors).map((text) => {
      const danger = text.includes("could not") || text.includes("tripped");
      return `<div class="warning-item ${danger ? "danger" : ""}">${escapeHtml(text)}</div>`;
    }).join("");
    propertiesEl.innerHTML = `
      <div class="prop-group">
        <h3>Placement</h3>
        <div class="field">
          <label for="placementJointType">Joint tool</label>
          <select id="placementJointType">${jointTypeOptions(state.placement.jointType)}</select>
        </div>
        <div class="field">
          <label for="placementDistributionVariant">10 kV line tool</label>
          <select id="placementDistributionVariant">${lineVariantOptions(state.placement.distributionVariant)}</select>
        </div>
        <div class="field">
          <label for="placementTransmissionVariant">100 kV line tool</label>
          <select id="placementTransmissionVariant">${lineVariantOptions(state.placement.transmissionVariant)}</select>
        </div>
      </div>
      <div class="prop-group">
        <h3>Totals</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Nodes</span><span class="readout-value">${state.nodes.length}</span></div>
          <div class="readout-row"><span class="readout-label">Lines</span><span class="readout-value">${state.lines.length}</span></div>
          <div class="readout-row"><span class="readout-label">Sources</span><span class="readout-value">${formatKw(totals.sourceKw)}</span></div>
          <div class="readout-row"><span class="readout-label">Loads</span><span class="readout-value">${formatKw(totals.loadKw)}</span></div>
          <div class="readout-row"><span class="readout-label">Battery net</span><span class="readout-value">${state.solved ? formatSignedKw(totals.batteryKw) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">Line losses</span><span class="readout-value">${state.solved ? formatKw(totals.lossKw) : "--"}</span></div>
        </div>
      </div>
      <div class="prop-group">
        <h3>Warnings</h3>
        <div class="warning-list">${warnings || `<p class="empty-note">No warnings.</p>`}</div>
      </div>
    `;

    document.getElementById("placementJointType").addEventListener("change", (event) => {
      state.placement.jointType = event.target.value;
      setCanvasStatus(`Joint tool: ${event.target.options[event.target.selectedIndex].text}`);
      draw();
    });
    document.getElementById("placementDistributionVariant").addEventListener("change", (event) => {
      state.placement.distributionVariant = event.target.value;
      setCanvasStatus(`10 kV line: ${lineVariant({ variant: event.target.value }).label}`);
    });
    document.getElementById("placementTransmissionVariant").addEventListener("change", (event) => {
      state.placement.transmissionVariant = event.target.value;
      setCanvasStatus(`100 kV line: ${lineVariant({ variant: event.target.value }).label}`);
    });
  }

  function flowRowHtml(line, nodeId) {
    const other = getNode(line.from === nodeId ? line.to : line.from);
    return `
      <div class="flow-row">
        <span class="line-pill ${line.type}">${line.type === "transmission" ? "100" : "10"}</span>
        <span class="flow-name">${escapeHtml(line.id)} to ${escapeHtml(other ? other.name : "missing")}</span>
        <span class="flow-value">${line.tripped ? "Tripped" : line.online ? lineFlowText(line, nodeId) : "Offline"}</span>
      </div>
    `;
  }

  function labelType(type) {
    const map = {
      source: "Source",
      joint: "Substation",
      pole: "Pole",
      tower: "Tower",
      load: "Load",
      battery: "Battery"
    };
    return map[type] || type;
  }

  function computeTotals() {
    return {
      sourceKw: state.nodes.filter((node) => node.type === "source").reduce((sum, node) => sum + node.powerKw, 0),
      loadKw: state.nodes.filter((node) => node.type === "load").reduce((sum, node) => sum + node.powerKw, 0),
      batteryKw: state.nodes.filter((node) => node.type === "battery").reduce((sum, node) => sum + node.batteryPowerKw, 0),
      lossKw: state.lines.reduce((sum, line) => sum + line.lossKw, 0)
    };
  }

  function updateSummaries() {
    const liveLines = state.lines.filter((line) => line.online && !line.tripped).length;
    const trippedLines = state.lines.filter((line) => line.tripped).length;
    networkSummary.textContent = `${state.nodes.length} nodes, ${state.lines.length} lines, ${liveLines} in service`;
    if (trippedLines) networkSummary.textContent += `, ${trippedLines} tripped`;

    const message = state.errors[0] || state.warnings[0] || "No warnings";
    warningSummary.textContent = message;
    warningSummary.classList.toggle("danger", Boolean(state.errors.length || state.lastTripCount));
    warningSummary.classList.toggle("warn", Boolean(state.warnings.length && !state.errors.length && !state.lastTripCount));

    solveBadge.textContent = state.solved ? state.errors.length ? "Error" : state.warnings.length ? "Warnings" : "Solved" : "Unsolved";
    solveBadge.className = state.solved ? state.errors.length ? "danger" : state.warnings.length ? "warn" : "ok" : "";
  }

  function renderAll() {
    updateSummaries();
    renderProperties();
    draw();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function normalizeNode(node) {
    if (!node.display) node.display = node.type === "joint" ? node.name.slice(0, 2).toUpperCase() : "";
    if (node.type === "source") {
      const maxKw = Number(node.maxPowerKw);
      node.maxPowerKw = clamp(Number.isFinite(maxKw) ? maxKw : Math.max(node.powerKw || 0, 10000), 0, 100000);
      node.powerKw = clamp(Number(node.powerKw) || 0, 0, node.maxPowerKw);
    } else if (node.type === "load") {
      const maxKw = Number(node.maxPowerKw);
      node.maxPowerKw = clamp(Number.isFinite(maxKw) ? maxKw : Math.max(node.powerKw || 0, 1000), 0, 10000);
      node.powerKw = clamp(Number(node.powerKw) || 0, 0, node.maxPowerKw);
    } else {
      node.maxPowerKw = Number(node.maxPowerKw) || 0;
      node.powerKw = Number(node.powerKw) || 0;
    }
    return node;
  }

  function normalizeLine(line) {
    if (!LINE_VARIANTS[line.variant]) line.variant = DEFAULT_LINE_VARIANT;
    line.online = line.online !== false && !line.tripped;
    line.tripped = Boolean(line.tripped);
    return line;
  }

  function serializeGrid() {
    return {
      version: 2,
      nodes: state.nodes.map((node) => ({ ...node })),
      lines: state.lines.map((line) => ({ ...line })),
      nextNodeId: state.nextNodeId,
      nextLineId: state.nextLineId,
      placement: { ...state.placement },
      camera: { ...state.camera }
    };
  }

  function saveGrid() {
    try {
      const payload = JSON.stringify(serializeGrid(), null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gridlab-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCanvasStatus("Grid exported");
    } catch (error) {
      state.errors = ["Could not export grid in this browser."];
      renderAll();
    }
  }

  function loadSavedGrid() {
    importFileInput.value = "";
    importFileInput.click();
  }

  function importGridText(raw) {
    try {
      const data = JSON.parse(raw);
      state.nodes = Array.isArray(data.nodes) ? data.nodes.map(normalizeNode) : [];
      state.lines = Array.isArray(data.lines) ? data.lines.map(normalizeLine) : [];
      state.nextNodeId = Number(data.nextNodeId) || inferNextId(state.nodes, "N");
      state.nextLineId = Number(data.nextLineId) || inferNextId(state.lines, "L");
      if (data.placement) {
        state.placement.jointType = ["joint", "pole", "tower"].includes(data.placement.jointType) ? data.placement.jointType : "joint";
        state.placement.distributionVariant = LINE_VARIANTS[data.placement.distributionVariant] ? data.placement.distributionVariant : DEFAULT_LINE_VARIANT;
        state.placement.transmissionVariant = LINE_VARIANTS[data.placement.transmissionVariant] ? data.placement.transmissionVariant : DEFAULT_LINE_VARIANT;
      }
      state.camera = normalizeCamera(data.camera);
      state.selected = null;
      state.connecting = null;
      state.nodeClipboard = null;
      state.dirty = true;
      state.solved = false;
      state.warnings = [];
      state.errors = [];
      resetSolution();
      setMode("select");
      setCanvasStatus("Grid imported");
      renderAll();
    } catch (error) {
      state.errors = ["Grid file could not be imported."];
      renderAll();
    }
  }

  function inferNextId(items, prefix) {
    const highest = items.reduce((max, item) => {
      const match = String(item.id || "").match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return highest + 1;
  }

  function normalizeCamera(camera) {
    const fallback = centerCameraForContent();
    if (!camera || !Number.isFinite(camera.scale) || !Number.isFinite(camera.x) || !Number.isFinite(camera.y)) {
      return fallback;
    }
    return {
      x: camera.x,
      y: camera.y,
      scale: clamp(camera.scale, MIN_ZOOM, MAX_ZOOM)
    };
  }

  function loadDemo() {
    state.nodes = [];
    state.lines = [];
    state.selected = null;
    state.connecting = null;
    state.nodeClipboard = null;
    state.nextNodeId = 1;
    state.nextLineId = 1;
    const n = (type, x, y, name, powerKw, maxPowerKw, display) => {
      const node = nodeDefaults(type, x, y);
      node.name = name;
      if (display) node.display = display;
      if (typeof powerKw === "number") node.powerKw = powerKw;
      if (typeof maxPowerKw === "number") node.maxPowerKw = maxPowerKw;
      normalizeNode(node);
      state.nodes.push(node);
      return node;
    };
    const solar = n("source", -340, -120, "North Plant", 8500, 20000);
    const wind = n("source", -330, 170, "Wind Farm", 4800, 12000);
    const yardA = n("joint", -90, -40, "Yard A", 0, 0, "YA");
    const towerA = n("tower", 40, -40, "Tower T1");
    const yardB = n("joint", 170, -40, "Yard B", 0, 0, "YB");
    const subC = n("joint", 260, 190, "Substation C", 0, 0, "SC");
    const cityPole = n("pole", 310, -65, "City Pole");
    const city = n("load", 420, -90, "City Load", 5600, 10000);
    const mill = n("load", 460, 170, "Mill Load", 6500, 10000);
    const battery = n("battery", 60, 210, "Battery Bank");

    const connect = (a, b, type, variant) => {
      const line = lineDefaults(a.id, b.id, type);
      line.variant = variant || DEFAULT_LINE_VARIANT;
      updateLineGeometry(line);
      state.lines.push(line);
    };
    connect(solar, yardA, "distribution", "thin-2");
    connect(wind, yardA, "distribution", "thin-2");
    connect(yardA, towerA, "transmission", "thin-1");
    connect(towerA, yardB, "transmission", "thin-1");
    connect(yardB, cityPole, "distribution", "thick-1");
    connect(cityPole, city, "distribution", "thick-1");
    connect(yardB, subC, "distribution", "thin-2");
    connect(subC, mill, "distribution", "thick-1");
    connect(battery, subC, "distribution", "thin-1");

    state.camera = centerCameraForContent();
    setMode("select");
    state.dirty = true;
    state.solved = false;
    resetSolution();
    selectItem(null, null);
    setCanvasStatus("Demo loaded");
    renderAll();
  }

  function clearNetwork() {
    state.nodes = [];
    state.lines = [];
    state.selected = null;
    state.connecting = null;
    state.nodeClipboard = null;
    state.nextNodeId = 1;
    state.nextLineId = 1;
    state.camera = { x: canvas.getBoundingClientRect().width / 2, y: canvas.getBoundingClientRect().height / 2, scale: 1 };
    state.dirty = true;
    state.solved = false;
    state.warnings = [];
    state.errors = [];
    setMode("select");
    setCanvasStatus("Cleared");
    renderAll();
  }

  function centerCameraForContent() {
    const rect = canvas.getBoundingClientRect();
    if (!state.nodes.length || !rect.width || !rect.height) {
      return { x: rect.width / 2, y: rect.height / 2, scale: 1 };
    }
    const xs = state.nodes.map((node) => node.x);
    const ys = state.nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(1, maxX - minX + 420);
    const height = Math.max(1, maxY - minY + 260);
    const scale = clamp(Math.min(rect.width / width, rect.height / height), 0.45, 1.2);
    return {
      scale,
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale
    };
  }

  function bindEvents() {
    document.querySelectorAll(".tool-button[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    solveButton.addEventListener("click", solveGrid);
    demoButton.addEventListener("click", loadDemo);
    saveButton.addEventListener("click", saveGrid);
    loadSavedButton.addEventListener("click", loadSavedGrid);
    importFileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      importGridText(await file.text());
    });
    clearButton.addEventListener("click", clearNetwork);
    deleteButton.addEventListener("click", removeSelection);
    zoomInButton.addEventListener("click", () => zoomBy(1.18));
    zoomOutButton.addEventListener("click", () => zoomBy(0.85));
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (command && !isTextEditingTarget(event.target)) {
        if (key === "c") {
          event.preventDefault();
          copySelectedNode();
          return;
        }
        if (key === "v") {
          event.preventDefault();
          pasteCopiedNode();
          return;
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (isTextEditingTarget(document.activeElement)) return;
        removeSelection();
      }
      if (event.key === "Escape") {
        state.connecting = null;
        setMode("select");
      }
    });
  }

  bindEvents();
  resizeCanvas();
  loadDemo();
}());
