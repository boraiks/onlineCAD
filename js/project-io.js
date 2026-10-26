(function (cad) {
  'use strict';

  const FORMAT_NAME = 'onlineCAD';
  const FORMAT_VERSION = 1;
  const FILE_EXTENSION = 'ocad';

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function sanitizeFilename(name, fallback = 'Untitled_Design') {
    const clean = String(name || '').trim().replace(/[/\\?%*:|"<>]/g, '_');
    return clean || fallback;
  }

  function serializeProject({
    documentName = 'Untitled Design',
    sketchDocument = null,
    extrudeController = null,
    camera = null,
    settings = null,
  } = {}) {
    const sketches = (sketchDocument?.sketches || []).map(sketch => ({
      id: sketch.id,
      name: sketch.name,
      plane: sketch.plane,
      faceBodyId: sketch.faceBodyId || null,
      faceNormal: sketch.faceNormal ? [...sketch.faceNormal] : null,
      visible: sketch.visible !== false,
      units: sketch.units || 'mm',
      entities: JSON.parse(JSON.stringify(sketch.entities || [])),
      measurements: JSON.parse(JSON.stringify(sketch.measurements || [])),
      constraints: JSON.parse(JSON.stringify(sketch.constraints || [])),
      midpoints: JSON.parse(JSON.stringify(sketch.midpoints || [])),
      revision: sketch.revision || 0,
    }));

    const bodies = (extrudeController?.bodies || []).map(body => {
      const copy = {
        id: body.id,
        name: body.name,
        visible: body.visible !== false,
        plane: body.plane || 'XY',
        origin: body.origin ? [...body.origin] : [0, 0, 0],
        normal: body.normal ? [...body.normal] : [0, 0, 1],
        start: Number.isFinite(body.start) ? body.start : 0,
        end: Number.isFinite(body.end) ? body.end : 0,
        points: body.points ? JSON.parse(JSON.stringify(body.points)) : null,
        holes: body.holes ? JSON.parse(JSON.stringify(body.holes)) : [],
        cells: body.cells ? JSON.parse(JSON.stringify(body.cells)) : null,
        meshSource: body.meshSource || 'mesh',
        displayReduction: body.displayReduction || 0,
        surfaceFinishAngle: body.surfaceFinishAngle || 0,
        faceSourceBodyId: body.faceSourceBodyId || null,
        profileId: body.profileId || null,
      };
      if (body.mesh?.vertices && body.mesh?.triangles) {
        copy.mesh = {
          vertices: Array.from(body.mesh.vertices),
          triangles: Array.from(body.mesh.triangles),
        };
      }
      if (body.rebuildSourceMesh?.vertices && body.rebuildSourceMesh?.triangles &&
          body.rebuildResultMesh === body.mesh) {
        copy.rebuildSourceMesh = {
          vertices: Array.from(body.rebuildSourceMesh.vertices),
          triangles: Array.from(body.rebuildSourceMesh.triangles),
        };
      }
      return copy;
    });

    const customPlanes = {};
    if (cad.planes?.grid) {
      for (const [key, plane] of Object.entries(cad.planes.grid)) {
        if (!['XY', 'XZ', 'YZ'].includes(key) && plane?.u && plane?.v) {
          customPlanes[key] = {
            u: [...plane.u],
            v: [...plane.v],
            origin: plane.origin ? [...plane.origin] : [0, 0, 0],
            axes: plane.axes ? [...plane.axes] : ['X', 'Y', 'Z'],
          };
        }
      }
    }

    const camData = camera ? {
      panX: camera.panX || 0,
      panY: camera.panY || 0,
      zoom: camera.zoom || 1,
      pivot: camera.pivot ? [...camera.pivot] : [0, 0, 0],
      basis: camera.basis ? camera.basis.map(row => [...row]) : null,
    } : null;

    const counters = {
      nextSketchId: sketchDocument?.nextSketchId || (sketches.length + 1),
      nextEntityId: sketchDocument?.nextEntityId || 1,
      nextMeasurementId: sketchDocument?.nextMeasurementId || 1,
      nextMarkerId: sketchDocument?.nextMarkerId || 1,
      nextConstraintId: sketchDocument?.nextConstraintId || 1,
      nextBodyId: extrudeController?.nextBodyId || (bodies.length + 1),
    };

    return {
      format: FORMAT_NAME,
      version: FORMAT_VERSION,
      generator: 'onlineCAD Workspace v1.0',
      createdAt: new Date().toISOString(),
      documentName,
      units: 'mm',
      camera: camData,
      planes: customPlanes,
      sketches,
      bodies,
      counters,
      settings: settings ? { ...settings } : null,
    };
  }

  // Counters can be missing or stale in older files; never hand out an id that
  // is already taken by a loaded item, or inserts would be silently ignored.
  function nextIdAfter(items, prefix, stored) {
    let max = 0;
    for (const item of items) {
      const id = String(item?.id || '');
      if (!id.startsWith(`${prefix}-`)) continue;
      const number = Number(id.slice(prefix.length + 1));
      if (Number.isInteger(number)) max = Math.max(max, number);
    }
    return Math.max(Number.isFinite(stored) ? stored : 1, max + 1);
  }

  function clearCustomPlanes() {
    for (const table of [cad.planes?.grid, cad.planes?.sketch]) {
      if (!table) continue;
      for (const key of Object.keys(table)) {
        if (!['XY', 'XZ', 'YZ'].includes(key)) delete table[key];
      }
    }
  }

  function deserializeProject(data, {
    sketchDocument = null,
    extrudeController = null,
    camera = null,
    history = null,
  } = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid project data: Expected a JSON object.');
    }
    if (data.format && data.format !== FORMAT_NAME && data.format !== 'webCAD') {
      throw new Error(`Unsupported project format: "${data.format}". Expected "${FORMAT_NAME}".`);
    }

    // 1. Restore custom planes (planes of the previous design must not leak in)
    clearCustomPlanes();
    if (data.planes && cad.planes?.grid) {
      for (const [name, plane] of Object.entries(data.planes)) {
        if (plane?.u && plane?.v) {
          const entry = {
            u: [...plane.u],
            v: [...plane.v],
            origin: plane.origin ? [...plane.origin] : [0, 0, 0],
            axes: plane.axes ? [...plane.axes] : ['X', 'Y', 'Z'],
          };
          cad.planes.grid[name] = entry;
          if (cad.planes.sketch) {
            cad.planes.sketch[name] = { ...entry, view: null };
          }
        }
      }
    }

    // 2. Restore sketches
    if (sketchDocument) {
      sketchDocument.sketches = [];
      if (Array.isArray(data.sketches)) {
        for (const s of data.sketches) {
          sketchDocument.sketches.push({
            id: s.id,
            name: s.name,
            plane: s.plane,
            faceBodyId: s.faceBodyId || null,
            faceNormal: s.faceNormal ? [...s.faceNormal] : null,
            visible: s.visible !== false,
            units: s.units || 'mm',
            entities: Array.isArray(s.entities) ? s.entities : [],
            measurements: Array.isArray(s.measurements) ? s.measurements : [],
            constraints: Array.isArray(s.constraints) ? s.constraints : [],
            midpoints: Array.isArray(s.midpoints) ? s.midpoints : [],
            revision: s.revision || 0,
          });
        }
      }
      const loaded = sketchDocument.sketches;
      const counters = data.counters || {};
      sketchDocument.nextSketchId = nextIdAfter(loaded, 'sketch', counters.nextSketchId);
      sketchDocument.nextEntityId = nextIdAfter(loaded.flatMap(s => s.entities), 'entity', counters.nextEntityId);
      sketchDocument.nextMeasurementId = nextIdAfter(loaded.flatMap(s => s.measurements), 'measurement', counters.nextMeasurementId);
      sketchDocument.nextMarkerId = nextIdAfter(loaded.flatMap(s => s.midpoints), 'midpoint', counters.nextMarkerId);
      sketchDocument.nextConstraintId = nextIdAfter(loaded.flatMap(s => s.constraints), 'constraint', counters.nextConstraintId);
    }

    // 3. Restore bodies
    if (extrudeController) {
      const loadedBodies = [];
      if (Array.isArray(data.bodies)) {
        for (const b of data.bodies) {
          const body = {
            id: b.id,
            name: b.name,
            visible: b.visible !== false,
            plane: b.plane || 'XY',
            origin: b.origin ? [...b.origin] : [0, 0, 0],
            normal: b.normal ? [...b.normal] : [0, 0, 1],
            start: Number.isFinite(b.start) ? b.start : 0,
            end: Number.isFinite(b.end) ? b.end : 0,
            points: b.points || null,
            holes: b.holes || [],
            cells: b.cells || null,
            meshSource: b.meshSource || 'mesh',
            displayReduction: Number.isFinite(b.displayReduction) ? b.displayReduction : 0,
            surfaceFinishAngle: Number.isFinite(b.surfaceFinishAngle)
              ? Math.max(0, Math.min(89, b.surfaceFinishAngle)) : (b.meshSource === 'solid' ? 42 : 0),
            faceSourceBodyId: b.faceSourceBodyId || null,
            profileId: b.profileId || null,
          };
          if (b.mesh?.vertices && b.mesh?.triangles) {
            body.mesh = {
              vertices: b.mesh.vertices,
              triangles: b.mesh.triangles,
            };
            if (b.rebuildSourceMesh?.vertices && b.rebuildSourceMesh?.triangles) {
              body.rebuildSourceMesh = {
                vertices: b.rebuildSourceMesh.vertices,
                triangles: b.rebuildSourceMesh.triangles,
              };
              body.rebuildResultMesh = body.mesh;
            }
          } else if (cad.solidKernel && cad.solidKernel.ready()) {
            body.mesh = cad.solidKernel.meshBody(body);
          }
          loadedBodies.push(body);
        }
      }
      extrudeController.bodies = loadedBodies;
      extrudeController.nextBodyId = nextIdAfter(loadedBodies, 'body', data.counters?.nextBodyId);
    }

    // 4. Restore camera
    if (camera && data.camera) {
      if (Number.isFinite(data.camera.panX)) camera.panX = data.camera.panX;
      if (Number.isFinite(data.camera.panY)) camera.panY = data.camera.panY;
      if (Number.isFinite(data.camera.zoom) && data.camera.zoom > 0) camera.zoom = data.camera.zoom;
      if (Array.isArray(data.camera.pivot)) camera.pivot = [...data.camera.pivot];
      if (Array.isArray(data.camera.basis)) camera.basis = data.camera.basis.map(row => [...row]);
    }

    // 5. Reset history stack
    if (history) {
      history.clear();
    }

    return {
      documentName: data.documentName || 'Untitled Design',
      sketchCount: sketchDocument?.sketches?.length || 0,
      bodyCount: extrudeController?.bodies?.length || 0,
    };
  }

  function exportBinarySTL(bodies, docName = 'onlineCAD') {
    const targetBodies = bodies.filter(b => b.visible !== false && b.mesh?.triangles?.length);
    if (!targetBodies.length) {
      throw new Error('No visible 3D bodies with mesh geometry to export.');
    }

    let totalTriangles = 0;
    for (const b of targetBodies) {
      totalTriangles += (b.mesh.triangles.length / 3) | 0;
    }

    if (totalTriangles === 0) {
      throw new Error('Bodies do not contain any 3D facets to export.');
    }

    const bufferSize = 84 + totalTriangles * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // 1. Header (80 bytes)
    const headerStr = `onlineCAD Binary STL - ${sanitizeFilename(docName)}`.slice(0, 79);
    for (let i = 0; i < headerStr.length; i++) {
      view.setUint8(i, headerStr.charCodeAt(i));
    }

    // 2. Triangle count (uint32 Little Endian)
    view.setUint32(80, totalTriangles, true);

    // 3. Facets (50 bytes each)
    let offset = 84;
    for (const b of targetBodies) {
      const verts = b.mesh.vertices;
      const tris = b.mesh.triangles;
      const triCount = (tris.length / 3) | 0;

      for (let t = 0; t < triCount; t++) {
        const i1 = tris[t * 3];
        const i2 = tris[t * 3 + 1];
        const i3 = tris[t * 3 + 2];

        const v1x = verts[i1 * 3], v1y = verts[i1 * 3 + 1], v1z = verts[i1 * 3 + 2];
        const v2x = verts[i2 * 3], v2y = verts[i2 * 3 + 1], v2z = verts[i2 * 3 + 2];
        const v3x = verts[i3 * 3], v3y = verts[i3 * 3 + 1], v3z = verts[i3 * 3 + 2];

        // Compute face normal vector
        const ax = v2x - v1x, ay = v2y - v1y, az = v2z - v1z;
        const bx = v3x - v1x, by = v3y - v1y, bz = v3z - v1z;
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-12) {
          nx /= len; ny /= len; nz /= len;
        } else {
          nx = 0; ny = 0; nz = 0;
        }

        // Normal (3x Float32)
        view.setFloat32(offset, nx, true);
        view.setFloat32(offset + 4, ny, true);
        view.setFloat32(offset + 8, nz, true);

        // Vertex 1 (3x Float32)
        view.setFloat32(offset + 12, v1x, true);
        view.setFloat32(offset + 16, v1y, true);
        view.setFloat32(offset + 20, v1z, true);

        // Vertex 2 (3x Float32)
        view.setFloat32(offset + 24, v2x, true);
        view.setFloat32(offset + 28, v2y, true);
        view.setFloat32(offset + 32, v2z, true);

        // Vertex 3 (3x Float32)
        view.setFloat32(offset + 36, v3x, true);
        view.setFloat32(offset + 40, v3y, true);
        view.setFloat32(offset + 44, v3z, true);

        // Attribute byte count (Uint16 = 0)
        view.setUint16(offset + 48, 0, true);

        offset += 50;
      }
    }

    return {
      blob: new Blob([buffer], { type: 'application/octet-stream' }),
      triangleCount: totalTriangles,
      byteLength: buffer.byteLength,
    };
  }

  function exportAsciiSTL(bodies, docName = 'onlineCAD') {
    const targetBodies = bodies.filter(b => b.visible !== false && b.mesh?.triangles?.length);
    if (!targetBodies.length) {
      throw new Error('No visible 3D bodies with mesh geometry to export.');
    }

    const safeName = sanitizeFilename(docName).replace(/\s+/g, '_');
    const lines = [`solid ${safeName}`];
    let totalTriangles = 0;

    for (const b of targetBodies) {
      const verts = b.mesh.vertices;
      const tris = b.mesh.triangles;
      const triCount = (tris.length / 3) | 0;

      for (let t = 0; t < triCount; t++) {
        const i1 = tris[t * 3];
        const i2 = tris[t * 3 + 1];
        const i3 = tris[t * 3 + 2];

        const v1x = verts[i1 * 3], v1y = verts[i1 * 3 + 1], v1z = verts[i1 * 3 + 2];
        const v2x = verts[i2 * 3], v2y = verts[i2 * 3 + 1], v2z = verts[i2 * 3 + 2];
        const v3x = verts[i3 * 3], v3y = verts[i3 * 3 + 1], v3z = verts[i3 * 3 + 2];

        const ax = v2x - v1x, ay = v2y - v1y, az = v2z - v1z;
        const bx = v3x - v1x, by = v3y - v1y, bz = v3z - v1z;
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-12) {
          nx /= len; ny /= len; nz /= len;
        } else {
          nx = 0; ny = 0; nz = 0;
        }

        lines.push(`  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`);
        lines.push('    outer loop');
        lines.push(`      vertex ${v1x.toFixed(6)} ${v1y.toFixed(6)} ${v1z.toFixed(6)}`);
        lines.push(`      vertex ${v2x.toFixed(6)} ${v2y.toFixed(6)} ${v2z.toFixed(6)}`);
        lines.push(`      vertex ${v3x.toFixed(6)} ${v3y.toFixed(6)} ${v3z.toFixed(6)}`);
        lines.push('    endloop');
        lines.push('  endfacet');
        totalTriangles++;
      }
    }

    lines.push(`endsolid ${safeName}`);
    return {
      blob: new Blob([lines.join('\n')], { type: 'text/plain' }),
      triangleCount: totalTriangles,
      byteLength: lines.join('\n').length,
    };
  }

  function exportableBodies(bodies) {
    const targetBodies = (bodies || []).filter(b => b.visible !== false && b.mesh?.triangles?.length);
    if (!targetBodies.length) {
      throw new Error('No visible 3D bodies with mesh geometry to export.');
    }
    return targetBodies;
  }

  const formatNumber = value => {
    const rounded = Math.round(value * 1e6) / 1e6;
    return Object.is(rounded, -0) ? '0' : String(rounded);
  };

  function exportOBJ(bodies, docName = 'onlineCAD') {
    const targetBodies = exportableBodies(bodies);
    const lines = [`# ${sanitizeFilename(docName)} - exported by onlineCAD`, '# units: millimetres'];
    let vertexOffset = 1;
    let triangleCount = 0;
    for (const body of targetBodies) {
      const { vertices, triangles } = body.mesh;
      lines.push(`o ${String(body.name || body.id || 'Body').replace(/\s+/g, '_')}`);
      for (let i = 0; i + 2 < vertices.length; i += 3) {
        lines.push(`v ${formatNumber(vertices[i])} ${formatNumber(vertices[i + 1])} ${formatNumber(vertices[i + 2])}`);
      }
      for (let t = 0; t + 2 < triangles.length; t += 3) {
        lines.push(`f ${triangles[t] + vertexOffset} ${triangles[t + 1] + vertexOffset} ${triangles[t + 2] + vertexOffset}`);
        triangleCount++;
      }
      vertexOffset += (vertices.length / 3) | 0;
    }
    const text = `${lines.join('\n')}\n`;
    return { blob: new Blob([text], { type: 'text/plain' }), text, triangleCount, byteLength: text.length };
  }

  // 3MF is a ZIP container; entries are stored uncompressed, which every
  // slicer accepts and keeps this writer dependency-free.
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const entries = files.map(file => {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      return { name, data, crc: crc32(data) };
    });
    const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0);
    const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
    const bytes = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(bytes.buffer);
    const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1; // 1980-01-01, keeps output reproducible
    let offset = 0;
    const offsets = [];
    for (const entry of entries) {
      offsets.push(offset);
      view.setUint32(offset, 0x04034B50, true);
      view.setUint16(offset + 4, 20, true);
      view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
      view.setUint16(offset + 8, 0, true);
      view.setUint16(offset + 10, DOS_TIME, true);
      view.setUint16(offset + 12, DOS_DATE, true);
      view.setUint32(offset + 14, entry.crc, true);
      view.setUint32(offset + 18, entry.data.length, true);
      view.setUint32(offset + 22, entry.data.length, true);
      view.setUint16(offset + 26, entry.name.length, true);
      view.setUint16(offset + 28, 0, true);
      bytes.set(entry.name, offset + 30);
      bytes.set(entry.data, offset + 30 + entry.name.length);
      offset += 30 + entry.name.length + entry.data.length;
    }
    const centralStart = offset;
    entries.forEach((entry, index) => {
      view.setUint32(offset, 0x02014B50, true);
      view.setUint16(offset + 4, 20, true);
      view.setUint16(offset + 6, 20, true);
      view.setUint16(offset + 8, 0x0800, true);
      view.setUint16(offset + 10, 0, true);
      view.setUint16(offset + 12, DOS_TIME, true);
      view.setUint16(offset + 14, DOS_DATE, true);
      view.setUint32(offset + 16, entry.crc, true);
      view.setUint32(offset + 20, entry.data.length, true);
      view.setUint32(offset + 24, entry.data.length, true);
      view.setUint16(offset + 28, entry.name.length, true);
      view.setUint32(offset + 42, offsets[index], true);
      bytes.set(entry.name, offset + 46);
      offset += 46 + entry.name.length;
    });
    view.setUint32(offset, 0x06054B50, true);
    view.setUint16(offset + 8, entries.length, true);
    view.setUint16(offset + 10, entries.length, true);
    view.setUint32(offset + 12, offset - centralStart, true);
    view.setUint32(offset + 16, centralStart, true);
    return bytes;
  }

  const escapeXml = value => String(value).replace(/[<>&"']/g, char =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);

  function export3MF(bodies, docName = 'onlineCAD') {
    const targetBodies = exportableBodies(bodies);
    let triangleCount = 0;
    const objects = targetBodies.map((body, index) => {
      const { vertices, triangles } = body.mesh;
      const vertexXml = [];
      for (let i = 0; i + 2 < vertices.length; i += 3) {
        vertexXml.push(`<vertex x="${formatNumber(vertices[i])}" y="${formatNumber(vertices[i + 1])}" z="${formatNumber(vertices[i + 2])}"/>`);
      }
      const triangleXml = [];
      for (let t = 0; t + 2 < triangles.length; t += 3) {
        triangleXml.push(`<triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>`);
      }
      triangleCount += triangleXml.length;
      return `<object id="${index + 1}" name="${escapeXml(body.name || `Body ${index + 1}`)}" type="model"><mesh>` +
        `<vertices>${vertexXml.join('')}</vertices><triangles>${triangleXml.join('')}</triangles></mesh></object>`;
    });
    const items = targetBodies.map((_, index) => `<item objectid="${index + 1}"/>`).join('');
    const model = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
      `<metadata name="Title">${escapeXml(docName)}</metadata>` +
      '<metadata name="Application">onlineCAD</metadata>' +
      `<resources>${objects.join('')}</resources><build>${items}</build></model>`;
    const bytes = zipStore([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
      { name: '3D/3dmodel.model', data: model },
    ]);
    return { blob: new Blob([bytes], { type: 'model/3mf' }), bytes, triangleCount, byteLength: bytes.length };
  }

  // AutoCAD R12 ASCII DXF: every sketch goes on its own layer, construction
  // geometry on a "<layer>_CONSTRUCTION" layer, in sketch-plane millimetres.
  function exportDXF(sketches) {
    const targets = (sketches || []).filter(sketch => sketch?.entities?.length);
    if (!targets.length) throw new Error('No sketch geometry to export as DXF.');
    const layerName = sketch => String(sketch.name || sketch.id || 'SKETCH').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
    const out = [];
    const pair = (code, value) => out.push(String(code), typeof value === 'number' ? formatNumber(value) : String(value));
    const degrees = radians => {
      const value = (radians * 180) / Math.PI;
      return ((value % 360) + 360) % 360;
    };
    const layers = new Set();
    const body = [];
    const emit = (layer, type, groups) => {
      layers.add(layer);
      body.push(['0', type], ['8', layer], ...groups);
    };
    let entityCount = 0;
    for (const sketch of targets) {
      const base = layerName(sketch);
      for (const entity of sketch.entities) {
        const layer = entity.construction ? `${base}_CONSTRUCTION` : base;
        const line = (a, b) => emit(layer, 'LINE', [[10, a[0]], [20, a[1]], [30, 0], [11, b[0]], [21, b[1]], [31, 0]]);
        if (entity.type === 'line') {
          line(entity.start, entity.end);
        } else if (entity.type === 'rectangle') {
          const [x1, y1] = entity.start;
          const [x2, y2] = entity.end;
          const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
          corners.forEach((corner, index) => line(corner, corners[(index + 1) % 4]));
        } else if (entity.type === 'circle') {
          emit(layer, 'CIRCLE', [[10, entity.center[0]], [20, entity.center[1]], [30, 0], [40, entity.radius]]);
        } else if (entity.type === 'arc') {
          // DXF arcs always run counter-clockwise from group 50 to group 51.
          const [from, to] = entity.counterClockwise
            ? [entity.endAngle, entity.startAngle] : [entity.startAngle, entity.endAngle];
          emit(layer, 'ARC', [[10, entity.center[0]], [20, entity.center[1]], [30, 0], [40, entity.radius],
            [50, degrees(from)], [51, degrees(to)]]);
        } else if (entity.type === 'point') {
          emit(layer, 'POINT', [[10, entity.position[0]], [20, entity.position[1]], [30, 0]]);
        } else {
          continue;
        }
        entityCount++;
      }
    }
    pair(0, 'SECTION'); pair(2, 'HEADER');
    pair(9, '$ACADVER'); pair(1, 'AC1009');
    pair(9, '$INSUNITS'); pair(70, 4);
    pair(0, 'ENDSEC');
    pair(0, 'SECTION'); pair(2, 'TABLES');
    pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.size);
    for (const layer of layers) {
      pair(0, 'LAYER'); pair(2, layer); pair(70, 0);
      pair(62, layer.endsWith('_CONSTRUCTION') ? 8 : 7); pair(6, 'CONTINUOUS');
    }
    pair(0, 'ENDTAB');
    pair(0, 'ENDSEC');
    pair(0, 'SECTION'); pair(2, 'ENTITIES');
    for (const [code, value] of body) pair(code, value);
    pair(0, 'ENDSEC');
    pair(0, 'EOF');
    const text = `${out.join('\n')}\n`;
    return { blob: new Blob([text], { type: 'application/dxf' }), text, entityCount, byteLength: text.length };
  }

  function saveMeshToFile(format, bodies, docName = 'onlineCAD') {
    const exporters = { obj: exportOBJ, '3mf': export3MF };
    const result = exporters[format](bodies, docName);
    const filename = `${sanitizeFilename(docName)}.${format}`;
    downloadBlob(result.blob, filename);
    return { filename, triangleCount: result.triangleCount, byteLength: result.byteLength };
  }

  function saveDXFToFile(sketches, docName = 'onlineCAD') {
    const result = exportDXF(sketches);
    const filename = `${sanitizeFilename(docName)}.dxf`;
    downloadBlob(result.blob, filename);
    return { filename, entityCount: result.entityCount, byteLength: result.byteLength };
  }

  function saveProjectToFile(context) {
    const data = serializeProject(context);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const filename = `${sanitizeFilename(data.documentName)}.${FILE_EXTENSION}`;
    downloadBlob(blob, filename);
    return { filename, data };
  }

  function saveSTLToFile(bodies, docName = 'onlineCAD', { binary = true } = {}) {
    const result = binary ? exportBinarySTL(bodies, docName) : exportAsciiSTL(bodies, docName);
    const filename = `${sanitizeFilename(docName)}.stl`;
    downloadBlob(result.blob, filename);
    return { filename, triangleCount: result.triangleCount, byteLength: result.byteLength };
  }

  function openProjectFromFile(file, context) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      if (file.name && !file.name.toLowerCase().endsWith('.ocad')) {
        reject(new Error(`Invalid project file: "${file.name}". Only .ocad files are supported.`));
        return;
      }
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const parsed = JSON.parse(event.target.result);
          // If the file has a filename, default document title to it if untitled
          const fileBaseName = file.name ? file.name.replace(/\.[^/.]+$/, '') : null;
          if (fileBaseName && (!parsed.documentName || parsed.documentName === 'Untitled Design')) {
            parsed.documentName = fileBaseName;
          }
          const result = deserializeProject(parsed, context);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Could not read project file'));
      reader.readAsText(file);
    });
  }

  cad.projectIO = {
    FORMAT_NAME,
    FORMAT_VERSION,
    FILE_EXTENSION,
    sanitizeFilename,
    downloadBlob,
    clearCustomPlanes,
    serializeProject,
    deserializeProject,
    exportBinarySTL,
    exportAsciiSTL,
    exportOBJ,
    export3MF,
    exportDXF,
    zipStore,
    crc32,
    saveMeshToFile,
    saveDXFToFile,
    saveProjectToFile,
    saveSTLToFile,
    openProjectFromFile,
  };
})(window.WebCAD = window.WebCAD || {});
