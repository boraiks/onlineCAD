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
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis]);
      max[axis] = Math.max(max[axis], vertices[i + axis]);
    }
    const extent = Math.max(...max.map((value, axis) => value - min[axis]));
    const weldStep = Math.max(1e-7, extent * 1e-7);
    const inverseStep = 1 / weldStep;
    const welded = new Uint32Array(vertexCount);
    const positions = new Map();
    let uniqueCount = 0;
    for (let i = 0; i < vertexCount; i++) {
      const at = i * 3;
      const key = `${Math.round(vertices[at] * inverseStep)},${Math.round(vertices[at + 1] * inverseStep)},${Math.round(vertices[at + 2] * inverseStep)}`;
      let id = positions.get(key);
      if (id === undefined) positions.set(key, id = uniqueCount++);
      welded[i] = id;
    }
    positions.clear();

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
    const join = (a, b) => { parents[find(a)] = find(b); };
    const edges = new Map();
    for (let t = 0; t < faceCount; t++) {
      const base = t * 3;
      const ids = [triangles[base], triangles[base + 1], triangles[base + 2]];
      if (ids.some(id => id >= vertexCount))
        throw new Error('The mesh contains an invalid triangle index.');
      const a = ids[0] * 3, b = ids[1] * 3, c = ids[2] * 3;
      const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
      const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (length <= Math.max(1e-24, extent * extent * 1e-16) ||
          welded[ids[0]] === welded[ids[1]] || welded[ids[1]] === welded[ids[2]] ||
          welded[ids[2]] === welded[ids[0]]) continue;
      nx /= length; ny /= length; nz /= length;
      normals[base] = nx; normals[base + 1] = ny; normals[base + 2] = nz;
      for (let corner = 0; corner < 3; corner++) {
        const p = ids[corner] * 3, q = ids[(corner + 1) % 3] * 3, r = ids[(corner + 2) % 3] * 3;
        const first = [vertices[q] - vertices[p], vertices[q + 1] - vertices[p + 1], vertices[q + 2] - vertices[p + 2]];
        const second = [vertices[r] - vertices[p], vertices[r + 1] - vertices[p + 1], vertices[r + 2] - vertices[p + 2]];
        const denominator = Math.hypot(...first) * Math.hypot(...second);
        const ratio = denominator ? (first[0] * second[0] + first[1] * second[1] + first[2] * second[2]) / denominator : 1;
        weights[base + corner] = Math.acos(Math.max(-1, Math.min(1, ratio))) || 1;

        const from = welded[ids[corner]], to = welded[ids[(corner + 1) % 3]];
        if (from === to) continue;
        const low = Math.min(from, to), high = Math.max(from, to);
        const key = low * uniqueCount + high;
        const record = edges.get(key);
        const lowCorner = base + (from === low ? corner : (corner + 1) % 3);
        const highCorner = base + (from === high ? corner : (corner + 1) % 3);
        if (!record) edges.set(key, { t, lowCorner, highCorner, from: ids[corner], to: ids[(corner + 1) % 3], count: 1 });
        else {
          record.count++;
          if (record.count === 2) {
            record.other = t;
            record.otherLowCorner = lowCorner;
            record.otherHighCorner = highCorner;
          }
        }
      }
    }

    const featurePairs = [];
    for (const edge of edges.values()) {
      const i = edge.t * 3, j = (edge.other ?? 0) * 3;
      const similarity = edge.count === 2
        ? normals[i] * normals[j] + normals[i + 1] * normals[j + 1] + normals[i + 2] * normals[j + 2]
        : -1;
      if (edge.count === 2 && similarity >= cosine) {
        join(edge.lowCorner, edge.otherLowCorner);
        join(edge.highCorner, edge.otherHighCorner);
      } else featurePairs.push(edge.from, edge.to);
    }
    edges.clear();

    const sums = new Float32Array(cornerCount * 3);
    for (let corner = 0; corner < cornerCount; corner++) {
      const root = find(corner) * 3, face = Math.floor(corner / 3) * 3, weight = weights[corner];
      sums[root] += normals[face] * weight;
      sums[root + 1] += normals[face + 1] * weight;
      sums[root + 2] += normals[face + 2] * weight;
    }
    const cornerNormals = new Float32Array(cornerCount * 3);
    for (let corner = 0; corner < cornerCount; corner++) {
      const root = find(corner) * 3, out = corner * 3;
      const length = Math.hypot(sums[root], sums[root + 1], sums[root + 2]);
      if (length > 1e-12) {
        cornerNormals[out] = sums[root] / length;
        cornerNormals[out + 1] = sums[root + 1] / length;
        cornerNormals[out + 2] = sums[root + 2] / length;
      } else {
        const face = Math.floor(corner / 3) * 3;
        cornerNormals.set(normals.subarray(face, face + 3), out);
      }
    }
    return { cornerNormals, featurePairs: Uint32Array.from(featurePairs),
      triangleCount: faceCount, angle: angleDegrees };
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
      if (this.selectedBody && this.selectedBody.surfaceFinishAngle !== this.originalAngle) {
        this.selectedBody.surfaceFinishAngle = this.originalAngle;
        cadRenderer()?.invalidateFinish?.(this.selectedBody);
        this.onChange?.();
      }
      this.active = false;
      this.selectedBody = null;
      this.originalAngle = 0;
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
        this.preview();
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
