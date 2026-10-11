import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const sandbox = { window: { WebCAD: {} } };
for (const file of ['js/math.js', 'js/orientation.js', 'js/planes.js', 'js/shortcuts.js', 'js/settings.js', 'js/camera.js', 'js/history.js', 'js/sketch-grid.js', 'js/sketch-geometry.js', 'js/sketch-model.js', 'js/sketch-hit-test.js', 'js/sketch-snap.js', 'js/sketch-chain.js', 'js/sketch-constraints.js', 'js/canvas.js', 'js/sketch-profiles.js', 'js/sketch-render.js', 'js/sketch-dimensions.js', 'js/sketch-angle.js', 'js/sketch-distance.js', 'js/sketch-fillet.js', 'js/sketch-trim.js', 'js/sketch-mirror.js', 'js/sketch-pattern.js', 'js/sketch-wheel.js', 'js/toolbar-menu.js', 'js/sketch-cursor.js', 'js/sketch-profile-selection.js', 'js/extrude.js', 'js/model-view.js', 'js/sketch-tool.js']) {
  runInNewContext(readFileSync(new URL(file, root), 'utf8'), sandbox, { filename: file });
}
const cad = sandbox.window.WebCAD;

test('camera projector matches single-point projection across views, pan and pivot', () => {
  const camera = new cad.Camera();
  camera.pan(37, -19);
  camera.zoom = 1.65;
  camera.pivot = [8, -4, 2];
  const originalPivot = cad.settings.cameraPivot;
  try {
    for (const usePivot of [false, true]) {
      cad.settings.cameraPivot = usePivot;
      for (const view of ['top', 'front', 'right']) {
        camera.selectView(view);
        const fastProject = camera.projector(1217, 713);
        for (const point of [[0, 0, 0], [17.5, -8, 3], [-100, 90, -45]]) {
          const expected = camera.project(point, 1217, 713);
          const actual = fastProject(point);
          assert.ok(Math.abs(actual[0] - expected[0]) < 1e-9);
          assert.ok(Math.abs(actual[1] - expected[1]) < 1e-9);
        }
      }
    }
  } finally {
    cad.settings.cameraPivot = originalPivot;
  }
});

test('model grid batches its many lines into a small number of strokes', () => {
  const view = Object.create(cad.ModelView.prototype);
  view.visibility = { origin: true, X: true, Y: true, Z: true };
  view.gridPlane = 'XY';
  view.grid = { u: [1, 0, 0], v: [0, 1, 0], colors: ['#ff0000', '#00ff00', '#0000ff'] };
  view.camera = { panX: 0, panY: 0 };
  let segments = 0;
  let strokes = 0;
  const context = {
    beginPath() {}, moveTo() {}, lineTo() { segments++; }, stroke() { strokes++; },
    save() {}, restore() {}, setLineDash() {}, transform() {}, fillText() {},
  };
  view.drawGrid(context, point => [600 + point[0] * 6, 400 - point[1] * 6], 6, 1200, 800);
  assert.ok(segments > 100, 'the viewport contains many grid lines');
  assert.ok(strokes <= 10, 'grid lines share stroke calls by style');
});

test('bottom view modes use left drag for orbit, pan and zoom', () => {
  const events = new Map();
  const calls = [];
  const classes = { add() {}, toggle() {} };
  const view = Object.create(cad.ModelView.prototype);
  view.canvas = { addEventListener: (name, handler) => events.set(name, handler),
    setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 650 }) };
  view.pane = { classList: classes };
  view.camera = { startPan() { calls.push('startPan'); }, pan() { calls.push('pan'); },
    orbit() { calls.push('orbit'); }, zoomAt() { calls.push('zoom'); } };
  view.onCameraChange = () => {};
  view.bindEvents();
  for (const mode of ['orbit', 'pan', 'zoom']) {
    view.setNavigationMode(mode);
    events.get('pointerdown')({ pointerType: 'mouse', button: 0, pointerId: 1,
      clientX: 100, clientY: 100, preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(view.drag.mode, mode);
    events.get('pointermove')({ pointerId: 1, clientX: 110, clientY: 120,
      stopImmediatePropagation() {} });
    assert.ok(calls.includes(mode));
    view.drag = null;
  }
});

test('canvas resolution keeps ordinary displays sharp and caps very large frame buffers', () => {
  const context = { setTransform() { } };
  const canvas = {
    width: 0, height: 0, bounds: { width: 800, height: 600 },
    getBoundingClientRect() { return this.bounds; }, getContext() { return context; }
  };
  const originalRatio = sandbox.window.devicePixelRatio;
  try {
    sandbox.window.devicePixelRatio = 2;
    cad.canvas.prepare(canvas);
    assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
    canvas.bounds = { width: 3840, height: 2160 };
    cad.canvas.prepare(canvas);
    assert.ok(canvas.width * canvas.height <= 6_010_000);
  } finally {
    sandbox.window.devicePixelRatio = originalRatio;
  }
});

test('default shortcuts and saved v1 bindings migrate without stealing Trim and Mirror keys', () => {
  assert.equal(cad.shortcuts.toolFor('X'), 'construction');
  assert.equal(cad.shortcuts.toolFor('O'), 'offset');
  assert.equal(cad.shortcuts.toolFor('T'), 'trim');
  assert.equal(cad.shortcuts.toolFor('M'), 'mirror');
  assert.equal(cad.shortcuts.toolFor('G'), 'tangent');
  assert.equal(cad.shortcuts.toolFor('H'), 'axis');
  assert.equal(cad.shortcuts.toolFor('V'), null);
  assert.equal(cad.shortcuts.bindings.fix, '');
  assert.equal(cad.shortcuts.bindings.midpoint, '');
  const stored = new Map([['webcad.shortcuts.v1', JSON.stringify({
    line: 'Q', rectangle: 'R', circle: 'C', point: 'P', fillet: 'F', trim: 'X',
    mirror: '', distance: 'D', angle: 'A', midpoint: 'M', horizontal: 'H', vertical: 'V', tangent: 'T',
  })]]);
  const context = {
    window: {
      WebCAD: {}, localStorage: {
        getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value),
      }
    }
  };
  runInNewContext(readFileSync(new URL('js/shortcuts.js', root), 'utf8'), context);
  const migrated = context.window.WebCAD.shortcuts;
  assert.equal(migrated.toolFor('Q'), 'line');
  assert.equal(migrated.toolFor('T'), 'trim');
  assert.equal(migrated.toolFor('M'), 'mirror');
  assert.equal(migrated.toolFor('G'), 'tangent');
  assert.equal(migrated.toolFor('H'), 'axis');
  assert.equal(migrated.bindings.midpoint, '');
  assert.ok(stored.has('webcad.shortcuts.v3'));
  const savedCurrent = new Map([['webcad.shortcuts.v3', JSON.stringify({ ...cad.shortcuts.bindings, line: 'O' })]]);
  const currentContext = {
    window: {
      WebCAD: {}, localStorage: {
        getItem: key => savedCurrent.get(key) || null, setItem: (key, value) => savedCurrent.set(key, value),
      }
    }
  };
  runInNewContext(readFileSync(new URL('js/shortcuts.js', root), 'utf8'), currentContext);
  assert.equal(currentContext.window.WebCAD.shortcuts.bindings.line, 'O');
  assert.equal(currentContext.window.WebCAD.shortcuts.bindings.offset, '');
});

test('Coincident keeps point pairs and points on curves together', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const first = doc.makeEntity({ type: 'point', position: [5, 5] });
  const second = doc.makeEntity({ type: 'point', position: [18, 9] });
  const line = doc.makeLine([0, 0], [30, 0]);
  [first, second, line].forEach(entity => doc.insertEntity(sketch, entity));
  const point = entity => ({ entity, part: 'position', point: entity.position });
  doc.insertConstraint(sketch, doc.makeConstraint(cad.sketchConstraints.makeCoincident(point(first), point(second))));
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...second.position], [5, 5]);
  first.position = [8, 7];
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...second.position], [8, 7]);
  doc.removeConstraint(sketch, sketch.constraints[0].id);
  doc.insertConstraint(sketch, doc.makeConstraint(cad.sketchConstraints.makeCoincident(point(second), { entity: line, edgeIndex: 0 })));
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...second.position], [8, 0]);
  line.start = [0, 3]; line.end = [30, 3];
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...second.position], [8, 3]);
});

test('a Line started on a circle rim stays attached to that exact circle angle', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const circle = doc.makeEntity({ type: 'circle', center: [20, 20], radius: 10 });
  doc.insertEntity(sketch, circle);
  const history = new cad.HistoryManager();
  const tool = Object.create(cad.SketchToolController.prototype);
  Object.assign(tool, {
    tool: 'line', document: doc, history, getActiveSketch: () => sketch,
    canvas: { focus() { } }, dirty: new Set(), typed: new Set(), locked: new Map(),
    startSnap: { point: [30, 20], kind: 'on-circle', entityId: circle.id },
    snapResult: { point: [50, 30], kind: 'grid' }, lineSegments: 0, lastClient: null,
    currentShape: () => ({ type: 'line', start: [30, 20], end: [50, 30] }),
    currentValues: () => ({}), cancelPreview() { }, showHud() { }, updateFinishLine() { }, onChange() { }
  });
  assert.equal(tool.commit(), true);
  const line = sketch.entities[1];
  assert.equal(sketch.constraints.length, 1);
  assert.equal(sketch.constraints[0].curveId, circle.id);
  assert.equal(sketch.constraints[0].attachment.kind, 'angle');
  circle.center = [40, 25];
  doc.setCircleRadius(sketch, circle.id, 15);
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...line.start], [55, 25]);
  assert.deepEqual([...line.end], [50, 30]);
  history.undo();
  assert.equal(sketch.entities.length, 1);
  assert.equal(sketch.constraints.length, 0);
  history.redo();
  assert.deepEqual([...sketch.entities[1].start], [55, 25]);
  assert.equal(sketch.constraints.length, 1);
});

test('consecutive Lines keep their shared endpoint connected when the first Line changes', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const first = doc.makeLine([0, 0], [10, 0]);
  doc.insertEntity(sketch, first);
  const tool = Object.create(cad.SketchToolController.prototype);
  Object.assign(tool, {
    tool: 'line', document: doc, history: new cad.HistoryManager(),
    getActiveSketch: () => sketch, canvas: { focus() { } }, dirty: new Set(), typed: new Set(),
    locked: new Map(), startSnap: {
      point: [10, 0], kind: 'endpoint',
      target: { entityId: first.id, part: 'end' }
    }, snapResult: { point: [20, 10], kind: 'grid' },
    lineSegments: 1, lastClient: null,
    currentShape: () => ({ type: 'line', start: [10, 0], end: [20, 10] }),
    currentValues: () => ({}), cancelPreview() { }, showHud() { }, updateFinishLine() { }, onChange() { }
  });
  assert.equal(tool.commit(), true);
  assert.equal(sketch.constraints.length, 1);
  first.end = [12, 4];
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...sketch.entities[1].start], [12, 4]);
  assert.equal(cad.sketchConstraints.makeSnapConstraint(sketch, { entity: sketch.entities[1], part: 'start' },
    { kind: 'endpoint', point: [10, 0], target: { entityId: 'entity-removed', part: 'end' } }), null);
});

test('a point attached to a line edge keeps its location along that edge after resizing', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const edge = doc.makeLine([0, 0], [40, 0]);
  const point = doc.makeEntity({ type: 'point', position: [10, 0] });
  [edge, point].forEach(entity => doc.insertEntity(sketch, entity));
  const definition = cad.sketchConstraints.makeSnapConstraint(sketch, { entity: point, part: 'position' },
    { kind: 'on-edge', point: [10, 0], entityId: edge.id, edgeIndex: 0 });
  doc.insertConstraint(sketch, doc.makeConstraint(definition));
  edge.end = [80, 20];
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...point.position], [20, 5]);
});

test('Equal follows edits from either line and links circle sizes', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const a = doc.makeLine([0, 0], [10, 0]);
  const b = doc.makeLine([0, 20], [4, 20]);
  const c = doc.makeEntity({ type: 'circle', center: [30, 0], radius: 5 });
  const d = doc.makeEntity({ type: 'circle', center: [60, 0], radius: 2 });
  [a, b, c, d].forEach(entity => doc.insertEntity(sketch, entity));
  doc.insertConstraint(sketch, doc.makeConstraint(cad.sketchConstraints.makeEqual({ entity: a, edgeIndex: 0 }, { entity: b, edgeIndex: 0 })));
  doc.insertConstraint(sketch, doc.makeConstraint(cad.sketchConstraints.makeEqual({ entity: c }, { entity: d })));
  cad.sketchConstraints.enforce(sketch);
  assert.equal(cad.sketchConstraints.curveLength(b, 0), 10);
  assert.equal(d.radius, 5);
  b.end = [15, 20];
  cad.sketchConstraints.enforce(sketch);
  assert.equal(cad.sketchConstraints.curveLength(a, 0), 15);
  d.radius = 8;
  cad.sketchConstraints.enforce(sketch);
  assert.equal(c.radius, 8);
  const rectangle = doc.makeEntity({ type: 'rectangle', start: [100, 0], end: [120, 10] });
  doc.insertEntity(sketch, rectangle);
  const square = cad.sketchConstraints.makeEqual({ entity: rectangle, edgeIndex: 0 },
    { entity: rectangle, edgeIndex: 1 });
  assert.ok(square);
  doc.insertConstraint(sketch, doc.makeConstraint(square));
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual([...rectangle.end], [120, 20]);
  const arc = doc.makeEntity({
    type: 'arc', center: [80, 40], radius: 3,
    start: [83, 40], end: [80, 43], startAngle: 0, endAngle: Math.PI / 2,
    counterClockwise: false
  });
  doc.insertEntity(sketch, arc);
  doc.insertConstraint(sketch, doc.makeConstraint(cad.sketchConstraints.makeEqual({ entity: c }, { entity: arc })));
  cad.sketchConstraints.enforce(sketch);
  assert.equal(arc.radius, c.radius);
  assert.deepEqual([...arc.start], [80 + c.radius, 40]);
});

test('Tangent to an arc places the line contact on the visible sweep', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const arc = doc.makeEntity({
    type: 'arc', center: [0, 0], radius: 10,
    start: [10, 0], end: [-10, 0], startAngle: 0, endAngle: Math.PI, counterClockwise: false
  });
  const line = doc.makeLine([20, 0], [5, 10]);
  doc.insertEntity(sketch, arc); doc.insertEntity(sketch, line);
  const definition = cad.sketchConstraints.makeTangent(line, arc);
  assert.ok(definition);
  doc.insertConstraint(sketch, doc.makeConstraint(definition));
  cad.sketchConstraints.enforce(sketch);
  assert.ok(Math.abs(line.end[0] - 5) < 1e-6);
  assert.ok(Math.abs(line.end[1] - Math.sqrt(75)) < 1e-6);
});

test('Offset and patterns produce distinct transformed sketch geometry', () => {
  const { offset, transformed, rotate } = cad.sketchPattern;
  const line = { type: 'line', start: [0, 0], end: [20, 0], construction: true };
  const shifted = offset(line, 5, 1)[0];
  assert.deepEqual([...shifted.start], [0, 5]);
  assert.deepEqual([...shifted.end], [20, 5]);
  assert.equal(shifted.construction, true);
  const circle = { type: 'circle', center: [10, 10], radius: 4, construction: true };
  assert.equal(offset(circle, 2, -1)[0].radius, 2);
  assert.equal(transformed(circle, point => point)[0].construction, true);
  assert.deepEqual([...transformed(circle, point => [point[0] + 20, point[1] + 30])[0].center], [30, 40]);
  const rectangle = { type: 'rectangle', start: [0, 0], end: [10, 5] };
  const turned = transformed(rectangle, point => rotate(point, [0, 0], Math.PI / 4), Math.PI / 4);
  assert.equal(turned.length, 4);
  assert.ok(turned.every(entity => cad.sketchGeometry.valid(entity)));
});

test('Offset guide points outward for selected rectangle and circle boundaries', () => {
  const rectangle = { id: 'rect', type: 'rectangle', start: [0, 0], end: [20, 10] };
  const top = cad.sketchPattern.offsetGuide(rectangle, { start: [0, 0], end: [20, 0] });
  assert.deepEqual([...top.origin], [10, 0]);
  assert.deepEqual([...top.normal], [0, -1]);
  const inset = cad.sketchPattern.offset(rectangle, 2, -1)[0];
  assert.deepEqual([...inset.start], [2, 2]);
  assert.deepEqual([...inset.end], [18, 8]);
  const circle = { id: 'circle', type: 'circle', center: [40, 40], radius: 10 };
  const guide = cad.sketchPattern.offsetGuide(circle, null, [40, 30]);
  assert.deepEqual([...guide.origin], [40, 30]);
  assert.deepEqual([...guide.normal], [0, -1]);
  assert.equal(cad.sketchPattern.offset(circle, 12, -1).length, 0);
});

test('Chain Selection follows connected endpoints without selecting crossings or construction curves', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const first = doc.makeLine([0, 0], [10, 0]);
  const second = doc.makeLine([10, 0], [20, 0]);
  const crossing = doc.makeLine([5, -5], [5, 5]);
  const construction = doc.makeEntity({ type: 'line', start: [20, 0], end: [30, 0], construction: true });
  [first, second, crossing, construction].forEach(entity => doc.insertEntity(sketch, entity));
  assert.deepEqual([...cad.sketchChain.connectedIds(sketch, first.id)], [first.id, second.id]);
  assert.deepEqual([...cad.sketchChain.connectedIds(sketch, crossing.id)], [crossing.id]);
  assert.deepEqual([...cad.sketchChain.connectedIds(sketch, construction.id)], [construction.id]);
});

