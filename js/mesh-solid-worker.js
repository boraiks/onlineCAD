// Hosted sites convert imported meshes off the UI thread. file:// uses the main-thread fallback.
self.window = self;
self.document = { currentScript: { src: self.location.href } };
importScripts('mesh-rebuild-core.js', 'mesh-feature-fit-core.js', 'mesh-solid-core.js',
  'vendor/manifold/manifold.js', 'vendor/manifold/manifold-binary.js');

let modulePromise;
self.onmessage = async ({ data }) => {
  try {
    modulePromise ||= self.WebCADManifoldModule({ wasmBinary: self.WebCADManifoldBinary })
      .then(module => { module.setup(); return module; });
    const module = await modulePromise;
    const result = self.WebCADMeshSolidCore.convert(module, data.mesh, data.options);
    self.postMessage({ result }, [result.vertices.buffer, result.triangles.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
