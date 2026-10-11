import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const root = new URL('../', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { currentScript: { src: new URL('js/vendor/manifold/manifold.js', root).href } };
for (const file of ['js/mesh-rebuild-core.js', 'js/mesh-feature-fit-core.js'])
  runInThisContext(readFileSync(new URL(file, root), 'utf8'));
await import(new URL('js/vendor/manifold/manifold.js', root));
await import(new URL('js/vendor/manifold/manifold-binary.js', root));
const M = await globalThis.WebCADManifoldModule({ wasmBinary: globalThis.WebCADManifoldBinary });
M.setup();
const Fit = globalThis.WebCADMeshFeatureFitCore;
const meshData = s => globalThis.WebCADMeshRebuildCore.meshData(s.getMesh());

function solidVolume(mesh) {
  const s = new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: mesh.vertices, triVerts: mesh.triangles }));
  try { assert.equal(s.status(), 'NoError'); return s.volume(); } finally { s.delete(); }
}

test('feature fit recognises a through-hole and rebuilds it close to the exact cylinder', () => {
  const part = M.Manifold.cube([40, 30, 10], true).subtract(M.Manifold.cylinder(30, 5, 5, 24, true));
  const source = meshData(part);
  part.delete();
  const analysis = Fit.analyze(source);
  assert.deepEqual(Fit.summary(analysis.surfaces), { plane: 6, cylinder: 1 });
  const hole = analysis.surfaces.find(s => s.type === 'cylinder');
  assert.ok(Math.abs(hole.radius - 5) < 1e-4);
  const exact = 12000 - Math.PI * 250;
  const before = Math.abs(solidVolume(source) - exact);
  const rebuilt = Fit.rebuild(source);
  const after = Math.abs(solidVolume(rebuilt) - exact);
  assert.ok(after < before / 10, `volume error ${after} should be far below ${before}`);
});

test('tangent flats are peeled off so slot ends are recognised as cylinders', () => {
  const slot = M.Manifold.hull([
    M.Manifold.cylinder(8, 6, 6, 20, true).translate([-10, 0, 0]),
    M.Manifold.cylinder(8, 6, 6, 20, true).translate([10, 0, 0])]);
  const analysis = Fit.analyze(meshData(slot));
  slot.delete();
  assert.deepEqual(Fit.summary(analysis.surfaces), { plane: 4, cylinder: 2 });
  for (const s of analysis.surfaces.filter(x => x.type === 'cylinder'))
    assert.ok(Math.abs(s.radius - 6) < 1e-4);
});

test('freeform meshes are left untouched instead of being forced into primitives', () => {
  const blob = M.Manifold.sphere(1, 24).scale([20, 12, 8]);
  const source = meshData(blob);
  blob.delete();
  const rebuilt = Fit.rebuild(source);
  assert.deepEqual(rebuilt.surfaces.map(s => s.type), ['freeform']);
  assert.equal(rebuilt.triangles.length, source.triangles.length);
});

test('feature fit recognises a sphere and reduces volume chord error by over an order of magnitude', () => {
  const sphere = M.Manifold.sphere(10, 24);
  const source = meshData(sphere);
  sphere.delete();
  const analysis = Fit.analyze(source);
  assert.equal(analysis.surfaces.length, 1);
  assert.equal(analysis.surfaces[0].type, 'sphere');
  assert.ok(Math.abs(analysis.surfaces[0].radius - 10) < 1e-3);
  const exact = (4 / 3) * Math.PI * 1000;
  const before = Math.abs(solidVolume(source) - exact);
  const rebuilt = Fit.rebuild(source);
  const after = Math.abs(solidVolume(rebuilt) - exact);
  assert.ok(after < before / 20, `volume error ${after} should be much smaller than ${before}`);
});

test('feature fit snaps vertices on a planar box and preserves exact flat volume', () => {
  const box = M.Manifold.cube([10, 20, 30], true);
  const source = meshData(box);
  box.delete();
  const rebuilt = Fit.rebuild(source);
  assert.equal(rebuilt.surfaces.length, 6);
  assert.ok(rebuilt.surfaces.every(s => s.type === 'plane'));
  const s = new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: rebuilt.vertices, triVerts: rebuilt.triangles }));
  try {
    assert.equal(s.status(), 'NoError');
    assert.ok(Math.abs(s.volume() - 6000) < 1e-4);
  } finally { s.delete(); }
});