test('chained line offsets meet cleanly at their shared corner', () => {
  const first = { id: 'first', type: 'line', start: [0, 0], end: [10, 0] };
  const second = { id: 'second', type: 'line', start: [10, 0], end: [10, 10] };
  const shapes = cad.sketchPattern.offsetLineChain([first, second], 2, first.id);
  assert.equal(shapes.length, 2);
  assert.deepEqual([...shapes[0].end], [8, 2]);
  assert.deepEqual([...shapes[1].start], [8, 2]);
});

test('Offset Chain Selection toggles an entire connected line chain', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const first = doc.makeLine([0, 0], [10, 0]);
  const second = doc.makeLine([10, 0], [10, 10]);
  [first, second].forEach(entity => doc.insertEntity(sketch, entity));
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { left: 0, top: 0, width: 800, height: 600 };
  const input = { dataset: { field: 'distance' }, value: '2' };
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    canvas: { getBoundingClientRect: () => bounds }, sketchDocument: doc, camera,
    mode: 'offset', selected: new Set(), chainInput: { checked: true }, guide: null,
    fields: { querySelectorAll: () => [input] }, count: { textContent: '' },
    centerButton: { textContent: '', classList: { toggle() { } } }, ok: { disabled: false },
    getActiveSketch: () => sketch, onChange() { }
  });
  const [clientX, clientY] = camera.project(doc.toWorld(sketch, [5, 0]), bounds.width, bounds.height);
  const event = { clientX, clientY };
  pattern.onPointerDown(event);
  assert.deepEqual([...pattern.selected], [first.id, second.id]);
  assert.deepEqual([...pattern.offsetShapes()[0].end], [8, 2]);
  pattern.onPointerDown(event);
  assert.equal(pattern.selected.size, 0);
});

test('Offset arrow drag switches sides and its preview matches the committed copy', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([0, 0], [20, 0]);
  document.insertEntity(sketch, line);
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const bounds = { left: 0, top: 0, width: 800, height: 600 };
  const canvas = {
    style: {}, captured: null, getBoundingClientRect: () => bounds,
    setPointerCapture(id) { this.captured = id; },
    hasPointerCapture(id) { return this.captured === id; },
    releasePointerCapture() { this.captured = null; }
  };
  const input = { dataset: { field: 'distance' }, value: '5' };
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    canvas, sketchDocument: document, camera, history,
    mode: 'offset', selected: new Set(),
    guide: null, offsetInput: input,
    fields: { querySelectorAll: () => [input] },
    count: { textContent: '' }, center: null,
    centerButton: { textContent: '', classList: { toggle() { } } },
    ok: { disabled: false },
    getActiveSketch: () => sketch, onChange() { }, onFeedback() { }, onFinished() { },
  });
  const eventAt = (point, pointerId = 7) => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    return { target: canvas, pointerId, clientX, clientY };
  };
  pattern.onPointerDown(eventAt([10, 0]));
  assert.equal(pattern.selected.has(line.id), true);
  assert.ok(pattern.guide.normal[0] === 0);
  assert.equal(pattern.guide.normal[1], 1);
  assert.equal(pattern.beginHandleDrag(eventAt([10, 5])), true);
  assert.equal(canvas.captured, 7);
  pattern.onPointerMove(eventAt([10, -7.5]));
  assert.equal(Number(input.value), -7.5);
  assert.equal(pattern.ok.disabled, false);
  assert.deepEqual([...pattern.offsetShapes()[0].start], [0, -7.5]);
  const strokes = [];
  let path = [];
  const context = {
    save() { }, restore() { }, setLineDash() { },
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    stroke() { strokes.push(path.map(point => [...point])); },
    arc() { }, fill() { }, fillText() { },
  };
  pattern.render(context, point => point);
  assert.ok(strokes.some(points => points.length === 2 && points[0][0] === 0 &&
    points[0][1] === -7.5 && points[1][0] === 20 && points[1][1] === -7.5),
    'the offset copy is visible at the dragged location before committing');
  assert.equal(pattern.endHandleDrag(eventAt([10, -7.5])), true);
  assert.equal(canvas.captured, null);
  assert.equal(pattern.commit(), true);
  assert.deepEqual([...sketch.entities[1].start], [0, -7.5]);
  history.undo();
  assert.equal(sketch.entities.length, 1);
});

test('rectangular pattern commits copies as one undoable operation', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const source = doc.makeLine([0, 0], [10, 0]);
  doc.insertEntity(sketch, source);
  const history = new cad.HistoryManager();
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    mode: 'rectangularPattern', selected: new Set([source.id]),
    getActiveSketch: () => sketch, sketchDocument: doc, history,
    fields: {
      querySelectorAll: () => [
        { dataset: { field: 'direction' }, value: '0' },
        { dataset: { field: 'columns' }, value: '3' },
        { dataset: { field: 'rows' }, value: '2' },
        { dataset: { field: 'columnSpacing' }, value: '20' },
        { dataset: { field: 'rowSpacing' }, value: '15' },
      ]
    },
    onChange() { }, onFinished() { }, onFeedback() { },
  });
  assert.equal(pattern.commit(), true);
  assert.equal(sketch.entities.length, 6);
  assert.ok(sketch.entities.some(entity => entity.start[0] === 40 && entity.start[1] === 15));
  history.undo();
  assert.equal(sketch.entities.length, 1);
  history.redo();
  assert.equal(sketch.entities.length, 6);
  history.undo();
  pattern.fields.querySelectorAll = () => [
    { dataset: { field: 'direction' }, value: '90' },
    { dataset: { field: 'columns' }, value: '2' },
    { dataset: { field: 'rows' }, value: '1' },
    { dataset: { field: 'columnSpacing' }, value: '20' },
    { dataset: { field: 'rowSpacing' }, value: '15' },
  ];
  assert.equal(pattern.commit(), true);
  assert.ok(sketch.entities.some(entity => Math.abs(entity.start[0]) < 1e-8 &&
    Math.abs(entity.start[1] - 20) < 1e-8));
});

test('circular pattern distributes copies around the chosen center', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const source = doc.makeLine([10, 0], [20, 0]);
  doc.insertEntity(sketch, source);
  const history = new cad.HistoryManager();
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    mode: 'circularPattern', selected: new Set([source.id]),
    center: [0, 0], getActiveSketch: () => sketch, sketchDocument: doc, history,
    fields: {
      querySelectorAll: () => [
        { dataset: { field: 'quantity' }, value: '4' },
        { dataset: { field: 'sweep' }, value: '360' },
      ]
    }, onChange() { }, onFinished() { }, onFeedback() { }
  });
  assert.equal(pattern.commit(), true);
  assert.equal(sketch.entities.length, 4);
  assert.ok(sketch.entities.some(entity => Math.abs(entity.start[0]) < 1e-8 &&
    Math.abs(entity.start[1] - 10) < 1e-8));
  history.undo();
  assert.equal(sketch.entities.length, 1);
});

test('pattern preview updates with quantity and matches the copies committed', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const source = doc.makeLine([10, 0], [20, 0]);
  doc.insertEntity(sketch, source);
  const quantity = { dataset: { field: 'quantity' }, value: '3' };
  const sweep = { dataset: { field: 'sweep' }, value: '360' };
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    mode: 'circularPattern', selected: new Set([source.id]), center: [0, 0],
    getActiveSketch: () => sketch, sketchDocument: doc, history: new cad.HistoryManager(),
    fields: { querySelectorAll: () => [quantity, sweep] }, onChange() { }, onFinished() { }, onFeedback() { }
  });
  assert.equal(pattern.patternShapes().length, 2);
  quantity.value = '5';
  const preview = pattern.patternShapes();
  assert.equal(preview.length, 4);
  const drawn = [];
  const originalDraw = cad.sketchRender.drawEntity;
  cad.sketchRender.drawEntity = (context, entity) => drawn.push(entity);
  try {
    pattern.render({
      save() { }, restore() { }, setLineDash() { }, beginPath() { }, moveTo() { }, lineTo() { },
      stroke() { }
    }, point => point);
  } finally {
    cad.sketchRender.drawEntity = originalDraw;
  }
  assert.equal(drawn.length, 5, 'one selected source and four live ghost copies are drawn');
  assert.equal(pattern.commit(), true);
  for (let i = 0; i < preview.length; i++) {
    assert.deepEqual([...sketch.entities[i + 1].start], [...preview[i].start]);
    assert.deepEqual([...sketch.entities[i + 1].end], [...preview[i].end]);
  }
});

test('rectangular pattern preview expands as row and column quantities change', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const source = doc.makeLine([0, 0], [5, 0]);
  doc.insertEntity(sketch, source);
  const values = { direction: '0', columns: '2', rows: '1', columnSpacing: '10', rowSpacing: '12' };
  const pattern = Object.create(cad.SketchPattern.prototype);
  Object.assign(pattern, {
    mode: 'rectangularPattern', selected: new Set([source.id]),
    getActiveSketch: () => sketch, sketchDocument: doc,
    fields: { querySelectorAll: () => Object.entries(values).map(([field, value]) => ({ dataset: { field }, value })) }
  });
  assert.equal(pattern.patternShapes().length, 1);
  values.rows = '3';
  values.columns = '4';
  const preview = pattern.patternShapes();
  assert.equal(preview.length, 11);
  assert.ok(preview.some(shape => shape.start[0] === 30 && shape.start[1] === 24));
});

test('right-click wheel opens at the pointer and includes every red toolbar tool', () => {
  const originalDocument = sandbox.document;
  const originalApp = cad.app;
  const listeners = new Map();
  class Element {
    constructor() { this.style = { setProperty() { } }; this.children = []; this.events = new Map(); this.hidden = true; }
    addEventListener(name, callback) { this.events.set(name, callback); }
    setAttribute() { }
    append(...items) { this.children.push(...items); }
    contains(target) { return this === target || this.children.includes(target); }
  }
  sandbox.document = { createElement: () => new Element(), addEventListener(name, callback) { listeners.set(name, callback); } };
  const canvas = new Element();
  canvas.parentElement = { getBoundingClientRect: () => ({ left: 100, top: 50 }), append: item => { canvas.wheel = item; } };
  cad.app = { sketchTools: { getActiveSketch: () => ({}) } };
  let selected = 'unchanged';
  const wheel = new cad.SketchWheel({ canvas, onSelect: value => { selected = value; } });
  const contextEvent = { clientX: 420, clientY: 230, preventDefault() { }, stopPropagation() { } };
  canvas.events.get('contextmenu')(contextEvent);
  assert.equal(wheel.root.hidden, false);
  assert.equal(wheel.root.style.left, '320px');
  assert.equal(wheel.root.style.top, '180px');
  assert.equal(wheel.root.children.length, 10);
  assert.ok(wheel.root.children.every(item => item.children[0].innerHTML.includes('<svg')),
    'wheel tools use drawn icons rather than emoji');
  const labels = wheel.root.children.map(item => item.children[1].textContent);
  assert.deepEqual(labels.slice().sort(), [
    'Mirror', 'Distance', 'Angle', 'Midpoint', 'Horizontal / Vertical', 'Fix / Unfix',
    'Tangent', 'Coincident', 'Equal', 'Cancel',
  ].sort());
  const equalButton = wheel.root.children.find(item => item.children[1].textContent === 'Equal');
  equalButton.events.get('click')({ stopPropagation() { } });
  assert.equal(selected, 'equal');
  assert.equal(wheel.root.hidden, true);
  sandbox.document = originalDocument;
  cad.app = originalApp;
});

test('pattern toolbar menu stays on screen and closes after selection or outside click', () => {
  const originalDocument = sandbox.document;
  const listeners = new Map();
  sandbox.document = {
    documentElement: { clientWidth: 800 },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  const element = () => ({
    hidden: true, style: {}, events: new Map(), attributes: {},
    addEventListener(name, callback) { this.events.set(name, callback); },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { },
  });
  const container = element();
  container.contains = target => target === trigger || target === menu;
  const trigger = element();
  const menu = element();
  menu.getBoundingClientRect = () => ({ left: 700, right: 900 });
  const toolbarMenu = new cad.ToolbarMenu({ container, trigger, menu });
  trigger.events.get('click')({ stopPropagation() { } });
  assert.equal(menu.hidden, false);
  assert.equal(menu.style.left, '-108px');
  assert.equal(trigger.attributes['aria-expanded'], 'true');
  menu.events.get('click')({ target: { closest: () => ({}) } });
  assert.equal(menu.hidden, true);
  toolbarMenu.setOpen(true);
  listeners.get('pointerdown')({ target: {} });
  assert.equal(menu.hidden, true);
  sandbox.document = originalDocument;
});

test('every active sketch operator has a cursor icon', () => {
  assert.deepEqual(Array.from(cad.sketchCursor.tools).sort(),
    Object.keys(cad.shortcuts.defaults).filter(tool => tool !== 'extrude').sort());
  const trimCursor = cad.sketchCursor.css('trim');
  assert.match(trimCursor, /^url\("data:image\/svg\+xml,/);
  assert.equal(cad.sketchCursor.css('trim'), trimCursor);
  assert.equal(cad.sketchCursor.css(null), '');
});

test('saved shortcuts migrate to the combined axis tool without taking a custom key', () => {
  const stored = new Map([['webcad.shortcuts.v2', JSON.stringify({
    line: 'H', horizontal: 'J', vertical: 'V', trim: 'T', mirror: 'M', tangent: 'G',
  })]]);
  const context = {
    window: {
      WebCAD: {}, localStorage: {
        getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value),
      }
    }
  };
  runInNewContext(readFileSync(new URL('js/shortcuts.js', root), 'utf8'), context);
  const migrated = context.window.WebCAD.shortcuts;
  assert.equal(migrated.toolFor('J'), 'axis');
  assert.equal(migrated.toolFor('H'), 'line');
  assert.equal(migrated.toolFor('V'), null);
  assert.equal(migrated.set('fix', 'V'), true);
  assert.equal(migrated.toolFor('V'), 'fix');
});

test('Fix / Unfix locks lines, rectangles, circles, points and arcs with undo', () => {
  const listeners = new Map();
  const canvas = {
    style: {}, classList: { toggle() { } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  const hud = { hidden: true, replaceChildren() { }, contains: () => false };
  sandbox.document = { addEventListener() { }, querySelector: () => null };
  runInNewContext(readFileSync(new URL('js/sketch-tool.js', root), 'utf8'), sandbox);
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertSketch(sketch);
  const entities = [
    document.makeLine([0, 0], [20, 0]),
    document.makeEntity({ type: 'rectangle', start: [40, 0], end: [60, 20] }),
    document.makeEntity({ type: 'circle', center: [100, 0], radius: 10 }),
    document.makeEntity({ type: 'point', position: [140, 10] }),
    document.makeEntity({
      type: 'arc', center: [190, 0], radius: 10,
      start: [200, 0], end: [190, 10], startAngle: 0, endAngle: Math.PI / 2,
      counterClockwise: false
    }),
  ];
  entities.forEach(entity => document.insertEntity(sketch, entity));
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const tool = new cad.SketchToolController({
    canvas, hud, document, camera, history,
    getActiveSketch: () => sketch, onChange() { }, onToolChange() { }
  });
  tool.setTool('fix');
  assert.match(canvas.style.cursor, /data:image\/svg\+xml/);
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), 800, 600);
    const event = {
      button: 0, pointerType: 'mouse', pointerId: 1, clientX, clientY,
      target: canvas, preventDefault() { }
    };
    listeners.get('pointerdown')(event);
    assert.equal(tool.entityDrag, null);
    listeners.get('click')(event);
  };
  [[10, 0], [50, 0], [110, 0], [140, 10], [197, 7]].forEach((point, index) => {
    click(point);
    assert.equal(entities[index].fixed, true);
    assert.equal(cad.sketchGeometry.isConstant(entities[index], sketch), true);
  });
  assert.equal(document.setLineEnd(sketch, entities[0].id, [25, 0]), false);
  assert.equal(document.setCircleRadius(sketch, entities[2].id, 12), false);
  assert.equal(cad.sketchTrimGeometry.plan(sketch, { entity: entities[0], edgeIndex: 0 }, [10, 0]), null);
  history.undo();
  assert.equal(entities[4].fixed, false);
  history.redo();
  assert.equal(entities[4].fixed, true);
  click([10, 0]);
  assert.equal(entities[0].fixed, false);
  assert.equal(document.setLineEnd(sketch, entities[0].id, [25, 0]), true);
});

test('combined axis tool chooses the dominant line direction', () => {
  const horizontal = { type: 'line', start: [0, 0], end: [20, 6] };
  const vertical = { type: 'line', start: [0, 0], end: [-4, 25] };
  assert.equal(cad.sketchConstraints.axisFor(horizontal), 'horizontal');
  assert.equal(cad.sketchConstraints.axisFor(vertical), 'vertical');
  assert.equal(cad.sketchConstraints.axisFor({ ...horizontal, end: [10, 10] }), 'horizontal');
  assert.equal(cad.sketchConstraints.makeAxis({ ...vertical, fixed: true }, 'vertical'), null);
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([0, 0], [-4, 25]);
  document.insertEntity(sketch, line);
  document.insertConstraint(sketch, document.makeConstraint(
    cad.sketchConstraints.makeAxis(line, cad.sketchConstraints.axisFor(line))));
  cad.sketchConstraints.enforce(sketch);
  assert.ok(Math.abs(line.end[0]) < 1e-9);
  assert.ok(Math.abs(line.end[1] - Math.hypot(4, 25)) < 1e-9);
});

test('axis tool aligns two selected points and keeps their relation after editing', () => {
  const listeners = new Map();
  const canvas = {
    style: {}, classList: { toggle() { } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  const hud = { hidden: true, replaceChildren() { }, contains: () => false };
  sandbox.document = { addEventListener() { }, querySelector: () => null };
  runInNewContext(readFileSync(new URL('js/sketch-tool.js', root), 'utf8'), sandbox);
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertSketch(sketch);
  const line = document.makeLine([0, 0], [10, 0]);
  const point = document.makeEntity({ type: 'point', position: [30, 12] });
  document.insertEntity(sketch, line);
  document.insertEntity(sketch, point);
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const tool = new cad.SketchToolController({
    canvas, hud, document, camera, history,
    getActiveSketch: () => sketch, onChange() { }, onToolChange() { }
  });
  tool.setTool('axis');
  const click = coordinates => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, coordinates), 800, 600);
    const event = {
      button: 0, pointerType: 'mouse', pointerId: 1, clientX, clientY,
      target: canvas, preventDefault() { }
    };
    listeners.get('pointerdown')(event);
    assert.equal(tool.entityDrag, null);
    listeners.get('click')(event);
  };
  click([10, 0]);
  assert.ok(tool.firstAxisPoint);
  click([30, 12]);
  assert.equal(tool.firstAxisPoint, null);
  assert.equal(sketch.constraints[0].type, 'horizontal');
  assert.deepEqual(Array.from(point.position), [30, 0]);
  document.setLineEnd(sketch, line.id, [10, 7]);
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual(Array.from(point.position), [30, 7]);
  history.undo();
  assert.equal(sketch.constraints.length, 0);
  assert.deepEqual(Array.from(point.position), [30, 12]);
  history.redo();
  assert.equal(sketch.constraints.length, 1);
  assert.deepEqual(Array.from(point.position), [30, 0]);
});

