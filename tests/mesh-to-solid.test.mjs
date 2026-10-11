import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sandbox = {};
runInNewContext(readFileSync(new URL('../js/mesh-solid-core.js', import.meta.url), 'utf8'), sandbox);
const { prepareClosedMesh } = sandbox.WebCADMeshSolidCore;

function cube() {
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

function combineCubes(secondOffset, secondScale = 1, reverseSecond = false) {
  const first = cube();
  const vertices = Array.from(first.vertices);
  for (let i = 0; i < first.vertices.length; i += 3)
    vertices.push(...secondOffset.map((offset, axis) => offset + first.vertices[i + axis] * secondScale));
  const triangles = Array.from(first.triangles);
  for (let i = 0; i < first.triangles.length; i += 3) {
    const [a, b, c] = Array.from(first.triangles.slice(i, i + 3), index => index + 8);
    triangles.push(...(reverseSecond ? [a, c, b] : [a, b, c]));
  }
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles) };
}

function signedVolume(mesh, startTriangle, endTriangle) {
  let volume6 = 0;
  for (let t = startTriangle; t < endTriangle; t++) {
    const [a, b, c] = mesh.triangles.slice(t * 3, t * 3 + 3);
    const v = mesh.vertices;
    const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
    const bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2];
    const cx = v[c * 3], cy = v[c * 3 + 1], cz = v[c * 3 + 2];
    volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume6 / 6;
}

test('closed STL topology passes solid conversion preflight', () => {
  const result = prepareClosedMesh(cube());
  assert.equal(result.triangles.length / 3, 12);
  assert.equal(result.removedDegenerate, 0);
});

test('a closed STL with separate vertices for each facet is welded', () => {
  const indexed = cube();
  const vertices = [];
  const triangles = [];
  for (const index of indexed.triangles) {
    vertices.push(...indexed.vertices.slice(index * 3, index * 3 + 3));
    triangles.push(triangles.length);
  }
  const prepared = prepareClosedMesh({ vertices: Float32Array.from(vertices),
    triangles: Uint32Array.from(triangles) });
  assert.equal(prepared.triangles.length / 3, 12);
  assert.equal(prepared.vertices.length / 3, 8);
  assert.equal(prepared.weldedVertices, 28);
});

test('open and non-manifold meshes get actionable errors', () => {
  const open = cube();
  open.triangles = open.triangles.slice(3);
  assert.throws(() => prepareClosedMesh(open), /open edges/);
  const extra = cube();
  extra.triangles = Uint32Array.from([...extra.triangles, 0, 1, 5]);
  assert.throws(() => prepareClosedMesh(extra), /non-manifold edges/);
});

test('inconsistent winding and stray degenerate facets are repaired', () => {
  const reversed = cube();
  [reversed.triangles[0], reversed.triangles[1]] = [reversed.triangles[1], reversed.triangles[0]];
  const reoriented = prepareClosedMesh(reversed);
  assert.ok(reoriented.repairedWinding > 0);
  assert.equal(prepareClosedMesh(reoriented).repairedWinding, 0);
  const dirty = cube();
  dirty.triangles = Uint32Array.from([...dirty.triangles, 0, 0, 1]);
  const cleaned = prepareClosedMesh(dirty);
  assert.equal(cleaned.removedDegenerate, 1);
  assert.equal(cleaned.triangles.length / 3, 12);
});

test('a completely inverted closed shell is reoriented for solid operations', () => {
  const inward = cube();
  for (let i = 0; i < inward.triangles.length; i += 3)
    [inward.triangles[i + 1], inward.triangles[i + 2]] =
      [inward.triangles[i + 2], inward.triangles[i + 1]];
  const repaired = prepareClosedMesh(inward);
  assert.equal(repaired.reoriented, true);
  assert.deepEqual(Array.from(repaired.triangles), Array.from(cube().triangles));
});

test('disconnected shells become outward solids while an inner shell remains a cavity', () => {
  const separate = prepareClosedMesh(combineCubes([20, 0, 0], 1, true));
  assert.ok(signedVolume(separate, 0, 12) > 0);
  assert.ok(signedVolume(separate, 12, 24) > 0);
  const cavity = prepareClosedMesh(combineCubes([2, 2, 2], 0.6, false));
  assert.ok(signedVolume(cavity, 0, 12) > 0);
  assert.ok(signedVolume(cavity, 12, 24) < 0);
});
