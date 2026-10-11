# onlineCAD

onlineCAD is a browser-based CAD workspace. It opens without an installation or build step. The current version supports 2D sketches, 3D extrusion, solid editing, native project file persistence (`.ocad`), and binary STL 3D-print export. The interface is in English and follows a light, Fusion 360-inspired layout.

## Run

Open `index.html` in a modern browser. The app uses plain HTML, CSS, and JavaScript and can be served as static files. No package installation or account is required.

The compact **Design Timeline** at the bottom shows one icon per CAD feature during the current session. All drawing, dimension, and constraint edits in a sketch session are represented by one Sketch icon; solid operations and imports use their toolbar icons. Click an icon or use the navigation buttons to move between completed features. The detailed undo stack remains available with Ctrl+Z/Ctrl+Y. Later features remain visible while reviewing an earlier state; making a new edit there replaces those later steps. Opening a `.ocad` file starts a new session timeline from the loaded design. The saved file currently stores the resulting sketches and bodies, not replayable feature commands or a parametric dependency graph, so earlier feature parameters cannot yet be edited and recomputed after reopening.

Large STL imports are parsed in a browser worker, including when opened directly from `file://`. For models above 25,000 triangles, the import dialog offers a target reduction for the **display mesh**. The original triangles remain available for CAD operations and STL export. The displayed triangle count is measured after simplification; the chosen percentage is a target, since the shape may prevent an exact match. The **DISPLAY MESH DETAIL** panel can change this view later, and undo/redo restores the previous display setting. `.ocad` files save the original geometry and the chosen display reduction; the display mesh is regenerated on open. On browsers that block workers, import falls back to the main thread and may pause the interface. OBJ and STEP imports use workers when the app is served over HTTP(S); direct `file://` support for their worker parsing is not available yet.

**MESH TO SOLID** converts a selected imported mesh into an editable solid for face selection, sketches, holes, extrusion, Boolean edits, and Move/Rotate. Open the tool, click the mesh in the model or Browser, choose solid detail, then choose **Adaptive surface rebuild** or **Preserve original mesh**. Adaptive rebuild uses crease-aware tangent interpolation and refinement scaled to the source mesh density to change the *actual* geometry between STL samples without excessive triangle growth on coarse meshes. A small volume correction is attempted when interpolation inflates a closed mesh; the corrected shape must still pass the shape check.

The result is checked for a closed solid, a maximum 1% volume change, a triangle budget, and a two-way surface tolerance of 0.3%, 0.6%, or 1% of the model's largest dimension. A spatial index first checks representative points. Then an adaptive triangle check covers the complete source and result surfaces: a triangle passes when its vertices are within tolerance of one convex target triangle, or a conservative distance bound proves it; otherwise it is subdivided and checked again. If the bounded verification cannot finish, the candidate is rejected. This provides a conservative tolerance decision for the triangulated surfaces subject to floating-point precision, rather than relying only on sparse samples. Both rebuilding and any later solid simplification are checked against the original imported surface, so their errors cannot accumulate unnoticed. Aggressive simplification retries at gentler settings when it cannot pass.

If a check fails, conversion keeps the faceted solid and reports why. The selected mesh turns blue before conversion; planar triangle islands select as one face afterward. Optimized solid detail simplifies the actual solid within the surface and volume limits, so small geometric features may still change. Conversion repairs degenerate triangles and inconsistent winding, but requires a closed, manifold surface; open edges and non-manifold or self-intersecting STL surfaces must be repaired first. Undo/redo restores either conversion. The source mesh is saved in `.ocad`, so **MESH TO SOLID** can be reopened on an unedited converted body to adjust reconstruction settings later; this increases project size. Conversion runs in a worker on HTTP(S), with a local main-thread fallback for `file://`.

**CAD Surface Finish** is enabled by default for converted meshes. It computes angle-weighted smooth shading across STL vertex seams and displays only open or sharp feature edges in the ordinary shaded-with-edges view. **Show Mesh** still reveals the actual triangle network. Select a mesh body and use Inspect → **CAD Surface Finish** to toggle the appearance or adjust its smoothing angle, with undo/redo support. If an earlier display reduction makes the silhouette coarse, choose **0%** in **DISPLAY MESH DETAIL** to render the full mesh. These settings are saved in `.ocad`. Surface finish itself changes only the viewport appearance; adaptive surface rebuild changes the solid and STL export. The rebuilt solid remains a triangle-based surface. STL does not contain the original sketches, feature history, or exact analytic surfaces, so those cannot be automatically recovered for every model.

The default solid appearance uses a warm neutral gray material and a camera-relative two-panel studio light. The WebGL shader combines soft diffuse lighting, a narrow polished highlight, a weaker fill reflection, and subdued edge light. This is tuned to the supplied Fusion reference image; it is not a copy of Autodesk's proprietary renderer or material parameters.

Project designs can be saved and opened locally as `.ocad` files, or exported as `.stl` files for 3D printing.

## Latest features (2026-10-10, onlineCAD)

