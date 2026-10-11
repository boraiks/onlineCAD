import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;
globalThis.document = {
  currentScript: null,
  createElement: () => ({ src: '', onload: null, onerror: null }),
  head: { append(script) {
    const url = new URL(`../${script.src}`, import.meta.url);
    document.currentScript = { src: url.href };
    import(url.href).then(() => script.onload?.()).catch(error => script.onerror?.(error));
  } }
};

for (const file of ['math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js', 'sketch-grid.js', 'sketch-geometry.js', 'sketch-model.js', 'canvas.js', 'sketch-profiles.js', 'sketch-render.js', 'solid-kernel.js', 'body-renderer.js', 'body-faces.js', 'extrude.js', 'body-move.js']) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

test('planar body faces form selectable patches and can be extruded from their own plane', async () => {
  await cad.solidKernel.load();
  const cube = { id: 'body-1', plane: 'XY', points: [[0, 0], [10, 0], [10, 10], [0, 10]],
    holes: [], start: 0, end: 10, normal: [0, 0, 1] };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const faces = cad.bodyFaces.patches(cube);
  assert.equal(faces.length, 6);
  const top = faces.find(face => face.normal[2] > 0.99);
  assert.ok(top && top.triangles.length >= 2);
  const plane = cad.bodyFaces.registerPlane(top);
  const sketch = { id: 'face-sketch', plane, entities: [], revision: 0 };
  const document = new cad.SketchDocument();
  assert.deepEqual(document.fromWorld(sketch, document.toWorld(sketch, [2, 3])).map(Math.round), [2, 3]);
  const profile = { id: 'face-profile', sketch, points: top.points, holes: top.holes };
  const extension = cad.extrude.makeBody(profile, 'one', 5);
  extension.mesh = cad.solidKernel.meshBody(extension);
  const joined = cad.solidKernel.booleanBody(cube, [extension], 'join');
  assert.ok(joined, 'face extrusion joins the source body');
  assert.equal(Math.round(Math.max(...joined.mesh.vertices.filter((_, index) => index % 3 === 2))), 15);
});

test('face patches preserve inner holes and work after body rotation', async () => {
  await cad.solidKernel.load();
  const ring = { id: 'body-ring', plane: 'XY',
    points: [[0, 0], [20, 0], [20, 20], [0, 20]],
    holes: [[[5, 5], [15, 5], [15, 15], [5, 15]]],
    start: 0, end: 4, normal: [0, 0, 1] };
  ring.mesh = cad.solidKernel.meshBody(ring);
  const top = cad.bodyFaces.patches(ring).find(face => face.normal[2] > 0.99);
  assert.ok(top);
  assert.equal(top.holes.length, 1);
  const turned = cad.bodyMove.transformBody(ring, [5, 3, 2], [25, 15, 35]);
  const turnedFace = cad.bodyFaces.patches(turned).find(face => face.holes.length === 1);
  assert.ok(turnedFace);
  const plane = cad.bodyFaces.registerPlane(turnedFace);
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch(plane);
  const world = document.toWorld(sketch, [3.5, -2.25]);
  assert.ok(Math.abs(cad.math.dot(cad.math.normalize(turnedFace.normal),
    world.map((value, index) => value - turnedFace.origin[index]))) < 1e-6);
  const local = document.fromWorld(sketch, world);
  assert.ok(Math.abs(local[0] - 3.5) < 1e-6 && Math.abs(local[1] + 2.25) < 1e-6);
});

test('cutting an untouched cylindrical face leaves one clean remaining cylinder', async () => {
  const module = await cad.solidKernel.load();
  const points = Array.from({ length: 128 }, (_, index) => {
    const angle = index * 2 * Math.PI / 128;
    return [25 * Math.cos(angle), 25 * Math.sin(angle)];
  });
  const cylinder = { id: 'body-cylinder', profileId: 'circle-profile', plane: 'XY',
    points, holes: [], start: 0, end: 100, normal: [0, 0, 1] };
  cylinder.mesh = cad.solidKernel.meshBody(cylinder);
  const face = cad.bodyFaces.patches(cylinder).find(patch => patch.normal[2] > 0.99);
  assert.ok(face);
  const plane = cad.bodyFaces.registerPlane(face);
  const profile = { id: `${plane}-profile`, sketch: { id: 'cut-face', plane },
    points: face.points, holes: face.holes, face };
  const tool = cad.extrude.makeBody(profile, 'one', -43);
  const result = cad.solidKernel.booleanBody(cylinder, [tool], 'cut');
  assert.ok(result && !result.empty);
  const solid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles) }));
  const parts = solid.decompose();
  assert.equal(parts.length, 1, 'cut must not leave disconnected slivers');
  const maxZ = Math.max(...result.mesh.vertices.filter((_, index) => index % 3 === 2));
  assert.ok(maxZ < 57.001, `remaining material reaches z=${maxZ}`);
  assert.ok(Math.abs(solid.volume() - 57 * (128 / 2) * 25 * 25 * Math.sin(2 * Math.PI / 128)) < 0.1,
    `remaining volume ${solid.volume()}`);
  parts.forEach(part => part.delete()); solid.delete();
});

