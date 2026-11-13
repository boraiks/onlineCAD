import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

const root = new URL('../', import.meta.url);
globalThis.window = globalThis;
globalThis.document = { currentScript: { src: new URL('js/vendor/manifold/manifold.js', root).href } };
for (const file of ['js/mesh-rebuild-core.js', 'js/mesh-feature-fit-core.js', 'js/mesh-solid-core.js', 'js/mesh-fill-core.js'])
  runInThisContext(readFileSync(new URL(file, root), 'utf8'));
await import(new URL('js/vendor/manifold/manifold.js', root));
await import(new URL('js/vendor/manifold/manifold-binary.js', root));
const module = await globalThis.WebCADManifoldModule({ wasmBinary: globalThis.WebCADManifoldBinary });
module.setup();
const fill = globalThis.WebCADMeshFillCore;
const data = solid => globalThis.WebCADMeshRebuildCore.meshData(solid.getMesh());

test('Fill Hollow fills an enclosed cavity exactly', () => {
  const outer = module.Manifold.cube([30, 30, 30], true);
  const hollow = outer.subtract(module.Manifold.sphere(12, 64));
  try {
    const result = fill.fillHollow(module, data(hollow));
    assert.equal(result.cavitiesFilled, 1);
    assert.ok(Math.abs(result.volume - outer.volume()) < 1e-6 * outer.volume());
    assert.equal(result.approximate, false);
  } finally {
    outer.delete(); hollow.delete();
  }
});

test('Fill Hollow closes openings up to the given size and keeps the outside', () => {
  const box = module.Manifold.cube([40, 40, 40], true);
  const cup = box.subtract(module.Manifold.cube([30, 30, 40], true).translate([0, 0, 6]));
  try {
    assert.throws(() => fill.fillHollow(module, data(cup)), /open to the outside/);
    assert.throws(() => fill.fillHollow(module, data(cup), { closeGap: 10, resolution: 64 }), /no hollow space/);
    const result = fill.fillHollow(module, data(cup), { closeGap: 32, resolution: 96 });
    assert.ok(result.volume > box.volume() * 0.97, `filled ${result.volume} of ${box.volume()}`);
    assert.ok(result.volume <= box.volume() * 1.001, 'nothing grows outside the original surface');
  } finally {
    box.delete(); cup.delete();
  }
});

test('Fill Hollow leaves inverted shells outside the solid alone', () => {
  const body = module.Manifold.cube([20, 20, 20], true);
  const mesh = data(body);
  // An inside-out cube beside a solid cube is not a cavity; the hollow cube
  // further along has one real cavity.
  const offset = mesh.vertices.length / 3;
  const vertices = [...mesh.vertices, ...mesh.vertices.map((value, index) => index % 3 === 0 ? value + 50 : value)];
  const triangles = [...mesh.triangles];
  for (let t = 0; t < mesh.triangles.length; t += 3)
    triangles.push(mesh.triangles[t] + offset, mesh.triangles[t + 2] + offset, mesh.triangles[t + 1] + offset);
  const cavityMesh = data(body.subtract(module.Manifold.cube([10, 10, 10], true)));
  const cavityOffset = vertices.length / 3;
  vertices.push(...cavityMesh.vertices.map((value, index) => index % 3 === 0 ? value - 50 : value));
  triangles.push(...cavityMesh.triangles.map(index => index + cavityOffset));
  try {
    const result = fill.fillHollow(module, { vertices, triangles });
    assert.equal(result.cavitiesFilled, 1);
    assert.ok(Math.abs(result.volume - 3 * body.volume()) < 1e-3, `volume ${result.volume}`);
  } finally {
    body.delete();
  }
});
