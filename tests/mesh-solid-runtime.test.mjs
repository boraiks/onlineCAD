import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const root = new URL('../', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { currentScript: { src: new URL('js/vendor/manifold/manifold.js', root).href } };
for (const file of ['js/mesh-rebuild-core.js', 'js/mesh-feature-fit-core.js', 'js/mesh-solid-core.js'])
  runInThisContext(readFileSync(new URL(file, root), 'utf8'));
await import(new URL('js/vendor/manifold/manifold.js', root));
await import(new URL('js/vendor/manifold/manifold-binary.js', root));
const module = await globalThis.WebCADManifoldModule({ wasmBinary: globalThis.WebCADManifoldBinary });
module.setup();

function data(solid) {
  return globalThis.WebCADMeshRebuildCore.meshData(solid.getMesh());
}

test('rebuild and simplification are checked against the starting geometry', () => {
  const solid = module.Manifold.sphere(10, 64);
  try {
    const source = data(solid);
    const result = globalThis.WebCADMeshSolidCore.convert(module, source, {
      geometry: 'rebuild', quality: 'fast', accuracy: 0.006, creaseAngle: 42,
    });
    const measured = globalThis.WebCADMeshRebuildCore.measureSurface(source, result, 0.006);
    assert.ok(measured.valid, `surface shift ${measured.deviation} exceeds ${measured.limit}`);
    assert.ok(Math.abs(result.volume - solid.volume()) / solid.volume() <= 0.01);
    if (result.rebuildApplied)
      assert.ok(Math.abs(result.rebuildDeviation - measured.deviation) < 1e-5);
  } finally {
    solid.delete();
  }
});

test('coarse curved solids rebuild without excessive refinement or volume drift', () => {
  const solid = module.Manifold.sphere(10, 32);
  try {
    const source = data(solid);
    const result = globalThis.WebCADMeshSolidCore.convert(module, source, {
      geometry: 'rebuild', quality: 'full', accuracy: 0.006, creaseAngle: 42,
    });
    assert.equal(result.rebuildApplied, true);
    assert.ok(result.triangleCount <= source.triangles.length / 3 * 5);
    assert.ok(globalThis.WebCADMeshRebuildCore.measureSurface(source, result, 0.006).valid);
    assert.ok(Math.abs(result.volume - solid.volume()) / solid.volume() <= 0.01);
  } finally {
    solid.delete();
  }
});

test('feature-fit geometry converts mechanical mesh and identifies analytic features', () => {
  // A box with a cylindrical bore
  const cube = module.Manifold.cube([20, 20, 10], true);
  const hole = module.Manifold.cylinder(12, 5, 5, 24);
  const part = cube.subtract(hole);
  hole.delete();
  cube.delete();
  try {
    const source = data(part);
    const result = globalThis.WebCADMeshSolidCore.convert(module, source, {
      geometry: 'feature-fit',
      accuracy: 0.006,
    });
    assert.equal(result.featureFitApplied, true);
    assert.ok(result.featureSummary.plane >= 6, `expected planes >= 6, got ${result.featureSummary.plane}`);
    assert.ok(result.featureSummary.cylinder >= 1, `expected cylinder >= 1, got ${result.featureSummary.cylinder}`);
    assert.ok(result.triangleCount >= source.triangles.length / 3);
    assert.ok(Math.abs(result.volume - part.volume()) / part.volume() < 0.005);
    // Watertight and verified
    assert.doesNotThrow(() => globalThis.WebCADMeshSolidCore.prepareClosedMesh(result));
  } finally {
    part.delete();
  }
});

