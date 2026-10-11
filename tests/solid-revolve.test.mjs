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
  head: {
    append(script) {
      const url = new URL(`../${script.src}`, import.meta.url);
      document.currentScript = { src: url.href };
      import(url.href).then(() => script.onload?.()).catch(error => script.onerror?.(error));
    }
  }
};

for (const file of [
  'math.js', 'orientation.js', 'settings.js', 'camera.js', 'planes.js',
  'sketch-grid.js', 'sketch-geometry.js', 'sketch-model.js', 'canvas.js',
  'sketch-profiles.js', 'sketch-render.js', 'solid-kernel.js',
  'body-renderer.js', 'body-faces.js', 'extrude.js', 'solid-revolve.js'
]) {
  const url = new URL(`../js/${file}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: file });
}

const cad = window.WebCAD;

function meshVolume(mesh) {
  let vol = 0;
  const vertices = mesh.vertices || mesh.vertProperties;
  const triangles = mesh.triangles || mesh.triVerts;
  const numProps = mesh.numProp || 3;
  const getV = idx => [vertices[idx * numProps], vertices[idx * numProps + 1], vertices[idx * numProps + 2]];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = getV(triangles[i]);
    const b = getV(triangles[i + 1]);
    const c = getV(triangles[i + 2]);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) +
            a[1] * (b[2] * c[0] - b[0] * c[2]) +
            a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}

test('Solid Revolve - 360 degree revolve of rectangle creates solid cylinder', async () => {
  await cad.solidKernel.load();

  // Profile: rectangle in XY plane from x=0..10, y=0..20
  // Revolved 360 deg around Y-axis (point: [0, 0], dir: [0, 1])
  const profile = {
    id: 'prof-rect-1',
    plane: 'XY',
    points: [[0, 0], [10, 0], [10, 20], [0, 20]],
    holes: []
  };

  const body = cad.solidKernel.revolveProfile(profile, {
    axisLine: { point: [0, 0], dir: [0, 1] },
    angle: 360,
    slices: 64,
    operation: 'new'
  });

  assert.ok(body, 'revolve body was created');
  assert.ok(body.mesh, 'mesh exists');
  assert.ok(body.mesh.triangles.length > 0, 'triangles generated');

  const expectedVol = Math.PI * 10 * 10 * 20; // ~6283.185
  const actualVol = meshVolume(body.mesh);
  const diffPct = Math.abs(actualVol - expectedVol) / expectedVol;

  assert.ok(diffPct < 0.03, `Volume should match cylinder (~6283), got ${actualVol}`);
});

test('Solid Revolve - 180 degree revolve produces half cylinder volume', async () => {
  await cad.solidKernel.load();

  const profile = {
    id: 'prof-rect-2',
    plane: 'XY',
    points: [[0, 0], [10, 0], [10, 20], [0, 20]],
    holes: []
  };

  const body = cad.solidKernel.revolveProfile(profile, {
    axisLine: { point: [0, 0], dir: [0, 1] },
    angle: 180,
    slices: 64,
    operation: 'new'
  });

  assert.ok(body, 'half revolve body was created');
  const expectedVol = (Math.PI * 10 * 10 * 20) / 2; // ~3141.59
  const actualVol = meshVolume(body.mesh);
  const diffPct = Math.abs(actualVol - expectedVol) / expectedVol;

  assert.ok(diffPct < 0.03, `Volume should match half-cylinder (~3141), got ${actualVol}`);
});

test('Solid Revolve - Offset rectangle revolves into hollow pipe', async () => {
  await cad.solidKernel.load();

  // Profile: rectangle from x=5..10, y=0..20 (inner radius 5, outer radius 10)
  const profile = {
    id: 'prof-tube-1',
    plane: 'XY',
    points: [[5, 0], [10, 0], [10, 20], [5, 20]],
    holes: []
  };

  const body = cad.solidKernel.revolveProfile(profile, {
    axisLine: { point: [0, 0], dir: [0, 1] },
    angle: 360,
    slices: 64,
    operation: 'new'
  });

  assert.ok(body, 'hollow pipe body was created');
  const expectedVol = Math.PI * (100 - 25) * 20; // PI * 75 * 20 ~ 4712.389
  const actualVol = meshVolume(body.mesh);
  const diffPct = Math.abs(actualVol - expectedVol) / expectedVol;

  assert.ok(diffPct < 0.03, `Volume should match hollow pipe (~4712), got ${actualVol}`);
});

test('Solid Revolve - Revolve with Cut boolean removes rotational cavity from block', async () => {
  await cad.solidKernel.load();

  // Target body: 60x60x60 cube
  const target = {
    id: 'block-target',
    plane: 'XY',
    points: [[-30, -30], [30, -30], [30, 30], [-30, 30]],
    holes: [],
    start: -30,
    end: 30,
    normal: [0, 0, 1]
  };
  target.mesh = cad.solidKernel.meshBody(target);
  const origVol = meshVolume(target.mesh);

  // Revolve cutter: cylinder r=10, h=40 centered
  const cutterProfile = {
    id: 'cut-prof',
    plane: 'XY',
    points: [[0, -20], [10, -20], [10, 20], [0, 20]],
    holes: []
  };

  const cutBody = cad.solidKernel.revolveProfile(cutterProfile, {
    axisLine: { point: [0, 0], dir: [0, 1] },
    angle: 360,
    slices: 64,
    operation: 'cut',
    targetBody: target
  });

  assert.ok(cutBody, 'cut result body created');
  const cutVol = meshVolume(cutBody.mesh);
  const cylinderVol = Math.PI * 10 * 10 * 40; // ~12566.37
  assert.ok(cutVol < origVol, 'cut body has less volume than original');
  assert.ok(Math.abs((origVol - cutVol) - cylinderVol) / cylinderVol < 0.03, 'cut volume matches removed cylinder');
});

test('Solid Revolve - SolidRevolveController workflow with UI synchronization, preview, and history', async () => {
  await cad.solidKernel.load();

  // Mock HUD DOM elements
  const elements = {};
  const mockHud = {
    hidden: true,
    querySelector(sel) {
      if (!elements[sel]) {
        elements[sel] = {
          value: '',
          textContent: '',
          disabled: false,
          classList: {
            toggle: (cls, on) => {},
            add: cls => {},
            remove: cls => {}
          },
          addEventListener: (evt, fn) => {
            elements[sel]['on' + evt] = fn;
          }
        };
      }
      return elements[sel];
    },
    querySelectorAll(sel) {
      return [];
    }
  };

  const committedHistory = [];
  const mockHistory = {
    execute(cmd) {
      committedHistory.push(cmd);
      cmd.execute();
    }
  };

  let bodiesList = [];
  const mockExtrude = {
    get bodies() { return bodiesList; },
    set bodies(b) { bodiesList = b; }
  };

  const controller = new cad.SolidRevolveController({
    canvas: { addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    hud: mockHud,
    camera: { project: () => [100, 100] },
    extrudeController: mockExtrude,
    sketchProfiles: cad.sketchProfiles,
    history: mockHistory,
    onChange: () => {},
    onBodiesChange: () => {},
    onStatus: () => {},
    onError: () => {}
  });

  const testProfile = {
    id: 'test-revolve-profile',
    plane: 'XY',
    points: [[0, 0], [15, 0], [15, 30], [0, 30]],
    holes: []
  };

  controller.open(testProfile);
  assert.equal(controller.active, true, 'controller is active');
  assert.equal(mockHud.hidden, false, 'HUD is visible');
  assert.ok(controller.preview, 'preview generated');

  // Change angle to 180
  controller.angle = 180;
  controller.updatePreview();
  assert.ok(controller.preview, 'preview updated for 180 degrees');

  // Commit
  const success = controller.commit();
  assert.equal(success, true, 'commit succeeded');
  assert.equal(controller.active, false, 'controller closed after commit');
  assert.equal(committedHistory.length, 1, 'history recorded');
  assert.equal(bodiesList.length, 1, 'body added to bodiesList');

  // Undo
  committedHistory[0].undo();
  assert.equal(bodiesList.length, 0, 'undo removed body');

  // Redo
  committedHistory[0].redo();
  assert.equal(bodiesList.length, 1, 'redo restored body');
});