test('Cut with the exact original profile and full depth removes the body entirely', async () => {
  await cad.solidKernel.load();
  const points = Array.from({ length: 128 }, (_, index) => {
    const angle = index * 2 * Math.PI / 128;
    return [25 * Math.cos(angle), 25 * Math.sin(angle)];
  });
  const profile = { id: 'same-circle', sketch: { id: 'sketch-circle', plane: 'XY' }, points, holes: [] };
  const body = { ...cad.extrude.makeBody(profile, 'one', 100), id: 'body-1' };
  body.mesh = cad.solidKernel.meshBody(body);
  const tool = cad.extrude.makeBody(profile, 'one', 100);
  const cut = cad.solidKernel.booleanBody(body, [tool], 'cut');
  assert.ok(cut?.empty, 'Cut should leave no coincident surface strips');
});

test('overlapping circle sketch profiles cut a clean lens from an extruded cylinder', async () => {
  const module = await cad.solidKernel.load();
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  doc.insertSketch(sketch);
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [0, 0], radius: 25 }));
  const originalProfile = cad.sketchProfiles.fromSketch(sketch)[0];
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [10, 0], radius: 25 }));
  const profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.ok(profiles.length >= 3);
  const target = { id: 'cylinder-lens', plane: 'XY', points: originalProfile.points, holes: [],
    start: 0, end: 100, normal: [0, 0, 1] };
  target.mesh = cad.solidKernel.meshBody(target);
  assert.equal(target.meshSource, 'profile');
  const lens = profiles.find(profile => Math.min(...profile.points.map(p => p[0])) > -16 &&
    Math.max(...profile.points.map(p => p[0])) < 26);
  assert.ok(lens);
  const cutter = cad.extrude.makeBody(lens, 'one', 100);
  const result = cad.solidKernel.booleanBody(target, [cutter], 'cut');
  const analyticResult = cad.solidKernel.booleanBody({ ...target, mesh: null }, [cutter], 'cut');
  assert.ok(result);
  assert.equal(result.meshSource, 'mesh');
  const solid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles) }));
  const parts = solid.decompose();
  assert.equal(parts.length, 1, 'the curved cut must not leave detached mesh strips');
  const analyticSolid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(analyticResult.mesh.vertices),
    triVerts: new Uint32Array(analyticResult.mesh.triangles) }));
  const analyticParts = analyticSolid.decompose();
  assert.equal(analyticParts.length, 1);
  assert.ok(Math.abs(solid.volume() - analyticSolid.volume()) < 0.01);
  const joined = cad.solidKernel.booleanBody(target, [cutter], 'join');
  assert.ok(joined?.mesh);
  const editedCut = cad.solidKernel.booleanBody(joined, [cutter], 'cut');
  assert.ok(editedCut?.mesh);
  const editedSolid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(editedCut.mesh.vertices),
    triVerts: new Uint32Array(editedCut.mesh.triangles) }));
  const editedParts = editedSolid.decompose();
  assert.equal(editedParts.length, 1, 'the cut must stay clean after a previous solid edit');
  editedParts.forEach(part => part.delete()); editedSolid.delete();
  cad.planes.grid.TEST_CUT_FACE = { u: [1, 0, 0], v: [0, 1, 0], origin: [0, 0, 100] };
  const faceCutter = cad.extrude.makeBody({ ...lens,
    sketch: { ...lens.sketch, plane: 'TEST_CUT_FACE' } }, 'one', -128);
  const faceCut = cad.solidKernel.booleanBody(joined, [faceCutter], 'cut');
  assert.ok(faceCut?.mesh);
  const faceSolid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(faceCut.mesh.vertices),
    triVerts: new Uint32Array(faceCut.mesh.triangles) }));
  const faceParts = faceSolid.decompose();
  assert.equal(faceParts.length, 1, 'a sketch on an edited body face must not leave thin strips');
  faceParts.forEach(part => part.delete()); faceSolid.delete();
  delete cad.planes.grid.TEST_CUT_FACE;
  analyticParts.forEach(part => part.delete()); analyticSolid.delete();
  parts.forEach(part => part.delete()); solid.delete();
});

test('automatic Cut detects a full overlap and a 0.001 mm deep overlap', async () => {
  await cad.solidKernel.load();
  const points = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const body = { id: 'target', plane: 'XY', points, holes: [], start: 0, end: 10,
    normal: [0, 0, 1], visible: true };
  const fullTool = { ...body, id: 'full-tool' };
  const shallowTool = { ...body, id: 'shallow-tool', start: 9.999, end: 11 };
  assert.equal(cad.extrude.checkAnyIntersection([fullTool], [body]), true);
  assert.equal(cad.extrude.checkAnyIntersection([shallowTool], [body]), true);
});

test('Cut does not remove material when edited bodies only share an edge', async () => {
  await cad.solidKernel.load();
  const target = { id: 'edge-target', plane: 'XY',
    points: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [],
    start: 0, end: 10, normal: [0, 0, 1] };
  target.mesh = cad.solidKernel.meshBody(target);
  target.meshSource = 'mesh';
  const tool = { id: 'edge-tool', plane: 'XY',
    points: [[10, 0], [20, 0], [20, 10], [10, 10]], holes: [],
    start: 0, end: 10, normal: [0, 0, 1] };
  assert.equal(cad.solidKernel.booleanBody(target, [tool], 'cut'), null);
});

