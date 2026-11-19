import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;
globalThis.document = {
  currentScript: null,
  createElement: () => ({ src: '', onload: null, onerror: null }),
  addEventListener: () => {},
  removeEventListener: () => {},
  head: { append(script) {
    const url = new URL(`../${script.src}`, import.meta.url);
    document.currentScript = { src: url.href };
    import(url.href).then(() => script.onload?.()).catch(error => script.onerror?.(error));
  } },
};

for (const file of [
  'math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js',
  'canvas.js', 'sketch-grid.js', 'sketch-geometry.js', 'sketch-model.js',
  'sketch-profiles.js', 'sketch-render.js', 'model-view.js', 'solid-kernel.js',
  'mesh-rebuild-core.js', 'mesh-feature-fit-core.js', 'mesh-solid-core.js',
  'surface-finish-core.js', 'body-renderer.js', 'body-faces.js',
  'extrude.js', 'body-move.js',
]) {
  runInThisContext(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8'), { filename: file });
}

const cad = window.WebCAD;

test('cad.math.distanceToSegment measures perpendicular, endpoint, and degenerate distances', () => {
  assert.equal(cad.math.distanceToSegment([5, 3], [0, 0], [10, 0]), 3);
  assert.equal(cad.math.distanceToSegment([13, 4], [0, 0], [10, 0]), 5);
  assert.equal(cad.math.distanceToSegment([-3, -4], [0, 0], [10, 0]), 5);
  assert.equal(cad.math.distanceToSegment([3, 4], [0, 0], [0, 0]), 5);
});

test('transformBody preserves import meshSource, clears AABB cache, and returns Float32Array', () => {
  const sourceVerts = new Float32Array([
    0, 0, 0,
    10, 0, 0,
    0, 10, 0,
  ]);
  const body = {
    id: 'stl-1',
    name: 'Imported Mesh',
    meshSource: 'import',
    _aabb: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 0 },
    _aabbMesh: null,
    mesh: { vertices: sourceVerts, triangles: new Uint32Array([0, 1, 2]) },
    renderMesh: { vertices: new Float32Array(sourceVerts), triangles: new Uint32Array([0, 1, 2]) },
  };
  body._aabbMesh = body.mesh;

  const moved = cad.bodyMove.transformBody(body, [5, -2, 3], [0, 0, 90], [0, 0, 0]);
  assert.equal(moved.meshSource, 'import');
  assert.equal(moved._aabb, null);
  assert.equal(moved._aabbMesh, null);
  assert.ok(moved.mesh.vertices instanceof Float32Array);
  assert.ok(moved.renderMesh.vertices instanceof Float32Array);

  // Vertex (10, 0, 0) rotated +90 deg around Z -> (0, 10, 0), then translated +(5, -2, 3) -> (5, 8, 3)
  assert.ok(Math.abs(moved.mesh.vertices[3] - 5) < 1e-5);
  assert.ok(Math.abs(moved.mesh.vertices[4] - 8) < 1e-5);
  assert.ok(Math.abs(moved.mesh.vertices[5] - 3) < 1e-5);
});

test('index.html scripts all use defer and floating dialogs all carry role="dialog"', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scriptTags = [...html.matchAll(/<script\s+[^>]*src="[^"]+"[^>]*>/g)].map(m => m[0]);
  assert.ok(scriptTags.length > 30);
  for (const tag of scriptTags) {
    assert.match(tag, /\bdefer\b/, `Expected defer attribute on script tag: ${tag}`);
  }

  const expectedDialogs = [
    'extrudePanel', 'revolveHud', 'solidBevelPanel', 'solidHolePanel',
    'bodyMovePanel', 'bodyPatternPanel', 'meshToSolidPanel', 'meshFillPanel',
    'meshDecimatePanel', 'surfaceFinishPanel', 'interferencePanel',
    'zebraAnalysisPanel', 'patternPalette', 'mirrorPalette',
  ];
  for (const id of expectedDialogs) {
    assert.match(html, new RegExp(`id="${id}"[^>]*role="dialog"`), `Missing role="dialog" on #${id}`);
  }
});

