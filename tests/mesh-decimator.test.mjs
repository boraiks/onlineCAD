import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;
globalThis.document = {
  currentScript: null,
  createElement: () => ({ src: '', onload: null, onerror: null }),
  head: { append() {} },
  body: { append() {} },
};

for (const file of [
  'math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js',
  'sketch-grid.js', 'sketch-geometry.js', 'sketch-model.js', 'canvas.js',
  'sketch-profiles.js', 'sketch-render.js', 'body-faces.js', 'project-io.js',
  'surface-finish-core.js', 'body-renderer.js', 'mesh-decimator.js', 'importers.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

// Helper to generate a dense synthetic sphere / cylinder mesh
function generateDenseSphere(latBands = 30, longBands = 30, radius = 50) {
  const vertices = [];
  const triangles = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= longBands; lon++) {
      const phi = (lon * 2 * Math.PI) / longBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = cosPhi * sinTheta * radius;
      const y = cosTheta * radius;
      const z = sinPhi * sinTheta * radius;
      vertices.push(x, y, z);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < longBands; lon++) {
      const first = lat * (longBands + 1) + lon;
      const second = first + longBands + 1;

      triangles.push(first, second, first + 1);
      triangles.push(second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    triangles: new Uint32Array(triangles),
    triangleCount: Math.floor(triangles.length / 3),
    vertexCount: Math.floor(vertices.length / 3),
  };
}

test('meshDecimator is registered in WebCAD namespace', () => {
  assert.ok(cad.meshDecimator, 'cad.meshDecimator exists');
  assert.equal(typeof cad.meshDecimator.decimateGridClustering, 'function');
  assert.equal(typeof cad.meshDecimator.decimateMesh, 'function');
  assert.equal(typeof cad.meshDecimator.MeshDecimatorController, 'function');
});

test('renderer releases GPU buffers when a display mesh is replaced', () => {
  const renderer = cad.bodyRenderer;
  const oldGl = renderer.gl;
  const deleted = [];
  const body = { id: 'test-body' };
  renderer.gl = { deleteBuffer: buffer => deleted.push(buffer) };
  renderer.vboCache.set(body, { buffer: 'triangles' });
  renderer.meshCache.set(body, { lineVbo: { buffer: 'edges' } });
  renderer.residentBodies.add(body);
  renderer.releaseBody(body);
  assert.deepEqual(deleted, ['triangles', 'edges']);
  assert.equal(renderer.residentBodies.has(body), false);
  assert.equal(renderer.vboCache.has(body), false);
  renderer.gl = oldGl;
});

test('renderer prepares the display mesh without replacing source geometry', () => {
  const body = {
    id: 'display-only', meshSource: 'import',
    mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], triangles: [0, 1, 2, 0, 2, 3] },
    renderMesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] },
  };
  assert.equal(cad.bodyRenderer.mesh(body).triVertexCount, 3);
  assert.equal(body.mesh.triangles.length / 3, 2);
  cad.bodyRenderer.releaseBody(body);
});

test('GPU body projection matches grid and selection projection with a camera pivot', () => {
  const camera = new cad.Camera();
  camera.pan(37, -19);
  camera.zoom = 1.65;
  camera.pivot = [8, -4, 12];
  const originalPivot = cad.settings.cameraPivot;
  try {
    for (const usePivot of [false, true]) {
      cad.settings.cameraPivot = usePivot;
      for (const view of ['top', 'front', 'right']) {
        camera.selectView(view);
        const matrix = cad.bodyRenderer.projectionMatrix(camera, 1217, 713, -100, 100);
        for (const point of [[0, 0, 0], [17.5, -8, 3], [-100, 90, -45]]) {
          const x = (matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12] + 1) * 1217 / 2;
          const y = (1 - matrix[1] * point[0] - matrix[5] * point[1] - matrix[9] * point[2] - matrix[13]) * 713 / 2;
          const expected = camera.project(point, 1217, 713);
          assert.ok(Math.abs(x - expected[0]) < 0.001, `GPU X mismatch in ${view}`);
          assert.ok(Math.abs(y - expected[1]) < 0.001, `GPU Y mismatch in ${view}`);
        }
      }
    }
  } finally {
    cad.settings.cameraPivot = originalPivot;
  }
});