test('Move/Rotate applies rotation about the chosen pivot and keeps the source immutable', () => {
  const body = { normal: [0, 0, 1], mesh: { vertices: [2, 0, 0, 1, 1, 0, 1, -1, 0], triangles: [0, 1, 2] } };
  const result = cad.bodyMove.transformBody(body, [0, 3, 0], [0, 0, 90], [1, 0, 0]);
  assert.deepEqual(result.mesh.vertices.map(value => Math.round(value * 1e6) / 1e6),
    [1, 4, 0, 0, 3, 0, 2, 3, 0]);
  assert.deepEqual(body.mesh.vertices, [2, 0, 0, 1, 1, 0, 1, -1, 0]);
  assert.equal(result.mesh.triangles, body.mesh.triangles);
});

test('Move/Rotate changes body mesh, preserves volume, and supports later 3D operations', async () => {
  const module = await cad.solidKernel.load();
  const cube = { id: 'body-1', name: 'Body 1', plane: 'XY',
    points: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [],
    start: 0, end: 10, normal: [0, 0, 1] };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const moved = cad.bodyMove.transformBody(cube, [8, 0, 0], [0, 0, 90], [5, 5, 5]);
  assert.notEqual(moved.mesh, cube.mesh);
  assert.deepEqual(moved.mesh.triangles, cube.mesh.triangles);
  assert.deepEqual(cad.bodyMove.meshCenter(moved).map(Math.round), [13, 5, 5]);
  assert.deepEqual(cad.bodyMove.meshCenter(cube).map(Math.round), [5, 5, 5]);
  const solid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(moved.mesh.vertices),
    triVerts: new Uint32Array(moved.mesh.triangles) }));
  assert.equal(solid.volume(), 1000);
  solid.delete();
  const joined = cad.solidKernel.booleanBody(cube, [moved], 'join');
  assert.ok(joined, 'moved mesh works in a later Join');
});
const shape = (plane, points, start, end, holes = []) => {
  const { u, v } = cad.planes.grid[plane];
  return { id: `body-${plane}`, plane, points, holes, start, end, normal: cad.math.cross(u, v) };
};

test('Join, Cut, and Intersect operate across depth ranges and sketch planes', async () => {
  const module = await cad.solidKernel.load();
  const volume = body => {
    const mesh = new module.Mesh({ numProp: 3,
      vertProperties: new Float32Array(body.mesh.vertices),
      triVerts: new Uint32Array(body.mesh.triangles) });
    const solid = new module.Manifold(mesh);
    const result = solid.volume();
    solid.delete();
    return result;
  };
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const original = shape('XY', square, 0, 10);
  const shiftedDepth = shape('XY', [[5, 0], [15, 0], [15, 10], [5, 10]], 5, 15);
  const differentPlane = shape('XZ', [[5, 0], [15, 0], [15, 10], [5, 10]], -5, 5);
  const thirdPlane = shape('YZ', [[5, 0], [15, 0], [15, 10], [5, 10]], -5, 5);
  for (const tool of [shiftedDepth, differentPlane, thirdPlane]) {
    const joined = cad.solidKernel.booleanBody(original, [tool], 'join');
    const cut = cad.solidKernel.booleanBody(original, [tool], 'cut');
    const intersected = cad.solidKernel.booleanBody(original, [tool], 'intersect');
    assert.ok(joined && cut && intersected);
    assert.equal(volume(joined), 1750);
    assert.equal(volume(cut), 750);
    assert.equal(volume(intersected), 250);
    assert.ok(cad.extrude.faces(joined).length > 0);
    assert.equal(volume(cad.solidKernel.booleanBody(joined, [tool], 'cut')), 750,
      'a Boolean result can be used by the next 3D operation');
  }
});

test('3D Join accepts face contact, rejects separate solids, and keeps holes', async () => {
  const module = await cad.solidKernel.load();
  const original = shape('XY', [[0, 0], [10, 0], [10, 10], [0, 10]], 0, 10);
  const touching = shape('XY', [[10, 0], [20, 0], [20, 10], [10, 10]], 0, 10);
  const separate = shape('XY', [[30, 0], [40, 0], [40, 10], [30, 10]], 0, 10);
  assert.ok(cad.solidKernel.booleanBody(original, [touching], 'join'));
  assert.equal(cad.solidKernel.booleanBody(original, [separate], 'join'), null);
  const ring = shape('XY', [[0, 0], [20, 0], [20, 20], [0, 20]], 0, 5,
    [[[5, 5], [15, 5], [15, 15], [5, 15]]]);
  const result = cad.solidKernel.booleanBody(ring, [original], 'cut');
  assert.ok(result && result.mesh.triangles.length > 0);
  const mesh = new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles) });
  const solid = new module.Manifold(mesh);
  assert.equal(solid.volume(), 1125);
  solid.delete();
  assert.equal(cad.solidKernel.booleanBody(original, [original], 'cut').empty, true);
});

test('ordinary extruded bodies become reusable triangle meshes', async () => {
  const module = await cad.solidKernel.load();
  const ring = shape('XY', [[0, 0], [20, 0], [20, 20], [0, 20]], 0, 8,
    [[[6, 6], [14, 6], [14, 14], [6, 14]]]);
  const data = cad.solidKernel.meshBody(ring);
  assert.ok(data.vertices.length > 0 && data.triangles.length > 0);
  const solid = new module.Manifold(new module.Mesh({ numProp: 3,
    vertProperties: new Float32Array(data.vertices),
    triVerts: new Uint32Array(data.triangles) }));
  assert.equal(solid.volume(), (20 * 20 - 8 * 8) * 8);
  solid.delete();
  ring.mesh = data;
  assert.equal(cad.solidKernel.meshBody(ring), data, 'meshing is reused after conversion');
});

