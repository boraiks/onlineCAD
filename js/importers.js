/**
 * onlineCAD - Universal CAD File Importers
 * Supports:
 *  - STL (.stl) - Binary and ASCII 3D mesh
 *  - OBJ (.obj) - Wavefront 3D mesh (triangles, quads, n-gons)
 *  - STEP (.step, .stp) - ISO 10303-21 CAD solid & faceted models
 *  - DXF (.dxf) - AutoCAD 2D drawing (lines, circles, arcs, lwpolylines, splines, 3dfaces)
 *
 * All parsers are pure client-side JavaScript with zero external dependencies.
 */
(function (cad) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Geometric & Math Helpers
  // ---------------------------------------------------------------------------

  function quantizeKey(x, y, z, precision = 1e4) {
    return `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function norm3(v) {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 1];
  }

  /**
   * Newell's method for computing the best-fit unit normal of a 3D polygon.
   */
  function polygonNormal3(points) {
    let nx = 0, ny = 0, nz = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const cur = points[i];
      const next = points[(i + 1) % n];
      nx += (cur[1] - next[1]) * (cur[2] + next[2]);
      ny += (cur[2] - next[2]) * (cur[0] + next[0]);
      nz += (cur[0] - next[0]) * (cur[1] + next[1]);
    }
    return norm3([nx, ny, nz]);
  }

  /**
   * Ear-clipping triangulation for simple 2D polygons.
   * Returns array of triangle index triplets: [i0, i1, i2, ...]
   */
  function triangulate2DPolygon(vertices2D) {
    const n = vertices2D.length;
    if (n < 3) return [];
    if (n === 3) return [0, 1, 2];
    if (n === 4) return [0, 1, 2, 0, 2, 3];

    // Compute signed area to determine winding
    let area = 0;
    for (let i = 0; i < n; i++) {
      const p1 = vertices2D[i];
      const p2 = vertices2D[(i + 1) % n];
      area += p1[0] * p2[1] - p2[0] * p1[1];
    }
    const ccw = area > 0;

    const indices = Array.from({ length: n }, (_, i) => i);
    const triangles = [];

    function isPointInTriangle(p, a, b, c) {
      const v0 = [c[0] - a[0], c[1] - a[1]];
      const v1 = [b[0] - a[0], b[1] - a[1]];
      const v2 = [p[0] - a[0], p[1] - a[1]];
      const dot00 = v0[0] * v0[0] + v0[1] * v0[1];
      const dot01 = v0[0] * v1[0] + v0[1] * v1[1];
      const dot02 = v0[0] * v2[0] + v0[1] * v2[1];
      const dot11 = v1[0] * v1[0] + v1[1] * v1[1];
      const dot12 = v1[0] * v2[0] + v1[1] * v2[1];
      const denom = dot00 * dot11 - dot01 * dot01;
      if (Math.abs(denom) < 1e-12) return false;
      const invDenom = 1 / denom;
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
      return u >= -1e-6 && v >= -1e-6 && (u + v) <= 1 + 1e-6;
    }

    function isEar(i) {
      const prev = indices[(i - 1 + indices.length) % indices.length];
      const curr = indices[i];
      const next = indices[(i + 1) % indices.length];
      const a = vertices2D[prev];
      const b = vertices2D[curr];
      const c = vertices2D[next];

      // Check cross product sign for convexity
      const crossZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (ccw ? crossZ <= 1e-9 : crossZ >= -1e-9) return false;

      // Check if any other vertex lies inside triangle abc
      for (const idx of indices) {
        if (idx === prev || idx === curr || idx === next) continue;
        if (isPointInTriangle(vertices2D[idx], a, b, c)) return false;
      }
      return true;
    }

    let bail = indices.length * 3;
    let i = 0;
    while (indices.length > 3 && bail-- > 0) {
      if (isEar(i)) {
        const prev = indices[(i - 1 + indices.length) % indices.length];
        const curr = indices[i];
        const next = indices[(i + 1) % indices.length];
        triangles.push(prev, curr, next);
        indices.splice(i, 1);
        if (i >= indices.length) i = 0;
      } else {
        i = (i + 1) % indices.length;
      }
    }
    if (indices.length === 3) {
      triangles.push(indices[0], indices[1], indices[2]);
    }
    return triangles;
  }

  /**
   * Triangulate a 3D polygon by projecting onto its dominant 2D plane.
   */
  function triangulate3DPolygon(points) {
    const n = points.length;
    if (n < 3) return [];
    if (n === 3) return [0, 1, 2];
    if (n === 4) return [0, 1, 2, 0, 2, 3];

    const normal = polygonNormal3(points);
    const absX = Math.abs(normal[0]);
    const absY = Math.abs(normal[1]);
    const absZ = Math.abs(normal[2]);

    // Drop axis with largest normal component
    let u = 0, v = 1;
    if (absX >= absY && absX >= absZ) {
      u = 1; v = 2; // drop X -> YZ
    } else if (absY >= absX && absY >= absZ) {
      u = 0; v = 2; // drop Y -> XZ
    } else {
      u = 0; v = 1; // drop Z -> XY
    }

    const points2D = points.map(p => [p[u], p[v]]);
    return triangulate2DPolygon(points2D);
  }

  // ---------------------------------------------------------------------------
  // 1. STL Parser (Binary & ASCII)
  // ---------------------------------------------------------------------------

  function parseSTL(buffer) {
    const byteLength = buffer.byteLength;
    if (byteLength < 40) throw new Error('File too small to be a valid STL.');

    // Distinguish Binary vs ASCII
    let isBinary = false;
    const view = new DataView(buffer);
    if (byteLength >= 84) {
      const numTriangles = view.getUint32(80, true);
      const expectedSize = 84 + numTriangles * 50;
      if (byteLength === expectedSize) {
        isBinary = true;
      } else {
        // Scan first 512 bytes for null byte
        const checkBytes = Math.min(512, byteLength);
        const uint8 = new Uint8Array(buffer, 0, checkBytes);
        for (let i = 0; i < checkBytes; i++) {
          if (uint8[i] === 0) {
            isBinary = true;
            break;
          }
        }
      }
    }

    if (isBinary) {
      return parseBinarySTL(buffer);
    } else {
      const text = new TextDecoder('utf-8').decode(buffer);
      return parseAsciiSTL(text);
    }
  }

  function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    const byteLength = buffer.byteLength;

    const vertexMap = new Map();
    const vertices = [];
    const triangles = [];

    const getVertexIndex = (x, y, z) => {
      const key = quantizeKey(x, y, z);
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = vertices.length / 3;
        vertices.push(x, y, z);
        vertexMap.set(key, idx);
      }
      return idx;
    };

    let offset = 84;
    for (let i = 0; i < numTriangles && offset + 50 <= byteLength; i++) {
      // Skip normal (12 bytes)
      offset += 12;
      const x1 = view.getFloat32(offset, true);
      const y1 = view.getFloat32(offset + 4, true);
      const z1 = view.getFloat32(offset + 8, true);
      offset += 12;

      const x2 = view.getFloat32(offset, true);
      const y2 = view.getFloat32(offset + 4, true);
      const z2 = view.getFloat32(offset + 8, true);
      offset += 12;

      const x3 = view.getFloat32(offset, true);
      const y3 = view.getFloat32(offset + 4, true);
      const z3 = view.getFloat32(offset + 8, true);
      offset += 12;

      // Skip attribute byte count (2 bytes)
      offset += 2;

      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(z1) ||
          !Number.isFinite(x2) || !Number.isFinite(y2) || !Number.isFinite(z2) ||
          !Number.isFinite(x3) || !Number.isFinite(y3) || !Number.isFinite(z3)) {
        continue;
      }

      const i1 = getVertexIndex(x1, y1, z1);
      const i2 = getVertexIndex(x2, y2, z2);
      const i3 = getVertexIndex(x3, y3, z3);

      if (i1 !== i2 && i2 !== i3 && i3 !== i1) {
        triangles.push(i1, i2, i3);
      }
    }

    return computeMeshSummary(vertices, triangles, 'STL (Binary)');
  }

  function parseAsciiSTL(text) {
    const vertexMap = new Map();
    const vertices = [];
    const triangles = [];

    const getVertexIndex = (x, y, z) => {
      const key = quantizeKey(x, y, z);
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = vertices.length / 3;
        vertices.push(x, y, z);
        vertexMap.set(key, idx);
      }
      return idx;
    };

    const vertexRegex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let match;
    const triVerts = [];

    while ((match = vertexRegex.exec(text)) !== null) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const z = parseFloat(match[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      triVerts.push(getVertexIndex(x, y, z));
      if (triVerts.length === 3) {
        if (triVerts[0] !== triVerts[1] && triVerts[1] !== triVerts[2] && triVerts[2] !== triVerts[0]) {
          triangles.push(triVerts[0], triVerts[1], triVerts[2]);
        }
        triVerts.length = 0;
      }
    }

    return computeMeshSummary(vertices, triangles, 'STL (ASCII)');
  }

  // ---------------------------------------------------------------------------
  // 2. OBJ Parser (Wavefront)
  // ---------------------------------------------------------------------------

  function parseOBJ(text) {
    const rawVertices = [];
    const triangles = [];
    const vertexMap = new Map();
    const weldedVertices = [];

    const getWeldedIndex = (rawIdx) => {
      const actualIdx = rawIdx < 0 ? rawVertices.length + rawIdx : rawIdx - 1;
      if (actualIdx < 0 || actualIdx >= rawVertices.length) return null;
      const pt = rawVertices[actualIdx];
      const key = quantizeKey(pt[0], pt[1], pt[2]);
      let idx = vertexMap.get(key);
      if (idx === undefined) {
        idx = weldedVertices.length / 3;
        weldedVertices.push(pt[0], pt[1], pt[2]);
        vertexMap.set(key, idx);
      }
      return idx;
    };

    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('v ')) {
        const parts = line.trim().split(/\s+/).slice(1);
        if (parts.length >= 3) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          const z = parseFloat(parts[2]);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            rawVertices.push([x, y, z]);
          }
        }
      } else if (line.startsWith('f ')) {
        const parts = line.trim().split(/\s+/).slice(1);
        if (parts.length < 3) continue;

        const faceIndices = [];
        for (const part of parts) {
          const vStr = part.split('/')[0];
          const vIdx = parseInt(vStr, 10);
          if (!isNaN(vIdx)) {
            const welded = getWeldedIndex(vIdx);
            if (welded !== null) faceIndices.push(welded);
          }
        }

        if (faceIndices.length === 3) {
          if (faceIndices[0] !== faceIndices[1] && faceIndices[1] !== faceIndices[2] && faceIndices[2] !== faceIndices[0]) {
            triangles.push(faceIndices[0], faceIndices[1], faceIndices[2]);
          }
        } else if (faceIndices.length === 4) {
          // Quad -> 2 triangles
          triangles.push(faceIndices[0], faceIndices[1], faceIndices[2]);
          triangles.push(faceIndices[0], faceIndices[2], faceIndices[3]);
        } else if (faceIndices.length > 4) {
          // N-gon fan triangulation
          for (let k = 1; k < faceIndices.length - 1; k++) {
            triangles.push(faceIndices[0], faceIndices[k], faceIndices[k + 1]);
          }
        }
      }
    }

    return computeMeshSummary(weldedVertices, triangles, 'OBJ');
  }

  // ---------------------------------------------------------------------------
  // 3. STEP Parser (ISO 10303-21)
  // ---------------------------------------------------------------------------

  function parseSTEP(text) {
    // Strip comments /* ... */
    const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');

    const dataIndex = cleaned.indexOf('DATA;');
    const endSecIndex = cleaned.indexOf('ENDSEC;', dataIndex);
    const dataSection = dataIndex !== -1 && endSecIndex !== -1
      ? cleaned.slice(dataIndex + 5, endSecIndex)
      : cleaned;

    // Tokenize entities: #<id> = <TYPE>(<rawArgs>);
    // We use a robust scanner matching nested parentheses
    const entities = new Map();
    let cursor = 0;
    const len = dataSection.length;

    while (cursor < len) {
      const hashIndex = dataSection.indexOf('#', cursor);
      if (hashIndex === -1) break;

      const equalIndex = dataSection.indexOf('=', hashIndex);
      if (equalIndex === -1) break;

      const idStr = dataSection.slice(hashIndex + 1, equalIndex).trim();
      const entityId = parseInt(idStr, 10);

      // Find opening '('
      const openParen = dataSection.indexOf('(', equalIndex);
      if (openParen === -1) break;

      const typeName = dataSection.slice(equalIndex + 1, openParen).trim().toUpperCase();

      // Find matching ')' respecting quotes and nested parens
      let depth = 1;
      let inQuote = false;
      let i = openParen + 1;
      for (; i < len; i++) {
        const char = dataSection[i];
        if (char === "'") {
          inQuote = !inQuote;
        } else if (!inQuote) {
          if (char === '(') depth++;
          else if (char === ')') {
            depth--;
            if (depth === 0) break;
          }
        }
      }

      if (depth === 0 && !isNaN(entityId)) {
        const argsStr = dataSection.slice(openParen + 1, i);
        entities.set(entityId, { id: entityId, type: typeName, args: argsStr });
        cursor = i + 1;
      } else {
        cursor = equalIndex + 1;
      }
    }

    // Helper: Parse comma-separated arguments with nested tuples
    function parseArgs(argsStr) {
      const tokens = [];
      let current = '';
      let depth = 0;
      let inQuote = false;
      for (let i = 0; i < argsStr.length; i++) {
        const char = argsStr[i];
        if (char === "'") {
          inQuote = !inQuote;
          current += char;
        } else if (!inQuote) {
          if (char === '(') { depth++; current += char; }
          else if (char === ')') { depth--; current += char; }
          else if (char === ',' && depth === 0) {
            tokens.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        } else {
          current += char;
        }
      }
      if (current.trim()) tokens.push(current.trim());
      return tokens;
    }

    // Extract CARTESIAN_POINT coordinates
    const pointsMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'CARTESIAN_POINT') {
        const parts = parseArgs(ent.args);
        // Usually args are ('label', (x, y, z))
        const coordTuple = parts.find(p => p.startsWith('(') && p.endsWith(')'));
        if (coordTuple) {
          const numbers = coordTuple.slice(1, -1).split(',').map(s => parseFloat(s.trim()));
          if (numbers.length >= 3 && numbers.slice(0, 3).every(Number.isFinite)) {
            pointsMap.set(id, [numbers[0], numbers[1], numbers[2]]);
          } else if (numbers.length === 2 && numbers.every(Number.isFinite)) {
            pointsMap.set(id, [numbers[0], numbers[1], 0]);
          }
        }
      }
    }

    // Check unit scale (e.g. SI_UNIT metre vs millimetre)
    let unitScale = 1.0;
    if (cleaned.includes('.METRE.') && !cleaned.includes('.MILLI.') && !cleaned.includes('1000.')) {
      // Check maximum coordinate value
      let maxVal = 0;
      for (const pt of pointsMap.values()) {
        maxVal = Math.max(maxVal, Math.abs(pt[0]), Math.abs(pt[1]), Math.abs(pt[2]));
      }
      if (maxVal > 0 && maxVal < 0.5) {
        unitScale = 1000.0; // Metre to mm
        for (const [id, pt] of pointsMap.entries()) {
          pointsMap.set(id, [pt[0] * unitScale, pt[1] * unitScale, pt[2] * unitScale]);
        }
      }
    }

    // Extract VERTEX_POINT
    const vertexMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'VERTEX_POINT') {
        const parts = parseArgs(ent.args);
        const refMatch = parts[parts.length - 1]?.match(/#(\d+)/);
        if (refMatch) {
          const ptId = parseInt(refMatch[1], 10);
          const pt = pointsMap.get(ptId);
          if (pt) vertexMap.set(id, pt);
        }
      }
    }

    // Extract EDGE_CURVE
    const edgeMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'EDGE_CURVE') {
        const parts = parseArgs(ent.args);
        const v1Match = parts[1]?.match(/#(\d+)/);
        const v2Match = parts[2]?.match(/#(\d+)/);
        if (v1Match && v2Match) {
          edgeMap.set(id, {
            v1: parseInt(v1Match[1], 10),
            v2: parseInt(v2Match[1], 10),
          });
        }
      }
    }

    // Extract ORIENTED_EDGE
    const orientedEdgeMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'ORIENTED_EDGE') {
        const parts = parseArgs(ent.args);
        const edgeMatch = parts.find(p => p.match(/#(\d+)/));
        const orientation = !parts.includes('.F.');
        if (edgeMatch) {
          const m = edgeMatch.match(/#(\d+)/);
          orientedEdgeMap.set(id, {
            edgeId: parseInt(m[1], 10),
            forward: orientation,
          });
        }
      }
    }

    // Extract loops (POLY_LOOP & EDGE_LOOP)
    const loopMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'POLY_LOOP') {
        const listStr = ent.args.match(/\(([\s\S]*?)\)/)?.[1] || '';
        const ptIds = [...listStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const pts = ptIds.map(pid => pointsMap.get(pid)).filter(Boolean);
        if (pts.length >= 3) {
          loopMap.set(id, pts);
        }
      } else if (ent.type === 'EDGE_LOOP') {
        const listStr = ent.args.match(/\(([\s\S]*?)\)/)?.[1] || '';
        const edgeIds = [...listStr.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        const loopPts = [];
        for (const oeId of edgeIds) {
          const oe = orientedEdgeMap.get(oeId);
          if (oe) {
            const edge = edgeMap.get(oe.edgeId);
            if (edge) {
              const startV = oe.forward ? edge.v1 : edge.v2;
              const pt = vertexMap.get(startV);
              if (pt) loopPts.push(pt);
            }
          }
        }
        if (loopPts.length >= 3) {
          loopMap.set(id, loopPts);
        }
      }
    }

    // Extract FACE_OUTER_BOUND and FACE_BOUND
    const faceBoundMap = new Map();
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'FACE_OUTER_BOUND' || ent.type === 'FACE_BOUND') {
        const loopIdMatch = ent.args.match(/#(\d+)/);
        if (loopIdMatch) {
          faceBoundMap.set(id, parseInt(loopIdMatch[1], 10));
        }
      }
    }

    // Extract faces (ADVANCED_FACE, FACE_SURFACE, FACE)
    const meshVertices = [];
    const meshTriangles = [];
    const weldedMap = new Map();

    const getWeldedVertex = (pt) => {
      const key = quantizeKey(pt[0], pt[1], pt[2]);
      let idx = weldedMap.get(key);
      if (idx === undefined) {
        idx = meshVertices.length / 3;
        meshVertices.push(pt[0], pt[1], pt[2]);
        weldedMap.set(key, idx);
      }
      return idx;
    };

    let facesParsed = 0;
    for (const [id, ent] of entities.entries()) {
      if (ent.type === 'ADVANCED_FACE' || ent.type === 'FACE_SURFACE' || ent.type === 'FACE') {
        const boundRefs = [...ent.args.matchAll(/#(\d+)/g)].map(m => parseInt(m[1], 10));
        for (const bRef of boundRefs) {
          const loopId = faceBoundMap.get(bRef);
          if (loopId) {
            const loopPts = loopMap.get(loopId);
            if (loopPts && loopPts.length >= 3) {
              const triIndices = triangulate3DPolygon(loopPts);
              for (let k = 0; k < triIndices.length; k += 3) {
                const p0 = loopPts[triIndices[k]];
                const p1 = loopPts[triIndices[k + 1]];
                const p2 = loopPts[triIndices[k + 2]];
                const i0 = getWeldedVertex(p0);
                const i1 = getWeldedVertex(p1);
                const i2 = getWeldedVertex(p2);
                if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
                  meshTriangles.push(i0, i1, i2);
                }
              }
              facesParsed++;
              break; // Outer bound handled
            }
          }
        }
      } else if (ent.type === 'TRIANGULATED_FACE' || ent.type === 'COMPLEX_TRIANGULATED_FACE') {
        // Direct AP242 tessellations
        // Try parsing coordinates and indices directly
        const numbers = [...ent.args.matchAll(/([-\d.eE+]+)/g)].map(m => parseFloat(m[1])).filter(Number.isFinite);
        if (numbers.length >= 9) {
          for (let k = 0; k + 8 < numbers.length; k += 9) {
            const i0 = getWeldedVertex([numbers[k], numbers[k + 1], numbers[k + 2]]);
            const i1 = getWeldedVertex([numbers[k + 3], numbers[k + 4], numbers[k + 5]]);
            const i2 = getWeldedVertex([numbers[k + 6], numbers[k + 7], numbers[k + 8]]);
            if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
              meshTriangles.push(i0, i1, i2);
            }
          }
          facesParsed++;
        }
      }
    }

    // Fallback: If no ADVANCED_FACE loops were converted, triangulate all loops directly (e.g. FACETED_BREP)
    if (meshTriangles.length === 0 && loopMap.size > 0) {
      for (const loopPts of loopMap.values()) {
        if (loopPts.length >= 3) {
          const triIndices = triangulate3DPolygon(loopPts);
          for (let k = 0; k < triIndices.length; k += 3) {
            const p0 = loopPts[triIndices[k]];
            const p1 = loopPts[triIndices[k + 1]];
            const p2 = loopPts[triIndices[k + 2]];
            const i0 = getWeldedVertex(p0);
            const i1 = getWeldedVertex(p1);
            const i2 = getWeldedVertex(p2);
            if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
              meshTriangles.push(i0, i1, i2);
            }
          }
          facesParsed++;
        }
      }
    }

    if (meshTriangles.length === 0) {
      throw new Error('No triangulated solid faces or boundary loops could be resolved in this STEP file.');
    }

    const summary = computeMeshSummary(meshVertices, meshTriangles, 'STEP');
    summary.faceCount = facesParsed;
    return summary;
  }

  // ---------------------------------------------------------------------------
  // 4. DXF Parser (AutoCAD 2D Drawing & 3D Faces)
  // ---------------------------------------------------------------------------

  function parseDXF(text) {
    const lines = text.split(/\r?\n/);
    const groups = [];
    let i = 0;
    while (i < lines.length) {
      let codeLine = lines[i++].trim();
      while (codeLine === '' && i < lines.length) codeLine = lines[i++].trim();
      if (codeLine === '') break;
      const code = parseInt(codeLine, 10);
      if (isNaN(code)) continue;
      if (i >= lines.length) break;
      const valLine = lines[i++];
      groups.push({ code, value: valLine.trim() });
    }

    // Find ENTITIES section
    let startIndex = 0;
    let endIndex = groups.length;
    for (let g = 0; g < groups.length - 1; g++) {
      if (groups[g].code === 2 && groups[g].value.toUpperCase() === 'ENTITIES') {
        startIndex = g + 1;
        break;
      }
    }
    for (let g = startIndex; g < groups.length; g++) {
      if (groups[g].code === 0 && (groups[g].value === 'ENDSEC' || groups[g].value === 'EOF')) {
        endIndex = g;
        break;
      }
    }

    const sketchEntities = [];
    const faces3D = [];

    let currentEntity = null;

    function commitEntity() {
      if (!currentEntity) return;
      const type = currentEntity.type;
      const props = currentEntity.props;

      if (type === 'LINE') {
        const x1 = parseFloat(props[10]);
        const y1 = parseFloat(props[20]);
        const x2 = parseFloat(props[11]);
        const y2 = parseFloat(props[21]);
        if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
          if (Math.hypot(x2 - x1, y2 - y1) >= 1e-4) {
            sketchEntities.push({
              type: 'line',
              start: [round(x1), round(y1)],
              end: [round(x2), round(y2)],
            });
          }
        }
      } else if (type === 'CIRCLE') {
        const cx = parseFloat(props[10]);
        const cy = parseFloat(props[20]);
        const r = parseFloat(props[40]);
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 1e-4) {
          sketchEntities.push({
            type: 'circle',
            center: [round(cx), round(cy)],
            radius: round(r),
          });
        }
      } else if (type === 'ARC') {
        const cx = parseFloat(props[10]);
        const cy = parseFloat(props[20]);
        const r = parseFloat(props[40]);
        const a1Deg = parseFloat(props[50]);
        const a2Deg = parseFloat(props[51]);
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 1e-4 &&
            Number.isFinite(a1Deg) && Number.isFinite(a2Deg)) {
          const startRad = (a1Deg * Math.PI) / 180;
          const endRad = (a2Deg * Math.PI) / 180;
          sketchEntities.push({
            type: 'arc',
            center: [round(cx), round(cy)],
            radius: round(r),
            startAngle: startRad,
            endAngle: endRad,
            counterClockwise: false,
            start: [round(cx + r * Math.cos(startRad)), round(cy + r * Math.sin(startRad))],
            end: [round(cx + r * Math.cos(endRad)), round(cy + r * Math.sin(endRad))],
          });
        }
      } else if (type === 'LWPOLYLINE') {
        const flags = parseInt(props[70] || '0', 10);
        const closed = Boolean(flags & 1);
        const rawVerts = currentEntity.polylineVerts || [];
        if (rawVerts.length >= 2) {
          const segCount = closed ? rawVerts.length : rawVerts.length - 1;
          for (let s = 0; s < segCount; s++) {
            const v1 = rawVerts[s];
            const v2 = rawVerts[(s + 1) % rawVerts.length];
            const bulge = v1.bulge || 0;

            if (Math.abs(bulge) < 1e-4) {
              // Straight line segment
              if (Math.hypot(v2.x - v1.x, v2.y - v1.y) >= 1e-4) {
                sketchEntities.push({
                  type: 'line',
                  start: [round(v1.x), round(v1.y)],
                  end: [round(v2.x), round(v2.y)],
                });
              }
            } else {
              // Bulge arc segment
              // bulge = tan(theta / 4)
              const theta = 4 * Math.atan(bulge);
              const dx = v2.x - v1.x;
              const dy = v2.y - v1.y;
              const chord = Math.hypot(dx, dy);
              if (chord >= 1e-4) {
                const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
                const midX = (v1.x + v2.x) / 2;
                const midY = (v1.y + v2.y) / 2;
                const normalDist = (chord * (1 - bulge * bulge)) / (4 * bulge);
                const nx = -dy / chord;
                const ny = dx / chord;
                const cx = midX + nx * normalDist;
                const cy = midY + ny * normalDist;

                let a1 = Math.atan2(v1.y - cy, v1.x - cx);
                let a2 = Math.atan2(v2.y - cy, v2.x - cx);
                const isCCW = bulge > 0;

                sketchEntities.push({
                  type: 'arc',
                  center: [round(cx), round(cy)],
                  radius: round(r),
                  startAngle: a1,
                  endAngle: a2,
                  counterClockwise: !isCCW,
                  start: [round(v1.x), round(v1.y)],
                  end: [round(v2.x), round(v2.y)],
                });
              }
            }
          }
        }
      } else if (type === '3DFACE') {
        const x1 = parseFloat(props[10]), y1 = parseFloat(props[20]), z1 = parseFloat(props[30] || '0');
        const x2 = parseFloat(props[11]), y2 = parseFloat(props[21]), z2 = parseFloat(props[31] || '0');
        const x3 = parseFloat(props[12]), y3 = parseFloat(props[22]), z3 = parseFloat(props[32] || '0');
        const x4 = parseFloat(props[13]), y4 = parseFloat(props[23]), z4 = parseFloat(props[33] || '0');
        if (Number.isFinite(x1) && Number.isFinite(x2) && Number.isFinite(x3)) {
          faces3D.push([
            [x1, y1, z1],
            [x2, y2, z2],
            [x3, y3, z3],
            Number.isFinite(x4) ? [x4, y4, z4] : null,
          ]);
        }
      } else if (type === 'ELLIPSE') {
        const cx = parseFloat(props[10]);
        const cy = parseFloat(props[20]);
        const mx = parseFloat(props[11]);
        const my = parseFloat(props[21]);
        const ratio = parseFloat(props[40]);
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(mx) && Number.isFinite(my) && Number.isFinite(ratio)) {
          // Approximate ellipse with polyline segments
          const majorLen = Math.hypot(mx, my);
          const minorLen = majorLen * ratio;
          const rot = Math.atan2(my, mx);
          const steps = 36;
          for (let s = 0; s < steps; s++) {
            const t1 = (s * Math.PI * 2) / steps;
            const t2 = ((s + 1) * Math.PI * 2) / steps;
            const p1x = cx + majorLen * Math.cos(t1) * Math.cos(rot) - minorLen * Math.sin(t1) * Math.sin(rot);
            const p1y = cy + majorLen * Math.cos(t1) * Math.sin(rot) + minorLen * Math.sin(t1) * Math.cos(rot);
            const p2x = cx + majorLen * Math.cos(t2) * Math.cos(rot) - minorLen * Math.sin(t2) * Math.sin(rot);
            const p2y = cy + majorLen * Math.cos(t2) * Math.sin(rot) + minorLen * Math.sin(t2) * Math.cos(rot);
            sketchEntities.push({
              type: 'line',
              start: [round(p1x), round(p1y)],
              end: [round(p2x), round(p2y)],
            });
          }
        }
      } else if (type === 'SPLINE') {
        const pts = currentEntity.splinePoints || [];
        if (pts.length >= 2) {
          for (let s = 0; s < pts.length - 1; s++) {
            sketchEntities.push({
              type: 'line',
              start: [round(pts[s][0]), round(pts[s][1])],
              end: [round(pts[s + 1][0]), round(pts[s + 1][1])],
            });
          }
        }
      }
      currentEntity = null;
    }

    for (let idx = startIndex; idx < endIndex; idx++) {
      const g = groups[idx];
      if (g.code === 0) {
        commitEntity();
        currentEntity = { type: g.value.toUpperCase(), props: {} };
      } else if (currentEntity) {
        if (currentEntity.type === 'LWPOLYLINE') {
          if (!currentEntity.polylineVerts) currentEntity.polylineVerts = [];
          if (g.code === 10) {
            currentEntity.polylineVerts.push({ x: parseFloat(g.value), y: 0, bulge: 0 });
          } else if (g.code === 20 && currentEntity.polylineVerts.length > 0) {
            currentEntity.polylineVerts[currentEntity.polylineVerts.length - 1].y = parseFloat(g.value);
          } else if (g.code === 42 && currentEntity.polylineVerts.length > 0) {
            currentEntity.polylineVerts[currentEntity.polylineVerts.length - 1].bulge = parseFloat(g.value);
          } else {
            currentEntity.props[g.code] = g.value;
          }
        } else if (currentEntity.type === 'SPLINE') {
          if (!currentEntity.splinePoints) currentEntity.splinePoints = [];
          if (g.code === 10) {
            currentEntity.splinePoints.push([parseFloat(g.value), 0]);
          } else if (g.code === 20 && currentEntity.splinePoints.length > 0) {
            currentEntity.splinePoints[currentEntity.splinePoints.length - 1][1] = parseFloat(g.value);
          } else {
            currentEntity.props[g.code] = g.value;
          }
        } else {
          currentEntity.props[g.code] = g.value;
        }
      }
    }
    commitEntity();

    // Determine return result:
    if (faces3D.length > 0 && sketchEntities.length === 0) {
      // 3D Mesh
      const meshVertices = [];
      const meshTriangles = [];
      const welded = new Map();
      const getV = (pt) => {
        const key = quantizeKey(pt[0], pt[1], pt[2]);
        let vIdx = welded.get(key);
        if (vIdx === undefined) {
          vIdx = meshVertices.length / 3;
          meshVertices.push(pt[0], pt[1], pt[2]);
          welded.set(key, vIdx);
        }
        return vIdx;
      };
      for (const face of faces3D) {
        const i0 = getV(face[0]);
        const i1 = getV(face[1]);
        const i2 = getV(face[2]);
        if (i0 !== i1 && i1 !== i2 && i2 !== i0) meshTriangles.push(i0, i1, i2);
        if (face[3]) {
          const i3 = getV(face[3]);
          if (i0 !== i2 && i2 !== i3 && i3 !== i0) meshTriangles.push(i0, i2, i3);
        }
      }
      return {
        format: 'DXF-3D',
        is3D: true,
        mesh: computeMeshSummary(meshVertices, meshTriangles, 'DXF (3D Faces)'),
      };
    }

    if (sketchEntities.length === 0) {
      throw new Error('No supported 2D drawing entities (LINE, CIRCLE, ARC, LWPOLYLINE) or 3DFACE found in DXF.');
    }

    // Calculate 2D bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const ent of sketchEntities) {
      if (ent.start && ent.end) {
        minX = Math.min(minX, ent.start[0], ent.end[0]);
        maxX = Math.max(maxX, ent.start[0], ent.end[0]);
        minY = Math.min(minY, ent.start[1], ent.end[1]);
        maxY = Math.max(maxY, ent.start[1], ent.end[1]);
      } else if (ent.center && ent.radius) {
        minX = Math.min(minX, ent.center[0] - ent.radius);
        maxX = Math.max(maxX, ent.center[0] + ent.radius);
        minY = Math.min(minY, ent.center[1] - ent.radius);
        maxY = Math.max(maxY, ent.center[1] + ent.radius);
      }
    }

    return {
      format: 'DXF-2D',
      is3D: false,
      entities: sketchEntities,
      entityCount: sketchEntities.length,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    };
  }

  function round(val, digits = 4) {
    const factor = Math.pow(10, digits);
    return Math.round(val * factor) / factor;
  }

  function computeMeshSummary(vertices, triangles, formatName) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    return {
      format: formatName,
      vertices: new Float32Array(vertices),
      triangles: new Uint32Array(triangles),
      vertexCount: vertices.length / 3,
      triangleCount: triangles.length / 3,
      bounds: {
        minX, maxX, minY, maxY, minZ, maxZ,
        dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // High-Level File Import Handlers
  // ---------------------------------------------------------------------------

  /**
   * Import a 3D Mesh into extrudeController.bodies.
   */
  function importMeshToBodies(meshData, fileName, context) {
    const { extrudeController, history, renderBodyTree, redraw, fitToScene } = context;
    if (!extrudeController) throw new Error('Solid bodies controller not initialized.');

    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Imported Part';
    const bodyNumber = extrudeController.nextBodyId++;

    const vertices = meshData.vertices instanceof Float32Array
      ? meshData.vertices : Float32Array.from(meshData.vertices);
    const bounds = meshData.bounds;
    let shiftX = 0, shiftY = 0, shiftZ = 0;
    if (context.autoCenter !== false && bounds && Number.isFinite(bounds.minX)) {
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const groundZ = bounds.minZ;
      if (Math.abs(centerX) > 0.001 || Math.abs(centerY) > 0.001 || Math.abs(groundZ) > 0.001) {
        shiftX = centerX;
        shiftY = centerY;
        shiftZ = groundZ;
        for (let i = 0; i < vertices.length; i += 3) {
          vertices[i] -= shiftX;
          vertices[i + 1] -= shiftY;
          vertices[i + 2] -= shiftZ;
        }
      }
    }

    const newBounds = bounds ? {
      minX: bounds.minX - shiftX,
      maxX: bounds.maxX - shiftX,
      minY: bounds.minY - shiftY,
      maxY: bounds.maxY - shiftY,
      minZ: bounds.minZ - shiftZ,
      maxZ: bounds.maxZ - shiftZ,
      dx: bounds.dx,
      dy: bounds.dy,
      dz: bounds.dz,
    } : null;

    const body = {
      id: `body-${bodyNumber}`,
      name: `${baseName} (Mesh)`,
      visible: true,
      mesh: {
        vertices: vertices,
        triangles: meshData.triangles instanceof Uint32Array
          ? meshData.triangles : Uint32Array.from(meshData.triangles),
        bounds: newBounds,
        triangleCount: Math.floor(meshData.triangles.length / 3),
        vertexCount: Math.floor(vertices.length / 3),
      },
      meshSource: 'import',
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      start: 0,
      end: newBounds ? newBounds.maxZ : 0,
    };

    if (history) {
      history.execute({
        name: `Import ${baseName}`, kind: 'mesh', timelineTool: 'importStlBtn',
        execute: () => {
          extrudeController.bodies.push(body);
          extrudeController.onBodiesChange?.();
          extrudeController.onChange?.();
          renderBodyTree?.();
          redraw?.();
        },
        undo: () => {
          extrudeController.bodies = extrudeController.bodies.filter(b => b.id !== body.id);
          extrudeController.onBodiesChange?.();
          extrudeController.onChange?.();
          renderBodyTree?.();
          redraw?.();
        },
        redo: () => {
          extrudeController.bodies.push(body);
          extrudeController.onBodiesChange?.();
          extrudeController.onChange?.();
          renderBodyTree?.();
          redraw?.();
        },
      });
    } else {
      extrudeController.bodies.push(body);
      extrudeController.onBodiesChange?.();
      extrudeController.onChange?.();
      renderBodyTree?.();
      redraw?.();
    }

    fitToScene?.(true);

    return {
      type: 'body',
      body,
      triangleCount: meshData.triangleCount,
      vertexCount: meshData.vertexCount,
      bounds: meshData.bounds,
    };
  }

  /**
   * Import 2D DXF entities into a 2D sketch (active sketch or a newly created sketch).
   */
  function importDXFToSketch(dxfData, fileName, context) {
    const {
      sketchDocument,
      activeSketch,
      applyActiveSketch,
      renderSketchTree,
      redraw,
      fitToScene,
      history,
    } = context;

    if (!sketchDocument) throw new Error('Sketch document not available.');

    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'DXF Drawing';
    let targetSketch = activeSketch;
    let isNewSketch = false;

    if (!targetSketch) {
      isNewSketch = true;
      targetSketch = sketchDocument.makeSketch('XY');
      targetSketch.name = `${baseName} (DXF)`;
    }

    const createdEntities = [];
    for (const geom of dxfData.entities) {
      try {
        const entity = sketchDocument.makeEntity(geom);
        targetSketch.entities.push(entity);
        createdEntities.push(entity);
      } catch (err) {
        // Skip invalid degenerate entities silently
      }
    }

    targetSketch.revision++;

    if (isNewSketch) {
      if (history) {
        history.execute({
          name: `Import ${targetSketch.name}`, kind: 'sketch', timelineTool: 'openSketch', timelineSketchEvent: 'create',
          execute: () => {
            sketchDocument.insertSketch(targetSketch);
            renderSketchTree?.();
            applyActiveSketch?.(targetSketch);
            redraw?.();
          },
          undo: () => {
            sketchDocument.removeSketch(targetSketch.id);
            renderSketchTree?.();
            redraw?.();
          },
          redo: () => {
            sketchDocument.insertSketch(targetSketch);
            renderSketchTree?.();
            applyActiveSketch?.(targetSketch);
            redraw?.();
          },
        });
      } else {
        sketchDocument.insertSketch(targetSketch);
        renderSketchTree?.();
        applyActiveSketch?.(targetSketch);
        redraw?.();
      }
    } else {
      renderSketchTree?.();
      redraw?.();
    }

    fitToScene?.(true);

    return {
      type: 'sketch',
      sketch: targetSketch,
      entityCount: createdEntities.length,
      bounds: dxfData.bounds,
      isNewSketch,
    };
  }

  /**
   * Read file and dispatch to appropriate parser based on extension.
   */
  function importFile(file, context) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      const name = file.name || '';
      const lowerName = name.toLowerCase();

      const parseMesh = async (format, input) => {
        const parser = format === 'stl' ? parseSTL : format === 'obj' ? parseOBJ : parseSTEP;
        let job;
        try {
          job = cad.meshDecimator.workerJob('parse', { format, input },
            input instanceof ArrayBuffer ? [input] : []);
          return await job.promise;
        } catch (error) {
          // File mode and restrictive browsers may disallow workers. Keep import usable.
          if (!job) return parser(input);
          if (input instanceof ArrayBuffer && input.byteLength === 0) {
            if (typeof file.arrayBuffer === 'function') return parser(await file.arrayBuffer());
            throw error;
          }
          return parser(input);
        }
      };

      const processMeshImport = async (mesh, format) => {
        let displayMesh = null;
        let displayReduction = 0;
        let openCustom = false;
        let autoCenter = context.autoCenter !== false;
        if (context.onHighPoly && mesh.triangleCount > 25000) {
          const decision = await context.onHighPoly(mesh, file.name);
          if (decision?.openCustom) {
            openCustom = true;
          } else if (decision?.ratio && decision.ratio > 0 && cad.meshDecimator) {
            displayReduction = decision.ratio;
            try {
              displayMesh = await cad.meshDecimator.workerJob('simplify', {
                mesh: { vertices: mesh.vertices, triangles: mesh.triangles },
                ratio: decision.ratio,
              }).promise;
            } catch {
              displayMesh = cad.meshDecimator.decimateGridClustering(mesh, { ratio: decision.ratio });
            }
          }
          if (decision?.autoCenter !== undefined) {
            autoCenter = Boolean(decision.autoCenter);
          }
        }
        const result = importMeshToBodies(mesh, file.name, { ...context, autoCenter });
        if (displayMesh) {
          const shift = mesh.bounds && result.body.mesh.bounds
            ? [0, 1, 2].map((_, axis) =>
              mesh.bounds[`min${'XYZ'[axis]}`] - result.body.mesh.bounds[`min${'XYZ'[axis]}`])
            : [0, 0, 0];
          for (let i = 0; i < displayMesh.vertices.length; i += 3) {
            displayMesh.vertices[i] -= shift[0];
            displayMesh.vertices[i + 1] -= shift[1];
            displayMesh.vertices[i + 2] -= shift[2];
          }
          result.body.renderMesh = {
            vertices: displayMesh.vertices, triangles: displayMesh.triangles,
          };
          result.body.displayReduction = displayReduction;
        }
        return {
          format,
          message: `Imported ${file.name} (${mesh.triangleCount.toLocaleString()} original triangles${displayMesh ? `, ${displayMesh.decimatedTriangles.toLocaleString()} on screen` : ''})`,
          details: result,
          decimated: Boolean(displayMesh),
          openCustom,
        };
      };

      if (lowerName.endsWith('.stl')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const mesh = await parseMesh('stl', e.target.result);
            const res = await processMeshImport(mesh, 'STL');
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error reading STL file'));
        reader.readAsArrayBuffer(file);
      } else if (lowerName.endsWith('.obj')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const mesh = await parseMesh('obj', e.target.result);
            const res = await processMeshImport(mesh, 'OBJ');
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error reading OBJ file'));
        reader.readAsText(file);
      } else if (lowerName.endsWith('.step') || lowerName.endsWith('.stp')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const mesh = await parseMesh('step', e.target.result);
            const res = await processMeshImport(mesh, 'STEP');
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error reading STEP file'));
        reader.readAsText(file);
      } else if (lowerName.endsWith('.dxf')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = parseDXF(e.target.result);
            if (parsed.is3D) {
              const result = importMeshToBodies(parsed.mesh, file.name, context);
              resolve({
                format: 'DXF-3D',
                message: `Imported 3D ${file.name} (${parsed.mesh.triangleCount.toLocaleString()} triangles)`,
                details: result,
              });
            } else {
              const result = importDXFToSketch(parsed, file.name, context);
              resolve({
                format: 'DXF',
                message: `Imported ${file.name} (${result.entityCount} entities in ${result.sketch.name})`,
                details: result,
              });
            }
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error reading DXF file'));
        reader.readAsText(file);
      } else {
        reject(new Error(`Unsupported file type: ${file.name}. Supported: .stl, .step, .stp, .obj, .dxf`));
      }
    });
  }

  // Export to namespace
  cad.importers = {
    parseSTL,
    parseBinarySTL,
    parseAsciiSTL,
    parseOBJ,
    parseSTEP,
    parseDXF,
    importMeshToBodies,
    importDXFToSketch,
    importFile,
    stlWorkerSource: [quantizeKey, computeMeshSummary, parseBinarySTL, parseAsciiSTL, parseSTL]
      .map(fn => fn.toString()).join('\n'),
  };
})(window.WebCAD = window.WebCAD || {});