test('point alignment preserves dimensioned geometry and stays within sketch bounds', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const anchor = document.makeEntity({ type: 'point', position: [0, 0], fixed: true });
  const rectangle = document.makeEntity({ type: 'rectangle', start: [20, 20], end: [40, 40] },
    { width: 20, height: 20 });
  const line = document.makeEntity({ type: 'line', start: [50, 15], end: [80, 15] }, { length: 30 });
  for (const entity of [anchor, rectangle, line]) document.insertEntity(sketch, entity);
  const originRef = { entity: anchor, part: 'position', point: anchor.position };
  const cornerRef = { entity: rectangle, part: 'corner', cornerIndex: 0, point: [20, 20] };
  const lineRef = { entity: line, part: 'end', point: line.end };
  document.insertConstraint(sketch, document.makeConstraint(
    cad.sketchConstraints.makeAxisPoints(originRef, cornerRef, 'horizontal')));
  document.insertConstraint(sketch, document.makeConstraint(
    cad.sketchConstraints.makeAxisPoints(originRef, lineRef, 'horizontal')));
  cad.sketchConstraints.enforce(sketch);
  assert.deepEqual(Array.from(rectangle.start), [20, 0]);
  assert.deepEqual(Array.from(rectangle.end), [40, 20]);
  assert.equal(rectangle.dimensions.height, 20);
  assert.deepEqual(Array.from(line.start), [50, 0]);
  assert.deepEqual(Array.from(line.end), [80, 0]);
  assert.equal(line.dimensions.length, 30);
  const otherFixed = document.makeEntity({ type: 'point', position: [5, 5], fixed: true });
  assert.equal(cad.sketchConstraints.makeAxisPoints(originRef,
    { entity: otherFixed, part: 'position', point: otherFixed.position }, 'horizontal'), null);
});

test('a fast Trim drag removes each crossed edge in one undo step', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  for (const x of [20, 50, 80]) document.insertEntity(sketch, document.makeLine([x, -10], [x, 10]));
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const trim = new cad.SketchTrim({
    getActiveSketch: () => sketch, document, camera, history,
    onChange: () => { }
  });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = {
    getBoundingClientRect: () => bounds, setPointerCapture: () => { },
    hasPointerCapture: () => true, releasePointerCapture: () => { }
  };
  const [startX, startY] = camera.project(document.toWorld(sketch, [0, 0]), bounds.width, bounds.height);
  const [endX, endY] = camera.project(document.toWorld(sketch, [100, 0]), bounds.width, bounds.height);
  trim.beginStroke({ target, pointerId: 7, clientX: startX, clientY: startY });
  trim.onPointerMove({ target, pointerId: 7, clientX: endX, clientY: endY });
  assert.equal(sketch.entities.length, 0);
  trim.endStroke({ target, pointerId: 7 });
  assert.equal(history.undoStack.length, 1);
  history.undo();
  assert.equal(sketch.entities.length, 3);
  history.redo();
  assert.equal(sketch.entities.length, 0);
});

test('cancelling a Trim drag restores geometry without recording history', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([0, 0], [20, 0]));
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const trim = new cad.SketchTrim({
    getActiveSketch: () => sketch, document, camera, history,
    onChange: () => { }
  });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = {
    getBoundingClientRect: () => bounds, setPointerCapture: () => { },
    hasPointerCapture: () => true, releasePointerCapture: () => { }
  };
  const [clientX, clientY] = camera.project(document.toWorld(sketch, [10, 0]), bounds.width, bounds.height);
  trim.beginStroke({ target, pointerId: 3, clientX, clientY });
  assert.equal(sketch.entities.length, 0);
  trim.cancel();
  assert.equal(sketch.entities.length, 1);
  assert.equal(history.undoStack.length, 0);
});

test('one Trim drag can remove two distinct edges of the same rectangle', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] }));
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const trim = new cad.SketchTrim({
    getActiveSketch: () => sketch, document, camera, history,
    onChange: () => { }
  });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = {
    getBoundingClientRect: () => bounds, setPointerCapture: () => { },
    hasPointerCapture: () => true, releasePointerCapture: () => { }
  };
  const [startX, startY] = camera.project(document.toWorld(sketch, [20, 0]), bounds.width, bounds.height);
  const [endX, endY] = camera.project(document.toWorld(sketch, [40, 10]), bounds.width, bounds.height);
  trim.beginStroke({ target, pointerId: 4, clientX: startX, clientY: startY });
  trim.onPointerMove({ target, pointerId: 4, clientX: endX, clientY: endY });
  trim.endStroke({ target, pointerId: 4 });
  assert.equal(sketch.entities.length, 2);
  assert.equal(sketch.entities.every(entity => entity.type === 'line'), true);
  history.undo();
  assert.equal(sketch.entities.length, 1);
  assert.equal(sketch.entities[0].type, 'rectangle');
});

test('fillet selects the actual pair of rectangle edges and changes only that corner', () => {
  const edgePairs = [[0, 1, [40, 0]], [1, 2, [40, 20]], [2, 3, [0, 20]], [3, 0, [0, 0]]];
  for (const [first, second, vertex] of edgePairs) {
    const document = new cad.SketchDocument();
    const sketch = document.makeSketch('XY');
    const rectangle = document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] });
    document.insertEntity(sketch, rectangle);
    const camera = new cad.Camera();
    camera.selectView('top');
    const history = new cad.HistoryManager();
    const fillet = new cad.SketchFillet({
      getActiveSketch: () => sketch, document, camera,
      history, hud: null, onChange: () => { }
    });
    const bounds = { left: 0, top: 0, width: 900, height: 650 };
    const target = { getBoundingClientRect: () => bounds };
    const edges = cad.sketchHitTest.segments(sketch);
    fillet.start();
    for (const edgeIndex of [first, second]) {
      const edge = edges[edgeIndex];
      const middle = cad.sketchHitTest.midpoint(edge);
      const [clientX, clientY] = camera.project(document.toWorld(sketch, middle), bounds.width, bounds.height);
      fillet.onPointerDown({ target, button: 0, clientX, clientY });
    }
    assert.ok(fillet.selectedCorner, `edges ${first}, ${second} select a corner`);
    assert.deepEqual(Array.from(fillet.selectedCorner.vertex), vertex);
    fillet.commit();
    assert.equal(sketch.entities.length, 5);
    assert.ok(cad.sketchProfiles.fromSketch(sketch).length >= 1, 'filleted rectangle stays closed');
    const arc = sketch.entities.find(entity => entity.type === 'arc');
    assert.ok(arc);
    const nearVertex = point => Math.hypot(point[0] - vertex[0], point[1] - vertex[1]) < 5.01;
    assert.ok(nearVertex(arc.start) && nearVertex(arc.end));
    const untouched = sketch.entities.filter(entity => entity.type === 'line' &&
      !(nearVertex(entity.start) || nearVertex(entity.end)));
    assert.equal(untouched.length, 2);
    history.undo();
    assert.equal(sketch.entities.length, 1);
    assert.equal(sketch.entities[0].type, 'rectangle');
    history.redo();
    assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 1);
  }
});

test('fillet can round either intersection of two circles and remains undoable', () => {
  for (const sign of [-1, 1]) {
    const document = new cad.SketchDocument();
    const sketch = document.makeSketch('XY');
    document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
    document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [12, 0], radius: 10 }));
    const history = new cad.HistoryManager();
    const camera = new cad.Camera();
    camera.selectView('top');
    const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
      history, hud: null, onChange() { } });
    fillet.start();
    const corners = fillet.getCorners(sketch).filter(corner => corner.kind === 'circle-circle');
    assert.equal(corners.length, 2);
    const corner = corners.find(item => Math.sign(item.vertex[1]) === sign);
    fillet.selectCorner(corner, { width: 900, height: 650 });
    fillet.currentRadius = 2;
    const geometry = fillet.computeFilletGeometry(corner, 2);
    assert.ok(geometry && Math.hypot(geometry.t1[0] - geometry.t2[0],
      geometry.t1[1] - geometry.t2[1]) > 0);
    fillet.commit();
    assert.equal(sketch.entities.length, 3);
    assert.ok(sketch.entities.every(entity => entity.type === 'arc'));
    assert.ok(cad.sketchProfiles.fromSketch(sketch).length >= 1);
    history.undo();
    assert.equal(sketch.entities.filter(entity => entity.type === 'circle').length, 2);
  }
});

test('Fillet rounds the chosen arms of two crossing lines after two edge clicks', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([-20, 0], [20, 0]));
  document.insertEntity(sketch, document.makeLine([0, -20], [0, 20]));
  const camera = new cad.Camera(); camera.selectView('top');
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history, hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([12, 0]); click([0, 12]);
  assert.equal(fillet.selectedCorner.kind, 'cross-line-line');
  const geometry = fillet.computeFilletGeometry(fillet.selectedCorner, 2);
  assert.ok(geometry.t1[0] > 0 && geometry.t2[1] > 0);
  fillet.currentRadius = 2; fillet.commit();
  assert.equal(sketch.entities.length, 5);
  assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 1);
  history.undo(); assert.equal(sketch.entities.length, 2);
});

test('Fillet selects a line and circle, then chooses one of their intersections', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([-15, 0], [15, 0]));
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
  const camera = new cad.Camera(); camera.selectView('top');
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history, hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([13, 0]); click([7, 7]);
  assert.equal(fillet.pendingCorners.length, 2);
  click([10, 0]);
  assert.equal(fillet.selectedCorner.kind, 'line-circle');
  const geometry = fillet.computeFilletGeometry(fillet.selectedCorner, 2);
  assert.ok(geometry && geometry.t1[0] > 10);
  fillet.currentRadius = 2; fillet.commit();
  assert.equal(sketch.entities.filter(entity => entity.type === 'circle').length, 0);
  assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 2);
  history.undo(); assert.equal(sketch.entities.filter(entity => entity.type === 'circle').length, 1);
});

test('Fillet asks for two circle edges before choosing their intersection', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [12, 0], radius: 10 }));
  const camera = new cad.Camera(); camera.selectView('top');
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history: new cad.HistoryManager(), hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([-10, 0]); click([22, 0]);
  assert.equal(fillet.pendingCorners.length, 2);
  assert.equal(fillet.selectedCorner, null);
  click([6, 8]);
  assert.equal(fillet.selectedCorner.kind, 'circle-circle');
  assert.ok(fillet.selectedCorner.vertex[1] > 0);
});

test('Fillet trims a selected arc and line at their crossing', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([-15, 0], [15, 0]));
  document.insertEntity(sketch, document.makeEntity({ type: 'arc', center: [0, 0], radius: 10,
    start: [0, -10], end: [0, 10], startAngle: -Math.PI / 2, endAngle: Math.PI / 2,
    counterClockwise: false }));
  const camera = new cad.Camera(); camera.selectView('top');
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history, hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([13, 0]); click([7, 7]);
  assert.equal(fillet.selectedCorner.kind, 'line-circle');
  fillet.currentRadius = 2;
  assert.ok(fillet.computeFilletGeometry(fillet.selectedCorner, 2));
  fillet.commit();
  assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 3);
  history.undo(); assert.equal(sketch.entities.length, 2);
});

test('Fillet accepts a line endpoint lying on a circle boundary', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([10, 0], [20, 0]));
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
  const camera = new cad.Camera(); camera.selectView('top');
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history: new cad.HistoryManager(), hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([18, 0]); click([7, 7]);
  assert.equal(fillet.selectedCorner.kind, 'line-circle');
  fillet.currentRadius = 2;
  fillet.commit();
  assert.equal(sketch.entities.filter(entity => entity.type === 'line').length, 1,
    'no zero-length opposite line is created at the endpoint');
  assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 2);
});

test('Fillet can round an arc–arc intersection chosen after two edges', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'arc', center: [0, 0], radius: 10,
    start: [0, -10], end: [0, 10], startAngle: -Math.PI / 2, endAngle: Math.PI / 2,
    counterClockwise: false }));
  document.insertEntity(sketch, document.makeEntity({ type: 'arc', center: [12, 0], radius: 10,
    start: [12, 10], end: [12, -10], startAngle: Math.PI / 2, endAngle: 3 * Math.PI / 2,
    counterClockwise: false }));
  const camera = new cad.Camera(); camera.selectView('top');
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history, hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start(); click([3, 9.54]); click([12, 10]);
  assert.equal(fillet.pendingCorners.length, 2);
  click([6, 8]);
  assert.equal(fillet.selectedCorner.kind, 'curve-curve');
  fillet.currentRadius = 2;
  assert.ok(fillet.computeFilletGeometry(fillet.selectedCorner, 2));
  fillet.commit();
  assert.ok(sketch.entities.filter(entity => entity.type === 'arc').length >= 3);
  history.undo(); assert.equal(sketch.entities.length, 2);
});

test('Fillet Chain Selection rounds every corner of a rectangle in one undo step', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  doc.insertEntity(sketch, doc.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] }));
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({
    getActiveSketch: () => sketch, document: doc, camera: new cad.Camera(),
    history, hud: null, onChange() { }
  });
  fillet.start();
  fillet.selectCorner(fillet.getCorners(sketch)[0], { width: 900, height: 650 });
  fillet.chainSelection = true;
  fillet.currentRadius = 3;
  assert.equal(fillet.chainCorners().length, 4);
  fillet.commit();
  assert.equal(sketch.entities.filter(entity => entity.type === 'arc').length, 4);
  assert.equal(sketch.entities.filter(entity => entity.type === 'line').length, 4);
  assert.ok(cad.sketchProfiles.fromSketch(sketch).length >= 1);
  history.undo();
  assert.equal(sketch.entities.length, 1);
  assert.equal(sketch.entities[0].type, 'rectangle');
});

test('Fillet requires two edge clicks and explicit radius confirmation', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] }));
  const camera = new cad.Camera(); camera.selectView('top');
  const fillet = new cad.SketchFillet({ getActiveSketch: () => sketch, document, camera,
    history: new cad.HistoryManager(), hud: null, onChange() { } });
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const target = { getBoundingClientRect: () => bounds };
  const click = point => {
    const [clientX, clientY] = camera.project(document.toWorld(sketch, point), bounds.width, bounds.height);
    fillet.onPointerDown({ target, button: 0, clientX, clientY });
  };
  fillet.start();
  click([20, 20]);
  assert.ok(fillet.firstSegment);
  assert.equal(fillet.selectedCorner, null);
  click([40, 10]);
  assert.ok(fillet.selectedCorner);
  assert.equal(sketch.entities.length, 1);
  click([0, 10]);
  assert.equal(sketch.entities.length, 1, 'a canvas click must not confirm the preview');
  fillet.currentRadius = 4;
  fillet.commit();
  assert.equal(fillet.active, false);
  assert.equal(sketch.entities.find(entity => entity.type === 'arc')?.dimensions.radius, 4);
});

test('fillet radius handle follows a drag along the corner bisector', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] }));
  const camera = new cad.Camera();
  camera.selectView('top');
  const fillet = new cad.SketchFillet({
    getActiveSketch: () => sketch, document, camera,
    history: new cad.HistoryManager(), hud: null, onChange: () => { }
  });
  fillet.start();
  const corner = fillet.getCorners(sketch).find(item => item.vertex[0] === 40 && item.vertex[1] === 20);
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  fillet.selectCorner(corner, bounds);
  const handlePoint = geometry => {
    let sweep = geometry.endAngle - geometry.startAngle;
    if (geometry.counterClockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!geometry.counterClockwise && sweep < 0) sweep += Math.PI * 2;
    const angle = geometry.startAngle + sweep / 2;
    return [geometry.center[0] + geometry.R * Math.cos(angle),
      geometry.center[1] + geometry.R * Math.sin(angle)];
  };
  const handle = handlePoint(fillet.computeFilletGeometry(corner, fillet.currentRadius));
  const [clientX, clientY] = camera.project(document.toWorld(sketch, handle), bounds.width, bounds.height);
  const target = {
    style: {}, getBoundingClientRect: () => bounds,
    setPointerCapture: () => { }, hasPointerCapture: () => true, releasePointerCapture: () => { }
  };
  assert.equal(fillet.beginHandleDrag({ target, pointerId: 7, clientX, clientY }), true);
  const larger = handlePoint(fillet.computeFilletGeometry(corner, fillet.currentRadius * 1.6));
  const [x, y] = camera.project(document.toWorld(sketch, larger), bounds.width, bounds.height);
  fillet.onPointerMove({ target, pointerId: 7, clientX: x, clientY: y });
  assert.ok(fillet.currentRadius > 5);
  assert.equal(fillet.endHandleDrag({ target, pointerId: 7 }), true);
});

