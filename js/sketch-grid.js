(function (cad) {
  'use strict';

  // Keep the drawn grid sparse while sketch points use a fine millimetre grid.
  const precision = 0.001;
  const atLeastPrecision = value => value + 1e-9 >= precision;
  function steps(unit) {
    const targetWorld = 75 / Math.max(unit, 1e-9);
    const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1, targetWorld))));
    const normalized = targetWorld / pow10;
    const multiple = normalized < 1.8 ? 1.25 : normalized < 3.5 ? 2.5 : normalized < 7.5 ? 5 : 12.5;
    const major = Math.max(1.25, +(multiple * pow10).toFixed(4));
    const minor = +(major / 5).toFixed(4);
    return { major, minor, snap: precision, extent: 1000 };
  }

  cad.sketchGrid = { steps, precision, atLeastPrecision };
})(window.WebCAD = window.WebCAD || {});
