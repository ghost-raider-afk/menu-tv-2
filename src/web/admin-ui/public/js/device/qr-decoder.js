const QR_SIZE = 25;
const FINDER_DISTANCE = 18;
const MAX_FRAME_WIDTH = 720;

function luminance(red, green, blue) {
  return (red * 77 + green * 150 + blue * 29) >> 8;
}

function otsuThreshold(gray) {
  const histogram = new Uint32Array(256);
  let sum = 0;
  for (const value of gray) {
    histogram[value] += 1;
    sum += value;
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 128;
  const total = gray.length;

  for (let level = 0; level < 256; level += 1) {
    backgroundWeight += histogram[level];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += level * histogram[level];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const difference = backgroundMean - foregroundMean;
    const variance = backgroundWeight * foregroundWeight * difference * difference;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = level;
    }
  }
  return threshold;
}

function binaryFrame(imageData) {
  const { data, width, height } = imageData;
  if (!data || !width || !height) return null;
  const pixels = width * height;
  const gray = new Uint8Array(pixels);
  const stride = data.length >= pixels * 4 ? 4 : 3;
  for (let index = 0, offset = 0; index < pixels; index += 1, offset += stride) {
    gray[index] = luminance(data[offset], data[offset + 1], data[offset + 2]);
  }
  const threshold = otsuThreshold(gray);
  const dark = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) dark[index] = gray[index] <= threshold ? 1 : 0;
  return { dark, width, height };
}

function pixel(frame, x, y) {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return 0;
  return frame.dark[Math.round(y) * frame.width + Math.round(x)] || 0;
}

function finderRatio(runs) {
  const total = runs.reduce((sum, value) => sum + value, 0);
  if (total < 7) return null;
  const module = total / 7;
  const tolerance = module * 0.72;
  if (Math.abs(runs[0] - module) > tolerance) return null;
  if (Math.abs(runs[1] - module) > tolerance) return null;
  if (Math.abs(runs[2] - module * 3) > tolerance * 1.55) return null;
  if (Math.abs(runs[3] - module) > tolerance) return null;
  if (Math.abs(runs[4] - module) > tolerance) return null;
  return module;
}

function axisCrossCheck(frame, x, y, dx, dy, expectedModule) {
  const limit = Math.max(6, Math.ceil((expectedModule || 2) * 8));
  const center = { negative: 0, positive: 0 };
  let step = 0;
  while (step <= limit && pixel(frame, x - dx * step, y - dy * step)) { center.negative += 1; step += 1; }
  step = 1;
  while (step <= limit && pixel(frame, x + dx * step, y + dy * step)) { center.positive += 1; step += 1; }
  const centerRun = center.negative + center.positive;
  if (centerRun < 2) return null;

  const negativeRuns = [];
  step = center.negative;
  let count = 0;
  while (step <= limit && !pixel(frame, x - dx * step, y - dy * step)) { count += 1; step += 1; }
  negativeRuns.push(count);
  count = 0;
  while (step <= limit && pixel(frame, x - dx * step, y - dy * step)) { count += 1; step += 1; }
  negativeRuns.push(count);

  const positiveRuns = [];
  step = center.positive + 1;
  count = 0;
  while (step <= limit && !pixel(frame, x + dx * step, y + dy * step)) { count += 1; step += 1; }
  positiveRuns.push(count);
  count = 0;
  while (step <= limit && pixel(frame, x + dx * step, y + dy * step)) { count += 1; step += 1; }
  positiveRuns.push(count);

  const runs = [negativeRuns[1], negativeRuns[0], centerRun, positiveRuns[0], positiveRuns[1]];
  if (runs.some((value) => value <= 0)) return null;
  const module = finderRatio(runs);
  if (!module) return null;
  if (expectedModule && (module < expectedModule * 0.45 || module > expectedModule * 2.2)) return null;

  const negativeCenterEdge = center.negative - 1;
  const positiveCenterEdge = center.positive;
  const centerOffset = (positiveCenterEdge - negativeCenterEdge) / 2;
  return {
    x: x + dx * centerOffset,
    y: y + dy * centerOffset,
    module
  };
}

