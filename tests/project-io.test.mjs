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

test('projectIO keeps constraint and marker counters ahead of loaded ids', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const line = doc.makeLine([0, 0], [10, 0]);
  doc.insertEntity(sketch, line);
  doc.insertSketch(sketch);
  doc.insertConstraint(sketch, doc.makeConstraint({ type: 'horizontal', entityId: line.id }));
  doc.insertMidpoint(sketch, doc.makeMidpointMarker(line.id, null));
  const data = cad.projectIO.serializeProject({ sketchDocument: doc });
  assert.equal(data.counters.nextConstraintId, 2);
  assert.equal(data.counters.nextMarkerId, 2);

  // Older files had no counters for these; ids must still not collide.
  delete data.counters.nextConstraintId;
  delete data.counters.nextMarkerId;
  data.counters.nextEntityId = 1;
  const restored = new cad.SketchDocument();
  cad.projectIO.deserializeProject(data, { sketchDocument: restored, extrudeController: { bodies: [] } });
  assert.equal(restored.nextConstraintId, 2);
  assert.equal(restored.nextMarkerId, 2);
  assert.equal(restored.nextEntityId, 2);
  const next = restored.makeConstraint({ type: 'vertical', entityId: line.id });
  restored.insertConstraint(restored.sketches[0], next);
  assert.equal(restored.sketches[0].constraints.length, 2, 'new constraint is not swallowed by an id clash');
});

test('projectIO clears face planes of the previous design when loading', () => {
  cad.planes.grid['FACE-99'] = { u: [1, 0, 0], v: [0, 1, 0], origin: [0, 0, 0] };
  cad.projectIO.deserializeProject({ format: 'onlineCAD', sketches: [], bodies: [], planes: {} },
    { sketchDocument: new cad.SketchDocument(), extrudeController: { bodies: [] } });
  assert.equal(cad.planes.grid['FACE-99'], undefined);
  assert.ok(cad.planes.grid.XY, 'origin planes stay');
});

const cubeBody = {
  id: 'body-1', name: 'Cube', visible: true,
  mesh: { vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], triangles: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] },
};

test('projectIO exports OBJ with 1-based indices across bodies', () => {
  const second = { ...cubeBody, id: 'body-2', name: 'Copy' };
  const hidden = { ...cubeBody, id: 'body-3', visible: false };
  const result = cad.projectIO.exportOBJ([cubeBody, second, hidden], 'Part');
  const lines = result.text.trim().split('\n');
  assert.equal(lines.filter(line => line.startsWith('v ')).length, 8);
  assert.equal(lines.filter(line => line.startsWith('f ')).length, 8);
  assert.ok(lines.includes('o Cube') && lines.includes('o Copy'));
  assert.ok(lines.includes('f 1 3 2'));
  assert.ok(lines.includes('f 5 7 6'), 'second body indices are offset');
  assert.equal(result.triangleCount, 8);
});

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054B50);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(offset, true), 0x02014B50);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    assert.equal(view.getUint32(local, true), 0x04034B50);
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    assert.equal(cad.projectIO.crc32(data), crc, `${name} CRC matches`);
    files[name] = new TextDecoder().decode(data);
    offset += 46 + nameLength;
  }
  return files;
}

test('projectIO exports a valid 3MF package', () => {
  assert.equal(cad.projectIO.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const result = cad.projectIO.export3MF([cubeBody], 'Bracket & Co');
  const files = readStoredZip(result.bytes);
  assert.deepEqual(Object.keys(files).sort(), ['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
  const model = files['3D/3dmodel.model'];
  assert.match(model, /unit="millimeter"/);
  assert.equal((model.match(/<vertex /g) || []).length, 4);
  assert.equal((model.match(/<triangle /g) || []).length, 4);
  assert.match(model, /Bracket &amp; Co/);
  assert.match(files['_rels/.rels'], /\/3D\/3dmodel\.model/);
  assert.equal(result.triangleCount, 4);
});

test('projectIO exports sketches as R12 DXF with layers and CCW arcs', () => {
  const sketch = {
    id: 'sketch-1', name: 'Sketch 1', entities: [
      { id: 'entity-1', type: 'rectangle', start: [0, 0], end: [20, 10] },
      { id: 'entity-2', type: 'circle', center: [5, 5], radius: 2 },
      { id: 'entity-3', type: 'line', start: [0, 0], end: [20, 10], construction: true },
      { id: 'entity-4', type: 'arc', center: [0, 0], radius: 5, startAngle: Math.PI / 2, endAngle: 0, counterClockwise: true },
      { id: 'entity-5', type: 'point', position: [3, 4] },
    ],
  };
  const result = cad.projectIO.exportDXF([sketch]);
  const pairs = result.text.trim().split('\n');
  const types = pairs.filter((value, index) => index % 2 === 1 && pairs[index - 1] === '0');
  assert.equal(types.filter(type => type === 'LINE').length, 5);
  assert.equal(types.filter(type => type === 'CIRCLE').length, 1);
  assert.equal(types.filter(type => type === 'ARC').length, 1);
  assert.equal(types.filter(type => type === 'POINT').length, 1);
  assert.equal(pairs.at(-1), 'EOF');
  assert.ok(pairs.includes('SKETCH_1') && pairs.includes('SKETCH_1_CONSTRUCTION'));
  const arc = pairs.indexOf('ARC');
  const arcGroups = pairs.slice(arc + 1, arc + 18);
  assert.equal(arcGroups[arcGroups.indexOf('50') + 1], '0', 'clockwise arc is written from its end angle');
  assert.equal(arcGroups[arcGroups.indexOf('51') + 1], '90');
  assert.equal(result.entityCount, 5);
  assert.throws(() => cad.projectIO.exportDXF([{ entities: [] }]), /No sketch geometry/);
});
