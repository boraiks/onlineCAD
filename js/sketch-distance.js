(function (cad) {
  'use strict';

  class SketchDistance {
    constructor() {
      this.start = null;
      this.end = null;
    }

    begin(point) {
      this.start = [...point];
      this.end = [...point];
    }

    move(point) {
      if (this.start) this.end = point ? [...point] : null;
    }

    value() {
      return this.start && this.end ? Math.hypot(this.end[0] - this.start[0], this.end[1] - this.start[1]) : 0;
    }

    finish(point) {
      if (!this.start || !point) return null;
      this.end = [...point];
      const result = { start: [...this.start], end: [...this.end], millimetres: this.value() };
      this.start = null;
      this.end = null;
      return result;
    }

    cancel() {
      this.start = null;
      this.end = null;
    }

    clear() {
      this.cancel();
    }

    render(context, project) {
      if (!this.start || !this.end) return;
      SketchDistance.draw(context, project, { start: this.start, end: this.end, millimetres: this.value() });
    }

    static lookup(sketch) {
      return new Map(sketch.entities.map(entity => [entity.id, entity]));
    }

    static draw(context, project, measurement, sketch = null, lookup = null) {
      const find = id => lookup ? lookup.get(id) : sketch?.entities.find(item => item.id === id);
      if (measurement.kind === 'line-length') {
        const entity = find(measurement.entityId);
        if (entity?.type !== 'line') return null;
        return cad.sketchDimensions.linear(context, project(entity.start), project(entity.end),
          Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1]), { placement: measurement.placement });
      }
      if (measurement.kind === 'rectangle-edge') {
        const entity = find(measurement.entityId);
        if (entity?.type !== 'rectangle') return null;
        const [x1, y1] = entity.start;
        const [x2, y2] = entity.end;
        const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
        const index = measurement.edgeIndex;
        if (!Number.isInteger(index) || index < 0 || index > 3) return null;
        const segment = { start: corners[index], end: corners[(index + 1) % 4], entity };
        return cad.sketchDimensions.linear(context, project(segment.start), project(segment.end),
          Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]),
          { placement: measurement.placement, reference: project(segment.entity.start.map((value, index) =>
            (value + segment.entity.end[index]) / 2)) });
      }
      if (measurement.kind === 'circle-diameter') {
        const entity = find(measurement.entityId);
        return entity?.type === 'circle' ? cad.sketchDimensions.circleDiameter(context, entity, project,
          { placement: measurement.placement }) : null;
      }
      if (measurement.kind === 'angle') {
        const first = find(measurement.firstEntityId);
        const second = find(measurement.secondEntityId);
        const angle = cad.sketchAngle.measure(first, second);
        return angle ? cad.sketchDimensions.angleArc(context, project(angle.center), project(angle.firstRay), project(angle.secondRay), angle.degrees,
          { placement: measurement.placement }) : null;
      }
      return cad.sketchDimensions.linear(context, project(measurement.start), project(measurement.end), measurement.millimetres,
        { placement: measurement.placement });
    }
  }

  cad.SketchDistance = SketchDistance;
})(window.WebCAD = window.WebCAD || {});