test('Show Mesh draws unique edges of a dense imported display mesh', () => {
  const renderer = cad.bodyRenderer;
  const prior = { gl: renderer.gl, canvas: renderer.canvas, lastKey: renderer.lastKey,
    showMesh: cad.settings.showMesh, displayStyle: cad.settings.displayStyle };
  const draws = [];
  const deleted = [];
  const gl = new Proxy({ createBuffer: () => ({}), deleteBuffer: buffer => deleted.push(buffer),
    drawArrays: (mode, first, count) => draws.push([mode, count]) }, {
    get(target, name) { return target[name] ?? (() => {}); }
  });
  gl.TRIANGLES = 'triangles';
  gl.LINES = 'lines';
  const triangles = new Uint32Array(8001 * 3);
  for (let i = 0; i < triangles.length; i += 3) triangles.set([0, 1, 2], i);
  const body = { id: 'dense-wireframe', meshSource: 'import',
    mesh: { vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), triangles } };
  try {
    renderer.gl = gl;
    renderer.canvas = { width: 800, height: 600 };
    renderer.lastKey = null;
    cad.settings.showMesh = true;
    cad.settings.displayStyle = 'shaded';
    const context = { canvas: { width: 800, height: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }) }, drawImage() {} };
    assert.equal(renderer.render(context, null, new cad.Camera(), [body]), true);
    assert.equal(renderer.mesh(body).lineVbo.count, 6, 'three unique triangle edges produce six line vertices');
    assert.ok(draws.some(([mode, count]) => mode === 'lines' && count === 6));
    draws.length = 0;
    cad.settings.showMesh = false;
    assert.equal(renderer.render(context, null, new cad.Camera(), [body]), true);
    assert.equal(renderer.mesh(body).lineVbo, null, 'hidden dense wireframe frees its GPU buffer');
    assert.equal(deleted.length, 1);
    assert.ok(!draws.some(([mode]) => mode === 'lines'));
  } finally {
    renderer.releaseBody(body);
    renderer.gl = prior.gl;
    renderer.canvas = prior.canvas;
    renderer.lastKey = prior.lastKey;
    cad.settings.showMesh = prior.showMesh;
    cad.settings.displayStyle = prior.displayStyle;
  }
});

test('CAD finish renders only sharp cube edges until Show Mesh is requested', () => {
  const renderer = cad.bodyRenderer;
  const prior = { gl: renderer.gl, canvas: renderer.canvas, lastKey: renderer.lastKey,
    showMesh: cad.settings.showMesh, displayStyle: cad.settings.displayStyle };
  const gl = new Proxy({ createBuffer: () => ({}), deleteBuffer() {}, drawArrays() {} }, {
    get(target, name) { return target[name] ?? (() => {}); }
  });
  gl.TRIANGLES = 'triangles';
  gl.LINES = 'lines';
  const body = { id: 'finished-cube', meshSource: 'solid', surfaceFinishAngle: 42,
    mesh: { vertices: new Float32Array([
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
    ]), triangles: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]) } };
  try {
    renderer.gl = gl;
    renderer.canvas = { width: 800, height: 600 };
    renderer.lastKey = null;
    cad.settings.showMesh = false;
    cad.settings.displayStyle = 'shaded-edges';
    const context = { canvas: { width: 800, height: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }) }, drawImage() {} };
    renderer.render(context, null, new cad.Camera(), [body]);
    assert.equal(renderer.mesh(body).lineVbo.count, 24, 'twelve sharp edges are drawn');
    cad.settings.showMesh = true;
    renderer.render(context, null, new cad.Camera(), [body]);
    assert.equal(renderer.mesh(body).lineVbo.count, 36, 'all eighteen triangle edges are drawn');
  } finally {
    renderer.releaseBody(body);
    renderer.gl = prior.gl;
    renderer.canvas = prior.canvas;
    renderer.lastKey = prior.lastKey;
    cad.settings.showMesh = prior.showMesh;
    cad.settings.displayStyle = prior.displayStyle;
  }
});

