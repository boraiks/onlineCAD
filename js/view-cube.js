(function (cad) {
  'use strict';

  const { dot } = cad.math;
  const svgNS = 'http://www.w3.org/2000/svg';

  class ViewCube {
    constructor({ root, camera, onCameraChange }) {
      this.root = root;
      this.camera = camera;
      this.onCameraChange = onCameraChange;
      this.rotator = root.querySelector('#cubeRotator');
      this.faces = [...root.querySelectorAll('.cube-face')];
      this.pickOverlay = root.querySelector('#cubePickOverlay');
      this.targets = [];
      this.drag = null;
      this.suppressClick = false;
      this.buildTargets();
      this.bindEvents();
    }

    buildTargets() {
      for (let axis = 0; axis < 3; axis += 1) {
        for (const a of [-1, 1]) for (const b of [-1, 1]) {
          const direction = [a, b];
          direction.splice(axis, 0, 0);
          const element = document.createElementNS(svgNS, 'path');
          element.classList.add('cube-edge-target');
          element.dataset.cubeDirection = direction.join(',');
          element.setAttribute('role', 'button');
          const sides = direction.map((value, index) => value ? [value > 0 ? 'Right' : 'Left', value > 0 ? 'Back' : 'Front', value > 0 ? 'Top' : 'Bottom'][index] : null).filter(Boolean);
          element.setAttribute('aria-label', `${sides.join(' / ')} edge view`);
          this.pickOverlay.append(element);
          this.targets.push({ element, direction, kind: 'edge', axis });
        }
      }
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const direction = [x, y, z];
        const element = document.createElementNS(svgNS, 'circle');
        element.classList.add('cube-corner-target');
        element.dataset.cubeDirection = direction.join(',');
        element.setAttribute('r', '8');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `View from ${x > 0 ? 'right' : 'left'}, ${y > 0 ? 'back' : 'front'}, ${z > 0 ? 'top' : 'bottom'} corner`);
        this.pickOverlay.append(element);
        this.targets.push({ element, direction, kind: 'corner' });
      }
    }

    project(point) {
      const half = 28;
      const depth = dot(this.camera.depth, point) * half;
      const perspective = 420 / (420 - depth);
      return [
        64 + dot(this.camera.right, point) * half * perspective,
        64 - dot(this.camera.up, point) * half * perspective,
      ];
    }

    render() {
      const { right, up, depth } = this.camera;
      const matrix = [
        right[0], -up[0], depth[0], 0,
        -right[2], up[2], -depth[2], 0,
        -right[1], up[1], -depth[1], 0,
        0, 0, 0, 1,
      ];
      this.rotator.style.transform = `matrix3d(${matrix.join(',')})`;
      for (const face of this.faces) face.tabIndex = dot(cad.faceNormals[face.dataset.view], depth) > 0.02 ? 0 : -1;
      this.updateTargets();
      this.updateAxes();
    }

    updateTargets() {
      for (const target of this.targets) {
        const { element, direction, kind, axis } = target;
        const visible = direction.some((value, index) => value && value * this.camera.depth[index] > 0.025);
        element.style.display = visible || (this.drag && element.hasPointerCapture(this.drag.pointerId)) ? '' : 'none';
        element.tabIndex = visible ? 0 : -1;
        if (kind === 'corner') {
          const [x, y] = this.project(direction);
          element.setAttribute('cx', x.toFixed(2));
          element.setAttribute('cy', y.toFixed(2));
        } else {
          const start = [...direction];
          const end = [...direction];
          start[axis] = -1;
          end[axis] = 1;
          const [x1, y1] = this.project(start);
          const [x2, y2] = this.project(end);
          element.setAttribute('d', `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`);
        }
      }
    }

    updateAxes() {
      for (const [name, vector] of Object.entries({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] })) {
        const direction = dot(this.camera.depth, vector) < 0 ? -1 : 1;
        const [x, y] = this.project(vector.map(value => value * direction * 2.05));
        const path = this.root.querySelector(`#cubeAxis${name}`);
        const label = this.root.querySelector(`#cubeAxisLabel${name}`);
        path.setAttribute('d', `M64 64 L${x.toFixed(2)} ${y.toFixed(2)}`);
        label.setAttribute('x', Math.max(7, Math.min(121, x)).toFixed(2));
        label.setAttribute('y', Math.max(9, Math.min(119, y)).toFixed(2));
      }
    }

    bindEvents() {
      this.root.addEventListener('pointerdown', event => {
        if (this.drag || event.button !== 0) return;
        this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
        event.target.setPointerCapture(event.pointerId);
      });
      this.root.addEventListener('pointermove', event => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
        if (!this.drag.moved && Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) < 4) return;
        this.drag.moved = true;
        this.camera.orbit(dx, dy);
        this.onCameraChange();
      });
      const endDrag = () => {
        if (this.drag?.moved) {
          this.suppressClick = true;
          setTimeout(() => { this.suppressClick = false; }, 0);
        }
        this.drag = null;
      };
      this.root.addEventListener('pointerup', endDrag);
      this.root.addEventListener('pointercancel', endDrag);
      this.root.addEventListener('lostpointercapture', endDrag);
      this.root.addEventListener('click', event => {
        if (this.suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          this.suppressClick = false;
          return;
        }
        const target = event.target.closest('[data-cube-direction]');
        if (target) this.camera.animateToDirection(target.dataset.cubeDirection.split(',').map(Number), this.onCameraChange);
        else {
          const face = event.target.closest('.cube-face');
          if (!face) return;
          this.camera.animateToView(face.dataset.view, this.onCameraChange);
        }
      });
      this.root.addEventListener('keydown', event => {
        const target = event.target.closest('[data-cube-direction]');
        if (!target || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        this.camera.animateToDirection(target.dataset.cubeDirection.split(',').map(Number), this.onCameraChange);
      });
    }
  }

  cad.ViewCube = ViewCube;
})(window.WebCAD = window.WebCAD || {});
