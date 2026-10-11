(function (root) {
  'use strict';

  function weldCoincidentVertices(vertices, triangles) {
    const lookup = new Map();
    const remap = new Uint32Array(vertices.length / 3);
    const compact = [];
    for (let i = 0; i < remap.length; i++) {
      const offset = i * 3;
      const key = `${vertices[offset]},${vertices[offset + 1]},${vertices[offset + 2]}`;
      let index = lookup.get(key);
      if (index === undefined) {
        index = compact.length / 3;
        compact.push(vertices[offset], vertices[offset + 1], vertices[offset + 2]);
        lookup.set(key, index);
      }
      remap[i] = index;
    }
    if (compact.length === vertices.length) return null;
    const welded = new Uint32Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) welded[i] = remap[triangles[i]];
    return { vertices: Float32Array.from(compact), triangles: welded,
      weldedVertices: remap.length - compact.length / 3 };
  }

  function prepareClosedMesh(source, allowWeld = true) {
    const vertices = source?.vertices;
    const triangles = source?.triangles;
    if (!vertices || !triangles || vertices.length % 3 || triangles.length % 3 || triangles.length < 12)
      throw new Error('The mesh needs at least four valid triangles to form a solid.');

    const vertexCount = vertices.length / 3;
    for (let i = 0; i < vertices.length; i++) {
      if (!Number.isFinite(vertices[i])) throw new Error('The mesh contains invalid coordinates.');
    }

    const edges = new Map();
    const valid = [];
    let removed = 0;
    const originX = vertices[0], originY = vertices[1], originZ = vertices[2];
    const addEdge = (from, to) => {
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const key = lo * vertexCount + hi;
      edges.set(key, (edges.get(key) || 0) + (from < to ? 1 : 0x10000));
    };
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) ||
          a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount)
        throw new Error('The mesh contains invalid triangle indices.');
      if (a === b || b === c || c === a) { removed++; continue; }
      const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
      const ux = vertices[b * 3] - ax, uy = vertices[b * 3 + 1] - ay, uz = vertices[b * 3 + 2] - az;
      const vx = vertices[c * 3] - ax, vy = vertices[c * 3 + 1] - ay, vz = vertices[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz <= 1e-24) { removed++; continue; }
      valid.push(a, b, c);
      addEdge(a, b); addEdge(b, c); addEdge(c, a);
    }
    if (valid.length < 12) throw new Error('The mesh has too few nondegenerate faces to form a solid.');

    let openEdges = 0, nonManifoldEdges = 0, reversedEdges = 0;
    for (const state of edges.values()) {
      const forward = state & 0xffff, backward = state >>> 16;
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
    const triangleCount = valid.length / 3;
    const parents = new Uint32Array(triangleCount);
    for (let t = 0; t < triangleCount; t++) parents[t] = t;
    const find = index => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };
    const owners = new Map();
    const neighbors = reversedEdges ? Array.from({ length: triangleCount }, () => []) : null;
    for (let t = 0; t < triangleCount; t++) {
      const i = t * 3, a = valid[i], b = valid[i + 1], c = valid[i + 2];
      for (const [from, to] of [[a, b], [b, c], [c, a]]) {
        const key = Math.min(from, to) * vertexCount + Math.max(from, to);
        const direction = from < to ? 1 : 0;
        const owner = owners.get(key);
        if (owner === undefined) owners.set(key, t * 2 + direction);
        else {
          const other = Math.floor(owner / 2);
          parents[find(t)] = find(other);
          if (neighbors) {
            const different = owner % 2 === direction ? 1 : 0;
            neighbors[t].push([other, different]);
            neighbors[other].push([t, different]);
          }
        }
      }
    }
    owners.clear();
    let repairedWinding = 0;
    if (neighbors) {
      const flips = new Int8Array(triangleCount).fill(-1);
      for (let start = 0; start < triangleCount; start++) {
        if (flips[start] !== -1) continue;
        const queue = [start];
        flips[start] = 0;
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const current = queue[cursor];
          for (const [next, different] of neighbors[current]) {
            const expected = flips[current] ^ different;
            if (flips[next] === -1) { flips[next] = expected; queue.push(next); }
            else if (flips[next] !== expected)
              throw new Error('Cannot make a solid: inconsistent winding cannot be repaired.');
          }
        }
        let toFlip = 0;
        for (const t of queue) toFlip += flips[t];
        if (toFlip > queue.length / 2) for (const t of queue) flips[t] ^= 1;
      }
      for (let t = 0; t < triangleCount; t++) if (flips[t]) {
        const i = t * 3;
        [valid[i + 1], valid[i + 2]] = [valid[i + 2], valid[i + 1]];
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
          min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        shells.set(root, shell);
      }
      shell.triangles.push(t);
      for (const j of [a, b, c]) for (let axis = 0; axis < 3; axis++) {
        shell.min[axis] = Math.min(shell.min[axis], vertices[j + axis]);
        shell.max[axis] = Math.max(shell.max[axis], vertices[j + axis]);
      }
      const ax = vertices[a] - originX, ay = vertices[a + 1] - originY, az = vertices[a + 2] - originZ;
      const bx = vertices[b] - originX, by = vertices[b + 1] - originY, bz = vertices[b + 2] - originZ;
      const cx = vertices[c] - originX, cy = vertices[c + 1] - originY, cz = vertices[c + 2] - originZ;
      shell.volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }

    const containsPoint = (shell, point) => {
      const ray = [1, 0.419, 0.287];
      let intersections = 0;
      for (const t of shell.triangles) {
        const i = t * 3, ia = valid[i] * 3, ib = valid[i + 1] * 3, ic = valid[i + 2] * 3;
        const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
        const ux = vertices[ib] - ax, uy = vertices[ib + 1] - ay, uz = vertices[ib + 2] - az;
        const vx = vertices[ic] - ax, vy = vertices[ic + 1] - ay, vz = vertices[ic + 2] - az;
        const hx = ray[1] * vz - ray[2] * vy;
        const hy = ray[2] * vx - ray[0] * vz;
        const hz = ray[0] * vy - ray[1] * vx;
        const determinant = ux * hx + uy * hy + uz * hz;
        if (Math.abs(determinant) < 1e-12) continue;
        const inv = 1 / determinant;
        const sx = point[0] - ax, sy = point[1] - ay, sz = point[2] - az;
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < -1e-9 || u > 1 + 1e-9) continue;
        const qx = sy * uz - sz * uy, qy = sz * ux - sx * uz, qz = sx * uy - sy * ux;
        const v = (ray[0] * qx + ray[1] * qy + ray[2] * qz) * inv;
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
      const point = [vertices[first], vertices[first + 1], vertices[first + 2]];
      for (const outer of components) {
        if (outer === shell) continue;
        if (!shell.min.every((min, axis) =>
          outer.min[axis] < min && outer.max[axis] > shell.max[axis])) continue;
        if (containsPoint(outer, point)) depth++;
      }
      const shouldFaceInward = depth % 2 === 1;
      if ((shell.volume6 < 0) !== shouldFaceInward) {
        for (const t of shell.triangles) {
          const i = t * 3;
          [valid[i + 1], valid[i + 2]] = [valid[i + 2], valid[i + 1]];
        }
        reoriented = true;
      }
    }
    return { vertices: vertices instanceof Float32Array ? vertices : Float32Array.from(vertices),
      triangles: Uint32Array.from(valid), removedDegenerate: removed, repairedWinding,
      reoriented, weldedVertices: 0 };
  }

  function convert(module, source, options = {}) {
    if (options.geometry === 'feature-fit') {
      if (!root.WebCADMeshFeatureFitCore)
        throw new Error('Analytic feature-fitting engine is unavailable.');
      const cleaned = prepareClosedMesh(source);
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
    const cleaned = prepareClosedMesh(source);
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
      return { vertices, triangles, volume, removedDegenerate: cleaned.removedDegenerate,
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

  root.WebCADMeshSolidCore = { prepareClosedMesh, convert };
})(typeof self !== 'undefined' ? self : globalThis);
