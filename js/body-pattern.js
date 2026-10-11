(function (cad) {
  'use strict';

  const axes = {
    X: [1, 0, 0],
    Y: [0, 1, 0],
    Z: [0, 0, 1]
  };

  class BodyPatternController {
    constructor({ canvas, panel, camera, extrudeController, history, onChange, onBodiesChange, onStatus, onModeChange, onError }) {
      Object.assign(this, {
        canvas, panel, camera, extrudeController, history,
        onChange, onBodiesChange, onStatus, onModeChange, onError
      });

      this.title = panel.querySelector('#bodyPatternTitle');
      this.help = panel.querySelector('#bodyPatternHelp');
      this.typeRectBtn = panel.querySelector('#bodyPatternTypeRect');
      this.typeCircBtn = panel.querySelector('#bodyPatternTypeCirc');
      this.selectionBtn = panel.querySelector('#bodyPatternSelection');
      this.rectFields = panel.querySelector('#bodyPatternRectFields');
      this.circFields = panel.querySelector('#bodyPatternCircFields');
      this.dir1AxisSelect = panel.querySelector('#bodyPatternDir1Axis');
      this.dir1CountInput = panel.querySelector('#bodyPatternDir1Count');
      this.dir1DistInput = panel.querySelector('#bodyPatternDir1Dist');
      this.dir2AxisSelect = panel.querySelector('#bodyPatternDir2Axis');
      this.dir2CountInput = panel.querySelector('#bodyPatternDir2Count');
      this.dir2DistInput = panel.querySelector('#bodyPatternDir2Dist');
      this.circAxisSelect = panel.querySelector('#bodyPatternCircAxis');
      this.circCountInput = panel.querySelector('#bodyPatternCircCount');
      this.circAngleInput = panel.querySelector('#bodyPatternCircAngle');
      this.cancelBtn = panel.querySelector('#bodyPatternCancel');
      this.okBtn = panel.querySelector('#bodyPatternOk');

      this.active = false;
      this.mode = 'rectangular'; // 'rectangular' | 'circular'
      this.selectedBody = null;
      this.previewCopies = [];
      this.generation = 0;
      this.bind();
    }

    async open(mode = 'rectangular', initialBody = null) {
      if (!['rectangular', 'circular'].includes(mode)) mode = 'rectangular';
      if (this.active && this.mode === mode) {
        this.close();
        return true;
      }
      const visibleBodies = (this.extrudeController?.bodies || []).filter(b => b.visible !== false);
      if (!visibleBodies.length) {
        this.onStatus?.('PATTERN · Extrude a body first');
        return false;
      }

      this.generation++;
      this.active = true;
      this.mode = mode;
      this.selectedBody = initialBody && visibleBodies.includes(initialBody) ? initialBody : visibleBodies[0] || null;
      this.previewCopies = [];

      this.panel.hidden = false;
      this.canvas.classList.add('is-body-move');
      this.onModeChange?.(`pattern-${mode}`);
      this.syncUI();

      try {
        await cad.solidKernel.load();
        for (const body of this.extrudeController.bodies) {
          if (body.visible !== false && !body.mesh) {
            body.mesh = cad.solidKernel.meshBody(body);
          }
        }
        this.updatePreview();
      } catch (err) {
        this.onError?.({
          code: 'CAD-P001',
          title: 'Pattern Error',
          reason: err?.message || 'Failed to prepare solid bodies'
        });
      }
      return true;
    }

    close() {
      if (!this.active) return;
      this.generation++;
      this.active = false;
      this.selectedBody = null;
      this.previewCopies = [];
      this.panel.hidden = true;
      this.canvas.classList.remove('is-body-move');
      this.onModeChange?.(null);
      this.onStatus?.('3D VIEW');
      this.onChange();
    }

    setMode(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      this.syncUI();
      this.updatePreview();
    }

    setBody(body) {
      this.selectedBody = body;
      this.syncUI();
      this.updatePreview();
    }

    syncUI() {
      const isRect = this.mode === 'rectangular';
      this.title.textContent = isRect ? 'RECTANGULAR PATTERN' : 'CIRCULAR PATTERN';
      this.help.textContent = this.selectedBody ? 'Adjust pattern parameters.' : 'Click a body to select it.';
      this.typeRectBtn.classList.toggle('is-active', isRect);
      this.typeRectBtn.setAttribute('aria-pressed', String(isRect));
      this.typeCircBtn.classList.toggle('is-active', !isRect);
      this.typeCircBtn.setAttribute('aria-pressed', String(!isRect));
      this.rectFields.hidden = !isRect;
      this.circFields.hidden = isRect;
      this.selectionBtn.textContent = this.selectedBody ? (this.selectedBody.name || '1 Body Selected') : 'Select body';
      this.selectionBtn.classList.toggle('is-active', Boolean(this.selectedBody));
      this.okBtn.disabled = !this.selectedBody || !this.previewCopies.length;
    }

    updatePreview() {
      if (!this.active) return;
      this.previewCopies = [];
      if (!this.selectedBody || !this.selectedBody.mesh) {
        this.syncUI();
        this.onChange();
        return;
      }

      const body = this.selectedBody;
      const copies = [];

      if (this.mode === 'rectangular') {
        const axis1 = axes[this.dir1AxisSelect.value] || axes.X;
        const count1 = Math.max(1, parseInt(this.dir1CountInput.value, 10) || 1);
        const dist1 = parseFloat(this.dir1DistInput.value) || 0;

        const axis2 = axes[this.dir2AxisSelect.value] || axes.Y;
        const count2 = Math.max(1, parseInt(this.dir2CountInput.value, 10) || 1);
        const dist2 = parseFloat(this.dir2DistInput.value) || 0;

        for (let i = 0; i < count1; i++) {
          for (let j = 0; j < count2; j++) {
            if (i === 0 && j === 0) continue;
            const translation = [
              axis1[0] * dist1 * i + axis2[0] * dist2 * j,
              axis1[1] * dist1 * i + axis2[1] * dist2 * j,
              axis1[2] * dist1 * i + axis2[2] * dist2 * j
            ];
            try {
              const copy = cad.bodyMove.transformBody(body, translation, [0, 0, 0]);
              copy.id = `${body.id || 'body'}-rect-${i}-${j}-${Date.now().toString(36)}`;
              copy.name = `${body.name || 'Body'} (${i + 1},${j + 1})`;
              copy.isPatternPreview = true;
              copies.push(copy);
            } catch (_) {}
          }
        }
      } else {
        const axisKey = this.circAxisSelect.value;
        const count = Math.max(2, parseInt(this.circCountInput.value, 10) || 2);
        const totalAngle = parseFloat(this.circAngleInput.value) || 360;
        const pivot = cad.bodyMove.meshCenter(body);

        const isFullCircle = Math.abs(totalAngle - 360) < 0.01 || Math.abs(totalAngle + 360) < 0.01;
        const stepAngle = isFullCircle ? (totalAngle / count) : (totalAngle / (count - 1));

        for (let k = 1; k < count; k++) {
          const currentDeg = stepAngle * k;
          const rotation = [
            axisKey === 'X' ? currentDeg : 0,
            axisKey === 'Y' ? currentDeg : 0,
            axisKey === 'Z' ? currentDeg : 0
          ];
          try {
            const copy = cad.bodyMove.transformBody(body, [0, 0, 0], rotation, pivot);
            copy.id = `${body.id || 'body'}-circ-${k}-${Date.now().toString(36)}`;
            copy.name = `${body.name || 'Body'} (Rot ${k + 1})`;
            copy.isPatternPreview = true;
            copies.push(copy);
          } catch (_) {}
        }
      }

      this.previewCopies = copies;
      this.syncUI();
      this.onChange();
    }

    displayBodies() {
      const base = this.extrudeController?.bodies || [];
      if (!this.active || !this.previewCopies.length) return base;
      return [...base, ...this.previewCopies];
    }

    commit() {
      if (!this.active || !this.selectedBody || !this.previewCopies.length) return false;
      const copiesToAdd = this.previewCopies.map(b => {
        const copy = { ...b };
        delete copy.isPatternPreview;
        return copy;
      });

      const before = [...this.extrudeController.bodies];
      const after = [...before, ...copiesToAdd];

      const apply = bodies => {
        this.extrudeController.bodies = bodies;
        this.onBodiesChange?.();
        this.onChange();
      };

      this.history.execute({
        name: `${this.mode === 'circular' ? 'Circular' : 'Rectangular'} body pattern`, kind: 'solid',
        timelineTool: 'solidPatternMenuButton',
        execute: () => apply(after),
        undo: () => apply(before),
        redo: () => apply(after)
      });

      this.close();
      return true;
    }

    bind() {
      this.typeRectBtn?.addEventListener('click', () => this.setMode('rectangular'));
      this.typeCircBtn?.addEventListener('click', () => this.setMode('circular'));

      this.selectionBtn?.addEventListener('click', () => {
        const bodies = (this.extrudeController?.bodies || []).filter(b => b.visible !== false);
        if (bodies.length > 1) {
          const currentIndex = bodies.indexOf(this.selectedBody);
          const nextIndex = (currentIndex + 1) % bodies.length;
          this.setBody(bodies[nextIndex]);
        }
      });

      const inputChange = () => this.updatePreview();
      [
        this.dir1AxisSelect, this.dir1CountInput, this.dir1DistInput,
        this.dir2AxisSelect, this.dir2CountInput, this.dir2DistInput,
        this.circAxisSelect, this.circCountInput, this.circAngleInput
      ].forEach(el => {
        el?.addEventListener('input', inputChange);
        el?.addEventListener('change', inputChange);
      });

      this.cancelBtn?.addEventListener('click', () => this.close());
      this.okBtn?.addEventListener('click', () => this.commit());

      this.canvas?.addEventListener('click', event => {
        if (!this.active) return;
        const targetBody = window.WebCAD?.app?.faceSelection?.selectedBody ||
                           window.WebCAD?.app?.faceSelection?.selected?.body;
        if (targetBody && targetBody.visible !== false) {
          this.setBody(targetBody);
        }
      });

      document.addEventListener('keydown', event => {
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

  cad.BodyPatternController = BodyPatternController;
})(window.WebCAD = window.WebCAD || {});
