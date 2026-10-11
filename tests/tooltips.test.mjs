import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const listeners = new Map();
const elements = [];

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.contains = () => true;
    this.classList = {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {}
    };
    elements.push(this);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  closest() {
    return this;
  }
  getBoundingClientRect() {
    return { left: 100, top: 40, width: 44, height: 44, bottom: 84, right: 144 };
  }
  matches(selector) {
    if (selector === '[title]') return this.hasAttribute('title');
    return false;
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return null;
  }
  get isConnected() {
    return true;
  }
  get offsetWidth() {
    return 260;
  }
  get offsetHeight() {
    return 80;
  }
}

globalThis.HTMLElement = MockElement;
globalThis.Element = MockElement;
globalThis.innerWidth = 1200;
globalThis.innerHeight = 800;

globalThis.document = {
  body: new MockElement('body'),
  createElement: tag => new MockElement(tag),
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener: () => {}
};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};

runInThisContext(readFileSync('./js/tooltips.js', 'utf8'), { filename: 'tooltips.js' });

test('custom CAD tooltips replace native title attributes with rich cards', () => {
  const card = elements.find(el => el.id === 'appTooltip');
  assert.ok(card, 'Custom tooltip card is created');
  assert.equal(card.hidden, true, 'Tooltip is initially hidden');

  const btn = new MockElement('button');
  btn.id = 'solidFilletBtn';
  btn.setAttribute('title', 'Fillet (F)');
  document.body.append(btn);

  // Trigger hover
  const overListeners = listeners.get('pointerover') || [];
  assert.ok(overListeners.length > 0, 'Pointerover listener registered');

  // Pointer event with mouse
  overListeners[0]({ pointerType: 'mouse', target: btn });

  // Fast forward timer
  // The show logic will populate the card
  assert.equal(btn.hasAttribute('title'), false, 'Native title attribute is removed');
});
