(function (root) {
  'use strict';

  // EXPERIMENTAL: reverse-engineering style reconstruction.
  // A CAD-exported STL samples analytic surfaces (planes, cylinders, spheres).
  // Recognising those surfaces lets us regenerate the geometry at any
  // resolution instead of smoothing triangles blindly.

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function weld(mesh) {
    const v = mesh.vertices, t = mesh.triangles;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]);
    }
    const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
    const inv = 1 / Math.max(1e-9, extent * 1e-7);
    const lookup = new Map(), points = [], remap = new Int32Array(v.length / 3);
    for (let i = 0; i < remap.length; i++) {
      const p = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const key = `${Math.round(p[0] * inv)},${Math.round(p[1] * inv)},${Math.round(p[2] * inv)}`;
      let id = lookup.get(key);
      if (id === undefined) { id = points.length; points.push(p); lookup.set(key, id); }
      remap[i] = id;
    }
    const faces = [];
    for (let i = 0; i < t.length; i += 3) {
      const f = [remap[t[i]], remap[t[i + 1]], remap[t[i + 2]]];
      if (f[0] === f[1] || f[1] === f[2] || f[2] === f[0]) continue;
      const n = cross(sub(points[f[1]], points[f[0]]), sub(points[f[2]], points[f[0]]));
      if (len(n) < extent * extent * 1e-14) continue;
      faces.push(f);
    }
    return { points, faces, extent };
  }

  function topology(points, faces) {
    const normals = [], areas = [], edgeFaces = new Map();
    const n = points.length;
    faces.forEach((f, index) => {
      const c = cross(sub(points[f[1]], points[f[0]]), sub(points[f[2]], points[f[0]]));
      areas.push(len(c) / 2);
      normals.push(unit(c));
      for (let s = 0; s < 3; s++) {
        const a = f[s], b = f[(s + 1) % 3];
        const key = Math.min(a, b) * n + Math.max(a, b);
        let list = edgeFaces.get(key);
        if (!list) edgeFaces.set(key, list = []);
        list.push(index);
      }
    });
    return { normals, areas, edgeFaces, edgeKey: (a, b) => Math.min(a, b) * n + Math.max(a, b) };
  }

  // --- small linear algebra helpers ---------------------------------------
  function solve(A, b) {
    const m = A.length, M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < m; c++) {
      let p = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < m; r++) if (r !== c) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[m] / row[i]);
  }

  function symmetricEigen(S) {
    const a = S.map(r => [...r]), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
      const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-15) break;
      for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    return [0, 1, 2].map(i => ({ value: a[i][i], vector: [V[0][i], V[1][i], V[2][i]] }))
      .sort((x, y) => x.value - y.value);
  }

  // --- primitive fitting ---------------------------------------------------
  function regionPoints(points, faces, ids) {
    const set = new Set();
    for (const f of ids) for (const v of faces[f]) set.add(v);
    return [...set].map(i => points[i]);
  }

  function fitPlane(ctx, ids) {
    const { normals, areas } = ctx.topo;
    let n = [0, 0, 0];
    for (const f of ids) n = addScaled(n, normals[f], areas[f]);
    n = unit(n);
    for (const f of ids) if (dot(n, normals[f]) < Math.cos(Math.PI / 90)) return null;
    const pts = regionPoints(ctx.points, ctx.faces, ids);
    const offset = pts.reduce((s, p) => s + dot(n, p), 0) / pts.length;
    const residual = Math.max(...pts.map(p => Math.abs(dot(n, p) - offset)));
    return residual <= ctx.tol ? { type: 'plane', normal: n, offset, residual } : null;
  }

  function fitCylinder(ctx, ids) {
    const { normals, areas } = ctx.topo;
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let total = 0;
    for (const f of ids) {
      const n = normals[f], a = areas[f];
      total += a;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += a * n[i] * n[j];
    }
    const eig = symmetricEigen(S);
    if (eig[0].value / total > 0.02 || eig[1].value / total < 0.002) return null;
    const axis = unit(eig[0].vector);
    const u = unit(Math.abs(axis[0]) < 0.9 ? cross(axis, [1, 0, 0]) : cross(axis, [0, 1, 0]));
    const w = cross(axis, u);
    const pts = regionPoints(ctx.points, ctx.faces, ids);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (const p of pts) {
      const x = dot(p, u), y = dot(p, w), row = [x, y, 1], rhs = -(x * x + y * y);
      for (let i = 0; i < 3; i++) { b[i] += row[i] * rhs; for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; }
    }
    const sol = solve(A, b);
    if (!sol) return null;
    const cx = -sol[0] / 2, cy = -sol[1] / 2;
    const radius = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]));
    if (!(radius > 0) || radius > ctx.extent * 20) return null;
    const center = addScaled(addScaled([0, 0, 0], u, cx), w, cy);
    const residual = Math.max(...pts.map(p => {
      const d = sub(p, center), t = dot(d, axis);
      return Math.abs(len(addScaled(d, axis, -t)) - radius);
    }));
    return residual <= ctx.tol ? { type: 'cylinder', axis, center, radius, residual } : null;
  }

  function fitSphere(ctx, ids) {
    const pts = regionPoints(ctx.points, ctx.faces, ids);
    if (pts.length < 6) return null;
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
    for (const p of pts) {
      const row = [p[0], p[1], p[2], 1], rhs = -dot(p, p);
      for (let i = 0; i < 4; i++) { b[i] += row[i] * rhs; for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j]; }
    }
    const sol = solve(A, b);
    if (!sol) return null;
    const center = [-sol[0] / 2, -sol[1] / 2, -sol[2] / 2];
    const radius = Math.sqrt(Math.max(0, dot(center, center) - sol[3]));
    if (!(radius > 0) || radius > ctx.extent * 20) return null;
    const residual = Math.max(...pts.map(p => Math.abs(len(sub(p, center)) - radius)));
    return residual <= ctx.tol ? { type: 'sphere', center, radius, residual } : null;
  }

  function components(ctx, ids) {
    const inSet = new Set(ids), seen = new Set(), out = [];
    for (const seed of ids) {
      if (seen.has(seed)) continue;
      const group = [], stack = [seed];
      seen.add(seed);
      while (stack.length) {
        const f = stack.pop();
        group.push(f);
        for (const g of ctx.neighbors[f]) if (inSet.has(g) && !seen.has(g)) { seen.add(g); stack.push(g); }
      }
      out.push(group);
    }
    return out;
  }

  function largestFlatRegion(ctx, ids) {
    const { normals, areas } = ctx.topo;
    const inSet = new Set(ids), seen = new Set();
    let best = null;
    for (const seed of ids) {
      if (seen.has(seed)) continue;
      const group = [], stack = [seed];
      seen.add(seed);
      let area = 0;
      while (stack.length) {
        const f = stack.pop();
        group.push(f); area += areas[f];
        for (const g of ctx.neighbors[f]) {
          if (!inSet.has(g) || seen.has(g) || dot(normals[f], normals[g]) < 0.999999) continue;
          seen.add(g); stack.push(g);
        }
      }
      if (!best || area > best.area) best = { group, area };
    }
    return best;
  }

  function classify(ctx, ids, depth, out) {
    const surface = fitPlane(ctx, ids) || fitCylinder(ctx, ids) || fitSphere(ctx, ids);
    if (surface) { out.push({ ...surface, faces: ids }); return; }
    const total = ids.reduce((s, f) => s + ctx.topo.areas[f], 0);
    const flat = depth < 12 ? largestFlatRegion(ctx, ids) : null;
    const plane = flat && flat.area >= total * 0.1 && flat.group.length < ids.length
      ? fitPlane(ctx, flat.group) : null;
    if (!plane) { out.push({ type: 'freeform', faces: ids }); return; }
    // A tangent plane (slot side, fillet neighbour) is peeled off; the rest is refitted.
    out.push({ ...plane, faces: flat.group });
    const peeled = new Set(flat.group);
    for (const part of components(ctx, ids.filter(f => !peeled.has(f)))) classify(ctx, part, depth + 1, out);
  }

  function analyze(mesh, options = {}) {
    const { points, faces, extent } = weld(mesh);
    const topo = topology(points, faces);
    const tol = extent * (options.fitTolerance ?? 1e-4);
    const creaseCos = Math.cos((options.creaseAngle ?? 30) * Math.PI / 180);
    const neighbors = faces.map(() => []);
    const parent = faces.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (const list of topo.edgeFaces.values()) {
      if (list.length !== 2) continue;
      const [a, b] = list;
      neighbors[a].push(b); neighbors[b].push(a);
      if (dot(topo.normals[a], topo.normals[b]) >= creaseCos) parent[find(a)] = find(b);
    }
    const groups = new Map();
    faces.forEach((_, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    });
    const ctx = { points, faces, topo, extent, tol, neighbors };
    const surfaces = [];
    for (const ids of groups.values()) classify(ctx, ids, 0, surfaces);
    const faceSurface = new Int32Array(faces.length).fill(-1);
    surfaces.forEach((s, i) => { s.id = i; for (const f of s.faces) faceSurface[f] = i; });
    return { points, faces, extent, tol, surfaces, faceSurface, topo };
  }

  // --- projection onto recognised surfaces ---------------------------------
  function project(s, p) {
    if (s.type === 'plane') return addScaled(p, s.normal, s.offset - dot(s.normal, p));
    if (s.type === 'cylinder') {
      const d = sub(p, s.center), t = dot(d, s.axis);
      const radial = addScaled(d, s.axis, -t), r = len(radial);
      if (r < 1e-12) return p;
      return addScaled(addScaled(s.center, s.axis, t), radial, s.radius / r);
    }
    if (s.type === 'sphere') {
      const d = sub(p, s.center), r = len(d);
      return r < 1e-12 ? p : addScaled(s.center, d, s.radius / r);
    }
    return p;
  }

  function projectOnto(list, p) {
    if (!list.length) return p;
    if (list.length === 1) return project(list[0], p);
    let q = p;
    for (let i = 0; i < 40; i++) for (const s of list) q = project(s, q);
    return q;
  }

  const isCurved = s => s && (s.type === 'cylinder' || s.type === 'sphere');

  /**
   * Snap vertices to their fitted surfaces and refine curved regions until the
   * chord error is below `chordTolerance`. Planar regions are only split where
   * needed to keep the mesh watertight (no T-junctions).
   */
  function rebuild(mesh, options = {}) {
    const analysis = analyze(mesh, options);
    const { surfaces, extent } = analysis;
    const chordTol = options.chordTolerance ??
      (options.chordToleranceRatio ? extent * options.chordToleranceRatio : extent * 1e-4);
    const maxTriangles = options.maxTriangles ?? 400000;
    let points = analysis.points.map(p => [...p]);
    let faces = analysis.faces.map(f => [...f]);
    let faceSurface = Array.from(analysis.faceSurface);
    const analyticOf = ids => [...new Set(ids.map(f => faceSurface[f]))]
      .map(i => surfaces[i]).filter(s => s && s.type !== 'freeform');

    // 1. snap vertices (removes STL float noise, closes tiny gaps between surfaces)
    const incident = points.map(() => []);
    faces.forEach((f, i) => f.forEach(v => incident[v].push(i)));
    points = points.map((p, i) => {
      const q = projectOnto(analyticOf(incident[i]), p);
      return len(sub(q, p)) <= analysis.tol * 4 ? q : p;
    });

    // 2. adaptive, conforming refinement of curved surfaces
    let levels = 0;
    for (; levels < (options.maxLevels ?? 8); levels++) {
      const topo = topology(points, faces);
      const mids = new Map();
      for (const [key, list] of topo.edgeFaces) {
        const surfs = analyticOf(list);
        if (!surfs.some(isCurved)) continue;
        const f = faces[list[0]];
        let a = -1, b = -1;
        for (let s = 0; s < 3; s++) {
          if (topo.edgeKey(f[s], f[(s + 1) % 3]) === key) { a = f[s]; b = f[(s + 1) % 3]; }
        }
        const linear = [(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2, (points[a][2] + points[b][2]) / 2];
        const projected = projectOnto(surfs, linear);
        const moved = len(sub(projected, linear));
        if (moved <= chordTol || moved > len(sub(points[a], points[b])) * 0.5) continue;
        mids.set(key, points.length);
        points.push(projected);
      }
      if (!mids.size) break;
      const next = [], nextSurface = [];
      faces.forEach((f, i) => {
        const m = [0, 1, 2].map(s => mids.get(topo.edgeKey(f[s], f[(s + 1) % 3])));
        const count = m.filter(x => x !== undefined).length;
        const push = (...tri) => { next.push(tri); nextSurface.push(faceSurface[i]); };
        if (count === 0) push(...f);
        else if (count === 3) {
          push(f[0], m[0], m[2]); push(m[0], f[1], m[1]); push(m[2], m[1], f[2]); push(m[0], m[1], m[2]);
        } else {
          const loop = [];
          for (let s = 0; s < 3; s++) { loop.push(f[s]); if (m[s] !== undefined) loop.push(m[s]); }
          const start = loop.findIndex(v => m.includes(v));
          const order = loop.slice(start).concat(loop.slice(0, start));
          for (let k = 1; k < order.length - 1; k++) push(order[0], order[k], order[k + 1]);
        }
      });
      faces = next; faceSurface = nextSurface;
      if (faces.length > maxTriangles) break;
    }
    const vertices = new Float32Array(points.length * 3);
    points.forEach((p, i) => { vertices[i * 3] = p[0]; vertices[i * 3 + 1] = p[1]; vertices[i * 3 + 2] = p[2]; });
    return {
      vertices, triangles: Uint32Array.from(faces.flat()), levels,
      surfaces: surfaces.map(({ faces: f, ...s }) => ({ ...s, faceCount: f.length })),
    };
  }

  function summary(surfaces) {
    const counts = {};
    for (const s of surfaces) counts[s.type] = (counts[s.type] || 0) + 1;
    return counts;
  }

  root.WebCADMeshFeatureFitCore = { analyze, rebuild, project, summary };
})(typeof self !== 'undefined' ? self : globalThis);
