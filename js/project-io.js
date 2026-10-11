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

    // 1. Restore custom planes
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
      if (data.counters?.nextSketchId) sketchDocument.nextSketchId = data.counters.nextSketchId;
      if (data.counters?.nextEntityId) sketchDocument.nextEntityId = data.counters.nextEntityId;
      if (data.counters?.nextMeasurementId) sketchDocument.nextMeasurementId = data.counters.nextMeasurementId;
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
      if (data.counters?.nextBodyId) extrudeController.nextBodyId = data.counters.nextBodyId;
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
    serializeProject,
    deserializeProject,
    exportBinarySTL,
    exportAsciiSTL,
    saveProjectToFile,
    saveSTLToFile,
    openProjectFromFile,
  };
})(window.WebCAD = window.WebCAD || {});
