(function (cad) {
  'use strict';

  const { cross, dot } = cad.math;
  const EPSILON = 1e-6;
  const areaOf = points => points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  const roundMillimetres = value => Math.round(value * 1000) / 1000;
  function snapExtrudeDistance(distance) {
    const sign = distance < 0 ? -1 : 1;
    const val = Math.abs(distance);
    if (val < 0.25) return sign * (val < 0.001 ? 0.001 : +(val.toFixed(3)));
    const nearest5 = Math.round(val / 5) * 5;
    if (nearest5 > 0 && Math.abs(val - nearest5) <= 0.35) return sign * nearest5;
    const nearestInt = Math.round(val);
    const intThresh = nearestInt <= 10 ? 0.25 : 0.20;
    if (nearestInt > 0 && Math.abs(val - nearestInt) <= intThresh) return sign * nearestInt;
    const nearestHalf = Math.round(val * 2) / 2;
    if (nearestHalf > 0) return sign * nearestHalf;
    return sign * +(val.toFixed(3));
  }
  const screenSegmentDistance = (point, start, end) => {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0;
    return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
  };
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.0015;
  const normalLeft = (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length < EPSILON ? null : [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };

  function curvePoints(entity) {
    if (entity.type === 'line') return [[...entity.start], [...entity.end]];
    if (entity.type === 'rectangle') {
      const [x1, y1] = entity.start, [x2, y2] = entity.end;
      return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }
    if (entity.type === 'circle') {
      const count = cad.sketchGeometry?.curveSegments(entity.radius) || 96;
      return Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count;
        return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
      });
    }
    if (entity.type !== 'arc') return [];
    let sweep = entity.endAngle - entity.startAngle;
    if (entity.counterClockwise) {
      if (sweep > 0) sweep -= Math.PI * 2;
    } else if (sweep < 0) sweep += Math.PI * 2;
    const count = cad.sketchGeometry?.curveSegments(entity.radius, sweep) || 48;
    return Array.from({ length: count + 1 }, (_, index) => {
      const angle = entity.startAngle + sweep * index / count;
      return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
    });
  }

  function thinPathFromEntity(sketch, entityId, chaining = true) {
    const seed = sketch.entities.find(entity => entity.id === entityId && !entity.construction);
    if (!seed || !['line', 'arc', 'circle', 'rectangle'].includes(seed.type)) return null;
    if (seed.type === 'circle' || seed.type === 'rectangle')
      return { id: `${sketch.id}:${seed.id}`, sketch, entityIds: [seed.id], points: curvePoints(seed), closed: true };
    const ids = chaining ? cad.sketchChain.connectedIds(sketch, seed.id) : new Set([seed.id]);
    let entries = sketch.entities.filter(entity => ids.has(entity.id) &&
      !entity.construction && ['line', 'arc'].includes(entity.type));
    const nodes = [];
    const nodeFor = point => {
      let index = nodes.findIndex(node => near(node, point));
      if (index < 0) { index = nodes.length; nodes.push(point); }
      return index;
    };
    const buildGraph = items => {
      nodes.length = 0;
      const edges = items.map(entity => ({ entity, from: nodeFor(entity.start), to: nodeFor(entity.end) }));
      const adjacency = nodes.map(() => []);
      edges.forEach((edge, index) => { adjacency[edge.from].push(index); adjacency[edge.to].push(index); });
      return { edges, adjacency };
    };
    let { edges, adjacency } = buildGraph(entries);
    if (adjacency.some(edgeIds => edgeIds.length > 2)) {
      entries = [seed];
      ({ edges, adjacency } = buildGraph(entries));
    }
    const firstEnd = adjacency.findIndex(edgeIds => edgeIds.length === 1);
    let current = firstEnd >= 0 ? firstEnd : edges[0].from;
    const used = new Set();
    const points = [];
    const entityIds = [];
    while (used.size < edges.length) {
      const edgeIndex = adjacency[current].find(index => !used.has(index));
      if (edgeIndex == null) break;
      const edge = edges[edgeIndex];
      used.add(edgeIndex);
      entityIds.push(edge.entity.id);
      const forward = edge.from === current;
      const segment = curvePoints(edge.entity);
      if (!forward) segment.reverse();
      points.push(...(points.length ? segment.slice(1) : segment));
      current = forward ? edge.to : edge.from;
    }
    if (used.size !== edges.length || points.length < 2) return null;
    const closed = points.length > 2 && near(points[0], points.at(-1));
    if (closed) points.pop();
    return { id: `${sketch.id}:${[...entityIds].sort().join(',')}`, sketch, entityIds, points, closed };
  }

  function offsetPoints(points, distance, closed, outward = false) {
    const result = [];
    for (let index = 0; index < points.length; index++) {
      const previous = index > 0 ? index - 1 : closed ? points.length - 1 : 0;
      const next = index + 1 < points.length ? index + 1 : closed ? 0 : points.length - 1;
      const before = previous === index ? null : normalLeft(points[previous], points[index]);
      const after = next === index ? null : normalLeft(points[index], points[next]);
      const sign = outward ? -1 : 1;
      const n1 = before || after;
      const n2 = after || before;
      if (!n1 || !n2) return null;
      const denominator = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      if (denominator < 0.08) return null;
      const scale = Math.min(4, 1 / denominator) * distance * sign;
      result.push([points[index][0] + (n1[0] + n2[0]) * scale,
      points[index][1] + (n1[1] + n2[1]) * scale]);
    }
    return result;
  }

  function makeThinBody(path, thickness, direction, first, second = 0) {
    if (!path || !Number.isFinite(thickness) || thickness <= EPSILON || !limits(direction, first, second)) return null;
    const raw = path.points.filter((point, index, points) => index === 0 || !near(point, points[index - 1]));
    if (raw.length < (path.closed ? 3 : 2)) return null;
    let points = raw.map(point => [...point]);
    if (path.closed && areaOf(points) < 0) points.reverse();
    const half = thickness / 2;
    let outline, holes = [];
    if (path.closed) {
      outline = offsetPoints(points, half, true, true);
      const inner = offsetPoints(points, -half, true, true);
      if (!outline || !inner || areaOf(inner) <= EPSILON ||
        !inner.every(point => cad.canvas.pointInPolygon(point, outline))) return null;
      holes = [inner];
    } else {
      const left = offsetPoints(points, half, false);
      const right = offsetPoints(points, -half, false);
      if (!left || !right) return null;
      outline = [...left, ...right.reverse()];
      if (areaOf(outline) < 0) outline.reverse();
    }
    return makeBody({ id: path.id, sketch: path.sketch, points: outline, holes }, direction, first, second);
  }

  function limits(direction, first, second = 0) {
    if (!Number.isFinite(first) || Math.abs(first) <= EPSILON) return null;
    if (direction === 'one') return [Math.min(0, first), Math.max(0, first)];
    if (first < 0) return null;
    if (direction === 'symmetric') return [-first / 2, first / 2];
    if (direction === 'two' && Number.isFinite(second) && second > EPSILON) return [-second, first];
    return null;
  }

  function makeBody(profile, direction, first, second = 0) {
    const range = limits(direction, first, second);
    if (!profile || !range || profile.points.length < 3) return null;
    const { u, v, origin = [0, 0, 0] } = cad.planes.grid[profile.sketch.plane];
    const normal = cross(u, v);
    return {
      profileId: profile.id,
      faceSourceBodyId: profile.face?.body?.id || null,
      plane: profile.sketch.plane,
      origin: [...origin],
      points: profile.points.map(point => [...point]),
      holes: (profile.holes || []).map(hole => hole.map(point => [...point])),
      start: range[0], end: range[1],
      normal: [...normal],
    };
  }

  const regions = body => body.cells || [body];
  const insideRegion = (region, point) => cad.canvas.pointInPolygon(point, region.points) &&
    !(region.holes || []).some(hole => cad.canvas.pointInPolygon(point, hole));
  const loops = region => [region.points, ...(region.holes || [])];
  function boundariesTouch(first, second) {
    const cross2 = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) -
      (b[1] - a[1]) * (p[0] - a[0]);
    const onSegment = (a, b, p) => Math.abs(cross2(a, b, p)) <= EPSILON &&
      p[0] >= Math.min(a[0], b[0]) - EPSILON && p[0] <= Math.max(a[0], b[0]) + EPSILON &&
      p[1] >= Math.min(a[1], b[1]) - EPSILON && p[1] <= Math.max(a[1], b[1]) + EPSILON;
    for (const regionA of regions(first)) for (const regionB of regions(second))
      for (const loopA of loops(regionA)) for (const loopB of loops(regionB))
        for (let i = 0; i < loopA.length; i++) for (let j = 0; j < loopB.length; j++) {
          const a = loopA[i], b = loopA[(i + 1) % loopA.length];
          const c = loopB[j], d = loopB[(j + 1) % loopB.length];
          const abC = cross2(a, b, c), abD = cross2(a, b, d);
          const cdA = cross2(c, d, a), cdB = cross2(c, d, b);
          if ((abC * abD < 0 && cdA * cdB < 0) ||
            onSegment(a, b, c) || onSegment(a, b, d) ||
            onSegment(c, d, a) || onSegment(c, d, b)) return true;
        }
    return false;
  }

  // Boolean operations on aligned extrusions use the same planar arrangement
  // as sketch profiles. This preserves curved outlines at sketch resolution.
  function makeBooleanBody(target, tools, operation) {
    if (!target || !tools.length || !['join', 'cut', 'intersect'].includes(operation) ||
      tools.some(body => body.plane !== target.plane ||
        Math.abs(body.start - target.start) > EPSILON || Math.abs(body.end - target.end) > EPSILON)) return null;
    const entities = [];
    let next = 0;
    for (const body of [target, ...tools]) for (const region of regions(body)) {
      for (const loop of [region.points, ...(region.holes || [])]) {
        loop.forEach((point, index) => entities.push({
          id: `boolean-edge-${next++}`, type: 'line', start: point, end: loop[(index + 1) % loop.length]
        }));
      }
    }
    const sketch = { id: 'boolean', revision: 0, entities };
    let overlapping = false;
    const cells = cad.sketchProfiles.fromSketch(sketch).filter(profile => {
      const a = profile.points[0], b = profile.points[1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) return false;
      const point = [(a[0] + b[0]) / 2 - dy / length * 1e-5,
        (a[1] + b[1]) / 2 + dx / length * 1e-5];
      const inTarget = regions(target).some(region => insideRegion(region, point));
      const inTool = tools.some(body => regions(body).some(region => insideRegion(region, point)));
      if (inTarget && inTool) overlapping = true;
      return operation === 'join' ? inTarget || inTool
        : operation === 'cut' ? inTarget && !inTool : inTarget && inTool;
    }).map(profile => ({ points: profile.points, holes: profile.holes || [] }));
    if (!overlapping && (operation !== 'join' || !tools.some(body => boundariesTouch(target, body)))) return null;
    return { ...target, cells };
  }

  function vertices(body, offset, points = body.points) {
    const { u, v } = cad.planes.grid[body.plane];
    const origin = body.origin || cad.planes.grid[body.plane].origin || [0, 0, 0];
    return points.map(point => u.map((value, index) =>
      origin[index] + value * point[0] + v[index] * point[1] + body.normal[index] * offset));
  }

  function bodyBounds(body) {
    if (!body) return null;
    if (body.mesh?.vertices?.length) {
      const v = body.mesh.vertices;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { minX, minY, minZ, maxX, maxY, maxZ };
    }
    if (body.cells?.length) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const cell of body.cells) {
        const b = bodyBounds({ ...body, cells: null, points: cell.points, holes: cell.holes });
        if (b) {
          minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); minZ = Math.min(minZ, b.minZ);
          maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); maxZ = Math.max(maxZ, b.maxZ);
        }
      }
      return Number.isFinite(minX) ? { minX, minY, minZ, maxX, maxY, maxZ } : null;
    }
    if (body.points?.length && body.normal && cad.planes?.grid?.[body.plane]) {
      const pts = [
        ...vertices(body, body.start),
        ...vertices(body, body.end)
      ];
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const [x, y, z] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { minX, minY, minZ, maxX, maxY, maxZ };
    }
    return null;
  }

  function boxesOverlap(a, b, tol = 0.01) {
    if (!a || !b) return false;
    return a.minX < b.maxX - tol && a.maxX > b.minX + tol &&
           a.minY < b.maxY - tol && a.maxY > b.minY + tol &&
           a.minZ < b.maxZ - tol && a.maxZ > b.minZ + tol;
  }

  function toolIntersectsTarget(target, tools) {
    const boxT = bodyBounds(target);
    if (!boxT) return false;
    const overlappingTools = tools.filter(tool => {
      const boxB = bodyBounds(tool);
      return boxesOverlap(boxT, boxB, 0.0001);
    });
    if (!overlappingTools.length) return false;

    if (cad.solidKernel?.ready()) {
      try {
        return cad.solidKernel.intersectsBody(target, overlappingTools);
      } catch { /* fallback */ }
    }

    if (target.plane && overlappingTools[0].plane && target.plane === overlappingTools[0].plane) {
      try {
        const cut = makeBooleanBody(target, overlappingTools, 'cut');
        if (cut) return true;
        return false;
      } catch { /* fallback */ }
    }

    return true;
  }

  function checkAnyIntersection(tools, targets) {
    if (!tools?.length || !targets?.length) return false;
    return targets.some(target => target.visible !== false && toolIntersectsTarget(target, tools));
  }

  function faces(body) {
    if (body.mesh) {
      const { vertices, triangles } = body.mesh;
      const result = [];
      for (let index = 0; index < triangles.length; index += 3) {
        const corners = [0, 1, 2].map(offset => {
          const vertex = triangles[index + offset] * 3;
          return vertices.slice(vertex, vertex + 3);
        });
        const a = corners[1].map((value, axis) => value - corners[0][axis]);
        const b = corners[2].map((value, axis) => value - corners[0][axis]);
        const normal = cross(a, b);
        result.push({ vertices: corners, normal, kind: Math.abs(normal[2]) > Math.hypot(normal[0], normal[1]) ? 'cap' : 'side', smooth: true, mesh: true });
      }
      return result;
    }
    if (body.cells) {
      const caps = [], boundary = new Map();
      for (const cell of body.cells) {
        const generated = faces({ ...body, cells: null, points: cell.points, holes: cell.holes });
        caps.push(...generated.slice(0, 2).map(face => ({ ...face, smooth: true })));
        for (const face of generated.slice(2)) {
          const key = [face.vertices[0], face.vertices[1]]
            .map(point => point.map(value => Math.round(value * 1e6)).join(','))
            .sort().join('|');
          if (boundary.has(key)) boundary.delete(key);
          else boundary.set(key, face);
        }
      }
      return [...caps, ...boundary.values()];
    }
    const back = vertices(body, body.start);
    const front = vertices(body, body.end);
    const count = back.length;
    const backHoles = body.holes.map(hole => vertices(body, body.start, hole));
    const frontHoles = body.holes.map(hole => vertices(body, body.end, hole));
    const result = [
      { vertices: back, holes: backHoles, normal: body.normal.map(value => -value), kind: 'cap' },
      { vertices: front, holes: frontHoles, normal: body.normal, kind: 'cap' },
    ];
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const edge = back[next].map((value, axis) => value - back[index][axis]);
      result.push({
        vertices: [back[index], back[next], front[next], front[index]],
        normal: cross(edge, body.normal), kind: 'side', smooth: count >= 32
      });
    }
    backHoles.forEach((hole, holeIndex) => {
      const frontHole = frontHoles[holeIndex];
      for (let index = 0; index < hole.length; index++) {
        const next = (index + 1) % hole.length;
        const edge = hole[next].map((value, axis) => value - hole[index][axis]);
        result.push({
          vertices: [hole[index], hole[next], frontHole[next], frontHole[index]],
          normal: cross(body.normal, edge), kind: 'side', smooth: hole.length >= 32
        });
      }
    });
    return result;
  }

  // Committed bodies and preview bodies keep the same geometry object between
  // redraws. Reuse their 3D faces while the camera moves.
  const faceCache = new WeakMap();
  const edgeCache = new WeakMap();
  function renderFaces(body) {
    let cached = faceCache.get(body);
    if (!cached) {
      cached = faces(body);
      faceCache.set(body, cached);
    }
    return cached;
  }

  const vertexKey = point => point.map(value => Math.round(value * 1e5)).join(',');
  const edgeKey = (a, b) => [vertexKey(a), vertexKey(b)].sort().join('|');
  function bodyEdges(body) {
    let edges = edgeCache.get(body);
    if (edges) return edges;
    edges = new Map();
    for (const face of renderFaces(body)) {
      for (const loop of [face.vertices, ...(face.holes || [])]) {
        loop.forEach((a, index) => {
          const b = loop[(index + 1) % loop.length];
          const key = edgeKey(a, b);
          if (!edges.has(key)) edges.set(key, []);
          const length = Math.hypot(...face.normal) || 1;
          edges.get(key).push(face.normal.map(value => value / length));
        });
      }
    }
    edgeCache.set(body, edges);
    return edges;
  }

  function visibleFeature(normals, depth) {
    if (!normals?.length) return false;
    const visible = normals.filter(normal => dot(normal, depth) > EPSILON);
    if (!visible.length) return false;
    if (normals.length === 1 || visible.length !== normals.length) return true;
    return normals.some((normal, index) => normals.slice(index + 1).some(other => dot(normal, other) < 0.965));
  }

  function renderBodies(context, project, camera, bodies, preview = false, colorMode = 'blue') {
    if (!preview && cad.bodyRenderer?.render(context, project, camera, bodies)) return;
    const isExtrudeActive = preview || Boolean(cad.app?.extrudeController?.active || cad.extrudeController?.active);
    const showMesh = !isExtrudeActive && cad.settings?.showMesh === true;
    const isCut = colorMode === 'cut' || preview === 'cut';
    const visible = [];
    for (const body of bodies) {
      if (body.visible === false) continue;
      for (const face of renderFaces(body)) {
        if (dot(face.normal, camera.depth) <= EPSILON) continue;
        visible.push({ ...face, body, depth: face.vertices.reduce((sum, vertex) => sum + dot(vertex, camera.depth), 0) / face.vertices.length });
      }
    }
    visible.sort((a, b) => a.depth - b.depth);
    context.save();
    for (const face of visible) {
      context.beginPath();
      face.vertices.forEach((vertex, index) => {
        const [x, y] = project(vertex);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
      for (const hole of face.holes || []) {
        hole.forEach((vertex, index) => {
          const [x, y] = project(vertex);
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        });
        context.closePath();
      }
      context.fillStyle = preview
        ? isCut
          ? face.kind === 'cap' ? 'rgba(235, 55, 55, .72)' : 'rgba(205, 40, 40, .58)'
          : face.kind === 'cap' ? 'rgba(62, 156, 225, .69)' : 'rgba(48, 136, 205, .57)'
        : face.kind === 'cap' ? '#aaa9a1' : '#898880';
      context.fill('evenodd');
      if (!preview && (face.mesh || face.smooth)) {
        context.strokeStyle = context.fillStyle;
        context.lineWidth = 0.5;
        context.stroke();
      }
      if (preview || cad.settings?.displayStyle === 'shaded-edges' || showMesh) {
        const edges = bodyEdges(face.body);
        context.strokeStyle = isCut ? '#c62828' : preview ? '#167bb4' : '#626970';
        context.lineWidth = isCut ? 1.4 : preview ? 1.3 : 1.1;
        for (const loop of [face.vertices, ...(face.holes || [])]) {
          loop.forEach((a, index) => {
            const b = loop[(index + 1) % loop.length];
            if (!showMesh && !visibleFeature(edges.get(edgeKey(a, b)), camera.depth)) return;
            const from = project(a), to = project(b);
            context.beginPath(); context.moveTo(from[0], from[1]);
            context.lineTo(to[0], to[1]); context.stroke();
          });
        }
      }
    }
    context.restore();
  }

  class ExtrudeController {
    constructor({ canvas, panel, hud = null, document, camera, modelView, history, profileSelection, onChange, onBodiesChange, onStatus, onError }) {
      Object.assign(this, { canvas, panel, hud, document, camera, modelView, history, profileSelection, onChange, onBodiesChange, onStatus, onError });
      cad.extrudeController = this;
      this.bodies = [];
      this.nextBodyId = 1;
      this.faceProfile = null;
      this.selectedIds = new Set();
      this.selectedThin = new Map();
      this.thinIndexes = new Map();
      this.previewCache = null;
      this.kernelFailed = false;
      this.booleanError = null;
      this.kernelError = null;
      this.reportedComputeIssue = null;
      this.meshPreparation = null;
      this.meshFailed = false;
      this.rendererWarning = false;
      this.hoveredId = null;
      this.hoveredFace = null;
      this.hoveredThinIds = new Set();
      this.hoveredArrow = null;
      this.dragArrow = null;
      this.lastPointerEvent = null;
      this.suppressClick = false;
      this.active = false;
      this.lastIntersecting = null;
      this.userManualOperation = null;
      this.autoSwitchedFrom = null;
      this.type = panel.querySelector('#extrudeType');
      this.operation = panel.querySelector('#extrudeOperation');
      this.direction = panel.querySelector('#extrudeDirection');
      this.first = panel.querySelector('#extrudeDistance');
      this.second = panel.querySelector('#extrudeSecondDistance');
      this.hudFirst = hud?.querySelector?.('#extrudeHudFirst') || null;
      this.hudSecond = hud?.querySelector?.('#extrudeHudSecond') || null;
      this.distanceTouched = false;
      this.thickness = panel.querySelector('#extrudeThickness');
      this.thicknessRow = panel.querySelector('#extrudeThicknessRow');
      this.chain = panel.querySelector('#extrudeChain');
      this.chainRow = panel.querySelector('#extrudeChainRow');
      this.help = panel.querySelector('#extrudeHelp');
      this.secondRow = panel.querySelector('#extrudeSecondRow');
      this.count = panel.querySelector('#extrudeCount');
      this.ok = panel.querySelector('#extrudeOk');
      this.bindEvents();
    }

    profiles() {
      const sketches = this.document.sketches.filter(sketch => sketch.visible !== false)
        .flatMap(sketch => cad.sketchProfiles.fromSketch(sketch));
      return this.faceProfile ? [...sketches, this.faceProfile] : sketches;
    }

    makeFaceProfile(face) {
      if (!face?.body?.mesh) return null;
      const plane = cad.bodyFaces.registerPlane(face);
      const sketch = { id: `${plane}-source`, plane, visible: true, entities: [], revision: 0 };
      return {
        id: `${plane}-profile`,
        sketch,
        points: face.points.map(point => [...point]),
        holes: (face.holes || []).map(loop => loop.map(point => [...point])),
        face
      };
    }

    async openFace(face) {
      if (this.active || !face?.body?.mesh) return false;
      try {
        await cad.solidKernel.load();
      } catch (error) {
        this.onError?.({ code: 'CAD-C010', title: 'Compute error',
          reason: `Could not prepare face extrusion: ${error?.message || '3D engine unavailable'}` });
        return false;
      }
      this.faceProfile = this.makeFaceProfile(face);
      this.type.value = 'solid';
      this.direction.value = 'one';
      this.operation.value = 'join';
      if (!this.open()) { this.faceProfile = null; return false; }
      return true;
    }

    open() {
      if (this.active || (!this.document.sketches.length && !this.faceProfile && !this.bodies.length)) return false;
      const preset = this.profileSelection.selectedId;
      this.profileSelection.clear();
      this.selectedIds.clear();
      this.selectedThin.clear();
      this.thinIndexes.clear();
      this.previewCache = null;
      this.suppressClick = false;
      this.hoveredFace = null;
      this.lastIntersecting = null;
      this.userManualOperation = null;
      this.autoSwitchedFrom = null;
      this.first.value = '0';
      this.second.value = '0';
      this.distanceTouched = false;
      if (this.type.value === 'solid' && preset && this.profiles().some(profile => profile.id === preset)) this.selectedIds.add(preset);
      if (this.faceProfile) {
        this.selectedIds.add(this.faceProfile.id);
        if (this.operation) this.operation.value = 'join';
      }
      this.active = true;
      this.panel.hidden = false;
      if (cad.settings) cad.settings.showMesh = false;
      try { localStorage.setItem('onlinecad.showMesh', 'false'); } catch { /* Optional persistence. */ }
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const inspectDropdown = document.querySelector('#inspectDropdown');
        if (inspectDropdown) inspectDropdown.hidden = true;
        const inspectMenuButton = document.querySelector('#inspectMenuButton');
        if (inspectMenuButton) {
          inspectMenuButton.setAttribute('aria-expanded', 'false');
          inspectMenuButton.disabled = true;
        }
        const showMeshOption = document.querySelector('#showMeshOption');
        if (showMeshOption) {
          showMeshOption.setAttribute('aria-checked', 'false');
          showMeshOption.disabled = true;
        }
        const inspectContainer = document.querySelector('#inspectMenuContainer');
        if (inspectContainer) inspectContainer.classList.add('is-disabled');
      }
      const sketch = this.selectedProfiles()[0]?.sketch || this.document.sketches.at(-1);
      if (sketch && cad.planes.grid[sketch.plane]) {
        const { u, v } = cad.planes.grid[sketch.plane];
        const normal = cross(u, v);
        if (Math.abs(dot(normal, this.camera.depth)) > 0.97) {
          const sign = dot(normal, this.camera.depth) >= 0 ? 1 : -1;
          const direction = cad.math.normalize(normal.map((value, index) =>
            sign * value + u[index] * 0.45 + v[index] * 0.35));
          this.camera.animateToDirection(direction, this.onChange);
        }
      }
      if (this.bodies.length && cad.solidKernel && !cad.solidKernel.ready() && !this.kernelFailed) {
        cad.solidKernel.load().catch(() => {});
      }
      this.modelView.render();
      this.update();
      return true;
    }

    close() {
      if (!this.active) return;
      if (typeof document !== 'undefined' && this.panel.contains?.(document.activeElement)) this.canvas.focus();
      const capturedPointer = this.dragArrow?.pointerId;
      this.dragArrow = null;
      if (capturedPointer != null && this.canvas.hasPointerCapture?.(capturedPointer))
        this.canvas.releasePointerCapture(capturedPointer);
      this.active = false;
      this.lastIntersecting = null;
      this.userManualOperation = null;
      this.autoSwitchedFrom = null;
      this.panel?.classList?.remove?.('is-cut');
      this.operation?.classList?.remove?.('is-cut');
      this.ok?.classList?.remove?.('is-cut');
      this.hud?.classList?.remove?.('is-cut');
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        const inspectMenuButton = document.querySelector('#inspectMenuButton');
        if (inspectMenuButton) inspectMenuButton.disabled = false;
        const showMeshOption = document.querySelector('#showMeshOption');
        if (showMeshOption) showMeshOption.disabled = false;
        const inspectContainer = document.querySelector('#inspectMenuContainer');
        if (inspectContainer) inspectContainer.classList.remove('is-disabled');
      }
      this.faceProfile = null;
      this.hoveredFace = null;
      this.reportedComputeIssue = null;
      this.panel.hidden = true;
      if (this.hud) this.hud.hidden = true;
      this.selectedIds.clear();
      this.selectedThin.clear();
      this.previewCache = null;
      this.suppressClick = false;
      this.hoveredId = null;
      this.hoveredThinIds.clear();
      this.hoveredArrow = null;
      this.dragArrow = null;
      this.canvas.classList.remove('is-extrude-arrow', 'is-extrude-arrow-dragging');
      this.canvas.classList.remove('over-profile', 'over-face');
      this.onStatus('3D VIEW');
      this.onChange();
    }

    selectedProfiles() {
      return this.profiles().filter(profile => this.selectedIds.has(profile.id));
    }

    prepareBodyMeshes() {
      const pending = this.bodies.filter(body => body.visible !== false && !body.mesh);
      if (!pending.length || this.meshFailed || !cad.solidKernel) return;
      if (cad.bodyRenderer && !cad.bodyRenderer.initialize()) {
        if (!this.rendererWarning) {
          this.rendererWarning = true;
          this.onError?.({ code: 'CAD-V001', title: 'Display error',
            reason: '3D depth rendering unavailable; using the basic view.' });
        }
        return;
      }
      if (!cad.solidKernel.ready()) {
        if (!this.meshPreparation) this.meshPreparation = cad.solidKernel.load()
          .then(() => {
            this.meshPreparation = null;
            this.prepareBodyMeshes();
            this.onChange();
          })
          .catch(error => {
            this.meshPreparation = null;
            this.meshFailed = true;
            this.onError?.({ code: 'CAD-C007', title: 'Compute error',
              reason: `3D body rendering unavailable: ${error?.message || 'mesh preparation failed'}` });
          });
        return;
      }
      try {
        for (const body of pending) {
          body.mesh = cad.solidKernel.meshBody(body);
          faceCache.delete(body);
          edgeCache.delete(body);
        }
      } catch (error) {
        this.meshFailed = true;
        this.onError?.({ code: 'CAD-C007', title: 'Compute error',
          reason: `3D body rendering unavailable: ${error?.message || 'mesh preparation failed'}` });
      }
    }

    selectedCount() {
      return this.type.value === 'thin' ? this.selectedThin.size : this.selectedProfiles().length;
    }

    toolBodies() {
      return this.type.value === 'thin' ? [...this.selectedThin.values()].map(path =>
        makeThinBody(path, Number(this.thickness.value), this.direction.value,
          Number(this.first.value), Number(this.second.value))).filter(Boolean)
        : this.selectedProfiles().map(profile => makeBody(profile, this.direction.value,
          Number(this.first.value), Number(this.second.value))).filter(Boolean);
    }

    previewBodies(preparedTools = null) {
      const key = [this.type.value, this.operation?.value || 'new', this.direction.value, this.first.value, this.second.value,
      this.thickness.value, JSON.stringify([...this.selectedIds].sort()),
      JSON.stringify([...this.selectedThin.keys()].sort())].join('|');
      if (this.previewCache?.key === key) return this.previewCache.bodies;
      this.booleanError = null;
      const bodies = preparedTools || this.toolBodies();
      let preview = bodies;
      if (this.operation?.value !== 'new') {
        preview = [];
        if (cad.solidKernel && !cad.solidKernel.ready()) return preview;
        const apply = (target, tools) => cad.solidKernel?.ready()
          ? cad.solidKernel.booleanBody(target, tools, this.operation.value)
          : makeBooleanBody(target, tools, this.operation.value);
        const targets = this.bodies.filter(body => body.visible !== false);
        try {
          if (this.operation.value === 'join') {
            let result = null;
            const consumed = new Set();
            for (const target of [...targets].reverse()) {
              result = apply(target, bodies);
              if (result) { consumed.add(target.id); break; }
            }
            if (result) {
              let changed;
              do {
                changed = false;
                for (const target of targets) {
                  if (consumed.has(target.id)) continue;
                  const combined = apply(result, [target]);
                  if (!combined) continue;
                  result = combined;
                  consumed.add(target.id);
                  changed = true;
                }
              } while (changed);
              result.booleanTargets = [...consumed];
              preview = [result];
            }
          } else {
            for (const target of targets) {
              const result = apply(target, bodies);
              if (result) preview.push(result);
            }
          }
        } catch (error) {
          this.booleanError = error.message || 'Invalid 3D geometry';
          preview = [];
        }
      }
      this.previewCache = { key, bodies: preview };
      return preview;
    }

    arrowGeometry() {
      if (!this.active || !this.selectedCount()) return null;
      if (!Number.isFinite(Number(this.first.value)) || !Number.isFinite(Number(this.second.value))) return null;
      const source = this.type.value === 'thin' ? this.selectedThin.values().next().value : this.selectedProfiles()[0];
      if (!source?.points?.length) return null;
      const { u, v } = cad.planes.grid[source.sketch.plane];
      const normal = cross(u, v);
      const xs = source.points.map(point => point[0]);
      const ys = source.points.map(point => point[1]);
      const center = [(Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2];
      const world = this.document.toWorld(source.sketch, center);
      const bounds = this.canvas.getBoundingClientRect();
      const base = this.camera.project(world, bounds.width, bounds.height);
      const normalEnd = this.camera.project(world.map((value, axis) => value + normal[axis]),
        bounds.width, bounds.height);
      const screenUnit = [normalEnd[0] - base[0], normalEnd[1] - base[1]];
      if (Math.hypot(...screenUnit) < 0.15) {
        screenUnit[0] = 0;
        screenUnit[1] = -this.camera.unit(bounds.width, bounds.height) *
          (dot(normal, this.camera.depth) >= 0 ? 1 : -1);
      }
      const first = Number(this.first.value), second = Number(this.second.value);
      const offsets = this.direction.value === 'one' ? [{ side: 'first', offset: first }]
        : this.direction.value === 'symmetric'
          ? [{ side: 'positive', offset: first / 2 }, { side: 'negative', offset: -first / 2 }]
          : [{ side: 'positive', offset: first }, { side: 'negative', offset: -second }];
      const screenLength = Math.hypot(...screenUnit);
      return {
        base, screenUnit, handles: offsets.map(handle => {
          const visibleOffset = Math.abs(handle.offset * screenLength) < 20
            ? (handle.side === 'negative' || handle.offset < 0 ? -20 : 20) / screenLength
            : handle.offset;
          return { ...handle,
            tip: [base[0] + screenUnit[0] * visibleOffset,
              base[1] + screenUnit[1] * visibleOffset] };
        })
      };
    }

    arrowAt(event) {
      const geometry = this.arrowGeometry();
      if (!geometry) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const point = [event.clientX - bounds.left, event.clientY - bounds.top];
      let best = null;
      for (const handle of geometry.handles) {
        const tipDistance = Math.hypot(point[0] - handle.tip[0], point[1] - handle.tip[1]);
        const shaftDistance = screenSegmentDistance(point, geometry.base, handle.tip);
        const distance = tipDistance <= 16 ? tipDistance : shaftDistance <= 8 ? shaftDistance + 16 : Infinity;
        if (distance < (best?.distance ?? Infinity)) best = { ...handle, distance, geometry };
      }
      return best;
    }

    moveArrow(event) {
      if (!this.dragArrow || event.pointerId !== this.dragArrow.pointerId) return;
      const drag = this.dragArrow;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      const [ux, uy] = drag.screenUnit;
      const movement = (dx * ux + dy * uy) / (ux * ux + uy * uy);
      const offset = drag.startOffset + movement;
      if (this.direction.value === 'one') {
        const raw = Math.abs(offset) < 0.001 ? (offset < 0 ? -0.001 : 0.001) : offset;
        const val = event.shiftKey ? raw : snapExtrudeDistance(raw);
        this.first.value = String(roundMillimetres(val));
      } else if (this.direction.value === 'symmetric') {
        const raw = Math.max(0.001, (drag.side === 'positive' ? offset : -offset) * 2);
        const val = event.shiftKey ? raw : snapExtrudeDistance(raw);
        this.first.value = String(roundMillimetres(Math.max(0.001, val)));
      } else if (drag.side === 'positive') {
        const raw = Math.max(0.001, offset);
        const val = event.shiftKey ? raw : snapExtrudeDistance(raw);
        this.first.value = String(roundMillimetres(Math.max(0.001, val)));
      } else {
        const raw = Math.max(0.001, -offset);
        const val = event.shiftKey ? raw : snapExtrudeDistance(raw);
        this.second.value = String(roundMillimetres(Math.max(0.001, val)));
      }
      this.distanceTouched = true;
      this.update();
    }

    renderArrows(context) {
      const geometry = this.arrowGeometry();
      this.renderArrowHud(geometry);
      if (!geometry) return;
      const { base } = geometry;
      const isCut = this.active && this.operation?.value === 'cut';
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const handle of geometry.handles) {
        const [tx, ty] = handle.tip;
        const dx = tx - base[0], dy = ty - base[1];
        const length = Math.hypot(dx, dy);
        if (length < 3) continue;
        const ux = dx / length, uy = dy / length;
        const px = -uy, py = ux;
        context.beginPath();
        context.moveTo(base[0], base[1]);
        context.lineTo(tx - ux * 7, ty - uy * 7);
        context.strokeStyle = '#fff';
        context.lineWidth = 5;
        context.stroke();
        context.strokeStyle = isCut ? '#b71c1c' : '#176fae';
        context.lineWidth = 2;
        context.stroke();
        context.beginPath();
        context.moveTo(tx, ty);
        context.lineTo(tx - ux * 13 + px * 6, ty - uy * 13 + py * 6);
        context.lineTo(tx - ux * 13 - px * 6, ty - uy * 13 - py * 6);
        context.closePath();
        context.fillStyle = isCut ? '#e53935' : '#217fbe';
        context.fill();
        context.strokeStyle = '#fff';
        context.lineWidth = 1.7;
        context.stroke();
      }
      context.beginPath();
      context.arc(base[0], base[1], 3.3, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.strokeStyle = isCut ? '#b71c1c' : '#176fae';
      context.lineWidth = 1.4;
      context.stroke();
      context.restore();
    }

    renderArrowHud(geometry) {
      if (!this.hud) return;
      this.hud.hidden = !geometry;
      if (!geometry) return;
      const direction = this.direction.value;
      this.hud.querySelector('#extrudeHudDirection').textContent =
        direction === 'symmetric' ? 'Symmetric' : direction === 'two' ? 'Two Sides' : 'One Side';
      this.hud.querySelector('#extrudeHudFirstLabel').textContent = direction === 'symmetric' ? 'Total distance' : 'Distance';
      if (typeof document === 'undefined' || document.activeElement !== this.hudFirst)
        this.hudFirst.value = String(roundMillimetres(Number(this.first.value)));
      const secondRow = this.hud.querySelector('#extrudeHudSecondRow');
      secondRow.hidden = direction !== 'two';
      if (direction === 'two' && (typeof document === 'undefined' || document.activeElement !== this.hudSecond))
        this.hudSecond.value = String(roundMillimetres(Number(this.second.value)));
      const tip = geometry.handles[0].tip;
      const bounds = this.canvas.getBoundingClientRect();
      const width = this.hud.offsetWidth || 185, height = this.hud.offsetHeight || 75;
      const preferredX = tip[0] + width + 24 > bounds.width - 290 ? tip[0] - width - 16 : tip[0] + 16;
      const left = Math.max(8, Math.min(bounds.width - width - 8, preferredX));
      const top = Math.max(8, Math.min(bounds.height - height - 8, tip[1] - height / 2));
      const x = `${left}px`, y = `${top}px`;
      if (this.hud.style.left !== x) this.hud.style.left = x;
      if (this.hud.style.top !== y) this.hud.style.top = y;
    }

    computeIssue(count, validPreview, range) {
      if (!count) return null;
      if (!range) return this.distanceTouched
        ? { code: 'CAD-C005', title: 'Compute error', reason: 'Enter a non-zero extrusion distance.' }
        : null;
      if (this.operation?.value === 'new') {
        if (validPreview) return null;
        return this.type.value === 'thin'
          ? { code: 'CAD-C004', title: 'Compute error', reason: 'Thin wall is invalid; reduce thickness or simplify the curve.' }
          : { code: 'CAD-C006', title: 'Compute error', reason: 'Selected profile cannot form a solid.' };
      }
      if (this.kernelFailed) return { code: 'CAD-C001', title: 'Compute error',
        reason: `3D engine unavailable: ${this.kernelError || 'load failed'}` };
      if (this.booleanError) return { code: 'CAD-C002', title: 'Compute error',
        reason: `3D operation failed: ${this.booleanError}` };
      if (cad.solidKernel && !cad.solidKernel.ready()) return null;
      if (!validPreview) return { code: 'CAD-C003', title: 'Compute error',
        reason: 'Extrusion does not intersect an existing body.' };
      return null;
    }

    update() {
      const count = this.selectedCount();
      this.count.textContent = `${count} selected`;
      this.secondRow.hidden = this.direction.value !== 'two';
      const thin = this.type.value === 'thin';
      this.thicknessRow.hidden = !thin;
      this.chainRow.hidden = !thin;
      const range = limits(this.direction.value, Number(this.first.value), Number(this.second.value));
      let preparedTools = null;

      // Auto-detect intersection with existing bodies to switch to CUT
      if (count > 0 && range && this.bodies.length > 0) {
        const tools = this.toolBodies();
        preparedTools = tools;
        const targets = this.bodies.filter(body => body.visible !== false);
        const isIntersecting = tools.length > 0 && targets.length > 0 && checkAnyIntersection(tools, targets);

        if (isIntersecting) {
          if (!this.lastIntersecting) {
            if (this.operation && (this.operation.value === 'new' || (this.faceProfile && this.operation.value === 'join'))) {
              this.autoSwitchedFrom = this.operation.value;
              this.operation.value = 'cut';
              this.previewCache = null;
              if (cad.solidKernel && !cad.solidKernel.ready() && !this.kernelFailed) {
                cad.solidKernel.load().then(() => { this.previewCache = null; this.update(); }).catch(() => {});
              }
            }
          }
          this.lastIntersecting = true;
        } else {
          if (this.lastIntersecting) {
            if (this.autoSwitchedFrom && this.operation && this.operation.value === 'cut') {
              this.operation.value = this.autoSwitchedFrom;
              this.autoSwitchedFrom = null;
              this.previewCache = null;
            }
          }
          this.lastIntersecting = false;
        }
      } else {
        this.lastIntersecting = false;
        this.autoSwitchedFrom = null;
      }

      const isCut = this.operation?.value === 'cut';
      this.panel?.classList?.toggle?.('is-cut', isCut);
      this.operation?.classList?.toggle?.('is-cut', isCut);
      this.ok?.classList?.toggle?.('is-cut', isCut);
      if (this.hud) {
        this.hud.classList?.toggle?.('is-cut', isCut);
        const hudOp = this.hud.querySelector?.('#extrudeHudOperation');
        const hudOpRow = this.hud.querySelector?.('#extrudeHudOperationRow');
        if (hudOp) {
          hudOp.textContent = isCut ? 'CUT' : this.operation?.value?.toUpperCase() || 'NEW';
          if (hudOpRow) hudOpRow.hidden = false;
        }
      }

      const validPreview = count > 0 && Boolean(range) && (this.operation?.value === 'new'
        ? !thin || this.previewBodies(preparedTools).length === count
        : this.previewBodies(preparedTools).length > 0);
      const issue = this.computeIssue(count, validPreview, range);
      const issueKey = issue ? `${issue.code}|${issue.reason}` : null;
      if (issueKey !== this.reportedComputeIssue) {
        this.reportedComputeIssue = issueKey;
        if (issue) this.onError?.(issue);
      }
      this.help.textContent = this.operation?.value !== 'new'
        ? this.kernelFailed ? '3D geometry engine could not be loaded.'
          : this.booleanError ? `3D operation failed: ${this.booleanError}`
          : cad.solidKernel && !cad.solidKernel.ready() ? 'Preparing 3D operations…'
            : isCut ? 'Cutting into existing body. Confirm or adjust distance.'
            : 'Select a profile that intersects an existing body in 3D.'
        : thin ? 'Select open or closed curves. Thickness is centered on each curve.'
          : 'Select one or more closed sketch regions.';
      this.ok.disabled = count < 1 || !range || !validPreview;
      this.onStatus(count && !range ? 'EXTRUDE · Enter a non-zero distance'
        : count && !validPreview ? this.operation?.value !== 'new'
        ? this.kernelFailed ? 'EXTRUDE · 3D engine unavailable'
          : this.booleanError ? 'EXTRUDE · Invalid 3D geometry'
          : cad.solidKernel && !cad.solidKernel.ready() ? 'EXTRUDE · Preparing 3D operations'
            : 'EXTRUDE · Select a profile intersecting a body'
        : 'THIN EXTRUDE · Reduce thickness or select a simpler curve'
        : count ? isCut ? 'EXTRUDE CUT · Set distance and confirm' : 'EXTRUDE · Set distance and confirm'
          : thin ? 'THIN EXTRUDE · Select at least one sketch curve' : 'EXTRUDE · Select at least one closed profile');
      this.onChange();
    }

    commit() {
      const preview = this.previewBodies();
      const operation = this.operation?.value || 'new';
      if (!preview.length || (operation === 'new' && preview.length !== this.selectedCount())) return;
      if (operation !== 'new') {
        const before = [...this.bodies];
        const replacements = new Map(preview.map(body => [body.id, body]));
        const consumed = operation === 'join' ? new Set(preview[0].booleanTargets || [preview[0].id]) : new Set();
        const after = before.flatMap(body => {
          if (consumed.has(body.id) && body.id !== preview[0].id) return [];
          const result = replacements.get(body.id);
          return result ? result.empty || (result.cells && !result.cells.length) ? [] : [result] : [body];
        });
        this.close();
        this.history.execute({
          name: `Extrude · ${operation.toUpperCase()}`, kind: 'solid', timelineTool: 'extrudeBtn',
          execute: () => { this.bodies = after; this.onBodiesChange?.(); this.onChange(); },
          undo: () => { this.bodies = before; this.onBodiesChange?.(); this.onChange(); },
          redo: () => { this.bodies = after; this.onBodiesChange?.(); this.onChange(); },
        });
        return;
      }
      const bodies = preview.map(body => {
        const number = this.nextBodyId++;
        return { ...body, id: `body-${number}`, name: `Body ${number}`, visible: true };
      });
      this.close();
      this.history.execute({
        name: this.type.value === 'thin' ? 'Thin extrude' : 'Extrude · new body', kind: 'solid', timelineTool: 'extrudeBtn',
        execute: () => { this.bodies.push(...bodies); this.onBodiesChange?.(); this.onChange(); },
        undo: () => { this.bodies = this.bodies.filter(body => !bodies.includes(body)); this.onBodiesChange?.(); this.onChange(); },
        redo: () => { this.bodies.push(...bodies); this.onBodiesChange?.(); this.onChange(); },
      });
    }

    at(event) {
      const bounds = this.canvas.getBoundingClientRect();
      return cad.sketchProfiles.hitTest(this.profiles(),
        [event.clientX - bounds.left, event.clientY - bounds.top],
        (sketch, point) => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height));
    }

    faceHitAt(event, includeFacets = false) {
      if (!this.bodies.length) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      let best = null;
      for (const body of this.bodies) {
        if (body.visible === false || !body.mesh) continue;
        for (const face of cad.bodyFaces.patches(body)) {
          if (dot(face.normal, this.camera.depth) <= 1e-6) continue;
          for (const triangle of face.triangles) {
            const projected = triangle.map(point => this.camera.project(point, bounds.width, bounds.height));
            const weights = cad.bodyFaces.projectedTriangle(screen, ...projected);
            if (!weights) continue;
            const depth = triangle.reduce((sum, point, index) =>
              sum + weights[index] * dot(point, this.camera.depth), 0);
            if (!best || depth > best.depth) best = { face, depth };
          }
        }
      }
      if (includeFacets) {
        const hit = cad.bodyFaces.hitPointAt(screen, this.bodies, this.camera, bounds, true);
        if (hit && (!best || hit.depth > best.depth)) best = hit;
      }
      return best;
    }

    sketchDepthAt(sketch, clientX, clientY, bounds) {
      if (!sketch || !cad.planes.grid[sketch.plane]) return -Infinity;
      const { u, v, origin = [0, 0, 0] } = cad.planes.grid[sketch.plane];
      const normal = cross(u, v);
      const divisor = dot(normal, this.camera.depth);
      if (Math.abs(divisor) < 0.01) return dot(origin, this.camera.depth);
      const unit = this.camera.unit(bounds.width, bounds.height);
      const [originX, originY] = this.camera.origin(bounds.width, bounds.height);
      const horizontal = (clientX - bounds.left - originX) / unit;
      const vertical = (originY - (clientY - bounds.top)) / unit;
      const pivot = cad.settings.cameraPivot ? this.camera.pivot : [0, 0, 0];
      const rayStart = pivot.map((value, index) => value + this.camera.right[index] * horizontal + this.camera.up[index] * vertical);
      const distance = dot(normal, origin.map((value, index) => value - rayStart[index])) / divisor;
      const world = rayStart.map((value, index) => value + this.camera.depth[index] * distance);
      return dot(world, this.camera.depth);
    }

    hitTest(event, includeFacets = false) {
      const isCtrl = Boolean(event?.ctrlKey || event?.metaKey);
      const bounds = this.canvas.getBoundingClientRect();

      if (this.type.value === 'thin') {
        const thinHit = this.thinAt(event);
        const profileHit = thinHit ? null : this.at(event);
        const sketch = thinHit?.sketch || profileHit?.sketch;
        const sketchDepth = sketch ? this.sketchDepthAt(sketch, event.clientX, event.clientY, bounds) : -Infinity;
        const faceHit = this.faceHitAt(event, includeFacets);

        if (isCtrl) {
          if (thinHit) return { type: 'thin', thin: thinHit };
          if (profileHit) return { type: 'profile', profile: profileHit };
          if (faceHit) return { type: 'face', face: faceHit.face };
          return null;
        }

        if (faceHit && faceHit.depth >= sketchDepth - 0.05) return { type: 'face', face: faceHit.face };
        if (thinHit) return { type: 'thin', thin: thinHit };
        if (profileHit) return { type: 'profile', profile: profileHit };
        if (faceHit) return { type: 'face', face: faceHit.face };
        return null;
      }

      // Solid mode:
      const sketchProfiles = this.document.sketches.filter(s => s.visible !== false)
        .flatMap(s => cad.sketchProfiles.fromSketch(s));
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const sketchHit = cad.sketchProfiles.hitTest(sketchProfiles, screen,
        (s, p) => this.camera.project(this.document.toWorld(s, p), bounds.width, bounds.height));
      const faceHit = this.faceHitAt(event, includeFacets);

      if (isCtrl) {
        // Holding Ctrl: Ray penetrates through front body face to hit sketch inside/behind body
        if (sketchHit) return { type: 'profile', profile: sketchHit };
        if (faceHit) return { type: 'face', face: faceHit.face };
        return null;
      }

      if (sketchHit && faceHit) {
        const sketchDepth = this.sketchDepthAt(sketchHit.sketch, event.clientX, event.clientY, bounds);
        if (faceHit.depth >= sketchDepth - 0.05) {
          return { type: 'face', face: faceHit.face };
        }
        return { type: 'profile', profile: sketchHit };
      }

      if (faceHit) return { type: 'face', face: faceHit.face };
      if (sketchHit) return { type: 'profile', profile: sketchHit };
      return null;
    }

    thinAt(event) {
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      let best = null;
      for (const sketch of this.document.sketches) {
        if (sketch.visible === false) continue;
        const key = [sketch.revision, bounds.width, bounds.height, this.camera.zoom,
        this.camera.panX, this.camera.panY, ...this.camera.right, ...this.camera.up,
        ...(cad.settings.cameraPivot ? this.camera.pivot : [])].join('|');
        let cached = this.thinIndexes.get(sketch.id);
        if (!cached || cached.key !== key) {
          cached = {
            key, index: cad.sketchHitTest.screenIndex(sketch, point =>
              this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height))
          };
          this.thinIndexes.set(sketch.id, cached);
        }
        const hit = cad.sketchHitTest.boundariesIn(cached.index, screen).find(item => !item.entity.construction);
        if (!hit || (best && best.distance <= hit.distance)) continue;
        best = { ...hit, sketch };
      }
      return best;
    }

    thinSelectionAt(event) {
      const hit = this.thinAt(event);
      if (hit) return thinPathFromEntity(hit.sketch, hit.entity.id, this.chain.checked);
      const profile = this.at(event);
      return profile ? {
        id: profile.id, sketch: profile.sketch, entityIds: profile.entityIds,
        points: profile.points.map(point => [...point]), closed: true
      } : null;
    }

    updateHover(event) {
      if (!this.active || this.dragArrow || !event) return;
      if (this.hoveredArrow) return;
      const hit = this.hitTest(event);
      let nextId = null;
      let nextFace = null;
      let nextThinIds = new Set();

      if (hit?.type === 'thin') {
        nextId = hit.thin.entity.id;
        nextThinIds = new Set([hit.thin.entity.id]);
      } else if (hit?.type === 'profile') {
        nextId = hit.profile.id;
        if (this.type.value === 'thin') {
          nextThinIds = new Set(hit.profile.entityIds || []);
        }
      } else if (hit?.type === 'face') {
        nextFace = hit.face;
      }

      const changed = nextId !== this.hoveredId || nextFace !== this.hoveredFace ||
        nextThinIds.size !== this.hoveredThinIds.size;

      this.hoveredId = nextId;
      this.hoveredFace = nextFace;
      this.hoveredThinIds = nextThinIds;
      this.canvas.classList.toggle('over-profile', Boolean(nextId));
      this.canvas.classList.toggle('over-face', Boolean(nextFace));

      if (changed) this.onChange();
    }

    focusHudDistance(event) {
      if (!this.active || !this.selectedCount() || !this.hudFirst) return false;
      const geometry = this.arrowGeometry();
      if (!geometry) return false;
      this.renderArrowHud(geometry);
      const fields = this.direction.value === 'two' && this.hudSecond
        ? [this.hudFirst, this.hudSecond] : [this.hudFirst];
      const current = fields.indexOf(event.target);
      const next = current < 0 ? event.shiftKey ? fields.at(-1) : fields[0]
        : fields[current + (event.shiftKey ? -1 : 1)];
      event.preventDefault();
      if (next) { next.focus?.(); next.select?.(); }
      else this.canvas.focus?.();
      return true;
    }

    bindEvents() {
      this.canvas.addEventListener('pointerdown', event => {
        if (!this.active || event.button !== 0 || this.dragArrow) return;
        const hit = this.arrowAt(event);
        if (!hit) return;
        this.hudFirst?.blur?.();
        this.hudSecond?.blur?.();
        this.canvas.focus?.();
        this.dragArrow = {
          pointerId: event.pointerId, side: hit.side,
          startX: event.clientX, startY: event.clientY, startOffset: hit.offset,
          screenUnit: [...hit.geometry.screenUnit], first: this.first.value, second: this.second.value
        };
        this.hoveredArrow = hit.side;
        this.canvas.classList.add('is-extrude-arrow-dragging');
        this.canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        this.onChange();
      });

      this.canvas.addEventListener('pointermove', event => {
        if (!this.active) return;
        this.lastPointerEvent = event;
        if (this.dragArrow) {
          this.moveArrow(event);
          return;
        }
        if (event.buttons) return;
        const arrow = this.arrowAt(event);
        const arrowSide = arrow?.side || null;
        if (arrowSide !== this.hoveredArrow) {
          this.hoveredArrow = arrowSide;
          this.canvas.classList.toggle('is-extrude-arrow', Boolean(arrowSide));
          this.onChange();
        }
        if (arrow) {
          if (this.hoveredId || this.hoveredFace) {
            this.hoveredId = null;
            this.hoveredFace = null;
            this.canvas.classList.remove('over-profile', 'over-face');
            this.onChange();
          }
          return;
        }
        this.updateHover(event);
      });

      this.canvas.addEventListener('pointerleave', () => {
        if (!this.active || this.dragArrow) return;
        this.hoveredArrow = null;
        this.canvas.classList.remove('is-extrude-arrow');
        if (!this.hoveredId && !this.hoveredFace) { this.onChange(); return; }
        this.hoveredId = null;
        this.hoveredFace = null;
        this.hoveredThinIds.clear();
        this.canvas.classList.remove('over-profile', 'over-face');
        this.onChange();
      });

      const triggerHoverKey = isCtrl => {
        if (!this.active || !this.lastPointerEvent) return;
        this.updateHover({
          clientX: this.lastPointerEvent.clientX,
          clientY: this.lastPointerEvent.clientY,
          ctrlKey: isCtrl,
          metaKey: isCtrl,
          buttons: 0
        });
      };
      window?.addEventListener?.('keydown', event => {
        if (event.key === 'Tab' && !event.ctrlKey && !event.altKey &&
          (!event.target?.matches?.('input, textarea, select') ||
            event.target === this.hudFirst || event.target === this.hudSecond))
          this.focusHudDistance(event);
        if (event.key === 'Control' || event.key === 'Meta') triggerHoverKey(true);
      });
      window?.addEventListener?.('keyup', event => {
        if (event.key === 'Control' || event.key === 'Meta') triggerHoverKey(false);
      });

      const endArrow = (event, cancelled = false) => {
        if (!this.dragArrow || event.pointerId !== this.dragArrow.pointerId) return;
        if (cancelled) {
          this.first.value = this.dragArrow.first;
          this.second.value = this.dragArrow.second;
        } else this.moveArrow(event);
        this.dragArrow = null;
        this.canvas.classList.remove('is-extrude-arrow-dragging');
        this.suppressClick = true;
        if (typeof setTimeout === 'function') setTimeout(() => { this.suppressClick = false; }, 0);
        if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        this.update();
      };
      this.canvas.addEventListener('pointerup', event => endArrow(event));
      this.canvas.addEventListener('pointercancel', event => endArrow(event, true));
      this.canvas.addEventListener('lostpointercapture', event => endArrow(event, true));

      this.canvas.addEventListener('click', event => {
        if (this.suppressClick) { this.suppressClick = false; event.preventDefault(); return; }
        if (!this.active || event.button !== 0) return;

        const hit = this.hitTest(event, true);
        if (!hit) return;

        if (this.type.value === 'thin') {
          if (hit.type === 'face') {
            this.type.value = 'solid';
          } else {
            const path = hit.type === 'thin'
              ? thinPathFromEntity(hit.thin.sketch, hit.thin.entity.id, this.chain.checked)
              : { id: hit.profile.id, sketch: hit.profile.sketch, entityIds: hit.profile.entityIds,
                  points: hit.profile.points.map(point => [...point]), closed: true };
            if (path) {
              if (this.selectedThin.has(path.id)) this.selectedThin.delete(path.id);
              else {
                for (const [key, selected] of this.selectedThin) {
                  if (selected.sketch === path.sketch && selected.entityIds.some(id => path.entityIds.includes(id)))
                    this.selectedThin.delete(key);
                }
                this.selectedThin.set(path.id, path);
              }
              this.update();
            }
            return;
          }
        }

        if (hit.type === 'face') {
          const face = hit.face;
          if (this.faceProfile && this.faceProfile.face === face) {
            this.faceProfile = null;
            this.selectedIds.clear();
            this.update();
            return;
          }
          const faceProf = this.makeFaceProfile(face);
          if (!faceProf) return;
          this.faceProfile = faceProf;
          this.selectedIds.clear();
          this.selectedIds.add(this.faceProfile.id);
          if (this.operation && this.operation.value === 'new') {
            this.operation.value = 'join';
          }
          if (cad.solidKernel && !cad.solidKernel.ready() && !this.kernelFailed) {
            cad.solidKernel.load().then(() => { this.previewCache = null; this.update(); }).catch(() => {});
          }
          this.update();
          return;
        }

        if (hit.type === 'profile') {
          const profile = hit.profile;
          if (this.faceProfile) {
            this.faceProfile = null;
            this.selectedIds.clear();
          }
          if (this.selectedIds.has(profile.id)) {
            this.selectedIds.delete(profile.id);
          } else {
            this.selectedIds.add(profile.id);
          }
          this.update();
          return;
        }
      });

      this.type.addEventListener('change', () => {
        this.selectedIds.clear();
        this.selectedThin.clear();
        this.hoveredId = null;
        this.hoveredFace = null;
        this.hoveredThinIds.clear();
        this.hoveredArrow = null;
        this.canvas.classList.remove('is-extrude-arrow', 'over-profile', 'over-face');
        this.update();
      });
      this.chain.addEventListener('change', () => { this.selectedThin.clear(); this.update(); });
      this.direction.addEventListener('change', () => this.update());
      this.operation?.addEventListener('change', () => {
        this.userManualOperation = this.operation.value;
        this.autoSwitchedFrom = null;
        this.previewCache = null;
        if (this.operation.value !== 'new' && cad.solidKernel && !cad.solidKernel.ready() && !this.kernelFailed)
          cad.solidKernel.load().then(() => { this.previewCache = null; this.update(); })
            .catch(error => { this.kernelFailed = true; this.kernelError = error?.message || null; this.update(); });
        this.update();
      });
      this.first.addEventListener('input', () => { this.distanceTouched = true; this.update(); });
      this.second.addEventListener('input', () => { this.distanceTouched = true; this.update(); });
      for (const [hudInput, panelInput] of [[this.hudFirst, this.first], [this.hudSecond, this.second]]) {
        hudInput?.addEventListener?.('input', () => {
          panelInput.value = hudInput.value;
          this.distanceTouched = true;
          this.update();
        });
        hudInput?.addEventListener?.('keydown', event => {
          if (event.key === 'Enter' && !this.ok.disabled) {
            event.preventDefault();
            this.commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
          }
        });
      }
      this.thickness.addEventListener('input', () => this.update());
      this.panel.querySelector('#extrudeCancel').addEventListener('click', () => this.close());
      this.ok.addEventListener('click', () => this.commit());
      this.panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); this.close(); }
        if (event.key === 'Enter' && (event.target === this.first || event.target === this.second ||
          event.target === this.thickness) && !this.ok.disabled) {
          event.preventDefault();
          this.commit();
        }
      });
    }

    render(context, project, bodyView = null) {
      this.prepareBodyMeshes();
      const isCut = this.active && this.operation?.value === 'cut';
      const preview = this.active ? this.previewBodies() : [];
      const toolBodies = isCut ? this.toolBodies() : null;
      const targetIds = this.active && this.operation?.value !== 'new' && !isCut
        ? new Set(preview.flatMap(body => body.booleanTargets || [body.id])) : new Set();
      renderBodies(context, project, this.camera,
        bodyView || (targetIds.size ? this.bodies.filter(body => !targetIds.has(body.id)) : this.bodies));
      if (!this.active) return;
      if (this.type.value === 'thin') {
        const selectedIds = new Set([...this.selectedThin.values()].flatMap(path => path.entityIds));
        renderBodies(context, project, this.camera, isCut ? toolBodies : preview, true, isCut ? 'cut' : 'blue');
        for (const sketch of this.document.sketches) {
          if (sketch.visible === false) continue;
          const toScreen = point => project(this.document.toWorld(sketch, point));
          for (const entity of sketch.entities) {
            const selected = selectedIds.has(entity.id);
            const hovered = this.hoveredThinIds.has(entity.id);
            cad.sketchRender.drawEntity(context, entity, toScreen,
              selected ? (isCut ? '#c62828' : '#1d85c5') : hovered ? '#4f89ff' : entity.construction ? '#8499a6' : '#365d73',
              selected || hovered ? 3.3 : entity.construction ? 1.2 : 1.8);
          }
        }
        this.renderArrows(context);
        return;
      }
      const profiles = this.profiles();
      for (const profile of profiles) {
        const selected = this.selectedIds.has(profile.id);
        const hovered = profile.id === this.hoveredId;
        cad.sketchRender.drawProfile(context, profile.points,
          point => project(this.document.toWorld(profile.sketch, point)),
          selected ? (isCut ? 'rgba(235, 55, 55, .38)' : 'rgba(45, 141, 227, .48)')
                   : hovered ? 'rgba(80, 164, 224, .30)' : 'rgba(104, 178, 223, .13)', profile.holes);
      }
      renderBodies(context, project, this.camera, isCut ? toolBodies : preview, true, isCut ? 'cut' : 'blue');
      for (const sketch of this.document.sketches) {
        if (sketch.visible === false) continue;
        const toScreen = point => project(this.document.toWorld(sketch, point));
        for (const entity of sketch.entities) {
          cad.sketchRender.drawEntity(context, entity, toScreen,
            entity.construction ? '#8499a6' : '#365d73', entity.construction ? 1.2 : 1.8);
        }
      }
      for (const profile of profiles) {
        const selected = this.selectedIds.has(profile.id);
        const hovered = profile.id === this.hoveredId;
        if (!selected && !hovered) continue;
        cad.sketchRender.drawProfile(context, profile.points,
          point => project(this.document.toWorld(profile.sketch, point)),
          selected ? (isCut ? 'rgba(235, 55, 55, .32)' : 'rgba(45, 141, 227, .42)')
                   : hovered ? 'rgba(80, 164, 224, .25)' : null, profile.holes,
          selected ? (isCut ? '#c62828' : '#1379bd') : '#4f89ff', selected ? 2.8 : 2.3);
      }
      // Render face highlights (hovered and selected)
      if (this.hoveredFace && (!this.faceProfile || this.hoveredFace !== this.faceProfile.face)) {
        cad.bodyFaces.renderFaceHighlight(context, project, this.hoveredFace, {
          fill: 'rgba(45, 156, 219, .24)', stroke: 'rgba(30, 130, 200, .85)', lineWidth: 1.6, camera: this.camera
        });
      }
      if (this.faceProfile?.face) {
        cad.bodyFaces.renderFaceHighlight(context, project, this.faceProfile.face, {
          fill: isCut ? 'rgba(235, 55, 55, .32)' : 'rgba(33, 137, 227, .42)',
          stroke: isCut ? '#c62828' : '#0e70b0', lineWidth: 2.4, camera: this.camera
        });
      }
      this.renderArrows(context);
    }
  }

  cad.extrude = { limits, makeBody, makeBooleanBody, thinPathFromEntity, makeThinBody, faces, renderBodies, snapDistance: snapExtrudeDistance, bodyBounds, boxesOverlap, toolIntersectsTarget, checkAnyIntersection };
  cad.ExtrudeController = ExtrudeController;
})(window.WebCAD = window.WebCAD || {});
