import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadIntoSandbox(files, extra = {}) {
  const sandbox = {
    console,
    Math,
    Number,
    Array,
    Float32Array,
    Float64Array,
    Uint32Array,
    Int32Array,
    Uint8Array,
    Int8Array,
    ArrayBuffer,
    DataView,
    Map,
    Set,
    WeakMap,
    Object,
    String,
    Boolean,
    Error,
    RegExp,
    JSON,
    Date,
    TextDecoder,
    TextEncoder,
    structuredClone,
    ...extra,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  for (const file of files) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    runInNewContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

function makeCubeMesh() {
  return {
    vertices: new Float32Array([
      0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0,
      0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10,
    ]),
    triangles: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
  };
}

test('serializeProject preserves typed arrays when requested and keeps JSON default', () => {
  const sandbox = loadIntoSandbox([
    'js/math.js', 'js/orientation.js', 'js/settings.js', 'js/camera.js', 'js/planes.js',
    'js/sketch-grid.js', 'js/sketch-geometry.js', 'js/sketch-model.js', 'js/canvas.js',
    'js/sketch-profiles.js', 'js/sketch-render.js', 'js/project-io.js',
  ], {
    document: { currentScript: null },
  });
  const cad = sandbox.WebCAD;
  const cube = makeCubeMesh();
  const body = { id: 'body-1', name: 'Box', mesh: cube, meshSource: 'solid' };

  const jsonData = cad.projectIO.serializeProject({
    extrudeController: { bodies: [body], nextBodyId: 2 },
  });
  assert.equal(Array.isArray(jsonData.bodies[0].mesh.vertices), true);
  assert.equal(Array.isArray(jsonData.bodies[0].mesh.triangles), true);

  const idbData = cad.projectIO.serializeProject({
    extrudeController: { bodies: [body], nextBodyId: 2 },
    preserveTypedArrays: true,
  });
  assert.ok(idbData.bodies[0].mesh.vertices instanceof sandbox.Float32Array);
  assert.ok(idbData.bodies[0].mesh.triangles instanceof sandbox.Uint32Array);

  const target = { bodies: [] };
  cad.projectIO.deserializeProject(idbData, { extrudeController: target });
  assert.equal(target.bodies.length, 1);
  assert.ok(target.bodies[0].mesh.vertices instanceof sandbox.Float32Array);
  assert.deepEqual(Array.from(target.bodies[0].mesh.vertices), Array.from(cube.vertices));
  assert.deepEqual(Array.from(target.bodies[0].mesh.triangles), Array.from(cube.triangles));
});

test('importers.stlWorkerSource evaluates standalone in an isolated VM and welds -0/+0 identically', () => {
  const host = loadIntoSandbox([
    'js/math.js', 'js/orientation.js', 'js/settings.js', 'js/camera.js', 'js/planes.js',
    'js/sketch-grid.js', 'js/sketch-geometry.js', 'js/sketch-model.js', 'js/canvas.js',
    'js/sketch-profiles.js', 'js/sketch-render.js', 'js/project-io.js', 'js/importers.js',
  ], {
    document: { currentScript: null },
  });

  const workerSandbox = {
    Math, Number, Array, Float32Array, Float64Array, Uint32Array, Int32Array, Uint8Array,
    ArrayBuffer, DataView, TextDecoder, Error,
  };
  runInNewContext(host.WebCAD.importers.stlWorkerSource, workerSandbox, { filename: 'stlWorkerSource.js' });
  assert.equal(typeof workerSandbox.parseSTL, 'function');

  // Build binary STL with 2 triangles meeting at (-0, 0, 0) and (0, 0, 0)
  const buf = new ArrayBuffer(84 + 2 * 50);
  const view = new DataView(buf);
  view.setUint32(80, 2, true);
  const writeTri = (idx, verts) => {
    const off = 84 + idx * 50 + 12;
    for (let i = 0; i < 9; i++) view.setFloat32(off + i * 4, verts[i], true);
  };
  writeTri(0, [-0, 0, 0, 10, 0, 0, 0, 10, 0]);
  writeTri(1, [0, -0, 0, 10, 0, 0, 10, 10, 0]);

  const binRes = workerSandbox.parseSTL(buf);
  assert.equal(binRes.format, 'STL (Binary)');
  assert.equal(binRes.triangleCount, 2);
  assert.equal(binRes.vertexCount, 4);

  const ascii = `solid tri
    facet normal 0 0 1
      outer loop
        vertex -0.0 0.0 0.0
        vertex 10.0 0.0 0.0
        vertex 0.0 10.0 0.0
      endloop
    endfacet
    facet normal 0 0 1
      outer loop
        vertex 0.0 -0.0 0.0
        vertex 10.0 0.0 0.0
        vertex 10.0 10.0 0.0
      endloop
    endfacet
  endsolid tri`;
  const asciiRes = workerSandbox.parseSTL(new TextEncoder().encode(ascii).buffer);
  assert.equal(asciiRes.format, 'STL (ASCII)');
  assert.equal(asciiRes.triangleCount, 2);
  assert.equal(asciiRes.vertexCount, 4);
});

test('decimateGridClustering.toString() executes standalone in an isolated VM and reduces meshes', () => {
  const host = loadIntoSandbox(['js/mesh-decimator.js'], {
    document: { currentScript: null },
  });
  const fnSource = host.WebCAD.meshDecimator.decimateGridClustering.toString();
  const workerSandbox = { Math, Number, Float32Array, Float64Array, Uint32Array, Int32Array, Error };
  runInNewContext(fnSource, workerSandbox, { filename: 'decimateGridClustering.js' });
  assert.equal(typeof workerSandbox.decimateGridClustering, 'function');

  // Create 20x20 grid (800 triangles)
  const n = 21;
  const verts = new Float32Array(n * n * 3);
  const tris = new Uint32Array((n - 1) * (n - 1) * 6);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (i * n + j) * 3;
      verts[k] = i * 5; verts[k + 1] = j * 5; verts[k + 2] = Math.sin(i * 0.4) * Math.cos(j * 0.4) * 3;
    }
  }
  let p = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      tris[p++] = a; tris[p++] = b; tris[p++] = d;
      tris[p++] = a; tris[p++] = d; tris[p++] = c;
    }
  }
  const out = workerSandbox.decimateGridClustering({ vertices: verts, triangles: tris }, { ratio: 0.75 });
  assert.ok(out.decimatedTriangles >= 4 && out.decimatedTriangles < 800);
  assert.ok(out.vertices instanceof Float32Array);
  assert.ok(out.triangles instanceof Uint32Array);
});

