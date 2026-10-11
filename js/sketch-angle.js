(function (cad) {
  'use strict';

  function measure(first, second) {
    if (first?.type !== 'line' || second?.type !== 'line' || first.id === second.id) return null;
    const a = first.start;
    const b = second.start;
    const r = [first.end[0] - a[0], first.end[1] - a[1]];
    const s = [second.end[0] - b[0], second.end[1] - b[1]];
    const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-9) return null;
    const between = [b[0] - a[0], b[1] - a[1]];
    const t = cross(between, s) / denominator;
    const u = cross(between, r) / denominator;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    const center = [a[0] + r[0] * t, a[1] + r[1] * t];
    const rayEnd = entity => {
      const startDistance = Math.hypot(entity.start[0] - center[0], entity.start[1] - center[1]);
      const endDistance = Math.hypot(entity.end[0] - center[0], entity.end[1] - center[1]);
      return startDistance > endDistance ? entity.start : entity.end;
    };
    const firstRay = rayEnd(first);
    const secondRay = rayEnd(second);
    const v1 = [firstRay[0] - center[0], firstRay[1] - center[1]];
    const v2 = [secondRay[0] - center[0], secondRay[1] - center[1]];
    const len = Math.hypot(...v1) * Math.hypot(...v2);
    if (len < 1e-9) return null;
    const degrees = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / len))) * 180 / Math.PI;
    return { center, firstRay, secondRay, degrees };
  }

  cad.sketchAngle = { measure };
})(window.WebCAD = window.WebCAD || {});
