(function (cad) {
  'use strict';

  function circleIntersections(first, second, firstRadius = first.radius, secondRadius = second.radius) {
    const dx = second.center[0] - first.center[0], dy = second.center[1] - first.center[1];
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-9 || distance > firstRadius + secondRadius - 1e-9 ||
      distance < Math.abs(firstRadius - secondRadius) + 1e-9) return [];
    const along = (firstRadius ** 2 - secondRadius ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstRadius ** 2 - along ** 2));
    const x = first.center[0] + dx * along / distance;
    const y = first.center[1] + dy * along / distance;
    return [[x - dy * height / distance, y + dx * height / distance],
      [x + dy * height / distance, y - dx * height / distance]];
  }

  function longArcFromCircle(entity, vertex, tangent, id) {
    const startAngle = Math.atan2(vertex[1] - entity.center[1], vertex[0] - entity.center[0]);
    const endAngle = Math.atan2(tangent[1] - entity.center[1], tangent[0] - entity.center[0]);
    const positive = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
    return { id, type: 'arc', center: [...entity.center], radius: entity.radius,
      start: [...vertex], end: [...tangent], startAngle, endAngle,
      counterClockwise: positive < Math.PI, dimensions: {}, construction: entity.construction };
  }

  function lineIntersection(first, second) {
    const p = first.start, q = second.start;
    const r = [first.end[0] - p[0], first.end[1] - p[1]];
    const s = [second.end[0] - q[0], second.end[1] - q[1]];
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-9) return null;
    const delta = [q[0] - p[0], q[1] - p[1]];
    const t = cross(delta, s) / denominator;
    const u = cross(delta, r) / denominator;
    return t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5
      ? [p[0] + t * r[0], p[1] + t * r[1]] : null;
  }

  function lineCircleIntersections(segment, circle) {
    const [x, y] = segment.start, dx = segment.end[0] - x, dy = segment.end[1] - y;
    const px = x - circle.center[0], py = y - circle.center[1];
    const a = dx * dx + dy * dy, b = 2 * (px * dx + py * dy);
    const discriminant = b * b - 4 * a * (px * px + py * py - circle.radius ** 2);
    if (a < 1e-9 || discriminant <= 1e-9) return [];
    return [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
      .filter(t => t >= -1e-5 && t <= 1 + 1e-5)
      .map(t => [x + t * dx, y + t * dy]);
  }

  function chosenArm(segment, vertex, click) {
    const vector = [segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]];
    const towardEnd = (click[0] - vertex[0]) * vector[0] + (click[1] - vertex[1]) * vector[1] >= 0;
    const endpoint = towardEnd ? segment.end : segment.start;
    const len = Math.hypot(endpoint[0] - vertex[0], endpoint[1] - vertex[1]);
    return { u: [(endpoint[0] - vertex[0]) / len, (endpoint[1] - vertex[1]) / len],
      len, isStart: !towardEnd, endpoint };
  }

  function arcSweep(entity) {
    let sweep = entity.endAngle - entity.startAngle;
    if (entity.counterClockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!entity.counterClockwise && sweep < 0) sweep += Math.PI * 2;
    return sweep;
  }

  function curveParameter(entity, point) {
    if (entity.type === 'circle') return null;
    const sweep = arcSweep(entity);
    if (Math.abs(sweep) < 1e-9) return null;
    let offset = Math.atan2(point[1] - entity.center[1], point[0] - entity.center[0]) - entity.startAngle;
    if (sweep > 0) {
      while (offset < -1e-9) offset += Math.PI * 2;
      while (offset > Math.PI * 2 + 1e-9) offset -= Math.PI * 2;
    } else {
      while (offset > 1e-9) offset -= Math.PI * 2;
      while (offset < -Math.PI * 2 - 1e-9) offset += Math.PI * 2;
    }
    const parameter = offset / sweep;
    return parameter >= -1e-5 && parameter <= 1 + 1e-5 ? Math.max(0, Math.min(1, parameter)) : null;
  }

  function curveBranch(entity, vertex, click) {
    if (entity.type === 'arc') {
      const atVertex = curveParameter(entity, vertex), atClick = curveParameter(entity, click);
      return atVertex == null || atClick == null ? 0 : Math.sign(atClick - atVertex);
    }
    const radial = [vertex[0] - entity.center[0], vertex[1] - entity.center[1]];
    const towardClick = [click[0] - entity.center[0], click[1] - entity.center[1]];
    return Math.sign(radial[0] * towardClick[1] - radial[1] * towardClick[0]);
  }

  function tangentOnBranch(entity, vertex, tangent, branch) {
    if (entity.type === 'arc') {
      const atVertex = curveParameter(entity, vertex), atTangent = curveParameter(entity, tangent);
      return atVertex != null && atTangent != null &&
        Math.sign(atTangent - atVertex) === branch;
    }
    return curveBranch(entity, vertex, tangent) === branch;
  }

  function arcSlice(entity, first, last, id) {
    if (last - first < 1e-6) return null;
    const sweep = arcSweep(entity);
    const startAngle = entity.startAngle + first * sweep;
    const endAngle = entity.startAngle + last * sweep;
    const at = angle => [entity.center[0] + entity.radius * Math.cos(angle),
      entity.center[1] + entity.radius * Math.sin(angle)];
    return { ...entity, id, startAngle, endAngle,
      start: at(startAngle), end: at(endAngle), dimensions: {} };
  }

  function filletArcMidpoint(geometry) {
    let sweep = geometry.endAngle - geometry.startAngle;
    if (geometry.counterClockwise && sweep > 0) sweep -= Math.PI * 2;
    if (!geometry.counterClockwise && sweep < 0) sweep += Math.PI * 2;
    const angle = geometry.startAngle + sweep / 2;
    return [geometry.center[0] + geometry.R * Math.cos(angle),
      geometry.center[1] + geometry.R * Math.sin(angle)];
  }

  class SketchFillet {
    constructor({ getActiveSketch, sketchDoc, document: docParam, camera, history, hud, onChange, onFinished }) {
      this.getActiveSketch = getActiveSketch;
      this.sketchDoc = sketchDoc || docParam;
      this.document = this.sketchDoc;
      this.camera = camera;
      this.history = history;
      this.hud = hud;
      this.onChange = onChange;
      this.onFinished = onFinished;

      this.active = false;
      this.selectedCorner = null;
      this.hoveredCorner = null;
      this.currentRadius = 5.0;
      this.inputElement = null;
      this.firstSegment = null;
      this.pendingCorners = null;
      this.hoveredBoundary = null;
      this.hoveredPreview = null;
      this.prompt = globalThis.document?.querySelector?.('#filletPrompt') || null;
      this.handleDrag = null;
      this.cornerCache = new WeakMap();
      this.chainSelection = false;
    }

    start() {
      this.active = true;
      this.selectedCorner = null;
      this.hoveredCorner = null;
      this.firstSegment = null;
      this.pendingCorners = null;
      this.hoveredBoundary = null;
      this.hoveredPreview = null;
      this.handleDrag = null;
      this.currentRadius = 5.0;
      this.chainSelection = false;
      this.hideHud();
      if (this.prompt) this.prompt.hidden = true;
    }

    cancel() {
      if (this.handleDrag?.target?.hasPointerCapture?.(this.handleDrag.pointerId))
        this.handleDrag.target.releasePointerCapture(this.handleDrag.pointerId);
      this.active = false;
      this.selectedCorner = null;
      this.hoveredCorner = null;
      this.firstSegment = null;
      this.pendingCorners = null;
      this.hoveredBoundary = null;
      this.hoveredPreview = null;
      this.handleDrag = null;
      this.hideHud();
      if (this.prompt) this.prompt.hidden = true;
      this.onChange();
    }

    hideHud() {
      if (this.hud) {
        this.hud.hidden = true;
        this.hud.replaceChildren();
      }
      this.inputElement = null;
    }

    getCorners(sketch) {
      if (!sketch || !sketch.entities) return [];
      const cached = this.cornerCache.get(sketch);
      if (cached?.revision === sketch.revision && cached.entities === sketch.entities &&
        cached.count === sketch.entities.length) return cached.corners;
      const segments = [];
      for (const entity of sketch.entities) {
        if (entity.fixed) continue;
        if (entity.type === 'line') {
          segments.push({
            entity,
            start: entity.start,
            end: entity.end,
            edgeIndex: 0
          });
        } else if (entity.type === 'rectangle') {
          const [x1, y1] = entity.start;
          const [x2, y2] = entity.end;
          const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
          corners.forEach((pt, i) => {
            segments.push({
              entity,
              start: pt,
              end: corners[(i + 1) % 4],
              edgeIndex: i
            });
          });
        }
      }

      const corners = [];
      const eps = 0.25;
      const ptEq = (p1, p2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < eps;

      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const s1 = segments[i];
          const s2 = segments[j];
          if (s1.entity.id === s2.entity.id && s1.entity.type === 'line') continue;

          let vertex = null;
          let p1 = null;
          let p2 = null;
          let s1IsStart = false;
          let s2IsStart = false;

          if (ptEq(s1.start, s2.start)) {
            vertex = s1.start; p1 = s1.end; p2 = s2.end; s1IsStart = true; s2IsStart = true;
          } else if (ptEq(s1.start, s2.end)) {
            vertex = s1.start; p1 = s1.end; p2 = s2.start; s1IsStart = true; s2IsStart = false;
          } else if (ptEq(s1.end, s2.start)) {
            vertex = s1.end; p1 = s1.start; p2 = s2.end; s1IsStart = false; s2IsStart = true;
          } else if (ptEq(s1.end, s2.end)) {
            vertex = s1.end; p1 = s1.start; p2 = s2.start; s1IsStart = false; s2IsStart = false;
          }

          if (vertex && p1 && p2) {
            const v1 = [p1[0] - vertex[0], p1[1] - vertex[1]];
            const v2 = [p2[0] - vertex[0], p2[1] - vertex[1]];
            const len1 = Math.hypot(v1[0], v1[1]);
            const len2 = Math.hypot(v2[0], v2[1]);
            if (len1 > cad.sketchGrid.precision && len2 > cad.sketchGrid.precision) {
              const u1 = [v1[0] / len1, v1[1] / len1];
              const u2 = [v2[0] / len2, v2[1] / len2];
              const dot = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
              const theta = Math.acos(dot);
              if (theta > 0.08 && theta < Math.PI - 0.08) {
                const tMax = Math.min(len1, len2) * 0.9;
                const rMax = tMax * Math.tan(theta / 2);
                corners.push({
                  vertex: [...vertex],
                  p1: [...p1],
                  p2: [...p2],
                  u1,
                  u2,
                  len1,
                  len2,
                  theta,
                  rMax,
                  s1,
                  s2,
                  s1IsStart,
                  s2IsStart
                });
              }
            }
          } else {
            const crossing = lineIntersection(s1, s2);
            if (crossing) corners.push({ kind: 'cross-line-line', vertex: crossing, s1, s2 });
          }
        }
      }
      const curves = sketch.entities.filter(entity =>
        (entity.type === 'circle' || entity.type === 'arc') && !entity.fixed);
      for (const segment of segments) for (const curve of curves)
        for (const vertex of lineCircleIntersections(segment, curve)) {
          if (curve.type === 'arc' && curveParameter(curve, vertex) == null) continue;
          corners.push({ kind: 'line-circle', vertex, s1: segment,
            s2: { entity: curve, edgeIndex: null }, rMax: Math.min(curve.radius, 5) });
        }
      for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
        for (const vertex of circleIntersections(curves[i], curves[j])) {
          if ((curves[i].type === 'arc' && curveParameter(curves[i], vertex) == null) ||
            (curves[j].type === 'arc' && curveParameter(curves[j], vertex) == null)) continue;
          corners.push({ kind: curves[i].type === 'circle' && curves[j].type === 'circle'
            ? 'circle-circle' : 'curve-curve', vertex,
            s1: { entity: curves[i], edgeIndex: null },
            s2: { entity: curves[j], edgeIndex: null },
            rMax: Math.min(curves[i].radius, curves[j].radius) * 0.5 });
        }
      }
      this.cornerCache.set(sketch, { revision: sketch.revision, entities: sketch.entities,
        count: sketch.entities.length, corners });
      return corners;
    }

    findCornerAt(screenX, screenY, maxDist = 14, bounds = null) {
      const sketch = this.getActiveSketch();
      if (!sketch) return null;
      const corners = this.pendingCorners || this.getCorners(sketch).filter(corner => !corner.kind);
      const area = bounds || this.hud?.parentElement?.getBoundingClientRect() || { width: 800, height: 600 };
      const toScreen = pt => this.camera.project(this.document.toWorld(sketch, pt), area.width, area.height);

      let best = null;
      let minD = maxDist;
      for (const corner of corners) {
        const [sx, sy] = toScreen(corner.vertex);
        const d = Math.hypot(sx - screenX, sy - screenY);
        if (d <= minD) {
          minD = d;
          best = corner;
        }
      }
      return best;
    }

    computeFilletGeometry(corner, R) {
      if (!corner || !Number.isFinite(R) || R <= 0) return null;
      if (corner.kind === 'curve-curve') {
        const first = corner.s1.entity, second = corner.s2.entity;
        const candidates = circleIntersections(first, second, first.radius + R, second.radius + R)
          .map(center => {
            const tangent = entity => entity.center.map((value, axis) =>
              value + (center[axis] - value) * entity.radius / (entity.radius + R));
            return { center, t1: tangent(first), t2: tangent(second) };
          }).filter(candidate =>
            tangentOnBranch(first, corner.vertex, candidate.t1, corner.branch1) &&
            tangentOnBranch(second, corner.vertex, candidate.t2, corner.branch2));
        if (!candidates.length) return null;
        const chosen = candidates.sort((a, b) =>
          Math.hypot(a.center[0] - corner.vertex[0], a.center[1] - corner.vertex[1]) -
          Math.hypot(b.center[0] - corner.vertex[0], b.center[1] - corner.vertex[1]))[0];
        const startAngle = Math.atan2(chosen.t1[1] - chosen.center[1], chosen.t1[0] - chosen.center[0]);
        const endAngle = Math.atan2(chosen.t2[1] - chosen.center[1], chosen.t2[0] - chosen.center[0]);
        const positive = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
        const midpoint = sweep => [chosen.center[0] + R * Math.cos(startAngle + sweep / 2),
          chosen.center[1] + R * Math.sin(startAngle + sweep / 2)];
        const near = point => Math.hypot(point[0] - corner.vertex[0], point[1] - corner.vertex[1]);
        return { ...chosen, R, startAngle, endAngle,
          counterClockwise: near(midpoint(positive - Math.PI * 2)) < near(midpoint(positive)) };
      }
      if (corner.kind === 'line-circle') {
        const { vertex, s1, s2, u1, len1, circleBranch } = corner;
        if (!u1 || !circleBranch) return null;
        const circle = s2.entity, center = circle.center;
        const candidates = [];
        for (const side of [-1, 1]) {
          const perpendicular = [-u1[1] * side, u1[0] * side];
          const shifted = [vertex[0] + perpendicular[0] * R - center[0],
            vertex[1] + perpendicular[1] * R - center[1]];
          const along = shifted[0] * u1[0] + shifted[1] * u1[1];
          const discriminant = along ** 2 - (shifted[0] ** 2 + shifted[1] ** 2 - (circle.radius + R) ** 2);
          if (discriminant < 0) continue;
          for (const T of [-along - Math.sqrt(discriminant), -along + Math.sqrt(discriminant)]) {
            if (T <= 1e-5 || T >= len1 * 0.95) continue;
            const filletCenter = [vertex[0] + u1[0] * T + perpendicular[0] * R,
              vertex[1] + u1[1] * T + perpendicular[1] * R];
            const tangent = center.map((value, axis) =>
              value + (filletCenter[axis] - value) * circle.radius / (circle.radius + R));
            if (!tangentOnBranch(circle, vertex, tangent, circleBranch)) continue;
            candidates.push({ T, center: filletCenter, t1: [vertex[0] + u1[0] * T,
              vertex[1] + u1[1] * T], t2: tangent });
          }
        }
        if (!candidates.length) return null;
        const best = candidates.sort((a, b) => a.T - b.T)[0];
        const startAngle = Math.atan2(best.t1[1] - best.center[1], best.t1[0] - best.center[0]);
        const endAngle = Math.atan2(best.t2[1] - best.center[1], best.t2[0] - best.center[0]);
        const positive = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
        const midpoint = sweep => [best.center[0] + R * Math.cos(startAngle + sweep / 2),
          best.center[1] + R * Math.sin(startAngle + sweep / 2)];
        const near = point => Math.hypot(point[0] - vertex[0], point[1] - vertex[1]);
        return { ...best, R, startAngle, endAngle,
          counterClockwise: near(midpoint(positive - Math.PI * 2)) < near(midpoint(positive)) };
      }
      if (corner.kind === 'circle-circle') {
        const first = corner.s1.entity, second = corner.s2.entity;
        const centers = circleIntersections(first, second, first.radius + R, second.radius + R);
        if (!centers.length) return null;
        const center = centers.reduce((nearest, item) =>
          Math.hypot(item[0] - corner.vertex[0], item[1] - corner.vertex[1]) <
          Math.hypot(nearest[0] - corner.vertex[0], nearest[1] - corner.vertex[1]) ? item : nearest);
        const tangent = entity => entity.center.map((value, axis) =>
          value + (center[axis] - value) * entity.radius / (entity.radius + R));
        const t1 = tangent(first), t2 = tangent(second);
        const startAngle = Math.atan2(t1[1] - center[1], t1[0] - center[0]);
        const endAngle = Math.atan2(t2[1] - center[1], t2[0] - center[0]);
        const positive = (endAngle - startAngle + Math.PI * 2) % (Math.PI * 2);
        const midPositive = [center[0] + R * Math.cos(startAngle + positive / 2),
          center[1] + R * Math.sin(startAngle + positive / 2)];
        const negative = positive - Math.PI * 2;
        const midNegative = [center[0] + R * Math.cos(startAngle + negative / 2),
          center[1] + R * Math.sin(startAngle + negative / 2)];
        const nearVertex = point => Math.hypot(point[0] - corner.vertex[0], point[1] - corner.vertex[1]);
        return { R, t1, t2, center, startAngle, endAngle,
          counterClockwise: nearVertex(midNegative) < nearVertex(midPositive) };
      }
      const { vertex, u1, u2, theta, len1, len2 } = corner;
      const halfAngle = theta / 2;
      const tanHalf = Math.tan(halfAngle);
      const sinHalf = Math.sin(halfAngle);

      let T = R / tanHalf;
      const tMax = Math.min(len1, len2) * 0.95;
      if (T > tMax) {
        T = tMax;
        R = T * tanHalf;
      }

      const t1 = [vertex[0] + u1[0] * T, vertex[1] + u1[1] * T];
      const t2 = [vertex[0] + u2[0] * T, vertex[1] + u2[1] * T];

      const bisector = [u1[0] + u2[0], u1[1] + u2[1]];
      const bisLen = Math.hypot(bisector[0], bisector[1]);
      if (bisLen < 1e-6) return null;
      const uBis = [bisector[0] / bisLen, bisector[1] / bisLen];

      const distCenter = R / sinHalf;
      const center = [vertex[0] + uBis[0] * distCenter, vertex[1] + uBis[1] * distCenter];

      const ang1 = Math.atan2(t1[1] - center[1], t1[0] - center[0]);
      const ang2 = Math.atan2(t2[1] - center[1], t2[0] - center[0]);

      let sweepPos = ang2 - ang1;
      if (sweepPos < 0) sweepPos += Math.PI * 2;
      const midPos = [center[0] + R * Math.cos(ang1 + sweepPos / 2), center[1] + R * Math.sin(ang1 + sweepPos / 2)];
      const distPos = Math.hypot(midPos[0] - vertex[0], midPos[1] - vertex[1]);

      let sweepNeg = ang2 - ang1;
      if (sweepNeg > 0) sweepNeg -= Math.PI * 2;
      const midNeg = [center[0] + R * Math.cos(ang1 + sweepNeg / 2), center[1] + R * Math.sin(ang1 + sweepNeg / 2)];
      const distNeg = Math.hypot(midNeg[0] - vertex[0], midNeg[1] - vertex[1]);

      const counterClockwise = distNeg < distPos;

      return {
        R,
        T,
        t1,
        t2,
        center,
        startAngle: ang1,
        endAngle: ang2,
        counterClockwise
      };
    }

    chainCorners(sketch = this.getActiveSketch()) {
      if (!this.selectedCorner || !sketch) return [];
      if (this.selectedCorner.kind) return [this.selectedCorner];
      if (!this.chainSelection) return [this.selectedCorner];
      const ids = cad.sketchChain.connectedIds(sketch, this.selectedCorner.s1.entity.id);
      const corners = this.getCorners(sketch).filter(corner =>
        ids.has(corner.s1.entity.id) && ids.has(corner.s2.entity.id));
      // A junction with three or more edges has no unambiguous pair to round.
      return corners.filter(corner => corners.filter(other =>
        Math.hypot(other.vertex[0] - corner.vertex[0], other.vertex[1] - corner.vertex[1]) < 0.0015).length === 1);
    }

    maximumRadius() {
      const corners = this.chainCorners();
      return corners.length ? Math.min(...corners.map(corner =>
        corner.kind === 'circle-circle' || corner.kind === 'line-circle' || corner.kind === 'curve-curve' ? corner.rMax :
          Math.min(corner.len1, corner.len2) * (this.chainSelection ? 0.45 : 0.9) * Math.tan(corner.theta / 2))) : 0;
    }

    onPointerMove(event) {
      if (!this.active) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const bounds = event.target.getBoundingClientRect();
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;

      if (this.prompt) {
        this.prompt.hidden = Boolean(this.selectedCorner);
        this.prompt.textContent = this.pendingCorners ? 'Select intersection'
          : this.firstSegment ? 'Select second line or arc' : 'Select first line or arc';
        this.prompt.style.left = `${Math.max(8, Math.min(bounds.width - 185, screenX + 15))}px`;
        this.prompt.style.top = `${Math.max(8, Math.min(bounds.height - 30, screenY + 13))}px`;
      }

      if (this.handleDrag?.pointerId === event.pointerId) {
        const drag = this.handleDrag;
        const [dx, dy] = drag.pixelsPerMm;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared > 1e-6) {
          const movement = ((event.clientX - drag.startX) * dx +
            (event.clientY - drag.startY) * dy) / lengthSquared;
          this.currentRadius = Math.max(cad.sketchGrid.precision,
            Math.min(this.maximumRadius(), drag.startRadius + movement));
          if (this.inputElement) this.inputElement.value = this.currentRadius.toFixed(3);
          event.target.style.cursor = 'grabbing';
          this.onChange();
        }
        return;
      }

      if (this.selectedCorner) {
        event.target.style.cursor = this.hitHandle(event, bounds) ? 'grab' : '';
        this.onChange();
        return;
      }
      const project = point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height);
      this.hoveredBoundary = cad.sketchHitTest.boundariesAt(sketch, project, [screenX, screenY], 10)
        .find(hit => !hit.entity.fixed &&
          (!this.firstSegment || hit.entity.id !== this.firstSegment.entity.id ||
            hit.edgeIndex !== this.firstSegment.edgeIndex)) || null;
      this.hoveredPreview = null;
      if (this.firstSegment && this.hoveredBoundary) {
        const hit = { ...this.hoveredBoundary,
          click: this.document.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY) };
        const same = (a, b) => a.entity.id === b.entity.id && a.edgeIndex === b.edgeIndex;
        const corner = this.getCorners(sketch).find(item =>
          (same(item.s1, this.firstSegment) && same(item.s2, hit)) ||
          (same(item.s2, this.firstSegment) && same(item.s1, hit)));
        if (corner) {
          const prepared = this.prepareIntersection(corner, this.firstSegment, hit);
          this.hoveredPreview = prepared && this.computeFilletGeometry(prepared, Math.min(5, prepared.rMax || 5));
        }
      }
      this.hoveredCorner = this.findCornerAt(screenX, screenY, 16, bounds);
      this.onChange();
    }

    hitHandle(event, bounds = event.target.getBoundingClientRect()) {
      if (!this.selectedCorner) return false;
      const sketch = this.getActiveSketch();
      const geometry = this.computeFilletGeometry(this.selectedCorner, this.currentRadius);
      if (!sketch || !geometry) return false;
      const [x, y] = this.camera.project(this.document.toWorld(sketch, filletArcMidpoint(geometry)), bounds.width, bounds.height);
      return Math.hypot(event.clientX - bounds.left - x, event.clientY - bounds.top - y) <= 16;
    }

    beginHandleDrag(event) {
      if (!this.active || !this.hitHandle(event)) return false;
      const sketch = this.getActiveSketch();
      const bounds = event.target.getBoundingClientRect();
      const base = this.computeFilletGeometry(this.selectedCorner, this.currentRadius);
      const max = this.maximumRadius();
      const sampleRadius = this.currentRadius + Math.min(1, (max - this.currentRadius) / 2) > this.currentRadius + 1e-6
        ? this.currentRadius + Math.min(1, (max - this.currentRadius) / 2)
        : Math.max(cad.sketchGrid.precision, this.currentRadius - 1);
      const sample = this.computeFilletGeometry(this.selectedCorner, sampleRadius);
      const toScreen = point => this.camera.project(this.document.toWorld(sketch, point), bounds.width, bounds.height);
      const from = toScreen(filletArcMidpoint(base));
      const to = sample ? toScreen(filletArcMidpoint(sample)) : from;
      const divisor = sampleRadius - this.currentRadius || 1;
      this.handleDrag = { pointerId: event.pointerId, target: event.target,
        startX: event.clientX, startY: event.clientY, startRadius: this.currentRadius,
        pixelsPerMm: [(to[0] - from[0]) / divisor, (to[1] - from[1]) / divisor] };
      event.target.setPointerCapture?.(event.pointerId);
      event.target.style.cursor = 'grabbing';
      return true;
    }

    endHandleDrag(event) {
      if (!this.handleDrag || this.handleDrag.pointerId !== event.pointerId) return false;
      this.handleDrag = null;
      if (event.target.hasPointerCapture?.(event.pointerId)) event.target.releasePointerCapture(event.pointerId);
      event.target.style.cursor = 'grab';
      return true;
    }

    onPointerDown(event) {
      if (!this.active || event.button !== 0) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const bounds = event.target.getBoundingClientRect();
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;

      if (this.selectedCorner) {
        // The radius is confirmed through the numeric field, Enter, or OK.
        return;
      }

      if (this.pendingCorners) {
        const pending = this.findCornerAt(screenX, screenY, 18, bounds);
        if (pending) { this.selectCorner(pending, bounds); return; }
        this.pendingCorners = null;
      }

      // Direct click on any corner vertex of lines immediately selects it
      const directCorner = this.findCornerAt(screenX, screenY, 10, bounds);
      if (directCorner && !directCorner.kind) {
        this.firstSegment = null;
        this.selectCorner(directCorner, bounds);
        return;
      }

      {
        // Select two actual edges; for multiple intersections the user then
        // clicks the desired intersection.
        const project =
          pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height),
          point = [screenX, screenY];
        const hit = cad.sketchHitTest.boundariesAt(sketch, project, point, 10)[0];
        if (hit) {
          hit.click = this.document.screenToPlane(sketch, this.camera, bounds, event.clientX, event.clientY);
          if (!this.firstSegment) {
            this.firstSegment = hit;
            this.onChange();
          } else {
            // Find corner between firstSegment and hit
            const corners = this.getCorners(sketch);
            const sameSegment = (a, b) => a.entity.id === b.entity.id && a.edgeIndex === b.edgeIndex;
            const matching = corners.filter(c =>
              (sameSegment(c.s1, this.firstSegment) && sameSegment(c.s2, hit)) ||
              (sameSegment(c.s2, this.firstSegment) && sameSegment(c.s1, hit)));
            const prepared = matching.map(candidate => this.prepareIntersection(candidate,
              this.firstSegment, hit)).filter(Boolean);
            if (prepared.length === 1) {
              this.firstSegment = null;
              this.selectCorner(prepared[0], bounds);
            } else if (prepared.length > 1) {
              this.firstSegment = null;
              this.pendingCorners = prepared;
              this.onChange();
            } else {
              this.firstSegment = hit;
              this.onChange();
            }
          }
        }
      }
    }

    prepareIntersection(corner, firstHit, secondHit) {
      if (!corner.kind || corner.kind === 'circle-circle') return corner;
      const hitFor = segment => [firstHit, secondHit].find(hit =>
        hit.entity.id === segment.entity.id && hit.edgeIndex === segment.edgeIndex);
      if (corner.kind === 'curve-curve') {
        const branch1 = curveBranch(corner.s1.entity, corner.vertex, hitFor(corner.s1)?.click || corner.vertex);
        const branch2 = curveBranch(corner.s2.entity, corner.vertex, hitFor(corner.s2)?.click || corner.vertex);
        return branch1 && branch2 ? { ...corner, branch1, branch2 } : null;
      }
      const a = chosenArm(corner.s1, corner.vertex, hitFor(corner.s1)?.click || corner.s1.start);
      if (a.len < cad.sketchGrid.precision) return null;
      if (corner.kind === 'line-circle') {
        const circle = corner.s2.entity;
        const click = hitFor(corner.s2)?.click;
        if (!click) return null;
        const circleBranch = curveBranch(circle, corner.vertex, click);
        return { ...corner, u1: a.u, len1: a.len, s1IsStart: a.isStart,
          circleBranch: circleBranch || 1, rMax: Math.min(a.len * 0.8, circle.radius * 0.5) };
      }
      const b = chosenArm(corner.s2, corner.vertex, hitFor(corner.s2)?.click || corner.s2.start);
      if (b.len < cad.sketchGrid.precision) return null;
      const cosine = Math.max(-1, Math.min(1, a.u[0] * b.u[0] + a.u[1] * b.u[1]));
      const theta = Math.acos(cosine);
      if (theta < 0.08 || theta > Math.PI - 0.08) return null;
      return { ...corner, u1: a.u, u2: b.u, len1: a.len, len2: b.len,
        theta, s1IsStart: a.isStart, s2IsStart: b.isStart,
        rMax: Math.min(a.len, b.len) * 0.9 * Math.tan(theta / 2) };
    }

    selectCorner(corner, bounds) {
      this.selectedCorner = corner;
      this.hoveredCorner = null;
      this.firstSegment = null;
      this.pendingCorners = null;
      this.hoveredBoundary = null;
      this.hoveredPreview = null;
      if (this.prompt) this.prompt.hidden = true;

      // Set suitable initial radius
      const defaultR = Math.min(5.0, corner.rMax * 0.7);
      this.currentRadius = Math.min(corner.rMax, Math.max(cad.sketchGrid.precision, Number(defaultR.toFixed(3))));

      this.showHud(corner, bounds);
      this.onChange();
    }

    showHud(corner, bounds) {
      if (!this.hud) return;
      this.hud.replaceChildren();

      const sketch = this.getActiveSketch();
      const toScreen = pt => this.camera.project(this.document.toWorld(sketch, pt), bounds.width, bounds.height);
      const [sx, sy] = toScreen(corner.vertex);

      const row = document.createElement('div');
      row.className = 'dimension-row';

      const label = document.createElement('span');
      label.className = 'dimension-name';
      label.textContent = 'Radius';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = this.currentRadius.toFixed(3);
      input.autofocus = true;

      const unit = document.createElement('span');
      unit.className = 'dimension-unit';
      unit.textContent = 'mm';

      row.append(label, input, unit);
      this.hud.append(row);

      const chain = document.createElement('label');
      chain.className = 'chain-selection';
      chain.title = 'Automatically selects chained sketch geometry.';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.chainSelection;
      chain.append(checkbox, document.createTextNode('Chain Selection'));
      this.hud.append(chain);
      checkbox.addEventListener('change', () => {
        this.chainSelection = checkbox.checked;
        this.currentRadius = Math.min(this.currentRadius, this.maximumRadius());
        input.value = this.currentRadius.toFixed(3);
        this.onChange();
      });

      const actions = document.createElement('div');
      actions.className = 'fillet-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Cancel';
      const confirm = document.createElement('button');
      confirm.type = 'button'; confirm.textContent = 'OK'; confirm.className = 'is-primary';
      cancel.addEventListener('click', () => this.cancel());
      confirm.addEventListener('click', () => this.commit());
      actions.append(cancel, confirm);
      this.hud.append(actions);

      const geometry = this.computeFilletGeometry(corner, this.currentRadius);
      const arcPoint = geometry ? toScreen(filletArcMidpoint(geometry)) : [sx - 1, sy + 1];
      const width = this.hud.offsetWidth || 220, height = this.hud.offsetHeight || 112;
      const horizontal = arcPoint[0] < sx ? sx + 24 : sx - width - 24;
      const vertical = arcPoint[1] > sy ? sy - height - 16 : sy + 16;
      this.hud.style.left = `${Math.max(10, Math.min(bounds.width - width - 10, horizontal))}px`;
      this.hud.style.top = `${Math.max(10, Math.min(bounds.height - height - 10, vertical))}px`;
      this.hud.hidden = false;

      this.inputElement = input;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 10);

      input.addEventListener('input', () => {
        const val = cad.sketchGeometry.parseValue(input.value, 'radius');
        if (val !== null && val > 0) {
          row.classList.remove('is-invalid');
          this.currentRadius = Math.min(val, this.maximumRadius());
          if (val > this.currentRadius) input.value = this.currentRadius.toFixed(3);
          this.onChange();
        } else {
          row.classList.add('is-invalid');
        }
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      });
    }

    applyCornerToDraft(newEntities, corner, geom, removedRectangleIds) {
      const { s1, s2, s1IsStart, s2IsStart } = corner;

      const decomposed = new Map();
      const decomposeRectIfNeeded = entId => {
        if (decomposed.has(entId)) return;
        const idx = newEntities.findIndex(e => e.id === entId);
        if (idx !== -1 && newEntities[idx].type === 'rectangle') {
          const rect = newEntities[idx];
          const [x1, y1] = rect.start, [x2, y2] = rect.end;
          const points = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
          const lines = points.map((point, index) => ({
            id: `entity-${this.document.nextEntityId++}`, type: 'line', start: point,
            end: points[(index + 1) % 4], dimensions: {}, construction: rect.construction
          }));
          newEntities.splice(idx, 1, ...lines);
          decomposed.set(entId, lines);
          removedRectangleIds.add(entId);
        }
      };
      const lineFor = segment => {
        decomposeRectIfNeeded(segment.entity.id);
        return segment.entity.type === 'rectangle'
          ? decomposed.get(segment.entity.id)?.[segment.edgeIndex]
          : newEntities.find(entity => entity.id === segment.entity.id);
      };
      const splitLine = (segment, selectedStart, tangent) => {
        const line = lineFor(segment);
        if (!line) return;
        const opposite = { id: `entity-${this.document.nextEntityId++}`, type: 'line',
          start: selectedStart ? [...corner.vertex] : [...line.start],
          end: selectedStart ? [...line.end] : [...corner.vertex],
          dimensions: {}, construction: line.construction };
        if (selectedStart) line.end = [...tangent];
        else line.start = [...tangent];
        line.dimensions = {};
        removedRectangleIds.add(segment.entity.id);
        if (Math.hypot(opposite.end[0] - opposite.start[0], opposite.end[1] - opposite.start[1]) >
          cad.sketchGrid.precision) newEntities.push(opposite);
      };
      const addFilletArc = () => newEntities.push({ id: `entity-${this.document.nextEntityId++}`,
        type: 'arc', center: [...geom.center], radius: geom.R, start: [...geom.t1],
        end: [...geom.t2], startAngle: geom.startAngle, endAngle: geom.endAngle,
        counterClockwise: geom.counterClockwise, dimensions: { radius: geom.R },
        construction: Boolean(s1.entity.construction && s2.entity.construction) });
      const trimCurve = (segment, tangent) => {
        const index = newEntities.findIndex(entity => entity.id === segment.entity.id);
        if (index < 0) return;
        const curve = newEntities[index];
        if (curve.type === 'circle') {
          newEntities.splice(index, 1, longArcFromCircle(curve, corner.vertex, tangent,
            `entity-${this.document.nextEntityId++}`));
        } else {
          const atVertex = curveParameter(curve, corner.vertex);
          const atTangent = curveParameter(curve, tangent);
          if (atVertex == null || atTangent == null) return;
          const intervals = atTangent < atVertex
            ? [[0, atTangent], [atVertex, 1]] : [[0, atVertex], [atTangent, 1]];
          const pieces = intervals.map(([first, last]) =>
            arcSlice(curve, first, last, `entity-${this.document.nextEntityId++}`)).filter(Boolean);
          newEntities.splice(index, 1, ...pieces);
        }
        removedRectangleIds.add(curve.id);
      };

      if (corner.kind === 'cross-line-line') {
        splitLine(s1, s1IsStart, geom.t1);
        splitLine(s2, s2IsStart, geom.t2);
        addFilletArc();
        return;
      }
      if (corner.kind === 'line-circle') {
        splitLine(s1, s1IsStart, geom.t1);
        trimCurve(s2, geom.t2);
        addFilletArc();
        return;
      }
      if (corner.kind === 'curve-curve') {
        trimCurve(s1, geom.t1);
        trimCurve(s2, geom.t2);
        addFilletArc();
        return;
      }

      if (corner.kind === 'circle-circle') {
        for (const [segment, tangent] of [[s1, geom.t1], [s2, geom.t2]]) {
          const index = newEntities.findIndex(entity => entity.id === segment.entity.id);
          if (index < 0) return;
          const circle = newEntities[index];
          newEntities.splice(index, 1, longArcFromCircle(circle, corner.vertex, tangent,
            `entity-${this.document.nextEntityId++}`));
          removedRectangleIds.add(circle.id);
        }
        newEntities.push({ id: `entity-${this.document.nextEntityId++}`, type: 'arc',
          center: [...geom.center], radius: geom.R, start: [...geom.t1], end: [...geom.t2],
          startAngle: geom.startAngle, endAngle: geom.endAngle,
          counterClockwise: geom.counterClockwise, dimensions: { radius: geom.R },
          construction: Boolean(s1.entity.construction && s2.entity.construction) });
        return;
      }

      const updateLine = (seg, isStart, tPt, decomposed) => {
        const ent = seg.entity.type === 'rectangle'
          ? decomposed.get(seg.entity.id)?.[seg.edgeIndex]
          : newEntities.find(e => e.id === seg.entity.id);
        if (!ent) return;
        if (ent.type === 'line') {
          if (isStart) ent.start = [...tPt];
          else ent.end = [...tPt];
          if (ent.dimensions?.length) {
            ent.dimensions.length = Math.hypot(ent.end[0] - ent.start[0], ent.end[1] - ent.start[1]);
          }
        }
      };

      decomposeRectIfNeeded(s1.entity.id);
      decomposeRectIfNeeded(s2.entity.id);
      updateLine(s1, s1IsStart, geom.t1, decomposed);
      updateLine(s2, s2IsStart, geom.t2, decomposed);

      // Add tangent arc entity
      const arcEntity = {
        id: `entity-${this.document.nextEntityId++}`,
        type: 'arc',
        center: [...geom.center],
        radius: geom.R,
        start: [...geom.t1],
        end: [...geom.t2],
        startAngle: geom.startAngle,
        endAngle: geom.endAngle,
        counterClockwise: geom.counterClockwise,
        dimensions: { radius: geom.R },
        construction: Boolean(s1.entity.construction && s2.entity.construction)
      };
      newEntities.push(arcEntity);

      for (const id of decomposed.keys()) removedRectangleIds.add(id);
    }

    commit() {
      const sketch = this.getActiveSketch();
      if (!sketch || !this.selectedCorner) {
        this.cancel();
        return;
      }
      const before = JSON.parse(JSON.stringify({ entities: sketch.entities, measurements: sketch.measurements,
        midpoints: sketch.midpoints, constraints: sketch.constraints }));
      const draft = { entities: JSON.parse(JSON.stringify(sketch.entities)), revision: 0 };
      const selections = this.chainCorners(sketch);
      const removedRectangleIds = new Set();
      let applied = 0;
      for (const selected of selections) {
        const candidates = this.getCorners(draft).filter(candidate =>
          Math.hypot(candidate.vertex[0] - selected.vertex[0], candidate.vertex[1] - selected.vertex[1]) < 0.0015);
        const sameSegment = (a, b) => a.entity.id === b.entity.id && a.edgeIndex === b.edgeIndex;
        const found = candidates.find(candidate =>
          (sameSegment(candidate.s1, selected.s1) && sameSegment(candidate.s2, selected.s2)) ||
          (sameSegment(candidate.s2, selected.s1) && sameSegment(candidate.s1, selected.s2))) || candidates[0];
        const corner = found && selected.kind && selected.kind !== 'circle-circle'
          ? { ...found, ...selected, s1: found.s1, s2: found.s2 } : found;
        const geom = this.computeFilletGeometry(corner, this.currentRadius);
        if (!geom) continue;
        this.applyCornerToDraft(draft.entities, corner, geom, removedRectangleIds);
        draft.revision++;
        applied++;
      }
      if (!applied) {
        this.cancel();
        return;
      }

      const after = JSON.parse(JSON.stringify(before));
      after.entities = draft.entities;
      const refersToRemoved = item => Object.entries(item).some(([key, value]) =>
        key.endsWith('Id') && removedRectangleIds.has(value));
      after.measurements = after.measurements.filter(item => !refersToRemoved(item));
      after.midpoints = after.midpoints.filter(item => !removedRectangleIds.has(item.entityId));
      after.constraints = after.constraints.filter(item => !refersToRemoved(item));
      const apply = snapshot => {
        for (const key of ['entities', 'measurements', 'midpoints', 'constraints'])
          sketch[key] = JSON.parse(JSON.stringify(snapshot[key]));
        sketch.revision++;
        this.onChange();
      };

      this.history.execute({
        name: 'Sketch fillet', kind: 'sketch',
        execute: () => apply(after),
        undo: () => apply(before),
        redo: () => apply(after)
      });

      this.cancel();
      if (this.onFinished) this.onFinished();
    }

    render(context, project) {
      if (!this.active) return;
      const sketch = this.getActiveSketch();
      if (!sketch) return;

      const toScreen = pt => project(this.document.toWorld(sketch, pt));

      const highlight = (segment, color, width) => {
        if (!segment) return;
        if (segment.start && segment.end)
          cad.canvas.line(context, toScreen(segment.start), toScreen(segment.end), color, width);
        else cad.sketchRender.drawEntity(context, segment.entity, toScreen, color, width);
      };

      if (this.hoveredBoundary && !this.selectedCorner) {
        context.save();
        highlight(this.hoveredBoundary, '#5789ed', 3.1);
        context.restore();
      }

      // Highlight first selected segment if any
      if (this.firstSegment) {
        context.save();
        highlight(this.firstSegment, '#437cf1', 3.6);
        context.restore();
      }

      if (this.hoveredPreview && !this.selectedCorner) {
        context.save();
        cad.sketchRender.drawEntity(context, {
          type: 'arc', center: this.hoveredPreview.center, radius: this.hoveredPreview.R,
          start: this.hoveredPreview.t1, end: this.hoveredPreview.t2,
          startAngle: this.hoveredPreview.startAngle, endAngle: this.hoveredPreview.endAngle,
          counterClockwise: this.hoveredPreview.counterClockwise
        }, toScreen, '#a58590', 1.8);
        context.restore();
      }

      if (this.pendingCorners) {
        context.save();
        for (const candidate of this.pendingCorners) {
          const [x, y] = toScreen(candidate.vertex);
          context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2);
          context.fillStyle = '#fff'; context.strokeStyle = '#1e8bc4'; context.lineWidth = 2;
          context.fill(); context.stroke();
        }
        context.restore();
      }

      // Highlight hovered corner
      if (this.hoveredCorner && !this.selectedCorner) {
        const [hx, hy] = toScreen(this.hoveredCorner.vertex);
        context.save();
        context.beginPath();
        context.arc(hx, hy, 7, 0, Math.PI * 2);
        context.fillStyle = 'rgba(38, 166, 230, 0.25)';
        context.fill();
        context.strokeStyle = '#1e8bc4';
        context.lineWidth = 2;
        context.stroke();

        // Small indicator circle
        context.beginPath();
        context.arc(hx, hy, 2.5, 0, Math.PI * 2);
        context.fillStyle = '#ffffff';
        context.fill();
        context.restore();
      }

      // Render active fillet preview
      if (this.selectedCorner) {
        context.save();
        highlight(this.selectedCorner.s1, '#437cf1', 3);
        highlight(this.selectedCorner.s2, '#437cf1', 3);
        context.restore();
        if (this.chainSelection) {
          context.save();
          context.setLineDash([4, 4]);
          for (const linked of this.chainCorners(sketch)) {
            if (linked === this.selectedCorner) continue;
            const preview = this.computeFilletGeometry(linked, this.currentRadius);
            if (!preview) continue;
            cad.canvas.line(context, toScreen(preview.t1), toScreen(linked.vertex), '#94a3b8', 1.2);
            cad.canvas.line(context, toScreen(preview.t2), toScreen(linked.vertex), '#94a3b8', 1.2);
            context.setLineDash([]);
            cad.sketchRender.drawEntity(context, {
              type: 'arc', center: preview.center, radius: preview.R, start: preview.t1, end: preview.t2,
              startAngle: preview.startAngle, endAngle: preview.endAngle, counterClockwise: preview.counterClockwise
            }, toScreen, '#1480b3', 2.3);
            context.setLineDash([4, 4]);
          }
          context.restore();
        }
        const corner = this.selectedCorner;
        const geom = this.computeFilletGeometry(corner, this.currentRadius);
        if (geom) {
          context.save();

          // Dashed corner removal preview
          context.setLineDash([3, 3]);
          context.strokeStyle = '#94a3b8';
          context.lineWidth = 1.2;
          cad.canvas.line(context, toScreen(geom.t1), toScreen(corner.vertex), '#94a3b8', 1.2);
          cad.canvas.line(context, toScreen(geom.t2), toScreen(corner.vertex), '#94a3b8', 1.2);

          // Solid tangent arc preview
          context.setLineDash([]);
          cad.sketchRender.drawEntity(context, {
            type: 'arc',
            center: geom.center,
            radius: geom.R,
            start: geom.t1,
            end: geom.t2,
            startAngle: geom.startAngle,
            endAngle: geom.endAngle,
            counterClockwise: geom.counterClockwise
          }, toScreen, '#1480b3', 2.6);

          // Tangent points
          const [t1x, t1y] = toScreen(geom.t1);
          const [t2x, t2y] = toScreen(geom.t2);
          context.beginPath();
          context.arc(t1x, t1y, 2.8, 0, Math.PI * 2);
          context.arc(t2x, t2y, 2.8, 0, Math.PI * 2);
          context.fillStyle = '#ffffff';
          context.fill();
          context.strokeStyle = '#1480b3';
          context.lineWidth = 1.5;
          context.stroke();

          // Radius arrow points at the live fillet arc.
          const [vx, vy] = toScreen(corner.vertex);
          const [cx, cy] = toScreen(filletArcMidpoint(geom));
          const handleLength = Math.hypot(cx - vx, cy - vy);
          if (handleLength > 1) {
            const ux = (cx - vx) / handleLength;
            const uy = (cy - vy) / handleLength;
            context.strokeStyle = '#137fb5';
            context.lineWidth = 1.8;
            context.beginPath();
            context.moveTo(cx + ux * 17, cy + uy * 17);
            context.lineTo(cx, cy);
            context.stroke();
            context.beginPath();
            context.moveTo(cx + ux * 9 - uy * 4, cy + uy * 9 + ux * 4);
            context.lineTo(cx, cy);
            context.lineTo(cx + ux * 9 + uy * 4, cy + uy * 9 - ux * 4);
            context.stroke();
            context.beginPath();
            context.arc(cx, cy, 6, 0, Math.PI * 2);
            context.fillStyle = '#ffffff';
            context.fill();
            context.stroke();
          }

          context.restore();
        }
      }
    }
  }

  cad.SketchFillet = SketchFillet;
})(window.WebCAD = window.WebCAD || {});
