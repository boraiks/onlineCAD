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
  'solid-bevel.js', 'solid-hole.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

test('Solid Hole - Simple through-hole cuts a cylindrical tunnel in a solid cube', async () => {
  const module = await cad.solidKernel.load();
  const cube = {
    id: 'test-cube-1',
    plane: 'XY',
    points: [[-25, -25], [25, -25], [25, 25], [-25, 25]],
    holes: [],
    start: 0,
    end: 50,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const faces = cad.bodyFaces.patches(cube);
  const topFace = faces.find(f => f.normal[2] > 0.99);
  assert.ok(topFace, 'top face found');

  const plane = cad.bodyFaces.registerPlane(topFace);
  const radius = 5; // 10 mm diameter
  const segments = 64;
  const circlePoints = Array.from({ length: segments }, (_, i) => {
    const angle = (i * 2 * Math.PI) / segments;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });

  const tool = {
    profileId: 'hole-tool',
    plane,
    origin: [...topFace.origin],
    normal: [...topFace.normal],
    points: circlePoints,
    holes: [],
    start: -60, // through the 50mm body
    end: 1.0
  };

  const result = cad.solidKernel.booleanBody(cube, [tool], 'cut');
  assert.ok(result && !result.empty, 'cut succeeded');

  const solid = new module.Manifold(new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles)
  }));

  const expectedVolume = (50 * 50 * 50) - (Math.PI * radius * radius * 50);
  assert.ok(Math.abs(solid.volume() - expectedVolume) < 50, `volume check: ${solid.volume()} vs ${expectedVolume}`);
  solid.delete();
});

test('Solid Hole - Blind hole cuts to exact specified depth', async () => {
  const module = await cad.solidKernel.load();
  const cube = {
    id: 'test-cube-2',
    plane: 'XY',
    points: [[-25, -25], [25, -25], [25, 25], [-25, 25]],
    holes: [],
    start: 0,
    end: 50,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const topFace = cad.bodyFaces.patches(cube).find(f => f.normal[2] > 0.99);
  assert.ok(topFace);

  const plane = cad.bodyFaces.registerPlane(topFace);
  const radius = 5;
  const depth = 20; // Blind depth 20 mm
  const segments = 64;
  const circlePoints = Array.from({ length: segments }, (_, i) => {
    const angle = (i * 2 * Math.PI) / segments;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });

  const tool = {
    profileId: 'hole-blind',
    plane,
    origin: [...topFace.origin],
    normal: [...topFace.normal],
    points: circlePoints,
    holes: [],
    start: -depth,
    end: 1.0
  };

  const result = cad.solidKernel.booleanBody(cube, [tool], 'cut');
  assert.ok(result && !result.empty);

  const solid = new module.Manifold(new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles)
  }));

  const expectedVolume = (50 * 50 * 50) - (Math.PI * radius * radius * depth);
  assert.ok(Math.abs(solid.volume() - expectedVolume) < 40, `blind volume check: ${solid.volume()} vs ${expectedVolume}`);
  solid.delete();
});

