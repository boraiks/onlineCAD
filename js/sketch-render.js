(function (cad) {
  'use strict';

  function drawEntity(context, entity, project, color = null, width = 2, sketch = null) {
    const isOverride = color && color !== '#127fb2';

    if (entity.type === 'point') {
      const [x, y] = project(entity.position);
      context.save();
      context.beginPath();
      context.arc(x, y, isOverride ? 5 : 4, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.strokeStyle = isOverride ? color : entity.fixed ? '#182230' : '#127fb2';
      context.lineWidth = isOverride ? 2.5 : 1.8;
      context.stroke();
      context.restore();
      return;
    }

    const construction = Boolean(entity.construction);
    if (construction) {
      context.save();
      context.setLineDash([6, 4]);
    }
    if (entity.type === 'line') {
      const isConst = cad.sketchGeometry?.isConstant(entity, sketch);
      const strokeColor = isOverride ? color : construction ? '#718b9a' :
        (isConst ? '#182230' : '#127fb2');
      const strokeWidth = !isOverride && !construction && isConst ? Math.max(width, 2.2) : width;
      cad.canvas.line(context, project(entity.start), project(entity.end), strokeColor, strokeWidth);
      if (construction) context.restore();
      return;
    }

    if (entity.type === 'rectangle') {
      const [x1, y1] = entity.start;
      const [x2, y2] = entity.end;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(project);
      
      if (isOverride) {
        context.beginPath();
        context.moveTo(...corners[0]);
        for (const point of corners.slice(1)) context.lineTo(...point);
        context.closePath();
        context.strokeStyle = color;
        context.lineWidth = width;
        context.stroke();
      } else {
        // Draw 4 edges with per-edge constant evaluation
        for (let i = 0; i < 4; i++) {
          const edgeConst = cad.sketchGeometry?.isConstant(entity, sketch, i);
          const edgeColor = construction ? '#718b9a' : edgeConst ? '#182230' : '#127fb2';
          cad.canvas.line(context, corners[i], corners[(i + 1) % 4], edgeColor, width);
        }
      }
      if (construction) context.restore();
      return;
    }

    const strokeColor = isOverride ? color : construction ? '#718b9a' :
      (cad.sketchGeometry?.isConstant(entity, sketch) ? '#182230' : '#127fb2');
    context.beginPath();
    if (entity.type === 'circle') {
      const segments = 72;
      for (let index = 0; index <= segments; index++) {
        const angle = index * Math.PI * 2 / segments;
        const point = project([
          entity.center[0] + entity.radius * Math.cos(angle),
          entity.center[1] + entity.radius * Math.sin(angle),
        ]);
        if (index === 0) context.moveTo(...point);
        else context.lineTo(...point);
      }
      context.closePath();
    } else if (entity.type === 'arc') {
      const segments = 36;
      let sweep = entity.endAngle - entity.startAngle;
      if (entity.counterClockwise) {
        if (sweep > 0) sweep -= Math.PI * 2;
      } else {
        if (sweep < 0) sweep += Math.PI * 2;
      }
      for (let index = 0; index <= segments; index++) {
        const angle = entity.startAngle + sweep * (index / segments);
        const point = project([
          entity.center[0] + entity.radius * Math.cos(angle),
          entity.center[1] + entity.radius * Math.sin(angle),
        ]);
        if (index === 0) context.moveTo(...point);
        else context.lineTo(...point);
      }
    } else {
      if (construction) context.restore();
      return;
    }
    context.strokeStyle = strokeColor;
    context.lineWidth = width;
    context.stroke();
    if (construction) context.restore();
  }

  function drawProfile(context, points, project, fill = 'rgba(84, 174, 226, .15)', holes = [], stroke = null, width = 1.8) {
    if (points.length < 3) return;
    context.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point);
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    context.closePath();
    for (const hole of holes) {
      hole.forEach((point, index) => {
        const [x, y] = project(point);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
    }
    if (fill) {
      context.fillStyle = fill;
      context.fill('evenodd');
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = width;
      context.stroke();
    }
  }

  cad.sketchRender = { drawEntity, drawProfile };
})(window.WebCAD = window.WebCAD || {});
