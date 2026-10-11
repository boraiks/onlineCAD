(function (cad) {
  'use strict';

  function workerConversion(mesh, options) {
    let worker;
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker = new Worker('js/mesh-solid-worker.js');
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (data.error) {
          const error = new Error(data.error);
          error.meshConversionError = true;
          reject(error);
        } else resolve(data.result);
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message || 'Mesh worker could not start'));
      };
      worker.postMessage({ mesh, options });
    });
    return { promise, cancel: () => {
      worker?.terminate();
      rejectJob?.(new DOMException('Conversion cancelled', 'AbortError'));
    } };
  }

  async function convertMesh(mesh, options = {}, setJob) {
    if (typeof Worker !== 'undefined' && /^https?:$/.test(globalThis.location?.protocol || '')) {
      try {
        const job = workerConversion(mesh, options);
        setJob?.(job);
        return await job.promise;
      } catch (error) {
        if (error?.meshConversionError || error?.name === 'AbortError') throw error;
        // Browsers or hosts that block workers still have the local conversion path.
      } finally {
        setJob?.(null);
      }
    }
    const module = await cad.solidKernel.load();
    return globalThis.WebCADMeshSolidCore.convert(module, mesh, options);
  }

  class MeshToSolidController {
    constructor({ canvas, panel, extrudeController, faceSelection, history,
      onChange, onBodiesChange, onStatus, onModeChange, onError }) {
      Object.assign(this, { canvas, panel, extrudeController, faceSelection, history,
        onChange, onBodiesChange, onStatus, onModeChange, onError });
      this.selectionBtn = panel.querySelector('#meshToSolidSelection') || panel.querySelector('#meshToSolidTarget');
      this.targetOutput = panel.querySelector('#meshToSolidTarget');
      this.detailOutput = panel.querySelector('#meshToSolidDetail');
      this.qualitySelect = panel.querySelector('#meshToSolidQuality');
      this.finishSelect = panel.querySelector('#meshToSolidFinish');
      this.geometrySelect = panel.querySelector('#meshToSolidGeometry');
      this.accuracySelect = panel.querySelector('#meshToSolidAccuracy');
      this.accuracyRow = panel.querySelector('#meshToSolidAccuracyRow');
      this.help = panel.querySelector('#meshToSolidHelp');
      this.convertBtn = panel.querySelector('#meshToSolidConvert');
      this.cancelBtn = panel.querySelector('#meshToSolidCancel');
      this.active = false;
      this.selectedBody = null;
      this.converting = false;
      this.job = null;
      this.bind();
    }

    open(initialBody = null) {
      if (this.active) { this.close(); return true; }
      const candidates = this.extrudeController.bodies.filter(body =>
        body.visible !== false && body.mesh && this.isCandidate(body));
      if (!candidates.length) {
        this.onStatus?.('MESH TO SOLID · Import a mesh or select a previously rebuilt solid');
        return false;
      }
      this.faceSelection?.clear();
      this.active = true;
      this.panel.hidden = false;
      this.onModeChange?.(true);
      this.selectBody(candidates.includes(initialBody) ? initialBody : null);
      this.onStatus?.('MESH TO SOLID · Click an imported mesh in the canvas or Browser');
      return true;
    }

    selectBody(body) {
      if (!this.active || this.converting) return false;
      if (body && (!this.isCandidate(body) || body.visible === false ||
          !this.extrudeController.bodies.includes(body))) {
        this.onStatus?.('MESH TO SOLID · Select an imported mesh or a rebuilt solid');
        return false;
      }
      if (this.selectedBody) this.selectedBody.convertSelected = false;
      this.selectedBody = body;
      if (body) body.convertSelected = true;
      if (body) {
        this.qualitySelect.value = 'full';
        this.geometrySelect.value = 'feature-fit';
      }
      if (body) this.finishSelect.value = '42';
      if (cad.bodyRenderer) cad.bodyRenderer.lastKey = null;
      this.syncUI();
      this.onBodiesChange?.();
      this.onChange?.();
      if (body) this.onStatus?.(`MESH TO SOLID · ${body.name} selected`);
      return true;
    }

    setBody(body) {
      return this.selectBody(body);
    }

    isCandidate(body) {
      return body?.meshSource === 'import' ||
        (body?.meshSource === 'solid' && body.rebuildSourceMesh &&
          body.rebuildResultMesh === body.mesh);
    }

    syncUI() {
      const body = this.selectedBody;
      const selectLabel = body?.name || 'Select body';
      if (this.targetOutput) this.targetOutput.textContent = selectLabel;
      if (this.selectionBtn) {
        this.selectionBtn.textContent = selectLabel;
        this.selectionBtn.classList.toggle('is-active', !body);
      }
      this.detailOutput.textContent = body
        ? `${Math.floor((body.rebuildSourceMesh || body.mesh).triangles.length / 3).toLocaleString()} source triangles`
        : 'No mesh selected';
      this.help.textContent = body
        ? this.geometrySelect.value === 'feature-fit'
          ? 'Recovers analytic CAD primitives (planes, cylinder bores/bosses, spheres) and rebuilds true curved surfaces with zero polygon facet chords.'
          : this.geometrySelect.value === 'rebuild'
            ? 'Rebuilds curved solid geometry with surface and volume limits against the imported mesh. If verification fails, the faceted solid is retained.'
            : this.qualitySelect.value === 'full'
              ? 'Keeps all original solid facets. The existing display preview stays optimized.'
              : 'Simplifies the actual solid for faster edits. Small geometric details can change; undo restores the imported mesh.'
        : 'Select an imported mesh on the model or in the Browser. Only closed, watertight meshes can become solids.';
      this.accuracyRow.hidden = this.geometrySelect.value !== 'rebuild' && this.geometrySelect.value !== 'feature-fit';
      this.convertBtn.disabled = !body || this.converting;
      this.cancelBtn.disabled = false;
    }

    close({ preserveStatus = false } = {}) {
      if (!this.active) return;
      this.job?.cancel();
      this.job = null;
      this.converting = false;
      if (this.selectedBody) this.selectedBody.convertSelected = false;
      this.selectedBody = null;
      this.active = false;
      this.panel.hidden = true;
      this.onModeChange?.(false);
      if (cad.bodyRenderer) cad.bodyRenderer.lastKey = null;
      this.onBodiesChange?.();
      this.onChange?.();
      if (!preserveStatus) this.onStatus?.('3D VIEW');
    }

    async convert() {
      const body = this.selectedBody;
      if (!this.active || !body || this.converting) return false;
      const sourceMesh = body.rebuildSourceMesh || body.mesh;
      this.converting = true;
      this.syncUI();
      this.onStatus?.(`MESH TO SOLID · Converting ${body.name}…`);
      // Paint the processing state before a file:// conversion runs on the UI thread.
      if (typeof requestAnimationFrame === 'function')
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      try {
        if (!this.active || this.selectedBody !== body) return false;
        const converted = await convertMesh(sourceMesh, { quality: this.qualitySelect.value,
          geometry: this.geometrySelect.value, accuracy: Number(this.accuracySelect.value) },
          job => { this.job = job; });
        if (!this.active || this.selectedBody !== body) return false;
        const oldState = { name: body.name, mesh: body.mesh,
          renderMesh: body.renderMesh || null, displayReduction: body.displayReduction || 0,
          meshSource: body.meshSource, surfaceFinishAngle: body.surfaceFinishAngle || 0,
          rebuildSourceMesh: body.rebuildSourceMesh || null,
          rebuildResultMesh: body.rebuildResultMesh || null };
        const rebuiltMesh = { vertices: converted.vertices, triangles: converted.triangles,
          triangleCount: converted.triangleCount, vertexCount: converted.vertexCount };
        const newState = { ...oldState,
          name: body.name.replace(/ \(Mesh\)$/, ' (Solid)'),
          mesh: rebuiltMesh,
          renderMesh: converted.optimized || body.meshSource === 'solid' ? null : oldState.renderMesh,
          displayReduction: converted.optimized || body.meshSource === 'solid' ? 0 : oldState.displayReduction,
          meshSource: 'solid', surfaceFinishAngle: Number(this.finishSelect.value),
          rebuildSourceMesh: sourceMesh, rebuildResultMesh: rebuiltMesh };
        const apply = state => {
          if (this.faceSelection?.selected?.body === body || this.faceSelection?.selectedBody === body)
            this.faceSelection.clear();
          Object.assign(body, state);
          cad.bodyRenderer?.invalidateFinish?.(body);
          this.onBodiesChange?.();
          this.onChange?.();
        };
        this.history.execute({ name: `Mesh to solid · ${body.name}`, kind: 'solid', timelineTool: 'meshToSolidBtn',
          execute: () => apply(newState),
          undo: () => apply(oldState), redo: () => apply(newState) });
        this.close({ preserveStatus: true });
        this.faceSelection?.selectBody(body);
        let rebuildNote = '';
        if (converted.featureFitApplied) {
          const parts = [];
          if (converted.featureSummary) {
            for (const [type, count] of Object.entries(converted.featureSummary)) {
              parts.push(`${count} ${type}${count > 1 ? 's' : ''}`);
            }
          }
          const featStr = parts.length ? parts.join(', ') : 'features fitted';
          rebuildNote = ` · analytic feature fit (${featStr}), true curvature recovered`;
        } else if (converted.rebuildApplied) {
          rebuildNote = ` · rebuilt surface verified within ${(Number(this.accuracySelect.value) * 100).toFixed(1)}% shape tolerance, largest checked shift ${converted.rebuildDeviation.toFixed(3)} units, volume change ${(converted.rebuildVolumeChange * 100).toFixed(2)}%`;
        } else if (converted.rebuildReason) {
          rebuildNote = ` · surface rebuild skipped: ${converted.rebuildReason}`;
        }
        this.onStatus?.(`MESH TO SOLID · ${body.name}: ${converted.originalTriangles.toLocaleString()} → ${converted.triangleCount.toLocaleString()} triangles, ${converted.volume.toFixed(2)} mm³${rebuildNote}`);
        return true;
      } catch (error) {
        if (error?.name !== 'AbortError') {
          this.onError?.({ code: 'CAD-M201', title: 'Mesh to Solid failed',
            reason: error?.message || 'The mesh could not be converted.' });
          this.onStatus?.('MESH TO SOLID · Repair the mesh and try again');
        }
        return false;
      } finally {
        this.job = null;
        this.converting = false;
        if (this.active) this.syncUI();
      }
    }

    bind() {
      document.querySelector('.toolbar')?.addEventListener('click', event => {
        if (this.active && !event.target.closest('#meshToSolidBtn')) this.close();
      }, { capture: true });
      this.canvas?.addEventListener?.('click', event => {
        if (!this.active || this.converting || event.button !== 0 || event.defaultPrevented) return;
        const body = this.faceSelection?.bodyAt(event);
        if (this.isCandidate(body)) this.selectBody(body);
        else this.onStatus?.('MESH TO SOLID · Click an imported mesh or a rebuilt solid');
      });
      this.selectionBtn?.addEventListener('click', () => {
        if (this.selectedBody) {
          this.selectBody(null);
          this.onStatus?.('MESH TO SOLID · Click a mesh in the canvas or Browser');
        }
      });
      this.convertBtn.addEventListener('click', () => this.convert());
      this.cancelBtn.addEventListener('click', () => this.close());
      this.qualitySelect.addEventListener('change', () => this.syncUI());
      this.geometrySelect.addEventListener('change', () => this.syncUI());
    }
  }

  cad.meshToSolid = { MeshToSolidController, convertMesh };
})(window.WebCAD = window.WebCAD || {});