test('Solid Hole - Counterbore hole cuts coaxial stepped cylinders', async () => {
  const module = await cad.solidKernel.load();
  const cube = {
    id: 'test-cube-3',
    plane: 'XY',
    points: [[-25, -25], [25, -25], [25, 25], [-25, 25]],
    holes: [],
    start: 0,
    end: 50,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const topFace = cad.bodyFaces.patches(cube).find(f => f.normal[2] > 0.99);
  assert.ok(topFace);

  const plane = cad.bodyFaces.registerPlane(topFace);
  const rMain = 4;
  const rCbore = 8;
  const totalDepth = 55;
  const cboreDepth = 10;
  const segments = 64;

  const mainPoints = Array.from({ length: segments }, (_, i) => {
    const a = (i * 2 * Math.PI) / segments;
    return [rMain * Math.cos(a), rMain * Math.sin(a)];
  });
  const cborePoints = Array.from({ length: segments }, (_, i) => {
    const a = (i * 2 * Math.PI) / segments;
    return [rCbore * Math.cos(a), rCbore * Math.sin(a)];
  });

  const toolMain = {
    profileId: 'tool-main', plane, origin: [...topFace.origin], normal: [...topFace.normal],
    points: mainPoints, holes: [], start: -totalDepth, end: 1.0
  };
  const toolCbore = {
    profileId: 'tool-cbore', plane, origin: [...topFace.origin], normal: [...topFace.normal],
    points: cborePoints, holes: [], start: -cboreDepth, end: 1.0
  };

  const result = cad.solidKernel.booleanBody(cube, [toolMain, toolCbore], 'cut');
  assert.ok(result && !result.empty);

  const solid = new module.Manifold(new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles)
  }));

  const expectedVolume = (50 * 50 * 50) - (Math.PI * rMain * rMain * (50 - cboreDepth) + Math.PI * rCbore * rCbore * cboreDepth);
  assert.ok(Math.abs(solid.volume() - expectedVolume) < 60, `counterbore volume check: ${solid.volume()} vs ${expectedVolume}`);
  solid.delete();
});

test('Solid Hole - Countersink hole cuts conical chamfer entry', async () => {
  const module = await cad.solidKernel.load();
  const cube = {
    id: 'test-cube-4',
    plane: 'XY',
    points: [[-25, -25], [25, -25], [25, 25], [-25, 25]],
    holes: [],
    start: 0,
    end: 50,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);
  const topFace = cad.bodyFaces.patches(cube).find(f => f.normal[2] > 0.99);
  assert.ok(topFace);

  const plane = cad.bodyFaces.registerPlane(topFace);
  const rMain = 4;
  const rCsink = 8;
  const totalDepth = 55;
  const csAngle = 90;
  const hCsink = (rCsink - rMain) / Math.tan((csAngle / 2) * Math.PI / 180); // 4 mm
  const segments = 64;

  const mainPoints = Array.from({ length: segments }, (_, i) => {
    const a = (i * 2 * Math.PI) / segments;
    return [rMain * Math.cos(a), rMain * Math.sin(a)];
  });

  const tools = [{
    profileId: 'tool-main', plane, origin: [...topFace.origin], normal: [...topFace.normal],
    points: mainPoints, holes: [], start: -totalDepth, end: 1.0
  }];

  const numSlices = 16;
  for (let s = 0; s < numSlices; s++) {
    const t = s / numSlices;
    const tNext = (s + 1) / numSlices;
    const rSlice = rMain + (1 - t) * (rCsink - rMain);
    const zStart = -tNext * hCsink;
    const zEnd = s === 0 ? 1.0 : -t * hCsink;
    const slicePoints = Array.from({ length: segments }, (_, i) => {
      const a = (i * 2 * Math.PI) / segments;
      return [rSlice * Math.cos(a), rSlice * Math.sin(a)];
    });
    tools.push({
      profileId: `tool-csink-${s}`, plane, origin: [...topFace.origin], normal: [...topFace.normal],
      points: slicePoints, holes: [], start: zStart, end: zEnd
    });
  }

  const result = cad.solidKernel.booleanBody(cube, tools, 'cut');
  assert.ok(result && !result.empty);

  const solid = new module.Manifold(new module.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(result.mesh.vertices),
    triVerts: new Uint32Array(result.mesh.triangles)
  }));

  // Volume of cone frustum: (pi * h / 3) * (R^2 + r^2 + R*r)
  const frustumVolume = (Math.PI * hCsink / 3) * (rCsink * rCsink + rMain * rMain + rCsink * rMain);
  const mainVolumeBelowFrustum = Math.PI * rMain * rMain * (50 - hCsink);
  const expectedCutVolume = frustumVolume + mainVolumeBelowFrustum;
  const expectedRemainingVolume = (50 * 50 * 50) - expectedCutVolume;

  assert.ok(Math.abs(solid.volume() - expectedRemainingVolume) < 80, `countersink volume check: ${solid.volume()} vs ${expectedRemainingVolume}`);
  solid.delete();
});

