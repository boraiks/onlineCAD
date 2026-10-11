(function (cad) {
  'use strict';

  const defaults = Object.freeze({
    line: 'L', rectangle: 'R', circle: 'C', point: 'P', fillet: 'F', trim: 'T',
    mirror: 'M', distance: 'D', angle: 'A', midpoint: '',
    axis: 'H', fix: '', tangent: 'G', coincident: '', equal: '',
    offset: 'O', circularPattern: '', rectangularPattern: '', construction: 'X', extrude: 'E',
  });
  const storageKey = 'webcad.shortcuts.v3';
  const previousDefaults = {
    line: 'L', rectangle: 'R', circle: 'C', point: 'P', fillet: 'F', trim: 'X',
    mirror: '', distance: 'D', angle: 'A', midpoint: 'M',
    horizontal: 'H', vertical: 'V', tangent: 'T',
  };
  const bindings = { ...defaults };
  const listeners = new Set();
  const normalize = value => /^[a-z]$/i.test(String(value || '')) ? String(value).toUpperCase() : '';

  try {
    const stored = window.localStorage?.getItem(storageKey);
    if (stored) {
      const saved = JSON.parse(stored);
      const candidate = { ...defaults };
      for (const tool of Object.keys(defaults)) {
        if (Object.hasOwn(saved, tool)) candidate[tool] = normalize(saved[tool]);
      }
      const assigned = new Set();
      for (const tool of Object.keys(candidate)) {
        if (assigned.has(candidate[tool])) candidate[tool] = '';
        if (candidate[tool]) assigned.add(candidate[tool]);
      }
      Object.assign(bindings, candidate);
    } else {
      const savedV2 = window.localStorage?.getItem('webcad.shortcuts.v2');
      const old = JSON.parse(savedV2 || window.localStorage?.getItem('webcad.shortcuts.v1') || '{}');
      if (Object.entries(old).some(([tool, value]) => tool !== 'offset' && normalize(value) === defaults.offset &&
        (!Object.hasOwn(previousDefaults, tool) || normalize(value) !== previousDefaults[tool])))
        bindings.offset = '';
      const axisKey = normalize(old.horizontal) || normalize(old.vertical);
      if (axisKey) bindings.axis = axisKey;
      for (const tool of Object.keys(defaults)) {
        if (tool === 'axis' || tool === 'fix' || (!savedV2 && (tool === 'trim' || tool === 'mirror')) ||
          !Object.hasOwn(old, tool)) continue;
        const key = normalize(old[tool]);
        if (!savedV2 && key === previousDefaults[tool]) continue;
        if (!key || !Object.entries(bindings).some(([other, value]) => other !== tool && value === key))
          bindings[tool] = key;
      }
      const assigned = Object.values(bindings).filter(Boolean);
      if (new Set(assigned).size !== assigned.length) bindings.axis = defaults.axis;
      window.localStorage?.setItem(storageKey, JSON.stringify(bindings));
    }
  } catch (_) { /* Local storage may be unavailable for file:// pages. */ }

  function save() {
    try { window.localStorage?.setItem(storageKey, JSON.stringify(bindings)); } catch (_) {}
    for (const listener of listeners) listener();
  }

  cad.shortcuts = {
    defaults,
    bindings,
    normalize,
    toolFor(key) {
      const normalized = normalize(key);
      return Object.keys(bindings).find(tool => bindings[tool] && bindings[tool] === normalized) || null;
    },
    set(tool, key) {
      if (!Object.hasOwn(defaults, tool)) return false;
      const normalized = normalize(key);
      if (key && !normalized) return false;
      if (Object.entries(bindings).some(([other, value]) => other !== tool && value === normalized && normalized)) return false;
      bindings[tool] = normalized;
      save();
      return true;
    },
    reset() { Object.assign(bindings, defaults); save(); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
})(window.WebCAD = window.WebCAD || {});
