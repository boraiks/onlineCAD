(function (root) {
  'use strict';

  const _f64Buf = new Float64Array(1);
  const _u32View = new Uint32Array(_f64Buf.buffer);

  function hashFloat64(val) {
    _f64Buf[0] = val === 0 ? 0 : val;
    return Math.imul(_u32View[0], 0x9e3779b1) ^ Math.imul(_u32View[1], 0x85ebca6b);
  }

  function weldCoincidentVertices(vertices, triangles) {
    const vertCount = vertices.length / 3;
    let cap = 64;
    while (cap < vertCount * 2) cap <<= 1;
    const mask = cap - 1;
    const buckets = new Int32Array(cap).fill(-1);
    const remap = new Uint32Array(vertCount);
    const uniqueCoords = new Float64Array(vertices.length);
    const compact = new Float32Array(vertices.length);
    let count = 0;

    for (let i = 0; i < vertCount; i++) {
      const offset = i * 3;
      const rawX = vertices[offset], rawY = vertices[offset + 1], rawZ = vertices[offset + 2];
      const x = rawX === 0 ? 0 : rawX;
      const y = rawY === 0 ? 0 : rawY;
      const z = rawZ === 0 ? 0 : rawZ;
      let h = (hashFloat64(x) ^ Math.imul(hashFloat64(y), 19349663) ^ Math.imul(hashFloat64(z), 83492791)) & mask;
      let index = -1;
      while (true) {
        const slot = buckets[h];
        if (slot === -1) break;
        const b = slot * 3;
        if (uniqueCoords[b] === x && uniqueCoords[b + 1] === y && uniqueCoords[b + 2] === z) {
          index = slot;
          break;
        }
        h = (h + 1) & mask;
      }
      if (index === -1) {
        index = count++;
        const b = index * 3;
        uniqueCoords[b] = x; uniqueCoords[b + 1] = y; uniqueCoords[b + 2] = z;
        compact[b] = rawX; compact[b + 1] = rawY; compact[b + 2] = rawZ;
        buckets[h] = index;
      }
      remap[i] = index;
    }
    if (count === vertCount) return null;
    const welded = new Uint32Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) welded[i] = remap[triangles[i]];
    return {
      vertices: compact.slice(0, count * 3),
      triangles: welded,
      weldedVertices: vertCount - count,
    };
  }

  // keepZeroArea: after repair, sliver facets hold the surface closed;
  // Manifold collapses them itself, removing them here would reopen holes.
  function prepareClosedMesh(source, allowWeld = true, { keepZeroArea = false } = {}) {
    const vertices = source?.vertices;
    const triangles = source?.triangles;
    if (!vertices || !triangles || vertices.length % 3 || triangles.length % 3 || triangles.length < 12)
      throw new Error('The mesh needs at least four valid triangles to form a solid.');

    const vertexCount = vertices.length / 3;
    for (let i = 0; i < vertices.length; i++) {
      if (!Number.isFinite(vertices[i])) throw new Error('The mesh contains invalid coordinates.');
    }

    const triInputCount = triangles.length / 3;
    const valid = new Uint32Array(triangles.length);
    let validLen = 0;
    let removed = 0;
    const originX = vertices[0], originY = vertices[1], originZ = vertices[2];

    const estEdges = Math.max(64, Math.ceil(triInputCount * 1.55));
    let edgeCap = 64;
    while (edgeCap < estEdges * 2) edgeCap <<= 1;
    let edgeMask = edgeCap - 1;
    let edgeBuckets = new Int32Array(edgeCap).fill(-1);
    let edgeMax = edgeCap >> 1;
    let edgeLo = new Uint32Array(edgeMax);
    let edgeHi = new Uint32Array(edgeMax);
    let edgeFwd = new Uint32Array(edgeMax);
    let edgeBwd = new Uint32Array(edgeMax);
    let edgeOwner = new Uint32Array(edgeMax);
    let edgeOther = new Uint32Array(edgeMax);
    let edgeUsed = 0;

    function growEdges() {
      const nextMax = edgeMax << 1;
      const growU32 = arr => { const n = new Uint32Array(nextMax); n.set(arr); return n; };
      edgeLo = growU32(edgeLo);
      edgeHi = growU32(edgeHi);
      edgeFwd = growU32(edgeFwd);
      edgeBwd = growU32(edgeBwd);
      edgeOwner = growU32(edgeOwner);
      edgeOther = growU32(edgeOther);
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

    function addEdge(from, to, triIdx) {
      const forward = from < to ? 1 : 0;
      const lo = forward ? from : to;
      const hi = forward ? to : from;
      if (edgeUsed * 10 >= edgeCap * 7) rehashEdges();
      let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b);
      h = ((h ^ (h >>> 15)) >>> 0) & edgeMask;
      while (true) {
        const slot = edgeBuckets[h];
        if (slot === -1) {
          if (edgeUsed === edgeMax) growEdges();
          const e = edgeUsed++;
          edgeLo[e] = lo;
          edgeHi[e] = hi;
          edgeFwd[e] = forward ? 1 : 0;
          edgeBwd[e] = forward ? 0 : 1;
          edgeOwner[e] = triIdx * 2 + forward;
          edgeBuckets[h] = e;
          return;
        }
        if (edgeLo[slot] === lo && edgeHi[slot] === hi) {
          const total = edgeFwd[slot] + edgeBwd[slot];
          if (forward) edgeFwd[slot]++;
          else edgeBwd[slot]++;
          if (total === 1) edgeOther[slot] = triIdx * 2 + forward;
          return;
        }
        h = (h + 1) & edgeMask;
      }
    }

    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) ||
          a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount)
        throw new Error('The mesh contains invalid triangle indices.');
      if (a === b || b === c || c === a) { removed++; continue; }
      const ia = a * 3, ib = b * 3, ic = c * 3;
      const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
      const ux = vertices[ib] - ax, uy = vertices[ib + 1] - ay, uz = vertices[ib + 2] - az;
      const vx = vertices[ic] - ax, vy = vertices[ic + 1] - ay, vz = vertices[ic + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (!keepZeroArea && nx * nx + ny * ny + nz * nz <= 1e-24) { removed++; continue; }
      const triIdx = validLen / 3;
      valid[validLen++] = a;
      valid[validLen++] = b;
      valid[validLen++] = c;
      addEdge(a, b, triIdx);
      addEdge(b, c, triIdx);
      addEdge(c, a, triIdx);
    }
    if (validLen < 12) throw new Error('The mesh has too few nondegenerate faces to form a solid.');

    let openEdges = 0, nonManifoldEdges = 0, reversedEdges = 0;
    for (let e = 0; e < edgeUsed; e++) {
      const forward = edgeFwd[e], backward = edgeBwd[e];
      const count = forward + backward;
      if (count === 1) openEdges++;
      else if (count > 2) nonManifoldEdges++;
      else if (forward !== 1 || backward !== 1) reversedEdges++;
    }
    if (openEdges && allowWeld) {
      // STL/OBJ files can store the same geometric vertex once per facet. A
      // shared edge is only recognized after those exact positions are joined.
      const welded = weldCoincidentVertices(vertices, triangles);
      if (welded) {
        const prepared = prepareClosedMesh(welded, false);
        prepared.weldedVertices = welded.weldedVertices;
        return prepared;
      }
    }
    if (openEdges || nonManifoldEdges) {
      const problems = [];
      if (openEdges) problems.push(`${openEdges.toLocaleString()} open edges`);
      if (nonManifoldEdges) problems.push(`${nonManifoldEdges.toLocaleString()} non-manifold edges`);
      throw new Error(`Cannot make a solid: ${problems.join(', ')}. Repair the STL surface first.`);
    }

    // Track connected shells as well as winding. One STL can contain several
    // separate solids and inner cavity shells, each with its own orientation.
    const triangleCount = validLen / 3;
    const parents = new Uint32Array(triangleCount);
    for (let t = 0; t < triangleCount; t++) parents[t] = t;
    const find = index => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };

    const neighbors = reversedEdges ? Array.from({ length: triangleCount }, () => []) : null;
    for (let e = 0; e < edgeUsed; e++) {
      const o1 = edgeOwner[e], o2 = edgeOther[e];
      const t1 = o1 >>> 1, t2 = o2 >>> 1;
      const r1 = find(t1), r2 = find(t2);
      if (r1 !== r2) parents[r1] = r2;
      if (neighbors) {
        const different = (o1 & 1) === (o2 & 1) ? 1 : 0;
        neighbors[t1].push(t2 * 2 + different);
        neighbors[t2].push(t1 * 2 + different);
      }
    }
    edgeBuckets = null; edgeLo = null; edgeHi = null;
    edgeFwd = null; edgeBwd = null; edgeOwner = null; edgeOther = null;

    let repairedWinding = 0;
    if (neighbors) {
      const flips = new Int8Array(triangleCount).fill(-1);
      const queue = new Uint32Array(triangleCount);
      for (let start = 0; start < triangleCount; start++) {
        if (flips[start] !== -1) continue;
        let head = 0, tail = 0;
        queue[tail++] = start;
        flips[start] = 0;
        let toFlip = 0;
        while (head < tail) {
          const current = queue[head++];
          const flipCurr = flips[current];
          toFlip += flipCurr;
          const adj = neighbors[current];
          for (let k = 0; k < adj.length; k++) {
            const packed = adj[k];
            const next = packed >>> 1;
            const expected = flipCurr ^ (packed & 1);
            if (flips[next] === -1) { flips[next] = expected; queue[tail++] = next; }
            else if (flips[next] !== expected)
              throw new Error('Cannot make a solid: inconsistent winding cannot be repaired.');
          }
        }
        if (toFlip > tail / 2) {
          for (let k = 0; k < tail; k++) flips[queue[k]] ^= 1;
        }
      }
      for (let t = 0; t < triangleCount; t++) if (flips[t]) {
        const i = t * 3;
        const tmp = valid[i + 1]; valid[i + 1] = valid[i + 2]; valid[i + 2] = tmp;
        repairedWinding++;
      }
    }

    const shells = new Map();
    for (let t = 0; t < triangleCount; t++) {
      const i = t * 3;
      const a = valid[i] * 3, b = valid[i + 1] * 3, c = valid[i + 2] * 3;
      const root = find(t);
      let shell = shells.get(root);
      if (!shell) {
        shell = { triangles: [], volume6: 0,
          minX: Infinity, minY: Infinity, minZ: Infinity,
          maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
        shells.set(root, shell);
      }
      shell.triangles.push(t);
      const vax = vertices[a], vay = vertices[a + 1], vaz = vertices[a + 2];
      const vbx = vertices[b], vby = vertices[b + 1], vbz = vertices[b + 2];
      const vcx = vertices[c], vcy = vertices[c + 1], vcz = vertices[c + 2];
      if (vax < shell.minX) shell.minX = vax; if (vax > shell.maxX) shell.maxX = vax;
      if (vay < shell.minY) shell.minY = vay; if (vay > shell.maxY) shell.maxY = vay;
      if (vaz < shell.minZ) shell.minZ = vaz; if (vaz > shell.maxZ) shell.maxZ = vaz;
      if (vbx < shell.minX) shell.minX = vbx; if (vbx > shell.maxX) shell.maxX = vbx;
      if (vby < shell.minY) shell.minY = vby; if (vby > shell.maxY) shell.maxY = vby;
      if (vbz < shell.minZ) shell.minZ = vbz; if (vbz > shell.maxZ) shell.maxZ = vbz;
      if (vcx < shell.minX) shell.minX = vcx; if (vcx > shell.maxX) shell.maxX = vcx;
      if (vcy < shell.minY) shell.minY = vcy; if (vcy > shell.maxY) shell.maxY = vcy;
      if (vcz < shell.minZ) shell.minZ = vcz; if (vcz > shell.maxZ) shell.maxZ = vcz;
      const ax = vax - originX, ay = vay - originY, az = vaz - originZ;
      const bx = vbx - originX, by = vby - originY, bz = vbz - originZ;
      const cx = vcx - originX, cy = vcy - originY, cz = vcz - originZ;
      shell.volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }

    const containsPoint = (shell, px, py, pz) => {
      const rx = 1, ry = 0.419, rz = 0.287;
      let intersections = 0;
      const tris = shell.triangles;
      for (let idx = 0; idx < tris.length; idx++) {
        const i = tris[idx] * 3;
        const ia = valid[i] * 3, ib = valid[i + 1] * 3, ic = valid[i + 2] * 3;
        const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
        const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
        const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];
        if ((ax < px && bx < px && cx < px) ||
            (ay < py && by < py && cy < py) ||
            (az < pz && bz < pz && cz < pz)) continue;
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const hx = ry * vz - rz * vy;
        const hy = rz * vx - rx * vz;
        const hz = rx * vy - ry * vx;
        const determinant = ux * hx + uy * hy + uz * hz;
        if (Math.abs(determinant) < 1e-12) continue;
        const inv = 1 / determinant;
        const sx = px - ax, sy = py - ay, sz = pz - az;
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qx = sy * uz - sz * uy, qy = sz * ux - sx * uz, qz = sx * uy - sy * ux;
        const v = (rx * qx + ry * qy + rz * qz) * inv;
        if (v < -1e-9 || u + v > 1 + 1e-9) continue;
        const distance = (vx * qx + vy * qy + vz * qz) * inv;
        if (distance > 1e-9) intersections++;
      }
      return intersections % 2 === 1;
    };
    let reoriented = false;
    const components = [...shells.values()];
    for (const shell of components) {
      let depth = 0;
      const first = valid[shell.triangles[0] * 3] * 3;
      const px = vertices[first], py = vertices[first + 1], pz = vertices[first + 2];
      for (const outer of components) {
        if (outer === shell) continue;
        if (outer.minX >= shell.minX || outer.maxX <= shell.maxX ||
            outer.minY >= shell.minY || outer.maxY <= shell.maxY ||
            outer.minZ >= shell.minZ || outer.maxZ <= shell.maxZ) continue;
        if (containsPoint(outer, px, py, pz)) depth++;
      }
      const shouldFaceInward = depth % 2 === 1;
      if ((shell.volume6 < 0) !== shouldFaceInward) {
        for (const t of shell.triangles) {
          const i = t * 3;
          const tmp = valid[i + 1]; valid[i + 1] = valid[i + 2]; valid[i + 2] = tmp;
        }
        reoriented = true;
      }
    }
    return {
      vertices: vertices instanceof Float32Array ? vertices : Float32Array.from(vertices),
      triangles: validLen === valid.length ? valid : valid.slice(0, validLen),
      removedDegenerate: removed, repairedWinding,
      reoriented, weldedVertices: 0,
    };
  }

  function convert(module, source, options = {}) {
    if (options.geometry === 'feature-fit') {
      if (!root.WebCADMeshFeatureFitCore)
        throw new Error('Analytic feature-fitting engine is unavailable.');
      const cleaned = prepareSolidMesh(source);
      const fitOptions = { ...options };
      if (options.accuracy && !options.chordTolerance) {
        fitOptions.chordToleranceRatio = Math.max(5e-5, Number(options.accuracy) * 0.05);
      }
      const fitted = root.WebCADMeshFeatureFitCore.rebuild(cleaned, fitOptions);
      const input = new module.Mesh({ numProp: 3,
        vertProperties: fitted.vertices, triVerts: fitted.triangles });
      const solid = new module.Manifold(input);
      try {
        const status = solid.status();
        if (status !== 'NoError' || solid.isEmpty())
          throw new Error(`Cannot make a solid: ${status}. Repair overlapping or self-intersecting surfaces first.`);
        const volume = solid.volume();
        if (!Number.isFinite(volume) || volume <= 1e-9)
          throw new Error('Cannot make a solid: the mesh has no enclosed volume.');
        const outMesh = solid.getMesh();
        const vertices = new Float32Array(outMesh.vertProperties.length / outMesh.numProp * 3);
        for (let i = 0, at = 0; i < outMesh.vertProperties.length; i += outMesh.numProp) {
          vertices[at++] = outMesh.vertProperties[i];
          vertices[at++] = outMesh.vertProperties[i + 1];
          vertices[at++] = outMesh.vertProperties[i + 2];
        }
        const triangles = Uint32Array.from(outMesh.triVerts);
        const featureSummary = root.WebCADMeshFeatureFitCore.summary(fitted.surfaces);
        return {
          vertices, triangles, volume,
          removedDegenerate: cleaned.removedDegenerate,
          repair: cleaned.repair || null,
          repairedWinding: cleaned.repairedWinding,
          reoriented: cleaned.reoriented,
          triangleCount: triangles.length / 3,
          vertexCount: vertices.length / 3,
          originalTriangles: cleaned.triangles.length / 3,
          optimized: false,
          rebuildApplied: false,
          rebuildReason: null,
          rebuildDeviation: null,
          rebuildDeviationRatio: null,
          rebuildVolumeChange: null,
          featureFitApplied: true,
          featureSurfaces: fitted.surfaces,
          featureSummary,
          featureLevels: fitted.levels,
        };
      } finally {
        solid.delete();
      }
    }
    const cleaned = prepareSolidMesh(source);
    const input = new module.Mesh({ numProp: 3,
      vertProperties: cleaned.vertices, triVerts: cleaned.triangles });
    const solid = new module.Manifold(input);
    let simplified = null, rebuilt = null;
    try {
      const status = solid.status();
      if (status !== 'NoError' || solid.isEmpty())
        throw new Error(`Cannot make a solid: ${status}. Repair overlapping or self-intersecting surfaces first.`);
      const originalVolume = solid.volume();
      if (!Number.isFinite(originalVolume) || originalVolume <= 1e-9)
        throw new Error('Cannot make a solid: the mesh has no enclosed volume.');
      let volume = originalVolume;
      let outputSolid = solid;
      if (options.geometry === 'rebuild') {
        rebuilt = root.WebCADMeshRebuildCore?.rebuild(module, solid, options);
        if (!rebuilt) throw new Error('Surface rebuild engine is unavailable.');
        if (rebuilt.solid) {
          outputSolid = rebuilt.solid;
          volume = outputSolid.volume();
        }
      }
      if (options.quality === 'balanced' || options.quality === 'fast') {
        const v = cleaned.vertices;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < v.length; i += 3) {
          minX = Math.min(minX, v[i]); maxX = Math.max(maxX, v[i]);
          minY = Math.min(minY, v[i + 1]); maxY = Math.max(maxY, v[i + 1]);
          minZ = Math.min(minZ, v[i + 2]); maxZ = Math.max(maxZ, v[i + 2]);
        }
        const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const levels = options.quality === 'fast' ? [0.003, 0.0015, 0.0005] : [0.0005, 0.00025];
        const accuracy = Math.max(0.0001, Math.min(0.01, Number(options.accuracy) || 0.006));
        let reference = null;
        for (const level of levels) {
          let candidate = null;
          try {
            candidate = outputSolid.simplify(extent * level);
            if (candidate.status() === 'NoError' && !candidate.isEmpty() &&
                candidate.numTri() < outputSolid.numTri()) {
              const simplifiedVolume = candidate.volume();
              const volumeChange = Math.abs(simplifiedVolume - originalVolume) / originalVolume;
              if (volumeChange <= 0.01) {
                reference ||= root.WebCADMeshRebuildCore.meshData(solid.getMesh());
                const candidateData = root.WebCADMeshRebuildCore.meshData(candidate.getMesh());
                const measured = root.WebCADMeshRebuildCore.measureSurface(reference, candidateData, accuracy);
                if (measured.valid) {
                  simplified = candidate;
                  outputSolid = candidate;
                  volume = simplifiedVolume;
                  if (rebuilt?.solid) {
                    rebuilt.deviation = measured.deviation;
                    rebuilt.deviationRatio = measured.deviation / extent;
                    rebuilt.volumeChange = volumeChange;
                  }
                }
              }
            }
          } catch {
            // Preserve the exact solid if optional optimization cannot be applied.
          } finally {
            if (candidate !== simplified) candidate?.delete();
          }
          if (simplified) break;
        }
      }
      const output = outputSolid.getMesh();
      const vertices = new Float32Array(output.vertProperties.length / output.numProp * 3);
      for (let i = 0, at = 0; i < output.vertProperties.length; i += output.numProp) {
        vertices[at++] = output.vertProperties[i];
        vertices[at++] = output.vertProperties[i + 1];
        vertices[at++] = output.vertProperties[i + 2];
      }
      const triangles = Uint32Array.from(output.triVerts);
      return { vertices, triangles, volume, removedDegenerate: cleaned.removedDegenerate, repair: cleaned.repair || null,
        repairedWinding: cleaned.repairedWinding, reoriented: cleaned.reoriented,
        triangleCount: triangles.length / 3, vertexCount: vertices.length / 3,
        originalTriangles: cleaned.triangles.length / 3,
        optimized: outputSolid !== solid,
        rebuildApplied: Boolean(rebuilt?.solid), rebuildReason: rebuilt?.reason || null,
        rebuildDeviation: rebuilt?.deviation ?? null,
        rebuildDeviationRatio: rebuilt?.deviationRatio ?? null,
        rebuildVolumeChange: rebuilt?.volumeChange ?? null };
    } finally {
      rebuilt?.solid?.delete();
      simplified?.delete();
      solid.delete();
    }
  }

  // Downloaded STL files often have a handful of defects (nearly coincident
  // vertices, doubled facets, edges shared by more than two facets, small
  // holes). Fix those locally so the surface encloses a volume:
  //   1. weld vertices closer than a tiny fraction of the model size,
  //   2. drop degenerate facets and cancel doubled facets,
  //   3. remove facets on edges used by more than two facets,
  //   4. close every remaining hole with a fan around its centroid.
  function repairMesh(source) {
    const sourceVertices = source.vertices;
    const sourceTriangles = source.triangles;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < sourceVertices.length; i += 3) {
      const x = sourceVertices[i], y = sourceVertices[i + 1], z = sourceVertices[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const cell = extent * 1e-6;
    const invCell = 1 / cell;

    const srcVertCount = sourceVertices.length / 3;
    const remap = new Uint32Array(srcVertCount);
    let vertCap = Math.max(64, srcVertCount + 64);
    let vertsBuf = new Float32Array(vertCap * 3);
    let vertCount = 0;
    {
      let wCap = 64;
      while (wCap < srcVertCount * 2) wCap <<= 1;
      const wMask = wCap - 1;
      const wBuckets = new Int32Array(wCap).fill(-1);
      const qCoords = new Float64Array(srcVertCount * 3);
      for (let i = 0; i < srcVertCount; i++) {
        const at = i * 3;
        const x = sourceVertices[at], y = sourceVertices[at + 1], z = sourceVertices[at + 2];
        let qx = Math.round(x * invCell);
        let qy = Math.round(y * invCell);
        let qz = Math.round(z * invCell);
        if (qx === 0) qx = 0;
        if (qy === 0) qy = 0;
        if (qz === 0) qz = 0;
        let h = (Math.imul(qx | 0, 73856093) ^
          Math.imul(qy | 0, 19349663) ^
          Math.imul(qz | 0, 83492791)) & wMask;
        let index = -1;
        while (true) {
          const slot = wBuckets[h];
          if (slot === -1) break;
          const b = slot * 3;
          if (qCoords[b] === qx && qCoords[b + 1] === qy && qCoords[b + 2] === qz) {
            index = slot;
            break;
          }
          h = (h + 1) & wMask;
        }
        if (index === -1) {
          index = vertCount++;
          const b = index * 3;
          qCoords[b] = qx; qCoords[b + 1] = qy; qCoords[b + 2] = qz;
          vertsBuf[b] = x; vertsBuf[b + 1] = y; vertsBuf[b + 2] = z;
          wBuckets[h] = index;
        }
        remap[i] = index;
      }
    }
    const weldedVertices = srcVertCount - vertCount;

    const pushVertex = (x, y, z) => {
      if (vertCount === vertCap) {
        vertCap <<= 1;
        const next = new Float32Array(vertCap * 3);
        next.set(vertsBuf);
        vertsBuf = next;
      }
      const id = vertCount++;
      const b = id * 3;
      vertsBuf[b] = x; vertsBuf[b + 1] = y; vertsBuf[b + 2] = z;
      return id;
    };

    // Facets with the same three corners: equal windings are duplicates,
    // opposite windings are a zero-thickness double wall and cancel out.
    const srcTriCount = sourceTriangles.length / 3;
    let fCap = 64;
    while (fCap < srcTriCount * 2) fCap <<= 1;
    let fMask = fCap - 1;
    let fBuckets = new Int32Array(fCap).fill(-1);
    let fMax = fCap >> 1;
    let fS0 = new Uint32Array(fMax);
    let fS1 = new Uint32Array(fMax);
    let fS2 = new Uint32Array(fMax);
    let fBalance = new Int32Array(fMax);
    let fCount = new Uint32Array(fMax);
    let fUsed = 0;
    let removedDegenerate = 0;

    for (let i = 0; i < sourceTriangles.length; i += 3) {
      const a = remap[sourceTriangles[i]], b = remap[sourceTriangles[i + 1]], c = remap[sourceTriangles[i + 2]];
      if (a === b || b === c || c === a) { removedDegenerate++; continue; }
      let s0 = a, s1 = b, s2 = c;
      let even = true;
      if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; even = !even; }
      if (s1 > s2) { const tmp = s1; s1 = s2; s2 = tmp; even = !even; }
      if (s0 > s1) { const tmp = s0; s0 = s1; s1 = tmp; even = !even; }

      if (fUsed * 10 >= fCap * 7) {
        fCap <<= 1;
        fMask = fCap - 1;
        fBuckets = new Int32Array(fCap).fill(-1);
        for (let k = 0; k < fUsed; k++) {
          let fh = (Math.imul(fS0[k], 73856093) ^ Math.imul(fS1[k], 19349663) ^ Math.imul(fS2[k], 83492791)) & fMask;
          while (fBuckets[fh] !== -1) fh = (fh + 1) & fMask;
          fBuckets[fh] = k;
        }
      }
      let h = (Math.imul(s0, 73856093) ^ Math.imul(s1, 19349663) ^ Math.imul(s2, 83492791)) & fMask;
      let slot = -1;
      while (true) {
        const cur = fBuckets[h];
        if (cur === -1) break;
        if (fS0[cur] === s0 && fS1[cur] === s1 && fS2[cur] === s2) {
          slot = cur;
          break;
        }
        h = (h + 1) & fMask;
      }
      if (slot === -1) {
        if (fUsed === fMax) {
          fMax <<= 1;
          const gU = arr => { const n = new Uint32Array(fMax); n.set(arr); return n; };
          const gI = arr => { const n = new Int32Array(fMax); n.set(arr); return n; };
          fS0 = gU(fS0); fS1 = gU(fS1); fS2 = gU(fS2);
          fBalance = gI(fBalance); fCount = gU(fCount);
        }
        slot = fUsed++;
        fS0[slot] = s0; fS1[slot] = s1; fS2[slot] = s2;
        fBalance[slot] = even ? 1 : -1;
        fCount[slot] = 1;
        fBuckets[h] = slot;
      } else {
        fBalance[slot] += even ? 1 : -1;
        fCount[slot]++;
      }
    }

    let triCap = Math.max(64, fUsed + 64);
    let trisBuf = new Uint32Array(triCap * 3);
    let triCount = 0;
    let removedDuplicates = 0;
    for (let k = 0; k < fUsed; k++) {
      const bal = fBalance[k];
      const cnt = fCount[k];
      if (bal === 0) { removedDuplicates += cnt; continue; }
      const at = triCount++ * 3;
      const s0 = fS0[k], s1 = fS1[k], s2 = fS2[k];
      if (bal > 0) {
        trisBuf[at] = s0; trisBuf[at + 1] = s1; trisBuf[at + 2] = s2;
      } else {
        trisBuf[at] = s0; trisBuf[at + 1] = s2; trisBuf[at + 2] = s1;
      }
      removedDuplicates += cnt - 1;
    }
    fBuckets = null; fS0 = null; fS1 = null; fS2 = null; fBalance = null; fCount = null;

    const pushTriangle = (a, b, c) => {
      if (triCount === triCap) {
        triCap <<= 1;
        const next = new Uint32Array(triCap * 3);
        next.set(trisBuf);
        trisBuf = next;
      }
      const at = triCount++ * 3;
      trisBuf[at] = a; trisBuf[at + 1] = b; trisBuf[at + 2] = c;
    };

    const estEdgeCap = Math.max(64, Math.ceil(triCount * 1.55));
    let eCap = 64;
    while (eCap < estEdgeCap * 2) eCap <<= 1;
    let eMask = eCap - 1;
    let eBuckets = new Int32Array(eCap).fill(-1);
    let eMax = eCap >> 1;
    let eLo = new Uint32Array(eMax);
    let eHi = new Uint32Array(eMax);
    let eCounts = new Uint32Array(eMax);
    let eUsed = 0;

    const buildEdgeCounts = () => {
      eBuckets.fill(-1);
      eUsed = 0;
      const add = (p, q) => {
        const lo = p < q ? p : q;
        const hi = p < q ? q : p;
        if (eUsed * 10 >= eCap * 7) {
          eCap <<= 1;
          eMask = eCap - 1;
          eBuckets = new Int32Array(eCap).fill(-1);
          for (let k = 0; k < eUsed; k++) {
            let eh = Math.imul(eLo[k] ^ Math.imul(eHi[k], 0x9e3779b1), 0x85ebca6b);
            eh = ((eh ^ (eh >>> 15)) >>> 0) & eMask;
            while (eBuckets[eh] !== -1) eh = (eh + 1) & eMask;
            eBuckets[eh] = k;
          }
        }
        let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b);
        h = ((h ^ (h >>> 15)) >>> 0) & eMask;
        while (true) {
          const slot = eBuckets[h];
          if (slot === -1) {
            if (eUsed === eMax) {
              eMax <<= 1;
              const grow = arr => { const n = new Uint32Array(eMax); n.set(arr); return n; };
              eLo = grow(eLo); eHi = grow(eHi); eCounts = grow(eCounts);
            }
            const id = eUsed++;
            eLo[id] = lo; eHi[id] = hi; eCounts[id] = 1;
            eBuckets[h] = id;
            return;
          }
          if (eLo[slot] === lo && eHi[slot] === hi) {
            eCounts[slot]++;
            return;
          }
          h = (h + 1) & eMask;
        }
      };
      for (let t = 0; t < triCount; t++) {
        const at = t * 3;
        const a = trisBuf[at], b = trisBuf[at + 1], c = trisBuf[at + 2];
        add(a, b); add(b, c); add(c, a);
      }
    };

    const getEdgeCount = (p, q) => {
      const lo = p < q ? p : q;
      const hi = p < q ? q : p;
      let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b);
      h = ((h ^ (h >>> 15)) >>> 0) & eMask;
      while (true) {
        const slot = eBuckets[h];
        if (slot === -1) return 0;
        if (eLo[slot] === lo && eHi[slot] === hi) return eCounts[slot];
        h = (h + 1) & eMask;
      }
    };

    buildEdgeCounts();
    let hasCrowded = false;
    for (let e = 0; e < eUsed; e++) {
      if (eCounts[e] > 2) { hasCrowded = true; break; }
    }
    let removedNonManifold = 0;
    if (hasCrowded) {
      const before = triCount;
      let write = 0;
      for (let t = 0; t < triCount; t++) {
        const at = t * 3;
        const a = trisBuf[at], b = trisBuf[at + 1], c = trisBuf[at + 2];
        if (getEdgeCount(a, b) <= 2 && getEdgeCount(b, c) <= 2 && getEdgeCount(c, a) <= 2) {
          const dst = write++ * 3;
          trisBuf[dst] = a; trisBuf[dst + 1] = b; trisBuf[dst + 2] = c;
        }
      }
      removedNonManifold = before - write;
      triCount = write;
      buildEdgeCounts();
    }

    let filledHoles = 0;
    const closeCycle = cycle => {
      if (cycle.length < 3) return;
      filledHoles++;
      if (cycle.length === 3) {
        pushTriangle(cycle[0], cycle[1], cycle[2]);
        return;
      }
      let cx = 0, cy = 0, cz = 0;
      for (const index of cycle) {
        cx += vertsBuf[index * 3]; cy += vertsBuf[index * 3 + 1]; cz += vertsBuf[index * 3 + 2];
      }
      const center = pushVertex(cx / cycle.length, cy / cycle.length, cz / cycle.length);
      for (let i = 0; i < cycle.length; i++) pushTriangle(cycle[i], cycle[(i + 1) % cycle.length], center);
    };
    // A traced loop may pass the same vertex twice (pinched holes); split it
    // into simple cycles so each fan stays manifold.
    const closeLoop = path => {
      const stack = [];
      const position = new Map();
      for (const index of path) {
        if (position.has(index)) {
          const loop = stack.splice(position.get(index) + 1);
          for (const removed of loop) position.delete(removed);
          closeCycle([index, ...loop]);
        } else {
          position.set(index, stack.length);
          stack.push(index);
        }
      }
      closeCycle(stack);
    };
    // Directed pass: each open edge u->v gets a fill edge v->u, so the fans
    // already match the surrounding winding. Holes whose rim has mixed
    // winding only close in the undirected pass; prepareClosedMesh then
    // makes the winding consistent.
    const fillHoles = (directed, recount) => {
      if (recount) buildEdgeCounts();
      let hasOpen = false;
      for (let e = 0; e < eUsed; e++) {
        if (eCounts[e] === 1) { hasOpen = true; break; }
      }
      if (!hasOpen) return false;

      const next = new Map();
      const link = (from, to) => {
        if (!next.has(from)) next.set(from, []);
        next.get(from).push(to);
      };
      const baseTris = triCount;
      for (let t = 0; t < baseTris; t++) {
        const at = t * 3;
        const a = trisBuf[at], b = trisBuf[at + 1], c = trisBuf[at + 2];
        if (getEdgeCount(a, b) === 1) { link(b, a); if (!directed) link(a, b); }
        if (getEdgeCount(b, c) === 1) { link(c, b); if (!directed) link(b, c); }
        if (getEdgeCount(c, a) === 1) { link(a, c); if (!directed) link(c, a); }
      }
      if (!next.size) return false;
      const take = from => {
        const to = next.get(from).pop();
        if (!directed) {
          const back = next.get(to);
          back.splice(back.lastIndexOf(from), 1);
        }
        return to;
      };
      for (const start of [...next.keys()]) {
        while (next.get(start)?.length) {
          const path = [start];
          let current = start;
          let closed = false;
          while (next.get(current)?.length) {
            const to = take(current);
            if (to === start) { closed = true; break; }
            path.push(to);
            current = to;
          }
          if (closed) closeLoop(path);
        }
      }
      return triCount > baseTris;
    };
    const addedDirected = fillHoles(true, false);
    fillHoles(false, addedDirected);

    return {
      vertices: vertCount * 3 === vertsBuf.length ? vertsBuf : vertsBuf.slice(0, vertCount * 3),
      triangles: triCount * 3 === trisBuf.length ? trisBuf : trisBuf.slice(0, triCount * 3),
      repair: { weldedVertices, removedDegenerate, removedDuplicates, removedNonManifold, filledHoles },
    };
  }

  // prepareClosedMesh with a repair pass for surfaces that are not closed.
  function prepareSolidMesh(source) {
    try {
      return prepareClosedMesh(source);
    } catch (error) {
      if (!/open edges|non-manifold edges/.test(error?.message || '')) throw error;
      const repaired = repairMesh(source);
      let prepared;
      try {
        prepared = prepareClosedMesh(repaired, false, { keepZeroArea: true });
      } catch (retryError) {
        const problems = retryError.message.replace(/^Cannot make a solid: /, '').replace(/\. Repair the STL surface first\.$/, '');
        throw new Error(`Cannot make a solid even after automatic repair (${problems} remain). Repair the STL in a mesh tool such as Meshmixer or Blender first.`);
      }
      prepared.repair = repaired.repair;
      return prepared;
    }
  }

  root.WebCADMeshSolidCore = { prepareClosedMesh, prepareSolidMesh, repairMesh, convert };
})(typeof self !== 'undefined' ? self : globalThis);