test('selection bounds follow a changed source mesh', () => {
  const selection = Object.create(cad.BodyFaceSelection.prototype);
  selection.camera = { project: point => [point[0], point[1]] };
  const body = { mesh: { vertices: [0, 0, 0, 1, 1, 1] } };
  assert.equal(selection.screenBounds(body, 100, 100).minX, 0);
  body.mesh = { vertices: [10, 0, 0, 11, 1, 1] };
  assert.equal(selection.screenBounds(body, 100, 100).minX, 10);
});

test('selection cage follows the visible display mesh and ignores stale source bounds', () => {
  const selection = Object.create(cad.BodyFaceSelection.prototype);
  selection.camera = { project: point => [point[0], point[2]] };
  const sourceVertices = new Float32Array(8001 * 3);
  sourceVertices.set([100, 100, 100], 3);
  const body = {
    meshSource: 'import',
    mesh: { vertices: sourceVertices, triangles: [0, 1, 2],
      bounds: { minX: -500, maxX: -400, minY: -500, maxY: -400, minZ: -500, maxZ: -400 } },
    renderMesh: { vertices: [20, 0, 30, 40, 0, 50] },
  };
  assert.deepEqual(selection.screenBounds(body, 100, 100),
    { minX: 20, maxX: 40, minY: 30, maxY: 50 });
  const points = [];
  const context = { save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo(...point) { points.push(point); }, lineTo() {}, stroke() {},
    setLineDash() {}, arc() {}, fill() {} };
  cad.bodyFaces.renderBodyHighlight(context, point => [point[0], point[2]], body);
  assert.ok(points.some(([x, y]) => x === 20 && y === 30));
  assert.ok(points.every(([x, y]) => x >= 20 && x <= 40 && y >= 30 && y <= 50));
});

test('an imported mesh selects as a body until conversion enables face selection', () => {
  const vertices = new Float32Array([
    -5, -5, 0, 5, -5, 0, 5, 5, 0, -5, 5, 0,
    -5, -5, 10, 5, -5, 10, 5, 5, 10, -5, 5, 10,
  ]);
  const triangles = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);
  const body = { id: 'mesh-body', visible: true, meshSource: 'import',
    mesh: { vertices, triangles } };
  const camera = new cad.Camera();
  camera.selectView('top');
  const selection = Object.create(cad.BodyFaceSelection.prototype);
  selection.camera = camera;
  selection.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  selection.extrudeController = { bodies: [body] };
  const [clientX, clientY] = camera.project([0, 0, 10], 800, 600);
  const event = { clientX, clientY };
  assert.equal(selection.faceAt(event, true), null);
  assert.equal(selection.bodyAt(event), body);
  body.meshSource = 'solid';
  assert.equal(selection.faceAt(event, true)?.body, body);
});

test('converted solid face picking uses exact geometry behind a display preview', () => {
  const camera = new cad.Camera();
  camera.selectView('top');
  const source = { vertices: new Float32Array([-5, -5, 10, 5, -5, 10, 0, 5, 10]),
    triangles: Uint32Array.from(Array.from({ length: 2001 }, () => [0, 1, 2]).flat()) };
  const body = { id: 'solid-preview', meshSource: 'solid', visible: true, mesh: source,
    renderMesh: { vertices: new Float32Array([-5, -5, 0, 5, -5, 0, 0, 5, 0]),
      triangles: new Uint32Array([0, 1, 2]) } };
  const selection = Object.create(cad.BodyFaceSelection.prototype);
  selection.camera = camera;
  selection.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  selection.extrudeController = { bodies: [body] };
  const [clientX, clientY] = camera.project([0, 0, 10], 800, 600);
  assert.equal(selection.faceAt({ clientX, clientY }, true).origin[2], 10);
});

