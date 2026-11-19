(function (cad) {
  'use strict';

  const MARGIN = 8;
  const DIALOG_SELECTOR = '.model-pane > [role="dialog"]';
  const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, label, [contenteditable]';

  const GRIP_SVG = '<svg viewBox="0 0 10 14" aria-hidden="true">' +
    '<circle cx="2.5" cy="2.5" r="1.15" fill="currentColor"/>' +
    '<circle cx="7.5" cy="2.5" r="1.15" fill="currentColor"/>' +
    '<circle cx="2.5" cy="7" r="1.15" fill="currentColor"/>' +
    '<circle cx="7.5" cy="7" r="1.15" fill="currentColor"/>' +
    '<circle cx="2.5" cy="11.5" r="1.15" fill="currentColor"/>' +
    '<circle cx="7.5" cy="11.5" r="1.15" fill="currentColor"/>' +
    '</svg>';

  const RESET_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.5 7A4.5 4.5 0 1 1 5 11.5"/>' +
    '<polyline points="3.5 3.8 3.5 7 6.7 7"/>' +
    '</svg>';

  const trackedContainers = new WeakMap();
  const panelControllers = new WeakMap();

  function measureBox(element) {
    const rect = typeof element.getBoundingClientRect === 'function'
      ? element.getBoundingClientRect()
      : null;
    const width = rect && rect.width > 0 ? rect.width : (element.offsetWidth || element.clientWidth || 0);
    const height = rect && rect.height > 0 ? rect.height : (element.offsetHeight || element.clientHeight || 0);
    return {
      left: rect ? rect.left : 0,
      top: rect ? rect.top : 0,
      width,
      height,
    };
  }

  function clampCoordinates(left, top, panelSize, containerSize, margin = MARGIN) {
    const maxLeft = Math.max(margin, containerSize.width - panelSize.width - margin);
    const maxTop = Math.max(margin, containerSize.height - panelSize.height - margin);
    return {
      left: Math.round(Math.max(margin, Math.min(left, maxLeft))),
      top: Math.round(Math.max(margin, Math.min(top, maxTop))),
    };
  }

  function ensureDragBar(panel) {
    const existing = panel.querySelector?.('.panel-drag-bar');
    if (existing) {
      return {
        bar: existing,
        resetBtn: existing.querySelector?.('.panel-drag-reset') || null,
      };
    }

    const children = panel.children ? Array.from(panel.children) : [];
    const heading = children.find(child => ['H2', 'H3', 'STRONG'].includes(child.tagName));
    if (!heading || typeof document === 'undefined') return null;

    const bar = document.createElement('div');
    bar.className = 'panel-drag-bar';
    bar.setAttribute('aria-label', 'Drag dialog to move; double-click to reset position');

    const grip = document.createElement('span');
    grip.className = 'panel-drag-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = GRIP_SVG;

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'panel-drag-reset';
    resetBtn.hidden = true;
    resetBtn.setAttribute('data-no-tooltip', '');
    resetBtn.setAttribute('aria-label', 'Reset panel position');
    resetBtn.innerHTML = RESET_SVG;

    heading.classList.add('panel-drag-title');
    panel.insertBefore(bar, heading);
    bar.append(grip, heading, resetBtn);

    return { bar, resetBtn };
  }

  function observeContainerResize(container, panel) {
    let list = trackedContainers.get(container);
    if (!list) {
      list = new Set();
      trackedContainers.set(container, list);
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(() => {
          for (const item of list) {
            panelControllers.get(item)?.clamp();
          }
        });
        observer.observe(container);
      } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', () => {
          for (const item of list) {
            panelControllers.get(item)?.clamp();
          }
        });
      }
    }
    list.add(panel);
  }

  function makePanelDraggable(panel, container = panel?.parentElement) {
    if (!panel || !container) return null;
    if (panelControllers.has(panel)) return panelControllers.get(panel);

    const handleRefs = ensureDragBar(panel);
    if (!handleRefs) return null;
    const { bar, resetBtn } = handleRefs;

    let dragState = null;

    const applyPosition = (left, top) => {
      const containerBox = measureBox(container);
      const panelBox = measureBox(panel);
      if (containerBox.width <= 0 || panelBox.width <= 0) return;
      const clamped = clampCoordinates(left, top, panelBox, containerBox);
      panel.style.left = `${clamped.left}px`;
      panel.style.top = `${clamped.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.dataset.dragged = 'true';
      panel.classList?.add?.('is-panel-dragged');
      if (resetBtn) resetBtn.hidden = false;
    };

    const clamp = () => {
      if (panel.hidden || panel.dataset?.dragged !== 'true') return;
      const parsedLeft = parseFloat(panel.style.left);
      const parsedTop = parseFloat(panel.style.top);
      if (!Number.isFinite(parsedLeft) || !Number.isFinite(parsedTop)) return;
      applyPosition(parsedLeft, parsedTop);
    };

    const reset = () => {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.bottom = '';
      if (panel.dataset) delete panel.dataset.dragged;
      panel.classList?.remove?.('is-panel-dragged');
      panel.classList?.remove?.('is-panel-dragging');
      if (resetBtn) resetBtn.hidden = true;
    };

    const stopDrag = (event) => {
      if (!dragState) return;
      if (event && event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
      const pid = dragState.pointerId;
      dragState = null;
      panel.classList?.remove?.('is-panel-dragging');
      if (typeof document !== 'undefined') {
        document.body?.classList?.remove?.('is-dragging-dialog');
        document.removeEventListener?.('pointermove', onPointerMove);
        document.removeEventListener?.('pointerup', stopDrag);
        document.removeEventListener?.('pointercancel', stopDrag);
      }
      if (pid !== undefined && bar.hasPointerCapture?.(pid)) {
        try { bar.releasePointerCapture(pid); } catch { /* Ignore capture loss. */ }
      }
    };

    const onPointerMove = (event) => {
      if (!dragState) return;
      if (event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (!dragState.moved) {
        if (Math.hypot(dx, dy) <= 2 && panel.dataset?.dragged !== 'true') return;
        dragState.moved = true;
        panel.classList?.add?.('is-panel-dragging');
      }
      applyPosition(dragState.originLeft + dx, dragState.originTop + dy);
    };

    bar.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target?.closest?.(INTERACTIVE_SELECTOR)) return;

      event.preventDefault?.();
      event.stopPropagation?.();

      const containerBox = measureBox(container);
      const panelBox = measureBox(panel);
      const parsedLeft = parseFloat(panel.style.left);
      const parsedTop = parseFloat(panel.style.top);
      const originLeft = Number.isFinite(parsedLeft)
        ? parsedLeft
        : (panelBox.left - containerBox.left);
      const originTop = Number.isFinite(parsedTop)
        ? parsedTop
        : (panelBox.top - containerBox.top);

      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft,
        originTop,
        moved: panel.dataset?.dragged === 'true',
      };

      if (dragState.moved) {
        panel.classList?.add?.('is-panel-dragging');
      }
      if (typeof document !== 'undefined') {
        document.body?.classList?.add?.('is-dragging-dialog');
        document.addEventListener?.('pointermove', onPointerMove);
        document.addEventListener?.('pointerup', stopDrag);
        document.addEventListener?.('pointercancel', stopDrag);
      }
      if (event.pointerId !== undefined) {
        try { bar.setPointerCapture?.(event.pointerId); } catch { /* Fallback uses document listeners. */ }
      }
    });

    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);
    bar.addEventListener('lostpointercapture', stopDrag);

    bar.addEventListener('dblclick', event => {
      if (event.target?.closest?.(INTERACTIVE_SELECTOR)) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      reset();
    });

    resetBtn?.addEventListener('click', event => {
      event.preventDefault?.();
      event.stopPropagation?.();
      reset();
    });

    if (typeof MutationObserver === 'function') {
      const visibilityObserver = new MutationObserver(() => {
        if (!panel.hidden && panel.dataset?.dragged === 'true') {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => clamp());
          } else {
            clamp();
          }
        }
      });
      visibilityObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    }

    observeContainerResize(container, panel);

    const api = { panel, container, handle: bar, reset, clamp };
    panelControllers.set(panel, api);
    return api;
  }

  function initDraggablePanels(root = typeof document !== 'undefined' ? document : null) {
    if (!root?.querySelectorAll) return [];
    const panels = Array.from(root.querySelectorAll(DIALOG_SELECTOR));
    const initialized = [];
    for (const panel of panels) {
      const ctrl = makePanelDraggable(panel, panel.parentElement);
      if (ctrl) initialized.push(ctrl);
    }
    return initialized;
  }

  cad.draggablePanels = {
    MARGIN,
    clampCoordinates,
    makePanelDraggable,
    initDraggablePanels,
  };
  cad.makePanelDraggable = makePanelDraggable;
  cad.initDraggablePanels = initDraggablePanels;
})(window.WebCAD = window.WebCAD || {});
