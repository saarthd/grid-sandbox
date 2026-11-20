(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GridboxEngine = api;
}(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function createGroundedLaplacian(size, connections) {
    const count = Math.max(0, Math.floor(Number(size) || 0));
    const diagonal = new Float64Array(count);
    const edgeFrom = [];
    const edgeTo = [];
    const edgeWeight = [];

    (connections || []).forEach((connection) => {
      const from = Math.floor(Number(connection.from));
      const to = Math.floor(Number(connection.to));
      const weight = Number(connection.weight);
      if (!(weight > 0) || !Number.isFinite(weight)) return;
      const fromUnknown = from >= 0 && from < count;
      const toUnknown = to >= 0 && to < count;
      if (!fromUnknown && !toUnknown) return;
      if (fromUnknown) diagonal[from] += weight;
      if (toUnknown) diagonal[to] += weight;
      if (fromUnknown && toUnknown) {
        edgeFrom.push(from);
        edgeTo.push(to);
        edgeWeight.push(weight);
      }
    });

    return {
      size: count,
      diagonal,
      edgeFrom: Int32Array.from(edgeFrom),
      edgeTo: Int32Array.from(edgeTo),
      edgeWeight: Float64Array.from(edgeWeight)
    };
  }

  function multiply(system, values, target) {
    const result = target || new Float64Array(system.size);
    result.fill(0);
    for (let index = 0; index < system.size; index += 1) {
      result[index] = system.diagonal[index] * values[index];
    }
    for (let edge = 0; edge < system.edgeWeight.length; edge += 1) {
      const from = system.edgeFrom[edge];
      const to = system.edgeTo[edge];
      const weight = system.edgeWeight[edge];
      result[from] -= weight * values[to];
      result[to] -= weight * values[from];
    }
    return result;
  }

  function dot(left, right) {
    let total = 0;
    for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
    return total;
  }

  function solve(system, rightHandSide, options = {}) {
    const size = system.size;
    if (rightHandSide.length !== size) throw new Error("Sparse system size mismatch");
    if (!size) return { values: new Float64Array(0), converged: true, iterations: 0, residual: 0 };

    const values = new Float64Array(size);
    const initial = options.initial;
    if (initial && initial.length === size) values.set(initial);

    for (let index = 0; index < size; index += 1) {
      if (!(system.diagonal[index] > 0) || !Number.isFinite(system.diagonal[index])) {
        throw new Error("Singular sparse matrix");
      }
    }

    const product = multiply(system, values);
    const residual = new Float64Array(size);
    const preconditioned = new Float64Array(size);
    const direction = new Float64Array(size);
    const directionProduct = new Float64Array(size);
    let rhsNormSquared = 0;
    let residualNormSquared = 0;
    for (let index = 0; index < size; index += 1) {
      const rhs = Number(rightHandSide[index]) || 0;
      const difference = rhs - product[index];
      residual[index] = difference;
      preconditioned[index] = difference / system.diagonal[index];
      direction[index] = preconditioned[index];
      rhsNormSquared += rhs * rhs;
      residualNormSquared += difference * difference;
    }

    const relativeTolerance = Math.max(0, Number(options.relativeTolerance) || 1e-9);
    const absoluteTolerance = Math.max(0, Number(options.absoluteTolerance) || 1e-8);
    const targetResidual = Math.max(absoluteTolerance, Math.sqrt(rhsNormSquared) * relativeTolerance);
    if (Math.sqrt(residualNormSquared) <= targetResidual) {
      return { values, converged: true, iterations: 0, residual: Math.sqrt(residualNormSquared) };
    }

    const maximumIterations = Math.max(1, Math.floor(Number(options.maximumIterations) || Math.min(6000, Math.max(96, size * 4))));
    let residualDotPreconditioned = dot(residual, preconditioned);
    let iterations = 0;
    let converged = false;

    for (iterations = 1; iterations <= maximumIterations; iterations += 1) {
      multiply(system, direction, directionProduct);
      const denominator = dot(direction, directionProduct);
      if (!(denominator > 0) || !Number.isFinite(denominator)) break;
      const alpha = residualDotPreconditioned / denominator;
      if (!Number.isFinite(alpha)) break;

      residualNormSquared = 0;
      for (let index = 0; index < size; index += 1) {
        values[index] += alpha * direction[index];
        residual[index] -= alpha * directionProduct[index];
        residualNormSquared += residual[index] * residual[index];
      }
      if (Math.sqrt(residualNormSquared) <= targetResidual) {
        converged = true;
        break;
      }

      let nextResidualDotPreconditioned = 0;
      for (let index = 0; index < size; index += 1) {
        preconditioned[index] = residual[index] / system.diagonal[index];
        nextResidualDotPreconditioned += residual[index] * preconditioned[index];
      }
      if (!(nextResidualDotPreconditioned > 0) || !Number.isFinite(nextResidualDotPreconditioned)) break;
      const beta = nextResidualDotPreconditioned / residualDotPreconditioned;
      for (let index = 0; index < size; index += 1) {
        direction[index] = preconditioned[index] + beta * direction[index];
      }
      residualDotPreconditioned = nextResidualDotPreconditioned;
    }

    return {
      values,
      converged,
      iterations: Math.min(iterations, maximumIterations),
      residual: Math.sqrt(residualNormSquared)
    };
  }

  // kW sustained for one second per Hz of change, calibrated to the four rotor ratings.
  const flywheels = Object.freeze([
    { mass: 8000, radius: 2, inertia: 16000, diameter: 5, rate: 0.421 },
    { mass: 12000, radius: 3, inertia: 54000, diameter: 10, rate: 0.125 },
    { mass: 16000, radius: 4, inertia: 128000, diameter: 15, rate: 0.053 },
    { mass: 20000, radius: 5, inertia: 250000, diameter: 20, rate: 0.027 }
  ].map(model => Object.freeze({ ...model, kwSecondsPerHz: 1000 / model.rate })));

  function flywheelModel(mass) {
    return flywheels.find(model => model.mass === Number(mass)) || flywheels[0];
  }

  // Return the next relay transition in the direction the island is currently drifting.
  function frequencyEvent(hz, slope, relay) {
    if (slope === 0) return null;
    let next, boundary;
    if (slope > 0 && relay !== "high") {
      next = relay === "low" ? "normal" : "high";
      boundary = relay === "low" ? 59.2 : 61;
    } else if (slope < 0 && relay !== "low") {
      next = relay === "high" ? "normal" : "low";
      boundary = relay === "high" ? 60.8 : 59;
    } else {
      return null;
    }
    return { next, seconds: Math.max(0, (boundary - hz) / slope) };
  }

  function visualRpm(hz) {
    return 60 * 2 ** (hz - 60);
  }

  return { createGroundedLaplacian, multiply, solve, flywheels, flywheelModel, frequencyEvent, visualRpm };
}));
