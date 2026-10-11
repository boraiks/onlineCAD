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

  cad.math = { dot, cross, normalize, mix, mixVector, addScaled };
})(window.WebCAD = window.WebCAD || {});
