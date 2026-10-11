(function (cad) {
  'use strict';

  function formatVolume(val) {
    if (!Number.isFinite(val) || val <= 0) return '0.00 mm³';
    if (val >= 1000) return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm³`;
    return `${val.toFixed(2)} mm³`;
  }

  function formatBounds(bounds) {
    if (!bounds) return '-';
    const sx = Number.isFinite(bounds.sizeX) ? bounds.sizeX : (bounds.max?.[0] - bounds.min?.[0]) || 0;
    const sy = Number.isFinite(bounds.sizeY) ? bounds.sizeY : (bounds.max?.[1] - bounds.min?.[1]) || 0;
    const sz = Number.isFinite(bounds.sizeZ) ? bounds.sizeZ : (bounds.max?.[2] - bounds.min?.[2]) || 0;
    return `${sx.toFixed(1)} × ${sy.toFixed(1)} × ${sz.toFixed(1)} mm`;
  }

  class InterferenceController {
    constructor({ canvas, panel, camera, extrudeController, onChange, onStatus, onModeChange, onError }) {
      cad.interferenceController = this;
      Object.assign(this, { canvas, panel, camera, extrudeController, onChange, onStatus, onModeChange, onError });

      this.body1Btn = panel.querySelector('#interferenceBody1Btn');
      this.body2Btn = panel.querySelector('#interferenceBody2Btn');
      this.help = panel.querySelector('#interferenceHelp');
      this.statusHeader = panel.querySelector('#interferenceStatusHeader');
      this.statusIcon = panel.querySelector('#interferenceStatusIcon');
      this.statusText = panel.querySelector('#interferenceStatusText');
      this.details = panel.querySelector('#interferenceDetails');
      this.volumeText = panel.querySelector('#interferenceVolumeText');
      this.boundsText = panel.querySelector('#interferenceBoundsText');
      this.clearBtn = panel.querySelector('#interferenceClear');
      this.closeBtn = panel.querySelector('#interferenceClose');

      this.active = false;
      this.body1 = null;
      this.body2 = null;
      this.activeSlot = 1;
      this.result = null;
      this.interferenceBody = null;
      this.computing = false;

      this.bind();
    }

    async open(initialBody = null) {
      if (this.active) { this.close(); return true; }
      const visibleBodies = this.extrudeController.bodies.filter(b => b.visible !== false);
      if (visibleBodies.length < 2) {
        this.onStatus('INTERFERENCE · Need at least two bodies in the design');
        this.onError?.({
          code: 'CAD-I001',
          title: 'Not Enough Bodies',
          reason: 'Interference detection compares 3D volume between two bodies. Create at least two bodies with Extrude first.'
        });
        return false;
      }

      this.active = true;
      this.body1 = null;
      this.body2 = null;
      this.result = null;
      this.interferenceBody = null;
      this.activeSlot = 1;
      this.panel.hidden = false;
      this.canvas?.classList?.add('is-interference-check');

      if (initialBody && initialBody.visible !== false && visibleBodies.includes(initialBody)) {
        this.body1 = initialBody;
        this.activeSlot = 2;
        if (visibleBodies.length === 2) {
          this.body2 = visibleBodies.find(b => b !== initialBody) || null;
        }
      } else if (visibleBodies.length === 2) {
        this.body1 = visibleBodies[0];
        this.body2 = visibleBodies[1];
        this.activeSlot = 1;
      }

      this.sync();
      if (this.body1 && this.body2) {
        await this.compute();
      }
      return true;
    }

    close() {
      if (!this.active) return;
      this.active = false;
      this.body1 = null;
      this.body2 = null;
      this.result = null;
      if (this.interferenceBody) {
        cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
        this.interferenceBody = null;
      }
      this.panel.hidden = true;
      this.canvas?.classList?.remove('is-interference-check');
      this.onModeChange?.(false);
      this.onStatus('3D VIEW');
      this.onChange();
    }

    setBody(body, slot = this.activeSlot) {
      if (!body || body.visible === false) return;
      if (slot === 1) {
        if (this.body2 === body) this.body2 = null;
        this.body1 = body;
        this.activeSlot = this.body2 ? 1 : 2;
      } else {
        if (this.body1 === body) this.body1 = null;
        this.body2 = body;
        this.activeSlot = this.body1 ? 2 : 1;
      }
      this.sync();
      if (this.body1 && this.body2) {
        this.compute();
      } else {
        this.result = null;
        if (this.interferenceBody) {
          cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
          this.interferenceBody = null;
        }
        this.sync();
      }
    }

    async compute() {
      if (!this.body1 || !this.body2 || !this.active) return;
      this.computing = true;
      if (this.statusText) this.statusText.textContent = 'Computing clash volume...';
      if (this.statusIcon) this.statusIcon.textContent = '⏳';
      if (this.statusHeader) this.statusHeader.style.color = '#38bdf8';
      this.onChange();

      try {
        if (cad.solidKernel?.load) await cad.solidKernel.load();
        if (!this.active || !this.body1 || !this.body2) return;
        const res = cad.solidKernel.computeInterference(this.body1, this.body2);
        this.result = res;
        if (res?.hasInterference && res.mesh) {
          if (this.interferenceBody) cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
          this.interferenceBody = {
            id: 'interference-clash-body',
            name: 'Interference Clash',
            visible: true,
            isInterference: true,
            mesh: res.mesh,
            meshSource: 'solid',
            normal: [0, 0, 1]
          };
          this.onStatus(`INTERFERENCE · Clash detected: ${formatVolume(res.volume)}`);
        } else {
          if (this.interferenceBody) {
            cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
            this.interferenceBody = null;
          }
          this.onStatus('INTERFERENCE · No clash detected between selected bodies');
        }
      } catch (err) {
        this.result = { hasInterference: false, volume: 0, error: err?.message };
        if (this.interferenceBody) {
          cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
          this.interferenceBody = null;
        }
        this.onStatus(`INTERFERENCE · Compute notice: ${err?.message || 'Check failed'}`);
      } finally {
        this.computing = false;
        this.sync();
      }
    }

    clear() {
      this.body1 = null;
      this.body2 = null;
      this.activeSlot = 1;
      this.result = null;
      if (this.interferenceBody) {
        cad.bodyRenderer?.releaseBody?.(this.interferenceBody);
        this.interferenceBody = null;
      }
      this.sync();
    }

    sync() {
      if (!this.active) return;
      if (this.body1Btn) {
        this.body1Btn.textContent = this.body1?.name || 'Select Body 1';
        this.body1Btn.classList.toggle('is-active', this.activeSlot === 1);
        this.body1Btn.style.borderColor = this.body1 ? '#0288d1' : '';
        this.body1Btn.style.color = this.body1 ? '#0288d1' : '';
      }

      if (this.body2Btn) {
        this.body2Btn.textContent = this.body2?.name || 'Select Body 2';
        this.body2Btn.classList.toggle('is-active', this.activeSlot === 2);
        this.body2Btn.style.borderColor = this.body2 ? '#8e24aa' : '';
        this.body2Btn.style.color = this.body2 ? '#8e24aa' : '';
      }

      if (this.statusHeader && this.statusIcon && this.statusText) {
        if (this.computing) {
          this.statusIcon.textContent = '⏳';
          this.statusText.textContent = 'Analyzing 3D geometry...';
          this.statusHeader.style.color = '#38bdf8';
          if (this.details) this.details.hidden = true;
        } else if (!this.body1 || !this.body2) {
          this.statusIcon.textContent = 'ℹ';
          this.statusText.textContent = !this.body1 && !this.body2
            ? 'Click bodies in 3D view or list'
            : `Click a body to set ${this.activeSlot === 1 ? 'Body 1' : 'Body 2'}`;
          this.statusHeader.style.color = '#94a3b8';
          if (this.details) this.details.hidden = true;
        } else if (this.result?.hasInterference) {
          this.statusIcon.textContent = '⚠';
          this.statusText.textContent = 'Interference Detected!';
          this.statusHeader.style.color = '#ef4444';
          if (this.details) this.details.hidden = false;
          if (this.volumeText) {
            this.volumeText.textContent = formatVolume(this.result.volume);
            this.volumeText.style.color = '#ef4444';
          }
          if (this.boundsText) this.boundsText.textContent = formatBounds(this.result.bounds);
        } else {
          this.statusIcon.textContent = '✓';
          this.statusText.textContent = 'No Interference (No Clash)';
          this.statusHeader.style.color = '#22c55e';
          if (this.details) this.details.hidden = false;
          if (this.volumeText) {
            this.volumeText.textContent = '0.00 mm³';
            this.volumeText.style.color = '#22c55e';
          }
          if (this.boundsText) this.boundsText.textContent = 'No collision';
        }
      }

      this.onModeChange?.(true);
      this.onChange();
    }

    displayBodies() {
      if (!this.active) return this.extrudeController.bodies;
      if (this.interferenceBody) {
        return [...this.extrudeController.bodies, this.interferenceBody];
      }
      return this.extrudeController.bodies;
    }

    renderOverlay(context, project) {
      if (!this.active) return;
      context.save();

      const drawBodyTag = (body, label, color) => {
        if (!body || body.visible === false || !body.mesh) return;
        const center = cad.bodyFaces?.bodyCenter?.(body);
        if (!center) return;
        const pt = project(center);
        context.font = 'bold 10px Arial, sans-serif';
        const txtWidth = context.measureText(label).width;
        context.fillStyle = 'rgba(15, 23, 42, 0.88)';
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.beginPath();
        if (context.roundRect) context.roundRect(pt[0] - txtWidth / 2 - 6, pt[1] - 12, txtWidth + 12, 18, 4);
        else context.rect(pt[0] - txtWidth / 2 - 6, pt[1] - 12, txtWidth + 12, 18);
        context.fill();
        context.stroke();
        context.fillStyle = color;
        context.fillText(label, pt[0] - txtWidth / 2, pt[1] + 1);

        if (cad.bodyFaces?.renderBodyHighlight) {
          cad.bodyFaces.renderBodyHighlight(context, project, body, {
            fill: color === '#0288d1' ? 'rgba(2, 136, 209, 0.12)' : 'rgba(142, 36, 170, 0.12)',
            stroke: color,
            lineWidth: 1.8,
            camera: this.camera
          });
        }
      };

      if (this.body1) drawBodyTag(this.body1, 'BODY 1', '#0288d1');
      if (this.body2) drawBodyTag(this.body2, 'BODY 2', '#8e24aa');

      if (this.result?.hasInterference && this.result.mesh) {
        const { vertices, triangles } = this.result.mesh;
        const projected = [];
        for (let i = 0; i < vertices.length; i += 3) {
          projected.push(project([vertices[i], vertices[i + 1], vertices[i + 2]]));
        }

        context.fillStyle = 'rgba(239, 68, 68, 0.65)';
        context.strokeStyle = '#dc2626';
        context.lineWidth = 1.6;

        for (let i = 0; i < triangles.length; i += 3) {
          const p1 = projected[triangles[i]];
          const p2 = projected[triangles[i + 1]];
          const p3 = projected[triangles[i + 2]];
          if (!p1 || !p2 || !p3) continue;
          context.beginPath();
          context.moveTo(...p1);
          context.lineTo(...p2);
          context.lineTo(...p3);
          context.closePath();
          context.fill();
          context.stroke();
        }

        if (this.result.center) {
          const cPt = project(this.result.center);
          const volStr = `⚠ CLASH: ${formatVolume(this.result.volume)}`;
          context.font = 'bold 11px Arial, sans-serif';
          const textWidth = context.measureText(volStr).width;
          const badgeX = cPt[0];
          const badgeY = cPt[1] - 26;

          context.fillStyle = 'rgba(15, 23, 42, 0.94)';
          context.strokeStyle = '#ef4444';
          context.lineWidth = 2.0;
          context.beginPath();
          if (context.roundRect) context.roundRect(badgeX - textWidth / 2 - 8, badgeY - 14, textWidth + 16, 22, 5);
          else context.rect(badgeX - textWidth / 2 - 8, badgeY - 14, textWidth + 16, 22);
          context.fill();
          context.stroke();

          context.fillStyle = '#fee2e2';
          context.fillText(volStr, badgeX - textWidth / 2, badgeY);

          context.beginPath();
          context.moveTo(badgeX, badgeY + 8);
          context.lineTo(cPt[0], cPt[1]);
          context.strokeStyle = '#ef4444';
          context.lineWidth = 1.5;
          context.stroke();

          context.beginPath();
          context.arc(cPt[0], cPt[1], 3.5, 0, Math.PI * 2);
          context.fillStyle = '#ef4444';
          context.fill();
        }
      }

      context.restore();
    }

    bodyAt(event) {
      if (cad.app?.faceSelection?.bodyAt) {
        const body = cad.app.faceSelection.bodyAt(event);
        if (body) return body;
      }
      return null;
    }

    bind() {
      this.body1Btn?.addEventListener('click', () => {
        this.activeSlot = 1;
        this.sync();
      });
      this.body2Btn?.addEventListener('click', () => {
        this.activeSlot = 2;
        this.sync();
      });
      this.clearBtn?.addEventListener('click', () => this.clear());
      this.closeBtn?.addEventListener('click', () => this.close());

      this.canvas?.addEventListener('click', event => {
        if (!this.active || event.button !== 0) return;
        const body = this.bodyAt(event);
        if (body) {
          this.setBody(body, this.activeSlot);
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

  cad.InterferenceController = InterferenceController;
})(window.WebCAD = window.WebCAD || {});