function rowRuns(frame, y) {
  const runs = [];
  let start = 0;
  let color = Boolean(pixel(frame, 0, y));
  for (let x = 1; x <= frame.width; x += 1) {
    const next = x < frame.width ? Boolean(pixel(frame, x, y)) : !color;
    if (next === color) continue;
    runs.push({ dark: color, start, end: x - 1, length: x - start });
    start = x;
    color = next;
  }
  return runs;
}

function mergeCandidate(candidates, candidate) {
  const radius = Math.max(5, candidate.module * 2.4);
  const existing = candidates.find((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) <= radius);
  if (!existing) {
    candidates.push({ ...candidate, hits: 1 });
    return;
  }
  const weight = existing.hits;
  existing.x = (existing.x * weight + candidate.x) / (weight + 1);
  existing.y = (existing.y * weight + candidate.y) / (weight + 1);
  existing.module = (existing.module * weight + candidate.module) / (weight + 1);
  existing.hits += 1;
}

function finderCandidates(frame) {
  const candidates = [];
  const rowStep = Math.max(1, Math.floor(frame.height / 360));
  for (let y = 0; y < frame.height; y += rowStep) {
    const runs = rowRuns(frame, y);
    for (let index = 0; index + 4 < runs.length; index += 1) {
      const sample = runs.slice(index, index + 5);
      if (!sample[0].dark || sample[1].dark || !sample[2].dark || sample[3].dark || !sample[4].dark) continue;
      const module = finderRatio(sample.map((run) => run.length));
      if (!module) continue;
      const centerX = sample[2].start + sample[2].length / 2;
      const vertical = axisCrossCheck(frame, centerX, y, 0, 1, module);
      if (!vertical) continue;
      const horizontal = axisCrossCheck(frame, vertical.x, vertical.y, 1, 0, vertical.module);
      if (!horizontal) continue;
      mergeCandidate(candidates, {
        x: horizontal.x,
        y: vertical.y,
        module: (module + vertical.module + horizontal.module) / 3
      });
    }
  }
  return candidates.filter((item) => item.hits >= 2).sort((left, right) => right.hits - left.hits).slice(0, 14);
}

function chooseFinderTriangle(candidates) {
  let best = null;
  for (let a = 0; a < candidates.length; a += 1) {
    for (let b = 0; b < candidates.length; b += 1) {
      if (b === a) continue;
      for (let c = b + 1; c < candidates.length; c += 1) {
        if (c === a) continue;
        const tl = candidates[a];
        const first = candidates[b];
        const second = candidates[c];
        const vx1 = first.x - tl.x;
        const vy1 = first.y - tl.y;
        const vx2 = second.x - tl.x;
        const vy2 = second.y - tl.y;
        const length1 = Math.hypot(vx1, vy1);
        const length2 = Math.hypot(vx2, vy2);
        if (!length1 || !length2) continue;
        const ratio = length1 / length2;
        if (ratio < 0.58 || ratio > 1.72) continue;
        const cosine = Math.abs((vx1 * vx2 + vy1 * vy2) / (length1 * length2));
        if (cosine > 0.34) continue;
        const module = (tl.module + first.module + second.module) / 3;
        const modules1 = length1 / module;
        const modules2 = length2 / module;
        if (modules1 < 13 || modules1 > 25 || modules2 < 13 || modules2 > 25) continue;
        const cross = vx1 * vy2 - vy1 * vx2;
        if (Math.abs(cross) < length1 * length2 * 0.55) continue;
        const tr = cross > 0 ? first : second;
        const bl = cross > 0 ? second : first;
        const geometryPenalty = cosine * 8 + Math.abs(Math.log(ratio)) * 5 + Math.abs(modules1 - FINDER_DISTANCE) / 4 + Math.abs(modules2 - FINDER_DISTANCE) / 4;
        const score = tl.hits + first.hits + second.hits - geometryPenalty;
        if (!best || score > best.score) best = { tl, tr, bl, score, module };
      }
    }
  }
  return best;
}

