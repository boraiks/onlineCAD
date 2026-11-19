(function (root) {
  'use strict';

  // Generates render normals and true feature edges without changing the CAD mesh.
  // A union of face corners across smooth, shared edges keeps hard edges sharp,
  // including STL seams whose vertices have separate indices at identical positions.
  function compute(mesh, angleDegrees = 42) {
    const vertices = mesh?.vertices, triangles = mesh?.triangles;
    if (!vertices?.length || !triangles?.length || triangles.length % 3)
      throw new Error('A triangle mesh is required for surface finishing.');
    const vertexCount = vertices.length / 3, cornerCount = triangles.length;
    const faceCount = cornerCount / 3;
    const cosine = Math.cos(Math.max(1, Math.min(89, angleDegrees)) * Math.PI / 180);

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const weldStep = Math.max(1e-7, extent * 1e-7);
    const inverseStep = 1 / weldStep;
    const welded = new Uint32Array(vertexCount);

    let uniqueCount = 0;
    {
      let wCap = 64;
      while (wCap < vertexCount * 2) wCap <<= 1;
      let wMask = wCap - 1;
      let wBuckets = new Int32Array(wCap).fill(-1);
      const wCoords = new Float64Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i++) {
        const at = i * 3;
        let qx = Math.round(vertices[at] * inverseStep);
        let qy = Math.round(vertices[at + 1] * inverseStep);
        let qz = Math.round(vertices[at + 2] * inverseStep);
        if (qx === 0) qx = 0;
        if (qy === 0) qy = 0;
        if (qz === 0) qz = 0;
        let h = (Math.imul(qx | 0, 73856093) ^
          Math.imul(qy | 0, 19349663) ^
          Math.imul(qz | 0, 83492791)) & wMask;
        let id = -1;
        while (true) {
          const slot = wBuckets[h];
          if (slot === -1) break;
          const b = slot * 3;
          if (wCoords[b] === qx && wCoords[b + 1] === qy && wCoords[b + 2] === qz) {
            id = slot;
            break;
          }
          h = (h + 1) & wMask;
        }
        if (id === -1) {
          id = uniqueCount++;
          const b = id * 3;
          wCoords[b] = qx;
          wCoords[b + 1] = qy;
          wCoords[b + 2] = qz;
          wBuckets[h] = id;
        }
        welded[i] = id;
      }
    }

    const normals = new Float32Array(faceCount * 3);
    const weights = new Float32Array(cornerCount);
    const parents = new Uint32Array(cornerCount);
    for (let i = 0; i < cornerCount; i++) parents[i] = i;
    const find = index => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };

    const estEdges = Math.max(64, Math.ceil(faceCount * 1.6));
    let edgeCap = 64;
    while (edgeCap < estEdges * 2) edgeCap <<= 1;
    let edgeMask = edgeCap - 1;
    let edgeBuckets = new Int32Array(edgeCap).fill(-1);
    let edgeMax = edgeCap >> 1;
    let edgeLo = new Uint32Array(edgeMax);
    let edgeHi = new Uint32Array(edgeMax);
    let edgeT1 = new Uint32Array(edgeMax);
    let edgeT2 = new Uint32Array(edgeMax);
    let edgeLC1 = new Uint32Array(edgeMax);
    let edgeHC1 = new Uint32Array(edgeMax);
    let edgeLC2 = new Uint32Array(edgeMax);
    let edgeHC2 = new Uint32Array(edgeMax);
    let edgeFrom = new Uint32Array(edgeMax);
    let edgeTo = new Uint32Array(edgeMax);
    let edgeCount = new Uint8Array(edgeMax);
    let edgeUsed = 0;

    function growEdges() {
      const nextMax = edgeMax << 1;
      const growU32 = arr => { const n = new Uint32Array(nextMax); n.set(arr); return n; };
      edgeLo = growU32(edgeLo);
      edgeHi = growU32(edgeHi);
      edgeT1 = growU32(edgeT1);
      edgeT2 = growU32(edgeT2);
      edgeLC1 = growU32(edgeLC1);
      edgeHC1 = growU32(edgeHC1);
      edgeLC2 = growU32(edgeLC2);
      edgeHC2 = growU32(edgeHC2);
      edgeFrom = growU32(edgeFrom);
      edgeTo = growU32(edgeTo);
      const nextCount = new Uint8Array(nextMax);
      nextCount.set(edgeCount);
      edgeCount = nextCount;
      edgeMax = nextMax;
    }

    function rehashEdges() {
      edgeCap <<= 1;
      edgeMask = edgeCap - 1;
      edgeBuckets = new Int32Array(edgeCap).fill(-1);
      for (let e = 0; e < edgeUsed; e++) {
        let h = Math.imul(edgeLo[e] ^ Math.imul(edgeHi[e], 0x9e3779b1), 0x85ebca6b);
        h = ((h ^ (h >>> 15)) >>> 0) & edgeMask;
        while (edgeBuckets[h] !== -1) h = (h + 1) & edgeMask;
        edgeBuckets[h] = e;
      }
    }

    function addEdge(rawFrom, rawTo, from, to, t, cornerA, cornerB) {
      let low, high, lowCorner, highCorner;
      if (from < to) {
        low = from; high = to; lowCorner = cornerA; highCorner = cornerB;
      } else {
        low = to; high = from; lowCorner = cornerB; highCorner = cornerA;
      }
      if (edgeUsed * 10 >= edgeCap * 7) rehashEdges();
      let h = Math.imul(low ^ Math.imul(high, 0x9e3779b1), 0x85ebca6b);
      h = ((h ^ (h >>> 15)) >>> 0) & edgeMask;
      while (true) {
        const slot = edgeBuckets[h];
        if (slot === -1) {
          if (edgeUsed === edgeMax) growEdges();
          const e = edgeUsed++;
          edgeLo[e] = low;
          edgeHi[e] = high;
          edgeT1[e] = t;
          edgeLC1[e] = lowCorner;
          edgeHC1[e] = highCorner;
          edgeFrom[e] = rawFrom;
          edgeTo[e] = rawTo;
          edgeCount[e] = 1;
          edgeBuckets[h] = e;
          return;
        }
        if (edgeLo[slot] === low && edgeHi[slot] === high) {
          const prev = edgeCount[slot];
          if (prev === 1) {
            edgeCount[slot] = 2;
            edgeT2[slot] = t;
            edgeLC2[slot] = lowCorner;
            edgeHC2[slot] = highCorner;
          } else if (prev === 2) {
            edgeCount[slot] = 3;
          }
          return;
        }
        h = (h + 1) & edgeMask;
      }
    }

    const minAreaSq = Math.max(1e-24, extent * extent * 1e-16);
    for (let t = 0; t < faceCount; t++) {
      const base = t * 3;
      const i0 = triangles[base], i1 = triangles[base + 1], i2 = triangles[base + 2];
      if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount)
        throw new Error('The mesh contains an invalid triangle index.');

      const a = i0 * 3, b = i1 * 3, c = i2 * 3;
      const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
      const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      const w0 = welded[i0], w1 = welded[i1], w2 = welded[i2];
      if (length <= minAreaSq || w0 === w1 || w1 === w2 || w2 === w0) continue;

      const invLen = 1 / length;
      normals[base] = nx * invLen;
      normals[base + 1] = ny * invLen;
      normals[base + 2] = nz * invLen;

      const wx = vertices[c] - vertices[b], wy = vertices[c + 1] - vertices[b + 1], wz = vertices[c + 2] - vertices[b + 2];
      const lenAB = Math.hypot(ux, uy, uz);
      const lenAC = Math.hypot(vx, vy, vz);
      const lenBC = Math.hypot(wx, wy, wz);

      const d0 = lenAB * lenAC;
      const r0 = d0 ? (ux * vx + uy * vy + uz * vz) / d0 : 1;
      weights[base] = Math.acos(r0 < -1 ? -1 : r0 > 1 ? 1 : r0) || 1;

      const d1 = lenBC * lenAB;
      const r1 = d1 ? -(wx * ux + wy * uy + wz * uz) / d1 : 1;
      weights[base + 1] = Math.acos(r1 < -1 ? -1 : r1 > 1 ? 1 : r1) || 1;

      const d2 = lenAC * lenBC;
      const r2 = d2 ? (vx * wx + vy * wy + vz * wz) / d2 : 1;
      weights[base + 2] = Math.acos(r2 < -1 ? -1 : r2 > 1 ? 1 : r2) || 1;

      addEdge(i0, i1, w0, w1, t, base, base + 1);
      addEdge(i1, i2, w1, w2, t, base + 1, base + 2);
      addEdge(i2, i0, w2, w0, t, base + 2, base);
    }

    let fpCap = Math.max(64, edgeUsed >> 2) * 2;
    let fpBuf = new Uint32Array(fpCap);
    let fpLen = 0;

    for (let e = 0; e < edgeUsed; e++) {
      if (edgeCount[e] === 2) {
        const i = edgeT1[e] * 3, j = edgeT2[e] * 3;
        const similarity = normals[i] * normals[j] + normals[i + 1] * normals[j + 1] + normals[i + 2] * normals[j + 2];
        if (similarity >= cosine) {
          parents[find(edgeLC1[e])] = find(edgeLC2[e]);
          parents[find(edgeHC1[e])] = find(edgeHC2[e]);
          continue;
        }
      }
      if (fpLen + 2 > fpCap) {
        fpCap <<= 1;
        const next = new Uint32Array(fpCap);
        next.set(fpBuf);
        fpBuf = next;
      }
      fpBuf[fpLen++] = edgeFrom[e];
      fpBuf[fpLen++] = edgeTo[e];
    }

    const featurePairs = fpLen === fpBuf.length ? fpBuf : fpBuf.slice(0, fpLen);
    edgeBuckets = null; edgeLo = null; edgeHi = null; edgeT1 = null; edgeT2 = null;
    edgeLC1 = null; edgeHC1 = null; edgeLC2 = null; edgeHC2 = null;
    edgeFrom = null; edgeTo = null; edgeCount = null;

    const sums = new Float32Array(cornerCount * 3);
    for (let t = 0; t < faceCount; t++) {
      const f = t * 3;
      const fnx = normals[f], fny = normals[f + 1], fnz = normals[f + 2];

      const r0 = find(f) * 3, w0 = weights[f];
      sums[r0] += fnx * w0; sums[r0 + 1] += fny * w0; sums[r0 + 2] += fnz * w0;

      const c1 = f + 1, r1 = find(c1) * 3, w1 = weights[c1];
      sums[r1] += fnx * w1; sums[r1 + 1] += fny * w1; sums[r1 + 2] += fnz * w1;

      const c2 = f + 2, r2 = find(c2) * 3, w2 = weights[c2];
      sums[r2] += fnx * w2; sums[r2 + 1] += fny * w2; sums[r2 + 2] += fnz * w2;
    }

    const cornerNormals = new Float32Array(cornerCount * 3);
    for (let t = 0; t < faceCount; t++) {
      const f = t * 3;
      const fnx = normals[f], fny = normals[f + 1], fnz = normals[f + 2];

      for (let k = 0; k < 3; k++) {
        const corner = f + k;
        const root = find(corner) * 3;
        const out = corner * 3;
        const sx = sums[root], sy = sums[root + 1], sz = sums[root + 2];
        const length = Math.hypot(sx, sy, sz);
        if (length > 1e-12) {
          const inv = 1 / length;
          cornerNormals[out] = sx * inv;
          cornerNormals[out + 1] = sy * inv;
          cornerNormals[out + 2] = sz * inv;
        } else {
          cornerNormals[out] = fnx;
          cornerNormals[out + 1] = fny;
          cornerNormals[out + 2] = fnz;
        }
      }
    }
    return { cornerNormals, featurePairs, triangleCount: faceCount, angle: angleDegrees };
  }

  class SurfaceFinishController {
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

      this.title = panel.querySelector('#surfaceFinishTitle');
      this.help = panel.querySelector('#surfaceFinishHelp');
      this.selectionBtn = panel.querySelector('#surfaceFinishSelection');
      this.styleSelect = panel.querySelector('#surfaceFinishStyle');
      this.customRow = panel.querySelector('#surfaceFinishCustomRow');
      this.slider = panel.querySelector('#surfaceFinishSlider');
      this.angleText = panel.querySelector('#surfaceFinishAngleText');
      this.cancelBtn = panel.querySelector('#surfaceFinishCancel');
      this.okBtn = panel.querySelector('#surfaceFinishOk');

      this.active = false;
      this.selectedBody = null;
      this.originalAngle = 0;
      this._previewRaf = 0;

      this.bind();
    }

    open(initialBody = null) {
      if (this.active) {
        this.close();
        return true;
      }
      const candidates = (this.extrudeController?.bodies || []).filter(b =>
        b.visible !== false && b.mesh && (b.meshSource === 'import' || b.meshSource === 'solid'));
      if (!candidates.length) {
        this.onError?.({
          code: 'CAD-M001',
          title: 'No Mesh or Solid Bodies',
          reason: 'CAD surface finish requires an imported mesh or converted solid body in the workspace.',
        });
        this.onStatus?.('CAD SURFACE · Import a mesh or select a solid body first');
        return false;
      }

      this.active = true;
      this.panel.hidden = false;
      this.onModeChange?.('surface-finish');
      this.setBody(initialBody && candidates.includes(initialBody) ? initialBody : null);
      if (!this.selectedBody) {
        this.onStatus?.('CAD SURFACE · Click a mesh body in the viewport or Browser');
      }
      return true;
    }

    close({ preserveStatus = false } = {}) {
      if (!this.active) return;
      if (this._previewRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._previewRaf);
        this._previewRaf = 0;
      }
      if (this.selectedBody && this.selectedBody.surfaceFinishAngle !== this.originalAngle) {
        this.selectedBody.surfaceFinishAngle = this.originalAngle;
        cadRenderer()?.invalidateFinish?.(this.selectedBody);
        this.onChange?.();
      }
      this.active = false;
      this.selectedBody = null;
      this.originalAngle = 0;
      this._previewRaf = 0;
      this.panel.hidden = true;
      this.onModeChange?.(null);
      if (!preserveStatus) this.onStatus?.('3D VIEW');
      this.onChange?.();
    }

    setBody(body) {
      if (!body) {
        if (this.selectedBody && this.selectedBody.surfaceFinishAngle !== this.originalAngle) {
          this.selectedBody.surfaceFinishAngle = this.originalAngle;
          cadRenderer()?.invalidateFinish?.(this.selectedBody);
        }
        this.selectedBody = null;
        this.originalAngle = 0;
        this.syncUI();
        this.onStatus?.('CAD SURFACE · Click a mesh body in the viewport or Browser');
        return;
      }
      if (body === this.selectedBody) return;
      if (this.selectedBody && this.selectedBody.surfaceFinishAngle !== this.originalAngle) {
        this.selectedBody.surfaceFinishAngle = this.originalAngle;
        cadRenderer()?.invalidateFinish?.(this.selectedBody);
      }
      this.selectedBody = body;
      this.originalAngle = body.surfaceFinishAngle || 0;
      const angle = this.originalAngle;
      if (angle === 42) {
        this.styleSelect.value = '42';
      } else if (angle === 0) {
        this.styleSelect.value = '0';
      } else {
        this.styleSelect.value = 'custom';
        this.slider.value = String(angle);
      }
      this.syncUI();
      this.onStatus?.(`CAD SURFACE · ${body.name} selected`);
    }

    currentAngle() {
      const style = this.styleSelect.value;
      if (style === '0') return 0;
      if (style === '42') return 42;
      return Number(this.slider.value) || 42;
    }

    syncUI() {
      const body = this.selectedBody;
      const style = this.styleSelect.value;
      this.selectionBtn.textContent = body?.name || 'Select mesh body';
      this.selectionBtn.classList.toggle('is-active', !body);
      if (this.styleSelect) this.styleSelect.disabled = !body;
      if (this.slider) this.slider.disabled = !body;
      if (this.customRow) this.customRow.hidden = style !== 'custom';
      if (this.angleText) this.angleText.textContent = `${this.slider.value}°`;
      this.okBtn.disabled = !body;
    }

    preview() {
      if (!this.selectedBody) return;
      const angle = this.currentAngle();
      this.selectedBody.surfaceFinishAngle = angle;
      cadRenderer()?.invalidateFinish?.(this.selectedBody);
      this.onChange?.();
    }

    commit() {
      const body = this.selectedBody;
      if (!body) return false;
      if (this._previewRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._previewRaf);
        this._previewRaf = 0;
      }
      const after = this.currentAngle();
      const before = this.originalAngle;
      if (before !== after) {
        const apply = angle => {
          body.surfaceFinishAngle = angle;
          cadRenderer()?.invalidateFinish?.(body);
          this.onBodiesChange?.();
          this.onChange?.();
        };
        this.history.execute({
          name: `Surface finish · ${body.name}`, kind: 'mesh',
          execute: () => apply(after),
          undo: () => apply(before),
          redo: () => apply(after),
        });
      }
      this.originalAngle = after;
      this.onStatus?.(after > 0
        ? `CAD SURFACE · ${body.name}: Smooth shading ${after}° applied`
        : `CAD SURFACE · ${body.name}: Original facets enabled`);
      this.close({ preserveStatus: true });
      return true;
    }

    bind() {
      this.canvas?.addEventListener?.('click', event => {
        if (!this.active || event.button !== 0 || event.defaultPrevented) return;
        const body = this.faceSelection?.bodyAt(event);
        if (body && body.visible !== false && (body.meshSource === 'import' || body.meshSource === 'solid')) {
          this.setBody(body);
        }
      });

      this.selectionBtn?.addEventListener('click', () => {
        const candidates = (this.extrudeController?.bodies || []).filter(b =>
          b.visible !== false && b.mesh && (b.meshSource === 'import' || b.meshSource === 'solid'));
        if (!this.selectedBody && candidates.length) {
          this.setBody(candidates[0]);
        } else if (candidates.length > 1) {
          const currentIndex = candidates.indexOf(this.selectedBody);
          const nextIndex = (currentIndex + 1) % candidates.length;
          this.setBody(candidates[nextIndex]);
        } else if (this.selectedBody) {
          this.setBody(null);
        }
      });

      this.styleSelect?.addEventListener('change', () => {
        this.syncUI();
        this.preview();
      });

      this.slider?.addEventListener('input', () => {
        if (this.angleText) this.angleText.textContent = `${this.slider.value}°`;
        if (this.selectedBody?.mesh?.triangles?.length > 12000 && typeof requestAnimationFrame === 'function') {
          if (this._previewRaf) return;
          this._previewRaf = requestAnimationFrame(() => {
            this._previewRaf = 0;
            if (this.active) this.preview();
          });
        } else {
          this.preview();
        }
      });

      this.cancelBtn?.addEventListener('click', () => this.close());
      this.okBtn?.addEventListener('click', () => this.commit());
    }
  }

  function cadRenderer() {
    return (typeof window !== 'undefined' && window.WebCAD?.bodyRenderer) ? window.WebCAD.bodyRenderer : null;
  }

  root.WebCADSurfaceFinishCore = { compute, SurfaceFinishController };
  const cad = (typeof window !== 'undefined' ? window.WebCAD : null) || {};
  if (typeof window !== 'undefined') window.WebCAD = cad;
  cad.surfaceFinish = { SurfaceFinishController, compute };
})(typeof self !== 'undefined' ? self : globalThis);
