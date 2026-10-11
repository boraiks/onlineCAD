(function (cad) {
  'use strict';

  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const colors = ['#d75858', '#3d9a69', '#367fca'];
  const add = (a, b) => a.map((value, i) => value + b[i]);
  const subtract = (a, b) => a.map((value, i) => value - b[i]);
  const scale = (a, amount) => a.map(value => value * amount);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function rotate(point, degrees) {
    const [rx, ry, rz] = degrees.map(value => value * Math.PI / 180);
    let [x, y, z] = point;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    return [x, y, z];
  }

  function meshCenter(body) {
    const vertices = body.mesh?.vertices || [];
    if (!vertices.length) return [0, 0, 0];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
    return min.map((value, axis) => (value + max[axis]) / 2);
  }

  function transformBody(body, translation, rotation = [0, 0, 0], pivot = meshCenter(body)) {
    if (!body.mesh) throw new Error('Body mesh is required for Move/Rotate');
    const vertices = body.mesh.vertices;
    const moved = new Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      const point = add(add(rotate(subtract(vertices.slice(i, i + 3), pivot), rotation), pivot), translation);
      moved[i] = point[0]; moved[i + 1] = point[1]; moved[i + 2] = point[2];
    }
    const display = body.renderMesh?.vertices;
    const movedDisplay = display ? new Array(display.length) : null;
    if (display) for (let i = 0; i < display.length; i += 3) {
      const point = add(add(rotate(subtract(display.slice(i, i + 3), pivot), rotation), pivot), translation);
      movedDisplay[i] = point[0]; movedDisplay[i + 1] = point[1]; movedDisplay[i + 2] = point[2];
    }
    return { ...body, cells: null, meshSource: body.meshSource === 'solid' ? 'solid' : 'mesh', normal: rotate(body.normal || [0, 0, 1], rotation),
      mesh: { vertices: moved, triangles: body.mesh.triangles },
      renderMesh: movedDisplay ? { vertices: movedDisplay, triangles: body.renderMesh.triangles } : null };
  }

  function containsTriangle(point, a, b, c) {
    const cross = (u, v, p) => (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]);
    const first = cross(a, b, point), second = cross(b, c, point), third = cross(c, a, point);
    return !(first < -0.5 || second < -0.5 || third < -0.5) ||
      !(first > 0.5 || second > 0.5 || third > 0.5);
  }

  class BodyMoveController {
    constructor({ canvas, panel, camera, extrudeController, history, onChange, onBodiesChange, onStatus, onModeChange, onError }) {
      cad.bodyMoveController = this;
      Object.assign(this, { canvas, panel, camera, extrudeController, history,
        onChange, onBodiesChange, onStatus, onModeChange, onError });
      this.help = panel.querySelector('#bodyMoveHelp');
      this.selection = panel.querySelector('#bodyMoveSelection');
      this.pivotButton = panel.querySelector('#bodyMovePivot');
      this.originButton = panel.querySelector('#bodyMoveOrigin');
      this.targetButton = panel.querySelector('#bodyMoveTarget');
      this.copyInput = panel.querySelector('#bodyMoveCopy');
      this.ok = panel.querySelector('#bodyMoveOk');
      this.translationInputs = ['X', 'Y', 'Z'].map(axis => panel.querySelector(`#bodyMove${axis}`));
      this.rotationInputs = ['X', 'Y', 'Z'].map(axis => panel.querySelector(`#bodyRotate${axis}`));
      this.active = false;
      this.mode = 'free';
      this.selected = null;
      this.phase = 'body';
      this.pivot = null;
      this.origin = null;
      this.target = null;
      this.preview = null;
      this.drag = null;
      this.hoveredRing = null;
      this.suppressClick = false;
      this.generation = 0;
      this.bind();
    }

    async open(initialBody = null) {
      if (this.active) { this.close(); return true; }
      if (!this.extrudeController.bodies.some(body => body.visible !== false)) {
        this.onStatus('MOVE/ROTATE · Extrude a body first');
        return false;
      }
      this.active = true;
      const generation = ++this.generation;
      this.mode = 'free';
      this.phase = 'body';
      this.selected = this.pivot = this.origin = this.target = this.preview = null;
      this.copyInput.checked = false;
      [...this.translationInputs, ...this.rotationInputs].forEach(input => { input.value = '0'; });
      this.panel.hidden = false;
      this.canvas.classList.add('is-body-move');
      const visibleBodies = this.extrudeController.bodies.filter(body => body.visible !== false);
      const autoBody = (initialBody && initialBody.visible !== false && this.extrudeController.bodies.includes(initialBody))
        ? initialBody
        : (visibleBodies.length === 1 ? visibleBodies[0] : null);
      if (autoBody) {
        this.setBody(autoBody);
      }
      this.sync();
      try {
        await cad.solidKernel.load();
        if (!this.active || generation !== this.generation) return true;
        for (const body of this.extrudeController.bodies) {
          if (body.visible !== false && !body.mesh) body.mesh = cad.solidKernel.meshBody(body);
        }
        if (this.selected && !this.pivot) this.pivot = meshCenter(this.selected);
        this.sync();
        return true;
      } catch (error) {
        if (generation === this.generation) {
          this.onError?.({ code: 'CAD-C009', title: 'Compute error', reason: `Move/Rotate could not prepare the body mesh: ${error.message}` });
          this.close();
        }
        return false;
      }
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.generation++;
      this.selected = this.preview = this.drag = null;
      this.hoveredRing = null;
      this.canvas.style.cursor = '';
      this.panel.hidden = true;
      this.canvas.classList.remove('is-body-move', 'is-body-move-dragging');
      this.onModeChange?.(false);
      this.onStatus('3D VIEW');
      this.onChange();
    }

    setMode(mode) {
      if (!this.active || !['free', 'points'].includes(mode)) return;
      this.mode = mode;
      this.phase = this.selected ? mode === 'points' ? 'origin' : 'body' : 'body';
      this.origin = this.target = this.preview = null;
      this.sync();
    }

    setBody(body) {
      this.selected = body;
      this.pivot = meshCenter(body);
      this.origin = this.target = this.preview = null;
      this.phase = this.mode === 'points' ? 'origin' : 'body';
      [...this.translationInputs, ...this.rotationInputs].forEach(input => { input.value = '0'; });
      this.sync();
    }

    vector(inputs) { return inputs.map(input => number(input.value)); }

    updatePreview() {
      if (!this.selected?.mesh) { this.preview = null; this.sync(); return; }
      const translation = this.mode === 'free' ? this.vector(this.translationInputs)
        : this.origin && this.target ? subtract(this.target, this.origin) : [0, 0, 0];
      const rotation = this.mode === 'free' ? this.vector(this.rotationInputs) : [0, 0, 0];
      const changed = [...translation, ...rotation].some(value => Math.abs(value) > 1e-9);
      this.preview = changed ? transformBody(this.selected, translation, rotation, this.pivot) : null;
      this.sync();
    }

    sync() {
      if (!this.active) return;
      this.panel.querySelector('#bodyMoveFreeFields').hidden = this.mode !== 'free';
      this.panel.querySelector('#bodyMovePointFields').hidden = this.mode !== 'points';
      for (const [id, mode] of [['#bodyMoveFree', 'free'], ['#bodyMovePoints', 'points']]) {
        const button = this.panel.querySelector(id);
        button.classList.toggle('is-active', this.mode === mode);
        button.setAttribute('aria-pressed', String(this.mode === mode));
      }
      this.selection.textContent = this.selected?.name || 'Select body';
      this.selection.classList.toggle('is-active', this.phase === 'body');
      this.pivotButton.textContent = this.phase === 'pivot' ? 'Choose point…' :
        this.pivot && this.selected && this.pivot.some((value, i) => Math.abs(value - meshCenter(this.selected)[i]) > 1e-6) ? 'Custom point' : 'Body center';
      this.pivotButton.classList.toggle('is-active', this.phase === 'pivot');
      this.originButton.textContent = this.origin ? this.origin.map(v => v.toFixed(2)).join(', ') : 'Select';
      this.targetButton.textContent = this.target ? this.target.map(v => v.toFixed(2)).join(', ') : 'Select';
      this.originButton.classList.toggle('is-active', this.phase === 'origin');
      this.targetButton.classList.toggle('is-active', this.phase === 'target');
      this.ok.disabled = !this.preview || this.mode === 'points' && !(this.origin && this.target);
      this.help.textContent = !this.selected ? 'Click a finished body to select it.'
        : this.phase === 'pivot' ? 'Click a vertex to place the rotation pivot.'
          : this.phase === 'origin' ? 'Click a point on the selected body.'
            : this.phase === 'target' ? 'Click a body point, or a location in the view.'
              : this.mode === 'free' ? 'Drag the body or an axis arrow; enter rotation angles below.'
                : 'Choose origin and target points.';
      this.onStatus(`MOVE/ROTATE · ${this.help.textContent}`);
      this.onModeChange?.(true);
      this.onChange();
    }

    screen(event) {
      const bounds = this.canvas?.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
      const clientX = event?.clientX ?? 0;
      const clientY = event?.clientY ?? 0;
      return { bounds, point: [clientX - (bounds.left || 0), clientY - (bounds.top || 0)] };
    }

    bodyAt(event) {
      const { bounds, point } = this.screen(event);
      let best = null;
      for (const body of this.extrudeController.bodies) {
        if (body.visible === false) continue;
        const targetMesh = body.renderMesh || body.mesh;
        if (!targetMesh?.vertices?.length) continue;
        const { vertices, triangles } = targetMesh;
        const projected = [];
        for (let i = 0; i < vertices.length; i += 3)
          projected.push(this.camera.project(vertices.slice(i, i + 3), bounds.width, bounds.height));
        for (let i = 0; i < triangles.length; i += 3) {
          const ids = triangles.slice(i, i + 3);
          if (!containsTriangle(point, ...ids.map(id => projected[id]))) continue;
          const depth = ids.reduce((sum, id) => sum + dot(vertices.slice(id * 3, id * 3 + 3), this.camera.depth), 0) / 3;
          if (!best || depth > best.depth) best = { body, depth };
        }
      }
      return best?.body || null;
    }

    pointAt(event, onlySelected = false) {
      const { bounds, point } = this.screen(event);
      const bodies = onlySelected ? [this.selected] : this.extrudeController.bodies;
      let best = null;
      for (const body of bodies) {
        if (!body?.mesh || body.visible === false) continue;
        const vertices = body.mesh.vertices;
        for (let i = 0; i < vertices.length; i += 3) {
          const world = vertices.slice(i, i + 3);
          const screen = this.camera.project(world, bounds.width, bounds.height);
          const distance = Math.hypot(point[0] - screen[0], point[1] - screen[1]);
          if (distance > 12) continue;
          const depth = dot(world, this.camera.depth);
          if (!best || distance < best.distance - 0.5 ||
            Math.abs(distance - best.distance) <= 0.5 && depth > best.depth)
            best = { world, distance, depth };
        }
      }
      return best?.world || null;
    }

    targetAt(event) {
      const snapped = this.pointAt(event);
      if (snapped) return snapped;
      if (!this.origin) return null;
      const { bounds, point } = this.screen(event);
      const start = this.camera.project(this.origin, bounds.width, bounds.height);
      const unit = this.camera.unit(bounds.width, bounds.height);
      return add(this.origin, add(scale(this.camera.right, (point[0] - start[0]) / unit),
        scale(this.camera.up, (start[1] - point[1]) / unit)));
    }

    gizmo() {
      if (!this.selected || this.mode !== 'free' || this.phase !== 'body') return null;
      const { bounds } = this.screen({ clientX: 0, clientY: 0 });
      const origin = add(this.pivot, this.vector(this.translationInputs));
      const base = this.camera.project(origin, bounds.width, bounds.height);
      const length = 45 / this.camera.unit(bounds.width, bounds.height);
      return axes.map((axis, index) => ({ index, base,
        tip: this.camera.project(add(origin, scale(axis, length)), bounds.width, bounds.height) }))
        .filter(arrow => Math.hypot(arrow.tip[0] - base[0], arrow.tip[1] - base[1]) >= 8);
    }

    arrowAt(event) {
      const { point } = this.screen(event);
      return this.gizmo()?.find(arrow => Math.hypot(point[0] - arrow.tip[0], point[1] - arrow.tip[1]) < 12) || null;
    }

    rotationRings() {
      if (!this.selected || this.mode !== 'free' || this.phase !== 'body') return [];
      const { bounds } = this.screen({ clientX: 0, clientY: 0 });
      const origin = add(this.pivot, this.vector(this.translationInputs));
      const base = this.camera.project(origin, bounds.width, bounds.height);
      const unit = this.camera.unit(bounds.width, bounds.height);
      const ringRadius = 55 / Math.max(1e-4, unit);
      const segments = 36;

      const planeBases = [
        [[0, 1, 0], [0, 0, 1]], // X-axis ring (YZ plane)
        [[1, 0, 0], [0, 0, 1]], // Y-axis ring (XZ plane)
        [[1, 0, 0], [0, 1, 0]], // Z-axis ring (XY plane)
      ];

      return axes.map((axis, index) => {
        const [u, v] = planeBases[index];
        const points2d = [];
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const world = add(origin, add(scale(u, ringRadius * Math.cos(theta)), scale(v, ringRadius * Math.sin(theta))));
          points2d.push(this.camera.project(world, bounds.width, bounds.height));
        }
        return {
          index,
          axis,
          base,
          points2d,
          color: colors[index],
        };
      });
    }

    ringAt(event) {
      const { point } = this.screen(event);
      const rings = this.rotationRings();
      let best = null;
      for (const ring of rings) {
        let minDist = Infinity;
        for (let i = 0; i < ring.points2d.length - 1; i++) {
          const p1 = ring.points2d[i];
          const p2 = ring.points2d[i + 1];
          const dist = distanceToSegment(point[0], point[1], p1[0], p1[1], p2[0], p2[1]);
          if (dist < minDist) minDist = dist;
        }
        if (minDist < 10 && (!best || minDist < best.distance)) {
          best = { ring, index: ring.index, distance: minDist };
        }
      }
      return best;
    }

    displayBodies() {
      if (!this.active || !this.preview || !this.selected) return this.extrudeController.bodies;
      if (this.copyInput.checked) return [...this.extrudeController.bodies, this.preview];
      return this.extrudeController.bodies.map(body => body === this.selected ? this.preview : body);
    }

    renderOverlay(context, project) {
      if (!this.active || !this.selected) return;
      context.save();
      const activeBody = this.preview || this.selected;
      if (activeBody && cad.bodyFaces?.renderBodyHighlight) {
        cad.bodyFaces.renderBodyHighlight(context, project, activeBody, {
          fill: 'rgba(33, 137, 227, .18)',
          stroke: '#0e70b0',
          lineWidth: 1.8,
          camera: this.camera,
        });
      }
      if (this.mode === 'free') {
        const rings = this.rotationRings();

        // 1. Draw 3D Rotation Rings
        for (const ring of rings) {
          const isDraggingThis = this.drag?.type === 'rotate' && this.drag.axis === ring.index;
          const isHovered = this.hoveredRing === ring.index;

          context.beginPath();
          ring.points2d.forEach((pt, i) => {
            if (i === 0) context.moveTo(...pt); else context.lineTo(...pt);
          });
          context.closePath();
          context.strokeStyle = ring.color;
          context.lineWidth = isDraggingThis ? 3.5 : isHovered ? 2.8 : 1.6;
          context.globalAlpha = isDraggingThis ? 1.0 : isHovered ? 0.95 : 0.65;
          context.stroke();
          context.globalAlpha = 1.0;

          if (ring.points2d.length > 0) {
            const handlePt = ring.points2d[0];
            context.beginPath();
            context.arc(handlePt[0], handlePt[1], isDraggingThis || isHovered ? 4.5 : 3.5, 0, Math.PI * 2);
            context.fillStyle = ring.color;
            context.fill();
            context.strokeStyle = '#ffffff';
            context.lineWidth = 1.5;
            context.stroke();
          }
        }

        // 2. Draw Rotation drag HUD & arc if actively rotating
        if (this.drag?.type === 'rotate') {
          const base = this.drag.base;
          const color = colors[this.drag.axis];
          context.beginPath();
          context.moveTo(base[0], base[1]);
          context.arc(base[0], base[1], 46, this.drag.startAngle, this.drag.lastAngle, false);
          context.closePath();
          context.fillStyle = color === '#d75858' ? 'rgba(215, 88, 88, 0.22)' : color === '#3d9a69' ? 'rgba(61, 154, 105, 0.22)' : 'rgba(54, 127, 202, 0.22)';
          context.fill();

          const val = number(this.rotationInputs[this.drag.axis].value);
          const axisName = ['X', 'Y', 'Z'][this.drag.axis];
          const text = `ROTATE ${axisName}: ${val.toFixed(1)}°`;
          context.font = 'bold 11px Arial, sans-serif';
          const textWidth = context.measureText(text).width;
          const pillX = base[0] + 45;
          const pillY = base[1] - 25;
          context.fillStyle = 'rgba(15, 23, 42, 0.92)';
          context.strokeStyle = color;
          context.lineWidth = 1.5;
          context.beginPath();
          if (context.roundRect) {
            context.roundRect(pillX - 6, pillY - 14, textWidth + 12, 20, 4);
          } else {
            context.rect(pillX - 6, pillY - 14, textWidth + 12, 20);
          }
          context.fill();
          context.stroke();
          context.fillStyle = '#ffffff';
          context.fillText(text, pillX, pillY);
        }

        // 3. Draw Translation Arrows on top
        for (const arrow of this.gizmo() || []) {
          context.beginPath(); context.moveTo(...arrow.base); context.lineTo(...arrow.tip);
          context.strokeStyle = colors[arrow.index]; context.lineWidth = 2.5; context.stroke();
          context.beginPath(); context.arc(...arrow.tip, 5, 0, Math.PI * 2);
          context.fillStyle = colors[arrow.index]; context.fill();
        }
      }
      const mark = (world, color) => {
        if (!world) return;
        const point = project(world);
        context.beginPath(); context.arc(...point, 6, 0, Math.PI * 2);
        context.fillStyle = '#fff'; context.fill(); context.strokeStyle = color;
        context.lineWidth = 2; context.stroke();
      };
      mark(this.mode === 'points' ? this.origin : this.pivot, '#1c80ad');
      mark(this.target, '#35a970');
      if (this.origin && this.target) {
        context.beginPath(); context.moveTo(...project(this.origin)); context.lineTo(...project(this.target));
        context.strokeStyle = '#1785ae'; context.lineWidth = 1.5; context.setLineDash([5, 4]); context.stroke();
      }
      context.restore();
    }

    commit() {
      if (!this.active || !this.preview || !this.selected) return false;
      const before = [...this.extrudeController.bodies];
      let result = this.preview;
      if (this.copyInput.checked) {
        const number = this.extrudeController.nextBodyId++;
        result = { ...result, id: `body-${number}`, name: `Body ${number}`, visible: true };
      }
      const after = this.copyInput.checked ? [...before, result] :
        before.map(body => body === this.selected ? result : body);
      const apply = bodies => {
        this.extrudeController.bodies = bodies;
        this.onBodiesChange?.(); this.onChange();
      };
      this.history.execute({ name: this.copyInput.checked ? 'Copy and move body' : 'Move / rotate body', kind: 'solid',
        timelineTool: 'bodyMoveBtn',
        execute: () => apply(after), undo: () => apply(before), redo: () => apply(after) });
      this.close();
      return true;
    }

    bind() {
      this.panel.querySelector('#bodyMoveFree').addEventListener('click', () => this.setMode('free'));
      this.panel.querySelector('#bodyMovePoints').addEventListener('click', () => this.setMode('points'));
      this.selection.addEventListener('click', () => { this.phase = 'body'; this.sync(); });
      this.pivotButton.addEventListener('click', () => { this.phase = 'pivot'; this.sync(); });
      this.originButton.addEventListener('click', () => { this.phase = 'origin'; this.sync(); });
      this.targetButton.addEventListener('click', () => { this.phase = 'target'; this.sync(); });
      [...this.translationInputs, ...this.rotationInputs].forEach(input => input.addEventListener('input', () => this.updatePreview()));
      this.copyInput.addEventListener('change', () => this.sync());
      const centerGroundBtn = this.panel.querySelector('#bodyMoveCenterGround');
      if (centerGroundBtn) {
        centerGroundBtn.addEventListener('click', () => {
          if (!this.selected?.mesh?.vertices) return;
          const v = this.selected.mesh.vertices;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
          for (let i = 0; i < v.length; i += 3) {
            const x = v[i], y = v[i + 1], z = v[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
          }
          const shiftX = -((minX + maxX) / 2);
          const shiftY = -((minY + maxY) / 2);
          const shiftZ = -minZ;
          this.translationInputs[0].value = String(Math.round(shiftX * 1000) / 1000);
          this.translationInputs[1].value = String(Math.round(shiftY * 1000) / 1000);
          this.translationInputs[2].value = String(Math.round(shiftZ * 1000) / 1000);
          this.rotationInputs.forEach(inp => { inp.value = '0'; });
          this.updatePreview();
        });
      }
      this.panel.querySelector('#bodyMoveCancel').addEventListener('click', () => this.close());
      this.ok.addEventListener('click', () => this.commit());
      this.canvas.addEventListener('pointerdown', event => {
        if (!this.active || this.mode !== 'free' || this.phase !== 'body' || event.button !== 0) return;
        const arrow = this.arrowAt(event);
        const ringMatch = !arrow ? this.ringAt(event) : null;
        const body = (arrow || ringMatch) ? this.selected : this.bodyAt(event);
        if (!body || body !== this.selected) return;

        const { bounds, point } = this.screen(event);
        const origin = add(this.pivot, this.vector(this.translationInputs));
        const base = this.camera.project(origin, bounds.width, bounds.height);

        if (ringMatch) {
          const startAngle = Math.atan2(point[1] - base[1], point[0] - base[0]);
          this.drag = {
            type: 'rotate',
            axis: ringMatch.index,
            pointerId: event.pointerId,
            base,
            lastAngle: startAngle,
            startAngle,
            accumulatedAngle: 0,
            initialRotations: this.vector(this.rotationInputs),
            moved: false,
          };
          this.canvas.classList.add('is-body-move-dragging');
          this.canvas.style.cursor = 'grabbing';
          this.canvas.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          return;
        }

        this.drag = {
          type: 'translate',
          pointerId: event.pointerId,
          axis: arrow?.index ?? null,
          x: event.clientX,
          y: event.clientY,
          initial: this.vector(this.translationInputs),
          moved: false,
        };
        this.canvas.classList.add('is-body-move-dragging');
        this.canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      this.canvas.addEventListener('pointermove', event => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) {
          if (this.active && this.mode === 'free' && this.phase === 'body' && this.selected) {
            const arrow = this.arrowAt(event);
            const ringMatch = !arrow ? this.ringAt(event) : null;
            const newHoveredRing = ringMatch?.index ?? null;
            if (this.hoveredRing !== newHoveredRing) {
              this.hoveredRing = newHoveredRing;
              this.onChange();
            }
            if (arrow) {
              this.canvas.style.cursor = 'move';
            } else if (ringMatch) {
              this.canvas.style.cursor = 'grab';
            } else {
              this.canvas.style.cursor = '';
            }
          }
          return;
        }

        if (this.drag.type === 'rotate') {
          this.drag.moved = true;
          const { bounds, point } = this.screen(event);
          const base = this.drag.base;
          const currentAngle = Math.atan2(point[1] - base[1], point[0] - base[0]);
          let delta = currentAngle - this.drag.lastAngle;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          this.drag.lastAngle = currentAngle;

          const axis = axes[this.drag.axis];
          const d = dot(axis, this.camera.depth);
          const sign = d >= 0 ? -1 : 1;
          const deltaDeg = (delta * 180 / Math.PI) * sign;
          this.drag.accumulatedAngle += deltaDeg;

          let targetAngle = this.drag.initialRotations[this.drag.axis] + this.drag.accumulatedAngle;
          if (event.shiftKey) {
            targetAngle = Math.round(targetAngle / 15) * 15;
          } else {
            const nearest5 = Math.round(targetAngle / 5) * 5;
            if (Math.abs(targetAngle - nearest5) < 0.6) {
              targetAngle = nearest5;
            }
          }
          this.rotationInputs[this.drag.axis].value = String(Math.round(targetAngle * 10) / 10);
          this.updatePreview();
          return;
        }

        const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
        const unit = this.camera.unit(this.canvas.clientWidth, this.canvas.clientHeight);
        let values = [...this.drag.initial];
        if (this.drag.axis === null) {
          values = add(values, add(scale(this.camera.right, dx / unit), scale(this.camera.up, -dy / unit)));
        } else {
          const axis = axes[this.drag.axis];
          const screen = [dot(axis, this.camera.right) * unit, -dot(axis, this.camera.up) * unit];
          const amount = (dx * screen[0] + dy * screen[1]) / Math.max(1e-8, dot(screen, screen));
          values[this.drag.axis] += amount;
        }
        values.forEach((value, i) => { this.translationInputs[i].value = String(Math.round(value * 1000) / 1000); });
        this.updatePreview();
      });
      const stopDrag = event => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        if (this.drag.moved) { this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0); }
        this.drag = null;
        this.canvas.style.cursor = '';
        this.canvas.classList.remove('is-body-move-dragging');
        if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      };
      this.canvas.addEventListener('pointerup', stopDrag);
      this.canvas.addEventListener('pointercancel', stopDrag);
      this.canvas.addEventListener('click', event => {
        if (!this.active || event.button !== 0 || this.suppressClick) return;
        if (this.phase === 'body') {
          const body = this.bodyAt(event);
          if (body) this.setBody(body);
        } else if (this.phase === 'pivot' || this.phase === 'origin') {
          const point = this.pointAt(event, true);
          if (!point) return;
          if (this.phase === 'pivot') { this.pivot = point; this.phase = 'body'; }
          else { this.origin = point; this.phase = 'target'; }
          this.updatePreview();
        } else if (this.phase === 'target') {
          this.target = this.targetAt(event);
          this.phase = 'done';
          this.updatePreview();
        }
      });
      document.addEventListener('keydown', event => {
        if (!this.active) return;
        if (event.key === 'Escape') { event.preventDefault(); this.close(); }
        if (event.key === 'Enter' && !this.ok.disabled) { event.preventDefault(); this.commit(); }
      });
    }
  }

  cad.bodyMove = { rotate, meshCenter, transformBody };
  cad.BodyMoveController = BodyMoveController;
})(window.WebCAD = window.WebCAD || {});
