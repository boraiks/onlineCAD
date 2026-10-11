/**
 * onlineCAD - Mesh Decimator & Polygonizer
 * High-performance 3D mesh polygon reduction and simplification.
 * Supports:
 *  - Fast Spatial Vertex Clustering (O(N), robust against non-manifold/dirty internet STLs)
 *  - Manifold Wasm Tolerance Decimation (for watertight solids)
 *  - Interactive preview and undo/redo history integration
 */
(function (cad) {
  'use strict';

  const workerUrl = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('mesh-worker.js', document.currentScript.src).href : null;

  function workerJob(type, payload, transfer = []) {
    if (!workerUrl || typeof Worker === 'undefined') throw new Error('Mesh worker unavailable');
    let blobUrl = null;
    let worker;
    if (workerUrl.startsWith('file:')) {
      if (type === 'parse' && payload.format !== 'stl') throw new Error('Local worker supports STL parsing');
      const stlSource = cad.importers?.stlWorkerSource || '';
      const source = `${stlSource}\n${decimateGridClustering.toString()}\n` +
        `self.onmessage = ({data}) => { try {
          const result = data.type === 'parse' ? parseSTL(data.input)
            : decimateGridClustering(data.mesh, { ratio: data.ratio });
          const vertices = Float32Array.from(result.vertices);
          const triangles = Uint32Array.from(result.triangles);
          self.postMessage({ ...result, vertices, triangles }, [vertices.buffer, triangles.buffer]);
        } catch(error) { self.postMessage({error: error?.message || String(error)}); } };`;
      blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try { worker = new Worker(blobUrl); }
      catch (error) { URL.revokeObjectURL(blobUrl); throw error; }
    } else {
      worker = new Worker(workerUrl);
    }
    const finish = () => { worker.terminate(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
    let settled = false;
    let rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker.onmessage = ({ data }) => {
        if (settled) return;
        settled = true;
        finish();
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      worker.onerror = event => {
        if (settled) return;
        settled = true;
        finish();
        reject(new Error(event.message || 'Mesh worker failed'));
      };
      try { worker.postMessage({ type, ...payload }, transfer); }
      catch (error) { settled = true; finish(); reject(error); }
    });
    return {
      promise,
      cancel() {
        if (settled) return;
        settled = true;
        finish();
        rejectJob(new DOMException('Mesh job cancelled', 'AbortError'));
      },
    };
  }

  /**
   * Fast Spatial Grid Clustering Decimation.
   * Works on ANY mesh topology (open, non-manifold, disjoint, self-intersecting).
   *
   * @param {Object} mesh - { vertices: Array|Float32Array, triangles: Array|Uint32Array }
   * @param {Object} options - { ratio: 0.1..0.95, targetTriangles: number }
   * @returns {Object} { vertices: Float32Array, triangles: Uint32Array, originalTriangles, decimatedTriangles }
   */
  function decimateGridClustering(mesh, options = {}) {
    const rawVertices = mesh.vertices;
    const rawTriangles = mesh.triangles;
    const vCount = Math.floor(rawVertices.length / 3);
    const tCount = Math.floor(rawTriangles.length / 3);
    const unchanged = () => ({
      vertices: Float32Array.from(rawVertices), triangles: Uint32Array.from(rawTriangles),
      originalTriangles: tCount, decimatedTriangles: tCount, reductionRatio: 0,
    });
    if (options.ratio === 0) return unchanged();
    if (tCount <= 12 || vCount < 3) return unchanged();

    const ratio = Math.max(0.05, Math.min(0.98, options.ratio ?? 0.75));
    const targetTriangles = Math.max(12, Math.min(tCount,
      Math.round(options.targetTriangles ?? tCount * (1 - ratio))));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < rawVertices.length; i += 3) {
      const x = rawVertices[i], y = rawVertices[i + 1], z = rawVertices[i + 2];
      if (!Number.isFinite(x + y + z)) throw new Error('Mesh contains invalid coordinates');
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    if (!(maxDim > 0)) return unchanged();

    const buildAt = step => {
      const cells = new Map();
      const remap = new Uint32Array(vCount);
      const sums = [];
      for (let i = 0; i < vCount; i++) {
        const x = rawVertices[i * 3], y = rawVertices[i * 3 + 1], z = rawVertices[i * 3 + 2];
        const key = `${Math.floor((x - minX) / step)},${Math.floor((y - minY) / step)},${Math.floor((z - minZ) / step)}`;
        let index = cells.get(key);
        if (index === undefined) {
          index = sums.length;
          cells.set(key, index);
          sums.push([x, y, z, 1]);
        } else {
          const cell = sums[index];
          cell[0] += x; cell[1] += y; cell[2] += z; cell[3]++;
        }
        remap[i] = index;
      }
      const triangles = [];
      const seen = new Set();
      const used = new Int32Array(sums.length).fill(-1);
      const vertices = [];
      const compact = index => {
        if (used[index] < 0) {
          const c = sums[index];
          used[index] = vertices.length / 3;
          vertices.push(c[0] / c[3], c[1] / c[3], c[2] / c[3]);
        }
        return used[index];
      };
      for (let t = 0; t < tCount; t++) {
        const a = rawTriangles[t * 3], b = rawTriangles[t * 3 + 1], c = rawTriangles[t * 3 + 2];
        if (a >= vCount || b >= vCount || c >= vCount) continue;
        const i0 = remap[a], i1 = remap[b], i2 = remap[c];
        if (i0 === i1 || i1 === i2 || i2 === i0) continue;
        const key = [i0, i1, i2].sort((x, y) => x - y).join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        triangles.push(compact(i0), compact(i1), compact(i2));
      }
      return {
        vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles),
        originalTriangles: tCount, decimatedTriangles: triangles.length / 3,
        reductionRatio: 1 - triangles.length / 3 / tCount,
      };
    };

    // Search cell sizes against the *actual* triangle count. Grid clustering cannot
    // guarantee an exact count, so retain the closest valid result and show it in UI.
    let low = Math.max(maxDim / 65536, 1e-9);
    let high = maxDim / 2;
    let best = unchanged();
    let bestDistance = Math.abs(tCount - targetTriangles);
    for (let pass = 0; pass < 9; pass++) {
      const step = Math.sqrt(low * high);
      const candidate = buildAt(step);
      const count = candidate.decimatedTriangles;
      if (count >= 4 && Math.abs(count - targetTriangles) < bestDistance) {
        best = candidate;
        bestDistance = Math.abs(count - targetTriangles);
      }
      if (bestDistance <= Math.max(2, targetTriangles * 0.02)) break;
      if (count > targetTriangles) low = step;
      else high = step;
    }
    return best;
  }

  /**
   * Manifold Wasm Simplification (for closed watertight bodies).
   */
  async function decimateManifold(mesh, options = {}) {
    if (!cad.solidKernel) throw new Error('Solid kernel not available');
    const module = await cad.solidKernel.load();
    const ratio = Math.max(0.05, Math.min(0.98, options.ratio ?? 0.75));

    // Estimate tolerance based on bounding box and ratio
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i], y = mesh.vertices[i + 1], z = mesh.vertices[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 10;
    // Tolerance scales from 0.001 to 0.05 of bounding box
    const tolerance = maxDim * (0.001 + ratio * 0.04);

    const manifoldMesh = new module.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(mesh.vertices),
      triVerts: new Uint32Array(mesh.triangles),
    });

    const solid = new module.Manifold(manifoldMesh);
    try {
      const simplified = solid.simplify(tolerance);
      try {
        const resultMesh = simplified.getMesh();
        const vertices = [];
        for (let i = 0; i < resultMesh.vertProperties.length; i += resultMesh.numProp) {
          vertices.push(
            resultMesh.vertProperties[i],
            resultMesh.vertProperties[i + 1],
            resultMesh.vertProperties[i + 2]
          );
        }
        const originalTriangles = Math.floor(mesh.triangles.length / 3);
        const decimatedTriangles = Math.floor(resultMesh.triVerts.length / 3);
        return {
          vertices: new Float32Array(vertices),
          triangles: new Uint32Array(resultMesh.triVerts),
          originalTriangles,
          decimatedTriangles,
          reductionRatio: originalTriangles > 0 ? (1 - decimatedTriangles / originalTriangles) : 0,
        };
      } finally {
        simplified.delete();
      }
    } finally {
      solid.delete();
    }
  }

  /**
   * Unified decimation dispatcher.
   */
  async function decimateMesh(mesh, options = {}) {
    const method = options.method || 'grid';
    if (method === 'manifold') {
      try {
        return await decimateManifold(mesh, options);
      } catch (err) {
        // Fall back gracefully to grid clustering if mesh is non-manifold
        return decimateGridClustering(mesh, options);
      }
    }
    return decimateGridClustering(mesh, options);
  }

  /**
   * Controller for the UI Decimate Panel & Interactive Simplification.
   */
  class MeshDecimatorController {
    constructor({
      canvas,
      panel,
      extrudeController,
      faceSelection,
      history,
      onChange,
      onBodiesChange,
      onStatus,
      onModeChange,
      onError,
    }) {
      Object.assign(this, {
        canvas,
        panel,
        extrudeController,
        faceSelection,
        history,
        onChange,
        onBodiesChange,
        onStatus,
        onModeChange,
        onError,
      });

      this.title = panel.querySelector('#meshDecimateTitle');
      this.help = panel.querySelector('#meshDecimateHelp');
      this.selectionBtn = panel.querySelector('#meshDecimateSelection');
      this.origCountOutput = panel.querySelector('#meshDecimateOriginalCount');
      this.targetCountOutput = panel.querySelector('#meshDecimateTargetCount');
      this.ratioLabel = panel.querySelector('#meshDecimateRatioLabel');
      this.slider = panel.querySelector('#meshDecimateSlider');
      this.methodSelect = panel.querySelector('#meshDecimateMethod');
      this.cancelBtn = panel.querySelector('#meshDecimateCancel');
      this.okBtn = panel.querySelector('#meshDecimateOk');
      this.presetBtns = panel.querySelectorAll('.decimate-presets .preset-btn');

      this.active = false;
      this.selectedBody = null;
      this.originalMesh = null;
      this.previewMesh = null;
      this.previewBody = null;
      this.pendingDecimation = null;
      this.previewTimer = null;

      this.bind();
    }

    async open(initialBody = null) {
      if (this.active) {
        this.close();
        return true;
      }
      const visibleBodies = (this.extrudeController?.bodies || []).filter(b => b.visible !== false && b.mesh);
      if (!visibleBodies.length) {
        this.onStatus?.('DECIMATE · No 3D solid bodies found to simplify');
        return false;
      }

      this.active = true;
      this.selectedBody = initialBody && visibleBodies.includes(initialBody) ? initialBody : null;
      this.originalMesh = this.selectedBody?.mesh || null;
      if (this.selectedBody) {
        this.slider.value = this.selectedBody.displayReduction > 0
          ? String(Math.round(this.selectedBody.displayReduction * 100 / 5) * 5) : '75';
      }
      this.previewMesh = null;
      this.previewBody = null;

      this.panel.hidden = false;
      this.onModeChange?.('mesh-decimate');
      this.syncUI();
      if (this.selectedBody) {
        await this.updatePreview();
      } else {
        this.onStatus?.('DECIMATE · Click a mesh body in the viewport or Browser');
      }
      return true;
    }

    close({ preserveStatus = false } = {}) {
      if (!this.active) return;
      clearTimeout(this.previewTimer);
      this.pendingDecimation?.cancel();
      this.pendingDecimation = null;
      if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
      this.active = false;
      this.selectedBody = null;
      this.originalMesh = null;
      this.previewMesh = null;
      this.previewBody = null;
      this.panel.hidden = true;
      this.onModeChange?.(null);
      if (!preserveStatus) this.onStatus?.('3D VIEW');
      this.onChange?.();
    }

    setBody(body) {
      if (!body) {
        this.selectedBody = null;
        this.originalMesh = null;
        if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
        this.previewBody = null;
        this.previewMesh = null;
        this.syncUI();
        this.onStatus?.('DECIMATE · Click a mesh body in the viewport or Browser');
        return;
      }
      if (body === this.selectedBody) return;
      clearTimeout(this.previewTimer);
      this.pendingDecimation?.cancel();
      this.pendingDecimation = null;
      if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
      this.selectedBody = body;
      this.originalMesh = body.mesh || null;
      this.slider.value = body.displayReduction > 0
        ? String(Math.round(body.displayReduction * 100 / 5) * 5) : '75';
      this.previewMesh = null;
      this.previewBody = null;
      this.syncUI();
      this.onStatus?.(`DECIMATE · ${body.name} selected`);
      this.updatePreview();
    }

    syncUI() {
      if (!this.selectedBody || !this.originalMesh) {
        this.selectionBtn.textContent = 'Select body';
        this.selectionBtn.classList.add('is-active');
        this.origCountOutput.textContent = 'Select a body';
        this.targetCountOutput.textContent = '-';
        this.okBtn.disabled = true;
        return;
      }

      this.selectionBtn.classList.remove('is-active');

      const origTris = Math.floor(this.originalMesh.triangles.length / 3);
      const ratio = Number(this.slider.value);

      this.selectionBtn.textContent = this.selectedBody.name || '1 Body Selected';
      this.origCountOutput.textContent = `${origTris.toLocaleString()} triangles (${Math.floor(this.originalMesh.vertices.length / 3).toLocaleString()} vertices)`;
      this.ratioLabel.textContent = `${ratio}%`;

      const estTarget = Math.max(12, Math.round(origTris * (1 - ratio / 100)));
      this.targetCountOutput.textContent = `~${estTarget.toLocaleString()} triangles (-${ratio}%)`;
      this.okBtn.disabled = !this.previewMesh || Boolean(this.pendingDecimation);

      this.presetBtns?.forEach(btn => {
        const btnRatio = parseInt(btn.dataset.ratio, 10);
        btn.classList.toggle('is-active', btnRatio === ratio);
      });
    }

    async updatePreview() {
      if (!this.active || !this.selectedBody || !this.originalMesh) return;
      this.pendingDecimation?.cancel();
      const ratio = Number(this.slider.value) / 100;
      const body = this.selectedBody;
      const source = this.originalMesh;
      if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
      this.previewBody = null;
      this.previewMesh = null;
      this.okBtn.disabled = true;
      this.targetCountOutput.textContent = 'Preparing display mesh…';
      let job;
      try {
        if (ratio === 0) job = { cancel() {}, promise: Promise.resolve({ vertices: source.vertices,
          triangles: source.triangles, decimatedTriangles: source.triangles.length / 3,
          reductionRatio: 0 }) };
        else {
          try { job = workerJob('simplify', { mesh: source, ratio }); }
          catch { job = { promise: Promise.resolve(decimateGridClustering(source, { ratio })) }; }
        }
        this.pendingDecimation = job;
        const result = await job.promise;
        if (!this.active || this.pendingDecimation !== job || this.selectedBody !== body) return;
        if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
        this.previewMesh = {
          vertices: result.vertices,
          triangles: result.triangles,
        };

        this.previewBody = {
          ...body,
          id: `${body.id}-preview`,
          renderMesh: this.previewMesh,
          isDecimatePreview: true,
        };

        this.targetCountOutput.textContent = `${result.decimatedTriangles.toLocaleString()} triangles (-${Math.round(result.reductionRatio * 100)}%)`;
        this.okBtn.disabled = false;
        this.onChange?.();
      } catch (err) {
        if (err?.name === 'AbortError' || !this.active || this.pendingDecimation !== job) return;
        this.onError?.({
          code: 'CAD-D001',
          title: 'Decimation Error',
          reason: err?.message || 'Failed to simplify mesh',
        });
      } finally {
        if (this.pendingDecimation === job) this.pendingDecimation = null;
      }
    }

    displayBodies() {
      const base = this.extrudeController?.bodies || [];
      if (!this.active || !this.previewBody || !this.selectedBody) return base;
      return base.map(b => (b === this.selectedBody ? this.previewBody : b));
    }

    commit() {
      if (!this.active || !this.selectedBody || !this.previewMesh) return false;

      const body = this.selectedBody;
      const oldMesh = body.renderMesh || null;
      const oldRatio = body.displayReduction || 0;
      const newRatio = Number(this.slider.value) / 100;
      const newMesh = newRatio === 0 ? null : this.previewMesh;

      const apply = (m, ratio) => {
        body.renderMesh = m;
        body.displayReduction = ratio;
        cad.bodyRenderer?.releaseBody?.(body);
        this.onBodiesChange?.();
        this.onChange?.();
      };

      this.history.execute({
        name: `Display mesh detail · ${body.name}`, kind: 'mesh',
        execute: () => apply(newMesh, newRatio),
        undo: () => apply(oldMesh, oldRatio),
        redo: () => apply(newMesh, newRatio),
      });

      const origTris = Math.floor(this.originalMesh.triangles.length / 3);
      const newTris = Math.floor((newMesh || body.mesh).triangles.length / 3);
      const reduction = Math.round((1 - newTris / origTris) * 100);
      this.onStatus?.(`DISPLAY MESH · ${body.name || 'Body'}: ${origTris.toLocaleString()} → ${newTris.toLocaleString()} triangles (-${reduction}%); original preserved`);

      this.close({ preserveStatus: true });
      return true;
    }

    bind() {
      this.canvas?.addEventListener?.('click', event => {
        if (!this.active || event.button !== 0 || event.defaultPrevented) return;
        const body = this.faceSelection?.bodyAt(event);
        if (body && body.visible !== false && body.mesh) {
          this.setBody(body);
        }
      });

      this.selectionBtn?.addEventListener('click', () => {
        const bodies = (this.extrudeController?.bodies || []).filter(b => b.visible !== false && b.mesh);
        if (!this.selectedBody && bodies.length) {
          this.setBody(bodies[0]);
        } else if (bodies.length > 1) {
          const currentIndex = bodies.indexOf(this.selectedBody);
          const nextIndex = (currentIndex + 1) % bodies.length;
          this.setBody(bodies[nextIndex]);
        } else if (this.selectedBody) {
          this.setBody(null);
        }
      });

      this.slider?.addEventListener('input', () => {
        clearTimeout(this.previewTimer);
        this.pendingDecimation?.cancel();
        this.pendingDecimation = null;
        if (this.previewBody) cad.bodyRenderer?.releaseBody?.(this.previewBody);
        this.previewBody = null;
        this.previewMesh = null;
        this.okBtn.disabled = true;
        this.syncUI();
        this.previewTimer = setTimeout(() => this.updatePreview(), 180);
      });

      this.slider?.addEventListener('change', () => {
        clearTimeout(this.previewTimer);
        this.updatePreview();
      });

      this.presetBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
          const ratio = parseInt(btn.dataset.ratio, 10);
          if (Number.isFinite(ratio)) {
            this.slider.value = String(ratio);
            this.syncUI();
            this.updatePreview();
          }
        });
      });

      this.methodSelect?.addEventListener('change', () => {
        this.updatePreview();
      });

      this.cancelBtn?.addEventListener('click', () => this.close());
      this.okBtn?.addEventListener('click', () => this.commit());
    }
  }

  // Export
  cad.meshDecimator = {
    decimateGridClustering,
    decimateManifold,
    decimateMesh,
    workerJob,
    MeshDecimatorController,
  };
})(window.WebCAD = window.WebCAD || {});
