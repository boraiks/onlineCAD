import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sandbox = {};
runInNewContext(readFileSync(new URL('../js/surface-finish-core.js', import.meta.url), 'utf8'), sandbox);
const { compute, SurfaceFinishController } = sandbox.WebCADSurfaceFinishCore;

test('CAD finish hides cube triangulation while retaining twelve sharp edges', () => {
  const mesh = {
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
  const result = compute(mesh, 42);
  assert.equal(result.featurePairs.length / 2, 12);
  assert.equal(result.cornerNormals.length, mesh.triangles.length * 3);
  assert.ok(result.cornerNormals[2] < -0.99);
});

test('CAD finish welds STL seams and smooths only below the chosen crease angle', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 2e-8, 0, 0, 0, -1, 0.364];
  const mesh = { vertices: Float32Array.from(positions),
    triangles: new Uint32Array([0, 1, 2, 3, 4, 5]) };
  const smooth = compute(mesh, 42);
  assert.equal(smooth.featurePairs.length / 2, 4);
  assert.ok(smooth.cornerNormals[1] > 0.05, 'the first facet receives its neighbour’s normal');
  const sharp = compute(mesh, 10);
  assert.equal(sharp.featurePairs.length / 2, 5);
  assert.ok(Math.abs(sharp.cornerNormals[1]) < 1e-5, 'the 20° crease remains sharp at 10°');
});

test('SurfaceFinishController supports open, select body, preview and undoable commit', () => {
  const body = {
    id: 1,
    name: 'Bracket',
    meshSource: 'import',
    mesh: { vertices: new Float32Array(9), triangles: new Uint32Array(3) },
    surfaceFinishAngle: 0,
    visible: true,
  };

  const elements = {};
  const mockPanel = {
    hidden: true,
    querySelector(selector) {
      if (!elements[selector]) {
        elements[selector] = {
          textContent: '',
          value: '42',
          disabled: false,
          hidden: false,
          classList: {
            toggle(cls, state) { this[cls] = Boolean(state); },
          },
          addEventListener() {},
        };
      }
      return elements[selector];
    },
  };

  const historyActions = [];
  const mockHistory = {
    execute(action) {
      historyActions.push(action);
      action.execute();
    },
  };

  const controller = new SurfaceFinishController({
    canvas: {},
    panel: mockPanel,
    extrudeController: { bodies: [body] },
    history: mockHistory,
  });

  // Open without initial body
  controller.open(null);
  assert.equal(controller.active, true);
  assert.equal(mockPanel.hidden, false);
  assert.equal(controller.selectedBody, null);
  assert.equal(elements['#surfaceFinishSelection'].textContent, 'Select mesh body');
  assert.equal(elements['#surfaceFinishOk'].disabled, true);

  // Select body
  controller.setBody(body);
  assert.equal(controller.selectedBody, body);
  assert.equal(elements['#surfaceFinishSelection'].textContent, 'Bracket');
  assert.equal(elements['#surfaceFinishOk'].disabled, false);

  // Select CAD Smooth 42° and commit
  controller.styleSelect.value = '42';
  controller.commit();
  assert.equal(body.surfaceFinishAngle, 42);
  assert.equal(historyActions.length, 1);

  // Undo reverts
  historyActions[0].undo();
  assert.equal(body.surfaceFinishAngle, 0);

  // Redo re-applies
  historyActions[0].redo();
  assert.equal(body.surfaceFinishAngle, 42);

  controller.close();
  assert.equal(controller.active, false);
  assert.equal(mockPanel.hidden, true);
});

test('SurfaceFinishController requires mesh body selection before applying', () => {
  const body = {
    id: 2,
    name: 'MeshBody',
    meshSource: 'import',
    mesh: { vertices: new Float32Array(9), triangles: new Uint32Array(3) },
    surfaceFinishAngle: 0,
    visible: true,
  };

  const elements = {};
  const mockPanel = {
    hidden: true,
    querySelector(selector) {
      if (!elements[selector]) {
        elements[selector] = {
          textContent: '',
          value: '42',
          disabled: false,
          hidden: false,
          classList: {
            _set: new Set(),
            toggle(cls, val) { if (val) this._set.add(cls); else this._set.delete(cls); },
            contains(cls) { return this._set.has(cls); },
          },
          addEventListener() {},
        };
      }
      return elements[selector];
    },
  };

  const controller = new SurfaceFinishController({
    canvas: {},
    panel: mockPanel,
    extrudeController: { bodies: [body] },
  });

  // When clicking CAD Surface in Mesh tab, it opens with selection prompt
  controller.open(null);
  assert.equal(controller.active, true);
  assert.equal(controller.selectedBody, null);
  assert.equal(elements['#surfaceFinishSelection'].textContent, 'Select mesh body');
  assert.equal(elements['#surfaceFinishOk'].disabled, true, 'Apply is disabled until body selected');

  // Committing without body does not proceed
  assert.equal(controller.commit(), false);

  // User selects mesh
  controller.setBody(body);
  assert.equal(controller.selectedBody, body);
  assert.equal(elements['#surfaceFinishSelection'].textContent, 'MeshBody');
  assert.equal(elements['#surfaceFinishOk'].disabled, false, 'Apply enabled once body selected');

  controller.close();
});

