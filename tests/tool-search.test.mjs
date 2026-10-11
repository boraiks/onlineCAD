import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function createEnvironment() {
  const windowListeners = new Map();
  const documentListeners = new Map();

  class MockElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.value = '';
      this._innerHTML = '';
      this.eventListeners = new Map();
      this.classList = {
        _classes: new Set(),
        add: (...c) => c.forEach(item => this.classList._classes.add(item)),
        remove: (...c) => c.forEach(item => this.classList._classes.delete(item)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (this.classList._classes.has(c)) this.classList._classes.delete(c);
            else this.classList._classes.add(c);
          } else if (force) {
            this.classList._classes.add(c);
          } else {
            this.classList._classes.delete(c);
          }
        },
        contains: (c) => this.classList._classes.has(c)
      };
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = val;
      this.children = [];
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    addEventListener(name, handler) {
      if (!this.eventListeners.has(name)) this.eventListeners.set(name, []);
      this.eventListeners.get(name).push(handler);
    }
    dispatchEvent(event) {
      const handlers = this.eventListeners.get(event.type) || [];
      handlers.forEach(h => h(event));
    }
    appendChild(child) { this.children.push(child); }
    focus() { this.focused = true; }
    scrollIntoView() {}
    contains(el) { return this === el || this.children.some(c => c === el || (c.contains && c.contains(el))); }
    querySelector(selector) {
      if (selector === '#toolSearchInput') return this._searchInput || (this._searchInput = new MockElement('input'));
      if (selector === '#toolSearchDropdown') return this._dropdown || (this._dropdown = new MockElement('div'));
      if (selector === '#toolSearchClose') return this._closeBtn || (this._closeBtn = new MockElement('button'));
      if (selector === '.tool-search-item.is-selected') return this.children.find(c => c.classList?.contains('is-selected')) || null;
      return null;
    }
    querySelectorAll(selector) {
      if (selector === '.tool-search-item') return this.children.filter(c => c.classList?.contains('tool-search-item'));
      return [];
    }
  }

  const documentElement = new MockElement('html');
  const bodyElement = new MockElement('body');
  let activeElement = bodyElement;

  const mockDocument = {
    body: bodyElement,
    documentElement,
    get activeElement() { return activeElement; },
    set activeElement(el) { activeElement = el; },
    createElement: tag => new MockElement(tag),
    querySelector: sel => {
      if (sel === '#toolSearchPopup') return null;
      return null;
    },
    addEventListener: (name, handler) => {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(handler);
    }
  };

  const WebCAD = {};
  const sandbox = {
    window: {
      innerWidth: 1024,
      innerHeight: 768,
      WebCAD,
      addEventListener: (name, handler) => {
        if (!windowListeners.has(name)) windowListeners.set(name, []);
        windowListeners.get(name).push(handler);
      }
    },
    document: mockDocument,
    WebCAD,
    console
  };

  sandbox.window.document = mockDocument;
  const context = createContext(sandbox);

  const code = readFileSync(new URL('../js/tool-search.js', import.meta.url), 'utf8');
  runInContext(code, context);

  return {
    cad: sandbox.WebCAD,
    windowListeners,
    documentListeners,
    mockDocument,
    setActiveElement: el => { activeElement = el; }
  };
}

test('ToolSearchController initializes and registers to cad namespace', () => {
  const env = createEnvironment();
  assert.ok(env.cad.ToolSearchController);
  const controller = new env.cad.ToolSearchController();
  assert.equal(controller.isOpen, false);
  assert.ok(controller.tools.length > 20);
});

test('ToolSearchController opens on S key press when not in an input field', () => {
  const env = createEnvironment();
  let executed = false;
  const mockApp = {
    openSketch: () => { executed = true; },
    faceSelection: {}
  };
  const controller = new env.cad.ToolSearchController({ app: mockApp });

  // Simulate mouse movement to (300, 250)
  const pointerHandlers = env.windowListeners.get('pointermove') || [];
  pointerHandlers.forEach(h => h({ clientX: 300, clientY: 250 }));

  // Simulate 's' keydown
  let defaultPrevented = false;
  const keyHandlers = env.windowListeners.get('keydown') || [];
  keyHandlers.forEach(h => h({
    key: 's',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => {}
  }));

  assert.equal(defaultPrevented, true);
  assert.equal(controller.isOpen, true);
  assert.equal(controller.popup.hidden, false);
  // Verify positioned at cursor bottom-right (x + 10, y + 10)
  assert.equal(controller.popup.style.left, '310px');
  assert.equal(controller.popup.style.top, '260px');
});

test('ToolSearchController ignores S key press when typing in input or textarea', () => {
  const env = createEnvironment();
  const inputEl = env.mockDocument.createElement('input');
  env.setActiveElement(inputEl);

  const controller = new env.cad.ToolSearchController();
  let defaultPrevented = false;
  const keyHandlers = env.windowListeners.get('keydown') || [];
  keyHandlers.forEach(h => h({
    key: 's',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => {}
  }));

  assert.equal(defaultPrevented, false);
  assert.equal(controller.isOpen, false);
});

test('ToolSearchController filters tools on query and executes selected tool on Enter', () => {
  const env = createEnvironment();
  let extrudeClicked = false;

  const controller = new env.cad.ToolSearchController();
  controller.open(200, 200);

  // Search "ext"
  controller.search('ext');
  assert.ok(controller.filteredTools.some(t => t.name === 'Extrude'));
  assert.equal(controller.filteredTools[0].name, 'Extrude');

  // Override execute for Extrude to verify call
  controller.filteredTools[0].execute = () => { extrudeClicked = true; };

  // Press Enter
  controller.executeSelected();
  assert.equal(extrudeClicked, true);
  assert.equal(controller.isOpen, false);
  assert.equal(controller.popup.hidden, true);
});

test('ToolSearchController navigates results with ArrowDown and ArrowUp', () => {
  const env = createEnvironment();
  const controller = new env.cad.ToolSearchController();
  controller.open(200, 200);
  controller.search('sketch');

  assert.ok(controller.filteredTools.length > 2);
  assert.equal(controller.selectedIndex, 0);

  controller.moveSelection(1);
  assert.equal(controller.selectedIndex, 1);

  controller.moveSelection(1);
  assert.equal(controller.selectedIndex, 2);

  controller.moveSelection(-1);
  assert.equal(controller.selectedIndex, 1);

  controller.close();
  assert.equal(controller.isOpen, false);
});

test('typing inside toolSearchInput stops propagation so global shortcuts are not fired', () => {
  const env = createEnvironment();
  const controller = new env.cad.ToolSearchController();
  controller.open(200, 200);

  let stopped = false;
  controller.input.dispatchEvent({
    type: 'keydown',
    key: 'e',
    preventDefault() {},
    stopPropagation() { stopped = true; }
  });

  assert.equal(stopped, true, 'Typing letter e in search input stops propagation');
});
