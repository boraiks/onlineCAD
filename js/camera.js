(function (cad) {
  'use strict';

  const { cross, normalize, dot } = cad.math;
  const { fromBasis, toBasis, slerp } = cad.orientation;
  const settings = cad.settings;
  const views = {
    top: { right: [1, 0, 0], up: [0, 1, 0] },
    bottom: { right: [1, 0, 0], up: [0, -1, 0] },
    front: { right: [1, 0, 0], up: [0, 0, 1] },
    back: { right: [-1, 0, 0], up: [0, 0, 1] },
    right: { right: [0, 1, 0], up: [0, 0, 1] },
    left: { right: [0, -1, 0], up: [0, 0, 1] },
  };
  const faceNormals = {
    top: [0, 0, 1], bottom: [0, 0, -1],
    front: [0, -1, 0], back: [0, 1, 0],
    right: [1, 0, 0], left: [-1, 0, 0],
  };

  class Camera {
    constructor() {
      const yaw = 0.72;
      const elevation = 0.55;
      this.right = [Math.cos(yaw), Math.sin(yaw), 0];
      this.depth = [Math.sin(yaw) * Math.cos(elevation), -Math.cos(yaw) * Math.cos(elevation), Math.sin(elevation)];
      this.up = cross(this.depth, this.right);
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.targetPanX = 0;
      this.targetPanY = 0;
      this.panVelX = 0;
      this.panVelY = 0;
      this.panAnimationId = 0;
      this.lastPanTime = 0;
      this.onPanUpdate = null;
      this.pivot = [0, 0, 0];
      this.animationId = 0;
    }

    unit(width, height) {
      return (Math.min(width / 15, height / 9, 66) / 12.5) * this.zoom;
    }

    origin(width, height) {
      return [width * 0.5 + this.panX, height * 0.59 + this.panY];
    }

    project(point, width, height) {
      const [x, y] = this.origin(width, height);
      const unit = this.unit(width, height);
      const pivot = settings.cameraPivot ? this.pivot : [0, 0, 0];
      const relative = point.map((value, index) => value - pivot[index]);
      return [x + dot(this.right, relative) * unit, y - dot(this.up, relative) * unit];
    }

    projector(width, height) {
      const [originX, originY] = this.origin(width, height);
      const unit = this.unit(width, height);
      const pivot = settings.cameraPivot ? this.pivot : [0, 0, 0];
      const right = this.right.map(value => value * unit);
      const up = this.up.map(value => value * unit);
      const baseX = originX - dot(right, pivot);
      const baseY = originY + dot(up, pivot);
      return point => [baseX + dot(right, point), baseY - dot(up, point)];
    }

    startPan() {
      this.stopPanAnimation();
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
      this.panVelX = 0;
      this.panVelY = 0;
      this.lastPanTime = performance.now();
    }

    pan(dx, dy) {
      this.stopPanAnimation();
      this.panX += dx;
      this.panY += dy;
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
    }

    releasePan() {
      this.stopPanAnimation();
      this.panVelX = 0;
      this.panVelY = 0;
    }

    stopPanAnimation() {
      if (this.panAnimationId) {
        cancelAnimationFrame(this.panAnimationId);
        this.panAnimationId = 0;
      }
    }

    orbit(dx, dy) {
      this.cancelAnimation();
      if (settings.orbitType === 'Constrained Orbit') {
        const yaw = Math.atan2(this.right[1], this.right[0]) - dx * 0.009;
        const currentElevation = Math.atan2(this.depth[2], this.up[2]);
        const elevation = currentElevation + dy * 0.009;
        this.right = [Math.cos(yaw), Math.sin(yaw), 0];
        this.depth = [Math.sin(yaw) * Math.cos(elevation), -Math.cos(yaw) * Math.cos(elevation), Math.sin(elevation)];
        this.up = cross(this.depth, this.right);
        return;
      }
      const horizontal = -dx * 0.009;
      const vertical = dy * 0.009;
      const oldRight = this.right;
      const oldDepth = this.depth;
      this.right = normalize(oldRight.map((value, i) => value * Math.cos(horizontal) - oldDepth[i] * Math.sin(horizontal)));
      this.depth = normalize(oldDepth.map((value, i) => value * Math.cos(horizontal) + oldRight[i] * Math.sin(horizontal)));
      const oldUp = this.up;
      const turnedDepth = this.depth;
      this.up = normalize(oldUp.map((value, i) => value * Math.cos(vertical) - turnedDepth[i] * Math.sin(vertical)));
      this.depth = normalize(turnedDepth.map((value, i) => value * Math.cos(vertical) + oldUp[i] * Math.sin(vertical)));
      this.up = normalize(cross(this.depth, this.right));
    }

    selectView(name) {
      const view = views[name];
      if (!view) return;
      this.cancelAnimation();
      this.right = [...view.right];
      this.up = [...view.up];
      this.depth = cross(this.right, this.up);
    }

    selectDirection(direction) {
      this.cancelAnimation();
      this.depth = normalize(direction);
      this.right = normalize(cross([0, 0, 1], this.depth));
      if (!Math.hypot(...this.right)) this.right = [1, 0, 0];
      this.up = normalize(cross(this.depth, this.right));
    }

    animateToView(name, onUpdate) {
      const view = views[name];
      if (!view) return;
      this.animateToBasis({ right: [...view.right], up: [...view.up], depth: cross(view.right, view.up) }, onUpdate);
    }

    animateToDirection(direction, onUpdate) {
      const depth = normalize(direction);
      let right = normalize(cross([0, 0, 1], depth));
      if (!Math.hypot(...right)) right = [1, 0, 0];
      this.animateToBasis({ right, up: normalize(cross(depth, right)), depth }, onUpdate);
    }

    animateToBasis(target, onUpdate) {
      this.cancelAnimation();
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : settings.viewTransitionMs;
      if (!duration) {
        Object.assign(this, target);
        onUpdate();
        return;
      }
      const from = fromBasis(this);
      const to = fromBasis(target);
      const start = performance.now();
      const frame = now => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        Object.assign(this, progress === 1 ? target : toBasis(slerp(from, to, eased)));
        onUpdate();
        if (progress < 1) this.animationId = requestAnimationFrame(frame);
        else this.animationId = 0;
      };
      this.animationId = requestAnimationFrame(frame);
    }

    cancelAnimation() {
      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.animationId = 0;
      this.stopPanAnimation();
    }

    setPivot(point, width = null, height = null) {
      if (!point) return;
      if (width != null && height != null && settings.cameraPivot) {
        const unit = this.unit(width, height);
        const oldPivot = this.pivot || [0, 0, 0];
        const dx = (point[0] - oldPivot[0]) * this.right[0] +
                   (point[1] - oldPivot[1]) * this.right[1] +
                   (point[2] - oldPivot[2]) * this.right[2];
        const dy = (point[0] - oldPivot[0]) * this.up[0] +
                   (point[1] - oldPivot[1]) * this.up[1] +
                   (point[2] - oldPivot[2]) * this.up[2];
        this.panX += dx * unit;
        this.panY -= dy * unit;
        this.targetPanX = this.panX;
        this.targetPanY = this.panY;
      }
      this.pivot = [...point];
    }

    zoomAt(factor, clientX, clientY, bounds) {
      this.cancelAnimation();
      const anchorX = clientX - bounds.left;
      const anchorY = clientY - bounds.top;
      const [originX, originY] = this.origin(bounds.width, bounds.height);
      const nextZoom = Math.max(1e-6, Math.min(1e12, this.zoom * factor));
      const appliedFactor = nextZoom / this.zoom;
      this.panX += (anchorX - originX) * (1 - appliedFactor);
      this.panY += (anchorY - originY) * (1 - appliedFactor);
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
      this.panVelX = 0;
      this.panVelY = 0;
      this.zoom = nextZoom;
    }

    computeFit(bodies, width, height) {
      const visible = (bodies || []).filter(body => body && body.visible !== false);
      if (!visible.length) {
        return {
          panX: 0,
          panY: 0,
          zoom: 1,
          pivot: [0, 0, 0],
        };
      }

      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let pointCount = 0;

      const addPoint = (x, y, z) => {
        const u = dot(this.right, [x, y, z]);
        const v = dot(this.up, [x, y, z]);
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        pointCount++;
      };

      for (const body of visible) {
        if (body.mesh?.vertices?.length) {
          const v = body.mesh.vertices;
          for (let i = 0; i < v.length; i += 3) {
            addPoint(v[i], v[i + 1], v[i + 2]);
          }
        } else if (cad.extrude?.bodyBounds) {
          const b = cad.extrude.bodyBounds(body);
          if (b && Number.isFinite(b.minX)) {
            addPoint(b.minX, b.minY, b.minZ);
            addPoint(b.maxX, b.minY, b.minZ);
            addPoint(b.minX, b.maxY, b.minZ);
            addPoint(b.maxX, b.maxY, b.minZ);
            addPoint(b.minX, b.minY, b.maxZ);
            addPoint(b.maxX, b.minY, b.maxZ);
            addPoint(b.minX, b.maxY, b.maxZ);
            addPoint(b.maxX, b.maxY, b.maxZ);
          }
        }
      }

      if (!pointCount || !Number.isFinite(minU)) {
        return {
          panX: 0,
          panY: 0,
          zoom: 1,
          pivot: [0, 0, 0],
        };
      }

      const w = width || 1200;
      const h = height || 800;
      const midU = (minU + maxU) / 2;
      const midV = (minV + maxV) / 2;
      const spanU = Math.max(maxU - minU, 5);
      const spanV = Math.max(maxV - minV, 5);
      const midWorld = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

      const baseUnit = (Math.min(w / 15, h / 9, 66) / 12.5);
      const fitWidth = w * 0.76;
      const fitHeight = h * 0.68;
      const targetZoom = Math.max(0.01, Math.min(20, Math.min(fitWidth / (spanU * baseUnit), fitHeight / (spanV * baseUnit))));
      const targetUnit = baseUnit * targetZoom;

      const activePivot = settings.cameraPivot ? midWorld : [0, 0, 0];
      const targetPanX = -(midU - dot(this.right, activePivot)) * targetUnit;
      const targetPanY = (midV - dot(this.up, activePivot)) * targetUnit;

      return {
        panX: targetPanX,
        panY: targetPanY,
        zoom: targetZoom,
        pivot: midWorld,
      };
    }

    fit(bodiesOrOptions, maybeWidth, maybeHeight) {
      this.cancelAnimation();
      let bodies, width, height;
      if (Array.isArray(bodiesOrOptions)) {
        bodies = bodiesOrOptions;
        width = maybeWidth;
        height = maybeHeight;
      } else if (bodiesOrOptions && typeof bodiesOrOptions === 'object') {
        bodies = bodiesOrOptions.bodies;
        width = bodiesOrOptions.width;
        height = bodiesOrOptions.height;
      }
      if (!bodies) {
        bodies = cad.app?.extrudeController?.bodies || cad.extrudeController?.bodies || [];
      }
      if (!width || !height) {
        const canvas = cad.app?.modelView?.canvas;
        if (canvas) {
          const b = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
          width = b?.width || canvas.width;
          height = b?.height || canvas.height;
        }
      }

      const target = this.computeFit(bodies, width, height);
      this.zoom = target.zoom;
      this.panX = target.panX;
      this.panY = target.panY;
      this.targetPanX = target.panX;
      this.targetPanY = target.panY;
      this.panVelX = 0;
      this.panVelY = 0;
      this.pivot = [...target.pivot];
    }

    animateFit(onUpdateOrOptions, maybeOptions) {
      this.cancelAnimation();
      let onUpdate, options;
      if (typeof onUpdateOrOptions === 'function') {
        onUpdate = onUpdateOrOptions;
        options = maybeOptions || {};
      } else if (onUpdateOrOptions && typeof onUpdateOrOptions === 'object') {
        options = onUpdateOrOptions;
        onUpdate = options.onUpdate;
      } else {
        options = {};
      }

      let bodies = options.bodies;
      let width = options.width;
      let height = options.height;

      if (!bodies) {
        bodies = cad.app?.extrudeController?.bodies || cad.extrudeController?.bodies || [];
      }
      if (!width || !height) {
        const canvas = cad.app?.modelView?.canvas;
        if (canvas) {
          const b = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
          width = b?.width || canvas.width;
          height = b?.height || canvas.height;
        }
      }

      const target = this.computeFit(bodies, width, height);

      const duration = (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) ? 0 : 320;
      if (!duration) {
        this.fit({ bodies, width, height });
        if (typeof onUpdate === 'function') onUpdate();
        return;
      }

      const startPanX = this.panX;
      const startPanY = this.panY;
      const startZoom = this.zoom;
      const startPivot = [...this.pivot];
      const startTime = performance.now();

      const frame = now => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        this.panX = startPanX + (target.panX - startPanX) * eased;
        this.panY = startPanY + (target.panY - startPanY) * eased;
        this.zoom = startZoom + (target.zoom - startZoom) * eased;
        this.pivot = startPivot.map((val, i) => val + (target.pivot[i] - val) * eased);
        this.targetPanX = this.panX;
        this.targetPanY = this.panY;
        if (typeof onUpdate === 'function') onUpdate();
        if (progress < 1) {
          this.animationId = requestAnimationFrame(frame);
        } else {
          this.animationId = 0;
          this.panX = target.panX;
          this.panY = target.panY;
          this.zoom = target.zoom;
          this.pivot = [...target.pivot];
          this.targetPanX = target.panX;
          this.targetPanY = target.panY;
          this.panVelX = 0;
          this.panVelY = 0;
          if (typeof onUpdate === 'function') onUpdate();
        }
      };
      this.animationId = requestAnimationFrame(frame);
    }
  }

  cad.Camera = Camera;
  cad.faceNormals = faceNormals;
})(window.WebCAD = window.WebCAD || {});
