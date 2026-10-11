(function (cad) {
  'use strict';

  function prepare(canvas) {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    // Bound each canvas to roughly 24 MB of RGBA pixels on large or high-DPI displays.
    const ratio = Math.min(window.devicePixelRatio || 1, 2,
      Math.sqrt(6_000_000 / (width * height)));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function line(context, start, end, color, width = 1) {
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  }

  function polygon(context, corners) {
    context.beginPath();
    corners.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    context.fill();
    context.stroke();
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  cad.canvas = { prepare, line, polygon, pointInPolygon };
})(window.WebCAD = window.WebCAD || {});
