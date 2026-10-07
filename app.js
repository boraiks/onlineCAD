/* The shape is sample geometry for the workspace preview. */
const canvas = document.querySelector('#modelCanvas');
const ctx = canvas.getContext('2d');
const viewport = document.querySelector('#viewport');
const isoView = document.querySelector('#isoView');
const topView = document.querySelector('#topView');
const viewStatus = document.querySelector('.status-bar span:first-child');

const outline = [
  [-3, -1.25], [3, -1.25], [3, 1.25],
  [1.45, 1.25], [1.45, 0.58], [0.72, 0.58], [0.72, 1.25],
  [-0.72, 1.25], [-0.72, 0.58], [-1.45, 0.58], [-1.45, 1.25],
  [-3, 1.25],
];
const holes = [[-2.15, -0.2], [2.15, -0.2]];
const extrusionHeight = 0.42;
const camera = { yaw: 0.68, pitch: 0.58, zoom: 1, panX: 0, panY: 0 };
let width = 0;
let height = 0;

function pathThrough(points, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  if (close) ctx.closePath();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawModel();
}

function drawModel() {
  if (!width || !height) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f9fcfd';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / 9.6, height / 4.6) * camera.zoom;
  const cyaw = Math.cos(camera.yaw), syaw = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const cameraDirection = [syaw * cp, sp, cyaw * cp];
  const project = (x, y, z) => [
    width * 0.5 + camera.panX + (x * cyaw - z * syaw) * scale,
    height * 0.55 + camera.panY - (-x * syaw * sp + y * cp - z * cyaw * sp) * scale,
  ];

  // A lightweight construction grid keeps the preview independent of libraries.
  for (let n = -12; n <= 12; n++) {
    const major = n === 0 || n % 5 === 0;
    ctx.strokeStyle = n === 0 ? '#b1cedd' : major ? '#d7e6ee' : '#e5eef3';
    ctx.lineWidth = n === 0 ? 1.1 : 0.7;
    pathThrough([project(n, -0.055, -12), project(n, -0.055, 12)]);
    ctx.stroke();
    pathThrough([project(-12, -0.055, n), project(12, -0.055, n)]);
    ctx.stroke();
  }

  const faces = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const normal = [dz, -dx];
    const visible = normal[0] * cameraDirection[0] + normal[1] * cameraDirection[2] > 0.001;
    const depth = ((a[0] + b[0]) / 2) * cameraDirection[0] + ((a[1] + b[1]) / 2) * cameraDirection[2];
    return { a, b, visible, depth };
  }).filter(face => face.visible).sort((a, b) => a.depth - b.depth);

  for (const { a, b, depth } of faces) {
    pathThrough([
      project(a[0], 0, a[1]),
      project(b[0], 0, b[1]),
      project(b[0], extrusionHeight, b[1]),
      project(a[0], extrusionHeight, a[1]),
    ], true);
    ctx.fillStyle = depth > 0 ? '#90c3de' : '#a8d3e7';
    ctx.fill();
    ctx.strokeStyle = '#488ab5';
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  pathThrough(outline.map(([x, z]) => project(x, extrusionHeight, z)), true);
  ctx.fillStyle = '#dceef7';
  ctx.fill();
  ctx.strokeStyle = '#408ab9';
  ctx.lineWidth = 1.65;
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = 'rgba(39,120,170,.28)';
  ctx.lineWidth = 0.8;
  for (const z of [-0.9, -0.5, -0.1, 0.3]) {
    pathThrough([project(-2.85, extrusionHeight + 0.005, z), project(2.85, extrusionHeight + 0.005, z)]);
    ctx.stroke();
  }
  ctx.restore();

  for (const [hx, hz] of holes) {
    const points = Array.from({ length: 48 }, (_, i) => {
      const angle = i * Math.PI * 2 / 48;
      return project(hx + Math.cos(angle) * 0.18, extrusionHeight + 0.01, hz + Math.sin(angle) * 0.18);
    });
    pathThrough(points, true);
    ctx.fillStyle = '#f9fcfd';
    ctx.fill();
    ctx.strokeStyle = '#329f97';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function setView(mode) {
  isoView.classList.toggle('active', mode === 'iso');
  topView.classList.toggle('active', mode === 'top');
  isoView.setAttribute('aria-pressed', mode === 'iso');
  topView.setAttribute('aria-pressed', mode === 'top');
  viewStatus.innerHTML = `<i></i> GÖRÜNÜM: ${mode === 'iso' ? 'İZOMETRİK' : mode === 'top' ? 'ÜSTTEN' : 'SERBEST'}`;
  drawModel();
}

function fitView() {
  camera.zoom = 1;
  camera.panX = 0;
  camera.panY = 0;
  drawModel();
}
isoView.addEventListener('click', () => {
  camera.yaw = 0.68;
  camera.pitch = 0.58;
  setView('iso');
});
topView.addEventListener('click', () => {
  camera.yaw = 0;
  camera.pitch = Math.PI / 2;
  setView('top');
});
document.querySelector('#reset3d').addEventListener('click', () => {
  camera.yaw = 0.68;
  camera.pitch = 0.58;
  fitView();
  setView('iso');
});
document.querySelector('#fitView').addEventListener('click', fitView);
document.querySelector('#zoomIn').addEventListener('click', () => {
  camera.zoom = Math.min(2.6, camera.zoom * 1.15);
  drawModel();
});
document.querySelector('#zoomOut').addEventListener('click', () => {
  camera.zoom = Math.max(0.5, camera.zoom / 1.15);
  drawModel();
});

let drag = null;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 && event.button !== 1) return;
  drag = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 1 };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.pan) {
    camera.panX += dx;
    camera.panY += dy;
    drawModel();
  } else {
    camera.yaw += dx * 0.009;
    camera.pitch = Math.max(0.12, Math.min(1.55, camera.pitch - dy * 0.008));
    setView('free');
  }
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  camera.zoom = Math.max(0.5, Math.min(2.6, camera.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  drawModel();
}, { passive: false });

new ResizeObserver(resizeCanvas).observe(viewport);
resizeCanvas();
