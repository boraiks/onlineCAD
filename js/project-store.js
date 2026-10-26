(function (cad) {
  'use strict';

  // Browser-side project storage. IndexedDB holds serialized projects as
  // structured clones, so large meshes do not hit the ~5 MB localStorage cap.
  const DB_NAME = 'onlinecad';
  const STORE = 'projects';
  const AUTOSAVE_KEY = 'autosave';
  const SAVED_KEY = 'saved';

  let databasePromise = null;

  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Browser storage (IndexedDB) is not available.'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
    });
    databasePromise.catch(() => { databasePromise = null; });
    return databasePromise;
  }

  async function run(mode, action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error('Browser storage request failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser storage request was aborted.'));
    });
  }

  const put = (key, project) => run('readwrite', store => store.put({ savedAt: Date.now(), project }, key));
  const get = key => run('readonly', store => store.get(key));
  const remove = key => run('readwrite', store => store.delete(key));

  // Old builds wrote the "save to browser" option into localStorage; move it
  // over once so those drafts can be opened again.
  async function migrateLegacy() {
    let raw = null;
    try { raw = window.localStorage?.getItem('onlinecad_saved_project'); } catch { return; }
    if (!raw) return;
    try {
      if (!(await get(SAVED_KEY))) await put(SAVED_KEY, JSON.parse(raw));
      window.localStorage.removeItem('onlinecad_saved_project');
      window.localStorage.removeItem('onlinecad_saved_stl');
    } catch { /* Keep the legacy copy if it cannot be moved. */ }
  }

  function hasContent(project) {
    return Boolean(project?.sketches?.some(sketch => sketch.entities?.length) || project?.bodies?.length);
  }

  cad.projectStore = { AUTOSAVE_KEY, SAVED_KEY, put, get, remove, migrateLegacy, hasContent };
})(window.WebCAD = window.WebCAD || {});