test('fillet leaves another line at the chosen rectangle corner untouched', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const rectangle = document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] });
  const extra = document.makeLine([40, 20], [55, 28]);
  document.insertEntity(sketch, rectangle);
  document.insertEntity(sketch, extra);
  sketch.measurements.push(document.makeRectangleEdgeMeasurement(rectangle.id, 0));
  const history = new cad.HistoryManager();
  const fillet = new cad.SketchFillet({
    getActiveSketch: () => sketch, document, camera: new cad.Camera(),
    history, hud: null, onChange: () => { }
  });
  fillet.start();
  const corner = fillet.getCorners(sketch).find(item => item.vertex[0] === 40 && item.vertex[1] === 20 &&
    item.s1.entity.id === rectangle.id && item.s2.entity.id === rectangle.id);
  fillet.selectCorner(corner, { width: 900, height: 650 });
  fillet.commit();
  const remainingExtra = sketch.entities.find(entity => entity.id === extra.id);
  assert.deepEqual(Array.from(remainingExtra.start), [40, 20]);
  assert.deepEqual(Array.from(remainingExtra.end), [55, 28]);
  assert.equal(sketch.measurements.length, 0);
  history.undo();
  assert.equal(sketch.measurements.length, 1);
});

test('trim removes only the clicked interval, updates profiles and supports undo', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([0, 0], [30, 0]);
  document.insertEntity(sketch, line);
  document.insertEntity(sketch, document.makeLine([10, -10], [10, 10]));
  document.insertEntity(sketch, document.makeLine([20, -10], [20, 10]));
  const hit = { entity: line, edgeIndex: 0 };
  const plan = cad.sketchTrimGeometry.plan(sketch, hit, [15, 0]);
  assert.deepEqual(Array.from(plan.removed.start), [10, 0]);
  assert.deepEqual(Array.from(plan.removed.end), [20, 0]);
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { left: 0, top: 0, width: 900, height: 650 };
  const [clientX, clientY] = camera.project(document.toWorld(sketch, [15, 0]), bounds.width, bounds.height);
  const history = new cad.HistoryManager();
  const trim = new cad.SketchTrim({ getActiveSketch: () => sketch, document, camera, history, onChange: () => { } });
  trim.onClick({ target: { getBoundingClientRect: () => bounds }, clientX, clientY });
  assert.equal(sketch.entities.length, 4);
  assert.equal(sketch.entities.some(entity => entity.id === line.id), false);
  history.undo();
  assert.equal(sketch.entities.length, 3);
  history.redo();
  assert.equal(sketch.entities.length, 4);
});

test('trim handles rectangle edges and circle arcs at intersections', () => {
  const document = new cad.SketchDocument();
  const rectangleSketch = document.makeSketch('XY');
  const rectangle = document.makeEntity({ type: 'rectangle', start: [0, 0], end: [40, 20] });
  document.insertEntity(rectangleSketch, rectangle);
  document.insertEntity(rectangleSketch, document.makeLine([20, -10], [20, 30]));
  const rectanglePlan = cad.sketchTrimGeometry.plan(rectangleSketch,
    { entity: rectangle, edgeIndex: 0 }, [10, 0]);
  assert.deepEqual(Array.from(rectanglePlan.removed.end), [20, 0]);
  const circleSketch = document.makeSketch('XY');
  const circle = document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 });
  document.insertEntity(circleSketch, circle);
  document.insertEntity(circleSketch, document.makeLine([-15, 0], [15, 0]));
  const circlePlan = cad.sketchTrimGeometry.plan(circleSketch, { entity: circle, edgeIndex: null }, [0, 10]);
  assert.equal(circlePlan.removed.type, 'arc');
  assert.equal(circlePlan.pieces.length, 1);
  assert.ok(Math.abs(circlePlan.pieces[0].endAngle - circlePlan.pieces[0].startAngle - Math.PI) < 1e-6);
  const lowerPlan = cad.sketchTrimGeometry.plan(circleSketch, { entity: circle, edgeIndex: null }, [0, -10]);
  assert.equal(lowerPlan.pieces.length, 1);
  assert.ok(Math.abs(lowerPlan.pieces[0].endAngle - lowerPlan.pieces[0].startAngle - Math.PI) < 1e-6);
});

test('screen points map to millimetre coordinates on every origin plane', () => {
  const document = new cad.SketchDocument();
  const camera = new cad.Camera();
  const bounds = { left: 20, top: 30, width: 1000, height: 700 };
  for (const [plane, view] of [['XY', 'top'], ['XZ', 'front'], ['YZ', 'right']]) {
    const sketch = document.makeSketch(plane);
    camera.selectView(view);
    camera.panX = 35;
    camera.panY = -12;
    camera.zoom = 1.7;
    const world = document.toWorld(sketch, [42.5, -13.25]);
    const screen = camera.project(world, bounds.width, bounds.height);
    const result = document.screenToPlane(sketch, camera, bounds, screen[0] + bounds.left, screen[1] + bounds.top);
    assert.ok(Math.abs(result[0] - 42.5) < 1e-9, `${plane} horizontal coordinate`);
    assert.ok(Math.abs(result[1] + 13.25) < 1e-9, `${plane} vertical coordinate`);
  }
});

test('drawing entities survive sketch closure and support undo and redo', () => {
  const document = new cad.SketchDocument();
  const history = new cad.HistoryManager();
  const sketch = document.makeSketch('XY');
  assert.equal(sketch.name, 'Sketch 1');
  assert.equal(document.makeSketch('XZ').name, 'Sketch 2');
  document.insertSketch(sketch);
  const line = document.makeLine([0, 0], [25, 10]);
  history.execute({
    execute: () => document.insertEntity(sketch, line),
    undo: () => document.removeEntity(sketch, line.id),
    redo: () => document.insertEntity(sketch, line),
  });
  assert.equal(document.sketches[0].entities.length, 1);
  assert.equal(document.sketches[0].units, 'mm');
  history.undo();
  assert.equal(document.sketches[0].entities.length, 0);
  history.redo();
  assert.deepEqual(Array.from(document.sketches[0].entities[0].end), [25, 10]);
});

test('an edge-on plane cannot receive a line', () => {
  const document = new cad.SketchDocument();
  const camera = new cad.Camera();
  const sketch = document.makeSketch('XY');
  camera.selectView('front');
  assert.equal(document.screenToPlane(sketch, camera, { left: 0, top: 0, width: 800, height: 600 }, 400, 300), null);
});

test('screen-to-plane mapping remains accurate after orbiting', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XZ');
  const camera = new cad.Camera();
  camera.selectView('front');
  camera.orbit(42, 31);
  const bounds = { left: 10, top: 15, width: 960, height: 640 };
  const expected = [-18, 36];
  const screen = camera.project(document.toWorld(sketch, expected), bounds.width, bounds.height);
  const actual = document.screenToPlane(sketch, camera, bounds, screen[0] + bounds.left, screen[1] + bounds.top);
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-9);
  assert.ok(Math.abs(actual[1] - expected[1]) < 1e-9);
});

test('dimension geometry respects typed values and rectangle direction', () => {
  const { shape, valid, parseValue } = cad.sketchGeometry;
  const line = shape('line', [0, 0], [10, 0], { length: 50, angle: 30 });
  assert.ok(Math.abs(line.end[0] - 50 * Math.cos(Math.PI / 6)) < 1e-9);
  assert.ok(Math.abs(line.end[1] - 25) < 1e-9);
  const rectangle = shape('rectangle', [10, 10], [0, 0], { width: 40, height: 15 });
  assert.deepEqual(Array.from(rectangle.end), [-30, -5]);
  assert.equal(shape('circle', [3, 4], [0, 0], { radius: 12 }).radius, 12);
  assert.equal(shape('circle', [3, 4], [0, 0], { diameter: 20 }, 'diameter').radius, 10);
  assert.equal(cad.sketchGeometry.measure('circle', [0, 0], [6, 8]).diameter, 20);
  assert.equal(valid(shape('circle', [0, 0], [0, 0], { radius: 0 })), false);
  assert.equal(parseValue('12,5', 'radius'), 12.5);
  assert.equal(parseValue('', 'angle'), null);
});

test('L, R, C, and D shortcuts create geometry or measure; Tab locks dimensions and undo works', () => {
  const canvasEvents = new Map();
  const documentEvents = new Map();
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.events = new Map();
      this.dataset = {};
      this.style = {};
      this.hidden = true;
      this.value = '';
      this.classList = { toggle: () => { }, add: () => { }, remove: () => { } };
    }
    addEventListener(name, listener) { this.events.set(name, listener); }
    setAttribute() { }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    focus() { sandbox.document.activeElement = this; }
    select() { }
  }
  const finishLine = new FakeElement('button');
  sandbox.document = {
    activeElement: null,
    addEventListener: (name, listener) => documentEvents.set(name, listener),
    createElement: tag => new FakeElement(tag),
    querySelector: selector => selector === '#finishLine' ? finishLine : null,
  };
  runInNewContext(readFileSync(new URL('js/sketch-tool.js', root), 'utf8'), sandbox, { filename: 'js/sketch-tool.js' });
  const bounds = { left: 0, top: 0, width: 800, height: 600 };
  const canvas = new FakeElement('canvas');
  canvas.addEventListener = (name, listener) => canvasEvents.set(name, listener);
  canvas.getBoundingClientRect = () => bounds;
  const hud = new FakeElement();
  hud.offsetWidth = 186;
  hud.offsetHeight = 90;
  const sketchDocument = new cad.SketchDocument();
  const sketch = sketchDocument.makeSketch('XY');
  sketchDocument.insertSketch(sketch);
  let activeSketch = sketch;
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const tool = new cad.SketchToolController({
    canvas, hud, document: sketchDocument, camera, history,
    getActiveSketch: () => activeSketch,
    onChange: () => { }, onToolChange: () => { },
  });
  const pointerAt = (eventName, point) => {
    const [clientX, clientY] = camera.project(sketchDocument.toWorld(sketch, point), bounds.width, bounds.height);
    canvasEvents.get(eventName)({ button: 0, clientX, clientY, preventDefault: () => { } });
  };
  const key = (value, target = canvas) => documentEvents.get('keydown')({ key: value, target, shiftKey: false, preventDefault: () => { } });
  key('l');
  assert.equal(tool.tool, 'line');
  pointerAt('click', [0, 0]);
  assert.ok(tool.start);
  key('Escape');
  assert.equal(tool.start, null);
  assert.equal(sketch.entities.length, 0);
  pointerAt('click', [0, 0]);
  pointerAt('pointermove', [25, 10]);
  const lengthInput = tool.inputs.get('length').input;
  lengthInput.value = '50';
  lengthInput.events.get('input')();
  key('Tab', lengthInput);
  assert.equal(tool.locked.get('length'), 50);
  const angleInput = tool.inputs.get('angle').input;
  assert.equal(sandbox.document.activeElement, angleInput);
  pointerAt('pointermove', [0, 20]);
  assert.ok(Math.abs(tool.currentShape().end[0]) < 1e-9);
  assert.ok(Math.abs(tool.currentShape().end[1] - 50) < 1e-9);
  angleInput.value = '30';
  angleInput.events.get('input')();
  assert.equal(tool.locked.has('length'), false);
  key('Tab', angleInput);
  assert.equal(tool.locked.get('angle'), 30);
  assert.equal(tool.locked.has('length'), false);
  assert.equal(sandbox.document.activeElement, lengthInput);
  pointerAt('pointermove', [40, 10]);
  assert.equal(Number(lengthInput.value), 41.231);
  key('Enter', lengthInput);
  assert.equal(sketch.entities.length, 1);
  assert.ok(Math.abs(sketch.entities[0].end[0] - Math.hypot(40, 10) * Math.cos(Math.PI / 6)) < 1e-9);
  assert.ok(Math.abs(sketch.entities[0].end[1] - Math.hypot(40, 10) * Math.sin(Math.PI / 6)) < 1e-9);
  assert.equal(sketch.entities[0].dimensions.angle, 30);
  assert.equal(sketch.entities[0].dimensions.length, undefined);
  assert.deepEqual(Array.from(tool.start), Array.from(sketch.entities[0].end));
  assert.equal(tool.lineSegments, 1);
  assert.equal(finishLine.hidden, false);
  assert.ok(parseFloat(finishLine.style.top) >= parseFloat(hud.style.top) + hud.offsetHeight + 8,
    'the green check appears below the line specification');
  const anchored = [finishLine.style.left, finishLine.style.top];
  const anchoredHud = [hud.style.left, hud.style.top];
  pointerAt('pointermove', [60, 20]);
  assert.deepEqual([finishLine.style.left, finishLine.style.top], anchored,
    'the green check stays beside the last committed line point');
  assert.deepEqual([hud.style.left, hud.style.top], anchoredHud,
    'the line specification stays above its green check while drawing continues');
  pointerAt('click', [60, 20]);
  assert.equal(sketch.entities.length, 2);
  assert.deepEqual([...sketch.entities[1].start], [...sketch.entities[0].end]);
  assert.equal(tool.lineSegments, 2);
  history.undo();
  assert.equal(sketch.entities.length, 1);
  key('r');
  pointerAt('click', [0, 0]);
  pointerAt('pointermove', [20, 10]);
  const widthInput = tool.inputs.get('width').input;
  widthInput.value = 'invalid';
  widthInput.events.get('input')();
  pointerAt('click', [20, 10]);
  assert.equal(sketch.entities.length, 1);
  widthInput.value = '40';
  widthInput.events.get('input')();
  key('Tab', widthInput);
  assert.equal(tool.locked.get('width'), 40);
  const heightInput = tool.inputs.get('height').input;
  heightInput.value = '15';
  heightInput.events.get('input')();
  key('Tab', heightInput);
  assert.equal(tool.locked.get('width'), 40);
  assert.equal(tool.locked.get('height'), 15);
  key('Tab', widthInput);
  assert.equal(tool.locked.has('width'), false);
  assert.equal(tool.locked.get('height'), 15);
  key('Tab', heightInput);
  assert.equal(tool.locked.has('height'), false);
  widthInput.value = '40';
  widthInput.events.get('input')();
  key('Tab', widthInput);
  heightInput.value = '15';
  heightInput.events.get('input')();
  key('Tab', heightInput);
  key('Enter', heightInput);
  assert.equal(tool.locked.size, 0);
  assert.equal(sketch.entities[1].type, 'rectangle');
  assert.deepEqual(Array.from(sketch.entities[1].end), [40, 15]);
  assert.equal(sketch.entities[1].dimensions.width, 40);
  assert.equal(sketch.entities[1].dimensions.height, 15);
  key('c');
  pointerAt('click', [0, 0]);
  const radiusInput = tool.inputs.get('radius').input;
  radiusInput.value = '12.5';
  radiusInput.events.get('input')();
  radiusInput.focus();
  key('Tab', radiusInput);
  assert.equal(tool.locked.get('radius'), 12.5);
  key('Enter', radiusInput);
  assert.equal(sketch.entities[2].type, 'circle');
  assert.equal(sketch.entities[2].radius, 12.5);
  assert.equal(sketch.entities[2].dimensions.radius, 12.5);
  history.undo();
  assert.equal(sketch.entities.length, 2);
  history.redo();
  assert.equal(sketch.entities.length, 3);
  assert.equal(sketch.entities[2].dimensions.radius, 12.5);
  key('d');
  assert.equal(tool.tool, 'distance');
  pointerAt('click', [-20, -20]);
  pointerAt('pointermove', [-45, -10]);
  assert.equal(tool.distanceOutput.textContent, '26.926 mm');
  pointerAt('click', [-45, -10]);
  assert.equal(sketch.entities.length, 3);
  assert.equal(sketch.measurements.length, 1);
  assert.ok(Math.abs(sketch.measurements[0].millimetres - Math.hypot(25, 10)) < 1e-9);
  key('l');
  assert.equal(sketch.measurements.length, 1, 'measurements remain after changing tools');
  history.undo();
  assert.equal(sketch.measurements.length, 0);
  history.redo();
  assert.equal(sketch.measurements.length, 1);
  tool.setTool(null);
  key('x');
  assert.equal(tool.constructionEnabled, true);
  key('r');
  pointerAt('click', [80, 60]);
  pointerAt('pointermove', [100, 75]);
  pointerAt('click', [100, 75]);
  const helper = sketch.entities.at(-1);
  assert.equal(helper.type, 'rectangle');
  assert.equal(helper.construction, true);
  tool.setTool(null);
  pointerAt('click', [90, 60]);
  assert.equal(helper.construction, false, 'clicking an existing curve converts it back to normal geometry');
  history.undo();
  assert.equal(helper.construction, true, 'construction conversion is undoable');
  history.undo();
  assert.equal(sketch.entities.includes(helper), false, 'construction drawing is undoable');
  key('x');
  assert.equal(tool.constructionEnabled, false);
  pointerAt('pointermove', [40, 0]);
  assert.equal(tool.hoverHandle?.part, 'corner');
  pointerAt('click', [40, 0]);
  assert.equal(tool.selectedPoint?.entityId, sketch.entities[1].id);
  assert.equal(tool.selectedPoint?.cornerIndex, 1);
  pointerAt('click', [40, 0]);
  assert.equal(tool.selectedPoint, null, 'clicking the selected point again clears it');
  pointerAt('click', [40, 0]);
  key('l');
  pointerAt('click', [40, 0]);
  assert.deepEqual([...tool.start], [40, 0], 'Line starts exactly at the selected rectangle corner');
  assert.equal(tool.selectedPoint?.entityId, sketch.entities[1].id);
  tool.setTool(null);
  const labels = [];
  const ringRadii = [];
  let arrowPaths = 0;
  const context = {
    save() { }, restore() { }, setLineDash() { }, beginPath() { }, moveTo() { }, lineTo() { arrowPaths++; }, stroke() { },
    arc(x, y, radius) { ringRadii.push(radius); }, fill() { }, fillRect() { }, strokeRect() { }, closePath() { },
    translate() { }, rotate() { },
    measureText: text => ({ width: text.length * 6 }),
    fillText: text => labels.push(text),
  };
  tool.render(context, point => point);
  assert.ok(ringRadii.includes(8), 'the selected corner keeps a visible selection ring');
  activeSketch = null;
  tool.render(context, point => point);
  assert.ok(labels.includes('40') && labels.includes('15'), 'typed rectangle dimensions are shown without the Distance tool');
  assert.ok(labels.includes('26.926'), 'the measurement remains visible after finishing the sketch');
  assert.ok(arrowPaths > 10, 'dimension annotations draw extension lines and arrowheads');
});

