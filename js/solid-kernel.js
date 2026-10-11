(function (cad) {
  'use strict';

  let module = null;
  let loading = null;
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });

  async function load() {
    if (module) return module;
    if (!loading) loading = (async () => {
      await loadScript('js/vendor/manifold/manifold.js');
      await loadScript('js/vendor/manifold/manifold-binary.js');
      const ready = await window.WebCADManifoldModule({ wasmBinary: window.WebCADManifoldBinary });
      ready.setup();
      module = ready;
      window.WebCADManifoldBinary = null;
      return ready;
    })().catch(error => { loading = null; throw error; });
    return loading;
  }

  function fromBody(body, cutMargin = 0) {
    if (!module) throw new Error('3D geometry kernel is not ready');
    if (body.mesh && body.meshSource !== 'profile') {
      const mesh = new module.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(body.mesh.vertices),
        triVerts: new Uint32Array(body.mesh.triangles)
      });
      return new module.Manifold(mesh);
    }
    const { u, v } = cad.planes.grid[body.plane];
    const n = body.normal;
    const matrix = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0,
    n[0], n[1], n[2], 0, 0, 0, 0, 1];
    let combined = null;
    try {
      for (const region of body.cells || [body]) {
        let section, expanded, prism, oriented, shifted;
        try {
          section = new module.CrossSection([region.points, ...(region.holes || [])], 'EvenOdd');
          expanded = cutMargin ? section.offset(cutMargin, 'Miter') : null;
          prism = (expanded || section).extrude(body.end - body.start);
          oriented = prism.transform(matrix);
          const origin = body.origin || cad.planes.grid[body.plane].origin || [0, 0, 0];
          shifted = oriented.translate(n.map((value, axis) => origin[axis] + value * body.start));
        } finally {
          oriented?.delete(); prism?.delete(); expanded?.delete(); section?.delete();
        }
        if (!combined) combined = shifted;
        else {
          const union = combined.add(shifted);
          combined.delete(); shifted.delete();
          combined = union;
        }
      }
      return combined;
    } catch (error) {
      combined?.delete();
      throw error;
    }
  }

  function meshData(mesh) {
    const vertices = [];
    for (let index = 0; index < mesh.vertProperties.length; index += mesh.numProp)
      vertices.push(mesh.vertProperties[index], mesh.vertProperties[index + 1], mesh.vertProperties[index + 2]);
    return { vertices, triangles: Array.from(mesh.triVerts) };
  }

  function meshBody(body) {
    if (!module || !body) return null;
    if (body.mesh) return body.mesh;
    const solid = fromBody(body);
    try {
      const mesh = meshData(solid.getMesh());
      body.meshSource = 'profile';
      return mesh;
    } finally {
      solid.delete();
    }
  }

  function bevelCircularRim(body, ring, kind, amount, isConvex = true) {
    const { radius, count = 64 } = ring;
    if (amount >= radius) return null;
    if (isConvex && Number.isFinite(body.end) && Number.isFinite(body.start) && amount >= Math.abs(body.end - body.start)) return null;

    let center3D = ring.center3D;
    let normal3D = ring.normal3D;
    if (!center3D || !normal3D) {
      const top = Math.abs(ring.cap - body.end) < 0.001;
      const { u, v } = cad.planes.grid[body.plane];
      const n = body.normal || [0, 0, 1];
      const origin = body.origin || cad.planes.grid[body.plane]?.origin || [0, 0, 0];
      center3D = u.map((value, axis) => origin[axis] + value * ring.center[0] + v[axis] * ring.center[1] + n[axis] * ring.cap);
      normal3D = top ? [...n] : n.map(x => -x);
    }

    const steps = Math.min(128, Math.max(8, cad.sketchGeometry?.curveSegments(amount, Math.PI / 2) || 24));
    let polygon;

    if (isConvex) {
      const delta = Math.max(0.2, amount * 0.25);
      polygon = [
        [radius - amount, delta],
        [radius - amount, 0],
      ];
      if (kind === 'fillet') {
        const arcCenter = [radius - amount, -amount];
        for (let i = 1; i < steps; i++) {
          const angle = Math.PI / 2 * (1 - i / steps);
          polygon.push([arcCenter[0] + amount * Math.cos(angle), arcCenter[1] + amount * Math.sin(angle)]);
        }
      }
      polygon.push(
        [radius, -amount],
        [radius + delta, -amount],
        [radius + delta, delta]
      );
    } else {
      const delta = Math.min(0.05, amount * 0.1);
      polygon = [
        [radius - delta, -delta],
        [radius - delta, amount],
      ];
      if (kind === 'fillet') {
        for (let i = 0; i <= steps; i++) {
          const theta = (Math.PI / 2) * (i / steps);
          const r = radius + amount * (1 - Math.cos(theta));
          const z = amount * (1 - Math.sin(theta));
          polygon.push([r, z]);
        }
      } else {
        polygon.push([radius + amount, 0]);
      }
      polygon.push([radius + amount, -delta]);
    }

    const nz = normal3D;
    let ux = Math.abs(nz[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    const dotU = ux[0] * nz[0] + ux[1] * nz[1] + ux[2] * nz[2];
    let u = [ux[0] - dotU * nz[0], ux[1] - dotU * nz[1], ux[2] - dotU * nz[2]];
    const uLen = Math.hypot(...u);
    u = u.map(x => x / (uLen || 1));
    const v = cad.math.cross(nz, u);

    const matrix = [
      u[0], u[1], u[2], 0,
      v[0], v[1], v[2], 0,
      nz[0], nz[1], nz[2], 0,
      0, 0, 0, 1,
    ];

    let original, section, revolved, oriented, tool, result;
    try {
      original = fromBody(body);
      section = new module.CrossSection([polygon], 'EvenOdd');
      revolved = section.revolve(count);
      oriented = revolved.transform(matrix);
      tool = oriented.translate(center3D);
      result = isConvex ? original.subtract(tool) : original.add(tool);
      if (result.isEmpty()) return null;
      const initialVol = original.volume();
      const finalVol = result.volume();
      const change = isConvex ? initialVol - finalVol : finalVol - initialVol;
      if (change <= Math.max(1e-8, initialVol * 1e-10)) return null;
      return {
        ...body, cells: null, meshSource: body.meshSource === 'solid' ? 'solid' : 'mesh', renderMesh: null,
        displayReduction: 0, mesh: meshData(result.getMesh())
      };
    } finally {
      result?.delete(); tool?.delete(); oriented?.delete(); revolved?.delete(); section?.delete(); original?.delete();
    }
  }

  function bevelBody(body, edge, kind, amount) {
    if (!module || !body || !edge || !['fillet', 'chamfer'].includes(kind) ||
      !Number.isFinite(amount) || amount <= 0) return null;
    if (edge.ring) return bevelCircularRim(body, edge.ring, kind, amount, edge.convex !== false);
    const { cross, dot } = cad.math;
    const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
    const scale = (a, factor) => a.map(value => value * factor);
    const add = (a, b) => a.map((value, axis) => value + b[axis]);
    const unit = a => scale(a, 1 / Math.hypot(...a));
    const tangent = unit(subtract(edge.b, edge.a));
    const [n1, n2] = edge.normals;
    if (!n1 || !n2 || !Number.isFinite(tangent[0])) return null;
    const direction = edge.convex === false ? 1 : -1;
    const ray1 = unit(scale(subtract(n2, scale(n1, dot(n1, n2))), direction));
    const ray2 = unit(scale(subtract(n1, scale(n2, dot(n1, n2))), direction));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(ray1, ray2))));
    if (theta < 0.05 || theta > Math.PI - 0.05) return null;
    const distance = kind === 'fillet' ? amount / Math.tan(theta / 2) : amount;
    const first = scale(ray1, distance), second = scale(ray2, distance);
    const across = unit(cross(tangent, ray1));
    const toPlane = point => [dot(point, ray1), dot(point, across)];
    const polygon = [[0, 0], toPlane(first)];
    if (kind === 'fillet') {
      const bisector = unit(add(ray1, ray2));
      const center = scale(bisector, amount / Math.sin(theta / 2));
      const start = toPlane(subtract(first, center));
      const end = toPlane(subtract(second, center));
      let sweep = Math.atan2(end[1], end[0]) - Math.atan2(start[1], start[0]);
      if (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (sweep < -Math.PI) sweep += 2 * Math.PI;
      const steps = Math.min(128, Math.max(8, cad.sketchGeometry?.curveSegments(amount, sweep) || 24));
      const origin = toPlane(center);
      const angle = Math.atan2(start[1], start[0]);
      for (let index = 1; index < steps; index++) {
        const at = angle + sweep * index / steps;
        polygon.push([origin[0] + amount * Math.cos(at), origin[1] + amount * Math.sin(at)]);
      }
    }
    polygon.push(toPlane(second));
    const length = Math.hypot(...subtract(edge.b, edge.a));
    const extension = Math.min(0.001, length * 0.001);
    const matrix = [ray1[0], ray1[1], ray1[2], 0,
    across[0], across[1], across[2], 0,
    tangent[0], tangent[1], tangent[2], 0, 0, 0, 0, 1];
    let original, section, prism, oriented, cutter, result;
    try {
      original = fromBody(body);
      section = new module.CrossSection([polygon], 'EvenOdd');
      prism = section.extrude(length + extension * 2);
      oriented = prism.transform(matrix);
      cutter = oriented.translate(subtract(edge.a, scale(tangent, extension)));
      result = edge.convex === false ? original.add(cutter) : original.subtract(cutter);
      const change = edge.convex === false
        ? result.volume() - original.volume() : original.volume() - result.volume();
      if (result.isEmpty() || change <= Math.max(1e-8, original.volume() * 1e-10)) return null;
      return {
        ...body, cells: null, meshSource: body.meshSource === 'solid' ? 'solid' : 'mesh', renderMesh: null,
        displayReduction: 0, mesh: meshData(result.getMesh())
      };
    } finally {
      result?.delete(); cutter?.delete(); oriented?.delete(); prism?.delete(); section?.delete(); original?.delete();
    }
  }

  const profileEdgeCache = new WeakMap();
  function profileEdges(body, target = body) {
    const cached = target === body ? profileEdgeCache.get(body) : null;
    if (cached) return cached;
    const source = cad.planes.grid[body.plane];
    const reference = cad.planes.grid[target.plane];
    const sourceOrigin = body.origin || source.origin || [0, 0, 0];
    const referenceOrigin = target.origin || reference.origin || [0, 0, 0];
    const project = point => {
      const displacement = sourceOrigin.map((value, axis) => value - referenceOrigin[axis] +
        source.u[axis] * point[0] + source.v[axis] * point[1]);
      return [cad.math.dot(displacement, reference.u), cad.math.dot(displacement, reference.v)];
    };
    const key = point => `${Math.round(point[0] * 1e5)},${Math.round(point[1] * 1e5)}`;
    const edges = new Set();
    for (const region of body.cells || [body]) {
      for (const loop of [region.points, ...(region.holes || [])]) {
        if (!loop?.length) continue;
        for (let index = 0; index < loop.length; index++) {
          const a = key(project(loop[index])), b = key(project(loop[(index + 1) % loop.length]));
          edges.add(a < b ? `${a}|${b}` : `${b}|${a}`);
        }
      }
    }
    if (target === body) profileEdgeCache.set(body, edges);
    return edges;
  }

  function sharesProfileEdge(target, tool) {
    if (!target.plane || !tool.plane || !target.points || !tool.points) return false;
    const targetPlane = cad.planes.grid[target.plane], toolPlane = cad.planes.grid[tool.plane];
    if (!targetPlane || !toolPlane ||
      Math.abs(cad.math.dot(cad.math.cross(targetPlane.u, targetPlane.v),
        cad.math.cross(toolPlane.u, toolPlane.v))) < 0.9999)
      return false;
    const targetEdges = profileEdges(target);
    for (const edge of profileEdges(tool, target)) if (targetEdges.has(edge)) return true;
    return false;
  }

  function booleanBody(target, tools, operation) {
    if (!module || !target || !tools.length || !['join', 'cut', 'intersect'].includes(operation)) return null;
    const objects = [];
    try {
      const original = fromBody(target); objects.push(original);
      const referenceSolids = [];
      let hasExpandedCut = false;
      const toolSolids = tools.map(body => {
        const coincidentCut = operation === 'cut' && !body.mesh &&
          (body.faceSourceBodyId === target.id ||
            body.profileId && body.profileId === target.profileId && body.plane === target.plane ||
            target.meshSource !== 'profile' && sharesProfileEdge(target, body));
        let cutMargin = 0;
        if (coincidentCut) {
          const vertices = target.mesh?.vertices || [];
          let extent = 1;
          for (const value of vertices) extent = Math.max(extent, Math.abs(value));
          cutMargin = Math.max(0.001, Math.min(0.01, extent * 2e-6));
        }
        const unexpanded = fromBody(body);
        objects.push(unexpanded);
        referenceSolids.push(unexpanded);
        if (!cutMargin) return unexpanded;
        hasExpandedCut = true;
        const expanded = fromBody(body, cutMargin);
        objects.push(expanded);
        return expanded;
      });
      const combine = solids => {
        let combined = solids[0];
        for (const next of solids.slice(1)) {
          combined = combined.add(next); objects.push(combined);
        }
        return combined;
      };
      const tool = combine(toolSolids);
      const referenceTool = hasExpandedCut ? combine(referenceSolids) : tool;
      const overlap = original.intersect(referenceTool); objects.push(overlap);
      const scale = Math.max(1, original.volume(), referenceTool.volume());
      const hasVolume = overlap.volume() > scale * 1e-8;
      let result;
      if (operation === 'join') {
        result = original.add(tool);
        objects.push(result);
        // Disconnected solids cannot become one body through Join.
        if (!hasVolume) {
          const parts = result.decompose();
          const disconnected = parts.length > 1;
          parts.forEach(part => part.delete());
          if (disconnected) return null;
        }
      } else {
        if (!hasVolume) return null;
        result = operation === 'cut' ? original.subtract(tool) : overlap;
        if (result !== overlap) objects.push(result);
      }
      return {
        ...target, cells: null, meshSource: target.meshSource === 'solid' ? 'solid' : 'mesh', renderMesh: null,
        displayReduction: 0,
        mesh: meshData(result.getMesh()), empty: result.isEmpty()
      };
    } finally {
      for (const object of objects) object.delete();
    }
  }

  function intersectsBody(target, tools) {
    if (!module || !target || !tools?.length) return false;
    const original = fromBody(target);
    try {
      const originalVolume = original.volume();
      for (const body of tools) {
        const tool = fromBody(body);
        try {
          const overlap = original.intersect(tool);
          try {
            if (overlap.volume() > Math.max(1, originalVolume, tool.volume()) * 1e-8) return true;
          } finally { overlap.delete(); }
        } finally { tool.delete(); }
      }
      return false;
    } finally { original.delete(); }
  }

  function computeInterference(bodyA, bodyB) {
    if (!bodyA || !bodyB) {
      return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null };
    }
    if (!module) {
      return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null, error: 'Solid kernel not ready' };
    }
    let solidA = null, solidB = null, overlap = null;
    try {
      if (!bodyA.mesh) bodyA.mesh = meshBody(bodyA);
      if (!bodyB.mesh) bodyB.mesh = meshBody(bodyB);
      solidA = fromBody(bodyA);
      solidB = fromBody(bodyB);
      overlap = solidA.intersect(solidB);
      const volA = solidA.volume();
      const volB = solidB.volume();
      const volOverlap = overlap.volume();
      const minScale = Math.max(1, volA, volB);
      if (volOverlap <= minScale * 1e-7 || overlap.isEmpty()) {
        return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null };
      }
      const mesh = meshData(overlap.getMesh());
      if (!mesh?.triangles?.length) {
        return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null };
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        const x = mesh.vertices[i], y = mesh.vertices[i + 1], z = mesh.vertices[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return {
        hasInterference: true,
        volume: volOverlap,
        mesh,
        bounds: {
          minX, maxX, minY, maxY, minZ, maxZ,
          sizeX: maxX - minX, sizeY: maxY - minY, sizeZ: maxZ - minZ
        },
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
      };
    } catch (err) {
      return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null, error: err?.message };
    } finally {
      solidA?.delete();
      solidB?.delete();
      overlap?.delete();
    }
  }

  function revolveProfile(profile, options = {}) {
    if (!module || !profile?.points?.length) return null;
    const sketch = profile.sketch;
    const plane = cad.planes?.grid?.[sketch?.plane || profile.plane || 'XY'];
    if (!plane) return null;

    const angleDeg = Math.max(1, Math.min(360, Number(options.angle) || 360));
    const slices = Math.max(16, Math.min(128, options.slices || 64));

    let axisPoint = options.axisLine?.point || [0, 0];
    let axisDir = options.axisLine?.dir || [0, 1];
    const dirLen = Math.hypot(axisDir[0], axisDir[1]) || 1;
    axisDir = [axisDir[0] / dirLen, axisDir[1] / dirLen];

    let axisNorm = [-axisDir[1], axisDir[0]];
    const avgR = profile.points.reduce((sum, p) => {
      const rx = (p[0] - axisPoint[0]) * axisNorm[0] + (p[1] - axisPoint[1]) * axisNorm[1];
      return sum + rx;
    }, 0) / profile.points.length;

    if (avgR < 0) {
      axisNorm = [-axisNorm[0], -axisNorm[1]];
    }

    const mapToRH = p => {
      const relX = p[0] - axisPoint[0];
      const relY = p[1] - axisPoint[1];
      const h = relX * axisDir[0] + relY * axisDir[1];
      const r = Math.max(0, relX * axisNorm[0] + relY * axisNorm[1]);
      return [r, h];
    };

    const revolvePoints = profile.points.map(mapToRH);
    const revolveHoles = (profile.holes || []).map(hole => hole.map(mapToRH));

    const origin = profile.origin || plane.origin || [0, 0, 0];
    const u = plane.u;
    const v = plane.v;

    const anchor3D = origin.map((val, i) => val + u[i] * axisPoint[0] + v[i] * axisPoint[1]);
    const axis3D = u.map((val, i) => val * axisDir[0] + v[i] * axisDir[1]);
    const radial3D = u.map((val, i) => val * axisNorm[0] + v[i] * axisNorm[1]);
    const tangent3D = cad.math.cross(axis3D, radial3D);

    const matrix = [
      radial3D[0], radial3D[1], radial3D[2], 0,
      tangent3D[0], tangent3D[1], tangent3D[2], 0,
      axis3D[0], axis3D[1], axis3D[2], 0,
      0, 0, 0, 1
    ];

    let section, revolved, oriented, positioned;
    try {
      section = new module.CrossSection([revolvePoints, ...revolveHoles], 'EvenOdd');
      revolved = section.revolve(slices, angleDeg);
      oriented = revolved.transform(matrix);
      positioned = oriented.translate(anchor3D);
      const mesh = meshData(positioned.getMesh());
      const body = {
        id: options.id || `body-${Date.now()}`,
        name: options.name || 'Revolve',
        mesh,
        meshSource: 'solid',
        profileId: profile.id,
        plane: sketch?.plane || profile.plane || 'XY',
        visible: true
      };

      if (options.operation && options.operation !== 'new' && options.targetBody) {
        return booleanBody(options.targetBody, [body], options.operation);
      }
      return body;
    } finally {
      positioned?.delete(); oriented?.delete(); revolved?.delete(); section?.delete();
    }
  }

  cad.solidKernel = { load, ready: () => !!module, booleanBody, intersectsBody, computeInterference, meshBody, bevelBody, revolveProfile };
})(window.WebCAD = window.WebCAD || {});
