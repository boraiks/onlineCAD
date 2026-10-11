(function (cad) {
  'use strict';

  const candidateCache = new WeakMap();
  const trackingDirections = Array.from({ length: 24 }, (_, index) => {
    const angle = index * 15;
    const radians = angle * Math.PI / 180;
    return { angle, x: Math.cos(radians), y: Math.sin(radians) };
  });

  function candidates(sketch) {
    const cached = candidateCache.get(sketch);
    if (cached?.revision === sketch.revision && cached.entities === sketch.entities &&
      cached.count === sketch.entities.length) return cached;
    const points = [];
    const circles = [];
    const addPoint = (point, entity = null, part = null, cornerIndex = null) =>
      points.push({ point, entity, part, cornerIndex });
    for (const entity of sketch.entities) {
      if (entity.type === 'line') {
        addPoint(entity.start, entity, 'start');
        addPoint(entity.end, entity, 'end');
      } else if (entity.type === 'point') addPoint(entity.position, entity, 'position');
      else if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach((point, index) =>
          addPoint(point, entity, 'corner', index));
      } else if (entity.type === 'circle') {
        addPoint(entity.center, entity, 'center');
        circles.push(entity);
      } else if (entity.type === 'arc') {
        addPoint(entity.start, entity, 'start');
        addPoint(entity.end, entity, 'end');
        addPoint(entity.center, entity, 'center');
      }
    }
    const segments = cad.sketchHitTest.segments(sketch);
    const middles = segments.map(segment => ({
      point: cad.sketchHitTest.midpoint(segment), kind: 'midpoint',
      entityId: segment.entity.id, edgeIndex: segment.edgeIndex,
    }));
    const result = {
      revision: sketch.revision, entities: sketch.entities,
      count: sketch.entities.length, points, middles, segments, circles
    };
    candidateCache.set(sketch, result);
    return result;
  }

  function snap(sketch, point, camera, bounds, options = {}) {
    if (!sketch || !point) return null;
    const unit = camera.unit(bounds.width, bounds.height);
    const { snap: step, major, minor, extent } = cad.sketchGrid.steps(unit);
    const visibleStep = minor * unit >= 4.5 ? minor : major;
    const gridIntersection = point.map(value => Math.round(value / visibleStep) * visibleStep);
    const intersectionRadius = Math.min(6, visibleStep * unit * 0.35);
    const quantize = value => +(Math.round(value / step) * step).toFixed(3);
    if (point.some(value => !Number.isFinite(value) || Math.abs(value) > extent)) return null;
    const { u, v, origin: planeOrigin = [0, 0, 0] } = cad.planes.grid[sketch.plane];
    const project = camera.projector(bounds.width, bounds.height);
    const origin = project(planeOrigin);
    const alongU = project(planeOrigin.map((value, axis) => value + u[axis]));
    const alongV = project(planeOrigin.map((value, axis) => value + v[axis]));
    const screen = local => [origin[0] + local[0] * (alongU[0] - origin[0]) + local[1] * (alongV[0] - origin[0]),
    origin[1] + local[0] * (alongU[1] - origin[1]) + local[1] * (alongV[1] - origin[1])];
    const rawScreen = screen(point);
    const gapSquared = candidate => {
      const target = screen(candidate);
      const dx = rawScreen[0] - target[0];
      const dy = rawScreen[1] - target[1];
      return dx * dx + dy * dy;
    };
    if (gapSquared([0, 0]) <= 144) return {
      point: [0, 0], kind: 'origin',
      target: { entityId: null, part: 'origin', isOrigin: true }
    };
    const available = candidates(sketch);
    let nearest = null;
    let distance = 144;
    for (const candidate of available.points) {
      const candidateGap = gapSquared(candidate.point);
      let captureDistance = distance;
      if (candidate.entity?.type === 'circle') {
        const center = screen(candidate.point);
        const rim = screen([candidate.point[0] + candidate.entity.radius, candidate.point[1]]);
        const radiusPixels = Math.hypot(rim[0] - center[0], rim[1] - center[1]);
        captureDistance = Math.min(captureDistance, (radiusPixels * 0.3) ** 2);
      }
      if (candidateGap <= captureDistance) {
        nearest = candidate;
        distance = candidateGap;
      }
    }
    if (nearest) return {
      point: [...nearest.point], kind: 'endpoint',
      target: {
        entityId: nearest.entity?.id || null, part: nearest.part,
        cornerIndex: nearest.cornerIndex
      }
    };
    let middle = null;
    distance = 12;
    for (const candidate of available.middles) {
      const candidateGap = gapSquared(candidate.point);
      if (candidateGap <= distance) {
        middle = candidate;
        distance = candidateGap;
      }
    }
    if (middle) return middle;

    // Hovered points track cardinal directions; an in-progress Line can request
    // 15° rays from its placed start point. The capture width is in screen pixels.
    const anchor = options.trackingAnchor;
    let inferred = null;
    let rayOnGridLine = null;
    if (anchor && anchor.every(Number.isFinite)) {
      const angleStep = options.trackingAngleStep === 15 ? 15 : 90;
      const anchorScreen = screen(anchor);
      const uScreen = [alongU[0] - origin[0], alongU[1] - origin[1]];
      const vScreen = [alongV[0] - origin[0], alongV[1] - origin[1]];
      const relative = [rawScreen[0] - anchorScreen[0], rawScreen[1] - anchorScreen[1]];
      let aligned = null;
      let bestGap = 64;
      let bestGridGap = intersectionRadius * intersectionRadius;
      for (const ray of trackingDirections) {
        if (ray.angle % angleStep !== 0) continue;
        const direction = [ray.x * uScreen[0] + ray.y * vScreen[0],
        ray.x * uScreen[1] + ray.y * vScreen[1]];
        const lengthSquared = direction[0] ** 2 + direction[1] ** 2;
        if (lengthSquared < 1e-9) continue;
        const along = (relative[0] * direction[0] + relative[1] * direction[1]) / lengthSquared;
        if (along <= 0) continue;
        const candidate = ray.angle % 90 === 0
          ? ray.angle % 180 === 0
            ? [quantize(anchor[0] + along * (ray.angle === 0 ? 1 : -1)), anchor[1]]
            : [anchor[0], quantize(anchor[1] + along * (ray.angle === 90 ? 1 : -1))]
          : [quantize(anchor[0] + along * ray.x), quantize(anchor[1] + along * ray.y)];
        const candidateScreen = screen(candidate);
        if (candidate.some(value => Math.abs(value) > extent) ||
          Math.hypot(candidateScreen[0] - anchorScreen[0], candidateScreen[1] - anchorScreen[1]) < 14) continue;
        const gap = gapSquared(candidate);
        if (gap < bestGap) {
          bestGap = gap;
          aligned = {
            point: candidate, anchor: [...anchor], angle: ray.angle,
            kind: ray.angle % 180 === 0 ? 'inference-horizontal'
              : ray.angle % 90 === 0 ? 'inference-vertical' : 'inference-angle'
          };
        }
        // A tracked angle can also land exactly on a visible grid line.
        // Keep the ray exact instead of independently rounding both axes.
        for (const axis of [0, 1]) {
          const component = axis === 0 ? ray.x : ray.y;
          if (Math.abs(component) < 1e-9) continue;
          const atLine = (gridIntersection[axis] - anchor[axis]) / component;
          if (atLine <= 0) continue;
          const onGridLine = [quantize(anchor[0] + atLine * ray.x),
            quantize(anchor[1] + atLine * ray.y)];
          if (onGridLine.some(value => Math.abs(value) > extent)) continue;
          const gridGap = gapSquared(onGridLine);
          if (gridGap < bestGridGap) {
            bestGridGap = gridGap;
            rayOnGridLine = { point: onGridLine, anchor: [...anchor], angle: ray.angle,
              kind: 'inference-grid-line' };
          }
        }
      }
      inferred = aligned;
    }

    let nearestEdge = null;
    let edgeDistance = 36;
    for (const segment of available.segments) {
      if (segment.entity.id === options.excludeEntityId) continue;
      const start = screen(segment.start);
      const end = screen(segment.end);
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1) continue;
      const t = Math.max(0, Math.min(1, ((rawScreen[0] - start[0]) * dx +
        (rawScreen[1] - start[1]) * dy) / lengthSquared));
      const gapX = rawScreen[0] - start[0] - t * dx;
      const gapY = rawScreen[1] - start[1] - t * dy;
      const gap = gapX * gapX + gapY * gapY;
      if (gap > edgeDistance) continue;
      const length = Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
      if (!length) continue;
      const snappedLength = Math.round(t * length / step) * step;
      const along = Math.min(1, snappedLength / length);
      edgeDistance = gap;
      nearestEdge = {
        point: [segment.start[0] + (segment.end[0] - segment.start[0]) * along,
        segment.start[1] + (segment.end[1] - segment.start[1]) * along],
        kind: 'on-edge', entityId: segment.entity.id, edgeIndex: segment.edgeIndex,
      };
    }
    for (const circle of available.circles) {
      if (circle.id === options.excludeEntityId || !(circle.radius > 0)) continue;
      const dx = point[0] - circle.center[0];
      const dy = point[1] - circle.center[1];
      if (Math.hypot(dx, dy) < 1e-9) continue;
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle * circle.radius / step) * step / circle.radius;
      const onCircle = [circle.center[0] + circle.radius * Math.cos(snappedAngle),
      circle.center[1] + circle.radius * Math.sin(snappedAngle)];
      const gap = gapSquared(onCircle);
      if (gap > edgeDistance) continue;
      edgeDistance = gap;
      nearestEdge = { point: onCircle, kind: 'on-circle', entityId: circle.id };
    }
    if (nearestEdge) return nearestEdge;
    const intersectionGap = gapSquared(gridIntersection);
    if (intersectionGap <= intersectionRadius * intersectionRadius) {
      const ray = inferred && trackingDirections.find(direction => direction.angle === inferred.angle);
      const delta = ray && [gridIntersection[0] - anchor[0], gridIntersection[1] - anchor[1]];
      const followsRay = ray && delta[0] * ray.x + delta[1] * ray.y > 0 &&
        Math.abs(delta[0] * ray.y - delta[1] * ray.x) <= step;
      if (followsRay) return { point: gridIntersection, kind: 'inference-grid-intersection',
        anchor: [...anchor], angle: ray.angle };
      // An off-ray grid crossing should beat angle tracking only when it is
      // noticeably nearer the pointer. This avoids breaking cardinal tracking
      // from a center whose coordinates are slightly off the visible grid.
      if (!inferred || intersectionGap <= 0.01 || intersectionGap + 4 < gapSquared(inferred.point))
        return { point: gridIntersection, kind: 'grid-intersection' };
    }
    if (rayOnGridLine) return rayOnGridLine;
    if (inferred) return inferred;
    let gridLine = null;
    let gridLineGap = intersectionRadius * intersectionRadius;
    for (const fixedAxis of [0, 1]) {
      const fixed = gridIntersection[fixedAxis];
      const lineStart = screen(fixedAxis === 0 ? [fixed, 0] : [0, fixed]);
      const direction = fixedAxis === 0
        ? [alongV[0] - origin[0], alongV[1] - origin[1]]
        : [alongU[0] - origin[0], alongU[1] - origin[1]];
      const lengthSquared = direction[0] * direction[0] + direction[1] * direction[1];
      if (lengthSquared < 1e-9) continue;
      const along = ((rawScreen[0] - lineStart[0]) * direction[0] +
        (rawScreen[1] - lineStart[1]) * direction[1]) / lengthSquared;
      const candidate = fixedAxis === 0 ? [fixed, quantize(along)] : [quantize(along), fixed];
      if (candidate.some(value => Math.abs(value) > extent)) continue;
      const gap = gapSquared(candidate);
      if (gap <= gridLineGap) {
        gridLineGap = gap;
        gridLine = { point: candidate, kind: 'grid-line' };
      }
    }
    if (gridLine) return gridLine;
    const snapped = point.map(quantize);
    if (snapped.some(value => Math.abs(value) > extent)) return null;
    return { point: snapped, kind: 'grid' };
  }

  function withinBounds(entity) {
    const extent = 1000;
    if (!entity) return false;
    if (entity.type === 'circle') return entity.center.every(value => Math.abs(value) + entity.radius <= extent);
    if (entity.type === 'point') return entity.position.every(value => Math.abs(value) <= extent);
    return [entity.start, entity.end].every(point => point.every(value => Math.abs(value) <= extent));
  }

  cad.sketchSnap = { snap, withinBounds };
})(window.WebCAD = window.WebCAD || {});