test('mesh-rebuild-core certifies using triangle index 0 as witness', () => {
  const sandbox = loadIntoSandbox(['js/mesh-rebuild-core.js']);
  const { measureSurface } = sandbox.WebCADMeshRebuildCore;
  // Single huge triangle at index 0 matched by a refined 4-triangle planar mesh:
  // without witness #0 certification, midpoint subdivision would exceed depth or check against #0 cleanly.
  const coarse = {
    vertices: Float32Array.from([0, 0, 0, 100, 0, 0, 0, 100, 0]),
    triangles: Uint32Array.from([0, 1, 2]),
  };
  const fine = {
    vertices: Float32Array.from([
      0, 0, 0, 100, 0, 0, 0, 100, 0,
      50, 0, 0, 50, 50, 0, 0, 50, 0,
    ]),
    triangles: Uint32Array.from([0, 3, 5, 3, 1, 4, 5, 3, 4, 5, 4, 2]),
  };
  const res = measureSurface(coarse, fine, 1e-4);
  assert.equal(res.valid, true);
  assert.equal(res.certified, true);
  assert.ok(res.deviation <= 1e-9);
});

test('mesh-solid-core repairMesh and prepareClosedMesh fix duplicates, non-manifold edges, holes, and welding', () => {
  const sandbox = loadIntoSandbox(['js/mesh-solid-core.js']);
  const { repairMesh, prepareClosedMesh } = sandbox.WebCADMeshSolidCore;
  const cube = makeCubeMesh();

  // Duplicate tri + canceling opposite pair + missing one cap triangle (open hole) + extra non-manifold tri
  const broken = {
    vertices: cube.vertices,
    triangles: Uint32Array.from([
      ...cube.triangles.slice(0, 33), // drop last tri [3, 4, 7] leaving a triangular hole
      0, 2, 1,                        // duplicate of tri 0
      0, 1, 2, 0, 2, 1,               // zero-thickness canceling pair on different triple? wait: (0,2,1) & (0,1,2) cancel leaving 1 copy of (0,2,1)
    ]),
  };
  const repaired = repairMesh(broken);
  assert.equal(repaired.repair.filledHoles, 1);
  assert.ok(repaired.repair.removedDuplicates >= 2);
  const closed = prepareClosedMesh(repaired);
  assert.equal(closed.triangles.length / 3, 12);
});

test('surface-finish-core compute preserves crease detection on welded STL seams', () => {
  const sandbox = loadIntoSandbox(['js/surface-finish-core.js']);
  const { compute } = sandbox.WebCADSurfaceFinishCore;
  const cube = makeCubeMesh();
  const res = compute(cube, 42);
  assert.equal(res.featurePairs.length / 2, 12);
  assert.equal(res.triangleCount, 12);
  assert.equal(res.cornerNormals.length, cube.triangles.length * 3);
});

test('app.js optimization wiring invariants hold', () => {
  const appSrc = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const faceSelMatch = appSrc.match(/faceSelection\s*=\s*new cad\.BodyFaceSelection\(\{[\s\S]*?onSelect:/);
  assert.ok(faceSelMatch, 'faceSelection initialization exists');
  const onChangeMatch = faceSelMatch[0].match(/onChange:\s*[^,]+/);
  assert.ok(onChangeMatch && !onChangeMatch[0].includes('renderBodyTree'),
    'faceSelection.onChange must not call renderBodyTree on hover');

  const autosaveMatch = appSrc.match(/function writeAutosave\([\s\S]*?\n  \}/);
  assert.ok(autosaveMatch && autosaveMatch[0].includes('preserveTypedArrays: true'),
    'writeAutosave passes preserveTypedArrays: true');

  const appExportMatch = appSrc.match(/cad\.app\s*=\s*\{[^\n]+/);
  assert.ok(appExportMatch && appExportMatch[0].includes('meshFill'),
    'cad.app exports meshFill');
});
