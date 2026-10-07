/* webCAD workspace preview. Geometry is sample data; editing/export comes later. */
const modelCanvas = document.querySelector('#modelCanvas');
const sketchCanvas = document.querySelector('#sketchCanvas');
const modelCtx = modelCanvas.getContext('2d');
const sketchCtx = sketchCanvas.getContext('2d');

const outline = [
  [-3, -1.25], [3, -1.25], [3, 1.25],
  [1.45, 1.25], [1.45, 0.58], [0.72, 0.58], [0.72, 1.25],
  [-0.72, 1.25], [-0.72, 0.58], [-1.45, 0.58], [-1.45, 1.25],
  [-3, 1.25],
];
const holes = [[-2.15, -0.2], [2.15, -0.2]];
const extrusionHeight = 0.42;
const model = { yaw: 0.68, pitch: 0.58, zoom: 1 };
const sketch = { zoom: 1, panX: 0, panY: 0 };
let modelWidth = 0;
let modelHeight = 0;
let sketchWidth = 0;
let sketchHeight = 0;

function sizeCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [rect.width, rect.height];
}

function pathThrough(ctx, points, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
}

function drawModel() {
  if (!modelWidth || !modelHeight) return;
  const ctx = modelCtx;
  const w = modelWidth;
  const h = modelHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f8fbfd';
  ctx.fillRect(0, 0, w, h);

  const scale = Math.min(w / 9.6, h / 4.6) * model.zoom;
  const cyaw = Math.cos(model.yaw), syaw = Math.sin(model.yaw);
  const cp = Math.cos(model.pitch), sp = Math.sin(model.pitch);
  const camera = [syaw * cp, sp, cyaw * cp];
  const project = (x, y, z) => [
    w * 0.5 + (x * cyaw - z * syaw) * scale,
    h * 0.55 - (-x * syaw * sp + y * cp - z * cyaw * sp) * scale,
  ];

  // The grid is purely a spatial reference for this first workspace draft.
  ctx.save();
  for (let n = -10; n <= 10; n++) {
    const major = n === 0 || n % 5 === 0;
    ctx.strokeStyle = n === 0 ? '#a9c9dd' : major ? '#d5e4ed' : '#e2edf3';
    ctx.lineWidth = n === 0 ? 1.1 : 0.7;
    pathThrough(ctx, [project(n, -0.055, -10), project(n, -0.055, 10)]);
    ctx.stroke();
    pathThrough(ctx, [project(-10, -0.055, n), project(10, -0.055, n)]);
    ctx.stroke();
  }
  ctx.restore();

  // Draw only side faces facing the camera; order them from far to near.
  const faces = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const normal = [dz, -dx];
    const visible = normal[0] * camera[0] + normal[1] * camera[2] > 0.001;
    return { a, b, visible, depth: ((a[0] + b[0]) / 2) * camera[0] + ((a[1] + b[1]) / 2) * camera[2] };
  }).filter(face => face.visible).sort((a, b) => a.depth - b.depth);

  for (const face of faces) {
    const a = face.a, b = face.b;
    pathThrough(ctx, [project(a[0], 0, a[1]), project(b[0], 0, b[1]), project(b[0], extrusionHeight, b[1]), project(a[0], extrusionHeight, a[1])], true);
    ctx.fillStyle = face.depth > 0 ? '#8dc1de' : '#a8d3e7';
    ctx.fill();
    ctx.strokeStyle = '#488ab5';
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  pathThrough(ctx, outline.map(([x, z]) => project(x, extrusionHeight, z)), true);
  ctx.fillStyle = '#dceef7';
  ctx.fill();
  ctx.strokeStyle = '#408ab9';
  ctx.lineWidth = 1.65;
  ctx.stroke();

  // Light contour lines keep the sample visually legible from every angle.
  ctx.save();
  ctx.strokeStyle = 'rgba(39,120,170,.32)';
  ctx.lineWidth = 0.8;
  for (const z of [-0.9, -0.5, -0.1, 0.3]) {
    pathThrough(ctx, [project(-2.85, extrusionHeight + 0.005, z), project(2.85, extrusionHeight + 0.005, z)]);
    ctx.stroke();
  }
  ctx.restore();

  for (const [hx, hz] of holes) {
    const points = Array.from({ length: 48 }, (_, i) => {
      const angle = i * Math.PI * 2 / 48;
      return project(hx + Math.cos(angle) * 0.18, extrusionHeight + 0.01, hz + Math.sin(angle) * 0.18);
    });
    pathThrough(ctx, points, true);
    ctx.fillStyle = '#f9fcfd';
    ctx.fill();
    ctx.strokeStyle = '#329f97';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function drawSketch() {
  if (!sketchWidth || !sketchHeight) return;
  const ctx = sketchCtx;
  const w = sketchWidth, h = sketchHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fcfdfe';
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / 8.6, h / 3.6) * sketch.zoom;
  const cx = w / 2 + sketch.panX, cy = h / 2 + sketch.panY;
  const point = (x, y) => [cx + x * scale, cy - y * scale];

  const step = scale / 2;
  if (step > 9) {
    ctx.lineWidth = 0.7;
    const left = ((cx % step) + step) % step;
    const top = ((cy % step) + step) % step;
    for (let x = left; x < w; x += step) {
      ctx.strokeStyle = '#edf3f6';
      pathThrough(ctx, [[x, 0], [x, h]]);
      ctx.stroke();
    }
    for (let y = top; y < h; y += step) {
      ctx.strokeStyle = '#edf3f6';
      pathThrough(ctx, [[0, y], [w, y]]);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#d3e3ed';
  ctx.lineWidth = 1;
  pathThrough(ctx, [[cx, 0], [cx, h]]); ctx.stroke();
  pathThrough(ctx, [[0, cy], [w, cy]]); ctx.stroke();

  pathThrough(ctx, outline.map(([x, y]) => point(x, y)), true);
  ctx.fillStyle = 'rgba(79,159,202,.14)';
  ctx.fill();
  ctx.strokeStyle = '#368ec4';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  for (const [hx, hy] of holes) {
    const [x, y] = point(hx, hy);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, 0.18 * scale), 0, Math.PI * 2);
    ctx.fillStyle = '#fcfdfe';
    ctx.fill();
    ctx.strokeStyle = '#2ba887';
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2ba887';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 0.42 * scale, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(43,168,135,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // A single reference dimension makes the preview read as a sketch.
  const dimY = 1.58;
  const a = point(-3, dimY), b = point(3, dimY);
  ctx.strokeStyle = '#9cbed1';
  ctx.lineWidth = 0.9;
  pathThrough(ctx, [a, b]); ctx.stroke();
  for (const x of [-3, 3]) {
    pathThrough(ctx, [point(x, 1.35), point(x, 1.78)]); ctx.stroke();
  }
  ctx.fillStyle = '#7e9eb1';
  ctx.font = '9px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('6.00 mm', (a[0] + b[0]) / 2, a[1] - 5);
}

function resizeAll() {
  [modelWidth, modelHeight] = sizeCanvas(modelCanvas, modelCtx);
  [sketchWidth, sketchHeight] = sizeCanvas(sketchCanvas, sketchCtx);
  drawModel();
  drawSketch();
}

const isoView = document.querySelector('#isoView');
const topView = document.querySelector('#topView');
const viewStatus = document.querySelector('.status-bar span:first-child');
function setView(mode) {
  isoView.classList.toggle('selected', mode === 'iso');
  topView.classList.toggle('selected', mode === 'top');
  viewStatus.innerHTML = `<i></i> GÖRÜNÜM: ${mode === 'iso' ? 'İZOMETRİK' : mode === 'top' ? 'ÜSTTEN' : 'SERBEST'}`;
  drawModel();
}
isoView.addEventListener('click', () => { model.yaw = 0.68; model.pitch = 0.58; setView('iso'); });
topView.addEventListener('click', () => { model.yaw = 0; model.pitch = Math.PI / 2; setView('top'); });
document.querySelector('#reset3d').addEventListener('click', () => { model.yaw = 0.68; model.pitch = 0.58; model.zoom = 1; setView('iso'); });
document.querySelector('#resetSketch').addEventListener('click', () => { sketch.zoom = 1; sketch.panX = 0; sketch.panY = 0; drawSketch(); });

function enablePointerDrag(canvas, onMove) {
  let last = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    last = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!last) return;
    const dx = event.clientX - last[0], dy = event.clientY - last[1];
    last = [event.clientX, event.clientY];
    onMove(dx, dy);
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
}
enablePointerDrag(modelCanvas, (dx, dy) => {
  model.yaw += dx * 0.009;
  model.pitch = Math.max(0.12, Math.min(1.55, model.pitch - dy * 0.008));
  setView('free');
});
enablePointerDrag(sketchCanvas, (dx, dy) => {
  sketch.panX += dx;
  sketch.panY += dy;
  drawSketch();
});
modelCanvas.addEventListener('wheel', event => {
  event.preventDefault();
  model.zoom = Math.max(0.5, Math.min(2.6, model.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  drawModel();
}, { passive: false });
sketchCanvas.addEventListener('wheel', event => {
  event.preventDefault();
  sketch.zoom = Math.max(0.45, Math.min(3, sketch.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  drawSketch();
}, { passive: false });

const viewportStack = document.querySelector('#viewportStack');
const resizeDivider = document.querySelector('#resizeDivider');
let topRatio = 0.58;
function updateSplit() {
  const available = viewportStack.clientHeight - 10;
  if (available <= 0) return;
  const minTop = Math.min(175, available * 0.45);
  const minBottom = Math.min(150, available * 0.45);
  const top = Math.max(minTop, Math.min(available - minBottom, available * topRatio));
  viewportStack.style.gridTemplateRows = `${top}px 10px minmax(0, 1fr)`;
  resizeAll();
}
resizeDivider.addEventListener('pointerdown', event => {
  resizeDivider.setPointerCapture(event.pointerId);
});
resizeDivider.addEventListener('pointermove', event => {
  if (!resizeDivider.hasPointerCapture(event.pointerId)) return;
  const rect = viewportStack.getBoundingClientRect();
  topRatio = Math.max(0.2, Math.min(0.8, (event.clientY - rect.top) / Math.max(1, rect.height - 10)));
  updateSplit();
});
resizeDivider.addEventListener('keydown', event => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  topRatio = Math.max(0.2, Math.min(0.8, topRatio + (event.key === 'ArrowDown' ? 0.04 : -0.04)));
  updateSplit();
});

new ResizeObserver(updateSplit).observe(viewportStack);
new ResizeObserver(resizeAll).observe(modelCanvas.parentElement);
new ResizeObserver(resizeAll).observe(sketchCanvas.parentElement);
updateSplit();
