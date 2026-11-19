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
          const vertices = result.vertices instanceof Float32Array && result.vertices.byteOffset === 0 &&
            result.vertices.byteLength === result.vertices.buffer.byteLength
            ? result.vertices : Float32Array.from(result.vertices);
          const triangles = result.triangles instanceof Uint32Array && result.triangles.byteOffset === 0 &&
            result.triangles.byteLength === result.triangles.buffer.byteLength
            ? result.triangles : Uint32Array.from(result.triangles);
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
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    if (!(maxDim > 0)) return unchanged();

    const remap = new Uint32Array(vCount);
    const estVerts = Math.max(64, Math.min(vCount, targetTriangles * 2));
    let cellCap = 64;
    while (cellCap < estVerts * 2) cellCap <<= 1;
    let cellMask = cellCap - 1;
    let cellBuckets = new Int32Array(cellCap);
    let cellMax = cellCap >> 1;
    let cellGx = new Int32Array(cellMax);
    let cellGy = new Int32Array(cellMax);
    let cellGz = new Int32Array(cellMax);

    let triCap = 64;
    const estTris = Math.max(64, Math.min(tCount, targetTriangles * 2));
    while (triCap < estTris * 2) triCap <<= 1;
    let triMask = triCap - 1;
    let triBuckets = new Int32Array(triCap);
    let triMax = triCap >> 1;
    let triK0 = new Uint32Array(triMax);
    let triK1 = new Uint32Array(triMax);
    let triK2 = new Uint32Array(triMax);

    const clusterCells = (step, wantSums) => {
      const invStep = 1 / step;
      cellBuckets.fill(-1);
      let count = 0;

      const rehashCells = () => {
        cellCap <<= 1;
        cellMask = cellCap - 1;
        cellBuckets = new Int32Array(cellCap).fill(-1);
        for (let k = 0; k < count; k++) {
          let h = (Math.imul(cellGx[k], 73856093) ^
            Math.imul(cellGy[k], 19349663) ^
            Math.imul(cellGz[k], 83492791)) & cellMask;
          while (cellBuckets[h] !== -1) h = (h + 1) & cellMask;
          cellBuckets[h] = k;
        }
      };

      const growCells = () => {
        cellMax <<= 1;
        const nextX = new Int32Array(cellMax); nextX.set(cellGx); cellGx = nextX;
        const nextY = new Int32Array(cellMax); nextY.set(cellGy); cellGy = nextY;
        const nextZ = new Int32Array(cellMax); nextZ.set(cellGz); cellGz = nextZ;
      };

      let sumX = wantSums ? new Float64Array(cellMax) : null;
      let sumY = wantSums ? new Float64Array(cellMax) : null;
      let sumZ = wantSums ? new Float64Array(cellMax) : null;
      let sumN = wantSums ? new Uint32Array(cellMax) : null;

      for (let i = 0; i < vCount; i++) {
        const at = i * 3;
        const x = rawVertices[at], y = rawVertices[at + 1], z = rawVertices[at + 2];
        const gx = Math.floor((x - minX) * invStep);
        const gy = Math.floor((y - minY) * invStep);
        const gz = Math.floor((z - minZ) * invStep);

        if (count * 10 >= cellCap * 7) rehashCells();
        let h = (Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663) ^ Math.imul(gz, 83492791)) & cellMask;
        let index = -1;
        while (true) {
          const slot = cellBuckets[h];
          if (slot === -1) break;
          if (cellGx[slot] === gx && cellGy[slot] === gy && cellGz[slot] === gz) {
            index = slot;
            break;
          }
          h = (h + 1) & cellMask;
        }
        if (index === -1) {
          if (count === cellMax) {
            growCells();
            if (wantSums) {
              const nx = new Float64Array(cellMax); nx.set(sumX); sumX = nx;
              const ny = new Float64Array(cellMax); ny.set(sumY); sumY = ny;
              const nz = new Float64Array(cellMax); nz.set(sumZ); sumZ = nz;
              const nn = new Uint32Array(cellMax); nn.set(sumN); sumN = nn;
            }
          }
          index = count++;
          cellGx[index] = gx;
          cellGy[index] = gy;
          cellGz[index] = gz;
          cellBuckets[h] = index;
          if (wantSums) {
            sumX[index] = x;
            sumY[index] = y;
            sumZ[index] = z;
            sumN[index] = 1;
          }
        } else if (wantSums) {
          sumX[index] += x;
          sumY[index] += y;
          sumZ[index] += z;
          sumN[index]++;
        }
        remap[i] = index;
      }
      return { cellCount: count, sumX, sumY, sumZ, sumN };
    };

    const dedupInsert = (s0, s1, s2, countRef) => {
      if (countRef * 10 >= triCap * 7) {
        triCap <<= 1;
        triMask = triCap - 1;
        triBuckets = new Int32Array(triCap).fill(-1);
        for (let k = 0; k < countRef; k++) {
          let h = (Math.imul(triK0[k], 73856093) ^
            Math.imul(triK1[k], 19349663) ^
            Math.imul(triK2[k], 83492791)) & triMask;
          while (triBuckets[h] !== -1) h = (h + 1) & triMask;
          triBuckets[h] = k;
        }
      }
      let h = (Math.imul(s0, 73856093) ^ Math.imul(s1, 19349663) ^ Math.imul(s2, 83492791)) & triMask;
      while (true) {
        const slot = triBuckets[h];
        if (slot === -1) break;
        if (triK0[slot] === s0 && triK1[slot] === s1 && triK2[slot] === s2) return false;
        h = (h + 1) & triMask;
      }
      if (countRef === triMax) {
        triMax <<= 1;
        const n0 = new Uint32Array(triMax); n0.set(triK0); triK0 = n0;
        const n1 = new Uint32Array(triMax); n1.set(triK1); triK1 = n1;
        const n2 = new Uint32Array(triMax); n2.set(triK2); triK2 = n2;
      }
      triK0[countRef] = s0;
      triK1[countRef] = s1;
      triK2[countRef] = s2;
      triBuckets[h] = countRef;
      return true;
    };

    const countAt = step => {
      clusterCells(step, false);
      triBuckets.fill(-1);
      let uniqueCount = 0;
      for (let t = 0; t < tCount; t++) {
        const base = t * 3;
        const a = rawTriangles[base], b = rawTriangles[base + 1], c = rawTriangles[base + 2];
        if (a >= vCount || b >= vCount || c >= vCount) continue;
        const i0 = remap[a], i1 = remap[b], i2 = remap[c];
        if (i0 === i1 || i1 === i2 || i2 === i0) continue;
        let s0 = i0, s1 = i1, s2 = i2;
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        if (s1 > s2) { const tmp = s1; s1 = s2; s2 = tmp; }
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        if (dedupInsert(s0, s1, s2, uniqueCount)) uniqueCount++;
      }
      return uniqueCount;
    };

    const buildAt = (step, expectedTris) => {
      const { cellCount, sumX, sumY, sumZ, sumN } = clusterCells(step, true);
      triBuckets.fill(-1);
      const used = new Int32Array(cellCount).fill(-1);
      const outVerts = new Float32Array(cellCount * 3);
      const outTris = new Uint32Array(expectedTris * 3);
      let vertOut = 0;
      let triOut = 0;
      let uniqueCount = 0;

      for (let t = 0; t < tCount; t++) {
        const base = t * 3;
        const a = rawTriangles[base], b = rawTriangles[base + 1], c = rawTriangles[base + 2];
        if (a >= vCount || b >= vCount || c >= vCount) continue;
        const i0 = remap[a], i1 = remap[b], i2 = remap[c];
        if (i0 === i1 || i1 === i2 || i2 === i0) continue;
        let s0 = i0, s1 = i1, s2 = i2;
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        if (s1 > s2) { const tmp = s1; s1 = s2; s2 = tmp; }
        if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; }
        if (!dedupInsert(s0, s1, s2, uniqueCount)) continue;
        uniqueCount++;

        let c0 = used[i0];
        if (c0 < 0) {
          c0 = vertOut++;
          used[i0] = c0;
          const n = sumN[i0];
          const vo = c0 * 3;
          outVerts[vo] = sumX[i0] / n;
          outVerts[vo + 1] = sumY[i0] / n;
          outVerts[vo + 2] = sumZ[i0] / n;
        }
        let c1 = used[i1];
        if (c1 < 0) {
          c1 = vertOut++;
          used[i1] = c1;
          const n = sumN[i1];
          const vo = c1 * 3;
          outVerts[vo] = sumX[i1] / n;
          outVerts[vo + 1] = sumY[i1] / n;
          outVerts[vo + 2] = sumZ[i1] / n;
        }
        let c2 = used[i2];
        if (c2 < 0) {
          c2 = vertOut++;
          used[i2] = c2;
          const n = sumN[i2];
          const vo = c2 * 3;
          outVerts[vo] = sumX[i2] / n;
          outVerts[vo + 1] = sumY[i2] / n;
          outVerts[vo + 2] = sumZ[i2] / n;
        }

        outTris[triOut++] = c0;
        outTris[triOut++] = c1;
        outTris[triOut++] = c2;
      }

      const finalVertLen = vertOut * 3;
      const finalTriCount = triOut / 3;
      return {
        vertices: finalVertLen === outVerts.length ? outVerts : outVerts.slice(0, finalVertLen),
        triangles: triOut === outTris.length ? outTris : outTris.slice(0, triOut),
        originalTriangles: tCount,
        decimatedTriangles: finalTriCount,
        reductionRatio: 1 - finalTriCount / tCount,
      };
    };

    // Search cell sizes against the *actual* triangle count. Grid clustering cannot
    // guarantee an exact count, so retain the closest valid result and show it in UI.
    let low = Math.max(maxDim / 65536, 1e-9);
    let high = maxDim / 2;
    let bestStep = null;
    let bestCount = tCount;
    let bestDistance = Math.abs(tCount - targetTriangles);
    for (let pass = 0; pass < 9; pass++) {
      const step = Math.sqrt(low * high);
      const count = countAt(step);
      if (count >= 4 && Math.abs(count - targetTriangles) < bestDistance) {
        bestStep = step;
        bestCount = count;
        bestDistance = Math.abs(count - targetTriangles);
      }
      if (bestDistance <= Math.max(2, targetTriangles * 0.02)) break;
      if (count > targetTriangles) low = step;
      else high = step;
    }
    return bestStep === null ? unchanged() : buildAt(bestStep, bestCount);
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