test('solid fillet and chamfer edit convex and concave straight edges', async () => {
  const module = await cad.solidKernel.load();
  const cube = shape('XY', [[0, 0], [10, 0], [10, 10], [0, 10]], 0, 10);
  cube.mesh = cad.solidKernel.meshBody(cube);
  const edges = cad.bodyRenderer.selectableEdges(cube);
  assert.equal(edges.length, 12);
  assert.ok(edges.every(edge => edge.convex));
  const volume = body => {
    const solid = new module.Manifold(new module.Mesh({ numProp: 3,
      vertProperties: new Float32Array(body.mesh.vertices),
      triVerts: new Uint32Array(body.mesh.triangles) }));
    const value = solid.volume();
    solid.delete();
    return value;
  };
  const chamfer = cad.solidKernel.bevelBody(cube, edges[0], 'chamfer', 1);
  const fillet = cad.solidKernel.bevelBody(cube, edges[0], 'fillet', 1);
  assert.ok(chamfer?.mesh && fillet?.mesh);
  assert.ok(Math.abs(volume(chamfer) - 995) < 0.01);
  assert.ok(Math.abs(volume(fillet) - (1000 - 10 * (1 - Math.PI / 4))) < 0.05);
  assert.equal(cad.solidKernel.bevelBody(cube, edges[0], 'fillet', 0), null);
  for (const edge of edges) {
    assert.ok(cad.solidKernel.bevelBody(cube, edge, 'chamfer', 1), 'every box edge can be chamfered');
    assert.ok(cad.solidKernel.bevelBody(cube, edge, 'fillet', 1), 'every box edge can be rounded');
  }
  const angle = shape('XY', [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]], 0, 10);
  angle.mesh = cad.solidKernel.meshBody(angle);
  const inside = cad.bodyRenderer.selectableEdges(angle).find(edge => !edge.convex);
  assert.ok(inside, 'the reentrant edge is selectable');
  const insideChamfer = cad.solidKernel.bevelBody(angle, inside, 'chamfer', 1);
  const insideFillet = cad.solidKernel.bevelBody(angle, inside, 'fillet', 1);
  assert.ok(insideChamfer?.mesh && insideFillet?.mesh);
  assert.ok(Math.abs(volume(insideChamfer) - 755) < 0.01);
  assert.ok(Math.abs(volume(insideFillet) - (750 + 10 * (1 - Math.PI / 4))) < 0.05);
});

test('a circular solid rim fillets or chamfers as one continuous edge', async () => {
  const module = await cad.solidKernel.load();
  const count = 96, radius = 10;
  const circle = shape('XY', Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }), 0, 12);
  circle.mesh = cad.solidKernel.meshBody(circle);
  const rim = cad.bodyRenderer.selectableEdges(circle).find(edge => edge.ring?.cap === 12);
  assert.ok(rim);
  const volume = body => {
    const solid = new module.Manifold(new module.Mesh({ numProp: 3,
      vertProperties: new Float32Array(body.mesh.vertices),
      triVerts: new Uint32Array(body.mesh.triangles) }));
    const value = solid.volume(); solid.delete(); return value;
  };
  const original = volume(circle);
  for (const mode of ['fillet', 'chamfer']) {
    const result = cad.solidKernel.bevelBody(circle, rim, mode, 1);
    assert.ok(result?.mesh, `${mode} returns a whole-ring mesh`);
    assert.ok(volume(result) < original - 1, `${mode} removes material around the rim`);
  }
  for (const plane of ['XZ', 'YZ']) {
    const turned = shape(plane, circle.points, 0, 12);
    turned.mesh = cad.solidKernel.meshBody(turned);
    const turnedRim = cad.bodyRenderer.selectableEdges(turned).find(edge => edge.ring?.cap === 12);
    assert.ok(turnedRim, `${plane} circular rim remains selectable`);
    const rounded = cad.solidKernel.bevelBody(turned, turnedRim, 'fillet', 1);
    assert.ok(rounded?.mesh && volume(rounded) < volume(turned) - 1);
  }
});

