(function (cad) {
  'use strict';

  const editor = document.querySelector('#editor');
  const modelCanvas = document.querySelector('#modelCanvas');
  const sketchCanvas = document.querySelector('#sketchCanvas');
  const sketchPane = document.querySelector('#sketchPane');
  const divider = document.querySelector('#paneDivider');
  const openSketchButton = document.querySelector('#openSketch');
  const lineToolButton = document.querySelector('#lineTool');
  const rectangleToolButton = document.querySelector('#rectangleTool');
  const circleToolButton = document.querySelector('#circleTool');
  const constructionToolButton = document.querySelector('#constructionTool');
  const pointToolButton = document.querySelector('#pointTool');
  const filletToolButton = document.querySelector('#filletTool');
  const trimToolButton = document.querySelector('#trimTool');
  const mirrorToolButton = document.querySelector('#mirrorTool');
  const distanceToolButton = document.querySelector('#distanceTool');
  const angleToolButton = document.querySelector('#angleTool');
  const midpointToolButton = document.querySelector('#midpointTool');
  const axisToolButton = document.querySelector('#axisTool');
  const fixToolButton = document.querySelector('#fixTool');
  const tangentToolButton = document.querySelector('#tangentTool');
  const coincidentToolButton = document.querySelector('#coincidentTool');
  const equalToolButton = document.querySelector('#equalTool');
  const offsetToolButton = document.querySelector('#offsetTool');
  const patternMenuContainer = document.querySelector('#patternMenuContainer');
  const patternMenuButton = document.querySelector('#patternMenuButton');
  const circularPatternToolButton = document.querySelector('#circularPatternTool');
  const rectangularPatternToolButton = document.querySelector('#rectangularPatternTool');
  const splitViewButton = document.querySelector('#splitView');
  const finishSketchButton = document.querySelector('#finishSketch');
  const closeSketchButton = document.querySelector('#closeSketch');
  const extrudeBtn = document.querySelector('#extrudeBtn');
  const revolveBtn = document.querySelector('#revolveBtn');
  const holeBtn = document.querySelector('#holeBtn');
  const bodyMoveBtn = document.querySelector('#bodyMoveBtn');
  const solidFilletBtn = document.querySelector('#solidFilletBtn');
  const solidChamferBtn = document.querySelector('#solidChamferBtn');
  const solidPatternMenuContainer = document.querySelector('#solidPatternMenuContainer');
  const solidPatternMenuButton = document.querySelector('#solidPatternMenuButton');
  const meshDecimateBtn = document.querySelector('#meshDecimateBtn');
  const meshToSolidBtn = document.querySelector('#meshToSolidBtn');
  const surfaceFinishBtn = document.querySelector('#surfaceFinishBtn');
  const ribbonTabs = document.querySelector('#ribbonTabs');
  const ribbonTabSolid = document.querySelector('#ribbonTabSolid');
  const ribbonTabMesh = document.querySelector('#ribbonTabMesh');
  const ribbonTabUtilities = document.querySelector('#ribbonTabUtilities');
  const ribbonTabSketch = document.querySelector('#ribbonTabSketch');
  const solidWorkspaceToolbar = document.querySelector('#solidWorkspaceToolbar');
  const meshWorkspaceToolbar = document.querySelector('#meshWorkspaceToolbar');
  const utilitiesWorkspaceToolbar = document.querySelector('#utilitiesWorkspaceToolbar');
  const sketchWorkspaceToolbar = document.querySelector('#sketchWorkspaceToolbar');
  const workspaceSwitchContainer = document.querySelector('#workspaceSwitchContainer');
  const workspaceSwitch = document.querySelector('#workspaceSwitch');
  const workspaceSwitchText = document.querySelector('#workspaceSwitchText');
  const workspaceSwitchDropdown = document.querySelector('#workspaceSwitchDropdown');
  const switchItemSolid = document.querySelector('#switchItemSolid');
  const switchItemMesh = document.querySelector('#switchItemMesh');
  const switchItemUtilities = document.querySelector('#switchItemUtilities');
  const switchCheckSolid = document.querySelector('#switchCheckSolid');
  const switchCheckMesh = document.querySelector('#switchCheckMesh');
  const switchCheckUtilities = document.querySelector('#switchCheckUtilities');
  const meshShowMeshBtn = document.querySelector('#meshShowMeshBtn');
  const utilitiesShowMeshBtn = document.querySelector('#utilitiesShowMeshBtn');
  const interferenceBtn = document.querySelector('#interferenceBtn');
  const inspectInterferenceBtn = document.querySelector('#inspectInterferenceBtn');
  const zebraAnalysisBtn = document.querySelector('#zebraAnalysisBtn');
  const inspectZebraBtn = document.querySelector('#inspectZebraBtn');
  const meshMoveBtn = document.querySelector('#meshMoveBtn');
  const headerUndoBtn = document.querySelector('#headerUndoBtn');
  const headerRedoBtn = document.querySelector('#headerRedoBtn');
  const originChildren = document.querySelector('#originChildren');
  const sketchRows = document.querySelector('#sketchRows');
  const sketchCount = document.querySelector('#sketchCount');
  const bodiesFolderRow = document.querySelector('#bodiesFolderRow');
  const bodiesChevron = document.querySelector('#bodiesChevron');
  const bodyRows = document.querySelector('#bodyRows');
  const bodyCount = document.querySelector('#bodyCount');
  const statusText = document.querySelector('#statusText');
  const geometryStatus = document.querySelector('#geometryStatus');
  const activePlaneLabel = document.querySelector('#activePlaneLabel');
  const modelPaneTitle = document.querySelector('#modelPaneTitle');
  const viewHint = document.querySelector('#viewHint');
  const errorTray = document.querySelector('#errorTray');

  function showError({ code = 'CAD-R001', title = 'Application error', reason = 'Unexpected error' }) {
    const shortReason = String(reason).split('\n')[0].slice(0, 140);
    const key = `${code}|${shortReason}`;
    const existing = [...errorTray.children].find(item => item.dataset.key === key);
    if (existing) {
      errorTray.prepend(existing);
      existing.resetTimer?.();
      return;
    }

    const notice = document.createElement('section');
    notice.className = 'error-notice';
    notice.dataset.key = key;
    notice.role = 'alert';
    notice.title = 'Click to dismiss';

    const accent = document.createElement('div');
    accent.className = 'error-notice-accent';

    const iconBadge = document.createElement('div');
    iconBadge.className = 'error-notice-icon-badge';
    iconBadge.setAttribute('aria-hidden', 'true');
    iconBadge.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <circle cx="12" cy="17" r="0.8" fill="currentColor"/>
    </svg>`;

    const content = document.createElement('div');
    content.className = 'error-notice-content';

    const heading = document.createElement('div');
    heading.className = 'error-notice-header';

    const name = document.createElement('strong');
    name.className = 'error-notice-title';
    name.textContent = title;

    const identifier = document.createElement('code');
    identifier.className = 'error-notice-code';
    identifier.textContent = code;

    heading.append(name, identifier);

    const description = document.createElement('p');
    description.className = 'error-notice-text';
    description.textContent = shortReason;

    content.append(heading, description);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'error-notice-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss error');
    dismiss.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="3" y1="3" x2="13" y2="13"/>
      <line x1="13" y1="3" x2="3" y2="13"/>
    </svg>`;

    notice.append(accent, iconBadge, content, dismiss);

    const TOTAL_MS = 5000;
    const FADE_MS = 1500;
    const STAY_MS = TOTAL_MS - FADE_MS;
    let fadeTimer = null;
    let removeTimer = null;
    let isHovered = false;

    function dismissNotice() {
      if (notice.classList.contains('is-dismissing')) return;
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      notice.classList.add('is-dismissing');
      setTimeout(() => {
        notice.remove();
      }, 150);
    }

    function startTimer() {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      notice.classList.remove('is-fading');
      notice.style.transition = '';
      notice.style.opacity = '1';
      notice.style.transform = '';

      fadeTimer = setTimeout(() => {
        if (!isHovered) {
          notice.classList.add('is-fading');
        }
      }, STAY_MS);

      removeTimer = setTimeout(() => {
        if (!isHovered) {
          notice.remove();
        }
      }, TOTAL_MS);
    }

    function cancelTimerAndRestore() {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      notice.classList.remove('is-fading');
      notice.style.transition = 'opacity 0.12s ease, transform 0.12s ease';
      notice.style.opacity = '1';
      notice.style.transform = 'translateY(0) scale(1)';
    }

    notice.addEventListener('mouseenter', () => {
      isHovered = true;
      cancelTimerAndRestore();
    });

    notice.addEventListener('mouseleave', () => {
      isHovered = false;
      startTimer();
    });

    notice.addEventListener('click', () => {
      dismissNotice();
    });

    dismiss.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissNotice();
    });

    notice.resetTimer = () => {
      isHovered = false;
      startTimer();
    };

    startTimer();
    errorTray.prepend(notice);
    while (errorTray.children.length > 3) errorTray.lastElementChild.remove();
  }

  window.addEventListener('error', event => {
    if (event.message === 'Script error.' && !event.filename && !event.lineno) return;
    showError({
      reason: event.error?.message || event.message || 'Unexpected application error'
    });
  });
  window.addEventListener('unhandledrejection', event => showError({
    code: 'CAD-R002', reason: event.reason?.message || event.reason || 'Unexpected async error'
  }));

  const camera = new cad.Camera();
  const history = new cad.HistoryManager();
  const sketchDocument = new cad.SketchDocument();
  cad.history = history;
  const timelineEl = document.querySelector('#designTimeline');
  const timeline = (typeof cad.Timeline === 'function' && timelineEl)
    ? new cad.Timeline({
        history,
        element: timelineEl,
      })
    : { render: () => {} };

  function updateUndoRedoUI() {
    if (headerUndoBtn) headerUndoBtn.disabled = !history.canUndo;
    if (headerRedoBtn) headerRedoBtn.disabled = !history.canRedo;
    timeline?.render?.();
  }
  history.onStateChange = () => {
    updateUndoRedoUI();
    markDirty();
  };
  updateUndoRedoUI();

  headerUndoBtn?.addEventListener('click', () => {
    if (history.canUndo) {
      history.undo();
      statusText.textContent = 'UNDO';
      setTimeout(() => { if (statusText.textContent === 'UNDO') statusText.textContent = modeStatus(); }, 1500);
    }
  });

  headerRedoBtn?.addEventListener('click', () => {
    if (history.canRedo) {
      history.redo();
      statusText.textContent = 'REDO';
      setTimeout(() => { if (statusText.textContent === 'REDO') statusText.textContent = modeStatus(); }, 1500);
    }
  });

  let currentDocumentName = 'Untitled Design';
  const docTitleText = document.querySelector('#documentTitleText');
  const docSaveStatus = document.querySelector('#documentSaveStatus');
  const treeProjectTitle = document.querySelector('#projectTreeRow strong');

  // Dirty tracking: every history change (edit, undo, redo) marks the design
  // as changed until it is saved as .ocad; the latest state is autosaved to
  // browser storage so a closed tab or crash can be recovered.
  let isDirty = false;

  function setDocumentName(name, isSaved = false) {
    currentDocumentName = String(name || '').trim() || 'Untitled Design';
    if (docTitleText) docTitleText.textContent = currentDocumentName;
    if (treeProjectTitle) treeProjectTitle.textContent = currentDocumentName;
    document.title = `${currentDocumentName} - onlineCAD`;
    updateSaveStatus(isSaved);
  }

  function updateSaveStatus(isSaved = false) {
    isDirty = !isSaved;
    if (docSaveStatus) {
      docSaveStatus.textContent = isSaved ? 'Saved (.ocad)' : (workspaceHasContent() ? 'Unsaved changes' : 'Unsaved workspace');
      docSaveStatus.classList.toggle('is-dirty', !isSaved && workspaceHasContent());
    }
  }

  function workspaceHasContent() {
    return sketchDocument.sketches.some(sketch => sketch.entities.length) || (cad.app?.extrudeController?.bodies?.length || 0) > 0;
  }

  function markDirty() {
    updateSaveStatus(false);
    scheduleAutosave();
  }

  let autosaveTimer = null;
  let recoveryPending = false;
  function scheduleAutosave(delay = 1500) {
    if (!cad.projectStore) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeAutosave, delay);
  }

  function writeAutosave() {
    autosaveTimer = null;
    const store = cad.projectStore;
    if (!store || recoveryPending || !cad.app?.extrudeController) return;
    // Very dense meshes would stall the UI on every edit; those rely on manual saves.
    const meshSize = cad.app?.extrudeController.bodies.reduce((sum, body) => sum + (body.mesh?.triangles?.length || 0), 0);
    if (meshSize > 1_500_000) return;
    try {
      const data = cad.projectIO.serializeProject({ documentName: currentDocumentName, sketchDocument,
        extrudeController: cad.app?.extrudeController, camera });
      const write = store.hasContent(data) ? store.put(store.AUTOSAVE_KEY, data) : store.remove(store.AUTOSAVE_KEY);
      write.catch(() => { /* Autosave is best effort. */ });
    } catch { /* Autosave is best effort. */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autosaveTimer) {
      clearTimeout(autosaveTimer);
      writeAutosave();
    }
  });

  window.addEventListener('beforeunload', event => {
    if (!isDirty || !workspaceHasContent()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  if (docTitleText) {
    docTitleText.addEventListener('blur', () => {
      const name = String(docTitleText.textContent || '').trim() || 'Untitled Design';
      if (name === currentDocumentName) {
        docTitleText.textContent = currentDocumentName;
        return;
      }
      setDocumentName(name, false);
      scheduleAutosave();
    });
    docTitleText.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        docTitleText.blur();
      } else if (event.key === 'Escape') {
        docTitleText.textContent = currentDocumentName;
        docTitleText.blur();
      }
    });
  }

  let activeSketch = null;
  let splitView = false;
  let modelView;
  let sketchView;
  let viewCube;
  let sketchTools;
  let profileSelection;
  let extrudeController;
  let solidRevolve;
  let solidBevel;
  let solidHole;
  let bodyMove;
  let solidPattern;
  let solidPatternMenu;
  let meshDecimate;
  let meshToSolid;
  let surfaceFinish;
  let interference;
  let zebraAnalysis;
  let faceSelection;
  let annotationInteraction;
  let patternMenu;
  let redrawFrame = 0;
  let redrawAll = false;
  let bodiesExpanded = true;
  let pendingSketchTool = null;
  function requestRedraw(full = true) {
    redrawAll ||= full;
    if (redrawFrame) return;
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = 0;
      const fullFrame = redrawAll;
      redrawAll = false;
      if (fullFrame) redraw();
      else redraw3D();
    });
  }

  function redraw3D() {
    modelView.render();
    viewCube.render();
  }

  function redraw() {
    for (const sketch of sketchDocument.sketches) cad.sketchConstraints.enforce(sketch);
    redraw3D();
    sketchView.render();
    const entityCount = sketchDocument.sketches.reduce((sum, sketch) => sum + sketch.entities.length, 0);
    const measurementCount = sketchDocument.sketches.reduce((sum, sketch) => sum + sketch.measurements.length, 0);
    const selected = profileSelection?.selectedProfile;
    const message = selected ? 'Profile selected'
      : entityCount || measurementCount
        ? `${entityCount} sketch ${entityCount === 1 ? 'entity' : 'entities'} · ${measurementCount} ${measurementCount === 1 ? 'measurement' : 'measurements'}`
        : 'No geometry yet';
    if (geometryStatus.textContent !== message) geometryStatus.textContent = message;
  }

  function modeStatus() {
    return activeSketch ? `${activeSketch.name.toUpperCase()} · ${activeSketch.faceBodyId ? 'BODY FACE' : `${activeSketch.plane} PLANE`}` : '3D VIEW';
  }

  let savedPlaneVisibility = null;

  function updateOriginTreeItemUI(itemKey, visible) {
    const row = originChildren?.querySelector(`.origin-item-row[data-origin-item="${itemKey}"]`);
    if (!row) return;
    const eyeBtn = row.querySelector('.tree-eye');
    if (eyeBtn) {
      eyeBtn.classList.toggle('is-hidden', !visible);
    }
    row.classList.toggle('is-item-hidden', !visible);
  }

  function setOriginItemVisibility(itemKey, visible, recordHistory = true) {
    const prev = Boolean(modelView.visibility[itemKey]);
    if (prev === visible && recordHistory) return;

    const apply = (val) => {
      modelView.setVisibility(itemKey, val);
      updateOriginTreeItemUI(itemKey, val);
      if (savedPlaneVisibility && ['XY', 'XZ', 'YZ'].includes(itemKey)) {
        savedPlaneVisibility[itemKey] = val;
      }
      requestRedraw();
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} ${itemKey} reference`, kind: 'view',
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function setMasterOriginVisibility(visible, recordHistory = true) {
    const prev = Boolean(modelView.visibility.origin);
    if (prev === visible && recordHistory) return;

    const apply = (val) => {
      modelView.setVisibility('origin', val);
      const originEyeBtn = document.querySelector('#originEyeBtn');
      const originTreeRow = document.querySelector('#originTreeRow');
      originEyeBtn?.classList.toggle('is-hidden', !val);
      originTreeRow?.classList.toggle('is-item-hidden', !val);
      requestRedraw();
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} origin`, kind: 'view',
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function setBodyVisibility(body, visible, recordHistory = true) {
    const prev = body.visible !== false;
    if (prev === visible && recordHistory) return;

    const apply = (val) => {
      body.visible = val;
      if (!val && (faceSelection?.selected?.body === body || faceSelection?.selectedBody === body)) {
        faceSelection.clear();
      }
      renderBodyTree();
      requestRedraw(false);
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} ${body.name}`, kind: 'view',
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function makeTreeDeleteButton(name, onDelete) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-delete';
    button.title = `Delete ${name}`;
    button.setAttribute('aria-label', `Delete ${name}`);
    button.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>`;
    button.addEventListener('click', event => {
      event.stopPropagation();
      onDelete();
    });
    return button;
  }

  function deleteSketch(sketch) {
    const index = sketchDocument.sketches.indexOf(sketch);
    if (index < 0) return false;
    const apply = () => {
      if (activeSketch === sketch) applyActiveSketch(null);
      sketchDocument.removeSketch(sketch.id);
      renderSketchTree();
      requestRedraw(true);
    };
    history.execute({
      name: `Delete ${sketch.name}`, kind: 'view',
      execute: apply,
      undo: () => {
        if (!sketchDocument.sketches.includes(sketch)) {
          sketchDocument.sketches.splice(Math.min(index, sketchDocument.sketches.length), 0, sketch);
        }
        renderSketchTree();
        requestRedraw(true);
      },
      redo: apply,
    });
    flashStatus(`DELETED · ${sketch.name}`, `${sketch.name} removed. Ctrl+Z to undo.`, 2500);
    return true;
  }

  function anySolidToolActive() {
    return [extrudeController, solidRevolve, solidBevel, solidHole, bodyMove, solidPattern, meshDecimate,
      meshToSolid, surfaceFinish, interference, zebraAnalysis].some(tool => tool?.active);
  }

  function deleteBody(body) {
    const bodies = extrudeController?.bodies;
    const index = bodies ? bodies.indexOf(body) : -1;
    if (index < 0) return false;
    const apply = () => {
      const at = extrudeController.bodies.indexOf(body);
      if (at >= 0) extrudeController.bodies.splice(at, 1);
      if (faceSelection?.selectedBody === body || faceSelection?.selected?.body === body) faceSelection.clear();
      renderBodyTree();
      requestRedraw(true);
    };
    history.execute({
      name: `Delete ${body.name}`, kind: 'solid', timelineTool: 'deleteBody',
      execute: apply,
      undo: () => {
        if (!extrudeController.bodies.includes(body)) {
          extrudeController.bodies.splice(Math.min(index, extrudeController.bodies.length), 0, body);
        }
        renderBodyTree();
        requestRedraw(true);
      },
      redo: apply,
    });
    flashStatus(`DELETED · ${body.name}`, `${body.name} removed. Ctrl+Z to undo.`, 2500);
    return true;
  }

  function setAllBodiesVisibility(visible, recordHistory = true) {
    const bodies = extrudeController?.bodies || [];
    const prevStates = bodies.map(b => ({ body: b, visible: b.visible !== false }));
    if (!bodies.length) return;

    const apply = (val) => {
      for (const b of bodies) b.visible = val;
      if (!val && (faceSelection?.selected || faceSelection?.selectedBody)) faceSelection.clear();
      renderBodyTree();
      requestRedraw(false);
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} bodies`, kind: 'view',
        execute: () => apply(visible),
        undo: () => {
          for (const s of prevStates) s.body.visible = s.visible;
          renderBodyTree();
          requestRedraw(false);
        },
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function setSketchVisibility(sketch, visible, recordHistory = true) {
    const prev = sketch.visible !== false;
    if (prev === visible && recordHistory) return;

    const apply = (val) => {
      sketch.visible = val;
      if (!val) profileSelection?.clear();
      if (extrudeController?.active) {
        extrudeController.previewCache = null;
        extrudeController.update();
      }
      renderSketchTree();
      requestRedraw();
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} ${sketch.name}`, kind: 'view',
        execute: () => apply(visible),
        undo: () => apply(prev),
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function setAllSketchesVisibility(visible, recordHistory = true) {
    const sketches = sketchDocument?.sketches || [];
    const prevStates = sketches.map(s => ({ sketch: s, visible: s.visible !== false }));
    if (!sketches.length) return;

    const apply = (val) => {
      for (const s of sketches) s.visible = val;
      if (!val) profileSelection?.clear();
      if (extrudeController?.active) {
        extrudeController.previewCache = null;
        extrudeController.update();
      }
      renderSketchTree();
      requestRedraw();
    };

    if (recordHistory) {
      history.execute({
        name: `${visible ? 'Show' : 'Hide'} sketches`, kind: 'view',
        execute: () => apply(visible),
        undo: () => {
          for (const s of prevStates) s.sketch.visible = s.visible;
          renderSketchTree();
          requestRedraw();
        },
        redo: () => apply(visible),
      });
    } else {
      apply(visible);
    }
  }

  function setPicking(show) {
    if (activeSketch) return;
    if (show) {
      extrudeController?.close();
      solidBevel?.close();
      bodyMove?.close();
      meshToSolid?.close();
      faceSelection?.clear();
      profileSelection?.clear();
      if (!savedPlaneVisibility) {
        savedPlaneVisibility = {
          XY: Boolean(modelView.visibility.XY),
          XZ: Boolean(modelView.visibility.XZ),
          YZ: Boolean(modelView.visibility.YZ),
        };
      }
      for (const plane of ['XY', 'XZ', 'YZ']) {
        modelView.setVisibility(plane, true);
        updateOriginTreeItemUI(plane, true);
      }
      if (pendingSketchTool) {
        const toolLabel = pendingSketchTool === 'line' ? 'Line' : pendingSketchTool === 'rectangle' ? 'Rectangle' : 'Circle';
        viewHint.textContent = `Select a plane or body face to start ${toolLabel} (Esc to cancel)`;
      } else {
        viewHint.textContent = 'Select a plane or body face to start sketch (Esc to cancel)';
      }
    } else {
      pendingSketchTool = null;
      if (savedPlaneVisibility) {
        for (const plane of ['XY', 'XZ', 'YZ']) {
          const wasVisible = Boolean(savedPlaneVisibility[plane]);
          modelView.setVisibility(plane, wasVisible);
          updateOriginTreeItemUI(plane, wasVisible);
        }
        savedPlaneVisibility = null;
      }
      viewHint.textContent = 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom';
    }
    modelView.setPicking(show);
    openSketchButton.setAttribute('aria-pressed', String(show));
    openSketchButton.classList.toggle('selected', show);
    statusText.textContent = '3D VIEW';
  }

  function renderSketchTree() {
    sketchCount.textContent = String(sketchDocument.sketches.length);
    const sketchesEyeBtn = document.querySelector('#sketchesEyeBtn');
    if (sketchesEyeBtn) {
      const anyVisible = sketchDocument.sketches.some(s => s.visible !== false);
      const allHidden = sketchDocument.sketches.length > 0 && !anyVisible;
      sketchesEyeBtn.textContent = allHidden ? '○' : '◉';
      sketchesEyeBtn.classList.toggle('is-hidden', allHidden);
      sketchesFolderRow.classList.toggle('is-item-hidden', allHidden);
    }
    sketchRows.replaceChildren();
    for (const sketch of sketchDocument.sketches) {
      const row = document.createElement('div');
      row.className = 'tree-row tree-grandchild sketch-tree-row';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Edit ${sketch.name} on ${sketch.faceBodyId ? 'a body face' : `${sketch.plane} plane`}`);
      row.classList.toggle('is-active', sketch === activeSketch);
      row.classList.toggle('is-item-hidden', sketch.visible === false);
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'tree-eye';
      eye.textContent = sketch.visible === false ? '○' : '◉';
      eye.classList.toggle('is-hidden', sketch.visible === false);
      eye.title = `${sketch.visible === false ? 'Show' : 'Hide'} ${sketch.name}`;
      eye.setAttribute('aria-label', eye.title);
      eye.addEventListener('click', event => {
        event.stopPropagation();
        setSketchVisibility(sketch, sketch.visible === false, true);
      });
      const icon = document.createElement('span');
      icon.className = 'tree-icon sketch-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '▤';
      const label = document.createElement('span');
      label.textContent = `${sketch.name} · ${sketch.faceBodyId ? 'Face' : sketch.plane}`;
      row.append(eye, icon, label, makeTreeDeleteButton(sketch.name, () => deleteSketch(sketch)));
      const edit = () => {
        if (sketch !== activeSketch) {
          const toolToActivate = pendingSketchTool;
          pendingSketchTool = null;
          applyActiveSketch(sketch);
          if (toolToActivate) sketchTools.setTool(toolToActivate);
        }
      };
      row.addEventListener('click', edit);
      row.addEventListener('keydown', event => {
        if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); edit();
        }
      });
      sketchRows.append(row);
    }
  }

  function renderBodyTree() {
    const bodies = extrudeController?.bodies || [];
    if (faceSelection?.selected && !bodies.includes(faceSelection.selected.body)) faceSelection.clear();
    if (faceSelection?.selectedBody && !bodies.includes(faceSelection.selectedBody)) faceSelection.clear();
    bodyCount.textContent = String(bodies.length);
    bodiesFolderRow.hidden = bodies.length === 0;
    bodyRows.hidden = !bodies.length || !bodiesExpanded;
    bodiesChevron.textContent = bodiesExpanded ? '⌄' : '›';
    const bodiesEyeBtn = document.querySelector('#bodiesEyeBtn');
    if (bodiesEyeBtn) {
      const anyVisible = bodies.some(b => b.visible !== false);
      const allHidden = bodies.length > 0 && !anyVisible;
      bodiesEyeBtn.textContent = allHidden ? '○' : '◉';
      bodiesEyeBtn.classList.toggle('is-hidden', allHidden);
      bodiesFolderRow.classList.toggle('is-item-hidden', allHidden);
    }
    bodyRows.replaceChildren();
    for (const body of bodies) {
      const row = document.createElement('div');
      row.className = 'tree-row tree-grandchild body-tree-row';
      row.classList.toggle('is-item-hidden', body.visible === false);
      row.classList.toggle('is-selected', faceSelection?.selectedBody === body || body.convertSelected === true || meshDecimate?.selectedBody === body || surfaceFinish?.selectedBody === body || interference?.body1 === body || interference?.body2 === body || zebraAnalysis?.selectedBody === body);
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'tree-eye';
      eye.setAttribute('aria-label', `${body.visible === false ? 'Show' : 'Hide'} ${body.name}`);
      eye.title = `${body.visible === false ? 'Show' : 'Hide'} ${body.name}`;
      eye.textContent = body.visible === false ? '○' : '◉';
      eye.classList.toggle('is-hidden', body.visible === false);
      eye.addEventListener('click', event => {
        event.stopPropagation();
        setBodyVisibility(body, body.visible === false, true);
      });
      const icon = document.createElement('span');
      icon.className = 'tree-icon body-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⬡';
      const label = document.createElement('span');
      label.textContent = body.name;
      row.append(eye, icon, label, makeTreeDeleteButton(body.name, () => {
        if (anySolidToolActive()) {
          showError({ code: 'CAD-E003', title: 'Delete unavailable', reason: 'Finish or cancel the active tool before deleting a body.' });
          return;
        }
        deleteBody(body);
      }));
      row.addEventListener('click', () => {
        if (interference?.active) { interference.setBody(body); return; }
        if (zebraAnalysis?.active) { zebraAnalysis.setBody(body); return; }
        if (meshDecimate?.active) { meshDecimate.setBody(body); return; }
        if (meshToSolid?.active) { meshToSolid.selectBody(body); return; }
        if (surfaceFinish?.active) { surfaceFinish.setBody(body); return; }
        if (body.visible === false || !faceSelection) return;
        if (faceSelection.selectedBody === body) {
          faceSelection.clear();
        } else {
          faceSelection.selectBody(body);
        }
      });
      bodyRows.append(row);
    }
  }

  function setSplitView(show) {
    splitView = Boolean(show && activeSketch);
    editor.classList.toggle('has-sketch', splitView);
    divider.hidden = !splitView;
    sketchPane.hidden = !splitView;
    splitViewButton.setAttribute('aria-pressed', String(splitView));
    splitViewButton.classList.toggle('selected', splitView);
    requestRedraw();
  }

  let activeRibbonWorkspace = 'solid';

  function setRibbonWorkspace(workspace) {
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

    if (ribbonTabSolid) {
      ribbonTabSolid.classList.toggle('tab-active', isSolid);
      ribbonTabSolid.setAttribute('aria-selected', String(isSolid));
    }
    if (ribbonTabMesh) {
      ribbonTabMesh.classList.toggle('tab-active', isMesh);
      ribbonTabMesh.setAttribute('aria-selected', String(isMesh));
    }
    if (ribbonTabUtilities) {
      ribbonTabUtilities.classList.toggle('tab-active', isUtilities);
      ribbonTabUtilities.setAttribute('aria-selected', String(isUtilities));
    }
    if (ribbonTabSketch) {
      ribbonTabSketch.hidden = !isSketch;
      ribbonTabSketch.classList.toggle('tab-active', isSketch);
      ribbonTabSketch.setAttribute('aria-selected', String(isSketch));
    }

    if (solidWorkspaceToolbar) solidWorkspaceToolbar.hidden = !isSolid;
    if (meshWorkspaceToolbar) meshWorkspaceToolbar.hidden = !isMesh;
    if (utilitiesWorkspaceToolbar) utilitiesWorkspaceToolbar.hidden = !isUtilities;
    if (sketchWorkspaceToolbar) sketchWorkspaceToolbar.hidden = !isSketch;

    if (workspaceSwitchText) {
      workspaceSwitchText.textContent = workspace.toUpperCase();
    }
    updateWorkspaceSwitchUI(workspace);

    if (!isSolid) {
      extrudeController?.close();
      solidRevolve?.close();
      solidBevel?.close();
      solidHole?.close();
      solidPattern?.close();
      solidPatternMenu?.close();
    }
    if (!isMesh) {
      meshDecimate?.close();
      meshToSolid?.close();
      surfaceFinish?.close();
    }
    if (!isUtilities) {
      interference?.close();
      zebraAnalysis?.close();
    }
  }

  function applyActiveSketch(sketch) {
    extrudeController?.close();
    solidRevolve?.close();
    solidBevel?.close();
    solidHole?.close();
    bodyMove?.close();
    solidPattern?.close();
    solidPatternMenu?.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    faceSelection?.clear();
    sketchTools.setTool(null);
    sketchTools.clearEntitySelection();
    sketchTools.setConstruction(false);
    sketchTools.clearPointSelection();
    profileSelection.clear();
    const exitingSketch = activeSketch;
    activeSketch = sketch;
    if (sketch) {
      setRibbonWorkspace('sketch');
    } else {
      setRibbonWorkspace(activeRibbonWorkspace === 'sketch' ? 'solid' : activeRibbonWorkspace);
    }
    if (sketch) sketch.visible = true;
    modelView.setPicking(false, { preserveGrid: Boolean(sketch) });
    openSketchButton.setAttribute('aria-pressed', 'false');
    openSketchButton.classList.remove('selected');
    openSketchButton.hidden = Boolean(sketch);
    if (extrudeBtn) extrudeBtn.hidden = Boolean(sketch);
    if (holeBtn) holeBtn.hidden = Boolean(sketch);
    bodyMoveBtn.hidden = Boolean(sketch);
    solidFilletBtn.hidden = Boolean(sketch);
    solidChamferBtn.hidden = Boolean(sketch);
    if (solidPatternMenuContainer) solidPatternMenuContainer.hidden = Boolean(sketch);
    if (meshDecimateBtn) meshDecimateBtn.hidden = Boolean(sketch);
    if (meshToSolidBtn) meshToSolidBtn.hidden = Boolean(sketch);
    lineToolButton.hidden = !sketch;
    rectangleToolButton.hidden = !sketch;
    circleToolButton.hidden = !sketch;
    constructionToolButton.hidden = !sketch;
    pointToolButton.hidden = !sketch;
    filletToolButton.hidden = !sketch;
    trimToolButton.hidden = !sketch;
    mirrorToolButton.hidden = !sketch;
    distanceToolButton.hidden = !sketch;
    angleToolButton.hidden = !sketch;
    midpointToolButton.hidden = !sketch;
    axisToolButton.hidden = !sketch;
    fixToolButton.hidden = !sketch;
    tangentToolButton.hidden = !sketch;
    coincidentToolButton.hidden = !sketch;
    equalToolButton.hidden = !sketch;
    offsetToolButton.hidden = !sketch;
    patternMenuContainer.hidden = !sketch;
    patternMenu?.close();
    splitViewButton.hidden = !sketch;
    finishSketchButton.hidden = !sketch;
    if (sketch) {
      modelView.activeSketchPlane = sketch.plane;
      for (const plane of ['XY', 'XZ', 'YZ']) {
        modelView.setVisibility(plane, false);
        updateOriginTreeItemUI(plane, false);
      }
      savedPlaneVisibility = null;
      modelView.setGridPlane(sketch.plane);
      sketchView.setPlane(sketch.plane);
      activePlaneLabel.textContent = sketch.faceBodyId ? 'BODY FACE' : `${sketch.plane} PLANE`;
      modelPaneTitle.textContent = `${sketch.name.toUpperCase()} · ${sketch.faceBodyId ? 'FACE' : sketch.plane}`;
      statusText.textContent = modeStatus();
      viewHint.textContent = sketchShortcutHint();
      if (sketch.faceBodyId) {
        camera.setPivot(cad.planes.grid[sketch.plane].origin);
        camera.pan(-camera.panX, -camera.panY);
        camera.animateToDirection(sketch.faceNormal, () => {
          const bounds = modelCanvas.getBoundingClientRect();
          const point = camera.project(cad.planes.grid[sketch.plane].origin, bounds.width, bounds.height);
          camera.pan(bounds.width * 0.5 - point[0], bounds.height * 0.59 - point[1]);
          requestRedraw(false);
        });
      }
      else camera.animateToView(cad.planes.sketch[sketch.plane].view, () => requestRedraw(false));
    } else {
      modelView.activeSketchPlane = null;
      for (const plane of ['XY', 'XZ', 'YZ']) {
        modelView.setVisibility(plane, false);
        updateOriginTreeItemUI(plane, false);
      }
      savedPlaneVisibility = null;
      modelView.setGridPlane('XY');
      sketchView.setPlane(null);
      modelPaneTitle.textContent = '3D WORKSPACE';
      statusText.textContent = '3D VIEW';
      viewHint.textContent = 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom';
    }
    setSplitView(false);
    renderSketchTree();
    redraw();
  }

  function startSketch(source) {
    if (activeSketch) return;
    const face = typeof source === 'object' ? source : null;
    const name = face ? cad.bodyFaces.registerPlane(face) : source;
    if (!cad.planes.sketch[name]) return;
    const sketch = sketchDocument.makeSketch(name);
    if (face) {
      sketch.faceBodyId = face.body.id;
      sketch.faceNormal = [...face.normal];
    }
    sketch.savedPlaneVisibility = savedPlaneVisibility ? { ...savedPlaneVisibility } : { XY: false, XZ: false, YZ: false };
    const toolToActivate = pendingSketchTool;
    pendingSketchTool = null;
    history.execute({
      name: `Create ${sketch.name}`, kind: 'sketch', timelineTool: 'openSketch', timelineSketchEvent: 'create',
      execute: () => {
        sketchDocument.insertSketch(sketch);
        applyActiveSketch(sketch);
        if (toolToActivate) sketchTools.setTool(toolToActivate);
      },
      undo: () => { applyActiveSketch(null); sketchDocument.removeSketch(sketch.id); renderSketchTree(); redraw(); },
      redo: () => {
        sketchDocument.insertSketch(sketch);
        applyActiveSketch(sketch);
        if (toolToActivate) sketchTools.setTool(toolToActivate);
      },
    });
  }

  function closeSketch() {
    if (!activeSketch) return;
    const sketch = activeSketch;
    history.execute({
      name: `Finish ${sketch.name}`, kind: 'sketch', timelineSketchEvent: 'finish',
      execute: () => applyActiveSketch(null),
      undo: () => applyActiveSketch(sketch),
      redo: () => applyActiveSketch(null),
    });
  }

  function closeSplit() {
    setSplitView(false);
  }

  modelView = new cad.ModelView({
    canvas: modelCanvas,
    pane: document.querySelector('.model-pane'),
    camera,
    onPlaneSelect: startSketch,
    onCameraChange: () => requestRedraw(false),
    getFaceAt: (clientX, clientY) => faceSelection?.faceAt({ clientX, clientY }),
    getBodies: () => extrudeController?.bodies || [],
    getActiveSketch: () => activeSketch,
  });
  const viewToolbar = document.querySelector('#viewToolbar');
  const navigationButtons = [...viewToolbar.querySelectorAll('[data-nav-mode]')];
  const updateNavigationButtons = () => navigationButtons.forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.navMode === modelView.navigationMode)));
  navigationButtons.forEach(button => button.addEventListener('click', () => {
    modelView.setNavigationMode(modelView.navigationMode === button.dataset.navMode ? null : button.dataset.navMode);
    updateNavigationButtons();
    modelCanvas.focus();
  }));
  viewToolbar.querySelector('#viewFit').addEventListener('click', () => modelView.fitToScene(true));
  const panNavButton = viewToolbar.querySelector('[data-nav-mode="pan"]');
  if (panNavButton) {
    panNavButton.addEventListener('dblclick', () => modelView.fitToScene(true));
  }
  const displayButton = viewToolbar.querySelector('#displaySettingsButton');
  const displayMenu = viewToolbar.querySelector('#displaySettingsMenu');
  const displayInputs = [...displayMenu.querySelectorAll('input[name="displayStyle"]')];
  new cad.ToolbarMenu({
    container: document.querySelector('#inspectMenuContainer'),
    trigger: document.querySelector('#inspectMenuButton'),
    menu: document.querySelector('#inspectDropdown'),
  });
  const showMeshOption = document.querySelector('#showMeshOption');
  const syncShowMeshUI = (active) => {
    showMeshOption?.setAttribute('aria-checked', String(active));
    meshShowMeshBtn?.setAttribute('aria-pressed', String(active));
    meshShowMeshBtn?.classList.toggle('selected', active);
  };
  try { cad.settings.showMesh = localStorage.getItem('onlinecad.showMesh') === 'true'; }
  catch { /* Local files may have restricted storage. */ }
  syncShowMeshUI(cad.settings.showMesh);
  showMeshOption.addEventListener('click', () => {
    if (extrudeController?.active || cad.extrudeController?.active) return;
    cad.settings.showMesh = !cad.settings.showMesh;
    syncShowMeshUI(cad.settings.showMesh);
    try { localStorage.setItem('onlinecad.showMesh', String(cad.settings.showMesh)); }
    catch { /* Optional persistence. */ }
    requestRedraw(false);
  });
  try {
    const saved = localStorage.getItem('onlinecad.displayStyle');
    if (['shaded', 'shaded-edges'].includes(saved)) cad.settings.displayStyle = saved;
  } catch { /* Local files may have restricted storage. */ }
  displayInputs.forEach(input => {
    input.checked = input.value === cad.settings.displayStyle;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      cad.settings.displayStyle = input.value;
      try { localStorage.setItem('onlinecad.displayStyle', input.value); } catch { /* Optional persistence. */ }
      displayMenu.hidden = true;
      displayButton.setAttribute('aria-expanded', 'false');
      requestRedraw(false);
    });
  });
  displayButton.addEventListener('click', () => {
    displayMenu.hidden = !displayMenu.hidden;
    displayButton.setAttribute('aria-expanded', String(!displayMenu.hidden));
  });
  document.addEventListener('pointerdown', event => {
    if (!viewToolbar.contains(event.target)) {
      displayMenu.hidden = true;
      displayButton.setAttribute('aria-expanded', 'false');
    }
  });
  sketchView = new cad.SketchView({
    canvas: sketchCanvas,
    pane: sketchPane,
    originLabel: document.querySelector('.sketch-origin-label'),
    document: sketchDocument,
    getActiveSketch: () => activeSketch,
  });
  annotationInteraction = new cad.SketchAnnotationInteraction({
    canvas: modelCanvas,
    pane: document.querySelector('.model-pane'),
    sketchDocument,
    history,
    onChange: requestRedraw,
  });
  const drawingButtons = {
    line: lineToolButton,
    rectangle: rectangleToolButton,
    circle: circleToolButton,
    point: pointToolButton,
    fillet: filletToolButton,
    trim: trimToolButton,
    mirror: mirrorToolButton,
    distance: distanceToolButton,
    angle: angleToolButton,
    midpoint: midpointToolButton,
    axis: axisToolButton,
    fix: fixToolButton,
    tangent: tangentToolButton,
    coincident: coincidentToolButton,
    equal: equalToolButton,
    offset: offsetToolButton,
    circularPattern: circularPatternToolButton,
    rectangularPattern: rectangularPatternToolButton
  };
  function sketchShortcutHint() {
    return Object.entries(cad.shortcuts.bindings).filter(([tool, key]) => key && tool !== 'extrude')
      .map(([tool, key]) => `${key}: ${tool[0].toUpperCase()}${tool.slice(1)}`).join(' · ');
  }
  sketchTools = new cad.SketchToolController({
    canvas: modelCanvas,
    hud: document.querySelector('#dimensionHud'),
    document: sketchDocument,
    camera,
    history,
    annotationInteraction,
    getActiveSketch: () => activeSketch,
    onChange: requestRedraw,
    onFeedback: message => { viewHint.textContent = message; },
    onError: showError,
    onConstructionChange: enabled => {
      constructionToolButton.setAttribute('aria-pressed', String(enabled));
      constructionToolButton.classList.toggle('selected', enabled);
      if (activeSketch && !sketchTools.tool) viewHint.textContent = enabled
        ? 'CONSTRUCTION: click an existing curve to convert it · Select Line, Rectangle, or Circle to draw helpers'
        : sketchShortcutHint();
    },
    onToolChange: mode => {
      if (mode) profileSelection?.clear();
      for (const [name, button] of Object.entries(drawingButtons)) {
        button.setAttribute('aria-pressed', String(mode === name));
        button.classList.toggle('selected', mode === name);
      }
      const patternSelected = mode === 'circularPattern' || mode === 'rectangularPattern';
      patternMenuButton.setAttribute('aria-pressed', String(patternSelected));
      patternMenuButton.classList.toggle('selected', patternSelected);
      if (activeSketch) viewHint.textContent = mode === 'distance'
        ? 'DISTANCE: click a line, rectangle edge or circle boundary, or click two points · Double-click a value to edit'
        : mode === 'angle' ? 'ANGLE: click two intersecting lines'
          : mode === 'midpoint' ? 'MIDPOINT: click a line or rectangle edge to mark its center'
            : mode === 'point' ? 'POINT: click the grid to place a point'
              : mode === 'axis' ? 'HORIZONTAL / VERTICAL: click a line, or click two points to align horizontally or vertically (Esc to cancel)'
                : mode === 'fix' ? 'FIX / UNFIX: click sketch geometry to lock or unlock its position'
                  : mode === 'tangent' ? 'TANGENT: click a line, circle or arc, then a compatible curve'
                    : mode === 'coincident' ? 'COINCIDENT: click two points, or a point and a curve'
                      : mode === 'equal' ? 'EQUAL: click two lines, rectangle edges, circles, or arcs'
                        : mode === 'offset' ? 'OFFSET: select curves, drag the arrow to either side or enter a signed distance, then OK'
                          : mode === 'circularPattern' ? 'CIRCULAR PATTERN: select curves, choose center and quantity, then OK'
                            : mode === 'rectangularPattern' ? 'RECTANGULAR PATTERN: select curves, set rows, columns and spacing, then OK'
                              : mode === 'line' ? 'LINE: click consecutive points · Green check: finish · Tab: lock dimension'
                                : mode === 'fillet' ? 'FILLET: select first and second edge · Choose intersection if needed · Drag the arrow or enter radius · Enter or OK: finish'
                                  : mode === 'trim' ? 'TRIM: click an edge or hold the mouse button and sweep across edges · Esc: exit'
                                    : mode === 'mirror' ? 'MIRROR: select objects to duplicate, then select a mirror line or axis in the dialog'
                                      : mode ? `${mode.toUpperCase()}: click two grid points · Tab: lock dimension · Enter: finish · Esc: cancel`
                                        : sketchTools.constructionEnabled
                                          ? 'CONSTRUCTION: click an existing curve to convert it · Select Line, Rectangle, or Circle to draw helpers'
                                          : sketchShortcutHint();
    },
  });
  profileSelection = new cad.ProfileSelection({
    canvas: modelCanvas,
    sketchDocument,
    camera,
    getTool: () => extrudeController?.active || solidRevolve?.active || solidBevel?.active || solidHole?.active || bodyMove?.active || solidPattern?.active || meshDecimate?.active || interference?.active || zebraAnalysis?.active || (!activeSketch && extrudeController?.bodies.length ? 'body-view' : null) ||
      sketchTools.tool || (sketchTools.constructionEnabled ? 'construction' : null),
    isPicking: () => modelView.picking,
    onChange: requestRedraw,
  });
  modelView.onDrawOverlay = (context, project) => {
    if (interference?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, interference.displayBodies());
      interference.renderOverlay(context, project);
      return;
    }
    if (zebraAnalysis?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project);
      zebraAnalysis.renderOverlay(context, project);
      return;
    }
    if (meshDecimate?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, meshDecimate.displayBodies());
      return;
    }
    if (solidPattern?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, solidPattern.displayBodies());
      return;
    }
    if (bodyMove?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, bodyMove.displayBodies());
      bodyMove.renderOverlay(context, project);
      return;
    }
    if (solidRevolve?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, solidRevolve.displayBodies());
      solidRevolve.renderOverlay(context, project);
      return;
    }
    if (solidBevel?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, solidBevel.displayBodies());
      solidBevel.renderOverlay(context, project);
      return;
    }
    if (solidHole?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project, solidHole.displayBodies());
      solidHole.renderOverlay(context, project);
      return;
    }
    if (extrudeController?.active) {
      annotationInteraction.setHits([]);
      extrudeController.render(context, project);
      return;
    }
    if (!activeSketch) {
      if (extrudeController?.bodies.length) {
        extrudeController.render(context, project);
        faceSelection?.render(context, project);
        if (modelView.picking && modelView.hoveredPlane && typeof modelView.hoveredPlane === 'object') {
          cad.bodyFaces.renderFaceHighlight(context, project, modelView.hoveredPlane, {
            fill: 'rgba(39, 135, 191, .42)', stroke: '#1d87bd', lineWidth: 2.6
          });
        }
      }
      for (const sketch of sketchDocument.sketches) {
        if (sketch.visible === false) continue;
        const toScreen = point => project(sketchDocument.toWorld(sketch, point));
        for (const entity of sketch.entities)
          cad.sketchRender.drawEntity(context, entity, toScreen,
            entity.construction ? '#8a9eaa' : '#338ab5', entity.construction ? 1 : 1.5, sketch);
      }
      profileSelection.render(context, project);
      return;
    }
    extrudeController?.render(context, project);
    profileSelection.render(context, project);
    sketchTools.render(context, project);
  };
  extrudeController = new cad.ExtrudeController({
    canvas: modelCanvas,
    panel: document.querySelector('#extrudePanel'),
    hud: document.querySelector('#extrudeHud'),
    document: sketchDocument,
    camera,
    modelView,
    history,
    profileSelection,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom'
        : message.startsWith('EXTRUDE')
          ? `${message} · Click face or sketch profile · Hold Ctrl to select occluded sketches`
          : message;
    },
  });
  solidBevel = new cad.SolidBevelController({
    canvas: modelCanvas,
    panel: document.querySelector('#solidBevelPanel'),
    camera,
    extrudeController,
    history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom'
        : message;
    },
    onModeChange: mode => {
      for (const [button, name] of [[solidFilletBtn, 'fillet'], [solidChamferBtn, 'chamfer']]) {
        button.setAttribute('aria-pressed', String(mode === name));
        button.classList.toggle('selected', mode === name);
      }
    },
  });
  solidRevolve = new cad.SolidRevolveController({
    canvas: modelCanvas,
    hud: document.querySelector('#revolveHud'),
    camera,
    extrudeController,
    sketchProfiles: cad.sketchProfiles,
    profileSelection,
    sketchManager: sketchDocument,
    history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom'
        : message;
    },
    onError: showError
  });
  solidHole = new cad.SolidHoleController({
    canvas: modelCanvas,
    panel: document.querySelector('#solidHolePanel'),
    hud: document.querySelector('#solidHoleHud'),
    camera,
    extrudeController,
    history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom'
        : message;
    },
    onModeChange: active => {
      holeBtn.setAttribute('aria-pressed', String(active));
      holeBtn.classList.toggle('selected', active);
    },
  });
  bodyMove = new cad.BodyMoveController({
    canvas: modelCanvas,
    panel: document.querySelector('#bodyMovePanel'),
    camera, extrudeController, history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: active => {
      bodyMoveBtn.setAttribute('aria-pressed', String(active));
      bodyMoveBtn.classList.toggle('selected', active);
    },
  });
  solidPattern = new cad.BodyPatternController({
    canvas: modelCanvas,
    panel: document.querySelector('#bodyPatternPanel'),
    camera, extrudeController, history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: mode => {
      const active = Boolean(mode);
      solidPatternMenuButton?.setAttribute('aria-pressed', String(active));
      solidPatternMenuButton?.classList.toggle('selected', active);
    },
  });
  faceSelection = new cad.BodyFaceSelection({
    canvas: modelCanvas, camera, extrudeController,
    isAvailable: () => !activeSketch && !modelView.picking && !extrudeController.active &&
      !solidRevolve?.active && !solidBevel.active && !solidHole.active && !bodyMove.active && !solidPattern.active && !meshDecimate?.active && !meshToSolid?.active && !surfaceFinish?.active && !interference?.active && !zebraAnalysis?.active && !modelView.navigationMode,
    onChange: () => {
      renderBodyTree();
      requestRedraw(false);
    },
    onSelect: face => {
      if (face) {
        statusText.textContent = `${face.body.name} · FACE SELECTED`;
        viewHint.textContent = 'Selected face · Sketch: draw on face · Extrude: extend face';
      } else if (faceSelection?.selectedBody) {
        const body = faceSelection.selectedBody;
        statusText.textContent = `${body.name} · BODY SELECTED`;
        viewHint.textContent = body.meshSource === 'import'
          ? 'Imported mesh · Use MESH TO SOLID to edit faces' :
          'Selected body · Move/Rotate (M) · Double-click another face or Esc to deselect';
      } else if (!activeSketch) {
        statusText.textContent = '3D VIEW';
        viewHint.textContent = 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom';
      }
      renderBodyTree();
    },
    onSelectBody: body => {
      if (body) {
        statusText.textContent = `${body.name} · BODY SELECTED`;
        viewHint.textContent = body.meshSource === 'import'
          ? 'Imported mesh · Use MESH TO SOLID to edit faces' :
          'Selected body · Move/Rotate (M) · Double-click another face or Esc to deselect';
      } else if (faceSelection?.selected) {
        const face = faceSelection.selected;
        statusText.textContent = `${face.body.name} · FACE SELECTED`;
        viewHint.textContent = 'Selected face · Sketch: draw on face · Extrude: extend face';
      } else if (!activeSketch) {
        statusText.textContent = '3D VIEW';
        viewHint.textContent = 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom';
      }
      renderBodyTree();
    },
  });
  meshDecimate = new cad.meshDecimator.MeshDecimatorController({
    canvas: modelCanvas,
    panel: document.querySelector('#meshDecimatePanel'),
    extrudeController,
    faceSelection,
    history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: mode => {
      const active = Boolean(mode);
      meshDecimateBtn?.setAttribute('aria-pressed', String(active));
      meshDecimateBtn?.classList.toggle('selected', active);
    },
  });
  meshToSolid = new cad.meshToSolid.MeshToSolidController({
    canvas: modelCanvas,
    panel: document.querySelector('#meshToSolidPanel'),
    extrudeController, faceSelection, history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: active => {
      meshToSolidBtn?.setAttribute('aria-pressed', String(active));
      meshToSolidBtn?.classList.toggle('selected', active);
      modelCanvas.classList.toggle('is-mesh-to-solid', active);
    },
  });
  surfaceFinish = new cad.surfaceFinish.SurfaceFinishController({
    canvas: modelCanvas,
    panel: document.querySelector('#surfaceFinishPanel'),
    extrudeController, faceSelection, history,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: mode => {
      const active = Boolean(mode);
      surfaceFinishBtn?.setAttribute('aria-pressed', String(active));
      surfaceFinishBtn?.classList.toggle('selected', active);
    },
  });
  interference = new cad.InterferenceController({
    canvas: modelCanvas,
    panel: document.querySelector('#interferencePanel'),
    extrudeController,
    faceSelection,
    onChange: () => requestRedraw(false),
    onBodiesChange: renderBodyTree,
    onError: showError,
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: active => {
      interferenceBtn?.setAttribute('aria-pressed', String(active));
      interferenceBtn?.classList.toggle('selected', active);
      inspectInterferenceBtn?.setAttribute('aria-pressed', String(active));
      inspectInterferenceBtn?.classList.toggle('selected', active);
    },
  });
  zebraAnalysis = new cad.ZebraAnalysisController({
    canvas: modelCanvas,
    panel: document.querySelector('#zebraAnalysisPanel'),
    camera,
    extrudeController,
    onChange: () => requestRedraw(false),
    onStatus: message => {
      statusText.textContent = message;
      viewHint.textContent = message === '3D VIEW'
        ? 'MMB: pan · Shift + MMB: orbit · Wheel / Ctrl + Shift + MMB: zoom' : message;
    },
    onModeChange: active => {
      zebraAnalysisBtn?.setAttribute('aria-pressed', String(active));
      zebraAnalysisBtn?.classList.toggle('selected', active);
      inspectZebraBtn?.setAttribute('aria-pressed', String(active));
      inspectZebraBtn?.classList.toggle('selected', active);
    },
  });
  viewCube = new cad.ViewCube({
    root: document.querySelector('#viewCube'),
    camera,
    onCameraChange: () => requestRedraw(false),
  });
  const settingsPanel = new cad.SettingsPanel({
    button: document.querySelector('#settingsButton'),
    panel: document.querySelector('#settingsPanel'),
  });
  cad.shortcuts.onChange(() => {
    for (const [tool, button] of Object.entries(drawingButtons)) {
      const base = (button.dataset.tooltipBase || button.dataset.tooltipDescription || button.title).replace(/ \([A-Z]\)$/, '');
      button.dataset.tooltipBase = base;
      button.dataset.tooltipDescription = `${base}${cad.shortcuts.bindings[tool] ? ` (${cad.shortcuts.bindings[tool]})` : ''}`;
    }
    constructionToolButton.dataset.tooltipDescription = `Draw construction geometry or convert an existing curve${cad.shortcuts.bindings.construction ? ` (${cad.shortcuts.bindings.construction})` : ''}`;
    extrudeBtn.dataset.tooltipDescription = `Extrude closed sketch profiles${cad.shortcuts.bindings.extrude ? ` (${cad.shortcuts.bindings.extrude})` : ''}`;
    if (activeSketch && !sketchTools.tool) viewHint.textContent = sketchTools.constructionEnabled
      ? 'CONSTRUCTION: click an existing curve to convert it · Select Line, Rectangle, or Circle to draw helpers'
      : sketchShortcutHint();
  });
  cad.extrudeController = extrudeController;
  cad.app = { camera, modelView, sketchView, viewCube, settingsPanel, history, timeline, sketchDocument, sketchTools, annotationInteraction, profileSelection, extrudeController, solidRevolve, solidBevel, solidHole, bodyMove, solidPattern, meshDecimate, meshToSolid, surfaceFinish, interference, zebraAnalysis, faceSelection, redraw, renderBodyTree, startSketch, closeSketch, setPicking, setSplitView, getPendingSketchTool: () => pendingSketchTool, fitToScene: (animate = true) => modelView.fitToScene(animate) };
  renderBodyTree();
  patternMenu = new cad.ToolbarMenu({
    container: patternMenuContainer,
    trigger: patternMenuButton,
    menu: document.querySelector('#patternDropdown'),
  });
  sketchTools.wheel = new cad.SketchWheel({ canvas: modelCanvas, onSelect: tool => sketchTools.setTool(tool) });

  openSketchButton.addEventListener('click', () => {
    if (faceSelection.selected) { startSketch(faceSelection.selected); return; }
    if (!modelView.picking) pendingSketchTool = null;
    setPicking(!modelView.picking);
  });
  for (const [name, button] of Object.entries(drawingButtons)) {
    button.addEventListener('click', () => sketchTools.setTool(sketchTools.tool === name ? null : name));
  }
  constructionToolButton.addEventListener('click', () => sketchTools.setConstruction(!sketchTools.constructionEnabled));
  splitViewButton.addEventListener('click', () => setSplitView(!splitView));
  finishSketchButton.addEventListener('click', closeSketch);
  closeSketchButton.addEventListener('click', closeSplit);

  // Project I/O handlers: Save, Open, New, Export STL
  const projectFileInput = document.querySelector('#projectFileInput');

  // In-app Modals: draw.io style Save Dialog & New Design Confirmation
  const saveModalBackdrop = document.querySelector('#saveModalBackdrop');
  const saveDialogForm = document.querySelector('#saveDialogForm');
  const saveDialogFileNameInput = document.querySelector('#saveDialogFileNameInput');
  const saveDialogFileTypeSelect = document.querySelector('#saveDialogFileTypeSelect');
  const saveDialogWhereSelect = document.querySelector('#saveDialogWhereSelect');
  const saveDialogCancelBtn = document.querySelector('#saveDialogCancelBtn');
  const saveDialogResetBtn = document.querySelector('#saveDialogResetBtn');
  const saveDialogHelpBtn = document.querySelector('#saveDialogHelpBtn');

  const newDesignModalBackdrop = document.querySelector('#newDesignModalBackdrop');
  const newDesignCancelBtn = document.querySelector('#newDesignCancelBtn');
  const newDesignDiscardBtn = document.querySelector('#newDesignDiscardBtn');
  const newDesignSaveBtn = document.querySelector('#newDesignSaveBtn');

  let pendingSaveCallback = null;

  function openSaveDialog(options = {}) {
    pendingSaveCallback = options.onSaved || null;
    const initialType = options.type || 'ocad';
    if (saveDialogFileTypeSelect) saveDialogFileTypeSelect.value = initialType;
    if (saveDialogWhereSelect) saveDialogWhereSelect.value = 'download';
    syncSaveWhereOptions();

    const ext = initialType.startsWith('stl') ? '.stl' : '.ocad';
    const baseName = currentDocumentName.replace(/\.(ocad|stl|json)$/i, '') || 'Untitled Design';
    if (saveDialogFileNameInput) {
      saveDialogFileNameInput.value = `${baseName}${ext}`;
    }

    if (saveModalBackdrop) {
      saveModalBackdrop.hidden = false;
      setTimeout(() => {
        saveDialogFileNameInput?.focus();
        saveDialogFileNameInput?.setSelectionRange(0, baseName.length);
      }, 40);
    }
  }

  // Browser storage keeps editable projects only; meshes are always downloaded.
  function syncSaveWhereOptions() {
    const storageOption = saveDialogWhereSelect?.querySelector('option[value="storage"]');
    if (!storageOption) return;
    const meshExport = saveDialogFileTypeSelect?.value !== 'ocad';
    storageOption.disabled = meshExport;
    if (meshExport) saveDialogWhereSelect.value = 'download';
  }

  function closeSaveDialog() {
    if (saveModalBackdrop) saveModalBackdrop.hidden = true;
    pendingSaveCallback = null;
  }

  function handleSaveProject() {
    openSaveDialog({ type: 'ocad' });
  }

  function handleExportSTL(binary = true) {
    const bodies = extrudeController?.bodies || [];
    const targetBodies = bodies.filter(b => b.visible !== false && b.mesh?.triangles?.length);
    if (!targetBodies.length) {
      showError({
        code: 'CAD-E001',
        title: 'Export Notice',
        reason: 'No visible 3D bodies available to export as STL. Create a body with EXTRUDE first.',
      });
      return;
    }
    openSaveDialog({ type: binary ? 'stl-binary' : 'stl-ascii' });
  }

  if (saveModalBackdrop) {
    saveDialogCancelBtn?.addEventListener('click', closeSaveDialog);
    saveModalBackdrop.addEventListener('pointerdown', event => {
      if (event.target === saveModalBackdrop) closeSaveDialog();
    });

    saveDialogFileTypeSelect?.addEventListener('change', () => {
      const type = saveDialogFileTypeSelect.value;
      syncSaveWhereOptions();
      const targetExt = type.startsWith('stl') ? '.stl' : '.ocad';
      const cur = saveDialogFileNameInput?.value || currentDocumentName;
      const base = cur.replace(/\.(ocad|stl|json)$/i, '') || 'Untitled Design';
      if (saveDialogFileNameInput) {
        saveDialogFileNameInput.value = `${base}${targetExt}`;
      }
    });

    saveDialogResetBtn?.addEventListener('click', () => {
      const type = saveDialogFileTypeSelect?.value || 'ocad';
      const targetExt = type.startsWith('stl') ? '.stl' : '.ocad';
      const base = currentDocumentName.replace(/\.(ocad|stl|json)$/i, '') || 'Untitled Design';
      if (saveDialogFileNameInput) {
        saveDialogFileNameInput.value = `${base}${targetExt}`;
        saveDialogFileNameInput.focus();
        saveDialogFileNameInput.setSelectionRange(0, base.length);
      }
    });

    saveDialogHelpBtn?.addEventListener('click', () => {
      viewHint.textContent = 'onlineCAD Save: .ocad keeps sketches & solids; .stl is for 3D printers.';
      statusText.textContent = 'FORMATS: .OCAD (DESIGN) · .STL (3D PRINT)';
      setTimeout(() => { statusText.textContent = modeStatus(); }, 3500);
    });

    saveDialogForm?.addEventListener('submit', event => {
      event.preventDefault();
      const rawInput = saveDialogFileNameInput?.value.trim() || 'Untitled Design';
      const selectedType = saveDialogFileTypeSelect?.value || 'ocad';
      const selectedWhere = saveDialogWhereSelect?.value || 'download';
      const baseName = rawInput.replace(/\.(ocad|stl|json)$/i, '') || 'Untitled Design';

      // Exporting a mesh does not save the design; only .ocad clears the dirty flag.
      setDocumentName(baseName, selectedType === 'ocad' || !isDirty);

      try {
        if (selectedType === 'ocad') {
          if (selectedWhere === 'storage') {
            const serialized = cad.projectIO.serializeProject({
              documentName: baseName,
              sketchDocument,
              extrudeController,
              camera,
            });
            const store = cad.projectStore;
            if (!store) throw new Error('Browser storage is not available in this browser.');
            store.put(store.SAVED_KEY, serialized).then(() => {
              flashStatus(`PROJECT SAVED TO BROWSER · ${baseName}`,
                'Saved in this browser. Reopen it with FILE > Open Browser Draft.');
            }).catch(err => {
              updateSaveStatus(false);
              showError({ code: 'CAD-S001', title: 'Save Failed', reason: err?.message || 'Could not write to browser storage.' });
            });
          } else {
            const result = cad.projectIO.saveProjectToFile({
              documentName: baseName,
              sketchDocument,
              extrudeController,
              camera,
            });
            cad.projectStore?.remove(cad.projectStore.AUTOSAVE_KEY).catch(() => {});
            const msg = `PROJECT SAVED · ${result.filename}`;
            statusText.textContent = msg;
            viewHint.textContent = `Downloaded ${result.filename} (${sketchDocument.sketches.length} sketches, ${extrudeController?.bodies?.length || 0} bodies)`;
            setTimeout(() => { if (statusText.textContent === msg) statusText.textContent = modeStatus(); }, 3500);
          }
        } else {
          // STL Export
          const isBinary = selectedType === 'stl-binary';
          const bodies = extrudeController?.bodies || [];
          const targetBodies = bodies.filter(b => b.visible !== false && b.mesh?.triangles?.length);
          if (!targetBodies.length) {
            showError({
              code: 'CAD-E001',
              title: 'Export Notice',
              reason: 'No visible 3D bodies available to export as STL. Create a body with EXTRUDE first.',
            });
            return;
          }
          const result = cad.projectIO.saveSTLToFile(targetBodies, baseName, { binary: isBinary });
          flashStatus(`STL EXPORTED · ${result.filename}`,
            `Exported ${result.filename} (${result.triangleCount.toLocaleString()} triangles, ${(result.byteLength / 1024).toFixed(1)} KB)`, 4000);
        }

        const cb = pendingSaveCallback;
        closeSaveDialog();
        cb?.();
      } catch (err) {
        showError({
          code: 'CAD-S001',
          title: 'Save Failed',
          reason: err?.message || 'Could not save file.',
        });
      }
    });
  }

  function performResetWorkspace() {
    applyActiveSketch(null);
    sketchDocument.sketches = [];
    sketchDocument.nextSketchId = 1;
    sketchDocument.nextEntityId = 1;
    sketchDocument.nextMeasurementId = 1;
    sketchDocument.nextMarkerId = 1;
    sketchDocument.nextConstraintId = 1;
    cad.projectIO?.clearCustomPlanes();
    if (extrudeController) {
      extrudeController.bodies = [];
      extrudeController.nextBodyId = 1;
    }
    history.clear();
    setDocumentName('Untitled Design', false);
    renderSketchTree();
    renderBodyTree();
    modelView.fitToScene(false);
    requestRedraw(true);
    const msg = 'NEW DESIGN · Workspace reset';
    statusText.textContent = msg;
    viewHint.textContent = 'Started a clean workspace';
    setTimeout(() => { if (statusText.textContent === msg) statusText.textContent = modeStatus(); }, 3000);
  }

  function handleNewDesign() {
    const hasContent = sketchDocument.sketches.length > 0 || (extrudeController?.bodies?.length || 0) > 0;
    if (!hasContent) {
      performResetWorkspace();
      return;
    }
    if (newDesignModalBackdrop) {
      newDesignModalBackdrop.hidden = false;
    } else {
      performResetWorkspace();
    }
  }

  if (newDesignModalBackdrop) {
    const closeNewDesignModal = () => {
      newDesignModalBackdrop.hidden = true;
    };
    newDesignCancelBtn?.addEventListener('click', closeNewDesignModal);
    newDesignModalBackdrop.addEventListener('pointerdown', event => {
      if (event.target === newDesignModalBackdrop) closeNewDesignModal();
    });
    newDesignDiscardBtn?.addEventListener('click', () => {
      closeNewDesignModal();
      performResetWorkspace();
    });
    newDesignSaveBtn?.addEventListener('click', () => {
      closeNewDesignModal();
      openSaveDialog({ type: 'ocad', onSaved: performResetWorkspace });
    });
  }

  async function handleOpenProjectFile(file) {
    if (!file) return;
    meshToSolid?.close();
    try {
      applyActiveSketch(null);
      const result = await cad.projectIO.openProjectFromFile(file, {
        sketchDocument,
        extrudeController,
        camera,
        history,
      });
      await finishProjectLoad(result);
    } catch (err) {
      showError({ code: 'CAD-F002', title: 'Open Failed', reason: err?.message || 'Could not open project file' });
    }
  }

  // Load a project kept in browser storage (manual draft or autosave).
  async function openStoredProject(key, { saved = false } = {}) {
    const store = cad.projectStore;
    try {
      const entry = store ? await store.get(key) : null;
      if (!entry?.project) {
        showError({ code: 'CAD-F003', title: 'Nothing to open',
          reason: 'No project is saved in this browser yet. Use Save Project > Where: Browser Workspace Storage.' });
        return false;
      }
      meshToSolid?.close();
      applyActiveSketch(null);
      const result = cad.projectIO.deserializeProject(entry.project, { sketchDocument, extrudeController, camera, history });
      await finishProjectLoad(result, { saved });
      return true;
    } catch (err) {
      showError({ code: 'CAD-F002', title: 'Open Failed', reason: err?.message || 'Could not open the browser project' });
      return false;
    }
  }

  async function finishProjectLoad(result, { saved = true } = {}) {
    for (const body of extrudeController.bodies) {
      if (!body.mesh || !(body.displayReduction > 0)) continue;
      try {
        const simplified = await cad.meshDecimator.workerJob('simplify', {
          mesh: body.mesh, ratio: body.displayReduction,
        }).promise;
        body.renderMesh = { vertices: simplified.vertices, triangles: simplified.triangles };
      } catch {
        const simplified = cad.meshDecimator.decimateGridClustering(body.mesh, {
          ratio: body.displayReduction,
        });
        body.renderMesh = { vertices: simplified.vertices, triangles: simplified.triangles };
      }
    }
    setDocumentName(result.documentName, saved);
    if (!saved) scheduleAutosave();
    applyActiveSketch(null);
    renderSketchTree();
    renderBodyTree();
    requestRedraw(true);
    if (extrudeController?.bodies?.length) {
      modelView.fitToScene(true);
    }
    flashStatus(`PROJECT OPENED · ${result.documentName}`,
      `Loaded ${result.documentName} (${result.sketchCount} sketches, ${result.bodyCount} bodies)`);
  }

  const importFileInput = document.querySelector('#importFileInput');

  async function promptHighPolyImport(mesh, fileName) {
    const backdrop = document.querySelector('#highPolyModalBackdrop');
    if (!backdrop) return { ratio: 0.75 };

    const desc = backdrop.querySelector('#highPolyModalDesc');
    const keepLabel = backdrop.querySelector('#highPolyKeepLabel');
    const recLabel = backdrop.querySelector('#highPolyRecLabel');
    const confirmBtn = backdrop.querySelector('#highPolyConfirmBtn');
    const customBtn = backdrop.querySelector('#highPolyCustomBtn');
    const closeBtn = backdrop.querySelector('#highPolyCloseBtn');

    const triCount = mesh.triangleCount || Math.floor(mesh.triangles.length / 3);
    if (desc) {
      desc.textContent = `${fileName} has ${triCount.toLocaleString()} triangles. Choose the display detail; the original geometry remains available for editing and STL export.`;
    }
    if (keepLabel) {
      keepLabel.textContent = `Full original detail (${triCount.toLocaleString()} triangles)`;
    }
    if (recLabel) {
      const est75 = Math.round(triCount * 0.25).toLocaleString();
      recLabel.textContent = `Aims for ~${est75} display triangles; actual reduction depends on the shape`;
    }

    backdrop.hidden = false;

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        backdrop.hidden = true;
        confirmBtn?.removeEventListener('click', onConfirm);
        customBtn?.removeEventListener('click', onCustom);
        closeBtn?.removeEventListener('click', onClose);
        backdrop.removeEventListener('pointerdown', onBackdrop);
      };

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      const getAutoCenter = () => {
        const centerCheckbox = backdrop.querySelector('#highPolyCenterCheckbox');
        return centerCheckbox ? centerCheckbox.checked : true;
      };

      const onConfirm = () => {
        const checkedRadio = backdrop.querySelector('input[name="highPolyChoice"]:checked');
        const ratio = parseFloat(checkedRadio?.value || '0.75');
        finish({ ratio, autoCenter: getAutoCenter() });
      };

      const onCustom = () => {
        finish({ ratio: 0, openCustom: true, autoCenter: getAutoCenter() });
      };

      const onClose = () => {
        finish({ ratio: 0, autoCenter: getAutoCenter() });
      };

      const onBackdrop = (e) => {
        if (e.target === backdrop) finish({ ratio: 0, autoCenter: getAutoCenter() });
      };

      confirmBtn?.addEventListener('click', onConfirm);
      customBtn?.addEventListener('click', onCustom);
      closeBtn?.addEventListener('click', onClose);
      backdrop.addEventListener('pointerdown', onBackdrop);
    });
  }

  async function handleImportFile(file) {
    if (!file) return;
    const formatName = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    try {
      const result = await cad.importers.importFile(file, {
        extrudeController,
        sketchDocument,
        activeSketch,
        applyActiveSketch,
        renderBodyTree,
        renderSketchTree,
        redraw,
        fitToScene: (animate = true) => modelView.fitToScene(animate),
        history,
        onHighPoly: promptHighPolyImport,
      });
      updateSaveStatus(false);
      setDocumentName(currentDocumentName, false);
      if (result.openCustom && result.details?.body && meshDecimate) {
        setTimeout(() => {
          meshDecimate.open(result.details.body);
        }, 80);
      }
      const msg = `${result.format} IMPORTED · ${file.name}`;
      statusText.textContent = msg;
      viewHint.textContent = result.message;
      setTimeout(() => { if (statusText.textContent === msg) statusText.textContent = modeStatus(); }, 4000);
    } catch (err) {
      showError({
        code: 'CAD-I001',
        title: `${formatName} Import Failed`,
        reason: err?.message || `Could not import ${file.name}`,
      });
    }
  }

  if (projectFileInput) {
    projectFileInput.addEventListener('change', () => {
      const file = projectFileInput.files?.[0];
      if (file) {
        handleOpenProjectFile(file);
        projectFileInput.value = '';
      }
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener('change', () => {
      const file = importFileInput.files?.[0];
      if (file) {
        handleImportFile(file);
        importFileInput.value = '';
      }
    });
  }

  // Drag and drop file support
  window.addEventListener('dragover', event => {
    event.preventDefault();
  });
  window.addEventListener('drop', event => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ocad')) {
      handleOpenProjectFile(file);
    } else if (lower.endsWith('.stl') || lower.endsWith('.step') || lower.endsWith('.stp') || lower.endsWith('.obj') || lower.endsWith('.dxf')) {
      handleImportFile(file);
    }
  });

  // Menus: FILE, EXPORT, IMPORT dropdowns
  const fileMenuButton = document.querySelector('#fileMenuButton');
  const fileDropdown = document.querySelector('#fileDropdown');
  const exportMenuButton = document.querySelector('#exportMenuButton');
  const exportDropdown = document.querySelector('#exportDropdown');
  const importMenuButton = document.querySelector('#importMenuButton');
  const importDropdown = document.querySelector('#importDropdown');

  function bindTabMenu(button, dropdown, containerId) {
    if (!button || !dropdown) return null;
    const toggle = (open) => {
      const willOpen = typeof open === 'boolean' ? open : dropdown.hidden;
      dropdown.hidden = !willOpen;
      button.setAttribute('aria-expanded', String(willOpen));
    };

    button.addEventListener('click', event => {
      event.stopPropagation();
      if (dropdown.hidden) {
        [fileDropdown, exportDropdown, importDropdown].forEach(d => {
          if (d && d !== dropdown && !d.hidden) {
            d.hidden = true;
            const btn = d.parentElement?.querySelector('.tab-menu-button');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
      }
      toggle();
    });

    document.addEventListener('pointerdown', event => {
      if (!dropdown.hidden && !event.target.closest(`#${containerId}`)) {
        toggle(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !dropdown.hidden) {
        toggle(false);
      }
    });
    return toggle;
  }

  const toggleFileMenu = bindTabMenu(fileMenuButton, fileDropdown, 'fileMenuContainer');
  const toggleExportMenu = bindTabMenu(exportMenuButton, exportDropdown, 'exportMenuContainer');
  const toggleImportMenu = bindTabMenu(importMenuButton, importDropdown, 'importMenuContainer');

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (saveModalBackdrop && !saveModalBackdrop.hidden) closeSaveDialog();
      if (newDesignModalBackdrop && !newDesignModalBackdrop.hidden) newDesignModalBackdrop.hidden = true;
    }
  });

  Object.assign(cad.app, {
    saveProject: handleSaveProject,
    openProjectFile: handleOpenProjectFile,
    newDesign: handleNewDesign,
    exportSTL: handleExportSTL,
    exportMesh: handleExportMesh,
    exportDXF: handleExportDXF,
    importFile: handleImportFile,
    setDocumentName,
    getDocumentName: () => currentDocumentName,
  });

  document.querySelector('#newDesignBtn')?.addEventListener('click', () => {
    toggleFileMenu?.(false);
    handleNewDesign();
  });
  document.querySelector('#openProjectBtn')?.addEventListener('click', () => {
    toggleFileMenu?.(false);
    projectFileInput?.click();
  });
  document.querySelector('#openBrowserDraftBtn')?.addEventListener('click', () => {
    toggleFileMenu?.(false);
    const open = () => openStoredProject(cad.projectStore?.SAVED_KEY, { saved: true });
    if (isDirty && workspaceHasContent() && !window.confirm('Replace the current design with the browser draft? Unsaved changes will be lost.')) return;
    open();
  });
  document.querySelector('#saveProjectBtn')?.addEventListener('click', () => {
    toggleFileMenu?.(false);
    handleSaveProject();
  });
  document.querySelector('#fileExportStlBtn')?.addEventListener('click', () => {
    toggleFileMenu?.(false);
    handleExportSTL(true);
  });
  document.querySelector('#exportStlBtn')?.addEventListener('click', () => {
    toggleExportMenu?.(false);
    handleExportSTL(true);
  });
  document.querySelector('#exportOcadBtn')?.addEventListener('click', () => {
    toggleExportMenu?.(false);
    handleSaveProject();
  });
  function flashStatus(message, hint, duration = 3500) {
    statusText.textContent = message;
    if (hint) viewHint.textContent = hint;
    setTimeout(() => { if (statusText.textContent === message) statusText.textContent = modeStatus(); }, duration);
  }

  function handleExportMesh(format) {
    const label = format.toUpperCase();
    const bodies = (extrudeController?.bodies || []).filter(b => b.visible !== false && b.mesh?.triangles?.length);
    if (!bodies.length) {
      showError({ code: 'CAD-E001', title: 'Export Notice',
        reason: `No visible 3D bodies available to export as ${label}. Create a body with EXTRUDE first.` });
      return;
    }
    try {
      const result = cad.projectIO.saveMeshToFile(format, bodies, currentDocumentName);
      flashStatus(`${label} EXPORTED · ${result.filename}`,
        `Exported ${result.filename} (${bodies.length} bodies, ${result.triangleCount.toLocaleString()} triangles)`);
    } catch (err) {
      showError({ code: 'CAD-E002', title: 'Export Failed', reason: err?.message || `Could not export ${label}.` });
    }
  }

  function handleExportDXF() {
    const sketches = activeSketch ? [activeSketch]
      : sketchDocument.sketches.filter(sketch => sketch.visible !== false);
    if (!sketches.some(sketch => sketch.entities.length)) {
      showError({ code: 'CAD-E001', title: 'Export Notice',
        reason: 'No sketch geometry to export as DXF. Draw or show a sketch first.' });
      return;
    }
    try {
      const result = cad.projectIO.saveDXFToFile(sketches, currentDocumentName);
      flashStatus(`DXF EXPORTED · ${result.filename}`,
        `Exported ${result.entityCount} entities from ${sketches.length} sketch${sketches.length === 1 ? '' : 'es'}`);
    } catch (err) {
      showError({ code: 'CAD-E002', title: 'Export Failed', reason: err?.message || 'Could not export DXF.' });
    }
  }

  document.querySelector('#export3mfBtn')?.addEventListener('click', () => {
    toggleExportMenu?.(false);
    handleExportMesh('3mf');
  });
  document.querySelector('#exportObjBtn')?.addEventListener('click', () => {
    toggleExportMenu?.(false);
    handleExportMesh('obj');
  });
  document.querySelector('#exportDxfBtn')?.addEventListener('click', () => {
    toggleExportMenu?.(false);
    handleExportDXF();
  });

  if (importDropdown) {
    importDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const importType = item.dataset.import?.toLowerCase();
        toggleImportMenu?.(false);
        if (!importFileInput) return;
        if (importType === 'stl') {
          importFileInput.accept = '.stl';
        } else if (importType === 'step') {
          importFileInput.accept = '.step,.stp';
        } else if (importType === 'obj') {
          importFileInput.accept = '.obj';
        } else if (importType === 'dxf') {
          importFileInput.accept = '.dxf';
        } else {
          importFileInput.accept = '.stl,.step,.stp,.obj,.dxf';
        }
        importFileInput.click();
      });
    });
  }

  // Extrude is available after finishing a sketch.
  if (extrudeBtn) {
    extrudeBtn.addEventListener('click', () => {
      if (activeSketch) return;
      solidRevolve?.close();
      solidBevel.close();
      solidHole.close();
      bodyMove.close();
      solidPattern.close();
      meshDecimate?.close();
      meshToSolid?.close();
      surfaceFinish?.close();
      interference?.close();
      zebraAnalysis?.close();
      if (modelView.picking) setPicking(false);
      if (faceSelection.selected) {
        const face = faceSelection.selected;
        faceSelection.clear();
        extrudeController.openFace(face);
        return;
      }
      if (extrudeController.active) extrudeController.close();
      else if (!extrudeController.open()) statusText.textContent = 'EXTRUDE · Select a planar body face or finish a sketch first';
    });
  }

  if (revolveBtn) {
    revolveBtn.addEventListener('click', () => {
      if (activeSketch) return;
      if (modelView.picking) setPicking(false);
      extrudeController?.close();
      solidBevel?.close();
      solidHole?.close();
      bodyMove?.close();
      solidPattern?.close();
      meshDecimate?.close();
      meshToSolid?.close();
      surfaceFinish?.close();
      interference?.close();
      zebraAnalysis?.close();
      if (solidRevolve.active) {
        solidRevolve.close();
      } else {
        const pre = profileSelection?.selectedProfile || null;
        solidRevolve.open(pre);
      }
    });
  }

  for (const [button, mode] of [[solidFilletBtn, 'fillet'], [solidChamferBtn, 'chamfer']]) {
    button.addEventListener('click', () => {
      if (activeSketch) return;
      if (modelView.picking) setPicking(false);
      extrudeController.close();
      solidRevolve?.close();
      solidHole.close();
      bodyMove.close();
      solidPattern.close();
      meshDecimate?.close();
      meshToSolid?.close();
      surfaceFinish?.close();
      interference?.close();
      zebraAnalysis?.close();
      solidBevel.open(mode);
    });
  }

  bodyMoveBtn.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    solidPattern.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    bodyMove.open(targetBody);
  });

  // Hole button
  if (holeBtn) {
    holeBtn.addEventListener('click', () => {
      if (activeSketch) return;
      if (modelView.picking) setPicking(false);
      extrudeController.close();
      solidRevolve?.close();
      solidBevel.close();
      bodyMove.close();
      solidPattern.close();
      meshDecimate?.close();
      meshToSolid?.close();
      surfaceFinish?.close();
      interference?.close();
      zebraAnalysis?.close();
      const targetFace = faceSelection?.selected || null;
      faceSelection?.clear();
      solidHole.open(targetFace);
    });
  }

  // 3D Solid Pattern menu and buttons
  if (solidPatternMenuContainer && solidPatternMenuButton) {
    solidPatternMenu = new cad.ToolbarMenu({
      container: solidPatternMenuContainer,
      trigger: solidPatternMenuButton,
      menu: document.querySelector('#solidPatternDropdown'),
    });
  }

  document.querySelector('#solidRectPatternBtn')?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    solidPattern.open('rectangular', targetBody);
  });

  document.querySelector('#solidCircPatternBtn')?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    solidPattern.open('circular', targetBody);
  });

  meshDecimateBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    solidPattern.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    meshDecimate.open(targetBody);
  });

  meshToSolidBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    solidPattern.close();
    meshDecimate?.close();
    surfaceFinish?.close();
    interference?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    meshToSolid.open(targetBody);
  });

  surfaceFinishBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    solidPattern.close();
    meshDecimate?.close();
    meshToSolid?.close();
    interference?.close();
    zebraAnalysis?.close();
    faceSelection?.clear();
    surfaceFinish.open(null);
  });

  interferenceBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    solidPattern.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    zebraAnalysis?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    interference.open(targetBody);
  });

  inspectInterferenceBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    document.querySelector('#inspectDropdown')?.setAttribute('hidden', '');
    interferenceBtn?.click();
  });

  zebraAnalysisBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    if (modelView.picking) setPicking(false);
    extrudeController.close();
    solidRevolve?.close();
    solidBevel.close();
    solidHole.close();
    bodyMove.close();
    solidPattern.close();
    meshDecimate?.close();
    meshToSolid?.close();
    surfaceFinish?.close();
    interference?.close();
    const targetBody = faceSelection?.selectedBody || faceSelection?.selected?.body || null;
    faceSelection?.clear();
    zebraAnalysis.open(targetBody);
  });

  inspectZebraBtn?.addEventListener('click', () => {
    if (activeSketch) return;
    document.querySelector('#inspectDropdown')?.setAttribute('hidden', '');
    zebraAnalysisBtn?.click();
  });

  utilitiesShowMeshBtn?.addEventListener('click', () => {
    showMeshOption?.click();
  });

  ribbonTabSolid?.addEventListener('click', () => {
    if (activeSketch) return;
    setRibbonWorkspace('solid');
  });

  ribbonTabMesh?.addEventListener('click', () => {
    if (activeSketch) return;
    setRibbonWorkspace('mesh');
  });

  ribbonTabUtilities?.addEventListener('click', () => {
    if (activeSketch) return;
    setRibbonWorkspace('utilities');
  });

  const updateWorkspaceSwitchUI = (workspace) => {
    const isSolid = workspace === 'solid';
    const isMesh = workspace === 'mesh';
    const isUtilities = workspace === 'utilities';
    switchItemSolid?.classList.toggle('selected', isSolid);
    switchItemMesh?.classList.toggle('selected', isMesh);
    switchItemUtilities?.classList.toggle('selected', isUtilities);
    if (switchCheckSolid) switchCheckSolid.style.opacity = isSolid ? '1' : '0';
    if (switchCheckMesh) switchCheckMesh.style.opacity = isMesh ? '1' : '0';
    if (switchCheckUtilities) switchCheckUtilities.style.opacity = isUtilities ? '1' : '0';
  };

  workspaceSwitch?.addEventListener('click', event => {
    event.stopPropagation();
    if (activeSketch) return;
    const willOpen = workspaceSwitchDropdown?.hidden;
    if (workspaceSwitchDropdown) workspaceSwitchDropdown.hidden = !willOpen;
    workspaceSwitch?.setAttribute('aria-expanded', String(willOpen));
  });

  switchItemSolid?.addEventListener('click', () => {
    if (workspaceSwitchDropdown) workspaceSwitchDropdown.hidden = true;
    workspaceSwitch?.setAttribute('aria-expanded', 'false');
    setRibbonWorkspace('solid');
  });

  switchItemMesh?.addEventListener('click', () => {
    if (workspaceSwitchDropdown) workspaceSwitchDropdown.hidden = true;
    workspaceSwitch?.setAttribute('aria-expanded', 'false');
    setRibbonWorkspace('mesh');
  });

  switchItemUtilities?.addEventListener('click', () => {
    if (workspaceSwitchDropdown) workspaceSwitchDropdown.hidden = true;
    workspaceSwitch?.setAttribute('aria-expanded', 'false');
    setRibbonWorkspace('utilities');
  });

  document.addEventListener('pointerdown', event => {
    if (workspaceSwitchDropdown && !workspaceSwitchDropdown.hidden && !workspaceSwitchContainer?.contains(event.target)) {
      workspaceSwitchDropdown.hidden = true;
      workspaceSwitch?.setAttribute('aria-expanded', 'false');
    }
  });

  meshMoveBtn?.addEventListener('click', () => {
    bodyMoveBtn?.click();
  });

  meshShowMeshBtn?.addEventListener('click', () => {
    showMeshOption?.click();
  });

  // Project Root Node (Untitled Design) collapse/expand toggle
  const projectTreeRow = document.querySelector('#projectTreeRow');
  const projectChevron = document.querySelector('#projectChevron');
  const rootChildren = document.querySelector('#rootChildren');

  if (projectTreeRow && rootChildren) {
    projectTreeRow.addEventListener('click', () => {
      const willExpand = rootChildren.hidden;
      rootChildren.hidden = !willExpand;
      if (projectChevron) {
        projectChevron.textContent = willExpand ? '⌄' : '›';
      }
    });
  }

  const sketchesFolderRow = document.querySelector('#sketchesFolderRow');
  const sketchesChevron = document.querySelector('#sketchesChevron');
  const sketchesEyeBtn = document.querySelector('#sketchesEyeBtn');
  const bodiesEyeBtn = document.querySelector('#bodiesEyeBtn');

  if (sketchesEyeBtn) {
    sketchesEyeBtn.addEventListener('click', event => {
      event.stopPropagation();
      const anyVisible = sketchDocument.sketches.some(s => s.visible !== false);
      setAllSketchesVisibility(!anyVisible, true);
    });
  }

  if (bodiesEyeBtn) {
    bodiesEyeBtn.addEventListener('click', event => {
      event.stopPropagation();
      const bodies = extrudeController?.bodies || [];
      const anyVisible = bodies.some(b => b.visible !== false);
      setAllBodiesVisibility(!anyVisible, true);
    });
  }

  sketchesFolderRow.addEventListener('click', event => {
    if (event.target.closest('#sketchesEyeBtn')) return;
    sketchRows.hidden = !sketchRows.hidden;
    sketchesChevron.textContent = sketchRows.hidden ? '›' : '⌄';
  });
  bodiesFolderRow.addEventListener('click', event => {
    if (event.target.closest('#bodiesEyeBtn')) return;
    bodiesExpanded = !bodiesExpanded;
    bodyRows.hidden = !bodiesExpanded;
    bodiesChevron.textContent = bodiesExpanded ? '⌄' : '›';
  });

  // Origin Tree and Visibility controls
  const originTreeRow = document.querySelector('#originTreeRow');
  const originChevron = document.querySelector('#originChevron');
  const originEyeBtn = document.querySelector('#originEyeBtn');

  if (originTreeRow && originChildren) {
    originTreeRow.addEventListener('click', event => {
      if (event.target.closest('#originEyeBtn')) {
        event.stopPropagation();
        setMasterOriginVisibility(!modelView.visibility.origin, true);
        return;
      }

      const willExpand = originChildren.hidden;
      originChildren.hidden = !willExpand;
      originChevron.textContent = willExpand ? '⌄' : '›';
    });

    originChildren.querySelectorAll('.origin-item-row').forEach(row => {
      const itemKey = row.dataset.originItem;
      const eyeBtn = row.querySelector('.tree-eye');

      if (eyeBtn) {
        eyeBtn.addEventListener('click', event => {
          event.stopPropagation();
          setOriginItemVisibility(itemKey, !modelView.visibility[itemKey], true);
        });
      }

      row.addEventListener('click', () => {
        if (['XY', 'XZ', 'YZ'].includes(itemKey)) {
          if (modelView.picking && modelView.visibility[itemKey]) {
            startSketch(itemKey);
          } else if (modelView.visibility[itemKey] && !activeSketch) {
            modelView.setGridPlane(itemKey);
          }
        }
      });
    });
  }

  // Keyboard shortcuts: CTRL+Z (Undo) and CTRL+Y / CTRL+SHIFT+Z (Redo)
  // Global Keyboard shortcuts: CTRL+Z (Undo), CTRL+Y / CTRL+SHIFT+Z (Redo), 'F' (Fillet), etc.
  window.addEventListener('keydown', event => {
    const activeEl = document.activeElement;
    const isTextInput = (event.target && event.target.tagName === 'INPUT') ||
      (event.target && event.target.tagName === 'TEXTAREA') ||
      (event.target && event.target.tagName === 'SELECT') ||
      Boolean(event.target && event.target.isContentEditable) ||
      (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) ||
      Boolean(event.target?.closest?.('#toolSearchPopup, .tool-search-popup, #dimensionHud, .dimension-hud'));
    const settingsModal = document.querySelector('#settingsPanel');
    if (settingsModal && !settingsModal.hidden) return;

    const isCtrl = event.ctrlKey || event.metaKey;
    const isKeyZ = (event.key && event.key.toLowerCase() === 'z') || event.code === 'KeyZ' || event.keyCode === 90;
    const isKeyY = (event.key && event.key.toLowerCase() === 'y') || event.code === 'KeyY' || event.keyCode === 89;

    if (isCtrl && isKeyZ && !event.shiftKey) {
      if (!isTextInput) {
        event.preventDefault();
        event.stopPropagation();
        history.undo();
        statusText.textContent = 'UNDO';
        setTimeout(() => { if (statusText.textContent === 'UNDO') statusText.textContent = modeStatus(); }, 1500);
        return;
      }
    }
    if (isCtrl && (isKeyY || (event.shiftKey && isKeyZ))) {
      if (!isTextInput) {
        event.preventDefault();
        event.stopPropagation();
        history.redo();
        statusText.textContent = 'REDO';
        setTimeout(() => { if (statusText.textContent === 'REDO') statusText.textContent = modeStatus(); }, 1500);
        return;
      }
    }

    const isKeyS = (event.key && event.key.toLowerCase() === 's') || event.code === 'KeyS' || event.keyCode === 83;
    const isKeyO = (event.key && event.key.toLowerCase() === 'o') || event.code === 'KeyO' || event.keyCode === 79;
    const isKeyN = (event.key && event.key.toLowerCase() === 'n') || event.code === 'KeyN' || event.keyCode === 78;

    if (isCtrl && isKeyS && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      handleSaveProject();
      return;
    }
    if (isCtrl && isKeyO && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      projectFileInput?.click();
      return;
    }
    if (isCtrl && event.altKey && isKeyN) {
      event.preventDefault();
      handleNewDesign();
      return;
    }

    // Do not trigger any single-key shortcuts if the user is typing in any input field
    if (isTextInput && !isCtrl) {
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      modelView.fitToScene(true);
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !isCtrl && !activeSketch &&
        faceSelection?.selectedBody && !anySolidToolActive()) {
      event.preventDefault();
      deleteBody(faceSelection.selectedBody);
      return;
    }

    if (!isCtrl && !event.altKey && cad.shortcuts.toolFor(event.key) === 'extrude') {
      event.preventDefault();
      if (activeSketch) closeSketch();
      extrudeBtn.click();
      return;
    }

    // 'F' shortcut for 3D Fillet in solid mode
    if (!isCtrl && !event.altKey && !activeSketch && (event.key === 'f' || event.key === 'F' || event.code === 'KeyF')) {
      if (!isTextInput) {
        event.preventDefault();
        solidFilletBtn?.click();
        return;
      }
    }

    // 'M' shortcut for 3D Move/Rotate
    if (!isCtrl && !event.altKey && !activeSketch && (event.key === 'm' || event.key === 'M' || event.code === 'KeyM')) {
      if (!isTextInput) {
        event.preventDefault();
        bodyMoveBtn?.click();
        return;
      }
    }

    if (!isCtrl && !event.altKey && !activeSketch) {
      const tool = cad.shortcuts.toolFor(event.key);
      if (['line', 'rectangle', 'circle'].includes(tool)) {
        event.preventDefault();
        pendingSketchTool = tool;
        if (faceSelection?.selected) {
          const face = faceSelection.selected;
          faceSelection.clear();
          startSketch(face);
          return;
        }
        if (!modelView.picking) {
          setPicking(true);
        } else {
          const toolLabel = tool === 'line' ? 'Line' : tool === 'rectangle' ? 'Rectangle' : 'Circle';
          viewHint.textContent = `Select a plane or body face to start ${toolLabel} (Esc to cancel)`;
        }
        return;
      }
    }

    if (!isCtrl && !event.altKey && !activeSketch && (event.key === 'h' || event.key === 'H')) {
      if (!isTextInput) {
        event.preventDefault();
        holeBtn?.click();
        return;
      }
    }

    if (event.key === 'Escape') {
      if (zebraAnalysis?.active) {
        event.preventDefault();
        zebraAnalysis.close();
        return;
      }
      if (interference?.active) {
        event.preventDefault();
        interference.close();
        return;
      }
      if (meshToSolid?.active) {
        event.preventDefault();
        meshToSolid.close();
        return;
      }
      if (meshDecimate?.active) {
        event.preventDefault();
        meshDecimate.close();
        return;
      }
      if (solidPattern?.active) {
        event.preventDefault();
        solidPattern.close();
        return;
      }
      if (solidHole?.active) {
        event.preventDefault();
        solidHole.close();
        return;
      }
      if (solidBevel?.active) {
        event.preventDefault();
        solidBevel.close();
        return;
      }
      if (bodyMove?.active) {
        event.preventDefault();
        bodyMove.close();
        return;
      }
      if (extrudeController.active) {
        event.preventDefault();
        extrudeController.close();
        return;
      }
      if (faceSelection?.selected || faceSelection?.selectedBody) {
        event.preventDefault();
        faceSelection.clear();
        return;
      }
      if (modelView.picking) setPicking(false);
    }
  }, { capture: true });

  new ResizeObserver(() => requestRedraw()).observe(editor);
  new ResizeObserver(() => requestRedraw()).observe(modelCanvas);
  window.addEventListener('resize', () => requestRedraw());
  const toolSearch = cad.ToolSearchController ? new cad.ToolSearchController({ app: cad.app }) : null;
  Object.assign(cad.app, {
    camera,
    modelView,
    timeline,
    extrudeController,
    solidHole,
    solidBevel,
    bodyMove,
    solidPattern,
    meshDecimate,
    meshToSolid,
    surfaceFinish,
    interference,
    zebraAnalysis,
    faceSelection,
    sketchDocument,
    sketchTools,
    toolSearch,
    requestRedraw,
    redraw,
    renderBodyTree,
    openSaveDialog,
    handleNewDesign,
    setRibbonWorkspace,
  });
  redraw();

  // Offer to recover the last autosave when the page opens on an empty workspace.
  function showRecoveryNotice(entry) {
    const project = entry.project;
    const when = new Date(entry.savedAt).toLocaleString();
    const notice = document.createElement('section');
    notice.className = 'error-notice is-info';
    notice.setAttribute('role', 'status');
    const accent = document.createElement('div');
    accent.className = 'error-notice-accent';
    const icon = document.createElement('div');
    icon.className = 'error-notice-icon-badge';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`;
    const content = document.createElement('div');
    content.className = 'error-notice-content';
    const heading = document.createElement('div');
    heading.className = 'error-notice-header';
    const title = document.createElement('strong');
    title.className = 'error-notice-title';
    title.textContent = 'Recover unsaved work?';
    const code = document.createElement('code');
    code.className = 'error-notice-code';
    code.textContent = 'AUTOSAVE';
    heading.append(title, code);
    const text = document.createElement('p');
    text.className = 'error-notice-text';
    const sketchTotal = project.sketches?.length || 0;
    const bodyTotal = project.bodies?.length || 0;
    text.textContent = `"${project.documentName || 'Untitled Design'}" from ${when} (${sketchTotal} sketches, ${bodyTotal} bodies).`;
    const actions = document.createElement('div');
    actions.className = 'error-notice-actions';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'error-notice-action is-primary';
    restore.textContent = 'Restore';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'error-notice-action';
    discard.textContent = 'Discard';
    actions.append(restore, discard);
    content.append(heading, text, actions);
    notice.append(accent, icon, content);
    // Until the user decides, new edits must not overwrite the old autosave.
    recoveryPending = true;
    restore.addEventListener('click', async () => {
      notice.remove();
      recoveryPending = false;
      await openStoredProject(cad.projectStore.AUTOSAVE_KEY, { saved: false });
    });
    discard.addEventListener('click', () => {
      notice.remove();
      recoveryPending = false;
      scheduleAutosave(0);
      cad.projectStore.remove(cad.projectStore.AUTOSAVE_KEY).catch(() => {});
    });
    errorTray.prepend(notice);
  }

  if (cad.projectStore) {
    cad.projectStore.migrateLegacy()
      .then(() => cad.projectStore.get(cad.projectStore.AUTOSAVE_KEY))
      .then(entry => {
        if (entry?.project && cad.projectStore.hasContent(entry.project) && !workspaceHasContent()) showRecoveryNotice(entry);
      })
      .catch(() => { /* Recovery is best effort. */ });
  }
})(window.WebCAD = window.WebCAD || {});
