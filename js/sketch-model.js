(function (cad) {
  'use strict';

  const { dot, cross } = cad.math;

  class SketchDocument {
    constructor() {
      this.sketches = [];
      this.nextSketchId = 1;
      this.nextEntityId = 1;
      this.nextMeasurementId = 1;
      this.nextMarkerId = 1;
      this.nextConstraintId = 1;
    }

    makeSketch(plane) {
      if (!cad.planes.grid[plane]) throw new Error(`Unknown sketch plane: ${plane}`);
      const number = this.nextSketchId++;
      return { id: `sketch-${number}`, name: `Sketch ${number}`, plane, visible: true, units: 'mm', entities: [], measurements: [], midpoints: [], constraints: [], revision: 0 };
    }

    insertSketch(sketch) {
      if (!this.sketches.some(item => item.id === sketch.id)) this.sketches.push(sketch);
    }

    removeSketch(id) {
      this.sketches = this.sketches.filter(sketch => sketch.id !== id);
    }

    makeLine(start, end) {
      return this.makeEntity({ type: 'line', start, end });
    }

    makeEntity(geometry, dimensions = {}) {
      if (!cad.sketchGeometry.valid(geometry)) throw new Error('Invalid sketch geometry');
      const id = `entity-${this.nextEntityId++}`;
      const allowed = new Set(cad.sketchGeometry.fields[geometry.type].map(field => field.key));
      if (geometry.type === 'circle') allowed.add('diameter');
      const savedDimensions = Object.fromEntries(Object.entries(dimensions).filter(([key, value]) => allowed.has(key) && Number.isFinite(value)));
      const fixed = Boolean(geometry.fixed);
      const construction = Boolean(geometry.construction);
      if (geometry.type === 'point') return { id, type: 'point', position: [...geometry.position], dimensions: {}, fixed };
      if (geometry.type === 'circle') return { id, type: 'circle', center: [...geometry.center], radius: geometry.radius, dimensions: savedDimensions, fixed, construction };
      if (geometry.type === 'arc') return { id, type: 'arc', center: [...geometry.center], radius: geometry.radius, start: [...geometry.start], end: [...geometry.end], startAngle: geometry.startAngle, endAngle: geometry.endAngle, counterClockwise: Boolean(geometry.counterClockwise), dimensions: savedDimensions, fixed, construction };
      return { id, type: geometry.type, start: [...geometry.start], end: [...geometry.end], dimensions: savedDimensions, fixed, construction };
    }

    setConstruction(sketch, id, construction) {
      const entity = sketch.entities.find(item => item.id === id && item.type !== 'point');
      if (!entity || Boolean(entity.construction) === Boolean(construction)) return false;
      entity.construction = Boolean(construction);
      sketch.revision++;
      return true;
    }

    setFixed(sketch, id, fixed) {
      const entity = sketch.entities.find(item => item.id === id);
      if (!entity || Boolean(entity.fixed) === Boolean(fixed)) return false;
      entity.fixed = Boolean(fixed);
      sketch.revision++;
      return true;
    }

    insertEntity(sketch, entity) {
      if (!sketch.entities.some(item => item.id === entity.id)) {
        sketch.entities.push(entity);
        sketch.revision++;
      }
    }

    removeEntity(sketch, id) {
      sketch.entities = sketch.entities.filter(entity => entity.id !== id);
      sketch.revision++;
    }

    setLineEnd(sketch, id, end) {
      const entity = sketch.entities.find(item => item.id === id && item.type === 'line');
      if (!entity || entity.fixed || !cad.sketchGeometry.valid({ ...entity, end }) || !cad.sketchSnap.withinBounds({ ...entity, end })) return false;
      entity.end = [...end];
      if (Number.isFinite(entity.dimensions?.length)) entity.dimensions.length = Math.hypot(end[0] - entity.start[0], end[1] - entity.start[1]);
      sketch.revision++;
      return true;
    }

    lineEndAtLength(entity, millimetres) {
      if (entity.type !== 'line' || !Number.isFinite(millimetres) || millimetres < cad.sketchGrid.precision) return null;
      const dx = entity.end[0] - entity.start[0];
      const dy = entity.end[1] - entity.start[1];
      const current = Math.hypot(dx, dy);
      return current < cad.sketchGrid.precision ? null : [entity.start[0] + dx * millimetres / current, entity.start[1] + dy * millimetres / current];
    }

    rectangleEndAtEdgeLength(entity, edgeIndex, millimetres) {
      if (entity.type !== 'rectangle' || !Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex > 3 ||
        !Number.isFinite(millimetres) || millimetres < cad.sketchGrid.precision) return null;
      const axis = edgeIndex % 2;
      const direction = Math.sign(entity.end[axis] - entity.start[axis]);
      if (!direction) return null;
      const end = [...entity.end];
      end[axis] = entity.start[axis] + direction * millimetres;
      return end;
    }

    setRectangleEnd(sketch, id, end) {
      const entity = sketch.entities.find(item => item.id === id && item.type === 'rectangle');
      if (!entity || entity.fixed || !cad.sketchGeometry.valid({ ...entity, end }) || !cad.sketchSnap.withinBounds({ ...entity, end })) return false;
      entity.end = [...end];
      if (Number.isFinite(entity.dimensions?.width)) entity.dimensions.width = Math.abs(end[0] - entity.start[0]);
      if (Number.isFinite(entity.dimensions?.height)) entity.dimensions.height = Math.abs(end[1] - entity.start[1]);
      sketch.revision++;
      return true;
    }

    setCircleRadius(sketch, id, radius) {
      const entity = sketch.entities.find(item => item.id === id && item.type === 'circle');
      if (!entity || entity.fixed || !cad.sketchGeometry.valid({ ...entity, radius }) ||
        !cad.sketchSnap.withinBounds({ ...entity, radius })) return false;
      entity.radius = radius;
      if (Number.isFinite(entity.dimensions?.diameter)) entity.dimensions.diameter = radius * 2;
      if (Number.isFinite(entity.dimensions?.radius)) entity.dimensions.radius = radius;
      sketch.revision++;
      return true;
    }

    makeMeasurement(start, end) {
      if (![...start, ...end].every(Number.isFinite)) throw new Error('Invalid measurement points');
      const id = `measurement-${this.nextMeasurementId++}`;
      return { id, kind: 'points', start: [...start], end: [...end], millimetres: Math.hypot(end[0] - start[0], end[1] - start[1]), placement: [0, 0] };
    }

    makeLineMeasurement(entityId) {
      return { id: `measurement-${this.nextMeasurementId++}`, kind: 'line-length', entityId, placement: [0, 0] };
    }

    makeRectangleEdgeMeasurement(entityId, edgeIndex) {
      if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex > 3) throw new Error('Invalid rectangle edge');
      return { id: `measurement-${this.nextMeasurementId++}`, kind: 'rectangle-edge', entityId, edgeIndex, placement: [0, 0] };
    }

    makeCircleDiameterMeasurement(entityId) {
      return { id: `measurement-${this.nextMeasurementId++}`, kind: 'circle-diameter', entityId, placement: [0, 0] };
    }

    makeAngleMeasurement(firstEntityId, secondEntityId) {
      return { id: `measurement-${this.nextMeasurementId++}`, kind: 'angle', firstEntityId, secondEntityId, placement: [0, 0] };
    }

    insertMeasurement(sketch, measurement) {
      if (!sketch.measurements.some(item => item.id === measurement.id)) sketch.measurements.push(measurement);
    }

    removeMeasurement(sketch, id) {
      sketch.measurements = sketch.measurements.filter(item => item.id !== id);
    }

    makeMidpointMarker(entityId, edgeIndex) {
      return { id: `midpoint-${this.nextMarkerId++}`, entityId, edgeIndex };
    }

    insertMidpoint(sketch, marker) {
      if (!sketch.midpoints.some(item => item.entityId === marker.entityId && item.edgeIndex === marker.edgeIndex)) sketch.midpoints.push(marker);
    }

    removeMidpoint(sketch, id) {
      sketch.midpoints = sketch.midpoints.filter(item => item.id !== id);
    }

    makeConstraint(data) {
      return { id: `constraint-${this.nextConstraintId++}`, ...data };
    }

    insertConstraint(sketch, constraint) {
      if (!sketch.constraints.some(item => item.id === constraint.id)) sketch.constraints.push(constraint);
      sketch.revision++;
    }

    removeConstraint(sketch, id) {
      sketch.constraints = sketch.constraints.filter(item => item.id !== id);
      sketch.revision++;
    }

    toWorld(sketch, point) {
      const { u, v, origin = [0, 0, 0] } = cad.planes.grid[sketch.plane];
      return u.map((value, index) => origin[index] + value * point[0] + v[index] * point[1]);
    }

    fromWorld(sketch, point) {
      const { u, v, origin = [0, 0, 0] } = cad.planes.grid[sketch.plane];
      const relative = point.map((value, index) => value - origin[index]);
      return [dot(relative, u), dot(relative, v)];
    }

    // The model canvas uses an orthographic camera. Cast its screen ray onto
    // the chosen origin plane, so sketching also works after orbiting the view.
    screenToPlane(sketch, camera, bounds, clientX, clientY) {
      const unit = camera.unit(bounds.width, bounds.height);
      const [originX, originY] = camera.origin(bounds.width, bounds.height);
      const horizontal = (clientX - bounds.left - originX) / unit;
      const vertical = (originY - (clientY - bounds.top)) / unit;
      const pivot = cad.settings.cameraPivot ? camera.pivot : [0, 0, 0];
      const rayStart = pivot.map((value, index) => value + camera.right[index] * horizontal + camera.up[index] * vertical);
      const { u, v, origin = [0, 0, 0] } = cad.planes.grid[sketch.plane];
      const normal = cross(u, v);
      const divisor = dot(normal, camera.depth);
      if (Math.abs(divisor) < 0.05) return null;
      const distance = dot(normal, origin.map((value, index) => value - rayStart[index])) / divisor;
      const world = rayStart.map((value, index) => value + camera.depth[index] * distance);
      return this.fromWorld(sketch, world);
    }
  }

  cad.SketchDocument = SketchDocument;
})(window.WebCAD = window.WebCAD || {});