test('every querySelector("#...") target in js/tool-search.js exists in index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const searchSrc = readFileSync(new URL('../js/tool-search.js', import.meta.url), 'utf8');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const queriedIds = [...searchSrc.matchAll(/querySelector\(\s*['"]#([a-zA-Z0-9_-]+)['"]\s*\)/g)]
    .map(m => m[1])
    .filter(id => !['toolSearchPopup', 'toolSearchInput', 'toolSearchDropdown', 'toolSearchClose'].includes(id));

  assert.ok(queriedIds.length >= 25);
  for (const id of queriedIds) {
    assert.ok(htmlIds.has(id), `Broken selector #${id} in js/tool-search.js`);
  }
});

test('BodyRenderer.mesh() invalidates stale finishCache when surfaceFinishAngle changes', () => {
  const renderer = cad.bodyRenderer;
  const body = {
    id: 'finish-test',
    meshSource: 'import',
    surfaceFinishAngle: 42,
    mesh: {
      vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
      triangles: new Uint32Array([0, 1, 2]),
    },
  };
  const fakeFinish = {
    cornerNormals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    featurePairs: new Uint32Array([0, 1]),
  };
  renderer.finishCache.set(body, { mesh: body.mesh, angle: 42, result: fakeFinish });

  const smoothPrepared = renderer.mesh(body, true);
  assert.equal(smoothPrepared.featurePairs, fakeFinish.featurePairs);

  // Change angle to 0 (Off) -> stale finishCache must be cleared & ignored
  body.surfaceFinishAngle = 0;
  renderer.releaseBody(body);
  const rawPrepared = renderer.mesh(body, true);
  assert.equal(renderer.finishCache.has(body), false);
  assert.equal(rawPrepared.featurePairs, undefined);
});

test('ModelView.render() draws origin plane tiles (XY/XZ/YZ) and origin point O on top of 3D bodies', () => {
  const events = [];
  const makeContext = () => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {},
    save() {}, restore() {}, setLineDash() {}, transform() {}, fillText() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() { events.push({ type: 'originDot' }); },
    fill() {}, stroke() {},
  });
  const canvas = {
    width: 800, height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: makeContext,
    addEventListener() {},
    classList: { toggle() {}, add() {}, remove() {} },
  };
  const gridCanvas = {
    width: 0, height: 0,
    getContext: makeContext,
  };
  const prevCreateElement = document.createElement;
  document.createElement = () => gridCanvas;
  try {
    const view = Object.create(cad.ModelView.prototype);
    view.canvas = canvas;
    view.pane = { classList: { toggle() {}, add() {}, remove() {} } };
    view.camera = new cad.Camera();
    view.picking = true;
    view.hoveredPlane = 'XZ';
    view.gridPlane = 'XY';
    view.grid = { u: [1, 0, 0], v: [0, 1, 0], colors: ['#e54444', '#38a169', '#2b6cb0'] };
    view.gridMotion = null;
    view.gridCacheCanvas = gridCanvas;
    view.gridCacheKey = null;
    view.hitAreas = [];
    view.visibility = { origin: true, O: true, X: true, Y: true, Z: true, XY: false, XZ: false, YZ: false };
    view.onDrawOverlay = () => { events.push({ type: 'overlay' }); };

    const origDrawTile = view.drawTile.bind(view);
    view.drawTile = (context, project, name, size) => {
      events.push({ type: 'tile', name });
      return origDrawTile(context, project, name, size);
    };

    view.render();

    const overlayIdx = events.findIndex(e => e.type === 'overlay');
    const tileIndices = events.map((e, i) => e.type === 'tile' ? i : -1).filter(i => i >= 0);
    const tileNames = events.filter(e => e.type === 'tile').map(e => e.name);
    const originIdx = events.findIndex(e => e.type === 'originDot');

    assert.ok(overlayIdx >= 0, 'overlay was drawn');
    assert.equal(tileIndices.length, 3, 'all 3 origin tiles were drawn');
    assert.ok(tileIndices.every(i => i > overlayIdx), 'origin tiles draw after 3D body overlay');
    assert.equal(tileNames[tileNames.length - 1], 'XZ', 'hovered tile renders last on top of other tiles');
    assert.ok(originIdx > Math.max(...tileIndices), 'origin dot O draws after origin tiles');
  } finally {
    document.createElement = prevCreateElement;
  }
});

