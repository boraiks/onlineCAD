(function (cad) {
  'use strict';

  function segments(sketch) {
    return sketch.entities.flatMap(entity => {
      if (entity.type === 'line') return [{ entity, edgeIndex: 0, start: entity.start, end: entity.end }];
      if (entity.type !== 'rectangle') return [];
      const [x1, y1] = entity.start;
      const [x2, y2] = entity.end;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      return corners.map((start, edgeIndex) => ({ entity, edgeIndex, start, end: corners[(edgeIndex + 1) % 4] }));
    });
  }

  function midpoint(segment) {
    return [(segment.start[0] + segment.end[0]) / 2, (segment.start[1] + segment.end[1]) / 2];
  }

  function screenDistance(a, b, screenPoint) {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const length2 = vx * vx + vy * vy;
    if (length2 < 1) return { t: 0, distance: Math.hypot(screenPoint[0] - a[0], screenPoint[1] - a[1]) };
    const t = Math.max(0, Math.min(1, ((screenPoint[0] - a[0]) * vx + (screenPoint[1] - a[1]) * vy) / length2));
    return { t, distance: Math.hypot(screenPoint[0] - a[0] - vx * t, screenPoint[1] - a[1] - vy * t) };
  }

  function segmentAt(sketch, project, screenPoint, maxDistance = 9, lineOnly = false) {
    let best = null;
    for (const segment of segments(sketch)) {
      if (lineOnly && segment.entity.type !== 'line') continue;
      const a = project(segment.start);
      const b = project(segment.end);
      const hit = screenDistance(a, b, screenPoint);
      if (hit && hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = { ...segment, ...hit };
    }
    return best;
  }

  function boundaryAt(sketch, project, screenPoint, maxDistance = 9) {
    return boundariesAt(sketch, project, screenPoint, maxDistance)[0] || null;
  }

  function screenIndex(sketch, project) {
    const items = [];
    const add = (source, points) => {
      const xs = points.map(point => point[0]);
      const ys = points.map(point => point[1]);
      items.push({ source, points, minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys) });
    };
    for (const segment of segments(sketch)) {
      add(segment, [project(segment.start), project(segment.end)]);
    }
    for (const entity of sketch.entities) {
      if (entity.type === 'circle') {
        const points = [];
        for (let index = 0; index <= 96; index++) {
          const angle = index * Math.PI * 2 / 96;
          points.push(project([entity.center[0] + entity.radius * Math.cos(angle),
            entity.center[1] + entity.radius * Math.sin(angle)]));
        }
        add({ entity, edgeIndex: null }, points);
      } else if (entity.type === 'arc') {
        const points = [];
        const count = 36;
        let sweep = entity.endAngle - entity.startAngle;
        if (entity.counterClockwise) {
          if (sweep > 0) sweep -= Math.PI * 2;
        } else {
          if (sweep < 0) sweep += Math.PI * 2;
        }
        for (let index = 0; index <= count; index++) {
          const angle = entity.startAngle + sweep * (index / count);
          points.push(project([entity.center[0] + entity.radius * Math.cos(angle),
            entity.center[1] + entity.radius * Math.sin(angle)]));
        }
        add({ entity, edgeIndex: null }, points);
      }
    }
    return items;
  }

  function boundariesIn(index, screenPoint, maxDistance = 9) {
    const hits = [];
    for (const item of index) {
      if (screenPoint[0] < item.minX - maxDistance || screenPoint[0] > item.maxX + maxDistance ||
        screenPoint[1] < item.minY - maxDistance || screenPoint[1] > item.maxY + maxDistance) continue;
      let best = null;
      for (let pointIndex = 1; pointIndex < item.points.length; pointIndex++) {
        const hit = screenDistance(item.points[pointIndex - 1], item.points[pointIndex], screenPoint);
        if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = hit;
      }
      if (best) hits.push({ ...item.source, ...best });
    }
    return hits.sort((a, b) => a.distance - b.distance);
  }

  function boundariesAt(sketch, project, screenPoint, maxDistance = 9) {
    return boundariesIn(screenIndex(sketch, project), screenPoint, maxDistance);
  }

  function markerPoint(sketch, marker) {
    const segment = segments(sketch).find(item => item.entity.id === marker.entityId && item.edgeIndex === marker.edgeIndex);
    return segment ? midpoint(segment) : null;
  }

  function drawMarker(context, point, permanent = false) {
    const [x, y] = point;
    context.save();
    context.beginPath();
    context.moveTo(x, y - 6);
    context.lineTo(x + 6, y + 5);
    context.lineTo(x - 6, y + 5);
    context.closePath();
    context.fillStyle = permanent ? '#e5f8ed' : '#ffffff';
    context.strokeStyle = '#279566';
    context.lineWidth = 1.7;
    context.fill();
    context.stroke();
    context.restore();
  }

  function entityHandleAt(sketch, project, screenPoint, maxDistance = 10) {
    if (!sketch || !sketch.entities) return null;
    const [sx, sy] = screenPoint;
    const ptDist = (pt) => {
      const proj = project(pt);
      return Math.hypot(sx - proj[0], sy - proj[1]);
    };

    // 1. Vertices / Endpoints
    for (const entity of sketch.entities) {
      if (entity.type === 'point') {
        if (ptDist(entity.position) <= maxDistance) {
          return {
            entity,
            part: 'position',
            point: entity.position,
            isConstant: !!entity.fixed
          };
        }
      } else if (entity.type === 'line') {
        if (ptDist(entity.start) <= maxDistance) {
          return {
            entity,
            part: 'start',
            point: entity.start,
            isConstant: cad.sketchGeometry?.isConstant(entity, sketch)
          };
        }
        if (ptDist(entity.end) <= maxDistance) {
          return {
            entity,
            part: 'end',
            point: entity.end,
            isConstant: cad.sketchGeometry?.isConstant(entity, sketch)
          };
        }
      } else if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        const isWidthConst = cad.sketchGeometry?.isRectangleWidthConstant ? cad.sketchGeometry.isRectangleWidthConstant(entity, sketch) : cad.sketchGeometry?.isConstant(entity, sketch, 0);
        const isHeightConst = cad.sketchGeometry?.isRectangleHeightConstant ? cad.sketchGeometry.isRectangleHeightConstant(entity, sketch) : cad.sketchGeometry?.isConstant(entity, sketch, 1);
        for (let i = 0; i < 4; i++) {
          if (ptDist(corners[i]) <= maxDistance) {
            return {
              entity,
              part: 'corner',
              cornerIndex: i,
              point: corners[i],
              isConstant: isWidthConst && isHeightConst,
              isWidthConstant: isWidthConst,
              isHeightConstant: isHeightConst
            };
          }
        }
      } else if (entity.type === 'circle') {
        if (ptDist(entity.center) <= maxDistance) {
          return {
            entity,
            part: 'center',
            point: entity.center,
            isConstant: false
          };
        }
      }
    }

    // 2. Boundaries / Edges
    for (const entity of sketch.entities) {
      if (entity.type === 'circle') {
        const centerProj = project(entity.center);
        const screenDistToCenter = Math.hypot(sx - centerProj[0], sy - centerProj[1]);
        const rimProj = project([entity.center[0] + entity.radius, entity.center[1]]);
        const screenRadius = Math.hypot(rimProj[0] - centerProj[0], rimProj[1] - centerProj[1]);
        if (Math.abs(screenDistToCenter - screenRadius) <= maxDistance) {
          return {
            entity,
            part: 'perimeter',
            isConstant: cad.sketchGeometry?.isConstant(entity, sketch)
          };
        }
      } else if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        const isWidthConst = cad.sketchGeometry?.isRectangleWidthConstant ? cad.sketchGeometry.isRectangleWidthConstant(entity, sketch) : cad.sketchGeometry?.isConstant(entity, sketch, 0);
        const isHeightConst = cad.sketchGeometry?.isRectangleHeightConstant ? cad.sketchGeometry.isRectangleHeightConstant(entity, sketch) : cad.sketchGeometry?.isConstant(entity, sketch, 1);
        for (let i = 0; i < 4; i++) {
          const a = project(corners[i]);
          const b = project(corners[(i + 1) % 4]);
          const hit = screenDistance(a, b, screenPoint);
          if (hit && hit.distance <= maxDistance) {
            const isMotionBlocked = cad.sketchGeometry?.isRectangleEdgeMotionBlocked
              ? cad.sketchGeometry.isRectangleEdgeMotionBlocked(entity, sketch, i)
              : ((i === 0 || i === 2) ? isHeightConst : isWidthConst);
            return {
              entity,
              part: 'edge',
              edgeIndex: i,
              isConstant: isMotionBlocked,
              isWidthConstant: isWidthConst,
              isHeightConstant: isHeightConst
            };
          }
        }
      } else if (entity.type === 'line') {
        const a = project(entity.start);
        const b = project(entity.end);
        const hit = screenDistance(a, b, screenPoint);
        if (hit && hit.distance <= maxDistance) {
          return {
            entity,
            part: 'segment',
            isConstant: cad.sketchGeometry?.isConstant(entity, sketch)
          };
        }
      }
    }

    return null;
  }

  function pointHandleAt(sketch, project, screenPoint, maxDistance = 12) {
    if (!sketch || !sketch.entities) return null;
    const [sx, sy] = screenPoint;
    const ptDist = (pt) => {
      const proj = project(pt);
      return Math.hypot(sx - proj[0], sy - proj[1]);
    };

    // 1. Origin [0, 0]
    if (ptDist([0, 0]) <= maxDistance) {
      return { entity: null, isOrigin: true, part: 'origin', point: [0, 0], isConstant: true };
    }

    // 2. Standalone sketch points
    for (const entity of sketch.entities) {
      if (entity.type === 'point') {
        if (ptDist(entity.position) <= maxDistance) {
          return { entity, part: 'position', point: entity.position, isConstant: !!entity.fixed };
        }
      }
    }

    // 3. Line endpoints
    for (const entity of sketch.entities) {
      if (entity.type === 'line') {
        if (ptDist(entity.start) <= maxDistance) {
          return { entity, part: 'start', point: entity.start, isConstant: !!entity.fixed };
        }
        if (ptDist(entity.end) <= maxDistance) {
          return { entity, part: 'end', point: entity.end, isConstant: !!entity.fixed };
        }
      }
    }

    // 4. Rectangle corners
    for (const entity of sketch.entities) {
      if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        for (let i = 0; i < 4; i++) {
          if (ptDist(corners[i]) <= maxDistance) {
            return { entity, part: 'corner', cornerIndex: i, point: corners[i], isConstant: !!entity.fixed };
          }
        }
      }
    }

    // 5. Circle center
    for (const entity of sketch.entities) {
      if (entity.type === 'circle') {
        if (ptDist(entity.center) <= maxDistance) {
          return { entity, part: 'center', point: entity.center, isConstant: !!entity.fixed };
        }
      }
    }

    // 6. Arc center and endpoints
    for (const entity of sketch.entities) {
      if (entity.type === 'arc') {
        if (entity.center && ptDist(entity.center) <= maxDistance) {
          return { entity, part: 'center', point: entity.center, isConstant: !!entity.fixed };
        }
        if (entity.start && ptDist(entity.start) <= maxDistance) {
          return { entity, part: 'start', point: entity.start, isConstant: !!entity.fixed };
        }
        if (entity.end && ptDist(entity.end) <= maxDistance) {
          return { entity, part: 'end', point: entity.end, isConstant: !!entity.fixed };
        }
      }
    }

    return null;
  }

  cad.sketchHitTest = { segments, midpoint, segmentAt, boundaryAt, boundariesAt, screenIndex,
    boundariesIn, markerPoint, drawMarker, entityHandleAt, pointHandleAt };
})(window.WebCAD = window.WebCAD || {});
