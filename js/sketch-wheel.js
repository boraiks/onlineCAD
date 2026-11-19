(function (cad) {
  'use strict';

  const entries = [
    ['mirror', 'Mirror', '<line x1="12" y1="3.5" x2="12" y2="20.5" stroke="#f59e0b" stroke-dasharray="2.5 2"/><polygon points="4,7 9.5,12 4,17" fill="#38bdf8" stroke="#38bdf8"/><polygon points="20,7 14.5,12 20,17"/>', 0, -105],
    ['distance', 'Distance', '<path d="M4.5 5v14M19.5 5v14"/><path d="M5.5 12h13M8.5 9.5 5.5 12l3 2.5M15.5 9.5l3 2.5-3 2.5" stroke="#38bdf8"/>', -150, -60],
    ['angle', 'Angle', '<path d="M20 19H4.5L17 6.5"/><path d="M12.5 19a8 8 0 0 0-2.3-5.7" stroke="#38bdf8"/>', 150, -60],
    ['midpoint', 'Midpoint', '<line x1="3.5" y1="16" x2="20.5" y2="16"/><polygon points="12,7 16.5,15.5 7.5,15.5" stroke="#38bdf8"/>', -150, -18],
    ['axis', 'Horizontal / Vertical', '<path d="M4 12h16M12 4v16" stroke="#38bdf8"/><path d="M4 9.5v5M20 9.5v5M9.5 4h5M9.5 20h5"/>', 150, -18],
    ['fix', 'Fix / Unfix', '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" stroke="#38bdf8"/><circle cx="12" cy="15.2" r="1.3" fill="#38bdf8" stroke="none"/>', -150, 24],
    ['tangent', 'Tangent', '<circle cx="13.5" cy="13.5" r="5.5"/><line x1="4" y1="8" x2="20" y2="8" stroke="#38bdf8"/><circle cx="13.5" cy="8" r="1.6" fill="#38bdf8" stroke="none"/>', 150, 24],
    ['coincident', 'Coincident', '<path d="M4 19l8-7M20 19l-8-7"/><circle cx="12" cy="12" r="2.2" fill="#38bdf8" stroke="none"/>', -150, 66],
    ['equal', 'Equal', '<path d="M5 9h14M5 15h14" stroke="#38bdf8" stroke-width="2.2"/>', 150, 66],
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
