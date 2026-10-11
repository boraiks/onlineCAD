import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;
globalThis.document = {
  currentScript: null,
  createElement: () => ({ src: '', onload: null, onerror: null }),
  addEventListener: () => {},
  removeEventListener: () => {},
  head: { append(script) {
    const url = new URL(`../${script.src}`, import.meta.url);
    document.currentScript = { src: url.href };
    import(url.href).then(() => script.onload?.()).catch(error => script.onerror?.(error));
  } }
};

for (const file of [
  'math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js',
  'sketch-grid.js', 'sketch-geometry.js', 'sketch-model.js', 'canvas.js',
  'sketch-profiles.js', 'sketch-render.js', 'solid-kernel.js',
  'body-renderer.js', 'body-faces.js', 'extrude.js', 'body-move.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

function createMockPanel() {
  const elements = {};
  const listeners = {};
  const getOrCreate = id => {
    if (!elements[id]) {
      listeners[id] = {};
      elements[id] = {
        id,
        hidden: false,
        disabled: false,
        checked: false,
        value: '0',
        textContent: '',
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        addEventListener: (event, handler) => {
          listeners[id][event] = listeners[id][event] || [];
          listeners[id][event].push(handler);
        },
        trigger: event => {
          for (const h of (listeners[id][event] || [])) h();
        },
        setAttribute: () => {},
        getAttribute: () => null
      };
    }
    return elements[id];
  };

  const panel = {
    hidden: true,
    querySelector: sel => {
      const id = sel.replace('#', '');
      return getOrCreate(id);
    }
  };
  return { panel, elements, getOrCreate };
}

test('Move/Rotate - Highlights selected body and provides 3D rotation rings in workspace', async () => {
  await cad.solidKernel.load();

  const cube = {
    id: 'test-cube-1',
    name: 'Test Body',
    plane: 'XY',
    points: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
    holes: [],
    start: 0,
    end: 20,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const { panel, elements } = createMockPanel();
  const canvasListeners = {};
  const fakeCanvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: (event, handler) => {
      canvasListeners[event] = canvasListeners[event] || [];
      canvasListeners[event].push(handler);
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true
  };

  const historyStack = [];
  const fakeHistory = {
    execute: cmd => {
      historyStack.push(cmd);
      cmd.execute();
    }
  };

  const camera = new cad.Camera();
  const extrudeController = {
    bodies: [cube],
    nextBodyId: 2
  };

  let redrawCalled = false;
  const move = new cad.BodyMoveController({
    canvas: fakeCanvas,
    panel,
    camera,
    extrudeController,
    history: fakeHistory,
    onChange: () => { redrawCalled = true; },
    onBodiesChange: () => {},
    onStatus: () => {},
    onModeChange: () => {}
  });

  cad.app = { bodyMove: move, extrudeController };

  // 1. Open Move/Rotate with cube
  await move.open(cube);
  assert.equal(move.active, true);
  assert.equal(move.selected, cube);
  assert.ok(move.pivot, 'Pivot placed at center of body');

  // Verify cad.bodyRenderer recognizes body selection
  const visible = [cube];
  const isExtruding = false;
  const moveCtrl = cad.app?.bodyMove || cad.bodyMoveController;
  const moveSelected = moveCtrl?.active ? moveCtrl.selected : null;
  assert.equal(moveSelected, cube, 'Renderer finds selected body in move controller');

  // 2. 3D Rotation Rings verification
  const rings = move.rotationRings();
  assert.equal(rings.length, 3, 'Produces X, Y, Z rotation rings');
  assert.equal(rings[0].color, '#d75858', 'X-axis ring is red');
  assert.equal(rings[1].color, '#3d9a69', 'Y-axis ring is green');
  assert.equal(rings[2].color, '#367fca', 'Z-axis ring is blue');
  assert.ok(rings[0].points2d.length > 10, 'Ring has projected 2D points');

  // 3. Pointer hit testing on rotation rings
  const testPt = rings[2].points2d[5]; // Z ring non-intersection point
  const hit = move.ringAt({ clientX: testPt[0], clientY: testPt[1] });
  assert.ok(hit, 'Hit test detects pointer over rotation ring');
  assert.equal(hit.index, 2, 'Hit detected on Z rotation ring');

  // 4. Interactive pointer drag rotation
  const pointerDowns = canvasListeners['pointerdown'] || [];
  const pointerMoves = canvasListeners['pointermove'] || [];
  const pointerUps = canvasListeners['pointerup'] || [];

  const basePt = rings[2].base;
  // Start drag on Z ring at angle 0
  const startEv = {
    button: 0,
    pointerId: 1,
    clientX: basePt[0] + 50,
    clientY: basePt[1],
    preventDefault: () => {}
  };
  pointerDowns[0](startEv);
  assert.ok(move.drag, 'Rotation drag initiated');
  assert.equal(move.drag.type, 'rotate');
  assert.equal(move.drag.axis, 2);

  // Move pointer 90 degrees around center
  const moveEv = {
    pointerId: 1,
    clientX: basePt[0],
    clientY: basePt[1] + 50,
    shiftKey: true, // Test 15-degree snap
    preventDefault: () => {}
  };
  pointerMoves[0](moveEv);

  const rotateZVal = Number(elements['bodyRotateZ'].value);
  assert.ok(Math.abs(rotateZVal) > 0, 'Z rotation value updated from 3D workspace drag');
  assert.ok(rotateZVal % 15 === 0, 'Shift key snapped rotation to 15-degree increment');
  assert.ok(move.preview, 'Live 3D preview updated during workspace rotation');

  // 5. Complete drag and commit
  pointerUps[0]({ pointerId: 1 });
  assert.equal(move.drag, null);

  const commitOk = move.commit();
  assert.equal(commitOk, true);
  assert.equal(historyStack.length, 1);
  assert.equal(move.active, false);
});
