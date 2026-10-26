# onlineCAD

A lightweight, high-performance browser-native 3D CAD modeling workspace built with modern Web standards, WebAssembly, and WebGL.

Live application: **[cad.borakosalay.me](https://cad.borakosalay.me)**

---

## Overview

**onlineCAD** is a standalone, client-side parametric computer-aided design (CAD) workspace running directly in modern web browsers. It integrates a 2D constraint-driven sketcher, a robust Constructive Solid Geometry (CSG) solid modeling kernel powered by the [Manifold](https://github.com/elalish/manifold) geometry library compiled to WebAssembly, real-time WebGL rendering, and an interactive parametric timeline.

Designed to operate with zero server-side dependencies, all geometry evaluations, 3D Boolean operations, and rendering calculations execute locally on the client machine with sub-millisecond responsiveness.

---

## Key Features

### 1. Parametric 2D Sketching
- **Sketch Planes**: Sketch on standard Cartesian planes (XY, XZ, YZ) or directly onto any planar face of existing 3D solid bodies.
- **Drawing Primitives**: Lines, 2-Point and Center Rectangles, Circles (clean radius HUD), Arcs, Points, and Construction geometry.
- **Constraints & Snapping**: Coincident, Horizontal, Vertical, Tangent, Parallel, Perpendicular, and Concentric relations with real-time cursor magnetic snapping.
- **Sketch Editing**: Dynamic Trim, Fillet (corner and circle-circle), Offset, Mirroring, and Rectangular/Circular Patterns.
- **Select & Delete**: Click sketch geometry with no tool active (Shift/Ctrl+click to add) and press `Delete`; dependent constraints and dimensions are removed with it and `Ctrl+Z` brings everything back.
- **Profile Solver**: Automatic cycle detection for closed planar loops, supporting nested profiles and multi-island solid extrusions.

### 2. Solid 3D Modeling
- **Extrude (`E`)**: Create new bodies, join adjacent volumes, cut cavities, or find boolean intersections. Supports one-sided, two-sided, and symmetric extrusions with smart magnetic increment snapping.
- **Revolve**: Full 360-degree or partial angular revolutions about custom sketch axes or planar edges.
- **3D Hole Tool (`H`)**: Interactive on-face hole placement with live 3D depth and diameter vectors. Supports Simple, Counterbore, and Countersink heads with Through-All and Blind depth modes.
- **Fillet & Chamfer**: Constant-radius round and bevel operations across straight solid edges and continuous circular rims.
- **Move / Rotate (`M`)**: Comprehensive 3D transformation gizmo with arbitrary rotation pivots and numeric translation controls.

### 3. Inspection & Diagnostics
- **Zebra Reflection Analysis**: Dual-axis orthogonal reflection striping (Horizontal and Vertical) for visual surface continuity inspection (G0, G1, G2).
- **Interference Detection**: 3D multi-body volume penetration checks to detect collision boundaries between mechanical components.
- **Visual Styles**: Shaded, Shaded with Visible Edges (bold contour silhouettes), and Wireframe mesh modes.

### 4. Parametric Timeline & Project Persistence
- **Timeline History**: Step-by-step feature tree enabling chronological review and non-destructive rollbacks.
- **Undo / Redo**: Bi-directional operational history stack accessible via `Ctrl+Z` / `Ctrl+Y`.
- **Native Persistence (`.ocad`)**: Save and reload projects with complete entity hierarchy and body states, as a download or as a draft kept in the browser (**FILE > Open Browser Draft**).
- **Autosave & Recovery**: Every change is autosaved to browser storage (IndexedDB); after a closed tab or crash the workspace offers to restore the last state. The title bar shows *Unsaved changes* and the browser warns before leaving with unsaved work.
- **3D Printing Export**: Binary/ASCII STL and 3MF (one object per body, millimetre units) for Bambu Studio, PrusaSlicer, Cura and OrcaSlicer; OBJ for Blender and renderers.
- **2D Drawing Export (`.dxf`)**: The open sketch, or all visible sketches, as AutoCAD R12 DXF with one layer per sketch and a separate layer for construction geometry.
- **Delete Sketches & Bodies**: Trash button on browser tree rows, or select a body and press `Delete`; fully undoable.
- **Universal Importers**: Drag-and-drop support for STEP (`.step`, `.stp`), STL, OBJ, and DXF files.

### 5. Workflow & Usability
- **Tool Search Palette (`S`)**: Lightweight, in-place fuzzy tool launcher positioned directly under the mouse cursor.
- **ViewCube**: Interactive 3D orientation cube with cardinal viewpoints and orthographic face snapping.
- **HUD & Dimension Controls**: On-canvas input tags with Tab navigation and unit formatting (mm/deg).

---

## Architecture & Technology Stack

```
+--------------------------------------------------------------------+
|                             UI Layer                               |
|        Ribbon Toolbar | Browser Tree | ViewCube | Search Palette    |
+---------------------------------+----------------------------------+
                                  |
+---------------------------------v----------------------------------+
|                          Application Core                          |
|    Parametric Timeline | History Manager | Document State Engine   |
+---------------------------------+----------------------------------+
                                  |
     +----------------------------+----------------------------+
     |                                                         |
+----v--------------------+                       +------------v-----+
|   2D Sketch Engine      |                       |   Solid 3D Kernel|
| Constraints & Snapping  |                       |  Manifold (WASM) |
| Closed Cycle Detection  |                       |  CSG Operations  |
+----+--------------------+                       +------------+-----+
     |                                                         |
     +----------------------------+----------------------------+
                                  |
+---------------------------------v----------------------------------+
|                         Rendering Engine                           |
|       WebGL Shaders | Visible Edge Detect | Zebra Curvature        |
+--------------------------------------------------------------------+
```

- **Solid Geometry Kernel**: Manifold 3D engine compiled to WebAssembly (`manifold.wasm`), providing manifold guarantees, guaranteed watertightness, and robust boolean evaluations.
- **Rendering Pipeline**: Custom WebGL implementation with studio CAD lighting shaders, edge emphasis, and hardware-accelerated canvas interaction.
- **Zero Build Step**: Native ES Modules and vanilla web standards allow instant execution in any modern browser without bundlers (Vite, Webpack) or transpilation.

---

## Getting Started

### Prerequisites
A modern web browser with WebAssembly and WebGL support (Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari).

### Local Execution

Because the application loads WebAssembly (`.wasm`) modules and Web Workers, it should be served via a local HTTP server to satisfy browser security policies:

```bash
# 1. Clone the repository
git clone https://github.com/borakosalay/onlinecad.git
cd onlinecad

# 2. Start any local static server:
# Using Python:
python -m http.server 8080

# Or using Node.js:
npx serve .
```

Navigate to `http://localhost:8080` in your browser.

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>S</kbd> | Open Tool Search Palette | Global |
| <kbd>E</kbd> | Extrude | Solid Workspace |
| <kbd>H</kbd> | 3D Hole Feature | Solid Workspace |
| <kbd>L</kbd> | Line Tool (Opens plane picker if outside sketch) | Global / Sketch |
| <kbd>C</kbd> | Circle Tool (Opens plane picker if outside sketch) | Global / Sketch |
| <kbd>R</kbd> | 2-Point Rectangle (Opens plane picker) | Global / Sketch |
| <kbd>M</kbd> | Move / Rotate Transform | Solid Workspace |
| <kbd>F</kbd> | 3D Fillet (Sketch Fillet inside a sketch) | Solid Workspace / Sketch |
| <kbd>Home</kbd> | Zoom to Fit | Viewport |
| <kbd>Delete</kbd> | Delete selected sketch items or body | Sketch / Solid Workspace |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo | Global |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Redo | Global |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save Project (`.ocad`) | Global |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open Project (`.ocad`) | Global |
| <kbd>Escape</kbd> | Cancel / Deselect Tool | Global |
| <kbd>MMB Drag</kbd> | Pan Camera | Viewport |
| <kbd>Shift</kbd> + <kbd>MMB Drag</kbd> | Orbit Camera | Viewport |
| <kbd>Mouse Wheel</kbd> | Zoom In / Out | Viewport |

---

## Testing

The project includes an automated test suite covering the solid kernel, sketch constraint model, CSG Boolean operations, timeline history, and UI workflows:

```bash
node --test tests/*.test.mjs
```

All 202 unit and integration tests run directly via the Node.js native test runner.

---

## License

- Application code is licensed under the [MIT License](LICENSE).
- Bundled [Manifold](https://github.com/elalish/manifold) geometry library is licensed under the Apache License 2.0.