test('ModelView.planeAt() prioritizes visible origin tiles over overlapping body faces', () => {
  const view = Object.create(cad.ModelView.prototype);
  view.canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) };
  view.camera = new cad.Camera();
  view.visibility = { origin: true, XY: false, XZ: false, YZ: false };
  view.hitAreas = [
    { name: 'XZ', visible: [[100, 100], [160, 100], [160, 160], [100, 160]] },
    { name: 'XY', visible: [[110, 110], [180, 110], [180, 180], [110, 180]] },
  ];
  const mockFace = { id: 'body-1:face-0' };
  view.getFaceAt = () => mockFace;

  // Inside overlapping region covered by both body face and XY tile -> tile wins
  assert.equal(view.planeAt(10 + 140, 20 + 140), 'XY');
  // Outside any origin tile -> falls through to exposed body face
  assert.equal(view.planeAt(10 + 300, 20 + 300), mockFace);
});

function makeCylinderBody(id = 'cyl-1', radius = 30, height = 40) {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  doc.insertSketch(sketch);
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [0, 0], radius }));
  const profile = cad.sketchProfiles.fromSketch(sketch)[0];
  const body = { ...cad.extrude.makeBody(profile, 'one', height), id };
  body.mesh = cad.solidKernel.meshBody(body);
  return body;
}

function isEdgeSmooth(normals) {
  if (!normals || normals.length < 2) return false;
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      if (cad.math.dot(normals[i], normals[j]) < 0.965) return false;
    }
  }
  return true;
}

test('Cylinder circular-rim fillet and chamfer have zero bogus seam/vertical feature edges', async () => {
  await cad.solidKernel.load();
  const cyl = makeCylinderBody('cyl-bevel', 30, 40);
  const topRim = cad.bodyRenderer.selectableEdges(cyl)
    .find(e => e.ring && Math.abs((e.ring.center3D?.[2] ?? e.ring.cap) - 40) < 0.1);
  assert.ok(topRim, 'top circular rim detected');

  const rotCyl = cad.bodyMove.transformBody(cyl, [5, -3, 2], [23, 17, 41]);
  const rotRim = cad.bodyRenderer.selectableEdges(rotCyl).find(e => e.ring);
  assert.ok(rotRim, 'rotated cylinder circular rim detected');

  for (const [label, sourceBody, rim, axis, amount] of [
    ['axis-aligned fillet', cyl, topRim, [0, 0, 1], 11.663],
    ['axis-aligned chamfer', cyl, topRim, [0, 0, 1], 11.663],
    ['rotated fillet', rotCyl, rotRim, rotRim.ring.normal3D, 8],
    ['rotated chamfer', rotCyl, rotRim, rotRim.ring.normal3D, 8],
  ]) {
    const mode = label.includes('fillet') ? 'fillet' : 'chamfer';
    const result = cad.solidKernel.bevelBody(sourceBody, rim, mode, amount);
    assert.ok(result?.mesh, `${label} produces valid mesh`);
    const prepared = cad.bodyRenderer.mesh(result);
    let nonTwo = 0;
    let verticalDrawn = 0;
    let totalDrawn = 0;
    for (const edge of prepared.edges) {
      if (edge.normals.length !== 2) nonTwo++;
      if (!isEdgeSmooth(edge.normals)) {
        totalDrawn++;
        const a = prepared.points[edge.from];
        const b = prepared.points[edge.to];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const axial = Math.abs(dx * axis[0] + dy * axis[1] + dz * axis[2]);
        if (axial > 1) verticalDrawn++;
      }
    }
    assert.equal(nonTwo, 0, `${label}: zero edges with normals.length !== 2`);
    assert.equal(verticalDrawn, 0, `${label}: zero spurious vertical/slanted drawn feature edges`);
    if (label === 'axis-aligned fillet') {
      assert.equal(totalDrawn, 122, 'axis-aligned fillet draws only the bottom circular rim');
    }
    assert.ok(cad.bodyRenderer.selectableEdges(result).some(e => e.ring),
      `${label}: circular rim remains selectable on beveled body`);
  }
});

