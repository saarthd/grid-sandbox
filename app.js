(function () {
  "use strict";

  const canvas = document.getElementById("gridCanvas");
  let ctx = canvas.getContext("2d");
  const backgroundLayerCanvas = document.createElement("canvas");
  const backgroundLayerContext = backgroundLayerCanvas.getContext("2d");
  let backgroundLayerValid = false;
  const networkLayerCanvas = document.createElement("canvas");
  const networkLayerContext = networkLayerCanvas.getContext("2d");
  const rotorCtx = document.getElementById("rotorLayer").getContext("2d");
  const alarmCtx = document.getElementById("alarmLayer").getContext("2d");
  const transmissionCtx = document.getElementById("transmissionLayer").getContext("2d");
  const rotorAngles = new WeakMap();
  let visibleRotors = [];
  let visibleLimitedNodes = [];
  let rotorFrame = null;
  let rotorTime = 0;
  let networkLayerValid = false;
  const loadFillCache = new Map();
  const propertiesEl = document.getElementById("properties");
  const runButton = document.getElementById("runButton");
  const frequencyReadout = document.getElementById("frequencyReadout");
  const frequencyHistory = [];
  const traceColors = ["#126f67", "#ad482d", "#6555a6", "#1b73ae", "#9b7420", "#ac4275"];
  const traceStyles = new Map();
  const { flywheels, flywheelModel, frequencyEvent, visualRpm } = window.GridboxEngine;
  const timeReadout = document.getElementById("timeReadout");
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
  const SMALL_HIT_HALF_WIDTH_M = 1.5;
  const POLE_RADIUS_M = 1.6;
  const TOWER_SIZE_M = 8;
  const WATER_SURFACE_COLOR = "#65899d";
  const DEFAULT_LINE_VARIANT = "thin-2";
  const BASE_VOLTAGE = 10000;
  const TRANSMISSION_RATIO = 10;
  const SIMULATION_STEP_SECONDS = 1;
  const BASE_VARIABLE_UPDATE_SECONDS = 10;
  const DEFAULT_VARIABILITY_INDEX = 5;
  const DEFAULT_BATTERY_CAPACITY_GJ = 100;
  const DEFAULT_BATTERY_RATE_MW = 10;
  const MIN_POWER_KW = 1;
  const LOAD_POWER_CAP_KW = 10000;
  const DEFAULT_SUBSTATION_MAX_STEP_KW = 20000;
  const MIN_SUBSTATION_MAX_STEP_KW = 1000;
  const SUBSTATION_MAX_STEP_KW = 80000;
  const MAX_ZOOM = 4;
  const MIN_ZOOM = 0.22;

  const LINE_VARIANTS = {
    "thin-1": { label: "1x thin wire", currentLimitA: 500, wireCount: 1, thicknessM: 0.45 },
    "thin-2": { label: "2x thin wire", currentLimitA: 1000, wireCount: 2, thicknessM: 0.45 },
    "thick-1": { label: "1x thick wire", currentLimitA: 2000, wireCount: 1, thicknessM: 1.05 },
    "thick-2": { label: "2x thick wire", currentLimitA: 4000, wireCount: 2, thicknessM: 1.05 }
  };

  const BATTERY_SIZE_TIERS = [
    { maximumGJ: 50, width: 10, height: 20 },
    { maximumGJ: 150, width: 15, height: 25 },
    { maximumGJ: 350, width: 20, height: 30 },
    { maximumGJ: 650, width: 20, height: 40 },
    { maximumGJ: 1000, width: 30, height: 50 }
  ];

  const SOURCE_TYPES = {
    wind: {
      label: "Wind",
      profile: "variable",
      frequency: 6,
      capKw: 30000,
      fill: "#f7df79",
      shape: "triangle",
      defaultMinKw: 1000,
      defaultMaxKw: 5000,
      defaultPowerKw: 3000,
      sizes: [{ below: 3000, w: 10, h: 10 }, { below: 10000, w: 15, h: 15 }, { below: 20000, w: 20, h: 20 }, { below: Infinity, w: 30, h: 30 }]
    },
    solar: {
      label: "Solar",
      profile: "variable",
      frequency: 4,
      capKw: 40000,
      fill: "#f4c542",
      shape: "square",
      defaultMinKw: 500,
      defaultMaxKw: 5000,
      defaultPowerKw: 2500,
      sizes: [{ below: 1000, w: 20, h: 20 }, { below: 6000, w: 30, h: 30 }, { below: 12000, w: 40, h: 40 }, { below: 24000, w: 50, h: 50 }, { below: Infinity, w: 60, h: 60 }]
    },
    coal: {
      label: "Coal",
      profile: "constant",
      frequency: DEFAULT_VARIABILITY_INDEX,
      capKw: 50000,
      fill: "rgb(160, 100, 0)",
      shape: "circle",
      defaultMinKw: 5000,
      defaultMaxKw: 25000,
      defaultPowerKw: 15000,
      sizes: [{ below: 1000, w: 15, h: 15 }, { below: 5000, w: 20, h: 20 }, { below: 10000, w: 25, h: 25 }, { below: 20000, w: 30, h: 30 }, { below: 35000, w: 35, h: 35 }, { below: Infinity, w: 40, h: 40 }]
    },
    geothermal: {
      label: "Geothermal",
      profile: "variable",
      frequency: 2,
      capKw: 60000,
      fill: "rgb(220, 230, 0)",
      shape: "rounded-square",
      defaultMinKw: 5000,
      defaultMaxKw: 25000,
      defaultPowerKw: 15000,
      sizes: [{ below: 1000, w: 10, h: 10 }, { below: 10000, w: 15, h: 15 }, { below: 20000, w: 20, h: 20 }, { below: 35000, w: 25, h: 25 }, { below: Infinity, w: 30, h: 30 }]
    },
    gas: {
      label: "Natural Gas",
      profile: "constant",
      frequency: DEFAULT_VARIABILITY_INDEX,
      capKw: 70000,
      fill: "rgb(160, 140, 0)",
      shape: "circle",
      defaultMinKw: 5000,
      defaultMaxKw: 30000,
      defaultPowerKw: 17500,
      sizes: [{ below: 1000, w: 15, h: 15 }, { below: 5000, w: 20, h: 20 }, { below: 10000, w: 25, h: 25 }, { below: 20000, w: 30, h: 30 }, { below: 35000, w: 35, h: 35 }, { below: 50000, w: 40, h: 40 }, { below: Infinity, w: 50, h: 50 }]
    },
    nuclear: {
      label: "Nuclear",
      profile: "constant",
      frequency: DEFAULT_VARIABILITY_INDEX,
      capKw: 80000,
      fill: "#f0cf28",
      shape: "circle",
      defaultMinKw: 10000,
      defaultMaxKw: 40000,
      defaultPowerKw: 25000,
      sizes: [{ below: 1000, w: 15, h: 15 }, { below: 10000, w: 20, h: 20 }, { below: 30000, w: 30, h: 30 }, { below: 50000, w: 40, h: 40 }, { below: Infinity, w: 50, h: 50 }]
    },
    hydro: {
      label: "Hydroelectric",
      profile: "constant",
      frequency: DEFAULT_VARIABILITY_INDEX,
      capKw: 100000,
      fill: "rgb(190, 180, 140)",
      shape: "rectangle",
      defaultMinKw: 10000,
      defaultMaxKw: 50000,
      defaultPowerKw: 30000,
      sizes: [{ below: 1000, w: 20, h: 5 }, { below: 10000, w: 30, h: 10 }, { below: 25000, w: 40, h: 10 }, { below: 50000, w: 50, h: 15 }, { below: 75000, w: 60, h: 15 }, { below: Infinity, w: 80, h: 20 }]
    },
    generic: {
      label: "Legacy",
      profile: null,
      frequency: DEFAULT_VARIABILITY_INDEX,
      capKw: 100000,
      fill: "#e7a52d",
      shape: "circle",
      defaultMinKw: 1,
      defaultMaxKw: 10000,
      defaultPowerKw: 7500,
      sizes: [{ below: Infinity, w: 24, h: 24 }]
    }
  };

  const LOAD_TYPES = {
    general: {
      label: "General",
      capKw: LOAD_POWER_CAP_KW,
      fill: "#2f6fab",
      zone: "",
      defaultMinKw: 500,
      defaultMaxKw: LOAD_POWER_CAP_KW,
      defaultPowerKw: 3000,
      sizes: [{ below: 100, w: 5, h: 5 }, { below: 1000, w: 10, h: 10 }, { below: Infinity, w: 20, h: 20 }]
    },
    residential: {
      label: "Residential",
      capKw: LOAD_POWER_CAP_KW,
      fill: "#66a7d5",
      zone: "residential",
      defaultMinKw: 500,
      defaultMaxKw: LOAD_POWER_CAP_KW,
      defaultPowerKw: 3000,
      sizes: [{ below: 100, w: 5, h: 5 }, { below: 1000, w: 10, h: 10 }, { below: Infinity, w: 20, h: 20 }]
    },
    commercial: {
      label: "Commercial",
      capKw: 20000,
      fill: "#2f6fab",
      zone: "commercial",
      defaultMinKw: 500,
      defaultMaxKw: 10000,
      defaultPowerKw: 4000,
      sizes: [{ below: 1000, w: 10, h: 10 }, { below: 5000, w: 20, h: 20 }, { below: 10000, w: 20, h: 30 }, { below: 15000, w: 30, h: 30 }, { below: Infinity, w: 30, h: 40 }]
    },
    industrial: {
      label: "Industrial",
      capKw: 30000,
      fill: "rgb(80, 90, 140)",
      zone: "industrial",
      defaultMinKw: 500,
      defaultMaxKw: 15000,
      defaultPowerKw: 6000,
      sizes: [{ below: 1000, w: 10, h: 20 }, { below: 10000, w: 20, h: 30 }, { below: 20000, w: 20, h: 40 }, { below: Infinity, w: 30, h: 50 }]
    }
  };

  const VARIABLE_CHANGE_OPTIONS = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const VARIABLE_CHANGE_WEIGHTS = [3, 4, 5, 7, 9, 12, 15, 18, 21, 24, 27, 24, 21, 18, 15, 12, 9, 7, 5, 4, 3];
  const TWO_PI = Math.PI * 2;

  const NODE_TYPE_ALIASES = {
    source: "source",
    generator: "source",
    plant: "source",
    "power plant": "source",
    load: "load",
    demand: "load",
    consumer: "load",
    battery: "battery",
    storage: "battery",
    bess: "battery",
    flywheel: "flywheel",
    joint: "joint",
    substation: "joint",
    bus: "joint",
    junction: "joint",
    pole: "pole",
    "distribution pole": "pole",
    tower: "tower",
    "transmission tower": "tower"
  };

  const LINE_TYPE_ALIASES = {
    distribution: "distribution",
    "10 kv": "distribution",
    "10kv": "distribution",
    transmission: "transmission",
    "100 kv": "transmission",
    "100kv": "transmission"
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
    selection: [],
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
      dragNodeId: null,
      dragNodeIds: [],
      dragStartPositions: []
    },
    solved: false,
    dirty: true,
    running: false,
    runTimer: null,
    stepping: false,
    simulationNeedsSolve: true,
    elapsedSeconds: 0,
    variableLoadBias: 0,
    variableLoadBiasPhase: Math.random() * TWO_PI,
    variableLoadBiasDeviation: 0,
    variableLoadBiasTrend: (Math.random() - 0.5) * 0.012,
    warnings: [],
    errors: [],
    lastTripCount: 0,
    nodeClipboard: null,
    zoneOverlay: null,
    placement: {
      sourceType: "wind",
      sourceRotation: 0,
      loadType: "general",
      loadRotation: 0,
      jointType: "joint",
      flywheelMass: 8000,
      batteryRotation: 0,
      distributionVariant: DEFAULT_LINE_VARIANT,
      transmissionVariant: DEFAULT_LINE_VARIANT
    }
  };

  const performanceStats = {
    solveCount: 0,
    fastTickCount: 0,
    lastSolveMs: 0,
    lastFastTickMs: 0,
    maximumSolveMs: 0
  };
  window.GridboxPerformance = Object.freeze({
    snapshot() {
      return { ...performanceStats };
    }
  });

  const activeTouchPointers = new Map();
  let touchGesture = null;
  let cameraDrawFrame = null;

  let world = window.GridboxWorld.create(window.GridboxWorld.randomSeed());

  function resetWorld(seed, generatorVersion, expectedSignature = "") {
    loadFillCache.clear();
    backgroundLayerValid = false;
    if (Number.isFinite(Number(seed))) {
      const nextWorld = window.GridboxWorld.create(Math.floor(Number(seed)) >>> 0, generatorVersion);
      if (expectedSignature && expectedSignature !== nextWorld.generatorSignature) {
        throw new Error("This grid uses an incompatible world-generation revision. Update GRIDBOX before importing it.");
      }
      world = nextWorld;
      return;
    }
    let candidateSeed = window.GridboxWorld.randomSeed();
    let candidateWorld = window.GridboxWorld.create(candidateSeed, window.GridboxWorld.GENERATOR_VERSION);
    for (let attempt = 0; attempt < 18; attempt += 1) {
      let landSamples = 0;
      for (let sampleX = -500; sampleX <= 500; sampleX += 250) {
        for (let sampleY = -350; sampleY <= 350; sampleY += 175) {
          if (!candidateWorld.isWater(sampleX, sampleY)) landSamples += 1;
        }
      }
      if (landSamples >= 17) break;
      candidateSeed = window.GridboxWorld.randomSeed();
      candidateWorld = window.GridboxWorld.create(candidateSeed, window.GridboxWorld.GENERATOR_VERSION);
    }
    world = candidateWorld;
  }

  function nodeDefaults(type, x, y, requestedSourceType, requestedLoadType) {
    const id = state.nextNodeId++;
    const sourceType = type === "source" && SOURCE_TYPES[requestedSourceType || state.placement.sourceType]
      ? requestedSourceType || state.placement.sourceType
      : "generic";
    const sourceConfig = SOURCE_TYPES[sourceType];
    const loadType = type === "load" && LOAD_TYPES[requestedLoadType || state.placement.loadType]
      ? requestedLoadType || state.placement.loadType
      : "general";
    const loadConfig = LOAD_TYPES[loadType];
    const labels = {
      source: `${sourceConfig.label} Source`,
      joint: "Substation",
      pole: "Pole",
      tower: "Tower",
      flywheel: "Flywheel",
      load: `${loadConfig.label} Load`,
      battery: "Battery"
    };

    return {
      id: `N${id}`,
      type,
      ...(type === "flywheel" ? { flywheelMass: state.placement.flywheelMass, frequencyHz: 60, frequencyRelay: "normal", rotorSpinning: false } : {}),
      name: `${labels[type]} ${id}`,
      display: type === "joint" ? `S${id % 10}` : "",
      x,
      y,
      powerKw: type === "source" ? sourceConfig.defaultPowerKw : type === "load" ? loadConfig.defaultPowerKw : 0,
      minPowerKw: type === "source" ? sourceConfig.defaultMinKw : type === "load" ? loadConfig.defaultMinKw : 0,
      maxPowerKw: type === "source" ? sourceConfig.defaultMaxKw : type === "load" ? loadConfig.defaultMaxKw : 0,
      powerProfile: type === "source" && sourceConfig.profile ? sourceConfig.profile : "constant",
      variabilityIndex: type === "source" ? sourceConfig.frequency : DEFAULT_VARIABILITY_INDEX,
      sourceType: type === "source" ? sourceType : "",
      sourceRotation: type === "source" && sourceType === "hydro" ? state.placement.sourceRotation : 0,
      loadType: type === "load" ? loadType : "",
      loadRotation: type === "load" ? state.placement.loadRotation : 0,
      variationPhase: Math.random() * TWO_PI,
      variationDeviation: 0,
      variationDeviationTrend: (Math.random() - 0.5) * 0.02,
      voltage: BASE_VOLTAGE,
      effectivePowerKw: 0,
      batteryPowerKw: 0,
      batteryCapacityGJ: type === "battery" ? DEFAULT_BATTERY_CAPACITY_GJ : 0,
      batteryEnergyGJ: type === "battery" ? DEFAULT_BATTERY_CAPACITY_GJ / 2 : 0,
      batteryRateMw: type === "battery" ? DEFAULT_BATTERY_RATE_MW : 0,
      ...(type === "battery" ? { batterySetpointMw: 0, batteryRotation: state.placement.batteryRotation } : {}),
      maxStepPowerKw: type === "joint" ? DEFAULT_SUBSTATION_MAX_STEP_KW : 0,
      steppedPowerKw: 0,
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
    frequencyHistory.length = 0;
    renderFrequencyHistory();
    state.nodes.forEach((node) => {
      node.voltage = BASE_VOLTAGE;
      node.effectivePowerKw = 0;
      node.batteryPowerKw = 0;
      node.steppedPowerKw = 0;
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

  function resetVariableProfileDrift() {
    state.variableLoadBias = 0;
    state.variableLoadBiasPhase = Math.random() * TWO_PI;
    state.variableLoadBiasDeviation = 0;
    state.variableLoadBiasTrend = (Math.random() - 0.5) * 0.012;
    state.nodes.forEach((node) => {
      if (!["source", "load"].includes(node.type)) return;
      node.variationPhase = Math.random() * TWO_PI;
      node.variationDeviation = 0;
      node.variationDeviationTrend = (Math.random() - 0.5) * 0.02;
    });
  }

  function setDirty(message) {
    if (state.running) {
      stopSimulation("Stopped for edit", false);
    }
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    state.elapsedSeconds = 0;
    resetVariableProfileDrift();
    state.warnings = [];
    state.errors = [];
    state.lastTripCount = 0;
    loadFillCache.clear();
    invalidateSimulationGraph();
    resetSolution();
    setCanvasStatus(message || "Edited");
    updateTimeReadout();
    renderAll();
  }

  function setCanvasStatus(message) {
    canvasStatus.textContent = message;
  }

  function updateTimeReadout() {
    timeReadout.textContent = `t = ${state.elapsedSeconds.toLocaleString()} s`;
  }

  function updateRunButton() {
    runButton.classList.toggle("running", state.running);
    runButton.innerHTML = state.running
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7z"></path><path d="M13 5h4v14h-4z"></path></svg>Stop`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>Run`;
    updateToolAvailability();
  }

  function updateToolAvailability() {
    document.querySelectorAll(".tool-button[data-mode]").forEach((button) => {
      button.disabled = state.running && button.dataset.mode !== "select";
    });
    document.querySelectorAll(".picker-option").forEach((button) => {
      button.disabled = state.running;
    });
    if (state.running) closePlacementPickers();
    deleteButton.disabled = state.running;
  }

  function startSimulation() {
    if (state.running) {
      stopSimulation("Stopped");
      return;
    }
    enforcePowerBounds();
    state.running = true;
    state.simulationNeedsSolve = true;
    state.elapsedSeconds = Math.max(0, Math.floor(Number(state.elapsedSeconds) || 0));
    setMode("select");
    updateRunButton();
    updateTimeReadout();
    runSimulationStep({ advanceSeconds: 0, allowTrips: true });
    scheduleSimulationStep();
  }

  function scheduleSimulationStep() {
    if (!state.running) return;
    state.runTimer = window.setTimeout(() => {
      state.runTimer = null;
      if (!state.running) return;
      runSimulationStep({ advanceSeconds: SIMULATION_STEP_SECONDS, allowTrips: true });
      scheduleSimulationStep();
    }, SIMULATION_STEP_SECONDS * 1000);
  }

  function stopSimulation(message, shouldRender = true) {
    if (state.runTimer) {
      window.clearTimeout(state.runTimer);
      state.runTimer = null;
    }
    state.running = false;
    state.stepping = false;
    updateRunButton();
    if (message) setCanvasStatus(message);
    if (shouldRender) renderAll();
  }

  let indexedNodes = null;
  let indexedNodeCount = -1;
  let nodeById = new Map();
  let indexedLines = null;
  let indexedLineCount = -1;
  let lineById = new Map();
  let incidentLinesByNode = new Map();
  let simulationGraphRevision = 0;
  let cachedSimulationGraph = null;

  function currentNodeIndex() {
    if (indexedNodes !== state.nodes || indexedNodeCount !== state.nodes.length) {
      indexedNodes = state.nodes;
      indexedNodeCount = state.nodes.length;
      nodeById = new Map(state.nodes.map((node) => [node.id, node]));
      indexedLines = null;
    }
    return nodeById;
  }

  function currentLineIndex() {
    if (indexedLines !== state.lines || indexedLineCount !== state.lines.length) {
      indexedLines = state.lines;
      indexedLineCount = state.lines.length;
      lineById = new Map(state.lines.map((line) => [line.id, line]));
      incidentLinesByNode = new Map(state.nodes.map((node) => [node.id, []]));
      state.lines.forEach((line) => {
        if (incidentLinesByNode.has(line.from)) incidentLinesByNode.get(line.from).push(line);
        if (incidentLinesByNode.has(line.to)) incidentLinesByNode.get(line.to).push(line);
      });
    }
    return lineById;
  }

  function getNode(id) {
    return currentNodeIndex().get(id);
  }

  function getLine(id) {
    return currentLineIndex().get(id);
  }

  function incidentLines(nodeId) {
    currentNodeIndex();
    currentLineIndex();
    return incidentLinesByNode.get(nodeId) || [];
  }

  function invalidateSimulationGraph() {
    simulationGraphRevision += 1;
    cachedSimulationGraph = null;
    networkLayerValid = false;
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

  function firstFinite() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = Number(arguments[i]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  function finiteOr(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function nonEmptyText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function normalizeId(value, fallback) {
    if (value && typeof value === "object") {
      return normalizeId(value.id ?? value.node_id ?? value.nodeId ?? value.name, fallback);
    }
    return nonEmptyText(value, fallback);
  }

  function normalizeNodeType(value, node) {
    const key = normalizeKey(value).replace(/\s+node$/, "");
    if (NODE_TYPE_ALIASES[key]) return NODE_TYPE_ALIASES[key];
    if (node && (
      node.batteryCapacityGJ != null
      || node.capacityGJ != null
      || node.capacity_gj != null
      || node.batteryRateMw != null
      || node.batteryRateKw != null
    )) {
      return "battery";
    }
    return "joint";
  }

  function normalizeLineType(value) {
    const key = normalizeKey(value).replace(/\s+line$/, "");
    return LINE_TYPE_ALIASES[key] || "distribution";
  }

  function normalizeBoolean(value, fallback) {
    if (typeof value === "boolean") return value;
    const key = normalizeKey(value);
    if (["true", "yes", "1", "online", "in service", "enabled"].includes(key)) return true;
    if (["false", "no", "0", "offline", "out of service", "disabled", "tripped"].includes(key)) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric !== 0 : fallback;
  }

  function normalizeLineVariant(line) {
    const variant = String(line.variant ?? line.wireVariant ?? line.construction ?? "").trim();
    if (LINE_VARIANTS[variant]) return variant;
    const key = normalizeKey(variant);
    if (key.includes("thick") && key.includes("2")) return "thick-2";
    if (key.includes("thick")) return "thick-1";
    if (key.includes("thin") && key.includes("1")) return "thin-1";
    const amps = firstFinite(line.currentLimitA, line.current_limit_a, line.limitA, line.ratingA, line.ampacityA);
    if (amps != null) {
      if (amps <= 500) return "thin-1";
      if (amps <= 1000) return "thin-2";
      if (amps <= 2000) return "thick-1";
      return "thick-2";
    }
    return DEFAULT_LINE_VARIANT;
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

  function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function editableDecimal(value, digits) {
    return String(roundTo(value, digits));
  }

  function formatGJ(value, digits) {
    const precision = typeof digits === "number" ? digits : 1;
    return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: precision })} GJ`;
  }

  function formatMwFromKw(value) {
    const mw = Number(value || 0) / 1000;
    return `${mw.toLocaleString(undefined, { maximumFractionDigits: mw >= 10 ? 0 : 1 })} MW`;
  }

  function substationMaxStepKw(node) {
    return clamp(Number(node && node.maxStepPowerKw) || DEFAULT_SUBSTATION_MAX_STEP_KW, MIN_SUBSTATION_MAX_STEP_KW, SUBSTATION_MAX_STEP_KW);
  }

  function substationSizeM(node) {
    const maximumKw = substationMaxStepKw(node);
    if (maximumKw <= 10000) return 10;
    if (maximumKw <= 20000) return 20;
    if (maximumKw <= 50000) return 30;
    return 40;
  }

  function formatPercent(value) {
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}%`;
  }

  function powerStepForMax(maxKw) {
    const max = Number(maxKw) || 0;
    if (max <= 100) return 1;
    if (max <= 1000) return 10;
    return 100;
  }

  function normalizePowerProfile(value) {
    if (value === true) return "variable";
    const key = normalizeKey(value);
    return ["variable", "varying", "automatic", "auto"].includes(key) ? "variable" : "constant";
  }

  function requiresVariableProfile(node) {
    return node.type === "source" && ["wind", "solar", "geothermal"].includes(node.sourceType);
  }

  function normalizeSourceType(value, node) {
    const aliases = {
      wind: "wind",
      solar: "solar",
      coal: "coal",
      geothermal: "geothermal",
      gas: "gas",
      "natural gas": "gas",
      naturalgas: "gas",
      nuclear: "nuclear",
      hydro: "hydro",
      hydroelectric: "hydro",
      legacy: "generic",
      generic: "generic"
    };
    const explicit = aliases[normalizeKey(value)];
    if (explicit) return explicit;
    const name = normalizeKey(node && node.name);
    if (name.includes("wind")) return "wind";
    if (name.includes("solar")) return "solar";
    if (name.includes("coal")) return "coal";
    if (name.includes("geothermal")) return "geothermal";
    if (name.includes("natural gas") || name.includes("gas")) return "gas";
    if (name.includes("nuclear")) return "nuclear";
    if (name.includes("hydro")) return "hydro";
    return "generic";
  }

  function normalizeLoadType(value, node) {
    const aliases = {
      general: "general",
      generic: "general",
      legacy: "general",
      residential: "residential",
      home: "residential",
      commercial: "commercial",
      business: "commercial",
      industrial: "industrial",
      industry: "industrial"
    };
    const explicit = aliases[normalizeKey(value)];
    if (explicit) return explicit;
    return "general";
  }

  function sourceConfig(nodeOrType) {
    const type = typeof nodeOrType === "string" ? normalizeSourceType(nodeOrType) : normalizeSourceType(nodeOrType && nodeOrType.sourceType, nodeOrType);
    return SOURCE_TYPES[type] || SOURCE_TYPES.generic;
  }

  function sourceTypeLabel(node) {
    return `${sourceConfig(node).label} Source`;
  }

  function loadConfig(nodeOrType) {
    const type = typeof nodeOrType === "string" ? normalizeLoadType(nodeOrType) : normalizeLoadType(nodeOrType && nodeOrType.loadType, nodeOrType);
    return LOAD_TYPES[type] || LOAD_TYPES.general;
  }

  function loadTypeLabel(node) {
    return `${loadConfig(node).label} Load`;
  }

  function nodePowerCapKw(node) {
    if (node && node.type === "source") return sourceConfig(node).capKw;
    return node && node.type === "load" ? loadConfig(node).capKw : 0;
  }

  function powerRangeFloorKw(node) {
    return node && node.type === "source" ? 0 : MIN_POWER_KW;
  }

  function powerRangeValue(value, fallback) {
    if (value == null || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function variabilityIndex(node) {
    return clamp(Math.round(Number(node.variabilityIndex) || DEFAULT_VARIABILITY_INDEX), 1, 10);
  }

  function powerRangeMinimumKw(node) {
    if (!node || !["source", "load"].includes(node.type)) return 0;
    const floor = powerRangeFloorKw(node);
    return clamp(powerRangeValue(node.minPowerKw, floor), floor, Math.max(floor, powerRangeMaximumKw(node) - 1));
  }

  function powerRangeMaximumKw(node) {
    if (!node || !["source", "load"].includes(node.type)) return 0;
    const cap = nodePowerCapKw(node);
    const floor = powerRangeFloorKw(node);
    return clamp(powerRangeValue(node.maxPowerKw, Math.min(1000, cap)), floor + 1, cap);
  }

  function sourceYieldFactor(node) {
    if (!node || node.type !== "source" || !["wind", "solar", "geothermal"].includes(node.sourceType)) return 1;
    const size = sourceVisualDimensions(node);
    return world.yieldFactor(node.sourceType, node.x, node.y, size.width, size.height);
  }

  function operatingPowerMinimumKw(node) {
    return powerRangeMinimumKw(node) * sourceYieldFactor(node);
  }

  function operatingPowerMaximumKw(node) {
    return powerRangeMaximumKw(node) * sourceYieldFactor(node);
  }

  function setNodePowerRange(node, requestedMin, requestedMax, changedSide = "both") {
    if (!node || !["source", "load"].includes(node.type)) return;
    const cap = nodePowerCapKw(node);
    const floor = powerRangeFloorKw(node);
    let minimum;
    let maximum;
    if (changedSide === "min") {
      minimum = clamp(powerRangeValue(requestedMin, floor), floor, cap - 1);
      maximum = clamp(powerRangeValue(requestedMax, minimum + 1), minimum + 1, cap);
    } else {
      maximum = clamp(powerRangeValue(requestedMax, floor + 1), floor + 1, cap);
      minimum = clamp(powerRangeValue(requestedMin, floor), floor, maximum - 1);
    }
    node.minPowerKw = minimum;
    node.maxPowerKw = maximum;
    node.powerKw = clampNodePower(node, node.powerKw);
  }

  function clampNodePower(node, value) {
    return clamp(Number(value) || 0, operatingPowerMinimumKw(node), operatingPowerMaximumKw(node));
  }

  function enforcePowerBounds() {
    state.nodes.forEach((node) => {
      if (!["source", "load"].includes(node.type)) return;
      if (requiresVariableProfile(node)) node.powerProfile = "variable";
      setNodePowerRange(node, node.minPowerKw, node.maxPowerKw);
      node.powerKw = clampNodePower(node, node.powerKw);
    });
  }

  function ensureVariationState(node) {
    if (!Number.isFinite(node.variationPhase)) node.variationPhase = Math.random() * TWO_PI;
    if (!Number.isFinite(node.variationDeviation)) node.variationDeviation = 0;
    if (!Number.isFinite(node.variationDeviationTrend)) node.variationDeviationTrend = (Math.random() - 0.5) * 0.02;
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
    backgroundLayerCanvas.width = canvas.width;
    backgroundLayerCanvas.height = canvas.height;
    networkLayerCanvas.width = canvas.width;
    networkLayerCanvas.height = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    backgroundLayerContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    networkLayerContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const layer of [rotorCtx, alarmCtx, transmissionCtx]) {
      layer.canvas.width = canvas.width;
      layer.canvas.height = canvas.height;
      layer.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    backgroundLayerValid = false;
    networkLayerValid = false;
    draw();
  }

  function closePlacementPickers() {
    document.querySelectorAll("[data-picker-panel]").forEach((panel) => {
      panel.hidden = true;
    });
    document.querySelectorAll("[data-picker-trigger]").forEach((button) => {
      button.classList.remove("picker-open");
    });
  }

  function openPlacementPicker(name) {
    if (state.running) {
      setCanvasStatus("Stop the run to choose placement tools");
      return;
    }
    const panel = document.querySelector(`[data-picker-panel="${name}"]`);
    const trigger = document.querySelector(`[data-picker-trigger="${name}"]`);
    const wasOpen = panel && !panel.hidden;
    const previousOverlay = state.zoneOverlay;
    closePlacementPickers();
    state.zoneOverlay = !wasOpen && ["source", "load"].includes(name) ? name : null;
    if (previousOverlay !== state.zoneOverlay) backgroundLayerValid = false;
    if (!panel || wasOpen) {
      if (previousOverlay !== state.zoneOverlay) draw({ reuseNetwork: true });
      return;
    }
    panel.hidden = false;
    if (trigger) trigger.classList.add("picker-open");
    if (previousOverlay !== state.zoneOverlay || state.zoneOverlay) draw({ reuseNetwork: true });
  }

  function updatePlacementControlState() {
    document.querySelectorAll(".tool-button[data-mode]").forEach((button) => {
      let active = button.dataset.mode === state.mode;
      if (button.dataset.jointType) active = active && button.dataset.jointType === state.placement.jointType;
      button.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-picker-panel] [data-source-type]").forEach((button) => {
      button.classList.toggle("active", button.dataset.sourceType === state.placement.sourceType);
    });
    document.querySelectorAll("[data-picker-panel] [data-load-type]").forEach((button) => {
      button.classList.toggle("active", button.dataset.loadType === state.placement.loadType);
    });
    document.querySelectorAll("[data-flywheel-mass]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.flywheelMass) === state.placement.flywheelMass);
    });
    document.querySelectorAll("[data-picker-panel] [data-line-variant]").forEach((button) => {
      const selected = button.dataset.lineType === "transmission"
        ? state.placement.transmissionVariant
        : state.placement.distributionVariant;
      button.classList.toggle("active", button.dataset.lineVariant === selected);
    });
  }

  function setMode(mode) {
    const previousOverlay = state.zoneOverlay;
    const hadConnection = Boolean(state.connecting);
    if (state.running && mode !== "select") {
      state.mode = "select";
      state.connecting = null;
      state.zoneOverlay = null;
      closePlacementPickers();
      setCanvasStatus("Stop the run to edit the grid layout");
      updatePlacementControlState();
      if (previousOverlay !== state.zoneOverlay || hadConnection) draw({ reuseNetwork: true });
      return;
    }
    state.mode = mode;
    state.connecting = null;
    state.zoneOverlay = ["source", "load"].includes(mode) ? mode : null;
    closePlacementPickers();
    updatePlacementControlState();
    const messages = {
      select: "Select",
      source: `Add ${SOURCE_TYPES[state.placement.sourceType].label} Source`,
      joint: `Add ${jointTypeLabel(state.placement.jointType)}`,
      load: `Add ${LOAD_TYPES[state.placement.loadType].label} Load`,
      battery: "Add battery",
      flywheel: `Add ${state.placement.flywheelMass.toLocaleString()} kg flywheel`,
      "line-distribution": `Draw 10 kV ${lineVariant({ variant: state.placement.distributionVariant }).label}`,
      "line-transmission": `Draw 100 kV ${lineVariant({ variant: state.placement.transmissionVariant }).label}`
    };
    setCanvasStatus(messages[mode] || "Ready");
    if (previousOverlay !== state.zoneOverlay || state.zoneOverlay || hadConnection) {
      draw({ reuseNetwork: true });
    }
  }

  function selectionKey(item) {
    return `${item.type}:${item.id}`;
  }

  function selectionTargetExists(item) {
    if (!item) return false;
    return item.type === "node" ? Boolean(getNode(item.id)) : item.type === "line" ? Boolean(getLine(item.id)) : false;
  }

  function selectedItems() {
    const source = state.selection && state.selection.length ? state.selection : state.selected ? [state.selected] : [];
    const seen = new Set();
    const clean = [];
    source.forEach((item) => {
      if (!selectionTargetExists(item)) return;
      const key = selectionKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      clean.push({ type: item.type, id: item.id });
    });
    state.selection = clean;
    state.selected = clean.length ? { ...clean[clean.length - 1] } : null;
    return clean;
  }

  function setSelection(items, shouldRender = true) {
    const seen = new Set();
    state.selection = (items || []).filter((item) => {
      if (!selectionTargetExists(item)) return false;
      const key = selectionKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({ type: item.type, id: item.id }));
    state.selected = state.selection.length ? { ...state.selection[state.selection.length - 1] } : null;
    if (shouldRender) renderAll();
  }

  function selectItem(type, id, options = {}) {
    if (!type || !id) {
      setSelection([]);
      return;
    }
    const item = { type, id };
    const items = selectedItems();
    const key = selectionKey(item);
    const index = items.findIndex((entry) => selectionKey(entry) === key);
    if (options.toggle) {
      if (index >= 0) items.splice(index, 1);
      else items.push(item);
      setSelection(items);
      return;
    }
    if (options.add) {
      if (index < 0) items.push(item);
      setSelection(items);
      return;
    }
    setSelection([item]);
  }

  function clearSelection(shouldRender = true) {
    setSelection([], shouldRender);
  }

  function isSelected(type, id) {
    return selectedItems().some((item) => item.type === type && item.id === id);
  }

  function selectedNodes() {
    return selectedItems().filter((item) => item.type === "node").map((item) => getNode(item.id)).filter(Boolean);
  }

  function selectedLines() {
    return selectedItems().filter((item) => item.type === "line").map((item) => getLine(item.id)).filter(Boolean);
  }

  function selectedNode() {
    const items = selectedItems();
    return items.length === 1 && items[0].type === "node" ? getNode(items[0].id) : null;
  }

  function selectedLine() {
    const items = selectedItems();
    return items.length === 1 && items[0].type === "line" ? getLine(items[0].id) : null;
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
      return "10 kV lines connect poles, substations, sources, loads, batteries, or flywheels";
    }
    if (type === "distribution") {
      return "";
    }
    return "";
  }

  function nodePlacementDimensions(node) {
    if (node.type === "source") return sourceVisualDimensions(node);
    if (node.type === "load") return loadVisualDimensions(node);
    return { width: 0, height: 0 };
  }

  function validateNodePlacement(node) {
    const size = nodePlacementDimensions(node);
    if (node.type === "source" && node.sourceType === "hydro" && !world.touches("river", node.x, node.y, size.width, size.height)) {
      return "Hydroelectric sources must touch a river";
    }
    if (node.type === "load") {
      const config = loadConfig(node);
      if (config.zone && !world.touches(config.zone, node.x, node.y, size.width, size.height)) {
        return `${config.label} loads must touch a ${config.label.toLowerCase()} zone`;
      }
    }
    return "";
  }

  function addNode(type, point) {
    if (state.running) {
      setCanvasStatus("Stop the run to add nodes");
      return;
    }
    const actualType = type === "joint" ? state.placement.jointType : type;
    const node = nodeDefaults(actualType, snap(point.x), snap(point.y));
    node.powerKw = clampNodePower(node, node.powerKw);
    const placementError = validateNodePlacement(node);
    if (placementError) {
      setCanvasStatus(placementError);
      return;
    }
    state.nodes.push(node);
    selectItem("node", node.id);
    setDirty(`${node.name} added`);
  }

  function addLine(fromId, toId, type) {
    if (state.running) {
      setCanvasStatus("Stop the run to add lines");
      state.connecting = null;
      return false;
    }
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
    const nodes = selectedNodes();
    const lines = selectedLines();
    if (!nodes.length && !lines.length) return;
    if (state.running) {
      setCanvasStatus("Stop the run to delete grid elements");
      return;
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    const lineIds = new Set(lines.map((line) => line.id));
    state.nodes = state.nodes.filter((node) => !nodeIds.has(node.id));
    state.lines = state.lines.filter((line) => !lineIds.has(line.id) && !nodeIds.has(line.from) && !nodeIds.has(line.to));
    clearSelection(false);
    setDirty(nodes.length + lines.length > 1 ? "Selection deleted" : "Deleted");
  }

  function copySelectedNode() {
    const nodes = selectedNodes();
    if (nodes.length !== 1) {
      setCanvasStatus(nodes.length ? "Select one node to copy" : "Select a node to copy");
      return;
    }
    const node = nodes[0];
    state.nodeClipboard = {
      type: node.type,
      flywheelMass: node.flywheelMass,
      name: node.name,
      display: node.display || "",
      x: node.x,
      y: node.y,
      powerKw: node.powerKw || 0,
      minPowerKw: node.minPowerKw || 0,
      maxPowerKw: node.maxPowerKw || 0,
      powerProfile: node.powerProfile || "constant",
      variabilityIndex: variabilityIndex(node),
      sourceType: node.sourceType || "",
      sourceRotation: node.sourceRotation || 0,
      loadType: node.loadType || "",
      loadRotation: node.loadRotation || 0,
      batteryCapacityGJ: node.batteryCapacityGJ || 0,
      batteryEnergyGJ: node.batteryEnergyGJ || 0,
      batteryRateMw: node.batteryRateMw || 0,
      batteryRotation: node.batteryRotation,
      batterySetpointMw: node.batterySetpointMw,
      maxStepPowerKw: node.maxStepPowerKw || 0
    };
    setCanvasStatus(`${node.name} copied`);
    renderProperties();
  }

  function pasteCopiedNode() {
    if (state.running) {
      setCanvasStatus("Stop the run to paste nodes");
      return;
    }
    if (!state.nodeClipboard) {
      setCanvasStatus("No copied node");
      return;
    }
    const copied = state.nodeClipboard;
    const anchor = selectedNode() || copied;
    const node = nodeDefaults(copied.type, snap(anchor.x + 30), snap(anchor.y + 30), copied.sourceType, copied.loadType);
    if (node.type === "flywheel") node.flywheelMass = flywheelModel(copied.flywheelMass).mass;
    node.name = uniqueNodeName(`${copied.name} copy`);
    node.display = copied.type === "joint" ? String(copied.display || copied.name).slice(0, 2).toUpperCase() : "";
    node.powerKw = Number(copied.powerKw) || 0;
    node.minPowerKw = Number(copied.minPowerKw) || 0;
    node.maxPowerKw = Number(copied.maxPowerKw) || 0;
    node.powerProfile = normalizePowerProfile(copied.powerProfile);
    node.variabilityIndex = clamp(Math.round(Number(copied.variabilityIndex) || DEFAULT_VARIABILITY_INDEX), 1, 10);
    node.sourceType = copied.sourceType || "";
    node.sourceRotation = Number(copied.sourceRotation) === 90 ? 90 : 0;
    node.loadType = copied.loadType || "";
    node.loadRotation = Number(copied.loadRotation) === 90 ? 90 : 0;
    node.batteryCapacityGJ = Number(copied.batteryCapacityGJ) || 0;
    node.batteryEnergyGJ = Number(copied.batteryEnergyGJ) || 0;
    node.batteryRateMw = Number(copied.batteryRateMw) || 0;
    if (node.type === "battery") {
      node.batteryRotation = copied.batteryRotation || 0;
      node.batterySetpointMw = copied.batterySetpointMw || 0;
    }
    node.maxStepPowerKw = Number(copied.maxStepPowerKw) || 0;
    normalizeNode(node);
    const placementError = validateNodePlacement(node);
    if (placementError) {
      setCanvasStatus(`${placementError}; paste cancelled`);
      return;
    }
    state.nodes.push(node);
    setSelection([{ type: "node", id: node.id }], false);
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

  function rotatePlaceableNodes() {
    if (state.running) return;
    const rotatableNodes = selectedNodes().filter((node) => {
      if (node.type === "battery") return true;
      if (node.type === "source") return node.sourceType === "hydro";
      if (node.type !== "load") return false;
      const sizes = loadConfig(node).sizes;
      const size = sizes.find((item) => powerRangeMaximumKw(node) < item.below) || sizes[sizes.length - 1];
      return size.w !== size.h;
    });
    if (rotatableNodes.length) {
      rotatableNodes.forEach((node) => {
        if (node.type === "source") node.sourceRotation = Number(node.sourceRotation) === 90 ? 0 : 90;
        else if (node.type === "battery") node.batteryRotation = node.batteryRotation === 90 ? 0 : 90;
        else node.loadRotation = Number(node.loadRotation) === 90 ? 0 : 90;
      });
      setDirty(`${rotatableNodes.length === 1 ? rotatableNodes[0].name : "Selected nodes"} rotated`);
      return;
    }
    if (state.mode === "source" && state.placement.sourceType === "hydro") {
      state.placement.sourceRotation = state.placement.sourceRotation === 90 ? 0 : 90;
      setCanvasStatus(`Hydroelectric placement rotated ${state.placement.sourceRotation} degrees`);
      draw();
      return;
    }
    if (state.mode === "battery") {
      state.placement.batteryRotation = state.placement.batteryRotation === 90 ? 0 : 90;
      setCanvasStatus(`Battery placement rotated ${state.placement.batteryRotation} degrees`);
      return;
    }
    if (state.mode === "load") {
      state.placement.loadRotation = state.placement.loadRotation === 90 ? 0 : 90;
      setCanvasStatus(`${LOAD_TYPES[state.placement.loadType].label} load placement rotated ${state.placement.loadRotation} degrees`);
      draw();
    }
  }

  function hitTestNode(world) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
      const node = state.nodes[i];
      const dx = Math.abs(world.x - node.x), dy = Math.abs(world.y - node.y);
      if (dx > CLICK_RADIUS_M || dy > CLICK_RADIUS_M) continue;
      let small = node.type === "pole" || (node.type === "flywheel" && flywheelModel(node.flywheelMass).diameter <= 5);
      if (node.type === "load") {
        const size = loadVisualDimensions(node);
        small = size.width <= 5 && size.height <= 5;
      }
      if (small ? Math.max(dx, dy) <= SMALL_HIT_HALF_WIDTH_M : dx * dx + dy * dy <= CLICK_RADIUS_M ** 2) return node;
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

  function nodesForSelectionDrag() {
    const ids = new Set();
    selectedNodes().forEach((node) => ids.add(node.id));
    selectedLines().forEach((line) => {
      ids.add(line.from);
      ids.add(line.to);
    });
    return Array.from(ids).map(getNode).filter(Boolean);
  }

  function beginSelectionDrag(nodes, world) {
    if (!nodes.length || state.running) return;
    state.pointer.action = "drag-selection";
    state.pointer.dragNodeIds = nodes.map((node) => node.id);
    state.pointer.dragStartPositions = nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
    state.pointer.startWorld = world;
  }

  function markDragEdited() {
    const touchedLines = new Set();
    (state.pointer.dragStartPositions || []).forEach((start) => {
      incidentLines(start.id).forEach((line) => touchedLines.add(line));
    });
    touchedLines.forEach(updateLineGeometry);
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    invalidateSimulationGraph();
    resetNumericsOnly();
    updateSummaries();
    renderProperties();
    draw();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function scheduleCameraDraw() {
    if (cameraDrawFrame != null) return;
    cameraDrawFrame = window.requestAnimationFrame(() => {
      cameraDrawFrame = null;
      draw();
    });
  }

  function resetPointerInteraction() {
    state.pointer.down = false;
    state.pointer.action = null;
    state.pointer.dragNodeId = null;
    state.pointer.dragNodeIds = [];
    state.pointer.dragStartPositions = [];
  }

  function touchMidpoint(first, second) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function restoreTouchDrag(gesture) {
    if (!gesture || gesture.kind !== "drag") return;
    gesture.dragStartPositions.forEach((start) => {
      const node = getNode(start.id);
      if (!node) return;
      node.x = start.x;
      node.y = start.y;
    });
    gesture.touchedLines.forEach(updateLineGeometry);
    networkLayerValid = false;
  }

  function beginPinchGesture() {
    if (activeTouchPointers.size < 2) return;
    restoreTouchDrag(touchGesture);
    const pointers = Array.from(activeTouchPointers.entries()).slice(0, 2);
    const first = pointers[0][1];
    const second = pointers[1][1];
    const midpoint = touchMidpoint(first, second);
    touchGesture = {
      kind: "pinch",
      pointerIds: [pointers[0][0], pointers[1][0]],
      startDistance: Math.max(1, distance(first.x, first.y, second.x, second.y)),
      startScale: state.camera.scale,
      anchorWorld: screenToWorld(midpoint.x, midpoint.y)
    };
    state.pointer.down = false;
    state.pointer.action = "pinch";
    state.pointer.lastScreen = null;
  }

  function updatePinchGesture() {
    if (!touchGesture || touchGesture.kind !== "pinch") return;
    const first = activeTouchPointers.get(touchGesture.pointerIds[0]);
    const second = activeTouchPointers.get(touchGesture.pointerIds[1]);
    if (!first || !second) return;
    const midpoint = touchMidpoint(first, second);
    const currentDistance = Math.max(1, distance(first.x, first.y, second.x, second.y));
    const nextScale = clamp(
      touchGesture.startScale * currentDistance / touchGesture.startDistance,
      MIN_ZOOM,
      MAX_ZOOM
    );
    state.camera.scale = nextScale;
    state.camera.x = midpoint.x - touchGesture.anchorWorld.x * nextScale;
    state.camera.y = midpoint.y - touchGesture.anchorWorld.y * nextScale;
    backgroundLayerValid = false;
    networkLayerValid = false;
    scheduleCameraDraw();
  }

  function onTouchPointerDown(event) {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const screen = pointerPosition(event);
    activeTouchPointers.set(event.pointerId, screen);
    if (activeTouchPointers.size >= 2) {
      beginPinchGesture();
      return;
    }

    const worldPosition = screenToWorld(screen.x, screen.y);
    const node = hitTestNode(worldPosition);
    const line = hitTestLine(worldPosition);
    touchGesture = {
      kind: "pending",
      pointerId: event.pointerId,
      startScreen: screen,
      lastScreen: screen,
      startWorld: worldPosition,
      nodeId: node ? node.id : null,
      lineId: line ? line.id : null
    };
    state.pointer = {
      down: true,
      button: 0,
      id: event.pointerId,
      startScreen: screen,
      lastScreen: screen,
      startWorld: worldPosition,
      action: "touch-pending",
      dragNodeId: null,
      dragNodeIds: [],
      dragStartPositions: []
    };
  }

  function beginSingleTouchMove(gesture) {
    const node = gesture.nodeId ? getNode(gesture.nodeId) : null;
    const line = gesture.lineId ? getLine(gesture.lineId) : null;
    if (state.mode === "select" && !state.running && (node || line)) {
      if (node && !isSelected("node", node.id)) selectItem("node", node.id);
      if (line && !isSelected("line", line.id)) selectItem("line", line.id);
      const dragNodes = nodesForSelectionDrag();
      const touchedLines = new Set();
      dragNodes.forEach((dragNode) => {
        incidentLines(dragNode.id).forEach((connectedLine) => touchedLines.add(connectedLine));
      });
      gesture.kind = "drag";
      gesture.dragStartPositions = dragNodes.map((dragNode) => ({ id: dragNode.id, x: dragNode.x, y: dragNode.y }));
      gesture.touchedLines = touchedLines;
      state.pointer.action = "drag-selection";
      state.pointer.dragNodeIds = dragNodes.map((dragNode) => dragNode.id);
      state.pointer.dragStartPositions = gesture.dragStartPositions;
      return;
    }
    gesture.kind = "pan";
    state.pointer.action = "pan";
  }

  function moveSingleTouch(gesture, screen) {
    if (gesture.kind === "drag") {
      const worldPosition = screenToWorld(screen.x, screen.y);
      const dx = worldPosition.x - gesture.startWorld.x;
      const dy = worldPosition.y - gesture.startWorld.y;
      gesture.dragStartPositions.forEach((start) => {
        const node = getNode(start.id);
        if (!node) return;
        node.x = snap(start.x + dx);
        node.y = snap(start.y + dy);
      });
      gesture.touchedLines.forEach(updateLineGeometry);
      networkLayerValid = false;
      draw();
      return;
    }

    const dx = screen.x - gesture.lastScreen.x;
    const dy = screen.y - gesture.lastScreen.y;
    state.camera.x += dx;
    state.camera.y += dy;
    backgroundLayerValid = false;
    networkLayerValid = false;
    scheduleCameraDraw();
  }

  function onTouchPointerMove(event) {
    if (!activeTouchPointers.has(event.pointerId)) return;
    event.preventDefault();
    const screen = pointerPosition(event);
    activeTouchPointers.set(event.pointerId, screen);
    if (activeTouchPointers.size >= 2) {
      if (!touchGesture || touchGesture.kind !== "pinch") beginPinchGesture();
      updatePinchGesture();
      return;
    }
    if (!touchGesture || touchGesture.pointerId !== event.pointerId || touchGesture.kind === "consumed") return;

    if (touchGesture.kind === "pending") {
      const movement = distance(
        touchGesture.startScreen.x,
        touchGesture.startScreen.y,
        screen.x,
        screen.y
      );
      if (movement < 6) return;
      beginSingleTouchMove(touchGesture);
    }
    moveSingleTouch(touchGesture, screen);
    touchGesture.lastScreen = screen;
    state.pointer.lastScreen = screen;
  }

  function performTouchTap(gesture) {
    const node = gesture.nodeId ? getNode(gesture.nodeId) : null;
    const line = gesture.lineId ? getLine(gesture.lineId) : null;
    if (state.mode.startsWith("line-")) {
      if (node) handleLineClick(node);
      return;
    }
    if (state.mode !== "select") {
      addNode(state.mode, gesture.startWorld);
      return;
    }
    if (node) {
      selectItem("node", node.id);
      return;
    }
    if (line) {
      selectItem("line", line.id);
      return;
    }
    selectItem(null, null);
  }

  function finishTouchDrag(gesture, cancelled) {
    if (cancelled) {
      restoreTouchDrag(gesture);
      draw();
      return;
    }
    const movedNodes = gesture.dragStartPositions.map((start) => getNode(start.id)).filter(Boolean);
    const invalidNode = movedNodes.find((node) => validateNodePlacement(node));
    if (invalidNode) {
      const message = validateNodePlacement(invalidNode);
      restoreTouchDrag(gesture);
      setDirty(`${message}; move cancelled`);
      return;
    }
    let powerAdjusted = false;
    movedNodes.forEach((node) => {
      if (node.type !== "source") return;
      const next = clampNodePower(node, node.powerKw);
      if (next === node.powerKw) return;
      node.powerKw = next;
      powerAdjusted = true;
    });
    setDirty(powerAdjusted ? "Renewable output adjusted for its new zone yield" : "Selection moved");
  }

  function onTouchPointerEnd(event) {
    const cancelled = event.type === "pointercancel";
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activeTouchPointers.delete(event.pointerId);

    if (touchGesture && touchGesture.kind === "pinch") {
      if (activeTouchPointers.size >= 2) beginPinchGesture();
      else touchGesture = activeTouchPointers.size ? { kind: "consumed" } : null;
      resetPointerInteraction();
      return;
    }
    if (touchGesture && touchGesture.kind === "consumed") {
      if (!activeTouchPointers.size) touchGesture = null;
      resetPointerInteraction();
      return;
    }
    if (!touchGesture || touchGesture.pointerId !== event.pointerId) return;

    if (touchGesture.kind === "pending" && !cancelled) performTouchTap(touchGesture);
    else if (touchGesture.kind === "drag") finishTouchDrag(touchGesture, cancelled);
    touchGesture = null;
    resetPointerInteraction();
  }

  function onPointerDown(event) {
    if (event.pointerType === "touch") {
      onTouchPointerDown(event);
      return;
    }
    const panWithRightButton = event.button === 2;
    if (panWithRightButton) event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const screen = pointerPosition(event);
    const world = screenToWorld(screen.x, screen.y);
    const node = panWithRightButton ? null : hitTestNode(world);
    const line = panWithRightButton ? null : hitTestLine(world);

    state.pointer = {
      down: true,
      button: event.button,
      id: event.pointerId,
      startScreen: screen,
      lastScreen: screen,
      startWorld: world,
      action: null,
      dragNodeId: null,
      dragNodeIds: [],
      dragStartPositions: []
    };

    if (panWithRightButton) {
      state.pointer.action = "pan";
      return;
    }

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
      const wasSelected = isSelected("node", node.id);
      if (event.shiftKey) {
        selectItem("node", node.id, { toggle: true });
        return;
      }
      if (!wasSelected) selectItem("node", node.id);
      if (!state.running) {
        beginSelectionDrag(nodesForSelectionDrag(), world);
      }
      return;
    }

    if (line) {
      const wasSelected = isSelected("line", line.id);
      if (event.shiftKey) {
        selectItem("line", line.id, { toggle: true });
        return;
      }
      if (!wasSelected) {
        selectItem("line", line.id);
      } else if (!state.running) {
        beginSelectionDrag(nodesForSelectionDrag(), world);
      }
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
    if (event.pointerType === "touch") {
      onTouchPointerMove(event);
      return;
    }
    if (!state.pointer.down) return;
    const screen = pointerPosition(event);
    const dx = screen.x - state.pointer.lastScreen.x;
    const dy = screen.y - state.pointer.lastScreen.y;
    state.pointer.lastScreen = screen;

    if (state.pointer.action === "drag-selection" || state.pointer.action === "drag-node") {
      const world = screenToWorld(screen.x, screen.y);
      const dx = world.x - state.pointer.startWorld.x;
      const dy = world.y - state.pointer.startWorld.y;
      const starts = state.pointer.dragStartPositions && state.pointer.dragStartPositions.length
        ? state.pointer.dragStartPositions
        : state.pointer.dragNodeId
          ? [{ id: state.pointer.dragNodeId, x: getNode(state.pointer.dragNodeId)?.x || 0, y: getNode(state.pointer.dragNodeId)?.y || 0 }]
          : [];
      starts.forEach((start) => {
        const node = getNode(start.id);
        if (!node) return;
        node.x = snap(start.x + dx);
        node.y = snap(start.y + dy);
      });
      markDragEdited();
      return;
    }

    if (state.pointer.action === "pan") {
      state.camera.x += dx;
      state.camera.y += dy;
      backgroundLayerValid = false;
      networkLayerValid = false;
      scheduleCameraDraw();
    }
  }

  function onPointerUp(event) {
    if (event.pointerType === "touch") {
      onTouchPointerEnd(event);
      return;
    }
    const finishedDrag = state.pointer.action === "drag-selection" || state.pointer.action === "drag-node";
    const dragStarts = finishedDrag ? [...(state.pointer.dragStartPositions || [])] : [];
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.pointer.down = false;
    state.pointer.action = null;
    state.pointer.dragNodeId = null;
    state.pointer.dragNodeIds = [];
    state.pointer.dragStartPositions = [];
    if (!finishedDrag || !dragStarts.length) return;

    const movedNodes = dragStarts.map((start) => getNode(start.id)).filter(Boolean);
    const invalidNode = movedNodes.find((node) => validateNodePlacement(node));
    if (invalidNode) {
      const message = validateNodePlacement(invalidNode);
      dragStarts.forEach((start) => {
        const node = getNode(start.id);
        if (!node) return;
        node.x = start.x;
        node.y = start.y;
      });
      state.lines.forEach(updateLineGeometry);
      setDirty(`${message}; move cancelled`);
      return;
    }

    let powerAdjusted = false;
    movedNodes.forEach((node) => {
      if (!node || node.type !== "source") return;
      const next = clampNodePower(node, node.powerKw);
      if (next === node.powerKw) return;
      node.powerKw = next;
      powerAdjusted = true;
    });
    if (powerAdjusted) setDirty("Renewable output adjusted for its new zone yield");
  }

  function onWheel(event) {
    event.preventDefault();
    const screen = pointerPosition(event);
    const before = screenToWorld(screen.x, screen.y);
    const delta = event.deltaY < 0 ? 1.12 : 0.89;
    state.camera.scale = clamp(state.camera.scale * delta, MIN_ZOOM, MAX_ZOOM);
    state.camera.x = screen.x - before.x * state.camera.scale;
    state.camera.y = screen.y - before.y * state.camera.scale;
    backgroundLayerValid = false;
    networkLayerValid = false;
    renderAll();
  }

  function zoomBy(factor) {
    const rect = canvas.getBoundingClientRect();
    const screen = { x: rect.width / 2, y: rect.height / 2 };
    const before = screenToWorld(screen.x, screen.y);
    state.camera.scale = clamp(state.camera.scale * factor, MIN_ZOOM, MAX_ZOOM);
    state.camera.x = screen.x - before.x * state.camera.scale;
    state.camera.y = screen.y - before.y * state.camera.scale;
    backgroundLayerValid = false;
    networkLayerValid = false;
    renderAll();
  }

  function paintBackgroundLayer(rect) {
    const mainContext = ctx;
    ctx = backgroundLayerContext;
    try {
      ctx.save();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, rect.width, rect.height);
      world.draw(ctx, state.camera, rect, state.zoneOverlay);
      drawGrid(rect);
      ctx.restore();
      backgroundLayerValid = true;
    } finally {
      ctx = mainContext;
    }
  }

  function paintNetworkLayer(rect) {
    const renderState = {
      rect,
      selectedKeys: new Set(selectedItems().map(selectionKey)),
      pollutionIndex: buildPollutionIndex(),
      loadFillById: new Map()
    };
    const mainContext = ctx;
    ctx = networkLayerContext;
    try {
      ctx.save();
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawLines("distribution", false, renderState);
      visibleRotors = [];
      visibleLimitedNodes = [];
      drawNodes(renderState);
      ctx.restore();
      ctx = transmissionCtx;
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawLines("transmission", true, renderState);
      rotorCtx.clearRect(0, 0, rect.width, rect.height);
      paintRotors(performance.now());
      paintAlarmLayer(rect);
      networkLayerValid = true;
    } finally {
      ctx = mainContext;
    }
  }

  function paintRotors(now) {
    const dt = state.running && rotorTime ? Math.max(0, (now - rotorTime) / 1000) : 0;
    rotorTime = Math.max(rotorTime, now);
    for (const { p, radius } of visibleRotors) {
      rotorCtx.clearRect(p.x - radius - 2, p.y - radius - 2, 2 * radius + 4, 2 * radius + 4);
    }
    for (const { node, p, radius } of visibleRotors) {
      const angle = ((rotorAngles.get(node) || 0) + (state.running && node.rotorSpinning ? dt * TWO_PI * visualRpm(node.frequencyHz) / 60 : 0)) % TWO_PI;
      rotorAngles.set(node, angle);
      const arm = radius * 0.82;
      const dx = arm * Math.cos(angle), dy = arm * Math.sin(angle);
      rotorCtx.strokeStyle = "#151a1e";
      rotorCtx.lineWidth = radius * 0.15;
      rotorCtx.beginPath();
      rotorCtx.moveTo(p.x - dx, p.y - dy);
      rotorCtx.lineTo(p.x + dx, p.y + dy);
      rotorCtx.moveTo(p.x + dy, p.y - dx);
      rotorCtx.lineTo(p.x - dy, p.y + dx);
      rotorCtx.stroke();
    }
    if (state.running && visibleRotors.some(r => r.node.rotorSpinning) && rotorFrame === null) {
      rotorFrame = requestAnimationFrame(time => {
        rotorFrame = null;
        paintRotors(time);
      });
    }
  }

  function rotorAlarm(node) {
    return state.running && node.rotorSpinning && (node.frequencyHz < 59.5 || node.frequencyHz > 60.5);
  }

  function paintAlarmLayer(rect) {
    const previous = ctx;
    ctx = alarmCtx;
    try {
      ctx.clearRect(0, 0, rect.width, rect.height);
      const scale = state.camera.scale;
      ctx.strokeStyle = "#f77a0b";
      ctx.lineWidth = 1.4 * scale;
      for (const { node, p } of visibleLimitedNodes) {
        if (node.type === "source") drawSourcePath(node, p, scale);
        else {
          const size = loadVisualDimensions(node);
          ctx.beginPath();
          ctx.rect(p.x - size.width * scale / 2, p.y - size.height * scale / 2, size.width * scale, size.height * scale);
        }
        ctx.stroke();
      }
      let active = visibleLimitedNodes.length > 0;
      for (const rotor of visibleRotors) {
        rotor.alarm = rotorAlarm(rotor.node);
        if (!rotor.alarm) continue;
        active = true;
        ctx.strokeStyle = "#df3029";
        ctx.lineWidth = rotor.radius * 0.22;
        ctx.beginPath();
        ctx.arc(rotor.p.x, rotor.p.y, rotor.radius, 0, TWO_PI);
        ctx.stroke();
      }
      ctx.canvas.hidden = !active;
    } finally {
      ctx = previous;
    }
  }

  function draw(options = {}) {
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!backgroundLayerValid) paintBackgroundLayer(rect);
    ctx.drawImage(
      backgroundLayerCanvas,
      0,
      0,
      backgroundLayerCanvas.width,
      backgroundLayerCanvas.height,
      0,
      0,
      rect.width,
      rect.height
    );
    if (!options.reuseNetwork || !networkLayerValid) paintNetworkLayer(rect);
    else if (visibleRotors.some(rotor => rotor.alarm !== rotorAlarm(rotor.node))) paintAlarmLayer(rect);
    ctx.drawImage(
      networkLayerCanvas,
      0,
      0,
      networkLayerCanvas.width,
      networkLayerCanvas.height,
      0,
      0,
      rect.width,
      rect.height
    );
    drawConnectionPreview();
    ctx.restore();
    zoomReadout.textContent = `${Math.round(state.camera.scale * 100)}%`;
  }

  function pointNearViewport(point, rect, margin = 80) {
    return point.x >= -margin
      && point.x <= rect.width + margin
      && point.y >= -margin
      && point.y <= rect.height + margin;
  }

  function segmentNearViewport(a, b, rect, margin = 80) {
    return Math.max(a.x, b.x) >= -margin
      && Math.min(a.x, b.x) <= rect.width + margin
      && Math.max(a.y, b.y) >= -margin
      && Math.min(a.y, b.y) <= rect.height + margin;
  }

  function buildPollutionIndex() {
    const cellSize = 300;
    const cells = new Map();
    state.nodes.forEach((node) => {
      if (node.type !== "source" || !["coal", "gas"].includes(node.sourceType)) return;
      const key = `${Math.floor(node.x / cellSize)}:${Math.floor(node.y / cellSize)}`;
      const sources = cells.get(key);
      if (sources) sources.push(node);
      else cells.set(key, [node]);
    });
    return {
      near(x, y) {
        const cx = Math.floor(x / cellSize);
        const cy = Math.floor(y / cellSize);
        const result = [];
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            result.push(...(cells.get(`${cx + offsetX}:${cy + offsetY}`) || []));
          }
        }
        return result;
      }
    };
  }

  function colorChannels(color) {
    const hex = String(color).match(/^#([0-9a-f]{6})$/i);
    if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)];
    const rgb = String(color).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [47, 111, 171];
  }

  function mixColor(color, tint, amount) {
    const base = colorChannels(color);
    return `rgb(${base.map((channel, index) => Math.round(channel + (tint[index] - channel) * amount)).join(", ")})`;
  }

  function loadFillColor(node, pollutionIndex) {
    const nearbyPollution = pollutionIndex.near(node.x, node.y);
    const size = loadVisualDimensions(node);
    const cacheKey = [
      world.seed,
      world.generatorVersion,
      node.id,
      node.loadType,
      node.x,
      node.y,
      size.width,
      size.height,
      ...nearbyPollution.map((source) => `${source.id}:${source.sourceType}:${source.x}:${source.y}`)
    ].join("|");
    if (loadFillCache.has(cacheKey)) return loadFillCache.get(cacheKey);

    let fill = loadConfig(node).fill;
    const zones = world.zoneMembership(node.x, node.y, size.width, size.height);
    if (zones.industrial && !zones.residential && !zones.commercial) {
      loadFillCache.set(cacheKey, fill);
      return fill;
    }
    nearbyPollution.forEach((source) => {
      const half = source.sourceType === "coal" ? 150 : 100;
      if (Math.abs(node.x - source.x) > half || Math.abs(node.y - source.y) > half) return;
      fill = source.sourceType === "coal"
        ? mixColor(fill, [124, 82, 43], 0.28)
        : mixColor(fill, [82, 111, 70], 0.25);
    });
    loadFillCache.set(cacheKey, fill);
    return fill;
  }

  function renderedLoadFill(node, renderState) {
    if (!renderState) return loadFillColor(node, buildPollutionIndex());
    if (!renderState.loadFillById.has(node.id)) {
      renderState.loadFillById.set(node.id, loadFillColor(node, renderState.pollutionIndex));
    }
    return renderState.loadFillById.get(node.id);
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

  function drawLines(type, redrawEndpoints, renderState) {
    state.lines.forEach((line) => {
      if (line.type !== type) return;
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (!from || !to) return;
      const a = worldToScreen(from.x, from.y);
      const b = worldToScreen(to.x, to.y);
      if (!segmentNearViewport(a, b, renderState.rect)) return;
      const selected = renderState.selectedKeys.has(`line:${line.id}`);
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

      if (redrawEndpoints) {
        [from, to].forEach((node) => {
          const p = worldToScreen(node.x, node.y);
          if (!pointNearViewport(p, renderState.rect)) return;
          const selected = renderState.selectedKeys.has(`node:${node.id}`);
          const connecting = state.connecting && state.connecting.from === node.id;
          drawNodeShape(node, p, selected || connecting, renderState);
        });
      }
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
      const endpointOverlapM = Math.min(0.75, len * 0.05);
      const startM = Math.max(0, nodeBoundaryDistanceM(from, ux, uy, offsetM) - endpointOverlapM);
      const endM = Math.max(0, nodeBoundaryDistanceM(to, -ux, -uy, -offsetM) - endpointOverlapM);
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

  function sourceVisualDimensions(node) {
    const config = sourceConfig(node);
    const maxKw = powerRangeMaximumKw(node);
    const tier = config.sizes.find((item) => maxKw < item.below) || config.sizes[config.sizes.length - 1];
    if (config.shape === "triangle") return { width: tier.w, height: Math.min(tier.h, tier.w * Math.sqrt(3) / 2) };
    const rotated = config.shape === "rectangle" && Number(node.sourceRotation) === 90;
    return rotated ? { width: tier.h, height: tier.w } : { width: tier.w, height: tier.h };
  }

  function loadVisualDimensions(node) {
    const config = loadConfig(node);
    const maxKw = powerRangeMaximumKw(node);
    const tier = config.sizes.find((item) => maxKw < item.below) || config.sizes[config.sizes.length - 1];
    const rotated = tier.w !== tier.h && Number(node.loadRotation) === 90;
    return rotated ? { width: tier.h, height: tier.w } : { width: tier.w, height: tier.h };
  }

  function batteryVisualDimensions(node) {
    const capacityGJ = batteryCapacityGJ(node);
    const tier = BATTERY_SIZE_TIERS.find((item) => capacityGJ <= item.maximumGJ)
      || BATTERY_SIZE_TIERS[BATTERY_SIZE_TIERS.length - 1];
    return node.batteryRotation === 90 ? { width: tier.height, height: tier.width } : { width: tier.width, height: tier.height };
  }

  function nodeBoundaryDistanceM(node, ux, uy, offsetM) {
    if (node.type === "flywheel") {
      const radius = flywheelModel(node.flywheelMass).diameter / 2;
      return Math.sqrt(Math.max(0, radius * radius - offsetM * offsetM));
    }
    if (node.type === "pole") {
      const radius = POLE_RADIUS_M;
      return Math.sqrt(Math.max(0, radius * radius - offsetM * offsetM));
    }
    if (node.type === "joint") {
      const radius = substationSizeM(node) / 2;
      return distanceToHexagonBoundary(radius, ux, uy, offsetM);
    }
    if (node.type === "source") {
      const config = sourceConfig(node);
      const size = sourceVisualDimensions(node);
      if (config.shape === "circle") {
        const radius = size.width / 2;
        return Math.sqrt(Math.max(0, radius * radius - offsetM * offsetM));
      }
      if (config.shape === "triangle") {
        return distanceToTriangleBoundary(size.width, size.height, ux, uy, offsetM);
      }
      return distanceToBoxBoundary(size.width / 2, size.height / 2, ux, uy, offsetM);
    }
    if (node.type === "tower") {
      return distanceToBoxBoundary(TOWER_SIZE_M / 2, TOWER_SIZE_M / 2, ux, uy, offsetM);
    }
    if (node.type === "load") {
      const size = loadVisualDimensions(node);
      return distanceToBoxBoundary(size.width / 2, size.height / 2, ux, uy, offsetM);
    }
    if (node.type === "battery") {
      const size = batteryVisualDimensions(node);
      return distanceToBoxBoundary(size.width / 2, size.height / 2, ux, uy, offsetM);
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

  function distanceToHexagonBoundary(radius, ux, uy, offsetM) {
    const vertices = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 6 + (TWO_PI * index) / 6;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    return distanceToPolygonBoundary(vertices, ux, uy, offsetM, radius);
  }

  function distanceToTriangleBoundary(width, height, ux, uy, offsetM) {
    const vertices = [
      { x: 0, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 }
    ];
    return distanceToPolygonBoundary(vertices, ux, uy, offsetM, Math.max(width, height) / 2);
  }

  function distanceToPolygonBoundary(vertices, ux, uy, offsetM, fallback) {
    const nx = -uy;
    const ny = ux;
    const originX = nx * offsetM;
    const originY = ny * offsetM;
    const candidates = [];
    vertices.forEach((start, index) => {
      const end = vertices[(index + 1) % vertices.length];
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const denominator = ux * edgeY - uy * edgeX;
      if (Math.abs(denominator) < 1e-9) return;
      const relativeX = start.x - originX;
      const relativeY = start.y - originY;
      const distance = (relativeX * edgeY - relativeY * edgeX) / denominator;
      const edgePosition = (relativeX * uy - relativeY * ux) / denominator;
      if (distance >= 0 && edgePosition >= -1e-6 && edgePosition <= 1 + 1e-6) candidates.push(distance);
    });
    return candidates.length ? Math.min(...candidates) : fallback;
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

  function drawNodes(renderState) {
    state.nodes.forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      if (!pointNearViewport(p, renderState.rect)) return;
      if (node.type === "flywheel") visibleRotors.push({ node, p, radius: nodeVisualRadiusM(node) * state.camera.scale });
      if (state.running && (node.curtailedKw > 0 || node.unservedKw > 0)) visibleLimitedNodes.push({ node, p });
      const selected = renderState.selectedKeys.has(`node:${node.id}`);
      const connecting = state.connecting && state.connecting.from === node.id;
      drawNodeShape(node, p, selected || connecting, renderState);
    });
    drawSupportLabels(renderState.rect);
  }

  function drawNodeShape(node, p, selected, renderState) {
    const sourceStyle = node.type === "source" ? sourceConfig(node) : null;
    const fill = sourceStyle
      ? sourceStyle.fill
      : node.type === "load"
        ? renderedLoadFill(node, renderState)
        : node.type === "tower"
          ? (world.isWater(node.x, node.y) ? WATER_SURFACE_COLOR : "#ffffff")
          : nodeColor(node.type);
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
    ctx.lineWidth = (node.type === "source" ? 0.9 : 0.7) * scale;

    if (node.type === "flywheel") {
      const radius = nodeVisualRadiusM(node) * scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, TWO_PI);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#151a1e";
      ctx.lineWidth = radius * 0.16;
    } else if (node.type === "joint") {
      drawHexagon(p.x, p.y, substationSizeM(node) * scale / 2);
    } else if (node.type === "tower") {
      const size = TOWER_SIZE_M * scale;
      ctx.beginPath();
      ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
    } else if (node.type === "pole") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POLE_RADIUS_M * scale, 0, Math.PI * 2);
    } else if (node.type === "battery") {
      const size = batteryVisualDimensions(node);
      roundedRect(
        p.x - size.width * scale / 2,
        p.y - size.height * scale / 2,
        size.width * scale,
        size.height * scale,
        Math.min(size.width, size.height) * scale * 0.18
      );
    } else if (node.type === "load") {
      const size = loadVisualDimensions(node);
      ctx.beginPath();
      ctx.rect(p.x - size.width * scale / 2, p.y - size.height * scale / 2, size.width * scale, size.height * scale);
    } else if (node.type === "source") {
      drawSourcePath(node, p, scale);
    }
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    drawNodeInlineText(node, p);
    ctx.restore();
  }

  function drawSourcePath(node, p, scale) {
    const config = sourceConfig(node);
    const size = sourceVisualDimensions(node);
    const width = size.width * scale;
    const height = size.height * scale;
    if (config.shape === "circle") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
      return;
    }
    if (config.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - height / 2);
      ctx.lineTo(p.x + width / 2, p.y + height / 2);
      ctx.lineTo(p.x - width / 2, p.y + height / 2);
      ctx.closePath();
      return;
    }
    if (config.shape === "rounded-square") {
      roundedRect(p.x - width / 2, p.y - height / 2, width, height, Math.min(width, height) * 0.2);
      return;
    }
    ctx.beginPath();
    ctx.rect(p.x - width / 2, p.y - height / 2, width, height);
  }

  function nodeVisualRadiusM(node) {
    if (node.type === "flywheel") return flywheelModel(node.flywheelMass).diameter / 2;
    if (node.type === "source") {
      const size = sourceVisualDimensions(node);
      return Math.hypot(size.width, size.height) / 2;
    }
    if (node.type === "joint") return substationSizeM(node) / 2;
    if (node.type === "pole") return POLE_RADIUS_M;
    if (node.type === "tower") return Math.SQRT2 * TOWER_SIZE_M / 2;
    if (node.type === "load") {
      const size = loadVisualDimensions(node);
      return Math.hypot(size.width, size.height) / 2;
    }
    if (node.type === "battery") {
      const size = batteryVisualDimensions(node);
      return Math.hypot(size.width, size.height) / 2;
    }
    return 8;
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
      if (node.type === "source" && !["coal", "gas"].includes(node.sourceType)) ctx.fillStyle = "#4a3c00";
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
      ctx.font = `800 ${Math.max(1, 3.1 * scale)}px Inter, Segoe UI, sans-serif`;
      ctx.fillText(String(Math.round(batteryEnergyGJ(node))), p.x, p.y);
    }
    ctx.restore();
  }

  function supportNumberText(node) {
    const named = String(node.name || "").match(/(?:tower|pole)\s+([a-z]*\d+)/i);
    if (named) return named[1].toUpperCase();
    const idNumber = String(node.id || "").match(/\d+/);
    return `${node.type === "tower" ? "T" : "P"}${idNumber ? idNumber[0] : "?"}`;
  }

  function boxesOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function createBoxCollisionIndex(cellSize = 64) {
    const cells = new Map();
    const bounds = (box) => ({
      left: Math.floor(box.left / cellSize),
      right: Math.floor(box.right / cellSize),
      top: Math.floor(box.top / cellSize),
      bottom: Math.floor(box.bottom / cellSize)
    });
    const key = (x, y) => `${x}:${y}`;

    return {
      add(box) {
        const range = bounds(box);
        for (let x = range.left; x <= range.right; x += 1) {
          for (let y = range.top; y <= range.bottom; y += 1) {
            const cellKey = key(x, y);
            const items = cells.get(cellKey);
            if (items) items.push(box);
            else cells.set(cellKey, [box]);
          }
        }
      },
      overlaps(box) {
        const range = bounds(box);
        const checked = new Set();
        for (let x = range.left; x <= range.right; x += 1) {
          for (let y = range.top; y <= range.bottom; y += 1) {
            const items = cells.get(key(x, y)) || [];
            for (const other of items) {
              if (checked.has(other)) continue;
              checked.add(other);
              if (boxesOverlap(box, other)) return true;
            }
          }
        }
        return false;
      }
    };
  }

  function drawSupportLabels(rect) {
    const scale = state.camera.scale;
    const collisions = createBoxCollisionIndex();
    state.nodes.forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      if (!pointNearViewport(p, rect, 120)) return;
      const radius = nodeVisualRadiusM(node) * scale + 1;
      collisions.add({ left: p.x - radius, right: p.x + radius, top: p.y - radius, bottom: p.y + radius });
    });
    state.nodes.filter((node) => node.type === "pole" || node.type === "tower").forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      if (!pointNearViewport(p, rect, 120)) return;
      const text = supportNumberText(node);
      const fontSize = Math.max(1, 3 * scale);
      ctx.save();
      ctx.font = `800 ${fontSize}px Inter, Segoe UI, sans-serif`;
      const width = ctx.measureText(text).width + 2.4 * scale;
      const height = fontSize + 2 * scale;
      const offset = nodeVisualRadiusM(node) * scale + 2.5 * scale;
      const candidates = [
        { x: p.x, y: p.y - offset - height / 2 },
        { x: p.x + offset + width / 2, y: p.y },
        { x: p.x, y: p.y + offset + height / 2 },
        { x: p.x - offset - width / 2, y: p.y }
      ];
      const candidate = candidates.find((item) => {
        const box = { left: item.x - width / 2, right: item.x + width / 2, top: item.y - height / 2, bottom: item.y + height / 2 };
        return !collisions.overlaps(box);
      }) || candidates[0];
      const box = { left: candidate.x - width / 2, right: candidate.x + width / 2, top: candidate.y - height / 2, bottom: candidate.y + height / 2 };
      collisions.add(box);
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.fillRect(box.left, box.top, width, height);
      ctx.fillStyle = node.type === "tower" ? colors.towerLine : colors.pole;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, candidate.x, candidate.y);
      ctx.restore();
    });
  }

  function activeLevels(node) {
    let distribution = ["source", "load", "battery", "flywheel"].includes(node.type);
    let transmission = false;
    incidentLines(node.id).forEach((line) => {
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

  function runSimulationStep(options = {}) {
    if (state.stepping) return;
    state.stepping = true;
    try {
      stepGrid(options);
    } finally {
      state.stepping = false;
    }
  }

  function stepGrid(options) {
    const stepStarted = window.performance.now();
    const advanceSeconds = Number(options.advanceSeconds) || 0;
    const dispatchSeconds = Math.max(SIMULATION_STEP_SECONDS, advanceSeconds);
    const allowTrips = options.allowTrips !== false;
    if (state.running && advanceSeconds > 0 && updateVariableProfiles(advanceSeconds)) {
      state.simulationNeedsSolve = true;
    }
    let solvedThisTick = false;
    let tripCount = 0;
    const solve = (horizon = dispatchSeconds, changedIslands = null) => {
      tripCount += solveOperatingPoint(horizon, allowTrips, changedIslands);
      solvedThisTick = true;
    };
    if (state.simulationNeedsSolve || !cachedSimulationGraph || !state.solved || !canFastAdvanceBatteries(advanceSeconds)) solve();

    // Integrate cached dispatch up to the first relay crossing, then use the new dispatch
    // for the rest of the second. Loss iterations and zero-time edits never advance a rotor.
    let remaining = advanceSeconds;
    let batteryDisplayChanged = false;
    while (remaining > 0) {
      let duration = remaining;
      const events = [];
      for (const island of cachedSimulationGraph.rotatingIslands) {
        const event = frequencyEvent(island.hz, island.slope, island.relay);
        if (event && event.seconds <= remaining) {
          events.push({ island, ...event });
          duration = Math.min(duration, event.seconds);
        }
      }
      for (const island of cachedSimulationGraph.rotatingIslands) {
        island.hz += island.slope * duration;
        for (const wheel of island.wheels) wheel.frequencyHz = island.hz;
      }
      batteryDisplayChanged = advanceBatteryEnergy(duration) || batteryDisplayChanged;
      remaining -= duration;
      if (events.length) {
        const changedIslands = [];
        for (const event of events) {
          if (event.seconds > duration + 1e-9) continue;
          event.island.relay = event.next;
          for (const wheel of event.island.wheels) wheel.frequencyRelay = event.next;
          changedIslands.push(event.island);
        }
        solve(remaining > 1e-9 ? remaining : dispatchSeconds, changedIslands);
      }
    }
    state.elapsedSeconds += advanceSeconds;
    sampleFrequencyHistory();
    if (solvedThisTick) state.lastTripCount = tripCount;
    state.solved = true;
    state.dirty = false;
    state.simulationNeedsSolve = Boolean(options.keepSolvePending);
    if (tripCount) {
      state.warnings.push(`${tripCount} line${tripCount === 1 ? "" : "s"} tripped above its current rating.`);
    }
    setCanvasStatus(options.status || (tripCount ? "Running with trips" : "Running"));
    updateTimeReadout();
    if (solvedThisTick) updateSummaries();
    else {
      updateFrequencyReadout();
      if (cachedSimulationGraph.batteries.length) {
        const energy = cachedSimulationGraph.batteries.reduce((sum, node) => sum + batteryEnergyGJ(node), 0);
        updateReserveSummary(energy);
      }
    }
    if (options.renderProperties !== false && !isLivePowerControlFocused()) {
      if (solvedThisTick) renderProperties();
      else refreshFastRuntimeProperties();
    }
    if (solvedThisTick || batteryDisplayChanged || !networkLayerValid) draw();
    else if (visibleRotors.some(rotor => rotor.alarm !== rotorAlarm(rotor.node))) {
      paintAlarmLayer(canvas.getBoundingClientRect());
    }
    if (solvedThisTick) {
      performanceStats.solveCount += 1;
      performanceStats.lastSolveMs = window.performance.now() - stepStarted;
      performanceStats.maximumSolveMs = Math.max(performanceStats.maximumSolveMs, performanceStats.lastSolveMs);
    } else {
      performanceStats.fastTickCount += 1;
      performanceStats.lastFastTickMs = window.performance.now() - stepStarted;
    }
  }

  function solveOperatingPoint(dispatchSeconds, allowTrips, changedIslands) {
    let trips = 0;
    // A frequency relay only changes its own island. A line trip changes connectivity.
    while (true) {
      if (!changedIslands) resetNumericsOnly();
      const components = changedIslands ? cachedSimulationGraph.components : buildComponents();
      const overloads = [];
      for (const component of changedIslands || components) {
        state.warnings = component.warnings = [];
        state.errors = component.errors = [];
        computePowerFlows(component, dispatchSeconds);
        if (component.wheels.length) {
          component.active = component.lines.length > 0 && (component.sources.some(n => n.powerKw > 0)
            || component.batteries.some(n => Math.abs(n.batteryPowerKw) > 0)
            || component.wheels.some(n => Math.abs(n.effectivePowerKw) > 0));
        }
        if (allowTrips) {
          for (const line of component.lines) {
            if (Math.abs(line.currentA) > lineCurrentLimitA(line) + 0.01) overloads.push(line);
          }
        }
        if (!overloads.length) {
          solveVoltages([component]);
          computeNodeLineTotals(component.nodes, component.lines);
          computeSubstationStepPower(component.nodes);
        }
      }
      if (!overloads.length) {
        // Commit mechanical state only after trips settle. A rejected dispatch cannot spin up a cold rotor.
        for (const island of changedIslands || components) {
          for (const wheel of island.wheels) {
            wheel.frequencyHz = island.hz;
            wheel.frequencyRelay = island.relay;
            wheel.rotorActive = island.active;
            if (island.active) wheel.rotorSpinning = true;
          }
        }
        state.warnings = components.flatMap(c => c.warnings);
        state.errors = components.flatMap(c => c.errors);
        return trips;
      }
      for (const line of overloads) {
        line.tripped = true;
        line.online = false;
      }
      trips += overloads.length;
      invalidateSimulationGraph();
      changedIslands = null;
    }
  }

  function refreshFastRuntimeProperties() {
    const node = selectedNode();
    if (node?.type === "flywheel") {
      document.getElementById("rotorFrequency").textContent = flywheelFrequencyText(node);
      document.getElementById("mechanicalRpm").textContent = formatRpm(node.rotorSpinning ? node.frequencyHz : 0);
      return;
    }
    if (!node || node.type !== "battery") return;
    const energyInput = document.getElementById("batteryEnergyGJ");
    const reserve = document.getElementById("batteryReserveReadout");
    const stateOfCharge = document.getElementById("batterySocReadout");
    const power = document.getElementById("runtimeBatteryPower");
    if (energyInput) energyInput.value = editableDecimal(batteryEnergyGJ(node), 4);
    if (reserve) reserve.textContent = `${formatGJ(batteryEnergyGJ(node), 4)} / ${formatGJ(batteryCapacityGJ(node))}`;
    if (stateOfCharge) stateOfCharge.textContent = formatPercent(batteryReserveFraction(node));
    if (power) power.textContent = batteryText(node);
  }

  function isLivePowerControlFocused() {
    if (!state.running || !document.activeElement) return false;
    return ["powerSlider", "powerNumber", "bulkPowerNumber", "batteryCommand", "batteryCommandSlider"].includes(document.activeElement.id);
  }

  function updateVariableProfiles(advanceSeconds) {
    const startSecond = state.elapsedSeconds;
    const endSecond = startSecond + advanceSeconds;
    const loadChanged = updateVariableProfileGroup("load", true, startSecond, endSecond);
    const sourceChanged = updateVariableProfileGroup("source", false, startSecond, endSecond);
    return loadChanged || sourceChanged;
  }

  function variableUpdateIntervalSeconds(node) {
    return Math.max(2, BASE_VARIABLE_UPDATE_SECONDS + DEFAULT_VARIABILITY_INDEX - variabilityIndex(node));
  }

  function updateVariableProfileGroup(type, useSharedBias, startSecond, endSecond) {
    const scheduled = state.nodes
      .filter((node) => node.type === type && node.powerProfile === "variable")
      .map((node) => {
        const interval = variableUpdateIntervalSeconds(node);
        const updates = Math.max(0, Math.floor(endSecond / interval) - Math.floor(startSecond / interval));
        return { node, updates };
      })
      .filter((item) => item.updates > 0);
    if (!scheduled.length) return false;

    let changed = false;
    const rounds = Math.max(...scheduled.map((item) => item.updates));
    for (let round = 1; round <= rounds; round += 1) {
      if (useSharedBias) advanceVariableLoadBias();
      scheduled.forEach((item) => {
        if (item.updates < round) return;
        changed = updateVariableProfileNode(item.node, useSharedBias) || changed;
      });
    }
    return changed;
  }

  function updateVariableProfileNode(node, useSharedBias) {
    const cycleBias = advanceNodeVariationCycle(node);
    const sharedBias = useSharedBias ? state.variableLoadBias : 0;
    const directionalBias = useSharedBias
      ? clamp(cycleBias * 0.55 + sharedBias * 0.8, -1, 1)
      : clamp(cycleBias * 0.9, -1, 1);
    const changePct = chooseVariableChangePct(variabilityIndex(node), directionalBias);
    const maximum = operatingPowerMaximumKw(node);
    const minimum = operatingPowerMinimumKw(node);
    const currentPower = clamp(Number(node.powerKw) || 0, minimum, maximum);
    const changeKw = Math.round((maximum - minimum) * changePct / 100);
    const nextPower = clamp(Math.round(currentPower + changeKw), minimum, maximum);
    if (nextPower !== node.powerKw) {
      node.powerKw = nextPower;
      return true;
    }
    return false;
  }

  function advanceVariableLoadBias() {
    if (Math.random() < 0.18) {
      state.variableLoadBiasTrend = clamp(state.variableLoadBiasTrend + (Math.random() - 0.5) * 0.004, -0.018, 0.018);
    }
    state.variableLoadBiasDeviation += state.variableLoadBiasTrend;
    if (state.variableLoadBiasDeviation > 0.22 || state.variableLoadBiasDeviation < -0.22) {
      state.variableLoadBiasTrend *= -1;
      state.variableLoadBiasDeviation = clamp(state.variableLoadBiasDeviation, -0.22, 0.22);
    }
    const phaseStep = 0.11 * (1 + state.variableLoadBiasDeviation) * (0.96 + Math.random() * 0.08);
    state.variableLoadBiasPhase = (state.variableLoadBiasPhase + phaseStep) % TWO_PI;
    state.variableLoadBias = clamp(Math.sin(state.variableLoadBiasPhase) * 0.62 + state.variableLoadBiasDeviation * 0.35, -1, 1);
  }

  function advanceNodeVariationCycle(node) {
    ensureVariationState(node);
    if (Math.random() < 0.18) {
      node.variationDeviationTrend = clamp(node.variationDeviationTrend + (Math.random() - 0.5) * 0.008, -0.035, 0.035);
    }
    node.variationDeviation += node.variationDeviationTrend;
    if (node.variationDeviation > 0.28 || node.variationDeviation < -0.28) {
      node.variationDeviationTrend *= -1;
      node.variationDeviation = clamp(node.variationDeviation, -0.28, 0.28);
    }

    const frequency = variabilityIndex(node);
    const cycleUpdates = 60 - ((frequency - 1) / 9) * 48;
    const phaseStep = (TWO_PI / cycleUpdates) * (1 + node.variationDeviation) * (0.94 + Math.random() * 0.12);
    node.variationPhase = (node.variationPhase + phaseStep) % TWO_PI;
    return Math.sin(node.variationPhase);
  }

  function chooseVariableChangePct(frequency, bias) {
    const frequencyRatio = (clamp(Number(frequency) || DEFAULT_VARIABILITY_INDEX, 1, 10) - 1) / 9;
    const activityChance = clamp(0.18 + frequencyRatio * 0.72 + (Math.random() - 0.5) * 0.12, 0.08, 0.98);
    if (Math.random() > activityChance) return 0;

    const weights = VARIABLE_CHANGE_WEIGHTS.map((weight, index) => {
      const change = VARIABLE_CHANGE_OPTIONS[index];
      return weight * Math.exp(change * clamp(bias, -1, 1) * 0.075);
    });
    let pick = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < weights.length; index += 1) {
      pick -= weights[index];
      if (pick <= 0) return VARIABLE_CHANGE_OPTIONS[index];
    }
    return 0;
  }

  function canFastAdvanceBatteries(seconds) {
    return cachedSimulationGraph.batteries.every((node) => {
      const powerKw = Number(node.batteryPowerKw) || 0;
      if (Math.abs(powerKw) < 0.05) return true;
      const capacity = batteryCapacityGJ(node);
      const nextEnergy = batteryEnergyGJ(node) - powerKw * seconds / 1000000;
      return nextEnergy >= -1e-12 && nextEnergy <= capacity + 1e-12;
    });
  }

  function advanceBatteryEnergy(seconds) {
    let displayChanged = false;
    cachedSimulationGraph.batteries.forEach((node) => {
      const previousDisplay = Math.round(batteryEnergyGJ(node));
      const capacity = batteryCapacityGJ(node);
      const deltaGJ = (node.batteryPowerKw || 0) * seconds / 1000000;
      node.batteryEnergyGJ = clamp(batteryEnergyGJ(node) - deltaGJ, 0, capacity);
      displayChanged = displayChanged || Math.round(node.batteryEnergyGJ) !== previousDisplay;
    });
    return displayChanged;
  }

  function resetNumericsOnly() {
    state.nodes.forEach((node) => {
      node.effectivePowerKw = 0;
      node.batteryPowerKw = 0;
      node.steppedPowerKw = 0;
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
    });
  }

  function buildComponents() {
    if (cachedSimulationGraph && cachedSimulationGraph.revision === simulationGraphRevision) {
      cachedSimulationGraph.components.forEach((component) => {
        component.nodes.forEach((node) => { node.island = component.index; });
        component.lines.forEach((line) => { line.island = component.index; });
      });
      return cachedSimulationGraph.components;
    }

    const adjacency = new Map();
    state.nodes.forEach((node) => adjacency.set(node.id, []));
    const activeLines = [];
    state.lines.forEach((line) => {
      if (!line.online || line.tripped) return;
      if (!adjacency.has(line.from) || !adjacency.has(line.to)) return;
      adjacency.get(line.from).push({ nodeId: line.to, line });
      adjacency.get(line.to).push({ nodeId: line.from, line });
      activeLines.push(line);
    });

    const visited = new Set();
    const components = [];
    const componentByNodeId = new Map();
    state.nodes.forEach((start) => {
      if (visited.has(start.id)) return;
      const queue = [start.id];
      let queueIndex = 0;
      const nodeIds = [];
      visited.add(start.id);
      while (queueIndex < queue.length) {
        const id = queue[queueIndex++];
        nodeIds.push(id);
        adjacency.get(id).forEach((edge) => {
          if (!visited.has(edge.nodeId)) {
            visited.add(edge.nodeId);
            queue.push(edge.nodeId);
          }
        });
      }
      const index = components.length + 1;
      const nodes = nodeIds.map(getNode).filter(Boolean);
      const component = { index, nodeIds, nodes, lines: [], slack: chooseSlack(nodes) };
      nodeIds.forEach((id) => componentByNodeId.set(id, component));
      nodes.forEach((node) => { node.island = index; });
      components.push(component);
    });

    activeLines.forEach((line) => {
      const component = componentByNodeId.get(line.from);
      if (!component || component !== componentByNodeId.get(line.to)) return;
      component.lines.push(line);
      line.island = component.index;
    });
    components.forEach((component) => {
      component.sources = component.nodes.filter(node => node.type === "source");
      component.loads = component.nodes.filter(node => node.type === "load");
      component.batteries = component.nodes.filter(node => node.type === "battery");
      component.wheels = component.nodes.filter(node => node.type === "flywheel");
      if (component.wheels.length) {
        component.traceKey = JSON.stringify(component.wheels.map(w => w.id).sort());
        const storage = w => flywheelModel(w.flywheelMass).kwSecondsPerHz;
        component.storagePerHz = component.wheels.reduce((sum, w) => sum + storage(w), 0);
        // Synchronization conserves angular momentum, including that of coasting rotors.
        const reference = component.wheels.filter(w => w.rotorSpinning);
        const baseHz = reference[0]?.frequencyHz ?? 60;
        let inertia = 0, weightedDelta = 0;
        for (const wheel of reference) {
          const weight = flywheelModel(wheel.flywheelMass).inertia;
          inertia += weight;
          weightedDelta += weight * (wheel.frequencyHz - baseHz);
        }
        component.hz = baseHz + (inertia ? weightedDelta / inertia : 0);
        component.relay = "normal";
        if (component.hz >= 61 || (component.hz > 60.8 && reference.some(w => w.frequencyRelay === "high"))) component.relay = "high";
        if (component.hz <= 59 || (component.hz < 59.2 && reference.some(w => w.frequencyRelay === "low"))) component.relay = "low";
      }
      component.powerSystem = buildComponentSparseSystem(component, linePowerWeight);
      component.voltageSystem = buildComponentSparseSystem(component, (line) => {
        const ratio = line.type === "transmission" ? TRANSMISSION_RATIO : 1;
        return (ratio * ratio) / Math.max(line.resistance, 0.0001);
      });
    });
    cachedSimulationGraph = {
      revision: simulationGraphRevision, components,
      rotatingIslands: components.filter(c => c.wheels.length),
      batteries: components.flatMap(c => c.batteries)
    };
    return components;
  }

  function buildComponentSparseSystem(component, weightForLine) {
    const slack = component.slack;
    const unknowns = component.nodes.filter((node) => node.id !== slack.id);
    const indexByNodeId = new Map(unknowns.map((node, index) => [node.id, index]));
    const boundaryWeight = new Float64Array(unknowns.length);
    const connections = component.lines.map((line) => {
      const from = indexByNodeId.has(line.from) ? indexByNodeId.get(line.from) : -1;
      const to = indexByNodeId.has(line.to) ? indexByNodeId.get(line.to) : -1;
      const weight = weightForLine(line);
      if (from >= 0 && to < 0) boundaryWeight[from] += weight;
      if (to >= 0 && from < 0) boundaryWeight[to] += weight;
      return { from, to, weight };
    });
    return {
      slack,
      unknowns,
      indexByNodeId,
      boundaryWeight,
      matrix: window.GridboxEngine.createGroundedLaplacian(unknowns.length, connections)
    };
  }

  function addWarningOnce(message) {
    if (!state.warnings.includes(message)) state.warnings.push(message);
  }

  function batteryCapacityGJ(node) {
    return clamp(Number(node.batteryCapacityGJ) || DEFAULT_BATTERY_CAPACITY_GJ, 10, 1000);
  }

  function batteryEnergyGJ(node) {
    return clamp(Number(node.batteryEnergyGJ) || 0, 0, batteryCapacityGJ(node));
  }

  function batteryRateKw(node) {
    return clamp(Number(node.batteryRateMw) || DEFAULT_BATTERY_RATE_MW, 1, 40) * 1000;
  }

  function batteryReserveFraction(node) {
    const capacity = batteryCapacityGJ(node);
    return capacity > 0 ? batteryEnergyGJ(node) / capacity : 0;
  }

  function batteryAvailableDischargeKw(node, seconds) {
    const byEnergy = batteryEnergyGJ(node) * 1000000 / seconds;
    return Math.max(0, Math.min(batteryRateKw(node), byEnergy));
  }

  function batteryAvailableChargeKw(node, seconds) {
    const byCapacity = (batteryCapacityGJ(node) - batteryEnergyGJ(node)) * 1000000 / seconds;
    return Math.max(0, Math.min(batteryRateKw(node), byCapacity));
  }

  function prepareComponentPower(component, targetLossKw, dispatchSeconds, report) {
    const { sources, loads, batteries, wheels } = component;
    const sourceKw = sources.reduce((sum, node) => sum + node.powerKw, 0);
    const loadKw = loads.reduce((sum, node) => sum + node.powerKw, 0);

    sources.forEach((node) => {
      node.effectivePowerKw = node.powerKw;
      node.curtailedKw = 0;
    });
    loads.forEach((node) => {
      node.effectivePowerKw = -node.powerKw;
      node.unservedKw = 0;
    });
    const net = sourceKw - loadKw;
    for (const node of batteries) {
      const requested = (node.batterySetpointMw || 0) * 1000;
      node.batteryPowerKw = component.lines.length ? clamp(requested, -batteryAvailableChargeKw(node, dispatchSeconds),
        batteryAvailableDischargeKw(node, dispatchSeconds)) : 0;
      node.effectivePowerKw = node.batteryPowerKw;
    }

    const requiredNet = targetLossKw;
    const batteryKw = batteries.reduce((sum, node) => sum + node.batteryPowerKw, 0);
    let mismatch = net + batteryKw - requiredNet;
    const energized = component.lines.length && (sourceKw > 0 || batteries.some(n => n.batteryPowerKw > 0)
      || wheels.some(w => w.rotorSpinning));
    if (wheels.length && energized) {
      const limit = mismatch > 0 ? "high" : "low";
      component.slope = component.relay === limit || Math.abs(mismatch) < 0.05 ? 0 : mismatch / component.storagePerHz;
      for (const wheel of wheels) {
        wheel.effectivePowerKw = -component.slope * flywheelModel(wheel.flywheelMass).kwSecondsPerHz;
      }
      if (component.slope !== 0) return;
    } else if (wheels.length) {
      component.slope = 0;
      for (const wheel of wheels) wheel.effectivePowerKw = 0;
    }
    if (Math.abs(mismatch) < 0.05) return;

    // At protection, back off batteries worsening the imbalance before cutting service.
    const adverse = batteries.filter(node => node.batteryPowerKw * mismatch > 0);
    const available = adverse.reduce((sum, node) => sum + node.batteryPowerKw, 0);
    if (available) {
      const fraction = Math.min(1, mismatch / available);
      for (const node of adverse) {
        node.batteryPowerKw *= 1 - fraction;
        node.effectivePowerKw = node.batteryPowerKw;
      }
      mismatch -= available * fraction;
      if (Math.abs(mismatch) < 0.05) return;
    }
    if (mismatch > 0.05) {
      const curtailed = Math.min(mismatch, sourceKw);
      // Runtime profile affects the setpoint, not dispatch eligibility: all sources share curtailment.
      sources.forEach((node) => {
        const share = sourceKw > 0 ? curtailed * (node.powerKw / sourceKw) : 0;
        node.curtailedKw = share;
        node.effectivePowerKw = Math.max(0, node.powerKw - share);
      });
      if (report) addWarningOnce(`Island ${component.index} curtailed ${formatKw(curtailed)} after losses.`);
    } else {
      const deficit = Math.min(-mismatch, loadKw);
      loads.forEach((node) => {
        const share = loadKw > 0 ? deficit * (node.powerKw / loadKw) : 0;
        node.unservedKw = share;
        node.effectivePowerKw = -Math.max(0, node.powerKw - share);
      });
      if (report) addWarningOnce(`Island ${component.index} has ${formatKw(deficit)} unserved load after losses.`);
    }
  }

  function solveVoltages(components) {
    components.forEach((component) => {
      const nodes = component.nodes;
      nodes.forEach((node) => {
        if (!Number.isFinite(node.voltage)) node.voltage = BASE_VOLTAGE;
      });
      if (nodes.length === 0) return;

      const system = component.voltageSystem;
      const slack = system.slack;
      slack.voltage = BASE_VOLTAGE;
      const unknowns = system.unknowns;
      if (!unknowns.length) return;
      let converged = false;

      for (let iteration = 0; iteration < 80; iteration += 1) {
        const oldVoltages = unknowns.map((node) => node.voltage);
        const B = new Float64Array(unknowns.length);

        unknowns.forEach((node, index) => {
          const vSafe = Math.max(Math.abs(node.voltage), 100);
          B[index] = system.boundaryWeight[index] * slack.voltage + (node.effectivePowerKw * 1000) / vSafe;
        });

        let result;
        try {
          result = window.GridboxEngine.solve(system.matrix, B, {
            initial: Float64Array.from(oldVoltages),
            relativeTolerance: 1e-10,
            absoluteTolerance: 1e-5
          });
        } catch (error) {
          state.errors.push(`Island ${component.index} could not be solved.`);
          return;
        }
        if (!result.converged) {
          addWarningOnce(`Island ${component.index} voltage solver reached its iteration limit.`);
        }

        let maxDelta = 0;
        unknowns.forEach((node, index) => {
          const next = clamp(result.values[index], 500, 18000);
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

  function computePowerFlows(component, dispatchSeconds) {
    let loss = 0, previousDelta = Infinity;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      prepareComponentPower(component, loss, dispatchSeconds, false);
      solveComponentPowerFlow(component, buildLossShareByNode(component));
      const next = component.lines.reduce((sum, line) => sum + line.lossKw, 0);
      const delta = Math.abs(next - loss);
      loss = next;
      if (delta < 0.02 || Math.abs(delta - previousDelta) < 0.001) break;
      previousDelta = delta;
    }
    prepareComponentPower(component, loss, dispatchSeconds, true);
    solveComponentPowerFlow(component, buildLossShareByNode(component));
  }

  function solveComponentPowerFlow(component, lossShareByNode) {
      const nodes = component.nodes;
      if (!nodes.length || !component.lines.length) {
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }
      const system = component.powerSystem;
      const slack = system.slack;
      const unknowns = system.unknowns;
      if (!unknowns.length) {
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }

      const B = new Float64Array(unknowns.length);

      unknowns.forEach((node, index) => {
        B[index] = node.effectivePowerKw - (lossShareByNode.get(node.id) || 0);
      });

      let result;
      try {
        result = window.GridboxEngine.solve(system.matrix, B, {
          initial: Float64Array.from(unknowns, (node) => Number(node.powerAngle) || 0),
          relativeTolerance: 1e-10,
          absoluteTolerance: 1e-7
        });
      } catch (error) {
        state.errors.push(`Island ${component.index} power flow could not be solved.`);
        component.lines.forEach((line) => setLinePower(line, 0, 0));
        return;
      }
      if (!result.converged) {
        addWarningOnce(`Island ${component.index} power-flow solver reached its iteration limit.`);
      }

      const angle = new Map([[slack.id, 0]]);
      unknowns.forEach((node, index) => {
        node.powerAngle = result.values[index];
        angle.set(node.id, result.values[index]);
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

  function buildLossShareByNode(component) {
    const shares = new Map();
    component.lines.forEach((line) => {
      shares.set(line.from, (shares.get(line.from) || 0) + line.lossKw / 2);
      shares.set(line.to, (shares.get(line.to) || 0) + line.lossKw / 2);
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

  function computeNodeLineTotals(nodes, lines) {
    nodes.forEach((node) => {
      node.lineNetKw = 0;
    });
    lines.forEach((line) => {
      if (!line.online || line.tripped) return;
      const from = getNode(line.from);
      const to = getNode(line.to);
      if (from) from.lineNetKw += line.fromPowerKw;
      if (to) to.lineNetKw += line.toPowerKw;
    });
  }

  function computeSubstationStepPower(nodes) {
    nodes.forEach((node) => {
      if (node.type !== "joint") return;
      const incident = incidentLines(node.id).filter((line) => {
        return line.online && !line.tripped && (line.from === node.id || line.to === node.id);
      });
      const distribution = incident.filter((line) => line.type === "distribution");
      const transmission = incident.filter((line) => line.type === "transmission");
      if (!distribution.length || !transmission.length) {
        node.steppedPowerKw = 0;
        return;
      }
      const distributionNetKw = distribution.reduce((sum, line) => sum + lineEndPowerKw(line, node.id), 0);
      const transmissionNetKw = transmission.reduce((sum, line) => sum + lineEndPowerKw(line, node.id), 0);
      node.steppedPowerKw = Math.max(Math.abs(distributionNetKw), Math.abs(transmissionNetKw));
      const maximumKw = substationMaxStepKw(node);
      if (node.steppedPowerKw > maximumKw + 0.05) {
        addWarningOnce(`${node.name} is stepping ${formatMwFromKw(node.steppedPowerKw)}, above its ${formatMwFromKw(maximumKw)} rating.`);
      }
    });
  }

  function resetLinePower(line) {
    line.currentA = 0;
    line.powerKw = 0;
    line.fromPowerKw = 0;
    line.toPowerKw = 0;
    line.lossKw = 0;
  }

  function tripLines(lines, status) {
    const targets = lines.filter(Boolean);
    if (!targets.length) return;
    targets.forEach((line) => {
      line.online = false;
      line.tripped = true;
      resetLinePower(line);
    });
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    invalidateSimulationGraph();
    const message = status || `${targets.length} line${targets.length === 1 ? "" : "s"} tripped manually`;
    setCanvasStatus(message);
    if (state.running) {
      runSimulationStep({ advanceSeconds: 0, allowTrips: true, status: message });
      return;
    }
    renderAll();
  }

  function recloseLines(lines, status) {
    const targets = lines.filter(Boolean);
    if (!targets.length) return;
    targets.forEach((line) => {
      line.tripped = false;
      line.online = true;
    });
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    invalidateSimulationGraph();
    const message = status || `${targets.length} line${targets.length === 1 ? "" : "s"} reclosed`;
    setCanvasStatus(message);
    if (state.running) {
      runSimulationStep({ advanceSeconds: 0, allowTrips: false, status: message, renderProperties: true, keepSolvePending: true });
      return;
    }
    renderAll();
  }

  function recloseLine(line) {
    recloseLines([line], `${line.id} reclosed`);
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
    if (!from || !to) return "Missing endpoint";
    return line.currentA >= 0 ? `${from.name} to ${to.name}` : `${to.name} to ${from.name}`;
  }

  function renderProperties() {
    try {
      const items = selectedItems();
      if (items.length > 1) {
        renderMultiProperties(items);
        return;
      }
      const node = selectedNode();
      const line = selectedLine();
      if (node) {
        renderNodeProperties(node);
      } else if (line) {
        renderLineProperties(line);
      } else {
        renderNetworkProperties();
      }
    } catch (error) {
      console.error("Could not render properties", error);
      propertiesEl.innerHTML = `
        <div class="prop-group">
          <h3>Selection</h3>
          <p class="empty-note">This imported item had incomplete data, so the panel could not display it cleanly. Click another item or re-import the grid after exporting it again.</p>
        </div>
      `;
    }
  }

  function commonValue(items, getter) {
    if (!items.length) return "";
    const first = getter(items[0]);
    return items.every((item) => String(getter(item)) === String(first)) ? first : "";
  }

  function markOperatingEdit(status, renderPanel = false) {
    if (state.running) {
      state.simulationNeedsSolve = true;
      runSimulationStep({ advanceSeconds: 0, allowTrips: true, status, renderProperties: renderPanel });
      return;
    }
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    state.elapsedSeconds = 0;
    resetVariableProfileDrift();
    resetSolution();
    updateTimeReadout();
    updateSummaries();
    draw();
  }

  function markLabelEdit() {
    state.dirty = true;
    updateSummaries();
    draw();
  }

  function selectionTypeLabel(items, nodes, lines) {
    if (nodes.length === items.length && nodes.length) {
      const type = nodes[0].type;
      return nodes.every((node) => node.type === type) ? labelType(type) : "Mixed nodes";
    }
    if (lines.length === items.length && lines.length) {
      const type = lines[0].type;
      if (!lines.every((line) => line.type === type)) return "Mixed lines";
      return type === "transmission" ? "100 kV line" : "10 kV line";
    }
    return "Mixed";
  }

  function bulkNodeControlsHtml(nodes) {
    if (!nodes.length || !nodes.every((node) => node.type === nodes[0].type)) return "";
    const type = nodes[0].type;
    const locked = state.running;
    const nameValue = commonValue(nodes, (node) => node.name);
    const displayValue = type === "joint" ? commonValue(nodes, (node) => (node.display || "").slice(0, 2).toUpperCase()) : "";
    const commonMaxStepMw = type === "joint" ? commonValue(nodes, (node) => substationMaxStepKw(node) / 1000) : "";
    const slider = type === "source" || type === "load";
    const sliderTitle = type === "source" ? "Output" : "Demand";
    const maxCap = slider ? Math.min(...nodes.map(nodePowerCapKw)) : 0;
    const commonMin = slider ? commonValue(nodes, (node) => node.minPowerKw) : "";
    const commonMax = slider ? commonValue(nodes, (node) => node.maxPowerKw) : "";
    const commonPower = slider ? commonValue(nodes, (node) => node.powerKw) : "";
    const commonProfile = slider ? commonValue(nodes, (node) => node.powerProfile || "constant") : "";
    const commonFrequency = slider ? commonValue(nodes, variabilityIndex) : "";
    const commonSourceType = type === "source" ? commonValue(nodes, (node) => node.sourceType || "generic") : "";
    const commonLoadType = type === "load" ? commonValue(nodes, (node) => node.loadType || "general") : "";
    const powerLocked = state.running && nodes.some((node) => node.powerProfile === "variable");
    const minimumFloor = slider ? powerRangeFloorKw(nodes[0]) : 0;
    const commonMinimum = commonMin === "" ? minimumFloor : Number(commonMin);
    const commonCeiling = commonMax === "" ? maxCap : Number(commonMax);
    const operatingMinimum = slider ? Math.max(...nodes.map(operatingPowerMinimumKw)) : 0;
    const operatingCeiling = slider ? Math.min(...nodes.map(operatingPowerMaximumKw)) : 0;
    const maxForStep = commonMax === "" ? maxCap : Number(commonMax);
    const step = powerStepForMax(maxForStep);

    return `
      <div class="prop-group">
        <h3>${escapeHtml(labelType(type))} Attributes</h3>
        <div class="field">
          <label for="bulkNodeName">Name</label>
          <input id="bulkNodeName" type="text" value="${escapeAttr(nameValue)}" placeholder="${nameValue === "" ? "Mixed names" : ""}"${locked ? " disabled" : ""}>
        </div>
        ${type === "flywheel" ? flywheelControls(nodes) : ""}
        ${type === "battery" ? batteryCommandControls(nodes) : ""}
        ${type === "joint" ? `
          <div class="field">
            <label for="bulkNodeDisplay">Display</label>
            <input id="bulkNodeDisplay" type="text" maxlength="2" value="${escapeAttr(displayValue)}" placeholder="${displayValue === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="bulkSubstationMaxStepMw">Maximum stepped power</label>
              <span class="field-value">1-80 MW</span>
            </div>
            <input id="bulkSubstationMaxStepMw" type="number" min="1" max="80" step="0.1" value="${escapeAttr(commonMaxStepMw)}" placeholder="${commonMaxStepMw === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
        ` : ""}
        ${slider ? `
          ${type === "source" ? `<div class="readout-row" style="margin-bottom: 13px;"><span class="readout-label">Source type</span><span class="readout-value">${commonSourceType === "" ? "Mixed" : escapeHtml(SOURCE_TYPES[commonSourceType]?.label || "Legacy")}</span></div>` : ""}
          ${type === "load" ? `<div class="readout-row" style="margin-bottom: 13px;"><span class="readout-label">Load type</span><span class="readout-value">${commonLoadType === "" ? "Mixed" : escapeHtml(LOAD_TYPES[commonLoadType]?.label || "General")}</span></div>` : ""}
          <div class="field">
            <label>Runtime behavior</label>
            <div class="segmented">
              <button type="button" data-bulk-power-profile="constant" class="${commonProfile === "constant" ? "active" : ""}"${locked || nodes.some(requiresVariableProfile) ? " disabled" : ""}>Constant</button>
              <button type="button" data-bulk-power-profile="variable" class="${commonProfile === "variable" ? "active" : ""}"${locked || nodes.every(requiresVariableProfile) ? " disabled" : ""}>Variable</button>
            </div>
          </div>
          ${commonProfile === "variable" ? `
            <div class="field">
              <div class="field-row">
                <label for="bulkVariabilityIndex">Frequency index</label>
                <span class="field-value" id="bulkVariabilityReadout">${commonFrequency === "" ? "Mixed" : commonFrequency}</span>
              </div>
              <input id="bulkVariabilityIndex" type="range" min="1" max="10" step="1" value="${commonFrequency === "" ? DEFAULT_VARIABILITY_INDEX : commonFrequency}"${locked ? " disabled" : ""}>
            </div>
          ` : ""}
          <div class="field">
            <div class="field-row">
              <label for="bulkMinPowerNumber">Range minimum</label>
              <span class="field-value">${type === "source" ? "0 kW minimum" : "Above 0 kW"}</span>
            </div>
            <input id="bulkMinPowerNumber" type="number" min="${minimumFloor}" max="${Math.max(minimumFloor, commonCeiling - 1)}" step="${step}" value="${escapeAttr(commonMin)}" placeholder="${commonMin === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="bulkMaxPowerNumber">Range maximum</label>
              <span class="field-value">${formatKw(maxCap)} cap</span>
            </div>
            <input id="bulkMaxPowerNumber" type="number" min="${commonMinimum + 1}" max="${maxCap}" step="${step}" value="${escapeAttr(commonMax)}" placeholder="${commonMax === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="bulkPowerNumber">Actual ${sliderTitle.toLowerCase()}</label>
              <span class="field-value">${commonPower === "" ? "Mixed" : formatKw(Number(commonPower))}</span>
            </div>
            <input id="bulkPowerNumber" type="number" min="${operatingMinimum}" max="${operatingCeiling}" step="${step}" value="${escapeAttr(commonPower)}" placeholder="${commonPower === "" ? "Mixed" : ""}"${powerLocked ? " disabled" : ""}>
          </div>
        ` : ""}
        ${type === "battery" ? `
          <div class="field">
            <div class="field-row">
              <label for="bulkBatteryCapacityGJ">Capacity</label>
              <span class="field-value">10-1,000 GJ</span>
            </div>
            <input id="bulkBatteryCapacityGJ" type="number" min="10" max="1000" step="10" value="${escapeAttr(commonValue(nodes, batteryCapacityGJ))}" placeholder="${commonValue(nodes, batteryCapacityGJ) === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="bulkBatteryRateMw">Battery max rate</label>
              <span class="field-value">1-40 MW</span>
            </div>
            <input id="bulkBatteryRateMw" type="number" min="1" max="40" step="1" value="${escapeAttr(commonValue(nodes, (node) => batteryRateKw(node) / 1000))}" placeholder="${commonValue(nodes, (node) => batteryRateKw(node) / 1000) === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="bulkBatteryEnergyGJ">Current reserve</label>
              <span class="field-value">GJ stored</span>
            </div>
            <input id="bulkBatteryEnergyGJ" type="number" min="0" max="1000" step="0.0001" value="${escapeAttr(commonValue(nodes, batteryEnergyGJ))}" placeholder="${commonValue(nodes, batteryEnergyGJ) === "" ? "Mixed" : ""}"${locked ? " disabled" : ""}>
          </div>
        ` : ""}
      </div>
    `;
  }

  function bulkLineControlsHtml(lines) {
    if (!lines.length) return "";
    const sameType = lines.every((line) => line.type === lines[0].type);
    const commonVariant = sameType ? commonValue(lines, (line) => line.variant) : "";
    const tripped = lines.filter((line) => line.tripped).length;
    const inService = lines.filter((line) => line.online && !line.tripped).length;
    return `
      <div class="prop-group">
        <h3>Selected Lines</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Lines</span><span class="readout-value">${lines.length}</span></div>
          <div class="readout-row"><span class="readout-label">In service</span><span class="readout-value">${inService}</span></div>
          <div class="readout-row"><span class="readout-label">Tripped</span><span class="readout-value">${tripped}</span></div>
        </div>
        ${sameType ? `
          <div class="field" style="margin-top: 13px;">
            <label>Line type</label>
            <div class="segmented">
              <button type="button" data-bulk-line-type="distribution" class="${lines[0].type === "distribution" ? "active" : ""}"${state.running ? " disabled" : ""}>10 kV</button>
              <button type="button" data-bulk-line-type="transmission" class="${lines[0].type === "transmission" ? "active" : ""}"${state.running ? " disabled" : ""}>100 kV</button>
            </div>
          </div>
          <div class="field">
            <label for="bulkLineVariant">Wire set</label>
            <select id="bulkLineVariant"${state.running ? " disabled" : ""}>${lineVariantOptions(commonVariant)}</select>
          </div>
        ` : `<p class="empty-note">Select lines of the same voltage level to edit line type or construction together.</p>`}
        <div class="field-row" style="margin-top: 12px;">
          <button class="mini-button danger" type="button" id="bulkTripLines">Trip selected</button>
          <button class="mini-button ok" type="button" id="bulkRecloseLines">Reclose selected</button>
        </div>
      </div>
    `;
  }

  function renderMultiProperties(items) {
    const nodes = selectedNodes();
    const lines = selectedLines();
    const typeLabel = selectionTypeLabel(items, nodes, lines);
    propertiesEl.innerHTML = `
      <div class="prop-group">
        <h3>${items.length} Selected</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Selection</span><span class="readout-value">${escapeHtml(typeLabel)}</span></div>
          <div class="readout-row"><span class="readout-label">Nodes</span><span class="readout-value">${nodes.length}</span></div>
          <div class="readout-row"><span class="readout-label">Lines</span><span class="readout-value">${lines.length}</span></div>
        </div>
      </div>
      ${bulkNodeControlsHtml(nodes)}
      ${bulkLineControlsHtml(lines)}
      <div class="field-row">
        <button class="mini-button danger" type="button" id="deleteSelectedInline"${state.running ? " disabled" : ""}>Delete selected</button>
      </div>
    `;
    bindMultiProperties(nodes, lines);
  }

  function bindMultiProperties(nodes, lines) {
    bindFlywheelModel(nodes);
    if (!lines.length && nodes.length && nodes.every(n => n.type === "battery")) bindBatteryCommand(nodes);
    const nodeName = document.getElementById("bulkNodeName");
    if (nodeName) {
      nodeName.addEventListener("input", (event) => {
        if (state.running) return;
        nodes.forEach((node) => {
          node.name = event.target.value || node.id;
        });
        markLabelEdit();
      });
    }

    const nodeDisplay = document.getElementById("bulkNodeDisplay");
    if (nodeDisplay) {
      nodeDisplay.addEventListener("input", (event) => {
        if (state.running) return;
        const value = event.target.value.slice(0, 2).toUpperCase();
        event.target.value = value;
        nodes.forEach((node) => {
          node.display = value;
        });
        markLabelEdit();
      });
    }

    const substationMaxStep = document.getElementById("bulkSubstationMaxStepMw");
    if (substationMaxStep) {
      const commitSubstationRating = () => {
        if (state.running) return;
        const enteredMw = Number(substationMaxStep.value);
        const nextKw = clamp(
          Number.isFinite(enteredMw) ? Math.round(enteredMw * 1000) : DEFAULT_SUBSTATION_MAX_STEP_KW,
          MIN_SUBSTATION_MAX_STEP_KW,
          SUBSTATION_MAX_STEP_KW
        );
        nodes.forEach((node) => {
          node.maxStepPowerKw = nextKw;
        });
        markOperatingEdit("Selected substation ratings updated");
        renderProperties();
      };
      substationMaxStep.addEventListener("change", commitSubstationRating);
      substationMaxStep.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commitSubstationRating();
      });
    }

    propertiesEl.querySelectorAll("[data-bulk-power-profile]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running || (button.dataset.bulkPowerProfile === "constant" && nodes.some(requiresVariableProfile))) return;
        nodes.forEach((node) => {
          node.powerProfile = button.dataset.bulkPowerProfile;
          ensureVariationState(node);
          node.powerKw = clampNodePower(node, node.powerKw);
        });
        markOperatingEdit("Selection runtime behavior updated");
        renderProperties();
      });
    });

    const variability = document.getElementById("bulkVariabilityIndex");
    if (variability) {
      variability.addEventListener("input", (event) => {
        if (state.running) return;
        const next = clamp(Math.round(Number(event.target.value) || DEFAULT_VARIABILITY_INDEX), 1, 10);
        nodes.forEach((node) => {
          node.variabilityIndex = next;
        });
        const readout = document.getElementById("bulkVariabilityReadout");
        if (readout) readout.textContent = String(next);
        markOperatingEdit("Selection frequency index updated");
      });
    }

    const minPower = document.getElementById("bulkMinPowerNumber");
    const maxPower = document.getElementById("bulkMaxPowerNumber");
    const commitBulkRange = (side) => {
      if (state.running) return;
      const value = Number(side === "min" ? minPower.value : maxPower.value);
      nodes.forEach((node) => {
        if (side === "min") setNodePowerRange(node, value, node.maxPowerKw, "min");
        else setNodePowerRange(node, node.minPowerKw, value, "max");
      });
      markOperatingEdit(`Selection range ${side === "min" ? "minimum" : "maximum"} updated`);
      renderProperties();
    };
    [
      [minPower, "min"],
      [maxPower, "max"]
    ].forEach(([input, side]) => {
      if (!input) return;
      input.addEventListener("change", () => commitBulkRange(side));
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commitBulkRange(side);
      });
    });
    const powerNumber = document.getElementById("bulkPowerNumber");
    if (powerNumber) {
      const commitPower = () => {
        const value = Number(powerNumber.value) || 0;
        nodes.forEach((node) => {
          node.powerKw = clampNodePower(node, value);
        });
        markOperatingEdit("Selection power updated", false);
      };
      powerNumber.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commitPower();
      });
    }

    const batteryCapacity = document.getElementById("bulkBatteryCapacityGJ");
    if (batteryCapacity) {
      batteryCapacity.addEventListener("input", (event) => {
        if (state.running) return;
        const next = clamp(Number(event.target.value) || 10, 10, 1000);
        nodes.forEach((node) => {
          const oldCapacity = batteryCapacityGJ(node);
          const fill = oldCapacity > 0 ? batteryEnergyGJ(node) / oldCapacity : 0.5;
          node.batteryCapacityGJ = next;
          node.batteryEnergyGJ = roundTo(clamp(next * fill, 0, next), 4);
        });
        markOperatingEdit("Selection battery capacity updated");
      });
    }

    const batteryRate = document.getElementById("bulkBatteryRateMw");
    if (batteryRate) {
      batteryRate.addEventListener("change", (event) => {
        if (state.running) return;
        const next = clamp(Number(event.target.value) || 1, 1, 40);
        nodes.forEach((node) => {
          node.batteryRateMw = next;
          node.batterySetpointMw = clamp(node.batterySetpointMw || 0, -next, next);
        });
        markOperatingEdit("Selection battery max rate updated");
      });
      batteryRate.addEventListener("change", renderProperties);
    }

    const batteryEnergy = document.getElementById("bulkBatteryEnergyGJ");
    if (batteryEnergy) {
      batteryEnergy.addEventListener("input", (event) => {
        if (state.running) return;
        const next = Math.max(0, Number(event.target.value) || 0);
        nodes.forEach((node) => {
          node.batteryEnergyGJ = roundTo(clamp(next, 0, batteryCapacityGJ(node)), 4);
        });
        markOperatingEdit("Selection battery reserve updated");
      });
    }

    propertiesEl.querySelectorAll("[data-bulk-line-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running) return;
        const nextType = button.dataset.bulkLineType;
        if (lines.every((line) => line.type === nextType)) return;
        const message = lines.map((line) => validateLineTypeChange(line, nextType)).find(Boolean);
        if (message) {
          setCanvasStatus(message);
          return;
        }
        lines.forEach((line) => {
          line.type = nextType;
          line.tripped = false;
          line.online = true;
          updateLineGeometry(line);
        });
        setDirty("Selected lines changed");
      });
    });

    const bulkVariant = document.getElementById("bulkLineVariant");
    if (bulkVariant) {
      bulkVariant.addEventListener("change", (event) => {
        if (state.running) return;
        lines.forEach((line) => {
          line.variant = event.target.value;
        });
        setDirty("Selected line construction changed");
      });
    }

    const trip = document.getElementById("bulkTripLines");
    if (trip) trip.addEventListener("click", () => tripLines(lines));
    const reclose = document.getElementById("bulkRecloseLines");
    if (reclose) reclose.addEventListener("click", () => recloseLines(lines));

    const deleteInline = document.getElementById("deleteSelectedInline");
    if (deleteInline) deleteInline.addEventListener("click", removeSelection);
  }

  function formatFrequency(hz) {
    return `${hz.toFixed(2)} Hz`;
  }

  function flywheelFrequencyText(node) {
    if (!node.rotorSpinning) return "Offline";
    return formatFrequency(node.frequencyHz) + (node.rotorActive ? "" : " (coasting)");
  }

  function formatRpm(hz) {
    return `${(15 * hz).toFixed(1)} rpm`;
  }

  function flywheelControls(nodes) {
    const mass = commonValue(nodes, node => node.flywheelMass);
    const options = flywheels.map(model => `<option value="${model.mass}"${mass === model.mass ? " selected" : ""}>${model.mass.toLocaleString()} kg / ${model.radius} m</option>`).join("");
    return `<div class="field"><label for="flywheelModel">Rotor mass / radius</label>
      <select id="flywheelModel"${state.running ? " disabled" : ""}>${mass === "" ? '<option selected disabled>Mixed models</option>' : ""}${options}</select></div>`;
  }

  function bindFlywheelModel(nodes) {
    const select = document.getElementById("flywheelModel");
    if (!select) return;
    select.addEventListener("change", () => {
      if (state.running) return;
      for (const node of nodes) node.flywheelMass = flywheelModel(select.value).mass;
      setDirty("Flywheel model updated");
    });
  }

  function dispatchLimitKw(node) {
    return Math.floor(batteryRateKw(node) + 1e-8);
  }

  function dispatchPosition(mw, limitKw) {
    return Math.sign(mw) * Math.round(Math.min(1, Math.abs(mw) * 1000 / limitKw) * 50);
  }

  function sliderDispatchMw(position, limitKw) {
    return Math.sign(position) * Math.round(Math.abs(position) * limitKw / 50) / 1000;
  }

  function batteryCommandControls(nodes) {
    const limit = commonValue(nodes, n => batteryRateKw(n) / 1000);
    if (limit === "" || commonValue(nodes, batteryCapacityGJ) === "") {
      return '<div class="field">Dispatch requires matching capacity and max rate.</div>';
    }
    const value = commonValue(nodes, n => n.batterySetpointMw || 0);
    const position = dispatchPosition(value || 0, dispatchLimitKw(nodes[0]));
    return `<div class="field"><label for="batteryCommand">Dispatch (MW)</label>
      <input type="range" aria-label="Battery dispatch" aria-valuetext="${value === "" ? "Mixed" : value + " MW"}" id="batteryCommandSlider" min="-50" max="50" step="1" value="${position}">
      <div class="field-row"><small>Charge (&minus;)</small><small>Discharge (+)</small></div>
      <input type="number" id="batteryCommand" min="-${limit}" max="${limit}" step="0.001" value="${value}" placeholder="Mixed"></div>`;
  }

  function bindBatteryCommand(nodes) {
    const input = document.getElementById("batteryCommand");
    const slider = document.getElementById("batteryCommandSlider");
    if (!input || !slider) return;
    const commit = raw => {
      if (raw === "" || !Number.isFinite(Number(raw))) return;
      const limit = dispatchLimitKw(nodes[0]);
      const mw = clamp(Math.sign(raw) * Math.round(Math.abs(raw) * 1000), -limit, limit) / 1000;
      for (const node of nodes) node.batterySetpointMw = mw;
      input.value = mw;
      slider.value = dispatchPosition(mw, limit);
      slider.ariaValueText = mw + " MW";
      markOperatingEdit("Battery dispatch updated");
      renderProperties();
    };
    const sliderMw = () => sliderDispatchMw(Number(slider.value), dispatchLimitKw(nodes[0]));
    slider.addEventListener("input", () => {
      input.value = sliderMw();
      slider.ariaValueText = input.value + " MW";
    });
    slider.addEventListener("change", () => commit(sliderMw()));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); commit(input.value); }
    });
  }

  function renderNodeProperties(node) {
    const levels = activeLevels(node);
    const incident = incidentLines(node.id);
    const slider = node.type === "source" || node.type === "load";
    const sliderTitle = node.type === "source" ? "Output" : "Demand";
    const maxCap = slider ? nodePowerCapKw(node) : 0;
    const profile = normalizePowerProfile(node.powerProfile);
    const rangeMin = slider ? powerRangeMinimumKw(node) : 0;
    const rangeMax = slider ? powerRangeMaximumKw(node) : 0;
    const sliderMin = slider ? operatingPowerMinimumKw(node) : 0;
    const sliderMax = slider ? operatingPowerMaximumKw(node) : 0;
    const sliderFloor = slider ? powerRangeFloorKw(node) : 0;
    const sliderStep = powerStepForMax(rangeMax);
    const flowRows = incident.map((line) => flowRowHtml(line, node.id)).join("");
    const locked = state.running;
    const powerLocked = state.running && profile === "variable";

    propertiesEl.innerHTML = `
      <div class="prop-group">
        <h3>${escapeHtml(node.name)}</h3>
        <div class="field">
          <label for="nodeName">Name</label>
          <input id="nodeName" type="text" value="${escapeAttr(node.name)}"${locked ? " disabled" : ""}>
        </div>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Type</span><span class="readout-value">${labelType(node.type)}</span></div>
          ${node.type === "source" ? `<div class="readout-row"><span class="readout-label">Source type</span><span class="readout-value">${escapeHtml(sourceTypeLabel(node))}</span></div>` : ""}
          ${node.type === "source" && ["wind", "solar", "geothermal"].includes(node.sourceType) ? `<div class="readout-row"><span class="readout-label">Zone yield</span><span class="readout-value">${Math.round(sourceYieldFactor(node) * 100)}%</span></div>` : ""}
          ${node.type === "load" ? `<div class="readout-row"><span class="readout-label">Load type</span><span class="readout-value">${escapeHtml(loadTypeLabel(node))}</span></div>` : ""}
          <div class="readout-row"><span class="readout-label">Position</span><span class="readout-value">${Math.round(node.x)}, ${Math.round(node.y)} m</span></div>
        </div>
        ${node.type === "flywheel" ? `
          ${flywheelControls([node])}
          <div class="readout-list">
            <div class="readout-row"><span class="readout-label">Inertia</span><span class="readout-value">${flywheelModel(node.flywheelMass).inertia.toLocaleString()} kg&middot;m&sup2;</span></div>
            <div class="readout-row"><span class="readout-label">Frequency</span><span class="readout-value" id="rotorFrequency">${flywheelFrequencyText(node)}</span></div>
            <div class="readout-row"><span class="readout-label">8-pole rotor speed</span><span class="readout-value" id="mechanicalRpm">${formatRpm(node.rotorSpinning ? node.frequencyHz : 0)}</span></div>
            <div class="readout-row"><span class="readout-label">Flywheel power</span><span class="readout-value">${state.solved ? (node.effectivePowerKw > 0.05 ? "Supplying " : node.effectivePowerKw < -0.05 ? "Absorbing " : "") + formatKw(Math.abs(node.effectivePowerKw)) : "--"}</span></div>
          </div>` : ""}
        ${node.type === "joint" ? `
          <div class="field" style="margin-top: 13px;">
            <label for="nodeDisplay">Display</label>
            <input id="nodeDisplay" type="text" maxlength="2" value="${escapeAttr((node.display || "").slice(0, 2).toUpperCase())}"${locked ? " disabled" : ""}>
          </div>
        ` : ""}
      </div>
      ${slider ? `
        <div class="prop-group">
          <h3>${sliderTitle}</h3>
          <div class="field">
            <label>Runtime behavior</label>
            <div class="segmented">
              <button type="button" data-power-profile="constant" class="${profile === "constant" ? "active" : ""}"${locked || requiresVariableProfile(node) ? " disabled" : ""}>Constant</button>
              <button type="button" data-power-profile="variable" class="${profile === "variable" ? "active" : ""}"${locked || requiresVariableProfile(node) ? " disabled" : ""}>Variable</button>
            </div>
          </div>
          ${profile === "variable" ? `
            <div class="field">
              <div class="field-row">
                <label for="variabilityIndex">Frequency index</label>
                <span class="field-value" id="variabilityReadout">${variabilityIndex(node)}</span>
              </div>
              <input id="variabilityIndex" type="range" min="1" max="10" step="1" value="${variabilityIndex(node)}"${locked ? " disabled" : ""}>
            </div>
          ` : ""}
          <div class="field">
            <div class="field-row">
              <label for="minPowerNumber">Range minimum</label>
              <span class="field-value">${node.type === "source" ? "0 kW minimum" : "Above 0 kW"}</span>
            </div>
            <input id="minPowerNumber" type="number" min="${sliderFloor}" max="${Math.max(sliderFloor, rangeMax - 1)}" step="${sliderStep}" value="${rangeMin}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="maxPowerNumber">Range maximum</label>
              <span class="field-value">${formatKw(maxCap)} cap</span>
            </div>
            <input id="maxPowerNumber" type="number" min="${rangeMin + 1}" max="${maxCap}" step="${sliderStep}" value="${rangeMax}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="powerSlider">${powerLocked ? "Computer-controlled" : "Actual"} ${sliderTitle.toLowerCase()}</label>
              <span class="field-value" id="powerReadout">${formatKw(node.powerKw)}</span>
            </div>
            <input id="powerSlider" type="range" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${node.powerKw}"${powerLocked ? " disabled" : ""}>
            <input id="powerNumber" type="number" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${node.powerKw}"${powerLocked ? " disabled" : ""}>
          </div>
        </div>
      ` : ""}
      ${node.type === "battery" ? `
        <div class="prop-group">
          <h3>Battery</h3>
          ${batteryCommandControls([node])}
          <div class="field">
            <div class="field-row">
              <label for="batteryCapacityGJ">Capacity</label>
              <span class="field-value">10-1,000 GJ</span>
            </div>
            <input id="batteryCapacityGJ" type="number" min="10" max="1000" step="10" value="${batteryCapacityGJ(node)}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="batteryRateMw">Battery max rate</label>
              <span class="field-value">1-40 MW</span>
            </div>
            <input id="batteryRateMw" type="number" min="1" max="40" step="1" value="${batteryRateKw(node) / 1000}"${locked ? " disabled" : ""}>
          </div>
          <div class="field">
            <div class="field-row">
              <label for="batteryEnergyGJ">Current reserve</label>
              <span class="field-value">GJ stored</span>
            </div>
            <input id="batteryEnergyGJ" type="number" min="0" max="${batteryCapacityGJ(node)}" step="0.0001" value="${editableDecimal(batteryEnergyGJ(node), 4)}"${locked ? " disabled" : ""}>
          </div>
          <div class="readout-list">
            <div class="readout-row"><span class="readout-label">Reserve</span><span class="readout-value" id="batteryReserveReadout">${formatGJ(batteryEnergyGJ(node), 4)} / ${formatGJ(batteryCapacityGJ(node))}</span></div>
            <div class="readout-row"><span class="readout-label">State of charge</span><span class="readout-value" id="batterySocReadout">${formatPercent(batteryReserveFraction(node))}</span></div>
          </div>
        </div>
      ` : ""}
      ${node.type === "joint" ? `
        <div class="prop-group">
          <h3>Transformer</h3>
          <div class="field">
            <div class="field-row">
              <label for="substationMaxStepMw">Maximum stepped power</label>
              <span class="field-value">1-80 MW</span>
            </div>
            <input id="substationMaxStepMw" type="number" min="1" max="80" step="0.1" value="${editableDecimal(substationMaxStepKw(node) / 1000, 3)}"${locked ? " disabled" : ""}>
          </div>
          <div class="readout-list">
            <div class="readout-row"><span class="readout-label">Stepped power</span><span class="readout-value">${state.solved ? formatMwFromKw(node.steppedPowerKw) : "--"}</span></div>
            <div class="readout-row"><span class="readout-label">Utilization</span><span class="readout-value">${state.solved ? formatPercent(node.steppedPowerKw / substationMaxStepKw(node)) : "--"}</span></div>
          </div>
        </div>
      ` : ""}
      <div class="prop-group">
        <h3>Run Readout</h3>
        <div class="readout-list">
          ${levels.distribution ? `<div class="readout-row"><span class="readout-label">10 kV bus</span><span class="readout-value">${state.solved ? formatVoltage(node, "distribution") : "--"}</span></div>` : ""}
          ${levels.transmission ? `<div class="readout-row"><span class="readout-label">100 kV bus</span><span class="readout-value">${state.solved ? formatVoltage(node, "transmission") : "--"}</span></div>` : ""}
          ${node.type === "battery" ? `<div class="readout-row"><span class="readout-label">Battery power</span><span class="readout-value" id="runtimeBatteryPower">${batteryText(node)}</span></div>` : ""}
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
        <button class="mini-button" type="button" id="pasteNodeInline"${state.nodeClipboard && !locked ? "" : " disabled"}>Paste</button>
        <button class="mini-button danger" type="button" id="deleteSelectedInline"${locked ? " disabled" : ""}>Delete</button>
      </div>
    `;

    bindFlywheelModel([node]);
    if (node.type === "battery") bindBatteryCommand([node]);
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

    const substationMaxStepInput = document.getElementById("substationMaxStepMw");
    if (substationMaxStepInput) {
      const commitSubstationRating = () => {
        if (state.running) return;
        const enteredMw = Number(substationMaxStepInput.value);
        node.maxStepPowerKw = clamp(
          Number.isFinite(enteredMw) ? Math.round(enteredMw * 1000) : DEFAULT_SUBSTATION_MAX_STEP_KW,
          MIN_SUBSTATION_MAX_STEP_KW,
          SUBSTATION_MAX_STEP_KW
        );
        markOperatingEdit(`${node.name} transformer rating updated`);
        renderProperties();
      };
      substationMaxStepInput.addEventListener("change", commitSubstationRating);
      substationMaxStepInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commitSubstationRating();
      });
    }

    if (slider) {
      const range = document.getElementById("powerSlider");
      const number = document.getElementById("powerNumber");
      const minNumber = document.getElementById("minPowerNumber");
      const maxNumber = document.getElementById("maxPowerNumber");
      const readout = document.getElementById("powerReadout");
      propertiesEl.querySelectorAll("[data-power-profile]").forEach((button) => {
        button.addEventListener("click", () => {
          if (state.running || (button.dataset.powerProfile === "constant" && requiresVariableProfile(node))) return;
          node.powerProfile = button.dataset.powerProfile;
          ensureVariationState(node);
          node.powerKw = clampNodePower(node, node.powerKw);
          markOperatingEdit(`${node.name} runtime behavior updated`);
          renderProperties();
        });
      });
      const variability = document.getElementById("variabilityIndex");
      if (variability) {
        variability.addEventListener("input", (event) => {
          if (state.running) return;
          node.variabilityIndex = clamp(Math.round(Number(event.target.value) || DEFAULT_VARIABILITY_INDEX), 1, 10);
          const variabilityReadout = document.getElementById("variabilityReadout");
          if (variabilityReadout) variabilityReadout.textContent = String(node.variabilityIndex);
          markOperatingEdit(`${node.name} frequency index updated`);
        });
      }
      const setPowerControlScale = (max) => {
        const step = powerStepForMax(max);
        range.step = step;
        number.step = step;
        minNumber.step = step;
        maxNumber.step = step;
      };
      const updatePower = (value) => {
        const next = clampNodePower(node, value);
        node.powerKw = next;
        range.value = next;
        number.value = next;
        readout.textContent = formatKw(next);
        if (state.running) {
          state.simulationNeedsSolve = true;
          runSimulationStep({ advanceSeconds: 0, allowTrips: true, renderProperties: false });
          return;
        }
        state.dirty = true;
        state.solved = false;
        state.simulationNeedsSolve = true;
        state.elapsedSeconds = 0;
        resetVariableProfileDrift();
        resetSolution();
        updateTimeReadout();
        updateSummaries();
        draw();
      };
      range.addEventListener("input", (event) => updatePower(event.target.value));
      number.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        updatePower(event.target.value);
      });
      const commitRange = (side) => {
        if (state.running) return;
        if (side === "min") setNodePowerRange(node, minNumber.value, node.maxPowerKw, "min");
        else setNodePowerRange(node, node.minPowerKw, maxNumber.value, "max");
        setPowerControlScale(node.maxPowerKw);
        markOperatingEdit(`${node.name} range ${side === "min" ? "minimum" : "maximum"} updated`);
        renderProperties();
      };
      [
        [minNumber, "min"],
        [maxNumber, "max"]
      ].forEach(([input, side]) => {
        input.addEventListener("change", () => commitRange(side));
        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitRange(side);
        });
      });
    }

    const batteryCapacityInput = document.getElementById("batteryCapacityGJ");
    const batteryRateInput = document.getElementById("batteryRateMw");
    const batteryEnergyInput = document.getElementById("batteryEnergyGJ");
    const syncBatteryReadouts = (syncEnergyInput = true) => {
      const reserve = document.getElementById("batteryReserveReadout");
      const soc = document.getElementById("batterySocReadout");
      const energy = document.getElementById("batteryEnergyGJ");
      if (energy && syncEnergyInput) {
        energy.max = batteryCapacityGJ(node);
        energy.value = editableDecimal(batteryEnergyGJ(node), 4);
      }
      if (reserve) reserve.textContent = `${formatGJ(batteryEnergyGJ(node), 4)} / ${formatGJ(batteryCapacityGJ(node))}`;
      if (soc) soc.textContent = formatPercent(batteryReserveFraction(node));
    };
    if (batteryCapacityInput) {
      batteryCapacityInput.addEventListener("input", (event) => {
        if (state.running) return;
        const oldCapacity = batteryCapacityGJ(node);
        const fill = oldCapacity > 0 ? batteryEnergyGJ(node) / oldCapacity : 0.5;
        const nextCapacity = clamp(Number(event.target.value) || 10, 10, 1000);
        node.batteryCapacityGJ = nextCapacity;
        node.batteryEnergyGJ = roundTo(clamp(nextCapacity * fill, 0, nextCapacity), 4);
        state.dirty = true;
        state.solved = false;
        state.simulationNeedsSolve = true;
        state.elapsedSeconds = 0;
        resetVariableProfileDrift();
        resetSolution();
        syncBatteryReadouts();
        updateTimeReadout();
        updateSummaries();
        draw();
      });
    }
    if (batteryRateInput) {
      batteryRateInput.addEventListener("change", (event) => {
        if (state.running) return;
        node.batteryRateMw = clamp(Number(event.target.value) || 1, 1, 40);
        node.batterySetpointMw = clamp(node.batterySetpointMw || 0, -node.batteryRateMw, node.batteryRateMw);
        state.dirty = true;
        state.solved = false;
        state.simulationNeedsSolve = true;
        state.elapsedSeconds = 0;
        resetVariableProfileDrift();
        resetSolution();
        syncBatteryReadouts();
        updateTimeReadout();
        updateSummaries();
        draw();
      });
    }
    if (batteryRateInput) batteryRateInput.addEventListener("change", renderProperties);
    if (batteryEnergyInput) {
      batteryEnergyInput.addEventListener("input", (event) => {
        if (state.running) return;
        node.batteryEnergyGJ = roundTo(clamp(Number(event.target.value) || 0, 0, batteryCapacityGJ(node)), 4);
        state.dirty = true;
        state.solved = false;
        state.simulationNeedsSolve = true;
        state.elapsedSeconds = 0;
        resetVariableProfileDrift();
        resetSolution();
        syncBatteryReadouts(false);
        updateTimeReadout();
        updateSummaries();
        draw();
      });
      batteryEnergyInput.addEventListener("change", (event) => {
        event.target.value = editableDecimal(batteryEnergyGJ(node), 4);
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
    if (!from || !to) {
      propertiesEl.innerHTML = `
        <div class="prop-group">
          <h3>${escapeHtml(line.id)}</h3>
          <p class="empty-note">This line has a missing endpoint and was skipped by the solver.</p>
        </div>
        <div class="field-row">
          <button class="mini-button danger" type="button" id="deleteSelectedInline"${state.running ? " disabled" : ""}>Delete</button>
        </div>
      `;
      document.getElementById("deleteSelectedInline").addEventListener("click", removeSelection);
      return;
    }
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
          <button type="button" data-inspector-line-type="distribution" class="${line.type === "distribution" ? "active" : ""}"${state.running ? " disabled" : ""}>10 kV</button>
          <button type="button" data-inspector-line-type="transmission" class="${line.type === "transmission" ? "active" : ""}"${state.running ? " disabled" : ""}>100 kV</button>
        </div>
      </div>
      <div class="prop-group">
        <h3>Construction</h3>
        <div class="field">
          <label for="lineVariant">Wire set</label>
          <select id="lineVariant"${state.running ? " disabled" : ""}>${lineVariantOptions(line.variant)}</select>
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
          <button class="mini-button danger" type="button" id="deleteSelectedInline"${state.running ? " disabled" : ""}>Delete</button>
        </div>
      </div>
    `;

    propertiesEl.querySelectorAll("[data-inspector-line-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running) return;
        const nextType = button.dataset.inspectorLineType;
        if (line.type === nextType) return;
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
      if (state.running) return;
      line.variant = event.target.value;
      setDirty(`${line.id} construction changed`);
    });

    document.getElementById("tripLine").addEventListener("click", () => {
      if (!line.tripped) {
        tripLines([line], `${line.id} tripped manually`);
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
        <h3>Totals</h3>
        <div class="readout-list">
          <div class="readout-row"><span class="readout-label">Nodes</span><span class="readout-value">${state.nodes.length}</span></div>
          <div class="readout-row"><span class="readout-label">Lines</span><span class="readout-value">${state.lines.length}</span></div>
          <div class="readout-row"><span class="readout-label">Sources</span><span class="readout-value">${formatKw(totals.sourceKw)}</span></div>
          <div class="readout-row"><span class="readout-label">Loads</span><span class="readout-value">${formatKw(totals.loadKw)}</span></div>
          <div class="readout-row"><span class="readout-label">Battery net</span><span class="readout-value">${state.solved ? formatSignedKw(totals.batteryKw) : "--"}</span></div>
          <div class="readout-row"><span class="readout-label">Battery reserve</span><span class="readout-value" id="overviewBatteryReserve">${formatGJ(totals.batteryEnergyGJ)} / ${formatGJ(totals.batteryCapacityGJ)}</span></div>
          <div class="readout-row"><span class="readout-label">Battery max rate</span><span class="readout-value">${formatMwFromKw(totals.batteryRateKw)}</span></div>
          <div class="readout-row"><span class="readout-label">Line losses</span><span class="readout-value">${state.solved ? formatKw(totals.lossKw) : "--"}</span></div>
        </div>
      </div>
      <div class="prop-group">
        <h3>Warnings</h3>
        <div class="warning-list">${warnings || `<p class="empty-note">No warnings.</p>`}</div>
      </div>
    `;
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
      flywheel: "Flywheel",
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
      batteryEnergyGJ: state.nodes.filter((node) => node.type === "battery").reduce((sum, node) => sum + batteryEnergyGJ(node), 0),
      batteryCapacityGJ: state.nodes.filter((node) => node.type === "battery").reduce((sum, node) => sum + batteryCapacityGJ(node), 0),
      batteryRateKw: state.nodes.filter((node) => node.type === "battery").reduce((sum, node) => sum + batteryRateKw(node), 0),
      totalInertia: state.nodes.reduce((sum, node) => node.type === "flywheel" ? sum + flywheelModel(node.flywheelMass).inertia : sum, 0),
      lossKw: state.lines.reduce((sum, line) => sum + line.lossKw, 0)
    };
  }

  function updateFrequencyReadout() {
    let low = Infinity, high = -Infinity;
    const includeHz = hz => { low = Math.min(low, hz); high = Math.max(high, hz); };
    if (state.solved && cachedSimulationGraph) cachedSimulationGraph.rotatingIslands.forEach(island => { if (island.active) includeHz(island.hz); });
    frequencyReadout.textContent = low === Infinity ? "No active flywheel" : high - low < 0.005 ? formatFrequency(low) : `${low.toFixed(2)} - ${formatFrequency(high)}`;
    frequencyReadout.classList.toggle("warning", low < 59.5 || high > 60.5);
  }

  function sampleFrequencyHistory() {
    const t = state.elapsedSeconds;
    if (frequencyHistory.at(-1)?.t === t) frequencyHistory.pop();
    while (frequencyHistory.length && frequencyHistory[0].t < t - 60) frequencyHistory.shift();
    frequencyHistory.push({ t, readings: cachedSimulationGraph.rotatingIslands.filter(i => i.active)
      .map(i => ({ key: i.traceKey, island: i.index, hz: i.hz, slope: i.slope })) });
    renderFrequencyHistory();
  }

  function renderFrequencyHistory() {
    const series = new Map(), now = frequencyHistory.at(-1)?.t ?? 0;
    for (const { t, readings } of frequencyHistory) {
      for (const r of readings) {
        let s = series.get(r.key);
        if (!s) {
          if (!traceStyles.has(r.key)) {
            const used = new Set(traceStyles.values());
            traceStyles.set(r.key, traceColors.find(c => !used.has(c)) || `hsl(${hashText32(r.key) % 360} 55% 38%)`);
          }
          s = { path: "", color: traceStyles.get(r.key) };
          series.set(r.key, s);
        }
        s.x = (275 - (now - t) * 242 / 60).toFixed(1);
        s.y = (38 - (r.hz - 60) * 28).toFixed(2);
        s.path += (s.last === t - 1 ? "L" : "M") + s.x + " " + s.y;
        s.last = t;
        s.reading = r;
      }
    }
    const traces = [], labels = [];
    for (const key of traceStyles.keys()) if (!series.has(key)) traceStyles.delete(key);
    for (const s of series.values()) {
      const r = s.reading;
      traces.push(`<path d="${s.path}" fill="none" stroke="${s.color}" stroke-width="1.6"/><circle cx="${s.x}" cy="${s.y}" r="2" fill="${s.color}"/>`);
      labels.push(`<span style="border-color:${s.color}">Island ${r.island} &middot; ${s.last === now ? formatFrequency(r.hz) + " &middot; RoCoF " + (r.slope > 0 ? "+" : "") + r.slope.toFixed(3) + " Hz/s" : "past trace"}</span>`);
    }
    document.getElementById("frequencyTraces").innerHTML = traces.join("");
    document.getElementById("frequencyLegend").innerHTML = labels.join("") || "No active flywheel";
  }

  let networkStatus = "", batteryCapacityText = "", batteryRateText = "";
  function updateReserveSummary(energy) {
    const reserve = `${formatGJ(energy)} / ${batteryCapacityText}`;
    const summary = `${networkStatus}, battery ${reserve}, max rate ${batteryRateText}`;
    if (networkSummary.textContent !== summary) networkSummary.textContent = summary;
    const overview = document.getElementById("overviewBatteryReserve");
    if (overview && overview.textContent !== reserve) overview.textContent = reserve;
  }

  function updateSummaries() {
    updateFrequencyReadout();
    const liveLines = state.lines.filter((line) => line.online && !line.tripped).length;
    const trippedLines = state.lines.filter((line) => line.tripped).length;
    const totals = computeTotals();
    networkStatus = `${state.nodes.length} nodes, ${state.lines.length} lines, ${liveLines} in service`;
    if (trippedLines) networkStatus += `, ${trippedLines} tripped`;
    networkStatus += `, total inertia ${totals.totalInertia.toLocaleString()} kg·m²`;
    if (totals.batteryCapacityGJ > 0) {
      batteryCapacityText = formatGJ(totals.batteryCapacityGJ);
      batteryRateText = formatMwFromKw(totals.batteryRateKw);
      updateReserveSummary(totals.batteryEnergyGJ);
    } else networkSummary.textContent = networkStatus;

    const message = state.errors[0] || state.warnings[0] || "No warnings";
    warningSummary.textContent = message;
    warningSummary.classList.toggle("danger", Boolean(state.errors.length || state.lastTripCount));
    warningSummary.classList.toggle("warn", Boolean(state.warnings.length && !state.errors.length && !state.lastTripCount));

    solveBadge.textContent = state.running ? "Run mode" : "Edit mode";
    solveBadge.className = state.errors.length ? "danger" : state.warnings.length || state.lastTripCount ? "warn" : state.running ? "ok" : "";
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

  function normalizeNode(node, fallbackId) {
    const source = node && typeof node === "object" ? node : {};
    source.type = normalizeNodeType(source.type ?? source.node_type ?? source.nodeType, source);
    if (source.type === "flywheel") {
      source.rotorActive = source.rotorActive === true;
      source.flywheelMass = flywheelModel(source.flywheelMass).mass;
      source.frequencyHz = clamp(finiteOr(source.frequencyHz ?? 60, 60), 59, 61);
      source.rotorSpinning = source.rotorActive || (source.rotorSpinning == null
        ? source.frequencyHz !== 60 : source.rotorSpinning === true);
      source.frequencyRelay = ["high", "low"].includes(source.frequencyRelay) ? source.frequencyRelay : "normal";
    }
    source.id = normalizeId(source.id ?? source.node_id ?? source.nodeId, fallbackId || `N${state.nextNodeId}`);
    source.name = nonEmptyText(source.name ?? source.label ?? source.title, `${labelType(source.type)} ${source.id}`);
    source.x = finiteOr(source.x ?? source.left ?? source.worldX, 0);
    source.y = finiteOr(source.y ?? source.top ?? source.worldY, 0);
    source.voltage = finiteOr(source.voltage, BASE_VOLTAGE);
    source.effectivePowerKw = finiteOr(source.effectivePowerKw, 0);
    source.batteryPowerKw = finiteOr(source.batteryPowerKw, 0);
    source.lineNetKw = finiteOr(source.lineNetKw, 0);
    source.curtailedKw = finiteOr(source.curtailedKw, 0);
    source.unservedKw = finiteOr(source.unservedKw, 0);
    source.island = finiteOr(source.island, 0);

    const maxStepPowerKw = firstFinite(
      source.maxStepPowerKw,
      source.maximumStepPowerKw,
      source.transformerRatingKw,
      source.substationCapacityKw,
      source.maxTransferKw
    );
    source.maxStepPowerKw = source.type === "joint"
      ? clamp(maxStepPowerKw ?? DEFAULT_SUBSTATION_MAX_STEP_KW, MIN_SUBSTATION_MAX_STEP_KW, SUBSTATION_MAX_STEP_KW)
      : 0;
    source.steppedPowerKw = source.type === "joint" ? Math.max(0, finiteOr(source.steppedPowerKw, 0)) : 0;

    if (source.type === "joint") {
      source.display = nonEmptyText(source.display ?? source.shortName ?? source.code, source.name.slice(0, 2)).slice(0, 2).toUpperCase();
    } else {
      source.display = "";
    }

    const profileValue = source.powerProfile ?? source.runtimeBehavior ?? source.runtimeProfile ?? source.controlMode ?? source.variable;
    source.powerProfile = ["source", "load"].includes(source.type) ? normalizePowerProfile(profileValue) : "constant";
    source.sourceType = source.type === "source"
      ? normalizeSourceType(source.sourceType ?? source.sourceKind ?? source.generatorType ?? source.generationType, source)
      : "";
    source.sourceRotation = source.type === "source" && normalizeKey(source.sourceType) === "hydro" && Number(source.sourceRotation ?? source.rotation) === 90 ? 90 : 0;
    source.loadType = source.type === "load"
      ? normalizeLoadType(source.loadType ?? source.loadKind ?? source.demandType ?? source.category, source)
      : "";
    source.loadRotation = source.type === "load" && Number(source.loadRotation ?? source.rotation) === 90 ? 90 : 0;
    const frequency = firstFinite(source.variabilityIndex, source.frequencyIndex, source.variationFrequency, source.frequency);
    source.variabilityIndex = clamp(Math.round(frequency ?? DEFAULT_VARIABILITY_INDEX), 1, 10);
    const phase = firstFinite(source.variationPhase, source.variablePhase, source.cyclePhase);
    source.variationPhase = ((phase ?? Math.random() * TWO_PI) % TWO_PI + TWO_PI) % TWO_PI;
    source.variationDeviation = clamp(firstFinite(source.variationDeviation, source.cycleDeviation) ?? 0, -0.28, 0.28);
    source.variationDeviationTrend = clamp(firstFinite(source.variationDeviationTrend, source.cycleDeviationTrend) ?? (Math.random() - 0.5) * 0.02, -0.035, 0.035);

    if (source.type === "source") {
      if (requiresVariableProfile(source)) source.powerProfile = "variable";
      else if (profileValue == null) source.powerProfile = sourceConfig(source).profile || "constant";
      if (frequency == null) source.variabilityIndex = sourceConfig(source).frequency;
      const power = firstFinite(source.powerKw, source.actualPowerKw, source.outputKw, source.powerOutputKw, source.power_output_kw, source.generationKw, source.generatedKw);
      const minKw = firstFinite(source.minPowerKw, source.minimumPowerKw, source.minKw, source.minimumKw, source.rangeMinKw);
      const maxKw = firstFinite(source.maxPowerKw, source.maximumPowerKw, source.maxKw, source.capacityKw, source.ratingKw, source.powerRatingKw);
      const config = sourceConfig(source);
      source.maxPowerKw = clamp(maxKw ?? Math.max(power ?? 0, config.defaultMaxKw), 1, config.capKw);
      source.minPowerKw = minKw ?? (source.powerProfile === "variable" ? Math.max(0, source.maxPowerKw * 0.2) : 0);
      setNodePowerRange(source, source.minPowerKw, source.maxPowerKw);
      source.powerKw = clampNodePower(source, power ?? 0);
      source.batteryCapacityGJ = 0;
      source.batteryEnergyGJ = 0;
      source.batteryRateMw = 0;
    } else if (source.type === "load") {
      const power = firstFinite(source.powerKw, source.actualPowerKw, source.demandKw, source.powerDemandKw, source.power_demand_kw, source.loadKw, source.drawKw);
      const minKw = firstFinite(source.minPowerKw, source.minimumPowerKw, source.minKw, source.minimumKw, source.rangeMinKw);
      const maxKw = firstFinite(source.maxPowerKw, source.maximumPowerKw, source.maxKw, source.capacityKw, source.ratingKw, source.powerRatingKw);
      const config = loadConfig(source);
      source.maxPowerKw = clamp(maxKw ?? Math.max(power ?? 0, config.defaultMaxKw), MIN_POWER_KW + 1, config.capKw);
      source.minPowerKw = minKw ?? (source.powerProfile === "variable" ? Math.max(MIN_POWER_KW, source.maxPowerKw * 0.2) : MIN_POWER_KW);
      setNodePowerRange(source, source.minPowerKw, source.maxPowerKw);
      source.powerKw = clampNodePower(source, power ?? 0);
      source.batteryCapacityGJ = 0;
      source.batteryEnergyGJ = 0;
      source.batteryRateMw = 0;
    } else if (source.type === "battery") {
      const capacity = firstFinite(source.batteryCapacityGJ, source.capacityGJ, source.capacity_gj);
      source.batteryCapacityGJ = clamp(capacity ?? DEFAULT_BATTERY_CAPACITY_GJ, 10, 1000);
      const energy = firstFinite(source.batteryEnergyGJ, source.energyGJ, source.energy_gj, source.storedEnergyGJ, source.reserveGJ);
      source.batteryEnergyGJ = clamp(energy ?? source.batteryCapacityGJ / 2, 0, source.batteryCapacityGJ);
      const rateMw = firstFinite(source.batteryRateMw, source.rateMw, source.chargeRateMw, source.dischargeRateMw, source.chargeDischargeRateMw, source.charge_rate_mw);
      const rateKw = firstFinite(source.batteryRateKw, source.rateKw, source.chargeRateKw, source.dischargeRateKw, source.charge_rate_kw);
      source.batteryRateMw = clamp(rateMw ?? (rateKw != null ? rateKw / 1000 : DEFAULT_BATTERY_RATE_MW), 1, 40);
      source.batterySetpointMw = clamp(finiteOr(source.batterySetpointMw ?? source.batteryPowerKw / 1000, 0), -source.batteryRateMw, source.batteryRateMw);
      source.batteryRotation = Number(source.batteryRotation) === 90 ? 90 : 0;
      source.minPowerKw = 0;
      source.maxPowerKw = 0;
      source.powerKw = 0;
    } else {
      source.minPowerKw = 0;
      source.maxPowerKw = finiteOr(source.maxPowerKw, 0);
      source.powerKw = finiteOr(source.powerKw, 0);
      source.batteryCapacityGJ = 0;
      source.batteryEnergyGJ = 0;
      source.batteryRateMw = 0;
    }
    return source;
  }

  function normalizeLine(line, fallbackId) {
    const source = line && typeof line === "object" ? line : {};
    source.id = normalizeId(source.id ?? source.line_id ?? source.lineId, fallbackId || `L${state.nextLineId}`);
    source.from = normalizeId(source.from ?? source.node1_id ?? source.node1Id ?? source.node1 ?? source.a ?? source.start ?? source.startNodeId, "");
    source.to = normalizeId(source.to ?? source.node2_id ?? source.node2Id ?? source.node2 ?? source.b ?? source.end ?? source.endNodeId, "");
    source.type = normalizeLineType(source.lineType ?? source.line_type ?? source.type);
    source.variant = normalizeLineVariant(source);
    const status = normalizeKey(source.status ?? source.state);
    source.tripped = normalizeBoolean(source.tripped, false) || status === "tripped";
    source.online = normalizeBoolean(source.online ?? source.inService ?? source.enabled, true) && !source.tripped;
    source.currentA = finiteOr(source.currentA, 0);
    source.powerKw = finiteOr(source.powerKw, 0);
    source.fromPowerKw = finiteOr(source.fromPowerKw, 0);
    source.toPowerKw = finiteOr(source.toPowerKw, 0);
    source.lossKw = finiteOr(source.lossKw, 0);
    source.lengthM = finiteOr(source.lengthM ?? source.length, 0);
    source.resistance = finiteOr(source.resistance, 0);
    source.island = finiteOr(source.island, 0);
    return source;
  }

  function serializeGrid() {
    return {
      version: 8,
      worldSeed: world.seed,
      worldGeneratorVersion: world.generatorVersion,
      world: {
        seed: world.seed,
        generatorVersion: world.generatorVersion,
        generatorSignature: world.generatorSignature
      },
      nodes: state.nodes.map((node) => ({ ...node })),
      lines: state.lines.map((line) => ({ ...line })),
      nextNodeId: state.nextNodeId,
      nextLineId: state.nextLineId,
      elapsedSeconds: state.elapsedSeconds,
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
      link.download = `gridbox-${new Date().toISOString().slice(0, 10)}.json`;
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

  function collectionItems(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).map(([id, item]) => {
      if (item && typeof item === "object") return { id, ...item };
      return { id };
    });
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (!value || typeof value !== "object") return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }

  function hashText32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function deterministicLegacyWorldSeed(data) {
    return hashText32(canonicalJson({
      nodes: data.nodes ?? data.grid?.nodes ?? [],
      lines: data.lines ?? data.grid?.lines ?? []
    }));
  }

  function firstPresentFinite() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];
      if (value == null || value === "") continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return undefined;
  }

  function importedWorldDescriptor(data) {
    const nested = data.world && typeof data.world === "object" ? data.world : {};
    const seed = firstPresentFinite(
      nested.seed,
      nested.worldSeed,
      data.worldSeed,
      data.terrainSeed,
      data.mapSeed,
      data.seed
    );
    const generatorVersion = firstPresentFinite(
      nested.generatorVersion,
      data.worldGeneratorVersion,
      nested.generator,
      data.generatorVersion,
      data.worldVersion
    );
    return {
      seed: seed == null ? deterministicLegacyWorldSeed(data) : Math.floor(seed) >>> 0,
      // Seed-only saves originated with generator 1, independently of the app save version.
      generatorVersion: generatorVersion == null ? 1 : Math.floor(generatorVersion),
      generatorSignature: nested.generatorSignature ?? data.worldGeneratorSignature ?? "",
      inferredSeed: seed == null
    };
  }

  function importGridText(raw, status = "Grid imported") {
    try {
      stopSimulation("", false);
      const data = JSON.parse(raw.trimStart());
      const worldDescriptor = importedWorldDescriptor(data);
      resetWorld(worldDescriptor.seed, worldDescriptor.generatorVersion, worldDescriptor.generatorSignature);
      const usedNodeIds = new Set();
      const importedMass = mass => Number(data.version) === 7
        ? ({ 5000: 8000, 6000: 12000, 8000: 16000, 10000: 20000 })[mass] || mass : mass;
      state.nodes = collectionItems(data.nodes).map((node, index) => {
        if (node?.type === "flywheel") node.flywheelMass = importedMass(node.flywheelMass);
        const normalized = normalizeNode(node, `N${index + 1}`);
        const baseId = normalizeId(normalized.id, `N${index + 1}`);
        let nextId = baseId;
        let suffix = 2;
        while (usedNodeIds.has(nextId)) {
          nextId = `${baseId}-${suffix}`;
          suffix += 1;
        }
        normalized.id = nextId;
        usedNodeIds.add(nextId);
        return normalized;
      });
      const nodeIds = new Set(state.nodes.map((node) => node.id));
      let skippedLines = 0;
      state.lines = collectionItems(data.lines)
        .map((line, index) => normalizeLine(line, `L${index + 1}`))
        .filter((line) => {
          const valid = line.from !== line.to && nodeIds.has(line.from) && nodeIds.has(line.to)
            && (line.type !== "transmission" || (getNode(line.from).type !== "flywheel" && getNode(line.to).type !== "flywheel"));
          if (!valid) skippedLines += 1;
          return valid;
        });
      state.lines.forEach(updateLineGeometry);
      state.nextNodeId = Math.max(Number(data.nextNodeId) || 0, inferNextId(state.nodes, "N"));
      state.nextLineId = Math.max(Number(data.nextLineId) || 0, inferNextId(state.lines, "L"));
      state.elapsedSeconds = Math.max(0, Math.floor(Number(data.elapsedSeconds) || 0));
      resetVariableProfileDrift();
      if (data.placement) {
        state.placement.flywheelMass = flywheelModel(importedMass(data.placement.flywheelMass)).mass;
        state.placement.batteryRotation = Number(data.placement.batteryRotation) === 90 ? 90 : 0;
        state.placement.sourceType = SOURCE_TYPES[data.placement.sourceType] && data.placement.sourceType !== "generic" ? data.placement.sourceType : "wind";
        state.placement.sourceRotation = Number(data.placement.sourceRotation) === 90 ? 90 : 0;
        state.placement.loadType = LOAD_TYPES[data.placement.loadType] ? data.placement.loadType : "general";
        state.placement.loadRotation = Number(data.placement.loadRotation) === 90 ? 90 : 0;
        state.placement.jointType = ["joint", "pole", "tower"].includes(data.placement.jointType) ? data.placement.jointType : "joint";
        state.placement.distributionVariant = LINE_VARIANTS[data.placement.distributionVariant] ? data.placement.distributionVariant : DEFAULT_LINE_VARIANT;
        state.placement.transmissionVariant = LINE_VARIANTS[data.placement.transmissionVariant] ? data.placement.transmissionVariant : DEFAULT_LINE_VARIANT;
      }
      state.camera = normalizeCamera(data.camera);
      backgroundLayerValid = false;
      loadFillCache.clear();
      invalidateSimulationGraph();
      clearSelection(false);
      state.connecting = null;
      state.nodeClipboard = null;
      state.dirty = true;
      state.solved = false;
      state.simulationNeedsSolve = true;
      state.warnings = [];
      if (skippedLines) state.warnings.push(`Skipped ${skippedLines} line${skippedLines === 1 ? "" : "s"} with invalid endpoints.`);
      if (worldDescriptor.inferredSeed) {
        state.warnings.push("This legacy grid had no world seed. GRIDBOX assigned repeatable geography; export it again to lock the world descriptor.");
      }
      state.errors = [];
      resetSolution();
      setMode("select");
      state.lastTripCount = 0;
      setCanvasStatus(status);
      updateTimeReadout();
      renderAll();
    } catch (error) {
      const message = error instanceof Error && /world generator|world-generation/.test(error.message)
        ? error.message
        : "Grid file could not be imported.";
      state.errors = [message];
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
    importGridText(window.GridboxDemo, "Demo loaded");
  }

  function clearNetwork() {
    stopSimulation("", false);
    resetWorld();
    state.nodes = [];
    state.lines = [];
    clearSelection(false);
    state.connecting = null;
    state.nodeClipboard = null;
    state.nextNodeId = 1;
    state.nextLineId = 1;
    state.camera = { x: canvas.getBoundingClientRect().width / 2, y: canvas.getBoundingClientRect().height / 2, scale: 1 };
    backgroundLayerValid = false;
    loadFillCache.clear();
    invalidateSimulationGraph();
    state.elapsedSeconds = 0;
    resetVariableProfileDrift();
    state.dirty = true;
    state.solved = false;
    state.simulationNeedsSolve = true;
    state.warnings = [];
    state.errors = [];
    setMode("select");
    setCanvasStatus("Cleared");
    resetSolution();
    updateTimeReadout();
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
    const choices = document.getElementById("flywheelChoices");
    choices.innerHTML = flywheels.map(model =>
      `<button type="button" class="picker-option flywheel-choice" data-flywheel-mass="${model.mass}"
        title="${model.inertia.toLocaleString()} kg m²; ${model.rate.toFixed(3)} Hz/s per MW"><strong>${model.mass.toLocaleString()} kg</strong><small>${model.radius} m radius</small></button>`
    ).join("");
    choices.addEventListener("click", event => {
      const button = event.target.closest("[data-flywheel-mass]");
      if (!button || state.running) return;
      state.placement.flywheelMass = Number(button.dataset.flywheelMass);
      setMode("flywheel");
    });
    document.querySelectorAll(".tool-button[data-mode]:not([data-picker-trigger]):not([data-joint-type])").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    document.querySelectorAll("[data-joint-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running) return;
        state.placement.jointType = button.dataset.jointType;
        setMode("joint");
      });
    });
    document.querySelectorAll("[data-picker-trigger]").forEach((button) => {
      button.addEventListener("click", () => openPlacementPicker(button.dataset.pickerTrigger));
    });
    document.querySelectorAll("[data-picker-panel] [data-source-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running || !SOURCE_TYPES[button.dataset.sourceType]) return;
        state.placement.sourceType = button.dataset.sourceType;
        setMode("source");
      });
    });
    document.querySelectorAll("[data-picker-panel] [data-load-type]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running || !LOAD_TYPES[button.dataset.loadType]) return;
        state.placement.loadType = button.dataset.loadType;
        setMode("load");
      });
    });
    document.querySelectorAll("[data-picker-panel] [data-line-variant]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.running || !LINE_VARIANTS[button.dataset.lineVariant]) return;
        const transmission = button.dataset.lineType === "transmission";
        if (transmission) state.placement.transmissionVariant = button.dataset.lineVariant;
        else state.placement.distributionVariant = button.dataset.lineVariant;
        setMode(transmission ? "line-transmission" : "line-distribution");
      });
    });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", onWheel, { passive: false });
    runButton.addEventListener("click", startSimulation);
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
        closePlacementPickers();
        setMode("select");
      }
      if (key === "q" && !command && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        rotatePlaceableNodes();
      }
    });
  }

  bindEvents();
  resizeCanvas();
  updateRunButton();
  updateTimeReadout();
  loadDemo();
}());