test('double clicking any face selects the whole body, while single clicking selects only the face', async () => {
  await cad.solidKernel.load();
  const cube = { id: 'body-test', name: 'Body Test', plane: 'XY', points: [[0, 0], [20, 0], [20, 20], [0, 20]],
    holes: [], start: 0, end: 15, normal: [0, 0, 1], visible: true };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const listeners = new Map();
  const canvas = {
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: () => {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  const camera = {
    depth: [0, 0, 1],
    project: point => [point[0] * 10 + 200, point[1] * 10 + 150]
  };

  let selectedFace = null;
  let selectedBody = null;
  let redrawCount = 0;

  const selection = new cad.BodyFaceSelection({
    canvas,
    camera,
    extrudeController: { bodies: [cube] },
    isAvailable: () => true,
    onChange: () => { redrawCount++; },
    onSelect: face => { selectedFace = face; },
    onSelectBody: body => { selectedBody = body; }
  });

  // Center of top face (Z=15): X=10, Y=10, Z=15 -> screen: [300, 250]
  const clickEvent = (detail = 1) => ({
    button: 0,
    detail,
    clientX: 300,
    clientY: 250,
    defaultPrevented: false
  });

  // 1. Single click selects only the face
  listeners.get('click')(clickEvent(1));
  assert.ok(selection.selected, 'Face is selected');
  assert.equal(selection.selectedBody, null, 'Body is not yet selected on single click');
  assert.equal(selectedFace, selection.selected);

  // 2. Double click (detail: 2) on the face selects the entire body
  listeners.get('click')(clickEvent(2));
  assert.equal(selection.selected, null, 'Single face selection is cleared on double click');
  assert.equal(selection.selectedBody, cube, 'Entire body is selected on double click');
  assert.equal(selectedBody, cube);

  // 3. dblclick event also maintains/triggers whole body selection
  selection.clear();
  assert.equal(selection.selectedBody, null);
  listeners.get('dblclick')(clickEvent(2));
  assert.equal(selection.selectedBody, cube, 'dblclick event selects the entire body');

  // 4. Test render highlight for whole body
  let renderedFaceCount = 0;
  const dummyContext = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => { renderedFaceCount++; },
    stroke: () => {}
  };
  selection.render(dummyContext, point => point);
  assert.ok(renderedFaceCount >= 1, 'Body selection rendered face highlights');

  // 5. Clicking empty space deselects the body
  listeners.get('click')({ button: 0, detail: 1, clientX: 10, clientY: 10 });
  assert.equal(selection.selectedBody, null, 'Clicking empty space deselects body');
});

test('Show Mesh is strictly suppressed while extrude is active', async () => {
  await cad.solidKernel.load();
  cad.settings = { showMesh: true, displayStyle: 'shaded' };

  const cube = { id: 'body-test', plane: 'XY', points: [[0, 0], [10, 0], [10, 10], [0, 10]],
    holes: [], start: 0, end: 10, normal: [0, 0, 1] };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const camera = {
    depth: [0.577, 0.577, 0.577],
    right: [1, 0, 0],
    up: [0, 1, 0],
    zoom: 1, panX: 0, panY: 0, pivot: [0, 0, 0]
  };
  const project = point => [point[0] * 10, point[1] * 10];

  let normalEdgeStrokes = 0;
  const countContext = {
    strokeStyle: '',
    fillStyle: '',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: function() { if (this.strokeStyle === '#626970' || this.strokeStyle === '#167bb4') normalEdgeStrokes++; }
  };

  // 1. With extrude inactive and showMesh = true, mesh triangle edges are stroked
  cad.extrudeController = { active: false };
  if (cad.app) cad.app.extrudeController = cad.extrudeController;
  cad.extrude.renderBodies(countContext, project, camera, [cube], false);
  assert.ok(normalEdgeStrokes > 0, 'Inactive extrude renders mesh edges when showMesh is true');

  // 2. With extrude active and showMesh = true, showMesh is completely suppressed
  let extrudingEdgeStrokes = 0;
  const extrudeContext = {
    strokeStyle: '',
    fillStyle: '',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: function() { if (this.strokeStyle === '#626970' || this.strokeStyle === '#167bb4') extrudingEdgeStrokes++; }
  };
  cad.extrudeController = { active: true };
  if (cad.app) cad.app.extrudeController = cad.extrudeController;
  cad.extrude.renderBodies(extrudeContext, project, camera, [cube], false);
  assert.equal(extrudingEdgeStrokes, 0, 'No mesh lines are rendered when extrude is active even with showMesh=true');

  // 3. Extrude preview geometry does not leak coplanar triangulation mesh lines
  let previewEdgeStrokes = 0;
  const previewContext = {
    strokeStyle: '',
    fillStyle: '',
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: function() { if (this.strokeStyle === '#626970' || this.strokeStyle === '#167bb4') previewEdgeStrokes++; }
  };
  cad.extrude.renderBodies(previewContext, project, camera, [cube], true);
  // Preview renders only silhouette/sharp feature edges, which is significantly fewer than all mesh edges
  assert.ok(previewEdgeStrokes < normalEdgeStrokes, 'Preview renders only feature silhouettes, not full triangle mesh');

  // Cleanup
  cad.extrudeController = null;
  cad.settings.showMesh = false;
});

test('body intersection detection correctly identifies 3D volume penetration', () => {
  const box = shape('XY', [[0, 0], [10, 0], [10, 10], [0, 10]], 0, 10);
  const penetratingTool = shape('XY', [[2, 2], [8, 2], [8, 8], [2, 8]], 5, 15);
  const touchingOutwardTool = shape('XY', [[2, 2], [8, 2], [8, 8], [2, 8]], 10, 20);
  const separatedTool = shape('XY', [[20, 20], [30, 20], [30, 30], [20, 30]], 0, 10);

  const boundsBox = cad.extrude.bodyBounds(box);
  const boundsPenetrating = cad.extrude.bodyBounds(penetratingTool);
  const boundsTouching = cad.extrude.bodyBounds(touchingOutwardTool);
  const boundsSeparated = cad.extrude.bodyBounds(separatedTool);

  assert.ok(boundsBox && boundsPenetrating && boundsTouching && boundsSeparated);
  assert.equal(cad.extrude.boxesOverlap(boundsBox, boundsPenetrating, 0.01), true,
    'penetrating tool overlaps target bounding box');
  assert.equal(cad.extrude.boxesOverlap(boundsBox, boundsTouching, 0.01), false,
    'touching outward tool does not overlap with 0.01 tolerance');
  assert.equal(cad.extrude.boxesOverlap(boundsBox, boundsSeparated, 0.01), false,
    'separated tool does not overlap target bounding box');

  assert.equal(cad.extrude.checkAnyIntersection([penetratingTool], [box]), true,
    'penetrating tool triggers checkAnyIntersection');
  assert.equal(cad.extrude.checkAnyIntersection([touchingOutwardTool], [box]), false,
    'touching outward tool does not trigger checkAnyIntersection');
  assert.equal(cad.extrude.checkAnyIntersection([separatedTool], [box]), false,
    'separated tool does not trigger checkAnyIntersection');
});

test('extruding through an existing body automatically selects CUT and renders red preview', () => {
  const cube = shape('XY', [[0, 0], [20, 0], [20, 20], [0, 20]], 0, 20);
  cube.id = 'body-1';
  cube.visible = true;

  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  doc.insertSketch(sketch);
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [10, 10], radius: 4 }));
  const profile = cad.sketchProfiles.fromSketch(sketch)[0];
  assert.ok(profile);

  const camera = new cad.Camera();
  camera.selectView('isometric');
  const project = point => camera.project(point, 800, 600);

  const classes = set => ({
    set: new Set(set || []),
    add(c) { this.set.add(c); },
    remove(c) { this.set.delete(c); },
    toggle(c, state) { if (state) this.set.add(c); else this.set.delete(c); },
    contains(c) { return this.set.has(c); }
  });

  const fields = new Map();
  const field = (id, val = '') => {
    const el = {
      value: val, hidden: false, disabled: false, textContent: '',
      classList: classes(),
      addEventListener() {}, listeners: new Map()
    };
    fields.set(`#${id}`, el);
    return el;
  };

  const direction = field('extrudeDirection', 'one');
  field('extrudeType', 'solid');
  const operation = field('extrudeOperation', 'new');
  const distance = field('extrudeDistance', '10');
  field('extrudeSecondDistance', '0');
  field('extrudeSecondRow');
  field('extrudeThickness', '1');
  field('extrudeThicknessRow');
  field('extrudeChain', 'on').checked = true;
  field('extrudeChainRow');
  field('extrudeHelp');
  const count = field('extrudeCount');
  const ok = field('extrudeOk');
  field('extrudeCancel');
  const panel = {
    hidden: true,
    classList: classes(),
    querySelector: selector => fields.get(selector),
    addEventListener() {}
  };
  const canvas = {
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    classList: classes(),
    setPointerCapture() {},
    hasPointerCapture: () => false
  };
  const hudFields = new Map([
    ['#extrudeHudDirection', { textContent: '' }],
    ['#extrudeHudFirstLabel', { textContent: '' }],
    ['#extrudeHudFirst', { textContent: '' }],
    ['#extrudeHudSecondRow', { hidden: true }],
    ['#extrudeHudSecond', { textContent: '' }],
    ['#extrudeHudOperationRow', { hidden: true }],
    ['#extrudeHudOperation', { textContent: '' }]
  ]);
  const hud = {
    hidden: true,
    style: {},
    offsetWidth: 185,
    offsetHeight: 75,
    classList: classes(),
    querySelector: selector => hudFields.get(selector)
  };

  const controller = new cad.ExtrudeController({
    canvas, panel, hud, document: doc, camera, modelView: { visibility: {}, render() {} },
    history: { execute: cmd => cmd?.execute?.() }, profileSelection: { selectedId: null, clear() {} },
    onChange() {}, onBodiesChange() {}, onStatus() {}
  });

  controller.bodies = [cube];
  const priorShowMesh = cad.settings.showMesh;
  cad.settings.showMesh = true;
  assert.equal(controller.open(), true);
  assert.equal(distance.value, '0');
  assert.equal(cad.settings.showMesh, false, 'opening Extrude turns off Show Mesh');
  controller.selectedIds.add(profile.id);

  // 1. Initial distance is 10 mm into the cube [0, 10]
  // Since tool penetrates cube [0, 20], it must auto-switch to CUT
  distance.value = '10';
  controller.update();
  assert.equal(operation.value, 'cut', 'extrude auto-selected CUT when penetrating body');
  assert.equal(panel.classList.contains('is-cut'), true, 'panel has is-cut class');
  assert.equal(operation.classList.contains('is-cut'), true, 'operation select has is-cut class');
  assert.equal(ok.classList.contains('is-cut'), true, 'OK button has is-cut class');
  assert.equal(hud.classList.contains('is-cut'), true, 'HUD has is-cut class');
  assert.equal(hudFields.get('#extrudeHudOperation').textContent, 'CUT', 'HUD displays CUT badge/text');

  // 2. Render verify: Preview bodies are drawn in RED
  const fillStyles = [];
  const strokeStyles = [];
  const renderContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    fill(mode) { fillStyles.push(this.fillStyle); },
    stroke() { strokeStyles.push(this.strokeStyle); }
  };
  controller.render(renderContext, project);
  assert.ok(fillStyles.some(s => s === 'rgba(235, 55, 55, .72)' || s === 'rgba(205, 40, 40, .58)'),
    'CUT extrusion preview uses red fill');
  assert.ok(strokeStyles.includes('#c62828'), 'CUT extrusion preview uses #c62828 red edge stroke');
  assert.ok(strokeStyles.includes('#b71c1c'), '3D drag arrow uses #b71c1c red stroke in cut mode');
  assert.ok(fillStyles.includes('#e53935'), '3D drag arrow head uses #e53935 red fill in cut mode');

  // 3. Move extrusion away from body (extruding backwards into negative z where there is no body)
  distance.value = '-10';
  controller.update();
  assert.equal(operation.value, 'new', 'extrude auto-reverted to new when leaving body');
  assert.equal(panel.classList.contains('is-cut'), false, 'is-cut class removed from panel');
  assert.equal(operation.classList.contains('is-cut'), false, 'is-cut class removed from operation select');
  assert.equal(hud.classList.contains('is-cut'), false, 'is-cut class removed from HUD');

  // 4. Move back into body -> auto-switches to CUT again
  distance.value = '15';
  controller.update();
  assert.equal(operation.value, 'cut', 'extrude auto-switched back to cut upon re-entering body');

  // Close cleans up
  controller.close();
  assert.equal(panel.classList.contains('is-cut'), false);
  assert.equal(operation.classList.contains('is-cut'), false);
  cad.settings.showMesh = priorShowMesh;
});