- **3D HOLE Tool (`H`)**:
  - Fully interactive 3D Hole feature for planar solid body faces.
  - **Hole Types**: Simple cylindrical hole, Counterbore (stepped socket head), and Countersink (conical chamfer head).
  - **Extents**: Through All (`all`) vs Blind / Distance (`distance`).
  - **Interactive 3D Placement**: Click any planar body face to place the hole center, or drag the on-face crosshair handle in real-time.
  - **Live 3D Preview**: Real-time CSG boolean subtraction computed with bundled Manifold 3D kernel and rendered in WebGL depth-tested viewport.
  - **On-Canvas HUD & Dimensions**: Dynamic 3D circle outline, center crosshair, depth vector arrow, and badge showing diameter & depth (e.g. `⌀ 10.0 mm (THROUGH)`).
  - Full Undo/Redo integration (`Ctrl+Z` / `Ctrl+Y`) and browser tree synchronization.
- **Rebranded to onlineCAD**: Project name updated across titlebar, document titles, branding icons, and metadata.
- **Native Project Persistence (`.ocad`)**: Designs can now be saved and reopened at any time via the `.ocad` file format (`Ctrl+S` / `Ctrl+O`).
- **Binary STL Export for 3D Printing (`.stl`)**: Visible 3D bodies can be exported directly to standard binary STL meshes (`Export STL`), ready for 3D printer slicers.
- **Universal Importers**: Drag-and-drop or import STL, STEP (.step/.stp), OBJ, and DXF (sketches and 3DFACE solids).
- **draw.io-Style Save Dialog & In-App Themed Confirmation Modals**: Professional dark floating save modal and custom New Design confirmation dialog.

## Previous fixes (2026-10-10)

- **CUT residue fix:** Pristine extruded bodies now use their original profile for 3D Boolean calculations instead of the lower-precision display mesh. Previously edited bodies continue to use their actual mesh; when a cutter shares a curved boundary, the cut receives a small lateral tolerance. Overlap is checked with the unexpanded cutter first, so touching edges do not remove material. This removes detached strips when cutting an overlapping-circle lens, including a cut started on a raised face after Join.
- Every new Extrude, including one started from a selected body face, resets both distance fields to **0 mm**. The arrow and its floating distance fields remain visible at zero. Press **Tab** from the viewport to edit the distance beside the arrow; with **Two Sides**, Tab advances to the other side. Typing there updates the panel and preview immediately. The initial zero value waits for input without raising a compute error.
- Cutting a body with its own cylindrical face or original profile now expands the cutter sideways by a small tolerance before the 3D subtraction. This removes thin leftover strips caused by rounded triangle-mesh coordinates. The requested cutting depth stays exact; a full-depth Cut can remove the body completely.
- Automatic Cut detection now checks overlapping 3D volume without building a Boolean result mesh on every arrow movement. A full-body overlap is detected correctly, and candidate bodies are filtered by their 3D bounds first.
- Opening Extrude switches **Show Mesh** off and saves the choice. Mesh triangles stay hidden for the whole Extrude operation. Show Mesh can be enabled again from **INSPECT** after closing Extrude.
- `js/vendor/manifold/LICENSE` contains the Apache 2.0 license for the bundled Manifold geometry library. It is not an Apache web server, and the library is used for 3D mesh generation and solid operations. Keep the license alongside the library.
- Regression checks cover cylindrical and overlapping-circle cuts, edited bodies and raised-face sketches, edge-only contact, 0.001 mm 3D intersection detection, and Show Mesh switching off when Extrude opens. The full test suite currently passes 110 tests.

## Latest changes (2026-10-09, AI handoff)

