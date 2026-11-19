import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function createDomEnv() {
  const docListeners = new Map();
  const winListeners = new Map();
  let resizeCallback = null;
  let mutationCallback = null;

  class MockClassList {
    constructor() {
      this._set = new Set();
    }
    add(...items) { items.forEach(i => this._set.add(i)); }
    remove(...items) { items.forEach(i => this._set.delete(i)); }
    contains(item) { return this._set.has(item); }
    toggle(item, force) {
      if (force === undefined) {
        if (this._set.has(item)) { this._set.delete(item); return false; }
        this._set.add(item); return true;
      }
      if (force) { this._set.add(item); return true; }
      this._set.delete(item); return false;
    }
  }

  class MockElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.id = '';
      this._className = '';
      this.classList = new MockClassList();
      this._listeners = new Map();
      this._rect = { left: 0, top: 0, width: 280, height: 220 };
      this.innerHTML = '';
    }
    set className(val) {
      this._className = String(val);
      this._className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    get className() {
      return this._className;
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) { return this.attributes.get(k) || null; }
    hasAttribute(k) { return this.attributes.has(k); }
    append(...nodes) {
      for (const node of nodes) {
        if (node.parentElement) {
          node.parentElement.children = node.parentElement.children.filter(c => c !== node);
        }
        node.parentElement = this;
        this.children.push(node);
      }
    }
    insertBefore(newNode, refNode) {
      if (newNode.parentElement) {
        newNode.parentElement.children = newNode.parentElement.children.filter(c => c !== newNode);
      }
      newNode.parentElement = this;
      const idx = this.children.indexOf(refNode);
      if (idx < 0) this.children.push(newNode);
      else this.children.splice(idx, 0, newNode);
    }
    matches(sel) {
      if (sel.startsWith('#')) return this.id === sel.slice(1);
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
      return sel.split(',').some(part => {
        const token = part.trim().toLowerCase();
        if (token.startsWith('[')) {
          const attr = token.slice(1, -1);
          return this.hasAttribute(attr);
        }
        return this.tagName.toLowerCase() === token;
      });
    }
    closest(sel) {
      let cur = this;
      while (cur) {
        if (cur.matches && cur.matches(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelector(sel) {
      for (const child of this.children) {
        if (child.matches(sel)) return child;
        const deep = child.querySelector(sel);
        if (deep) return deep;
      }
      return null;
    }
    querySelectorAll(sel) {
      const out = [];
      for (const child of this.children) {
        if (sel === '.model-pane > [role="dialog"]' && child.getAttribute('role') === 'dialog' && this.classList.contains('model-pane')) {
          out.push(child);
        } else if (child.matches(sel)) {
          out.push(child);
        }
        out.push(...child.querySelectorAll(sel));
      }
      return out;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      if (!this._listeners.has(type)) return;
      this._listeners.set(type, this._listeners.get(type).filter(f => f !== fn));
    }
    dispatchEvent(event) {
      const ev = { target: this, preventDefault() {}, stopPropagation() {}, ...event };
      for (const fn of (this._listeners.get(ev.type) || [])) fn(ev);
    }
    getBoundingClientRect() {
      const left = Number.isFinite(parseFloat(this.style.left)) ? parseFloat(this.style.left) : this._rect.left;
      const top = Number.isFinite(parseFloat(this.style.top)) ? parseFloat(this.style.top) : this._rect.top;
      return { left, top, width: this._rect.width, height: this._rect.height };
    }
    setPointerCapture() {}
    releasePointerCapture() {}
    hasPointerCapture() { return false; }
  }

  const body = new MockElement('body');
  const container = new MockElement('section');
  container.className = 'model-pane';
  container._rect = { left: 0, top: 0, width: 1000, height: 700 };

  const panel = new MockElement('div');
  panel.id = 'extrudePanel';
  panel.setAttribute('role', 'dialog');
  panel._rect = { left: 698, top: 58, width: 280, height: 240 };

  const heading = new MockElement('h2');
  heading.id = 'extrudeTitle';
  const input = new MockElement('input');
  panel.append(heading, input);
  container.append(panel);
  body.append(container);

  const mockDocument = {
    body,
    createElement: tag => new MockElement(tag),
    querySelectorAll: sel => body.querySelectorAll(sel),
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      if (!docListeners.has(type)) return;
      docListeners.set(type, docListeners.get(type).filter(f => f !== fn));
    },
  };

  const WebCAD = {};
  const sandbox = {
    WebCAD,
    window: {
      WebCAD,
      addEventListener: (type, fn) => {
        if (!winListeners.has(type)) winListeners.set(type, []);
        winListeners.get(type).push(fn);
      },
    },
    document: mockDocument,
    ResizeObserver: class {
      constructor(cb) { resizeCallback = cb; }
      observe() {}
    },
    MutationObserver: class {
      constructor(cb) { mutationCallback = cb; }
      observe() {}
    },
    requestAnimationFrame: cb => cb(),
    Math,
    Number,
    parseFloat,
    Array,
    Set,
    WeakMap,
  };
  sandbox.window.document = mockDocument;
  runInContext(readFileSync(new URL('../js/draggable-panels.js', import.meta.url), 'utf8'), createContext(sandbox));

  const fireDoc = (event) => {
    for (const fn of (docListeners.get(event.type) || [])) fn({ preventDefault() {}, stopPropagation() {}, ...event });
  };

  return {
    cad: sandbox.WebCAD,
    body,
    container,
    panel,
    heading,
    input,
    fireDoc,
    triggerResize: () => resizeCallback?.(),
    triggerMutation: () => mutationCallback?.(),
  };
}

test('initDraggablePanels wraps heading cleanly and preserves title ID', () => {
  const env = createDomEnv();
  const initialized = env.cad.initDraggablePanels(env.body);
  assert.equal(initialized.length, 1);
  assert.equal(env.panel.querySelector('#extrudeTitle'), env.heading);
  assert.ok(env.panel.querySelector('.panel-drag-bar'));
  assert.ok(env.panel.querySelector('.panel-drag-grip'));
  const resetBtn = env.panel.querySelector('.panel-drag-reset');
  assert.ok(resetBtn);
  assert.equal(resetBtn.hidden, true);
});

test('dragging panel header updates position and clamps strictly inside viewport bounds', () => {
  const env = createDomEnv();
  const [ctrl] = env.cad.initDraggablePanels(env.body);
  const bar = ctrl.handle;

  // Start drag at top-right (left 698, top 58)
  bar.dispatchEvent({ type: 'pointerdown', pointerId: 1, button: 0, pointerType: 'mouse', clientX: 720, clientY: 70, target: bar });
  assert.equal(env.body.classList.contains('is-dragging-dialog'), true);

  // Small 1px jitter does not mark panel as dragged yet
  env.fireDoc({ type: 'pointermove', pointerId: 1, clientX: 721, clientY: 70 });
  assert.equal(env.panel.dataset.dragged, undefined);

  // Move 200px left, 100px down -> (498, 158)
  env.fireDoc({ type: 'pointermove', pointerId: 1, clientX: 520, clientY: 170 });
  assert.equal(env.panel.style.left, '498px');
  assert.equal(env.panel.style.top, '158px');
  assert.equal(env.panel.style.right, 'auto');
  assert.equal(env.panel.dataset.dragged, 'true');
  assert.equal(env.panel.querySelector('.panel-drag-reset').hidden, false);

  // Drag past top-left boundary -> clamped to (8px, 8px)
  env.fireDoc({ type: 'pointermove', pointerId: 1, clientX: -500, clientY: -500 });
  assert.equal(env.panel.style.left, '8px');
  assert.equal(env.panel.style.top, '8px');

  // Drag past bottom-right boundary (1000 - 280 - 8 = 712, 700 - 240 - 8 = 452)
  env.fireDoc({ type: 'pointermove', pointerId: 1, clientX: 2500, clientY: 2500 });
  assert.equal(env.panel.style.left, '712px');
  assert.equal(env.panel.style.top, '452px');

  env.fireDoc({ type: 'pointerup', pointerId: 1 });
  assert.equal(env.body.classList.contains('is-dragging-dialog'), false);
  assert.equal(env.panel.classList.contains('is-panel-dragging'), false);
});

test('double-clicking drag bar or clicking reset restores default CSS placement', () => {
  const env = createDomEnv();
  const [ctrl] = env.cad.initDraggablePanels(env.body);
  const bar = ctrl.handle;

  bar.dispatchEvent({ type: 'pointerdown', pointerId: 2, button: 0, pointerType: 'mouse', clientX: 720, clientY: 70, target: bar });
  env.fireDoc({ type: 'pointermove', pointerId: 2, clientX: 420, clientY: 170 });
  env.fireDoc({ type: 'pointerup', pointerId: 2 });
  assert.equal(env.panel.dataset.dragged, 'true');

  bar.dispatchEvent({ type: 'dblclick', target: bar });
  assert.equal(env.panel.style.left, '');
  assert.equal(env.panel.style.top, '');
  assert.equal(env.panel.style.right, '');
  assert.equal(env.panel.dataset.dragged, undefined);
  assert.equal(env.panel.querySelector('.panel-drag-reset').hidden, true);
});

test('ignores drag start on interactive elements and re-clamps when container shrinks', () => {
  const env = createDomEnv();
  const [ctrl] = env.cad.initDraggablePanels(env.body);
  const bar = ctrl.handle;
  const resetBtn = env.panel.querySelector('.panel-drag-reset');

  // Interactive button inside bar should not initiate drag
  bar.dispatchEvent({ type: 'pointerdown', pointerId: 3, button: 0, pointerType: 'mouse', clientX: 900, clientY: 70, target: resetBtn });
  assert.equal(env.body.classList.contains('is-dragging-dialog'), false);

  // Drag panel to (700, 440) then shrink container to (600, 400)
  bar.dispatchEvent({ type: 'pointerdown', pointerId: 4, button: 0, pointerType: 'mouse', clientX: 720, clientY: 70, target: bar });
  env.fireDoc({ type: 'pointermove', pointerId: 4, clientX: 722, clientY: 452 });
  env.fireDoc({ type: 'pointerup', pointerId: 4 });

  env.container._rect = { left: 0, top: 0, width: 600, height: 400 };
  env.triggerResize();
  // maxLeft = 600 - 280 - 8 = 312, maxTop = 400 - 240 - 8 = 152
  assert.equal(env.panel.style.left, '312px');
  assert.equal(env.panel.style.top, '152px');
});
