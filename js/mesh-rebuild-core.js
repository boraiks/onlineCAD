(function (root) {
  'use strict';

  // STL vertices are not an analytic surface. Compare both triangulated
  // surfaces, including triangle interiors, before accepting an edit.
  function meshBounds(mesh) {
    const v = mesh.vertices;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], v[i + axis]);
      max[axis] = Math.max(max[axis], v[i + axis]);
    }
    return { min, max, extent: Math.max(...max.map((x, i) => x - min[i])) };
  }

  function closestTriangleDistanceSq(p, a, b, c) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    const distanceTo = (x, y, z) =>
      (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
    if (d1 <= 0 && d2 <= 0) return distanceTo(a[0], a[1], a[2]);
    const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return distanceTo(b[0], b[1], b[2]);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const t = d1 / (d1 - d3);
      return distanceTo(a[0] + t * abx, a[1] + t * aby, a[2] + t * abz);
    }
    const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2];
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return distanceTo(c[0], c[1], c[2]);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const t = d2 / (d2 - d6);
      return distanceTo(a[0] + t * acx, a[1] + t * acy, a[2] + t * acz);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const t = (d4 - d3) / (d4 - d3 + d5 - d6);
      return distanceTo(b[0] + t * (c[0] - b[0]),
        b[1] + t * (c[1] - b[1]), b[2] + t * (c[2] - b[2]));
    }
    const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
    return distanceTo(a[0] + v * abx + w * acx,
      a[1] + v * aby + w * acy, a[2] + v * abz + w * acz);
  }

  function buildIndex(mesh) {
    const { vertices: v, triangles: t } = mesh;
    const faces = new Array(t.length / 3);
    for (let f = 0; f < faces.length; f++) {
      const ids = [t[f * 3], t[f * 3 + 1], t[f * 3 + 2]];
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const id of ids) for (let axis = 0; axis < 3; axis++) {
        const x = v[id * 3 + axis];
        lo[axis] = Math.min(lo[axis], x); hi[axis] = Math.max(hi[axis], x);
      }
      faces[f] = { ids, lo, hi, center: lo.map((x, axis) => (x + hi[axis]) * 0.5),
        a: [v[ids[0] * 3], v[ids[0] * 3 + 1], v[ids[0] * 3 + 2]],
        b: [v[ids[1] * 3], v[ids[1] * 3 + 1], v[ids[1] * 3 + 2]],
        c: [v[ids[2] * 3], v[ids[2] * 3 + 1], v[ids[2] * 3 + 2]] };
    }
    const build = list => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const face of list) for (let axis = 0; axis < 3; axis++) {
        lo[axis] = Math.min(lo[axis], face.lo[axis]);
        hi[axis] = Math.max(hi[axis], face.hi[axis]);
      }
      if (list.length <= 12) return { lo, hi, faces: list };
      const axis = hi.map((x, i) => x - lo[i]).indexOf(Math.max(...hi.map((x, i) => x - lo[i])));
      list.sort((a, b) => a.center[axis] - b.center[axis]);
      const mid = list.length >>> 1;
      return { lo, hi, left: build(list.slice(0, mid)), right: build(list.slice(mid)) };
    };
    const tree = build(faces);
    const boxDistance = (p, node) => {
      const dx = p[0] < node.lo[0] ? node.lo[0] - p[0] : p[0] > node.hi[0] ? p[0] - node.hi[0] : 0;
      const dy = p[1] < node.lo[1] ? node.lo[1] - p[1] : p[1] > node.hi[1] ? p[1] - node.hi[1] : 0;
      const dz = p[2] < node.lo[2] ? node.lo[2] - p[2] : p[2] > node.hi[2] ? p[2] - node.hi[2] : 0;
      return dx * dx + dy * dy + dz * dz;
    };
    const nearest = (p, limit = Infinity) => {
      let best = limit * limit, bestFace = null;
      const visit = node => {
        if (boxDistance(p, node) > best) return;
        if (node.faces) {
          for (const face of node.faces) {
            const distance = closestTriangleDistanceSq(p, face.a, face.b, face.c);
            if (distance <= best) { best = distance; bestFace = face; }
          }
          return;
        }
        const dl = boxDistance(p, node.left), dr = boxDistance(p, node.right);
        if (dl < dr) { visit(node.left); visit(node.right); }
        else { visit(node.right); visit(node.left); }
      };
      visit(tree);
      return { distance: bestFace ? Math.sqrt(best) : limit + Number.EPSILON * Math.max(1, limit),
        face: bestFace };
    };
    const distanceToFace = (p, face) => {
      return Math.sqrt(closestTriangleDistanceSq(p, face.a, face.b, face.c));
    };
    return { query: (p, limit) => nearest(p, limit).distance, nearest, distanceToFace };
  }

  function sampledDeviation(source, target, limit, index = buildIndex(target)) {
    const v = source.vertices, t = source.triangles;
    let maximum = 0;
    // Deterministic surface samples bound work for very large imported meshes.
    // This is an estimate, not a mathematical Hausdorff proof.
    const vertexStride = Math.max(1, Math.ceil(v.length / 3 / 2500));
    for (let i = 0; i < v.length; i += 3 * vertexStride) {
      maximum = Math.max(maximum, index.query([v[i], v[i + 1], v[i + 2]], limit));
      if (maximum > limit) return maximum;
    }
    const stride = Math.max(1, Math.ceil(t.length / 3 / 2500));
    for (let face = 0; face < t.length / 3; face += stride) {
      const p = [0, 0, 0];
      for (let corner = 0; corner < 3; corner++) for (let axis = 0; axis < 3; axis++)
        p[axis] += v[t[face * 3 + corner] * 3 + axis] / 3;
      maximum = Math.max(maximum, index.query(p, limit));
      if (maximum > limit) return maximum;
    }
    return maximum;
  }

  function certifyDirected(source, target, limit, maxQueries = 500000,
    index = buildIndex(target)) {
    const vertices = source.vertices, triangles = source.triangles;
    const distances = new Float64Array(vertices.length / 3);
    const nearestFaces = new Array(vertices.length / 3);
    distances.fill(NaN);
    let maximum = 0, queries = 0;
    const margin = Math.max(1e-7, limit * 1e-6);
    const effectiveLimit = limit - margin;
    const point = id => [vertices[id * 3], vertices[id * 3 + 1], vertices[id * 3 + 2]];
    const nearest = p => {
      if (++queries > maxQueries) return null;
      const found = index.nearest(p, limit);
      maximum = Math.max(maximum, found.distance);
      return found;
    };
    const edgeLength = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const midpoint = (a, b) => a.map((x, i) => (x + b[i]) * 0.5);
    const stack = [];
    for (let face = 0; face < triangles.length / 3; face++) {
      const ids = [triangles[face * 3], triangles[face * 3 + 1], triangles[face * 3 + 2]];
      const corners = ids.map(point);
      const hits = [];
      for (let i = 0; i < 3; i++) {
        let hit;
        if (Number.isNaN(distances[ids[i]])) {
          hit = nearest(corners[i]);
          if (!hit) return { valid: false, inconclusive: true, deviation: maximum };
          distances[ids[i]] = hit.distance;
          nearestFaces[ids[i]] = hit.face;
        } else hit = { distance: distances[ids[i]], face: nearestFaces[ids[i]] };
        if (hit.distance > effectiveLimit)
          return { valid: false, deviation: hit.distance };
        hits.push(hit);
      }
      stack.push({ corners, hits, depth: 0 });
      while (stack.length) {
        const item = stack.pop();
        const [a, b, c] = item.corners;
        const [ab, bc, ca] = [edgeLength(a, b), edgeLength(b, c), edgeLength(c, a)];
        if (Math.max(...item.hits.map(hit => hit.distance)) + Math.max(ab, bc, ca) <= effectiveLimit)
          continue;
        // Distance to one fixed target triangle is convex. If all source
        // corners lie within the limit of that same triangle, its entire
        // interior is certified, even when the meshes have different tessellation.
        const witnesses = item.hits.map(hit => hit.face).filter(Boolean);
        let certified = false;
        for (const witness of witnesses) {
          if (item.corners.every(corner => index.distanceToFace(corner, witness) <= effectiveLimit)) {
            certified = true;
            break;
          }
        }
        if (certified) continue;
        if (item.depth >= 12 || queries >= maxQueries)
          return { valid: false, inconclusive: true, deviation: maximum };
        const edge = ab >= bc && ab >= ca ? [0, 1, 2]
          : bc >= ca ? [1, 2, 0] : [2, 0, 1];
        const middle = midpoint(item.corners[edge[0]], item.corners[edge[1]]);
        const middleHit = nearest(middle);
        if (!middleHit) return { valid: false, inconclusive: true, deviation: maximum };
        if (middleHit.distance > effectiveLimit)
          return { valid: false, deviation: middleHit.distance };
        const opposite = item.corners[edge[2]], oppositeHit = item.hits[edge[2]];
        stack.push({ corners: [middle, item.corners[edge[1]], opposite],
          hits: [middleHit, item.hits[edge[1]], oppositeHit], depth: item.depth + 1 });
        stack.push({ corners: [item.corners[edge[0]], middle, opposite],
          hits: [item.hits[edge[0]], middleHit, oppositeHit], depth: item.depth + 1 });
      }
    }
    return { valid: true, deviation: maximum };
  }

  function meshData(mesh) {
    const vertices = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
    for (let i = 0, at = 0; i < mesh.vertProperties.length; i += mesh.numProp, at += 3)
      vertices.set(mesh.vertProperties.subarray(i, i + 3), at);
    return { vertices, triangles: Uint32Array.from(mesh.triVerts) };
  }

  function measureSurface(source, target, accuracy) {
    const extent = meshBounds(source).extent;
    const limit = extent * accuracy;
    if (!Number.isFinite(limit) || limit <= 0) return { valid: false, deviation: Infinity };
    const sourceIndex = buildIndex(source);
    const forward = sampledDeviation(target, source, limit, sourceIndex);
    if (forward > limit) return { valid: false, deviation: forward, limit };
    const targetIndex = buildIndex(target);
    const reverse = sampledDeviation(source, target, limit, targetIndex);
    const deviation = Math.max(forward, reverse);
    if (deviation > limit) return { valid: false, deviation, limit };
    const certifiedForward = certifyDirected(target, source, limit, 500000, sourceIndex);
    if (!certifiedForward.valid)
      return { ...certifiedForward, limit };
    const certifiedReverse = certifyDirected(source, target, limit, 500000, targetIndex);
    return { ...certifiedReverse, certified: certifiedReverse.valid,
      deviation: Math.max(deviation, certifiedForward.deviation, certifiedReverse.deviation), limit };
  }

  function rebuild(module, solid, options = {}, referenceSolid = solid) {
    const source = meshData(referenceSolid.getMesh());
    const bounds = meshBounds(source);
    const extent = bounds.extent;
    if (!Number.isFinite(extent) || extent <= 0) throw new Error('The solid has no measurable size.');
    // A large input can still be converted as a faceted solid. The rebuild is
    // optional and must not launch an unbounded refinement in the browser.
    if (source.triangles.length / 3 > 200000)
      return { solid: null, reason: 'Surface rebuild skipped above 200,000 input triangles.' };
    const angle = Math.max(15, Math.min(80, Number(options.creaseAngle) || 42));
    const accuracy = Math.max(0.0001, Math.min(0.01, Number(options.accuracy) || 0.006));
    const deviationLimit = extent * accuracy;
    let smooth, refined, centered, scaled;
    try {
      smooth = solid.smoothOut(angle);
      // Coarse source meshes need a coarser refinement target to avoid a large
      // triangle multiplier. This target stays independent of the user's
      // acceptance threshold, which is checked against the original surface.
      const inputTriangles = source.triangles.length / 3;
      const refinementRatio = Math.max(0.0002, 0.002 * Math.sqrt(512 / inputTriangles));
      refined = smooth.refineToTolerance(extent * refinementRatio);
      if (refined.status() !== 'NoError' || refined.isEmpty())
        return { solid: null, reason: 'Reconstructed geometry is not a valid closed solid.' };
      if (refined.numTri() > Math.max(300000, source.triangles.length))
        return { solid: null, reason: 'Surface rebuild exceeded the safe triangle budget.' };
      const sourceVolume = referenceSolid.volume();
      let resultVolume = refined.volume();
      let volumeChange = Math.abs(resultVolume - sourceVolume) / sourceVolume;
      if (volumeChange > 0.01 && volumeChange <= 0.03) {
        // Smooth interpolation can slightly inflate a coarse closed mesh.
        // A small uniform correction restores its volume; the full two-way
        // surface check below decides whether the corrected shape is usable.
        const factor = Math.cbrt(sourceVolume / resultVolume);
        if (Math.abs(factor - 1) <= 0.01) {
          const center = bounds.min.map((x, axis) => (x + bounds.max[axis]) / 2);
          centered = refined.translate(center.map(x => -x));
          scaled = centered.scale(factor);
          const corrected = scaled.translate(center);
          if (corrected.status() === 'NoError' && !corrected.isEmpty()) {
            refined.delete();
            refined = corrected;
            resultVolume = refined.volume();
            volumeChange = Math.abs(resultVolume - sourceVolume) / sourceVolume;
          } else corrected.delete();
        }
      }
      if (volumeChange > 0.01)
        return { solid: null, reason: `Volume changed by ${(volumeChange * 100).toFixed(2)}%, above the 1% limit.` };
      const target = meshData(refined.getMesh());
      const measured = measureSurface(source, target, accuracy);
      if (!measured.valid)
        return { solid: null, reason: measured.inconclusive
          ? 'Surface verification reached its processing limit; the faceted shape was kept.'
          : `Surface shift exceeds ${deviationLimit.toFixed(3)} model units.` };
      const deviation = measured.deviation;
      const result = { solid: refined, deviation, deviationRatio: deviation / extent, volumeChange,
        originalTriangles: source.triangles.length / 3 };
      refined = null;
      return result;
    } finally {
      scaled?.delete(); centered?.delete(); refined?.delete(); smooth?.delete();
    }
  }

  root.WebCADMeshRebuildCore = { rebuild, meshBounds, sampledDeviation, certifyDirected,
    measureSurface, meshData };
})(typeof self !== 'undefined' ? self : globalThis);
