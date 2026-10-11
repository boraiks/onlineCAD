(function (cad) {
  'use strict';

  const { dot, cross, normalize, mix, mixVector, addScaled } = cad.math;
  const { prepare, line, polygon, pointInPolygon } = cad.canvas;
  const { sketch, grid, axisColors } = cad.planes;
  const settings = cad.settings;

  function gridState(name) {
    const plane = grid[name];
    return {
      u: [...plane.u],
      v: [...plane.v],
      origin: [...(plane.origin || [0, 0, 0])],
      colors: plane.axes.map(axis => axisColors[axis]),
    };
  }

  function mixColor(first, second, amount) {
    const channels = [1, 3, 5].map(index => {
      const a = parseInt(first.slice(index, index + 2), 16);
      const b = parseInt(second.slice(index, index + 2), 16);
      return Math.round(mix(a, b, amount)).toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }

  function tileCorners(project, name, size, offsetRatio = 0.14) {
    const plane = sketch[name];
    const offset = offsetRatio * size;
    return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => project([
      (plane.u[0] * (u * size + offset) + plane.v[0] * (v * size + offset)),
      (plane.u[1] * (u * size + offset) + plane.v[1] * (v * size + offset)),
      (plane.u[2] * (u * size + offset) + plane.v[2] * (v * size + offset)),
    ]));
  }

  function drawPlaneText(context, project, text, origin3D, dirU3D, dirV3D, color = '#60788a') {
    const p0 = project(origin3D);
    const pU = project(addScaled(origin3D, dirU3D, 1));
    const pV = project(addScaled(origin3D, dirV3D, 1));

    const du = [pU[0] - p0[0], pU[1] - p0[1]];
    const dv = [pV[0] - p0[0], pV[1] - p0[1]];

    const lenU = Math.hypot(du[0], du[1]);
    const lenV = Math.hypot(dv[0], dv[1]);
    if (lenU < 0.05 || lenV < 0.05) return;

    let normU = [du[0] / lenU, du[1] / lenU];
    let normV = [dv[0] / lenV, dv[1] / lenV];

    const det = normU[0] * normV[1] - normU[1] * normV[0];
    if (det < 0) {
      normV = [-normV[0], -normV[1]];
    }

    if (normU[0] < -0.3 || (Math.abs(normU[0]) <= 0.3 && normU[1] < 0)) {
      normU = [-normU[0], -normU[1]];
      normV = [-normV[0], -normV[1]];
    }

    context.save();
    context.transform(normU[0], normU[1], normV[0], normV[1], p0[0], p0[1]);
    context.font = '600 11px Consolas, monospace';
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(text, 0, 0);
    context.restore();
  }

  class ModelView {
    constructor({ canvas, pane, camera, onPlaneSelect, onCameraChange, getFaceAt = null, getBodies = null, getActiveSketch = null }) {
      this.canvas = canvas;
      this.pane = pane;
      this.camera = camera;
      this.onPlaneSelect = onPlaneSelect;
      this.onCameraChange = onCameraChange;
      this.getFaceAt = getFaceAt;
      this.getBodies = getBodies;
      this.getActiveSketch = getActiveSketch;
      this.picking = false;
      this.hoveredPlane = null;
      this.hitAreas = [];
      this.gridPlane = 'XY';
      this.grid = gridState('XY');
      this.gridMotion = null;
      this.gridFrame = 0;
      this.drag = null;
      this.navigationMode = null;
      this.suppressNavigationClick = false;
      this.gridCacheCanvas = null;
      this.gridCacheKey = null;
      this.suppressPlaneClick = false;
      this.visibility = {
        origin: true,
        O: true,
        X: true,
        Y: true,
        Z: true,
        XY: false,
        XZ: false,
        YZ: false,
      };
      this.bindEvents();
    }

    findTargetPointAt(clientX, clientY) {
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [clientX - bounds.left, clientY - bounds.top];

      // 1. Raycast onto visible 3D bodies: if cursor is directly on a body, use that exact surface hit point
      const bodies = (this.getBodies ? this.getBodies() : null) ||
        window.WebCAD?.app?.extrudeController?.bodies || [];
      const bodyHit = cad.bodyFaces?.hitPointAt?.(screen, bodies, this.camera, bounds);
      if (bodyHit?.point) {
        return bodyHit.point;
      }

      // 2. If cursor is not on any body, but there are visible bodies, orbit around the exact center of the closest body
      const closestCenter = cad.bodyFaces?.closestBodyCenter?.(screen, bodies, this.camera, bounds);
      if (closestCenter) {
        return closestCenter;
      }

      // 3. Fallback when there are no bodies in the scene: camera ray setup
      const unit = this.camera?.unit?.(bounds.width, bounds.height);
      if (!unit || unit <= 0) return [0, 0, 0];
      const origin = this.camera?.origin?.(bounds.width, bounds.height);
      if (!origin) return [0, 0, 0];
      const [originX, originY] = origin;
      const horizontal = (screen[0] - originX) / unit;
      const vertical = (originY - screen[1]) / unit;
      const pivot = settings?.cameraPivot ? this.camera.pivot : [0, 0, 0];
      const rayOrigin = pivot.map((val, idx) => val + this.camera.right[idx] * horizontal + this.camera.up[idx] * vertical);

      const intersectPlane = planeName => {
        const plane = cad.planes?.grid?.[planeName] || grid?.[planeName];
        if (!plane) return null;
        const { u, v, origin = [0, 0, 0] } = plane;
        const normal = cross(u, v);
        const divisor = dot(normal, this.camera.depth);
        if (Math.abs(divisor) < 0.04) return null;
        const distance = dot(normal, origin.map((val, idx) => val - rayOrigin[idx])) / divisor;
        return rayOrigin.map((val, idx) => val + this.camera.depth[idx] * distance);
      };

      // 3. Active sketch plane
      const activeSketch = (this.getActiveSketch ? this.getActiveSketch() : null) ||
        window.WebCAD?.app?.sketchTools?.getActiveSketch?.();
      if (activeSketch?.plane) {
        const pt = intersectPlane(activeSketch.plane);
        if (pt) return pt;
      }

      // 4. Current grid plane
      if (this.gridPlane) {
        const pt = intersectPlane(this.gridPlane);
        if (pt) return pt;
      }

      // 5. Default XY plane
      const xy = intersectPlane('XY');
      if (xy) return xy;

      // 6. Ray origin at current pivot depth
      return rayOrigin;
    }

    setNavigationMode(mode) {
      this.navigationMode = ['orbit', 'pan', 'zoom'].includes(mode) ? mode : null;
      this.pane.classList.toggle('has-navigation-tool', Boolean(this.navigationMode));
    }

    setVisibility(key, value) {
      if (key in this.visibility) {
        this.visibility[key] = Boolean(value);
        this.render();
      }
    }

    toggleVisibility(key) {
      if (key in this.visibility) {
        this.visibility[key] = !this.visibility[key];
        this.render();
        return this.visibility[key];
      }
      return true;
    }

    currentGrid() {
      if (!this.gridMotion) return this.grid;
      const progress = Math.min(1, (performance.now() - this.gridMotion.start) / this.gridMotion.duration);
      if (progress === 1) {
        this.grid = this.gridMotion.to;
        this.gridMotion = null;
        return this.grid;
      }
      const eased = progress * progress * (3 - 2 * progress);
      const from = this.gridMotion.from;
      const to = this.gridMotion.to;
      const u = normalize(mixVector(from.u, to.u, eased));
      const rawV = mixVector(from.v, to.v, eased);
      const v = normalize(addScaled(rawV, u, -dot(rawV, u)));
      this.grid = {
        u,
        v,
        origin: mixVector(from.origin || [0, 0, 0], to.origin || [0, 0, 0], eased),
        colors: from.colors.map((color, index) => mixColor(color, to.colors[index], eased)),
      };
      return this.grid;
    }

    setGridPlane(name) {
      if (!grid[name]) return;
      if (name === this.gridPlane) return;
      this.gridMotion = null;
      if (this.gridFrame) {
        cancelAnimationFrame(this.gridFrame);
        this.gridFrame = 0;
      }
      this.grid = gridState(name);
      this.gridPlane = name;
      this.render();
    }

    animateGrid() {
      if (this.gridFrame) return;
      this.gridFrame = requestAnimationFrame(() => {
        this.gridFrame = 0;
        this.render();
        if (this.gridMotion) this.animateGrid();
      });
    }

    setPicking(show, { preserveGrid = false } = {}) {
      this.picking = show;
      this.hoveredPlane = null;
      this.hitAreas = [];
      this.pane.classList.toggle('is-picking', show);
      this.canvas.classList.remove('over-plane');
      if (show && this.lastPointer) {
        this.render();
        const initialPlane = this.planeAt(this.lastPointer.x, this.lastPointer.y);
        if (initialPlane) this.setHoveredPlane(initialPlane);
      } else {
        if (!preserveGrid) this.setGridPlane('XY');
        this.render();
      }
    }

    setHoveredPlane(nameOrFace) {
      if (nameOrFace === this.hoveredPlane) return;
      this.hoveredPlane = nameOrFace;
      this.canvas.classList.toggle('over-plane', Boolean(nameOrFace));
      if (typeof nameOrFace === 'string') {
        this.setGridPlane(nameOrFace || 'XY');
      } else if (nameOrFace && typeof nameOrFace === 'object') {
        const planeName = cad.bodyFaces.registerPlane(nameOrFace);
        this.setGridPlane(planeName);
      } else {
        this.setGridPlane('XY');
      }
      this.render();
    }

    planeAt(clientX, clientY) {
      if (this.getFaceAt) {
        const faceHit = this.getFaceAt(clientX, clientY);
        if (faceHit) return faceHit;
      }
      if (!this.visibility.origin) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const point = [clientX - bounds.left, clientY - bounds.top];

      // 1. Direct hit on visible origin plane tiles has top priority
      for (const area of [...this.hitAreas].reverse()) {
        if (pointInPolygon(point, area.visible)) return area.name;
      }

      // 2. 3D Ray-cast onto the 3 origin planes (XY, XZ, YZ) across entire workspace
      const [originX, originY] = this.camera.origin(bounds.width, bounds.height);
      const unit = this.camera.unit(bounds.width, bounds.height);
      if (unit <= 0) return null;

      const xCam = (point[0] - originX) / unit;
      const yCam = (originY - point[1]) / unit;

      const right = this.camera.right;
      const up = this.camera.up;
      const depth = this.camera.depth;

      const planes = [
        { name: 'XY', normal: [0, 0, 1] },
        { name: 'XZ', normal: [0, 1, 0] },
        { name: 'YZ', normal: [1, 0, 0] },
      ];

      let bestPlane = null;
      let maxT = -Infinity;

      for (const p of planes) {
        if (!this.visibility[p.name]) continue;
        const dotDepth = dot(p.normal, depth);
        const absDotDepth = Math.abs(dotDepth);
        if (absDotDepth < 0.05) continue; // nearly edge-on

        // Orient normal toward camera view direction (+depth)
        const sign = dotDepth >= 0 ? 1 : -1;
        const nCam = p.normal.map(val => val * sign);

        // Ray equation: P(t) = xCam * right + yCam * up + t * depth
        // dot(nCam, P(t)) = 0 => t = - (xCam * dot(nCam, right) + yCam * dot(nCam, up)) / absDotDepth
        const t = - (xCam * dot(nCam, right) + yCam * dot(nCam, up)) / absDotDepth;

        if (t > maxT) {
          maxT = t;
          bestPlane = p.name;
        }
      }

      return bestPlane;
    }

    drawGrid(context, project, unit, width, height) {
      if (!this.visibility.origin) return;

      const { u, v, colors, origin: gridOrigin = [0, 0, 0] } = this.currentGrid();
      const planeAxes = grid[this.gridPlane].axes;
      const axisU = planeAxes[0];
      const axisV = planeAxes[1];
      const axisNorm = planeAxes[2];

      const { major: majorStep, minor: minorStep, extent: maxGridLimit } = cad.sketchGrid.steps(unit);
      const screenDiag = Math.hypot(width, height);
      const panWorld = Math.hypot(this.camera.panX, this.camera.panY) / unit;
      const visibleWorld = ((screenDiag * 1.5) / unit) + panWorld;
      const range = Math.min(maxGridLimit, Math.max(majorStep * 4, visibleWorld));

      const world = (alongU, alongV, alongNormal = 0) => {
        const normal = cross(u, v);
        return gridOrigin.map((value, axis) => value + u[axis] * alongU +
          v[axis] * alongV + normal[axis] * alongNormal);
      };
      const origin = project(gridOrigin);
      const projectedU = project(world(1, 0));
      const projectedV = project(world(0, 1));
      const ux = projectedU[0] - origin[0], uy = projectedU[1] - origin[1];
      const vx = projectedV[0] - origin[0], vy = projectedV[1] - origin[1];
      const screenPoint = (alongU, alongV) => [
        origin[0] + alongU * ux + alongV * vx,
        origin[1] + alongU * uy + alongV * vy,
      ];
      const addGridLine = (start, end) => {
        context.moveTo(start[0], start[1]);
        context.lineTo(end[0], end[1]);
      };

      // 1. Minor 5x5 grid lines (faint, thin: 0.5px)
      if (minorStep * unit >= 4.5) {
        context.beginPath();
        const minIdx = Math.ceil(-range / minorStep);
        const maxIdx = Math.floor(range / minorStep);
        for (let i = minIdx; i <= maxIdx; i++) {
          if (i % 5 === 0) continue; // Skip major grid line
          const pos = +(i * minorStep).toFixed(4);
          if (Math.abs(pos) > range + 1e-4) continue;
          if (this.visibility[axisU]) {
            addGridLine(screenPoint(pos, -range), screenPoint(pos, range));
          }
          if (this.visibility[axisV]) {
            addGridLine(screenPoint(-range, pos), screenPoint(range, pos));
          }
        }
        context.strokeStyle = '#edf2f5';
        context.lineWidth = 0.5;
        context.stroke();
      }

      // 2. Major grid lines (clean, subtle: 0.75px)
      const majorMinIdx = Math.ceil(-range / majorStep);
      const majorMaxIdx = Math.floor(range / majorStep);
      context.beginPath();
      for (let i = majorMinIdx; i <= majorMaxIdx; i++) {
        const pos = +(i * majorStep).toFixed(4);
        if (Math.abs(pos) > range + 1e-4) continue;
        if (Math.abs(pos) < 1e-4) continue; // Skip axis line
        if (this.visibility[axisU]) {
          addGridLine(screenPoint(pos, -range), screenPoint(pos, range));
        }
        if (this.visibility[axisV]) {
          addGridLine(screenPoint(-range, pos), screenPoint(range, pos));
        }
      }
      context.strokeStyle = '#d0dce4';
      context.lineWidth = 0.75;
      context.stroke();

      // 3. Primary axes with solid positive and dashed negative up to range (max 1000mm)
      // Positive & negative U axis
      if (this.visibility[axisU]) {
        line(context, origin, screenPoint(range, 0), colors[0], 1.2);
        context.save();
        context.setLineDash([4, 3]);
        line(context, origin, screenPoint(-range, 0), colors[0], 1.0);
        context.restore();
      }

      // Positive & negative V axis
      if (this.visibility[axisV]) {
        line(context, origin, screenPoint(0, range), colors[1], 1.2);
        context.save();
        context.setLineDash([4, 3]);
        line(context, origin, screenPoint(0, -range), colors[1], 1.0);
        context.restore();
      }

      // Normal axis (Z)
      if (this.visibility[axisNorm]) {
        line(context, origin, project(world(0, 0, range * 0.15)), colors[2], 1.2);
        context.save();
        context.setLineDash([4, 3]);
        line(context, origin, project(world(0, 0, -range * 0.1)), colors[2], 1.0);
        context.restore();
      }

      // 4. Coordinate indicators:
      const labelLimit = Math.min(range, majorStep <= 2.5 ? 20 : majorStep * 20);
      const labelMaxIdx = Math.floor(labelLimit / majorStep);
      const offset = 6 / unit;

      for (let i = 1; i <= labelMaxIdx; i++) {
        const val = +(i * majorStep).toFixed(4);
        if (val > labelLimit + 1e-4) break;
        const textPos = String(val);
        const textNeg = `-${val}`;

        // Along U axis
        if (this.visibility[axisU]) {
          const posU = world(val, offset);
          drawPlaneText(context, project, textPos, posU, v, u.map(x => -x), '#60788a');

          const negU = world(-val, offset);
          drawPlaneText(context, project, textNeg, negU, v, u.map(x => -x), '#60788a');
        }

        // Along V axis
        if (this.visibility[axisV]) {
          const posV = world(offset, val);
          drawPlaneText(context, project, textPos, posV, u, v.map(x => -x), '#60788a');

          const negV = world(offset, -val);
          drawPlaneText(context, project, textNeg, negV, u, v.map(x => -x), '#60788a');
        }
      }
    }

    drawTile(context, project, name, size) {
      const plane = sketch[name];
      const corners = tileCorners(project, name, size, 0.10);
      const highlighted = this.hoveredPlane === name;
      context.save();
      context.globalAlpha = highlighted ? 0.92 : 0.65;
      context.fillStyle = highlighted ? 'rgba(39, 135, 191, .42)' : plane.fill;
      context.strokeStyle = highlighted ? '#1d87bd' : plane.stroke;
      context.lineWidth = highlighted ? 2.6 : 1.4;
      polygon(context, corners);
      context.restore();
      return corners;
    }

    render() {
      const { context, width, height } = prepare(this.canvas);
      context.fillStyle = '#f8fafb';
      context.fillRect(0, 0, width, height);
      const unit = this.camera.unit(width, height);
      const project = this.camera.projector(width, height);

      // Only draw grid if master origin visibility is true
      if (this.visibility.origin) {
        if (this.gridMotion) this.drawGrid(context, project, unit, width, height);
        else {
          const key = [this.canvas.width, this.canvas.height, width, height, this.gridPlane,
          this.camera.zoom, this.camera.panX, this.camera.panY,
          ...this.camera.right, ...this.camera.up, ...this.camera.pivot,
          settings.cameraPivot, this.visibility.X, this.visibility.Y, this.visibility.Z].join('|');
          if (key !== this.gridCacheKey) {
            this.gridCacheCanvas ||= document.createElement('canvas');
            this.gridCacheCanvas.width = this.canvas.width;
            this.gridCacheCanvas.height = this.canvas.height;
            const cacheContext = this.gridCacheCanvas.getContext('2d');
            const ratio = this.canvas.width / width;
            cacheContext.setTransform(ratio, 0, 0, ratio, 0, 0);
            cacheContext.clearRect(0, 0, width, height);
            this.drawGrid(cacheContext, project, unit, width, height);
            this.gridCacheKey = key;
          }
          context.drawImage(this.gridCacheCanvas, 0, 0, width, height);
        }
      }

      this.hitAreas = [];
      if (this.visibility.origin) {
        const tileSize = 75 / unit;
        for (const name of ['XZ', 'YZ', 'XY']) {
          if (this.picking || this.visibility[name]) {
            const visible = this.drawTile(context, project, name, tileSize);
            if (this.picking) {
              this.hitAreas.push({ name, visible });
            }
          }
        }
      }

      // Draw center origin point O
      if (this.visibility.origin && this.visibility.O) {
        const [originX, originY] = project([0, 0, 0]);
        context.beginPath();
        context.arc(originX, originY, 3, 0, Math.PI * 2);
        context.fillStyle = '#ffffff';
        context.fill();
        context.strokeStyle = '#5a7080';
        context.lineWidth = 1.2;
        context.stroke();
      }

      if (this.onDrawOverlay) this.onDrawOverlay(context, project);

      if (settings.cameraPivot && this.drag?.mode === 'orbit') {
        const [pivotX, pivotY] = project(this.camera.pivot);
        context.save();
        context.beginPath();
        context.arc(pivotX, pivotY, 8.5, 0, Math.PI * 2);
        context.strokeStyle = '#51b987';
        context.lineWidth = 1.8;
        context.stroke();
        context.beginPath();
        context.arc(pivotX, pivotY, 2.5, 0, Math.PI * 2);
        context.fillStyle = '#51b987';
        context.fill();
        context.restore();
      }
    }

    fitToScene(animate = true) {
      const bounds = this.canvas?.getBoundingClientRect ? this.canvas.getBoundingClientRect() : { width: 1200, height: 800 };
      const width = bounds.width || this.canvas?.width || 1200;
      const height = bounds.height || this.canvas?.height || 800;
      const bodies = (this.getBodies ? this.getBodies() : null) ||
        window.WebCAD?.app?.extrudeController?.bodies || [];
      if (animate) {
        this.camera.animateFit(this.onCameraChange, { bodies, width, height });
      } else {
        this.camera.fit({ bodies, width, height });
        this.onCameraChange();
      }
    }

    bindEvents() {
      this.canvas.addEventListener('pointerdown', event => {
        if (this.drag) return;
        const touchOrPen = event.pointerType !== 'mouse';
        const toolbarNavigation = !touchOrPen && event.button === 0 && this.navigationMode;
        if (!touchOrPen && event.button !== 1 && !toolbarNavigation) return;
        if (touchOrPen && event.button !== 0) return;
        const mode = toolbarNavigation || (touchOrPen ? 'orbit'
          : event.shiftKey && event.ctrlKey ? 'zoom' : event.shiftKey ? 'orbit' : 'pan');
        if (mode === 'pan') {
          this.camera.startPan();
        }
        if (mode === 'orbit') {
          const bounds = this.canvas.getBoundingClientRect();
          const targetPoint = this.findTargetPointAt(event.clientX, event.clientY);
          if (targetPoint) {
            this.camera?.setPivot?.(targetPoint, bounds.width, bounds.height);
          }
        }
        this.drag = {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          mode,
          toolbarNavigation: Boolean(toolbarNavigation),
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
        this.pane.classList.add('is-navigating');
        event.preventDefault();
        if (toolbarNavigation) event.stopImmediatePropagation?.();
        try { this.canvas.setPointerCapture(event.pointerId); } catch {}
      });

      this.canvas.addEventListener('pointermove', event => {
        this.lastPointer = { x: event.clientX, y: event.clientY };
        if (!this.drag) {
          if (this.picking) this.setHoveredPlane(this.planeAt(event.clientX, event.clientY));
          return;
        }
        if (event.pointerId !== this.drag.pointerId) return;
        if (this.drag.toolbarNavigation) event.stopImmediatePropagation?.();

        if (!this.drag.toolbarNavigation && this.drag.pointerType === 'mouse') {
          if (this.drag.mode === 'pan' && event.shiftKey) {
            this.drag.mode = 'orbit';
            const bounds = this.canvas.getBoundingClientRect();
            const targetPoint = this.findTargetPointAt(event.clientX, event.clientY);
            if (targetPoint) {
              this.camera.setPivot(targetPoint, bounds.width, bounds.height);
            }
          } else if (this.drag.mode === 'orbit' && !event.shiftKey) {
            this.drag.mode = 'pan';
            this.camera.startPan();
          }
        }

        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 4) this.drag.moved = true;
        if (this.drag.mode === 'pan') {
          this.camera.pan(dx, dy);
          this.onCameraChange();
        } else if (this.drag.mode === 'zoom') {
          this.camera.zoomAt(Math.exp(dy * 0.01 * (settings.reverseZoomDirection ? -1 : 1)), event.clientX, event.clientY, this.canvas.getBoundingClientRect());
          this.onCameraChange();
        } else {
          this.camera.orbit(dx, dy);
          this.onCameraChange();
        }
      });

      window?.addEventListener?.('keydown', event => {
        if (event.key === 'Shift' && this.drag && !this.drag.toolbarNavigation && this.drag.pointerType === 'mouse' && this.drag.mode === 'pan') {
          this.drag.mode = 'orbit';
          const bounds = this.canvas.getBoundingClientRect();
          const targetPoint = this.findTargetPointAt(this.drag.x, this.drag.y);
          if (targetPoint) {
            this.camera?.setPivot?.(targetPoint, bounds.width, bounds.height);
          }
          this.onCameraChange();
        }
      });

      window?.addEventListener?.('keyup', event => {
        if (event.key === 'Shift' && this.drag && !this.drag.toolbarNavigation && this.drag.pointerType === 'mouse' && this.drag.mode === 'orbit') {
          this.drag.mode = 'pan';
          this.camera?.startPan?.();
          this.onCameraChange();
        }
      });

      const endDrag = event => {
        if (this.drag?.toolbarNavigation) {
          this.suppressNavigationClick = true;
          setTimeout(() => { this.suppressNavigationClick = false; }, 0);
          event.stopImmediatePropagation?.();
        }
        if (this.drag?.pointerType !== 'mouse' && this.drag?.moved) {
          this.suppressPlaneClick = true;
          setTimeout(() => { this.suppressPlaneClick = false; }, 0);
        }
        if (this.drag?.mode === 'pan') {
          this.camera.releasePan();
        }
        this.drag = null;
        this.pane.classList.remove('is-navigating');
      };
      this.canvas.addEventListener('pointerup', endDrag);
      this.canvas.addEventListener('pointercancel', endDrag);
      this.canvas.addEventListener('lostpointercapture', endDrag);
      this.canvas.addEventListener('pointerleave', () => {
        if (!this.drag && this.hoveredPlane) this.setHoveredPlane(null);
      });
      this.canvas.addEventListener('click', event => {
        if (this.suppressNavigationClick || this.navigationMode && event.button === 0) {
          event.preventDefault(); event.stopImmediatePropagation?.(); return;
        }
        if (!this.picking || this.suppressPlaneClick) return;
        const name = this.planeAt(event.clientX, event.clientY);
        if (name) {
          event.preventDefault();
          event.stopImmediatePropagation?.();
          this.onPlaneSelect(name);
        }
      });
      this.canvas.addEventListener('auxclick', event => {
        event.preventDefault();
        if (event.button === 1 && event.detail === 2) {
          this.fitToScene(true);
        }
      });
      this.canvas.addEventListener('dblclick', event => {
        if (event.button !== 0) return;
        if (this.navigationMode === 'pan') {
          event.preventDefault();
          this.fitToScene(true);
          return;
        }
        const hitFace = this.getFaceAt?.(event.clientX, event.clientY);
        if (!hitFace && !this.activeSketchPlane) {
          this.fitToScene(true);
        }
      });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      this.canvas.addEventListener('wheel', event => {
        event.preventDefault();
        this.camera.zoomAt(Math.exp(event.deltaY * 0.001 * (settings.reverseZoomDirection ? -1 : 1)), event.clientX, event.clientY, this.canvas.getBoundingClientRect());
        this.onCameraChange();
      }, { passive: false });
    }
  }

  cad.ModelView = ModelView;
})(window.WebCAD = window.WebCAD || {});