- **Auto-Switch to CUT and Red Extrude Visuals**: Extruding a profile or face into or through an existing solid body automatically selects the **Cut** operation. Moving the extrusion arrow away from the body/into empty space seamlessly reverts to **New Body** (or **Join** when extruding outward from a face). In CUT mode, the cutting extrusion volume is rendered in vibrant translucent red (`rgba(235, 55, 55, .72)` caps, `rgba(205, 40, 40, .58)` sides, `#c62828` edges), the 3D drag arrow is colored in red (`#e53935` / `#b71c1c`), the on-canvas HUD displays a red `Operation CUT` indicator, and the panel OK button turns red (`#dc3545`).
- **Show Mesh During Extrude**: Opening **EXTRUDE** switches Show Mesh off and saves that choice. Neither existing bodies nor preview volumes display triangle wireframes while Extrude is open. The **INSPECT** menu and Show Mesh option are disabled until Extrude closes; Show Mesh stays off afterward until explicitly enabled again.
- Double-clicking (`dblclick`) any face of a 3D body selects the entire body (`BODY SELECTED`). All visible faces of the body glow with CAD selection blue (`rgba(33, 137, 227, .38)`) and bold contour outlines (`#0e70b0`). The corresponding row in the **BROWSER** tree is highlighted with `.is-selected`, and clicking a body row toggles its selection. Single-clicking a face selects just that face; clicking empty space or pressing `Escape` clears the selection. If **Move / Rotate** is opened while a body is selected, the tool automatically targets that body with its 3D gizmo.
- Pressing **Line (`L`)**, **Circle (`C`)**, or **Rectangle (`R`)** while not editing a sketch opens origin plane selection (XY, XZ, YZ) just like clicking **SKETCH**. Once a plane is clicked, the sketch opens on that plane with the pressed tool immediately activated in hand. Only these three primary drawing tools trigger plane picking from the 3D workspace; other sketch tools remain inactive until a sketch is open.
- Dragging the 3D **EXTRUDE** arrow now magnetically snaps to integer increments (1, 2, 3, 4, 5, 6, 7, 8, 9, 10 mm), multiples of 5 mm (10, 15, 20, 25... mm), and half-millimetre steps (10.5, 11.5, 12.5... mm). Holding `Shift` allows unconstrained free-distance dragging. Manual inputs in the panel remain open to arbitrary values.
- A compact error tray appears at the bottom right, above the status bar. Each notice shows a short cause and a stable code, can be dismissed, and stays visible until dismissed. Repeated identical errors share one notice; the tray keeps the latest three. Unexpected JavaScript errors and unhandled promise rejections also appear there.
- Extrude compute failures now report these codes: `CAD-C001` (3D engine unavailable), `CAD-C002` (Boolean geometry failed), `CAD-C003` (no 3D body intersection), `CAD-C004` (invalid thin wall), `CAD-C005` (zero or invalid distance), and `CAD-C006` (profile cannot form a solid). Unexpected runtime errors use `CAD-R001` or `CAD-R002` (async).
- Invalid sketch values/shapes and incompatible constraints use `CAD-S001` through `CAD-S004` in the same tray.
- Grid intersections can now win over a nearby angle guide when they are the better snap. When a tracked 15° direction passes through a visible grid intersection, the snap keeps both the exact angle and the grid point. A tracked direction can also snap to its exact crossing with a visible grid line. Line, Rectangle, and Circle now all track 15° increments after their first point; cardinal angles are included. If an arbitrary starting point and a grid intersection cannot lie on the same exact ray, the closest useful snap wins rather than falsely claiming both constraints.
- Implementation: `js/sketch-snap.js` combines angle and grid candidates, `js/sketch-tool.js` enables the same angle tracking for the three drawing tools, `js/extrude.js` emits compute error codes, and `app.js` with `css/error-notifications.css` renders the notices. Regression cases are in `tests/sketch-model.test.mjs`.
- Committed Extrude bodies are now converted once into triangle meshes with the bundled 3D kernel, then drawn with WebGL depth testing. Near or overlapping separate bodies occlude one another by their actual 3D surfaces, independent of body creation order. Feature edges are also depth tested. The prior face painter remains a fallback when WebGL is unavailable.
- The finished 3D view shows bodies without the old filled sketch profiles. Opening a sketch or Extrude still shows the sketch outlines needed for editing and profile selection. Unavailable depth rendering reports `CAD-V001`; failed body meshing reports `CAD-C007` in the bottom-right error tray. Separate bodies can still occupy the same volume; **Join** is required to merge them into one solid.
- Implementation: `js/body-renderer.js` owns the depth-tested 3D drawing and caches both prepared mesh topology and unchanged camera frames. `js/solid-kernel.js` exposes `meshBody`; `js/extrude.js` converts committed bodies in the background and falls back gracefully; `app.js` stops showing completed sketches as filled 2D profiles over the body view.
- Verification: `node --test tests/*.test.mjs` passes 95 tests. Local Edge checks confirmed `CAD-C005` for a real zero-distance Extrude attempt, successful automatic meshing after Extrude, pixel-identical overlapping-body screenshots when the body array order was reversed, the Show Mesh overlay on an extruded cylinder, and Fillet/Chamfer previews, commits, and undo/redo on solid edges.
- **INSPECT → Show Mesh** reveals the actual triangle edges of finished 3D bodies. Hidden edges remain occluded by the depth buffer; the choice is saved locally. Turn it off to return to Shaded or Shaded with visible edges. This view does not change the body geometry.
- Circles and arcs now use a radius-aware tessellation count for sketch profiles and thin extrusions. It targets at most 0.01 mm chord deviation where possible, with 64–512 segments for a full circle. The cap keeps large models responsive; exceptionally large radii may exceed that deviation. The underlying sketch circle still stores its exact center and radius.
- A custom "perfect mesh" engine is not needed at this stage: the bundled Manifold kernel already provides solid meshes and Boolean operations, and WebGL supplies depth-tested drawing. Meshes approximate curved surfaces; future exact cylindrical face editing or manufacturing interchange would need a separate surface/B-rep model rather than more display triangles.
- The 3D toolbar now has **FILLET** and **CHAMFER** beside EXTRUDE and HOLE; these are hidden while a sketch is being edited. Select one visible solid edge, enter a radius or equal-distance chamfer in millimetres, or drag the on-canvas arrow to adjust it. The solid preview updates before **OK**. **CANCEL** or `Esc` leaves the body unchanged; undo/redo restores the previous or new body. Straight exterior and reentrant edges use a local 3D Boolean cut/add. The top or bottom rim of an untouched circular extrusion is treated as one continuous circular edge and rebuilt from a revolved profile for a clean result.

## Performance approach

The workspace has no network service; its 3D kernel is bundled locally and loads only when needed. Drawing requests are combined into one browser animation frame. The coordinate grid is redrawn only when its camera, plane, viewport, or visibility changes; its lines are projected from two screen-space axes and batched by style. Committed bodies reuse their triangle meshes and prepared edges, including for Show Mesh, and an unchanged camera/body frame reuses the prior WebGL image. Sketch profiles, snapping candidates, Fillet corners, and Trim hit geometry are reused until the sketch changes. Trim strokes also reuse their intersection calculations. Measurements use one entity lookup per rendered sketch instead of searching the full sketch for every label. Canvas resolution is capped on very large or high-density displays to control memory use.

These measures target responsive editing on current desktop browsers. Performance still depends on the computer and sketch complexity; dense intersecting geometry can take longer to rebuild. The app has been checked in a local Edge browser and is not yet verified across all browser and operating-system combinations.

