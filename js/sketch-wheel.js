(function (cad) {
  'use strict';

  const entries = [
    ['mirror', 'Mirror', '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7 4 10v4l5 3m6-10 5 3v4l-5 3"/>', 0, -105],
    ['distance', 'Distance', '<path d="M4 6v12m16-12v12M4 12h16m-16 0 3-2m-3 2 3 2m13-2-3-2m3 2-3 2"/>', -150, -60],
    ['angle', 'Angle', '<path d="M4 19h16M4 19 17 5M10 19a6 6 0 0 0-2-4"/>', 150, -60],
    ['midpoint', 'Midpoint', '<path d="M3 16h18M12 6l5 8H7z"/>', -150, -18],
    ['axis', 'Horizontal / Vertical', '<path d="M4 12h16M12 4v16"/><path d="M6 9v6m12-6v6M9 6h6m-6 12h6"/>', 150, -18],
    ['fix', 'Fix / Unfix', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3m-4 4v2"/>', -150, 24],
    ['tangent', 'Tangent', '<circle cx="14" cy="14" r="6"/><path d="M3 8h18"/>', 150, 24],
    ['coincident', 'Coincident', '<path d="M3 18 15 6M9 20 21 8"/><circle cx="12" cy="13" r="2"/>', -150, 66],
    ['equal', 'Equal', '<path d="M4 9h16M4 15h16"/>', 150, 66],
    [null, 'Cancel', '<path d="M6 6 18 18M18 6 6 18"/>', 0, 110],
  ];

  class SketchWheel {
    constructor({ canvas, onSelect }) {
      this.canvas = canvas;
      this.onSelect = onSelect;
      this.root = document.createElement('div');
      this.root.className = 'sketch-wheel';
      this.root.hidden = true;
      this.root.setAttribute('role', 'menu');
      this.root.setAttribute('aria-label', 'Sketch shortcuts');
      this.root.addEventListener('pointerdown', event => event.stopPropagation());
      this.root.addEventListener('contextmenu', event => event.preventDefault());
      for (const [tool, label, iconPaths, x, y] of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sketch-wheel-item';
        button.setAttribute('role', 'menuitem');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.style.setProperty('--wheel-x', `${x}px`);
        button.style.setProperty('--wheel-y', `${y}px`);
        const icon = document.createElement('span');
        icon.className = 'sketch-wheel-icon';
        icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths}</svg>`;
        const name = document.createElement('span'); name.className = 'sketch-wheel-name'; name.textContent = label;
        button.append(icon, name);
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.close();
          this.onSelect(tool);
        });
        this.root.append(button);
      }
      canvas.parentElement.append(this.root);
      canvas.addEventListener('contextmenu', event => {
        if (!cad.app?.sketchTools?.getActiveSketch()) return;
        event.preventDefault();
        event.stopPropagation();
        this.open(event.clientX, event.clientY);
      });
      document.addEventListener('pointerdown', event => {
        if (!this.root.hidden && !this.root.contains(event.target)) this.close();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !this.root.hidden) {
          this.close(); event.preventDefault(); event.stopPropagation();
        }
      }, true);
    }

    open(clientX, clientY) {
      const bounds = this.canvas.parentElement.getBoundingClientRect();
      if (this.root.hidden) this.previousCursor = this.canvas.style.cursor;
      this.canvas.style.cursor = 'default';
      this.root.style.left = `${clientX - bounds.left}px`;
      this.root.style.top = `${clientY - bounds.top}px`;
      this.root.hidden = false;
    }

    close() {
      if (!this.root.hidden) this.canvas.style.cursor = this.previousCursor || '';
      this.root.hidden = true;
    }
  }

  cad.SketchWheel = SketchWheel;
})(window.WebCAD = window.WebCAD || {});