test('camera fit and fitToScene computes combined bounds and frames multiple bodies on screen', () => {
  const camera = new cad.Camera();
  const width = 1200;
  const height = 800;

  // 1. When no bodies are present, fit returns default view
  const defaultFit = camera.computeFit([], width, height);
  assert.equal(defaultFit.panX, 0);
  assert.equal(defaultFit.panY, 0);
  assert.equal(defaultFit.zoom, 1);
  assert.deepEqual(defaultFit.pivot, [0, 0, 0]);

  // 2. Multiple bodies spread across space
  const body1 = {
    id: 'body-1',
    mesh: { vertices: [0,0,0, 20,0,0, 20,20,0, 0,20,0, 0,0,20, 20,0,20, 20,20,20, 0,20,20] },
    visible: true,
  };
  const body2 = {
    id: 'body-2',
    mesh: { vertices: [140,60,0, 180,60,0, 180,100,0, 140,100,0, 140,60,30, 180,60,30, 180,100,30, 140,100,30] },
    visible: true,
  };

  const target = camera.computeFit([body1, body2], width, height);
  assert.ok(target.zoom > 0, 'Zoom is a positive number');
  assert.ok(Number.isFinite(target.panX), 'panX is finite');
  assert.ok(Number.isFinite(target.panY), 'panY is finite');

  // Apply fit
  camera.fit([body1, body2], width, height);

  // Project all vertices of both bodies and ensure all fit inside canvas with padding
  const allVerts = [];
  [body1, body2].forEach(b => {
    for (let i = 0; i < b.mesh.vertices.length; i += 3) {
      allVerts.push([b.mesh.vertices[i], b.mesh.vertices[i + 1], b.mesh.vertices[i + 2]]);
    }
  });

  let screenMinX = Infinity, screenMaxX = -Infinity;
  let screenMinY = Infinity, screenMaxY = -Infinity;
  allVerts.forEach(pt => {
    const [sx, sy] = camera.project(pt, width, height);
    if (sx < screenMinX) screenMinX = sx; if (sx > screenMaxX) screenMaxX = sx;
    if (sy < screenMinY) screenMinY = sy; if (sy > screenMaxY) screenMaxY = sy;
  });

  // Verify that all vertices are well within viewport boundaries
  assert.ok(screenMinX >= 50, `minX ${screenMinX} is within canvas width margin`);
  assert.ok(screenMaxX <= width - 50, `maxX ${screenMaxX} is within canvas width margin`);
  assert.ok(screenMinY >= 40, `minY ${screenMinY} is within canvas height margin`);
  assert.ok(screenMaxY <= height - 40, `maxY ${screenMaxY} is within canvas height margin`);

  // Verify centering: midpoint of projected points matches screen center target
  const midX = (screenMinX + screenMaxX) / 2;
  const midY = (screenMinY + screenMaxY) / 2;
  assert.ok(Math.abs(midX - width * 0.5) < 1.0, `Projected midpoint X ${midX} is centered at ${width * 0.5}`);
  assert.ok(Math.abs(midY - height * 0.59) < 1.0, `Projected midpoint Y ${midY} is centered at ${height * 0.59}`);

  // 3. Hidden body should be ignored
  const hiddenBody = {
    id: 'body-hidden',
    mesh: { vertices: [1000, 1000, 1000, 1020, 1000, 1000] },
    visible: false,
  };
  const targetWithHidden = camera.computeFit([body1, body2, hiddenBody], width, height);
  assert.deepEqual(targetWithHidden, target, 'Hidden bodies are excluded from framing computation');
});