function affineProject(triangle, moduleX, moduleY) {
  const u = (moduleX - 3) / FINDER_DISTANCE;
  const v = (moduleY - 3) / FINDER_DISTANCE;
  return {
    x: triangle.tl.x + (triangle.tr.x - triangle.tl.x) * u + (triangle.bl.x - triangle.tl.x) * v,
    y: triangle.tl.y + (triangle.tr.y - triangle.tl.y) * u + (triangle.bl.y - triangle.tl.y) * v
  };
}

function alignmentRatio(frame, x, y, dx, dy, expectedModule) {
  const runs = [0, 0, 0, 0, 0];
  let step = 0;
  while (step < expectedModule * 2 && pixel(frame, x - dx * step, y - dy * step)) { runs[2] += 1; step += 1; }
  step = 1;
  while (step < expectedModule * 2 && pixel(frame, x + dx * step, y + dy * step)) { runs[2] += 1; step += 1; }
  step = Math.max(1, Math.ceil(runs[2] / 2));
  let count = 0;
  while (step < expectedModule * 4 && !pixel(frame, x - dx * step, y - dy * step)) { count += 1; step += 1; }
  runs[1] = count;
  count = 0;
  while (step < expectedModule * 5 && pixel(frame, x - dx * step, y - dy * step)) { count += 1; step += 1; }
  runs[0] = count;
  step = Math.max(1, Math.ceil(runs[2] / 2));
  count = 0;
  while (step < expectedModule * 4 && !pixel(frame, x + dx * step, y + dy * step)) { count += 1; step += 1; }
  runs[3] = count;
  count = 0;
  while (step < expectedModule * 5 && pixel(frame, x + dx * step, y + dy * step)) { count += 1; step += 1; }
  runs[4] = count;
  if (runs.some((value) => value < Math.max(1, expectedModule * 0.28))) return false;
  const mean = runs.reduce((sum, value) => sum + value, 0) / 5;
  return runs.every((value) => Math.abs(value - mean) <= mean * 0.9);
}

function findAlignment(frame, triangle) {
  const predicted = affineProject(triangle, 18, 18);
  const module = triangle.module;
  const radius = Math.max(6, Math.round(module * 4.5));
  const step = Math.max(1, Math.floor(module / 3));
  let best = null;
  for (let y = Math.max(0, Math.round(predicted.y - radius)); y <= Math.min(frame.height - 1, predicted.y + radius); y += step) {
    for (let x = Math.max(0, Math.round(predicted.x - radius)); x <= Math.min(frame.width - 1, predicted.x + radius); x += step) {
      if (!pixel(frame, x, y)) continue;
      if (!alignmentRatio(frame, x, y, 1, 0, module) || !alignmentRatio(frame, x, y, 0, 1, module)) continue;
      const distance = Math.hypot(x - predicted.x, y - predicted.y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best;
}

function solveLinear(matrix) {
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-8) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let item = column; item <= size; item += 1) matrix[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      if (!factor) continue;
      for (let item = column; item <= size; item += 1) matrix[row][item] -= factor * matrix[column][item];
    }
  }
  return matrix.map((row) => row[size]);
}

function homography(points) {
  const equations = [];
  for (const point of points) {
    const { x, y, px, py } = point;
    equations.push([x, y, 1, 0, 0, 0, -px * x, -px * y, px]);
    equations.push([0, 0, 0, x, y, 1, -py * x, -py * y, py]);
  }
  const coefficients = solveLinear(equations);
  if (!coefficients) return null;
  return (x, y) => {
    const denominator = coefficients[6] * x + coefficients[7] * y + 1;
    return {
      x: (coefficients[0] * x + coefficients[1] * y + coefficients[2]) / denominator,
      y: (coefficients[3] * x + coefficients[4] * y + coefficients[5]) / denominator
    };
  };
}

