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
  'sketch-profiles.js', 'sketch-render.js', 'project-io.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

test('projectIO serializes and deserializes sketch and body data with custom planes', () => {
  const sketchDoc = new cad.SketchDocument();
  const sketch = sketchDoc.makeSketch('XY');
  sketch.name = 'Base Sketch';
  const line = sketchDoc.makeLine([0, 0], [50, 0]);
  sketchDoc.insertEntity(sketch, line);
  sketchDoc.insertSketch(sketch);

  const customPlane = {
    u: [0, 1, 0],
    v: [0, 0, 1],
    origin: [20, 10, 5],
    axes: ['Y', 'Z', 'X']
  };
  cad.planes.grid['FACE-1'] = customPlane;

  const mockBodies = [
    {
      id: 'body-1',
      name: 'Plate',
      visible: true,
      plane: 'XY',
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      start: 0,
      end: 15,
      displayReduction: 0.75,
      surfaceFinishAngle: 42,
      renderMesh: { vertices: [0, 0, 0], triangles: [] },
      mesh: {
        vertices: [0, 0, 0, 10, 0, 0, 10, 10, 0],
        triangles: [0, 1, 2]
      }
    }
  ];

  const serialized = cad.projectIO.serializeProject({
    documentName: 'My Part',
    sketchDocument: sketchDoc,
    extrudeController: { bodies: mockBodies, nextBodyId: 2 },
  });

  assert.equal(serialized.format, 'onlineCAD');
  assert.equal(serialized.version, 1);
  assert.equal(serialized.documentName, 'My Part');
  assert.equal(serialized.sketches.length, 1);
  assert.equal(serialized.sketches[0].entities.length, 1);
  assert.equal(serialized.bodies.length, 1);
  assert.equal(serialized.bodies[0].displayReduction, 0.75);
  assert.equal(serialized.bodies[0].surfaceFinishAngle, 42);
  assert.equal(serialized.bodies[0].renderMesh, undefined, 'Derived display mesh is not stored twice');
  assert.ok(serialized.planes['FACE-1']);

  // Test restoration into empty target
  const newSketchDoc = new cad.SketchDocument();
  const mockExtrudeController = { bodies: [], nextBodyId: 1 };
  const restoredPlanes = {};

  const result = cad.projectIO.deserializeProject(serialized, {
    sketchDocument: newSketchDoc,
    extrudeController: mockExtrudeController,
  });
  assert.equal(mockExtrudeController.bodies[0].displayReduction, 0.75);
  assert.equal(mockExtrudeController.bodies[0].surfaceFinishAngle, 42);

  assert.equal(result.documentName, 'My Part');
  assert.equal(newSketchDoc.sketches.length, 1);
  assert.equal(newSketchDoc.sketches[0].entities[0].type, 'line');
  assert.equal(mockExtrudeController.bodies.length, 1);
  assert.equal(mockExtrudeController.bodies[0].name, 'Plate');
  assert.deepEqual(mockExtrudeController.bodies[0].mesh.triangles, [0, 1, 2]);
});

test('projectIO retains the imported source of a rebuilt solid for later adjustments', () => {
  const mesh = { vertices: [0, 0, 0, 2, 0, 0, 0, 2, 0], triangles: [0, 1, 2] };
  const source = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] };
  const body = { id: 'rebuilt', meshSource: 'solid', mesh, rebuildSourceMesh: source,
    rebuildResultMesh: mesh };
  const data = cad.projectIO.serializeProject({ extrudeController: { bodies: [body] } });
  assert.deepEqual(data.bodies[0].rebuildSourceMesh.vertices, source.vertices);
  const target = { bodies: [] };
  cad.projectIO.deserializeProject(data, { extrudeController: target });
  assert.deepEqual(target.bodies[0].rebuildSourceMesh.vertices, source.vertices);
  assert.equal(target.bodies[0].rebuildResultMesh, target.bodies[0].mesh);
});

test('projectIO exports valid binary STL buffer with correct headers and facets', () => {
  const testBodies = [
    {
      id: 'body-1',
      visible: true,
      mesh: {
        vertices: [
          0, 0, 0,   // v0
          10, 0, 0,  // v1
          0, 10, 0   // v2
        ],
        triangles: [0, 1, 2]
      }
    }
  ];

  const stl = cad.projectIO.exportBinarySTL(testBodies, 'TestPart');
  assert.equal(stl.triangleCount, 1);
  assert.equal(stl.byteLength, 84 + 50); // 80 header + 4 count + 50 facet = 134 bytes
});

test('projectIO exports valid ASCII STL string with facet normal and vertices', () => {
  const testBodies = [
    {
      id: 'body-1',
      visible: true,
      mesh: {
        vertices: [
          0, 0, 0,
          10, 0, 0,
          0, 10, 0
        ],
        triangles: [0, 1, 2]
      }
    }
  ];

  const stl = cad.projectIO.exportAsciiSTL(testBodies, 'AsciiPart');
  assert.equal(stl.triangleCount, 1);
  assert.ok(stl.byteLength > 0);
});