## What works today

### Workspace and navigation

- The 3D workspace shows an adaptive millimetre grid, X/Y/Z axes, origin planes, and a ViewCube. The grid is bounded to 1000 mm and has a 1.25 mm minimum spacing.
- Click **SKETCH**, then choose the XY, XZ, or YZ origin plane. The grid follows the plane under the pointer during selection. The camera smoothly faces the chosen plane, and sketch editing happens in the main 3D workspace.
- Click ViewCube faces, edges, or corners to change views with a camera transition. Drag the cube to orbit. Camera navigation also supports views from below the model.
- Middle mouse drag pans; Shift + middle mouse drag orbits; the wheel or Ctrl + Shift + middle mouse drag zooms. Double-clicking the middle mouse button fits the view.
- The panel at the bottom center selects Orbit, Pan, or Zoom for left-button dragging. **Fit** frames the drawing. **Display Settings** switches between **Shaded** and **Shaded with visible edges** for finished bodies; the chosen style is saved in the browser. The top **INSPECT** menu toggles **Show Mesh** independently.
- **SETTINGS** controls orbit type, reverse zoom direction, and camera pivot. The defaults are Fusion mouse setup, Constrained Orbit, normal zoom direction, and camera pivot enabled. Camera preference changes are not saved between page loads. The **Shortcuts** category lets users assign unique single-letter sketch and Extrude shortcuts; those bindings are saved in browser local storage when available.
- The browser tree can collapse and expand. Origin planes (XY, XZ, YZ) start hidden by default and can be toggled manually in the tree. Clicking **SKETCH** temporarily displays all planes for selection; once a sketch opens, the plane tiles are automatically closed and hidden from the 3D workspace. Visibility can still be toggled manually from the browser tree if needed.
- In sketch mode, 3D tools (**EXTRUDE**, **HOLE**, solid **FILLET**, and **CHAMFER**) are hidden. Sketch creation tools include **LINE**, **RECTANGLE**, **CIRCLE**, **CONSTRUCTION**, **POINT**, **FILLET**, **TRIM**, **MIRROR**, **OFFSET**, and a **PATTERN** menu containing **Circular Pattern** and **Rectangular Pattern**. Inspection and constraint tools include **DISTANCE**, **ANGLE**, **MIDPOINT**, **HORIZONTAL / VERTICAL**, **FIX / UNFIX**, **TANGENT**, **COINCIDENT**, and **EQUAL**. The toolbar wraps to additional rows when the window is narrow, instead of requiring horizontal scrolling. **FINISH SKETCH** leaves editing without deleting the sketch, restoring 3D tools. Sketches are named Sketch 1, Sketch 2, and so on, and can be reopened from the browser tree. Extruded objects appear under **Bodies** in the browser tree, with a visibility control for each body.

### Extrude

1. Press `E` while editing a sketch to finish it and open **EXTRUDE** in one step. After finishing a sketch, press `E` or click **EXTRUDE**. Sketch outlines stay visible before and during profile selection, with a stronger outline on selected regions. The coordinate grid and origin axes remain visible while the tool is open, according to their browser visibility setting.
2. Choose a type and select at least one item:
   - **Solid Extrude** accepts closed, filled sketch regions. Click multiple regions to extrude them together; click a selected region again to deselect it. Nested outlines are separate profiles, so selecting an outer ring leaves its center open.
   - **Thin Extrude** accepts open or closed sketch curves. **Thickness** creates a wall centered on each selected curve. **Chaining** joins connected, unbranched lines and arcs; turn it off to select one curve at a time.
3. Choose **One Side**, **Symmetric**, or **Two Sides**. One Side allows a negative distance to reverse direction. Symmetric divides its total distance equally across the sketch plane. Two Sides has separate distances for the two directions. The arrow's floating box stays visible with the direction and distance values.
4. Choose **New Body**, **Join**, **Cut**, or **Intersect**. Boolean operations use the bodies' 3D overlap, including bodies on different sketch planes or at different depths. They update affected bodies and support undo/redo.
5. Enter millimetres in the panel or drag the **3D arrow** on the model. The arrow follows the sketch plane normal; Symmetric and Two Sides show a separate arrow for each end. Dragging an arrow updates the distance field to 0.001 mm precision and immediately refreshes the translucent body preview.
6. Click **OK** to create or update a grey body under **Bodies** in the browser tree, or **CANCEL** / `Esc` to leave without changing one. Finished bodies use depth-tested 3D surfaces and edges. Bodies can be shown or hidden from that tree. The `E` shortcut can be changed in **Settings → Shortcuts**.

### Solid Fillet and Chamfer

After creating a body, choose **FILLET** or **CHAMFER** on the 3D toolbar. Hover a visible body edge to highlight it, click once to select it, and enter a radius or chamfer distance in the panel or drag the arrow on the model. The changed body appears before confirmation. **OK** commits one undoable edit; **CANCEL** or `Esc` closes the tool. Each operation edits one edge or, for a simple circular extrusion, its whole circular rim. Sketch Fillet remains a separate sketch-only tool. Complex curved edges on joined/Boolean bodies and multi-edge corner blends are not yet supported; an invalid size or a cut that cannot form a solid disables **OK**.

### Sketch tools

