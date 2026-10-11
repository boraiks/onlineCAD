(function (cad) {
  'use strict';

  const distanceToSegment = (point, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    return { distance: Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy), t };
  };

  class SolidBevelController {
    constructor({ canvas, panel, camera, extrudeController, history, onChange, onBodiesChange, onStatus, onModeChange, onError }) {
      Object.assign(this, { canvas, panel, camera, extrudeController, history,
        onChange, onBodiesChange, onStatus, onModeChange, onError });
      this.title = panel.querySelector('#solidBevelTitle');
      this.help = panel.querySelector('#solidBevelHelp');
      this.edgeOutput = panel.querySelector('#solidBevelEdge');
      this.valueLabel = panel.querySelector('#solidBevelValueLabel');
      this.valueInput = panel.querySelector('#solidBevelValue');
      this.ok = panel.querySelector('#solidBevelOk');
      this.active = false;
      this.mode = null;
      this.selected = null;
      this.hovered = null;
      this.preview = null;
      this.edgeCache = new WeakMap();
      this.generation = 0;
      this.previewTimer = null;
      this.drag = null;
      this.suppressClick = false;
      this.bind();
    }

    async open(mode) {
      if (!['fillet', 'chamfer'].includes(mode)) return false;
      if (this.active && this.mode === mode) { this.close(); return true; }
      if (!this.extrudeController.bodies.some(body => body.visible !== false)) {
        this.onStatus(`${mode.toUpperCase()} · Extrude a body first`);
        return false;
      }
      this.generation++;
      this.active = true;
      this.mode = mode;
      this.selected = null;
      this.hovered = null;
      this.preview = null;
      this.drag = null;
      this.ok.disabled = true;
      this.title.textContent = mode.toUpperCase();
      this.valueLabel.textContent = mode === 'fillet' ? 'Radius' : 'Distance';
      this.valueInput.setAttribute('aria-label', `${this.valueLabel.textContent} in millimetres`);
      this.edgeOutput.textContent = 'Select an edge';
      this.help.textContent = 'Preparing 3D edges…';
      this.panel.hidden = false;
      this.canvas.classList.add('is-solid-bevel');
      this.onModeChange?.(mode);
      this.onStatus(`${mode.toUpperCase()} · Select a body edge`);
      this.onChange();
      const generation = this.generation;
      try {
        await cad.solidKernel.load();
        if (!this.active || generation !== this.generation) return true;
        for (const body of this.extrudeController.bodies) {
          if (body.visible !== false && !body.mesh) body.mesh = cad.solidKernel.meshBody(body);
        }
        this.help.textContent = 'Select one edge, then set its size.';
        this.onChange();
        return true;
      } catch (error) {
        if (generation === this.generation) {
          this.onError?.({ code: 'CAD-C008', title: 'Compute error',
            reason: `Could not prepare 3D edges: ${error?.message || 'geometry engine unavailable'}` });
          this.close();
        }
        return false;
      }
    }

    close() {
      if (!this.active) return;
      this.generation++;
      clearTimeout(this.previewTimer);
      this.active = false;
      this.mode = null;
      this.selected = null;
      this.hovered = null;
      this.preview = null;
      this.drag = null;
      this.panel.hidden = true;
      this.canvas.classList.remove('is-solid-bevel');
      this.onModeChange?.(null);
      this.onStatus('3D VIEW');
      this.onChange();
    }

    edges(body) {
      let cached = this.edgeCache.get(body);
      if (!cached || cached.mesh !== body.mesh) {
        cached = { mesh: body.mesh, edges: cad.bodyRenderer.selectableEdges(body) };
        this.edgeCache.set(body, cached);
      }
      return cached.edges;
    }

    hitTest(event) {
      if (!this.active || !cad.solidKernel.ready()) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const point = [event.clientX - bounds.left, event.clientY - bounds.top];
      let best = null;
      for (const body of this.extrudeController.bodies) {
        if (body.visible === false || !body.mesh) continue;
        for (const edge of this.edges(body)) {
          if (!edge.normals.some(normal => cad.math.dot(normal, this.camera.depth) > 1e-6)) continue;
          const a = this.camera.project(edge.a, bounds.width, bounds.height);
          const b = this.camera.project(edge.b, bounds.width, bounds.height);
          const hit = distanceToSegment(point, a, b);
          if (hit.distance > 8) continue;
          const depth = cad.math.dot(edge.a.map((value, axis) =>
            value + hit.t * (edge.b[axis] - value)), this.camera.depth);
          if (!best || hit.distance < best.distance - 0.75 ||
            (Math.abs(hit.distance - best.distance) <= 0.75 && depth > best.depth))
            best = { edge, distance: hit.distance, depth };
        }
      }
      return best?.edge || null;
    }

    handleGeometry() {
      if (!this.active || !this.selected) return null;
      const edge = this.selected;
      const midpoint = edge.a.map((value, axis) => (value + edge.b[axis]) / 2);
      let axis;
      if (edge.ring) {
        let center = edge.ring.center3D;
        if (!center && edge.ring.center && edge.body.plane && cad.planes?.grid?.[edge.body.plane]) {
          const { u, v } = cad.planes.grid[edge.body.plane];
          const origin = edge.body.origin || cad.planes.grid[edge.body.plane].origin || [0, 0, 0];
          center = u.map((value, index) => origin[index] + value * edge.ring.center[0] +
            v[index] * edge.ring.center[1] + edge.body.normal[index] * edge.ring.cap);
        }
        center = center || midpoint;
        const radial = midpoint.map((value, index) => value - center[index]);
        const radialLength = Math.hypot(...radial) || 1;
        const inwardNormal = edge.ring.normal3D
          ? edge.ring.normal3D.map(v => -v)
          : (edge.ring.cap !== undefined && edge.body.normal ? (Math.abs(edge.ring.cap - edge.body.end) < 0.001 ? edge.body.normal.map(v => -v) : edge.body.normal) : [0, 0, -1]);
        const sign = edge.convex === false ? -1 : 1;
        axis = radial.map((value, index) => sign * (-value / radialLength + inwardNormal[index]));
      } else {
        const sign = edge.convex ? -1 : 1;
        axis = edge.normals[0].map((value, index) =>
          sign * (value + edge.normals[1][index]));
      }
      const length = Math.hypot(...axis);
      if (length < 1e-6) return null;
      axis = axis.map(value => value / length);
      const bounds = this.canvas.getBoundingClientRect();
      const base = this.camera.project(midpoint, bounds.width, bounds.height);
      const step = this.camera.project(midpoint.map((value, index) => value + axis[index]),
        bounds.width, bounds.height);
      const delta = [step[0] - base[0], step[1] - base[1]];
      const pixelsPerMm = Math.hypot(...delta);
      if (pixelsPerMm < 0.5) return null;
      const amount = Math.max(0.001, Number(this.valueInput.value) || 0.001);
      const scale = 1.3;
      const tip = [base[0] + delta[0] * amount * scale,
        base[1] + delta[1] * amount * scale];
      return { base, tip, unit: delta.map(value => value / pixelsPerMm), pixelsPerMm, scale };
    }

    updatePreview() {
      if (!this.active) return;
      this.preview = null;
      const amount = Number(this.valueInput.value);
      if (this.selected && Number.isFinite(amount) && amount >= 0.001) {
        try {
          this.preview = cad.solidKernel.bevelBody(this.selected.body, this.selected, this.mode, amount);
        } catch (error) {
          this.onError?.({ code: 'CAD-C009', title: 'Compute error',
            reason: `3D ${this.mode} failed: ${error?.message || 'invalid edge size'}` });
        }
      }
      this.ok.disabled = !this.preview;
      if (this.selected) this.help.textContent = this.preview
        ? 'Preview ready. Click OK to change the body.'
        : 'This size cannot produce a valid body. Try a smaller value.';
      this.onChange();
    }

    displayBodies() {
      if (!this.active || !this.preview || !this.selected) return this.extrudeController.bodies;
      return this.extrudeController.bodies.map(body => body === this.selected.body ? this.preview : body);
    }

    commit() {
      if (!this.active || !this.preview || !this.selected) return false;
      const before = [...this.extrudeController.bodies];
      const after = before.map(body => body === this.selected.body ? this.preview : body);
      const apply = bodies => {
        this.extrudeController.bodies = bodies;
        this.onBodiesChange?.();
        this.onChange();
      };
      this.history.execute({ name: this.mode === 'fillet' ? 'Fillet' : 'Chamfer', kind: 'solid',
        timelineTool: this.mode === 'fillet' ? 'solidFilletBtn' : 'solidChamferBtn',
        execute: () => apply(after), undo: () => apply(before), redo: () => apply(after) });
      this.close();
      return true;
    }

    renderOverlay(context, project) {
      if (!this.active) return;
      const draw = (edge, color, width, dashed = false) => {
        if (!edge) return;
        context.beginPath();
        if (edge.ring) {
          if (edge.ring.points3D?.length) {
            edge.ring.points3D.forEach((point, index) => {
              const screen = project(point);
              if (index) context.lineTo(screen[0], screen[1]);
              else context.moveTo(screen[0], screen[1]);
            });
            context.closePath();
          } else if (edge.body.points?.length && edge.body.plane && cad.planes?.grid?.[edge.body.plane]) {
            const { u, v } = cad.planes.grid[edge.body.plane];
            edge.body.points.forEach((point, index) => {
              const origin = edge.body.origin || cad.planes.grid[edge.body.plane].origin || [0, 0, 0];
              const world = u.map((value, axis) => origin[axis] + value * point[0] +
                v[axis] * point[1] + edge.body.normal[axis] * edge.ring.cap);
              const screen = project(world);
              if (index) context.lineTo(screen[0], screen[1]);
              else context.moveTo(screen[0], screen[1]);
            });
            context.closePath();
          }
        } else {
          const a = project(edge.a), b = project(edge.b);
          context.moveTo(a[0], a[1]);
          context.lineTo(b[0], b[1]);
        }
        context.strokeStyle = color;
        context.lineWidth = width;
        context.lineCap = 'round';
        context.setLineDash(dashed ? [4, 4] : []);
        context.stroke();
      };
      context.save();
      if (this.hovered !== this.selected) draw(this.hovered, '#68b8dc', 3.5);
      draw(this.selected, this.preview ? '#5b9dbd' : '#0879b5', this.preview ? 1.5 : 3.5, Boolean(this.preview));
      const handle = this.handleGeometry();
      if (handle) {
        const { base, tip, unit } = handle;
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(base[0], base[1]);
        context.lineTo(tip[0], tip[1]);
        context.strokeStyle = '#1a80b3';
        context.lineWidth = 1.5;
        context.stroke();
        context.beginPath();
        context.moveTo(tip[0] + unit[0] * 7, tip[1] + unit[1] * 7);
        context.lineTo(tip[0] - unit[0] * 5 - unit[1] * 5,
          tip[1] - unit[1] * 5 + unit[0] * 5);
        context.lineTo(tip[0] - unit[0] * 5 + unit[1] * 5,
          tip[1] - unit[1] * 5 - unit[0] * 5);
        context.closePath();
        context.fillStyle = '#1887bd';
        context.fill();
        const amount = Number(this.valueInput.value);
        const label = `${this.mode === 'fillet' ? 'R' : ''}${amount.toFixed(3)} mm`;
        context.font = '11px Arial, sans-serif';
        const width = context.measureText(label).width + 12;
        const x = tip[0] + 12, y = tip[1] + 12;
        context.fillStyle = '#f8fcff';
        context.strokeStyle = '#a7c8d8';
        context.lineWidth = 1;
        context.fillRect(x, y, width, 20);
        context.strokeRect(x, y, width, 20);
        context.fillStyle = '#235b78';
        context.fillText(label, x + 6, y + 14);
      }
      context.restore();
    }

    bind() {
      this.canvas.addEventListener('pointerdown', event => {
        if (!this.active || event.button !== 0) return;
        const handle = this.handleGeometry();
        if (!handle) return;
        const bounds = this.canvas.getBoundingClientRect();
        const point = [event.clientX - bounds.left, event.clientY - bounds.top];
        if (Math.hypot(point[0] - handle.tip[0], point[1] - handle.tip[1]) > 13) return;
        this.drag = handle;
        this.suppressClick = false;
        try { this.canvas.setPointerCapture?.(event.pointerId); }
        catch { /* Synthetic or cancelled pointers cannot be captured. */ }
        event.preventDefault();
      });
      this.canvas.addEventListener('pointermove', event => {
        if (!this.active) return;
        if (this.drag) {
          const bounds = this.canvas.getBoundingClientRect();
          const point = [event.clientX - bounds.left, event.clientY - bounds.top];
          const delta = [point[0] - this.drag.base[0], point[1] - this.drag.base[1]];
          const amount = Math.max(0.001, (delta[0] * this.drag.unit[0] +
            delta[1] * this.drag.unit[1]) / (this.drag.pixelsPerMm * this.drag.scale));
          const rounded = (Math.round(amount * 1000) / 1000).toFixed(3);
          if (this.valueInput.value !== rounded) {
            this.valueInput.value = rounded;
            this.updatePreview();
          }
          this.suppressClick = true;
          return;
        }
        if (event.buttons) return;
        const edge = this.hitTest(event);
        if (edge === this.hovered) return;
        this.hovered = edge;
        this.onChange();
      });
      this.canvas.addEventListener('pointerup', event => {
        if (!this.drag) return;
        this.drag = null;
        if (this.canvas.hasPointerCapture?.(event.pointerId))
          this.canvas.releasePointerCapture(event.pointerId);
        setTimeout(() => { this.suppressClick = false; }, 0);
      });
      this.canvas.addEventListener('pointerleave', () => {
        if (!this.active || !this.hovered) return;
        this.hovered = null;
        this.onChange();
      });
      this.canvas.addEventListener('click', event => {
        if (!this.active || event.button !== 0) return;
        if (this.suppressClick) { this.suppressClick = false; return; }
        const edge = this.hitTest(event);
        if (!edge) return;
        clearTimeout(this.previewTimer);
        this.selected = edge;
        this.edgeOutput.textContent = edge.ring
          ? `${edge.body.name || 'Body'} · circular rim`
          : `${edge.body.name || 'Body'} · ${edge.length.toFixed(3)} mm`;
        this.updatePreview();
      });
      this.valueInput.addEventListener('input', () => {
        this.ok.disabled = true;
        clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => this.updatePreview(), 80);
      });
      this.panel.querySelector('#solidBevelCancel').addEventListener('click', () => this.close());
      this.ok.addEventListener('click', () => this.commit());
      document.addEventListener('keydown', event => {
        if (!this.active) return;
        if (event.key === 'Escape') { event.preventDefault(); this.close(); }
        if (event.key === 'Enter' && !this.ok.disabled) { event.preventDefault(); this.commit(); }
      });
    }
  }

  cad.SolidBevelController = SolidBevelController;
})(window.WebCAD = window.WebCAD || {});