function projector(frame, triangle) {
  const alignment = findAlignment(frame, triangle);
  if (!alignment) return (x, y) => affineProject(triangle, x, y);
  return homography([
    { x: 3, y: 3, px: triangle.tl.x, py: triangle.tl.y },
    { x: 21, y: 3, px: triangle.tr.x, py: triangle.tr.y },
    { x: 3, y: 21, px: triangle.bl.x, py: triangle.bl.y },
    { x: 18, y: 18, px: alignment.x, py: alignment.y }
  ]) || ((x, y) => affineProject(triangle, x, y));
}

function sampledMatrix(frame, triangle) {
  const project = projector(frame, triangle);
  return Array.from({ length: QR_SIZE }, (_, y) => Array.from({ length: QR_SIZE }, (_, x) => {
    const point = project(x, y);
    const radius = Math.max(0, triangle.module * 0.18);
    if (radius < 0.7) return Boolean(pixel(frame, point.x, point.y));
    let votes = 0;
    for (const [dx, dy] of [[0, 0], [-radius, 0], [radius, 0], [0, -radius], [0, radius]]) votes += pixel(frame, point.x + dx, point.y + dy);
    return votes >= 3;
  }));
}

function functionModules() {
  const functions = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false));
  const mark = (x, y) => {
    if (x >= 0 && x < QR_SIZE && y >= 0 && y < QR_SIZE) functions[y][x] = true;
  };
  const finder = (centerX, centerY) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) mark(centerX + dx, centerY + dy);
  };
  finder(3, 3);
  finder(QR_SIZE - 4, 3);
  finder(3, QR_SIZE - 4);
  for (let index = 0; index < QR_SIZE; index += 1) {
    if (!functions[6][index]) mark(index, 6);
    if (!functions[index][6]) mark(6, index);
  }
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) mark(18 + dx, 18 + dy);
  for (let index = 0; index <= 5; index += 1) mark(8, index);
  mark(8, 7); mark(8, 8); mark(7, 8);
  for (let index = 9; index < 15; index += 1) mark(14 - index, 8);
  for (let index = 0; index < 8; index += 1) mark(QR_SIZE - 1 - index, 8);
  for (let index = 8; index < 15; index += 1) mark(8, QR_SIZE - 15 + index);
  mark(8, QR_SIZE - 8);
  return functions;
}

const FUNCTION_MODULES = functionModules();

function dataCodewords(matrix) {
  const bits = [];
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? QR_SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (FUNCTION_MODULES[y][x]) continue;
        let value = Boolean(matrix[y][x]);
        if ((x + y) % 2 === 0) value = !value;
        bits.push(value ? 1 : 0);
      }
    }
  }
  const bytes = [];
  for (let offset = 0; offset + 7 < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[offset + bit];
    bytes.push(byte);
  }
  return bytes;
}

function readBits(bytes, offset, count) {
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    const bit = offset + index;
    value = (value << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
  }
  return value;
}

function decodePayload(matrix) {
  const bytes = dataCodewords(matrix);
  if (bytes.length < 4) return null;
  if (readBits(bytes, 0, 4) !== 0x4) return null;
  const length = readBits(bytes, 4, 8);
  if (length < 4 || length > 32) return null;
  let bitOffset = 12;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(readBits(bytes, bitOffset, 8));
    bitOffset += 8;
  }
  return /^TV2:[A-Za-z0-9_-]{22}$/.test(text) ? text : null;
}

export function decodeTvActivationQr(imageData) {
  const frame = binaryFrame(imageData);
  if (!frame) return null;
  const candidates = finderCandidates(frame);
  if (candidates.length < 3) return null;
  const triangle = chooseFinderTriangle(candidates);
  if (!triangle) return null;
  return decodePayload(sampledMatrix(frame, triangle));
}

export function recommendedQrFrameSize(videoWidth, videoHeight) {
  const width = Math.max(1, Number(videoWidth) || 1);
  const height = Math.max(1, Number(videoHeight) || 1);
  const scale = Math.min(1, MAX_FRAME_WIDTH / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
