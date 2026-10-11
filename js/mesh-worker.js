// Heavy parsing and display-mesh generation stay off the UI thread.
self.window = self;
importScripts('mesh-decimator.js', 'importers.js');

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'parse') {
      const parser = data.format === 'stl' ? self.WebCAD.importers.parseSTL
        : data.format === 'obj' ? self.WebCAD.importers.parseOBJ
        : self.WebCAD.importers.parseSTEP;
      const parsed = parser(data.input);
      const vertices = Float32Array.from(parsed.vertices);
      const triangles = Uint32Array.from(parsed.triangles);
      self.postMessage({
        vertices, triangles, bounds: parsed.bounds,
        vertexCount: vertices.length / 3, triangleCount: triangles.length / 3,
        format: parsed.format,
      }, [vertices.buffer, triangles.buffer]);
    } else if (data.type === 'simplify') {
      const result = self.WebCAD.meshDecimator.decimateGridClustering(data.mesh, { ratio: data.ratio });
      self.postMessage(result, [result.vertices.buffer, result.triangles.buffer]);
    } else {
      throw new Error('Unknown mesh job');
    }
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
