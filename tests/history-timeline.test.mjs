import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sandbox = { window: { WebCAD: {} } };
runInNewContext(readFileSync(new URL('../js/history.js', import.meta.url), 'utf8'), sandbox);
runInNewContext(readFileSync(new URL('../js/timeline.js', import.meta.url), 'utf8'), sandbox);
const HistoryManager = sandbox.window.WebCAD.HistoryManager;
const projectFeatures = sandbox.window.WebCAD.projectTimelineFeatures;

function command(state, value) {
  return {
    name: `Set ${value}`,
    execute: () => { state.value = value; },
    undo: () => { state.value = value - 1; },
    redo: () => { state.value = value; },
  };
}

test('timeline seek walks both directions and branches from the selected step', () => {
  const state = { value: 0 };
  let changes = 0;
  const history = new HistoryManager({ onStateChange: () => changes++ });
  for (let value = 1; value <= 3; value++) history.execute(command(state, value));
  assert.equal(history.position, 3);
  assert.deepEqual(Array.from(history.entries, entry => entry.name), ['Set 1', 'Set 2', 'Set 3']);
  const beforeSeek = changes;
  assert.equal(history.seek(1), true);
  assert.equal(changes, beforeSeek + 1);
  assert.equal(state.value, 1);
  assert.equal(history.position, 1);
  assert.equal(history.seek(3), true);
  assert.equal(state.value, 3);
  assert.equal(history.seek(1), true);
  history.execute(command(state, 2));
  assert.equal(history.canRedo, false);
  assert.deepEqual(Array.from(history.entries, entry => entry.name), ['Set 1', 'Set 2']);
  assert.equal(history.seek(-1), false);
  assert.equal(history.seek(99), false);
});

test('a failed undo keeps the timeline cursor on its current command', () => {
  const history = new HistoryManager();
  history.execute({ name: 'Failing operation', execute() {}, undo() { throw Error('failed'); } });
  assert.throws(() => history.seek(0), /failed/);
  assert.equal(history.position, 1);
  assert.equal(history.entries.length, 1);
});

test('feature timeline condenses sketch actions and ignores display-only changes', () => {
  const entries = [
    { name: 'Create Sketch 1', kind: 'sketch', timelineSketchEvent: 'create', timelineTool: 'openSketch' },
    { name: 'Draw circle', kind: 'sketch' },
    { name: 'Draw line', kind: 'sketch' },
    { name: 'Finish Sketch 1', kind: 'sketch', timelineSketchEvent: 'finish' },
    { name: 'Extrude', kind: 'solid', timelineTool: 'extrudeBtn' },
    { name: 'Hide origin', kind: 'view' },
    { name: 'Create Sketch 2', kind: 'sketch', timelineSketchEvent: 'create', timelineTool: 'openSketch' },
    { name: 'Draw rectangle', kind: 'sketch' },
  ];
  const features = projectFeatures(entries);
  assert.deepEqual(Array.from(features, feature => [feature.tool, feature.start, feature.end]), [
    ['openSketch', 1, 4], ['extrudeBtn', 5, 6], ['openSketch', 7, 8],
  ]);
});

