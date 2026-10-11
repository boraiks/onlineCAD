(function (cad) {
  'use strict';

  const icons = Object.freeze({
    line: '<path d="M-7 7 7-7"/><circle cx="-7" cy="7" r="2"/><circle cx="7" cy="-7" r="2"/>',
    rectangle: '<rect x="-7" y="-5" width="14" height="10"/><circle cx="-7" cy="-5" r="1.5"/>',
    circle: '<circle r="7"/><circle r="1.5"/>',
    point: '<path d="M-7 0H7M0-7V7"/><circle r="2"/>',
    fillet: '<path d="M-7-7V0A7 7 0 0 0 0 7H7"/>',
    trim: '<path d="M-7-7 7 7M-7 7 7-7"/><circle cx="-6" cy="-6" r="2"/><circle cx="-6" cy="6" r="2"/>',
    mirror: '<path stroke-dasharray="2 2" d="M0-8V8"/><path d="M-4-5-7 4h4M4-5 7 4H3"/>',
    distance: '<path d="M-8-6V6M8-6V6M-8 0H8m-16 0 4-3m-4 3 4 3m12-3-4-3m4 3-4 3"/>',
    angle: '<path d="M-7 6H7M-7 6 4-6M-1 6A6 6 0 0 0-3 2"/>',
    midpoint: '<path d="M-8 4H8M0-6 4 1h-8z"/>',
    axis: '<path d="M-8 0H8M0-8V8"/><path d="M-4-4h4v4"/>',
    fix: '<rect x="-6" y="-1" width="12" height="9" rx="1"/><path d="M-3-1v-3a3 3 0 0 1 6 0v3M0 3v2"/>',
    tangent: '<circle cy="-2" r="5"/><path d="M-8 3H8"/><circle cy="3" r="1.2"/>',
    coincident: '<path d="M-7 7 7-7M-6-7 7 6"/><circle r="2"/>',
    equal: '<path d="M-7-3H7M-7 3H7"/>',
    offset: '<path d="M-7 5V-5H3M-3 8V-2H7"/>',
    circularPattern: '<path d="M0-7A7 7 0 1 1-7 0M0-7l-3 3m3-3 3 3"/>',
    rectangularPattern: '<rect x="-7" y="-7" width="5" height="5"/><rect x="2" y="-7" width="5" height="5"/><rect x="-7" y="2" width="5" height="5"/><rect x="2" y="2" width="5" height="5"/>',
    construction: '<path d="M-8 5 8-5" stroke-dasharray="3 2"/><path d="M-3-7V7M3-7V7"/>',
  });
  const tools = Object.freeze(Object.keys(icons));
  const cursors = new Map();

  function css(tool) {
    if (!icons[tool]) return '';
    if (cursors.has(tool)) return cursors.get(tool);
    const color = tool === 'trim' ? '#d76442' : '#147eac';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">` +
      `<path d="M3 0v6M0 3h6" stroke="#182230" stroke-width="1.3"/>` +
      `<rect x="14" y="16" width="26" height="26" rx="5" fill="white" stroke="#b9d6e5"/>` +
      `<g transform="translate(27 29)" fill="none" stroke="${color}" stroke-width="1.5"` +
      ` stroke-linecap="round" stroke-linejoin="round">${icons[tool]}</g></svg>`;
    const result = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 3, crosshair`;
    cursors.set(tool, result);
    return result;
  }

  cad.sketchCursor = { tools, css };
})(window.WebCAD = window.WebCAD || {});
