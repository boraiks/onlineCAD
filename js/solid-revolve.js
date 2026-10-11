(function (cad) {
  'use strict';

  class SolidRevolveController {
    constructor({
      canvas,
      hud,
      camera,
      extrudeController,
      sketchProfiles,
      profileSelection,
      sketchManager,
      history,
      onChange,
      onBodiesChange,
      onStatus,
      onError
    }) {
      this.canvas = canvas;
      this.hud = hud;
      this.camera = camera;
      this.extrudeController = extrudeController;
      this.sketchProfiles = sketchProfiles;
      this.profileSelection = profileSelection;
      this.sketchManager = sketchManager;
      this.history = history;
      this.onChange = onChange;
      this.onBodiesChange = onBodiesChange;
      this.onStatus = onStatus;
      this.onError = onError;

      this.active = false;
      this.selectedProfile = null;
      this.axisMode = 'preset-y'; // 'preset-y', 'preset-x', 'line'
      this.axisLine = { point: [0, 0], dir: [0, 1] };
      this.angle = 360;
      this.operation = 'new';
      this.preview = null;
      this.pickingAxis = false;

      this.initElements();
      this.bindEvents();
    }

    initElements() {
      if (!this.hud) return;
      this.profileCountEl = this.hud.querySelector('#revolveProfileCount');
      this.axisSelectBtn = this.hud.querySelector('#revolveAxisSelectBtn');
      this.axisPresetX = this.hud.querySelector('#revolveAxisPresetX');
      this.axisPresetY = this.hud.querySelector('#revolveAxisPresetY');
      this.angleInput = this.hud.querySelector('#revolveAngleInput');
      this.angleRange = this.hud.querySelector('#revolveAngleRange');
      this.operationSelect = this.hud.querySelector('#revolveOperationSelect');
      this.cancelBtn = this.hud.querySelector('#revolveCancelBtn');
      this.commitBtn = this.hud.querySelector('#revolveCommitBtn');
      this.angleChips = this.hud.querySelectorAll('.revolve-chip');
    }

    bindEvents() {
      if (!this.hud) return;

      this.axisPresetX?.addEventListener('click', () => {
        this.setAxisPreset('preset-x', [1, 0]);
      });

      this.axisPresetY?.addEventListener('click', () => {
        this.setAxisPreset('preset-y', [0, 1]);
      });

      this.axisSelectBtn?.addEventListener('click', () => {
        this.pickingAxis = !this.pickingAxis;
        this.axisSelectBtn.classList.toggle('active', this.pickingAxis);
        this.onStatus?.(this.pickingAxis ? 'REVOLVE · Click a sketch line to set as axis' : 'REVOLVE · Select profile');
      });

      this.angleInput?.addEventListener('input', e => {
        const val = Number(e.target.value);
        if (Number.isFinite(val) && val >= 1 && val <= 360) {
          this.angle = val;
          if (this.angleRange) this.angleRange.value = String(val);
          this.updatePreview();
        }
      });

      this.angleRange?.addEventListener('input', e => {
        const val = Number(e.target.value);
        this.angle = val;
        if (this.angleInput) this.angleInput.value = String(val);
        this.updatePreview();
      });

      this.angleChips?.forEach(chip => {
        chip.addEventListener('click', () => {
          const deg = Number(chip.dataset.angle);
          if (deg) {
            this.angle = deg;
            if (this.angleInput) this.angleInput.value = String(deg);
            if (this.angleRange) this.angleRange.value = String(deg);
            this.updatePreview();
          }
        });
      });

      this.operationSelect?.addEventListener('change', e => {
        this.operation = e.target.value;
        this.updatePreview();
      });

      this.cancelBtn?.addEventListener('click', () => this.close());
      this.commitBtn?.addEventListener('click', () => this.commit());

      this.canvas?.addEventListener('click', event => {
        if (!this.active || event.button !== 0) return;
        const bounds = this.canvas.getBoundingClientRect();
        const screen = [event.clientX - bounds.left, event.clientY - bounds.top];

        if (this.pickingAxis) {
          let bestDist = 12;
          let bestLine = null;
          for (const sketch of this.sketchManager?.sketches || []) {
            if (sketch.visible === false) continue;
            for (const entity of sketch.entities || []) {
              if (entity.type === 'line') {
                const s1 = this.camera?.project(this.sketchManager.toWorld(sketch, entity.start), bounds.width, bounds.height);
                const s2 = this.camera?.project(this.sketchManager.toWorld(sketch, entity.end), bounds.width, bounds.height);
                if (s1 && s2) {
                  const dist = cad.math?.distanceToSegment ? cad.math.distanceToSegment(screen, s1, s2) : 999;
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestLine = { p1: entity.start, p2: entity.end };
                  }
                }
              }
            }
          }
          if (bestLine) {
            this.setCustomAxis(bestLine.p1, bestLine.p2);
            return;
          }
        }

        const profiles = this.sketchProfiles?.fromSketch
          ? (this.sketchManager?.sketches || []).filter(s => s.visible !== false).flatMap(s => this.sketchProfiles.fromSketch(s))
          : [];
        const hit = this.sketchProfiles?.hitTest && this.camera && this.sketchManager
          ? this.sketchProfiles.hitTest(profiles, screen, (sketch, pt) =>
              this.camera.project(this.sketchManager.toWorld(sketch, pt), bounds.width, bounds.height))
          : null;
        if (hit) {
          this.selectProfile(hit);
        }
      });
    }

    setAxisPreset(mode, dir) {
      this.axisMode = mode;
      this.pickingAxis = false;
      this.axisSelectBtn?.classList.remove('active');
      this.axisPresetX?.classList.toggle('active', mode === 'preset-x');
      this.axisPresetY?.classList.toggle('active', mode === 'preset-y');
      this.axisLine = { point: [0, 0], dir };
      this.updatePreview();
    }

    open(preselectedProfile = null) {
      this.active = true;
      this.selectedProfile = preselectedProfile || this.profileSelection?.selectedProfile || this.profileSelection?.selected || null;
      this.axisMode = 'preset-y';
      this.axisLine = { point: [0, 0], dir: [0, 1] };
      this.angle = 360;
      this.operation = this.extrudeController?.bodies?.length ? 'join' : 'new';
      this.preview = null;
      this.pickingAxis = false;

      if (this.hud) {
        this.hud.hidden = false;
        if (this.angleInput) this.angleInput.value = '360';
        if (this.angleRange) this.angleRange.value = '360';
        if (this.operationSelect) this.operationSelect.value = this.operation;
        this.setAxisPreset('preset-y', [0, 1]);
        this.updateUI();
      }

      this.onStatus?.('REVOLVE · Select a closed profile and rotation axis');
      this.updatePreview();
      this.onChange?.();
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.preview = null;
      this.pickingAxis = false;
      if (this.hud) this.hud.hidden = true;
      this.onStatus?.('3D VIEW');
      this.onChange?.();
    }

    selectProfile(profile) {
      this.selectedProfile = profile;
      this.updateUI();
      this.updatePreview();
    }

    setCustomAxis(p1, p2) {
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      this.axisMode = 'custom';
      this.axisLine = { point: [p1[0], p1[1]], dir: [dx / len, dy / len] };
      this.pickingAxis = false;
      this.axisSelectBtn?.classList.remove('active');
      this.axisPresetX?.classList.remove('active');
      this.axisPresetY?.classList.remove('active');
      this.updatePreview();
    }

    updateUI() {
      if (!this.hud) return;
      if (this.profileCountEl) {
        this.profileCountEl.textContent = this.selectedProfile ? '1 Selected' : '0 Selected';
      }
      if (this.commitBtn) {
        this.commitBtn.disabled = !this.preview;
      }
    }

    updatePreview() {
      if (!this.active) return;
      this.preview = null;
      if (!this.selectedProfile) {
        this.updateUI();
        this.onChange?.();
        return;
      }

      try {
        const target = this.operation !== 'new' ? this.extrudeController.bodies[0] : null;
        this.preview = cad.solidKernel.revolveProfile(this.selectedProfile, {
          axisLine: this.axisLine,
          angle: this.angle,
          operation: this.operation,
          targetBody: target
        });
      } catch (err) {
        console.warn('Revolve preview compute error:', err);
        this.preview = null;
      }

      this.updateUI();
      this.onChange?.();
    }

    displayBodies() {
      if (!this.active) return this.extrudeController.bodies;
      if (!this.preview) return this.extrudeController.bodies;

      if (this.operation === 'new') {
        const previewCopy = { ...this.preview, isPreview: true };
        return [...this.extrudeController.bodies, previewCopy];
      }

      const target = this.extrudeController.bodies[0];
      return this.extrudeController.bodies.map(b => (b === target ? { ...this.preview, isPreview: true, isCut: this.operation === 'cut' } : b));
    }

    commit() {
      if (!this.active || !this.preview) return false;
      const created = this.preview;
      const op = this.operation;
      const prevBodies = [...this.extrudeController.bodies];

      let newBodies;
      if (op === 'new') {
        newBodies = [...prevBodies, created];
      } else {
        const target = prevBodies[0];
        newBodies = prevBodies.map(b => (b === target ? created : b));
      }

      const apply = bodies => {
        this.extrudeController.bodies = bodies;
        this.onBodiesChange?.();
        this.onChange?.();
      };

      this.history.execute({
        name: 'Revolve',
        kind: 'solid',
        timelineTool: 'revolveBtn',
        execute: () => apply(newBodies),
        undo: () => apply(prevBodies),
        redo: () => apply(newBodies)
      });

      this.close();
      return true;
    }

    renderOverlay(context, project) {
      if (!this.active) return;

      const sketch = this.selectedProfile?.sketch;
      const plane = cad.planes?.grid?.[sketch?.plane || this.selectedProfile?.plane || 'XY'];
      if (!plane) return;

      const origin = plane.origin || [0, 0, 0];
      const u = plane.u;
      const v = plane.v;

      // Draw Axis Line
      const p0 = this.axisLine.point;
      const d = this.axisLine.dir;
      const ext = 80;
      const pStart = [p0[0] - d[0] * ext, p0[1] - d[1] * ext];
      const pEnd = [p0[0] + d[0] * ext, p0[1] + d[1] * ext];

      const wStart = origin.map((val, i) => val + u[i] * pStart[0] + v[i] * pStart[1]);
      const wEnd = origin.map((val, i) => val + u[i] * pEnd[0] + v[i] * pEnd[1]);

      const sStart = project(wStart);
      const sEnd = project(wEnd);

      context.save();
      context.beginPath();
      context.setLineDash([6, 4]);
      context.strokeStyle = '#f59e0b';
      context.lineWidth = 2.5;
      context.moveTo(sStart[0], sStart[1]);
      context.lineTo(sEnd[0], sEnd[1]);
      context.stroke();

      // Axis label
      const mid = [(sStart[0] + sEnd[0]) / 2, (sStart[1] + sEnd[1]) / 2];
      context.fillStyle = '#f59e0b';
      context.font = 'bold 11px Inter, sans-serif';
      context.fillText('AXIS', mid[0] + 8, mid[1] - 8);

      // Draw Selected Profile
      if (this.selectedProfile?.points?.length) {
        context.beginPath();
        context.setLineDash([]);
        context.strokeStyle = '#2563eb';
        context.lineWidth = 2.0;
        this.selectedProfile.points.forEach((pt, idx) => {
          const wPt = origin.map((val, i) => val + u[i] * pt[0] + v[i] * pt[1]);
          const sPt = project(wPt);
          if (idx === 0) context.moveTo(sPt[0], sPt[1]);
          else context.lineTo(sPt[0], sPt[1]);
        });
        context.closePath();
        context.fillStyle = 'rgba(37, 99, 235, 0.18)';
        context.fill();
        context.stroke();
      }

      context.restore();
    }
  }

  cad.SolidRevolveController = SolidRevolveController;
})(window.WebCAD = window.WebCAD || {});
