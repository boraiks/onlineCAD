(function (cad) {
  'use strict';

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = cad.math.cross;
  const length = value => Math.hypot(value[0], value[1], value[2]);
  const unit = value => {
    const len = Math.hypot(value[0], value[1], value[2]);
    return [value[0] / len, value[1] / len, value[2] / len];
  };
  const keyOf = point => point.map(value => Math.round(value * 1e4)).join(',');
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const cache = new WeakMap();
  const facetCache = new WeakMap();
  let nextPlane = 1;

  function displayBounds(body) {
    const mesh = body?.renderMesh || body?.mesh;
    if (!mesh?.vertices?.length) return null;
    if (body._aabbMesh !== mesh) {
      const v = mesh.vertices;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      body._aabb = { minX, maxX, minY, maxY, minZ, maxZ };
      body._aabbMesh = mesh;
    }
    return body._aabb;
  }

  function projectedTriangle(point, a, b, c) {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-7) return null;
    const first = ((b[0] - point[0]) * (c[1] - point[1]) -
      (b[1] - point[1]) * (c[0] - point[0])) / area;
    const second = ((c[0] - point[0]) * (a[1] - point[1]) -
      (c[1] - point[1]) * (a[0] - point[0])) / area;
    const third = 1 - first - second;
    return Math.min(first, second, third) >= -0.001 ? [first, second, third] : null;
  }

  function emptyTopology() {
    return { planarFaces: [], curvedFaces: [], allFaces: [], triToFace: null, tangentEdgeKeys: null };
  }

  function topology(body) {
    if (!body?.mesh) return emptyTopology();
    const stored = cache.get(body);
    if (stored?.mesh === body.mesh) return stored.topology;
    const coordinates = body.mesh.vertices;
    const rawTriCount = Math.floor((body.mesh.triangles?.length || 0) / 3);
    if (body.meshSource === 'import' ||
        (body.meshSource === 'solid' &&
          (coordinates.length / 3 > 8000 || rawTriCount > 2000))) {
      const empty = emptyTopology();
      cache.set(body, { mesh: body.mesh, topology: empty });
      return empty;
    }
    const unique = new Map(), points = [], pointKeys = [], indexMap = [];
    for (let index = 0; index < coordinates.length; index += 3) {
      const point = coordinates.slice(index, index + 3);
      const key = keyOf(point);
      if (!unique.has(key)) {
        unique.set(key, points.length);
        points.push(point);
        pointKeys.push(key);
      }
      indexMap.push(unique.get(key));
    }
    const triangles = [], edgeToTriangles = new Map();
    for (let index = 0; index < body.mesh.triangles.length; index += 3) {
      const ids = Array.from(body.mesh.triangles.slice(index, index + 3), id => indexMap[id]);
      if (new Set(ids).size < 3) continue;
      const normal = cross(sub(points[ids[1]], points[ids[0]]), sub(points[ids[2]], points[ids[0]]));
      const area2 = length(normal);
      if (area2 < 1e-9) continue;
      const unitNormal = [normal[0] / area2, normal[1] / area2, normal[2] / area2];
      const triangle = { ids, normal: unitNormal, offset: dot(unitNormal, points[ids[0]]), area: area2 * 0.5, rawTriIndex: index / 3 };
      const number = triangles.length;
      triangles.push(triangle);
      for (let side = 0; side < 3; side++) {
        const key = edgeKey(ids[side], ids[(side + 1) % 3]);
        if (!edgeToTriangles.has(key)) edgeToTriangles.set(key, []);
        edgeToTriangles.get(key).push(number);
      }
    }
    const neighbors = triangles.map(() => []);
    for (const indexes of edgeToTriangles.values()) if (indexes.length === 2) {
      neighbors[indexes[0]].push(indexes[1]);
      neighbors[indexes[1]].push(indexes[0]);
    }

    // Seed from largest triangles first so the seed normal is well-conditioned.
    const order = Array.from({ length: triangles.length }, (_, i) => i)
      .sort((a, b) => triangles[b].area - triangles[a].area);
    const triToPatch = new Int32Array(triangles.length).fill(-1);
    const rawPatches = [];
    for (const seed of order) {
      if (triToPatch[seed] !== -1) continue;
      const patchIdx = rawPatches.length;
      const first = triangles[seed];
      const pSeed = points[first.ids[0]];
      const scale = Math.max(1, Math.abs(pSeed[0]), Math.abs(pSeed[1]), Math.abs(pSeed[2]));
      const planeTol = Math.max(2e-4, scale * 2e-5);
      const group = [], queue = [seed];
      triToPatch[seed] = patchIdx;
      while (queue.length) {
        const current = queue.pop();
        group.push(current);
        for (const adjacent of neighbors[current]) {
          if (triToPatch[adjacent] !== -1) continue;
          const second = triangles[adjacent];
          if (dot(first.normal, second.normal) < 0.9995) continue;
          const a0 = points[second.ids[0]], a1 = points[second.ids[1]], a2 = points[second.ids[2]];
          if (Math.abs(dot(first.normal, a0) - first.offset) > planeTol ||
              Math.abs(dot(first.normal, a1) - first.offset) > planeTol ||
              Math.abs(dot(first.normal, a2) - first.offset) > planeTol) continue;
          triToPatch[adjacent] = patchIdx;
          queue.push(adjacent);
        }
      }
      const vertSet = new Set();
      const boundary = new Map();
      let totalArea = 0;
      for (const index of group) {
        const ids = triangles[index].ids;
        vertSet.add(ids[0]); vertSet.add(ids[1]); vertSet.add(ids[2]);
        totalArea += triangles[index].area;
        for (let side = 0; side < 3; side++) {
          const a = ids[side], b = ids[(side + 1) % 3], key = edgeKey(a, b);
          if (boundary.has(key)) boundary.delete(key);
          else boundary.set(key, [a, b]);
        }
      }
      rawPatches.push({ idx: patchIdx, normal: first.normal, group, vertIds: [...vertSet], boundary, totalArea });
    }

    // Separate tessellated curved-surface facets (cylinders, cones, fillets, spheres)
    // from genuine planar CAD faces.
    const SMOOTH_COS = 0.965;
    const smoothAdj = rawPatches.map(() => []);
    const smoothEdges = [];
    const seenSmooth = new Set();
    for (const p of rawPatches) {
      for (const [key, [a, b]] of p.boundary.entries()) {
        if (seenSmooth.has(key)) continue;
        seenSmooth.add(key);
        const owners = edgeToTriangles.get(key);
        if (!owners || owners.length !== 2) continue;
        const p0 = triToPatch[owners[0]], p1 = triToPatch[owners[1]];
        if (p0 === -1 || p1 === -1 || p0 === p1) continue;
        const d = dot(rawPatches[p0].normal, rawPatches[p1].normal);
        if (d >= SMOOTH_COS && d < 0.99999) {
          smoothAdj[p0].push(p1);
          smoothAdj[p1].push(p0);
          smoothEdges.push({ p0, p1, a, b, d });
        }
      }
    }
    const spanPerp = (patch, eDir) => {
      const perp = cross(patch.normal, eDir);
      const pl = length(perp);
      if (pl < 1e-9) return 0;
      const px = perp[0] / pl, py = perp[1] / pl, pz = perp[2] / pl;
      let lo = Infinity, hi = -Infinity;
      for (const id of patch.vertIds) {
        const pt = points[id];
        const proj = pt[0] * px + pt[1] * py + pt[2] * pz;
        if (proj < lo) lo = proj;
        if (proj > hi) hi = proj;
      }
      return hi - lo;
    };
    const curvedCandidate = new Uint8Array(rawPatches.length);
    for (const e of smoothEdges) {
      const edgeVec = sub(points[e.b], points[e.a]);
      const el = length(edgeVec);
      if (el < 1e-7) continue;
      const eDir = [edgeVec[0] / el, edgeVec[1] / el, edgeVec[2] / el];
      const s0 = spanPerp(rawPatches[e.p0], eDir);
      const s1 = spanPerp(rawPatches[e.p1], eDir);
      if (s1 > 1e-7 && s0 <= s1 * 2.5) curvedCandidate[e.p0] = 1;
      if (s0 > 1e-7 && s1 <= s0 * 2.5) curvedCandidate[e.p1] = 1;
      e.s0 = s0;
      e.s1 = s1;
    }
    const compVisited = new Uint8Array(rawPatches.length);
    const isCurved = new Uint8Array(rawPatches.length);
    for (let i = 0; i < rawPatches.length; i++) {
      if (!curvedCandidate[i] || compVisited[i]) continue;
      const comp = [], q = [i];
      compVisited[i] = 1;
      while (q.length) {
        const cur = q.pop();
        comp.push(cur);
        for (const nxt of smoothAdj[cur]) {
          if (curvedCandidate[nxt] && !compVisited[nxt]) {
            compVisited[nxt] = 1;
            q.push(nxt);
          }
        }
      }
      if (comp.length >= 4) {
        for (const idx of comp) isCurved[idx] = 1;
      }
    }

    const patchToFace = new Int32Array(rawPatches.length).fill(-1);
    const planarFaces = [];
    const curvedFaces = [];
    const allFaces = [];

    for (const raw of rawPatches) {
      if (isCurved[raw.idx] || raw.totalArea < 1e-4) continue;
      const { boundary, group, normal } = raw;
      const outgoing = new Map();
      for (const [a, b] of boundary.values()) {
        if (!outgoing.has(a)) outgoing.set(a, []);
        outgoing.get(a).push(b);
      }
      const loops = [], used = new Set();
      for (const [startA, startB] of boundary.values()) {
        const firstKey = `${startA}:${startB}`;
        if (used.has(firstKey)) continue;
        const loop = [startA];
        let a = startA, b = startB;
        for (let step = 0; step <= boundary.size; step++) {
          used.add(`${a}:${b}`);
          if (b === startA) break;
          loop.push(b);
          const next = (outgoing.get(b) || []).find(candidate => !used.has(`${b}:${candidate}`));
          if (next == null) { loop.length = 0; break; }
          a = b; b = next;
        }
        if (loop.length >= 3) loops.push(loop);
      }
      if (!loops.length) continue;
      const longest = [...boundary.values()].sort((first, second) =>
        length(sub(points[second[1]], points[second[0]])) -
        length(sub(points[first[1]], points[first[0]])))[0];
      const u = unit(sub(points[longest[1]], points[longest[0]]));
      const v = unit(cross(normal, u));
      const area = loop => loop.reduce((sum, id, index) => {
        const a = points[id], b = points[loop[(index + 1) % loop.length]];
        return sum + dot(a, u) * dot(b, v) - dot(b, u) * dot(a, v);
      }, 0) / 2;
      loops.sort((first, second) => Math.abs(area(second)) - Math.abs(area(first)));
      const outer = loops[0];
      if (Math.abs(area(outer)) < 1e-4) continue;
      const origin = [0, 1, 2].map(axis => outer.reduce((sum, id) => sum + points[id][axis], 0) / outer.length);
      const local = loop => loop.map(id => [dot(sub(points[id], origin), u), dot(sub(points[id], origin), v)]);
      const faceIndex = allFaces.length;
      const face = {
        body,
        id: `${body.id || 'body'}:face-${planarFaces.length}`,
        planar: true,
        faceIndex,
        normal,
        origin,
        u,
        v,
        triIndices: group.map(index => triangles[index].rawTriIndex),
        triangles: group.map(index => triangles[index].ids.map(id => points[id])),
        points: local(outer),
        holes: loops.slice(1).map(local),
      };
      patchToFace[raw.idx] = faceIndex;
      planarFaces.push(face);
      allFaces.push(face);
    }

    // Group curved patches into individual B-Rep curved faces (cylinder wall, fillet band, cone, sphere)
    // breaking across tangent curvature jumps where adjacent facet widths diverge.
    const sameSurfaceAdj = rawPatches.map(() => []);
    for (const e of smoothEdges) {
      if (!isCurved[e.p0] || !isCurved[e.p1]) continue;
      const s0 = e.s0 || 0, s1 = e.s1 || 0;
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      if (lo > 1e-7 && hi / lo <= 2.5) {
        sameSurfaceAdj[e.p0].push(e.p1);
        sameSurfaceAdj[e.p1].push(e.p0);
      }
    }

    const patchToComp = new Int32Array(rawPatches.length).fill(-1);
    const curvedComps = [];
    for (const raw of rawPatches) {
      if (!isCurved[raw.idx] || patchToComp[raw.idx] !== -1) continue;
      const compIdx = curvedComps.length;
      const comp = [], triIndices = [], queue = [raw.idx];
      let area = 0;
      patchToComp[raw.idx] = compIdx;
      while (queue.length) {
        const cur = queue.pop();
        comp.push(cur);
        const rp = rawPatches[cur];
        area += rp.totalArea;
        for (const ti of rp.group) triIndices.push(triangles[ti].rawTriIndex);
        for (const nxt of sameSurfaceAdj[cur]) {
          if (patchToComp[nxt] === -1) {
            patchToComp[nxt] = compIdx;
            queue.push(nxt);
          }
        }
      }
      curvedComps.push({ comp, triIndices, area, absorbed: false });
    }

    const isMicroSliver = c => c.area < 1e-2 || (c.comp.length === 1 && c.area < 0.05);
    for (let cIdx = 0; cIdx < curvedComps.length; cIdx++) {
      const c = curvedComps[cIdx];
      if (!isMicroSliver(c)) continue;
      let bestTarget = -1, bestArea = -1;
      for (const pIdx of c.comp) {
        for (const nxt of smoothAdj[pIdx]) {
          const nComp = patchToComp[nxt];
          if (nComp >= 0 && nComp !== cIdx && !isMicroSliver(curvedComps[nComp]) &&
              curvedComps[nComp].area > bestArea) {
            bestArea = curvedComps[nComp].area;
            bestTarget = nComp;
          }
        }
      }
      c.absorbed = true;
      if (bestTarget >= 0) {
        const target = curvedComps[bestTarget];
        for (const pIdx of c.comp) {
          patchToComp[pIdx] = bestTarget;
          target.comp.push(pIdx);
        }
        for (const rt of c.triIndices) target.triIndices.push(rt);
        target.area += c.area;
      } else {
        for (const pIdx of c.comp) patchToComp[pIdx] = -1;
      }
    }

    for (const c of curvedComps) {
      if (c.absorbed || !c.triIndices.length) continue;
      const faceIndex = allFaces.length;
      const face = {
        body,
        id: `${body.id || 'body'}:surface-${curvedFaces.length}`,
        planar: false,
        faceIndex,
        area: c.area,
        triIndices: c.triIndices,
      };
      for (const pIdx of c.comp) patchToFace[pIdx] = faceIndex;
      curvedFaces.push(face);
      allFaces.push(face);
    }

    const triToFace = new Int32Array(rawTriCount).fill(-1);
    for (const face of allFaces) {
      for (const rt of face.triIndices) triToFace[rt] = face.faceIndex;
    }

    const tangentEdgeKeys = new Set();
    for (const e of smoothEdges) {
      const f0 = patchToFace[e.p0], f1 = patchToFace[e.p1];
      if (f0 !== f1 && f0 >= 0 && f1 >= 0) {
        const ka = pointKeys[e.a], kb = pointKeys[e.b];
        tangentEdgeKeys.add(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
      }
    }

    const result = { planarFaces, curvedFaces, allFaces, triToFace, tangentEdgeKeys };
    cache.set(body, { mesh: body.mesh, topology: result });
    return result;
  }

  function patches(body) {
    return topology(body).planarFaces;
  }

  function registerPlane(face) {
    if (face._planeName && cad.planes.grid[face._planeName]) return face._planeName;
    // Loaded projects bring their own FACE-n planes; never overwrite one.
    let name = `FACE-${nextPlane++}`;
    while (cad.planes.grid[name]) name = `FACE-${nextPlane++}`;
    const entry = { u: [...face.u], v: [...face.v], origin: [...face.origin],
      axes: ['X', 'Y', 'Z'] };
    cad.planes.grid[name] = entry;
    cad.planes.sketch[name] = { ...entry, view: null };
    face._planeName = name;
    return name;
  }

  function renderFaceHighlight(context, project, face, { fill = 'rgba(33, 137, 227, .42)', stroke = '#0e70b0', lineWidth = 2.0, camera = null } = {}) {
    const cam = camera || window.WebCAD?.app?.camera;
    if (!face || !face.normal || !face.points || (cam && dot(face.normal, cam.depth) <= 1e-6)) return;
    context.save();
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    const screenLoop = loop => loop.map(point => project(face.origin.map((value, axis) =>
      value + face.u[axis] * point[0] + face.v[axis] * point[1])));
    context.beginPath();
    for (const loop of [face.points, ...face.holes]) {
      const points = screenLoop(loop);
      if (!points.length) continue;
      context.moveTo(...points[0]);
      for (const point of points.slice(1)) context.lineTo(...point);
      context.closePath();
    }
    context.fill('evenodd');
    context.stroke();
    if (face.isFacet && face.triangles?.[0]) {
      const projected = face.triangles[0].map(project);
      const area = Math.abs((projected[1][0] - projected[0][0]) * (projected[2][1] - projected[0][1]) -
        (projected[1][1] - projected[0][1]) * (projected[2][0] - projected[0][0])) / 2;
      if (area < 80) {
        const centerX = projected.reduce((sum, point) => sum + point[0], 0) / 3;
        const centerY = projected.reduce((sum, point) => sum + point[1], 0) / 3;
        context.beginPath();
        context.arc(centerX, centerY, 6, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
  }

  function renderBodyHighlight(context, project, body, { fill = 'rgba(33, 137, 227, .38)', stroke = '#0e70b0', lineWidth = 2.0, camera = null } = {}) {
    if (!body || body.visible === false || !body.mesh) return;
    const bodyPatches = patches(body);
    if (bodyPatches && bodyPatches.length > 0) {
      for (const face of bodyPatches) {
        renderFaceHighlight(context, project, face, { fill, stroke, lineWidth, camera });
      }
      return;
    }

    // The GPU tints a selected dense solid across its actual surface. Its
    // axis-aligned bounding cage does not describe a curved reconstructed body.
    if (body.meshSource === 'solid') return;

    // Fallback for dense / imported meshes where planar face decomposition is skipped:
    // Render a crisp CAD bounding cage with corner handles and dashed outlines
    const bounds = displayBounds(body);
    if (!bounds) return;
    const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

    const corners = [
      [minX, minY, minZ], [maxX, minY, minZ],
      [maxX, maxY, minZ], [minX, maxY, minZ],
      [minX, minY, maxZ], [maxX, minY, maxZ],
      [maxX, maxY, maxZ], [minX, maxY, maxZ]
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    const pts = corners.map(c => project(c));
    context.save();
    context.strokeStyle = stroke || '#0e70b0';
    context.lineWidth = lineWidth || 2.0;
    context.setLineDash([5, 4]);
    for (const [i1, i2] of edges) {
      context.beginPath();
      context.moveTo(pts[i1][0], pts[i1][1]);
      context.lineTo(pts[i2][0], pts[i2][1]);
      context.stroke();
    }
    context.setLineDash([]);
    context.fillStyle = stroke || '#0e70b0';
    for (const pt of pts) {
      context.beginPath();
      context.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function screenBoundsOf(body, camera, width, height) {
    const b = displayBounds(body);
    if (!b) return null;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const xs = [b.minX, b.maxX];
    const ys = [b.minY, b.maxY];
    const zs = [b.minZ, b.maxZ];
    for (let xi = 0; xi < 2; xi++) {
      for (let yi = 0; yi < 2; yi++) {
        for (let zi = 0; zi < 2; zi++) {
          const p = camera.project([xs[xi], ys[yi], zs[zi]], width, height);
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
      }
    }
    return { minX, maxX, minY, maxY };
  }

  function isOccludedByMesh(bestDepth, screen, bodies, camera, width, height) {
    if (typeof camera?.origin !== 'function' || typeof camera?.unit !== 'function' ||
        !camera.right || !camera.up || !camera.depth) return false;
    const sx = screen[0], sy = screen[1];
    for (const body of bodies) {
      if (body.visible === false || !body.mesh) continue;
      const sBox = screenBoundsOf(body, camera, width, height);
      if (sBox && (sx < sBox.minX - 6 || sx > sBox.maxX + 6 || sy < sBox.minY - 6 || sy > sBox.maxY + 6)) {
        continue;
      }
      const hit = pickMeshTriangle(body, screen, camera, width, height, true);
      if (hit && hit.depth > bestDepth + 1e-3) return true;
    }
    return false;
  }

  let _pickProjected = new Float64Array(0);

  // Exact screen-space picking is done on click, using the same display mesh as WebGL.
  // Project vertices once and scan triangle indices without allocating per triangle.
  function pickMeshTriangle(body, screen, camera, width, height, frontOnly = false) {
    // A converted body's editable faces must come from its solid geometry.
    // Its optional decimated render mesh is only a visual preview.
    const mesh = body.meshSource === 'solid' ? body.mesh : body.renderMesh || body.mesh;
    if (!mesh?.vertices?.length || !mesh.triangles?.length) return null;
    const { vertices, triangles } = mesh;
    const [originX, originY] = camera.origin(width, height);
    const unit = camera.unit(width, height);
    const pivot = cad.settings.cameraPivot ? camera.pivot : [0, 0, 0];
    const R = camera.right, U = camera.up, D = camera.depth;
    const baseX = originX - dot(R, pivot) * unit;
    const baseY = originY + dot(U, pivot) * unit;
    if (_pickProjected.length < vertices.length) {
      _pickProjected = new Float64Array(vertices.length);
    }
    const projected = _pickProjected;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      projected[i] = baseX + (R[0] * x + R[1] * y + R[2] * z) * unit;
      projected[i + 1] = baseY - (U[0] * x + U[1] * y + U[2] * z) * unit;
      projected[i + 2] = D[0] * x + D[1] * y + D[2] * z;
    }
    const sx = screen[0], sy = screen[1];
    let best = null;
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
      if (sx < Math.min(projected[a], projected[b], projected[c]) - 1 ||
          sx > Math.max(projected[a], projected[b], projected[c]) + 1 ||
          sy < Math.min(projected[a + 1], projected[b + 1], projected[c + 1]) - 1 ||
          sy > Math.max(projected[a + 1], projected[b + 1], projected[c + 1]) + 1) continue;
      const area = (projected[b] - projected[a]) * (projected[c + 1] - projected[a + 1]) -
        (projected[b + 1] - projected[a + 1]) * (projected[c] - projected[a]);
      if (Math.abs(area) < 1e-7) continue;
      const wa = ((projected[b] - sx) * (projected[c + 1] - sy) -
        (projected[b + 1] - sy) * (projected[c] - sx)) / area;
      const wb = ((projected[c] - sx) * (projected[a + 1] - sy) -
        (projected[c + 1] - sy) * (projected[a] - sx)) / area;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -0.001) continue;
      if (frontOnly) {
        const abx = vertices[b] - vertices[a], aby = vertices[b + 1] - vertices[a + 1], abz = vertices[b + 2] - vertices[a + 2];
        const acx = vertices[c] - vertices[a], acy = vertices[c + 1] - vertices[a + 1], acz = vertices[c + 2] - vertices[a + 2];
        const facing = (aby * acz - abz * acy) * D[0] +
          (abz * acx - abx * acz) * D[1] + (abx * acy - aby * acx) * D[2];
        if (facing <= 1e-9) continue;
      }
      const depth = wa * projected[a + 2] + wb * projected[b + 2] + wc * projected[c + 2];
      if (!best || depth > best.depth) best = { body, mesh, triangle: i / 3, depth,
        weights: [wa, wb, wc] };
    }
    return best;
  }

  function facetFace(hit) {
    const { body, mesh, triangle } = hit;
    let stored = facetCache.get(body);
    if (stored?.mesh !== mesh) {
      stored = { mesh, faces: new Map() };
      facetCache.set(body, stored);
    }
    if (stored.faces.has(triangle)) return stored.faces.get(triangle);
    const ids = mesh.triangles.slice(triangle * 3, triangle * 3 + 3);
    const points3D = Array.from(ids, id => Array.from(mesh.vertices.slice(id * 3, id * 3 + 3)));
    const [a, b, c] = points3D;
    const normal = unit(cross(sub(b, a), sub(c, a)));
    const u = unit(sub(b, a));
    const v = unit(cross(normal, u));
    const local = point => [dot(sub(point, a), u), dot(sub(point, a), v)];
    let face = { body, id: `${body.id}:facet-${triangle}`, normal, origin: a, u, v,
      triangles: [points3D], points: points3D.map(local), holes: [], isFacet: true };

    // Merge only the clicked coplanar island. A subdivided flat side selects as one
    // face, while a curved scan keeps its individual facets without preprocessing
    // every patch during import or every pointer move.
    const vertices = mesh.vertices, triangles = mesh.triangles;
    const count = triangles.length / 3, vertexCount = vertices.length / 3;
    const offset = dot(normal, a);
    const scale = Math.max(1, ...a.map(value => Math.abs(value)));
    const tolerance = Math.max(1e-5, scale * 1e-6);
    const coplanar = [];
    const pointOnPlane = id => {
      const i = id * 3;
      return Math.abs(normal[0] * vertices[i] + normal[1] * vertices[i + 1] + normal[2] * vertices[i + 2] - offset) <= tolerance;
    };
    for (let t = 0; t < count; t++) {
      const i = t * 3, i0 = triangles[i], i1 = triangles[i + 1], i2 = triangles[i + 2];
      if (!pointOnPlane(i0) || !pointOnPlane(i1) || !pointOnPlane(i2)) continue;
      const j0 = i0 * 3, j1 = i1 * 3, j2 = i2 * 3;
      const ux = vertices[j1] - vertices[j0], uy = vertices[j1 + 1] - vertices[j0 + 1], uz = vertices[j1 + 2] - vertices[j0 + 2];
      const vx = vertices[j2] - vertices[j0], vy = vertices[j2 + 1] - vertices[j0 + 1], vz = vertices[j2 + 2] - vertices[j0 + 2];
      if ((uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] +
          (ux * vy - uy * vx) * normal[2] <= 0) continue;
      coplanar.push(t);
      if (coplanar.length > 50000) break;
    }
    if (coplanar.length > 1 && coplanar.length <= 50000) {
      const edgeKeyOf = (from, to) => Math.min(from, to) * vertexCount + Math.max(from, to);
      const edgeToTriangles = new Map();
      for (const t of coplanar) {
        const i = t * 3, i0 = triangles[i], i1 = triangles[i + 1], i2 = triangles[i + 2];
        for (const [from, to] of [[i0, i1], [i1, i2], [i2, i0]]) {
          const key = edgeKeyOf(from, to);
          let owners = edgeToTriangles.get(key);
          if (!owners) edgeToTriangles.set(key, owners = []);
          owners.push(t);
        }
      }
      const visited = new Set([triangle]), queue = [triangle], group = [];
      while (queue.length) {
        const t = queue.pop();
        group.push(t);
        const i = t * 3, i0 = triangles[i], i1 = triangles[i + 1], i2 = triangles[i + 2];
        for (const [from, to] of [[i0, i1], [i1, i2], [i2, i0]]) {
          for (const other of edgeToTriangles.get(edgeKeyOf(from, to)) || []) {
            if (!visited.has(other)) { visited.add(other); queue.push(other); }
          }
        }
      }
      if (group.length > 1) {
        const boundary = new Map();
        for (const t of group) {
          const i = t * 3, i0 = triangles[i], i1 = triangles[i + 1], i2 = triangles[i + 2];
          for (const [from, to] of [[i0, i1], [i1, i2], [i2, i0]]) {
            const key = edgeKeyOf(from, to);
            if (boundary.has(key)) boundary.delete(key);
            else boundary.set(key, [from, to]);
          }
        }
        const outgoing = new Map();
        for (const [from, to] of boundary.values()) outgoing.set(from, to);
        const loops = [], used = new Set();
        for (const start of outgoing.keys()) {
          if (used.has(start)) continue;
          const loop = [], first = start;
          let current = start;
          for (let step = 0; step <= outgoing.size; step++) {
            if (used.has(current)) break;
            used.add(current);
            loop.push(current);
            current = outgoing.get(current);
            if (current === first) break;
          }
          if (current === first && loop.length >= 3) loops.push(loop);
        }
        const asPoint = id => Array.from(vertices.slice(id * 3, id * 3 + 3));
        const localLoop = loop => loop.map(id => local(asPoint(id)));
        const loopArea = loop => loop.reduce((sum, point, i) => {
          const next = loop[(i + 1) % loop.length];
          return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        const simplifyLoop = loop => loop.filter((point, i) => {
          const prev = loop[(i - 1 + loop.length) % loop.length];
          const next = loop[(i + 1) % loop.length];
          const cross2 = (point[0] - prev[0]) * (next[1] - point[1]) -
            (point[1] - prev[1]) * (next[0] - point[0]);
          const span = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
          return Math.abs(cross2) > 1e-6 * Math.max(1, span);
        });
        const localLoops = loops.map(localLoop).map(simplifyLoop).filter(loop => loop.length >= 3)
          .sort((first, second) =>
          Math.abs(loopArea(second)) - Math.abs(loopArea(first)));
        if (localLoops.length) {
          face = { ...face, id: `${body.id}:patch-${triangle}`, isFacet: false,
            points: localLoops[0], holes: localLoops.slice(1),
            triangles: group.map(t => Array.from(triangles.slice(t * 3, t * 3 + 3), asPoint)) };
          for (const t of group) stored.faces.set(t, face);
        }
      }
    }
    stored.faces.set(triangle, face);
    return face;
  }

  class BodyFaceSelection {
    constructor({ canvas, camera, extrudeController, isAvailable, onChange, onSelect, onSelectBody }) {
      Object.assign(this, { canvas, camera, extrudeController, isAvailable, onChange, onSelect, onSelectBody });
      this.selected = null;
      this.selectedBody = null;
      this.hovered = null;
      this.bind();
    }

    clear() {
      if (!this.selected && !this.selectedBody) return;
      const hadFace = this.selected;
      const hadBody = this.selectedBody;
      this.selected = null;
      this.selectedBody = null;
      if (hadFace) this.onSelect?.(null);
      if (hadBody) this.onSelectBody?.(null);
      this.onChange();
    }

    selectFace(face) {
      if (this.selected === face && !this.selectedBody) return;
      const hadBody = this.selectedBody;
      this.selectedBody = null;
      this.selected = face;
      if (hadBody) this.onSelectBody?.(null);
      this.onSelect?.(this.selected);
      this.onChange();
    }

    selectBody(body) {
      if (this.selectedBody === body && !this.selected) return;
      const hadFace = this.selected;
      this.selected = null;
      this.selectedBody = body;
      if (hadFace) this.onSelect?.(null);
      this.onSelectBody?.(this.selectedBody);
      this.onChange();
    }

    faceAt(event, includeFacets = false) {
      if (!this.extrudeController?.bodies?.length) return null;
      if (event?.ctrlKey || event?.metaKey) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const sx = event.clientX - bounds.left, sy = event.clientY - bounds.top;
      const screen = [sx, sy];
      const camera = this.camera;
      const fastProj = typeof camera.origin === 'function' && typeof camera.unit === 'function' &&
        camera.right && camera.up && camera.depth;
      let unit, R, U, D, baseX, baseY;
      if (fastProj) {
        const [originX, originY] = camera.origin(bounds.width, bounds.height);
        unit = camera.unit(bounds.width, bounds.height);
        const pivot = cad.settings.cameraPivot ? camera.pivot : [0, 0, 0];
        R = camera.right; U = camera.up; D = camera.depth;
        baseX = originX - dot(R, pivot) * unit;
        baseY = originY + dot(U, pivot) * unit;
      }
      let best = null;
      for (const body of this.extrudeController.bodies) {
        if (body.visible === false || !body.mesh) continue;
        const sBox = this.screenBounds(body, bounds.width, bounds.height);
        if (sBox && (sx < sBox.minX - 6 || sx > sBox.maxX + 6 || sy < sBox.minY - 6 || sy > sBox.maxY + 6)) {
          continue;
        }
        const bodyPatches = patches(body);
        if (includeFacets && body.meshSource === 'solid' && !bodyPatches.length) {
          const hit = pickMeshTriangle(body, screen, camera, bounds.width, bounds.height, true);
          if (hit && (!best || hit.depth > best.depth)) best = { face: facetFace(hit), depth: hit.depth };
        }
        if (fastProj) {
          for (const face of bodyPatches) {
            if (dot(face.normal, D) <= 1e-6) continue;
            const tris = face.triangles;
            for (let t = 0; t < tris.length; t++) {
              const triangle = tris[t];
              const p0 = triangle[0], p1 = triangle[1], p2 = triangle[2];
              const ax = baseX + (R[0] * p0[0] + R[1] * p0[1] + R[2] * p0[2]) * unit;
              const ay = baseY - (U[0] * p0[0] + U[1] * p0[1] + U[2] * p0[2]) * unit;
              const bx = baseX + (R[0] * p1[0] + R[1] * p1[1] + R[2] * p1[2]) * unit;
              const by = baseY - (U[0] * p1[0] + U[1] * p1[1] + U[2] * p1[2]) * unit;
              const cx = baseX + (R[0] * p2[0] + R[1] * p2[1] + R[2] * p2[2]) * unit;
              const cy = baseY - (U[0] * p2[0] + U[1] * p2[1] + U[2] * p2[2]) * unit;
              const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
              if (Math.abs(area) < 1e-7) continue;
              const invArea = 1 / area;
              const w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) * invArea;
              const w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) * invArea;
              const w2 = 1 - w0 - w1;
              if (!(w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001)) continue;
              const depth = w0 * dot(p0, D) + w1 * dot(p1, D) + w2 * dot(p2, D);
              if (!best || depth > best.depth) best = { face, depth };
            }
          }
        } else {
          for (const face of bodyPatches) {
            if (dot(face.normal, camera.depth) <= 1e-6) continue;
            for (const triangle of face.triangles) {
              const projected = triangle.map(point => camera.project(point, bounds.width, bounds.height));
              const weights = projectedTriangle(screen, ...projected);
              if (!weights) continue;
              const depth = triangle.reduce((sum, point, index) =>
                sum + weights[index] * dot(point, camera.depth), 0);
              if (!best || depth > best.depth) best = { face, depth };
            }
          }
        }
      }
      if (best && isOccludedByMesh(best.depth, screen, this.extrudeController.bodies, camera, bounds.width, bounds.height)) {
        return null;
      }
      return best?.face || null;
    }

    surfaceAt(event, includeFacets = false) {
      if (!this.extrudeController?.bodies?.length) return null;
      if (event?.ctrlKey || event?.metaKey) return null;
      const camera = this.camera;
      const fastProj = typeof camera?.origin === 'function' && typeof camera?.unit === 'function' &&
        camera.right && camera.up && camera.depth;
      if (!fastProj) return this.faceAt(event, includeFacets);
      const bounds = this.canvas.getBoundingClientRect();
      const sx = event.clientX - bounds.left, sy = event.clientY - bounds.top;
      const screen = [sx, sy];
      let best = null;
      for (const body of this.extrudeController.bodies) {
        if (body.visible === false || !body.mesh) continue;
        const sBox = this.screenBounds(body, bounds.width, bounds.height);
        if (sBox && (sx < sBox.minX - 6 || sx > sBox.maxX + 6 || sy < sBox.minY - 6 || sy > sBox.maxY + 6)) {
          continue;
        }
        const hit = pickMeshTriangle(body, screen, camera, bounds.width, bounds.height, true);
        if (hit && (!best || hit.depth > best.depth)) {
          const topo = topology(body);
          if (topo.triToFace && topo.triToFace[hit.triangle] >= 0) {
            best = { face: topo.allFaces[topo.triToFace[hit.triangle]], depth: hit.depth };
          } else if (includeFacets && body.meshSource === 'solid' && !topo.allFaces.length) {
            best = { face: facetFace(hit), depth: hit.depth };
          } else {
            best = { face: null, depth: hit.depth };
          }
        }
      }
      return best?.face || null;
    }

    screenBounds(body, width, height) {
      return screenBoundsOf(body, this.camera, width, height);
    }

    bodyAt(event) {
      const face = this.faceAt(event);
      if (face?.body) return face.body;
      if (!this.extrudeController?.bodies?.length) return null;
      if (event?.ctrlKey || event?.metaKey) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      let best = null;
      for (const body of this.extrudeController.bodies) {
        if (body.visible === false || !body.mesh) continue;
        const sBox = this.screenBounds(body, bounds.width, bounds.height);
        if (sBox && (screen[0] < sBox.minX - 6 || screen[0] > sBox.maxX + 6 || screen[1] < sBox.minY - 6 || screen[1] > sBox.maxY + 6)) {
          continue;
        }
        const hit = pickMeshTriangle(body, screen, this.camera, bounds.width, bounds.height);
        if (hit && (!best || hit.depth > best.depth)) best = hit;
      }
      return best?.body || null;
    }

    render(context, project) {
      const bodies = this.extrudeController?.bodies || [];
      if (!bodies.length) return;

      const drawFace = (face, fill, stroke, lineWidth) => {
        if (!face || !face.normal || face.body.visible === false ||
          !bodies.includes(face.body) ||
          dot(face.normal, this.camera.depth) <= 1e-6) return;
        renderFaceHighlight(context, project, face, { fill, stroke, lineWidth, camera: this.camera });
      };

      const gpuActive = Boolean(cad.bodyRenderer && !cad.bodyRenderer.failed && cad.bodyRenderer.gl);
      if (gpuActive) {
        // Depth-tested shaded GPU highlights render directly on WebGL triangles; keep 2D fallback only
        // for facet picks without triIndices or bounding cages on imported meshes.
        if (this.hovered && !this.hovered.triIndices?.length && this.hovered !== this.selected &&
            (!this.selectedBody || this.hovered.body !== this.selectedBody)) {
          drawFace(this.hovered, 'rgba(45, 156, 219, .22)', 'rgba(30, 130, 200, .75)', 1.4);
        }
        if (this.selectedBody && this.selectedBody.meshSource === 'import' &&
            this.selectedBody.visible !== false && bodies.includes(this.selectedBody)) {
          renderBodyHighlight(context, project, this.selectedBody, {
            fill: 'rgba(33, 137, 227, .38)',
            stroke: '#0e70b0',
            lineWidth: 2.0,
            camera: this.camera
          });
        }
        if (this.selected && !this.selected.triIndices?.length) {
          drawFace(this.selected, 'rgba(33, 137, 227, .42)', '#0e70b0', 2.2);
        }
        return;
      }

      // 1. Hovered face highlight (subtle preview)
      if (this.hovered && this.hovered !== this.selected && (!this.selectedBody || this.hovered.body !== this.selectedBody)) {
        drawFace(this.hovered, 'rgba(45, 156, 219, .22)', 'rgba(30, 130, 200, .75)', 1.4);
      }

      // 2. Selected body highlight (all visible faces of the body)
      if (this.selectedBody && this.selectedBody.visible !== false && bodies.includes(this.selectedBody)) {
        renderBodyHighlight(context, project, this.selectedBody, {
          fill: 'rgba(33, 137, 227, .38)',
          stroke: '#0e70b0',
          lineWidth: 2.0,
          camera: this.camera
        });
      }

      // 3. Selected face highlight (rich selection blue + bold contour)
      if (this.selected) {
        drawFace(this.selected, 'rgba(33, 137, 227, .42)', '#0e70b0', 2.2);
      }
    }

    bind() {
      this.canvas.addEventListener('pointermove', event => {
        this.lastPointerEvent = event;
        if (typeof document !== 'undefined' && document.body?.classList?.contains('is-dragging-dialog')) return;
        if (event.buttons || !this.isAvailable()) {
          if (this.hovered) {
            this.hovered = null;
            this.canvas.classList.remove('over-face');
            this.onChange();
          }
          return;
        }
        const face = this.surfaceAt(event);
        if (face !== this.hovered) {
          this.hovered = face;
          this.canvas.classList.toggle('over-face', Boolean(face));
          this.onChange();
        }
      });

      this.canvas.addEventListener('pointerleave', () => {
        if (this.hovered) {
          this.hovered = null;
          this.canvas.classList.remove('over-face');
          this.onChange();
        }
      });

      window?.addEventListener?.('keydown', event => {
        if ((event.key === 'Control' || event.key === 'Meta') && this.hovered) {
          this.hovered = null;
          this.canvas.classList.remove('over-face');
          this.onChange();
        }
      });

      window?.addEventListener?.('keyup', event => {
        if ((event.key === 'Control' || event.key === 'Meta') && this.lastPointerEvent) {
          if (!this.isAvailable() || this.lastPointerEvent.buttons) return;
          const fake = {
            clientX: this.lastPointerEvent.clientX,
            clientY: this.lastPointerEvent.clientY,
            ctrlKey: false,
            metaKey: false
          };
          const face = this.surfaceAt(fake);
          if (face !== this.hovered) {
            this.hovered = face;
            this.canvas.classList.toggle('over-face', Boolean(face));
            this.onChange();
          }
        }
      });

      this.canvas.addEventListener('click', event => {
        if (event.button !== 0 || event.defaultPrevented || !this.isAvailable()) return;
        if (event.detail >= 2) {
          const body = this.bodyAt(event);
          if (body) {
            this.selectBody(body);
            return;
          }
        }
        const face = this.surfaceAt(event, true);
        if (!face) {
          const body = this.bodyAt(event);
          if (body) {
            if (this.selectedBody === body) {
              this.clear();
            } else {
              this.selectBody(body);
            }
            return;
          }
          this.clear();
          return;
        }
        if (this.selectedBody) {
          this.selectFace(face);
          return;
        }
        if (this.selected === face) {
          this.clear();
        } else {
          this.selectFace(face);
        }
      });

      this.canvas.addEventListener('dblclick', event => {
        if (event.button !== 0 || event.defaultPrevented || !this.isAvailable()) return;
        const body = this.bodyAt(event);
        if (body) {
          this.selectBody(body);
        }
      });
    }
  }

  function hitPointAt(screen, bodies, camera, bounds, includeFacets = false) {
    if (!bodies?.length) return null;
    const sx = screen[0], sy = screen[1];
    const fastProj = typeof camera.origin === 'function' && typeof camera.unit === 'function' &&
      camera.right && camera.up && camera.depth;
    let unit, R, U, D, baseX, baseY;
    if (fastProj) {
      const [originX, originY] = camera.origin(bounds.width, bounds.height);
      unit = camera.unit(bounds.width, bounds.height);
      const pivot = cad.settings.cameraPivot ? camera.pivot : [0, 0, 0];
      R = camera.right; U = camera.up; D = camera.depth;
      baseX = originX - dot(R, pivot) * unit;
      baseY = originY + dot(U, pivot) * unit;
    }
    let best = null;
    for (const body of bodies) {
      if (body.visible === false || !body.mesh) continue;
      const bodyPatches = patches(body);
      if (includeFacets && body.meshSource === 'solid' && !bodyPatches.length) {
        const hit = pickMeshTriangle(body, screen, camera, bounds.width, bounds.height, true);
        if (hit && (!best || hit.depth > best.depth)) {
          const face = facetFace(hit);
          const ids = hit.mesh.triangles.slice(hit.triangle * 3, hit.triangle * 3 + 3);
          const v = hit.mesh.vertices, w = hit.weights;
          const a = ids[0] * 3, b = ids[1] * 3, c = ids[2] * 3;
          const point = [
            w[0] * v[a] + w[1] * v[b] + w[2] * v[c],
            w[0] * v[a + 1] + w[1] * v[b + 1] + w[2] * v[c + 1],
            w[0] * v[a + 2] + w[1] * v[b + 2] + w[2] * v[c + 2],
          ];
          best = { face, depth: hit.depth, point };
        }
      }
      if (fastProj) {
        for (const face of bodyPatches) {
          if (dot(face.normal, D) <= 1e-6) continue;
          const tris = face.triangles;
          for (let t = 0; t < tris.length; t++) {
            const triangle = tris[t];
            const p0 = triangle[0], p1 = triangle[1], p2 = triangle[2];
            const ax = baseX + (R[0] * p0[0] + R[1] * p0[1] + R[2] * p0[2]) * unit;
            const ay = baseY - (U[0] * p0[0] + U[1] * p0[1] + U[2] * p0[2]) * unit;
            const bx = baseX + (R[0] * p1[0] + R[1] * p1[1] + R[2] * p1[2]) * unit;
            const by = baseY - (U[0] * p1[0] + U[1] * p1[1] + U[2] * p1[2]) * unit;
            const cx = baseX + (R[0] * p2[0] + R[1] * p2[1] + R[2] * p2[2]) * unit;
            const cy = baseY - (U[0] * p2[0] + U[1] * p2[1] + U[2] * p2[2]) * unit;
            const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            if (Math.abs(area) < 1e-7) continue;
            const invArea = 1 / area;
            const w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) * invArea;
            const w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) * invArea;
            const w2 = 1 - w0 - w1;
            if (!(w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001)) continue;
            const depth = w0 * dot(p0, D) + w1 * dot(p1, D) + w2 * dot(p2, D);
            if (!best || depth > best.depth) {
              best = {
                face,
                depth,
                point: [
                  w0 * p0[0] + w1 * p1[0] + w2 * p2[0],
                  w0 * p0[1] + w1 * p1[1] + w2 * p2[1],
                  w0 * p0[2] + w1 * p1[2] + w2 * p2[2],
                ],
              };
            }
          }
        }
      } else {
        for (const face of bodyPatches) {
          if (dot(face.normal, camera.depth) <= 1e-6) continue;
          for (const triangle of face.triangles) {
            const projected = triangle.map(point => camera.project(point, bounds.width, bounds.height));
            const weights = projectedTriangle(screen, ...projected);
            if (!weights) continue;
            const depth = triangle.reduce((sum, point, index) =>
              sum + weights[index] * dot(point, camera.depth), 0);
            if (!best || depth > best.depth) {
              const point = [0, 1, 2].map(axis =>
                weights[0] * triangle[0][axis] + weights[1] * triangle[1][axis] + weights[2] * triangle[2][axis]);
              best = { face, depth, point };
            }
          }
        }
      }
    }
    if (best && isOccludedByMesh(best.depth, screen, bodies, camera, bounds.width, bounds.height)) {
      return null;
    }
    return best;
  }

  const centerCache = new WeakMap();

  function bodyCenter(body) {
    if (!body) return [0, 0, 0];
    if (body.mesh) {
      const cached = centerCache.get(body.mesh);
      if (cached) return [...cached];
      const vertices = body.mesh.vertices;
      if (vertices?.length) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
          const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
        centerCache.set(body.mesh, center);
        return center;
      }
    }
    if (body.origin) return [...body.origin];
    return [0, 0, 0];
  }

  function closestBodyCenter(screen, bodies, camera, bounds) {
    if (!bodies?.length) return null;
    const visibleBodies = bodies.filter(b => b.visible !== false && b.mesh?.vertices?.length);
    if (!visibleBodies.length) return null;
    if (visibleBodies.length === 1) return bodyCenter(visibleBodies[0]);

    let bestBody = null;
    let bestDist = Infinity;

    for (const body of visibleBodies) {
      const center = bodyCenter(body);
      const [scX, scY] = camera.project(center, bounds.width, bounds.height);
      let minDist = Math.hypot(screen[0] - scX, screen[1] - scY);

      const vertices = body.mesh.vertices;
      const step = Math.max(3, Math.floor(vertices.length / 150) * 3);
      for (let i = 0; i < vertices.length; i += step) {
        const [vx, vy] = camera.project([vertices[i], vertices[i + 1], vertices[i + 2]], bounds.width, bounds.height);
        const d = Math.hypot(screen[0] - vx, screen[1] - vy);
        if (d < minDist) minDist = d;
      }

      if (minDist < bestDist) {
        bestDist = minDist;
        bestBody = body;
      }
    }

    return bestBody ? bodyCenter(bestBody) : null;
  }

  cad.bodyFaces = {
    patches,
    topology,
    surfaces: body => topology(body).allFaces,
    registerPlane,
    projectedTriangle,
    renderFaceHighlight,
    renderBodyHighlight,
    hitPointAt,
    bodyCenter,
    closestBodyCenter,
  };
  cad.BodyFaceSelection = BodyFaceSelection;
})(window.WebCAD = window.WebCAD || {});