test('bodyFaces.patches() keeps only genuine planar faces and excludes curved tessellations', async () => {
  const mod = await cad.solidKernel.load();

  // 1. Plain & beveled cylinders (axis-aligned, thin coin, heavy fillet, chamfer, rotated) -> 2 flat caps
  const cyl = makeCylinderBody('cyl-patches', 30, 40);
  const topRim = cad.bodyRenderer.selectableEdges(cyl)
    .find(e => e.ring && Math.abs((e.ring.center3D?.[2] ?? e.ring.cap) - 40) < 0.1);
  const coin = makeCylinderBody('cyl-coin', 30, 0.5);
  const filleted = cad.solidKernel.bevelBody(cyl, topRim, 'fillet', 11.663);
  const heavyFillet = cad.solidKernel.bevelBody(cyl, topRim, 'fillet', 25);
  const chamfered = cad.solidKernel.bevelBody(cyl, topRim, 'chamfer', 11.663);
  const rotCyl = cad.bodyMove.transformBody(cyl, [5, -3, 2], [23, 17, 41]);
  const rotRim = cad.bodyRenderer.selectableEdges(rotCyl).find(e => e.ring);
  const rotFilleted = cad.solidKernel.bevelBody(rotCyl, rotRim, 'fillet', 8);

  for (const [label, body] of [
    ['cylinder', cyl],
    ['thin coin cylinder', coin],
    ['filleted cylinder (R=11.663)', filleted],
    ['heavy filleted cylinder (R=25)', heavyFillet],
    ['chamfered cylinder (D=11.663)', chamfered],
    ['rotated cylinder', rotCyl],
    ['rotated filleted cylinder', rotFilleted],
  ]) {
    assert.equal(cad.bodyFaces.patches(body).length, 2, `${label} exposes only top & bottom flat caps`);
  }

  // 2. Revolved sphere -> 0 planar faces
  const halfCircle = Array.from({ length: 33 }, (_, i) => {
    const a = -Math.PI / 2 + Math.PI * i / 32;
    return [Math.max(0, 20 * Math.cos(a)), 20 * Math.sin(a)];
  });
  const sphSec = new mod.CrossSection([halfCircle], 'EvenOdd');
  const sphMan = sphSec.revolve(48);
  const sphMesh = sphMan.getMesh();
  const sphere = { id: 'sphere-1', mesh: { vertices: Array.from(sphMesh.vertProperties), triangles: Array.from(sphMesh.triVerts) } };
  assert.equal(cad.bodyFaces.patches(sphere).length, 0, 'sphere has zero planar faces');
  sphMan.delete(); sphSec.delete();

  // 3. Plain box, 1-edge filleted box, box with circular hole -> all 6 planar faces
  const box = { id: 'box-1', plane: 'XY', points: [[0, 0], [20, 0], [20, 20], [0, 20]], holes: [], start: 0, end: 20, normal: [0, 0, 1] };
  box.mesh = cad.solidKernel.meshBody(box);
  const filletedBox = cad.solidKernel.bevelBody(box, cad.bodyRenderer.selectableEdges(box)[0], 'fillet', 5);
  const boxWithHole = {
    id: 'box-hole', plane: 'XY', points: [[0, 0], [40, 0], [40, 40], [0, 40]],
    holes: [Array.from({ length: 64 }, (_, i) => [20 + 6 * Math.cos(i * 2 * Math.PI / 64), 20 + 6 * Math.sin(i * 2 * Math.PI / 64)])],
    start: 0, end: 20, normal: [0, 0, 1],
  };
  boxWithHole.mesh = cad.solidKernel.meshBody(boxWithHole);
  assert.equal(cad.bodyFaces.patches(box).length, 6);
  assert.equal(cad.bodyFaces.patches(filletedBox).length, 6);
  assert.equal(cad.bodyFaces.patches(boxWithHole).length, 6);

  // 4. Polygonal prisms (6-gon, 8-gon) and 10-deg bent pentagon prism keep all flat walls
  for (const sides of [6, 8]) {
    const pts = Array.from({ length: sides }, (_, i) => [20 * Math.cos(i * 2 * Math.PI / sides), 20 * Math.sin(i * 2 * Math.PI / sides)]);
    const prism = { id: `prism-${sides}`, plane: 'XY', points: pts, holes: [], start: 0, end: 20, normal: [0, 0, 1] };
    prism.mesh = cad.solidKernel.meshBody(prism);
    assert.equal(cad.bodyFaces.patches(prism).length, sides + 2, `${sides}-gon prism keeps all flat faces`);
  }
  const bentPts = [[0, 0], [30, 0], [30, 20], [15, 20 + 15 * Math.tan(10 * Math.PI / 180)], [0, 20]];
  const bentPrism = { id: 'bent-5', plane: 'XY', points: bentPts, holes: [], start: 0, end: 20, normal: [0, 0, 1] };
  bentPrism.mesh = cad.solidKernel.meshBody(bentPrism);
  assert.equal(cad.bodyFaces.patches(bentPrism).length, 7, '10-deg bent pentagon prism keeps all 7 flat faces');

  // 5. Stepped cylinder with concave fillet keeps all 3 horizontal flat caps
  const cylBig = makeCylinderBody('step-big', 20, 10);
  const cylSmall = {
    id: 'step-small', plane: 'XY',
    points: Array.from({ length: 48 }, (_, i) => [10 * Math.cos(i * 2 * Math.PI / 48), 10 * Math.sin(i * 2 * Math.PI / 48)]),
    holes: [], start: 10, end: 20, normal: [0, 0, 1],
  };
  cylSmall.mesh = cad.solidKernel.meshBody(cylSmall);
  const stepped = cad.solidKernel.booleanBody(cylBig, [cylSmall], 'join');
  const concaveRing = cad.bodyRenderer.selectableEdges(stepped)
    .find(e => e.ring && Math.abs(e.ring.radius - 10) < 0.2 && !e.convex);
  const concFillet = cad.solidKernel.bevelBody(stepped, concaveRing, 'fillet', 2);
  assert.equal(cad.bodyFaces.patches(concFillet).length, 3, 'concave filleted stepped cylinder keeps 3 flat caps');
});

