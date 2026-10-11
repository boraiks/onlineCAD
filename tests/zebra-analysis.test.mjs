import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

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
      value: '',
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
    'zebraBodyBtn', 'zebraDirHorizontal', 'zebraDirVertical',
    'zebraRepeatsSlider', 'zebraRepeatsOutput', 'zebraOpacitySlider',
    'zebraOpacityOutput', 'zebraPresetFine', 'zebraPresetStd',
    'zebraPresetCoarse', 'zebraClearBtn', 'zebraCloseBtn'
  ];
  for (const id of ids) {
    const child = createElement('div');
    child.id = id;
    elements.set(id, child);
  }

  return { panel, elements, createElement };
}

test('ZebraAnalysisController manages inspection state, parameters, and body targeting', () => {
  const { panel, elements } = createMockDOM();
  const code = readFileSync('js/zebra-analysis.js', 'utf8');

  const WebCAD = {};
  const sandbox = {
    window: { WebCAD },
    console,
    Math,
    Number,
    Boolean,
    String,
    Float32Array,
  };
  sandbox.window.window = sandbox.window;
  createContext(sandbox);
  runInContext(code, sandbox);

  const ZebraAnalysisController = sandbox.window.WebCAD?.ZebraAnalysisController;
  assert.ok(ZebraAnalysisController, 'ZebraAnalysisController is defined');

  let redrawCount = 0;
  let statusMessage = '';
  let activeState = false;

  const body1 = { id: 'b1', name: 'Hood Panel', visible: true };
  const body2 = { id: 'b2', name: 'Fender', visible: true };

  const canvas = {
    classList: { add() {}, remove() {} },
    addEventListener() {},
    removeEventListener() {},
  };

  const controller = new ZebraAnalysisController({
    canvas,
    panel,
    extrudeController: {
      bodies: [body1, body2],
    },
    onChange: () => { redrawCount++; },
    onStatus: msg => { statusMessage = msg; },
    onModeChange: act => { activeState = act; },
  });

  // 1. Initial State
  assert.equal(controller.active, false);
  assert.equal(panel.hidden, true);
  assert.equal(controller.direction, 'horizontal');
  assert.equal(controller.repeats, 30);
  assert.equal(controller.opacity, 0.85);
  assert.equal(controller.selectedBody, null);

  // 2. Open tool -> activates zebra mode on all visible bodies
  controller.open();
  assert.equal(controller.active, true);
  assert.equal(activeState, true);
  assert.equal(panel.hidden, false);
  assert.ok(statusMessage.includes('ZEBRA ANALYSIS'));
  assert.equal(controller.appliesTo(body1), true);
  assert.equal(controller.appliesTo(body2), true);

  // 3. Set specific body to analyze
  controller.setBody(body1);
  assert.equal(controller.selectedBody, body1);
  assert.equal(controller.appliesTo(body1), true);
  assert.equal(controller.appliesTo(body2), false);

  // Toggle same body returns to all bodies
  controller.setBody(body1);
  assert.equal(controller.selectedBody, null);
  assert.equal(controller.appliesTo(body2), true);

  // 4. Adjust direction
  controller.setDirection('vertical');
  assert.equal(controller.direction, 'vertical');
  assert.equal(elements.get('zebraDirVertical').classList.contains('is-active'), true);
  assert.equal(elements.get('zebraDirHorizontal').classList.contains('is-active'), false);

  // 5. Adjust stripe repeats and opacity
  controller.setRepeats(50);
  assert.equal(controller.repeats, 50);
  assert.equal(elements.get('zebraRepeatsOutput').textContent, '50');

  controller.setOpacity(0.5);
  assert.equal(controller.opacity, 0.5);
  assert.equal(elements.get('zebraOpacityOutput').textContent, '50%');

  // 6. Reset restores defaults
  controller.reset();
  assert.equal(controller.direction, 'horizontal');
  assert.equal(controller.repeats, 30);
  assert.equal(controller.opacity, 0.85);
  assert.equal(controller.selectedBody, null);

  // 7. Close deactivates tool
  controller.close();
  assert.equal(controller.active, false);
  assert.equal(activeState, false);
  assert.equal(panel.hidden, true);
  assert.equal(statusMessage, '3D VIEW');
});

test('BodyRenderer implements orthogonal horizontal and vertical zebra reflections and prominent visible edges', () => {
  const code = readFileSync('js/body-renderer.js', 'utf8');

  // Verify zebra shader passes vScreenPos and computes orthogonal reflections
  assert.ok(code.includes('vScreenPos = pos.xy;'), 'vertex shader exports clip-space position for reflection tunnel');
  assert.ok(code.includes('varying vec2 vScreenPos;'), 'fragment shader accepts vScreenPos');
  assert.ok(code.includes('uZebraDirection < 0.5'), 'shader branches on horizontal vs vertical direction');
  assert.ok(code.includes('vScreenPos.y * 0.5 + ry * 0.45'), 'horizontal zebra combines screen Y and reflected ry');
  assert.ok(code.includes('vScreenPos.x * 0.5 + rx * 0.45'), 'vertical zebra combines screen X and reflected rx');

  // Verify visible edge contrast and depth bias
  assert.ok(code.includes('0.08, 0.10, 0.14, 1'), 'visible edges use prominent deep charcoal color');
  assert.ok(code.includes('uDepthBias, 0.00022'), 'depth bias is increased to cleanly prevent coplanar z-fighting stitching');
});

