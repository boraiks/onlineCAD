(function (cad) {
  'use strict';

  const color = '#344b59';
  const extension = '#687a84';
  const format = value => String(Number(value.toFixed(3)));

  function arrow(context, tip, direction, normal) {
    const back = [tip[0] + direction[0] * 7, tip[1] + direction[1] * 7];
    context.beginPath();
    context.moveTo(tip[0], tip[1]);
    context.lineTo(back[0] + normal[0] * 2.7, back[1] + normal[1] * 2.7);
    context.lineTo(back[0] - normal[0] * 2.7, back[1] - normal[1] * 2.7);
    context.closePath();
    context.fill();
  }

  function linear(context, from, to, value, options = {}) {
    if (!Number.isFinite(value)) return;
    const label = `${options.prefix || ''}${format(value)}${options.suffix || ''}`;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    const placement = options.placement || [0, 0];
    if (length < 2) {
      context.save();
      context.font = '13px Arial, sans-serif';
      const width = context.measureText(label).width;
      context.fillStyle = 'rgba(255,255,255,.94)';
      context.fillRect(from[0] + 8 + placement[0], from[1] - 22 + placement[1], width + 10, 20);
      context.fillStyle = color;
      context.fillText(label, from[0] + 13 + placement[0], from[1] - 7 + placement[1]);
      context.restore();
      return { center: [from[0] + 13 + width / 2 + placement[0], from[1] - 12 + placement[1]], width: width + 12, height: 22 };
    }
    const direction = [dx / length, dy / length];
    let normal = [-direction[1], direction[0]];
    const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    if (options.reference) {
      const outward = [middle[0] - options.reference[0], middle[1] - options.reference[1]];
      if (normal[0] * outward[0] + normal[1] * outward[1] < 0) normal = [-normal[0], -normal[1]];
    } else if (Math.abs(dx) >= Math.abs(dy) ? normal[1] > 0 : normal[0] > 0) {
      normal = [-normal[0], -normal[1]];
    }
    const offset = options.offset ?? 28;
    const along = placement[0] * direction[0] + placement[1] * direction[1];
    const away = placement[0] * normal[0] + placement[1] * normal[1];
    const barOffset = offset + away;
    const shift = point => [point[0] + normal[0] * barOffset, point[1] + normal[1] * barOffset];
    const a = shift(from);
    const b = shift(to);
    const labelCenter = [(a[0] + b[0]) / 2 + direction[0] * along + normal[0] * 11,
      (a[1] + b[1]) / 2 + direction[1] * along + normal[1] * 11];

    context.save();
    context.setLineDash([]);
    context.lineWidth = 1;
    if (Math.abs(barOffset) > 0.1) {
      const beyond = Math.sign(barOffset) * 5;
      cad.canvas.line(context, from, [a[0] + normal[0] * beyond, a[1] + normal[1] * beyond], extension, 1);
      cad.canvas.line(context, to, [b[0] + normal[0] * beyond, b[1] + normal[1] * beyond], extension, 1);
    }
    cad.canvas.line(context, a, b, color, 1);
    context.fillStyle = color;
    arrow(context, a, direction, normal);
    arrow(context, b, [-direction[0], -direction[1]], normal);

    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    context.font = '13px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = context.measureText(label).width;
    if (Math.abs(along) > length / 2) {
      const sign = Math.sign(along);
      const end = [labelCenter[0] - normal[0] * 11 + direction[0] * sign * (width / 2 + 7),
        labelCenter[1] - normal[1] * 11 + direction[1] * sign * (width / 2 + 7)];
      cad.canvas.line(context, sign > 0 ? b : a, end, color, 1);
    }
    context.translate(...labelCenter);
    context.rotate(angle);
    context.fillStyle = 'rgba(255,255,255,.94)';
    context.fillRect(-width / 2 - 5, -10, width + 10, 20);
    context.fillStyle = color;
    context.fillText(label, 0, 0);
    context.restore();
    return {
      center: labelCenter,
      width: Math.abs(Math.cos(angle)) * (width + 14) + Math.abs(Math.sin(angle)) * 24,
      height: Math.abs(Math.sin(angle)) * (width + 14) + Math.abs(Math.cos(angle)) * 24,
    };
  }

  function angleArc(context, center, firstRay, secondRay, value, options = {}) {
    if (!Number.isFinite(value)) return null;
    const radius = Math.max(22, options.radius || 46);
    const placement = options.placement || [0, 0];
    const firstAngle = Math.atan2(firstRay[1] - center[1], firstRay[0] - center[0]);
    const secondAngle = Math.atan2(secondRay[1] - center[1], secondRay[0] - center[0]);
    let sweep = secondAngle - firstAngle;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const midAngle = firstAngle + sweep / 2;
    const label = `${format(value)}°`;
    const arcCenter = [center[0] + placement[0], center[1] + placement[1]];
    context.save();
    if (options.reference) {
      context.setLineDash([4, 3]);
      cad.canvas.line(context, center, [center[0] + Math.cos(firstAngle) * (radius + 9), center[1] + Math.sin(firstAngle) * (radius + 9)], extension, 1);
      context.setLineDash([]);
    }
    context.beginPath();
    context.arc(arcCenter[0], arcCenter[1], radius, firstAngle, firstAngle + sweep, sweep < 0);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.stroke();
    const at = angle => [arcCenter[0] + Math.cos(angle) * radius, arcCenter[1] + Math.sin(angle) * radius];
    context.fillStyle = color;
    for (const [index, angle] of [firstAngle, firstAngle + sweep].entries()) {
      const tangent = [-Math.sin(angle), Math.cos(angle)];
      const inward = (index === 0 ? 1 : -1) * Math.sign(sweep || 1);
      arrow(context, at(angle), tangent.map(value => value * inward), [Math.cos(angle), Math.sin(angle)]);
    }
    context.font = '13px Arial, sans-serif';
    const width = context.measureText(label).width;
    const labelCenter = [arcCenter[0] + Math.cos(midAngle) * (radius + 15), arcCenter[1] + Math.sin(midAngle) * (radius + 15)];
    context.fillStyle = 'rgba(255,255,255,.94)';
    context.fillRect(labelCenter[0] - width / 2 - 5, labelCenter[1] - 10, width + 10, 20);
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, labelCenter[0], labelCenter[1]);
    context.restore();
    return { center: labelCenter, width: width + 14, height: 24 };
  }

  function arcRadius(context, entity, project, placement = [0, 0]) {
    let sweep = entity.endAngle - entity.startAngle;
    if (entity.counterClockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!entity.counterClockwise && sweep < 0) sweep += Math.PI * 2;
    const angle = entity.startAngle + sweep / 2;
    const edge = project([entity.center[0] + entity.radius * Math.cos(angle),
      entity.center[1] + entity.radius * Math.sin(angle)]);
    const center = project(entity.center);
    const dx = edge[0] - center[0], dy = edge[1] - center[1];
    const length = Math.hypot(dx, dy) || 1;
    const direction = [dx / length, dy / length];
    const bend = [edge[0] + direction[0] * 32 + placement[0],
      edge[1] + direction[1] * 32 + placement[1]];
    const radius = entity.dimensions.radius;
    const label = `R${radius.toFixed(3).replace(/(\.\d\d)0$/, '$1')}`;
    context.save();
    context.font = '12px Arial, sans-serif';
    const width = context.measureText(label).width;
    const textX = bend[0] + 5, textY = bend[1] - 5;
    cad.canvas.line(context, edge, bend, color, 1);
    cad.canvas.line(context, bend, [bend[0] + width + 10, bend[1]], color, 1);
    context.beginPath();
    context.moveTo(edge[0], edge[1]);
    context.lineTo(edge[0] + direction[0] * 9 - direction[1] * 3,
      edge[1] + direction[1] * 9 + direction[0] * 3);
    context.lineTo(edge[0] + direction[0] * 9 + direction[1] * 3,
      edge[1] + direction[1] * 9 - direction[0] * 3);
    context.closePath(); context.fillStyle = color; context.fill();
    context.fillStyle = 'rgba(255,255,255,.94)';
    context.fillRect(textX - 2, textY - 12, width + 5, 17);
    context.fillStyle = color; context.fillText(label, textX, textY);
    context.restore();
    return { center: [textX + width / 2, textY - 5], width: width + 8, height: 19 };
  }

  function circleDiameter(context, entity, project, options = {}) {
    const center = project(entity.center);
    const baseEnd = project([entity.center[0] + entity.radius, entity.center[1]]);
    const baseDirection = [baseEnd[0] - center[0], baseEnd[1] - center[1]];
    const baseLength = Math.hypot(...baseDirection);
    if (baseLength < 1) return null;
    const placement = options.placement || [0, 0];
    const labelCenter = [baseEnd[0] + baseDirection[0] / baseLength * 45 + placement[0],
      baseEnd[1] + baseDirection[1] / baseLength * 45 + placement[1]];
    let axis = [Math.cos(options.angle ?? 0), Math.sin(options.angle ?? 0)];
    if (!options.preview) {
      const bx = [baseDirection[0] / entity.radius, baseDirection[1] / entity.radius];
      const byEnd = project([entity.center[0], entity.center[1] + 1]);
      const by = [byEnd[0] - center[0], byEnd[1] - center[1]];
      const desired = [labelCenter[0] - center[0], labelCenter[1] - center[1]];
      const determinant = bx[0] * by[1] - bx[1] * by[0];
      if (Math.abs(determinant) > 1e-6) {
        const local = [(desired[0] * by[1] - desired[1] * by[0]) / determinant,
          (bx[0] * desired[1] - bx[1] * desired[0]) / determinant];
        const magnitude = Math.hypot(...local);
        if (magnitude > 1e-6) axis = local.map(value => value / magnitude);
      }
    }
    const from = project([entity.center[0] - entity.radius * axis[0], entity.center[1] - entity.radius * axis[1]]);
    const to = project([entity.center[0] + entity.radius * axis[0], entity.center[1] + entity.radius * axis[1]]);
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length < 2) return null;
    const direction = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    const normal = [-direction[1], direction[0]];
    context.save();
    context.setLineDash([]);
    if (options.preview) {
      cad.canvas.line(context, from, to, '#8797a2', 1.1);
    } else {
      cad.canvas.line(context, from, to, color, 1);
      context.fillStyle = color;
      arrow(context, from, direction, normal);
      arrow(context, to, [-direction[0], -direction[1]], normal);
      const label = `Ø${format(entity.radius * 2)}`;
      context.font = '13px Arial, sans-serif';
      const width = context.measureText(label).width;
      const labelDistance = (labelCenter[0] - center[0]) * direction[0] +
        (labelCenter[1] - center[1]) * direction[1];
      const outside = labelDistance > length / 2 + 5;
      if (outside) {
        // Keep the leader on the diameter axis, including after dragging its label.
        const textEdge = [labelCenter[0] - direction[0] * (width / 2 + 7),
          labelCenter[1] - direction[1] * (width / 2 + 7)];
        cad.canvas.line(context, to, textEdge, color, 1);
      }
      let textAngle = outside ? 0 : Math.atan2(direction[1], direction[0]);
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      context.save();
      context.translate(...labelCenter);
      context.rotate(textAngle);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = 'rgba(255,255,255,.94)';
      context.fillRect(-width / 2 - 5, -10, width + 10, 20);
      context.fillStyle = color;
      context.fillText(label, 0, 0);
      context.restore();
      context.beginPath();
      context.arc(center[0], center[1], 3, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.strokeStyle = extension;
      context.lineWidth = 1;
      context.stroke();
      context.restore();
      return { center: labelCenter,
        width: Math.abs(Math.cos(textAngle)) * (width + 14) + Math.abs(Math.sin(textAngle)) * 24,
        height: Math.abs(Math.sin(textAngle)) * (width + 14) + Math.abs(Math.cos(textAngle)) * 24 };
    }
    context.beginPath();
    context.arc(center[0], center[1], 2.7, 0, Math.PI * 2);
    context.fillStyle = '#fff';
    context.fill();
    context.strokeStyle = '#8797a2';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
    return null;
  }

  function drawEntity(context, entity, project, sketch = null) {
    const dimensions = entity.dimensions;
    if (!dimensions || !Object.keys(dimensions).length) return [];
    const hits = [];
    const placement = entity.dimensionPlacement || {};
    const record = (key, result) => { if (result) hits.push({ key, ...result }); };
    if (entity.type === 'rectangle') {
      const [x1, y1] = entity.start;
      const [x2, y2] = entity.end;
      const center = project([(x1 + x2) / 2, (y1 + y2) / 2]);
      if (Number.isFinite(dimensions.width)) {
        const sides = [y1, y2].map(y => ({ from: project([x1, y]), to: project([x2, y]) }));
        sides.sort((a, b) => (a.from[1] + a.to[1]) - (b.from[1] + b.to[1]));
        record('width', linear(context, sides[0].from, sides[0].to, dimensions.width, { reference: center, placement: placement.width }));
      }
      if (Number.isFinite(dimensions.height)) {
        const sides = [x1, x2].map(x => ({ from: project([x, y1]), to: project([x, y2]) }));
        sides.sort((a, b) => (a.from[0] + a.to[0]) - (b.from[0] + b.to[0]));
        record('height', linear(context, sides[0].from, sides[0].to, dimensions.height, { reference: center, placement: placement.height }));
      }
    } else if (entity.type === 'line') {
      const hasLengthMeasurement = sketch?.measurements?.some(m => m.kind === 'line-length' && m.entityId === entity.id);
      if (Number.isFinite(dimensions.length) && !hasLengthMeasurement) {
        record('length', linear(context, project(entity.start), project(entity.end), dimensions.length, { placement: placement.length }));
      }
      if (Number.isFinite(dimensions.angle)) {
        record('angle', angleArc(context, project(entity.start), project([entity.start[0] + 1, entity.start[1]]), project(entity.end), dimensions.angle, { reference: true, placement: placement.angle }));
      }
    } else if (entity.type === 'circle') {
      if (Number.isFinite(dimensions.diameter))
        record('diameter', circleDiameter(context, entity, project, { placement: placement.diameter }));
      if (Number.isFinite(dimensions.radius)) {
        const angle = Math.PI / 4;
        const edge = [entity.center[0] + entity.radius * Math.cos(angle), entity.center[1] + entity.radius * Math.sin(angle)];
        record('radius', linear(context, project(entity.center), project(edge), dimensions.radius, { offset: 0, prefix: 'R', placement: placement.radius }));
      }
    } else if (entity.type === 'arc' && Number.isFinite(dimensions.radius)) {
      record('radius', arcRadius(context, entity, project, placement.radius));
    }
    return hits;
  }

  cad.sketchDimensions = { format, linear, angleArc, circleDiameter, drawEntity };
})(window.WebCAD = window.WebCAD || {});
