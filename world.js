(function () {
  "use strict";

  const CHUNK_SIZE_M = 10000;
  const WATER_TILE_SIZE_M = 1000;
  const WATER_CELL_M = 10;
  const WATER_TILE_CELLS = WATER_TILE_SIZE_M / WATER_CELL_M;
  const MAX_CHUNKS = 72;
  const MAX_WATER_TILES = 180;
  const MAX_MASK_TILES = 300;
  const MAX_ANCHORED_FEATURES = 2400;
  const TWO_PI = Math.PI * 2;

  const featureSpecs = {
    residential: { spacing: 2400, reach: 1500 },
    industrial: { spacing: 5200, reach: 1600 },
    wind: { spacing: 2600, reach: 900 },
    solar: { spacing: 4400, reach: 1100 },
    geothermal: { spacing: 3000, reach: 1200 },
    river: { spacing: 6000, reach: 100 }
  };

  const maskColors = {
    river: [79, 161, 196, 132],
    residential: [111, 181, 116, 74],
    commercial: [82, 178, 207, 92],
    industrial: [69, 76, 84, 88],
    wind: [164, 174, 184, 104],
    solar: [239, 200, 57, 82],
    geothermal: [205, 56, 54, 116]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function fade(value) {
    return value * value * (3 - 2 * value);
  }

  function randomSeed() {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  function normalizeSeed(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) >>> 0 : randomSeed();
  }

  function create(seedValue) {
    const seed = normalizeSeed(seedValue);
    const chunkCache = new Map();
    const waterTileCache = new Map();
    const maskTileCache = new Map();
    const anchoredFeatureCache = new Map();

    function hash(x, y, salt, index) {
      let value = seed
        ^ Math.imul(x | 0, 0x9e3779b1)
        ^ Math.imul(y | 0, 0x85ebca77)
        ^ Math.imul(salt | 0, 0xc2b2ae3d)
        ^ Math.imul(index | 0, 0x27d4eb2f);
      value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
      value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
      return (value ^ (value >>> 16)) >>> 0;
    }

    function random(x, y, salt, index = 0) {
      return hash(x, y, salt, index) / 4294967296;
    }

    function valueNoise(x, y, scale, salt) {
      const scaledX = x / scale;
      const scaledY = y / scale;
      const x0 = Math.floor(scaledX);
      const y0 = Math.floor(scaledY);
      const tx = fade(scaledX - x0);
      const ty = fade(scaledY - y0);
      const top = lerp(random(x0, y0, salt), random(x0 + 1, y0, salt), tx);
      const bottom = lerp(random(x0, y0 + 1, salt), random(x0 + 1, y0 + 1, salt), tx);
      return lerp(top, bottom, ty);
    }

    function waterValue(x, y) {
      return valueNoise(x, y, 2600, 11) * 0.56
        + valueNoise(x, y, 950, 17) * 0.3
        + valueNoise(x, y, 380, 23) * 0.14;
    }

    function isWater(x, y) {
      return waterValue(x, y) < 0.465;
    }

    function isNearWater(x, y, distance = 260) {
      if (isWater(x, y)) return true;
      for (let index = 0; index < 8; index += 1) {
        const angle = index * TWO_PI / 8;
        if (isWater(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance)) return true;
      }
      return false;
    }

    function landAdjustedCenter(cx, cy, ax, ay, salt) {
      if (!isWater(cx, cy)) return { x: cx, y: cy };
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const angle = random(ax, ay, salt, attempt * 2 + 70) * TWO_PI;
        const radius = 120 + random(ax, ay, salt, attempt * 2 + 71) * 1500;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (!isWater(x, y)) return { x, y };
      }
      return { x: cx, y: cy };
    }

    function makeBounds(points, padding = 0) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        left: Math.min(...xs) - padding,
        right: Math.max(...xs) + padding,
        top: Math.min(...ys) - padding,
        bottom: Math.max(...ys) + padding
      };
    }

    function boundsOverlap(a, b) {
      return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
    }

    function blobPoints(cx, cy, rx, ry, ax, ay, salt, rectangular) {
      const count = rectangular ? 16 : 14;
      const rotation = (random(ax, ay, salt, 41) - 0.5) * 0.45;
      const points = [];
      for (let index = 0; index < count; index += 1) {
        const angle = index * TWO_PI / count;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const shapeX = rectangular ? Math.sign(cosine) * Math.pow(Math.abs(cosine), 0.3) : cosine;
        const shapeY = rectangular ? Math.sign(sine) * Math.pow(Math.abs(sine), 0.3) : sine;
        const wobble = 0.86 + random(ax, ay, salt, index + 3) * 0.25;
        const localX = shapeX * rx * wobble;
        const localY = shapeY * ry * wobble;
        points.push({
          x: cx + localX * Math.cos(rotation) - localY * Math.sin(rotation),
          y: cy + localX * Math.sin(rotation) + localY * Math.cos(rotation)
        });
      }
      return points;
    }

    function coastAdjustedCenter(cx, cy, ax, ay, salt, shouldSeekWater) {
      if (!shouldSeekWater) return landAdjustedCenter(cx, cy, ax, ay, salt + 1);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = random(ax, ay, salt, attempt * 2 + 50) * TWO_PI;
        const radius = 180 + random(ax, ay, salt, attempt * 2 + 51) * 900;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (!isWater(x, y) && isNearWater(x, y, 320)) return { x, y };
      }
      return landAdjustedCenter(cx, cy, ax, ay, salt + 2);
    }

    function residentialFeature(ax, ay) {
      if (random(ax, ay, 101) > 0.52) return null;
      const spacing = featureSpecs.residential.spacing;
      const baseX = (ax + 0.15 + random(ax, ay, 102) * 0.7) * spacing;
      const baseY = (ay + 0.15 + random(ax, ay, 103) * 0.7) * spacing;
      const city = random(ax, ay, 104) < 0.34;
      const center = coastAdjustedCenter(baseX, baseY, ax, ay, 105, random(ax, ay, 106) < 0.6);
      const rx = city ? 620 + random(ax, ay, 107) * 720 : 170 + random(ax, ay, 107) * 260;
      const ry = city ? 470 + random(ax, ay, 108) * 620 : 140 + random(ax, ay, 108) * 230;
      const points = blobPoints(center.x, center.y, rx, ry, ax, ay, 109, false);
      return {
        id: `res:${ax}:${ay}`,
        kind: "residential",
        ax,
        ay,
        city,
        cx: center.x,
        cy: center.y,
        rx,
        ry,
        points,
        bounds: makeBounds(points)
      };
    }

    function commercialFeature(residential) {
      const chance = residential.city ? 0.68 : 0.2;
      if (random(residential.ax, residential.ay, 121) > chance) return null;
      const angle = random(residential.ax, residential.ay, 122) * TWO_PI;
      const offset = Math.min(residential.rx, residential.ry) * random(residential.ax, residential.ay, 123) * 0.22;
      const cx = residential.cx + Math.cos(angle) * offset;
      const cy = residential.cy + Math.sin(angle) * offset;
      const rx = residential.rx * (0.23 + random(residential.ax, residential.ay, 124) * 0.17);
      const ry = residential.ry * (0.23 + random(residential.ax, residential.ay, 125) * 0.17);
      const points = blobPoints(cx, cy, rx, ry, residential.ax, residential.ay, 126, true);
      return {
        id: `com:${residential.ax}:${residential.ay}`,
        kind: "commercial",
        cx,
        cy,
        rx,
        ry,
        points,
        bounds: makeBounds(points)
      };
    }

    function cachedResidentialFeature(ax, ay) {
      const key = `residential:${ax}:${ay}`;
      if (anchoredFeatureCache.has(key)) {
        return touchCache(anchoredFeatureCache, key, anchoredFeatureCache.get(key), MAX_ANCHORED_FEATURES);
      }
      return touchCache(anchoredFeatureCache, key, residentialFeature(ax, ay), MAX_ANCHORED_FEATURES);
    }

    function nearbyCityFeature(x, y, maximumDistance = 3600) {
      const spacing = featureSpecs.residential.spacing;
      const baseAx = Math.floor(x / spacing);
      const baseAy = Math.floor(y / spacing);
      const horizontalStep = x / spacing - baseAx < 0.5 ? -1 : 1;
      const verticalStep = y / spacing - baseAy < 0.5 ? -1 : 1;
      const candidates = [
        [baseAx, baseAy],
        [baseAx + horizontalStep, baseAy],
        [baseAx, baseAy + verticalStep],
        [baseAx + horizontalStep, baseAy + verticalStep]
      ];
      let nearest = null;
      candidates.forEach(([cityAx, cityAy]) => {
        const city = cachedResidentialFeature(cityAx, cityAy);
        if (!city?.city) return;
        const distance = Math.hypot(city.cx - x, city.cy - y);
        if (distance > maximumDistance || (nearest && distance >= nearest.distance)) return;
        nearest = { city, distance };
      });
      return nearest?.city || null;
    }

    function waterProximityScore(x, y) {
      const distances = [220, 430, 700];
      for (let distanceIndex = 0; distanceIndex < distances.length; distanceIndex += 1) {
        for (let direction = 0; direction < 6; direction += 1) {
          const angle = direction * TWO_PI / 6;
          if (isWater(x + Math.cos(angle) * distances[distanceIndex], y + Math.sin(angle) * distances[distanceIndex])) {
            return 3 - distanceIndex;
          }
        }
      }
      return 0;
    }

    function cityOutskirtCenter(city, ax, ay, spacing) {
      let best = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const angle = random(ax, ay, 149, attempt) * TWO_PI;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const edgeDistance = 1 / Math.sqrt(
          cosine * cosine / (city.rx * city.rx) + sine * sine / (city.ry * city.ry)
        );
        const distance = edgeDistance + 180 + random(ax, ay, 150, attempt) * 430;
        const candidate = {
          x: city.cx + cosine * distance,
          y: city.cy + sine * distance
        };
        if (!pointInsideCell(candidate, ax, ay, spacing, 900) || isWater(candidate.x, candidate.y)) continue;
        const waterScore = waterProximityScore(candidate.x, candidate.y);
        const score = waterScore * 3 + random(ax, ay, 151, attempt);
        if (!best || score > best.score) best = { ...candidate, waterScore, score };
      }
      return best;
    }

    function industrialFeature(ax, ay) {
      const appearanceRoll = random(ax, ay, 141);
      if (appearanceRoll > 0.71) return null;
      const spacing = featureSpecs.industrial.spacing;
      const baseX = (ax + 0.12 + random(ax, ay, 142) * 0.76) * spacing;
      const baseY = (ay + 0.12 + random(ax, ay, 143) * 0.76) * spacing;
      const nearbyCity = nearbyCityFeature(baseX, baseY);
      const cityOutskirt = nearbyCity && random(ax, ay, 145) < 0.76
        ? cityOutskirtCenter(nearbyCity, ax, ay, spacing)
        : null;
      const center = cityOutskirt || coastAdjustedCenter(baseX, baseY, ax, ay, 144, random(ax, ay, 152) < 0.68);
      const waterScore = cityOutskirt?.waterScore ?? waterProximityScore(center.x, center.y);
      const appearanceChance = 0.51
        + (nearbyCity ? 0.07 : 0)
        + (waterScore ? 0.07 : 0)
        + (cityOutskirt && waterScore ? 0.06 : 0);
      if (appearanceRoll > appearanceChance) return null;
      const rx = 320 + random(ax, ay, 146) * 520;
      const ry = 240 + random(ax, ay, 147) * 400;
      const points = blobPoints(center.x, center.y, rx, ry, ax, ay, 148, false);
      return {
        id: `ind:${ax}:${ay}`,
        kind: "industrial",
        cx: center.x,
        cy: center.y,
        rx,
        ry,
        points,
        bounds: makeBounds(points)
      };
    }

    function windFeature(ax, ay) {
      if (random(ax, ay, 161) > 0.42) return null;
      const spacing = featureSpecs.wind.spacing;
      const baseX = (ax + 0.2 + random(ax, ay, 162) * 0.6) * spacing;
      const baseY = (ay + 0.2 + random(ax, ay, 163) * 0.6) * spacing;
      const center = landAdjustedCenter(baseX, baseY, ax, ay, 168);
      const cx = center.x;
      const cy = center.y;
      const length = 400 + random(ax, ay, 164) * 400;
      const width = 100 + random(ax, ay, 165) * 200;
      const angle = random(ax, ay, 166) * TWO_PI;
      const points = [];
      for (let index = 0; index < 6; index += 1) {
        const progress = index / 5 - 0.5;
        const bend = Math.sin(progress * Math.PI) * (random(ax, ay, 167) - 0.5) * 170;
        points.push({
          x: cx + Math.cos(angle) * progress * length - Math.sin(angle) * bend,
          y: cy + Math.sin(angle) * progress * length + Math.cos(angle) * bend
        });
      }
      return {
        id: `wind:${ax}:${ay}`,
        kind: "wind",
        points,
        width,
        bounds: makeBounds(points, width / 2)
      };
    }

    function solarFeature(ax, ay) {
      if (random(ax, ay, 181) > 0.5) return null;
      const spacing = featureSpecs.solar.spacing;
      const baseX = (ax + 0.18 + random(ax, ay, 182) * 0.64) * spacing;
      const baseY = (ay + 0.18 + random(ax, ay, 183) * 0.64) * spacing;
      const center = landAdjustedCenter(baseX, baseY, ax, ay, 187);
      const cx = center.x;
      const cy = center.y;
      const rx = 390 + random(ax, ay, 184) * 610;
      const ry = 310 + random(ax, ay, 185) * 470;
      const points = blobPoints(cx, cy, rx, ry, ax, ay, 186, true);
      return { id: `solar:${ax}:${ay}`, kind: "solar", cx, cy, rx, ry, points, bounds: makeBounds(points) };
    }

    function geothermalFeature(ax, ay) {
      if (random(ax, ay, 201) > 0.66) return null;
      const spacing = featureSpecs.geothermal.spacing;
      const baseX = (ax + 0.18 + random(ax, ay, 202) * 0.64) * spacing;
      const baseY = (ay + 0.18 + random(ax, ay, 203) * 0.64) * spacing;
      const center = landAdjustedCenter(baseX, baseY, ax, ay, 206);
      const radius = 560 + random(ax, ay, 204) * 440;
      const ry = radius * (0.82 + random(ax, ay, 205) * 0.24);
      const points = blobPoints(center.x, center.y, radius, ry, ax, ay, 207, false);
      return {
        id: `geo:${ax}:${ay}`,
        kind: "geothermal",
        cx: center.x,
        cy: center.y,
        radius,
        points,
        bounds: makeBounds(points)
      };
    }

    function normalizedAngle(angle) {
      return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    function steerAngle(angle, target, strength, maximumTurn) {
      const turn = normalizedAngle(target - angle) * strength;
      return angle + clamp(turn, -maximumTurn, maximumTurn);
    }

    function segmentIntersection(a, b, c, d) {
      const rx = b.x - a.x;
      const ry = b.y - a.y;
      const sx = d.x - c.x;
      const sy = d.y - c.y;
      const denominator = rx * sy - ry * sx;
      if (Math.abs(denominator) < 1e-7) return null;
      const qx = c.x - a.x;
      const qy = c.y - a.y;
      const alongFirst = (qx * sy - qy * sx) / denominator;
      const alongSecond = (qx * ry - qy * rx) / denominator;
      if (alongFirst < 0 || alongFirst > 1 || alongSecond < 0 || alongSecond > 1) return null;
      return {
        x: a.x + rx * alongFirst,
        y: a.y + ry * alongFirst,
        alongFirst,
        alongSecond
      };
    }

    function pathSelfIntersects(points, candidate) {
      if (points.length < 4) return false;
      const start = points[points.length - 1];
      for (let index = 1; index < points.length - 2; index += 1) {
        const hit = segmentIntersection(start, candidate, points[index - 1], points[index]);
        if (hit && hit.alongFirst > 0.01) return true;
      }
      return false;
    }

    function closestPointOnSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const denominator = dx * dx + dy * dy;
      const amount = denominator
        ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1)
        : 0;
      return { x: a.x + dx * amount, y: a.y + dy * amount };
    }

    function firstPathIntersection(start, end, paths, ignoredMainIndex = -1) {
      let nearest = null;
      paths.forEach((path, pathIndex) => {
        for (let index = 1; index < path.length; index += 1) {
          if (pathIndex === 0 && Math.abs(index - ignoredMainIndex) <= 2) continue;
          const hit = segmentIntersection(start, end, path[index - 1], path[index]);
          if (!hit || hit.alongFirst <= 0.035) continue;
          if (!nearest || hit.alongFirst < nearest.alongFirst) nearest = hit;
        }
      });
      return nearest;
    }

    function nearestNetworkPoint(point, paths, ignoredMainIndex) {
      let nearest = null;
      paths.forEach((path, pathIndex) => {
        for (let index = 1; index < path.length; index += 1) {
          if (pathIndex === 0 && Math.abs(index - ignoredMainIndex) <= 3) continue;
          const candidate = closestPointOnSegment(point, path[index - 1], path[index]);
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (!nearest || distance < nearest.distance) nearest = { ...candidate, distance };
        }
      });
      return nearest;
    }

    function pointInsideCell(point, ax, ay, spacing, inset = 12) {
      return point.x >= ax * spacing + inset
        && point.x <= (ax + 1) * spacing - inset
        && point.y >= ay * spacing + inset
        && point.y <= (ay + 1) * spacing - inset;
    }

    function coastlineMouth(ax, ay, spacing) {
      const sampleCount = 12;
      const rotation = random(ax, ay, 241) * TWO_PI;
      const probeDistances = [90, 190, 330, 520];
      let best = null;
      for (let row = 0; row < sampleCount; row += 1) {
        for (let column = 0; column < sampleCount; column += 1) {
          const x = (ax + (column + 0.18 + random(ax, ay, 242 + row, column) * 0.64) / sampleCount) * spacing;
          const y = (ay + (row + 0.18 + random(ax, ay, 255 + column, row) * 0.64) / sampleCount) * spacing;
          if (isWater(x, y)) continue;
          for (let direction = 0; direction < 16; direction += 1) {
            const angle = rotation + direction * TWO_PI / 16;
            for (let distanceIndex = 0; distanceIndex < probeDistances.length; distanceIndex += 1) {
              const distance = probeDistances[distanceIndex];
              const water = { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
              if (!pointInsideCell(water, ax, ay, spacing, 0) || !isWater(water.x, water.y)) continue;
              if (!best || distance < best.distance) best = { land: { x, y }, water, distance };
              break;
            }
          }
        }
      }
      if (!best) return null;

      let land = best.land;
      let water = best.water;
      for (let index = 0; index < 10; index += 1) {
        const middle = { x: (land.x + water.x) / 2, y: (land.y + water.y) / 2 };
        if (isWater(middle.x, middle.y)) water = middle;
        else land = middle;
      }
      const waterAngle = Math.atan2(water.y - land.y, water.x - land.x);
      return {
        x: land.x,
        y: land.y,
        angle: waterAngle + Math.PI + (random(ax, ay, 271) - 0.5) * 0.22
      };
    }

    function nearbyWater(point, ax, ay, index, maximumDistance = 820) {
      const rotation = random(ax, ay, 272, index) * TWO_PI;
      const distances = [180, 330, 510, 680, maximumDistance];
      let nearest = null;
      for (let direction = 0; direction < 16; direction += 1) {
        const angle = rotation + direction * TWO_PI / 16;
        for (let distanceIndex = 0; distanceIndex < distances.length; distanceIndex += 1) {
          const distance = distances[distanceIndex];
          const x = point.x + Math.cos(angle) * distance;
          const y = point.y + Math.sin(angle) * distance;
          if (!isWater(x, y)) continue;
          if (!nearest || distance < nearest.distance) nearest = { x, y, distance };
          break;
        }
      }
      return nearest;
    }

    function lastLandPoint(landPoint, waterPoint) {
      let land = landPoint;
      let water = waterPoint;
      for (let index = 0; index < 8; index += 1) {
        const middle = { x: (land.x + water.x) / 2, y: (land.y + water.y) / 2 };
        if (isWater(middle.x, middle.y)) water = middle;
        else land = middle;
      }
      return land;
    }

    function riverFeature(ax, ay) {
      if (random(ax, ay, 221) > 0.88) return null;
      const spacing = featureSpecs.river.spacing;
      const mouth = coastlineMouth(ax, ay, spacing);
      if (!mouth) return null;
      let x = mouth.x;
      let y = mouth.y;
      let angle = mouth.angle;
      let turnVelocity = (random(ax, ay, 224) - 0.5) * 0.08;
      const maximumSteps = 42 + Math.floor(random(ax, ay, 225) * 27);
      const mouthWidth = 58 + random(ax, ay, 226) * 34;
      const meanderPhase = random(ax, ay, 227) * TWO_PI;
      const meanderRate = 0.32 + random(ax, ay, 228) * 0.22;
      const widthPhase = random(ax, ay, 292) * TWO_PI;
      const widthRate = 0.24 + random(ax, ay, 293) * 0.22;
      const points = [{ x, y }];
      const widths = [mouthWidth];
      let waterTarget = null;
      for (let index = 1; index <= maximumSteps; index += 1) {
        const wave = Math.sin(meanderPhase + index * meanderRate) * 0.045;
        const noise = (random(ax, ay, 229, index) - 0.5) * 0.065;
        turnVelocity = clamp(turnVelocity * 0.84 + wave + noise, -0.13, 0.13);
        angle += turnVelocity;

        if (index > 10 && index % 4 === 0) waterTarget = nearbyWater({ x, y }, ax, ay, index);
        if (waterTarget) {
          const targetAngle = Math.atan2(waterTarget.y - y, waterTarget.x - x);
          const difference = Math.abs(normalizedAngle(targetAngle - angle));
          if (difference < Math.PI * 0.58) angle = steerAngle(angle, targetAngle, 0.09, 0.045);
        }

        const length = 78 + random(ax, ay, 230, index) * 105;
        let accepted = null;
        let reachedWater = false;
        for (let attempt = 0; attempt < 11; attempt += 1) {
          const direction = attempt === 0
            ? angle
            : angle + (random(ax, ay, 231 + index, attempt) - 0.5) * (0.28 + attempt * 0.12);
          const candidate = { x: x + Math.cos(direction) * length, y: y + Math.sin(direction) * length };
          if (!pointInsideCell(candidate, ax, ay, spacing) || pathSelfIntersects(points, candidate)) continue;
          const quarter = { x: lerp(x, candidate.x, 0.35), y: lerp(y, candidate.y, 0.35) };
          const middle = { x: lerp(x, candidate.x, 0.68), y: lerp(y, candidate.y, 0.68) };
          const entersWater = isWater(candidate.x, candidate.y) || isWater(quarter.x, quarter.y) || isWater(middle.x, middle.y);
          if (entersWater) {
            if (index <= 11) continue;
            accepted = lastLandPoint({ x, y }, candidate);
            reachedWater = true;
            break;
          }
          accepted = candidate;
          angle = direction;
          break;
        }
        if (!accepted || Math.hypot(accepted.x - x, accepted.y - y) < 12) break;
        x = accepted.x;
        y = accepted.y;
        points.push({ x, y });
        const progress = index / maximumSteps;
        const varianceEnvelope = 3 + Math.sin(Math.PI * clamp(progress, 0, 1)) * 7;
        const widthWave = Math.sin(widthPhase + index * widthRate) * varianceEnvelope;
        const widthNoise = (random(ax, ay, 232, index) - 0.5) * 6;
        widths.push(clamp(
          lerp(mouthWidth, 17, Math.pow(progress, 0.72)) + widthWave + widthNoise,
          15,
          mouthWidth
        ));
        if (reachedWater) break;
      }
      if (points.length < 10) return null;

      const branches = [];
      const desiredBranches = random(ax, ay, 233) < 0.8
        ? 1 + Number(random(ax, ay, 234) < 0.52) + Number(random(ax, ay, 235) < 0.18)
        : 0;
      for (let branchIndex = 0; branchIndex < desiredBranches; branchIndex += 1) {
        if (points.length < 16) break;
        const usableLength = Math.max(1, points.length - 12);
        const startIndex = 7 + Math.floor(random(ax, ay, 236, branchIndex) * usableLength);
        const start = points[startIndex];
        const before = points[Math.max(0, startIndex - 1)];
        const after = points[Math.min(points.length - 1, startIndex + 1)];
        const side = random(ax, ay, 237, branchIndex) < 0.5 ? -1 : 1;
        let branchAngle = Math.atan2(after.y - before.y, after.x - before.x)
          + side * (0.68 + random(ax, ay, 238, branchIndex) * 0.55);
        let branchTurn = (random(ax, ay, 239, branchIndex) - 0.5) * 0.1;
        let branchX = start.x;
        let branchY = start.y;
        const branchPoints = [{ x: branchX, y: branchY }];
        const branchWidths = [clamp(widths[startIndex] * 0.58, 16, 38)];
        const branchSteps = 14 + Math.floor(random(ax, ay, 240, branchIndex) * 18);
        const branchWidthPhase = random(ax, ay, 294, branchIndex) * TWO_PI;
        const branchWidthRate = 0.3 + random(ax, ay, 295, branchIndex) * 0.24;
        const existingPaths = [points, ...branches.map((branch) => branch.points)];
        for (let index = 1; index <= branchSteps; index += 1) {
          const wave = Math.sin(index * (0.4 + random(ax, ay, 273, branchIndex) * 0.2)
            + random(ax, ay, 274, branchIndex) * TWO_PI) * 0.055;
          branchTurn = clamp(branchTurn * 0.8 + wave
            + (random(ax, ay, 275 + branchIndex, index) - 0.5) * 0.075, -0.15, 0.15);
          branchAngle += branchTurn;

          if (index > 7 && index % 3 === 0) {
            const networkPoint = nearestNetworkPoint({ x: branchX, y: branchY }, existingPaths, startIndex);
            if (networkPoint && networkPoint.distance > 150 && networkPoint.distance < 560) {
              branchAngle = steerAngle(
                branchAngle,
                Math.atan2(networkPoint.y - branchY, networkPoint.x - branchX),
                0.12,
                0.06
              );
            }
          }

          const length = 65 + random(ax, ay, 276 + branchIndex, index) * 88;
          let accepted = null;
          let shouldEnd = false;
          for (let attempt = 0; attempt < 9; attempt += 1) {
            const direction = attempt === 0
              ? branchAngle
              : branchAngle + (random(ax, ay, 282 + branchIndex + index, attempt) - 0.5) * (0.3 + attempt * 0.13);
            const candidate = {
              x: branchX + Math.cos(direction) * length,
              y: branchY + Math.sin(direction) * length
            };
            if (!pointInsideCell(candidate, ax, ay, spacing) || pathSelfIntersects(branchPoints, candidate)) continue;
            const hit = firstPathIntersection({ x: branchX, y: branchY }, candidate, existingPaths, startIndex);
            if (hit) {
              accepted = { x: hit.x, y: hit.y };
              shouldEnd = true;
              break;
            }
            const middle = { x: (branchX + candidate.x) / 2, y: (branchY + candidate.y) / 2 };
            if (isWater(candidate.x, candidate.y) || isWater(middle.x, middle.y)) {
              if (index < 5) continue;
              accepted = lastLandPoint({ x: branchX, y: branchY }, candidate);
              shouldEnd = true;
              break;
            }
            accepted = candidate;
            branchAngle = direction;
            break;
          }
          if (!accepted || Math.hypot(accepted.x - branchX, accepted.y - branchY) < 10) break;
          branchX = accepted.x;
          branchY = accepted.y;
          branchPoints.push({ x: branchX, y: branchY });
          const progress = index / branchSteps;
          const widthWave = Math.sin(branchWidthPhase + index * branchWidthRate)
            * (2 + Math.sin(Math.PI * clamp(progress, 0, 1)) * 3);
          branchWidths.push(clamp(lerp(branchWidths[0], 13, Math.pow(progress, 0.72))
            + widthWave + (random(ax, ay, 291 + branchIndex, index) - 0.5) * 3, 12, branchWidths[0]));
          if (shouldEnd) break;
        }
        if (branchPoints.length >= 5) branches.push({ points: branchPoints, widths: branchWidths });
      }
      const allPoints = points.concat(...branches.map((branch) => branch.points));
      return {
        id: `river:${ax}:${ay}`,
        kind: "river",
        points,
        widths,
        branches,
        bounds: makeBounds(allPoints, mouthWidth / 2)
      };
    }

    const makers = {
      residential: residentialFeature,
      industrial: industrialFeature,
      wind: windFeature,
      solar: solarFeature,
      geothermal: geothermalFeature,
      river: riverFeature
    };

    function anchoredFeatures(kind, bounds) {
      const spec = featureSpecs[kind];
      const maker = makers[kind];
      const left = Math.floor((bounds.left - spec.reach) / spec.spacing);
      const right = Math.floor((bounds.right + spec.reach) / spec.spacing);
      const top = Math.floor((bounds.top - spec.reach) / spec.spacing);
      const bottom = Math.floor((bounds.bottom + spec.reach) / spec.spacing);
      const features = [];
      for (let ax = left; ax <= right; ax += 1) {
        for (let ay = top; ay <= bottom; ay += 1) {
          const key = `${kind}:${ax}:${ay}`;
          const feature = anchoredFeatureCache.has(key)
            ? touchCache(anchoredFeatureCache, key, anchoredFeatureCache.get(key), MAX_ANCHORED_FEATURES)
            : touchCache(anchoredFeatureCache, key, maker(ax, ay), MAX_ANCHORED_FEATURES);
          if (feature && boundsOverlap(feature.bounds, bounds)) features.push(feature);
        }
      }
      return features;
    }

    function buildChunk(cx, cy) {
      const bounds = {
        left: cx * CHUNK_SIZE_M,
        right: (cx + 1) * CHUNK_SIZE_M,
        top: cy * CHUNK_SIZE_M,
        bottom: (cy + 1) * CHUNK_SIZE_M
      };
      const residential = anchoredFeatures("residential", bounds);
      const commercial = residential.map(commercialFeature).filter((feature) => feature && boundsOverlap(feature.bounds, bounds));
      return {
        cx,
        cy,
        bounds,
        residential,
        commercial,
        industrial: anchoredFeatures("industrial", bounds),
        wind: anchoredFeatures("wind", bounds),
        solar: anchoredFeatures("solar", bounds),
        geothermal: anchoredFeatures("geothermal", bounds),
        river: anchoredFeatures("river", bounds)
      };
    }

    function touchCache(cache, key, value, maximum) {
      if (cache.has(key)) cache.delete(key);
      cache.set(key, value);
      while (cache.size > maximum) cache.delete(cache.keys().next().value);
      return value;
    }

    function getChunk(cx, cy) {
      const key = `${cx}:${cy}`;
      if (chunkCache.has(key)) return touchCache(chunkCache, key, chunkCache.get(key), MAX_CHUNKS);
      return touchCache(chunkCache, key, buildChunk(cx, cy), MAX_CHUNKS);
    }

    function chunksForBounds(bounds) {
      const chunks = [];
      for (let cx = Math.floor(bounds.left / CHUNK_SIZE_M); cx <= Math.floor(bounds.right / CHUNK_SIZE_M); cx += 1) {
        for (let cy = Math.floor(bounds.top / CHUNK_SIZE_M); cy <= Math.floor(bounds.bottom / CHUNK_SIZE_M); cy += 1) {
          chunks.push(getChunk(cx, cy));
        }
      }
      return chunks;
    }

    function uniqueFeatures(chunks, kind) {
      const seen = new Set();
      const result = [];
      chunks.forEach((chunk) => {
        chunk[kind].forEach((feature) => {
          if (seen.has(feature.id)) return;
          seen.add(feature.id);
          result.push(feature);
        });
      });
      return result;
    }

    function makeWaterTile(tileX, tileY) {
      const tile = document.createElement("canvas");
      tile.width = WATER_TILE_CELLS;
      tile.height = WATER_TILE_CELLS;
      const tileContext = tile.getContext("2d");
      const image = tileContext.createImageData(WATER_TILE_CELLS, WATER_TILE_CELLS);
      const data = new Uint8Array(WATER_TILE_CELLS * WATER_TILE_CELLS);
      const originX = tileX * WATER_TILE_SIZE_M;
      const originY = tileY * WATER_TILE_SIZE_M;
      for (let row = 0; row < WATER_TILE_CELLS; row += 1) {
        for (let column = 0; column < WATER_TILE_CELLS; column += 1) {
          if (!isWater(originX + column * WATER_CELL_M + 5, originY + row * WATER_CELL_M + 5)) continue;
          const cellIndex = row * WATER_TILE_CELLS + column;
          const offset = cellIndex * 4;
          data[cellIndex] = 1;
          image.data[offset] = 42;
          image.data[offset + 1] = 91;
          image.data[offset + 2] = 119;
          image.data[offset + 3] = 178;
        }
      }
      tileContext.putImageData(image, 0, 0);
      return { canvas: tile, data };
    }

    function getWaterTile(tileX, tileY) {
      const key = `${tileX}:${tileY}`;
      if (waterTileCache.has(key)) return touchCache(waterTileCache, key, waterTileCache.get(key), MAX_WATER_TILES);
      return touchCache(waterTileCache, key, makeWaterTile(tileX, tileY), MAX_WATER_TILES);
    }

    function tileBounds(tileX, tileY) {
      return {
        left: tileX * WATER_TILE_SIZE_M,
        right: (tileX + 1) * WATER_TILE_SIZE_M,
        top: tileY * WATER_TILE_SIZE_M,
        bottom: (tileY + 1) * WATER_TILE_SIZE_M
      };
    }

    function featureContains(kind, feature, point) {
      if (point.x < feature.bounds.left || point.x > feature.bounds.right
        || point.y < feature.bounds.top || point.y > feature.bounds.bottom) return false;
      if (kind === "river" || kind === "wind") return strokeTouchesCircle(feature, point, 0);
      return pointInPolygon(point, feature.points);
    }

    function makeMaskTile(kind, tileX, tileY) {
      const tile = document.createElement("canvas");
      tile.width = WATER_TILE_CELLS;
      tile.height = WATER_TILE_CELLS;
      const tileContext = tile.getContext("2d");
      const image = tileContext.createImageData(WATER_TILE_CELLS, WATER_TILE_CELLS);
      const data = new Uint8Array(WATER_TILE_CELLS * WATER_TILE_CELLS);
      const water = getWaterTile(tileX, tileY).data;
      const bounds = tileBounds(tileX, tileY);
      const features = uniqueFeatures(chunksForBounds(bounds), kind);
      const color = maskColors[kind];
      const originX = bounds.left;
      const originY = bounds.top;
      for (let row = 0; row < WATER_TILE_CELLS; row += 1) {
        for (let column = 0; column < WATER_TILE_CELLS; column += 1) {
          const cellIndex = row * WATER_TILE_CELLS + column;
          if (water[cellIndex]) continue;
          const point = {
            x: originX + column * WATER_CELL_M + WATER_CELL_M / 2,
            y: originY + row * WATER_CELL_M + WATER_CELL_M / 2
          };
          if (!features.some((feature) => featureContains(kind, feature, point))) continue;
          const offset = cellIndex * 4;
          data[cellIndex] = 1;
          image.data[offset] = color[0];
          image.data[offset + 1] = color[1];
          image.data[offset + 2] = color[2];
          image.data[offset + 3] = color[3];
        }
      }
      tileContext.putImageData(image, 0, 0);
      return { canvas: tile, data };
    }

    function getMaskTile(kind, tileX, tileY) {
      const key = `${kind}:${tileX}:${tileY}`;
      if (maskTileCache.has(key)) return touchCache(maskTileCache, key, maskTileCache.get(key), MAX_MASK_TILES);
      return touchCache(maskTileCache, key, makeMaskTile(kind, tileX, tileY), MAX_MASK_TILES);
    }

    function worldBounds(camera, rect, padding = 0) {
      return {
        left: (0 - camera.x) / camera.scale - padding,
        right: (rect.width - camera.x) / camera.scale + padding,
        top: (0 - camera.y) / camera.scale - padding,
        bottom: (rect.height - camera.y) / camera.scale + padding
      };
    }

    function drawTileLayer(context, camera, bounds, tileForPosition) {
      const left = Math.floor(bounds.left / WATER_TILE_SIZE_M);
      const right = Math.floor(bounds.right / WATER_TILE_SIZE_M);
      const top = Math.floor(bounds.top / WATER_TILE_SIZE_M);
      const bottom = Math.floor(bounds.bottom / WATER_TILE_SIZE_M);
      for (let tileX = left; tileX <= right; tileX += 1) {
        for (let tileY = top; tileY <= bottom; tileY += 1) {
          context.drawImage(
            tileForPosition(tileX, tileY).canvas,
            tileX * WATER_TILE_SIZE_M * camera.scale + camera.x,
            tileY * WATER_TILE_SIZE_M * camera.scale + camera.y,
            WATER_TILE_SIZE_M * camera.scale,
            WATER_TILE_SIZE_M * camera.scale
          );
        }
      }
    }

    function draw(context, camera, rect, overlay) {
      const bounds = worldBounds(camera, rect, 100);
      context.save();
      context.imageSmoothingEnabled = false;
      drawTileLayer(context, camera, bounds, getWaterTile);
      drawTileLayer(context, camera, bounds, (tileX, tileY) => getMaskTile("river", tileX, tileY));
      if (overlay === "load") {
        ["residential", "commercial", "industrial"].forEach((kind) => {
          drawTileLayer(context, camera, bounds, (tileX, tileY) => getMaskTile(kind, tileX, tileY));
        });
      } else if (overlay === "source") {
        ["wind", "solar", "geothermal"].forEach((kind) => {
          drawTileLayer(context, camera, bounds, (tileX, tileY) => getMaskTile(kind, tileX, tileY));
        });
      }
      context.restore();
    }

    function pointInPolygon(point, points) {
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const a = points[index];
        const b = points[previous];
        const intersects = ((a.y > point.y) !== (b.y > point.y))
          && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 1e-9) + a.x;
        if (intersects) inside = !inside;
      }
      return inside;
    }

    function distanceToSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (!dx && !dy) return Math.hypot(point.x - a.x, point.y - a.y);
      const amount = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(point.x - (a.x + dx * amount), point.y - (a.y + dy * amount));
    }

    function pathTouchesCircle(path, fallbackWidth, point, radius) {
      for (let index = 1; index < path.points.length; index += 1) {
        const previousWidth = path.widths ? path.widths[index - 1] : fallbackWidth;
        const currentWidth = path.widths ? path.widths[index] : fallbackWidth;
        const width = (previousWidth + currentWidth) / 2;
        if (distanceToSegment(point, path.points[index - 1], path.points[index]) <= radius + width / 2) return true;
      }
      return false;
    }

    function strokeTouchesCircle(feature, point, radius) {
      if (pathTouchesCircle(feature, feature.width, point, radius)) return true;
      const branches = feature.branches || [];
      for (let index = 0; index < branches.length; index += 1) {
        if (pathTouchesCircle(branches[index], feature.width, point, radius)) return true;
      }
      return false;
    }

    function areaForShape(x, y, width, height) {
      const radius = Math.hypot(Number(width) || 0, Number(height) || 0) / 2;
      return {
        point: { x, y },
        radius,
        bounds: { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius }
      };
    }

    function matchingFeatures(kinds, x, y, width = 0, height = 0) {
      const area = areaForShape(x, y, width, height);
      const cellMargin = WATER_CELL_M * Math.SQRT1_2 / 2;
      const radius = area.radius + cellMargin;
      const bounds = {
        left: x - radius,
        right: x + radius,
        top: y - radius,
        bottom: y + radius
      };
      const chunks = chunksForBounds(bounds);
      const featuresByKind = new Map(kinds.map((kind) => [kind, uniqueFeatures(chunks, kind)]));
      const matches = new Set();
      const startX = Math.floor(bounds.left / WATER_CELL_M) * WATER_CELL_M + WATER_CELL_M / 2;
      const endX = Math.floor(bounds.right / WATER_CELL_M) * WATER_CELL_M + WATER_CELL_M / 2;
      const startY = Math.floor(bounds.top / WATER_CELL_M) * WATER_CELL_M + WATER_CELL_M / 2;
      const endY = Math.floor(bounds.bottom / WATER_CELL_M) * WATER_CELL_M + WATER_CELL_M / 2;
      for (let sampleY = startY; sampleY <= endY; sampleY += WATER_CELL_M) {
        for (let sampleX = startX; sampleX <= endX; sampleX += WATER_CELL_M) {
          if (Math.hypot(sampleX - x, sampleY - y) > radius || isWater(sampleX, sampleY)) continue;
          const point = { x: sampleX, y: sampleY };
          kinds.forEach((kind) => {
            if (!matches.has(kind)
              && featuresByKind.get(kind).some((feature) => featureContains(kind, feature, point))) matches.add(kind);
          });
          if (matches.size === kinds.length) return matches;
        }
      }
      return matches;
    }

    function touches(kind, x, y, width = 0, height = 0) {
      return matchingFeatures([kind], x, y, width, height).has(kind);
    }

    function zoneMembership(x, y, width = 0, height = 0) {
      const kinds = ["residential", "commercial", "industrial"];
      const matches = matchingFeatures(kinds, x, y, width, height);
      return Object.fromEntries(kinds.map((kind) => [kind, matches.has(kind)]));
    }

    function yieldFactor(sourceType, x, y, width, height) {
      const kind = sourceType === "wind" ? "wind" : sourceType === "solar" ? "solar" : sourceType === "geothermal" ? "geothermal" : "";
      return kind && !touches(kind, x, y, width, height) ? 0.5 : 1;
    }

    return {
      seed,
      draw,
      isWater,
      touches,
      zoneMembership,
      yieldFactor,
      cacheStats() {
        return {
          chunks: chunkCache.size,
          waterTiles: waterTileCache.size,
          maskTiles: maskTileCache.size,
          anchoredFeatures: anchoredFeatureCache.size
        };
      }
    };
  }

  window.GridboxWorld = {
    CHUNK_SIZE_M,
    create,
    randomSeed
  };
}());