| Tool | Shortcut | Current behavior |
| --- | --- | --- |
| Line | `L` | Click consecutive points to draw a connected chain of lines. Enter Length or Angle in the floating HUD. The green check stays beside the last committed point; click it to finish the chain. |
| Rectangle | `R` | Click opposite corners. Enter Width and Height in the floating HUD. |
| Circle | `C` | Click the center, then set size. Enter Radius in the floating HUD. |
| Construction | `X` | Toggle construction mode. Draw lines, rectangles, circles, and arcs as dashed helpers. With no drawing tool active, click an existing curve to convert it to or from construction geometry. Conversion supports undo/redo. Construction curves remain available for snapping and dimensions, but never create or divide filled profiles. |
| Point | `P` | Click the grid to add a sketch point. Points snap like other geometry and do not make a filled profile. |
| Fillet | `F` | Select the first line or arc, then the second. If they cross twice, choose the intended intersection. The curved preview and arrow show the rounded corner; drag the arrow or enter Radius in the floating HUD, then press **OK** or Enter. After confirmation, a persistent `R` radius label appears beside the new arc. **Chain Selection** rounds every unambiguous straight-edged corner in the connected chain in one undoable operation. |
| Trim | `T` | Hover to preview the portion between neighboring intersections. Click once to remove it, or hold the mouse button and sweep across multiple edges. One drag is one undo step. Works with lines, rectangle edges, circles, and arcs. |
| Mirror | `M` | Opens the same light panel style as the pattern tools. Select sketch objects, including points, pick a symmetry line (sketch line or origin X/Y axes), view live dashed ghost preview, and click OK to commit. **Chain Selection** selects connected curves together. Copied geometry retains its dimensions. |
| Offset | `O` | Select sketch curves to see a dashed copy and an arrow. Drag the arrow across the source curve to choose either side and set the distance, or enter a signed distance in the panel, then click OK. **Chain Selection** selects connected curves and joins consecutive offset lines at their corners. Lines, rectangles, circles, and arcs are supported. |
| Circular Pattern | — | Select sketch geometry, click **Select center** and pick a grid point, then enter quantity and sweep angle. Changing quantity or sweep shows live copies before confirmation. **Chain Selection** selects connected curves together. Full 360° patterns distribute copies evenly without duplicating the original. |
| Rectangular Pattern | — | Select sketch geometry, enter a direction angle, row and column quantities, and signed spacing in each direction, then click OK. Quantity and spacing changes show live copies; **Chain Selection** selects connected curves together. |
| Distance | `D` | Click two points, a line body, a rectangle edge, or a circle boundary to place permanent dimension annotations. |
| Angle | `A` | Click two intersecting lines to measure and display the angle. |
| Midpoint | — | Click a line or rectangle edge to place a midpoint marker. |
| Horizontal / Vertical | `H` | Fusion 360-style constraint: click a line to toggle it horizontal or vertical, or click two points (endpoints, circle centers, rectangle corners, sketch points, or origin `[0,0]`) to align them horizontally or vertically. Clicking an active badge removes the constraint. Dragging constrained endpoints or points strictly preserves alignment without tilting. |
| Fix / Unfix | — | Click a line, rectangle, circle, arc, or point to lock or unlock its geometry. The padlock marker shows fixed objects. |
| Tangent | `G` | Click a free line with a circle or arc, or two circular curves. The geometry moves until the curves touch at one point, then keeps the relation. Arc contact must lie on its visible sweep. |
| Coincident | — | Click two point handles, or a point and a line, rectangle edge, circle, or arc. The selected point stays on its partner as geometry changes. |
| Equal | — | Click two lines or rectangle edges, or two circular curves (circles and arcs). Adjacent edges of one rectangle can also be made equal. Changing either size updates the other. |

Drawing points retain 0.001 mm precision while nearby visible grid intersections and grid lines, existing endpoints, edge midpoints, line and rectangle edges, and circle rims attract the pointer. Angle guides and the visible grid can snap together where their geometry meets. On a grid line, the coordinate along that line remains free at 0.001 mm precision unless an active angle guide crosses it. The visible grid stays coarser for readability and rendering speed. Millimetre values display up to three decimal places. A midpoint symbol appears when the pointer approaches one. Sketch boundaries become thicker and blue on hover while a drawing or dimension tool is active. Drawing is limited to the origin grid. During a continuous line, its value panel stays above the fixed green finish button.

With a drawing tool active, hover over a circle or arc center, endpoint, rectangle corner, or sketch point without clicking. Moving away from that point temporarily snaps to its horizontal or vertical axis (0°, 90°, 180°, or 270°). A dashed guide joins the source point to a square snap marker. Clicking places geometry at the inferred position. The reference clears after placement, when leaving the canvas, or when changing tools. Once the first point of a **Line**, **Rectangle**, or **Circle** has been placed, the next point snaps at every 15° around it. The Line's floating Angle field shows the resulting angle. A tracked angle also snaps to visible grid intersections and grid lines where possible.

Existing sketch point handles (line endpoints, rectangle corners, circle centers, standalone points, and the origin) highlight on hover. Click one with no tool active to select it; click it again to clear the selection. With Line, Rectangle, Circle, or Distance active, clicking a handle selects it and uses its exact location for the ongoing drawing or measurement. Selected handles remain highlighted until another point is chosen or the sketch changes.

