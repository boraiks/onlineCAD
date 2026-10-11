Manifold 3D v3.5.4 is bundled here for local, on-demand 3D Boolean operations.
Source package: https://www.npmjs.com/package/manifold-3d/v/3.5.4
Upstream project: https://github.com/elalish/manifold
License: Apache 2.0; see LICENSE.

`manifold.js` is the upstream browser bundle with its ESM export and
`import.meta.url` reference adapted to a classic script so the app can run
from a local `file://` page. `manifold-binary.js` contains the upstream WASM
binary encoded as base64 because browsers do not consistently allow a local
page to fetch a separate WASM file. Both scripts load only when Join, Cut, or
Intersect is first selected.
