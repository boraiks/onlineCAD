(function (cad) {
  'use strict';

  const dot = cad.math.dot;
  const sub = (a, b) => a.map((val, i) => val - b[i]);

  function makeCirclePolygon(center, radius, segments = 64) {
    const points = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      points.push([
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle)
      ]);
    }
    return points;
  }

  function getBodyExtent(body) {
    if (body?.mesh?.vertices?.length) {
      const verts = body.mesh.vertices;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i], y = verts[i + 1], z = verts[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 1.5 + 50;
    }
    return 500;
  }

  class SolidHoleController {
    constructor({
      canvas,
      panel,
      hud = null,
      camera,
      extrudeController,
      history,
      onChange,
      onBodiesChange,
      onStatus,
      onModeChange,
      onError
    }) {
      Object.assign(this, {
        canvas,
        panel,
        hud,
        camera,
        extrudeController,
        history,
        onChange,
        onBodiesChange,
        onStatus,
        onModeChange,
        onError
      });

      this.title = panel.querySelector('#solidHoleTitle');
      this.help = panel.querySelector('#solidHoleHelp');
      this.faceOutput = panel.querySelector('#solidHoleFace');
      this.typeSelect = panel.querySelector('#solidHoleType');
      this.extentsSelect = panel.querySelector('#solidHoleExtents');
      this.diameterInput = panel.querySelector('#solidHoleDiameter');
      this.depthRow = panel.querySelector('#solidHoleDepthRow');
      this.depthInput = panel.querySelector('#solidHoleDepth');
      this.cboreFields = panel.querySelector('#solidHoleCboreFields');
      this.cboreDiaInput = panel.querySelector('#solidHoleCboreDia');
      this.cboreDepthInput = panel.querySelector('#solidHoleCboreDepth');
      this.csinkFields = panel.querySelector('#solidHoleCsinkFields');
      this.csinkDiaInput = panel.querySelector('#solidHoleCsinkDia');
      this.csinkAngleInput = panel.querySelector('#solidHoleCsinkAngle');
      this.okBtn = panel.querySelector('#solidHoleOk');
      this.cancelBtn = panel.querySelector('#solidHoleCancel');

      // Floating on-screen HUD elements (Fusion 360-style)
      this.hudOperation = hud?.querySelector?.('#solidHoleHudOperation') || null;
      this.hudType = hud?.querySelector?.('#solidHoleHudType') || null;
      this.hudExtents = hud?.querySelector?.('#solidHoleHudExtents') || null;
      this.hudDiameter = hud?.querySelector?.('#solidHoleHudDiameter') || null;
      this.hudDepth = hud?.querySelector?.('#solidHoleHudDepth') || null;
      this.hudDepthRow = hud?.querySelector?.('#solidHoleHudDepthRow') || null;
      this.hudCboreDia = hud?.querySelector?.('#solidHoleHudCboreDia') || null;
      this.hudCboreDiaRow = hud?.querySelector?.('#solidHoleHudCboreDiaRow') || null;
      this.hudCboreDepth = hud?.querySelector?.('#solidHoleHudCboreDepth') || null;
      this.hudCboreDepthRow = hud?.querySelector?.('#solidHoleHudCboreDepthRow') || null;
      this.hudCsinkDia = hud?.querySelector?.('#solidHoleHudCsinkDia') || null;
      this.hudCsinkDiaRow = hud?.querySelector?.('#solidHoleHudCsinkDiaRow') || null;
      this.hudCsinkAngle = hud?.querySelector?.('#solidHoleHudCsinkAngle') || null;
      this.hudCsinkAngleRow = hud?.querySelector?.('#solidHoleHudCsinkAngleRow') || null;

      this.active = false;
      this.selectedFace = null;
      this.selectedBody = null;
      this.center2D = [0, 0]; // (u, v) in face coordinates
      this.hoveredFace = null;
      this.preview = null;
      this.generation = 0;
      this.previewTimer = null;
      this.isDraggingHandle = false;
      this.suppressClick = false;

      this.bind();
    }

    async open(initialFace = null) {
      if (this.active) {
        this.close();
        return true;
      }
      const visibleBodies = this.extrudeController.bodies.filter(b => b.visible !== false);
      if (!visibleBodies.length) {
        this.onStatus?.('HOLE · Extrude a body first');
        return false;
      }

      this.generation++;
      this.active = true;
      this.selectedFace = null;
      this.selectedBody = null;
      this.hoveredFace = null;
      this.preview = null;
      this.center2D = [0, 0];
      this.isDraggingHandle = false;
      this.okBtn.disabled = true;

      this.updateVisibility();
      this.faceOutput.textContent = 'Click a planar face';
      this.help.textContent = 'Click on any flat body face to position the hole.';
      this.panel.hidden = false;
      this.canvas.classList.add('is-solid-hole');
      this.onModeChange?.(true);
      this.onStatus?.('HOLE · Click a planar face to position hole');
      this.onChange?.();

      const generation = this.generation;
      try {
        await cad.solidKernel.load();
        if (!this.active || generation !== this.generation) return true;
        for (const body of this.extrudeController.bodies) {
          if (body.visible !== false && !body.mesh) {
            body.mesh = cad.solidKernel.meshBody(body);
          }
        }

        if (initialFace && visibleBodies.includes(initialFace.body)) {
          this.selectFace(initialFace, initialFace.origin);
        }
        return true;
      } catch (error) {
        if (generation === this.generation) {
          this.onError?.({
            code: 'CAD-C010',
            title: 'Hole Error',
            reason: `Could not initialize 3D kernel: ${error?.message || 'kernel unavailable'}`
          });
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
      this.selectedFace = null;
      this.selectedBody = null;
      this.hoveredFace = null;
      this.preview = null;
      this.isDraggingHandle = false;
      this.panel.hidden = true;
      if (this.hud) this.hud.hidden = true;
      this.canvas.classList.remove('is-solid-hole');
      this.onModeChange?.(false);
      this.onStatus?.('3D VIEW');
      this.onChange?.();
    }

    updateVisibility() {
      const isDistance = this.extentsSelect?.value === 'distance';
      if (this.depthRow) this.depthRow.hidden = !isDistance;

      const type = this.typeSelect?.value || 'simple';
      if (this.cboreFields) this.cboreFields.hidden = (type !== 'counterbore');
      if (this.csinkFields) this.csinkFields.hidden = (type !== 'countersink');

      if (this.hud) {
        if (this.hudDepthRow) this.hudDepthRow.hidden = !isDistance;
        if (this.hudCboreDiaRow) this.hudCboreDiaRow.hidden = (type !== 'counterbore');
        if (this.hudCboreDepthRow) this.hudCboreDepthRow.hidden = (type !== 'counterbore');
        if (this.hudCsinkDiaRow) this.hudCsinkDiaRow.hidden = (type !== 'countersink');
        if (this.hudCsinkAngleRow) this.hudCsinkAngleRow.hidden = (type !== 'countersink');

        if (this.hudType) {
          this.hudType.textContent = type === 'counterbore' ? 'Counterbore'
            : type === 'countersink' ? 'Countersink' : 'Simple';
        }
        if (this.hudExtents) {
          this.hudExtents.textContent = isDistance ? 'Distance' : 'Through All';
        }
      }
    }

    selectFace(face, worldPoint = null) {
      if (!face || !face.body) return;
      this.selectedFace = face;
      this.selectedBody = face.body;
      cad.bodyFaces.registerPlane(face);

      if (worldPoint) {
        const delta = sub(worldPoint, face.origin);
        this.center2D = [dot(delta, face.u), dot(delta, face.v)];
      } else {
        this.center2D = [0, 0];
      }

      this.faceOutput.textContent = `${face.body.name || 'Body'} · Planar Face`;
      this.help.textContent = 'Position placed. Adjust diameter & depth, or drag the center handle.';
      this.onStatus?.(`HOLE · ${face.body.name || 'Body'} · Set diameter & depth, then click OK`);
      this.updateVisibility();
      this.updatePreview();

      if (this.hudDiameter && typeof document !== 'undefined') {
        setTimeout(() => {
          this.hudDiameter?.focus?.();
          this.hudDiameter?.select?.();
        }, 40);
      }
    }

    centerWorld() {
      if (!this.selectedFace) return null;
      const { origin, u, v } = this.selectedFace;
      return [0, 1, 2].map(i => origin[i] + this.center2D[0] * u[i] + this.center2D[1] * v[i]);
    }

    updatePreview() {
      if (!this.active) return;
      this.preview = null;
      if (!this.selectedFace || !this.selectedBody) {
        this.okBtn.disabled = true;
        this.onChange?.();
        return;
      }

      const dia = Math.max(0.1, Number(this.diameterInput.value) || 10);
      const radius = dia / 2;
      const extents = this.extentsSelect.value;
      const extentVal = getBodyExtent(this.selectedBody);
      const depth = extents === 'all' ? extentVal : Math.max(0.1, Number(this.depthInput.value) || 20);
      const type = this.typeSelect.value;
      const plane = cad.bodyFaces.registerPlane(this.selectedFace);

      const mainPoints = makeCirclePolygon(this.center2D, radius, 64);
      const tools = [{
        profileId: 'hole-main',
        plane,
        origin: [...this.selectedFace.origin],
        normal: [...this.selectedFace.normal],
        points: mainPoints,
        holes: [],
        start: -depth,
        end: 1.0
      }];

      if (type === 'counterbore') {
        const cbDia = Math.max(dia + 0.2, Number(this.cboreDiaInput.value) || dia * 1.6);
        const cbDepth = Math.max(0.1, Math.min(depth - 0.05, Number(this.cboreDepthInput.value) || 5));
        const cbPoints = makeCirclePolygon(this.center2D, cbDia / 2, 64);
        tools.push({
          profileId: 'hole-cbore',
          plane,
          origin: [...this.selectedFace.origin],
          normal: [...this.selectedFace.normal],
          points: cbPoints,
          holes: [],
          start: -cbDepth,
          end: 1.0
        });
      } else if (type === 'countersink') {
        const csDia = Math.max(dia + 0.2, Number(this.csinkDiaInput.value) || dia * 1.5);
        const csAngle = Math.max(10, Math.min(170, Number(this.csinkAngleInput.value) || 90));
        const angleRad = (csAngle * Math.PI) / 180;
        const hCsink = Math.max(0.01, Math.min(depth - 0.05, ((csDia - dia) / 2) / Math.tan(angleRad / 2)));
        const numSlices = 16;
        for (let s = 0; s < numSlices; s++) {
          const t = s / numSlices;
          const tNext = (s + 1) / numSlices;
          const rSlice = radius + (1 - t) * (csDia / 2 - radius);
          const zStart = -tNext * hCsink;
          const zEnd = s === 0 ? 1.0 : -t * hCsink;
          const slicePoints = makeCirclePolygon(this.center2D, rSlice, 48);
          tools.push({
            profileId: `hole-csink-${s}`,
            plane,
            origin: [...this.selectedFace.origin],
            normal: [...this.selectedFace.normal],
            points: slicePoints,
            holes: [],
            start: zStart,
            end: zEnd
          });
        }
      }

      try {
        this.preview = cad.solidKernel.booleanBody(this.selectedBody, tools, 'cut');
      } catch (err) {
        this.preview = null;
      }

      const isValid = Boolean(this.preview && !this.preview.empty);
      this.okBtn.disabled = !isValid;
      if (isValid) {
        this.help.textContent = 'Preview ready. Click OK to cut the hole into the body.';
      } else {
        this.help.textContent = 'Cannot cut hole. Try adjusting diameter or position.';
      }
      this.onChange?.();
    }

    displayBodies() {
      if (!this.active || !this.preview || !this.selectedBody) {
        return this.extrudeController.bodies;
      }
      return this.extrudeController.bodies.map(body => body === this.selectedBody ? this.preview : body);
    }

    commit() {
      if (!this.active || !this.preview || !this.selectedBody) return false;
      const before = [...this.extrudeController.bodies];
      const target = this.selectedBody;
      const after = before.map(body => body === target ? this.preview : body);
      const apply = bodies => {
        this.extrudeController.bodies = bodies;
        this.onBodiesChange?.();
        this.onChange?.();
      };
      this.history.execute({
        name: 'Hole', kind: 'solid', timelineTool: 'holeBtn',
        execute: () => apply(after),
        undo: () => apply(before),
        redo: () => apply(after)
      });
      this.close();
      return true;
    }

    renderOverlay(context, project) {
      if (!this.active) return;
      context.save();

      // 1. Draw hovered face highlight if hovering another face
      if (this.hoveredFace && this.hoveredFace !== this.selectedFace) {
        cad.bodyFaces.renderFaceHighlight(context, project, this.hoveredFace, {
          fill: 'rgba(39, 174, 96, .22)',
          stroke: '#27ae60',
          lineWidth: 2,
          camera: this.camera
        });
      }

      if (!this.selectedFace) {
        context.restore();
        return;
      }

      const face = this.selectedFace;
      const centerWorld = this.centerWorld();
      if (!centerWorld) {
        context.restore();
        return;
      }

      const screenCenter = project(centerWorld);
      const dia = Math.max(0.1, Number(this.diameterInput.value) || 10);
      const radius = dia / 2;
      const extents = this.extentsSelect.value;
      const depth = extents === 'all' ? 0 : Math.max(0.1, Number(this.depthInput.value) || 20);
      const type = this.typeSelect.value;

      // 2. Draw circular perimeter on face
      const draw3DCircle = (r, color, width, dashed = false) => {
        context.beginPath();
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const a = (i * 2 * Math.PI) / steps;
          const pt = [0, 1, 2].map(axis =>
            face.origin[axis] + (this.center2D[0] + r * Math.cos(a)) * face.u[axis] +
            (this.center2D[1] + r * Math.sin(a)) * face.v[axis]
          );
          const sc = project(pt);
          if (i === 0) context.moveTo(sc[0], sc[1]);
          else context.lineTo(sc[0], sc[1]);
        }
        context.strokeStyle = color;
        context.lineWidth = width;
        context.setLineDash(dashed ? [4, 4] : []);
        context.stroke();
      };

      // Outer rings for counterbore / countersink
      if (type === 'counterbore') {
        const cbDia = Math.max(dia + 0.2, Number(this.cboreDiaInput.value) || dia * 1.6);
        draw3DCircle(cbDia / 2, '#48cae4', 1.8, true);
      } else if (type === 'countersink') {
        const csDia = Math.max(dia + 0.2, Number(this.csinkDiaInput.value) || dia * 1.5);
        draw3DCircle(csDia / 2, '#48cae4', 1.8, true);
      }

      // Main hole circle
      draw3DCircle(radius, '#0096c7', 2.8, false);

      // 3. Center crosshair & handle
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(screenCenter[0] - 10, screenCenter[1]);
      context.lineTo(screenCenter[0] + 10, screenCenter[1]);
      context.moveTo(screenCenter[0], screenCenter[1] - 10);
      context.lineTo(screenCenter[0], screenCenter[1] + 10);
      context.strokeStyle = '#023e8a';
      context.lineWidth = 1.5;
      context.stroke();

      context.beginPath();
      context.arc(screenCenter[0], screenCenter[1], 4.5, 0, Math.PI * 2);
      context.fillStyle = '#0077b6';
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.stroke();

      // 4. Depth arrow when blind / distance
      if (extents === 'distance' && depth > 0) {
        const depthWorld = [0, 1, 2].map(axis => centerWorld[axis] - face.normal[axis] * depth);
        const depthScreen = project(depthWorld);
        context.beginPath();
        context.moveTo(screenCenter[0], screenCenter[1]);
        context.lineTo(depthScreen[0], depthScreen[1]);
        context.strokeStyle = '#0077b6';
        context.lineWidth = 2.0;
        context.setLineDash([3, 3]);
        context.stroke();
        context.setLineDash([]);
      }

      context.restore();
      this.renderHud(project);
    }

    renderHud(project) {
      if (!this.hud) return;
      if (!this.active || !this.selectedFace) {
        this.hud.hidden = true;
        return;
      }
      this.hud.hidden = false;
      const type = this.typeSelect?.value || 'simple';
      const isDistance = this.extentsSelect?.value === 'distance';
      const dia = Number(this.diameterInput?.value) || 10;
      const depth = Number(this.depthInput?.value) || 20;

      if (this.hudOperation) this.hudOperation.textContent = 'CUT';
      if (this.hudType) {
        this.hudType.textContent = type === 'counterbore' ? 'Counterbore'
          : type === 'countersink' ? 'Countersink' : 'Simple';
      }
      if (this.hudExtents) {
        this.hudExtents.textContent = isDistance ? 'Distance' : 'Through All';
      }

      if (this.hudDiameter && (typeof document === 'undefined' || document.activeElement !== this.hudDiameter)) {
        this.hudDiameter.value = String(dia);
      }
      if (this.hudDepthRow) this.hudDepthRow.hidden = !isDistance;
      if (isDistance && this.hudDepth && (typeof document === 'undefined' || document.activeElement !== this.hudDepth)) {
        this.hudDepth.value = String(depth);
      }

      if (this.hudCboreDiaRow) this.hudCboreDiaRow.hidden = (type !== 'counterbore');
      if (this.hudCboreDepthRow) this.hudCboreDepthRow.hidden = (type !== 'counterbore');
      if (type === 'counterbore') {
        if (this.hudCboreDia && (typeof document === 'undefined' || document.activeElement !== this.hudCboreDia)) {
          this.hudCboreDia.value = this.cboreDiaInput?.value || '16';
        }
        if (this.hudCboreDepth && (typeof document === 'undefined' || document.activeElement !== this.hudCboreDepth)) {
          this.hudCboreDepth.value = this.cboreDepthInput?.value || '5';
        }
      }

      if (this.hudCsinkDiaRow) this.hudCsinkDiaRow.hidden = (type !== 'countersink');
      if (this.hudCsinkAngleRow) this.hudCsinkAngleRow.hidden = (type !== 'countersink');
      if (type === 'countersink') {
        if (this.hudCsinkDia && (typeof document === 'undefined' || document.activeElement !== this.hudCsinkDia)) {
          this.hudCsinkDia.value = this.csinkDiaInput?.value || '15';
        }
        if (this.hudCsinkAngle && (typeof document === 'undefined' || document.activeElement !== this.hudCsinkAngle)) {
          this.hudCsinkAngle.value = this.csinkAngleInput?.value || '90';
        }
      }

      const centerWorld = this.centerWorld();
      if (!centerWorld) return;
      const screen = project(centerWorld);
      const bounds = this.canvas.getBoundingClientRect();
      const width = this.hud.offsetWidth || 185;
      const height = this.hud.offsetHeight || 95;
      const preferredX = screen[0] + width + 24 > bounds.width - 290 ? screen[0] - width - 18 : screen[0] + 18;
      const left = Math.max(8, Math.min(bounds.width - width - 8, preferredX));
      const top = Math.max(8, Math.min(bounds.height - height - 8, screen[1] - height / 2));
      const x = `${left}px`, y = `${top}px`;
      if (this.hud.style.left !== x) this.hud.style.left = x;
      if (this.hud.style.top !== y) this.hud.style.top = y;
    }

    unprojectPointOnFacePlane(screenPoint) {
      if (!this.selectedFace) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const face = this.selectedFace;
      const unit = this.camera.unit(bounds.width, bounds.height);
      const [originX, originY] = this.camera.origin(bounds.width, bounds.height);
      const pivot = cad.settings.cameraPivot ? this.camera.pivot : [0, 0, 0];

      const rx = (screenPoint[0] - originX) / unit;
      const ry = -(screenPoint[1] - originY) / unit;
      const p0 = [0, 1, 2].map(axis =>
        pivot[axis] + rx * this.camera.right[axis] + ry * this.camera.up[axis]
      );

      const normalDotDepth = dot(face.normal, this.camera.depth);
      if (Math.abs(normalDotDepth) < 1e-6) return null;

      const diff = sub(p0, face.origin);
      const t = -dot(face.normal, diff) / normalDotDepth;
      const worldPoint = [0, 1, 2].map(axis => p0[axis] + t * this.camera.depth[axis]);

      const delta = sub(worldPoint, face.origin);
      return [dot(delta, face.u), dot(delta, face.v)];
    }

    bind() {
      this.canvas.addEventListener('pointerdown', event => {
        if (!this.active || event.button !== 0) return;
        const bounds = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - bounds.left, event.clientY - bounds.top];

        if (this.selectedFace) {
          const centerWorld = this.centerWorld();
          if (centerWorld) {
            const screenCenter = this.camera.project(centerWorld, bounds.width, bounds.height);
            if (Math.hypot(screen[0] - screenCenter[0], screen[1] - screenCenter[1]) <= 15) {
              this.isDraggingHandle = true;
              this.suppressClick = false;
              try { this.canvas.setPointerCapture?.(event.pointerId); } catch {}
              event.preventDefault();
              return;
            }
          }
        }
      });

      this.canvas.addEventListener('pointermove', event => {
        if (!this.active) return;
        const bounds = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - bounds.left, event.clientY - bounds.top];

        if (this.isDraggingHandle && this.selectedFace) {
          const uv = this.unprojectPointOnFacePlane(screen);
          if (uv) {
            this.center2D = [
              Math.round(uv[0] * 10) / 10,
              Math.round(uv[1] * 10) / 10
            ];
            this.suppressClick = true;
            clearTimeout(this.previewTimer);
            this.previewTimer = setTimeout(() => this.updatePreview(), 40);
            this.onChange?.();
          }
          return;
        }

        if (event.buttons) return;

        // Hover test
        const hit = cad.bodyFaces.hitPointAt(screen, this.extrudeController.bodies, this.camera, bounds);
        const hovered = hit?.face || null;
        if (hovered !== this.hoveredFace) {
          this.hoveredFace = hovered;
          this.onChange?.();
        }
      });

      this.canvas.addEventListener('pointerup', event => {
        if (this.isDraggingHandle) {
          this.isDraggingHandle = false;
          if (this.canvas.hasPointerCapture?.(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
          }
          setTimeout(() => { this.suppressClick = false; }, 0);
        }
      });

      this.canvas.addEventListener('pointerleave', () => {
        if (!this.active) return;
        if (this.hoveredFace) {
          this.hoveredFace = null;
          this.onChange?.();
        }
      });

      this.canvas.addEventListener('click', event => {
        if (!this.active || event.button !== 0) return;
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }

        const bounds = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
        const hit = cad.bodyFaces.hitPointAt(screen, this.extrudeController.bodies, this.camera, bounds, true);

        if (hit?.face) {
          this.selectFace(hit.face, hit.point);
        }
      });

      // Panel field bindings
      this.typeSelect?.addEventListener('change', () => {
        this.updateVisibility();
        this.updatePreview();
      });

      this.extentsSelect?.addEventListener('change', () => {
        this.updateVisibility();
        this.updatePreview();
      });

      const onInputChange = () => {
        this.okBtn.disabled = true;
        clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => this.updatePreview(), 80);
      };

      [
        this.diameterInput,
        this.depthInput,
        this.cboreDiaInput,
        this.cboreDepthInput,
        this.csinkDiaInput,
        this.csinkAngleInput
      ].forEach(inp => inp?.addEventListener('input', onInputChange));

      // HUD inputs live two-way binding
      if (this.hud) {
        const hudPairs = [
          [this.hudDiameter, this.diameterInput],
          [this.hudDepth, this.depthInput],
          [this.hudCboreDia, this.cboreDiaInput],
          [this.hudCboreDepth, this.cboreDepthInput],
          [this.hudCsinkDia, this.csinkDiaInput],
          [this.hudCsinkAngle, this.csinkAngleInput]
        ];

        hudPairs.forEach(([hudInp, panelInp]) => {
          if (!hudInp || !panelInp) return;
          hudInp.addEventListener('input', () => {
            panelInp.value = hudInp.value;
            onInputChange();
          });
          hudInp.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!this.okBtn.disabled) this.commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              this.close();
            }
          });
        });

        this.hudDiameter?.addEventListener('keydown', event => {
          if (event.key === 'Tab' && !event.shiftKey && this.extentsSelect?.value === 'distance' && this.hudDepth) {
            event.preventDefault();
            this.hudDepth.focus();
            this.hudDepth.select?.();
          }
        });
      }

      this.cancelBtn?.addEventListener('click', () => this.close());
      this.okBtn?.addEventListener('click', () => this.commit());

      document?.addEventListener?.('keydown', event => {
        if (!this.active) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        } else if (event.key === 'Enter' && !this.okBtn.disabled) {
          event.preventDefault();
          this.commit();
        }
      });
    }
  }

  cad.SolidHoleController = SolidHoleController;
})(window.WebCAD = window.WebCAD || {});
