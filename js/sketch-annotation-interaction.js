(function (cad) {
  'use strict';

  class SketchAnnotationInteraction {
    constructor({ canvas, pane, sketchDocument, history, onChange }) {
      this.canvas = canvas;
      this.pane = pane;
      this.sketchDocument = sketchDocument;
      this.history = history;
      this.onChange = onChange;
      this.hits = [];
      this.drag = null;
      this.skipClick = false;
      this.editor = null;
      this.bindEvents();
    }

    setHits(hits) { this.hits = hits; }

    hitAt(event) {
      const bounds = this.canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      return [...this.hits].reverse().find(hit => Math.abs(x - hit.center[0]) <= hit.width / 2 + 4 &&
        Math.abs(y - hit.center[1]) <= hit.height / 2 + 4) || null;
    }

    placementOf(hit) {
      if (hit.measurement) return hit.measurement.placement || [0, 0];
      return hit.entity.dimensionPlacement?.[hit.key] || [0, 0];
    }

    setPlacement(hit, value) {
      if (hit.measurement) hit.measurement.placement = [...value];
      else {
        hit.entity.dimensionPlacement ||= {};
        hit.entity.dimensionPlacement[hit.key] = [...value];
      }
      this.onChange();
    }

    consumeClick(event) {
      if (!this.skipClick) return false;
      this.skipClick = false;
      event.preventDefault();
      return true;
    }

    geometrySnapshot(sketch) {
      return { entities: sketch.entities.map(entity => ({ id: entity.id,
        position: entity.position && [...entity.position], start: entity.start && [...entity.start],
        end: entity.end && [...entity.end], center: entity.center && [...entity.center],
        radius: entity.radius, dimensions: { ...entity.dimensions } })),
      equal: sketch.constraints.filter(item => item.type === 'equal').map(item =>
        ({ id: item.id, lastFirst: item.lastFirst, lastSecond: item.lastSecond })) };
    }

    restoreGeometry(sketch, snapshot) {
      for (const saved of snapshot.entities) {
        const entity = sketch.entities.find(item => item.id === saved.id);
        if (!entity) continue;
        for (const key of ['position', 'start', 'end', 'center']) if (saved[key]) entity[key] = [...saved[key]];
        if (saved.radius != null) entity.radius = saved.radius;
        entity.dimensions = { ...saved.dimensions };
      }
      for (const saved of snapshot.equal) {
        const constraint = sketch.constraints.find(item => item.id === saved.id);
        if (constraint) Object.assign(constraint, { lastFirst: saved.lastFirst, lastSecond: saved.lastSecond });
      }
      sketch.revision++;
      this.onChange();
    }

    openEditor(hit) {
      const measurement = hit.measurement;
      const entity = measurement?.kind === 'line-length' || measurement?.kind === 'rectangle-edge' ||
        measurement?.kind === 'circle-diameter'
        ? hit.sketch.entities.find(item => item.id === measurement.entityId)
        : hit.entity;
      const edgeIndex = measurement?.kind === 'rectangle-edge' ? measurement.edgeIndex
        : entity?.type === 'rectangle' && hit.key === 'width' ? 0
          : entity?.type === 'rectangle' && hit.key === 'height' ? 1 : null;
      const editingLine = entity?.type === 'line' && (measurement?.kind === 'line-length' || hit.key === 'length');
      const editingRectangle = entity?.type === 'rectangle' && edgeIndex !== null;
      const editingCircle = entity?.type === 'circle' && (measurement?.kind === 'circle-diameter' ||
        ['diameter', 'radius'].includes(hit.key));
      if (entity?.fixed || (!editingLine && !editingRectangle && !editingCircle)) return;
      const diameter = editingCircle && (measurement?.kind === 'circle-diameter' || hit.key === 'diameter');
      const axis = editingRectangle ? edgeIndex % 2 : null;
      const currentLength = editingLine
        ? Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1])
        : editingRectangle ? Math.abs(entity.end[axis] - entity.start[axis])
          : entity.radius * (diameter ? 2 : 1);
      const endAtLength = value => editingLine
        ? this.sketchDocument.lineEndAtLength(entity, value)
        : this.sketchDocument.rectangleEndAtEdgeLength(entity, edgeIndex, value);
      const setEnd = end => editingLine
        ? this.sketchDocument.setLineEnd(hit.sketch, entity.id, end)
        : this.sketchDocument.setRectangleEnd(hit.sketch, entity.id, end);
      this.editor?.remove();
      const input = document.createElement('input');
      input.className = 'annotation-editor';
      input.type = 'number';
      input.step = 'any';
      input.min = String(cad.sketchGrid.precision);
      input.setAttribute('aria-label', editingCircle ? `${diameter ? 'Circle diameter' : 'Circle radius'} in millimetres`
        : `${editingLine ? 'Line' : 'Rectangle edge'} length in millimetres`);
      input.value = String(Number(currentLength.toFixed(3)));
      input.style.left = `${hit.center[0]}px`;
      input.style.top = `${hit.center[1]}px`;
      this.pane.append(input);
      this.editor = input;
      input.focus();
      input.select();
      const close = () => {
        if (this.editor === input) this.editor = null;
        input.remove();
      };
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = Number(input.value);
        if (editingCircle) {
          const nextRadius = diameter ? value / 2 : value;
          if (!Number.isFinite(nextRadius) || nextRadius < cad.sketchGrid.precision ||
            !cad.sketchSnap.withinBounds({ ...entity, radius: nextRadius })) {
            input.classList.add('is-invalid');
            return;
          }
          const previousDims = entity.dimensions ? { ...entity.dimensions } : {};
          const applyRadius = (radius, dims) => {
            this.sketchDocument.setCircleRadius(hit.sketch, entity.id, radius);
            entity.dimensions = { ...dims };
            this.onChange();
          };
          const nextDims = { ...previousDims };
          if (diameter) nextDims.diameter = value;
          else nextDims.radius = nextRadius;

          const before = this.geometrySnapshot(hit.sketch);
          let after;
          this.history.execute({
            name: 'Edit circle size', kind: 'sketch',
            execute: () => { applyRadius(nextRadius, nextDims); cad.sketchConstraints.enforce(hit.sketch);
              after = this.geometrySnapshot(hit.sketch); this.onChange(); },
            undo: () => this.restoreGeometry(hit.sketch, before),
            redo: () => this.restoreGeometry(hit.sketch, after),
          });
          close();
          return;
        }
        const nextEnd = endAtLength(value);
        if (!nextEnd || !cad.sketchSnap.withinBounds({ ...entity, end: nextEnd })) {
          input.classList.add('is-invalid');
          return;
        }
        const previousDims = entity.dimensions ? { ...entity.dimensions } : {};
        const nextDims = { ...previousDims };
        if (editingLine) nextDims.length = value;
        else if (editingRectangle) {
          if (axis === 0) nextDims.width = value;
          else nextDims.height = value;
        }

        const applyEnd = (end, dims) => {
          setEnd(end);
          entity.dimensions = { ...dims };
          this.onChange();
        };

        const before = this.geometrySnapshot(hit.sketch);
        let after;
        this.history.execute({
          name: 'Edit sketch dimension', kind: 'sketch',
          execute: () => { applyEnd(nextEnd, nextDims); cad.sketchConstraints.enforce(hit.sketch);
            after = this.geometrySnapshot(hit.sketch); this.onChange(); },
          undo: () => this.restoreGeometry(hit.sketch, before),
          redo: () => this.restoreGeometry(hit.sketch, after),
        });
        close();
      });
      input.addEventListener('blur', close);
    }

    bindEvents() {
      this.canvas.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || this.editor) return;
        const hit = this.hitAt(event);
        if (!hit) return;
        this.drag = { hit, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
          before: [...this.placementOf(hit)], moved: false };
        this.canvas.setPointerCapture?.(event.pointerId);
      });
      this.canvas.addEventListener('pointermove', event => {
        if (!this.drag) {
          this.canvas.classList.toggle('over-annotation', Boolean(this.hitAt(event)));
          return;
        }
        if (event.pointerId !== this.drag.pointerId) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 2) this.drag.moved = true;
        if (this.drag.moved) this.setPlacement(this.drag.hit, [this.drag.before[0] + dx, this.drag.before[1] + dy]);
        event.preventDefault();
      });
      const finish = event => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        const { hit, before, moved } = this.drag;
        const after = [...this.placementOf(hit)];
        this.drag = null;
        this.skipClick = true;
        setTimeout(() => { this.skipClick = false; }, 0);
        if (moved && (before[0] !== after[0] || before[1] !== after[1])) {
          this.history.execute({
            name: 'Move dimension label', kind: 'sketch',
            execute: () => this.setPlacement(hit, after),
            undo: () => this.setPlacement(hit, before),
            redo: () => this.setPlacement(hit, after),
          });
        }
        event.preventDefault();
      };
      this.canvas.addEventListener('pointerup', finish);
      this.canvas.addEventListener('pointercancel', finish);
      this.canvas.addEventListener('dblclick', event => {
        const hit = this.hitAt(event);
        if (!hit) return;
        this.openEditor(hit);
        event.preventDefault();
      });
    }
  }

  cad.SketchAnnotationInteraction = SketchAnnotationInteraction;
})(window.WebCAD = window.WebCAD || {});
