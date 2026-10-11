(function (cad) {
  'use strict';

  const tolerance = 0.0015;
  const cell = value => Math.round(value / tolerance);
  const cellKey = (x, y) => `${x},${y}`;

  function endpoints(entity) {
    if (entity.type === 'line' || entity.type === 'arc') return [entity.start, entity.end];
    if (entity.type === 'rectangle') {
      const [x1, y1] = entity.start, [x2, y2] = entity.end;
      return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }
    return [];
  }

  function connectedIds(sketch, seedId) {
    const seed = sketch?.entities?.find(entity => entity.id === seedId);
    if (!seed) return new Set();
    const result = new Set([seedId]);
    const buckets = new Map();
    const pointsById = new Map();
    for (const entity of sketch.entities) {
      if (Boolean(entity.construction) !== Boolean(seed.construction)) continue;
      const points = endpoints(entity);
      if (!points.length) continue;
      pointsById.set(entity.id, points);
      for (const point of points) {
        const key = cellKey(cell(point[0]), cell(point[1]));
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ id: entity.id, point });
      }
    }
    const queue = [seedId];
    for (let index = 0; index < queue.length; index++) {
      for (const point of pointsById.get(queue[index]) || []) {
        const x = cell(point[0]), y = cell(point[1]);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          for (const candidate of buckets.get(cellKey(x + dx, y + dy)) || []) {
            if (result.has(candidate.id) ||
              Math.hypot(candidate.point[0] - point[0], candidate.point[1] - point[1]) > tolerance) continue;
            result.add(candidate.id);
            queue.push(candidate.id);
          }
        }
      }
    }
    return result;
  }

  cad.sketchChain = { endpoints, connectedIds };
})(window.WebCAD = window.WebCAD || {});