test('snapping uses a 0.001 mm grid and prioritizes the origin and existing endpoints', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  const step = cad.sketchGrid.steps(camera.unit(bounds.width, bounds.height)).snap;
  assert.equal(step, 0.001);
  assert.deepEqual(Array.from(cad.sketchSnap.snap(sketch, [0.8, -0.7], camera, bounds).point), [0, 0]);
  assert.equal(cad.sketchSnap.snap(sketch, [0.8, -0.7], camera, bounds).kind, 'origin');
  const gridIntersection = cad.sketchSnap.snap(sketch, [12.6, 12.5], camera, bounds);
  assert.equal(gridIntersection.kind, 'grid-intersection');
  assert.deepEqual(Array.from(gridIntersection.point), [12.5, 12.5]);
  const verticalGridLine = cad.sketchSnap.snap(sketch, [12.6, 13.4567], camera, bounds);
  assert.equal(verticalGridLine.kind, 'grid-line');
  assert.deepEqual(Array.from(verticalGridLine.point), [12.5, 13.457]);
  const horizontalGridLine = cad.sketchSnap.snap(sketch, [13.4567, 12.6], camera, bounds);
  assert.equal(horizontalGridLine.kind, 'grid-line');
  assert.deepEqual(Array.from(horizontalGridLine.point), [13.457, 12.5]);
  assert.deepEqual(Array.from(cad.sketchSnap.snap(sketch, [13.55, 13.55], camera, bounds).point), [13.55, 13.55]);
  document.insertEntity(sketch, document.makeLine([12.1, 7.9], [31.2, 18.4]));
  assert.deepEqual(Array.from(cad.sketchSnap.snap(sketch, [12.5, 8], camera, bounds).point), [12.1, 7.9]);
  document.insertEntity(sketch, document.makeLine([0.1, 0], [5, 0]));
  assert.equal(cad.sketchSnap.snap(sketch, [0.1, 0], camera, bounds).kind, 'origin');
  assert.equal(cad.sketchSnap.snap(sketch, [1001, 0], camera, bounds), null);
  assert.equal(cad.sketchSnap.withinBounds({ type: 'circle', center: [995, 0], radius: 10 }), false);
});

test('hovered circle center gives temporary horizontal and vertical inference without a click', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [37.123, 42.456], radius: 12 }));
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  const anchor = [37.123, 42.456];
  const vertical = cad.sketchSnap.snap(sketch, [37.7, 74.321], camera, bounds, { trackingAnchor: anchor });
  assert.ok(vertical.kind.startsWith('inference-'));
  assert.equal(vertical.point[0], anchor[0]);
  const horizontal = cad.sketchSnap.snap(sketch, [69.654, 41.9], camera, bounds, { trackingAnchor: anchor });
  assert.ok(horizontal.kind.startsWith('inference-'));
  assert.equal(horizontal.point[1], anchor[1]);
  const below = cad.sketchSnap.snap(sketch, [36.7, -10.222], camera, bounds, { trackingAnchor: anchor });
  assert.ok(below.kind.startsWith('inference-'));
  assert.equal(below.point[0], anchor[0]);
  assert.notEqual(cad.sketchSnap.snap(sketch, [69.654, 41.9], camera, bounds).kind, 'inference-horizontal');
  assert.ok(!cad.sketchSnap.snap(sketch, [69.654, 65], camera, bounds,
    { trackingAnchor: anchor }).kind.startsWith('inference-'));
});

test('an in-progress Line snaps to every 15-degree direction from its start point', () => {
  const doc = new cad.SketchDocument();
  const sketch = doc.makeSketch('XY');
  const anchor = [37.123, 42.456];
  doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: anchor, radius: 12 }));
  const camera = new cad.Camera();
  camera.selectView('top');
  for (let angle = 0; angle < 360; angle += 15) {
    const radians = angle * Math.PI / 180;
    const dx = Math.cos(radians), dy = Math.sin(radians);
    const nearRay = [anchor[0] + dx * 42.317 - dy * 0.3,
    anchor[1] + dy * 42.317 + dx * 0.3];
    const hit = cad.sketchSnap.snap(sketch, nearRay, camera, { width: 800, height: 600 },
      { trackingAnchor: anchor, trackingAngleStep: 15 });
    assert.equal(hit.angle, angle, `${angle}° ray is identified`);
    assert.ok(hit.kind.startsWith('inference-'));
    const snappedAngle = (Math.atan2(hit.point[1] - anchor[1], hit.point[0] - anchor[0]) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(snappedAngle - angle) < 0.01 || (angle === 0 && snappedAngle > 359.99),
      `${angle}° ray keeps its exact direction`);
  }
});

test('special-angle tracking also catches visible grid intersections and grid lines', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const camera = new cad.Camera(); camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  const { major, minor } = cad.sketchGrid.steps(camera.unit(bounds.width, bounds.height));
  const visibleStep = minor * camera.unit(bounds.width, bounds.height) >= 4.5 ? minor : major;
  const corner = visibleStep * 2;
  const fortyFive = cad.sketchSnap.snap(sketch, [corner + 0.1, corner - 0.1], camera, bounds,
    { trackingAnchor: [0, 0], trackingAngleStep: 15 });
  assert.equal(fortyFive.kind, 'inference-grid-intersection');
  assert.deepEqual([...fortyFive.point], [corner, corner]);
  assert.equal(fortyFive.angle, 45);
  const offRay = cad.sketchSnap.snap(sketch, [corner, corner], camera, bounds,
    { trackingAnchor: [0.4, 0], trackingAngleStep: 15 });
  assert.equal(offRay.kind, 'grid-intersection', 'a pointer on the crossing chooses the grid when the ray misses it');
  assert.deepEqual([...offRay.point], [corner, corner]);
  const x = visibleStep * 3;
  const fifteen = cad.sketchSnap.snap(sketch, [x + 0.05, x * Math.tan(Math.PI / 12) - 0.05], camera, bounds,
    { trackingAnchor: [0, 0], trackingAngleStep: 15 });
  assert.equal(fifteen.kind, 'inference-grid-line');
  assert.equal(fifteen.point[0], x);
  assert.equal(fifteen.angle, 15);
  assert.ok(Math.abs(fifteen.point[1] - x * Math.tan(Math.PI / 12)) < 0.001);
});

test('Line, Rectangle, and Circle use combined angle and grid snapping', () => {
  const previousDocument = sandbox.document;
  sandbox.document = { querySelector: () => null, addEventListener() {} };
  try {
    const document = new cad.SketchDocument();
    const sketch = document.makeSketch('XY');
    const camera = new cad.Camera(); camera.selectView('top');
    const bounds = { left: 0, top: 0, width: 800, height: 600 };
    const canvas = { style: {}, classList: { toggle() {} }, addEventListener() {},
      getBoundingClientRect: () => bounds };
    const tool = new cad.SketchToolController({ canvas,
      hud: { hidden: true, replaceChildren() {} }, document, camera,
      history: new cad.HistoryManager(), getActiveSketch: () => sketch,
      onChange() {}, onToolChange() {} });
    const { major, minor } = cad.sketchGrid.steps(camera.unit(bounds.width, bounds.height));
    const visibleStep = minor * camera.unit(bounds.width, bounds.height) >= 4.5 ? minor : major;
    const corner = visibleStep * 2;
    const [clientX, clientY] = camera.project(document.toWorld(sketch, [corner + 0.1, corner - 0.1]),
      bounds.width, bounds.height);
    for (const mode of ['line', 'rectangle', 'circle']) {
      tool.tool = mode;
      tool.start = [0, 0];
      tool.pointAt({ clientX, clientY });
      assert.equal(tool.snapKind, 'inference-grid-intersection', mode);
      assert.deepEqual([...tool.hoverPoint], [corner, corner], mode);
    }
  } finally { sandbox.document = previousDocument; }
});

test('Line remembers a hovered center and shows an inferred point while waiting for its first click', () => {
  const events = new Map();
  const oldDocument = sandbox.document;
  sandbox.document = { querySelector: () => null, addEventListener() { } };
  try {
    const doc = new cad.SketchDocument();
    const sketch = doc.makeSketch('XY');
    doc.insertEntity(sketch, doc.makeEntity({ type: 'circle', center: [30, 35], radius: 10 }));
    const camera = new cad.Camera();
    camera.selectView('top');
    const bounds = { left: 0, top: 0, width: 800, height: 600 };
    const canvas = {
      style: {}, classList: { toggle() { } },
      addEventListener: (type, callback) => events.set(type, callback), getBoundingClientRect: () => bounds
    };
    const hud = { hidden: true, replaceChildren() { } };
    const tool = new cad.SketchToolController({
      canvas, hud, document: doc, camera,
      history: new cad.HistoryManager(), getActiveSketch: () => sketch,
      onChange() { }, onToolChange() { }
    });
    tool.setTool('line');
    const move = point => {
      const [clientX, clientY] = camera.project(doc.toWorld(sketch, point), bounds.width, bounds.height);
      events.get('pointermove')({ clientX, clientY, pointerId: 1, target: canvas });
    };
    move([30, 35]);
    assert.equal(tool.inferenceAnchor?.part, 'center');
    assert.equal(tool.start, null);
    move([30.55, 70.123]);
    assert.equal(tool.snapKind, 'inference-grid-intersection');
    assert.deepEqual([...tool.hoverPoint], [30, 70]);
    assert.deepEqual([...tool.inferenceGuide.anchor], [30, 35]);
    assert.equal(tool.start, null);
    sketch.entities[0].center = [34, 35];
    sketch.revision++;
    move([34.55, 80]);
    assert.deepEqual([...tool.hoverPoint], [34, 80], 'the guide follows a moved source center');
    move([64.4, 65.1]);
    assert.notEqual(tool.snapKind, 'inference-angle', 'hovering a circle center offers only cardinal tracking');
    tool.start = [34, 35];
    const [clientX, clientY] = camera.project(doc.toWorld(sketch, [64.4, 65.1]), bounds.width, bounds.height);
    assert.ok(tool.pointAt({ clientX, clientY }));
    assert.equal(tool.inferenceGuide.angle, 45, 'a placed Line start enables 15-degree tracking');
    assert.ok(tool.snapKind.startsWith('inference-'));
    events.get('pointerleave')();
    assert.equal(tool.inferenceAnchor, null);
  } finally {
    sandbox.document = oldDocument;
  }
});

test('a Circle radius snaps to 0, 90, 180 and 270 degrees from its placed center', () => {
  const previousDocument = sandbox.document;
  sandbox.document = { querySelector: () => null, addEventListener() { } };
  try {
    const document = new cad.SketchDocument();
    const sketch = document.makeSketch('XY');
    const camera = new cad.Camera();
    camera.selectView('top');
    const bounds = { left: 0, top: 0, width: 800, height: 600 };
    const canvas = {
      style: {}, classList: { toggle() { } }, addEventListener() { },
      getBoundingClientRect: () => bounds
    };
    const hud = { hidden: true, replaceChildren() { } };
    const tool = new cad.SketchToolController({
      canvas, hud, document, camera,
      history: new cad.HistoryManager(), getActiveSketch: () => sketch,
      onChange() { }, onToolChange() { }
    });
    tool.tool = 'circle';
    tool.start = [37.123, 42.456];
    for (const [angle, offset] of [[0, [42.317, 0.4]], [90, [0.4, 42.317]],
    [180, [-42.317, -0.4]], [270, [-0.4, -42.317]]]) {
      const world = document.toWorld(sketch, [tool.start[0] + offset[0], tool.start[1] + offset[1]]);
      const [clientX, clientY] = camera.project(world, bounds.width, bounds.height);
      tool.pointAt({ clientX, clientY });
      assert.equal(tool.inferenceGuide?.angle, angle);
      assert.ok(tool.snapKind?.startsWith('inference-'));
      if (angle % 180 === 0) assert.equal(tool.hoverPoint[1], tool.start[1]);
      else assert.equal(tool.hoverPoint[0], tool.start[0]);
    }
  } finally { sandbox.document = previousDocument; }
});

test('line and rectangle edges attract nearby sketch points without losing fine precision', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([20, 20], [40, 20]);
  const rectangle = document.makeEntity({ type: 'rectangle', start: [50, 20], end: [70, 40] });
  document.insertEntity(sketch, line);
  document.insertEntity(sketch, rectangle);
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  const lineSnap = cad.sketchSnap.snap(sketch, [27.1374, 20.9], camera, bounds);
  assert.equal(lineSnap.kind, 'on-edge');
  assert.equal(lineSnap.entityId, line.id);
  assert.ok(Math.abs(lineSnap.point[0] - 27.137) < 1e-8);
  assert.equal(lineSnap.point[1], 20);
  assert.notEqual(cad.sketchSnap.snap(sketch, [27.1374, 20.9], camera, bounds,
    { excludeEntityId: line.id }).kind, 'on-edge', 'dragging a line does not attract to itself');
  const rectangleSnap = cad.sketchSnap.snap(sketch, [69.1, 27.1374], camera, bounds);
  assert.equal(rectangleSnap.kind, 'on-edge');
  assert.equal(rectangleSnap.entityId, rectangle.id);
  assert.equal(rectangleSnap.point[0], 70);
  assert.ok(Math.abs(rectangleSnap.point[1] - 27.137) < 1e-8);
});

test('circle rims attract nearby sketch points without snapping to the center', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const circle = document.makeEntity({ type: 'circle', center: [80, 80], radius: 20 });
  document.insertEntity(sketch, circle);
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  for (const near of [[98.9, 82], [100.8, 80.5]]) {
    const hit = cad.sketchSnap.snap(sketch, near, camera, bounds);
    assert.equal(hit.kind, 'on-circle');
    assert.equal(hit.entityId, circle.id);
    assert.ok(Math.abs(Math.hypot(hit.point[0] - 80, hit.point[1] - 80) - 20) < 1e-9);
  }
  assert.notEqual(cad.sketchSnap.snap(sketch, [95, 85], camera, bounds).kind, 'on-circle');
  assert.notEqual(cad.sketchSnap.snap(sketch, [98.9, 82], camera, bounds,
    { excludeEntityId: circle.id }).kind, 'on-circle');
  const trackedRim = cad.sketchSnap.snap(sketch, [100.3, 80.1], camera, bounds,
    { trackingAnchor: circle.center, trackingAngleStep: 90 });
  assert.equal(trackedRim.kind, 'on-circle', 'an actual circle-rim hit wins over a hover guide');
  assert.equal(trackedRim.entityId, circle.id);
  const smallCircle = document.makeEntity({ type: 'circle', center: [30, 30], radius: 1 });
  document.insertEntity(sketch, smallCircle);
  const smallRim = cad.sketchSnap.snap(sketch, [30.9, 30.1], camera, bounds);
  assert.equal(smallRim.kind, 'on-circle');
  assert.equal(smallRim.entityId, smallCircle.id);
});

test('millimetre inputs and small geometry retain three decimal places', () => {
  assert.equal(cad.sketchGeometry.formatValue(17.1234, 'length'), '17.123');
  assert.equal(cad.sketchGeometry.valid({ type: 'line', start: [13.123, 2], end: [13.124, 2] }), true);
  assert.equal(cad.sketchGeometry.valid({ type: 'rectangle', start: [13.123, 2], end: [13.124, 2.001] }), true);
  const document = new cad.SketchDocument();
  const line = document.makeLine([0, 0], [1, 0]);
  assert.deepEqual(Array.from(document.lineEndAtLength(line, 0.001)), [0.001, 0]);
});

test('midpoint snapping, markers, and line-length edits follow the underlying geometry', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([10, 10], [40, 10]);
  const rectangle = document.makeEntity({ type: 'rectangle', start: [50, 0], end: [70, 20] });
  document.insertEntity(sketch, line);
  document.insertEntity(sketch, rectangle);
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { width: 800, height: 600 };
  const snap = cad.sketchSnap.snap(sketch, [25.2, 10.1], camera, bounds);
  assert.equal(snap.kind, 'midpoint');
  assert.deepEqual(Array.from(snap.point), [25, 10]);
  const edgeSnap = cad.sketchSnap.snap(sketch, [60, 0.2], camera, bounds);
  assert.equal(edgeSnap.kind, 'midpoint');
  assert.equal(edgeSnap.entityId, rectangle.id);
  const marker = document.makeMidpointMarker(line.id, 0);
  document.insertMidpoint(sketch, marker);
  assert.deepEqual(Array.from(cad.sketchHitTest.markerPoint(sketch, marker)), [25, 10]);
  const revision = sketch.revision;
  const shortened = document.lineEndAtLength(line, 25);
  assert.deepEqual(Array.from(shortened), [35, 10]);
  assert.equal(document.setLineEnd(sketch, line.id, shortened), true);
  assert.ok(sketch.revision > revision);
  assert.deepEqual(Array.from(line.start), [10, 10]);
  assert.deepEqual(Array.from(cad.sketchHitTest.markerPoint(sketch, marker)), [22.5, 10]);
  assert.equal(document.lineEndAtLength(line, -1), null);
  assert.equal(document.setLineEnd(sketch, line.id, [2000, 10]), false);
});

