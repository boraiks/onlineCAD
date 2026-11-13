(function (root) {
  'use strict';

  // Fill Hollow: makes the inside of a hollow model solid.
  // The surface is rasterized into a voxel grid, everything reachable from
  // outside is flood-filled, and the rest is the interior. Openings narrower
  // than `closeGap` (windows, vents) are bridged with a morphological closing.
  // The interior solid is kept two voxels behind the surface and united with
  // the original mesh, so the outside keeps its full detail.

  function bounds(vertices) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vertices[i + axis]);
        max[axis] = Math.max(max[axis], vertices[i + axis]);
      }
    }
    return { min, max, extent: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) };
  }

  function makeGrid(source, resolution, closeGap) {
    const box = bounds(source.vertices);
    if (!(box.extent > 0)) throw new Error('The mesh has no size.');
    const voxel = box.extent / resolution;
    const radius = Math.max(0, Math.ceil(closeGap / 2 / voxel));
    const pad = radius + 3;
    const origin = box.min.map(value => value - pad * voxel);
    const size = [0, 1, 2].map(axis => Math.ceil((box.max[axis] - box.min[axis]) / voxel) + pad * 2 + 1);
    const count = size[0] * size[1] * size[2];
    if (count > 40_000_000) throw new Error('The fill grid is too large; lower the detail or the opening size.');
    return { voxel, radius, origin, size, count };
  }

  // Mark every voxel a triangle passes through by sampling it at half-voxel spacing.
  function rasterize(grid, source) {
    const { voxel, origin, size } = grid;
    const wall = new Uint8Array(grid.count);
    const v = source.vertices;
    const t = source.triangles;
    const sx = size[0], sxy = size[0] * size[1];
    const mark = (x, y, z) => {
      const i = Math.floor((x - origin[0]) / voxel);
      const j = Math.floor((y - origin[1]) / voxel);
      const k = Math.floor((z - origin[2]) / voxel);
      wall[i + j * sx + k * sxy] = 1;
    };
    for (let f = 0; f < t.length; f += 3) {
      const a = t[f] * 3, b = t[f + 1] * 3, c = t[f + 2] * 3;
      const ab = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
      const ac = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
      const longest = Math.max(Math.hypot(...ab), Math.hypot(...ac),
        Math.hypot(ab[0] - ac[0], ab[1] - ac[1], ab[2] - ac[2]));
      const steps = Math.max(1, Math.ceil(longest / (voxel * 0.5)));
      for (let i = 0; i <= steps; i++) {
        for (let j = 0; i + j <= steps; j++) {
          const s = i / steps, u = j / steps;
          mark(v[a] + ab[0] * s + ac[0] * u, v[a + 1] + ab[1] * s + ac[1] * u, v[a + 2] + ab[2] * s + ac[2] * u);
        }
      }
    }
    return wall;
  }

  // Cube dilation by `radius` voxels, done as three 1D passes with a running count.
  function dilate(grid, mask, radius) {
    if (radius <= 0) return mask;
    const [nx, ny, nz] = grid.size;
    const strides = [1, nx, nx * ny];
    let current = mask;
    for (let axis = 0; axis < 3; axis++) {
      const next = new Uint8Array(grid.count);
      const length = grid.size[axis];
      const stride = strides[axis];
      const others = [0, 1, 2].filter(other => other !== axis);
      for (let p = 0; p < grid.size[others[0]]; p++) {
        for (let q = 0; q < grid.size[others[1]]; q++) {
          const base = p * strides[others[0]] + q * strides[others[1]];
          let inWindow = 0;
          for (let i = 0; i < Math.min(radius, length); i++) inWindow += current[base + i * stride];
          for (let i = 0; i < length; i++) {
            const enter = i + radius;
            const leave = i - radius - 1;
            if (enter < length) inWindow += current[base + enter * stride];
            if (leave >= 0) inWindow -= current[base + leave * stride];
            next[base + i * stride] = inWindow > 0 ? 1 : 0;
          }
        }
      }
      current = next;
    }
    return current;
  }

  // 6-connected flood fill of the free space, seeded from the padded border.
  function floodOutside(grid, blocked) {
    const [nx, ny, nz] = grid.size;
    const outside = new Uint8Array(grid.count);
    const queue = new Int32Array(grid.count);
    let head = 0, tail = 0;
    const push = index => {
      if (!blocked[index] && !outside[index]) {
        outside[index] = 1;
        queue[tail++] = index;
      }
    };
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1)
            push(x + y * nx + z * nx * ny);
        }
      }
    }
    const sxy = nx * ny;
    while (head < tail) {
      const index = queue[head++];
      const x = index % nx, y = Math.floor(index / nx) % ny, z = Math.floor(index / sxy);
      if (x > 0) push(index - 1);
      if (x < nx - 1) push(index + 1);
      if (y > 0) push(index - nx);
      if (y < ny - 1) push(index + nx);
      if (z > 0) push(index - sxy);
      if (z < nz - 1) push(index + sxy);
    }
    return outside;
  }

  function interiorMask(source, { resolution = 160, closeGap = 0, shrink = 1 } = {}) {
    const grid = makeGrid(source, resolution, closeGap);
    const wall = rasterize(grid, source);
    const outside = floodOutside(grid, dilate(grid, wall, grid.radius));
    const reach = dilate(grid, outside, grid.radius + shrink);
    const inside = new Uint8Array(grid.count);
    const [nx, ny] = grid.size;
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    let filled = 0;
    for (let i = 0; i < grid.count; i++) {
      if (reach[i]) continue;
      inside[i] = 1;
      filled++;
      const cell = [i % nx, Math.floor(i / nx) % ny, Math.floor(i / (nx * ny))];
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], cell[axis]);
        high[axis] = Math.max(high[axis], cell[axis]);
      }
    }
    return { grid, inside, filled, cells: { low, high } };
  }

  // Signed field for levelSet: +1 inside, -1 outside, box-blurred once so the
  // reconstructed surface is smooth instead of stair-stepped.
  function smoothField(grid, inside) {
    const [nx, ny, nz] = grid.size;
    let field = new Float32Array(grid.count);
    for (let i = 0; i < grid.count; i++) field[i] = inside[i] ? 1 : -1;
    const strides = [1, nx, nx * ny];
    for (let axis = 0; axis < 3; axis++) {
      const next = new Float32Array(grid.count);
      const stride = strides[axis];
      const length = grid.size[axis];
      for (let i = 0; i < grid.count; i++) {
        const position = Math.floor(i / stride) % length;
        const before = position > 0 ? field[i - stride] : -1;
        const after = position < length - 1 ? field[i + stride] : -1;
        next[i] = (before + field[i] * 2 + after) / 4;
      }
      field = next;
    }
    return field;
  }

  function sampler(grid, field) {
    const [nx, ny, nz] = grid.size;
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz)
      ? -1 : field[x + y * nx + z * nx * ny];
    return point => {
      // Voxel centres sit at origin + (index + 0.5) * voxel.
      const gx = (point[0] - grid.origin[0]) / grid.voxel - 0.5;
      const gy = (point[1] - grid.origin[1]) / grid.voxel - 0.5;
      const gz = (point[2] - grid.origin[2]) / grid.voxel - 0.5;
      const x = Math.floor(gx), y = Math.floor(gy), z = Math.floor(gz);
      const fx = gx - x, fy = gy - y, fz = gz - z;
      const lerp = (a, b, s) => a + (b - a) * s;
      return lerp(
        lerp(lerp(at(x, y, z), at(x + 1, y, z), fx), lerp(at(x, y + 1, z), at(x + 1, y + 1, z), fx), fy),
        lerp(lerp(at(x, y, z + 1), at(x + 1, y, z + 1), fx), lerp(at(x, y + 1, z + 1), at(x + 1, y + 1, z + 1), fx), fy),
        fz);
    };
  }

  function meshFromSolid(solid) {
    const mesh = solid.getMesh();
    const vertices = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
    for (let i = 0, at = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      vertices[at++] = mesh.vertProperties[i];
      vertices[at++] = mesh.vertProperties[i + 1];
      vertices[at++] = mesh.vertProperties[i + 2];
    }
    return { vertices, triangles: Uint32Array.from(mesh.triVerts) };
  }

  // Split a closed mesh into its shells. An enclosed cavity is a shell with
  // negative signed volume that lies inside a positive shell; dropping it
  // fills the cavity exactly, however thin it is. Inverted shells that are
  // not inside anything are kept (they are solids with flipped facets).
  function withoutCavities(prepared) {
    const { vertices, triangles } = prepared;
    const vertexCount = vertices.length / 3;
    const parent = new Int32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) parent[i] = i;
    const find = index => {
      while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
      return index;
    };
    for (let t = 0; t < triangles.length; t += 3) {
      const a = find(triangles[t]);
      parent[find(triangles[t + 1])] = a;
      parent[find(triangles[t + 2])] = find(triangles[t]);
    }
    const shells = new Map();
    for (let t = 0; t < triangles.length; t += 3) {
      const key = find(triangles[t]);
      let shell = shells.get(key);
      if (!shell) {
        shell = { volume: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: [] };
        shells.set(key, shell);
      }
      shell.faces.push(t);
      const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
      shell.volume += (vertices[a] * (vertices[b + 1] * vertices[c + 2] - vertices[b + 2] * vertices[c + 1]) -
        vertices[a + 1] * (vertices[b] * vertices[c + 2] - vertices[b + 2] * vertices[c]) +
        vertices[a + 2] * (vertices[b] * vertices[c + 1] - vertices[b + 1] * vertices[c])) / 6;
      for (const index of [a, b, c]) {
        for (let axis = 0; axis < 3; axis++) {
          shell.min[axis] = Math.min(shell.min[axis], vertices[index + axis]);
          shell.max[axis] = Math.max(shell.max[axis], vertices[index + axis]);
        }
      }
    }
    const list = [...shells.values()];
    const positives = list.filter(shell => shell.volume > 0);
    const contains = (outer, inner) => [0, 1, 2].every(axis =>
      outer.min[axis] <= inner.min[axis] && outer.max[axis] >= inner.max[axis]);
    const cavities = list.filter(shell => shell.volume < 0 && positives.some(outer => contains(outer, shell)));
    const volume = list.reduce((sum, shell) => sum + shell.volume, 0);
    if (!cavities.length) return { mesh: prepared, removed: 0, volume };
    const dropped = new Uint8Array(triangles.length / 3);
    for (const shell of cavities) for (const t of shell.faces) dropped[t / 3] = 1;
    const kept = [];
    for (let t = 0; t < triangles.length; t += 3) {
      if (!dropped[t / 3]) kept.push(triangles[t], triangles[t + 1], triangles[t + 2]);
    }
    return { mesh: { vertices, triangles: Uint32Array.from(kept) }, removed: cavities.length, volume };
  }

  function solidFrom(module, mesh) {
    const solid = new module.Manifold(new module.Mesh({ numProp: 3,
      vertProperties: Float32Array.from(mesh.vertices), triVerts: Uint32Array.from(mesh.triangles) }));
    if (solid.status() === 'NoError' && !solid.isEmpty() && solid.volume() > 0) return solid;
    solid.delete();
    return null;
  }

  // The closed original (repaired when needed) with its enclosed cavities
  // removed, plus the original's volume.
  function originalSolid(module, source) {
    const core = root.WebCADMeshSolidCore;
    if (!core?.prepareSolidMesh) return null;
    let prepared;
    try {
      prepared = core.prepareSolidMesh(source);
    } catch {
      return null; // Open surfaces fall back to the approximate fill.
    }
    const { mesh, removed, volume } = withoutCavities(prepared);
    const base = solidFrom(module, mesh);
    if (base) return { base, cavities: removed, volume };
    if (!removed) return null;
    const original = solidFrom(module, prepared);
    return original ? { base: original, cavities: 0, volume: original.volume() } : null;
  }

  const OPEN_MESSAGE = 'Nothing to fill: the inside is open to the outside. Set "Close openings up to" to the size of the largest opening.';
  const GAP_MESSAGE = 'Nothing to fill: no hollow space was found. Try a larger opening size.';

  function fillHollow(module, source, { resolution = 160, closeGap = 0 } = {}) {
    if (!source?.vertices?.length || !source?.triangles?.length) throw new Error('Select a mesh body to fill.');
    const objects = [];
    const finish = (solid, extra) => {
      if (solid.status() !== 'NoError' || solid.isEmpty()) throw new Error(`Fill failed: ${solid.status()}.`);
      return { ...meshFromSolid(solid), volume: solid.volume(), ...extra };
    };
    try {
      const solids = originalSolid(module, source);
      const base = solids?.base || null;
      const original = Boolean(base);
      const cavities = solids?.cavities || 0;
      const originalVolume = solids?.volume || 0;
      if (base) objects.push(base);
      const summary = volume => ({ originalVolume, addedVolume: Math.max(0, volume - originalVolume),
        cavitiesFilled: cavities, approximate: !original });
      if (original && !(closeGap > 0)) {
        if (!cavities) throw new Error(OPEN_MESSAGE);
        const result = finish(base, {});
        return { ...result, ...summary(result.volume), voxelSize: 0 };
      }

      // Open interiors: voxel flood fill. A closed original keeps its exact
      // surface, so the fill hides two voxels behind it. An open surface has
      // no inside of its own: the fill then becomes the whole solid.
      const { grid, inside, filled, cells } = interiorMask(source, { resolution, closeGap, shrink: original ? 2 : 0 });
      if (!filled) throw new Error(closeGap > 0 ? GAP_MESSAGE : OPEN_MESSAGE);
      const sdf = sampler(grid, smoothField(grid, inside));
      // Only sample around the interior; the padded grid can be far larger.
      const min = grid.origin.map((value, axis) => value + (cells.low[axis] - 2) * grid.voxel);
      const max = grid.origin.map((value, axis) => value + (cells.high[axis] + 3) * grid.voxel);
      const fill = module.Manifold.levelSet(sdf, { min, max }, grid.voxel, 0);
      objects.push(fill);
      if (fill.isEmpty()) throw new Error('Nothing to fill: the hollow space is thinner than the fill detail.');
      const simplified = fill.simplify(grid.voxel * 0.25);
      objects.push(simplified);
      let solid = simplified;
      if (base) {
        solid = base.add(simplified);
        objects.push(solid);
      }
      const result = finish(solid, {});
      if (original && !cavities && result.volume - originalVolume <= originalVolume * 1e-3) throw new Error(GAP_MESSAGE);
      return { ...result, ...summary(result.volume), voxelSize: grid.voxel };
    } finally {
      for (const object of objects) object.delete();
    }
  }

  root.WebCADMeshFillCore = { interiorMask, fillHollow };
})(typeof self !== 'undefined' ? self : globalThis);
