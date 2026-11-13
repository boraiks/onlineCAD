(function (cad) {
  'use strict';

  // Fill Hollow: fills enclosed cavities exactly and, with an opening size,
  // the interior of shells that are open through windows or vents.
  function runFill(mesh, options, setJob) {
    const local = async () => {
      const module = await cad.solidKernel.load();
      return globalThis.WebCADMeshFillCore.fillHollow(module, mesh, options);
    };
    if (typeof Worker === 'undefined' || !/^https?:$/.test(globalThis.location?.protocol || '')) return local();
    let worker;
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker = new Worker('js/mesh-solid-worker.js');
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (data.error) reject(Object.assign(new Error(data.error), { fillError: true }));
        else resolve(data.result);
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message || 'Fill worker could not start'));
      };
      worker.postMessage({ mesh: { vertices: mesh.vertices, triangles: mesh.triangles },
        options: { ...options, operation: 'fill-hollow' } });
    });
    setJob?.({ cancel: () => {
      worker?.terminate();
      rejectJob?.(new DOMException('Fill cancelled', 'AbortError'));
    } });
    // Hosts that block workers still have the main-thread path.
    return promise.catch(error => {
      if (error?.fillError || error?.name === 'AbortError') throw error;
      return local();
    });
  }

  class MeshFillController {
    constructor({ canvas, panel, extrudeController, faceSelection, history,
      onChange, onBodiesChange, onStatus, onModeChange, onError }) {
      Object.assign(this, { canvas, panel, extrudeController, faceSelection, history,
        onChange, onBodiesChange, onStatus, onModeChange, onError });
      this.selectionBtn = panel.querySelector('#meshFillSelection');
      this.gapInput = panel.querySelector('#meshFillGap');
      this.detailSelect = panel.querySelector('#meshFillDetail');
      this.help = panel.querySelector('#meshFillHelp');
      this.applyBtn = panel.querySelector('#meshFillOk');
      this.cancelBtn = panel.querySelector('#meshFillCancel');
      this.active = false;
      this.selectedBody = null;
      this.running = false;
      this.job = null;
      this.bind();
    }

    candidates() {
      return this.extrudeController.bodies.filter(body => body.visible !== false && body.mesh?.triangles?.length);
    }

    open(initialBody = null) {
      if (this.active) { this.close(); return true; }
      if (!this.candidates().length) {
        this.onStatus?.('FILL HOLLOW · Import or create a body first');
        return false;
      }
      this.faceSelection?.clear();
      this.active = true;
      this.panel.hidden = false;
      this.onModeChange?.(true);
      this.setBody(this.candidates().includes(initialBody) ? initialBody : null);
      if (!this.selectedBody) this.onStatus?.('FILL HOLLOW · Click a body in the canvas or Browser');
      return true;
    }

    setBody(body) {
      if (!this.active || this.running) return false;
      if (body && !this.candidates().includes(body)) return false;
      this.selectedBody = body;
      this.syncUI();
      this.onBodiesChange?.();
      this.onChange?.();
      if (body) this.onStatus?.(`FILL HOLLOW · ${body.name} selected`);
      return true;
    }

    syncUI() {
      const body = this.selectedBody;
      this.selectionBtn.textContent = body?.name || 'Select body';
      this.selectionBtn.classList.toggle('is-active', !body);
      const gap = Number(this.gapInput.value) || 0;
      this.help.textContent = this.running
        ? 'Filling… large meshes can take a minute.'
        : gap > 0
          ? `Fills enclosed cavities and closes openings up to ${gap} mm (windows, vents) to fill the open interior. The outside surface is kept.`
          : 'Fills fully enclosed cavities exactly. For a shell that is open through windows or vents, set the size of the largest opening.';
      this.applyBtn.disabled = !body || this.running;
      this.gapInput.disabled = this.running;
      this.detailSelect.disabled = this.running;
    }

    close({ preserveStatus = false } = {}) {
      if (!this.active) return;
      this.job?.cancel();
      this.job = null;
      this.running = false;
      this.selectedBody = null;
      this.active = false;
      this.panel.hidden = true;
      this.onModeChange?.(false);
      this.onBodiesChange?.();
      this.onChange?.();
      if (!preserveStatus) this.onStatus?.('3D VIEW');
    }

    async apply() {
      const body = this.selectedBody;
      if (!this.active || !body || this.running) return false;
      const closeGap = Math.max(0, Number(this.gapInput.value) || 0);
      this.running = true;
      this.syncUI();
      this.onStatus?.(`FILL HOLLOW · Filling ${body.name}…`);
      // Let the busy state paint first; background tabs never fire animation frames.
      await new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
        setTimeout(resolve, 100);
      });
      try {
        const result = await runFill(body.mesh, { closeGap, resolution: Number(this.detailSelect.value) || 160 },
          job => { this.job = job; });
        if (!this.active || this.selectedBody !== body) return false;
        const fields = ['mesh', 'renderMesh', 'displayReduction', 'meshSource', 'cells',
          'rebuildSourceMesh', 'rebuildResultMesh'];
        const oldState = Object.fromEntries(fields.map(key => [key, body[key] ?? null]));
        const filledMesh = { vertices: result.vertices, triangles: result.triangles };
        const newState = { mesh: filledMesh, renderMesh: null, displayReduction: 0, cells: null,
          meshSource: body.meshSource === 'solid' ? 'solid' : 'mesh',
          rebuildSourceMesh: null, rebuildResultMesh: null };
        const applyState = state => {
          if (this.faceSelection?.selected?.body === body || this.faceSelection?.selectedBody === body)
            this.faceSelection.clear();
          Object.assign(body, state);
          cad.bodyRenderer?.invalidateFinish?.(body);
          if (cad.bodyRenderer) cad.bodyRenderer.lastKey = null;
          this.onBodiesChange?.();
          this.onChange?.();
        };
        this.history.execute({ name: `Fill hollow · ${body.name}`, kind: 'solid', timelineTool: 'meshFillBtn',
          execute: () => applyState(newState), undo: () => applyState(oldState), redo: () => applyState(newState) });
        this.close({ preserveStatus: true });
        this.faceSelection?.selectBody(body);
        const parts = [];
        if (result.cavitiesFilled) parts.push(`${result.cavitiesFilled} enclosed cavit${result.cavitiesFilled === 1 ? 'y' : 'ies'} filled`);
        if (result.voxelSize) parts.push(`open interior closed at ${result.voxelSize.toFixed(2)} mm detail`);
        if (result.approximate) parts.push('approximate: the surface was open');
        this.onStatus?.(`FILL HOLLOW · ${body.name}: +${result.addedVolume.toFixed(1)} mm³${parts.length ? ` · ${parts.join(', ')}` : ''}`);
        return true;
      } catch (error) {
        if (error?.name !== 'AbortError') {
          this.onError?.({ code: 'CAD-M301', title: 'Fill Hollow failed', reason: error?.message || 'The body could not be filled.' });
          this.onStatus?.('FILL HOLLOW · Adjust the opening size and try again');
        }
        return false;
      } finally {
        this.job = null;
        this.running = false;
        if (this.active) this.syncUI();
      }
    }

    bind() {
      document.querySelector('.toolbar')?.addEventListener('click', event => {
        if (this.active && !event.target.closest('#meshFillBtn')) this.close();
      }, { capture: true });
      this.canvas?.addEventListener?.('click', event => {
        if (!this.active || this.running || event.button !== 0 || event.defaultPrevented) return;
        const body = this.faceSelection?.bodyAt(event);
        if (body) this.setBody(body);
      });
      this.selectionBtn.addEventListener('click', () => {
        if (this.selectedBody) {
          this.setBody(null);
          this.onStatus?.('FILL HOLLOW · Click a body in the canvas or Browser');
        }
      });
      this.gapInput.addEventListener('input', () => this.syncUI());
      this.gapInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); this.apply(); }
      });
      this.applyBtn.addEventListener('click', () => this.apply());
      this.cancelBtn.addEventListener('click', () => this.close());
    }
  }

  cad.meshFill = { MeshFillController, runFill };
})(window.WebCAD = window.WebCAD || {});
