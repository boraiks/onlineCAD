(function (cad) {
  'use strict';

  const rotate = (point, center, angle) => {
    const x = point[0] - center[0], y = point[1] - center[1];
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return [center[0] + x * cos - y * sin, center[1] + x * sin + y * cos];
  };
  const translate = (point, delta) => [point[0] + delta[0], point[1] + delta[1]];
  const corners = entity => {
    const [x1, y1] = entity.start, [x2, y2] = entity.end;
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  };

  function transformed(entity, map, angle = 0) {
    if (entity.type === 'point') return [{ type: 'point', position: map(entity.position) }];
    if (entity.type === 'line') return [{ type: 'line', start: map(entity.start), end: map(entity.end), construction: entity.construction }];
    if (entity.type === 'circle') return [{ type: 'circle', center: map(entity.center), radius: entity.radius, construction: entity.construction }];
    if (entity.type === 'arc') {
      const center = map(entity.center), start = map(entity.start), end = map(entity.end);
      return [{ type: 'arc', center, start, end, radius: entity.radius,
        startAngle: Math.atan2(start[1] - center[1], start[0] - center[0]),
        endAngle: Math.atan2(end[1] - center[1], end[0] - center[0]),
        counterClockwise: entity.counterClockwise, construction: entity.construction }];
    }
    if (entity.type === 'rectangle') {
      if (Math.abs(Math.sin(angle)) < 1e-8 || Math.abs(Math.cos(angle)) < 1e-8) {
        const first = map(entity.start), last = map(entity.end);
        return [{ type: 'rectangle', start: first, end: last, construction: entity.construction }];
      }
      const pts = corners(entity).map(map);
      return pts.map((start, index) => ({ type: 'line', start, end: pts[(index + 1) % 4], construction: entity.construction }));
    }
    return [];
  }

  function offset(entity, distance, side = 1) {
    if (entity.type === 'line') {
      const dx = entity.end[0] - entity.start[0], dy = entity.end[1] - entity.start[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-8) return [];
      const delta = [-dy * distance * side / length, dx * distance * side / length];
      return transformed(entity, point => translate(point, delta));
    }
    if (entity.type === 'circle' || entity.type === 'arc') {
      const radius = entity.radius + distance * side;
      if (radius < cad.sketchGrid.precision) return [];
      if (entity.type === 'circle') return [{ type: 'circle', center: [...entity.center], radius, construction: entity.construction }];
      const move = point => [entity.center[0] + (point[0] - entity.center[0]) * radius / entity.radius,
        entity.center[1] + (point[1] - entity.center[1]) * radius / entity.radius];
      return [{ type: 'arc', center: [...entity.center], radius, start: move(entity.start), end: move(entity.end),
        startAngle: entity.startAngle, endAngle: entity.endAngle, counterClockwise: entity.counterClockwise,
        construction: entity.construction }];
    }
    if (entity.type === 'rectangle') {
      const minX = Math.min(entity.start[0], entity.end[0]) - distance * side;
      const maxX = Math.max(entity.start[0], entity.end[0]) + distance * side;
      const minY = Math.min(entity.start[1], entity.end[1]) - distance * side;
      const maxY = Math.max(entity.start[1], entity.end[1]) + distance * side;
      return cad.sketchGrid.atLeastPrecision(maxX - minX) && cad.sketchGrid.atLeastPrecision(maxY - minY)
        ? [{ type: 'rectangle', start: [minX, minY], end: [maxX, maxY], construction: entity.construction }] : [];
    }
    return [];
  }

  // Keep a chain of line offsets joined at its shared vertices.
  function offsetLineChain(lines, signedDistance, guideId) {
    if (lines.length < 2) return lines.flatMap(line => offset(line, Math.abs(signedDistance), Math.sign(signedDistance)));
    const tolerance = 0.0015;
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
    const incident = point => lines.filter(line => same(line.start, point) || same(line.end, point));
    const endpoints = lines.flatMap(line => [line.start, line.end]);
    if (endpoints.some(point => incident(point).length > 2)) return null;
    const loose = endpoints.filter(point => incident(point).length === 1);
    if (loose.length !== 0 && loose.length !== 2) return null;
    const closed = loose.length === 0;
    const start = closed ? lines[0].start : loose[0];
    const ordered = [];
    let vertex = start;
    let previous = null;
    while (ordered.length < lines.length) {
      const line = incident(vertex).find(candidate => candidate !== previous && !ordered.some(edge => edge.entity === candidate));
      if (!line) return null;
      const forward = same(line.start, vertex);
      const end = forward ? line.end : line.start;
      ordered.push({ entity: line, start: vertex, end, forward });
      previous = line;
      vertex = end;
    }
    if (closed && !same(vertex, start)) return null;
    const guided = ordered.find(edge => edge.entity.id === guideId);
    const side = guided?.forward === false ? -1 : 1;
    const displaced = ordered.map(edge => {
      const dx = edge.end[0] - edge.start[0], dy = edge.end[1] - edge.start[1];
      const length = Math.hypot(dx, dy);
      if (length < tolerance) return null;
      const delta = [-dy * signedDistance * side / length, dx * signedDistance * side / length];
      return { entity: edge.entity, start: translate(edge.start, delta), end: translate(edge.end, delta) };
    });
    if (displaced.some(edge => !edge)) return null;
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const join = (before, after) => {
      const u = [before.end[0] - before.start[0], before.end[1] - before.start[1]];
      const v = [after.end[0] - after.start[0], after.end[1] - after.start[1]];
      const denominator = cross(u, v);
      if (Math.abs(denominator) < 1e-9) return [(before.end[0] + after.start[0]) / 2,
        (before.end[1] + after.start[1]) / 2];
      const difference = [after.start[0] - before.start[0], after.start[1] - before.start[1]];
      const t = cross(difference, v) / denominator;
      const point = [before.start[0] + t * u[0], before.start[1] + t * u[1]];
      return Math.hypot(point[0] - before.end[0], point[1] - before.end[1]) <=
        Math.max(100 * Math.abs(signedDistance), 1) ? point : null;
    };
    const vertices = [displaced[0].start];
    for (let i = 1; i < displaced.length; i++) vertices.push(join(displaced[i - 1], displaced[i]));
    vertices.push(closed ? join(displaced.at(-1), displaced[0]) : displaced.at(-1).end);
    if (vertices.some(point => !point)) return null;
    if (closed) vertices[0] = vertices.at(-1);
    return displaced.map((edge, index) => ({ type: 'line', start: vertices[index], end: vertices[index + 1],
      construction: edge.entity.construction }));
  }

  function offsetGuide(entity, boundary = null, pointer = null) {
    if (entity.type === 'line') {
      const dx = entity.end[0] - entity.start[0], dy = entity.end[1] - entity.start[1];
      const length = Math.hypot(dx, dy);
      return length ? { entityId: entity.id, origin: [(entity.start[0] + entity.end[0]) / 2,
        (entity.start[1] + entity.end[1]) / 2], normal: [-dy / length, dx / length] } : null;
    }
    if (entity.type === 'rectangle') {
      const minX = Math.min(entity.start[0], entity.end[0]), maxX = Math.max(entity.start[0], entity.end[0]);
      const minY = Math.min(entity.start[1], entity.end[1]), maxY = Math.max(entity.start[1], entity.end[1]);
      const middle = [(minX + maxX) / 2, (minY + maxY) / 2];
      const edge = boundary?.start && boundary?.end
        ? [(boundary.start[0] + boundary.end[0]) / 2, (boundary.start[1] + boundary.end[1]) / 2]
        : [maxX, middle[1]];
      const dx = edge[0] - middle[0], dy = edge[1] - middle[1];
      const length = Math.hypot(dx, dy);
      return length ? { entityId: entity.id, origin: edge, normal: [dx / length, dy / length] } : null;
    }
    if (entity.type === 'circle' || entity.type === 'arc') {
      const reference = pointer || entity.start || [entity.center[0] + entity.radius, entity.center[1]];
      const dx = reference[0] - entity.center[0], dy = reference[1] - entity.center[1];
      const length = Math.hypot(dx, dy);
      const normal = length ? [dx / length, dy / length] : [1, 0];
      return { entityId: entity.id, origin: [entity.center[0] + entity.radius * normal[0],
        entity.center[1] + entity.radius * normal[1]], normal };
    }
    return null;
  }

  class SketchPattern {
    constructor({ canvas, document: sketchDocument, camera, history, getActiveSketch, onChange, onFinished, onFeedback }) {
      Object.assign(this, { canvas, sketchDocument, camera, history, getActiveSketch, onChange, onFinished, onFeedback });
      this.selected = new Set();
      this.center = null;
      this.mode = null;
      this.awaitingCenter = false;
      this.hover = null;
      this.guide = null;
      this.handleDrag = null;
      this.offsetInput = null;
      this.palette = document.querySelector('#patternPalette');
      this.title = this.palette.querySelector('#patternTitle');
      this.description = this.palette.querySelector('#patternDescription');
      this.count = this.palette.querySelector('#patternCount');
      this.chainInput = this.palette.querySelector('#patternChain');
      this.centerButton = this.palette.querySelector('#patternCenter');
      this.centerRow = this.palette.querySelector('#patternCenterRow');
      this.fields = this.palette.querySelector('#patternFields');
      this.ok = this.palette.querySelector('#patternOk');
      this.centerButton.addEventListener('click', () => {
        this.awaitingCenter = true;
        this.centerButton.classList.add('is-active');
        this.onFeedback('CIRCULAR PATTERN: click a center point on the grid');
      });
      this.palette.querySelector('#patternCancel').addEventListener('click', () => this.onFinished());
      this.ok.addEventListener('click', () => this.commit());
      this.chainInput.addEventListener('change', () => this.onChange());
      this.palette.addEventListener('pointerdown', event => event.stopPropagation());
    }

    open(mode) {
      if (this.handleDrag?.target?.hasPointerCapture?.(this.handleDrag.pointerId))
        this.handleDrag.target.releasePointerCapture(this.handleDrag.pointerId);
      this.mode = mode;
      this.selected.clear();
      this.center = null;
      this.awaitingCenter = false;
      this.hover = null;
      this.guide = null;
      this.handleDrag = null;
      this.offsetInput = null;
      this.chainInput.checked = false;
      this.title.textContent = ({ offset: 'OFFSET', circularPattern: 'CIRCULAR PATTERN', rectangularPattern: 'RECTANGULAR PATTERN' })[mode];
      this.description.textContent = mode === 'offset'
        ? 'Select curves, then drag the arrow or enter a signed distance.'
        : 'Select sketch curves, then set the values.';
      this.centerRow.hidden = mode !== 'circularPattern';
      const spec = mode === 'offset'
        ? [['distance', 'Distance', '10', 'mm']]
        : mode === 'circularPattern'
          ? [['quantity', 'Quantity', '4', ''], ['sweep', 'Sweep', '360', '°']]
          : [['direction', 'Direction', '0', '°'], ['columns', 'Columns', '3', ''], ['rows', 'Rows', '2', ''],
            ['columnSpacing', 'Column spacing', '20', 'mm'], ['rowSpacing', 'Row spacing', '20', 'mm']];
      this.fields.replaceChildren();
      for (const [key, label, value, unit] of spec) {
        const row = document.createElement('label');
        row.className = 'pattern-row';
        const caption = document.createElement('span'); caption.textContent = label;
        const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = value; input.dataset.field = key;
        input.addEventListener('input', () => this.update());
        if (mode === 'offset' && key === 'distance') this.offsetInput = input;
        const suffix = document.createElement('span'); suffix.textContent = unit;
        row.append(caption, input, suffix);
        this.fields.append(row);
      }
      this.palette.hidden = false;
      this.update();
    }

    close() {
      if (this.handleDrag?.target?.hasPointerCapture?.(this.handleDrag.pointerId))
        this.handleDrag.target.releasePointerCapture(this.handleDrag.pointerId);
      this.handleDrag = null;
      this.mode = null;
      this.selected.clear();
      this.center = null;
      this.hover = null;
      this.guide = null;
      this.offsetInput = null;
      this.awaitingCenter = false;
      this.palette.hidden = true;
      this.onChange();
    }

    update() {
      this.count.textContent = `${this.selected.size} selected`;
      this.centerButton.textContent = this.center ? `${this.center[0].toFixed(3)}, ${this.center[1].toFixed(3)}` : 'Select center';
      this.centerButton.classList.toggle('is-active', this.awaitingCenter);
      this.ok.disabled = !this.patternShapes();
      this.onChange();
    }

    offsetShapes() {
      const sketch = this.getActiveSketch();
      const distance = this.values().distance;
      if (!sketch || !this.selected.size || !Number.isFinite(distance) ||
        Math.abs(distance) < cad.sketchGrid.precision) return null;
      const sources = sketch.entities.filter(entity => this.selected.has(entity.id));
      if (sources.length !== this.selected.size) return null;
      const shapes = [];
      const handled = new Set();
      for (const entity of sources) {
        if (handled.has(entity.id)) continue;
        if (this.chainInput?.checked && entity.type === 'line') {
          const lines = sources.filter(item => item.type === 'line');
          const connected = cad.sketchChain.connectedIds({ entities: lines }, entity.id);
          const group = lines.filter(other => connected.has(other.id));
          group.forEach(item => handled.add(item.id));
          const joined = offsetLineChain(group, distance, this.guide?.entityId || entity.id);
          if (!joined) return null;
          shapes.push(...joined);
        } else {
          handled.add(entity.id);
          shapes.push(...offset(entity, Math.abs(distance), Math.sign(distance)));
        }
      }
      return shapes.length === sources.length && shapes.every(shape =>
        cad.sketchGeometry.valid(shape) && cad.sketchSnap.withinBounds(shape)) ? shapes : null;
    }

    offsetHandlePoint() {
      if (!this.guide) return null;
      const distance = this.values().distance;
      if (!Number.isFinite(distance)) return null;
      const { origin, normal } = this.guide;
      return [origin[0] + normal[0] * distance, origin[1] + normal[1] * distance];
    }

    hitOffsetHandle(event) {
      if (this.mode !== 'offset') return false;
      const sketch = this.getActiveSketch(), point = this.offsetHandlePoint();
      if (!sketch || !point) return false;
      const bounds = this.canvas.getBoundingClientRect();
      const [x, y] = this.camera.project(this.sketchDocument.toWorld(sketch, point), bounds.width, bounds.height);
      return Math.hypot(event.clientX - bounds.left - x, event.clientY - bounds.top - y) <= 14;
    }

    beginHandleDrag(event) {
      if (this.mode !== 'offset' || !this.hitOffsetHandle(event)) return false;
      this.handleDrag = { pointerId: event.pointerId, target: event.target };
      event.target.setPointerCapture?.(event.pointerId);
      event.target.style.cursor = 'grabbing';
      return true;
    }

    endHandleDrag(event) {
      if (!this.handleDrag || this.handleDrag.pointerId !== event.pointerId) return false;
      this.handleDrag = null;
      if (event.target.hasPointerCapture?.(event.pointerId)) event.target.releasePointerCapture(event.pointerId);
      event.target.style.cursor = 'grab';
      return true;
    }

    onPointerDown(event) {
      if (!this.mode) return false;
      const sketch = this.getActiveSketch();
      if (!sketch) return false;
      const bounds = this.canvas.getBoundingClientRect();
      if (this.awaitingCenter) {
        const raw = this.sketchDocument.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
        if (!raw) return true;
        this.center = [...(cad.sketchSnap.snap(sketch, raw, this.camera, bounds)?.point || raw)];
        this.awaitingCenter = false;
        this.update();
        return true;
      }
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const project = point => this.camera.project(this.sketchDocument.toWorld(sketch, point), bounds.width, bounds.height);
      const boundary = cad.sketchHitTest.boundaryAt(sketch, project, screen, 11);
      const handle = cad.sketchHitTest.entityHandleAt(sketch, project, screen, 11);
      const entity = boundary?.entity || handle?.entity;
      if (entity) {
        if (this.mode === 'offset' && entity.type === 'point') return true;
        const ids = this.chainInput?.checked ? cad.sketchChain.connectedIds(sketch, entity.id) : new Set([entity.id]);
        if (this.selected.has(entity.id)) {
          for (const id of ids) this.selected.delete(id);
          if (this.guide?.entityId === entity.id) this.guide = null;
        } else {
          for (const id of ids) this.selected.add(id);
          if (this.mode === 'offset') {
            const pointer = this.sketchDocument.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
            this.guide = offsetGuide(entity, boundary, pointer);
          }
        }
        if (this.mode === 'offset' && !this.guide && this.selected.size) {
          const first = sketch.entities.find(item => this.selected.has(item.id));
          this.guide = first ? offsetGuide(first) : null;
        }
        this.update();
      }
      return true;
    }

    onPointerMove(event) {
      if (!this.mode) return;
      const sketch = this.getActiveSketch(), bounds = this.canvas.getBoundingClientRect();
      if (!sketch) return;
      if (this.handleDrag?.pointerId === event.pointerId && this.guide) {
        const point = this.sketchDocument.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
        if (point) {
          const { origin, normal } = this.guide;
          const distance = (point[0] - origin[0]) * normal[0] + (point[1] - origin[1]) * normal[1];
          const rounded = Math.round(distance / cad.sketchGrid.precision) * cad.sketchGrid.precision;
          this.offsetInput.value = cad.sketchGeometry.formatValue(rounded, 'length');
          this.update();
        }
        event.target.style.cursor = 'grabbing';
        return;
      }
      if (this.mode === 'offset' && this.hitOffsetHandle(event)) {
        event.target.style.cursor = 'grab';
        if (this.hover) { this.hover = null; this.onChange(); }
        return;
      }
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const project = point => this.camera.project(this.sketchDocument.toWorld(sketch, point), bounds.width, bounds.height);
      const next = cad.sketchHitTest.boundaryAt(sketch, project, screen, 10)?.entity || null;
      if (this.hover !== next) { this.hover = next; this.onChange(); }
    }

    values() {
      return Object.fromEntries([...this.fields.querySelectorAll('input')].map(input => [input.dataset.field, Number(input.value)]));
    }

    patternShapes() {
      const sketch = this.getActiveSketch();
      if (!sketch || !this.selected.size) return null;
      const values = this.values();
      const integer = n => Number.isInteger(n) && n >= 1 && n <= 100;
      if (this.mode === 'offset') return this.offsetShapes();
      if (this.mode === 'circularPattern' && (!this.center || !integer(values.quantity) || values.quantity < 2 ||
        !(values.sweep > 0 && values.sweep <= 360))) return null;
      if (this.mode === 'rectangularPattern' && (!integer(values.columns) || !integer(values.rows) ||
        values.columns * values.rows > 400 || values.columns * values.rows < 2 ||
        !Number.isFinite(values.columnSpacing) || !Number.isFinite(values.rowSpacing) ||
        !Number.isFinite(values.direction))) return null;
      const sources = sketch.entities.filter(entity => this.selected.has(entity.id));
      if (sources.length !== this.selected.size) return null;
      const shapes = [];
      for (const entity of sources) {
        if (this.mode === 'circularPattern') {
          for (let index = 1; index < values.quantity; index++) {
            const angle = values.sweep * Math.PI / 180 * index / (values.sweep === 360 ? values.quantity : values.quantity - 1);
            shapes.push(...transformed(entity, point => rotate(point, this.center, angle), angle));
          }
        } else if (this.mode === 'rectangularPattern') {
          const radians = values.direction * Math.PI / 180;
          const cos = Math.cos(radians), sin = Math.sin(radians);
          for (let row = 0; row < values.rows; row++) for (let column = 0; column < values.columns; column++) {
            if (!row && !column) continue;
            const horizontal = column * values.columnSpacing;
            const vertical = row * values.rowSpacing;
            shapes.push(...transformed(entity, point => translate(point,
              [horizontal * cos - vertical * sin, horizontal * sin + vertical * cos])));
          }
        }
      }
      return shapes.length && shapes.every(shape => cad.sketchGeometry.valid(shape) && cad.sketchSnap.withinBounds(shape))
        ? shapes : null;
    }

    commit() {
      const sketch = this.getActiveSketch();
      if (!sketch || !this.selected.size) return false;
      const shapes = this.patternShapes();
      if (!shapes) {
        this.onFeedback('Pattern exceeds the sketch bounds or has invalid geometry');
        return false;
      }
      const copies = shapes.map(shape => this.sketchDocument.makeEntity(shape));
      this.history.execute({
        name: 'Sketch pattern', kind: 'sketch',
        execute: () => { copies.forEach(entity => this.sketchDocument.insertEntity(sketch, entity)); this.onChange(); },
        undo: () => { copies.forEach(entity => this.sketchDocument.removeEntity(sketch, entity.id)); this.onChange(); },
        redo: () => { copies.forEach(entity => this.sketchDocument.insertEntity(sketch, entity)); this.onChange(); },
      });
      this.onFinished();
      return true;
    }

    render(context, project) {
      if (!this.mode) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;
      const toScreen = point => project(this.sketchDocument.toWorld(sketch, point));
      for (const entity of sketch.entities) {
        if (this.selected.has(entity.id) || entity === this.hover)
          cad.sketchRender.drawEntity(context, entity, toScreen, '#4f89ff', 4);
      }
      {
        const preview = this.patternShapes();
        if (preview) {
          context.save();
          context.setLineDash([6, 4]);
          for (const shape of preview) cad.sketchRender.drawEntity(context, shape, toScreen, '#1888c3', 2.3);
          context.restore();
        }
        const tip = this.mode === 'offset' ? this.offsetHandlePoint() : null;
        if (tip && this.guide) {
          const [x1, y1] = toScreen(this.guide.origin), [x2, y2] = toScreen(tip);
          const length = Math.hypot(x2 - x1, y2 - y1);
          const ux = length > 1 ? (x2 - x1) / length : 1;
          const uy = length > 1 ? (y2 - y1) / length : 0;
          context.save();
          context.strokeStyle = '#147fb4'; context.fillStyle = '#fff'; context.lineWidth = 1.8;
          context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
          context.beginPath(); context.moveTo(x2 - ux * 9 - uy * 5, y2 - uy * 9 + ux * 5);
          context.lineTo(x2, y2); context.lineTo(x2 - ux * 9 + uy * 5, y2 - uy * 9 - ux * 5);
          context.stroke();
          context.beginPath(); context.arc(x2, y2, 7, 0, Math.PI * 2);
          context.fill(); context.stroke();
          context.fillStyle = '#175f86'; context.font = '700 12px Arial, sans-serif';
          context.fillText(`${cad.sketchGeometry.formatValue(this.values().distance, 'length')} mm`, x2 + 11, y2 - 10);
          context.restore();
        }
      }
      if (this.center) {
        const [x, y] = toScreen(this.center);
        context.save(); context.strokeStyle = '#377cc6'; context.lineWidth = 1.5;
        context.beginPath(); context.moveTo(x - 8, y); context.lineTo(x + 8, y);
        context.moveTo(x, y - 8); context.lineTo(x, y + 8); context.stroke(); context.restore();
      }
    }
  }

  cad.sketchPattern = { rotate, transformed, offset, offsetGuide, offsetLineChain };
  cad.SketchPattern = SketchPattern;
})(window.WebCAD = window.WebCAD || {});