test('consecutive fillets can be applied to both caps of a cylinder', async () => {
  const module = await cad.solidKernel.load();
  const count = 64, radius = 15;
  const circlePoints = Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const cyl = {
    id: 'cyl-consec', plane: 'XY', points: circlePoints,
    holes: [], start: 0, end: 25, normal: [0, 0, 1]
  };
  cyl.mesh = cad.solidKernel.meshBody(cyl);

  const initialEdges = cad.bodyRenderer.selectableEdges(cyl);
  const topRim = initialEdges.find(e => e.ring && (e.ring.cap === 25 || e.ring.center3D?.[2] === 25));
  assert.ok(topRim, 'top rim is found initially');

  const afterTop = cad.solidKernel.bevelBody(cyl, topRim, 'fillet', 2);
  assert.ok(afterTop?.mesh, 'top fillet succeeded');

  const afterTopEdges = cad.bodyRenderer.selectableEdges(afterTop);
  const bottomRim = afterTopEdges.find(e => e.ring && (e.ring.cap === 0 || Math.abs(e.ring.center3D?.[2]) < 0.01));
  assert.ok(bottomRim, 'bottom rim is selectable on the filleted body');

  const afterBoth = cad.solidKernel.bevelBody(afterTop, bottomRim, 'fillet', 2);
  assert.ok(afterBoth?.mesh, 'bottom fillet succeeded on the once-filleted body');

  const vol = body => {
    const solid = new module.Manifold(new module.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(body.mesh.vertices),
      triVerts: new Uint32Array(body.mesh.triangles)
    }));
    const v = solid.volume();
    solid.delete();
    return v;
  };

  assert.ok(vol(afterTop) < vol(cyl) - 1, 'top fillet reduced volume');
  assert.ok(vol(afterBoth) < vol(afterTop) - 1, 'second fillet further reduced volume');
});

