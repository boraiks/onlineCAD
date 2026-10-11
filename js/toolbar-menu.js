(function (cad) {
  'use strict';

  class ToolbarMenu {
    constructor({ container, trigger, menu, onClose }) {
      this.container = container;
      this.trigger = trigger;
      this.menu = menu;
      this.onClose = onClose;

      trigger.addEventListener('click', event => {
        if (this.trigger.disabled || this.container.classList?.contains?.('is-disabled')) return;
        event.stopPropagation();
        this.setOpen(menu.hidden);
      });
      menu.addEventListener('click', event => {
        if (event.target.closest('button')) this.close();
      });
      document.addEventListener('pointerdown', event => {
        if (!menu.hidden && !container.contains(event.target)) this.close();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) {
          this.close();
          trigger.focus();
          event.preventDefault();
        }
      });
    }

    setOpen(open) {
      if (open && (this.trigger.disabled || this.container.classList?.contains?.('is-disabled'))) return;
      this.menu.hidden = !open;
      this.trigger.setAttribute('aria-expanded', String(open));
      if (open) {
        this.menu.style.left = '0px';
        const bounds = this.menu.getBoundingClientRect?.() || { left: 0, right: 0 };
        const rightEdge = (document.documentElement?.clientWidth || 1024) - 8;
        const shift = bounds.right > rightEdge ? rightEdge - bounds.right : Math.max(0, 8 - bounds.left);
        this.menu.style.left = `${shift}px`;
      } else {
        this.onClose?.();
      }
    }

    close() {
      this.setOpen(false);
    }
  }

  cad.ToolbarMenu = ToolbarMenu;
})(window.WebCAD = window.WebCAD || {});