test('a dense converted planar mesh selects its whole coplanar face on click', () => {
  const size = 66;
  const vertices = [];
  const triangles = [];
  for (let y = 0; y <= size; y++) for (let x = 0; x <= size; x++)
    vertices.push(x - size / 2, y - size / 2, 10);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = y * (size + 1) + x, b = a + 1, c = a + size + 1, d = c + 1;
    triangles.push(a, b, d, a, d, c);
  }
  const body = { id: 'dense-plane', meshSource: 'solid', visible: true,
    mesh: { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles) } };
  const camera = new cad.Camera();
  camera.selectView('top');
  const selection = Object.create(cad.BodyFaceSelection.prototype);
  selection.camera = camera;
  selection.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) };
  selection.extrudeController = { bodies: [body] };
  const [clientX, clientY] = camera.project([0.25, 0.25, 10], 1000, 800);
  const face = selection.faceAt({ clientX, clientY }, true);
  assert.equal(face?.body, body);
  assert.equal(face?.isFacet, false);
  assert.equal(face.triangles.length, size * size * 2);
  assert.equal(face.points.length, 4, 'collinear grid edges reduce to four sketch corners');
  const hit = cad.bodyFaces.hitPointAt([clientX, clientY], [body], camera,
    { width: 1000, height: 800 }, true);
  assert.equal(hit?.face, face, 'Hole and Extrude can pick the same dense face');
  assert.ok(Math.abs(hit.point[2] - 10) < 1e-6);
});

test('decimateGridClustering reduces high-poly mesh triangles significantly', () => {
  const denseMesh = generateDenseSphere(40, 40, 100);
  const origTris = denseMesh.triangleCount;
  assert.ok(origTris > 3000, `Expected > 3000 triangles, got ${origTris}`);

  // Decimate with 75% target reduction
  const result75 = cad.meshDecimator.decimateGridClustering(denseMesh, { ratio: 0.75 });
  assert.ok(result75.decimatedTriangles < origTris, 'Reduced triangle count');
  assert.ok(result75.decimatedTriangles < origTris * 0.45, `Expected substantial reduction, got ${result75.decimatedTriangles}`);
  assert.ok(result75.decimatedTriangles > 20, 'Retained valid simplified geometry');
  assert.equal(result75.originalTriangles, origTris);
  assert.ok(result75.reductionRatio > 0.5, 'Reduction ratio recorded');
  assert.ok(Math.abs(result75.decimatedTriangles - origTris * 0.25) < origTris * 0.06,
    'Actual triangle count stays near the selected display target');

  // Decimate with 90% target reduction
  const result90 = cad.meshDecimator.decimateGridClustering(denseMesh, { ratio: 0.90 });
  assert.ok(result90.decimatedTriangles < result75.decimatedTriangles, '90% reduction has fewer triangles than 75%');
});

