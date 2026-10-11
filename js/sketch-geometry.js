(function (cad) {
  'use strict';

  const fields = {
    point: [],
    line: [
      { key: 'length', label: 'Length', unit: 'mm' },
      { key: 'angle', label: 'Angle', unit: '°' },
    ],
    rectangle: [
      { key: 'width', label: 'Width', unit: 'mm' },
      { key: 'height', label: 'Height', unit: 'mm' },
    ],
    circle: [
      { key: 'radius', label: 'Radius', unit: 'mm' },
    ],
    arc: [
      { key: 'radius', label: 'Radius', unit: 'mm' },
    ],
    fillet: [
      { key: 'radius', label: 'Radius', unit: 'mm' },
    ],
  };

  // Bound the chord error in model units without letting very large arcs
  // produce unbounded meshes or slow sketch intersection calculations.
  function curveSegments(radius, sweep = Math.PI * 2) {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(sweep)) return 0;
    const angle = Math.min(Math.PI * 2, Math.abs(sweep));
    const step = 2 * Math.acos(1 - Math.min(0.01 / radius, 1));
    return Math.max(2, Math.ceil(64 * angle / (Math.PI * 2)),
      Math.min(512, Math.ceil(angle / step)));
  }

  function measure(type, start, pointer) {
    const dx = pointer[0] - start[0];
    const dy = pointer[1] - start[1];
    if (type === 'line') return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI };
    if (type === 'rectangle') return { width: Math.abs(dx), height: Math.abs(dy) };
    if (type === 'circle') {
      const radius = Math.hypot(dx, dy);
      return { diameter: radius * 2, radius };
    }
    if (type === 'fillet' || type === 'arc') {
      const radius = Math.hypot(dx, dy);
      return { radius };
    }
    return {};
  }

  function shape(type, start, pointer, overrides = {}, preferred = null) {
    const values = { ...measure(type, start, pointer), ...overrides };
    if (type === 'line') {
      const radians = values.angle * Math.PI / 180;
      return { type, start: [...start], end: [start[0] + values.length * Math.cos(radians), start[1] + values.length * Math.sin(radians)] };
    }
    if (type === 'rectangle') {
      const signX = pointer[0] < start[0] ? -1 : 1;
      const signY = pointer[1] < start[1] ? -1 : 1;
      return { type, start: [...start], end: [start[0] + signX * values.width, start[1] + signY * values.height] };
    }
    if (type === 'circle') return { type, center: [...start],
      radius: preferred === 'diameter' || (preferred === null && 'diameter' in overrides && !('radius' in overrides))
        ? values.diameter / 2 : values.radius };
    return null;
  }

  function valid(entity) {
    if (!entity) return false;
    const atLeast = cad.sketchGrid.atLeastPrecision;
    if (entity.type === 'point') return Array.isArray(entity.position) && entity.position.length === 2 && entity.position.every(Number.isFinite);
    if (entity.type === 'line') return atLeast(Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1]));
    if (entity.type === 'rectangle') return atLeast(Math.abs(entity.end[0] - entity.start[0])) && atLeast(Math.abs(entity.end[1] - entity.start[1]));
    if (entity.type === 'circle') return Number.isFinite(entity.radius) && atLeast(entity.radius);
    if (entity.type === 'arc') return Number.isFinite(entity.radius) && atLeast(entity.radius) &&
      Array.isArray(entity.center) && Array.isArray(entity.start) && Array.isArray(entity.end);
    return false;
  }

  function parseValue(text, key) {
    const cleaned = String(text).trim().replace(',', '.');
    if (!cleaned) return null;
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return null;
    if (key !== 'angle' && value <= 0) return null;
    return value;
  }

  function formatValue(value, key) {
    if (!Number.isFinite(value)) return '';
    return String(Number(value.toFixed(key === 'angle' ? 1 : 3)));
  }

  function isRectangleWidthConstant(entity, sketch) {
    if (!entity || entity.type !== 'rectangle') return false;
    const dims = entity.dimensions || {};
    const measurements = sketch?.measurements || [];
    return Number.isFinite(dims.width) ||
      measurements.some(m => m.kind === 'rectangle-edge' && m.entityId === entity.id && (m.edgeIndex === 0 || m.edgeIndex === 2));
  }

  function isRectangleHeightConstant(entity, sketch) {
    if (!entity || entity.type !== 'rectangle') return false;
    const dims = entity.dimensions || {};
    const measurements = sketch?.measurements || [];
    return Number.isFinite(dims.height) ||
      measurements.some(m => m.kind === 'rectangle-edge' && m.entityId === entity.id && (m.edgeIndex === 1 || m.edgeIndex === 3));
  }

  function isRectangleEdgeMotionBlocked(entity, sketch, edgeIndex) {
    if (!entity || entity.type !== 'rectangle') return false;
    if (entity.fixed) return true;
    // Edge 0 & 2 are horizontal (moving them changes Height) -> motion is blocked if Height is constant
    if (edgeIndex === 0 || edgeIndex === 2) return isRectangleHeightConstant(entity, sketch);
    // Edge 1 & 3 are vertical (moving them changes Width) -> motion is blocked if Width is constant
    if (edgeIndex === 1 || edgeIndex === 3) return isRectangleWidthConstant(entity, sketch);
    return false;
  }

  function isConstant(entity, sketch, edgeIndex = null) {
    if (!entity) return false;
    if (entity.fixed) return true;
    const dims = entity.dimensions || {};
    const measurements = sketch?.measurements || [];
    if (entity.type === 'circle') {
      return Number.isFinite(dims.diameter) || Number.isFinite(dims.radius) ||
        measurements.some(m => m.kind === 'circle-diameter' && m.entityId === entity.id);
    }
    if (entity.type === 'arc') {
      return Number.isFinite(dims.radius) || Number.isFinite(dims.diameter);
    }
    if (entity.type === 'line') {
      return Number.isFinite(dims.length) ||
        measurements.some(m => m.kind === 'line-length' && m.entityId === entity.id);
    }
    if (entity.type === 'rectangle') {
      const hasWidth = isRectangleWidthConstant(entity, sketch);
      const hasHeight = isRectangleHeightConstant(entity, sketch);
      if (edgeIndex === null) {
        return hasWidth && hasHeight;
      }
      if (edgeIndex === 0 || edgeIndex === 2) return hasWidth;
      if (edgeIndex === 1 || edgeIndex === 3) return hasHeight;
      return false;
    }
    return false;
  }

  cad.sketchGeometry = {
    fields, curveSegments, measure, shape, valid, parseValue, formatValue,
    isConstant, isRectangleWidthConstant, isRectangleHeightConstant, isRectangleEdgeMotionBlocked
  };
})(window.WebCAD = window.WebCAD || {});
