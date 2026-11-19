(function (cad) {
  'use strict';

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = vector => {
    const length = Math.hypot(...vector);
    return length ? vector.map(value => value / length) : [0, 0, 0];
  };
  const mix = (a, b, amount) => a + (b - a) * amount;
  const mixVector = (a, b, amount) => a.map((value, index) => mix(value, b[index], amount));
  const addScaled = (a, b, amount) => a.map((value, index) => value + b[index] * amount);
  const distanceToSegment = (point, start, end) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-12) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lenSq));
    return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
  };

  cad.math = { dot, cross, normalize, mix, mixVector, addScaled, distanceToSegment };
})(window.WebCAD = window.WebCAD || {});