test('decimateGridClustering preserves bounding box dimensions', () => {
  const denseMesh = generateDenseSphere(30, 30, 80);
  const result = cad.meshDecimator.decimateGridClustering(denseMesh, { ratio: 0.70 });

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < result.vertices.length; i += 3) {
    const x = result.vertices[i], y = result.vertices[i + 1], z = result.vertices[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Radius is 80, so bounds should span roughly [-80, 80]
  assert.ok(Math.abs(maxX - 80) < 15, `maxX ${maxX} close to 80`);
  assert.ok(Math.abs(minX - (-80)) < 15, `minX ${minX} close to -80`);
  assert.ok(Math.abs(maxY - 80) < 15, `maxY ${maxY} close to 80`);
  assert.ok(Math.abs(minY - (-80)) < 15, `minY ${minY} close to -80`);
});

test('decimateGridClustering handles minimal or empty meshes without crashing', () => {
  const minimal = {
    vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
    triangles: new Uint32Array([0, 1, 2]),
  };
  const result = cad.meshDecimator.decimateGridClustering(minimal, { ratio: 0.5 });
  assert.equal(result.decimatedTriangles, 1);
  assert.equal(result.originalTriangles, 1);
});

test('zero display reduction restores every original triangle', () => {
  const source = generateDenseSphere(24, 24, 20);
  const full = cad.meshDecimator.decimateGridClustering(source, { ratio: 0 });
  assert.equal(full.decimatedTriangles, source.triangleCount);
  assert.deepEqual(Array.from(full.triangles), Array.from(source.triangles));
});

test('decimateMesh wrapper executes asynchronously with fallback', async () => {
  const denseMesh = generateDenseSphere(25, 25, 50);
  const result = await cad.meshDecimator.decimateMesh(denseMesh, { ratio: 0.60, method: 'grid' });
  assert.ok(result.decimatedTriangles < denseMesh.triangleCount);
  assert.ok(result.vertices instanceof Float32Array);
  assert.ok(result.triangles instanceof Uint32Array);
});

test('MeshDecimatorController opens, generates preview and commits to history', async () => {
  const denseMesh = generateDenseSphere(30, 30, 50);
  const body = {
    id: 1,
    name: 'Imported Body 1',
    mesh: denseMesh,
    visible: true,
  };

  // Mock DOM Panel
  const mockPanel = {
    hidden: true,
    querySelector: (sel) => {
      const el = { textContent: '', value: '75', disabled: false, addEventListener() {}, setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} } };
      return el;
    },
    querySelectorAll: () => [],
  };

  const historyActions = [];
  const mockHistory = {
    execute(action) {
      historyActions.push(action);
      action.execute();
    },
  };

  const mockExtrudeController = {
    bodies: [body],
  };

  let redrawCalled = false;
  let bodiesChangeCalled = false;

  const controller = new cad.meshDecimator.MeshDecimatorController({
    canvas: {},
    panel: mockPanel,
    extrudeController: mockExtrudeController,
    history: mockHistory,
    onChange: () => { redrawCalled = true; },
    onBodiesChange: () => { bodiesChangeCalled = true; },
  });

  // Open controller
  const opened = await controller.open(body);
  assert.equal(opened, true);
  assert.equal(controller.active, true);
  assert.equal(mockPanel.hidden, false);
  assert.ok(controller.previewMesh, 'Preview mesh generated');
  assert.ok(controller.displayBodies().length === 1);
  assert.equal(controller.displayBodies()[0].isDecimatePreview, true);

  // Commit
  const committed = controller.commit();
  assert.equal(committed, true);
  assert.equal(controller.active, false);
  assert.equal(mockPanel.hidden, true);
  assert.equal(historyActions.length, 1);

  // Only the display mesh changes; CAD and STL export keep the source mesh.
  const newTris = Math.floor(body.renderMesh.triangles.length / 3);
  assert.ok(newTris < denseMesh.triangleCount, 'Display mesh triangle count reduced');
  assert.equal(body.mesh, denseMesh, 'Original mesh is unchanged');

  // Test Undo
  historyActions[0].undo();
  assert.equal(body.renderMesh, null, 'Undo restored full display detail');
  assert.equal(body.mesh, denseMesh);

  // Test Redo
  historyActions[0].redo();
  assert.equal(body.renderMesh.triangles.length, newTris * 3, 'Redo reapplied display mesh');
  assert.equal(body.mesh, denseMesh);
});

test('importers.importFile invokes onHighPoly when triangle count exceeds 25,000', async () => {
  // Construct a binary STL buffer with 26,000 triangles
  const triCount = 26000;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);

  // Fill non-degenerate triangles distributed in a 2D grid
  for (let t = 0; t < triCount; t++) {
    const offset = 84 + t * 50;
    const gx = (t % 160) * 10;
    const gy = Math.floor(t / 160) * 10;
    // V1
    view.setFloat32(offset + 12, gx, true);
    view.setFloat32(offset + 16, gy, true);
    view.setFloat32(offset + 20, 0, true);
    // V2
    view.setFloat32(offset + 24, gx + 8, true);
    view.setFloat32(offset + 28, gy, true);
    view.setFloat32(offset + 32, 0, true);
    // V3
    view.setFloat32(offset + 36, gx, true);
    view.setFloat32(offset + 40, gy + 8, true);
    view.setFloat32(offset + 44, 0, true);
  }

  // Mock File and FileReader for Node environment
  globalThis.FileReader = class {
    readAsArrayBuffer() {
      setTimeout(() => {
        this.onload({ target: { result: buffer } });
      }, 5);
    }
  };

  let onHighPolyCalled = false;
  const mockContext = {
    extrudeController: { bodies: [], nextBodyId: 1 },
    renderBodyTree: () => {},
    redraw: () => {},
    fitToScene: () => {},
    onHighPoly: async (mesh, fileName) => {
      onHighPolyCalled = true;
      assert.equal(mesh.triangleCount, 26000);
      assert.equal(fileName, 'highpoly.stl');
      return { ratio: 0.75 };
    },
  };

  const fakeFile = { name: 'highpoly.stl' };
  const result = await cad.importers.importFile(fakeFile, mockContext);

  assert.equal(onHighPolyCalled, true, 'onHighPoly callback was invoked');
  assert.equal(result.decimated, true, 'Result marked as decimated');
  const body = result.details.body;
  const decimatedCount = Math.floor(body.renderMesh.triangles.length / 3);
  assert.ok(decimatedCount < 26000, `Imported body has simplified display mesh (${decimatedCount} < 26000)`);
  assert.equal(body.mesh.triangles.length / 3, 26000, 'Original STL triangles remain intact');
  assert.equal(cad.projectIO.exportBinarySTL([body]).triangleCount, 26000,
    'STL export uses the untouched source geometry');
});

