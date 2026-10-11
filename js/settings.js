(function (cad) {
  'use strict';

  // One source of truth for navigation and application preferences.
  const settings = {
    mouseSetup: 'Fusion',
    orbitType: 'Constrained Orbit',
    reverseZoomDirection: false,
    cameraPivot: true,
    viewTransitionMs: 480,
    displayStyle: 'shaded-edges',
    showMesh: false,
  };

  class SettingsPanel {
    constructor({ button, panel }) {
      this.button = button;
      this.modal = panel;
      this.activeCategory = 'general';

      // Category tab navigation
      this.categoryButtons = [...this.modal.querySelectorAll('[data-category]')];
      this.sections = [...this.modal.querySelectorAll('[data-section]')];
      this.shortcutInputs = new Map();
      const rows = this.modal.querySelector('#shortcutRows');
      const shortcutMessage = this.modal.querySelector('#shortcutMessage');
      const labels = {
        line: 'Line', rectangle: 'Rectangle', circle: 'Circle', point: 'Point', fillet: 'Fillet', trim: 'Trim',
        mirror: 'Mirror', distance: 'Distance', angle: 'Angle', midpoint: 'Midpoint',
        axis: 'Horizontal / Vertical', fix: 'Fix / Unfix', tangent: 'Tangent',
        coincident: 'Coincident', equal: 'Equal', offset: 'Offset',
        circularPattern: 'Circular Pattern', rectangularPattern: 'Rectangular Pattern',
        construction: 'Construction', extrude: 'Extrude',
      };
      if (rows && cad.shortcuts) {
        for (const tool of Object.keys(cad.shortcuts.defaults)) {
          const row = document.createElement('label');
          row.className = 'setting-row shortcut-row';
          const name = document.createElement('span');
          name.className = 'setting-label';
          name.textContent = labels[tool];
          const input = document.createElement('input');
          input.className = 'shortcut-input';
          input.type = 'text';
          input.readOnly = true;
          input.setAttribute('aria-label', `${labels[tool]} shortcut`);
          input.addEventListener('keydown', event => {
            if (event.key === 'Tab' || event.key === 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            const key = event.key === 'Backspace' || event.key === 'Delete' ? '' : event.key;
            if (!cad.shortcuts.set(tool, key)) {
              shortcutMessage.textContent = 'Choose a single unused letter.';
              return;
            }
            shortcutMessage.textContent = key ? `${labels[tool]} is now ${key.toUpperCase()}.` : `${labels[tool]} shortcut cleared.`;
            this.renderShortcuts();
          });
          row.append(name, input);
          rows.append(row);
          this.shortcutInputs.set(tool, input);
        }
        this.modal.querySelector('#resetShortcuts')?.addEventListener('click', () => {
          cad.shortcuts.reset();
          shortcutMessage.textContent = 'Default shortcuts restored.';
          this.renderShortcuts();
        });
      }
      this.categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchCategory(btn.dataset.category);
        });
      });

      // Interactive setting controls
      const orbitSelect = this.modal.querySelector('[data-setting-select="orbitType"]');
      if (orbitSelect) {
        orbitSelect.addEventListener('change', () => {
          settings.orbitType = orbitSelect.value;
        });
      }

      const reverseZoomSelect = this.modal.querySelector('[data-setting-select="reverseZoomDirection"]');
      if (reverseZoomSelect) {
        reverseZoomSelect.addEventListener('change', () => {
          settings.reverseZoomDirection = reverseZoomSelect.value === 'true';
        });
      }

      const cameraPivotSelect = this.modal.querySelector('[data-setting-select="cameraPivot"]');
      if (cameraPivotSelect) {
        cameraPivotSelect.addEventListener('change', () => {
          settings.cameraPivot = cameraPivotSelect.value === 'true';
        });
      }

      // Close buttons
      this.modal.querySelectorAll('[data-close-settings]').forEach(el => {
        el.addEventListener('click', () => this.close());
      });

      // Backdrop click closes modal
      this.modal.addEventListener('pointerdown', event => {
        if (event.target === this.modal) {
          this.close();
        }
      });

      // Escape key closes modal
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !this.modal.hidden) {
          this.close();
        }
      });

      button.addEventListener('click', () => this.toggle());
      this.render();
    }

    switchCategory(categoryName) {
      this.activeCategory = categoryName;
      this.categoryButtons.forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.category === categoryName);
      });
      this.sections.forEach(section => {
        section.hidden = section.dataset.section !== categoryName;
      });
    }

    render() {
      // Synchronize control inputs
      const orbitSelect = this.modal.querySelector('[data-setting-select="orbitType"]');
      if (orbitSelect) orbitSelect.value = settings.orbitType;

      const reverseZoomSelect = this.modal.querySelector('[data-setting-select="reverseZoomDirection"]');
      if (reverseZoomSelect) reverseZoomSelect.value = String(settings.reverseZoomDirection);

      const cameraPivotSelect = this.modal.querySelector('[data-setting-select="cameraPivot"]');
      if (cameraPivotSelect) cameraPivotSelect.value = String(settings.cameraPivot);

      const values = {
        mouseSetup: settings.mouseSetup,
      };
      for (const [name, value] of Object.entries(values)) {
        const target = this.modal.querySelector(`[data-setting="${name}"]`);
        if (target) target.textContent = value;
      }
      this.renderShortcuts();
    }

    renderShortcuts() {
      for (const [tool, input] of this.shortcutInputs) input.value = cad.shortcuts.bindings[tool] || '—';
    }

    toggle() {
      this.modal.hidden ? this.open() : this.close();
    }

    open() {
      this.render();
      this.modal.hidden = false;
      this.button.setAttribute('aria-expanded', 'true');
      this.button.classList.add('selected');
    }

    close() {
      this.modal.hidden = true;
      this.button.setAttribute('aria-expanded', 'false');
      this.button.classList.remove('selected');
    }
  }

  cad.settings = settings;
  cad.SettingsPanel = SettingsPanel;
})(window.WebCAD = window.WebCAD || {});
