(function (cad) {
  'use strict';

  const axisColors = { X: '#e54444', Y: '#38a169', Z: '#2b6cb0' };

  // The small selectable origin tiles use a quadrant of each full plane.
  const sketch = {
    XY: { u: [1, 0, 0], v: [0, -1, 0], view: 'top', axes: ['X', 'Y'], fill: 'rgba(229, 68, 68, .16)', stroke: '#e54444' },
    XZ: { u: [1, 0, 0], v: [0, 0, 1], view: 'front', axes: ['X', 'Z'], fill: 'rgba(43, 108, 176, .16)', stroke: '#2b6cb0' },
    YZ: { u: [0, -1, 0], v: [0, 0, 1], view: 'right', axes: ['Y', 'Z'], fill: 'rgba(56, 161, 105, .16)', stroke: '#38a169' },
  };

  // The large coordinate grid is a full plane and follows the hovered tile.
  const grid = {
    XY: { u: [1, 0, 0], v: [0, 1, 0], axes: ['X', 'Y', 'Z'] },
    XZ: { u: [1, 0, 0], v: [0, 0, 1], axes: ['X', 'Z', 'Y'] },
    YZ: { u: [0, 1, 0], v: [0, 0, 1], axes: ['Y', 'Z', 'X'] },
  };

  cad.planes = { sketch, grid, axisColors };
})(window.WebCAD = window.WebCAD || {});
