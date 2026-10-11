(function (cad) {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-6;
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const normalize = angle => ((angle % TAU) + TAU) % TAU;
  const unique = values => values.sort((a, b) => a - b).filter((value, index, list) =>
    index === 0 || Math.abs(value - list[index - 1]) > EPS);

  function lineLine(a, b) {
    const r = subtract(a.end, a.start);
    const s = subtract(b.end, b.start);
    const denominator = cross(r, s);
    if (Math.abs(denominator) < EPS) return [];
    const between = subtract(b.start, a.start);
    const t = cross(between, s) / denominator;
    const u = cross(between, r) / denominator;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
      ? [along(a.start, a.end, t)] : [];
  }

  function lineCircle(line, circle) {
    const d = subtract(line.end, line.start);
    const f = subtract(line.start, circle.center);
    const a = d[0] ** 2 + d[1] ** 2;
    if (a < EPS) return [];
    const b = 2 * (f[0] * d[0] + f[1] * d[1]);
    const c = f[0] ** 2 + f[1] ** 2 - circle.radius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -EPS) return [];
    return [-1, 1].map(sign => (-b + sign * Math.sqrt(Math.max(0, discriminant))) / (2 * a))
      .filter(t => t >= -EPS && t <= 1 + EPS).map(t => along(line.start, line.end, t));
  }

  function circleCircle(a, b) {
    const d = subtract(b.center, a.center);
    const distance = Math.hypot(...d);
    if (distance < EPS || distance > a.radius + b.radius + EPS ||
      distance < Math.abs(a.radius - b.radius) - EPS) return [];
    const axial = (a.radius ** 2 - b.radius ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, a.radius ** 2 - axial ** 2));
    const base = [a.center[0] + d[0] * axial / distance, a.center[1] + d[1] * axial / distance];
    return [[base[0] - d[1] * height / distance, base[1] + d[0] * height / distance],
      [base[0] + d[1] * height / distance, base[1] - d[0] * height / distance]];
  }

  function sweepOf(entity) {
    let sweep = entity.endAngle - entity.startAngle;
    if (entity.counterClockwise && sweep > 0) sweep -= TAU;
    if (!entity.counterClockwise && sweep < 0) sweep += TAU;
    return sweep;
  }

  function onArc(entity, point) {
    if (entity.type === 'circle') return true;
    const angle = Math.atan2(point[1] - entity.center[1], point[0] - entity.center[0]);
    const sweep = sweepOf(entity);
    const delta = sweep >= 0 ? normalize(angle - entity.startAngle) : normalize(entity.startAngle - angle);
    return delta <= Math.abs(sweep) + 1e-5;
  }

  function intersections(a, b) {
    const aLine = Boolean(a.start && a.end && !a.center);
    const bLine = Boolean(b.start && b.end && !b.center);
    const points = aLine && bLine ? lineLine(a, b)
      : aLine ? lineCircle(a, b)
        : bLine ? lineCircle(b, a) : circleCircle(a, b);
    return points.filter(point => (!a.center || onArc(a, point)) && (!b.center || onArc(b, point)));
  }

  function parameter(item, point) {
    if (!item.center) {
      const d = subtract(item.end, item.start);
      const len2 = d[0] ** 2 + d[1] ** 2;
      return len2 < EPS ? 0 : ((point[0] - item.start[0]) * d[0] + (point[1] - item.start[1]) * d[1]) / len2;
    }
    const angle = Math.atan2(point[1] - item.center[1], point[0] - item.center[0]);
    if (item.type === 'circle') return normalize(angle) / TAU;
    const sweep = sweepOf(item);
    return (sweep >= 0 ? normalize(angle - item.startAngle) : normalize(item.startAngle - angle)) / Math.abs(sweep);
  }

  function arcPart(item, start, end) {
    const base = item.type === 'circle' ? 0 : item.startAngle;
    const sweep = item.type === 'circle' ? TAU : sweepOf(item);
    const startAngle = base + sweep * start;
    const endAngle = base + sweep * end;
    const point = angle => [item.center[0] + item.radius * Math.cos(angle),
      item.center[1] + item.radius * Math.sin(angle)];
    return { type: 'arc', center: [...item.center], radius: item.radius, startAngle, endAngle,
      start: point(startAngle), end: point(endAngle), counterClockwise: sweep < 0, dimensions: {},
      construction: item.construction };
  }

  function plan(sketch, hit, point, cutCache = null) {
    if (!hit || !point) return null;
    if (hit.entity.fixed) return null;
    const item = hit.entity.type === 'rectangle'
      ? cad.sketchHitTest.segments(sketch).find(s => s.entity.id === hit.entity.id && s.edgeIndex === hit.edgeIndex)
      : hit.entity;
    if (!item || !['line', 'rectangle', 'circle', 'arc'].includes(hit.entity.type)) return null;
    const boundaryKey = `${hit.entity.id}:${hit.edgeIndex ?? ''}`;
    let sorted = cutCache?.get(boundaryKey);
    if (!sorted) {
      const boundaries = [...cad.sketchHitTest.segments(sketch),
        ...sketch.entities.filter(entity => entity.type === 'circle' || entity.type === 'arc')];
      const cuts = [];
      for (const other of boundaries) {
        if (other.entity?.id === hit.entity.id && other.edgeIndex === hit.edgeIndex) continue;
        if (other.id === hit.entity.id) continue;
        for (const intersection of intersections(item, other)) {
          const t = parameter(item, intersection);
          if ((hit.entity.type === 'circle' ? t >= -EPS : t > EPS) && t < 1 - EPS) cuts.push(t);
        }
      }
      sorted = unique(cuts);
      cutCache?.set(boundaryKey, sorted);
    }
    const circular = hit.entity.type === 'circle';
    const clicked = parameter(item, point);
    let from = 0, to = 1;
    if (circular && sorted.length >= 2) {
      let index = sorted.findIndex(value => value > clicked);
      if (index < 0) index = 0;
      from = sorted[(index + sorted.length - 1) % sorted.length];
      to = sorted[index];
      if (to <= from) to += 1;
    } else if (!circular && sorted.length) {
      const bounds = [0, ...sorted, 1];
      const index = bounds.findIndex((value, i) => i < bounds.length - 1 && clicked <= bounds[i + 1] + EPS);
      from = bounds[Math.max(0, index)];
      to = bounds[Math.max(0, index) + 1];
    }
    const kept = circular && sorted.length >= 2
      ? [[to, from + 1]]
      : [[0, from], [to, 1]].filter(([a, b]) => b - a > EPS);
    const pieces = kept.map(([a, b]) => item.center ? arcPart(item, a, b)
      : { type: 'line', start: along(item.start, item.end, a), end: along(item.start, item.end, b),
        dimensions: {}, construction: hit.entity.construction });
    const removed = item.center ? arcPart(item, from, to)
      : { type: 'line', start: along(item.start, item.end, from), end: along(item.start, item.end, to),
        construction: hit.entity.construction };
    return { hit, pieces, removed, from, to };
  }

  const snapshotOf = sketch => JSON.parse(JSON.stringify({ entities: sketch.entities,
    measurements: sketch.measurements, midpoints: sketch.midpoints, constraints: sketch.constraints }));

  function remainingIntervals(ranges, circular) {
    const removed = [];
    for (const { from, to } of ranges) {
      if (circular && to > 1 + EPS) removed.push([from, 1], [0, to - 1]);
      else removed.push([from, to]);
    }
    removed.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of removed) {
      const last = merged.at(-1);
      if (last && start <= last[1] + EPS) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    const kept = [];
    let previous = 0;
    for (const [start, end] of merged) {
      if (start - previous > EPS) kept.push([previous, start]);
      previous = Math.max(previous, end);
    }
    if (1 - previous > EPS) kept.push([previous, 1]);
    if (circular && kept.length > 1 && kept[0][0] < EPS && kept.at(-1)[1] > 1 - EPS) {
      const first = kept.shift();
      const last = kept.pop();
      kept.push([last[0], first[1] + 1]);
    }
    return kept;
  }

  function sliceEntity(item, ranges) {
    return remainingIntervals(ranges, item.type === 'circle').map(([from, to]) =>
      item.center ? arcPart(item, from, to)
        : { type: 'line', start: along(item.start, item.end, from),
          end: along(item.start, item.end, to), dimensions: {},
          construction: item.entity?.construction || item.construction })
      .filter(piece => cad.sketchGeometry.valid(piece));
  }

  function buildAfter(before, selections, firstId) {
    const selected = new Map();
    for (const item of selections.values()) {
      if (!selected.has(item.entityId)) selected.set(item.entityId, new Map());
      const edges = selected.get(item.entityId);
      const edge = item.edgeIndex ?? 0;
      if (!edges.has(edge)) edges.set(edge, []);
      edges.get(edge).push(item);
    }
    const after = JSON.parse(JSON.stringify(before));
    const originalSketch = { entities: before.entities };
    let nextId = firstId;
    after.entities = before.entities.flatMap(entity => {
      const edges = selected.get(entity.id);
      if (!edges) return [JSON.parse(JSON.stringify(entity))];
      const pieces = entity.type === 'rectangle'
        ? cad.sketchHitTest.segments(originalSketch).filter(segment => segment.entity.id === entity.id)
          .flatMap(segment => sliceEntity(segment, edges.get(segment.edgeIndex) || []))
        : sliceEntity(entity, edges.get(0) || []);
      return pieces.map(piece => ({ ...piece, id: `entity-${nextId++}` }));
    });
    const changedIds = new Set(selected.keys());
    const refersToChanged = item => Object.entries(item).some(([key, value]) =>
      key.endsWith('Id') && changedIds.has(value));
    after.measurements = after.measurements.filter(item => !refersToChanged(item));
    after.midpoints = after.midpoints.filter(item => !changedIds.has(item.entityId));
    after.constraints = after.constraints.filter(item => !refersToChanged(item));
    return { after, nextId };
  }

  class SketchTrim {
    constructor({ getActiveSketch, document, camera, history, onChange }) {
      Object.assign(this, { getActiveSketch, document, camera, history, onChange });
      this.preview = null;
      this.stroke = null;
      this.screenCache = null;
    }

    apply(sketch, snapshot) {
      for (const key of ['entities', 'measurements', 'midpoints', 'constraints'])
        sketch[key] = JSON.parse(JSON.stringify(snapshot[key]));
      sketch.revision++;
      this.onChange();
    }

    release(stroke) {
      if (stroke.target?.hasPointerCapture?.(stroke.pointerId))
        stroke.target.releasePointerCapture(stroke.pointerId);
    }

    cancel() {
      if (this.stroke) {
        const stroke = this.stroke;
        this.stroke = null;
        this.release(stroke);
        this.document.nextEntityId = stroke.firstId;
        if (stroke.selections.size) this.apply(stroke.sketch, stroke.before);
      }
      this.preview = null;
      this.onChange();
    }

    clearHover() {
      if (this.stroke || !this.preview) return;
      this.preview = null;
      this.onChange();
    }

    screenIndexFor(sketch, bounds) {
      const camera = this.camera;
      const key = [sketch.revision, sketch.entities.length, bounds.width, bounds.height,
        camera.zoom, camera.panX, camera.panY, ...camera.right, ...camera.up,
        ...camera.pivot, cad.settings.cameraPivot].join('|');
      if (this.screenCache?.sketch === sketch && this.screenCache.key === key) return this.screenCache;
      const project = camera.projector(bounds.width, bounds.height);
      this.screenCache = { sketch, key, cutCache: new Map(),
        index: cad.sketchHitTest.screenIndex(sketch,
          point => project(this.document.toWorld(sketch, point))) };
      return this.screenCache;
    }

    at(event, sketch = this.getActiveSketch()) {
      if (!sketch) return null;
      const bounds = event.target.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const cache = this.screenIndexFor(sketch, bounds);
      const hit = cad.sketchHitTest.boundariesIn(cache.index, screen, 9)[0];
      const point = this.document.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
      return plan(sketch, hit, point, cache.cutCache);
    }

    collect(clientX, clientY, tolerance, firstOnly = false) {
      const stroke = this.stroke;
      if (!stroke) return false;
      const bounds = stroke.target.getBoundingClientRect();
      const screen = [clientX - bounds.left, clientY - bounds.top];
      const point = this.document.screenToPlane(stroke.baseSketch, this.camera, bounds, clientX, clientY);
      if (!point) return false;
      let changed = false;
      for (const hit of cad.sketchHitTest.boundariesIn(stroke.screenIndex, screen, tolerance)) {
        const result = plan(stroke.baseSketch, hit, point, stroke.cutCache);
        if (!result) continue;
        const key = `${hit.entity.id}:${hit.edgeIndex ?? ''}:${result.from.toFixed(6)}:${result.to.toFixed(6)}`;
        if (stroke.selections.has(key)) continue;
        stroke.selections.set(key, { entityId: hit.entity.id, edgeIndex: hit.edgeIndex,
          from: result.from, to: result.to });
        changed = true;
        if (firstOnly) break;
      }
      return changed;
    }

    rebuildStroke() {
      const stroke = this.stroke;
      if (!stroke || !stroke.selections.size) return;
      const { after, nextId } = buildAfter(stroke.before, stroke.selections, stroke.firstId);
      stroke.after = after;
      this.document.nextEntityId = nextId;
      this.apply(stroke.sketch, after);
    }

    beginStroke(event, capture = true) {
      const sketch = this.getActiveSketch();
      if (!sketch || this.stroke) return false;
      const before = snapshotOf(sketch);
      this.stroke = { pointerId: event.pointerId, target: event.target, sketch, before,
        baseSketch: { plane: sketch.plane, entities: before.entities }, firstId: this.document.nextEntityId,
        selections: new Map(), last: [event.clientX, event.clientY], after: null,
        screenIndex: this.screenIndexFor(sketch, event.target.getBoundingClientRect()).index,
        cutCache: new Map() };
      if (capture) event.target.setPointerCapture?.(event.pointerId);
      this.preview = null;
      if (this.collect(event.clientX, event.clientY, 9, true)) this.rebuildStroke();
      return true;
    }

    extendStroke(event) {
      const stroke = this.stroke;
      if (!stroke || event.pointerId !== stroke.pointerId) return false;
      const [x0, y0] = stroke.last;
      const distance = Math.hypot(event.clientX - x0, event.clientY - y0);
      const steps = Math.max(1, Math.ceil(distance / 5));
      let changed = false;
      for (let index = 1; index <= steps; index++) {
        const t = index / steps;
        changed = this.collect(x0 + (event.clientX - x0) * t,
          y0 + (event.clientY - y0) * t, 6) || changed;
      }
      stroke.last = [event.clientX, event.clientY];
      if (changed) this.rebuildStroke();
      return true;
    }

    endStroke(event, cancelled = false) {
      const stroke = this.stroke;
      if (!stroke || event.pointerId !== stroke.pointerId) return false;
      if (cancelled) { this.cancel(); return true; }
      if (Math.hypot(event.clientX - stroke.last[0], event.clientY - stroke.last[1]) > 0.5)
        this.extendStroke(event);
      this.stroke = null;
      this.release(stroke);
      if (stroke.after) {
        this.history.execute({ name: 'Sketch trim', kind: 'sketch',
          execute: () => this.apply(stroke.sketch, stroke.after),
          undo: () => this.apply(stroke.sketch, stroke.before),
          redo: () => this.apply(stroke.sketch, stroke.after) });
      }
      this.preview = null;
      return true;
    }

    onPointerMove(event) {
      if (this.stroke) {
        const revision = this.stroke.sketch.revision;
        this.extendStroke(event);
        if (this.stroke?.sketch.revision === revision) this.onChange();
      }
      else { this.preview = this.at(event); this.onChange(); }
    }

    onClick(event) {
      if (this.stroke) return;
      const pointer = { target: event.target, clientX: event.clientX, clientY: event.clientY,
        pointerId: event.pointerId ?? 0 };
      this.beginStroke(pointer, false);
      this.endStroke(pointer);
    }

    render(context, project) {
      const sketch = this.getActiveSketch();
      if (!sketch || !this.preview) return;
      const toScreen = point => project(this.document.toWorld(sketch, point));
      context.save();
      cad.sketchRender.drawEntity(context, this.preview.removed, toScreen, '#e56540', 4.5);
      context.restore();
    }
  }

  cad.SketchTrim = SketchTrim;
  cad.sketchTrimGeometry = { plan, intersections };
})(window.WebCAD = window.WebCAD || {});
