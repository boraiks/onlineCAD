(function () {
  'use strict';

  const card = document.createElement('div');
  card.id = 'appTooltip';
  card.className = 'app-tooltip';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;

  const header = document.createElement('div');
  header.className = 'app-tooltip-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'app-tooltip-title';

  const shortcutEl = document.createElement('span');
  shortcutEl.className = 'app-tooltip-shortcut';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'app-tooltip-summary';

  const detailsEl = document.createElement('div');
  detailsEl.className = 'app-tooltip-details';

  header.append(titleEl, shortcutEl);
  card.append(header, summaryEl, detailsEl);
  document.body.append(card);

  const toolDefinitions = {
    extrudeBtn: {
      title: 'Extrude',
      shortcut: 'E',
      summary: 'Extrudes a sketch profile or planar face into a 3D solid body along a linear direction.',
      details: 'Select closed planar profiles, specify extrusion distance, and choose Join, Cut, Intersect, or New Body.'
    },
    revolveBtn: {
      title: 'Revolve',
      shortcut: 'V',
      summary: 'Revolves a planar sketch profile around an axis of rotation to generate a rotational 3D body.',
      details: 'Select a closed profile, pick an axis of revolution, and specify the angle of rotation up to 360°.'
    },
    holeBtn: {
      title: 'Hole',
      shortcut: 'H',
      summary: 'Creates simple, counterbore, or countersink cylindrical holes on planar solid faces.',
      details: 'Click a body face to place the hole, configure hole type, diameter, and depth.'
    },
    solidFilletBtn: {
      title: 'Fillet',
      shortcut: 'F',
      summary: 'Rounds the edges of a solid body by adding material to interior edges and removing material from exterior edges.',
      details: 'Select straight or circular edges, specify the blend radius, and preview the resulting geometry.'
    },
    solidChamferBtn: {
      title: 'Chamfer',
      shortcut: '',
      summary: 'Bevels the sharp edges of a solid body by creating an angled transitional surface.',
      details: 'Select body edges, set the bevel distance, and apply the change.'
    },
    bodyMoveBtn: {
      title: 'Move / Rotate',
      shortcut: 'M',
      summary: 'Translates and rotates bodies in 3D coordinate space using interactive gizmo handles.',
      details: 'Drag translation arrows or rotation rings, or enter exact millimeter and degree values.'
    },
    meshMoveBtn: {
      title: 'Move / Rotate Mesh',
      shortcut: 'M',
      summary: 'Positions an imported mesh body in 3D space with coordinate translation and rotation controls.',
      details: 'Align imported scans or mesh components with origin axes and reference bodies.'
    },
    solidPatternMenuButton: {
      title: 'Pattern',
      shortcut: '',
      summary: 'Duplicates solid bodies in rectangular rows and columns, or circular rotational arrays.',
      details: 'Select body, configure pattern type, instance counts, and linear or angular spacing.'
    },
    meshToSolidBtn: {
      title: 'Mesh to Solid',
      shortcut: '',
      summary: 'Reconstructs an imported triangle mesh into an editable B-Rep solid CAD body.',
      details: 'Analyzes mesh topology, fits planar and cylindrical surfaces, and generates watertight solid geometry.'
    },
    meshDecimateBtn: {
      title: 'Decimate Mesh',
      shortcut: '',
      summary: 'Simplifies complex polygon meshes by reducing triangle count while preserving geometric contour.',
      details: 'Select an imported mesh and adjust the reduction percentage to keep models lightweight and responsive.'
    },
    surfaceFinishBtn: {
      title: 'Surface Finish',
      shortcut: '',
      summary: 'Refines CAD mesh surface aesthetics by smoothing triangulation faceting while retaining sharp creases.',
      details: 'Select a mesh body, adjust feature crease angle threshold, and apply smooth vertex normals.'
    },
    zebraAnalysisBtn: {
      title: 'Zebra Analysis',
      shortcut: '',
      summary: 'Projects reflective zebra stripes onto surface bodies to diagnose curvature continuity and surface quality.',
      details: 'Highlight surface tangents, curvatures, and smooth G1/G2 transitions across adjacent faces.'
    },
    interferenceBtn: {
      title: 'Interference Detection',
      shortcut: '',
      summary: 'Analyzes solid bodies for spatial collisions, contact intersections, and volume penetrations.',
      details: 'Displays intersecting contact volumes in vibrant red highlights.'
    },
    showMeshBtn: {
      title: 'Show Mesh Wireframe',
      shortcut: '',
      summary: 'Toggles visibility of underlying triangle mesh wireframe on solid bodies.',
      details: 'Inspect CAD polygon tessellation and mesh subdivision structure.'
    },
    meshShowMeshBtn: {
      title: 'Show Mesh Wireframe',
      shortcut: '',
      summary: 'Toggles visibility of underlying triangle mesh wireframe on mesh bodies.',
      details: 'Inspect polygon density and triangle arrangement across the active mesh.'
    },
    utilitiesShowMeshBtn: {
      title: 'Show Mesh Wireframe',
      shortcut: '',
      summary: 'Toggles visibility of underlying triangle mesh wireframe on bodies.',
      details: 'Inspect CAD polygon tessellation and mesh subdivision structure.'
    },
    openSketch: {
      title: 'Create Sketch',
      shortcut: '',
      summary: 'Creates a new 2D parametric sketch on a selected origin plane (XY, XZ, YZ) or planar solid face.',
      details: 'Select a plane to align the drawing grid and enter the 2D sketcher workspace.'
    },
    finishSketchButton: {
      title: 'Finish Sketch',
      shortcut: '',
      summary: 'Closes the active sketch and returns to 3D solid modeling mode.',
      details: 'Validates all closed profile contours for subsequent Extrude or Revolve operations.'
    },
    finishSketch: {
      title: 'Finish Sketch',
      shortcut: '',
      summary: 'Closes the active sketch and returns to 3D solid modeling mode.',
      details: 'Validates all closed profile contours for subsequent Extrude or Revolve operations.'
    },
    lineTool: {
      title: 'Line',
      shortcut: 'L',
      summary: 'Draws sequential straight line segments on the active sketch plane.',
      details: 'Click to place start and end points. Press Tab to lock coordinate dimensions.'
    },
    rectangleTool: {
      title: 'Rectangle',
      shortcut: 'R',
      summary: 'Draws a corner-to-corner rectangular closed sketch boundary.',
      details: 'Click two diagonal corner points on the grid to create a four-sided profile.'
    },
    circleTool: {
      title: 'Center Circle',
      shortcut: 'C',
      summary: 'Creates a circle defined by center point and radius.',
      details: 'Click the center point on the sketch grid, then drag or enter the radius.'
    },
    pointTool: {
      title: 'Point',
      shortcut: 'P',
      summary: 'Places isolated sketch reference points on the grid or geometry.',
      details: 'Use points for hole placement centers, dimension references, and alignment.'
    },
    constructionTool: {
      title: 'Construction',
      shortcut: 'X',
      summary: 'Toggles curves between normal solid profiles and dashed construction guides.',
      details: 'Construction geometry guides sketch constraints without creating extrudable profile boundaries.'
    },
    filletTool: {
      title: 'Sketch Fillet',
      shortcut: '',
      summary: 'Creates a smooth tangential arc at the intersection of two sketch lines.',
      details: 'Select two intersecting lines, drag the radius arrow or type a numeric radius.'
    },
    trimTool: {
      title: 'Trim',
      shortcut: 'T',
      summary: 'Trims a sketch curve to the nearest intersecting boundary.',
      details: 'Click or drag across line segments to cut them back to adjacent intersections.'
    },
    mirrorTool: {
      title: 'Mirror',
      shortcut: '',
      summary: 'Reflects selected sketch geometry across a centerline mirror axis.',
      details: 'Select curves to duplicate, then pick a construction line or coordinate axis as the mirror plane.'
    },
    distanceTool: {
      title: 'Sketch Dimension',
      shortcut: 'D',
      summary: 'Adds parametric length, distance, or diameter constraints between sketch entities.',
      details: 'Click two points or a line segment to measure and lock the exact millimeter value.'
    },
    angleTool: {
      title: 'Sketch Angle',
      shortcut: '',
      summary: 'Measures and locks the angular dimension between two intersecting sketch lines.',
      details: 'Select two lines to display and edit their angular constraint in degrees.'
    },
    coincidentTool: {
      title: 'Coincident Constraint',
      shortcut: '',
      summary: 'Constrains two points to share the exact same location, or a point to lie on a curve.',
      details: 'Click two endpoints to snap them together into a single vertex.'
    },
    tangentTool: {
      title: 'Tangent Constraint',
      shortcut: '',
      summary: 'Constrains an arc or circle to meet a line or curve smoothly with G1 tangent continuity.',
      details: 'Select a line and a circle or arc to enforce tangency.'
    },
    equalTool: {
      title: 'Equal Constraint',
      shortcut: '',
      summary: 'Forces two sketch lines to have the same length, or two circles/arcs to have the same radius.',
      details: 'Select multiple curves to lock identical sizing.'
    },
    offsetTool: {
      title: 'Offset',
      shortcut: 'O',
      summary: 'Duplicates a curve or profile offset by a constant parallel distance.',
      details: 'Select curves, enter the offset distance, and choose flip direction.'
    }
  };

  let active = null;
  let timer = null;
  let keyboardFocus = false;

  function prepare(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.hasAttribute('title')) {
      const value = element.getAttribute('title');
      if (value) {
        element.dataset.tooltipRaw = value;
      }
      element.removeAttribute('title');
    }
  }

  function prepareTree(node) {
    if (!(node instanceof Element)) return;
    if (node.matches('[title]')) prepare(node);
    node.querySelectorAll('[title]').forEach(prepare);
  }

  prepareTree(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') prepare(record.target);
      else for (const node of record.addedNodes) prepareTree(node);
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  function targetOf(element) {
    const target = element?.closest?.('button, .tool-button, [data-tooltip-raw], [data-tooltip-title], [title]');
    if (target && target.hasAttribute('title')) prepare(target);
    return target && document.body.contains(target) && !target.hidden && !target.disabled ? target : null;
  }

  function contentFor(target) {
    const def = toolDefinitions[target.id];
    if (def) {
      return {
        title: def.title,
        shortcut: def.shortcut ? `(${def.shortcut})` : '',
        summary: def.summary,
        details: def.details || ''
      };
    }

    const raw = target.dataset.tooltipRaw || target.getAttribute('aria-label') || '';
    const match = raw.match(/\s*\((Ctrl\+[^)]+|Alt\+[^)]+|Shift\+[^)]+|[A-Z])\)$/i);
    const key = match ? `(${match[1]})` : '';
    const cleaned = match ? raw.slice(0, -match[0].length).trim() : raw.trim();

    let title = target.dataset.tooltipTitle || '';
    if (!title) {
      const span = target.querySelector(':scope > span:not(.toolbar-menu-chevron):not(.tool-icon)');
      title = span?.textContent?.trim() || cleaned || 'CAD Tool';
    }

    const summary = target.dataset.tooltipSummary || cleaned || title;
    const details = target.dataset.tooltipDetails || '';

    return { title, shortcut: key, summary, details };
  }

  function position(target) {
    const anchor = target.getBoundingClientRect();
    const width = card.offsetWidth, height = card.offsetHeight;
    const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - width / 2, innerWidth - width - 12));
    let top = anchor.bottom + 8;
    if (top + height > innerHeight - 12) {
      top = anchor.top - height - 8;
    }
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(12, top)}px`;
  }

  function hide() {
    clearTimeout(timer);
    timer = null;
    if (active) active.removeAttribute('aria-describedby');
    active = null;
    card.hidden = true;
  }

  function show(target) {
    if (!target.isConnected || target.disabled || target.closest('[hidden]')) return;
    const { title, shortcut, summary, details } = contentFor(target);
    if (!title && !summary) return;

    titleEl.textContent = title;
    shortcutEl.textContent = shortcut;
    shortcutEl.hidden = !shortcut;

    summaryEl.textContent = summary;
    detailsEl.textContent = details;
    detailsEl.hidden = !details;

    active = target;
    active.setAttribute('aria-describedby', card.id);
    card.hidden = false;
    position(target);
  }

  function schedule(target, delay) {
    if (target === active || !target || target.disabled) return;
    hide();
    timer = setTimeout(() => show(target), delay);
  }

  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      const target = targetOf(event.target);
      if (target) schedule(target, 380);
    }
  });

  document.addEventListener('pointerout', event => {
    const target = targetOf(event.target);
    if (target && !target.contains(event.relatedTarget)) {
      hide();
    }
  });

  document.addEventListener('focusin', event => {
    if (keyboardFocus) {
      const target = targetOf(event.target);
      if (target) schedule(target, 120);
    }
  });

  document.addEventListener('focusout', event => {
    if (targetOf(event.target) === active) hide();
    else clearTimeout(timer);
  });

  document.addEventListener('pointerdown', () => {
    keyboardFocus = false;
    hide();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') keyboardFocus = true;
    if (event.key === 'Escape') hide();
  });

  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
})();
