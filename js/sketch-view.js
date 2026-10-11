(function (cad) {
  'use strict';

  const { prepare, line } = cad.canvas;
  const { sketch, axisColors } = cad.planes;

  class SketchView {
    constructor({ canvas, pane, originLabel, document, getActiveSketch }) {
      this.canvas = canvas;
      this.pane = pane;
      this.originLabel = originLabel;
      this.document = document;
      this.getActiveSketch = getActiveSketch;
      this.plane = null;
    }

    setPlane(name) {
      this.plane = name;
      this.render();
    }

    render() {
      if (this.pane.hidden || !this.plane) return;
      const { context, width, height } = prepare(this.canvas);
      const [horizontalAxis, verticalAxis] = sketch[this.plane].axes;
      const horizontalColor = axisColors[horizontalAxis] || '#4b8eae';
      const verticalColor = axisColors[verticalAxis] || '#6b86a6';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      const majorPx = 50;
      const minorPx = 10;
      const originX = Math.round(width / 2);
      const originY = Math.round(height / 2);

      // Minor grid
      for (let x = originX % minorPx; x < width; x += minorPx) line(context, [x, 0], [x, height], '#f0f4f7', 0.6);
      for (let y = originY % minorPx; y < height; y += minorPx) line(context, [0, y], [width, y], '#f0f4f7', 0.6);

      // Major grid
      for (let x = originX % majorPx; x < width; x += majorPx) line(context, [x, 0], [x, height], '#dce5eb', 1);
      for (let y = originY % majorPx; y < height; y += majorPx) line(context, [0, y], [width, y], '#dce5eb', 1);

      // Axes
      line(context, [0, originY], [width, originY], horizontalColor, 1.8);
      line(context, [originX, 0], [originX, height], verticalColor, 1.8);

      // Labels on axes (25, 50, 75...)
      context.font = '600 8.5px Consolas, monospace';
      context.fillStyle = '#7a8e9e';
      for (let d = majorPx; originX + d < width; d += majorPx) {
        const val = (d / majorPx) * 25;
        context.fillText(String(val), originX + d - 6, originY + 12);
        context.fillText(String(-val), originX - d - 9, originY + 12);
      }
      for (let d = majorPx; originY + d < height; d += majorPx) {
        const val = (d / majorPx) * 25;
        context.fillText(String(-val), originX + 7, originY + d + 3);
        context.fillText(String(val), originX + 7, originY - d + 3);
      }

      context.beginPath();
      context.arc(originX, originY, 4, 0, Math.PI * 2);
      context.fillStyle = '#337fab';
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.stroke();
      context.font = '700 10px Consolas, monospace';
      context.fillStyle = horizontalColor;
      context.fillText(horizontalAxis, originX + 34, originY - 8);
      context.fillStyle = verticalColor;
      context.fillText(verticalAxis, originX + 9, originY - 33);
      const activeSketch = this.getActiveSketch();
      if (activeSketch) {
        const toScreen = point => [originX + point[0] * 2, originY - point[1] * 2];
        for (const profile of cad.sketchProfiles.fromSketch(activeSketch)) {
          cad.sketchRender.drawProfile(context, profile.points, toScreen, undefined, profile.holes);
        }
        for (const entity of activeSketch.entities) {
          cad.sketchRender.drawEntity(context, entity, toScreen, null, 1.8, activeSketch);
          cad.sketchDimensions.drawEntity(context, entity, toScreen, activeSketch);
        }
        const measurementLookup = activeSketch.measurements.length ? cad.SketchDistance.lookup(activeSketch) : null;
        for (const measurement of activeSketch.measurements)
          cad.SketchDistance.draw(context, toScreen, measurement, activeSketch, measurementLookup);
        for (const marker of activeSketch.midpoints) {
          const point = cad.sketchHitTest.markerPoint(activeSketch, marker);
          if (point) cad.sketchHitTest.drawMarker(context, toScreen(point), true);
        }
        cad.sketchConstraints.render(context, activeSketch, toScreen);
      }
      this.originLabel.style.left = `${originX + 11}px`;
      this.originLabel.style.top = `${originY + 8}px`;
    }
  }

  cad.SketchView = SketchView;
})(window.WebCAD = window.WebCAD || {});