test('circle boundary hit testing finds the perimeter and diameter edits update its profile', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const circle = document.makeEntity({ type: 'circle', center: [20, 20], radius: 10 }, { diameter: 20 });
  document.insertEntity(sketch, circle);
  const camera = new cad.Camera();
  camera.selectView('top');
  const project = point => camera.project(document.toWorld(sketch, point), 800, 600);
  const boundary = cad.sketchHitTest.boundaryAt(sketch, project, project([30, 20]));
  assert.equal(boundary.entity.id, circle.id);
  assert.equal(cad.sketchHitTest.boundaryAt(sketch, project, project([20, 20])), null);
  const before = cad.sketchProfiles.fromSketch(sketch);
  assert.ok(cad.sketchProfiles.hitTest(before, [28, 20], (_, point) => point));
  assert.equal(document.setCircleRadius(sketch, circle.id, 5), true);
  assert.equal(circle.dimensions.diameter, 10);
  assert.equal(cad.sketchProfiles.hitTest(cad.sketchProfiles.fromSketch(sketch), [28, 20], (_, point) => point), null);
  assert.equal(document.setCircleRadius(sketch, circle.id, 1500), false);
});

test('angle measurement gives the smaller intersection angle and is drawable', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const first = document.makeLine([0, 0], [30, 0]);
  const second = document.makeLine([0, 0], [30, 30]);
  document.insertEntity(sketch, first);
  document.insertEntity(sketch, second);
  const angle = cad.sketchAngle.measure(first, second);
  assert.ok(Math.abs(angle.degrees - 45) < 1e-9);
  const measurement = document.makeAngleMeasurement(first.id, second.id);
  const labels = [];
  const context = {
    save() { }, restore() { }, setLineDash() { }, beginPath() { }, moveTo() { }, lineTo() { }, stroke() { },
    arc() { }, fill() { }, fillRect() { }, closePath() { },
    measureText: text => ({ width: text.length * 7 }),
    fillText: text => labels.push(text),
  };
  const hit = cad.SketchDistance.draw(context, point => point, measurement, sketch);
  assert.ok(labels.includes('45°'));
  assert.ok(hit.width > 0 && hit.height > 0);
  assert.equal(cad.sketchAngle.measure(first, document.makeLine([0, 5], [30, 5])), null);
});

test('dimension bars remain attached to their geometry while labels move', () => {
  const strokes = [];
  let path = [];
  const context = {
    save() { }, restore() { }, setLineDash() { }, beginPath() { path = []; },
    moveTo(...point) { path.push(point); }, lineTo(...point) { path.push(point); },
    stroke() { strokes.push(path); }, fill() { }, fillRect() { }, closePath() { }, arc() { },
    translate() { }, rotate() { }, measureText: text => ({ width: text.length * 7 }), fillText() { },
  };
  const first = cad.sketchDimensions.linear(context, [0, 0], [100, 0], 100, { placement: [30, -15] });
  assert.deepEqual(Array.from(strokes[0][0]), [0, 0]);
  assert.deepEqual(Array.from(strokes[1][0]), [100, 0]);
  assert.deepEqual(Array.from(strokes[2][0]), [0, -43]);
  assert.deepEqual(Array.from(strokes[2][1]), [100, -43]);
  assert.deepEqual(Array.from(first.center), [80, -54]);
  strokes.length = 0;
  const second = cad.sketchDimensions.linear(context, [0, 0], [100, 0], 100, { placement: [-120, 20] });
  assert.deepEqual(Array.from(strokes[2][0]), [0, -8]);
  assert.deepEqual(Array.from(strokes[2][1]), [100, -8]);
  assert.deepEqual(Array.from(second.center), [-70, -19]);

  const circle = { center: [0, 0], radius: 10 };
  strokes.length = 0;
  const upper = cad.sketchDimensions.circleDiameter(context, circle, point => point, { placement: [-55, 30] });
  assert.ok(Math.abs(strokes[0][0][0]) < 1e-9 && Math.abs(strokes[0][1][0]) < 1e-9);
  assert.ok(Math.abs(strokes[0][0][1] + 10) < 1e-9 && Math.abs(strokes[0][1][1] - 10) < 1e-9);
  assert.ok(Math.abs(strokes[1][0][0] - strokes[1][1][0]) < 1e-9,
    'the outside diameter leader stays on the straight diameter axis');
  assert.deepEqual(Array.from(upper.center), [0, 30]);
  strokes.length = 0;
  const inside = cad.sketchDimensions.circleDiameter(context, circle, point => point, { placement: [-50, 5] });
  assert.ok(Math.abs(Math.hypot(...strokes[0][0]) - 10) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...strokes[0][1]) - 10) < 1e-9);
  assert.deepEqual(Array.from(inside.center), [5, 5]);
});

test('distance annotations can move and a line-length label edits only the line end', () => {
  const listeners = new Map();
  const canvas = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    classList: { toggle() { } },
    setPointerCapture() { },
  };
  const inputListeners = new Map();
  const input = {
    style: {}, classList: { add() { } },
    addEventListener: (name, listener) => inputListeners.set(name, listener),
    setAttribute() { }, focus() { }, select() { }, remove() { },
  };
  const pane = { append(element) { assert.equal(element, input); } };
  sandbox.document = { createElement: () => input };
  sandbox.setTimeout = setTimeout;
  runInNewContext(readFileSync(new URL('js/sketch-annotation-interaction.js', root), 'utf8'), sandbox, { filename: 'js/sketch-annotation-interaction.js' });
  const sketchDocument = new cad.SketchDocument();
  const sketch = sketchDocument.makeSketch('XY');
  const line = sketchDocument.makeLine([5, 5], [35, 5]);
  sketchDocument.insertEntity(sketch, line);
  const measurement = sketchDocument.makeLineMeasurement(line.id);
  sketchDocument.insertMeasurement(sketch, measurement);
  const history = new cad.HistoryManager();
  const interaction = new cad.SketchAnnotationInteraction({ canvas, pane, sketchDocument, history, onChange() { } });
  interaction.setHits([{ sketch, measurement, center: [20, 20], width: 30, height: 20 }]);
  const event = (clientX, clientY) => ({
    pointerType: 'mouse', button: 0, pointerId: 1,
    clientX, clientY, preventDefault() { }
  });
  listeners.get('pointerdown')(event(20, 20));
  listeners.get('pointermove')(event(40, 30));
  listeners.get('pointerup')(event(40, 30));
  assert.deepEqual(Array.from(measurement.placement), [20, 10]);
  history.undo();
  assert.deepEqual(Array.from(measurement.placement), [0, 0]);
  history.redo();
  assert.deepEqual(Array.from(measurement.placement), [20, 10]);
  interaction.setHits([{ sketch, measurement, center: [40, 30], width: 30, height: 20 }]);
  listeners.get('dblclick')(event(40, 30));
  assert.equal(input.value, '30');
  input.value = '25';
  inputListeners.get('keydown')({ key: 'Enter', preventDefault() { } });
  assert.deepEqual(Array.from(line.start), [5, 5]);
  assert.deepEqual(Array.from(line.end), [30, 5]);
  history.undo();
  assert.deepEqual(Array.from(line.end), [35, 5]);
  history.redo();
  assert.deepEqual(Array.from(line.end), [30, 5]);

  const rectangle = sketchDocument.makeEntity({ type: 'rectangle', start: [50, 50], end: [90, 70] },
    { width: 40, height: 20 });
  sketchDocument.insertEntity(sketch, rectangle);
  const edgeMeasurement = sketchDocument.makeRectangleEdgeMeasurement(rectangle.id, 0);
  sketchDocument.insertMeasurement(sketch, edgeMeasurement);
  assert.ok(cad.sketchProfiles.hitTest(cad.sketchProfiles.fromSketch(sketch), [85, 60], (_, point) => point));
  interaction.setHits([{ sketch, measurement: edgeMeasurement, center: [70, 40], width: 32, height: 20 }]);
  listeners.get('dblclick')(event(70, 40));
  assert.equal(input.value, '40');
  input.value = '25';
  inputListeners.get('keydown')({ key: 'Enter', preventDefault() { } });
  assert.deepEqual(Array.from(rectangle.start), [50, 50]);
  assert.deepEqual(Array.from(rectangle.end), [75, 70]);
  assert.equal(rectangle.dimensions.width, 25);
  assert.equal(rectangle.dimensions.height, 20);
  assert.equal(cad.sketchProfiles.hitTest(cad.sketchProfiles.fromSketch(sketch), [85, 60], (_, point) => point), null);
  history.undo();
  assert.deepEqual(Array.from(rectangle.end), [90, 70]);
  history.redo();
  assert.deepEqual(Array.from(rectangle.end), [75, 70]);
  assert.deepEqual(Array.from(sketchDocument.rectangleEndAtEdgeLength(rectangle, 1, 12)), [75, 62]);
  interaction.setHits([{ sketch, entity: rectangle, key: 'height', center: [43, 60], width: 32, height: 20 }]);
  listeners.get('dblclick')(event(43, 60));
  assert.equal(input.value, '20');
  input.value = '15';
  inputListeners.get('keydown')({ key: 'Enter', preventDefault() { } });
  assert.deepEqual(Array.from(rectangle.end), [75, 65]);
  assert.equal(rectangle.dimensions.height, 15);

  const circle = sketchDocument.makeEntity({ type: 'circle', center: [100, 100], radius: 15 });
  sketchDocument.insertEntity(sketch, circle);
  const diameterMeasurement = sketchDocument.makeCircleDiameterMeasurement(circle.id);
  sketchDocument.insertMeasurement(sketch, diameterMeasurement);
  interaction.setHits([{ sketch, measurement: diameterMeasurement, center: [140, 100], width: 44, height: 20 }]);
  listeners.get('dblclick')(event(140, 100));
  assert.equal(input.value, '30');
  input.value = '20';
  inputListeners.get('keydown')({ key: 'Enter', preventDefault() { } });
  assert.equal(circle.radius, 10);
  history.undo();
  assert.equal(circle.radius, 15);
  history.redo();
  assert.equal(circle.radius, 10);
  const labels = [];
  const context = {
    save() { }, restore() { }, setLineDash() { }, beginPath() { }, moveTo() { }, lineTo() { }, arc() { },
    stroke() { }, fill() { }, fillRect() { }, closePath() { }, translate() { }, rotate() { }, measureText: text => ({ width: text.length * 7 }),
    fillText: text => labels.push(text)
  };
  cad.SketchDistance.draw(context, point => point, diameterMeasurement, sketch);
  assert.ok(labels.includes('Ø20'));
});

test('Distance, Angle, and Midpoint tools create linked annotations', () => {
  const listeners = new Map();
  const documentListeners = new Map();
  const canvas = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    classList: { toggle() { } },
    style: {},
    focus() { },
  };
  const hud = { hidden: true, replaceChildren() { }, contains: () => false };
  sandbox.document = { addEventListener: (name, listener) => documentListeners.set(name, listener), querySelector: () => null };
  runInNewContext(readFileSync(new URL('js/sketch-tool.js', root), 'utf8'), sandbox, { filename: 'js/sketch-tool.js' });
  const sketchDocument = new cad.SketchDocument();
  const sketch = sketchDocument.makeSketch('XY');
  sketchDocument.insertSketch(sketch);
  const first = sketchDocument.makeLine([10, 10], [40, 10]);
  const second = sketchDocument.makeLine([10, 10], [40, 40]);
  const rectangle = sketchDocument.makeEntity({ type: 'rectangle', start: [50, 0], end: [70, 20] });
  for (const entity of [first, second, rectangle]) sketchDocument.insertEntity(sketch, entity);
  const camera = new cad.Camera();
  camera.selectView('top');
  const history = new cad.HistoryManager();
  const tool = new cad.SketchToolController({
    canvas, hud, document: sketchDocument, camera, history,
    getActiveSketch: () => sketch, onChange() { }, onToolChange() { }
  });
  const click = point => {
    const [clientX, clientY] = camera.project(sketchDocument.toWorld(sketch, point), 800, 600);
    listeners.get('click')({ button: 0, clientX, clientY });
  };
  tool.setTool('distance');
  click([25, 10]);
  assert.equal(sketch.measurements.length, 1);
  assert.equal(sketch.measurements[0].kind, 'line-length');
  assert.equal(sketch.measurements[0].entityId, first.id);
  assert.equal(first.dimensions.length, undefined, 'Distance keeps one source of truth and can be undone');
  click([25, 10]);
  assert.equal(sketch.measurements.length, 1, 'a second click does not duplicate the dimension');
  tool.setTool('angle');
  click([30, 10]);
  click([25, 25]);
  assert.equal(sketch.measurements[1].kind, 'angle');
  assert.ok(Math.abs(cad.sketchAngle.measure(first, second).degrees - 45) < 1e-9);
  tool.setTool('midpoint');
  click([60, 0]);
  assert.equal(sketch.midpoints.length, 1);
  assert.deepEqual(Array.from(cad.sketchHitTest.markerPoint(sketch, sketch.midpoints[0])), [60, 0]);
  history.undo();
  assert.equal(sketch.midpoints.length, 0);
  history.redo();
  assert.equal(sketch.midpoints.length, 1);
  tool.setTool('distance');
  click([60, 0]);
  assert.equal(sketch.measurements[2].kind, 'rectangle-edge');
  assert.equal(sketch.measurements[2].edgeIndex, 0);
  click([60, 0]);
  assert.equal(sketch.measurements.length, 3, 'the same rectangle edge is measured once');
  click([70, 10]);
  assert.equal(sketch.measurements[3].kind, 'rectangle-edge');
  assert.equal(sketch.measurements[3].edgeIndex, 1);
  click([60, 20]);
  click([50, 10]);
  assert.deepEqual(Array.from(sketch.measurements.slice(2).map(item => item.edgeIndex)), [0, 1],
    'opposite rectangle edges share one width or height dimension');
  const labels = [];
  const context = {
    save() { }, restore() { }, setLineDash() { }, beginPath() { }, moveTo() { }, lineTo() { }, stroke() { },
    fill() { }, fillRect() { }, closePath() { }, translate() { }, rotate() { },
    measureText: text => ({ width: text.length * 6 }), fillText: text => labels.push(text),
  };
  cad.SketchDistance.draw(context, point => point, sketch.measurements[2], sketch);
  assert.ok(labels.includes('20'));
  const circle = sketchDocument.makeEntity({ type: 'circle', center: [100, 100], radius: 10 });
  sketchDocument.insertEntity(sketch, circle);
  click([110, 100]);
  assert.equal(sketch.measurements[4].kind, 'circle-diameter');
  assert.equal(sketch.measurements[4].entityId, circle.id);
  const typedRectangle = sketchDocument.makeEntity({ type: 'rectangle', start: [-60, 60], end: [-40, 70] },
    { width: 20, height: 10 });
  const typedCircle = sketchDocument.makeEntity({ type: 'circle', center: [-100, -100], radius: 5 }, { diameter: 10 });
  sketchDocument.insertEntity(sketch, typedRectangle);
  sketchDocument.insertEntity(sketch, typedCircle);
  click([-50, 60]);
  click([-40, 65]);
  click([-95, -100]);
  assert.equal(sketch.measurements.length, 5, 'typed dimensions are not drawn a second time by Distance');
  const [clientX, clientY] = camera.project(sketchDocument.toWorld(sketch, [110, 100]), 800, 600);
  for (const mode of ['line', 'rectangle', 'circle', 'distance', 'angle', 'midpoint']) {
    tool.setTool(mode);
    listeners.get('pointermove')({ clientX, clientY });
    assert.equal(tool.hoverBoundary?.entity.id, circle.id, `${mode} highlights the circle boundary`);
  }
  tool.setTool('distance');
  for (const [point, expectedId] of [[[25, 10], first.id], [[60, 0], rectangle.id]]) {
    const [x, y] = camera.project(sketchDocument.toWorld(sketch, point), 800, 600);
    listeners.get('pointermove')({ clientX: x, clientY: y });
    assert.equal(tool.hoverBoundary?.entity.id, expectedId);
  }
  tool.setTool('tangent');
  click([25, 10]);
  click([110, 100]);
  assert.equal(sketch.constraints.length, 0, 'a fixed line dimension is not silently changed by tangency');
  tool.setTool('axis');
  click([25, 25]);
  assert.equal(sketch.constraints.length, 1);
  assert.ok(Math.abs(second.end[1] - second.start[1]) < 1e-8);
  history.undo();
  assert.equal(sketch.constraints.length, 0);
  assert.deepEqual(Array.from(second.end), [40, 40]);
  history.redo();
  assert.equal(sketch.constraints.length, 1);
  assert.ok(Math.abs(second.end[1] - second.start[1]) < 1e-8);
});

test('point entities snap, remain independent of profiles, and support undo', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const point = document.makeEntity({ type: 'point', position: [12.5, 7.5] });
  document.insertEntity(sketch, point);
  assert.equal(cad.sketchGeometry.valid(point), true);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 0);
  const camera = new cad.Camera();
  camera.selectView('top');
  assert.deepEqual(Array.from(cad.sketchSnap.snap(sketch, [12.6, 7.4], camera, { width: 800, height: 600 }).point),
    [12.5, 7.5]);
  document.removeEntity(sketch, point.id);
  assert.equal(sketch.entities.length, 0);
});

