(function (cad) {
  'use strict';

  class SketchMirror {
    constructor({ getActiveSketch, sketchDoc, document: docParam, camera, history, onChange, onFinished }) {
      this.getActiveSketch = getActiveSketch;
      this.sketchDoc = sketchDoc || docParam;
      this.document = this.sketchDoc;
      this.camera = camera;
      this.history = history;
      this.onChange = onChange;
      this.onFinished = onFinished;

      this.active = false;
      this.mode = 'objects'; // 'objects' | 'mirrorLine'
      this.selectedObjectIds = new Set();
      this.mirrorLine = null; // { start: [x,y], end: [x,y], isAxis: boolean, axisName: string }
      this.hoveredEntity = null;
      this.hoveredMirrorCandidate = null;

      // Palette DOM elements
      this.palette = document.querySelector('#mirrorPalette');
      this.selectObjectsBtn = document.querySelector('#mirrorSelectObjectsBtn');
      this.selectLineBtn = document.querySelector('#mirrorSelectLineBtn');
      this.objectsCountText = document.querySelector('#mirrorObjectsCountText');
      this.lineCountText = document.querySelector('#mirrorLineCountText');
      this.okBtn = document.querySelector('#mirrorOkBtn');
      this.cancelBtn = document.querySelector('#mirrorCancelBtn');
      this.chainInput = document.querySelector('#mirrorChain');

      this.initPalette();
    }

    initPalette() {
      if (!this.palette) return;

      this.selectObjectsBtn?.addEventListener('click', () => {
        this.setMode('objects');
      });

      this.selectLineBtn?.addEventListener('click', () => {
        this.setMode('mirrorLine');
      });

      this.okBtn?.addEventListener('click', () => {
        this.commit();
      });

      this.cancelBtn?.addEventListener('click', () => {
        this.close();
        if (this.onFinished) this.onFinished();
      });

    }

    open() {
      this.active = true;
      this.selectedObjectIds.clear();
      if (this.chainInput) this.chainInput.checked = false;
      this.mirrorLine = null;
      this.hoveredEntity = null;
      this.hoveredMirrorCandidate = null;

      if (this.palette) this.palette.hidden = false;

      this.setMode('objects');
      this.updateUI();
      this.onChange();
    }

    close() {
      if (!this.active && (!this.palette || this.palette.hidden)) return;
      this.active = false;
      this.selectedObjectIds.clear();
      this.mirrorLine = null;
      this.hoveredEntity = null;
      this.hoveredMirrorCandidate = null;

      if (this.palette) {
        this.palette.hidden = true;
      }

      this.onChange();
    }

    setMode(mode) {
      this.mode = mode;
      if (this.selectObjectsBtn) {
        this.selectObjectsBtn.classList.toggle('is-active', mode === 'objects');
      }
      if (this.selectLineBtn) {
        this.selectLineBtn.classList.toggle('is-active', mode === 'mirrorLine');
      }
      this.hoveredEntity = null;
      this.hoveredMirrorCandidate = null;
      this.onChange();
    }

    updateUI() {
      const count = this.selectedObjectIds.size;
      if (this.objectsCountText) {
        this.objectsCountText.textContent = count === 0 ? 'Select' : `${count} selected`;
      }
      if (this.lineCountText) {
        this.lineCountText.textContent = this.mirrorLine ? '1 selected' : 'Select';
      }
      if (this.okBtn) {
        this.okBtn.disabled = !(count > 0 && this.mirrorLine !== null);
      }
    }

    mirrorPoint(p, line) {
      const { start: a, end: b } = line;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return [...p];
      const nx = -dy / len;
      const ny = dx / len;
      const vx = p[0] - a[0];
      const vy = p[1] - a[1];
      const dist = vx * nx + vy * ny;
      return [p[0] - 2 * dist * nx, p[1] - 2 * dist * ny];
    }

    mirrorEntity(entity, line) {
      if (entity.type === 'point') {
        return { type: 'point', position: this.mirrorPoint(entity.position, line) };
      }
      if (entity.type === 'line') {
        return {
          type: 'line',
          start: this.mirrorPoint(entity.start, line),
          end: this.mirrorPoint(entity.end, line),
          construction: entity.construction,
          dimensions: entity.dimensions ? { ...entity.dimensions } : {}
        };
      }
      if (entity.type === 'circle') {
        return {
          type: 'circle',
          center: this.mirrorPoint(entity.center, line),
          radius: entity.radius,
          construction: entity.construction,
          dimensions: entity.dimensions ? { ...entity.dimensions } : {}
        };
      }
      if (entity.type === 'rectangle') {
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const c1 = this.mirrorPoint([x1, y1], line);
        const c2 = this.mirrorPoint([x2, y1], line);
        const c3 = this.mirrorPoint([x2, y2], line);
        const c4 = this.mirrorPoint([x1, y2], line);

        const dx = Math.abs(line.end[0] - line.start[0]);
        const dy = Math.abs(line.end[1] - line.start[1]);
        if (dx < 1e-4 || dy < 1e-4) {
          return {
            type: 'rectangle',
            start: [Math.min(c1[0], c3[0]), Math.min(c1[1], c3[1])],
            end: [Math.max(c1[0], c3[0]), Math.max(c1[1], c3[1])],
            construction: entity.construction,
            dimensions: entity.dimensions ? { ...entity.dimensions } : {}
          };
        } else {
          return [
            { type: 'line', start: c1, end: c2, construction: entity.construction },
            { type: 'line', start: c2, end: c3, construction: entity.construction },
            { type: 'line', start: c3, end: c4, construction: entity.construction },
            { type: 'line', start: c4, end: c1, construction: entity.construction }
          ];
        }
      }
      if (entity.type === 'arc') {
        const newCenter = this.mirrorPoint(entity.center, line);
        const newStart = this.mirrorPoint(entity.start, line);
        const newEnd = this.mirrorPoint(entity.end, line);
        const angStart = Math.atan2(newStart[1] - newCenter[1], newStart[0] - newCenter[0]);
        const angEnd = Math.atan2(newEnd[1] - newCenter[1], newEnd[0] - newCenter[0]);
        return {
          type: 'arc',
          center: newCenter,
          radius: entity.radius,
          start: newStart,
          end: newEnd,
          startAngle: angStart,
          endAngle: angEnd,
          counterClockwise: !entity.counterClockwise,
          construction: entity.construction,
          dimensions: entity.dimensions ? { ...entity.dimensions } : {}
        };
      }
      return null;
    }

    findEntityAt(sketch, toScreen, screenPoint) {
      const boundary = cad.sketchHitTest.boundaryAt(sketch, toScreen, screenPoint, 10);
      if (boundary?.entity) return boundary.entity;
      return sketch.entities.find(entity => entity.type === 'point' &&
        Math.hypot(toScreen(entity.position)[0] - screenPoint[0],
          toScreen(entity.position)[1] - screenPoint[1]) <= 10) || null;
    }

    findMirrorLineCandidate(screenX, screenY, bounds) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const toScreen = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);

      // Check sketch lines and rectangle edges
      const segHit = cad.sketchHitTest.segmentAt(sketch, toScreen, [screenX, screenY], 9);
      if (segHit) {
        return {
          start: [...segHit.start],
          end: [...segHit.end],
          isAxis: false,
          label: 'Sketch Line'
        };
      }

      // Check origin axes: X axis (y = 0) and Y axis (x = 0)
      const pO = toScreen([0, 0]);
      const pX = toScreen([100, 0]);
      const pY = toScreen([0, 100]);

      const distToLine = (p1, p2, p) => {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-4) return 999;
        return Math.abs((p[0] - p1[0]) * (-dy) + (p[1] - p1[1]) * dx) / len;
      };

      const distOriginX = distToLine(pO, pX, [screenX, screenY]);
      const distOriginY = distToLine(pO, pY, [screenX, screenY]);

      if (distOriginX < 10) {
        return {
          start: [0, 0],
          end: [100, 0],
          isAxis: true,
          axisName: 'X',
          label: 'X Axis (Origin)'
        };
      }
      if (distOriginY < 10) {
        return {
          start: [0, 0],
          end: [0, 100],
          isAxis: true,
          axisName: 'Y',
          label: 'Y Axis (Origin)'
        };
      }

      return null;
    }

    onPointerMove(event) {
      if (!this.active) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const bounds = event.target.getBoundingClientRect();
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;

      if (this.mode === 'objects') {
        const toScreen = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);
        this.hoveredEntity = this.findEntityAt(sketch, toScreen, [screenX, screenY]);
        this.onChange();
      } else if (this.mode === 'mirrorLine') {
        this.hoveredMirrorCandidate = this.findMirrorLineCandidate(screenX, screenY, bounds);
        this.onChange();
      }
    }

    onPointerDown(event) {
      if (!this.active || event.button !== 0) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const bounds = event.target.getBoundingClientRect();
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;

      if (this.mode === 'objects') {
        const toScreen = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);
        const entity = this.findEntityAt(sketch, toScreen, [screenX, screenY]);
        if (entity) {
          const ids = this.chainInput?.checked ? cad.sketchChain.connectedIds(sketch, entity.id) : new Set([entity.id]);
          if (this.selectedObjectIds.has(entity.id)) {
            for (const id of ids) this.selectedObjectIds.delete(id);
          } else {
            for (const id of ids) this.selectedObjectIds.add(id);
          }
          this.updateUI();
          this.onChange();
        }
      } else if (this.mode === 'mirrorLine') {
        const candidate = this.findMirrorLineCandidate(screenX, screenY, bounds);
        if (candidate) {
          this.mirrorLine = candidate;
          this.hoveredMirrorCandidate = null;
          this.updateUI();
          this.onChange();
        }
      }
    }

    commit() {
      const sketch = this.getActiveSketch();
      if (!sketch || this.selectedObjectIds.size === 0 || !this.mirrorLine) return;

      const entitiesToMirror = sketch.entities.filter(e => this.selectedObjectIds.has(e.id));
      const createdEntities = [];

      for (const entity of entitiesToMirror) {
        const mirrored = this.mirrorEntity(entity, this.mirrorLine);
        if (Array.isArray(mirrored)) {
          for (const item of mirrored) {
            createdEntities.push(this.document.makeEntity({ ...item, fixed: entity.fixed }, item.dimensions));
          }
        } else if (mirrored) {
          createdEntities.push(this.document.makeEntity({ ...mirrored, fixed: entity.fixed }, mirrored.dimensions));
        }
      }

      if (createdEntities.length === 0) return;

      const createdIds = createdEntities.map(e => e.id);

      this.history.execute({
        name: 'Sketch mirror', kind: 'sketch',
        execute: () => {
          for (const entity of createdEntities) {
            this.document.insertEntity(sketch, entity);
          }
          this.onChange();
        },
        undo: () => {
          for (const id of createdIds) {
            this.document.removeEntity(sketch, id);
          }
          this.onChange();
        },
        redo: () => {
          for (const entity of createdEntities) {
            this.document.insertEntity(sketch, entity);
          }
          this.onChange();
        }
      });

      this.close();
      if (this.onFinished) this.onFinished();
    }

    render(context, project) {
      if (!this.active) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const toScreen = pt => project(this.document.toWorld(sketch, pt));

      // 1. Highlight hovered entity in objects mode
      if (this.mode === 'objects' && this.hoveredEntity && !this.selectedObjectIds.has(this.hoveredEntity.id)) {
        context.save();
        cad.sketchRender.drawEntity(context, this.hoveredEntity, toScreen, '#38bdf8', 3.5);
        context.restore();
      }

      // 2. Highlight all selected objects
      for (const entity of sketch.entities) {
        if (this.selectedObjectIds.has(entity.id)) {
          context.save();
          cad.sketchRender.drawEntity(context, entity, toScreen, '#1f96d6', 3.5);
          context.restore();
        }
      }

      // 3. Highlight hovered mirror line candidate
      if (this.mode === 'mirrorLine' && this.hoveredMirrorCandidate) {
        const cand = this.hoveredMirrorCandidate;
        context.save();
        context.setLineDash([6, 4]);
        cad.canvas.line(context, toScreen(cand.start), toScreen(cand.end), '#f59e0b', 2.8);
        context.restore();
      }

      // 4. Render chosen mirror line with symmetry centerline style
      if (this.mirrorLine) {
        const ml = this.mirrorLine;
        context.save();
        context.setLineDash([8, 4, 2, 4]);
        context.strokeStyle = '#f59e0b';
        context.lineWidth = 2.2;

        // Extend mirror line across visible range
        const dx = ml.end[0] - ml.start[0];
        const dy = ml.end[1] - ml.start[1];
        const len = Math.hypot(dx, dy);
        if (len > 1e-4) {
          const ux = dx / len;
          const uy = dy / len;
          const p1 = [ml.start[0] - ux * 500, ml.start[1] - uy * 500];
          const p2 = [ml.end[0] + ux * 500, ml.end[1] + uy * 500];
          cad.canvas.line(context, toScreen(p1), toScreen(p2), '#f59e0b', 2.2);

          // Draw CAD symmetry mark at midpoint
          const mid = [(ml.start[0] + ml.end[0]) / 2, (ml.start[1] + ml.end[1]) / 2];
          const [smx, smy] = toScreen(mid);
          const nx = -uy;
          const ny = ux;
          const [nx1, ny1] = toScreen([mid[0] + nx * 5, mid[1] + ny * 5]);
          const [nx2, ny2] = toScreen([mid[0] - nx * 5, mid[1] - ny * 5]);
          cad.canvas.line(context, [nx1, ny1], [nx2, ny2], '#f59e0b', 1.8);
        }
        context.restore();
      }

      // 5. Ghost live preview of mirrored geometry
      if (this.mirrorLine && this.selectedObjectIds.size > 0) {
        context.save();
        context.setLineDash([5, 4]);
        for (const entity of sketch.entities) {
          if (this.selectedObjectIds.has(entity.id)) {
            const mirrored = this.mirrorEntity(entity, this.mirrorLine);
            if (Array.isArray(mirrored)) {
              for (const m of mirrored) {
                cad.sketchRender.drawEntity(context, m, toScreen, '#0ea5e9', 2.2);
              }
            } else if (mirrored) {
              cad.sketchRender.drawEntity(context, mirrored, toScreen, '#0ea5e9', 2.2);
            }
          }
        }
        context.restore();
      }
    }
  }

  cad.SketchMirror = SketchMirror;
})(window.WebCAD = window.WebCAD || {});