When a new line endpoint, rectangle corner, circle center, or sketch point is placed on an existing point or curve, the connection is saved as an undoable Coincident relation. A line attached to a circle rim keeps its contact angle as the circle moves or changes radius; a point attached to a straight edge keeps its position along that edge. Consecutive Line segments also share a persistent endpoint. Undoing the new geometry removes its automatic relations in the same step.

Each active sketch tool uses a native browser cursor with its own icon, so the symbol follows the pointer without a separately rendered animation frame.

After the first point, the floating dimension fields show live values. `Tab` locks the current value and moves to the next field. Line can lock either Length or Angle; Circle can lock Radius; Rectangle can lock both Width and Height independently, and pressing `Tab` again on a locked rectangle field unlocks it. A click commits each line segment and immediately starts the next one; the green check finishes Line. Other shapes finish with `Enter` or a second click. `Escape` cancels a pending shape or closes the active palette. Values entered manually remain visible as dimension annotations.

A single right-click on the sketch canvas opens a shortcut menu around the pointer with Mirror, all eight red toolbar tools (Distance, Angle, Midpoint, Horizontal / Vertical, Fix / Unfix, Tangent, Coincident, and Equal), and Cancel. Click an option to activate it; the pointer remains at the center of the menu until moved.

### Keyboard and mouse controls reference

| Context | Action | Control |
| --- | --- | --- |
| **Navigation** | Pan | Middle mouse button (MMB) drag (1:1 tracking, zero drift) |
| **Navigation** | Orbit | `Shift` + MMB drag, or drag ViewCube |
| **Navigation** | Zoom | Mouse scroll wheel, or `Ctrl` + `Shift` + MMB drag |
| **Navigation** | Fit View | Double-click Middle Mouse Button (MMB) |
| **Sketching** | Tool shortcuts | `L` (Line), `R` (Rectangle), `C` (Circle), `X` (Construction), `P` (Point), `F` (Fillet), `T` (Trim), `M` (Mirror), `O` (Offset), `D` (Distance), `A` (Angle), `H` (Horizontal / Vertical), `G` (Tangent). Other sketch tools start unbound; shortcuts can be assigned in Settings. |
| **Sketching** | Lock & cycle HUD inputs | `Tab` |
| **Sketching** | Complete / Cancel shape | `Enter` (confirm) / `Escape` (cancel) |
| **3D workspace** | Extrude closed profiles | `E` (or the EXTRUDE toolbar button) |
| **Direct Manipulation** | Resize unconstrained elements | Drag circle perimeter, line endpoints, rectangle edges or corners |
| **Direct Manipulation** | Move circle | Drag center point |
| **Dimensions** | Move dimension label | Click and drag dimension text |
| **Dimensions** | Edit dimension value | Double-click dimension text and enter new value |
| **Workspace** | Tool Search | `S` (Opens floating tool search bar at mouse cursor; search and activate any CAD tool) |
| **History** | Undo / Redo | `Ctrl+Z` (Undo), `Ctrl+Y` or `Ctrl+Shift+Z` (Redo) |

### Measurements, constraints, and direct manipulation

- **Constant (defined) vs unconstrained geometry (Fusion 360 style)**:
  - Geometry with defined dimensions (e.g. circle with diameter/radius, line with length, rectangle with width and height, or geometry measured via `D`) is considered **constant** and rendered in solid CAD black (`#182230`).
  - Unconstrained geometry without defined dimensions is rendered in CAD blue (`#127fb2`).
  - Vertices and endpoints are rendered as CAD dots (white interior with black border when constant, blue border when unconstrained).
- **Direct drag-to-resize (pull to extend, push to shorten)**:
  - In sketch mode, unconstrained geometry can be directly grabbed and dragged with the mouse to dynamically resize:
    - **Circle**: Grab the perimeter to dynamically expand outward or shrink inward towards the center. Dragging the center moves the circle. Constant circle perimeters are locked.
    - **Line**: Grab either endpoint to pull and lengthen or push and shorten the line, or rotate its angle. If length is constant, dragging an endpoint rotates the line keeping length fixed.
    - **Rectangle**: Grab an unconstrained edge to drag perpendicular and resize width or height. Grab a corner to resize. Constant edges/dimensions strictly remain locked: if Width is constant, vertical edges (Edge 1 & 3) and corner X axes are locked (width never stretches); if Height is constant, horizontal edges (Edge 0 & 2) and corner Y axes are locked (height never stretches). When both dimensions are constant, resizing is completely locked.
  - Interactive cursor feedback changes on hover over handles (`ew-resize`, `ns-resize`, `nwse-resize`, `nesw-resize`, `crosshair`, `default`).
  - All drag resizing operations seamlessly integrate with the undo/redo stack (`Ctrl+Z`, `Ctrl+Y`).