test('horizontal, vertical and tangent constraints change geometry and remain enforceable', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeLine([0, 0], [20, 10]);
  document.insertEntity(sketch, line);
  const horizontal = document.makeConstraint(cad.sketchConstraints.makeAxis(line, 'horizontal'));
  document.insertConstraint(sketch, horizontal);
  assert.equal(cad.sketchConstraints.enforce(sketch), true);
  assert.ok(Math.abs(line.end[1]) < 1e-8);
  document.removeConstraint(sketch, horizontal.id);
  const vertical = document.makeConstraint(cad.sketchConstraints.makeAxis(line, 'vertical'));
  document.insertConstraint(sketch, vertical);
  cad.sketchConstraints.enforce(sketch);
  assert.ok(Math.abs(line.end[0]) < 1e-8);
  document.removeConstraint(sketch, vertical.id);

  const freeLine = document.makeLine([0, -20], [45, -18]);
  const circle = document.makeEntity({ type: 'circle', center: [50, 0], radius: 10 });
  document.insertEntity(sketch, freeLine);
  document.insertEntity(sketch, circle);
  const tangent = document.makeConstraint(cad.sketchConstraints.makeTangent(freeLine, circle));
  assert.equal(tangent.type, 'tangent');
  document.insertConstraint(sketch, tangent);
  cad.sketchConstraints.enforce(sketch);
  const contact = freeLine[tangent.movingEnd];
  const anchor = freeLine[tangent.movingEnd === 'end' ? 'start' : 'end'];
  const lineVector = [contact[0] - anchor[0], contact[1] - anchor[1]];
  const radiusVector = [contact[0] - circle.center[0], contact[1] - circle.center[1]];
  assert.ok(Math.abs(lineVector[0] * radiusVector[0] + lineVector[1] * radiusVector[1]) < 1e-6);
  circle.radius = 12;
  cad.sketchConstraints.enforce(sketch);
  assert.ok(Math.abs(Math.hypot(freeLine[tangent.movingEnd][0] - circle.center[0],
    freeLine[tangent.movingEnd][1] - circle.center[1]) - 12) < 1e-6);

  const otherCircle = document.makeEntity({ type: 'circle', center: [80, 0], radius: 5 });
  document.insertEntity(sketch, otherCircle);
  document.insertConstraint(sketch, document.makeConstraint(cad.sketchConstraints.makeTangent(circle, otherCircle)));
  cad.sketchConstraints.enforce(sketch);
  assert.ok(Math.abs(Math.hypot(otherCircle.center[0] - circle.center[0],
    otherCircle.center[1] - circle.center[1]) - 17) < 1e-6);
});

test('point-to-point horizontal and vertical constraints align points and maintain constraint', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');

  // 1. Circle center horizontally aligned with Origin [0, 0]
  const circle = document.makeEntity({ type: 'circle', center: [50, 25], radius: 10 });
  document.insertEntity(sketch, circle);
  const p1Origin = { part: 'origin', isOrigin: true, point: [0, 0] };
  const p2Circle = { entityId: circle.id, part: 'center', point: circle.center };
  assert.equal(cad.sketchConstraints.axisFor(p1Origin.point, p2Circle.point), 'horizontal');

  const c1 = document.makeConstraint(cad.sketchConstraints.makeAxisPoints(p1Origin, p2Circle, 'horizontal'));
  document.insertConstraint(sketch, c1);
  assert.equal(cad.sketchConstraints.enforce(sketch), true);
  assert.equal(circle.center[1], 0, 'circle center Y aligns with origin Y = 0');
  assert.equal(circle.center[0], 50, 'circle center X remains unchanged');

  // 2. Standalone point vertically aligned with rectangle corner
  const rect = document.makeEntity({ type: 'rectangle', start: [10, 10], end: [30, 40] });
  const pt = document.makeEntity({ type: 'point', position: [15, 80] });
  document.insertEntity(sketch, rect);
  document.insertEntity(sketch, pt);

  const rectCorner0 = { entityId: rect.id, part: 'corner', cornerIndex: 0, point: [10, 10] };
  const pointRef = { entityId: pt.id, part: 'position', point: pt.position };
  assert.equal(cad.sketchConstraints.axisFor(rectCorner0.point, pointRef.point), 'vertical');

  const c2 = document.makeConstraint(cad.sketchConstraints.makeAxisPoints(rectCorner0, pointRef, 'vertical'));
  document.insertConstraint(sketch, c2);
  assert.equal(cad.sketchConstraints.enforce(sketch), true);
  assert.equal(pt.position[0], 10, 'point X aligns with rect corner X = 10');
  assert.equal(pt.position[1], 80, 'point Y remains unchanged');

  // 3. Hit test for constraint badges
  const project = p => p;
  const hit = cad.sketchConstraints.hitTest(sketch, project, [25, 0], 15);
  assert.ok(hit, 'constraint badge detected at midpoint of origin and circle center');
  assert.equal(hit.constraint.id, c1.id);
});

test('shortcut bindings can be changed without collisions and restored', () => {
  assert.equal(cad.shortcuts.toolFor('p'), 'point');
  assert.equal(cad.shortcuts.set('point', 'Q'), true);
  assert.equal(cad.shortcuts.toolFor('q'), 'point');
  assert.equal(cad.shortcuts.toolFor('p'), null);
  assert.equal(cad.shortcuts.set('point', 'L'), false);
  assert.equal(cad.shortcuts.set('point', 'Backspace'), false);
  cad.shortcuts.reset();
  assert.equal(cad.shortcuts.toolFor('p'), 'point');
});

test('mirror retains dimensions and can copy sketch points', () => {
  sandbox.document = { querySelector: () => null };
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const line = document.makeEntity({ type: 'line', start: [10, 0], end: [20, 0], construction: true }, { length: 10 });
  const point = document.makeEntity({ type: 'point', position: [5, 5] });
  document.insertEntity(sketch, line);
  document.insertEntity(sketch, point);
  const history = new cad.HistoryManager();
  const mirror = new cad.SketchMirror({ getActiveSketch: () => sketch, document, history, onChange() { } });
  mirror.selectedObjectIds.add(line.id);
  mirror.selectedObjectIds.add(point.id);
  mirror.mirrorLine = { start: [0, 0], end: [0, 1] };
  mirror.commit();
  assert.equal(sketch.entities.length, 4);
  assert.deepEqual(Array.from(sketch.entities[2].start), [-10, 0]);
  assert.equal(sketch.entities[2].dimensions.length, 10);
  assert.equal(sketch.entities[2].construction, true);
  assert.deepEqual(Array.from(sketch.entities[3].position), [-5, 5]);
  history.undo();
  assert.equal(sketch.entities.length, 2);
  history.redo();
  assert.equal(sketch.entities.length, 4);
});

test('circle drawing keeps diameter and radius linked while only one value is locked', () => {
  const tool = Object.create(cad.SketchToolController.prototype);
  tool.tool = 'circle';
  tool.start = [0, 0];
  tool.pointer = [6, 8];
  tool.locked = new Map([['diameter', 30]]);
  tool.typed = new Set(['diameter']);
  tool.dirty = new Set();
  tool.inputs = new Map();
  assert.equal(tool.currentValues().radius, 15);
  assert.equal(tool.currentShape().radius, 15);
  tool.locked = new Map([['radius', 7]]);
  tool.typed = new Set(['radius']);
  assert.equal(tool.currentValues().diameter, 14);
  assert.equal(tool.currentShape().radius, 7);
});

test('circle tool only presents radius field in HUD and saves radius dimension', () => {
  assert.equal(cad.sketchGeometry.fields.circle.length, 1);
  assert.equal(cad.sketchGeometry.fields.circle[0].key, 'radius');
  assert.equal(cad.sketchGeometry.fields.circle[0].label, 'Radius');
  assert.equal(cad.sketchGeometry.fields.circle[0].unit, 'mm');
  const createdElements = [];
  const hud = {
    hidden: true,
    replaceChildren() {},
    contains: () => false,
    append(...elements) { createdElements.push(...elements); }
  };
  const inputs = new Map();
  const documentListeners = new Map();
  sandbox.document = {
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    createElement: tag => {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        style: {},
        dataset: {},
        classList: {
          add(c) { this[c] = true; },
          remove(c) { delete this[c]; },
          toggle(c, force) { if (force) this.add(c); else this.remove(c); }
        },
        setAttribute(k, v) { this[k] = v; },
        addEventListener(name, handler) { this[`on_${name}`] = handler; },
        append(...children) { this.children = (this.children || []).concat(children); },
        focus() {},
        select() {}
      };
      return el;
    }
  };
  runInNewContext(readFileSync(new URL('js/sketch-tool.js', root), 'utf8'), sandbox, { filename: 'js/sketch-tool.js' });
  const tool = Object.create(cad.SketchToolController.prototype);
  tool.tool = 'circle';
  tool.inputs = new Map();
  tool.locked = new Map();
  tool.dirty = new Set();
  tool.typed = new Set();
  tool.hud = hud;
  tool.updateHud = () => {};
  tool.showHud();
  assert.equal(tool.inputs.size, 1);
  assert.ok(tool.inputs.has('radius'));
  assert.ok(!tool.inputs.has('diameter'));
});

test('only closed contours become selectable profiles', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const rectangle = document.makeEntity({ type: 'rectangle', start: [0, 0], end: [20, 10] });
  const circle = document.makeEntity({ type: 'circle', center: [50, 50], radius: 5 });
  document.insertEntity(sketch, rectangle);
  document.insertEntity(sketch, circle);
  let profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 2);
  assert.equal(cad.sketchProfiles.hitTest(profiles, [10, 5], (_, point) => point).id, `${sketch.id}:${rectangle.id}`);
  assert.equal(cad.sketchProfiles.hitTest(profiles, [90, 90], (_, point) => point), null);
  const lines = [
    [[100, 100], [120, 100]],
    [[120, 100], [120, 120]],
    [[120, 120], [100, 120]],
  ];
  for (const [start, end] of lines) document.insertEntity(sketch, document.makeLine(start, end));
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 2);
  document.insertEntity(sketch, document.makeLine([100, 120], [100, 100]));
  profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 3);
  assert.ok(cad.sketchProfiles.hitTest(profiles, [110, 110], (_, point) => point));
  document.insertEntity(sketch, document.makeLine([120, 120], [135, 135]));
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 3, 'an attached open branch must not erase the closed face');
});

test('construction geometry stays editable but does not create or divide profiles', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const rectangle = document.makeEntity({ type: 'rectangle', start: [0, 0], end: [20, 10] });
  const divider = document.makeEntity({ type: 'line', start: [-5, 5], end: [25, 5], construction: true });
  const circle = document.makeEntity({ type: 'circle', center: [50, 0], radius: 8, construction: true });
  document.insertEntity(sketch, rectangle);
  document.insertEntity(sketch, divider);
  document.insertEntity(sketch, circle);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 1);
  assert.equal(cad.sketchProfiles.hitTest(cad.sketchProfiles.fromSketch(sketch), [50, 0], (_, point) => point), null);

  const originalRevision = sketch.revision;
  assert.equal(document.setConstruction(sketch, divider.id, false), true);
  assert.equal(sketch.revision, originalRevision + 1);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 2);
  assert.equal(document.setConstruction(sketch, divider.id, true), true);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 1);
  assert.equal(document.setConstruction(sketch, rectangle.id, true), true);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 0);
  assert.equal(document.setConstruction(sketch, rectangle.id, false), true);
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 1);
  assert.equal(document.setConstruction(sketch, rectangle.id, false), false);
  const point = document.makeEntity({ type: 'point', position: [80, 0] });
  document.insertEntity(sketch, point);
  assert.equal(document.setConstruction(sketch, point.id, true), false);
});

test('construction curves draw dashed and restore canvas line style', () => {
  const strokes = [];
  let dash = [];
  const states = [];
  const context = {
    save() { states.push([...dash]); },
    restore() { dash = states.pop(); },
    setLineDash(value) { dash = [...value]; },
    beginPath() { }, moveTo() { }, lineTo() { }, closePath() { },
    stroke() { strokes.push({ dash: [...dash], color: this.strokeStyle }); },
  };
  const project = point => point;
  cad.sketchRender.drawEntity(context, { type: 'line', start: [0, 0], end: [10, 0], construction: true }, project);
  cad.sketchRender.drawEntity(context, { type: 'rectangle', start: [0, 0], end: [10, 10], construction: true }, project);
  assert.equal(strokes.length, 5);
  assert.ok(strokes.every(item => item.dash.join(',') === '6,4' && item.color === '#718b9a'));
  assert.equal(dash.length, 0);
  assert.equal(states.length, 0);
});

test('line intersections create a filled bounded face even when lines continue past it', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  for (const [start, end] of [
    [[-10, 10], [10, 10]],
    [[-8, 10], [0, -10]],
    [[-10, -10], [5, 15]],
  ]) document.insertEntity(sketch, document.makeLine(start, end));
  const profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 1);
  assert.ok(cad.sketchProfiles.hitTest(profiles, [-4, 6], (_, point) => point));
  assert.equal(cad.sketchProfiles.hitTest(profiles, [0, 0], (_, point) => point), null);
});

test('a line crossing a rectangle divides its filled region into two profiles', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [20, 10] }));
  document.insertEntity(sketch, document.makeLine([-5, 5], [25, 5]));
  const profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 2);
  assert.ok(cad.sketchProfiles.hitTest(profiles, [10, 2], (_, point) => point));
  assert.ok(cad.sketchProfiles.hitTest(profiles, [10, 8], (_, point) => point));
});

test('a line crossing a circle divides its filled region into two profiles', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
  document.insertEntity(sketch, document.makeLine([-15, 0], [15, 0]));
  const profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 2);
  assert.ok(cad.sketchProfiles.hitTest(profiles, [0, 5], (_, point) => point));
  assert.ok(cad.sketchProfiles.hitTest(profiles, [0, -5], (_, point) => point));
});

test('a dangling line crossing one boundary keeps the enclosed profile selectable', () => {
  for (const shape of [
    { type: 'circle', center: [0, 0], radius: 10 },
    { type: 'rectangle', start: [-10, -10], end: [10, 10] },
  ]) {
    const document = new cad.SketchDocument();
    const sketch = document.makeSketch('XY');
    document.insertEntity(sketch, document.makeEntity(shape));
    document.insertEntity(sketch, document.makeLine([-20, 0], [0, 0]));
    const profiles = cad.sketchProfiles.fromSketch(sketch);
    assert.ok(cad.sketchProfiles.hitTest(profiles, [5, 5], (_, point) => point),
      `${shape.type} remains an extrudable region`);
  }
});

test('a closed profile can be hovered and selected after sketch editing', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertSketch(sketch);
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [20, 10] }));
  const camera = new cad.Camera();
  camera.selectView('top');
  const bounds = { left: 0, top: 0, width: 800, height: 600 };
  const events = new Map();
  const classes = new Set();
  const canvas = {
    addEventListener: (name, listener) => events.set(name, listener),
    getBoundingClientRect: () => bounds,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) },
  };
  let changes = 0;
  const selection = new cad.ProfileSelection({
    canvas, sketchDocument: document, camera,
    getTool: () => null, isPicking: () => false,
    onChange: () => { changes++; },
  });
  const [clientX, clientY] = camera.project(document.toWorld(sketch, [10, 5]), bounds.width, bounds.height);
  events.get('pointermove')({ clientX, clientY, buttons: 0 });
  assert.equal(classes.has('over-profile'), true);
  events.get('click')({ clientX, clientY, button: 0 });
  assert.equal(selection.selectedProfile.entityIds.length, 1);
  assert.ok(changes >= 2);
  selection.clear();
  assert.equal(selection.selectedProfile, null);
});

test('Extrude makes a solid only from a closed profile and supports all three directions', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeLine([30, 0], [40, 0]));
  assert.equal(cad.sketchProfiles.fromSketch(sketch).length, 0);
  document.insertEntity(sketch, document.makeEntity({ type: 'rectangle', start: [0, 0], end: [20, 10] }));
  const profile = cad.sketchProfiles.fromSketch(sketch)[0];
  const one = cad.extrude.makeBody(profile, 'one', 12.345);
  const reverse = cad.extrude.makeBody(profile, 'one', -4);
  const symmetric = cad.extrude.makeBody(profile, 'symmetric', 12);
  const two = cad.extrude.makeBody(profile, 'two', 12, 5);
  assert.deepEqual([one.start, one.end], [0, 12.345]);
  assert.deepEqual([reverse.start, reverse.end], [-4, 0]);
  assert.deepEqual([symmetric.start, symmetric.end], [-6, 6]);
  assert.deepEqual([two.start, two.end], [-5, 12]);
  assert.equal(cad.extrude.makeBody(profile, 'two', 12, 0), null);
  assert.equal(cad.extrude.makeBody(profile, 'one', 0), null);
  assert.equal(cad.extrude.faces(one).length, profile.points.length + 2);
  const front = cad.extrude.faces(one)[1].vertices;
  assert.ok(front.every(point => Math.abs(point[2] - 12.345) < 1e-8));
  assert.equal(cad.shortcuts.toolFor('E'), 'extrude');
});

test('display style draws body edges only in shaded-with-edges mode', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const body = cad.extrude.makeBody({ id: 'profile', sketch,
    points: [[0, 0], [20, 0], [20, 10], [0, 10]], holes: [] }, 'one', 5);
  const camera = new cad.Camera(); camera.selectView('top');
  const strokes = [];
  const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() { strokes.push(this.strokeStyle); } };
  const original = cad.settings.displayStyle;
  try {
    cad.settings.displayStyle = 'shaded';
    cad.extrude.renderBodies(context, point => [point[0], point[1]], camera, [body]);
    assert.equal(strokes.includes('#626970'), false);
    strokes.length = 0;
    cad.settings.displayStyle = 'shaded-edges';
    cad.extrude.renderBodies(context, point => [point[0], point[1]], camera, [body]);
    assert.equal(strokes.includes('#626970'), true);
  } finally {
    cad.settings.displayStyle = original;
  }
});

