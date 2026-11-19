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
  head: { append() {} },
};

for (const file of [
  'math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js',
  'canvas.js', 'sketch-grid.js', 'model-view.js',
  'surface-finish-core.js', 'body-renderer.js', 'body-move.js',
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