test('BodyFaceSelection & ModelView block curved cylinder wall sketching/occlusion while preserving body pick', async () => {
  await cad.solidKernel.load();
  const cyl = makeCylinderBody('cyl-sel', 30, 40);
  // Put a planar box behind the cylinder in camera depth to test occlusion through curved wall
  const camera = new cad.Camera();
  camera.selectView('isometric');
  const D = camera.depth;
  const dXY = Math.hypot(D[0], D[1]) || 1;
  const wallWorld = [30 * D[0] / dXY, 30 * D[1] / dXY, 20];
  const backOffset = [-60 * D[0], -60 * D[1], 0];
  const backBox = {
    id: 'back-box', plane: 'XY',
    points: [[backOffset[0] - 40, backOffset[1] - 40], [backOffset[0] + 40, backOffset[1] - 40],
      [backOffset[0] + 40, backOffset[1] + 40], [backOffset[0] - 40, backOffset[1] + 40]],
    holes: [], start: 0, end: 40, normal: [0, 0, 1], visible: true,
  };
  backBox.mesh = cad.solidKernel.meshBody(backBox);
  cyl.visible = true;

  const width = 800, height = 600;
  const selection = new cad.BodyFaceSelection({
    canvas: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
    },
    camera,
    extrudeController: { bodies: [cyl, backBox] },
    isAvailable: () => true,
    onChange() {},
  });

  const topPt = camera.project([0, 0, 40], width, height);
  const wallPt = camera.project(wallWorld, width, height);

  assert.equal(selection.faceAt({ clientX: topPt[0], clientY: topPt[1] })?.body, cyl,
    'flat cylinder top cap is selectable for sketch');
  assert.equal(selection.faceAt({ clientX: wallPt[0], clientY: wallPt[1] }, false), null,
    'curved cylinder side wall never picks as a planar face or through to occluded box');
  assert.equal(selection.faceAt({ clientX: wallPt[0], clientY: wallPt[1] }, true), null,
    'clicking curved cylinder side wall does not select a facet strip');
  assert.equal(selection.bodyAt({ clientX: wallPt[0], clientY: wallPt[1] }), cyl,
    'clicking/double-clicking curved cylinder side wall still selects the cylinder body');

  // ModelView.planeAt blocks sketching through a non-planar curved body onto background origin planes
  const view = Object.create(cad.ModelView.prototype);
  view.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) };
  view.camera = camera;
  view.visibility = { origin: true, XY: true, XZ: true, YZ: true };
  view.hitAreas = [];
  view.getFaceAt = (x, y) => selection.faceAt({ clientX: x, clientY: y });
  view.getBodyAt = (x, y) => selection.bodyAt({ clientX: x, clientY: y });

  assert.equal(view.planeAt(topPt[0], topPt[1])?.body, cyl, 'planeAt picks flat cylinder cap');
  assert.equal(view.planeAt(wallPt[0], wallPt[1]), null, 'planeAt refuses curved cylinder side wall outside origin tiles');
  const emptyPt = camera.project([200, 200, 0], width, height);
  assert.ok(typeof view.planeAt(emptyPt[0], emptyPt[1]) === 'string', 'planeAt still picks background origin plane in empty canvas space');
});
