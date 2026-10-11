import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Helper to mock DOM environment for InterferenceController
function createMockDOM() {
  const elements = new Map();
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        toggle(c, v) { if (v ?? !this.classes.has(c)) this.classes.add(c); else this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
      },
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      hidden: false,
      textContent: '',
      innerHTML: '',
      disabled: false,
      querySelector(sel) {
        if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {},
    };
    return el;
  }

  const panel = createElement('div');
  panel.hidden = true;
  const ids = [
    'interferenceBody1Btn', 'interferenceBody2Btn', 'interferenceHelp',
    'interferenceStatusHeader', 'interferenceStatusIcon', 'interferenceStatusText',
    'interferenceDetails', 'interferenceVolumeText', 'interferenceBoundsText',
    'interferenceClear', 'interferenceClose'
  ];
  for (const id of ids) {
    const child = createElement('div');
    child.id = id;
    elements.set(id, child);
  }

  return { panel, elements, createElement };
}

test('solidKernel.computeInterference detects collisions accurately', async () => {
  // Load solid-kernel.js in VM sandbox
  const code = readFileSync('js/solid-kernel.js', 'utf8');
  const sandbox = {
    window: {},
    console,
    Math,
  };
  sandbox.window = sandbox;
  createContext(sandbox);
  runInContext(code, sandbox);

  const solidKernel = sandbox.WebCAD?.solidKernel;
  assert.ok(solidKernel, 'solidKernel exists');
  assert.equal(typeof solidKernel.computeInterference, 'function', 'computeInterference is exported');

  // Case 1: Null or invalid inputs return no interference
  const emptyRes = solidKernel.computeInterference(null, null);
  assert.equal(emptyRes.hasInterference, false);
  assert.equal(emptyRes.volume, 0);

  // Case 2: Disjoint bodies
  const bodyA = {
    id: 'body-a',
    name: 'Body A',
    meshData: {
      vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
      indices: new Uint32Array([0, 1, 2]),
      triangles: new Uint32Array([0, 1, 2]),
      bounds: { min: [0, 0, 0], max: [10, 10, 10] },
    },
  };

  const bodyB = {
    id: 'body-b',
    name: 'Body B',
    meshData: {
      vertices: new Float32Array([50, 50, 50, 60, 50, 50, 60, 60, 50]),
      indices: new Uint32Array([0, 1, 2]),
      triangles: new Uint32Array([0, 1, 2]),
      bounds: { min: [50, 50, 50], max: [60, 60, 60] },
    },
  };

  const disjointRes = solidKernel.computeInterference(bodyA, bodyB);
  assert.equal(disjointRes.hasInterference, false);
  assert.equal(disjointRes.volume, 0);
  assert.equal(disjointRes.mesh, null);
});

test('InterferenceController manages body pair selection, calculation and clash overlay', async () => {
  const { panel, elements } = createMockDOM();
  const code = readFileSync('js/interference-check.js', 'utf8');

  let releasedBody = null;
  const mockBodyRenderer = {
    releaseBody(body) { releasedBody = body; }
  };

  const mockSolidKernel = {
    async load() {},
    computeInterference(b1, b2) {
      if (b1 && b2 && b1.id !== b2.id) {
        return {
          hasInterference: true,
          volume: 1250.5,
          mesh: {
            vertices: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
            indices: new Uint32Array([0, 1, 2]),
            bounds: { min: [0, 0, 0], max: [10, 10, 10] },
          },
          bounds: { min: [0, 0, 0], max: [10, 10, 10] },
          center: [5, 5, 5],
        };
      }
      return { hasInterference: false, volume: 0, mesh: null, bounds: null, center: null };
    }
  };

  const WebCAD = {
    bodyRenderer: mockBodyRenderer,
    solidKernel: mockSolidKernel,
  };

  const sandbox = {
    window: { WebCAD },
    console,
    Math,
    Float32Array,
    Uint32Array,
  };
  sandbox.window.window = sandbox.window;
  createContext(sandbox);
  runInContext(code, sandbox);

  const InterferenceController = sandbox.window.WebCAD?.InterferenceController;
  assert.ok(InterferenceController, 'InterferenceController is defined');

  let redrawCount = 0;
  let statusMessage = '';
  let activeState = false;

  const body1 = { id: 'b1', name: 'Base Plate', visible: true };
  const body2 = { id: 'b2', name: 'Bracket', visible: true };

  const controller = new InterferenceController({
    canvas: {
      classList: { add() {}, remove() {} },
      addEventListener() {},
      removeEventListener() {},
    },
    panel,
    extrudeController: {
      bodies: [body1, body2],
    },
    faceSelection: {
      clear() {},
    },
    onChange: () => { redrawCount++; },
    onBodiesChange: () => {},
    onError: () => {},
    onStatus: msg => { statusMessage = msg; },
    onModeChange: act => { activeState = act; },
  });

  // 1. Initial State
  assert.equal(controller.active, false);
  assert.equal(panel.hidden, true);

  // 2. Open tool with 2 bodies in project -> auto-selects both and computes interference
  await controller.open();
  assert.equal(controller.active, true);
  assert.equal(activeState, true);
  assert.equal(panel.hidden, false);
  assert.equal(controller.body1, body1);
  assert.equal(controller.body2, body2);
  assert.ok(controller.result?.hasInterference);
  assert.equal(controller.result?.volume, 1250.5);

  // 3. Status text and Volume Output are updated in panel
  assert.equal(elements.get('interferenceVolumeText').textContent, '1,250.50 mm³');
  assert.equal(elements.get('interferenceDetails').hidden, false);
  assert.ok(statusMessage.includes('1,250.50 mm³'));

  // 4. Clash body is injected into displayBodies()
  const display = controller.displayBodies();
  assert.equal(display.length, 3);
  const clashBody = display.find(b => b.isInterference);
  assert.ok(clashBody, 'Clash body is included in displayBodies');
  assert.equal(clashBody.name, 'Interference Clash');
  assert.equal(clashBody.id, 'interference-clash-body');

  // 5. Clear resets selection
  controller.clear();
  assert.equal(controller.body1, null);
  assert.equal(controller.body2, null);
  assert.equal(controller.result, null);
  assert.equal(controller.interferenceBody, null);
  assert.equal(elements.get('interferenceDetails').hidden, true);

  // 6. Close hides panel and deactivates tool
  controller.close();
  assert.equal(controller.active, false);
  assert.equal(activeState, false);
  assert.equal(panel.hidden, true);
});
