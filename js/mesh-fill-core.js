(function (root) {
  'use strict';

  // Fill Hollow: makes the inside of a hollow model solid.
  // The surface is rasterized into a voxel grid, everything reachable from
  // outside is flood-filled, and the rest is the interior. Openings narrower
  // than `closeGap` (windows, vents) are bridged with a morphological closing.
  // The interior solid is kept two voxels behind the surface and united with
  // the original mesh, so the outside keeps its full detail.

  function bounds(vertices) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const min = [minX, minY, minZ];
    const max = [maxX, maxY, maxZ];
    return { min, max, extent: Math.max(maxX - minX, maxY - minY, maxZ - minZ) };
  }

  function makeGrid(source, resolution, closeGap) {
    const box = bounds(source.vertices);
    if (!(box.extent > 0)) throw new Error('The mesh has no size.');
    const voxel = box.extent / resolution;
    const radius = Math.max(0, Math.ceil(closeGap / 2 / voxel));
    const pad = radius + 3;
    const origin = [box.min[0] - pad * voxel, box.min[1] - pad * voxel, box.min[2] - pad * voxel];
    const size = [
      Math.ceil((box.max[0] - box.min[0]) / voxel) + pad * 2 + 1,
      Math.ceil((box.max[1] - box.min[1]) / voxel) + pad * 2 + 1,
      Math.ceil((box.max[2] - box.min[2]) / voxel) + pad * 2 + 1,
    ];
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
    const sx = size[0], sy = size[1], sxy = sx * sy;
    const ox = origin[0], oy = origin[1], oz = origin[2];
    const invVoxel = 1 / voxel;

    for (let f = 0; f < t.length; f += 3) {
      const a = t[f] * 3, b = t[f + 1] * 3, c = t[f + 2] * 3;
      const vxA = v[a], vyA = v[a + 1], vzA = v[a + 2];
      const vxB = v[b], vyB = v[b + 1], vzB = v[b + 2];
      const vxC = v[c], vyC = v[c + 1], vzC = v[c + 2];

      const abx = (vxB - vxA) * invVoxel, aby = (vyB - vyA) * invVoxel, abz = (vzB - vzA) * invVoxel;
      const acx = (vxC - vxA) * invVoxel, acy = (vyC - vyA) * invVoxel, acz = (vzC - vzA) * invVoxel;
      const bcx = abx - acx, bcy = aby - acy, bcz = abz - acz;

      const longestVoxelSq = Math.max(
        abx * abx + aby * aby + abz * abz,
        acx * acx + acy * acy + acz * acz,
        bcx * bcx + bcy * bcy + bcz * bcz
      );
      const steps = Math.max(1, Math.ceil(Math.sqrt(longestVoxelSq) * 2));
      const invSteps = 1 / steps;
      const ax = (vxA - ox) * invVoxel;
      const ay = (vyA - oy) * invVoxel;
      const az = (vzA - oz) * invVoxel;
      const stepAbX = abx * invSteps, stepAbY = aby * invSteps, stepAbZ = abz * invSteps;
      const stepAcX = acx * invSteps, stepAcY = acy * invSteps, stepAcZ = acz * invSteps;

      for (let i = 0; i <= steps; i++) {
        const bx = ax + stepAbX * i;
        const by = ay + stepAbY * i;
        const bz = az + stepAbZ * i;
        const maxJ = steps - i;
        for (let j = 0; j <= maxJ; j++) {
          const px = bx + stepAcX * j;
          const py = by + stepAcY * j;
          const pz = bz + stepAcZ * j;
          const gx = px >= 0 ? (px | 0) : Math.floor(px);
          const gy = py >= 0 ? (py | 0) : Math.floor(py);
          const gz = pz >= 0 ? (pz | 0) : Math.floor(pz);
          wall[gx + gy * sx + gz * sxy] = 1;
        }
      }
    }
    return wall;
  }

  // Cube dilation by `radius` voxels, done as three 1D passes with a running count.
  function dilate(grid, mask, radius) {
    if (radius <= 0) return mask;
    const nx = grid.size[0], ny = grid.size[1], nz = grid.size[2];
    const sxy = nx * ny;
    const count = grid.count;
    const bufA = new Uint8Array(count);
    const bufB = new Uint8Array(count);

    // X-pass: mask -> bufA
    const xWarm = radius < nx ? radius : nx;
    for (let row = 0; row < count; row += nx) {
      let inWindow = 0;
      for (let x = 0; x < xWarm; x++) inWindow += mask[row + x];
      for (let x = 0; x < nx; x++) {
        const enter = x + radius;
        const leave = x - radius - 1;
        if (enter < nx) inWindow += mask[row + enter];
        if (leave >= 0) inWindow -= mask[row + leave];
        bufA[row + x] = inWindow > 0 ? 1 : 0;
      }
    }

    // Y-pass: bufA -> bufB
    const yWarm = radius < ny ? radius : ny;
    for (let z = 0; z < count; z += sxy) {
      for (let x = 0; x < nx; x++) {
        const base = z + x;
        let inWindow = 0;
        for (let y = 0; y < yWarm; y++) inWindow += bufA[base + y * nx];
        for (let y = 0; y < ny; y++) {
          const enter = y + radius;
          const leave = y - radius - 1;
          if (enter < ny) inWindow += bufA[base + enter * nx];
          if (leave >= 0) inWindow -= bufA[base + leave * nx];
          bufB[base + y * nx] = inWindow > 0 ? 1 : 0;
        }
      }
    }

    // Z-pass: bufB -> bufA
    const zWarm = radius < nz ? radius : nz;
    for (let y = 0; y < sxy; y += nx) {
      for (let x = 0; x < nx; x++) {
        const base = y + x;
        let inWindow = 0;
        for (let z = 0; z < zWarm; z++) inWindow += bufB[base + z * sxy];
        for (let z = 0; z < nz; z++) {
          const enter = z + radius;
          const leave = z - radius - 1;
          if (enter < nz) inWindow += bufB[base + enter * sxy];
          if (leave >= 0) inWindow -= bufB[base + leave * sxy];
          bufA[base + z * sxy] = inWindow > 0 ? 1 : 0;
        }
      }
    }

    return bufA;
  }

  // 6-connected flood fill of the free space, seeded from the padded border.
  function floodOutside(grid, blocked) {
    const nx = grid.size[0], ny = grid.size[1], nz = grid.size[2];
    const sxy = nx * ny;
    const outside = new Uint8Array(grid.count);
    const queue = new Int32Array(grid.count);
    let head = 0, tail = 0;

    const trySeed = index => {
      if (!blocked[index] && !outside[index]) {
        outside[index] = 1;
        queue[tail++] = index;
      }
    };

    // z = 0 and z = nz - 1 faces
    for (let i = 0; i < sxy; i++) trySeed(i);
    if (nz > 1) {
      const topStart = (nz - 1) * sxy;
      for (let i = 0; i < sxy; i++) trySeed(topStart + i);
    }
    // Interior z slices: y borders and x borders
    for (let z = 1; z < nz - 1; z++) {
      const zBase = z * sxy;
      for (let x = 0; x < nx; x++) trySeed(zBase + x);
      if (ny > 1) {
        const yMaxBase = zBase + (ny - 1) * nx;
        for (let x = 0; x < nx; x++) trySeed(yMaxBase + x);
      }
      for (let y = 1; y < ny - 1; y++) {
        const row = zBase + y * nx;
        trySeed(row);
        if (nx > 1) trySeed(row + nx - 1);
      }
    }

    const nx1 = nx - 1, ny1 = ny - 1, nz1 = nz - 1;
    while (head < tail) {
      const index = queue[head++];
      const z = (index / sxy) | 0;
      const rem = index - z * sxy;
      const y = (rem / nx) | 0;
      const x = rem - y * nx;

      if (x > 0) {
        const ni = index - 1;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
      if (x < nx1) {
        const ni = index + 1;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
      if (y > 0) {
        const ni = index - nx;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
      if (y < ny1) {
        const ni = index + nx;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
      if (z > 0) {
        const ni = index - sxy;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
      if (z < nz1) {
        const ni = index + sxy;
        if (!blocked[ni] && !outside[ni]) { outside[ni] = 1; queue[tail++] = ni; }
      }
    }
    return outside;
  }

  function interiorMask(source, { resolution = 160, closeGap = 0, shrink = 1 } = {}) {
    const grid = makeGrid(source, resolution, closeGap);
    const wall = rasterize(grid, source);
    const outside = floodOutside(grid, dilate(grid, wall, grid.radius));
    const reach = dilate(grid, outside, grid.radius + shrink);
    const inside = new Uint8Array(grid.count);
    const nx = grid.size[0], ny = grid.size[1], nz = grid.size[2];
    let lowX = Infinity, lowY = Infinity, lowZ = Infinity;
    let highX = -Infinity, highY = -Infinity, highZ = -Infinity;
    let filled = 0;
    let i = 0;
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++, i++) {
          if (reach[i]) continue;
          inside[i] = 1;
          filled++;
          if (x < lowX) lowX = x; if (x > highX) highX = x;
          if (y < lowY) lowY = y; if (y > highY) highY = y;
          if (z < lowZ) lowZ = z; if (z > highZ) highZ = z;
        }
      }
    }
    return {
      grid, inside, filled,
      cells: { low: [lowX, lowY, lowZ], high: [highX, highY, highZ] },
    };
  }

  // Signed field for levelSet: +1 inside, -1 outside, box-blurred once so the
  // reconstructed surface is smooth instead of stair-stepped.
  function smoothField(grid, inside, cells = null) {
    const fullNx = grid.size[0], fullNy = grid.size[1], fullNz = grid.size[2];
    const fullSxy = fullNx * fullNy;
    let x0 = 0, x1 = fullNx - 1;
    let y0 = 0, y1 = fullNy - 1;
    let z0 = 0, z1 = fullNz - 1;
    if (cells && Number.isFinite(cells.low[0])) {
      x0 = Math.max(0, cells.low[0] - 3);
      x1 = Math.min(fullNx - 1, cells.high[0] + 3);
      y0 = Math.max(0, cells.low[1] - 3);
      y1 = Math.min(fullNy - 1, cells.high[1] + 3);
      z0 = Math.max(0, cells.low[2] - 3);
      z1 = Math.min(fullNz - 1, cells.high[2] + 3);
    }

    const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
    const sxy = nx * ny;
    const count = sxy * nz;
    const subGrid = {
      voxel: grid.voxel,
      origin: [
        grid.origin[0] + x0 * grid.voxel,
        grid.origin[1] + y0 * grid.voxel,
        grid.origin[2] + z0 * grid.voxel,
      ],
      size: [nx, ny, nz],
      count,
    };

    const field = new Float32Array(count);
    const scratch = new Float32Array(count);

    if (x0 === 0 && x1 === fullNx - 1 && y0 === 0 && y1 === fullNy - 1 && z0 === 0 && z1 === fullNz - 1) {
      for (let i = 0; i < count; i++) field[i] = inside[i] ? 1 : -1;
    } else {
      let dst = 0;
      for (let z = z0; z <= z1; z++) {
        const zBase = z * fullSxy;
        for (let y = y0; y <= y1; y++) {
          const rowBase = zBase + y * fullNx + x0;
          for (let x = 0; x < nx; x++, dst++) {
            field[dst] = inside[rowBase + x] ? 1 : -1;
          }
        }
      }
    }

    // X-blur: field -> scratch
    if (nx === 1) {
      for (let i = 0; i < count; i++) scratch[i] = (field[i] * 2 - 2) * 0.25;
    } else {
      const nxLast = nx - 1;
      for (let row = 0; row < count; row += nx) {
        scratch[row] = (-1 + field[row] * 2 + field[row + 1]) * 0.25;
        for (let x = 1; x < nxLast; x++) {
          scratch[row + x] = (field[row + x - 1] + field[row + x] * 2 + field[row + x + 1]) * 0.25;
        }
        scratch[row + nxLast] = (field[row + nxLast - 1] + field[row + nxLast] * 2 - 1) * 0.25;
      }
    }

    // Y-blur: scratch -> field (row-sequential)
    if (ny === 1) {
      for (let i = 0; i < count; i++) field[i] = (scratch[i] * 2 - 2) * 0.25;
    } else {
      const nyLast = ny - 1;
      for (let z = 0; z < count; z += sxy) {
        for (let x = 0; x < nx; x++) {
          const i = z + x;
          field[i] = (-1 + scratch[i] * 2 + scratch[i + nx]) * 0.25;
        }
        for (let y = 1; y < nyLast; y++) {
          const row = z + y * nx;
          for (let x = 0; x < nx; x++) {
            const i = row + x;
            field[i] = (scratch[i - nx] + scratch[i] * 2 + scratch[i + nx]) * 0.25;
          }
        }
        const topRow = z + nyLast * nx;
        for (let x = 0; x < nx; x++) {
          const i = topRow + x;
          field[i] = (scratch[i - nx] + scratch[i] * 2 - 1) * 0.25;
        }
      }
    }

    // Z-blur: field -> scratch (slice-sequential)
    if (nz === 1) {
      for (let i = 0; i < count; i++) scratch[i] = (field[i] * 2 - 2) * 0.25;
    } else {
      for (let i = 0; i < sxy; i++) {
        scratch[i] = (-1 + field[i] * 2 + field[i + sxy]) * 0.25;
      }
      const nzLast = nz - 1;
      for (let z = 1; z < nzLast; z++) {
        const start = z * sxy, end = start + sxy;
        for (let i = start; i < end; i++) {
          scratch[i] = (field[i - sxy] + field[i] * 2 + field[i + sxy]) * 0.25;
        }
      }
      const topStart = nzLast * sxy;
      for (let i = topStart; i < count; i++) {
        scratch[i] = (field[i - sxy] + field[i] * 2 - 1) * 0.25;
      }
    }

    return { grid: subGrid, field: scratch };
  }

  function sampler(grid, field) {
    const nx = grid.size[0], ny = grid.size[1], nz = grid.size[2];
    const nx1 = nx - 1, ny1 = ny - 1, nz1 = nz - 1;
    const sxy = nx * ny;
    const ox = grid.origin[0], oy = grid.origin[1], oz = grid.origin[2];
    const invVoxel = 1 / grid.voxel;

    return point => {
      // Voxel centres sit at origin + (index + 0.5) * voxel.
      const gx = (point[0] - ox) * invVoxel - 0.5;
      const gy = (point[1] - oy) * invVoxel - 0.5;
      const gz = (point[2] - oz) * invVoxel - 0.5;
      const x = Math.floor(gx), y = Math.floor(gy), z = Math.floor(gz);
      const fx = gx - x, fy = gy - y, fz = gz - z;

      if (x >= 0 && y >= 0 && z >= 0 && x < nx1 && y < ny1 && z < nz1) {
        const i000 = x + y * nx + z * sxy;
        const i010 = i000 + nx;
        const i001 = i000 + sxy;
        const i011 = i010 + sxy;
        const c00 = field[i000] + (field[i000 + 1] - field[i000]) * fx;
        const c10 = field[i010] + (field[i010 + 1] - field[i010]) * fx;
        const c01 = field[i001] + (field[i001 + 1] - field[i001]) * fx;
        const c11 = field[i011] + (field[i011 + 1] - field[i011]) * fx;
        const d0 = c00 + (c10 - c00) * fy;
        const d1 = c01 + (c11 - c01) * fy;
        return d0 + (d1 - d0) * fz;
      }

      const x0In = x >= 0 && x < nx, x1In = x + 1 >= 0 && x + 1 < nx;
      const y0In = y >= 0 && y < ny, y1In = y + 1 >= 0 && y + 1 < ny;
      const z0In = z >= 0 && z < nz, z1In = z + 1 >= 0 && z + 1 < nz;

      const v000 = (x0In && y0In && z0In) ? field[x + y * nx + z * sxy] : -1;
      const v100 = (x1In && y0In && z0In) ? field[x + 1 + y * nx + z * sxy] : -1;
      const v010 = (x0In && y1In && z0In) ? field[x + (y + 1) * nx + z * sxy] : -1;
      const v110 = (x1In && y1In && z0In) ? field[x + 1 + (y + 1) * nx + z * sxy] : -1;
      const v001 = (x0In && y0In && z1In) ? field[x + y * nx + (z + 1) * sxy] : -1;
      const v101 = (x1In && y0In && z1In) ? field[x + 1 + y * nx + (z + 1) * sxy] : -1;
      const v011 = (x0In && y1In && z1In) ? field[x + (y + 1) * nx + (z + 1) * sxy] : -1;
      const v111 = (x1In && y1In && z1In) ? field[x + 1 + (y + 1) * nx + (z + 1) * sxy] : -1;

      const c00 = v000 + (v100 - v000) * fx;
      const c10 = v010 + (v110 - v010) * fx;
      const c01 = v001 + (v101 - v001) * fx;
      const c11 = v011 + (v111 - v011) * fx;
      const d0 = c00 + (c10 - c00) * fy;
      const d1 = c01 + (c11 - c01) * fy;
      return d0 + (d1 - d0) * fz;
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
      const va = a, vb = b, vc = c;
      const ax = vertices[va], ay = vertices[va + 1], az = vertices[va + 2];
      const bx = vertices[vb], by = vertices[vb + 1], bz = vertices[vb + 2];
      const cx = vertices[vc], cy = vertices[vc + 1], cz = vertices[vc + 2];
      if (ax < shell.min[0]) shell.min[0] = ax; if (ax > shell.max[0]) shell.max[0] = ax;
      if (ay < shell.min[1]) shell.min[1] = ay; if (ay > shell.max[1]) shell.max[1] = ay;
      if (az < shell.min[2]) shell.min[2] = az; if (az > shell.max[2]) shell.max[2] = az;
      if (bx < shell.min[0]) shell.min[0] = bx; if (bx > shell.max[0]) shell.max[0] = bx;
      if (by < shell.min[1]) shell.min[1] = by; if (by > shell.max[1]) shell.max[1] = by;
      if (bz < shell.min[2]) shell.min[2] = bz; if (bz > shell.max[2]) shell.max[2] = bz;
      if (cx < shell.min[0]) shell.min[0] = cx; if (cx > shell.max[0]) shell.max[0] = cx;
      if (cy < shell.min[1]) shell.min[1] = cy; if (cy > shell.max[1]) shell.max[1] = cy;
      if (cz < shell.min[2]) shell.min[2] = cz; if (cz > shell.max[2]) shell.max[2] = cz;
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
    const solid = new module.Manifold(new module.Mesh({
      numProp: 3,
      vertProperties: mesh.vertices instanceof Float32Array ? mesh.vertices : Float32Array.from(mesh.vertices),
      triVerts: mesh.triangles instanceof Uint32Array ? mesh.triangles : Uint32Array.from(mesh.triangles),
    }));
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
      const smoothed = smoothField(grid, inside, cells);
      const sdf = sampler(smoothed.grid, smoothed.field);
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
