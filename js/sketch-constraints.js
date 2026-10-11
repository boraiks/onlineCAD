(function (cad) {
  'use strict';

  const epsilon = 1e-7;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const equal = (a, b) => distance(a, b) < epsilon;

  function tangentCandidates(anchor, circle) {
    const vx = anchor[0] - circle.center[0];
    const vy = anchor[1] - circle.center[1];
    const squared = vx * vx + vy * vy;
    const radius2 = circle.radius * circle.radius;
    if (squared <= radius2 + epsilon) return null;
    const foot = [circle.center[0] + vx * radius2 / squared,
      circle.center[1] + vy * radius2 / squared];
    const scale = circle.radius * Math.sqrt(squared - radius2) / squared;
    return [[foot[0] - vy * scale, foot[1] + vx * scale],
      [foot[0] + vy * scale, foot[1] - vx * scale]];
  }

  function getPointCoordinate(sketch, pointRef) {
    if (!pointRef) return null;
    if (pointRef.part === 'origin' || pointRef.isOrigin) return [0, 0];
    const entity = sketch?.entities?.find(e => e.id === pointRef.entityId);
    if (!entity) return null;
    if (pointRef.part === 'position' && entity.type === 'point') return entity.position;
    if (pointRef.part === 'start' && entity.start) return entity.start;
    if (pointRef.part === 'end' && entity.end) return entity.end;
    if (pointRef.part === 'center' && entity.center) return entity.center;
    if (pointRef.part === 'corner' && entity.type === 'rectangle') {
      const [x1, y1] = entity.start;
      const [x2, y2] = entity.end;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      return corners[pointRef.cornerIndex ?? 0];
    }
    return null;
  }

  function setPointCoordinate(sketch, pointRef, newCoord) {
    if (!pointRef || pointRef.part === 'origin' || pointRef.isOrigin) return false;
    const entity = sketch?.entities?.find(e => e.id === pointRef.entityId);
    const current = getPointCoordinate(sketch, pointRef);
    if (!entity || entity.fixed || !current || equal(current, newCoord)) return false;
    const delta = [newCoord[0] - current[0], newCoord[1] - current[1]];
    const move = point => [point[0] + delta[0], point[1] + delta[1]];
    let next = null;
    if (entity.type === 'point' && pointRef.part === 'position')
      next = { ...entity, position: [...newCoord] };
    else if (entity.type === 'circle' && pointRef.part === 'center')
      next = { ...entity, center: [...newCoord] };
    else if (entity.type === 'rectangle' && pointRef.part === 'corner')
      next = { ...entity, start: move(entity.start), end: move(entity.end) };
    else if (entity.type === 'arc' && ['center', 'start', 'end'].includes(pointRef.part))
      next = { ...entity, center: move(entity.center), start: move(entity.start), end: move(entity.end) };
    else if (entity.type === 'line' && ['start', 'end'].includes(pointRef.part)) {
      const preserveShape = cad.sketchGeometry.isConstant(entity, sketch) || Number.isFinite(entity.dimensions?.angle);
      next = preserveShape
        ? { ...entity, start: move(entity.start), end: move(entity.end) }
        : { ...entity, [pointRef.part]: [...newCoord] };
    }
    if (!next || !cad.sketchGeometry.valid(next) || !cad.sketchSnap.withinBounds(next) ||
      (next.type === 'arc' && next.center.some(value => Math.abs(value) > 1000))) return false;
    for (const key of ['position', 'center', 'start', 'end']) {
      if (next[key] && next[key] !== entity[key]) entity[key] = next[key];
    }
    return true;
  }

  function isPointFixed(sketch, pointRef) {
    if (!pointRef) return false;
    if (pointRef.part === 'origin' || pointRef.isOrigin) return true;
    const entity = sketch?.entities?.find(e => e.id === pointRef.entityId);
    return !!entity?.fixed;
  }

  function makeAxis(entity, type) {
    if (entity?.type !== 'line' || entity.fixed || !['horizontal', 'vertical'].includes(type)) return null;
    const direction = type === 'horizontal' ? 0 : 1;
    const other = 1 - direction;
    const sign = Math.sign(entity.end[direction] - entity.start[direction]) ||
      Math.sign(entity.end[other] - entity.start[other]) || 1;
    const end = [...entity.start];
    end[direction] += sign * distance(entity.start, entity.end);
    if (!cad.sketchSnap.withinBounds({ ...entity, end })) return null;
    return { type, entityId: entity.id, sign };
  }

  function makeAxisPoints(point1Ref, point2Ref, type) {
    if (!point1Ref || !point2Ref || !['horizontal', 'vertical'].includes(type)) return null;
    const locked1 = Boolean(point1Ref.isOrigin || point1Ref.entity?.fixed);
    const locked2 = Boolean(point2Ref.isOrigin || point2Ref.entity?.fixed);
    const coordinate = type === 'horizontal' ? 1 : 0;
    if (locked1 && locked2 && point1Ref.point && point2Ref.point &&
      Math.abs(point1Ref.point[coordinate] - point2Ref.point[coordinate]) > epsilon) return null;
    const firstId = point1Ref.entityId || point1Ref.entity?.id;
    const secondId = point2Ref.entityId || point2Ref.entity?.id;
    if (firstId && firstId === secondId) {
      const line = point1Ref.entity || point2Ref.entity;
      return line?.type === 'line' && point1Ref.part !== point2Ref.part
        ? makeAxis(line, type) : null;
    }
    return {
      type,
      point1: {
        entityId: point1Ref.entityId || point1Ref.entity?.id || null,
        part: point1Ref.part,
        cornerIndex: point1Ref.cornerIndex ?? null,
        isOrigin: !!point1Ref.isOrigin || point1Ref.part === 'origin'
      },
      point2: {
        entityId: point2Ref.entityId || point2Ref.entity?.id || null,
        part: point2Ref.part,
        cornerIndex: point2Ref.cornerIndex ?? null,
        isOrigin: !!point2Ref.isOrigin || point2Ref.part === 'origin'
      }
    };
  }

  function axisFor(first, second) {
    if (Array.isArray(first) && Array.isArray(second)) {
      return Math.abs(second[0] - first[0]) >= Math.abs(second[1] - first[1])
        ? 'horizontal' : 'vertical';
    }
    if (first?.point && second?.point) {
      return Math.abs(second.point[0] - first.point[0]) >= Math.abs(second.point[1] - first.point[1])
        ? 'horizontal' : 'vertical';
    }
    if (first?.type === 'line') {
      return Math.abs(first.end[0] - first.start[0]) >= Math.abs(first.end[1] - first.start[1])
        ? 'horizontal' : 'vertical';
    }
    return null;
  }

  const pointRef = handle => handle && ({ entityId: handle.entity?.id || handle.entityId || null,
    part: handle.part, cornerIndex: handle.cornerIndex ?? null,
    isOrigin: !!handle.isOrigin || handle.part === 'origin' });

  function makeCoincident(first, second) {
    const a = first?.part ? pointRef(first) : null;
    const b = second?.part ? pointRef(second) : null;
    if (a && b) {
      if (a.entityId === b.entityId && a.part === b.part && a.cornerIndex === b.cornerIndex) return null;
      return { type: 'coincident', point1: a, point2: b };
    }
    const point = a || b;
    const curve = a ? second : first;
    if (!point || !curve?.entity || point.entityId === curve.entity.id ||
      !['line', 'rectangle', 'circle', 'arc'].includes(curve.entity.type)) return null;
    return { type: 'coincident', point, curveId: curve.entity.id, edgeIndex: curve.edgeIndex ?? null };
  }

  function makeSnapConstraint(sketch, point, snap) {
    if (!point?.entity || !snap?.point) return null;
    if (snap.target?.part) {
      if (snap.target.entityId && !sketch?.entities?.some(entity => entity.id === snap.target.entityId)) return null;
      return makeCoincident(snap.target, point);
    }
    if (!['on-edge', 'on-circle', 'midpoint'].includes(snap.kind)) return null;
    const curve = sketch?.entities?.find(entity => entity.id === snap.entityId);
    if (!curve || curve.id === point.entity.id) return null;
    const definition = makeCoincident(point, { entity: curve, edgeIndex: snap.edgeIndex });
    if (!definition) return null;
    if (curve.type === 'circle' || curve.type === 'arc') {
      definition.attachment = { kind: 'angle', value: Math.atan2(
        snap.point[1] - curve.center[1], snap.point[0] - curve.center[0]) };
    } else if (curve.type === 'line' || curve.type === 'rectangle') {
      let start = curve.start, end = curve.end;
      if (curve.type === 'rectangle') {
        const [x1, y1] = curve.start, [x2, y2] = curve.end;
        const vertices = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        start = vertices[snap.edgeIndex ?? 0];
        end = vertices[((snap.edgeIndex ?? 0) + 1) % 4];
      }
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1e-12) return null;
      definition.attachment = { kind: 'edge', value: snap.kind === 'midpoint' ? 0.5
        : Math.max(0, Math.min(1, ((snap.point[0] - start[0]) * dx +
          (snap.point[1] - start[1]) * dy) / lengthSquared)) };
    }
    return definition;
  }

  function curvePoint(entity, edgeIndex, point) {
    if (!entity) return null;
    if (entity.type === 'line' || entity.type === 'rectangle') {
      let start = entity.start, end = entity.end;
      if (entity.type === 'rectangle') {
        const x1 = entity.start[0], y1 = entity.start[1], x2 = entity.end[0], y2 = entity.end[1];
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        start = corners[edgeIndex ?? 0]; end = corners[((edgeIndex ?? 0) + 1) % 4];
      }
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
      return [start[0] + t * dx, start[1] + t * dy];
    }
    if (entity.type === 'circle' || entity.type === 'arc') {
      let angle = Math.atan2(point[1] - entity.center[1], point[0] - entity.center[0]);
      if (entity.type === 'arc') {
        const tau = Math.PI * 2;
        const normalized = a => (a % tau + tau) % tau;
        const sweep = entity.counterClockwise
          ? normalized(entity.startAngle - entity.endAngle) : normalized(entity.endAngle - entity.startAngle);
        const progress = entity.counterClockwise
          ? normalized(entity.startAngle - angle) : normalized(angle - entity.startAngle);
        if (progress > sweep) angle = distance(point, entity.start) <= distance(point, entity.end)
          ? entity.startAngle : entity.endAngle;
      }
      return [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
    }
    return null;
  }

  function attachedPoint(entity, constraint, point) {
    const attachment = constraint.attachment;
    if (!attachment) return curvePoint(entity, constraint.edgeIndex, point);
    if (attachment.kind === 'angle' && ['circle', 'arc'].includes(entity?.type)) {
      return [entity.center[0] + entity.radius * Math.cos(attachment.value),
        entity.center[1] + entity.radius * Math.sin(attachment.value)];
    }
    if (attachment.kind === 'edge' && ['line', 'rectangle'].includes(entity?.type)) {
      let start = entity.start, end = entity.end;
      if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start, [x2, y2] = entity.end;
        const vertices = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        start = vertices[constraint.edgeIndex ?? 0];
        end = vertices[((constraint.edgeIndex ?? 0) + 1) % 4];
      }
      return [start[0] + (end[0] - start[0]) * attachment.value,
        start[1] + (end[1] - start[1]) * attachment.value];
    }
    return curvePoint(entity, constraint.edgeIndex, point);
  }

  function translateCurve(entity, delta) {
    if (!entity || entity.fixed) return false;
    const move = point => [point[0] + delta[0], point[1] + delta[1]];
    const next = { ...entity };
    for (const key of ['start', 'end', 'center']) if (entity[key]) next[key] = move(entity[key]);
    if (!cad.sketchGeometry.valid(next) || !cad.sketchSnap.withinBounds(next)) return false;
    for (const key of ['start', 'end', 'center']) if (next[key]) entity[key] = next[key];
    return true;
  }

  function curveLength(entity, edgeIndex) {
    if (entity?.type === 'circle' || entity?.type === 'arc') return entity.radius;
    if (entity?.type === 'line') return distance(entity.start, entity.end);
    if (entity?.type === 'rectangle') {
      const axis = edgeIndex === 0 || edgeIndex === 2 ? 0 : 1;
      return Math.abs(entity.end[axis] - entity.start[axis]);
    }
    return null;
  }

  function makeEqual(first, second) {
    if (!first?.entity || !second?.entity) return null;
    if (first.entity.id === second.entity.id && !(first.entity.type === 'rectangle' &&
      (first.edgeIndex ?? 0) % 2 !== (second.edgeIndex ?? 0) % 2)) return null;
    const circle1 = ['circle', 'arc'].includes(first.entity.type);
    const circle2 = ['circle', 'arc'].includes(second.entity.type);
    if (circle1 !== circle2 || curveLength(first.entity, first.edgeIndex) === null ||
      curveLength(second.entity, second.edgeIndex) === null) return null;
    const firstSize = curveLength(first.entity, first.edgeIndex);
    const secondSize = curveLength(second.entity, second.edgeIndex);
    if (first.entity.fixed && second.entity.fixed && Math.abs(firstSize - secondSize) > epsilon) return null;
    return { type: 'equal', first: { entityId: first.entity.id, edgeIndex: first.edgeIndex ?? 0 },
      second: { entityId: second.entity.id, edgeIndex: second.edgeIndex ?? 0 },
      lastFirst: firstSize, lastSecond: secondSize };
  }

  function setCurveLength(sketch, ref, desired) {
    const entity = sketch.entities.find(item => item.id === ref.entityId);
    if (!entity || entity.fixed || !Number.isFinite(desired) || desired < cad.sketchGrid.precision) return false;
    const current = curveLength(entity, ref.edgeIndex);
    if (current === null || Math.abs(current - desired) < epsilon) return false;
    if (entity.type === 'circle' || entity.type === 'arc') {
      const scale = desired / entity.radius;
      const next = { ...entity, radius: desired };
      if (entity.type === 'arc') {
        const move = point => [entity.center[0] + (point[0] - entity.center[0]) * scale,
          entity.center[1] + (point[1] - entity.center[1]) * scale];
        next.start = move(entity.start); next.end = move(entity.end);
      }
      if (!cad.sketchSnap.withinBounds(next)) return false;
      entity.radius = desired;
      if (entity.type === 'arc') { entity.start = next.start; entity.end = next.end; }
      if (Number.isFinite(entity.dimensions?.diameter)) entity.dimensions.diameter = desired * 2;
      if (Number.isFinite(entity.dimensions?.radius)) entity.dimensions.radius = desired;
      return true;
    }
    if (entity.type === 'line') {
      const scale = desired / current;
      const end = [entity.start[0] + (entity.end[0] - entity.start[0]) * scale,
        entity.start[1] + (entity.end[1] - entity.start[1]) * scale];
      if (!cad.sketchSnap.withinBounds({ ...entity, end })) return false;
      entity.end = end;
      if (Number.isFinite(entity.dimensions?.length)) entity.dimensions.length = desired;
      return true;
    }
    const axis = ref.edgeIndex === 0 || ref.edgeIndex === 2 ? 0 : 1;
    const end = [...entity.end];
    end[axis] = entity.start[axis] + Math.sign(entity.end[axis] - entity.start[axis]) * desired;
    if (!cad.sketchSnap.withinBounds({ ...entity, end })) return false;
    entity.end = end;
    if (Number.isFinite(entity.dimensions?.[axis === 0 ? 'width' : 'height']))
      entity.dimensions[axis === 0 ? 'width' : 'height'] = desired;
    return true;
  }

  function makeTangent(first, second) {
    if (!first || !second || first.id === second.id) return null;
    const line = first.type === 'line' ? first : second.type === 'line' ? second : null;
    const circle = ['circle', 'arc'].includes(first.type) ? first : ['circle', 'arc'].includes(second.type) ? second : null;
    if (line && circle) {
      if (line.fixed) return null;
      const movingEnd = distance(line.start, circle.center) < distance(line.end, circle.center) ? 'start' : 'end';
      const anchor = line[movingEnd === 'start' ? 'end' : 'start'];
      const choices = tangentCandidates(anchor, circle);
      if (!choices) return null;
      const valid = choices.map((point, index) => ({ point, index }))
        .filter(item => circle.type !== 'arc' || curvePoint(circle, null, item.point)
          && distance(curvePoint(circle, null, item.point), item.point) < 1e-5);
      if (!valid.length) return null;
      valid.sort((a, b) => distance(a.point, line[movingEnd]) - distance(b.point, line[movingEnd]));
      const side = valid[0].index;
      if (!cad.sketchSnap.withinBounds({ ...line, [movingEnd]: choices[side] })) return null;
      return { type: 'tangent', lineId: line.id, circleId: circle.id, movingEnd, side };
    }
    if (['circle', 'arc'].includes(first.type) && ['circle', 'arc'].includes(second.type)) {
      if (second.fixed) return null;
      if (equal(first.center, second.center)) return null;
      const dx = second.center[0] - first.center[0];
      const dy = second.center[1] - first.center[1];
      const length = Math.hypot(dx, dy);
      const nextCenter = [first.center[0] + dx * (first.radius + second.radius) / length,
        first.center[1] + dy * (first.radius + second.radius) / length];
      const contact = [first.center[0] + dx * first.radius / length,
        first.center[1] + dy * first.radius / length];
      if ((first.type === 'arc' && distance(curvePoint(first, null, contact), contact) > 1e-5) ||
        (second.type === 'arc' && distance(curvePoint(second, null, [second.center[0] - dx * second.radius / length,
          second.center[1] - dy * second.radius / length]),
        [second.center[0] - dx * second.radius / length, second.center[1] - dy * second.radius / length]) > 1e-5)) return null;
      if (!cad.sketchSnap.withinBounds({ ...second, center: nextCenter })) return null;
      return { type: 'tangent', firstCircleId: first.id, secondCircleId: second.id };
    }
    return null;
  }

  function enforce(sketch) {
    if (!sketch?.constraints?.length) return false;
    let anyChanged = false;
    const entities = new Map(sketch.entities.map(entity => [entity.id, entity]));
    const find = id => entities.get(id);

    // Iterative constraint relaxation loop (up to 5 iterations)
    for (let iter = 0; iter < 5; iter++) {
      let passChanged = false;

      for (const constraint of sketch.constraints) {
        if (constraint.type === 'coincident') {
          const first = getPointCoordinate(sketch, constraint.point1 || constraint.point);
          const curve = constraint.curveId && find(constraint.curveId);
          const target = constraint.point2 ? getPointCoordinate(sketch, constraint.point2)
            : attachedPoint(curve, constraint, first || [0, 0]);
          if (!first || !target) continue;
          if (curve && isPointFixed(sketch, constraint.point)) {
            if (translateCurve(curve, [first[0] - target[0], first[1] - target[1]])) passChanged = true;
          } else if (constraint.point2 && isPointFixed(sketch, constraint.point2) && !isPointFixed(sketch, constraint.point1)) {
            if (setPointCoordinate(sketch, constraint.point1, target)) passChanged = true;
          } else if (setPointCoordinate(sketch, constraint.point2 || constraint.point, constraint.point2 ? first : target))
            passChanged = true;
        }
        else if (constraint.type === 'equal') {
          const first = find(constraint.first.entityId), second = find(constraint.second.entityId);
          const firstSize = curveLength(first, constraint.first.edgeIndex);
          const secondSize = curveLength(second, constraint.second.edgeIndex);
          if (firstSize === null || secondSize === null) continue;
          const secondEdited = Math.abs(secondSize - constraint.lastSecond) > epsilon &&
            Math.abs(firstSize - constraint.lastFirst) < epsilon;
          if ((first?.fixed && !second?.fixed) || (!first?.fixed && !second?.fixed && !secondEdited)) {
            if (setCurveLength(sketch, constraint.second, firstSize)) passChanged = true;
          } else if (!first?.fixed) {
            if (setCurveLength(sketch, constraint.first, secondSize)) passChanged = true;
          }
          constraint.lastFirst = curveLength(first, constraint.first.edgeIndex);
          constraint.lastSecond = curveLength(second, constraint.second.edgeIndex);
        }
        // 1. Single line horizontal / vertical
        else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.entityId) {
          const line = find(constraint.entityId);
          if (line?.type !== 'line' || line.fixed) continue;
          const axis = constraint.type === 'horizontal' ? 0 : 1;
          const length = Number.isFinite(line.dimensions?.length)
            ? line.dimensions.length : distance(line.start, line.end);
          const sign = Math.sign(line.end[axis] - line.start[axis]) || constraint.sign || 1;

          if (constraint.type === 'horizontal') {
            if (Math.abs(line.end[1] - line.start[1]) > epsilon) {
              line.end[1] = line.start[1];
              passChanged = true;
            }
            const nextEnd0 = line.start[0] + sign * length;
            if (Math.abs(line.end[0] - nextEnd0) > epsilon) {
              line.end[0] = nextEnd0;
              passChanged = true;
            }
            if (Number.isFinite(line.dimensions?.angle)) {
              line.dimensions.angle = line.end[0] >= line.start[0] ? 0 : 180;
            }
          } else { // vertical
            if (Math.abs(line.end[0] - line.start[0]) > epsilon) {
              line.end[0] = line.start[0];
              passChanged = true;
            }
            const nextEnd1 = line.start[1] + sign * length;
            if (Math.abs(line.end[1] - nextEnd1) > epsilon) {
              line.end[1] = nextEnd1;
              passChanged = true;
            }
            if (Number.isFinite(line.dimensions?.angle)) {
              line.dimensions.angle = line.end[1] >= line.start[1] ? 90 : -90;
            }
          }
        }
        // 2. Point-to-point horizontal / vertical
        else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.point1 && constraint.point2) {
          const c1 = getPointCoordinate(sketch, constraint.point1);
          const c2 = getPointCoordinate(sketch, constraint.point2);
          if (!c1 || !c2) continue;

          const p1Fixed = isPointFixed(sketch, constraint.point1);
          const p2Fixed = isPointFixed(sketch, constraint.point2);

          if (constraint.type === 'horizontal') {
            const diff = Math.abs(c1[1] - c2[1]);
            if (diff > epsilon) {
              if (p1Fixed && !p2Fixed) {
                if (setPointCoordinate(sketch, constraint.point2, [c2[0], c1[1]])) passChanged = true;
              } else if (p2Fixed && !p1Fixed) {
                if (setPointCoordinate(sketch, constraint.point1, [c1[0], c2[1]])) passChanged = true;
              } else if (!p1Fixed && !p2Fixed) {
                if (setPointCoordinate(sketch, constraint.point2, [c2[0], c1[1]])) passChanged = true;
              }
            }
          } else { // vertical
            const diff = Math.abs(c1[0] - c2[0]);
            if (diff > epsilon) {
              if (p1Fixed && !p2Fixed) {
                if (setPointCoordinate(sketch, constraint.point2, [c1[0], c2[1]])) passChanged = true;
              } else if (p2Fixed && !p1Fixed) {
                if (setPointCoordinate(sketch, constraint.point1, [c2[0], c1[1]])) passChanged = true;
              } else if (!p1Fixed && !p2Fixed) {
                if (setPointCoordinate(sketch, constraint.point2, [c1[0], c2[1]])) passChanged = true;
              }
            }
          }
        }
        // 3. Line-circle tangent
        else if (constraint.type === 'tangent' && constraint.lineId) {
          const line = find(constraint.lineId);
          const circle = find(constraint.circleId);
          if (line?.type !== 'line' || line.fixed || !['circle', 'arc'].includes(circle?.type)) continue;
          const anchor = line[constraint.movingEnd === 'start' ? 'end' : 'start'];
          const choices = tangentCandidates(anchor, circle);
          const next = choices?.[constraint.side];
          if (next && (circle.type !== 'arc' || distance(curvePoint(circle, null, next), next) < 1e-5) &&
            !equal(next, line[constraint.movingEnd]) &&
            cad.sketchSnap.withinBounds({ ...line, [constraint.movingEnd]: next })) {
            line[constraint.movingEnd] = next;
            if (Number.isFinite(line.dimensions?.length)) line.dimensions.length = distance(line.start, line.end);
            if (Number.isFinite(line.dimensions?.angle))
              line.dimensions.angle = Math.atan2(line.end[1] - line.start[1], line.end[0] - line.start[0]) * 180 / Math.PI;
            passChanged = true;
          }
        }
        // 4. Circle-circle tangent
        else if (constraint.type === 'tangent' && constraint.firstCircleId) {
          const first = find(constraint.firstCircleId);
          const second = find(constraint.secondCircleId);
          if (!['circle', 'arc'].includes(first?.type) || !['circle', 'arc'].includes(second?.type) || second.fixed) continue;
          const dx = second.center[0] - first.center[0];
          const dy = second.center[1] - first.center[1];
          const length = Math.hypot(dx, dy);
          if (length < epsilon) continue;
          const desired = first.radius + second.radius;
          const next = [first.center[0] + dx * desired / length, first.center[1] + dy * desired / length];
          if (!equal(next, second.center) && translateCurve(second,
            [next[0] - second.center[0], next[1] - second.center[1]])) {
            passChanged = true;
          }
        }
      }

      if (passChanged) anyChanged = true;
      else break;
    }

    if (anyChanged) sketch.revision++;
    return anyChanged;
  }

  function marker(context, point, text, isHovered = false) {
    if (!point) return;
    context.save();
    context.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Background pill
    context.fillStyle = isHovered ? '#e1f2fc' : 'rgba(255, 255, 255, 0.94)';
    context.fillRect(point[0] - 8, point[1] - 8, 16, 16);
    
    // Border
    context.strokeStyle = isHovered ? '#127fb2' : '#7baec7';
    context.lineWidth = isHovered ? 1.6 : 1;
    context.strokeRect(point[0] - 8, point[1] - 8, 16, 16);
    
    // Letter
    context.fillStyle = isHovered ? '#0b5b82' : '#267aa4';
    context.fillText(text, point[0], point[1] + 0.5);
    context.restore();
  }

  function fixedMarker(context, point) {
    if (!point) return;
    context.save();
    context.translate(point[0] + 12, point[1] - 12);
    context.fillStyle = '#ffffff';
    context.fillRect(-8, -9, 16, 18);
    context.strokeStyle = '#263b49';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(0, -3, 3.5, Math.PI, 0);
    context.lineTo(3.5, 0);
    context.moveTo(-3.5, -3);
    context.lineTo(-3.5, 0);
    context.stroke();
    context.fillStyle = '#dce9ef';
    context.fillRect(-6, 0, 12, 8);
    context.strokeRect(-6, 0, 12, 8);
    context.restore();
  }

  function fixedAnchor(entity) {
    if (entity.type === 'point') return entity.position;
    if (entity.type === 'circle') return entity.center;
    if (entity.start && entity.end) return [(entity.start[0] + entity.end[0]) / 2,
      (entity.start[1] + entity.end[1]) / 2];
    return null;
  }

  function hitTest(sketch, project, screenPoint, maxDistance = 10) {
    if (!sketch?.constraints?.length) return null;
    const [sx, sy] = screenPoint;
    const dist = (p) => Math.hypot(sx - p[0], sy - p[1]);

    const entities = new Map(sketch.entities.map(e => [e.id, e]));
    const find = id => entities.get(id);

    for (const constraint of sketch.constraints) {
      if (constraint.type === 'coincident') {
        const point = getPointCoordinate(sketch, constraint.point2 || constraint.point1 || constraint.point);
        if (point) {
          const at = project(point);
          if (dist(at) <= maxDistance) return { constraint, point: at };
        }
      } else if (constraint.type === 'equal') {
        const entity = find(constraint.second.entityId);
        if (entity) {
          const at = entity.type === 'circle' ? project([entity.center[0] + entity.radius, entity.center[1]])
            : project([(entity.start[0] + entity.end[0]) / 2, (entity.start[1] + entity.end[1]) / 2]);
          if (dist(at) <= maxDistance) return { constraint, point: at };
        }
      } else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.entityId) {
        const line = find(constraint.entityId);
        if (line?.type === 'line') {
          const mid = project([(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]);
          if (dist(mid) <= maxDistance) return { constraint, point: mid };
        }
      } else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.point1 && constraint.point2) {
        const c1 = getPointCoordinate(sketch, constraint.point1);
        const c2 = getPointCoordinate(sketch, constraint.point2);
        if (c1 && c2) {
          const s1 = project(c1);
          const s2 = project(c2);
          const mid = [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2];
          if (dist(mid) <= maxDistance) return { constraint, point: mid };
          const p1Pos = [s1[0] + 10, s1[1] - 10];
          if (dist(p1Pos) <= maxDistance) return { constraint, point: p1Pos };
          const p2Pos = [s2[0] + 10, s2[1] - 10];
          if (dist(p2Pos) <= maxDistance) return { constraint, point: p2Pos };
        }
      } else if (constraint.lineId) {
        const line = find(constraint.lineId);
        if (line?.type === 'line') {
          const pt = project(line[constraint.movingEnd]);
          if (dist(pt) <= maxDistance) return { constraint, point: pt };
        }
      } else if (constraint.firstCircleId) {
        const first = find(constraint.firstCircleId);
        const second = find(constraint.secondCircleId);
        if (['circle', 'arc'].includes(first?.type) && ['circle', 'arc'].includes(second?.type)) {
          const dx = second.center[0] - first.center[0];
          const dy = second.center[1] - first.center[1];
          const length = Math.hypot(dx, dy);
          if (length > epsilon) {
            const pt = project([first.center[0] + dx * first.radius / length, first.center[1] + dy * first.radius / length]);
            if (dist(pt) <= maxDistance) return { constraint, point: pt };
          }
        }
      }
    }
    return null;
  }

  function render(context, sketch, project, hoveredConstraintId = null) {
    if (!sketch) return;
    if (sketch.constraints?.length) {
      const entities = new Map(sketch.entities.map(entity => [entity.id, entity]));
      const find = id => entities.get(id);
      for (const constraint of sketch.constraints) {
        const isHovered = hoveredConstraintId === constraint.id;
        if (constraint.type === 'coincident') {
          const point = getPointCoordinate(sketch, constraint.point2 || constraint.point1 || constraint.point);
          if (point) marker(context, project(point), '●', isHovered);
        } else if (constraint.type === 'equal') {
          const entity = find(constraint.second.entityId);
          if (entity) {
            const at = entity.type === 'circle' ? [entity.center[0] + entity.radius, entity.center[1]]
              : entity.type === 'rectangle' ? [(entity.start[0] + entity.end[0]) / 2, (entity.start[1] + entity.end[1]) / 2]
                : [(entity.start[0] + entity.end[0]) / 2, (entity.start[1] + entity.end[1]) / 2];
            marker(context, project(at), '=', isHovered);
          }
        } else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.entityId) {
          const line = find(constraint.entityId);
          if (line?.type === 'line') {
            const mid = project([(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2]);
            marker(context, mid, constraint.type === 'horizontal' ? 'H' : 'V', isHovered);
          }
        } else if ((constraint.type === 'horizontal' || constraint.type === 'vertical') && constraint.point1 && constraint.point2) {
          const c1 = getPointCoordinate(sketch, constraint.point1);
          const c2 = getPointCoordinate(sketch, constraint.point2);
          if (c1 && c2) {
            const s1 = project(c1);
            const s2 = project(c2);

            // Draw dashed alignment connector between the constrained points
            context.save();
            context.setLineDash([3, 3]);
            context.strokeStyle = isHovered ? '#127fb2' : 'rgba(38, 122, 164, 0.45)';
            context.lineWidth = isHovered ? 1.8 : 1.2;
            context.beginPath();
            context.moveTo(s1[0], s1[1]);
            context.lineTo(s2[0], s2[1]);
            context.stroke();

            // Small endpoint dots
            context.fillStyle = isHovered ? '#127fb2' : '#267aa4';
            context.beginPath();
            context.arc(s1[0], s1[1], 2.5, 0, Math.PI * 2);
            context.arc(s2[0], s2[1], 2.5, 0, Math.PI * 2);
            context.fill();
            context.restore();

            // Marker at the midpoint of the connector
            const mid = [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2];
            marker(context, mid, constraint.type === 'horizontal' ? 'H' : 'V', isHovered);
          }
        } else if (constraint.lineId) {
          const line = find(constraint.lineId);
          if (line?.type === 'line') marker(context, project(line[constraint.movingEnd]), 'T', isHovered);
        } else if (constraint.firstCircleId) {
          const first = find(constraint.firstCircleId);
          const second = find(constraint.secondCircleId);
          if (['circle', 'arc'].includes(first?.type) && ['circle', 'arc'].includes(second?.type)) {
            const dx = second.center[0] - first.center[0];
            const dy = second.center[1] - first.center[1];
            const length = Math.hypot(dx, dy);
            if (length > epsilon) marker(context, project([first.center[0] + dx * first.radius / length,
              first.center[1] + dy * first.radius / length]), 'T', isHovered);
          }
        }
      }
    }
    for (const entity of sketch.entities) {
      if (entity.fixed) fixedMarker(context, project(fixedAnchor(entity)));
    }
  }

  cad.sketchConstraints = {
    makeAxis,
    makeAxisPoints,
    axisFor,
    makeTangent,
    makeCoincident,
    makeSnapConstraint,
    makeEqual,
    curveLength,
    enforce,
    render,
    renderMarker: marker,
    hitTest,
    getPointCoordinate,
    setPointCoordinate,
    isPointFixed,
    tangentCandidates
  };
})(window.WebCAD = window.WebCAD || {});