test('joined eccentric bodies allow filleting circular rims without corrupting geometry', async () => {
  const module = await cad.solidKernel.load();
  const count = 64;
  const circlePoints = (radius, offset = [0, 0]) => Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    return [offset[0] + radius * Math.cos(angle), offset[1] + radius * Math.sin(angle)];
  });

  const cylA = {
    id: 'cylA', plane: 'XY', points: circlePoints(20, [0, 0]),
    holes: [], start: 0, end: 20, normal: [0, 0, 1]
  };
  const cylB = {
    id: 'cylB', plane: 'XY', points: circlePoints(12, [10, 5]),
    holes: [], start: 20, end: 35, normal: [0, 0, 1]
  };
  cylA.mesh = cad.solidKernel.meshBody(cylA);
  cylB.mesh = cad.solidKernel.meshBody(cylB);

  const joined = cad.solidKernel.booleanBody(cylA, [cylB], 'join');
  assert.ok(joined?.mesh, 'eccentric cylinders joined successfully');

  const edges = cad.bodyRenderer.selectableEdges(joined);
  const eccentricTopRim = edges.find(e => e.ring && Math.abs(e.ring.center3D?.[2] - 35) < 0.1);
  assert.ok(eccentricTopRim, 'eccentric top rim found with ring');

  const filletedEccentric = cad.solidKernel.bevelBody(joined, eccentricTopRim, 'fillet', 2);
  assert.ok(filletedEccentric?.mesh, 'eccentric rim filleted successfully');

  const edges2 = cad.bodyRenderer.selectableEdges(filletedEccentric);
  const bottomRim = edges2.find(e => e.ring && Math.abs(e.ring.center3D?.[2]) < 0.1);
  assert.ok(bottomRim, 'bottom rim of base cylinder is selectable on joined body');

  const filletedBoth = cad.solidKernel.bevelBody(filletedEccentric, bottomRim, 'fillet', 2);
  assert.ok(filletedBoth?.mesh, 'base bottom rim filleted successfully on joined body');
});

test('stepped cylinder concave junction is detected as a ring and can be filleted and chamfered', async () => {
  const module = await cad.solidKernel.load();
  const count = 48;
  const rBig = 20, rSmall = 10;
  const bigPoints = Array.from({ length: count }, (_, i) => [rBig * Math.cos(i * Math.PI * 2 / count), rBig * Math.sin(i * Math.PI * 2 / count)]);
  const smallPoints = Array.from({ length: count }, (_, i) => [rSmall * Math.cos(i * Math.PI * 2 / count), rSmall * Math.sin(i * Math.PI * 2 / count)]);

  const b1 = { plane: 'XY', points: bigPoints, holes: [], start: 0, end: 10, normal: [0, 0, 1] };
  const b2 = { plane: 'XY', points: smallPoints, holes: [], start: 10, end: 20, normal: [0, 0, 1] };

  b1.mesh = cad.solidKernel.meshBody(b1);
  b2.mesh = cad.solidKernel.meshBody(b2);

  const joined = cad.solidKernel.booleanBody(b1, [b2], 'join');
  const edges = cad.bodyRenderer.selectableEdges(joined);

  const concaveRing = edges.find(e => e.ring && Math.abs(e.ring.radius - 10) < 0.2 && Math.abs(e.ring.center3D[2] - 10) < 0.2 && !e.convex);
  assert.ok(concaveRing, 'Concave stepped cylinder junction is detected as a selectable ring');

  const volume = body => {
    const solid = new module.Manifold(new module.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(body.mesh.vertices),
      triVerts: new Uint32Array(body.mesh.triangles)
    }));
    const v = solid.volume();
    solid.delete();
    return v;
  };

  const initialVolume = volume(joined);

  const filleted = cad.solidKernel.bevelBody(joined, concaveRing, 'fillet', 2);
  assert.ok(filleted?.mesh, 'Filleting concave ring produces a valid mesh');
  const filletVol = volume(filleted);
  assert.ok(filletVol > initialVolume + 10, 'Filleting concave ring adds material in the corner');

  const chamfered = cad.solidKernel.bevelBody(joined, concaveRing, 'chamfer', 2);
  assert.ok(chamfered?.mesh, 'Chamfering concave ring produces a valid mesh');
  const chamferVol = volume(chamfered);
  assert.ok(chamferVol > initialVolume + 10, 'Chamfering concave ring adds material in the corner');
});
