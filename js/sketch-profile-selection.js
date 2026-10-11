(function (cad) {
  'use strict';

  class ProfileSelection {
    constructor({ canvas, sketchDocument, camera, getTool, isPicking, onChange }) {
      this.canvas = canvas;
      this.sketchDocument = sketchDocument;
      this.camera = camera;
      this.getTool = getTool;
      this.isPicking = isPicking;
      this.onChange = onChange;
      this.hoveredId = null;
      this.selectedId = null;
      this.bindEvents();
    }

    profiles() {
      return this.sketchDocument.sketches.filter(sketch => sketch.visible !== false)
        .flatMap(sketch => cad.sketchProfiles.fromSketch(sketch));
    }

    get selectedProfile() {
      return this.profiles().find(profile => profile.id === this.selectedId) || null;
    }

    clear() {
      this.hoveredId = null;
      this.selectedId = null;
      this.canvas.classList.remove('over-profile');
      this.onChange();
    }

    profileAt(event) {
      const tool = this.getTool();
      const isCtrl = Boolean(event?.ctrlKey || event?.metaKey);
      if (tool && !(isCtrl && tool === 'body-view')) return null;
      if (this.isPicking()) return null;
      const bounds = this.canvas.getBoundingClientRect();
      const screen = [event.clientX - bounds.left, event.clientY - bounds.top];
      return cad.sketchProfiles.hitTest(this.profiles(), screen, (sketch, point) =>
        this.camera.project(this.sketchDocument.toWorld(sketch, point), bounds.width, bounds.height));
    }

    bindEvents() {
      this.canvas.addEventListener('pointermove', event => {
        this.lastPointerEvent = event;
        if (event.buttons) return;
        const next = this.profileAt(event)?.id || null;
        if (next === this.hoveredId) return;
        this.hoveredId = next;
        this.canvas.classList.toggle('over-profile', Boolean(next));
        this.onChange();
      });

      this.canvas.addEventListener('pointerleave', () => {
        if (!this.hoveredId) return;
        this.hoveredId = null;
        this.canvas.classList.remove('over-profile');
        this.onChange();
      });

      const updateHoverState = isCtrl => {
        if (!this.lastPointerEvent) return;
        const fake = {
          clientX: this.lastPointerEvent.clientX,
          clientY: this.lastPointerEvent.clientY,
          ctrlKey: isCtrl,
          metaKey: isCtrl,
          buttons: 0
        };
        const next = this.profileAt(fake)?.id || null;
        if (next !== this.hoveredId) {
          this.hoveredId = next;
          this.canvas.classList.toggle('over-profile', Boolean(next));
          this.onChange();
        }
      };

      window?.addEventListener?.('keydown', event => {
        if (event.key === 'Control' || event.key === 'Meta') updateHoverState(true);
      });

      window?.addEventListener?.('keyup', event => {
        if (event.key === 'Control' || event.key === 'Meta') updateHoverState(false);
      });

      this.canvas.addEventListener('click', event => {
        const tool = this.getTool();
        const isCtrl = Boolean(event?.ctrlKey || event?.metaKey);
        if (event.defaultPrevented || event.button !== 0 || (tool && !(isCtrl && tool === 'body-view')) || this.isPicking()) return;
        this.selectedId = this.profileAt(event)?.id || null;
        this.onChange();
      });
    }

    render(context, project) {
      for (const profile of this.profiles()) {
        const selected = profile.id === this.selectedId;
        const hovered = profile.id === this.hoveredId;
        if (!selected && !hovered && this.getTool() === 'body-view') continue;
        cad.sketchRender.drawProfile(context, profile.points,
          point => project(this.sketchDocument.toWorld(profile.sketch, point)),
          selected ? 'rgba(38, 139, 206, .45)' : hovered ? 'rgba(54, 160, 221, .35)' : 'rgba(84, 174, 226, .15)',
          profile.holes,
          selected ? '#0e70b0' : hovered ? '#00a8ff' : null,
          selected ? 2.6 : hovered ? 2.0 : 0);
      }
    }
  }

  cad.ProfileSelection = ProfileSelection;
})(window.WebCAD = window.WebCAD || {});
