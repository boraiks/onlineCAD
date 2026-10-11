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
  'body-renderer.js', 'body-faces.js', 'extrude.js', 'body-move.js',
  'solid-bevel.js', 'body-pattern.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

function createMockPanel() {
  const elements = {};
  const getOrCreate = id => {
    if (!elements[id]) {
      elements[id] = {
        id,
        hidden: false,
        disabled: false,
        value: '',
        textContent: '',
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        addEventListener: () => {},
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
      const el = getOrCreate(id);
      if (id === 'bodyPatternDir1Axis') el.value = 'X';
      if (id === 'bodyPatternDir1Count') el.value = '3';
      if (id === 'bodyPatternDir1Dist') el.value = '20';
      if (id === 'bodyPatternDir2Axis') el.value = 'Y';
      if (id === 'bodyPatternDir2Count') el.value = '2';
      if (id === 'bodyPatternDir2Dist') el.value = '30';
      if (id === 'bodyPatternCircAxis') el.value = 'Z';
      if (id === 'bodyPatternCircCount') el.value = '4';
      if (id === 'bodyPatternCircAngle') el.value = '360';
      return el;
    }
  };
  return { panel, elements };
}

test('Body Pattern - Rectangular pattern generates correct 2D grid copies with undo/redo', async () => {
  await cad.solidKernel.load();
  const cube = {
    id: 'pattern-cube-1',
    name: 'Base Body',
    plane: 'XY',
    points: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
    holes: [],
    start: 0,
    end: 20,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const { panel } = createMockPanel();
  const fakeCanvas = {
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {}
  };

  const historyStack = [];
  const fakeHistory = {
    execute: cmd => {
      historyStack.push(cmd);
      cmd.execute();
    }
  };

  const bodies = [cube];
  const extrudeController = { bodies };

  const controller = new cad.BodyPatternController({
    canvas: fakeCanvas,
    panel,
    camera: new cad.Camera(),
    extrudeController,
    history: fakeHistory,
    onChange: () => {},
    onBodiesChange: () => {},
    onStatus: () => {},
    onModeChange: () => {},
    onError: () => {}
  });

  assert.equal(controller.active, false);
  const opened = await controller.open('rectangular', cube);
  assert.equal(opened, true);
  assert.equal(controller.active, true);
  assert.equal(controller.mode, 'rectangular');

  // Dir1 count: 3, Dir2 count: 2 -> total copies = 3 * 2 - 1 = 5 preview copies
  assert.equal(controller.previewCopies.length, 5, '3x2 rectangular pattern produces 5 new copies');

  const beforeBodyCount = extrudeController.bodies.length;
  assert.equal(beforeBodyCount, 1);

  // Commit pattern
  const committed = controller.commit();
  assert.equal(committed, true);
  assert.equal(controller.active, false);
  assert.equal(extrudeController.bodies.length, 6, '1 base body + 5 patterned bodies = 6 bodies');

  // Verify meshes on copies are valid
  for (const b of extrudeController.bodies) {
    assert.ok(b.mesh && b.mesh.vertices.length > 0, 'body has valid geometry');
  }

  // Test Undo
  assert.equal(historyStack.length, 1);
  historyStack[0].undo();
  assert.equal(extrudeController.bodies.length, 1, 'undo restores original 1 body');

  // Test Redo
  historyStack[0].redo();
  assert.equal(extrudeController.bodies.length, 6, 'redo restores 6 bodies');
});

test('Body Pattern - Circular pattern generates radial rotated copies around specified axis', async () => {
  await cad.solidKernel.load();
  const cylinder = {
    id: 'pattern-cyl-1',
    name: 'Cylinder',
    plane: 'XY',
    points: Array.from({ length: 32 }, (_, i) => {
      const a = (i * Math.PI * 2) / 32;
      return [10 + 5 * Math.cos(a), 5 * Math.sin(a)]; // offset from origin
    }),
    holes: [],
    start: 0,
    end: 15,
    normal: [0, 0, 1]
  };
  cylinder.mesh = cad.solidKernel.meshBody(cylinder);

  const { panel } = createMockPanel();
  const fakeCanvas = {
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {}
  };

  const historyStack = [];
  const fakeHistory = {
    execute: cmd => {
      historyStack.push(cmd);
      cmd.execute();
    }
  };

  const bodies = [cylinder];
  const extrudeController = { bodies };

  const controller = new cad.BodyPatternController({
    canvas: fakeCanvas,
    panel,
    camera: new cad.Camera(),
    extrudeController,
    history: fakeHistory,
    onChange: () => {},
    onBodiesChange: () => {},
    onStatus: () => {},
    onModeChange: () => {},
    onError: () => {}
  });

  const opened = await controller.open('circular', cylinder);
  assert.equal(opened, true);
  assert.equal(controller.mode, 'circular');

  // Circ count is 4 -> produces 3 new copies
  assert.equal(controller.previewCopies.length, 3, '4-count circular pattern produces 3 copies');

  controller.commit();
  assert.equal(extrudeController.bodies.length, 4, '1 original + 3 copies = 4 bodies');

  // Undo restores
  historyStack[0].undo();
  assert.equal(extrudeController.bodies.length, 1);
});