test('Extrude compute failures expose short, stable error codes', () => {
  const controller = Object.create(cad.ExtrudeController.prototype);
  controller.type = { value: 'solid' };
  controller.operation = { value: 'join' };
  assert.equal(controller.computeIssue(1, false, null), null, 'initial zero distance is not an error');
  controller.distanceTouched = true;
  assert.equal(controller.computeIssue(1, false, null).code, 'CAD-C005');
  assert.equal(controller.computeIssue(1, false, [0, 5]).code, 'CAD-C003');
  controller.booleanError = 'Invalid mesh';
  assert.equal(controller.computeIssue(1, false, [0, 5]).code, 'CAD-C002');
  controller.kernelFailed = true;
  assert.equal(controller.computeIssue(1, false, [0, 5]).code, 'CAD-C001');
  controller.operation.value = 'new';
  controller.type.value = 'thin';
  assert.equal(controller.computeIssue(1, false, [0, 5]).code, 'CAD-C004');
  assert.equal(controller.computeIssue(1, true, [0, 5]), null);
  assert.equal(controller.computeIssue(0, false, null), null);
});

test('the lightweight planar Boolean fallback handles aligned extrusions', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const profile = (id, x1, x2) => ({ id, sketch,
    points: [[x1, 0], [x2, 0], [x2, 10], [x1, 10]], holes: [] });
  const first = cad.extrude.makeBody(profile('first', 0, 10), 'one', 5);
  const second = cad.extrude.makeBody(profile('second', 5, 15), 'one', 5);
  const contains = (body, point) => body.cells.some(cell => cad.canvas.pointInPolygon(point, cell.points) &&
    !cell.holes.some(hole => cad.canvas.pointInPolygon(point, hole)));
  const joined = cad.extrude.makeBooleanBody(first, [second], 'join');
  const cut = cad.extrude.makeBooleanBody(first, [second], 'cut');
  const intersection = cad.extrude.makeBooleanBody(first, [second], 'intersect');
  assert.ok(joined && cut && intersection);
  assert.ok(contains(joined, [2, 5]) && contains(joined, [7, 5]) && contains(joined, [12, 5]));
  assert.ok(contains(cut, [2, 5]) && !contains(cut, [7, 5]));
  assert.ok(contains(intersection, [7, 5]) && !contains(intersection, [2, 5]));
  assert.equal(cad.extrude.makeBooleanBody(first, [{ ...second, end: 8 }], 'join'), null);
  assert.equal(cad.extrude.makeBooleanBody(first, [cad.extrude.makeBody(profile('far', 30, 40), 'one', 5)], 'join'), null);
  const adjacent = cad.extrude.makeBody(profile('adjacent', 10, 20), 'one', 5);
  const touching = cad.extrude.makeBooleanBody(first, [adjacent], 'join');
  assert.ok(touching && contains(touching, [15, 5]));
  assert.equal(cad.extrude.faces(touching).filter(face => face.kind === 'side').length, 6,
    'the shared side is removed from the joined surface');
  assert.equal(cad.extrude.makeBooleanBody(first, [adjacent], 'intersect'), null);
  const outer = cad.extrude.makeBody({ id: 'outer', sketch,
    points: [[0, 0], [20, 0], [20, 20], [0, 20]] }, 'one', 5);
  const inner = cad.extrude.makeBody({ id: 'inner', sketch,
    points: [[7, 7], [13, 7], [13, 13], [7, 13]] }, 'one', 5);
  const hollow = cad.extrude.makeBooleanBody(outer, [inner], 'cut');
  assert.ok(contains(hollow, [2, 2]) && !contains(hollow, [10, 10]));
});

test('a nested profile extrudes as a ring with an open center', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 20 }));
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 8 }));
  const profiles = cad.sketchProfiles.fromSketch(sketch);
  assert.equal(profiles.length, 2);
  const ring = cad.sketchProfiles.hitTest(profiles, [12, 0], (_, point) => point);
  const center = cad.sketchProfiles.hitTest(profiles, [0, 0], (_, point) => point);
  assert.notEqual(ring.id, center.id);
  assert.equal(ring.holes.length, 1);
  const body = cad.extrude.makeBody(ring, 'one', 5);
  assert.equal(cad.extrude.faces(body)[1].holes.length, 1);
  assert.equal(cad.extrude.faces(body).length, 2 + body.points.length + body.holes[0].length);
});

test('curve tessellation scales with radius and remains bounded', () => {
  const count = cad.sketchGeometry.curveSegments;
  assert.ok(count(200) > count(2));
  assert.ok(count(10000) <= 512);
  for (const radius of [1, 10, 100, 500]) {
    const segments = count(radius);
    const chordError = radius * (1 - Math.cos(Math.PI / segments));
    assert.ok(chordError <= 0.01001, `${radius} mm circle exceeds chord tolerance`);
  }
  assert.ok(count(100, Math.PI / 2) < count(100));
});

test('Thin Extrude makes a wall from open chains and closed circle boundaries', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  const first = document.makeLine([0, 0], [10, 0]);
  const second = document.makeLine([10, 0], [10, 10]);
  const circle = document.makeEntity({ type: 'circle', center: [30, 0], radius: 10 });
  for (const entity of [first, second, circle]) document.insertEntity(sketch, entity);
  const single = cad.extrude.thinPathFromEntity(sketch, first.id, false);
  const chain = cad.extrude.thinPathFromEntity(sketch, first.id, true);
  assert.equal(single.entityIds.length, 1);
  assert.equal(chain.entityIds.length, 2);
  assert.equal(chain.closed, false);
  const openWall = cad.extrude.makeThinBody(chain, 2, 'one', 5);
  assert.ok(openWall);
  assert.equal(openWall.holes.length, 0);
  assert.ok(openWall.points.some(point => Math.abs(point[1] - 1) < 1e-8));
  const loop = cad.extrude.thinPathFromEntity(sketch, circle.id);
  assert.equal(loop.closed, true);
  const closedWall = cad.extrude.makeThinBody(loop, 2, 'symmetric', 6);
  assert.ok(closedWall);
  assert.equal(closedWall.holes.length, 1);
  assert.ok(Math.max(...closedWall.points.map(point => point[0])) > 40);
  assert.ok(Math.max(...closedWall.holes[0].map(point => point[0])) < 40);
  assert.equal(closedWall.start, -3);
  assert.equal(closedWall.end, 3);
  assert.equal(cad.extrude.makeThinBody(loop, 0, 'one', 5), null);
});

test('Extrude selects a profile, keeps the grid visible, and commits one undoable body', () => {
  const document = new cad.SketchDocument();
  const sketch = document.makeSketch('XY');
  document.insertSketch(sketch);
  document.insertEntity(sketch, document.makeEntity({ type: 'circle', center: [0, 0], radius: 10 }));
  const camera = new cad.Camera();
  const canvasEvents = new Map();
  const fields = new Map();
  const field = (id, value = '') => {
    const listeners = new Map();
    const element = {
      value, hidden: false, disabled: false, textContent: '',
      addEventListener: (name, callback) => listeners.set(name, callback), listeners
    };
    fields.set(`#${id}`, element);
    return element;
  };
  const direction = field('extrudeDirection', 'one');
  field('extrudeType', 'solid');
  const operation = field('extrudeOperation', 'new');
  const distance = field('extrudeDistance', '8');
  field('extrudeSecondDistance', '3');
  field('extrudeSecondRow');
  field('extrudeThickness', '1');
  field('extrudeThicknessRow');
  field('extrudeChain', 'on').checked = true;
  field('extrudeChainRow');
  field('extrudeHelp');
  const count = field('extrudeCount');
  const ok = field('extrudeOk');
  field('extrudeCancel');
  const panel = { hidden: true, querySelector: selector => fields.get(selector), addEventListener() { } };
  const canvas = {
    addEventListener: (name, callback) => canvasEvents.set(name, callback),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    classList: { toggle() { }, remove() { }, add() { } }, setPointerCapture() { }, hasPointerCapture: () => false
  };
  const modelView = { visibility: { origin: true }, render() { } };
  const history = new cad.HistoryManager();
  const hudFields = new Map(['extrudeHudDirection', 'extrudeHudFirstLabel', 'extrudeHudFirst',
    'extrudeHudSecondRow', 'extrudeHudSecond'].map(id => [`#${id}`, {
      textContent: '', value: '', hidden: false, listeners: new Map(),
      addEventListener(name, callback) { this.listeners.set(name, callback); },
      focus() { this.focused = true; }, select() { this.selected = true; }
    }]));
  const arrowHud = { hidden: true, style: {}, offsetWidth: 185, offsetHeight: 75,
    querySelector: selector => hudFields.get(selector) };
  let bodyTreeUpdates = 0;
  const controller = new cad.ExtrudeController({
    canvas, panel, hud: arrowHud, document, camera, modelView, history,
    profileSelection: { selectedId: null, clear() { } }, onChange() { },
    onBodiesChange: () => { bodyTreeUpdates++; }, onStatus() { }
  });
  assert.equal(controller.open(), true);
  assert.equal(distance.value, '0');
  assert.equal(fields.get('#extrudeSecondDistance').value, '0');
  assert.equal(modelView.visibility.origin, true, 'the grid remains visible during Extrude');
  assert.equal(ok.disabled, true);
  const strokes = [];
  const context = {
    beginPath() { }, moveTo() { }, lineTo() { }, closePath() { },
    fill() { }, stroke() { strokes.push(this.strokeStyle); },
    save() { }, restore() { }, setLineDash() { }, arc() { },
  };
  const project = camera.projector(800, 600);
  controller.render(context, project);
  assert.ok(strokes.includes('#365d73'), 'Solid Extrude shows the sketch outline before selecting a profile');
  fields.get('#extrudeType').value = 'thin';
  strokes.length = 0;
  controller.render(context, project);
  assert.ok(strokes.includes('#365d73'), 'Thin Extrude shows the sketch outline');
  fields.get('#extrudeType').value = 'solid';
  const [clientX, clientY] = camera.project([3, 0, 0], 800, 600);
  canvasEvents.get('click')({ clientX, clientY, button: 0 });
  assert.equal(count.textContent, '1 selected');
  assert.equal(ok.disabled, true, 'zero distance waits for input');
  controller.render(context, project);
  assert.equal(arrowHud.hidden, false, 'the arrow and distance box remain visible at zero');
  assert.equal(hudFields.get('#extrudeHudFirst').value, '0');
  let tabPrevented = false;
  assert.equal(controller.focusHudDistance({ target: canvas, preventDefault() { tabPrevented = true; } }), true);
  assert.equal(tabPrevented, true);
  assert.equal(hudFields.get('#extrudeHudFirst').focused, true);
  assert.equal(hudFields.get('#extrudeHudFirst').selected, true);
  hudFields.get('#extrudeHudFirst').value = '8';
  hudFields.get('#extrudeHudFirst').listeners.get('input')();
  assert.equal(distance.value, '8', 'on-canvas input updates the panel distance');
  assert.equal(ok.disabled, false);
  strokes.length = 0;
  controller.render(context, project);
  assert.ok(strokes.includes('#1379bd'), 'the selected profile has a highlighted outline');
  assert.equal(arrowHud.hidden, false, 'the distance box remains visible beside the arrow');
  assert.equal(hudFields.get('#extrudeHudDirection').textContent, 'One Side');
  assert.equal(hudFields.get('#extrudeHudFirst').value, '8');
  const dragHandle = (handle, millimetres, pointerId) => {
    const geometry = controller.arrowGeometry();
    const target = geometry.handles.find(item => item.side === handle);
    const [ux, uy] = geometry.screenUnit;
    const start = { pointerId, button: 0, clientX: target.tip[0], clientY: target.tip[1], preventDefault() { } };
    const end = {
      pointerId, clientX: start.clientX + ux * millimetres,
      clientY: start.clientY + uy * millimetres
    };
    canvasEvents.get('pointerdown')(start);
    canvasEvents.get('pointermove')({ ...end, buttons: 1 });
    canvasEvents.get('pointerup')(end);
  };
  const arrow = controller.arrowGeometry();
  assert.ok(arrow);
  assert.ok(Math.hypot(...arrow.screenUnit) > 0.15);
  dragHandle('first', 5, 41);
  assert.equal(Number(distance.value), 13);
  direction.value = 'symmetric';
  distance.value = '12';
  direction.listeners.get('change')();
  controller.render(context, project);
  assert.equal(hudFields.get('#extrudeHudDirection').textContent, 'Symmetric');
  assert.equal(hudFields.get('#extrudeHudFirstLabel').textContent, 'Total distance');
  assert.equal(controller.arrowGeometry().handles.length, 2);
  dragHandle('negative', -2, 42);
  assert.equal(Number(distance.value), 16);
  direction.value = 'two';
  distance.value = '8';
  fields.get('#extrudeSecondDistance').value = '3';
  direction.listeners.get('change')();
  controller.render(context, project);
  assert.equal(hudFields.get('#extrudeHudDirection').textContent, 'Two Sides');
  assert.equal(hudFields.get('#extrudeHudSecondRow').hidden, false);
  controller.focusHudDistance({ target: hudFields.get('#extrudeHudFirst'), preventDefault() { } });
  assert.equal(hudFields.get('#extrudeHudSecond').focused, true, 'Tab advances to the second distance');
  hudFields.get('#extrudeHudSecond').value = '3';
  hudFields.get('#extrudeHudSecond').listeners.get('input')();
  assert.equal(fields.get('#extrudeSecondDistance').value, '3');
  dragHandle('negative', -2, 43);
  assert.equal(Number(fields.get('#extrudeSecondDistance').value), 5);
  canvasEvents.get('click')({ clientX, clientY, button: 0, preventDefault() { } });
  assert.equal(count.textContent, '1 selected');
  assert.equal(controller.previewBodies()[0].start, -5);
  distance.value = '8.001';
  distance.listeners.get('input')();
  controller.commit();
  assert.equal(arrowHud.hidden, true);
  assert.equal(modelView.visibility.origin, true);
  assert.equal(panel.hidden, true);
  assert.equal(controller.bodies.length, 1);
  assert.equal(controller.bodies[0].id, 'body-1');
  assert.equal(controller.bodies[0].name, 'Body 1');
  assert.equal(controller.bodies[0].end, 8.001);
  const fills = [];
  controller.render({ ...context, fill() { fills.push(this.fillStyle); } }, project);
  assert.ok(fills.includes('#aaa9a1'), 'committed body uses the warm grey CAD color');
  history.undo();
  assert.equal(controller.bodies.length, 0);
  history.redo();
  assert.equal(controller.bodies.length, 1);
  assert.equal(bodyTreeUpdates, 3);
  controller.open();
  assert.equal(distance.value, '0', 'each Extrude starts at zero again');
  direction.value = 'two';
  distance.value = '8.001';
  fields.get('#extrudeSecondDistance').value = '5';
  distance.listeners.get('input')();
  controller.selectedIds.add(controller.profiles()[0].id);
  operation.value = 'join';
  controller.update();
  assert.equal(ok.disabled, false);
  const originalBody = controller.bodies[0];
  controller.commit();
  assert.equal(controller.bodies.length, 1);
  assert.equal(controller.bodies[0].id, originalBody.id);
  assert.ok(controller.bodies[0].cells.length >= 1);
  history.undo();
  assert.equal(controller.bodies[0], originalBody);
  history.redo();
  assert.ok(controller.bodies[0].cells.length >= 1);
});

test('origin plane and body visibility toggles can be undone and redone via history', () => {
  const history = new cad.HistoryManager();
  const visibility = { origin: true, O: true, X: true, Y: true, Z: true, XY: false, XZ: false, YZ: false };
  const modelView = {
    visibility,
    setVisibility(key, val) { this.visibility[key] = Boolean(val); },
  };

  function setOriginItemVisibility(itemKey, visible, recordHistory = true) {
    const prev = Boolean(modelView.visibility[itemKey]);
    if (prev === visible) return;
    const apply = val => modelView.setVisibility(itemKey, val);
    if (recordHistory) {
      history.execute({
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  // 1. Initial state
  assert.equal(modelView.visibility.XY, false);
  assert.equal(modelView.visibility.XZ, false);
  assert.equal(modelView.visibility.YZ, false);

  // 2. Turn on XY, XZ, YZ sequentially
  setOriginItemVisibility('XY', true);
  assert.equal(modelView.visibility.XY, true);
  setOriginItemVisibility('XZ', true);
  assert.equal(modelView.visibility.XZ, true);
  setOriginItemVisibility('YZ', true);
  assert.equal(modelView.visibility.YZ, true);

  // 3. Undo in reverse order
  history.undo();
  assert.equal(modelView.visibility.YZ, false, 'YZ is undone to hidden');
  assert.equal(modelView.visibility.XZ, true);
  assert.equal(modelView.visibility.XY, true);

  history.undo();
  assert.equal(modelView.visibility.XZ, false, 'XZ is undone to hidden');
  assert.equal(modelView.visibility.XY, true);

  history.undo();
  assert.equal(modelView.visibility.XY, false, 'XY is undone to hidden');

  // 4. Redo in forward order
  history.redo();
  assert.equal(modelView.visibility.XY, true, 'XY is redone to visible');
  history.redo();
  assert.equal(modelView.visibility.XZ, true, 'XZ is redone to visible');
  history.redo();
  assert.equal(modelView.visibility.YZ, true, 'YZ is redone to visible');

  // 5. Body visibility undo and redo
  const body = { id: 'body-test', name: 'Test Body', visible: true };
  function setBodyVisibility(b, visible, recordHistory = true) {
    const prev = b.visible !== false;
    if (prev === visible) return;
    const apply = val => { b.visible = val; };
    if (recordHistory) {
      history.execute({
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  setBodyVisibility(body, false);
  assert.equal(body.visible, false, 'body visibility toggled to false');
  history.undo();
  assert.equal(body.visible, true, 'body visibility restored to true after undo');
  history.redo();
  assert.equal(body.visible, false, 'body visibility restored to false after redo');
});

