(function (cad) {
  'use strict';

  const ICONS = {
    sketch: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,3 20,7.5 11,12 2,7.5" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.7"/><path d="M4,13.5l7,3.5 5-2.5" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="2 2"/><circle cx="17.5" cy="17.5" r="4.5" fill="#16a34a" stroke="#ffffff" stroke-width="1.2"/><path d="M17.5,15.5v4M15.5,17.5h4" stroke="#ffffff" stroke-width="1.7"/></svg>`,
    extrude: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="9,5 15,8.5 9,12 3,8.5" fill="#bae6fd" stroke="#1674ab" stroke-width="1.6"/><polygon points="3,8.5 9,12 9,20 3,16.5" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/><polygon points="9,12 15,8.5 15,16.5 9,20" fill="#7dd3fc" stroke="#2b4252" stroke-width="1.5"/><path d="M19,17V5M16,8l3-3 3,3" stroke="#1674ab" stroke-width="2"/></svg>`,
    revolve: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="5.5" y1="3" x2="5.5" y2="21" stroke="#d97706" stroke-width="1.7" stroke-dasharray="2.5 2.5"/><rect x="9" y="6" width="5" height="10" rx="0.8" fill="#bae6fd" stroke="#2b4252" stroke-width="1.5"/><path d="M16.5,7.5A6.5,4.2 0 1 1 8,18.5" stroke="#1674ab" stroke-width="1.9"/><polyline points="11,17 7.5,18.5 9.5,21.5" stroke="#1674ab" stroke-width="1.8"/></svg>`,
    hole: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4,9h16v10H4z" fill="#e2e8f0" stroke="#2b4252" stroke-width="1.6"/><rect x="8.5" y="9" width="7" height="10" fill="#ffffff" stroke="#1674ab" stroke-width="1.6"/><path d="M12,2.5v5M9.5,5.5L12,8l2.5-2.5" stroke="#1674ab" stroke-width="1.8"/></svg>`,
    fillet: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5,4H12M5,4V11" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="2 2"/><path d="M5,20V11A7,7 0 0 1 12,4H20V20H5Z" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.6"/><path d="M5,11A7,7 0 0 1 12,4" stroke="#1674ab" stroke-width="2.4"/></svg>`,
    chamfer: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5,4H12M5,4V11" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="2 2"/><path d="M5,20V11L12,4H20V20H5Z" fill="#fef3c7" stroke="#2b4252" stroke-width="1.6"/><line x1="5" y1="11" x2="12" y2="4" stroke="#d97706" stroke-width="2.4"/></svg>`,
    move: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12,3V21M3,12H21" stroke="#2b4252" stroke-width="1.6"/><polyline points="10,5 12,3 14,5" stroke="#2b4252" stroke-width="1.6"/><polyline points="10,19 12,21 14,19" stroke="#2b4252" stroke-width="1.6"/><polyline points="5,10 3,12 5,14" stroke="#2b4252" stroke-width="1.6"/><polyline points="19,10 21,12 19,14" stroke="#2b4252" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="#1674ab"/></svg>`,
    pattern: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" fill="#1674ab" stroke="#1674ab" stroke-width="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/></svg>`,
    circPattern: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="1.8" fill="#d97706"/><circle cx="12" cy="4.5" r="2.3" fill="#1674ab"/><circle cx="19.5" cy="12" r="2.3" fill="#bae6fd" stroke="#1674ab" stroke-width="1.4"/><circle cx="12" cy="19.5" r="2.3" fill="#bae6fd" stroke="#1674ab" stroke-width="1.4"/><circle cx="4.5" cy="12" r="2.3" fill="#bae6fd" stroke="#1674ab" stroke-width="1.4"/></svg>`,
    line: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5" stroke="#2b4252" stroke-width="2"/><circle cx="5" cy="19" r="2.2" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.7"/><circle cx="19" cy="5" r="2.2" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.7"/></svg>`,
    rect: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="6" width="15" height="12" rx="1" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.8"/><circle cx="4.5" cy="6" r="2" fill="#ffffff" stroke="#1674ab" stroke-width="1.6"/><circle cx="19.5" cy="18" r="2" fill="#ffffff" stroke="#1674ab" stroke-width="1.6"/></svg>`,
    circle: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.8"/><circle cx="12" cy="12" r="1.9" fill="#1674ab"/><line x1="12" y1="12" x2="18.8" y2="8" stroke="#1674ab" stroke-width="1.4" stroke-dasharray="2 1.8"/></svg>`,
    point: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12,5V8.5M12,15.5V19M5,12H8.5M15.5,12H19" stroke="#2b4252" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="#1674ab"/></svg>`,
    trim: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="18" x2="11" y2="18" stroke="#2b4252" stroke-width="1.7"/><line x1="12" y1="18" x2="20.5" y2="18" stroke="#dc2626" stroke-width="1.7" stroke-dasharray="2.2 2"/><circle cx="7" cy="6.5" r="2.3" stroke="#dc2626" stroke-width="1.6"/><circle cx="7" cy="13.5" r="2.3" stroke="#dc2626" stroke-width="1.6"/><path d="M9,7.8L18.5,13.5M9,12.2L18.5,6.5" stroke="#2b4252" stroke-width="1.7"/></svg>`,
    offset: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5,19V8A3,3 0 0 1 8,5H19" stroke="#2b4252" stroke-width="1.8"/><path d="M10.5,19V11.5A1,1 0 0 1 11.5,10.5H19" stroke="#1674ab" stroke-width="1.8"/></svg>`,
    mirror: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3.5" x2="12" y2="20.5" stroke="#d97706" stroke-width="1.6" stroke-dasharray="2.5 2"/><polygon points="4,7 9.5,12 4,17" fill="#1674ab" stroke="#1674ab" stroke-width="1.5"/><polygon points="20,7 14.5,12 20,17" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/></svg>`,
    dimension: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4.5" y1="4.5" x2="4.5" y2="19.5" stroke="#2b4252" stroke-width="1.7"/><line x1="19.5" y1="4.5" x2="19.5" y2="19.5" stroke="#2b4252" stroke-width="1.7"/><line x1="5.5" y1="12" x2="18.5" y2="12" stroke="#dc2626" stroke-width="1.8"/><polyline points="8.5,9.5 5.5,12 8.5,14.5" stroke="#dc2626" stroke-width="1.8"/><polyline points="15.5,9.5 18.5,12 15.5,14.5" stroke="#dc2626" stroke-width="1.8"/></svg>`,
    angle: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20,19H4.5L17,6.5" stroke="#2b4252" stroke-width="1.8"/><path d="M12.5,19A8,8 0 0 0 10.2,13.3" stroke="#dc2626" stroke-width="2"/></svg>`,
    midpoint: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="16" x2="20.5" y2="16" stroke="#2b4252" stroke-width="1.8"/><polygon points="12,7 16.5,15.5 7.5,15.5" fill="#fee2e2" stroke="#dc2626" stroke-width="1.7"/></svg>`,
    axis: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12" stroke="#1674ab" stroke-width="1.8"/><line x1="12" y1="4" x2="12" y2="20" stroke="#1674ab" stroke-width="1.8"/><line x1="4" y1="9.5" x2="4" y2="14.5" stroke="#2b4252" stroke-width="1.4"/><line x1="20" y1="9.5" x2="20" y2="14.5" stroke="#2b4252" stroke-width="1.4"/></svg>`,
    tangent: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="13.5" r="5.5" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.8"/><line x1="4" y1="8" x2="20" y2="8" stroke="#1674ab" stroke-width="1.9"/><circle cx="13.5" cy="8" r="1.7" fill="#1674ab"/></svg>`,
    coincident: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="19" x2="12" y2="12" stroke="#2b4252" stroke-width="1.8"/><line x1="20" y1="19" x2="12" y2="12" stroke="#2b4252" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="#1674ab"/></svg>`,
    equal: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="9" x2="19" y2="9" stroke="#1674ab" stroke-width="2.4"/><line x1="5" y1="15" x2="19" y2="15" stroke="#1674ab" stroke-width="2.4"/></svg>`,
    fix: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8,10.5V7.5A4,4 0 0 1 16,7.5V10.5" stroke="#2b4252" stroke-width="1.8"/><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.7"/></svg>`,
    construction: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="4.5" y1="19.5" x2="19.5" y2="4.5" stroke="#d97706" stroke-width="2" stroke-dasharray="3 2.5"/><circle cx="4.5" cy="19.5" r="1.8" fill="#d97706"/><circle cx="19.5" cy="4.5" r="1.8" fill="#d97706"/></svg>`,
    finish: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" fill="#16a34a"/><polyline points="8,12.5 11,15.5 16.5,9" stroke="#ffffff" stroke-width="2.2"/></svg>`,
    inspect: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="11" height="11" rx="1.5" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.6"/><rect x="9.5" y="9.5" width="11" height="11" rx="1.5" fill="#f1f5f9" stroke="#2b4252" stroke-width="1.6"/><rect x="9.5" y="9.5" width="5" height="5" fill="#dc2626"/></svg>`,
    zebra: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="#ffffff" stroke="#2b4252" stroke-width="1.6"/><path d="M4.5,11C8.5,8 15.5,8 19.5,11" stroke="#1e293b" stroke-width="2.2"/><path d="M4.5,15.5C8.5,12.5 15.5,12.5 19.5,15.5" stroke="#1674ab" stroke-width="2.2"/></svg>`,
    mesh: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill="#fef3c7" stroke="#d97706" stroke-width="1.6"/><path d="M4,7.5L12,12L20,7.5M12,12V21M4,16.5L12,12L20,16.5" stroke="#d97706" stroke-width="1.3"/></svg>`,
    meshToSolid: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,3 20,7.5 12,12 4,7.5" fill="#e0f2fe" stroke="#2b4252" stroke-width="1.5"/><polygon points="4,7.5 12,12 12,21 4,16.5" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/><polygon points="12,12 20,7.5 20,16.5 12,21" fill="#7dd3fc" stroke="#1674ab" stroke-width="1.6"/></svg>`,
    meshFill: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5" fill="#ffffff" stroke="#2b4252" stroke-width="1.7"/><rect x="7.5" y="7.5" width="9" height="9" rx="1" fill="#1674ab"/></svg>`,
    decimate: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="2.5,18 6.5,6 10.5,18" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/><path d="M4.5,12H8.5L6.5,18Z" stroke="#d97706" stroke-width="1.1"/><path d="M11.2,12H14.4M13.2,10.2L15,12L13.2,13.8" stroke="#1674ab" stroke-width="1.6"/><polygon points="15.5,18 18.5,6 21.5,18" fill="#e0f2fe" stroke="#1674ab" stroke-width="1.5"/></svg>`,
    surfaceFinish: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12,13C14.5,7 18.5,7.5 20.5,15V19H12Z" fill="#bae6fd"/><polyline points="3.5,15 7.5,8.5 12,13" stroke="#d97706" stroke-width="1.8"/><path d="M12,13C14.5,7 18.5,7.5 20.5,15" stroke="#1674ab" stroke-width="2"/><line x1="3.5" y1="19" x2="20.5" y2="19" stroke="#2b4252" stroke-width="1.4"/></svg>`,
    viewFit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/><circle cx="12" cy="12" r="3" fill="#1674ab"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
    redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`,
    save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
  };

  function getToolsCatalog() {
    return [
      // Solid Create
      {
        id: 'create-sketch',
        name: 'Create Sketch',
        category: 'Solid · Create',
        keywords: ['sketch', 'create', 'plane', 'draw', '2d', 'cizim', 'sket'],
        shortcut: () => '',
        icon: ICONS.sketch,
        execute: (app) => {
          if (app.faceSelection?.selected) {
            app.startSketch(app.faceSelection.selected);
          } else {
            document.querySelector('#openSketch')?.click();
          }
        }
      },
      {
        id: 'extrude',
        name: 'Extrude',
        category: 'Solid · Create',
        keywords: ['extrude', 'pad', 'pull', '3d', 'boss', 'cut', 'join', 'ext'],
        shortcut: () => cad.shortcuts?.bindings?.extrude || 'E',
        icon: ICONS.extrude,
        execute: () => document.querySelector('#extrudeBtn')?.click()
      },
      {
        id: 'revolve',
        name: 'Revolve',
        category: 'Solid · Create',
        keywords: ['revolve', 'turn', 'spin', 'rotate', 'lathe', 'axis', 'rev'],
        shortcut: () => 'V',
        icon: ICONS.revolve,
        execute: () => document.querySelector('#revolveBtn')?.click()
      },
      {
        id: 'hole',
        name: 'Hole',
        category: 'Solid · Create',
        keywords: ['hole', 'drill', 'bore', 'countersink', 'counterbore', 'delik', 'hol'],
        shortcut: () => 'H',
        icon: ICONS.hole,
        execute: () => document.querySelector('#holeBtn')?.click()
      },
      {
        id: 'solid-rect-pattern',
        name: 'Rectangular Pattern',
        category: 'Solid · Create',
        keywords: ['pattern', 'rect', 'rectangular', 'array', 'grid', 'duplicate', 'dizi'],
        shortcut: () => '',
        icon: ICONS.pattern,
        execute: () => document.querySelector('#solidRectPatternBtn')?.click()
      },
      {
        id: 'solid-circ-pattern',
        name: 'Circular Pattern',
        category: 'Solid · Create',
        keywords: ['pattern', 'circ', 'circular', 'polar', 'radial', 'axis', 'dairesel'],
        shortcut: () => '',
        icon: ICONS.circPattern,
        execute: () => document.querySelector('#solidCircPatternBtn')?.click()
      },

      // Solid Modify
      {
        id: 'solid-fillet',
        name: 'Fillet',
        category: 'Solid · Modify',
        keywords: ['fillet', 'round', 'radius', 'edge', 'smooth', 'yuvarlat', 'fil'],
        shortcut: () => cad.shortcuts?.bindings?.fillet || 'F',
        icon: ICONS.fillet,
        execute: () => document.querySelector('#solidFilletBtn')?.click()
      },
      {
        id: 'solid-chamfer',
        name: 'Chamfer',
        category: 'Solid · Modify',
        keywords: ['chamfer', 'bevel', 'angle', 'edge', 'flat', 'pah', 'cham'],
        shortcut: () => '',
        icon: ICONS.chamfer,
        execute: () => document.querySelector('#solidChamferBtn')?.click()
      },
      {
        id: 'body-move',
        name: 'Move / Rotate',
        category: 'Solid · Modify',
        keywords: ['move', 'rotate', 'translate', 'transform', 'copy', 'position', 'tasi', 'dondur'],
        shortcut: () => 'M',
        icon: ICONS.move,
        execute: () => document.querySelector('#bodyMoveBtn')?.click()
      },

      // Sketch Draw Tools
      {
        id: 'sketch-line',
        name: 'Line',
        category: 'Sketch · Draw',
        keywords: ['line', 'segment', 'draw', 'sketch', 'cizgi'],
        shortcut: () => cad.shortcuts?.bindings?.line || 'L',
        icon: ICONS.line,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('line');
          else if (app.startSketchWithTool) app.startSketchWithTool('line');
          else document.querySelector('#lineTool')?.click();
        }
      },
      {
        id: 'sketch-rectangle',
        name: 'Rectangle',
        category: 'Sketch · Draw',
        keywords: ['rectangle', 'box', 'square', 'draw', 'sketch', 'dikdortgen', 'rect'],
        shortcut: () => cad.shortcuts?.bindings?.rectangle || 'R',
        icon: ICONS.rect,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('rectangle');
          else if (app.startSketchWithTool) app.startSketchWithTool('rectangle');
          else document.querySelector('#rectangleTool')?.click();
        }
      },
      {
        id: 'sketch-circle',
        name: 'Circle',
        category: 'Sketch · Draw',
        keywords: ['circle', 'radius', 'center', 'round', 'draw', 'sketch', 'cember', 'daire', 'circ'],
        shortcut: () => cad.shortcuts?.bindings?.circle || 'C',
        icon: ICONS.circle,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('circle');
          else if (app.startSketchWithTool) app.startSketchWithTool('circle');
          else document.querySelector('#circleTool')?.click();
        }
      },
      {
        id: 'sketch-point',
        name: 'Point',
        category: 'Sketch · Draw',
        keywords: ['point', 'dot', 'marker', 'sketch', 'nokta'],
        shortcut: () => cad.shortcuts?.bindings?.point || 'P',
        icon: ICONS.point,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('point');
          else document.querySelector('#pointTool')?.click();
        }
      },
      {
        id: 'sketch-fillet',
        name: 'Sketch Fillet',
        category: 'Sketch · Modify',
        keywords: ['fillet', 'corner', 'round', 'sketch', 'kose'],
        shortcut: () => '',
        icon: ICONS.fillet,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('fillet');
          else document.querySelector('#filletTool')?.click();
        }
      },
      {
        id: 'sketch-trim',
        name: 'Trim',
        category: 'Sketch · Modify',
        keywords: ['trim', 'cut', 'scissor', 'remove', 'sketch', 'budama', 'kirp'],
        shortcut: () => cad.shortcuts?.bindings?.trim || 'T',
        icon: ICONS.trim,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('trim');
          else document.querySelector('#trimTool')?.click();
        }
      },
      {
        id: 'sketch-offset',
        name: 'Offset',
        category: 'Sketch · Modify',
        keywords: ['offset', 'curve', 'parallel', 'sketch', 'oteleme'],
        shortcut: () => cad.shortcuts?.bindings?.offset || 'O',
        icon: ICONS.offset,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('offset');
          else document.querySelector('#offsetTool')?.click();
        }
      },
      {
        id: 'sketch-mirror',
        name: 'Mirror',
        category: 'Sketch · Modify',
        keywords: ['mirror', 'symmetry', 'duplicate', 'sketch', 'ayna'],
        shortcut: () => cad.shortcuts?.bindings?.mirror || 'M',
        icon: ICONS.mirror,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('mirror');
          else document.querySelector('#mirrorTool')?.click();
        }
      },
      {
        id: 'sketch-dimension',
        name: 'Dimension',
        category: 'Sketch · Dimension',
        keywords: ['dimension', 'distance', 'measure', 'length', 'olcu', 'dim'],
        shortcut: () => cad.shortcuts?.bindings?.distance || 'D',
        icon: ICONS.dimension,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('distance');
          else document.querySelector('#distanceTool')?.click();
        }
      },
      {
        id: 'sketch-angle',
        name: 'Angle Dimension',
        category: 'Sketch · Dimension',
        keywords: ['angle', 'degree', 'measure', 'dimension', 'aci'],
        shortcut: () => cad.shortcuts?.bindings?.angle || 'A',
        icon: ICONS.angle,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('angle');
          else document.querySelector('#angleTool')?.click();
        }
      },
      {
        id: 'sketch-midpoint',
        name: 'Midpoint',
        category: 'Sketch · Constraint',
        keywords: ['midpoint', 'center', 'middle', 'constraint', 'orta'],
        shortcut: () => '',
        icon: ICONS.midpoint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('midpoint');
          else document.querySelector('#midpointTool')?.click();
        }
      },
      {
        id: 'sketch-axis',
        name: 'Horizontal / Vertical',
        category: 'Sketch · Constraint',
        keywords: ['horizontal', 'vertical', 'axis', 'align', 'constraint', 'yatay', 'dikey'],
        shortcut: () => cad.shortcuts?.bindings?.axis || 'H',
        icon: ICONS.axis,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('axis');
          else document.querySelector('#axisTool')?.click();
        }
      },
      {
        id: 'sketch-tangent',
        name: 'Tangent',
        category: 'Sketch · Constraint',
        keywords: ['tangent', 'smooth', 'constraint', 'curve', 'teget'],
        shortcut: () => cad.shortcuts?.bindings?.tangent || 'G',
        icon: ICONS.tangent,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('tangent');
          else document.querySelector('#tangentTool')?.click();
        }
      },
      {
        id: 'sketch-coincident',
        name: 'Coincident',
        category: 'Sketch · Constraint',
        keywords: ['coincident', 'attach', 'snap', 'point', 'curve', 'constraint', 'cakisik'],
        shortcut: () => '',
        icon: ICONS.coincident,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('coincident');
          else document.querySelector('#coincidentTool')?.click();
        }
      },
      {
        id: 'sketch-equal',
        name: 'Equal',
        category: 'Sketch · Constraint',
        keywords: ['equal', 'same', 'length', 'radius', 'size', 'constraint', 'esit'],
        shortcut: () => '',
        icon: ICONS.equal,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('equal');
          else document.querySelector('#equalTool')?.click();
        }
      },
      {
        id: 'sketch-fix',
        name: 'Fix / Unfix',
        category: 'Sketch · Constraint',
        keywords: ['fix', 'lock', 'unfix', 'anchor', 'constraint', 'sabitle'],
        shortcut: () => '',
        icon: ICONS.fix,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('fix');
          else document.querySelector('#fixTool')?.click();
        }
      },
      {
        id: 'sketch-construction',
        name: 'Construction Geometry',
        category: 'Sketch · Draw',
        keywords: ['construction', 'dashed', 'helper', 'guide', 'reference', 'x', 'yardimci'],
        shortcut: () => cad.shortcuts?.bindings?.construction || 'X',
        icon: ICONS.construction,
        execute: (app) => {
          if (app.sketchTools) app.sketchTools.setConstruction(!app.sketchTools.constructionEnabled);
        }
      },
      {
        id: 'sketch-finish',
        name: 'Finish Sketch',
        category: 'Sketch · Complete',
        keywords: ['finish', 'exit', 'close', 'done', 'sketch', 'bitir'],
        shortcut: () => '',
        icon: ICONS.finish,
        execute: (app) => {
          document.querySelector('#finishSketch')?.click() || app.closeSketch?.();
        }
      },

      // Inspect & Utilities
      {
        id: 'show-mesh',
        name: 'Show Mesh Wireframe',
        category: 'Inspect',
        keywords: ['mesh', 'wireframe', 'edges', 'triangles', 'show', 'kafes'],
        shortcut: () => '',
        icon: ICONS.mesh,
        execute: () => document.querySelector('#showMeshOption')?.click()
      },
      {
        id: 'interference-check',
        name: 'Interference Check',
        category: 'Inspect',
        keywords: ['interference', 'clash', 'collision', 'check', 'intersect', 'cakisma'],
        shortcut: () => '',
        icon: ICONS.inspect,
        execute: () => document.querySelector('#interferenceBtn')?.click() || document.querySelector('#inspectInterferenceBtn')?.click()
      },
      {
        id: 'zebra-analysis',
        name: 'Zebra Analysis',
        category: 'Inspect',
        keywords: ['zebra', 'analysis', 'stripes', 'reflection', 'curvature', 'inspect', 'surface', 'yansima'],
        shortcut: () => '',
        icon: ICONS.zebra,
        execute: () => document.querySelector('#zebraAnalysisBtn')?.click() || document.querySelector('#inspectZebraBtn')?.click()
      },

      // Mesh Workspace Tools
      {
        id: 'mesh-decimate',
        name: 'Reduce Mesh',
        category: 'Mesh',
        keywords: ['mesh', 'reduce', 'decimate', 'simplify', 'triangles', 'azalt'],
        shortcut: () => '',
        icon: ICONS.decimate,
        execute: () => document.querySelector('#meshDecimateBtn')?.click()
      },
      {
        id: 'mesh-to-solid',
        name: 'Mesh to Solid',
        category: 'Mesh',
        keywords: ['mesh', 'solid', 'convert', 'b-rep', 'manifold', 'kati'],
        shortcut: () => '',
        icon: ICONS.meshToSolid,
        execute: () => document.querySelector('#meshToSolidBtn')?.click()
      },
      {
        id: 'mesh-fill',
        name: 'Fill Hollow',
        category: 'Mesh',
        keywords: ['fill', 'hollow', 'shell', 'cavity', 'solidify', 'doldur', 'ici bos'],
        shortcut: () => '',
        icon: ICONS.meshFill,
        execute: () => document.querySelector('#meshFillBtn')?.click()
      },
      {
        id: 'surface-finish',
        name: 'Surface Finish',
        category: 'Mesh',
        keywords: ['surface', 'finish', 'smooth', 'weld', 'crease', 'polish', 'yuzey'],
        shortcut: () => '',
        icon: ICONS.surfaceFinish,
        execute: () => document.querySelector('#surfaceFinishBtn')?.click()
      },

      // View & General Tools
      {
        id: 'view-fit',
        name: 'Fit to Screen',
        category: 'View',
        keywords: ['fit', 'zoom', 'extents', 'view', 'frame', 'camera', 'ekrana'],
        shortcut: () => '',
        icon: ICONS.viewFit,
        execute: () => document.querySelector('#viewFit')?.click()
      },
      {
        id: 'undo',
        name: 'Undo',
        category: 'Edit',
        keywords: ['undo', 'revert', 'back', 'geri'],
        shortcut: () => 'Ctrl+Z',
        icon: ICONS.undo,
        execute: (app) => (app.history || cad.history)?.undo?.()
      },
      {
        id: 'redo',
        name: 'Redo',
        category: 'Edit',
        keywords: ['redo', 'repeat', 'forward', 'ileri'],
        shortcut: () => 'Ctrl+Y',
        icon: ICONS.redo,
        execute: (app) => (app.history || cad.history)?.redo?.()
      },
      {
        id: 'save-project',
        name: 'Save Project',
        category: 'File',
        keywords: ['save', 'export', 'download', 'ocad', 'file', 'kaydet'],
        shortcut: () => 'Ctrl+S',
        icon: ICONS.save,
        execute: (app) => document.querySelector('#saveProjectBtn')?.click() || app.openSaveDialog?.()
      },
      {
        id: 'settings',
        name: 'Settings & Shortcuts',
        category: 'System',
        keywords: ['settings', 'preferences', 'shortcuts', 'configure', 'ayarlar'],
        shortcut: () => '',
        icon: ICONS.settings,
        execute: () => document.querySelector('#settingsButton')?.click()
      }
    ];
  }

  class ToolSearchController {
    constructor(options = {}) {
      this.app = options.app || cad.app || {};
      this.tools = getToolsCatalog();
      this.isOpen = false;
      this.selectedIndex = 0;
      this.filteredTools = [];
      this.lastMouseX = typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 200;
      this.lastMouseY = typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 200;

      this.popup = null;
      this.input = null;
      this.dropdown = null;
      this.closeBtn = null;

      this.initDOM();
      this.bindEvents();
    }

    initDOM() {
      if (typeof document === 'undefined') return;

      let popup = document.querySelector('#toolSearchPopup');
      if (!popup) {
        popup = document.createElement('div');
        popup.className = 'tool-search-popup';
        popup.id = 'toolSearchPopup';
        popup.hidden = true;
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Tool Search');

        popup.innerHTML = `
          <div class="tool-search-bar">
            <span class="tool-search-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <circle cx="6.5" cy="6.5" r="4.5"/>
                <line x1="10" y1="10" x2="14" y2="14"/>
              </svg>
            </span>
            <input type="text" class="tool-search-input" id="toolSearchInput" placeholder="Search tools" autocomplete="off" spellcheck="false" aria-label="Search tools" />
            <button type="button" class="tool-search-close" id="toolSearchClose" aria-label="Close search">✕</button>
          </div>
          <div class="tool-search-dropdown" id="toolSearchDropdown" role="listbox" hidden></div>
        `;
        document.body.appendChild(popup);
      }

      this.popup = popup;
      this.input = popup.querySelector('#toolSearchInput');
      this.dropdown = popup.querySelector('#toolSearchDropdown');
      this.closeBtn = popup.querySelector('#toolSearchClose');
    }

    bindEvents() {
      if (typeof window === 'undefined') return;

      // Track pointer position so popup can open exactly at mouse cursor
      window.addEventListener('pointermove', event => {
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
      }, { passive: true });

      // Global 's' key listener to open the tool search bar
      window.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key !== 's' && event.key !== 'S') return;

        const activeEl = document.activeElement;
        const isInput = activeEl && (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
          activeEl.isContentEditable
        );
        if (isInput) return;

        // Skip if active modal dialogs are open
        const modals = ['#settingsPanel', '#saveModalBackdrop', '#newDesignModalBackdrop'];
        if (modals.some(sel => {
          const el = document.querySelector(sel);
          return el && !el.hidden && getComputedStyle(el).display !== 'none';
        })) return;

        if (this.isOpen) return;

        event.preventDefault();
        event.stopPropagation();
        this.open();
      });

      if (!this.input) return;

      // Typing in input updates search results
      this.input.addEventListener('input', () => {
        this.search(this.input.value);
      });

      // Keyboard navigation and typing in search input
      this.input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.moveSelection(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.moveSelection(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this.executeSelected();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        } else {
          // Stop propagation so global shortcuts (E, L, C, R, F, M, etc.) never fire while typing
          event.stopPropagation();
        }
      });
      this.input.addEventListener('keyup', event => event.stopPropagation());
      this.input.addEventListener('keypress', event => event.stopPropagation());

      // Close button
      this.closeBtn?.addEventListener('click', () => this.close());

      // Outside click closes popup
      document.addEventListener('pointerdown', event => {
        if (this.isOpen && this.popup && !this.popup.contains(event.target)) {
          this.close();
        }
      });
    }

    open(customX, customY) {
      if (!this.popup || !this.input) return;

      // Position at mouse bottom-right: "tam olarak faremin sağ alt köşesinde çıkacak s ye basınca"
      const x = Number.isFinite(customX) ? customX : this.lastMouseX;
      const y = Number.isFinite(customY) ? customY : this.lastMouseY;

      const popupWidth = 280;
      const popupEstimatedHeight = 160;

      // Cursor offset (+10px right, +10px down from pointer)
      let left = x + 10;
      let top = y + 10;

      // Keep within window boundaries
      if (typeof window !== 'undefined') {
        const maxX = window.innerWidth - popupWidth - 12;
        const maxY = window.innerHeight - popupEstimatedHeight - 12;
        left = Math.max(10, Math.min(left, maxX));
        top = Math.max(10, Math.min(top, maxY));
      }

      this.popup.style.left = `${left}px`;
      this.popup.style.top = `${top}px`;
      this.popup.hidden = false;
      this.isOpen = true;

      this.input.value = '';
      this.search('');

      this.input.focus();
    }

    close() {
      if (!this.popup) return;
      this.popup.hidden = true;
      this.isOpen = false;
      if (this.dropdown) {
        this.dropdown.hidden = true;
        this.dropdown.innerHTML = '';
      }
    }

    search(query) {
      const q = String(query || '').trim().toLowerCase();

      if (!q) {
        // If empty, show top/common tools so user can see available tools immediately
        this.filteredTools = this.tools.slice(0, 8);
      } else {
        this.filteredTools = this.tools.filter(tool => {
          if (tool.name.toLowerCase().includes(q)) return true;
          if (tool.category.toLowerCase().includes(q)) return true;
          return tool.keywords.some(kw => kw.toLowerCase().includes(q));
        });
      }

      this.selectedIndex = 0;
      this.renderResults();
    }

    renderResults() {
      if (!this.dropdown) return;

      if (!this.filteredTools.length) {
        this.dropdown.innerHTML = '<div class="tool-search-empty">No matching tools found</div>';
        this.dropdown.hidden = false;
        return;
      }

      this.dropdown.hidden = false;
      this.dropdown.innerHTML = '';

      this.filteredTools.forEach((tool, index) => {
        const item = document.createElement('div');
        item.className = `tool-search-item ${index === this.selectedIndex ? 'is-selected' : ''}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === this.selectedIndex));
        item.dataset.toolId = tool.id;

        const shortcut = typeof tool.shortcut === 'function' ? tool.shortcut() : tool.shortcut;

        item.innerHTML = `
          <div class="tool-search-item-icon" aria-hidden="true">${tool.icon}</div>
          <div class="tool-search-item-body">
            <span class="tool-search-item-name">${tool.name}</span>
            <span class="tool-search-item-category">${tool.category}</span>
          </div>
          ${shortcut ? `<span class="tool-search-item-shortcut">${shortcut}</span>` : ''}
        `;

        item.addEventListener('pointerenter', () => {
          this.selectedIndex = index;
          this.updateSelectionClasses();
        });

        item.addEventListener('click', () => {
          this.executeTool(tool);
        });

        this.dropdown.appendChild(item);
      });

      this.scrollSelectedIntoView();
    }

    moveSelection(delta) {
      if (!this.filteredTools.length) return;
      this.selectedIndex = (this.selectedIndex + delta + this.filteredTools.length) % this.filteredTools.length;
      this.updateSelectionClasses();
      this.scrollSelectedIntoView();
    }

    updateSelectionClasses() {
      if (!this.dropdown) return;
      const items = this.dropdown.querySelectorAll('.tool-search-item');
      items.forEach((item, idx) => {
        const isSel = idx === this.selectedIndex;
        item.classList.toggle('is-selected', isSel);
        item.setAttribute('aria-selected', String(isSel));
      });
    }

    scrollSelectedIntoView() {
      if (!this.dropdown) return;
      const selected = this.dropdown.querySelector('.tool-search-item.is-selected');
      selected?.scrollIntoView?.({ block: 'nearest' });
    }

    executeSelected() {
      const tool = this.filteredTools[this.selectedIndex];
      if (tool) this.executeTool(tool);
    }

    executeTool(tool) {
      this.close();
      try {
        const app = this.app || cad.app || {};
        tool.execute(app);
      } catch (err) {
        console.warn('Error executing tool from search:', tool.name, err);
      }
    }
  }

  cad.ToolSearchController = ToolSearchController;
})(window.WebCAD = window.WebCAD || {});
