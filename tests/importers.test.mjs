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
  'sketch-profiles.js', 'sketch-render.js', 'project-io.js', 'importers.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

test('importers parses Binary STL correctly', () => {
  // Construct a minimal binary STL buffer: 80 bytes header + uint32(1) + 50 bytes for 1 facet
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true); // 1 triangle
  // Normal
  view.setFloat32(84, 0, true);
  view.setFloat32(88, 0, true);
  view.setFloat32(92, 1, true);
  // V1 (0, 0, 0)
  view.setFloat32(96, 0, true);
  view.setFloat32(100, 0, true);
  view.setFloat32(104, 0, true);
  // V2 (10, 0, 0)
  view.setFloat32(108, 10, true);
  view.setFloat32(112, 0, true);
  view.setFloat32(116, 0, true);
  // V3 (10, 20, 0)
  view.setFloat32(120, 10, true);
  view.setFloat32(124, 20, true);
  view.setFloat32(128, 0, true);

  const result = cad.importers.parseSTL(buffer);
  assert.equal(result.format, 'STL (Binary)');
  assert.equal(result.triangleCount, 1);
  assert.equal(result.vertexCount, 3);
  assert.equal(result.bounds.maxX, 10);
  assert.equal(result.bounds.maxY, 20);
});

test('importers parses ASCII STL correctly', () => {
  const asciiSTL = `
solid triangle
  facet normal 0.0 0.0 1.0
    outer loop
      vertex 0.0 0.0 0.0
      vertex 5.0 0.0 0.0
      vertex 5.0 5.0 0.0
    endloop
  endfacet
endsolid triangle
  `;
  const enc = new TextEncoder();
  const buffer = enc.encode(asciiSTL).buffer;

  const result = cad.importers.parseSTL(buffer);
  assert.equal(result.format, 'STL (ASCII)');
  assert.equal(result.triangleCount, 1);
  assert.equal(result.vertexCount, 3);
  assert.equal(result.bounds.maxX, 5);
  assert.equal(result.bounds.maxY, 5);
});

test('importers parses Wavefront OBJ triangles and quads', () => {
  const objText = `
# Wavefront OBJ test
v 0.0 0.0 0.0
v 10.0 0.0 0.0
v 10.0 10.0 0.0
v 0.0 10.0 0.0
f 1 2 3 4
  `;
  const result = cad.importers.parseOBJ(objText);
  assert.equal(result.format, 'OBJ');
  assert.equal(result.vertexCount, 4);
  assert.equal(result.triangleCount, 2); // Quad triangulated to 2 triangles
  assert.equal(result.bounds.dx, 10);
  assert.equal(result.bounds.dy, 10);
});

test('importers parses DXF 2D entities into sketch lines, circles, and arcs', () => {
  const dxfContent = `
0
SECTION
2
ENTITIES
0
LINE
10
0.0
20
0.0
11
50.0
21
0.0
0
CIRCLE
10
25.0
20
15.0
40
5.0
0
ARC
10
0.0
20
10.0
40
8.0
50
0.0
51
90.0
0
LWPOLYLINE
70
1
90
4
10
0.0
20
0.0
10
20.0
20
0.0
10
20.0
20
20.0
10
0.0
20
20.0
0
ENDSEC
0
EOF
  `;
  const parsed = cad.importers.parseDXF(dxfContent);
  assert.equal(parsed.format, 'DXF-2D');
  assert.equal(parsed.is3D, false);
  // LINE (1), CIRCLE (1), ARC (1), closed LWPOLYLINE (4 segments) = 7 entities
  assert.equal(parsed.entityCount, 7);

  const sketchDoc = new cad.SketchDocument();
  const importRes = cad.importers.importDXFToSketch(parsed, 'Plate.dxf', {
    sketchDocument: sketchDoc,
  });

  assert.equal(importRes.type, 'sketch');
  assert.equal(sketchDoc.sketches.length, 1);
  assert.equal(sketchDoc.sketches[0].entities.length, 7);
  assert.equal(sketchDoc.sketches[0].name, 'Plate (DXF)');
});

test('importers parses ISO 10303-21 STEP faceted B-Rep models', () => {
  const stepText = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STEP Model'),'2;1');
FILE_NAME('box.step','2026-10-10',('onlineCAD'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#10 = CARTESIAN_POINT('',(0.0,0.0,0.0));
#11 = CARTESIAN_POINT('',(10.0,0.0,0.0));
#12 = CARTESIAN_POINT('',(10.0,10.0,0.0));
#13 = CARTESIAN_POINT('',(0.0,10.0,0.0));
#20 = POLY_LOOP('',(#10,#11,#12,#13));
#30 = FACETED_BREP('',#20);
ENDSEC;
END-ISO-10303-21;
  `;
  const result = cad.importers.parseSTEP(stepText);
  assert.equal(result.format, 'STEP');
  assert.equal(result.vertexCount, 4);
  assert.equal(result.triangleCount, 2); // Quad loop -> 2 triangles
  assert.equal(result.bounds.dx, 10);
  assert.equal(result.bounds.dy, 10);
});

test('openProjectFromFile strictly rejects non-ocad files', async () => {
  const fakeFile = { name: 'test.json' };
  await assert.rejects(
    async () => {
      await cad.projectIO.openProjectFromFile(fakeFile, {});
    },
    /Only \.ocad files are supported/
  );
});
