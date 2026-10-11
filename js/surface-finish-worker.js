importScripts('surface-finish-core.js');

self.onmessage = ({ data }) => {
  try {
    const result = self.WebCADSurfaceFinishCore.compute(data.mesh, data.angle);
    self.postMessage({ result }, [result.cornerNormals.buffer, result.featurePairs.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
