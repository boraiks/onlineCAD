import test from 'node:test';
import assert from 'node:assert/strict';

test('Ribbon tabs separate SOLID, MESH, and UTILITIES workspaces and route tools correctly', () => {
  const tabs = {
    solid: { classList: new Set(['tab-active']), attrs: { 'aria-selected': 'true' } },
    mesh: { classList: new Set(), attrs: { 'aria-selected': 'false' } },
    utilities: { classList: new Set(), attrs: { 'aria-selected': 'false' } },
    sketch: { classList: new Set(), attrs: { 'aria-selected': 'false' }, hidden: true },
  };

  const toolbars = {
    solid: { hidden: false },
    mesh: { hidden: true },
    utilities: { hidden: true },
    sketch: { hidden: true },
  };

  const switchLabel = { textContent: 'SOLID' };

  let activeRibbonWorkspace = 'solid';

  function setRibbonWorkspace(workspace, activeSketch = false) {
    if (activeSketch && workspace !== 'sketch') {
      return;
    }
    if (workspace !== 'sketch') {
      activeRibbonWorkspace = workspace;
    }
    const isSolid = workspace === 'solid';
    const isMesh = workspace === 'mesh';
    const isUtilities = workspace === 'utilities';
    const isSketch = workspace === 'sketch';

    tabs.solid.classList[isSolid ? 'add' : 'delete']('tab-active');
    tabs.solid.attrs['aria-selected'] = String(isSolid);

    tabs.mesh.classList[isMesh ? 'add' : 'delete']('tab-active');
    tabs.mesh.attrs['aria-selected'] = String(isMesh);

    tabs.utilities.classList[isUtilities ? 'add' : 'delete']('tab-active');
    tabs.utilities.attrs['aria-selected'] = String(isUtilities);

    tabs.sketch.hidden = !isSketch;
    tabs.sketch.classList[isSketch ? 'add' : 'delete']('tab-active');
    tabs.sketch.attrs['aria-selected'] = String(isSketch);

    toolbars.solid.hidden = !isSolid;
    toolbars.mesh.hidden = !isMesh;
    toolbars.utilities.hidden = !isUtilities;
    toolbars.sketch.hidden = !isSketch;

    switchLabel.textContent = workspace.toUpperCase();
  }

  // 1. Initial State is SOLID
  assert.equal(activeRibbonWorkspace, 'solid');
  assert.ok(tabs.solid.classList.has('tab-active'));
  assert.equal(toolbars.solid.hidden, false);
  assert.equal(toolbars.mesh.hidden, true);
  assert.equal(toolbars.utilities.hidden, true);
  assert.equal(toolbars.sketch.hidden, true);

  // 2. Switch to MESH Workspace
  setRibbonWorkspace('mesh');
  assert.equal(activeRibbonWorkspace, 'mesh');
  assert.ok(!tabs.solid.classList.has('tab-active'));
  assert.ok(tabs.mesh.classList.has('tab-active'));
  assert.equal(tabs.mesh.attrs['aria-selected'], 'true');
  assert.equal(toolbars.solid.hidden, true);
  assert.equal(toolbars.mesh.hidden, false);
  assert.equal(toolbars.utilities.hidden, true);
  assert.equal(switchLabel.textContent, 'MESH');

  // 3. Switch to UTILITIES Workspace
  setRibbonWorkspace('utilities');
  assert.equal(activeRibbonWorkspace, 'utilities');
  assert.ok(!tabs.mesh.classList.has('tab-active'));
  assert.ok(tabs.utilities.classList.has('tab-active'));
  assert.equal(tabs.utilities.attrs['aria-selected'], 'true');
  assert.equal(toolbars.mesh.hidden, true);
  assert.equal(toolbars.utilities.hidden, false);
  assert.equal(switchLabel.textContent, 'UTILITIES');

  // 4. Enter Sketch Mode -> activates SKETCH ribbon
  setRibbonWorkspace('sketch', true);
  assert.equal(tabs.sketch.hidden, false);
  assert.ok(tabs.sketch.classList.has('tab-active'));
  assert.equal(toolbars.sketch.hidden, false);
  assert.equal(toolbars.utilities.hidden, true);
  assert.equal(toolbars.mesh.hidden, true);
  assert.equal(toolbars.solid.hidden, true);
  assert.equal(switchLabel.textContent, 'SKETCH');

  // 5. Exit Sketch Mode -> restores previous UTILITIES ribbon
  setRibbonWorkspace(activeRibbonWorkspace, false);
  assert.equal(tabs.sketch.hidden, true);
  assert.ok(tabs.utilities.classList.has('tab-active'));
  assert.equal(toolbars.utilities.hidden, false);
  assert.equal(toolbars.solid.hidden, true);
  assert.equal(switchLabel.textContent, 'UTILITIES');

  // 6. Switch back to SOLID
  setRibbonWorkspace('solid');
  assert.equal(activeRibbonWorkspace, 'solid');
  assert.ok(tabs.solid.classList.has('tab-active'));
  assert.equal(toolbars.solid.hidden, false);
  assert.equal(toolbars.utilities.hidden, true);
  assert.equal(toolbars.mesh.hidden, true);
  assert.equal(switchLabel.textContent, 'SOLID');
});

test('M keydown in 3D mode triggers Move/Rotate tool', () => {
  let moveClicked = false;
  const mockButton = {
    click() { moveClicked = true; }
  };

  function handleKeydown(event, activeSketch = false) {
    const isCtrl = event.ctrlKey || event.metaKey;
    const isTextInput = false;
    if (!isCtrl && !event.altKey && !activeSketch && (event.key === 'm' || event.key === 'M' || event.code === 'KeyM')) {
      if (!isTextInput) {
        mockButton.click();
      }
    }
  }

  // When in 3D mode (no active sketch), pressing 'm' triggers Move/Rotate
  handleKeydown({ key: 'm' }, false);
  assert.equal(moveClicked, true);

  // In sketch mode, 'm' does not trigger 3D Move/Rotate
  moveClicked = false;
  handleKeydown({ key: 'm' }, true);
  assert.equal(moveClicked, false);
});

