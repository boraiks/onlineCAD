import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sandbox = {};
runInNewContext(readFileSync(new URL('../js/mesh-rebuild-core.js', import.meta.url), 'utf8'), sandbox);
const { meshBounds, sampledDeviation, measureSurface } = sandbox.WebCADMeshRebuildCore;

const triangle = {
  vertices: Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  triangles: Uint32Array.from([0, 1, 2]),
};

test('surface deviation measures the actual closest triangle, including its interior', () => {
  assert.equal(meshBounds(triangle).extent, 10);
  const point = { vertices: Float32Array.from([2, 2, 0]),
    triangles: Uint32Array.from([0, 0, 0]) };
  assert.equal(sampledDeviation(point, triangle, 1), 0);
});

test('surface deviation rejects a shifted surface beyond the requested limit', () => {
  const shifted = { vertices: Float32Array.from([0, 0, 2, 10, 0, 2, 0, 10, 2]),
    triangles: triangle.triangles };
  assert.ok(sampledDeviation(shifted, triangle, 1) > 1);
  assert.ok(Math.abs(sampledDeviation(shifted, triangle, 3) - 2) < 1e-6);
  assert.ok(sampledDeviation(triangle, triangle, 1) < 1e-12);
  assert.equal(measureSurface(triangle, shifted, 0.1).valid, false);
  assert.equal(measureSurface(triangle, triangle, 0.1).valid, true);
});

test('whole-triangle certification detects a defect skipped by sparse sampling', () => {
  const vertices = new Float32Array(3000 * 9);
  const triangles = new Uint32Array(3000 * 3);
  for (let face = 0; face < 3000; face++) {
    vertices.set([face * 10, 0, 0, face * 10 + 1, 0, 0, face * 10, 1, 0], face * 9);
    triangles.set([face * 3, face * 3 + 1, face * 3 + 2], face * 3);
  }
  const source = { vertices, triangles };
  const changed = { vertices: vertices.slice(), triangles };
  for (let i = 3 * 9 + 2; i < 4 * 9; i += 3) changed.vertices[i] = 5;
  assert.ok(sampledDeviation(source, changed, 1) < 1e-10);
  assert.ok(sampledDeviation(changed, source, 1) < 1e-10);
  const accuracy = 1 / meshBounds(source).extent;
  assert.equal(measureSurface(source, changed, accuracy).valid, false);
});
