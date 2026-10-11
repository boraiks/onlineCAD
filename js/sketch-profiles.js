(function (cad) {
  'use strict';

  const precision = 1e6;
  const epsilon = 1e-9;
  const cache = new WeakMap();
  const keyOf = point => point.map(value => Math.round(value * precision)).join(',');
  const pointOf = key => key.split(',').map(value => Number(value) / precision);
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const interpolate = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const areaOf = points => points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  function sourceSegments(sketch) {
    const segments = [];
    const add = (id, start, end) => segments.push({ id, start, end, cuts: [0, 1] });
    for (const entity of sketch.entities) {
      if (entity.construction) continue;
      if (entity.type === 'line') add(entity.id, entity.start, entity.end);
      else if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        corners.forEach((point, index) => add(entity.id, point, corners[(index + 1) % 4]));
      } else if (entity.type === 'circle') {
        // The sketch keeps its exact radius; the closed profile uses a
        // bounded, radius-aware outline for selection and extrusion.
        const count = cad.sketchGeometry.curveSegments(entity.radius);
        const points = Array.from({ length: count }, (_, index) => {
          const angle = index * Math.PI * 2 / count;
          return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
        });
        points.forEach((point, index) => add(entity.id, point, points[(index + 1) % count]));
      } else if (entity.type === 'arc') {
        let sweep = entity.endAngle - entity.startAngle;
        if (entity.counterClockwise) {
          if (sweep > 0) sweep -= Math.PI * 2;
        } else {
          if (sweep < 0) sweep += Math.PI * 2;
        }
        const count = cad.sketchGeometry.curveSegments(entity.radius, sweep);
        const points = Array.from({ length: count + 1 }, (_, index) => {
          const angle = entity.startAngle + sweep * (index / count);
          return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
        });
        for (let i = 0; i < count; i++) {
          add(entity.id, points[i], points[i + 1]);
        }
      }
    }
    return segments;
  }

  function addCut(segment, value) {
    if (value >= -epsilon && value <= 1 + epsilon) segment.cuts.push(Math.max(0, Math.min(1, value)));
  }

  function splitPair(first, second) {
    if (Math.max(first.start[0], first.end[0]) + epsilon < Math.min(second.start[0], second.end[0]) ||
      Math.max(second.start[0], second.end[0]) + epsilon < Math.min(first.start[0], first.end[0]) ||
      Math.max(first.start[1], first.end[1]) + epsilon < Math.min(second.start[1], second.end[1]) ||
      Math.max(second.start[1], second.end[1]) + epsilon < Math.min(first.start[1], first.end[1])) return;
    const r = subtract(first.end, first.start);
    const s = subtract(second.end, second.start);
    const between = subtract(second.start, first.start);
    const denominator = cross(r, s);
    if (Math.abs(denominator) > epsilon) {
      const t = cross(between, s) / denominator;
      const u = cross(between, r) / denominator;
      if (t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon) {
        addCut(first, t);
        addCut(second, u);
      }
      return;
    }
    if (Math.abs(cross(between, r)) > epsilon) return;
    const lengthR = r[0] * r[0] + r[1] * r[1];
    const lengthS = s[0] * s[0] + s[1] * s[1];
    if (lengthR < epsilon || lengthS < epsilon) return;
    for (const point of [second.start, second.end]) {
      addCut(first, ((point[0] - first.start[0]) * r[0] + (point[1] - first.start[1]) * r[1]) / lengthR);
    }
    for (const point of [first.start, first.end]) {
      addCut(second, ((point[0] - second.start[0]) * s[0] + (point[1] - second.start[1]) * s[1]) / lengthS);
    }
  }

  function splitSegments(sketch) {
    const segments = sourceSegments(sketch);
    const ordered = segments.map(segment => ({ segment,
      minX: Math.min(segment.start[0], segment.end[0]),
      maxX: Math.max(segment.start[0], segment.end[0]),
      minY: Math.min(segment.start[1], segment.end[1]),
      maxY: Math.max(segment.start[1], segment.end[1]) }))
      .sort((a, b) => a.minX - b.minX);
    const active = [];
    for (const current of ordered) {
      for (let index = active.length - 1; index >= 0; index--) {
        if (active[index].maxX + epsilon < current.minX) active.splice(index, 1);
      }
      for (const candidate of active) {
        if (candidate.maxY + epsilon < current.minY || current.maxY + epsilon < candidate.minY) continue;
        splitPair(candidate.segment, current.segment);
      }
      active.push(current);
    }
    const unique = new Map();
    for (const segment of segments) {
      const cuts = [...new Set(segment.cuts.map(value => +value.toFixed(10)))].sort((a, b) => a - b);
      for (let index = 1; index < cuts.length; index++) {
        const from = keyOf(interpolate(segment.start, segment.end, cuts[index - 1]));
        const to = keyOf(interpolate(segment.start, segment.end, cuts[index]));
        if (from === to) continue;
        const key = [from, to].sort().join('|');
        if (!unique.has(key)) unique.set(key, { start: pointOf(from), end: pointOf(to), ids: new Set() });
        unique.get(key).ids.add(segment.id);
      }
    }
    return [...unique.values()];
  }

  // Split contours at crossings, then walk each directed edge with a bounded
  // region on its left. Unclosed branches cannot create a face.
  function boundedProfiles(sketch) {
    const split = splitSegments(sketch);
    const neighbors = new Map();
    split.forEach((segment, index) => {
      const from = keyOf(segment.start), to = keyOf(segment.end);
      if (!neighbors.has(from)) neighbors.set(from, []);
      if (!neighbors.has(to)) neighbors.set(to, []);
      neighbors.get(from).push({ to, index });
      neighbors.get(to).push({ to: from, index });
    });
    const discovered = new Map(), low = new Map(), bridges = new Set();
    let visit = 0;
    const findBridges = (vertex, parentEdge = -1) => {
      discovered.set(vertex, ++visit);
      low.set(vertex, visit);
      for (const { to, index } of neighbors.get(vertex)) {
        if (index === parentEdge) continue;
        if (!discovered.has(to)) {
          findBridges(to, index);
          low.set(vertex, Math.min(low.get(vertex), low.get(to)));
          if (low.get(to) > discovered.get(vertex)) bridges.add(index);
        } else low.set(vertex, Math.min(low.get(vertex), discovered.get(to)));
      }
    };
    for (const vertex of neighbors.keys()) if (!discovered.has(vertex)) findBridges(vertex);
    const lines = split.filter((_, index) => !bridges.has(index));
    const edges = lines.flatMap((entity, index) => [
      { id: index * 2, from: keyOf(entity.start), to: keyOf(entity.end), entityIds: entity.ids, reverse: index * 2 + 1 },
      { id: index * 2 + 1, from: keyOf(entity.end), to: keyOf(entity.start), entityIds: entity.ids, reverse: index * 2 },
    ]);
    const adjacency = new Map();
    const coordinates = new Map();
    lines.forEach(entity => {
      coordinates.set(keyOf(entity.start), entity.start);
      coordinates.set(keyOf(entity.end), entity.end);
    });
    edges.forEach(edge => {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from).push(edge);
    });
    for (const [vertex, outgoing] of adjacency) {
      const from = coordinates.get(vertex);
      outgoing.sort((a, b) => {
        const angle = edge => {
          const to = coordinates.get(edge.to);
          return Math.atan2(to[1] - from[1], to[0] - from[0]);
        };
        return angle(a) - angle(b);
      });
    }
    const visited = new Set();
    const profiles = [];
    for (const seed of edges) {
      if (visited.has(seed.id)) continue;
      let current = seed;
      const points = [];
      const vertices = [];
      const entityIds = new Set();
      for (let count = 0; count <= edges.length; count++) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        vertices.push(current.from);
        points.push([...coordinates.get(current.from)]);
        for (const id of current.entityIds) entityIds.add(id);
        const outgoing = adjacency.get(current.to);
        const reverseIndex = outgoing.findIndex(edge => edge.id === current.reverse);
        current = outgoing[(reverseIndex - 1 + outgoing.length) % outgoing.length];
        if (current.id === seed.id) break;
      }
      if (current.id !== seed.id || points.length < 3 || new Set(vertices).size !== vertices.length || areaOf(points) <= 1e-8) continue;
      const sources = [...entityIds].sort();
      const id = sources.length === 1 ? `${sketch.id}:${sources[0]}` : `${sketch.id}:face:${[...vertices].sort().join(';')}`;
      profiles.push({ id, sketch, entityIds: sources, points });
    }
    // Independent nested contours bound annular regions. Attach immediate
    // children as holes while leaving each child selectable in its own right.
    for (const profile of profiles) {
      const containing = profiles.filter(candidate => candidate !== profile &&
        areaOf(candidate.points) > areaOf(profile.points) + epsilon &&
        profile.points.every(point => cad.canvas.pointInPolygon(point, candidate.points)));
      if (!containing.length) continue;
      const parent = containing.reduce((smallest, candidate) =>
        !smallest || areaOf(candidate.points) < areaOf(smallest.points) ? candidate : smallest, null);
      (parent.holes ||= []).push(profile.points);
    }
    return profiles;
  }

  function fromSketch(sketch) {
    const signature = sketch.revision ?? sketch.entities.map(entity => entity.id).join('|');
    const cached = cache.get(sketch);
    if (cached?.signature === signature) return cached.profiles;
    const profiles = boundedProfiles(sketch);
    cache.set(sketch, { signature, profiles });
    return profiles;
  }

  function hitTest(profiles, screenPoint, project) {
    let best = null;
    let smallestArea = Infinity;
    for (const profile of profiles) {
      const screenPolygon = profile.points.map(point => project(profile.sketch, point));
      const area = Math.abs(areaOf(screenPolygon));
      const inHole = profile.holes?.some(hole => cad.canvas.pointInPolygon(screenPoint,
        hole.map(point => project(profile.sketch, point))));
      if (area > 1 && area < smallestArea && !inHole && cad.canvas.pointInPolygon(screenPoint, screenPolygon)) {
        best = profile;
        smallestArea = area;
      }
    }
    return best;
  }

  cad.sketchProfiles = { fromSketch, hitTest };
})(window.WebCAD = window.WebCAD || {});
