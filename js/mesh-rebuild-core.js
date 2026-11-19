(function (root) {
  'use strict';

  // STL vertices are not an analytic surface. Compare both triangulated
  // surfaces, including triangle interiors, before accepting an edit.
  function meshBounds(mesh) {
    const v = mesh.vertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      extent: Math.max(maxX - minX, maxY - minY, maxZ - minZ),
    };
  }

  function closestTriangleDistanceSq(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const s = d1 / (d1 - d3);
      const dx = apx - s * abx, dy = apy - s * aby, dz = apz - s * abz;
      return dx * dx + dy * dy + dz * dz;
    }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const s = d2 / (d2 - d6);
      const dx = apx - s * acx, dy = apy - s * acy, dz = apz - s * acz;
      return dx * dx + dy * dy + dz * dz;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const s = (d4 - d3) / (d4 - d3 + d5 - d6);
      const dx = px - (bx + s * (cx - bx));
      const dy = py - (by + s * (cy - by));
      const dz = pz - (bz + s * (cz - bz));
      return dx * dx + dy * dy + dz * dz;
    }
    const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
    const dx = apx - v * abx - w * acx;
    const dy = apy - v * aby - w * acy;
    const dz = apz - v * abz - w * acz;
    return dx * dx + dy * dy + dz * dz;
  }

  function buildIndex(mesh) {
    const v = mesh.vertices;
    const t = mesh.triangles;
    const faceCount = (t.length / 3) | 0;
    if (faceCount === 0) {
      return {
        query: (_p, limit = Infinity) => limit + Number.EPSILON * Math.max(1, limit),
        nearest: (_p, limit = Infinity) => ({ distance: limit + Number.EPSILON * Math.max(1, limit), face: null }),
        distanceToFace: () => Infinity,
      };
    }

    const triMinX = new Float64Array(faceCount), triMaxX = new Float64Array(faceCount);
    const triMinY = new Float64Array(faceCount), triMaxY = new Float64Array(faceCount);
    const triMinZ = new Float64Array(faceCount), triMaxZ = new Float64Array(faceCount);
    const triCx = new Float64Array(faceCount), triCy = new Float64Array(faceCount), triCz = new Float64Array(faceCount);
    const order = new Uint32Array(faceCount);

    for (let f = 0; f < faceCount; f++) {
      order[f] = f;
      const tb = f * 3;
      const i0 = t[tb] * 3, i1 = t[tb + 1] * 3, i2 = t[tb + 2] * 3;
      const x0 = v[i0], y0 = v[i0 + 1], z0 = v[i0 + 2];
      const x1 = v[i1], y1 = v[i1 + 1], z1 = v[i1 + 2];
      const x2 = v[i2], y2 = v[i2 + 1], z2 = v[i2 + 2];
      const loX = x0 < x1 ? (x0 < x2 ? x0 : x2) : (x1 < x2 ? x1 : x2);
      const hiX = x0 > x1 ? (x0 > x2 ? x0 : x2) : (x1 > x2 ? x1 : x2);
      const loY = y0 < y1 ? (y0 < y2 ? y0 : y2) : (y1 < y2 ? y1 : y2);
      const hiY = y0 > y1 ? (y0 > y2 ? y0 : y2) : (y1 > y2 ? y1 : y2);
      const loZ = z0 < z1 ? (z0 < z2 ? z0 : z2) : (z1 < z2 ? z1 : z2);
      const hiZ = z0 > z1 ? (z0 > z2 ? z0 : z2) : (z1 > z2 ? z1 : z2);
      triMinX[f] = loX; triMaxX[f] = hiX;
      triMinY[f] = loY; triMaxY[f] = hiY;
      triMinZ[f] = loZ; triMaxZ[f] = hiZ;
      triCx[f] = (loX + hiX) * 0.5;
      triCy[f] = (loY + hiY) * 0.5;
      triCz[f] = (loZ + hiZ) * 0.5;
    }

    let nodeCap = Math.max(64, Math.ceil(faceCount / 3) + 16);
    let nodeMinX = new Float64Array(nodeCap), nodeMaxX = new Float64Array(nodeCap);
    let nodeMinY = new Float64Array(nodeCap), nodeMaxY = new Float64Array(nodeCap);
    let nodeMinZ = new Float64Array(nodeCap), nodeMaxZ = new Float64Array(nodeCap);
    let nodeLeft = new Int32Array(nodeCap);
    let nodeRight = new Int32Array(nodeCap);
    let nodeStart = new Int32Array(nodeCap);
    let nodeCount = new Int32Array(nodeCap);
    let usedNodes = 0;

    const allocNode = () => {
      if (usedNodes === nodeCap) {
        nodeCap <<= 1;
        const gF = a => { const n = new Float64Array(nodeCap); n.set(a); return n; };
        const gI = a => { const n = new Int32Array(nodeCap); n.set(a); return n; };
        nodeMinX = gF(nodeMinX); nodeMaxX = gF(nodeMaxX);
        nodeMinY = gF(nodeMinY); nodeMaxY = gF(nodeMaxY);
        nodeMinZ = gF(nodeMinZ); nodeMaxZ = gF(nodeMaxZ);
        nodeLeft = gI(nodeLeft); nodeRight = gI(nodeRight);
        nodeStart = gI(nodeStart); nodeCount = gI(nodeCount);
      }
      return usedNodes++;
    };

    const buildNode = (start, end) => {
      const id = allocNode();
      let loX = Infinity, loY = Infinity, loZ = Infinity;
      let hiX = -Infinity, hiY = -Infinity, hiZ = -Infinity;
      for (let i = start; i < end; i++) {
        const f = order[i];
        if (triMinX[f] < loX) loX = triMinX[f]; if (triMaxX[f] > hiX) hiX = triMaxX[f];
        if (triMinY[f] < loY) loY = triMinY[f]; if (triMaxY[f] > hiY) hiY = triMaxY[f];
        if (triMinZ[f] < loZ) loZ = triMinZ[f]; if (triMaxZ[f] > hiZ) hiZ = triMaxZ[f];
      }
      nodeMinX[id] = loX; nodeMaxX[id] = hiX;
      nodeMinY[id] = loY; nodeMaxY[id] = hiY;
      nodeMinZ[id] = loZ; nodeMaxZ[id] = hiZ;

      const count = end - start;
      if (count <= 12) {
        nodeLeft[id] = -1;
        nodeRight[id] = -1;
        nodeStart[id] = start;
        nodeCount[id] = count;
        return id;
      }

      const dx = hiX - loX, dy = hiY - loY, dz = hiZ - loZ;
      const cArr = dx >= dy && dx >= dz ? triCx : (dy >= dz ? triCy : triCz);
      const midVal = dx >= dy && dx >= dz ? (loX + hiX) * 0.5
        : (dy >= dz ? (loY + hiY) * 0.5 : (loZ + hiZ) * 0.5);

      let l = start, r = end - 1;
      while (l <= r) {
        while (l <= r && cArr[order[l]] < midVal) l++;
        while (l <= r && cArr[order[r]] >= midVal) r--;
        if (l < r) {
          const tmp = order[l]; order[l] = order[r]; order[r] = tmp;
          l++; r--;
        }
      }
      const split = (l === start || l === end) ? ((start + end) >>> 1) : l;
      nodeStart[id] = 0;
      nodeCount[id] = 0;
      nodeLeft[id] = buildNode(start, split);
      nodeRight[id] = buildNode(split, end);
      return id;
    };

    buildNode(0, faceCount);

    let stack = new Int32Array(128);
    const nearest = (p, limit = Infinity) => {
      const px = p[0], py = p[1], pz = p[2];
      let best = limit * limit;
      let bestFace = -1;

      const rdx = px < nodeMinX[0] ? nodeMinX[0] - px : (px > nodeMaxX[0] ? px - nodeMaxX[0] : 0);
      const rdy = py < nodeMinY[0] ? nodeMinY[0] - py : (py > nodeMaxY[0] ? py - nodeMaxY[0] : 0);
      const rdz = pz < nodeMinZ[0] ? nodeMinZ[0] - pz : (pz > nodeMaxZ[0] ? pz - nodeMaxZ[0] : 0);
      if (rdx * rdx + rdy * rdy + rdz * rdz > best) {
        return { distance: limit + Number.EPSILON * Math.max(1, limit), face: null };
      }

      let sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const node = stack[--sp];
        const ldx = px < nodeMinX[node] ? nodeMinX[node] - px : (px > nodeMaxX[node] ? px - nodeMaxX[node] : 0);
        const ldy = py < nodeMinY[node] ? nodeMinY[node] - py : (py > nodeMaxY[node] ? py - nodeMaxY[node] : 0);
        const ldz = pz < nodeMinZ[node] ? nodeMinZ[node] - pz : (pz > nodeMaxZ[node] ? pz - nodeMaxZ[node] : 0);
        if (ldx * ldx + ldy * ldy + ldz * ldz > best) continue;

        const left = nodeLeft[node];
        if (left === -1) {
          const s = nodeStart[node], e = s + nodeCount[node];
          for (let i = s; i < e; i++) {
            const f = order[i];
            const tb = f * 3;
            const i0 = t[tb] * 3, i1 = t[tb + 1] * 3, i2 = t[tb + 2] * 3;
            const distSq = closestTriangleDistanceSq(
              px, py, pz,
              v[i0], v[i0 + 1], v[i0 + 2],
              v[i1], v[i1 + 1], v[i1 + 2],
              v[i2], v[i2 + 1], v[i2 + 2]
            );
            if (distSq <= best) { best = distSq; bestFace = f; }
          }
          continue;
        }

        const right = nodeRight[node];
        const dxL = px < nodeMinX[left] ? nodeMinX[left] - px : (px > nodeMaxX[left] ? px - nodeMaxX[left] : 0);
        const dyL = py < nodeMinY[left] ? nodeMinY[left] - py : (py > nodeMaxY[left] ? py - nodeMaxY[left] : 0);
        const dzL = pz < nodeMinZ[left] ? nodeMinZ[left] - pz : (pz > nodeMaxZ[left] ? pz - nodeMaxZ[left] : 0);
        const dLeft = dxL * dxL + dyL * dyL + dzL * dzL;

        const dxR = px < nodeMinX[right] ? nodeMinX[right] - px : (px > nodeMaxX[right] ? px - nodeMaxX[right] : 0);
        const dyR = py < nodeMinY[right] ? nodeMinY[right] - py : (py > nodeMaxY[right] ? py - nodeMaxY[right] : 0);
        const dzR = pz < nodeMinZ[right] ? nodeMinZ[right] - pz : (pz > nodeMaxZ[right] ? pz - nodeMaxZ[right] : 0);
        const dRight = dxR * dxR + dyR * dyR + dzR * dzR;

        if (sp + 2 > stack.length) {
          const nextStack = new Int32Array(stack.length << 1);
          nextStack.set(stack);
          stack = nextStack;
        }
        if (dLeft < dRight) {
          if (dRight <= best) stack[sp++] = right;
          if (dLeft <= best) stack[sp++] = left;
        } else {
          if (dLeft <= best) stack[sp++] = left;
          if (dRight <= best) stack[sp++] = right;
        }
      }

      return {
        distance: bestFace >= 0 ? Math.sqrt(best) : limit + Number.EPSILON * Math.max(1, limit),
        face: bestFace >= 0 ? bestFace : null,
      };
    };

    const distanceToFace = (p, faceIndex) => {
      const tb = faceIndex * 3;
      const i0 = t[tb] * 3, i1 = t[tb + 1] * 3, i2 = t[tb + 2] * 3;
      return Math.sqrt(closestTriangleDistanceSq(
        p[0], p[1], p[2],
        v[i0], v[i0 + 1], v[i0 + 2],
        v[i1], v[i1 + 1], v[i1 + 2],
        v[i2], v[i2 + 1], v[i2 + 2]
      ));
    };

    return { query: (p, limit) => nearest(p, limit).distance, nearest, distanceToFace };
  }

  function sampledDeviation(source, target, limit, index = buildIndex(target)) {
    const v = source.vertices, t = source.triangles;
    let maximum = 0;
    // Deterministic surface samples bound work for very large imported meshes.
    // This is an estimate, not a mathematical Hausdorff proof.
    const vertexStride = Math.max(1, Math.ceil(v.length / 3 / 2500));
    const pt = [0, 0, 0];
    for (let i = 0; i < v.length; i += 3 * vertexStride) {
      pt[0] = v[i]; pt[1] = v[i + 1]; pt[2] = v[i + 2];
      maximum = Math.max(maximum, index.query(pt, limit));
      if (maximum > limit) return maximum;
    }
    const stride = Math.max(1, Math.ceil(t.length / 3 / 2500));
    for (let face = 0; face < t.length / 3; face += stride) {
      const b0 = t[face * 3] * 3, b1 = t[face * 3 + 1] * 3, b2 = t[face * 3 + 2] * 3;
      pt[0] = (v[b0] + v[b1] + v[b2]) / 3;
      pt[1] = (v[b0 + 1] + v[b1 + 1] + v[b2 + 1]) / 3;
      pt[2] = (v[b0 + 2] + v[b1 + 2] + v[b2 + 2]) / 3;
      maximum = Math.max(maximum, index.query(pt, limit));
      if (maximum > limit) return maximum;
    }
    return maximum;
  }

  function certifyDirected(source, target, limit, maxQueries = 500000,
    index = buildIndex(target)) {
    const vertices = source.vertices, triangles = source.triangles;
    const vertCount = vertices.length / 3;
    const distances = new Float64Array(vertCount);
    const nearestFaces = new Int32Array(vertCount).fill(-1);
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
    const stack = [];
    for (let face = 0; face < triangles.length / 3; face++) {
      const i0 = triangles[face * 3], i1 = triangles[face * 3 + 1], i2 = triangles[face * 3 + 2];
      const ids = [i0, i1, i2];
      const corners = [point(i0), point(i1), point(i2)];
      const hits = new Array(3);
      for (let i = 0; i < 3; i++) {
        const vid = ids[i];
        let hit;
        if (Number.isNaN(distances[vid])) {
          hit = nearest(corners[i]);
          if (!hit) return { valid: false, inconclusive: true, deviation: maximum };
          distances[vid] = hit.distance;
          nearestFaces[vid] = hit.face == null ? -1 : hit.face;
        } else {
          const cachedFace = nearestFaces[vid];
          hit = { distance: distances[vid], face: cachedFace >= 0 ? cachedFace : null };
        }
        if (hit.distance > effectiveLimit)
          return { valid: false, deviation: hit.distance };
        hits[i] = hit;
      }
      stack.push({ corners, hits, depth: 0 });
      while (stack.length) {
        const item = stack.pop();
        const a = item.corners[0], b = item.corners[1], c = item.corners[2];
        const ab = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const bc = Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]);
        const ca = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const maxD = Math.max(item.hits[0].distance, item.hits[1].distance, item.hits[2].distance);
        const maxEdge = ab > bc ? (ab > ca ? ab : ca) : (bc > ca ? bc : ca);
        if (maxD + maxEdge <= effectiveLimit) continue;
        // Distance to one fixed target triangle is convex. If all source
        // corners lie within the limit of that same triangle, its entire
        // interior is certified, even when the meshes have different tessellation.
        let certified = false;
        for (let k = 0; k < 3; k++) {
          const witness = item.hits[k].face;
          if (witness == null || witness < 0) continue;
          if (k === 1 && witness === item.hits[0].face) continue;
          if (k === 2 && (witness === item.hits[0].face || witness === item.hits[1].face)) continue;
          if (index.distanceToFace(a, witness) <= effectiveLimit &&
              index.distanceToFace(b, witness) <= effectiveLimit &&
              index.distanceToFace(c, witness) <= effectiveLimit) {
            certified = true;
            break;
          }
        }
        if (certified) continue;
        if (item.depth >= 12 || queries >= maxQueries)
          return { valid: false, inconclusive: true, deviation: maximum };
        const e0 = ab >= bc && ab >= ca ? 0 : (bc >= ca ? 1 : 2);
        const e1 = e0 === 2 ? 0 : e0 + 1;
        const e2 = e1 === 2 ? 0 : e1 + 1;
        const p0 = item.corners[e0], p1 = item.corners[e1], opposite = item.corners[e2];
        const middle = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5];
        const middleHit = nearest(middle);
        if (!middleHit) return { valid: false, inconclusive: true, deviation: maximum };
        if (middleHit.distance > effectiveLimit)
          return { valid: false, deviation: middleHit.distance };
        const oppositeHit = item.hits[e2];
        stack.push({ corners: [middle, p1, opposite],
          hits: [middleHit, item.hits[e1], oppositeHit], depth: item.depth + 1 });
        stack.push({ corners: [p0, middle, opposite],
          hits: [item.hits[e0], middleHit, oppositeHit], depth: item.depth + 1 });
      }
    }
    return { valid: true, deviation: maximum };
  }

  function meshData(mesh) {
    const vp = mesh.vertProperties;
    let vertices;
    if (mesh.numProp === 3) {
      vertices = new Float32Array(vp);
    } else {
      vertices = new Float32Array((vp.length / mesh.numProp) * 3);
      for (let i = 0, at = 0; i < vp.length; i += mesh.numProp) {
        vertices[at++] = vp[i];
        vertices[at++] = vp[i + 1];
        vertices[at++] = vp[i + 2];
      }
    }
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
