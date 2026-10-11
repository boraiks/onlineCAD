(function (cad) {
  'use strict';

  const { cross, dot } = cad.math;

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec4 aColor;

    uniform mat4 uMVPMatrix;
    uniform float uDepthBias;

    varying vec3 vNormal;
    varying vec4 vBaseColor;
    varying vec2 vScreenPos;

    void main() {
      vec4 pos = uMVPMatrix * vec4(aPosition, 1.0);
      pos.z -= uDepthBias;
      gl_Position = pos;
      vNormal = aNormal;
      vBaseColor = aColor;
      vScreenPos = pos.xy;
    }
  `;

  const fragmentSource = `
    precision mediump float;

    varying vec3 vNormal;
    varying vec4 vBaseColor;
    varying vec2 vScreenPos;

    uniform vec3 uKeyLightDir;
    uniform vec3 uFillLightDir;
    uniform vec3 uCameraDepth;
    uniform vec3 uCameraRight;
    uniform vec3 uCameraUp;
    uniform float uSpecularStrength;
    uniform float uShininess;
    uniform float uSelectionMix;
    uniform float uZebraActive;
    uniform float uZebraRepeats;
    uniform float uZebraDirection;
    uniform float uZebraOpacity;

    void main() {
      float normalLen = length(vNormal);
      // For feature edges and wireframe lines, normal is zero -> draw exact line color
      if (normalLen < 0.1) {
        gl_FragColor = vBaseColor;
        return;
      }

      vec3 N = normalize(vNormal);
      // camera.depth points from the model towards the viewer.
      vec3 V = normalize(uCameraDepth);

      // Broad upper-left studio panel with a tighter polished highlight.
      vec3 L1 = normalize(uKeyLightDir);
      float NdotL1 = max(dot(N, L1), 0.0);
      vec3 H1 = normalize(L1 + V);
      float NdotH1 = max(dot(N, H1), 0.0);
      float keySheen = pow(NdotH1, uShininess * 0.19) * (uSpecularStrength * 0.12);
      float keyHighlight = pow(NdotH1, uShininess) * (uSpecularStrength * 0.43);

      // Weaker opposite panel keeps recesses readable without flattening them.
      vec3 L2 = normalize(uFillLightDir);
      float NdotL2 = max(dot(N, L2), 0.0);
      vec3 H2 = normalize(L2 + V);
      float NdotH2 = max(dot(N, H2), 0.0);
      float fillHighlight = pow(NdotH2, uShininess * 0.42) * (uSpecularStrength * 0.12);

      // Neutral environment: upper surfaces are lit, undersides stay darker.
      float hemi = mix(0.43, 0.54, clamp(N.z * 0.5 + 0.5, 0.0, 1.0));

      float diffuse = NdotL1 * 0.35 + NdotL2 * 0.18;

      float NdotV = max(dot(N, V), 0.0);
      float rim = pow(1.0 - NdotV, 3.0) * 0.055;

      vec3 studioWhite = vec3(0.98, 0.98, 0.95);
      vec3 litColor = vBaseColor.rgb * (hemi + diffuse) +
        studioWhite * (keySheen + keyHighlight + fillHighlight + rim);

      if (uSelectionMix < 0.0) {
        litColor = mix(litColor, vec3(0.96, 0.16, 0.16), -uSelectionMix);
      } else {
        litColor = mix(litColor, vec3(0.13, 0.53, 0.86), uSelectionMix);
      }

      // Zebra curvature & continuity reflection stripes analysis
      if (uZebraActive > 0.5) {
        vec3 R = reflect(-V, N);
        float rx = dot(R, uCameraRight);
        float ry = dot(R, uCameraUp);
        // uZebraDirection: 0.0 = Horizontal, 1.0 = Vertical
        // Light tunnel reflection: Surface position projects onto screen, while normal reflection bends the stripes.
        // Horizontal: stripes run horizontally across the model, varying along the screen vertical axis.
        // Vertical: stripes run vertically down the model, varying along the screen horizontal axis.
        float coord = (uZebraDirection < 0.5)
          ? (vScreenPos.y * 0.5 + ry * 0.45)
          : (vScreenPos.x * 0.5 + rx * 0.45);
        float stripe = smoothstep(-0.10, 0.10, sin(coord * 3.14159265 * uZebraRepeats));
        vec3 zebraColor = vec3(stripe);
        litColor = mix(litColor, zebraColor, clamp(uZebraOpacity, 0.0, 1.0));
      }

      gl_FragColor = vec4(clamp(litColor, 0.0, 1.0), vBaseColor.a);
    }
  `;

  const edgeKey = (k1, k2) => k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  const pointKey = p => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;

  // Crease threshold: angles < 42° (cos >= 0.743) are smoothed together across vertices;
  // sharp edges >= 42° (e.g. 90° corners, cylinder caps) remain razor-sharp flat creases.
  const COS_CREASE = 0.743;
  const CAD_MATERIAL = [0.65, 0.64, 0.61, 1];

  function materialColor() {
    return CAD_MATERIAL;
  }

  function studioDirection(camera, right, up, towardViewer) {
    const direction = [0, 1, 2].map(axis =>
      camera.right[axis] * right + camera.up[axis] * up + camera.depth[axis] * towardViewer);
    const length = Math.hypot(...direction) || 1;
    return direction.map(value => value / length);
  }

  function prepareDenseImportedMesh(body, sourceMesh) {
    const { vertices, triangles } = sourceMesh;
    const normals = new Float32Array(vertices.length);
    const triCount = Math.floor(triangles.length / 3);
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
      const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
      const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      for (const index of [a, b, c]) {
        normals[index] += nx; normals[index + 1] += ny; normals[index + 2] += nz;
      }
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
    }
    const baseColor = materialColor();
    const triData = new Float32Array(triCount * 30);
    for (let corner = 0, out = 0; corner < triangles.length; corner++) {
      const index = triangles[corner] * 3;
      triData[out++] = vertices[index]; triData[out++] = vertices[index + 1]; triData[out++] = vertices[index + 2];
      triData[out++] = normals[index]; triData[out++] = normals[index + 1]; triData[out++] = normals[index + 2];
      triData[out++] = baseColor[0]; triData[out++] = baseColor[1]; triData[out++] = baseColor[2]; triData[out++] = 1;
    }
    return { mesh: sourceMesh, points: [], faces: [], edges: [], triData,
      triVertexCount: triangles.length, baseColor };
  }

  // Build the visible mesh's triangle edges only when Show Mesh is enabled.
  // Imported meshes skip the expensive CAD feature-edge topology during normal rendering.
  function denseWireframeData(sourceMesh) {
    const { vertices, triangles } = sourceMesh;
    const vertexCount = Math.floor(vertices.length / 3);
    const seen = new Set();
    const pairs = [];
    const addEdge = (from, to) => {
      if (from === to || from >= vertexCount || to >= vertexCount) return;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const key = lo * vertexCount + hi;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(from, to);
    };
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
    const data = new Float32Array(pairs.length * 10);
    for (let i = 0, out = 0; i < pairs.length; i++) {
      const index = pairs[i] * 3;
      data[out++] = vertices[index]; data[out++] = vertices[index + 1]; data[out++] = vertices[index + 2];
      data[out++] = 0; data[out++] = 0; data[out++] = 0;
      data[out++] = 0.18; data[out++] = 0.39; data[out++] = 0.51; data[out++] = 1;
    }
    return data;
  }

  function featureLineData(sourceMesh, pairs) {
    const vertices = sourceMesh.vertices;
    const data = new Float32Array(pairs.length * 10);
    for (let i = 0, out = 0; i < pairs.length; i++) {
      const index = pairs[i] * 3;
      data[out++] = vertices[index]; data[out++] = vertices[index + 1]; data[out++] = vertices[index + 2];
      data[out++] = 0; data[out++] = 0; data[out++] = 0;
      data[out++] = 0.08; data[out++] = 0.10; data[out++] = 0.14; data[out++] = 1;
    }
    return data;
  }

  function prepareFinishedMesh(body, sourceMesh, finish) {
    const { vertices, triangles } = sourceMesh;
    const color = materialColor();
    const triData = new Float32Array(triangles.length * 10);
    for (let corner = 0, out = 0; corner < triangles.length; corner++) {
      const at = triangles[corner] * 3, normal = corner * 3;
      triData[out++] = vertices[at]; triData[out++] = vertices[at + 1]; triData[out++] = vertices[at + 2];
      triData[out++] = finish.cornerNormals[normal];
      triData[out++] = finish.cornerNormals[normal + 1];
      triData[out++] = finish.cornerNormals[normal + 2];
      triData[out++] = color[0]; triData[out++] = color[1]; triData[out++] = color[2]; triData[out++] = 1;
    }
    return { mesh: sourceMesh, points: [], faces: [], edges: [], featurePairs: finish.featurePairs,
      triData, triVertexCount: triangles.length, baseColor: color };
  }

  function prepareMesh(body, sourceMesh = body.mesh, ignoreFinish = false, finish = null) {
    const { vertices, triangles } = sourceMesh;
    if (!ignoreFinish && body.surfaceFinishAngle > 0 &&
        (body.meshSource === 'import' || body.meshSource === 'solid')) {
      const result = finish || (triangles.length <= 12000
        ? globalThis.WebCADSurfaceFinishCore?.compute(sourceMesh, body.surfaceFinishAngle) : null);
      if (result) return prepareFinishedMesh(body, sourceMesh, result);
    }
    if (triangles.length > 24000 && (body.meshSource === 'import' || body.meshSource === 'solid'))
      return prepareDenseImportedMesh(body, sourceMesh);
    const points = [];
    for (let index = 0; index < vertices.length; index += 3)
      points.push([vertices[index], vertices[index + 1], vertices[index + 2]]);

    const triCount = Math.floor(triangles.length / 3);
    const triNormals = [];
    const isDenseMesh = triCount > 8000;
    const isImportedDense = isDenseMesh && (body.meshSource === 'import' || body.meshSource === 'solid');

    for (let t = 0; t < triCount; t++) {
      const i0 = triangles[t * 3], i1 = triangles[t * 3 + 1], i2 = triangles[t * 3 + 2];
      const a = points[i0], b = points[i1], c = points[i2];
      if (!a || !b || !c) {
        triNormals.push([0, 0, 1]);
        continue;
      }
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = cross(e1, e2);
      const length = Math.hypot(...n);
      const unitNormal = length > 1e-10 ? n.map(v => v / length) : [0, 0, 1];
      triNormals.push(unitNormal);
    }

    const faces = [];
    const edges = new Map();
    const bodyNormal = body.normal || [0, 0, 1];

    if (isDenseMesh) {
      // Fast O(N) vertex normal accumulation for dense meshes / 3D scans
      const vertNormals = new Float32Array(points.length * 3);
      for (let t = 0; t < triCount; t++) {
        const n = triNormals[t];
        for (let c = 0; c < 3; c++) {
          const vIdx = triangles[t * 3 + c] * 3;
          vertNormals[vIdx] += n[0];
          vertNormals[vIdx + 1] += n[1];
          vertNormals[vIdx + 2] += n[2];
        }
      }
      for (let i = 0; i < points.length; i++) {
        const idx = i * 3;
        const len = Math.hypot(vertNormals[idx], vertNormals[idx + 1], vertNormals[idx + 2]);
        if (len > 1e-6) {
          vertNormals[idx] /= len;
          vertNormals[idx + 1] /= len;
          vertNormals[idx + 2] /= len;
        }
      }

      for (let t = 0; t < triCount; t++) {
        const ids = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]];
        const unitNormal = triNormals[t];
        const cornerNormals = ids.map(vId => [
          vertNormals[vId * 3],
          vertNormals[vId * 3 + 1],
          vertNormals[vId * 3 + 2]
        ]);
        faces.push({
          ids,
          normal: unitNormal,
          vertexNormals: cornerNormals,
          cap: Math.abs(dot(unitNormal, bodyNormal)) > 0.93
        });
      }
    } else {
      // Precise CAD crease smoothing for parametric bodies
      const vertexToTriangles = points.map(() => []);
      for (let t = 0; t < triCount; t++) {
        vertexToTriangles[triangles[t * 3]].push(t);
        vertexToTriangles[triangles[t * 3 + 1]].push(t);
        vertexToTriangles[triangles[t * 3 + 2]].push(t);
      }

      for (let t = 0; t < triCount; t++) {
        const ids = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]];
        const unitNormal = triNormals[t];
        const cornerNormals = ids.map(vertexId => {
          let sumX = 0, sumY = 0, sumZ = 0;
          const sharing = vertexToTriangles[vertexId];
          for (let s = 0; s < sharing.length; s++) {
            const otherTri = sharing[s];
            const otherNorm = triNormals[otherTri];
            if (dot(unitNormal, otherNorm) >= COS_CREASE) {
              sumX += otherNorm[0];
              sumY += otherNorm[1];
              sumZ += otherNorm[2];
            }
          }
          const len = Math.hypot(sumX, sumY, sumZ);
          return len > 1e-6 ? [sumX / len, sumY / len, sumZ / len] : unitNormal;
        });

        faces.push({
          ids,
          normal: unitNormal,
          vertexNormals: cornerNormals,
          cap: Math.abs(dot(unitNormal, bodyNormal)) > 0.93
        });

        for (let corner = 0; corner < 3; corner++) {
          const from = ids[corner], to = ids[(corner + 1) % 3];
          const key = edgeKey(pointKey(points[from]), pointKey(points[to]));
          if (!edges.has(key)) edges.set(key, { from, to, normals: [], sides: [] });
          const edge = edges.get(key);
          edge.normals.push(unitNormal);
          edge.sides.push({ normal: unitNormal, opposite: points[ids[(corner + 2) % 3]] });
        }
      }
    }

    // Precompile static 3D vertex GPU attributes: [x,y,z, nx,ny,nz, r,g,b,a]
    const baseColor = materialColor();

    const triData = new Float32Array(triCount * 30);
    let ptr = 0;
    for (let t = 0; t < triCount; t++) {
      const face = faces[t];
      for (let c = 0; c < 3; c++) {
        const vId = face.ids[c];
        const pt = points[vId];
        const n = face.vertexNormals ? face.vertexNormals[c] : face.normal;
        triData[ptr++] = pt[0];
        triData[ptr++] = pt[1];
        triData[ptr++] = pt[2];
        triData[ptr++] = n[0];
        triData[ptr++] = n[1];
        triData[ptr++] = n[2];
        triData[ptr++] = baseColor[0];
        triData[ptr++] = baseColor[1];
        triData[ptr++] = baseColor[2];
        triData[ptr++] = baseColor[3];
      }
    }

    return {
      mesh: sourceMesh,
      points,
      faces,
      edges: [...edges.values()],
      triData,
      triVertexCount: triCount * 3,
      baseColor,
    };
  }

  function compile(gl, kind, source) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`3D shader failed: ${reason}`);
    }
    return shader;
  }

  class BodyRenderer {
    constructor() {
      this.canvas = null;
      this.gl = null;
      this.program = null;
      this.meshCache = new WeakMap();
      this.featureMeshCache = new WeakMap();
      this.finishCache = new WeakMap();
      this.finishJobs = new WeakMap();
      this.vboCache = new WeakMap();
      this.residentBodies = new Set();
      this.failed = false;
      this.lastKey = null;
      this.lastBodies = [];
      this.lastMeshes = [];
    }

    initialize() {
      if (this.failed || typeof document === 'undefined') return false;
      if (this.gl) return !this.gl.isContextLost?.();
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', {
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true
        }) || canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true
        });
        if (!gl) { this.failed = true; return false; }

        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault();
          this.failed = true;
          this.lastKey = null;
        });

        const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(`3D program failed: ${gl.getProgramInfoLog(program)}`);

        this.canvas = canvas;
        this.gl = gl;
        this.program = program;
        this.position = gl.getAttribLocation(program, 'aPosition');
        this.normal = gl.getAttribLocation(program, 'aNormal');
        this.color = gl.getAttribLocation(program, 'aColor');

        this.uMVPMatrix = gl.getUniformLocation(program, 'uMVPMatrix');
        this.uDepthBias = gl.getUniformLocation(program, 'uDepthBias');
        this.uKeyLightDir = gl.getUniformLocation(program, 'uKeyLightDir');
        this.uFillLightDir = gl.getUniformLocation(program, 'uFillLightDir');
        this.uCameraDepth = gl.getUniformLocation(program, 'uCameraDepth');
        this.uCameraRight = gl.getUniformLocation(program, 'uCameraRight');
        this.uCameraUp = gl.getUniformLocation(program, 'uCameraUp');
        this.uSpecularStrength = gl.getUniformLocation(program, 'uSpecularStrength');
        this.uShininess = gl.getUniformLocation(program, 'uShininess');
        this.uSelectionMix = gl.getUniformLocation(program, 'uSelectionMix');
        this.uZebraActive = gl.getUniformLocation(program, 'uZebraActive');
        this.uZebraRepeats = gl.getUniformLocation(program, 'uZebraRepeats');
        this.uZebraDirection = gl.getUniformLocation(program, 'uZebraDirection');
        this.uZebraOpacity = gl.getUniformLocation(program, 'uZebraOpacity');

        return true;
      } catch {
        this.failed = true;
        return false;
      }
    }

    releaseBody(body) {
      const gl = this.gl;
      const vbo = this.vboCache.get(body);
      const prepared = this.meshCache.get(body);
      if (gl && vbo) gl.deleteBuffer(vbo.buffer);
      if (gl && prepared?.lineVbo) gl.deleteBuffer(prepared.lineVbo.buffer);
      this.vboCache.delete(body);
      this.meshCache.delete(body);
      this.featureMeshCache.delete(body);
      this.residentBodies.delete(body);
      this.lastKey = null;
    }

    invalidateFinish(body) {
      const job = this.finishJobs.get(body);
      job?.worker?.terminate();
      if (job?.blobUrl) URL.revokeObjectURL(job.blobUrl);
      this.finishJobs.delete(body);
      this.finishCache.delete(body);
      this.releaseBody(body);
    }

    scheduleFinish(body, mesh) {
      const angle = body.surfaceFinishAngle;
      if (!(angle > 0) || !globalThis.WebCADSurfaceFinishCore) return;
      const pending = this.finishJobs.get(body);
      if (pending?.mesh === mesh && pending.angle === angle) return;
      if (pending) {
        pending.worker?.terminate();
        if (pending.blobUrl) URL.revokeObjectURL(pending.blobUrl);
      }
      let worker, blobUrl = null;
      try {
        if (globalThis.location?.protocol === 'file:') {
          const source = `const compute = ${globalThis.WebCADSurfaceFinishCore.compute.toString()};\n` +
            `self.onmessage = ({data}) => { try { const result = compute(data.mesh, data.angle); ` +
            `self.postMessage({result}, [result.cornerNormals.buffer, result.featurePairs.buffer]); ` +
            `} catch(error) { self.postMessage({error: error?.message || String(error)}); } };`;
          blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          worker = new Worker(blobUrl);
        } else worker = new Worker('js/surface-finish-worker.js');
      } catch {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        // A local browser that blocks workers still gets the finished appearance.
        const result = globalThis.WebCADSurfaceFinishCore.compute(mesh, angle);
        this.finishCache.set(body, { mesh, angle, result });
        return;
      }
      const job = { worker, blobUrl, mesh, angle };
      this.finishJobs.set(body, job);
      const finish = result => {
        worker.terminate();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (this.finishJobs.get(body) !== job) return;
        this.finishJobs.delete(body);
        if ((body.renderMesh || body.mesh) !== mesh || body.surfaceFinishAngle !== angle) return;
        this.finishCache.set(body, { mesh, angle, result });
        this.releaseBody(body);
        cad.app?.requestRedraw?.(false);
      };
      worker.onmessage = ({ data }) => finish(data.error ? null : data.result);
      worker.onerror = () => finish(null);
      try { worker.postMessage({ mesh, angle }); }
      catch { finish(null); }
    }

    mesh(body, forDisplay = true) {
      if (!forDisplay) {
        if (!body.renderMesh && !(body.surfaceFinishAngle > 0 &&
            (body.meshSource === 'import' || body.meshSource === 'solid')))
          return this.mesh(body, true);
        let featureMesh = this.featureMeshCache.get(body);
        if (!featureMesh || featureMesh.mesh !== body.mesh) {
          featureMesh = prepareMesh(body, body.mesh, true);
          this.featureMeshCache.set(body, featureMesh);
        }
        return featureMesh;
      }
      const sourceMesh = body.renderMesh || body.mesh;
      let finish = this.finishCache.get(body);
      if (finish && (finish.mesh !== sourceMesh || finish.angle !== body.surfaceFinishAngle)) finish = null;
      if (!finish && body.surfaceFinishAngle > 0 && sourceMesh.triangles.length > 12000)
        this.scheduleFinish(body, sourceMesh);
      finish = this.finishCache.get(body);
      let cached = this.meshCache.get(body);
      if (!cached || cached.mesh !== sourceMesh) {
        if (cached) this.releaseBody(body);
        cached = prepareMesh(body, sourceMesh, false, finish?.result);
        this.meshCache.set(body, cached);
      }
      return cached;
    }

    projectionMatrix(camera, width, height, near, far) {
      const unit = camera.unit(width, height);
      const pivot = cad.settings?.cameraPivot ? camera.pivot : [0, 0, 0];
      const [origX, origY] = camera.origin(width, height);
      const R = camera.right, U = camera.up, D = camera.depth;
      const range = Math.max(1e-4, far - near);
      const m03 = 2 * (origX - dot(R, pivot) * unit) / width - 1;
      // Canvas Y points down, while WebGL clip-space Y points up.
      const m13 = 1 - 2 * (origY + dot(U, pivot) * unit) / height;
      const m23 = 0.98 + 1.96 * near / range;
      return new Float32Array([
        2 * unit * R[0] / width, 2 * unit * U[0] / height, -1.96 * D[0] / range, 0,
        2 * unit * R[1] / width, 2 * unit * U[1] / height, -1.96 * D[1] / range, 0,
        2 * unit * R[2] / width, 2 * unit * U[2] / height, -1.96 * D[2] / range, 0,
        m03, m13, m23, 1
      ]);
    }

    selectableEdges(body) {
      if (!body?.mesh) return [];
      if ((body.meshSource === 'import' || body.meshSource === 'solid') &&
          body.mesh.triangles.length > 45000) return [];
      const mesh = this.mesh(body, false);
      const sub = (p1, p2) => p1.map((val, i) => val - p2[i]);
      const rings = [];
      if (cad.bodyFaces) {
        try {
          const faces = cad.bodyFaces.patches(body);
          for (const face of faces) {
            const allLoops = [face.points, ...(face.holes || [])];
            for (const loop of allLoops) {
              if (loop.length < 16) continue;
              const cx = loop.reduce((sum, p) => sum + p[0], 0) / loop.length;
              const cy = loop.reduce((sum, p) => sum + p[1], 0) / loop.length;
              const radii = loop.map(p => Math.hypot(p[0] - cx, p[1] - cy));
              const r_mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
              if (r_mean < 0.1) continue;
              const maxDev = Math.max(...radii.map(r => Math.abs(r - r_mean)));
              if (maxDev / r_mean > 0.05) continue;
              const center3D = face.origin.map((val, axis) => val + face.u[axis] * cx + face.v[axis] * cy);
              const points3D = loop.map(p => face.origin.map((val, axis) => val + face.u[axis] * p[0] + face.v[axis] * p[1]));
              rings.push({
                radius: r_mean,
                center3D,
                normal3D: [...face.normal],
                points3D,
                count: loop.length
              });
            }
          }
        } catch (_) {}
      }
      try {
        const sharpEdges = [];
        const pointEdges = new Map();
        mesh.edges.forEach((edge, index) => {
          if (edge.sides.length !== 2) return;
          if (dot(edge.normals[0], edge.normals[1]) > 0.965) return;
          const a = mesh.points[edge.from], b = mesh.points[edge.to];
          const len = Math.hypot(...sub(a, b));
          if (len < 1e-5) return;
          const midpoint = a.map((v, i) => (v + b[i]) / 2);
          const [first, second] = edge.sides;
          const firstInside = dot(first.opposite.map((v, i) => v - midpoint[i]), second.normal);
          const secondInside = dot(second.opposite.map((v, i) => v - midpoint[i]), first.normal);
          const convex = firstInside < -1e-5 && secondInside < -1e-5;
          const concave = firstInside > 1e-5 && secondInside > 1e-5;
          if (!convex && !concave) return;
          const item = { index, from: edge.from, to: edge.to, a, b, edge, len, convex, concave };
          sharpEdges.push(item);
          for (const pt of [edge.from, edge.to]) {
            if (!pointEdges.has(pt)) pointEdges.set(pt, []);
            pointEdges.get(pt).push(item);
          }
        });
        const usedEdges = new Set();
        for (const start of sharpEdges) {
          if (usedEdges.has(start.index)) continue;
          const loopVerts = [start.from];
          let currVert = start.to;
          let prevEdge = start;
          let prevFrom = start.from;
          const loopEdges = [start];
          while (true) {
            loopVerts.push(currVert);
            if (currVert === start.from) {
              loopVerts.pop();
              break;
            }
            const candidates = (pointEdges.get(currVert) || []).filter(e => e.index !== prevEdge.index);
            const prevDir = sub(mesh.points[currVert], mesh.points[prevFrom]);
            const l1 = Math.hypot(...prevDir);
            const best = candidates.find(next => {
              if (next.convex !== prevEdge.convex) return false;
              if (Math.abs(next.len - prevEdge.len) / prevEdge.len > 0.35) return false;
              const nextTo = next.from === currVert ? next.to : next.from;
              const nextDir = sub(mesh.points[nextTo], mesh.points[currVert]);
              const l2 = Math.hypot(...nextDir);
              const cosAngle = dot(prevDir, nextDir) / (l1 * l2);
              return cosAngle > 0.85;
            });
            if (!best || loopEdges.length > 500) break;
            if (usedEdges.has(best.index)) {
              if (best.index === start.index) break;
              break;
            }
            loopEdges.push(best);
            prevFrom = currVert;
            currVert = best.from === currVert ? best.to : best.from;
            prevEdge = best;
          }
          if (currVert === start.from && loopVerts.length >= 12) {
            const pts = loopVerts.map(i => mesh.points[i]);
            const c = [0, 1, 2].map(axis => pts.reduce((s, p) => s + p[axis], 0) / pts.length);
            const radii = pts.map(p => Math.hypot(...sub(p, c)));
            const r_mean = radii.reduce((s, r) => s + r, 0) / radii.length;
            const maxDev = Math.max(...radii.map(r => Math.abs(r - r_mean)));
            if (r_mean >= 0.1 && (maxDev / r_mean) <= 0.05) {
              loopEdges.forEach(e => usedEdges.add(e.index));
              let n = [0, 0, 0];
              for (let i = 0; i < pts.length; i++) {
                const cur = pts[i], nxt = pts[(i + 1) % pts.length];
                n[0] += (cur[1] - nxt[1]) * (cur[2] + nxt[2]);
                n[1] += (cur[2] - nxt[2]) * (cur[0] + nxt[0]);
                n[2] += (cur[0] - nxt[0]) * (cur[1] + nxt[1]);
              }
              const nLen = Math.hypot(...n);
              let normal3D = nLen > 1e-6 ? n.map(x => x / nLen) : [0, 0, 1];
              const refNormal = start.edge?.normals?.find(fn => Math.abs(dot(fn, normal3D)) > 0.85);
              if (refNormal && dot(refNormal, normal3D) < 0) {
                normal3D = normal3D.map(x => -x);
              }
              const exists = rings.some(r => Math.hypot(...sub(r.center3D, c)) < 0.1 && Math.abs(r.radius - r_mean) < 0.1);
              if (!exists) {
                rings.push({
                  radius: r_mean,
                  center3D: c,
                  normal3D,
                  points3D: pts,
                  count: pts.length
                });
              }
            }
          }
        }
      } catch (_) {}
      let circle = null;
      if (body.points?.length >= 32 && !body.holes?.length) {
        const center = [0, 1].map(axis => body.points.reduce((sum, point) => sum + point[axis], 0) / body.points.length);
        const radii = body.points.map(point => Math.hypot(point[0] - center[0], point[1] - center[1]));
        const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
        if (Math.max(...radii.map(value => Math.abs(value - radius))) < 0.001) {
          circle = { center, radius, count: body.points.length };
        }
      }
      const candidates = mesh.edges.flatMap((edge, index) => {
        if (edge.sides.length !== 2 || dot(edge.normals[0], edge.normals[1]) > 0.965) return [];
        const a = mesh.points[edge.from], b = mesh.points[edge.to];
        const midpoint = a.map((value, axis) => (value + b[axis]) / 2);
        const [first, second] = edge.sides;
        const firstInside = dot(first.opposite.map((value, axis) => value - midpoint[axis]), second.normal);
        const secondInside = dot(second.opposite.map((value, axis) => value - midpoint[axis]), first.normal);
        const length = Math.hypot(...a.map((value, axis) => value - b[axis]));
        if (length < 1e-5) return [];
        const convex = firstInside < -1e-5 && secondInside < -1e-5;
        const concave = firstInside > 1e-5 && secondInside > 1e-5;
        if (!convex && !concave) return [];
        let ring = null;
        if (convex || concave) {
          for (const r of rings) {
            const distA = Math.hypot(...sub(a, r.center3D));
            const distB = Math.hypot(...sub(b, r.center3D));
            const planeDistA = Math.abs(dot(sub(a, r.center3D), r.normal3D));
            const planeDistB = Math.abs(dot(sub(b, r.center3D), r.normal3D));
            if (Math.abs(distA - r.radius) <= Math.max(0.25, r.radius * 0.05) &&
                Math.abs(distB - r.radius) <= Math.max(0.25, r.radius * 0.05) &&
                planeDistA < 0.05 && planeDistB < 0.05) {
              ring = { ...r };
              if (body.normal) {
                const origin = body.origin || cad.planes.grid[body.plane]?.origin || [0, 0, 0];
                const planeDist = dot(r.center3D.map((val, idx) => val - origin[idx]), body.normal);
                const matchedCap = [body.start, body.end].find(val => Math.abs(planeDist - val) < 0.01);
                ring.cap = matchedCap !== undefined ? matchedCap : planeDist;
              }
              if (circle && convex) {
                ring.center = circle.center;
              }
              break;
            }
          }
          if (!ring && circle && convex && body.plane && cad.planes?.grid?.[body.plane]) {
            const origin = body.origin || cad.planes.grid[body.plane]?.origin || [0, 0, 0];
            const planeA = dot(a.map((value, axis) => value - origin[axis]), body.normal);
            const planeB = dot(b.map((value, axis) => value - origin[axis]), body.normal);
            const cap = [body.start, body.end].find(value =>
              Math.abs(planeA - value) < 0.001 && Math.abs(planeB - value) < 0.001);
            if (cap !== undefined) {
              const { u, v } = cad.planes.grid[body.plane];
              const center3D = u.map((val, axis) => origin[axis] + val * circle.center[0] + v[axis] * circle.center[1] + body.normal[axis] * cap);
              const normal3D = Math.abs(cap - body.end) < 0.001 ? [...body.normal] : body.normal.map(x => -x);
              const points3D = body.points.map(p => u.map((val, axis) => origin[axis] + val * p[0] + v[axis] * p[1] + body.normal[axis] * cap));
              ring = { ...circle, cap, center3D, normal3D, points3D };
            }
          }
        }
        return [{ body, index, a, b, normals: edge.normals, length, convex, ring }];
      });
      const atPoint = new Map();
      for (const edge of candidates) for (const point of [edge.a, edge.b]) {
        const key = pointKey(point);
        if (!atPoint.has(key)) atPoint.set(key, []);
        atPoint.get(key).push(edge);
      }
      const direction = edge => edge.a.map((value, axis) => (edge.b[axis] - value) / edge.length);
      const sameSurfaces = (first, second) =>
        (dot(first.normals[0], second.normals[0]) > 0.95 &&
          dot(first.normals[1], second.normals[1]) > 0.95) ||
        (dot(first.normals[0], second.normals[1]) > 0.95 &&
          dot(first.normals[1], second.normals[0]) > 0.95);
      return candidates.filter(edge => edge.ring || ![edge.a, edge.b].some(point =>
        (atPoint.get(pointKey(point)) || []).some(next => next !== edge &&
          sameSurfaces(edge, next) && Math.abs(dot(direction(edge), direction(next))) < 0.999999)));
    }

    render(context, project, camera, bodies) {
      const visible = bodies.filter(body => body.visible !== false);
      for (const body of [...this.residentBodies]) if (!visible.includes(body)) this.releaseBody(body);
      if (!visible.length) {
        this.lastBodies = [];
        this.lastMeshes = [];
        return true;
      }
      if (!visible.every(body => body.mesh) || !this.initialize()) return false;
      const bounds = context.canvas?.getBoundingClientRect?.();
      if (!bounds?.width || !bounds?.height) return false;
      const gl = this.gl;
      if (this.canvas.width !== context.canvas.width || this.canvas.height !== context.canvas.height) {
        this.canvas.width = context.canvas.width;
        this.canvas.height = context.canvas.height;
        this.lastKey = null;
      }
      const isExtruding = Boolean(cad.app?.extrudeController?.active || cad.extrudeController?.active);
      const inspectMesh = !isExtruding && cad.settings?.showMesh === true;
      const moveCtrl = cad.app?.bodyMove || cad.bodyMoveController;
      const moveSelected = moveCtrl?.active ? (moveCtrl.selected) : null;
      const movePreview = moveCtrl?.active ? (moveCtrl.preview) : null;
      const decimateSelected = cad.app?.meshDecimate?.active ? (cad.app.meshDecimate.selectedBody) : null;
      const finishSelected = cad.app?.surfaceFinish?.active ? (cad.app.surfaceFinish.selectedBody) : null;
      const toSolidSelected = cad.app?.meshToSolid?.active ? (cad.app.meshToSolid.selectedBody) : null;
      const zebraCtrl = cad.app?.zebraAnalysis || cad.zebraAnalysisController;
      const zebraActive = Boolean(zebraCtrl?.active);
      const zebraRepeats = zebraCtrl?.repeats || 30.0;
      const zebraDir = zebraCtrl?.direction === 'vertical' ? 1.0 : 0.0;
      const zebraOpacity = zebraCtrl?.opacity ?? 0.85;
      const zebraTargetId = zebraCtrl?.selectedBody?.id || null;
      const selectedBody = cad.app?.faceSelection?.selectedBody || moveSelected || decimateSelected || finishSelected || toSolidSelected;
      const isBodySelected = body => Boolean(
        body.convertSelected ||
        (selectedBody && selectedBody === body) ||
        (movePreview && movePreview === body) ||
        (moveSelected && moveSelected === body)
      );
      const key = [bounds.width, bounds.height, this.canvas.width, this.canvas.height,
        camera.zoom, camera.panX, camera.panY, ...camera.right, ...camera.up,
        ...camera.depth, ...camera.pivot, cad.settings?.cameraPivot,
        cad.settings?.displayStyle, inspectMesh,
        zebraActive, zebraRepeats, zebraDir, zebraOpacity, zebraTargetId,
        ...visible.map(body => body.isInterference ? 3 : body.convertSelected ? 2 : isBodySelected(body) ? 1 : 0)].join('|');

      if (this.lastKey === key && visible.length === this.lastBodies.length &&
        visible.every((body, index) => body === this.lastBodies[index] &&
          (body.renderMesh || body.mesh) === this.lastMeshes[index])) {
        context.drawImage(this.canvas, 0, 0, bounds.width, bounds.height);
        return true;
      }

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(this.program);

      // Camera-relative studio panels keep the material readable while orbiting.
      const keyLight = studioDirection(camera, -1.05, 0.80, 0.20);
      const fillLight = studioDirection(camera, 0.90, 0.20, 0.60);
      gl.uniform3f(this.uKeyLightDir, ...keyLight);
      gl.uniform3f(this.uFillLightDir, ...fillLight);
      gl.uniform3fv(this.uCameraDepth, new Float32Array(camera.depth));
      gl.uniform3fv(this.uCameraRight, new Float32Array(camera.right));
      gl.uniform3fv(this.uCameraUp, new Float32Array(camera.up));
      gl.uniform1f(this.uZebraRepeats, zebraRepeats);
      gl.uniform1f(this.uZebraDirection, zebraDir);
      gl.uniform1f(this.uZebraOpacity, zebraOpacity);
      gl.uniform1f(this.uSpecularStrength, 0.50);
      gl.uniform1f(this.uShininess, 96.0);

      // 1. Calculate depth bounds near/far from body bounding boxes
      let near = Infinity, far = -Infinity;
      for (const body of visible) {
        const sourceMesh = body.renderMesh || body.mesh;
        if (body._boxCornersMesh !== sourceMesh) {
          const v = sourceMesh.vertices;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (let i = 0; i < v.length; i += 3) {
            const x = v[i], y = v[i + 1], z = v[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          }
          body._boxCorners = [
            [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
            [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ]
          ];
          body._boxCornersMesh = sourceMesh;
        }
        for (const c of body._boxCorners) {
          const d = dot(c, camera.depth);
          if (d < near) near = d;
          if (d > far) far = d;
        }
      }
      if (!Number.isFinite(near)) { near = -100; far = 100; }
      // 2. Use the same projection as the 2D grid and selection overlays.
      const mvp = this.projectionMatrix(camera, bounds.width, bounds.height, near, far);

      gl.uniformMatrix4fv(this.uMVPMatrix, false, mvp);
      gl.uniform1f(this.uDepthBias, 0.0);

      // Stride: 10 floats (40 bytes): 3 pos, 3 norm, 4 color
      const STRIDE = 40;
      gl.enableVertexAttribArray(this.position);
      gl.enableVertexAttribArray(this.normal);
      gl.enableVertexAttribArray(this.color);

      // 3. Render Solid Triangles directly from cached VBOs
      for (const body of visible) {
        const mesh = this.mesh(body);
        const selMix = body.isInterference ? -0.88
          : body.convertSelected ? 0.5
          : isBodySelected(body) ? 0.36
          : 0;
        gl.uniform1f(this.uSelectionMix, selMix);
        const isZebraOnBody = zebraActive && (!zebraCtrl?.selectedBody || zebraCtrl?.selectedBody === body);
        gl.uniform1f(this.uZebraActive, isZebraOnBody ? 1.0 : 0.0);
        let vbo = this.vboCache.get(body);
        if (!vbo || vbo.mesh !== mesh.mesh) {
          if (vbo) gl.deleteBuffer(vbo.buffer);
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, mesh.triData, gl.STATIC_DRAW);
          vbo = { buffer, count: mesh.triVertexCount, mesh: mesh.mesh };
          this.vboCache.set(body, vbo);
          this.residentBodies.add(body);
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo.buffer);
        }
        gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, STRIDE, 0);
        gl.vertexAttribPointer(this.normal, 3, gl.FLOAT, false, STRIDE, 12);
        gl.vertexAttribPointer(this.color, 4, gl.FLOAT, false, STRIDE, 24);
        gl.drawArrays(gl.TRIANGLES, 0, vbo.count);
      }

      // 4. Render Feature Edges and Wireframe
      if (!inspectMesh) {
        for (const body of visible) {
          const prepared = this.meshCache.get(body);
          if (prepared?.lineVbo?.denseOnly) {
            gl.deleteBuffer(prepared.lineVbo.buffer);
            prepared.lineVbo = null;
          }
        }
      }
      const wantEdges = inspectMesh || cad.settings?.displayStyle === 'shaded-edges';
      if (wantEdges) {
        gl.uniform1f(this.uSelectionMix, 0);
        gl.uniform1f(this.uDepthBias, 0.00022);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        try { gl.lineWidth?.(1.5); } catch (_) {}
        for (const body of visible) {
          const mesh = this.mesh(body);
          const denseImported = (body.meshSource === 'import' || body.meshSource === 'solid') && !mesh.edges?.length;
          if (!denseImported && !mesh.edges?.length) continue;
          if (denseImported && !inspectMesh && !mesh.featurePairs?.length) continue;
          let lineVbo = mesh.lineVbo;
          if (!lineVbo || lineVbo.mesh !== mesh.mesh || lineVbo.inspectMesh !== inspectMesh) {
            if (lineVbo) gl.deleteBuffer(lineVbo.buffer);
            let lineData;
            if (denseImported) {
              lineData = inspectMesh ? denseWireframeData(mesh.mesh)
                : featureLineData(mesh.mesh, mesh.featurePairs);
            } else {
              const lineArr = [];
              const color = inspectMesh ? [0.18, 0.39, 0.51, 1] : [0.08, 0.10, 0.14, 1];
              for (const edge of mesh.edges) {
                if (!inspectMesh) {
                  if (edge.normals.length === 2 && dot(edge.normals[0], edge.normals[1]) >= 0.965) continue;
                }
                const a = mesh.points[edge.from], b = mesh.points[edge.to];
                lineArr.push(a[0], a[1], a[2], 0, 0, 0, color[0], color[1], color[2], 1);
                lineArr.push(b[0], b[1], b[2], 0, 0, 0, color[0], color[1], color[2], 1);
              }
              lineData = new Float32Array(lineArr);
            }
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW);
            lineVbo = { buffer: buf, count: lineData.length / 10, mesh: mesh.mesh, inspectMesh,
              denseOnly: denseImported && inspectMesh };
            mesh.lineVbo = lineVbo;
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, lineVbo.buffer);
          }
          if (lineVbo.count > 0) {
            gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, STRIDE, 0);
            gl.vertexAttribPointer(this.normal, 3, gl.FLOAT, false, STRIDE, 12);
            gl.vertexAttribPointer(this.color, 4, gl.FLOAT, false, STRIDE, 24);
            gl.drawArrays(gl.LINES, 0, lineVbo.count);
          }
        }
        gl.depthMask(true);
      }

      this.lastKey = key;
      this.lastBodies = [...visible];
      this.lastMeshes = visible.map(body => body.renderMesh || body.mesh);

      context.drawImage(this.canvas, 0, 0, bounds.width, bounds.height);
      return true;
    }
  }

  cad.bodyRenderer = new BodyRenderer();
})(window.WebCAD = window.WebCAD || {});
