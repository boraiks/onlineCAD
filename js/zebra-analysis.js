(function (cad) {
  'use strict';

  class ZebraAnalysisController {
    constructor({ canvas, panel, camera, extrudeController, onChange, onStatus, onModeChange }) {
      cad.zebraAnalysisController = this;
      Object.assign(this, { canvas, panel, camera, extrudeController, onChange, onStatus, onModeChange });

      this.active = false;
      this.selectedBody = null;
      this.direction = 'horizontal'; // 'horizontal' | 'vertical'
      this.repeats = 30; // 10 to 80
      this.opacity = 0.85; // 0.20 to 1.00

      this.bodyBtn = panel.querySelector('#zebraBodyBtn');
      this.dirHorizontalBtn = panel.querySelector('#zebraDirHorizontal');
      this.dirVerticalBtn = panel.querySelector('#zebraDirVertical');
      this.repeatsSlider = panel.querySelector('#zebraRepeatsSlider');
      this.repeatsOutput = panel.querySelector('#zebraRepeatsOutput');
      this.opacitySlider = panel.querySelector('#zebraOpacitySlider');
      this.opacityOutput = panel.querySelector('#zebraOpacityOutput');
      this.presetFineBtn = panel.querySelector('#zebraPresetFine');
      this.presetStdBtn = panel.querySelector('#zebraPresetStd');
      this.presetCoarseBtn = panel.querySelector('#zebraPresetCoarse');
      this.clearBtn = panel.querySelector('#zebraClearBtn');
      this.closeBtn = panel.querySelector('#zebraCloseBtn');

      this.bind();
    }

    open(initialBody = null) {
      if (this.active && !initialBody) {
        this.close();
        return true;
      }

      this.active = true;
      this.selectedBody = initialBody || null;
      this.panel.hidden = false;
      this.canvas?.classList?.add('is-zebra-analysis');

      this.sync();
      this.onModeChange?.(true);
      this.onStatus?.('ZEBRA ANALYSIS · Inspecting surface curvature and continuity');
      this.onChange?.();
      return true;
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.selectedBody = null;
      this.panel.hidden = true;
      this.canvas?.classList?.remove('is-zebra-analysis');

      this.onModeChange?.(false);
      this.onStatus?.('3D VIEW');
      this.onChange?.();
    }

    setBody(body) {
      if (this.selectedBody === body) {
        this.selectedBody = null;
      } else {
        this.selectedBody = body;
      }
      this.sync();
      this.onChange?.();
    }

    setDirection(dir) {
      this.direction = dir === 'vertical' ? 'vertical' : 'horizontal';
      this.sync();
      this.onChange?.();
    }

    setRepeats(repeats) {
      const val = Math.max(10, Math.min(80, Math.round(Number(repeats) || 30)));
      this.repeats = val;
      this.sync();
      this.onChange?.();
    }

    setOpacity(opacity) {
      const val = Math.max(0.1, Math.min(1.0, Number(opacity) || 0.85));
      this.opacity = val;
      this.sync();
      this.onChange?.();
    }

    reset() {
      this.selectedBody = null;
      this.direction = 'horizontal';
      this.repeats = 30;
      this.opacity = 0.85;
      this.sync();
      this.onChange?.();
    }

    appliesTo(body) {
      if (!this.active || !body || body.visible === false) return false;
      if (!this.selectedBody) return true;
      return this.selectedBody === body;
    }

    sync() {
      if (this.bodyBtn) {
        this.bodyBtn.textContent = this.selectedBody ? this.selectedBody.name : 'All visible bodies';
        this.bodyBtn.classList.toggle('is-active', Boolean(this.selectedBody));
      }

      if (this.dirHorizontalBtn) {
        const isHoriz = this.direction === 'horizontal';
        this.dirHorizontalBtn.classList.toggle('is-active', isHoriz);
        this.dirHorizontalBtn.setAttribute('aria-pressed', String(isHoriz));
      }
      if (this.dirVerticalBtn) {
        const isVert = this.direction === 'vertical';
        this.dirVerticalBtn.classList.toggle('is-active', isVert);
        this.dirVerticalBtn.setAttribute('aria-pressed', String(isVert));
      }

      if (this.repeatsSlider) this.repeatsSlider.value = String(this.repeats);
      if (this.repeatsOutput) this.repeatsOutput.textContent = String(this.repeats);

      if (this.opacitySlider) this.opacitySlider.value = String(Math.round(this.opacity * 100));
      if (this.opacityOutput) this.opacityOutput.textContent = `${Math.round(this.opacity * 100)}%`;

      if (this.presetCoarseBtn) this.presetCoarseBtn.classList.toggle('is-active', this.repeats === 16);
      if (this.presetStdBtn) this.presetStdBtn.classList.toggle('is-active', this.repeats === 30);
      if (this.presetFineBtn) this.presetFineBtn.classList.toggle('is-active', this.repeats === 50);
    }

    bodyAt(event) {
      const camera = this.camera || cad.app?.camera;
      const bodies = this.extrudeController?.bodies || [];
      if (!camera || !bodies.length) return null;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      let hitBody = null;
      let minDepth = -Infinity;
      for (const body of bodies) {
        if (body.visible === false) continue;
        const mesh = body.renderMesh || body.mesh;
        if (!mesh?.triangles?.length) continue;
        const v = mesh.vertices;
        const tri = mesh.triangles;
        for (let i = 0; i < tri.length; i += 3) {
          const a = tri[i] * 3, b = tri[i + 1] * 3, c = tri[i + 2] * 3;
          const p1 = camera.project([v[a], v[a + 1], v[a + 2]]);
          const p2 = camera.project([v[b], v[b + 1], v[b + 2]]);
          const p3 = camera.project([v[c], v[c + 1], v[c + 2]]);
          // Point in 2D triangle check
          const area = 0.5 * (-p2.y * p3.x + p1.y * (-p2.x + p3.x) + p1.x * (p2.y - p3.y) + p2.x * p3.y);
          const s = 1 / (2 * area) * (p1.y * p3.x - p1.x * p3.y + (p3.y - p1.y) * x + (p1.x - p3.x) * y);
          const t = 1 / (2 * area) * (p1.x * p2.y - p1.y * p2.x + (p1.y - p2.y) * x + (p2.x - p1.x) * y);
          if (s >= 0 && t >= 0 && 1 - s - t >= 0) {
            const depth = (p1.depth + p2.depth + p3.depth) / 3;
            if (depth > minDepth) {
              minDepth = depth;
              hitBody = body;
            }
          }
        }
      }
      return hitBody;
    }

    renderOverlay(context) {
      if (!this.active) return;
      const width = context.canvas?.width || 800;

      // Draw subtle HUD pill badge in the top right
      context.save();
      const label = `🦓 ZEBRA: ${this.direction.toUpperCase()} · ${this.repeats} STRIPES · ${Math.round(this.opacity * 100)}%`;
      context.font = '600 11px system-ui, -apple-system, sans-serif';
      const textWidth = context.measureText(label).width;
      const x = width - textWidth - 28;
      const y = 14;

      context.fillStyle = 'rgba(15, 23, 42, 0.85)';
      context.strokeStyle = 'rgba(2, 136, 209, 0.5)';
      context.lineWidth = 1.2;
      context.beginPath();
      context.roundRect(x, y, textWidth + 16, 22, 11);
      context.fill();
      context.stroke();

      context.fillStyle = '#38bdf8';
      context.textBaseline = 'middle';
      context.fillText(label, x + 8, y + 11);
      context.restore();
    }

    bind() {
      this.bodyBtn?.addEventListener('click', () => {
        if (this.selectedBody) {
          this.setBody(null);
        }
      });

      this.dirHorizontalBtn?.addEventListener('click', () => this.setDirection('horizontal'));
      this.dirVerticalBtn?.addEventListener('click', () => this.setDirection('vertical'));

      this.repeatsSlider?.addEventListener('input', e => {
        this.repeats = Number(e.target.value);
        if (this.repeatsOutput) this.repeatsOutput.textContent = String(this.repeats);
        this.onChange?.();
      });

      this.opacitySlider?.addEventListener('input', e => {
        this.opacity = Number(e.target.value) / 100;
        if (this.opacityOutput) this.opacityOutput.textContent = `${e.target.value}%`;
        this.onChange?.();
      });

      this.presetCoarseBtn?.addEventListener('click', () => this.setRepeats(16));
      this.presetStdBtn?.addEventListener('click', () => this.setRepeats(30));
      this.presetFineBtn?.addEventListener('click', () => this.setRepeats(50));

      this.clearBtn?.addEventListener('click', () => this.reset());
      this.closeBtn?.addEventListener('click', () => this.close());

      this.canvas?.addEventListener('click', event => {
        if (!this.active || event.button !== 0) return;
        const body = this.bodyAt(event);
        if (body) {
          this.setBody(body);
        }
      });

      if (typeof document !== 'undefined') {
        document.addEventListener('keydown', event => {
          if (!this.active) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
          }
        });
      }
    }
  }

  cad.ZebraAnalysisController = ZebraAnalysisController;
})(window.WebCAD = window.WebCAD || {});