test('importers.importMeshToBodies automatically centers mesh at (0, 0) and grounds at Z = 0', () => {
  // Construct an offset mesh: X in [100, 200], Y in [-50, 50], Z in [50, 150] (floating high above ground)
  const rawVertices = [
    100, -50, 50,
    200, -50, 50,
    150, 50, 150,
  ];
  const triangles = [0, 1, 2];
  const meshData = {
    vertices: rawVertices,
    triangles,
    vertexCount: 3,
    triangleCount: 1,
    bounds: {
      minX: 100, maxX: 200, dx: 100,
      minY: -50, maxY: 50, dy: 100,
      minZ: 50, maxZ: 150, dz: 100,
    },
  };

  const controller = { bodies: [], nextBodyId: 1 };
  const context = {
    extrudeController: controller,
    renderBodyTree: () => {},
    redraw: () => {},
    fitToScene: () => {},
  };

  const res = cad.importers.importMeshToBodies(meshData, 'car.stl', context);
  const importedBody = res.body;

  // Expected shifts:
  // centerX = (100 + 200) / 2 = 150 -> shifted by -150 => X in [-50, 50], center = 0
  // centerY = (-50 + 50) / 2 = 0 -> shifted by 0 => Y in [-50, 50], center = 0
  // groundZ = minZ = 50 -> shifted by -50 => Z in [0, 100], minZ = 0 (on ground)
  const b = importedBody.mesh.bounds;
  assert.equal(b.minX, -50);
  assert.equal(b.maxX, 50);
  assert.equal(b.minY, -50);
  assert.equal(b.maxY, 50);
  assert.equal(b.minZ, 0, 'Model grounded to Z = 0');
  assert.equal(b.maxZ, 100);

  // Check actual vertex coords
  const v = importedBody.mesh.vertices;
  assert.equal(v[0], -50);
  assert.equal(v[1], -50);
  assert.equal(v[2], 0, 'Lowest point sits exactly at Z = 0');
});

test('BodyFaceSelection renders bounding cage fallback for imported dense meshes', () => {
  // Dense mesh with > 8000 vertices:
  const vertices = new Float32Array(8001 * 3);
  vertices[0] = 0; vertices[1] = 0; vertices[2] = 0;
  vertices[3] = 10; vertices[4] = 10; vertices[5] = 20;
  const mesh = {
    vertices,
    triangles: [0, 1, 2],
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 20 },
  };
  const body = { id: 'body-1', name: 'Car (Mesh)', visible: true, mesh, meshSource: 'import' };

  let strokeCalled = false;
  let arcCount = 0;
  const mockContext = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => { strokeCalled = true; },
    setLineDash: () => {},
    arc: () => { arcCount++; },
    fill: () => {},
  };
  const project = ([x, y, z]) => [x * 2, y * 2];

  cad.bodyFaces.renderBodyHighlight(mockContext, project, body);
  assert.equal(strokeCalled, true, 'Stroke called for bounding cage');
  assert.equal(arcCount, 8, '8 corner markers drawn for bounding cage');
});