test('Solid Hole - SolidHoleController interactive flow selects face, updates preview, and commits hole', async () => {
  await cad.solidKernel.load();
  const cube = {
    id: 'body-interactive',
    name: 'Body 1',
    plane: 'XY',
    points: [[-20, -20], [20, -20], [20, 20], [-20, 20]],
    holes: [],
    start: 0,
    end: 40,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const fakePanel = {
    querySelector: selector => {
      const el = {
        hidden: false,
        disabled: false,
        value: '',
        textContent: '',
        addEventListener: () => {},
        setAttribute: () => {}
      };
      if (selector === '#solidHoleType') el.value = 'simple';
      if (selector === '#solidHoleExtents') el.value = 'all';
      if (selector === '#solidHoleDiameter') el.value = '10';
      if (selector === '#solidHoleDepth') el.value = '20';
      return el;
    }
  };

  const fakeCanvas = {
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  const executedCommands = [];
  const fakeHistory = {
    execute: cmd => {
      executedCommands.push(cmd);
      cmd.execute();
    }
  };

  const bodies = [cube];
  const extrudeController = {
    bodies,
    render: () => {}
  };

  const controller = new cad.SolidHoleController({
    canvas: fakeCanvas,
    panel: fakePanel,
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
  await controller.open();
  assert.equal(controller.active, true);

  const faces = cad.bodyFaces.patches(cube);
  const topFace = faces.find(f => f.normal[2] > 0.99);
  assert.ok(topFace);

  controller.selectFace(topFace, [0, 0, 40]);
  assert.ok(controller.preview, 'preview computed on face select');
  assert.equal(controller.okBtn.disabled, false);

  const beforeMeshLength = cube.mesh.vertices.length;
  controller.commit();
  assert.equal(controller.active, false);
  assert.equal(executedCommands.length, 1);
  assert.notEqual(extrudeController.bodies[0], cube, 'body replaced with drilled body');
  assert.ok(extrudeController.bodies[0].mesh.vertices.length > beforeMeshLength, 'mesh contains cylindrical hole vertices');

  // Test undo
  executedCommands[0].undo();
  assert.equal(extrudeController.bodies[0], cube, 'undo restores original cube');

  // Test redo
  executedCommands[0].redo();
  assert.notEqual(extrudeController.bodies[0], cube, 'redo restores drilled body');
});

test('Solid Hole - Floating HUD card updates, synchronizes inputs and positions near hole', async () => {
  await cad.solidKernel.load();
  const cube = {
    id: 'body-hud-test',
    name: 'Test Block',
    plane: 'XY',
    points: [[-25, -25], [25, -25], [25, 25], [-25, 25]],
    holes: [],
    start: 0,
    end: 50,
    normal: [0, 0, 1]
  };
  cube.mesh = cad.solidKernel.meshBody(cube);

  const hudElements = new Map([
    ['#solidHoleHudOperation', { textContent: '' }],
    ['#solidHoleHudType', { textContent: '' }],
    ['#solidHoleHudExtents', { textContent: '' }],
    ['#solidHoleHudDiameter', { value: '10', listeners: new Map() }],
    ['#solidHoleHudDepth', { value: '20', listeners: new Map() }],
    ['#solidHoleHudDepthRow', { hidden: true }],
    ['#solidHoleHudCboreDia', { value: '16', listeners: new Map() }],
    ['#solidHoleHudCboreDiaRow', { hidden: true }],
    ['#solidHoleHudCboreDepth', { value: '5', listeners: new Map() }],
    ['#solidHoleHudCboreDepthRow', { hidden: true }],
    ['#solidHoleHudCsinkDia', { value: '15', listeners: new Map() }],
    ['#solidHoleHudCsinkDiaRow', { hidden: true }],
    ['#solidHoleHudCsinkAngle', { value: '90', listeners: new Map() }],
    ['#solidHoleHudCsinkAngleRow', { hidden: true }]
  ]);

  for (const el of hudElements.values()) {
    if (el.listeners) {
      el.addEventListener = (evt, fn) => el.listeners.set(evt, fn);
    }
  }

  const fakeHud = {
    hidden: true,
    style: { left: '', top: '' },
    offsetWidth: 180,
    offsetHeight: 90,
    querySelector: sel => hudElements.get(sel) || null
  };

  const panelElements = new Map([
    ['#solidHoleTitle', { textContent: 'HOLE' }],
    ['#solidHoleHelp', { textContent: '' }],
    ['#solidHoleFace', { textContent: '' }],
    ['#solidHoleType', { value: 'simple', listeners: new Map() }],
    ['#solidHoleExtents', { value: 'all', listeners: new Map() }],
    ['#solidHoleDiameter', { value: '10', listeners: new Map() }],
    ['#solidHoleDepthRow', { hidden: true }],
    ['#solidHoleDepth', { value: '20', listeners: new Map() }],
    ['#solidHoleCboreFields', { hidden: true }],
    ['#solidHoleCboreDia', { value: '16', listeners: new Map() }],
    ['#solidHoleCboreDepth', { value: '5', listeners: new Map() }],
    ['#solidHoleCsinkFields', { hidden: true }],
    ['#solidHoleCsinkDia', { value: '15', listeners: new Map() }],
    ['#solidHoleCsinkAngle', { value: '90', listeners: new Map() }],
    ['#solidHoleOk', { disabled: true, listeners: new Map() }],
    ['#solidHoleCancel', { listeners: new Map() }]
  ]);

  for (const el of panelElements.values()) {
    if (el.listeners) {
      el.addEventListener = (evt, fn) => el.listeners.set(evt, fn);
    }
  }

  const fakePanel = {
    hidden: true,
    querySelector: sel => panelElements.get(sel) || null
  };

  const fakeCanvas = {
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  const controller = new cad.SolidHoleController({
    canvas: fakeCanvas,
    panel: fakePanel,
    hud: fakeHud,
    camera: new cad.Camera(),
    extrudeController: { bodies: [cube], render: () => {} },
    history: { execute: cmd => cmd.execute() },
    onChange: () => {},
    onBodiesChange: () => {},
    onStatus: () => {},
    onModeChange: () => {},
    onError: () => {}
  });

  await controller.open();
  assert.equal(fakeHud.hidden, true, 'HUD hidden before face selection');

  const faces = cad.bodyFaces.patches(cube);
  const topFace = faces.find(f => f.normal[2] > 0.99);
  controller.selectFace(topFace, [0, 0, 50]);

  // Project fake screen coordinates
  controller.renderHud(pt => [400, 300]);
  assert.equal(fakeHud.hidden, false, 'HUD shown when face is selected');
  assert.equal(hudElements.get('#solidHoleHudOperation').textContent, 'CUT');
  assert.equal(hudElements.get('#solidHoleHudType').textContent, 'Simple');
  assert.equal(hudElements.get('#solidHoleHudExtents').textContent, 'Through All');
  assert.equal(hudElements.get('#solidHoleHudDiameter').value, '10');
  assert.ok(fakeHud.style.left.includes('px'), 'HUD left position styled');
  assert.ok(fakeHud.style.top.includes('px'), 'HUD top position styled');

  // Test live typing in HUD diameter
  hudElements.get('#solidHoleHudDiameter').value = '18';
  hudElements.get('#solidHoleHudDiameter').listeners.get('input')();
  assert.equal(panelElements.get('#solidHoleDiameter').value, '18', 'panel diameter updated from HUD');

  // Test switching type to counterbore
  panelElements.get('#solidHoleType').value = 'counterbore';
  panelElements.get('#solidHoleType').listeners.get('change')();
  controller.renderHud(pt => [400, 300]);
  assert.equal(hudElements.get('#solidHoleHudType').textContent, 'Counterbore');
  assert.equal(hudElements.get('#solidHoleHudCboreDiaRow').hidden, false);
  assert.equal(hudElements.get('#solidHoleHudCboreDepthRow').hidden, false);

  // Close hides HUD
  controller.close();
  assert.equal(fakeHud.hidden, true, 'HUD hidden on close');
});


