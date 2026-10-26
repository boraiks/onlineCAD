(function (cad) {
  'use strict';

  const geometry = cad.sketchGeometry;

  class SketchToolController {
    constructor({ canvas, hud, document, camera, history, annotationInteraction = null, getActiveSketch, onChange, onToolChange, onConstructionChange = () => {}, onFeedback = () => {}, onError = () => {} }) {
      this.canvas = canvas;
      this.hud = hud;
      this.document = document;
      this.camera = camera;
      this.history = history;
      this.annotationInteraction = annotationInteraction;
      this.getActiveSketch = getActiveSketch;
      this.onChange = onChange;
      this.onToolChange = onToolChange;
      this.onConstructionChange = onConstructionChange;
      this.onFeedback = onFeedback;
      this.onError = onError;
      this.tool = null;
      this.constructionEnabled = false;
      this.start = null;
      this.pointer = null;
      this.locked = new Map();
      this.inputs = new Map();
      this.dirty = new Set();
      this.typed = new Set();
      this.distance = new cad.SketchDistance();
      this.trim = new cad.SketchTrim({
        getActiveSketch: this.getActiveSketch,
        document: this.document,
        camera: this.camera,
        history: this.history,
        onChange: this.onChange,
      });
      this.fillet = new cad.SketchFillet({
        getActiveSketch: this.getActiveSketch,
        document: this.document,
        camera: this.camera,
        history: this.history,
        hud: this.hud,
        onChange: this.onChange,
        onFinished: () => this.setTool(null),
      });
      this.mirror = new cad.SketchMirror({
        getActiveSketch: this.getActiveSketch,
        document: this.document,
        camera: this.camera,
        history: this.history,
        onChange: this.onChange,
        onFinished: () => this.setTool(null),
      });
      this.pattern = cad.SketchPattern && globalThis.document?.querySelector?.('#patternPalette') ? new cad.SketchPattern({
        canvas: this.canvas, document: this.document, camera: this.camera, history: this.history,
        getActiveSketch: this.getActiveSketch, onChange: this.onChange,
        onFinished: () => this.setTool(null), onFeedback: this.onFeedback,
      }) : null;
      this.finishLineButton = globalThis.document?.querySelector?.('#finishLine') || null;
      this.finishLineButton?.addEventListener('click', event => {
        event.stopPropagation();
        this.setTool(null);
      });
      this.lineSegments = 0;
      this.finishLineAnchor = null;
      this.lastClient = null;
      this.hoverPoint = null;
      this.hoverHandle = null;
      this.selectedPoint = null;
      this.snapKind = null;
      this.snapResult = null;
      this.startSnap = null;
      this.inferenceAnchor = null;
      this.inferenceGuide = null;
      this.angleFirst = null;
      this.constraintFirst = null;
      this.relationFirst = null;
      this.firstAxisPoint = null;
      this.hoverAxisPoint = null;
      this.hoverConstraint = null;
      this.hoverBoundary = null;
      this.entityDrag = null;
      this.skipNextClick = false;
      this.selectedEntityIds = new Set();
      this.bindEvents();
    }

    setTool(type) {
      const allowed = ['line', 'rectangle', 'circle', 'point', 'fillet', 'trim', 'mirror', 'distance', 'angle', 'midpoint', 'axis', 'fix', 'tangent', 'coincident', 'equal', 'offset', 'circularPattern', 'rectangularPattern'];
      this.tool = type && allowed.includes(type) && this.getActiveSketch() ? type : null;
      this.lineSegments = 0;
      this.wheel?.close();
      this.cancelPreview(false);
      this.distance.clear();
      this.hoverPoint = null;
      this.hoverHandle = null;
      this.inferenceAnchor = null;
      this.inferenceGuide = null;
      this.hoverBoundary = null;
      this.hoverConstraint = null;
      this.firstAxisPoint = null;
      this.hoverAxisPoint = null;
      if (this.tool) this.selectedEntityIds.clear();
      if (this.fillet) {
        if (this.tool === 'fillet') this.fillet.start();
        else this.fillet.cancel();
      }
      if (this.mirror) {
        if (this.tool === 'mirror') this.mirror.open();
        else this.mirror.close();
      }
      if (this.pattern) {
        if (['offset', 'circularPattern', 'rectangularPattern'].includes(this.tool)) this.pattern.open(this.tool);
        else this.pattern.close();
      }
      this.canvas.classList.toggle('sketch-tool-active', Boolean(this.tool));
      this.canvas.style.cursor = cad.sketchCursor.css(this.tool || (this.constructionEnabled ? 'construction' : null));
      this.onToolChange(this.tool);
      this.onChange();
    }

    setConstruction(enabled) {
      this.constructionEnabled = Boolean(enabled && this.getActiveSketch());
      this.hoverBoundary = null;
      this.canvas.style.cursor = cad.sketchCursor.css(this.tool || (this.constructionEnabled ? 'construction' : null));
      this.onConstructionChange(this.constructionEnabled);
      this.onChange();
    }

    // Click selection without a tool (Shift/Ctrl adds), removed with Delete.
    selectEntity(entity, additive = false) {
      if (!additive) this.selectedEntityIds.clear();
      if (entity) {
        if (additive && this.selectedEntityIds.has(entity.id)) this.selectedEntityIds.delete(entity.id);
        else this.selectedEntityIds.add(entity.id);
      }
      const count = this.selectedEntityIds.size;
      if (count) this.onFeedback(`${count} sketch item${count === 1 ? '' : 's'} selected · Delete to remove · Shift+click to add`);
      this.onChange();
    }

    clearEntitySelection() {
      if (!this.selectedEntityIds.size) return;
      this.selectedEntityIds.clear();
      this.onChange();
    }

    selectedEntities() {
      const sketch = this.getActiveSketch();
      if (!sketch) return [];
      return sketch.entities.filter(entity => this.selectedEntityIds.has(entity.id));
    }

    // Removes the selected entities together with every constraint, dimension
    // and midpoint marker that refers to them, as one undoable step.
    deleteSelection() {
      const sketch = this.getActiveSketch();
      const entities = this.selectedEntities();
      if (!sketch || !entities.length) return false;
      const ids = entities.map(entity => entity.id);
      const refersToDeleted = item => {
        const text = JSON.stringify(item);
        return ids.some(id => text.includes(`"${id}"`));
      };
      const before = {
        entities: [...sketch.entities],
        constraints: [...sketch.constraints],
        measurements: [...sketch.measurements],
        midpoints: [...sketch.midpoints],
      };
      const apply = () => {
        sketch.entities = before.entities.filter(entity => !ids.includes(entity.id));
        sketch.constraints = before.constraints.filter(item => !refersToDeleted(item));
        sketch.measurements = before.measurements.filter(item => !refersToDeleted(item));
        sketch.midpoints = before.midpoints.filter(item => !refersToDeleted(item));
        sketch.revision++;
        this.selectedEntityIds.clear();
        this.onChange();
      };
      const restore = () => {
        sketch.entities = [...before.entities];
        sketch.constraints = [...before.constraints];
        sketch.measurements = [...before.measurements];
        sketch.midpoints = [...before.midpoints];
        sketch.revision++;
        this.onChange();
      };
      this.history.execute({
        name: `Delete ${ids.length} sketch item${ids.length === 1 ? '' : 's'}`, kind: 'sketch',
        execute: apply, undo: restore, redo: apply,
      });
      this.onFeedback(`Deleted ${ids.length} sketch item${ids.length === 1 ? '' : 's'} · Ctrl+Z to undo`);
      return true;
    }

    clearPointSelection() {
      this.selectedPoint = null;
      this.hoverHandle = null;
      this.inferenceAnchor = null;
      this.inferenceGuide = null;
      this.onChange();
    }

    pointHandleAt(event, radius = 10) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const project = point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height);
      return cad.sketchHitTest.pointHandleAt(sketch, project, screen, radius);
    }

    pointRef(handle) {
      return handle ? { entityId: handle.entity?.id || null, part: handle.part,
        cornerIndex: handle.cornerIndex, isOrigin: Boolean(handle.isOrigin) } : null;
    }

    selectPointHandle(handle, toggle = false) {
      const next = this.pointRef(handle);
      const current = this.selectedPoint;
      const same = current && next && current.entityId === next.entityId && current.part === next.part &&
        current.cornerIndex === next.cornerIndex && current.isOrigin === next.isOrigin;
      this.selectedPoint = same && toggle ? null : next;
      this.onChange();
    }

    toggleConstruction(sketch, entity) {
      if (!entity || entity.type === 'point') return false;
      const before = Boolean(entity.construction);
      const apply = construction => {
        this.document.setConstruction(sketch, entity.id, construction);
        this.onChange();
      };
      this.history.execute({ name: before ? 'Normal sketch geometry' : 'Construction geometry', kind: 'sketch',
        execute: () => apply(!before), undo: () => apply(before),
        redo: () => apply(!before) });
      return true;
    }

    cancelPreview(redraw = true) {
      this.lineSegments = 0;
      this.finishLineAnchor = null;
      this.start = null;
      this.pointer = null;
      this.snapResult = null;
      this.startSnap = null;
      this.inferenceAnchor = null;
      this.inferenceGuide = null;
      this.distance.cancel();
      this.angleFirst = null;
      this.firstAxisPoint = null;
      this.hoverAxisPoint = null;
      this.constraintFirst = null;
      this.relationFirst = null;
      if (this.finishLineButton) this.finishLineButton.hidden = true;
      if (this.fillet) this.fillet.cancel();
      if (this.mirror) this.mirror.close();
      if (this.trim) this.trim.cancel();
      this.locked.clear();
      this.inputs.clear();
      this.dirty.clear();
      this.typed.clear();
      this.hud.hidden = true;
      this.hud.replaceChildren();
      if (redraw) this.onChange();
    }

    updateFinishLine() {
      if (!this.finishLineButton) return;
      const sketch = this.getActiveSketch();
      this.finishLineButton.hidden = this.tool !== 'line' || this.lineSegments < 1 || !this.start || !sketch;
      if (this.finishLineButton.hidden) return;
      const bounds = this.canvas.getBoundingClientRect();
      if (!this.finishLineAnchor) {
        const hudLeft = parseFloat(this.hud.style.left) || 8;
        const hudTop = parseFloat(this.hud.style.top) || 8;
        const hudWidth = this.hud.offsetWidth || 205;
        const hudHeight = this.hud.offsetHeight || 70;
        this.finishLineAnchor = [
          Math.max(8, Math.min(bounds.width - 36, hudLeft + (hudWidth - 29) / 2)),
          Math.max(8, Math.min(bounds.height - 36, hudTop + hudHeight + 8)),
        ];
      }
      const left = `${this.finishLineAnchor[0]}px`;
      const top = `${this.finishLineAnchor[1]}px`;
      if (this.finishLineButton.style.left !== left) this.finishLineButton.style.left = left;
      if (this.finishLineButton.style.top !== top) this.finishLineButton.style.top = top;
    }

    pointAt(event) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const raw = this.document.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
      const shapeAngle = this.start && ['line', 'rectangle', 'circle'].includes(this.tool) &&
        !(this.tool === 'line' && this.locked.has('angle'));
      const hoveredAnchor = this.inferenceAnchor && cad.sketchConstraints.getPointCoordinate(sketch, this.inferenceAnchor);
      if (this.inferenceAnchor && !hoveredAnchor) this.inferenceAnchor = null;
      const anchor = shapeAngle ? this.start : hoveredAnchor;
      const snapped = cad.sketchSnap.snap(sketch, raw, this.camera, bounds,
        { trackingAnchor: anchor || null, trackingAngleStep: shapeAngle ? 15 : 90 });
      this.snapResult = snapped;
      this.snapKind = snapped?.kind || null;
      this.hoverPoint = snapped?.point || null;
      this.inferenceGuide = snapped?.kind?.startsWith('inference-')
        ? { anchor: snapped.anchor, point: snapped.point, angle: snapped.angle } : null;
      return this.hoverPoint;
    }

    segmentAt(event, lineOnly = false) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      return cad.sketchHitTest.segmentAt(sketch,
        point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height), screen, 9, lineOnly);
    }

    boundaryAt(event) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const bounds = this.canvas.getBoundingClientRect();
      return cad.sketchHitTest.boundaryAt(sketch,
        point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height),
        [event.clientX - bounds.left, event.clientY - bounds.top]);
    }

    entityAt(event) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      const project = this.camera.projector(bounds.width, bounds.height);
      const toScreen = point => project(this.document.toWorld(sketch, point));
      for (const entity of sketch.entities) {
        if (entity.type !== 'point') continue;
        const position = toScreen(entity.position);
        if (Math.hypot(position[0] - screen[0], position[1] - screen[1]) <= 9) return entity;
      }
      return cad.sketchHitTest.entityHandleAt(sketch, toScreen, screen, 9)?.entity ||
        cad.sketchHitTest.boundaryAt(sketch, toScreen, screen, 9)?.entity || null;
    }

    toggleFixed(sketch, entity) {
      const before = Boolean(entity.fixed);
      const apply = fixed => {
        this.document.setFixed(sketch, entity.id, fixed);
        this.onChange();
      };
      this.history.execute({ name: before ? 'Unfix geometry' : 'Fix geometry', kind: 'sketch',
        execute: () => apply(!before), undo: () => apply(before),
        redo: () => apply(!before) });
    }

    addMeasurement(sketch, measurement) {
      this.history.execute({
        name: `Add ${measurement.type || 'sketch'} measurement`, kind: 'sketch',
        execute: () => { this.document.insertMeasurement(sketch, measurement); this.onChange(); },
        undo: () => { this.document.removeMeasurement(sketch, measurement.id); this.onChange(); },
        redo: () => { this.document.insertMeasurement(sketch, measurement); this.onChange(); },
      });
    }

    addConstraint(sketch, definition, replaced = []) {
      const constraint = this.document.makeConstraint(definition);
      const before = sketch.entities.map(entity => ({ id: entity.id,
        position: entity.position && [...entity.position],
        start: entity.start && [...entity.start],
        end: entity.end && [...entity.end], center: entity.center && [...entity.center],
        radius: entity.radius, dimensions: entity.dimensions && { ...entity.dimensions } }));
      const restore = state => {
        for (const saved of state) {
          const entity = sketch.entities.find(item => item.id === saved.id);
          if (!entity) continue;
          if (saved.position) entity.position = [...saved.position];
          if (saved.start) entity.start = [...saved.start];
          if (saved.end) entity.end = [...saved.end];
          if (saved.center) entity.center = [...saved.center];
          if (saved.radius != null) entity.radius = saved.radius;
          if (saved.dimensions) entity.dimensions = { ...saved.dimensions };
        }
        sketch.revision++;
      };
      let after;
      this.history.execute({
        name: `Add ${constraint.type || 'sketch'} constraint`, kind: 'sketch',
        execute: () => {
          replaced.forEach(item => this.document.removeConstraint(sketch, item.id));
          this.document.insertConstraint(sketch, constraint);
          cad.sketchConstraints.enforce(sketch);
          after = sketch.entities.map(entity => ({ id: entity.id,
            position: entity.position && [...entity.position],
            start: entity.start && [...entity.start],
            end: entity.end && [...entity.end], center: entity.center && [...entity.center], radius: entity.radius,
            dimensions: entity.dimensions && { ...entity.dimensions } }));
          this.onChange();
        },
        undo: () => {
          this.document.removeConstraint(sketch, constraint.id);
          replaced.forEach(item => this.document.insertConstraint(sketch, item));
          restore(before);
          this.onChange();
        },
        redo: () => {
          replaced.forEach(item => this.document.removeConstraint(sketch, item.id));
          this.document.insertConstraint(sketch, constraint);
          restore(after);
          if (constraint.type === 'equal') {
            constraint.lastFirst = cad.sketchConstraints.curveLength(sketch.entities.find(item => item.id === constraint.first.entityId), constraint.first.edgeIndex);
            constraint.lastSecond = cad.sketchConstraints.curveLength(sketch.entities.find(item => item.id === constraint.second.entityId), constraint.second.edgeIndex);
          }
          this.onChange();
        },
      });
    }

    showHud() {
      this.hud.replaceChildren();
      this.inputs.clear();
      if (this.tool === 'distance') {
        const row = document.createElement('div');
        row.className = 'dimension-row';
        const name = document.createElement('span');
        name.className = 'dimension-name';
        name.textContent = 'Distance';
        const value = document.createElement('output');
        value.className = 'distance-value';
        value.textContent = '0 mm';
        row.append(name, value);
        this.hud.append(row);
        this.distanceOutput = value;
        this.hud.hidden = false;
        return;
      }
      for (const field of geometry.fields[this.tool]) {
        const row = document.createElement('label');
        row.className = 'dimension-row';
        row.dataset.dimension = field.key;
        const name = document.createElement('span');
        name.className = 'dimension-name';
        name.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', `${field.label} in ${field.unit === '°' ? 'degrees' : 'millimetres'}`);
        const unit = document.createElement('span');
        unit.className = 'dimension-unit';
        unit.textContent = field.unit;
        const lock = document.createElement('span');
        lock.className = 'dimension-lock';
        lock.textContent = 'LOCK';
        lock.title = 'Locked with Tab';
        lock.setAttribute('aria-hidden', 'true');
        row.append(name, input, unit, lock);
        this.hud.append(row);
        this.inputs.set(field.key, { input, row });
        input.addEventListener('input', () => {
          if (this.tool === 'line') {
            this.locked.clear();
            this.typed.clear();
            for (const item of this.inputs.values()) item.row.classList.remove('is-locked');
          }
          this.locked.delete(field.key);
          this.dirty.add(field.key);
          this.typed.add(field.key);
          row.classList.remove('is-locked');
          row.classList.toggle('is-invalid', geometry.parseValue(input.value, field.key) === null);
          this.onChange();
        });
      }
      this.hud.hidden = false;
      this.updateHud();
    }

    positionHud(clientX, clientY) {
      if (this.tool === 'line' && this.lineSegments && this.finishLineAnchor) return;
      const bounds = this.canvas.getBoundingClientRect();
      const width = this.hud.offsetWidth || 186;
      const height = this.hud.offsetHeight || 90;
      this.hud.style.left = `${Math.max(8, Math.min(bounds.width - width - 8, clientX - bounds.left + 20))}px`;
      const finishSpace = this.tool === 'line' && this.lineSegments ? 45 : 0;
      this.hud.style.top = `${Math.max(8, Math.min(bounds.height - height - 8 - finishSpace, clientY - bounds.top + 18))}px`;
    }

    currentValues() {
      if (!this.start) return {};
      const measured = geometry.measure(this.tool, this.start, this.pointer || this.start);
      const values = { ...measured, ...Object.fromEntries(this.locked) };
      for (const key of this.dirty) {
        const parsed = geometry.parseValue(this.inputs.get(key)?.input.value, key);
        if (parsed !== null) values[key] = parsed;
      }
      if (this.tool === 'circle') {
        if (this.typed.has('diameter')) values.radius = values.diameter / 2;
        else if (this.typed.has('radius')) values.diameter = values.radius * 2;
      }
      return values;
    }

    currentShape() {
      if (!this.tool || !this.start) return null;
      const shape = geometry.shape(this.tool, this.start, this.pointer || this.start, this.currentValues(),
        this.tool === 'circle' && this.typed.has('diameter') ? 'diameter' : null);
      if (shape && this.constructionEnabled) shape.construction = true;
      return shape;
    }

    updateHud() {
      if (!this.start) return;
      if (this.tool === 'distance') {
        if (this.distanceOutput) this.distanceOutput.textContent = `${geometry.formatValue(this.distance.value(), 'length')} mm`;
        return;
      }
      const values = this.currentValues();
      for (const field of geometry.fields[this.tool]) {
        const { input, row } = this.inputs.get(field.key);
        if (!this.dirty.has(field.key)) input.value = geometry.formatValue(values[field.key], field.key);
        row.classList.toggle('is-locked', this.locked.has(field.key));
      }
    }

    lockField(key) {
      const item = this.inputs.get(key);
      if (!item) return false;
      const value = geometry.parseValue(item.input.value, key);
      if (value === null) {
        item.row.classList.add('is-invalid');
        item.input.focus();
        this.onError({ code: 'CAD-S001', title: 'Sketch error', reason: `Enter a valid ${key} value.` });
        return false;
      }
      if (this.tool === 'line' || this.tool === 'circle') {
        this.locked.clear();
        for (const typedKey of this.typed) if (typedKey !== key) this.typed.delete(typedKey);
      }
      this.locked.set(key, value);
      this.dirty.delete(key);
      item.row.classList.remove('is-invalid');
      item.row.classList.add('is-locked');
      this.updateHud();
      this.onChange();
      return true;
    }

    tabField(backward) {
      if (this.tool === 'distance') return;
      const keys = geometry.fields[this.tool].map(field => field.key);
      const current = keys.find(key => this.inputs.get(key).input === document.activeElement) || keys[0];
      if (this.tool === 'rectangle' && this.locked.has(current)) {
        this.locked.delete(current);
        this.typed.delete(current);
        this.dirty.delete(current);
        this.inputs.get(current).row.classList.remove('is-locked');
        this.updateHud();
        this.onChange();
      } else if (!this.lockField(current)) return;
      const index = keys.indexOf(current);
      const next = keys[(index + (backward ? keys.length - 1 : 1)) % keys.length];
      const input = this.inputs.get(next).input;
      input.focus();
      input.select();
    }

    commit() {
      if (this.tool === 'distance') {
        const sketch = this.getActiveSketch();
        const measured = this.distance.finish(this.pointer);
        if (!sketch || !measured) return false;
        const measurement = this.document.makeMeasurement(measured.start, measured.end);
        this.addMeasurement(sketch, measurement);
        this.cancelPreview();
        this.canvas.focus();
        return true;
      }
      for (const key of this.dirty) {
        const item = this.inputs.get(key);
        if (geometry.parseValue(item?.input.value, key) === null) {
          item.row.classList.add('is-invalid');
          item.input.focus();
          this.onError({ code: 'CAD-S001', title: 'Sketch error', reason: `Enter a valid ${key} value.` });
          return false;
        }
      }
      const sketch = this.getActiveSketch();
      const shape = this.currentShape();
      if (!sketch) return false;
      if (!geometry.valid(shape) || !cad.sketchSnap.withinBounds(shape)) {
        this.onError({ code: 'CAD-S002', title: 'Sketch error',
          reason: 'Invalid shape or outside the sketch boundary.' });
        return false;
      }
      const values = this.currentValues();
      const definedKeys = new Set([...this.typed, ...this.locked.keys()]);
      const dimensions = Object.fromEntries([...definedKeys].map(key => [key, values[key]]));
      const entity = this.document.makeEntity(shape, dimensions);
      const lineMeasurement = (entity.type === 'line' && Number.isFinite(dimensions.length))
        ? this.document.makeLineMeasurement(entity.id)
        : null;
      const constraints = [];
      const attach = (part, snap, coordinate) => {
        if (!snap?.point || !coordinate ||
          Math.hypot(coordinate[0] - snap.point[0], coordinate[1] - snap.point[1]) > 0.0015) return;
        const definition = cad.sketchConstraints.makeSnapConstraint(sketch, { entity, part }, snap);
        if (definition) constraints.push(this.document.makeConstraint(definition));
      };
      if (entity.type === 'line' || entity.type === 'rectangle') {
        attach('start', this.startSnap, entity.start);
        attach('end', this.snapResult, entity.end);
      } else if (entity.type === 'circle') attach('center', this.startSnap, entity.center);
      this.history.execute({
        name: `Draw ${entity.type}`, kind: 'sketch',
        execute: () => {
          this.document.insertEntity(sketch, entity);
          if (lineMeasurement) this.document.insertMeasurement(sketch, lineMeasurement);
          constraints.forEach(item => this.document.insertConstraint(sketch, item));
          if (constraints.length) cad.sketchConstraints.enforce(sketch);
          this.onChange();
        },
        undo: () => {
          constraints.forEach(item => this.document.removeConstraint(sketch, item.id));
          if (lineMeasurement) this.document.removeMeasurement(sketch, lineMeasurement.id);
          this.document.removeEntity(sketch, entity.id);
          this.onChange();
        },
        redo: () => {
          this.document.insertEntity(sketch, entity);
          if (lineMeasurement) this.document.insertMeasurement(sketch, lineMeasurement);
          constraints.forEach(item => this.document.insertConstraint(sketch, item));
          if (constraints.length) cad.sketchConstraints.enforce(sketch);
          this.onChange();
        },
      });
      const continueLine = this.tool === 'line';
      const endpoint = continueLine ? [...entity.end] : null;
      const count = this.lineSegments;
      this.cancelPreview();
      if (continueLine) {
        this.lineSegments = count + 1;
        this.start = endpoint;
        this.startSnap = { kind: 'endpoint', point: endpoint,
          target: { entityId: entity.id, part: 'end' } };
        this.pointer = endpoint;
        this.showHud();
        if (this.lastClient) {
          this.positionHud(...this.lastClient);
        }
        this.updateFinishLine();
        this.onChange();
      }
      this.canvas.focus();
      return true;
    }

    bindEvents() {
      this.canvas.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        if (this.wheel && !this.wheel.root.hidden) {
          this.wheel.close();
          this.skipNextClick = true;
          event.preventDefault();
          return;
        }
        if (this.constructionEnabled && !this.tool) return;
        if (this.tool === 'fillet' && this.fillet.beginHandleDrag(event)) {
          event.preventDefault();
          return;
        }
        if (this.tool === 'offset' && this.pattern?.beginHandleDrag(event)) {
          event.preventDefault();
          return;
        }
        if (this.annotationInteraction?.editor) return;
        if (this.annotationInteraction?.hitAt(event)) return;
        if (['fix', 'axis', 'coincident', 'equal', 'offset', 'circularPattern', 'rectangularPattern'].includes(this.tool)) return;
        if (this.tool === 'trim') {
          this.trim.beginStroke(event);
          event.preventDefault();
          return;
        }
        if (this.tool === 'fillet' || this.tool === 'mirror') return;

        const sketch = this.getActiveSketch();
        if (!sketch || this.start) return;

        const bounds = this.canvas.getBoundingClientRect();
        const screenPoint = [event.clientX - bounds.left, event.clientY - bounds.top];
        const project = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);

        const handle = cad.sketchHitTest.entityHandleAt(sketch, project, screenPoint, 10);
        if (handle) {
          if (handle.entity.fixed) return;
          if (handle.part === 'perimeter' && handle.isConstant) return;
          if (handle.part === 'edge' && handle.isConstant) return;
          if (handle.part === 'corner' && handle.isWidthConstant && handle.isHeightConstant) return;

          const entity = handle.entity;
          const initialSnapshot = sketch.entities.map(e => ({
            id: e.id,
            position: e.position && [...e.position],
            start: e.start && [...e.start],
            end: e.end && [...e.end],
            center: e.center && [...e.center],
            radius: e.radius
          }));
          const initialEqual = sketch.constraints.filter(item => item.type === 'equal').map(item =>
            ({ id: item.id, lastFirst: item.lastFirst, lastSecond: item.lastSecond }));

          this.entityDrag = {
            pointerId: event.pointerId,
            startScreen: [event.clientX, event.clientY],
            handle,
            entity,
            sketch,
            initialSnapshot,
            initialEqual,
            moved: false,
          };
          this.canvas.setPointerCapture?.(event.pointerId);
        }
      });

      this.canvas.addEventListener('pointermove', event => {
        if (this.wheel && !this.wheel.root.hidden) {
          this.canvas.style.cursor = 'default';
          return;
        }
        this.lastClient = [event.clientX, event.clientY];
        if (this.entityDrag && event.pointerId === this.entityDrag.pointerId) {
          const dx = event.clientX - this.entityDrag.startScreen[0];
          const dy = event.clientY - this.entityDrag.startScreen[1];
          if (Math.hypot(dx, dy) > 3) this.entityDrag.moved = true;

          if (this.entityDrag.moved) {
            const { entity, handle, sketch } = this.entityDrag;
            const bounds = this.canvas.getBoundingClientRect();
            const raw = this.document.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
            if (!raw) return;
            const snapped = cad.sketchSnap.snap(sketch, raw, this.camera, bounds,
              { excludeEntityId: entity.id })?.point || raw;

            if (handle.part === 'perimeter' && entity.type === 'circle') {
              const newR = Math.hypot(snapped[0] - entity.center[0], snapped[1] - entity.center[1]);
              if (cad.sketchGrid.atLeastPrecision(newR) && cad.sketchSnap.withinBounds({ ...entity, radius: newR })) {
                entity.radius = Number(newR.toFixed(3));
                cad.sketchConstraints?.enforce(sketch);
                sketch.revision++;
                this.onChange();
              }
            } else if (handle.part === 'center' && entity.type === 'circle') {
              if (cad.sketchSnap.withinBounds({ ...entity, center: snapped })) {
                entity.center = [...snapped];
                cad.sketchConstraints?.enforce(sketch);
                sketch.revision++;
                this.onChange();
              }
            } else if (handle.part === 'position' && entity.type === 'point') {
              if (cad.sketchSnap.withinBounds({ ...entity, position: snapped })) {
                entity.position = [...snapped];
                cad.sketchConstraints?.enforce(sketch);
                sketch.revision++;
                this.onChange();
              }
            } else if (entity.type === 'line') {
              const hConstraint = sketch.constraints.find(c => c.type === 'horizontal' && c.entityId === entity.id);
              const vConstraint = sketch.constraints.find(c => c.type === 'vertical' && c.entityId === entity.id);

              if (handle.part === 'end') {
                let targetPos = [...snapped];
                if (hConstraint) targetPos[1] = entity.start[1];
                if (vConstraint) targetPos[0] = entity.start[0];

                if (handle.isConstant) {
                  const initSnap = this.entityDrag.initialSnapshot.find(s => s.id === entity.id);
                  const constLen = Math.hypot((initSnap?.end[0] ?? entity.end[0]) - (initSnap?.start[0] ?? entity.start[0]),
                    (initSnap?.end[1] ?? entity.end[1]) - (initSnap?.start[1] ?? entity.start[1]));
                  if (hConstraint) {
                    const sign = targetPos[0] >= entity.start[0] ? 1 : -1;
                    const newEnd = [entity.start[0] + sign * constLen, entity.start[1]];
                    if (cad.sketchSnap.withinBounds({ ...entity, end: newEnd })) {
                      entity.end = newEnd;
                      cad.sketchConstraints?.enforce(sketch);
                      sketch.revision++;
                      this.onChange();
                    }
                  } else if (vConstraint) {
                    const sign = targetPos[1] >= entity.start[1] ? 1 : -1;
                    const newEnd = [entity.start[0], entity.start[1] + sign * constLen];
                    if (cad.sketchSnap.withinBounds({ ...entity, end: newEnd })) {
                      entity.end = newEnd;
                      cad.sketchConstraints?.enforce(sketch);
                      sketch.revision++;
                      this.onChange();
                    }
                  } else {
                    const vdx = snapped[0] - entity.start[0];
                    const vdy = snapped[1] - entity.start[1];
                    const vlen = Math.hypot(vdx, vdy);
                    if (cad.sketchGrid.atLeastPrecision(vlen)) {
                      const newEnd = [entity.start[0] + (vdx / vlen) * constLen, entity.start[1] + (vdy / vlen) * constLen];
                      if (cad.sketchSnap.withinBounds({ ...entity, end: newEnd })) {
                        entity.end = newEnd;
                        cad.sketchConstraints?.enforce(sketch);
                        sketch.revision++;
                        this.onChange();
                      }
                    }
                  }
                } else if (cad.sketchSnap.withinBounds({ ...entity, end: targetPos })) {
                  entity.end = targetPos;
                  cad.sketchConstraints?.enforce(sketch);
                  sketch.revision++;
                  this.onChange();
                }
              } else if (handle.part === 'start') {
                let targetPos = [...snapped];
                if (hConstraint) targetPos[1] = entity.end[1];
                if (vConstraint) targetPos[0] = entity.end[0];

                if (handle.isConstant) {
                  const initSnap = this.entityDrag.initialSnapshot.find(s => s.id === entity.id);
                  const constLen = Math.hypot((initSnap?.end[0] ?? entity.end[0]) - (initSnap?.start[0] ?? entity.start[0]),
                    (initSnap?.end[1] ?? entity.end[1]) - (initSnap?.start[1] ?? entity.start[1]));
                  if (hConstraint) {
                    const sign = targetPos[0] <= entity.end[0] ? -1 : 1;
                    const newStart = [entity.end[0] + sign * constLen, entity.end[1]];
                    if (cad.sketchSnap.withinBounds({ ...entity, start: newStart })) {
                      entity.start = newStart;
                      cad.sketchConstraints?.enforce(sketch);
                      sketch.revision++;
                      this.onChange();
                    }
                  } else if (vConstraint) {
                    const sign = targetPos[1] <= entity.end[1] ? -1 : 1;
                    const newStart = [entity.end[0], entity.end[1] + sign * constLen];
                    if (cad.sketchSnap.withinBounds({ ...entity, start: newStart })) {
                      entity.start = newStart;
                      cad.sketchConstraints?.enforce(sketch);
                      sketch.revision++;
                      this.onChange();
                    }
                  } else {
                    const vdx = snapped[0] - entity.end[0];
                    const vdy = snapped[1] - entity.end[1];
                    const vlen = Math.hypot(vdx, vdy);
                    if (cad.sketchGrid.atLeastPrecision(vlen)) {
                      const newStart = [entity.end[0] + (vdx / vlen) * constLen, entity.end[1] + (vdy / vlen) * constLen];
                      if (cad.sketchSnap.withinBounds({ ...entity, start: newStart })) {
                        entity.start = newStart;
                        cad.sketchConstraints?.enforce(sketch);
                        sketch.revision++;
                        this.onChange();
                      }
                    }
                  }
                } else if (cad.sketchSnap.withinBounds({ ...entity, start: targetPos })) {
                  entity.start = targetPos;
                  cad.sketchConstraints?.enforce(sketch);
                  sketch.revision++;
                  this.onChange();
                }
              }
            } else if (entity.type === 'rectangle') {
              const isWidthConst = handle.isWidthConstant ?? cad.sketchGeometry?.isRectangleWidthConstant(entity, sketch);
              const isHeightConst = handle.isHeightConstant ?? cad.sketchGeometry?.isRectangleHeightConstant(entity, sketch);

              if (handle.part === 'edge') {
                if ((handle.edgeIndex === 0 || handle.edgeIndex === 2) && isHeightConst) return;
                if ((handle.edgeIndex === 1 || handle.edgeIndex === 3) && isWidthConst) return;

                const newStart = [...entity.start];
                const newEnd = [...entity.end];
                if (handle.edgeIndex === 0 && !isHeightConst) newStart[1] = snapped[1];
                else if (handle.edgeIndex === 1 && !isWidthConst) newEnd[0] = snapped[0];
                else if (handle.edgeIndex === 2 && !isHeightConst) newEnd[1] = snapped[1];
                else if (handle.edgeIndex === 3 && !isWidthConst) newStart[0] = snapped[0];

                if (cad.sketchSnap.withinBounds({ ...entity, start: newStart, end: newEnd }) &&
                  cad.sketchGrid.atLeastPrecision(Math.abs(newEnd[0] - newStart[0])) && cad.sketchGrid.atLeastPrecision(Math.abs(newEnd[1] - newStart[1]))) {
                  entity.start = newStart;
                  entity.end = newEnd;
                  cad.sketchConstraints?.enforce(sketch);
                  sketch.revision++;
                  this.onChange();
                }
              } else if (handle.part === 'corner') {
                if (isWidthConst && isHeightConst) return;

                const newStart = [...entity.start];
                const newEnd = [...entity.end];
                const i = handle.cornerIndex;
                if (!isWidthConst) {
                  if (i === 0 || i === 3) newStart[0] = snapped[0];
                  else newEnd[0] = snapped[0];
                }
                if (!isHeightConst) {
                  if (i === 0 || i === 1) newStart[1] = snapped[1];
                  else newEnd[1] = snapped[1];
                }
                if (cad.sketchSnap.withinBounds({ ...entity, start: newStart, end: newEnd }) &&
                  cad.sketchGrid.atLeastPrecision(Math.abs(newEnd[0] - newStart[0])) && cad.sketchGrid.atLeastPrecision(Math.abs(newEnd[1] - newStart[1]))) {
                  entity.start = newStart;
                  entity.end = newEnd;
                  cad.sketchConstraints?.enforce(sketch);
                  sketch.revision++;
                  this.onChange();
                }
              }
            }
            event.preventDefault();
            return;
          }
        }

        if (this.annotationInteraction?.drag) return;

        if (!this.tool) {
          const pointHandle = this.pointHandleAt(event);
          if (pointHandle) {
            this.hoverHandle = this.pointRef(pointHandle);
            this.hoverBoundary = null;
            this.hoverConstraint = null;
            this.canvas.style.cursor = 'pointer';
            this.onChange();
            return;
          }
          this.hoverHandle = null;
          if (this.constructionEnabled) {
            this.hoverBoundary = this.boundaryAt(event);
            this.hoverConstraint = null;
            this.canvas.style.cursor = cad.sketchCursor.css('construction');
            this.onChange();
            return;
          }
          const sketch = this.getActiveSketch();
          if (sketch) {
            const bounds = this.canvas.getBoundingClientRect();
            const screenPoint = [event.clientX - bounds.left, event.clientY - bounds.top];
            const project = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);

            const constraintHit = cad.sketchConstraints.hitTest(sketch, project, screenPoint, 10);
            if (constraintHit) {
              this.hoverConstraint = constraintHit.constraint;
              this.canvas.style.cursor = 'pointer';
              this.onChange();
              return;
            } else if (this.hoverConstraint) {
              this.hoverConstraint = null;
              this.onChange();
            }

            const handle = cad.sketchHitTest.entityHandleAt(sketch, project, screenPoint, 10);
            if (handle) {
              if (handle.entity.fixed) {
                this.canvas.style.cursor = 'default';
                return;
              }
              if (handle.part === 'perimeter') {
                this.canvas.style.cursor = handle.isConstant ? 'default' : 'ew-resize';
              } else if (handle.part === 'start' || handle.part === 'end' || handle.part === 'center' || handle.part === 'position') {
                this.canvas.style.cursor = 'crosshair';
              } else if (handle.part === 'edge') {
                if (handle.isConstant) this.canvas.style.cursor = 'default';
                else this.canvas.style.cursor = (handle.edgeIndex === 0 || handle.edgeIndex === 2) ? 'ns-resize' : 'ew-resize';
              } else if (handle.part === 'corner') {
                if (handle.isWidthConstant && handle.isHeightConstant) this.canvas.style.cursor = 'default';
                else if (handle.isWidthConstant) this.canvas.style.cursor = 'ns-resize';
                else if (handle.isHeightConstant) this.canvas.style.cursor = 'ew-resize';
                else this.canvas.style.cursor = (handle.cornerIndex === 0 || handle.cornerIndex === 2) ? 'nwse-resize' : 'nesw-resize';
              }
            } else {
              this.canvas.style.cursor = '';
            }
          } else {
            this.canvas.style.cursor = '';
          }
          return;
        }

        const toolCursor = cad.sketchCursor.css(this.tool);
        if (this.canvas.style.cursor !== toolCursor) this.canvas.style.cursor = toolCursor;
        if (this.tool === 'fillet') {
          this.fillet.onPointerMove(event);
          return;
        }
        if (this.tool === 'mirror') {
          this.mirror.onPointerMove(event);
          return;
        }
        if (['offset', 'circularPattern', 'rectangularPattern'].includes(this.tool)) {
          this.pattern?.onPointerMove(event);
          return;
        }
        if (this.tool === 'trim') {
          this.trim.onPointerMove(event);
          return;
        }
        if (this.tool === 'axis') {
          const sketch = this.getActiveSketch();
          if (sketch) {
            const bounds = this.canvas.getBoundingClientRect();
            const screenPoint = [event.clientX - bounds.left, event.clientY - bounds.top];
            const project = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);

            const constraintHit = cad.sketchConstraints.hitTest(sketch, project, screenPoint, 10);
            if (constraintHit) {
              this.hoverConstraint = constraintHit.constraint;
              this.hoverAxisPoint = null;
              this.hoverBoundary = null;
              this.onChange();
              return;
            } else if (this.hoverConstraint) {
              this.hoverConstraint = null;
            }

            const ptHandle = cad.sketchHitTest.pointHandleAt(sketch, project, screenPoint, 12);
            if (ptHandle) {
              this.hoverAxisPoint = ptHandle;
              this.hoverBoundary = null;
              this.onChange();
              return;
            } else {
              this.hoverAxisPoint = null;
            }

            if (!this.firstAxisPoint) {
              const segment = this.segmentAt(event, true);
              this.hoverBoundary = (segment && segment.entity.type === 'line') ? { entity: segment.entity } : null;
            } else {
              this.hoverBoundary = null;
            }
          }
          this.hoverPoint = null;
          this.onChange();
          return;
        }
        if (this.tool === 'fix') {
          const entity = this.entityAt(event);
          this.hoverBoundary = entity ? { entity } : null;
          this.hoverPoint = null;
          this.onChange();
          return;
        }
        const drawingTool = ['line', 'rectangle', 'circle', 'point'].includes(this.tool);
        const pointHandle = ['line', 'rectangle', 'circle', 'point', 'distance'].includes(this.tool)
          ? this.pointHandleAt(event) : null;
        if (drawingTool && pointHandle) this.inferenceAnchor = this.pointRef(pointHandle);
        this.hoverHandle = this.pointRef(pointHandle);
        this.hoverBoundary = this.boundaryAt(event);
        const point = this.pointAt(event);
        if (this.start) {
          this.pointer = point;
          if (this.tool === 'distance') this.distance.move(point);
          this.positionHud(event.clientX, event.clientY);
          this.updateHud();
        }
        this.onChange();
      });

      const finishDrag = event => {
        if (this.tool === 'trim' && this.trim.endStroke(event, event.type === 'pointercancel')) {
          this.skipNextClick = true;
          setTimeout(() => { this.skipNextClick = false; }, 50);
          event.preventDefault();
          return;
        }
        if (this.tool === 'fillet' && this.fillet.endHandleDrag(event)) {
          this.skipNextClick = true;
          setTimeout(() => { this.skipNextClick = false; }, 50);
          event.preventDefault();
          return;
        }
        if (this.tool === 'offset' && this.pattern?.endHandleDrag(event)) {
          this.skipNextClick = true;
          setTimeout(() => { this.skipNextClick = false; }, 50);
          event.preventDefault();
          return;
        }
        if (!this.entityDrag || event.pointerId !== this.entityDrag.pointerId) return;
        const { entity, sketch, initialSnapshot, initialEqual, moved } = this.entityDrag;
        this.entityDrag = null;

        if (moved) {
          this.skipNextClick = true;
          setTimeout(() => { this.skipNextClick = false; }, 50);

          const finalSnapshot = sketch.entities.map(e => ({
            id: e.id,
            position: e.position && [...e.position],
            start: e.start && [...e.start],
            end: e.end && [...e.end],
            center: e.center && [...e.center],
            radius: e.radius
          }));
          const finalEqual = sketch.constraints.filter(item => item.type === 'equal').map(item =>
            ({ id: item.id, lastFirst: item.lastFirst, lastSecond: item.lastSecond }));

          const applySnapshot = (snapList, equalState) => {
            if (!Array.isArray(snapList)) return;
            for (const snap of snapList) {
              const e = sketch.entities.find(item => item.id === snap.id);
              if (!e) continue;
              if (snap.position) e.position = [...snap.position];
              if (snap.start) e.start = [...snap.start];
              if (snap.end) e.end = [...snap.end];
              if (snap.center) e.center = [...snap.center];
              if (snap.radius != null) e.radius = snap.radius;
            }
            for (const saved of equalState) {
              const constraint = sketch.constraints.find(item => item.id === saved.id);
              if (constraint) Object.assign(constraint, { lastFirst: saved.lastFirst, lastSecond: saved.lastSecond });
            }
            sketch.revision++;
          };

          this.history.execute({
            name: 'Move sketch geometry', kind: 'sketch',
            execute: () => { applySnapshot(finalSnapshot, finalEqual); this.onChange(); },
            undo: () => { applySnapshot(initialSnapshot, initialEqual); this.onChange(); },
            redo: () => { applySnapshot(finalSnapshot, finalEqual); this.onChange(); },
          });
        }
      };

      this.canvas.addEventListener('pointerup', finishDrag);
      this.canvas.addEventListener('pointercancel', finishDrag);

      this.canvas.addEventListener('pointerleave', () => {
        this.canvas.style.cursor = '';
        if (this.tool === 'trim') this.trim.clearHover();
        if (this.tool === 'fillet' && this.fillet.prompt) this.fillet.prompt.hidden = true;
        this.hoverBoundary = null;
        this.hoverPoint = null;
        this.hoverHandle = null;
        this.inferenceAnchor = null;
        this.inferenceGuide = null;
        this.onChange();
      });

      this.canvas.addEventListener('click', event => {
        if (this.tool === 'line') this.lastClient = [event.clientX, event.clientY];
        if (this.skipNextClick) {
          this.skipNextClick = false;
          event.preventDefault();
          return;
        }
        if (this.annotationInteraction?.consumeClick(event)) return;
        if (event.button !== 0) return;

        const sketch = this.getActiveSketch();
        if (!sketch) return;

        if (!this.tool || ['line', 'rectangle', 'circle', 'distance'].includes(this.tool)) {
          const pointHandle = this.pointHandleAt(event);
          if (pointHandle) {
            this.selectPointHandle(pointHandle, !this.tool);
            if (!this.tool) {
              event.preventDefault();
              return;
            }
          } else if (this.selectedPoint) {
            this.selectedPoint = null;
            this.onChange();
          }
        }

        if (this.constructionEnabled && !this.tool) {
          const hit = this.boundaryAt(event);
          if (hit) this.toggleConstruction(sketch, hit.entity);
          event.preventDefault();
          return;
        }

        if (this.hoverConstraint) {
          const toRemove = this.hoverConstraint;
          this.history.execute({
            name: `Remove ${toRemove.type || 'sketch'} constraint`, kind: 'sketch',
            execute: () => { this.document.removeConstraint(sketch, toRemove.id); this.onChange(); },
            undo: () => { this.document.insertConstraint(sketch, toRemove); cad.sketchConstraints.enforce(sketch); this.onChange(); },
            redo: () => { this.document.removeConstraint(sketch, toRemove.id); this.onChange(); }
          });
          this.hoverConstraint = null;
          this.onChange();
          return;
        }

        if (!this.tool) {
          this.selectEntity(this.entityAt(event), event.shiftKey || event.ctrlKey || event.metaKey);
          return;
        }
        if (this.tool === 'fillet') {
          this.fillet.onPointerDown(event);
          return;
        }
        if (this.tool === 'mirror') {
          this.mirror.onPointerDown(event);
          return;
        }
        if (['offset', 'circularPattern', 'rectangularPattern'].includes(this.tool)) {
          this.pattern?.onPointerDown(event);
          return;
        }
        if (this.tool === 'trim') {
          return;
        }
        if (this.tool === 'fix') {
          const entity = this.entityAt(event);
          if (entity) this.toggleFixed(sketch, entity);
          return;
        }
        if (this.tool === 'coincident' || this.tool === 'equal') {
          const bounds = this.canvas.getBoundingClientRect();
          const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
          const project = point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height);
          const handle = cad.sketchHitTest.pointHandleAt(sketch, project, screen, 11);
          const boundary = cad.sketchHitTest.boundaryAt(sketch, project, screen, 11);
          const selected = this.tool === 'coincident' ? (handle || boundary) : boundary;
          if (!selected) return;
          if (!this.relationFirst) {
            this.relationFirst = selected;
            this.onFeedback(`${this.tool.toUpperCase()}: select the second ${this.tool === 'equal' ? 'curve' : 'point or curve'}`);
            this.onChange();
            return;
          }
          const definition = this.tool === 'coincident'
            ? cad.sketchConstraints.makeCoincident(this.relationFirst, selected)
            : cad.sketchConstraints.makeEqual(this.relationFirst, selected);
          if (definition) {
            const duplicate = sketch.constraints.some(item => item.type === definition.type &&
              JSON.stringify({ ...item, id: undefined }) === JSON.stringify({ ...definition, id: undefined }));
            if (!duplicate) this.addConstraint(sketch, definition);
            this.relationFirst = null;
            this.onFeedback(`${this.tool.toUpperCase()}: select the first ${this.tool === 'equal' ? 'curve' : 'point or curve'}`);
          } else {
            this.relationFirst = null;
            this.onFeedback(`${this.tool.toUpperCase()}: select compatible geometry`);
            this.onError({ code: 'CAD-S003', title: 'Sketch error',
              reason: `${this.tool.toUpperCase()} needs compatible geometry.` });
          }
          this.onChange();
          return;
        }
        if (this.tool === 'point') {
          const point = this.pointAt(event);
          this.inferenceAnchor = null;
          this.inferenceGuide = null;
          if (!point || sketch.entities.some(entity => entity.type === 'point' &&
            Math.hypot(entity.position[0] - point[0], entity.position[1] - point[1]) < 1e-6)) return;
          const entity = this.document.makeEntity({ type: 'point', position: point });
          const definition = cad.sketchConstraints.makeSnapConstraint(sketch,
            { entity, part: 'position' }, this.snapResult);
          const constraint = definition && this.document.makeConstraint(definition);
          this.history.execute({
            name: 'Draw point', kind: 'sketch',
            execute: () => {
              this.document.insertEntity(sketch, entity);
              if (constraint) { this.document.insertConstraint(sketch, constraint); cad.sketchConstraints.enforce(sketch); }
              this.onChange();
            },
            undo: () => {
              if (constraint) this.document.removeConstraint(sketch, constraint.id);
              this.document.removeEntity(sketch, entity.id);
              this.onChange();
            },
            redo: () => {
              this.document.insertEntity(sketch, entity);
              if (constraint) { this.document.insertConstraint(sketch, constraint); cad.sketchConstraints.enforce(sketch); }
              this.onChange();
            },
          });
          return;
        }
        if (this.tool === 'axis') {
          const bounds = this.canvas.getBoundingClientRect();
          const screenPoint = [event.clientX - bounds.left, event.clientY - bounds.top];
          const project = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);

          // 1. Point handle selection (point-to-point constraint)
          const ptHandle = cad.sketchHitTest.pointHandleAt(sketch, project, screenPoint, 12);
          if (ptHandle) {
            if (!this.firstAxisPoint) {
              this.firstAxisPoint = ptHandle;
              this.onFeedback('Point 1 selected. Click a second point to align (Esc to cancel)');
              this.onChange();
              return;
            } else {
              const p1 = this.firstAxisPoint;
              const p2 = ptHandle;
              const isSame = (p1.isOrigin && p2.isOrigin) ||
                (p1.entity && p2.entity && p1.entity.id === p2.entity.id && p1.part === p2.part && p1.cornerIndex === p2.cornerIndex);
              if (isSame) {
                this.firstAxisPoint = null;
                this.onFeedback('HORIZONTAL / VERTICAL: click a line, or click two points to align');
                this.onChange();
                return;
              }

              const dir = cad.sketchConstraints.axisFor(p1.point, p2.point);
              const definition = cad.sketchConstraints.makeAxisPoints(p1, p2, dir);
              if (definition) {
                const replaced = definition.entityId ? sketch.constraints.filter(item =>
                  (item.type === 'horizontal' || item.type === 'vertical') && item.entityId === definition.entityId) : [];
                const samePoint = (a, b) => a?.entityId === b?.entityId && a?.part === b?.part &&
                  a?.cornerIndex === b?.cornerIndex && Boolean(a?.isOrigin) === Boolean(b?.isOrigin);
                const duplicate = sketch.constraints.some(item => item.type === definition.type &&
                  definition.point1 && ((samePoint(item.point1, definition.point1) && samePoint(item.point2, definition.point2)) ||
                    (samePoint(item.point1, definition.point2) && samePoint(item.point2, definition.point1))));
                if (!duplicate && !replaced.some(item => item.type === definition.type))
                  this.addConstraint(sketch, definition, replaced);
              }
              this.firstAxisPoint = null;
              this.onFeedback('HORIZONTAL / VERTICAL: click a line, or click two points to align');
              this.onChange();
              return;
            }
          }

          // 2. Line selection
          const segment = this.segmentAt(event, true);
          if (segment && segment.entity.type === 'line') {
            const direction = cad.sketchConstraints.axisFor(segment.entity);
            const existing = sketch.constraints.filter(item =>
              ((item.type === 'horizontal' || item.type === 'vertical') && item.entityId === segment.entity.id) ||
              (item.type === 'tangent' && item.lineId === segment.entity.id));

            // If line already has this exact constraint, toggle off (remove it)
            const alreadyHas = existing.find(item => item.type === direction && item.entityId === segment.entity.id);
            if (alreadyHas) {
              this.history.execute({
                name: `Remove ${direction} constraint`, kind: 'sketch',
                execute: () => { this.document.removeConstraint(sketch, alreadyHas.id); this.onChange(); },
                undo: () => { this.document.insertConstraint(sketch, alreadyHas); cad.sketchConstraints.enforce(sketch); this.onChange(); },
                redo: () => { this.document.removeConstraint(sketch, alreadyHas.id); this.onChange(); }
              });
              this.onChange();
              return;
            }

            const definition = cad.sketchConstraints.makeAxis(segment.entity, direction);
            if (definition) this.addConstraint(sketch, definition, existing);
            return;
          }

          if (this.firstAxisPoint) {
            this.firstAxisPoint = null;
            this.onFeedback('HORIZONTAL / VERTICAL: click a line, or click two points to align');
            this.onChange();
          }
          return;
        }
        if (this.tool === 'tangent') {
          const boundary = this.boundaryAt(event);
          if (!boundary || !['line', 'circle', 'arc'].includes(boundary.entity.type)) return;
          if (!this.constraintFirst) { this.constraintFirst = boundary.entity; this.onChange(); return; }
          const definition = cad.sketchConstraints.makeTangent(this.constraintFirst, boundary.entity);
          const line = definition?.lineId && sketch.entities.find(entity => entity.id === definition.lineId);
          if (line && (Number.isFinite(line.dimensions?.length) || Number.isFinite(line.dimensions?.angle) ||
            sketch.measurements.some(item => item.kind === 'line-length' && item.entityId === line.id))) {
            this.onFeedback('TANGENT: remove the line length or angle dimension first');
            this.onError({ code: 'CAD-S004', title: 'Sketch error',
              reason: 'Remove the line length or angle dimension before Tangent.' });
            this.constraintFirst = null;
            this.onChange();
            return;
          }
          if (definition && !sketch.constraints.some(item => item.type === 'tangent' &&
            ((item.lineId === definition.lineId && item.circleId === definition.circleId) ||
              (definition.firstCircleId &&
                ((item.firstCircleId === definition.firstCircleId && item.secondCircleId === definition.secondCircleId) ||
                  (item.firstCircleId === definition.secondCircleId && item.secondCircleId === definition.firstCircleId)))))) {
            const conflicting = definition.lineId ? sketch.constraints.filter(item =>
              item.entityId === definition.lineId || item.lineId === definition.lineId) : [];
            this.addConstraint(sketch, definition, conflicting);
            this.constraintFirst = null;
          }
          this.onChange();
          return;
        }
        if (this.tool === 'midpoint') {
          const segment = this.segmentAt(event);
          if (!segment || sketch.midpoints.some(item => item.entityId === segment.entity.id && item.edgeIndex === segment.edgeIndex)) return;
          const marker = this.document.makeMidpointMarker(segment.entity.id, segment.edgeIndex);
          this.history.execute({
            name: 'Add midpoint marker', kind: 'sketch',
            execute: () => { this.document.insertMidpoint(sketch, marker); this.onChange(); },
            undo: () => { this.document.removeMidpoint(sketch, marker.id); this.onChange(); },
            redo: () => { this.document.insertMidpoint(sketch, marker); this.onChange(); },
          });
          return;
        }
        if (this.tool === 'angle') {
          const segment = this.segmentAt(event, true);
          if (!segment) return;
          if (!this.angleFirst) { this.angleFirst = segment.entity; this.onChange(); return; }
          if (cad.sketchAngle.measure(this.angleFirst, segment.entity)) {
            this.addMeasurement(sketch, this.document.makeAngleMeasurement(this.angleFirst.id, segment.entity.id));
            this.angleFirst = null;
            this.onChange();
          }
          return;
        }
        if (this.tool === 'distance' && !this.start) {
          const boundary = this.boundaryAt(event);
          if (boundary && (boundary.entity.type === 'circle' || (boundary.t > 0.06 && boundary.t < 0.94))) {
            if (boundary.entity.type === 'line') {
              const existing = Number.isFinite(boundary.entity.dimensions?.length) ||
                sketch.measurements.some(item => item.kind === 'line-length' && item.entityId === boundary.entity.id);
              if (!existing) {
                this.addMeasurement(sketch, this.document.makeLineMeasurement(boundary.entity.id));
              }
            } else if (boundary.entity.type === 'circle') {
              const existing = Number.isFinite(boundary.entity.dimensions?.diameter) ||
                Number.isFinite(boundary.entity.dimensions?.radius) ||
                sketch.measurements.some(item => item.kind === 'circle-diameter' && item.entityId === boundary.entity.id);
              if (!existing) {
                this.addMeasurement(sketch, this.document.makeCircleDiameterMeasurement(boundary.entity.id));
              }
            } else {
              const horizontal = boundary.edgeIndex === 0 || boundary.edgeIndex === 2;
              const existing = Number.isFinite(boundary.entity.dimensions?.[horizontal ? 'width' : 'height']) ||
                sketch.measurements.some(item => item.kind === 'rectangle-edge' && item.entityId === boundary.entity.id &&
                  ((item.edgeIndex === 0 || item.edgeIndex === 2) === horizontal));
              if (!existing) {
                this.addMeasurement(sketch, this.document.makeRectangleEdgeMeasurement(boundary.entity.id, boundary.edgeIndex));
              }
            }
            this.onChange();
            return;
          }
        }
        const point = this.pointAt(event);
        if (!point) return;
        this.inferenceAnchor = null;
        this.inferenceGuide = null;
        if (!this.start) {
          this.start = point;
          this.startSnap = this.snapResult;
          this.pointer = point;
          if (this.tool === 'distance') this.distance.begin(point);
          this.showHud();
          this.positionHud(event.clientX, event.clientY);
          this.onChange();
        } else {
          this.pointer = point;
          if (this.tool === 'distance') this.distance.move(point);
          this.commit();
        }
      });
      document.addEventListener('keydown', event => {
        if (!this.getActiveSketch() || event.ctrlKey || event.metaKey || event.altKey) return;
        const isHudInput = this.hud.contains(event.target) || this.hud.contains(document.activeElement);
        const externalField = !isHudInput && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName);
        if (externalField || event.target?.isContentEditable) return;
        const shortcutTool = !isHudInput && cad.shortcuts?.toolFor(event.key);
        if (shortcutTool === 'extrude') return;
        if (shortcutTool) {
          event.preventDefault();
          if (shortcutTool === 'construction') {
            this.setConstruction(!this.constructionEnabled);
            return;
          }
          this.setTool(shortcutTool);
          return;
        }
        if (!this.tool && this.selectedEntityIds.size) {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            this.deleteSelection();
            return;
          }
          if (event.key === 'Escape') this.clearEntitySelection();
        }
        if (!this.tool) return;
        if (!isHudInput && this.start && ['line', 'rectangle', 'circle'].includes(this.tool) && /^[0-9.,]$/.test(event.key)) {
          const primaryKey = this.tool === 'line' ? 'length' : this.tool === 'circle' ? 'radius' : 'width';
          const item = this.inputs.get(primaryKey);
          if (item) {
            event.preventDefault();
            item.input.focus();
            item.input.value = event.key === ',' ? '.' : event.key;
            item.input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (this.tool === 'fillet') {
            this.fillet.cancel();
            this.setTool(null);
          } else if (this.tool === 'mirror') {
            this.mirror.close();
            this.setTool(null);
          } else if (this.firstAxisPoint) {
            this.firstAxisPoint = null;
            this.onFeedback('HORIZONTAL / VERTICAL: click a line, or click two points to align');
            this.onChange();
          } else if (['offset', 'circularPattern', 'rectangularPattern'].includes(this.tool)) this.setTool(null);
          else if (this.start || this.angleFirst || this.constraintFirst || this.relationFirst) this.cancelPreview();
          else this.setTool(null);
        } else if (event.key === 'Enter' && this.tool === 'fillet' && this.fillet.selectedCorner) {
          event.preventDefault();
          this.fillet.commit();
        } else if (event.key === 'Tab' && this.start) {
          event.preventDefault();
          this.tabField(event.shiftKey);
        } else if (event.key === 'Enter' && this.start) {
          event.preventDefault();
          for (const [key] of this.inputs) {
            if (this.dirty.has(key) && !this.lockField(key)) return;
          }
          this.commit();
        }
      });
    }

    render(context, project) {
      if (this.tool === 'line' && this.lineSegments) this.updateFinishLine();
      const activeSketch = this.getActiveSketch();
      const annotationHits = [];
      for (const sketch of this.document.sketches) {
        if (sketch.visible === false && sketch !== activeSketch) continue;
        const toScreen = point => project(this.document.toWorld(sketch, point));
        for (const entity of sketch.entities) {
          const colorOverride = entity === this.angleFirst || entity === this.constraintFirst ||
            entity.id === this.relationFirst?.entity?.id ? '#e2975b' : sketch !== activeSketch ? '#6b94a9' : null;
          cad.sketchRender.drawEntity(context, entity, toScreen, colorOverride, 2, sketch);
          for (const hit of cad.sketchDimensions.drawEntity(context, entity, toScreen, sketch)) annotationHits.push({ ...hit, sketch, entity });
        }
        if (sketch === activeSketch) {
          context.save();
          for (const entity of sketch.entities) {
            const isConst = cad.sketchGeometry?.isConstant(entity, sketch);
            const dotColor = isConst ? '#182230' : '#127fb2';
            const drawDot = pt => {
              const [sx, sy] = toScreen(pt);
              context.beginPath();
              context.arc(sx, sy, 3, 0, Math.PI * 2);
              context.fillStyle = '#ffffff';
              context.fill();
              context.strokeStyle = dotColor;
              context.lineWidth = 1.6;
              context.stroke();
            };
            if (entity.type === 'line') {
              drawDot(entity.start);
              drawDot(entity.end);
            } else if (entity.type === 'rectangle') {
              const [x1, y1] = entity.start;
              const [x2, y2] = entity.end;
              [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(drawDot);
            } else if (entity.type === 'circle') {
              const [cx, cy] = toScreen(entity.center);
              context.beginPath();
              context.arc(cx, cy, 2.5, 0, Math.PI * 2);
              context.fillStyle = dotColor;
              context.fill();
            }
          }
          context.restore();
        }
        const measurementLookup = sketch.measurements.length ? cad.SketchDistance.lookup(sketch) : null;
        for (const measurement of sketch.measurements) {
          const hit = cad.SketchDistance.draw(context, toScreen, measurement, sketch, measurementLookup);
          if (hit) annotationHits.push({ ...hit, sketch, measurement });
        }
        for (const marker of sketch.midpoints) {
          const point = cad.sketchHitTest.markerPoint(sketch, marker);
          if (point) cad.sketchHitTest.drawMarker(context, toScreen(point), true);
        }
        cad.sketchConstraints.render(context, sketch, toScreen, this.hoverConstraint?.id);
      }
      this.annotationInteraction?.setHits(annotationHits);
      if (activeSketch && (this.hoverHandle || this.selectedPoint)) {
        const drawPointRing = (reference, selected) => {
          const point = cad.sketchConstraints.getPointCoordinate(activeSketch, reference);
          if (!point) return;
          const [x, y] = project(this.document.toWorld(activeSketch, point));
          context.save();
          context.beginPath();
          context.arc(x, y, selected ? 8 : 6.5, 0, Math.PI * 2);
          context.fillStyle = selected ? 'rgba(33, 133, 199, .20)' : 'rgba(68, 151, 224, .16)';
          context.fill();
          context.strokeStyle = selected ? '#126fa4' : '#4f89ff';
          context.lineWidth = selected ? 2.3 : 1.8;
          context.stroke();
          context.restore();
        };
        if (this.hoverHandle) drawPointRing(this.hoverHandle, false);
        if (this.selectedPoint) drawPointRing(this.selectedPoint, true);
      }
      if (activeSketch && this.inferenceGuide && this.tool) {
        const toScreen = point => project(this.document.toWorld(activeSketch, point));
        const [ax, ay] = toScreen(this.inferenceGuide.anchor);
        const [px, py] = toScreen(this.inferenceGuide.point);
        context.save();
        context.beginPath();
        context.setLineDash([5, 5]);
        context.moveTo(ax, ay);
        context.lineTo(px, py);
        context.strokeStyle = '#4a9fcb';
        context.lineWidth = 1.35;
        context.stroke();
        context.restore();
      }
      if (activeSketch && this.selectedEntityIds.size) {
        const toScreen = point => project(this.document.toWorld(activeSketch, point));
        for (const entity of activeSketch.entities) {
          if (this.selectedEntityIds.has(entity.id)) cad.sketchRender.drawEntity(context, entity, toScreen, '#f08c00', 3.5);
        }
      }
      if (activeSketch && (this.tool || this.constructionEnabled) && this.hoverBoundary) {
        const toScreen = point => project(this.document.toWorld(activeSketch, point));
        const target = this.hoverBoundary;
        if (target.entity.type === 'rectangle' && this.tool !== 'fix') {
          const edge = cad.sketchHitTest.segments(activeSketch).find(item =>
            item.entity.id === target.entity.id && item.edgeIndex === target.edgeIndex);
          if (edge) cad.canvas.line(context, toScreen(edge.start), toScreen(edge.end), '#4f89ff', 4);
        } else cad.sketchRender.drawEntity(context, target.entity, toScreen, '#4f89ff', 4);
      }
      const preview = this.currentShape();
      if (preview && activeSketch && geometry.valid(preview)) {
        const toScreen = point => project(this.document.toWorld(activeSketch, point));
        if (preview.type !== 'line') {
          const profile = cad.sketchProfiles.fromSketch({ id: 'preview', entities: [{ ...preview, id: 'preview' }] })[0];
          if (profile) cad.sketchRender.drawProfile(context, profile.points, toScreen, 'rgba(84, 174, 226, .12)');
        }
        context.save();
        context.setLineDash([5, 4]);
        cad.sketchRender.drawEntity(context, preview, toScreen, '#168fbe', 1.7);
        context.restore();
        if (preview.type === 'circle') {
          const pointer = this.pointer || this.start;
          const from = toScreen(this.start);
          const to = toScreen(pointer);
          context.save();
          context.setLineDash([]);
          cad.canvas.line(context, from, to, '#8797a2', 1.1);
          context.beginPath();
          context.arc(from[0], from[1], 2.5, 0, Math.PI * 2);
          context.fillStyle = '#fff';
          context.fill();
          context.strokeStyle = '#8797a2';
          context.lineWidth = 1;
          context.stroke();
          context.restore();
        }
      }
      if (this.tool === 'distance' && activeSketch) this.distance.render(context,
        point => project(this.document.toWorld(activeSketch, point)));
      if (this.tool === 'fillet' && activeSketch) {
        this.fillet.render(context, project);
      }
      if (this.tool === 'trim' && activeSketch) this.trim.render(context, project);
      if (this.tool === 'mirror' && activeSketch) {
        this.mirror.render(context, project);
      }
      if (['offset', 'circularPattern', 'rectangularPattern'].includes(this.tool) && activeSketch) {
        this.pattern?.render(context, project);
      }
      if (this.tool && this.hoverPoint && activeSketch) {
        const [x, y] = project(this.document.toWorld(activeSketch, this.hoverPoint));
        if (this.snapKind === 'midpoint') cad.sketchHitTest.drawMarker(context, [x, y]);
        else if (this.snapKind?.startsWith('inference-')) {
          context.save();
          context.fillStyle = '#fff';
          context.strokeStyle = '#168fbe';
          context.lineWidth = 1.5;
          context.fillRect(x - 4.5, y - 4.5, 9, 9);
          context.strokeRect(x - 4.5, y - 4.5, 9, 9);
          context.restore();
        }
        else {
          context.beginPath();
          context.arc(x, y, this.snapKind === 'origin' ? 5 : 3.5, 0, Math.PI * 2);
          context.fillStyle = '#fff';
          context.fill();
          context.strokeStyle = this.snapKind === 'origin' ? '#e16f53' : '#158aba';
          context.lineWidth = 1.5;
          context.stroke();
        }
      }
      if (this.tool === 'axis' && activeSketch) {
        const toScreen = point => project(this.document.toWorld(activeSketch, point));

        if (this.hoverAxisPoint) {
          const hpScreen = toScreen(this.hoverAxisPoint.point);
          context.save();
          context.beginPath();
          context.arc(hpScreen[0], hpScreen[1], 6, 0, Math.PI * 2);
          context.strokeStyle = '#00a0e6';
          context.lineWidth = 1.5;
          context.stroke();
          context.restore();
        }

        if (this.firstAxisPoint) {
          const p1Screen = toScreen(this.firstAxisPoint.point);

          context.save();
          context.beginPath();
          context.arc(p1Screen[0], p1Screen[1], 8, 0, Math.PI * 2);
          context.fillStyle = 'rgba(0, 160, 230, 0.22)';
          context.fill();
          context.strokeStyle = '#00a0e6';
          context.lineWidth = 2;
          context.stroke();

          context.beginPath();
          context.arc(p1Screen[0], p1Screen[1], 3, 0, Math.PI * 2);
          context.fillStyle = '#00a0e6';
          context.fill();
          context.restore();

          const targetPt = this.hoverAxisPoint?.point;
          if (targetPt && !(this.firstAxisPoint.isOrigin && this.hoverAxisPoint.isOrigin) &&
              !(this.firstAxisPoint.entity && this.hoverAxisPoint.entity && this.firstAxisPoint.entity.id === this.hoverAxisPoint.entity.id && this.firstAxisPoint.part === this.hoverAxisPoint.part)) {
            const p2Screen = toScreen(targetPt);
            const dir = cad.sketchConstraints.axisFor(this.firstAxisPoint.point, targetPt);
            context.save();
            context.setLineDash([4, 3]);
            context.strokeStyle = '#00a0e6';
            context.lineWidth = 1.6;
            context.beginPath();
            context.moveTo(p1Screen[0], p1Screen[1]);
            context.lineTo(p2Screen[0], p2Screen[1]);
            context.stroke();

            const mid = [(p1Screen[0] + p2Screen[0]) / 2, (p1Screen[1] + p2Screen[1]) / 2];
            cad.sketchConstraints.renderMarker(context, mid, dir === 'horizontal' ? 'H' : 'V', true);
            context.restore();
          }
        }
      }
    }
  }

  cad.SketchToolController = SketchToolController;
})(window.WebCAD = window.WebCAD || {});
