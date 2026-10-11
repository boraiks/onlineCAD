(function (cad) {
  'use strict';

  const ICONS = {
    sketch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 22,7 12,12 2,7" fill="rgba(56,189,248,0.2)" stroke="#38bdf8"/><path d="M7 4.5l10 5M17 4.5l-10 5" stroke="#38bdf8" stroke-dasharray="2 2"/><circle cx="17" cy="17" r="4.5" fill="#22c55e" stroke="#fff" stroke-width="1.5"/><path d="M17 15v4M15 17h4" stroke="#fff" stroke-width="1.5"/></svg>`,
    extrude: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="10,4 18,8 10,12 2,8" fill="rgba(56,189,248,0.3)" stroke="#38bdf8"/><polygon points="2,8 10,12 10,20 2,16" fill="rgba(14,165,233,0.4)" stroke="#0284c7"/><polygon points="10,12 18,8 18,16 10,20" fill="rgba(2,132,199,0.5)" stroke="#0369a1"/><path d="M19 14V4M16 7l3-3 3 3" stroke="#00e5ff" stroke-width="2"/></svg>`,
    revolve: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="2" x2="6" y2="22" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M9 5h8a3 1.5 0 0 1 0 3H9Z" fill="rgba(56,189,248,0.3)" stroke="#38bdf8"/><path d="M9 5h8v12H9Z" fill="rgba(14,165,233,0.4)" stroke="#0284c7"/><path d="M19 8a7 5 0 1 1-7 11" stroke="#00e5ff" stroke-width="1.8"/><polygon points="12 17 9 20 13 22" fill="#00e5ff" stroke="none"/></svg>`,
    hole: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,3 20,7 12,11 4,7" fill="rgba(148,163,184,0.3)" stroke="#94a3b8"/><polygon points="4,7 12,11 12,19 4,15" fill="rgba(100,116,139,0.3)" stroke="#64748b"/><polygon points="12,11 20,7 20,15 12,19" fill="rgba(71,85,105,0.4)" stroke="#475569"/><ellipse cx="12" cy="7" rx="3.5" ry="1.8" fill="#0f172a" stroke="#00e5ff" stroke-width="1.2"/><path d="M8.5 7v4c0 1 1.5 1.8 3.5 1.8s3.5-.8 3.5-1.8V7" stroke="#00e5ff" stroke-width="1.2"/></svg>`,
    fillet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V8a4 4 0 0 1 4-4h12" stroke="#64748b"/><path d="M4 20h16V8" stroke="#64748b"/><path d="M4 8q8 8 16 0" fill="none" stroke="#00e5ff" stroke-width="2.2"/><circle cx="12" cy="12" r="1.5" fill="#00e5ff"/></svg>`,
    chamfer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V11l7-7h9v16H4Z" fill="rgba(251,146,60,0.15)" stroke="#64748b"/><line x1="4" y1="11" x2="11" y2="4" stroke="#f97316" stroke-width="2.2"/><line x1="7.5" y1="7.5" x2="12" y2="12" stroke="#f97316" stroke-dasharray="1.5 1.5"/></svg>`,
    move: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/><polyline points="16 9 19 12 16 15"/><polyline points="9 16 12 19 15 16"/><polyline points="8 9 5 12 8 15"/><polyline points="9 8 12 5 15 8"/></svg>`,
    pattern: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" fill="rgba(56,189,248,0.4)" stroke="#38bdf8"/><rect x="14" y="3" width="7" height="7" rx="1" fill="rgba(56,189,248,0.2)" stroke="#38bdf8"/><rect x="3" y="14" width="7" height="7" rx="1" fill="rgba(56,189,248,0.2)" stroke="#38bdf8"/><rect x="14" y="14" width="7" height="7" rx="1" fill="rgba(56,189,248,0.2)" stroke="#38bdf8"/></svg>`,
    circPattern: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7" stroke="#38bdf8" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="2" fill="#f59e0b"/><circle cx="12" cy="5" r="2" fill="#38bdf8"/><circle cx="19" cy="12" r="2" fill="#38bdf8"/><circle cx="12" cy="19" r="2" fill="#38bdf8"/><circle cx="5" cy="12" r="2" fill="#38bdf8"/></svg>`,
    line: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2.2" fill="#38bdf8"/><circle cx="20" cy="4" r="2.2" fill="#38bdf8"/></svg>`,
    rect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="1"/><circle cx="4" cy="5" r="1.8" fill="#38bdf8"/><circle cx="20" cy="19" r="1.8" fill="#38bdf8"/></svg>`,
    circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.8" fill="#38bdf8"/><line x1="12" y1="12" x2="19.5" y2="8" stroke="#38bdf8" stroke-dasharray="1.5 1.5"/></svg>`,
    point: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5" fill="#38bdf8" stroke="#fff"/></svg>`,
    trim: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
    offset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18C8 18 8 6 12 6s4 12 8 12" stroke="#64748b"/><path d="M4 14C8 14 8 2 12 2s4 12 8 12" stroke="#38bdf8"/></svg>`,
    mirror: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22" stroke="#94a3b8" stroke-dasharray="2 2"/><polygon points="4,7 10,12 4,17" fill="rgba(56,189,248,0.4)" stroke="#38bdf8"/><polygon points="20,7 14,12 20,17" fill="rgba(56,189,248,0.15)" stroke="#38bdf8"/></svg>`,
    dimension: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="4" x2="4" y2="20"/><line x1="20" y1="4" x2="20" y2="20"/><line x1="4" y1="12" x2="20" y2="12" stroke="#38bdf8"/><polyline points="8 9 4 12 8 15" stroke="#38bdf8"/><polyline points="16 9 20 12 16 15" stroke="#38bdf8"/></svg>`,
    angle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><line x1="4" y1="20" x2="17" y2="6"/><path d="M9 20a6 6 0 0 0 4-4" stroke="#38bdf8" stroke-width="2"/></svg>`,
    constraint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="10" rx="2"/><circle cx="9" cy="12" r="2" fill="#38bdf8"/><circle cx="15" cy="12" r="2" fill="#38bdf8"/><line x1="9" y1="12" x2="15" y2="12" stroke="#38bdf8"/></svg>`,
    construction: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="4" stroke="#f59e0b" stroke-dasharray="3 2"/><circle cx="4" cy="20" r="2" fill="#f59e0b"/><circle cx="20" cy="4" r="2" fill="#f59e0b"/></svg>`,
    finish: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" stroke="#22c55e"/></svg>`,
    inspect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16" y2="16"/><line x1="8" y1="11" x2="14" y2="11" stroke="#38bdf8"/></svg>`,
    zebra: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="3" y1="7" x2="21" y2="7" stroke="#38bdf8" stroke-width="2"/><line x1="3" y1="12" x2="21" y2="12" stroke="#38bdf8" stroke-width="2"/><line x1="3" y1="17" x2="21" y2="17" stroke="#38bdf8" stroke-width="2"/></svg>`,
    mesh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,3 21,8 21,16 12,21 3,16 3,8" fill="rgba(56,189,248,0.15)" stroke="#38bdf8"/><polyline points="3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="21"/><line x1="12" y1="13" x2="3" y2="16"/><line x1="12" y1="13" x2="21" y2="16"/></svg>`,
    viewFit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/><circle cx="12" cy="12" r="3" fill="#38bdf8"/></svg>`,
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
        keywords: ['hole, drill, bore, countersink, counterbore, delik, hol'],
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
          else document.querySelector('#lineToolBtn')?.click();
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
          else document.querySelector('#rectangleToolBtn')?.click();
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
          else document.querySelector('#circleToolBtn')?.click();
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
          else document.querySelector('#pointToolBtn')?.click();
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
          else document.querySelector('#filletToolBtn')?.click();
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
          else document.querySelector('#trimToolBtn')?.click();
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
          else document.querySelector('#offsetToolBtn')?.click();
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
          else document.querySelector('#mirrorToolBtn')?.click();
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
          else document.querySelector('#distanceToolBtn')?.click();
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
          else document.querySelector('#angleToolBtn')?.click();
        }
      },
      {
        id: 'sketch-axis',
        name: 'Horizontal / Vertical',
        category: 'Sketch · Constraint',
        keywords: ['horizontal', 'vertical', 'axis', 'align', 'constraint', 'yatay', 'dikey'],
        shortcut: () => cad.shortcuts?.bindings?.axis || 'H',
        icon: ICONS.constraint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('axis');
          else document.querySelector('#axisToolBtn')?.click();
        }
      },
      {
        id: 'sketch-tangent',
        name: 'Tangent',
        category: 'Sketch · Constraint',
        keywords: ['tangent', 'smooth', 'constraint', 'curve', 'teget'],
        shortcut: () => cad.shortcuts?.bindings?.tangent || 'G',
        icon: ICONS.constraint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('tangent');
          else document.querySelector('#tangentToolBtn')?.click();
        }
      },
      {
        id: 'sketch-coincident',
        name: 'Coincident',
        category: 'Sketch · Constraint',
        keywords: ['coincident', 'attach', 'snap', 'point', 'curve', 'constraint', 'cakisik'],
        shortcut: () => '',
        icon: ICONS.constraint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('coincident');
          else document.querySelector('#coincidentToolBtn')?.click();
        }
      },
      {
        id: 'sketch-equal',
        name: 'Equal',
        category: 'Sketch · Constraint',
        keywords: ['equal', 'same', 'length', 'radius', 'size', 'constraint', 'esit'],
        shortcut: () => '',
        icon: ICONS.constraint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('equal');
          else document.querySelector('#equalToolBtn')?.click();
        }
      },
      {
        id: 'sketch-fix',
        name: 'Fix / Unfix',
        category: 'Sketch · Constraint',
        keywords: ['fix', 'lock', 'unfix', 'anchor', 'constraint', 'sabitle'],
        shortcut: () => '',
        icon: ICONS.constraint,
        execute: (app) => {
          if (app.sketchTools?.getActiveSketch?.()) app.sketchTools.setTool('fix');
          else document.querySelector('#fixToolBtn')?.click();
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
          document.querySelector('#finishSketchBtn')?.click() || app.closeSketch?.();
        }
      },

      // Inspect & Utilities
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
        icon: ICONS.mesh,
        execute: () => document.querySelector('#meshDecimateBtn')?.click()
      },
      {
        id: 'mesh-to-solid',
        name: 'Mesh to Solid',
        category: 'Mesh',
        keywords: ['mesh', 'solid', 'convert', 'b-rep', 'manifold', 'kati'],
        shortcut: () => '',
        icon: ICONS.mesh,
        execute: () => document.querySelector('#meshToSolidBtn')?.click()
      },
      {
        id: 'surface-finish',
        name: 'Surface Finish',
        category: 'Mesh',
        keywords: ['surface', 'finish', 'smooth', 'weld', 'crease', 'polish', 'yuzey'],
        shortcut: () => '',
        icon: ICONS.mesh,
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
        execute: (app) => (app.history || window.cad?.history)?.undo?.()
      },
      {
        id: 'redo',
        name: 'Redo',
        category: 'Edit',
        keywords: ['redo', 'repeat', 'forward', 'ileri'],
        shortcut: () => 'Ctrl+Y',
        icon: ICONS.redo,
        execute: (app) => (app.history || window.cad?.history)?.redo?.()
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