- Distance annotations remain in the sketch after changing tools or finishing the sketch. A line or rectangle edge measurement stays linked to that geometry; a circle diameter stays linked to the circle. Two-point measurements retain their selected points.
- A body or boundary gets only one dimension for each length, width, height, or diameter, including when its value was entered while drawing. Opposite rectangle edges share the same width or height dimension. Undoing a new Distance dimension returns that geometry to its earlier unconstrained state.
- Drag a dimension label to reposition it. For a straight measurement, extension lines remain attached to the geometry endpoints. The dimension bar moves perpendicular to the edge, while its label can slide along the bar. A circle diameter rotates around its fixed center as its label moves; both arrowheads stay on the circumference. A label outside the circle has a short horizontal leader.
- Double-click a line length, rectangle edge length, or circle diameter label to enter a new value. The line start, rectangle start corner, or circle center stays fixed. Typed rectangle Width/Height and circle Radius/Diameter annotations can also be edited, keeping defined dimensions constant and black.
- Closed regions made from lines, rectangles, or circles have a light blue fill. Intersections can split a region into separate selectable profiles; these regions can be extruded into 3D bodies after finishing the sketch.
- Sketch creation, dimensions, markers, edits, drag resizing, filleting, trimming, mirroring, and annotation movement support undo/redo with `Ctrl+Z` and `Ctrl+Y` or `Ctrl+Shift+Z`.
- **Horizontal / Vertical Constraint (`H`) (Fusion 360 style)**:
  - **Single Line Alignment & Toggle**: Clicking a line aligns it to horizontal or vertical based on its dominant axis. Clicking the line again toggles the constraint off.
  - **Point-to-Point Alignment**: Click any two sketch points (line endpoints, circle centers, rectangle corners, sketch points, or origin `[0, 0]`) to align them horizontally or vertically. A dashed alignment line and endpoint rings guide selection, and `Escape` cancels pending selection.
  - **Constraint Preservation on Drag**: Dragging an endpoint of a horizontal or vertical line keeps the axis strictly locked so the line never tilts or loses alignment. When two points are constrained, dragging one dynamically shifts the other unless the partner is fixed or the origin.
  - **Interactive Constraint Badges**: Each constraint renders a crisp `H` or `V` badge (or `T` for Tangent) on canvas. Hovering over a badge highlights it in red, and clicking the badge deletes the constraint with full undo/redo support.
- Fix / Unfix is undoable. Fixed objects render in black with a padlock marker and cannot be dragged, resized by editing a dimension, trimmed, or filleted until unfixed.

## Current limits and planned work

**EXTRUDE** creates prism bodies from closed regions or thin walls around sketch curves. A line that enters a circle or rectangle and stops inside it no longer removes the surrounding closed profile. The distance box stays beside the 3D arrow and shows One Side, Symmetric, or Two Sides values. Finished bodies are grey. Join, Cut, and Intersect calculate actual 3D intersections, including bodies from different sketch planes and different depth ranges; an extrusion touching several bodies updates all affected bodies. The bundled geometry engine loads on demand for Boolean operations and for preparing finished body meshes, including when the app is opened directly from `file://`. Curves are approximated by segments for the displayed body. Branched curve networks require selecting individual branches; very thick walls around tight corners can be invalid and cannot be confirmed. Each extrusion keeps a snapshot of its profile, so later sketch edits do not update an existing body. Face editing is not implemented.

**MOVE/ROTATE** works on finished 3D bodies. Click the toolbar button, then click a body surface. **Free Move** lets you drag the body in the view plane, drag one of the X/Y/Z axis arrows, or enter exact X/Y/Z translation in millimetres and X/Y/Z rotation in degrees. The default rotation pivot is the body center; **Set Pivot** lets you click a mesh vertex instead. **Point to Point** moves the chosen body vertex to another body vertex or a clicked location in the current view plane. **Create Copy** preserves the source body and commits the transformed result as a new body. Both modes show a live body preview and use one undo/redo step on confirmation. The transformed mesh is the actual geometry used by later 3D operations. Point selection currently snaps to mesh vertices; arbitrary target clicks use the view plane through the chosen origin point.

**BODY FACES** are selectable in the 3D workspace. Click a planar face to tint that face blue. With the face selected, **SKETCH** creates an editable sketch directly on its 3D plane, including faces of moved or rotated bodies. **EXTRUDE** or `E` extends the face itself without requiring a sketch; it opens with **Join** selected and retains the normal direction, distance, and operation controls. The sketch browser gives each sketch its own eye button, including sketches on body faces; hidden sketches disappear from the 3D view and cannot be selected for extrusion until shown again. A face sketch stores the face plane at creation time; later moving the source body does not yet move that sketch with it.

Fillet handles shared straight-edge corners and crossings between straight edges, circles, and circular arcs. A line ending on a circle boundary can also be rounded. For intersecting edges, select the two edges first; when they cross twice, choose the intended intersection. **HOLE** remains a placeholder.

**FILE OPERATIONS & UNIVERSAL IMPORTERS**:
- **draw.io-Style "Save As" Dialog**: Saving (`Ctrl+S`, menu items) opens a custom dark floating modal inspired by draw.io. Lets the user configure filename, format (`.ocad`, Binary/ASCII `.stl`), and target destination (`Download to Device` or `Browser Local Storage Draft`) with interactive `Reset`, `Cancel`, and `Save` buttons.
- **In-App "New Design" Confirmation**: Starting a fresh design (`Ctrl+Alt+N`) no longer triggers generic browser alert popups; an integrated themed confirmation dialog prompts the user to `Save & New`, `Discard & New`, or `Cancel`.
- **Project Persistence (`.ocad`)**: Projects are saved to and opened from native `.ocad` files (`Ctrl+S`, `Ctrl+O`), including document title, custom face planes (`FACE-N`), 2D sketches, 3D bodies (parameters + mesh), and camera basis/position. Opening non-`.ocad` files is rejected with a validation error.
- **Export STL (`.stl`)**: Exports visible 3D bodies to high-performance standard binary STL with calculated surface normal vectors ($N = (v_2 - v_1) \times (v_3 - v_1)$) for direct slicing in Cura, PrusaSlicer, Bambu Studio, OrcaSlicer, or Blender.
- **Universal Importers (`.stl`, `.step`, `.stp`, `.obj`, `.dxf`)**:
  - **STL Import**: Parses Binary and ASCII STL, welds duplicate vertices via spatial hashing, and creates solid 3D bodies in the scene.
  - **STEP Import**: ISO 10303-21 reader for faceted B-Rep, Cartesian points, edge loops, poly loops, and AP242 tessellations, triangulated via ear-clipping.
  - **OBJ Import**: Parses Wavefront vertices, normals, and triangulates quads/n-gons into 3D solid bodies.
  - **DXF Import**: Comprehensive 2D drawing parser supporting `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE` (with bulge curvature arc conversion), `ELLIPSE`, and `SPLINE`. Automatically creates an editable 2D sketch on the XY plane (or adds to an active sketch) ready for immediate 3D extrusion. Also supports `3DFACE` as 3D mesh.
  - **Drag and Drop**: Dragging `.ocad`, `.stl`, `.step`, `.stp`, `.obj`, or `.dxf` onto the canvas immediately loads the file.

The current tangent relation handles lines, circles, and circular arcs. It is a focused geometry rule, not a general constraint solver: a line with an existing length or angle dimension must have that dimension removed before tangency can be applied. With Chain Selection, Offset joins consecutive straight segments at their shared corners; mixed line and arc chains still offset each curve separately.

The static app can be placed on a free static host, but this repository does not include a published deployment. Real-time collaboration is deferred for future work.

## Code map

The browser loads ordered scripts under the shared `window.WebCAD` namespace, so `index.html` also works directly from a `file://` URL.

- `app.js` connects the interface, camera, sketches, tools, history, and rendering.
- `js/sketch-model.js`, `js/sketch-geometry.js`, `js/sketch-constraints.js`, `js/sketch-grid.js`, and `js/sketch-snap.js` define millimetre geometry, relations, dimensions, the visible grid, and snapping.
- `js/sketch-hit-test.js`, `js/sketch-chain.js`, `js/sketch-tool.js`, `js/sketch-fillet.js`, `js/sketch-trim.js`, `js/sketch-mirror.js`, `js/sketch-pattern.js`, `js/sketch-wheel.js`, `js/toolbar-menu.js`, `js/sketch-cursor.js`, and `js/sketch-annotation-interaction.js` handle boundary detection, connected-curve selection, tool input, corner filleting, trimming, mirroring, offsets, patterns, the right-click wheel, toolbar menus, pointer icons, label dragging, and dimension editing.
- `js/sketch-dimensions.js`, `js/sketch-distance.js`, `js/sketch-angle.js`, `js/sketch-profiles.js`, and `js/sketch-render.js` calculate and draw measurements, profiles, and entities.
- `js/extrude.js` builds and previews 3D bodies from selected closed regions or thin walls around curves, and directly from a selected planar body face. `js/body-renderer.js` depth-tests finished body surfaces and identifies visible feature edges. `js/body-faces.js` groups coplanar mesh triangles into selectable faces and creates face sketch planes. `js/solid-bevel.js` handles solid Fillet/Chamfer selection, preview, and history. `js/body-move.js` handles body Move/Rotate, point selection, previews, copies, and history. `js/solid-kernel.js` prepares meshes and performs 3D Join, Cut, Intersect, and edge bevels using the locally bundled Manifold engine. The engine is loaded on demand; its Apache 2.0 license is at `js/vendor/manifold/LICENSE`.
- `js/project-io.js` serializes and restores full onlineCAD documents (`.ocad`), saves projects, and exports binary STL files for 3D printing.
- `js/importers.js` parses STL (Binary/ASCII), OBJ, ISO 10303-21 STEP, and AutoCAD DXF files with ear-clipping triangulation and automatic sketch generation.
- `js/camera.js`, `js/model-view.js`, `js/sketch-view.js`, and `js/view-cube.js` handle navigation and views. Styles are organized by interface area in `css/`.
- `js/shortcuts.js` owns default and user-set tool bindings; `js/settings.js` renders the preferences panel.

For project intent and handoff notes, see [GEMINI.md](GEMINI.md) and [AI_HANDOFF.md](AI_HANDOFF.md).

## Checks

- **Model & Geometry Unit Tests**: Run `node --test tests/sketch-model.test.mjs` to check sketch geometry, dimensions, snapping, profiles, and undo/redo.
- **Browser smoke check**: Open `index.html`, draw and finish a closed sketch, press `E`, select a profile, drag the 3D arrow to change distance, and confirm the body. Try Symmetric and Two Sides to check both arrows and distance values. Extrude intersecting sketches on two different planes; try Join, Cut, and Intersect, then undo and redo. Also try **Thin Extrude** on an open line with a chosen thickness. Verify the sketch toolbar, Distance, and Shortcuts.
- **Body move check**: After extruding a body, open **MOVE/ROTATE**, select its face, drag an axis arrow, enter a rotation, and confirm. Undo and redo the change. Try **Point to Point** with a selected body vertex and a target point, then enable **Create Copy** and confirm that two bodies appear.
- **Face check**: Click a body face and confirm the blue face highlight. Click **SKETCH** to draw on that face, finish the sketch, and hide/show it with its browser eye button. Select the face again and press `E` to extend it directly; confirm that **Join** updates the existing body.
