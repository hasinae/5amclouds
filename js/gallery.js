import * as THREE from 'three';

/* ---------------- ASCII Loader ---------------- */
var TARGET_TEXT = '5AMCLOUDS';
var NOISE_CHARS = '.:*#%?$&+=~\u00b7\u2022\u2591\u2592\u2593';
var INSTANT = new URLSearchParams(window.location.search).has('instant');
var MIN_LOAD_MS = INSTANT ? 50 : 3000;
var MAX_LOAD_MS = INSTANT ? 100 : 5000;

var asciiEl = document.getElementById('ascii-text');
var loaderEl = document.getElementById('loader');
var loaderFillEl = document.getElementById('loader-bar-fill');
var loaderPercentEl = document.getElementById('loader-percent');
var siteEl = document.getElementById('site');

function randomChar() {
  return NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
}

function renderAscii(progress) {
  var revealCount = Math.floor(progress * TARGET_TEXT.length);
  var out = '';
  for (var i = 0; i < TARGET_TEXT.length; i++) {
    if (i < revealCount) {
      out += '<span>' + TARGET_TEXT[i] + '</span>';
    } else {
      out += '<span class="noise">' + randomChar() + '</span>';
    }
  }
  asciiEl.innerHTML = out;
}

function setLoaderProgress(pct) {
  var clamped = Math.max(0, Math.min(100, pct));
  loaderFillEl.style.width = clamped + '%';
  loaderPercentEl.textContent = Math.floor(clamped) + '%';
  renderAscii(clamped / 100);
}

var loadProgress = 0;

function runLoader(onDone) {
  var start = performance.now();
  var progressDisplay = 0;
  var noiseTimer = setInterval(function () {
    if (progressDisplay < 100) renderAscii(progressDisplay / 100);
  }, 70);

  var tickTimer = setInterval(function () {
    var now = performance.now();
    var elapsed = now - start;
    var timeFraction = Math.min(1, elapsed / MIN_LOAD_MS);
    var target = Math.min(timeFraction, Math.max(timeFraction * 0.4, loadProgress));
    var hardCap = Math.min(1, elapsed / MAX_LOAD_MS);
    target = Math.max(target, hardCap);

    progressDisplay += (target * 100 - progressDisplay) * 0.15;
    if (target >= 1 && progressDisplay > 98) progressDisplay = 100;

    setLoaderProgress(progressDisplay);

    if (progressDisplay >= 100) {
      clearInterval(noiseTimer);
      clearInterval(tickTimer);
      setLoaderProgress(100);
      setTimeout(function () {
        loaderEl.classList.add('hidden');
        siteEl.classList.add('visible');
        onDone();
      }, 250);
    }
  }, 40);
}

/* ---------------- Three.js Gallery ---------------- */
var canvas = document.getElementById('scene-canvas');
var COLS = window.innerWidth < 640 ? 3 : 8;
var total = GALLERY_IMAGES.length;
var ROWS = Math.ceil(total / COLS);

var PLANE_W = 2.3;
var PLANE_H = 3.05;
var SPACING_X = PLANE_W * 1.03;
var SPACING_Y = PLANE_H * 1.03;
var HERO_COL = Math.floor(COLS / 2);
var HERO_SCALE = 1.65;
var HERO_Z_PUSH = 1.6;

function seededFrac(i) {
  var seed = Math.sin(i * 12.9898) * 43758.5453;
  return seed - Math.floor(seed);
}

var scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 11);

var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

var group = new THREE.Group();
scene.add(group);

var manager = new THREE.LoadingManager();
manager.onProgress = function (url, loaded, itemsTotal) {
  loadProgress = loaded / itemsTotal;
};
manager.onLoad = function () {
  loadProgress = 1;
};
var loader = new THREE.TextureLoader(manager);

var meshes = [];

GALLERY_IMAGES.forEach(function (data, i) {
  var col = i % COLS;
  var row = Math.floor(i / COLS);

  var geometry = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
  var material = new THREE.MeshBasicMaterial({ color: 0xe5e5e5 });
  var mesh = new THREE.Mesh(geometry, material);

  var centerCol = (COLS - 1) / 2;
  var colOffset = col - centerCol;

  var x = colOffset * SPACING_X;
  var y = -row * SPACING_Y + SPACING_Y * 1.4;
  var z = -Math.abs(colOffset) * 0.7;

  var tiltRad = THREE.MathUtils.degToRad((seededFrac(i) - 0.5) * 20); // -10..10 deg
  var rotY = colOffset * -0.2;

  mesh.position.set(x, y, z);
  mesh.rotation.set(0, rotY, tiltRad);

  mesh.userData = {
    index: i,
    col: col,
    baseX: x,
    baseY: y,
    baseZ: z,
    baseRotY: rotY,
    baseTilt: tiltRad
  };
  group.add(mesh);
  meshes.push(mesh);

  loader.load(data.thumb, function (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    var img = texture.image;
    var imageAspect = img.width / img.height;
    var planeAspect = PLANE_W / PLANE_H;
    if (imageAspect > planeAspect) {
      texture.repeat.set(planeAspect / imageAspect, 1);
      texture.offset.set((1 - texture.repeat.x) / 2, 0);
    } else {
      texture.repeat.set(1, imageAspect / planeAspect);
      texture.offset.set(0, (1 - texture.repeat.y) / 2);
    }
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
});

var ROW0_Y = SPACING_Y * 1.4;
var LAST_ROW_Y = -(ROWS - 1) * SPACING_Y + ROW0_Y;

/* ---------------- Interaction ---------------- */
var mouseNDC = new THREE.Vector2(0, 0);
var targetRotX = 0;
var targetRotY = 0;
var scrollY = 0;
var scrollTarget = 0;
var minScroll = -SPACING_Y * 0.5;
var maxScroll = Math.max(0, -LAST_ROW_Y + SPACING_Y * 0.6);
var SCROLL_SENS = 0.025;

var pointerDown = false;
var dragging = false;
var startX = 0;
var startY = 0;
var startScroll = 0;
var startTime = 0;

function onPointerMove(e) {
  var nx = (e.clientX / window.innerWidth) * 2 - 1;
  var ny = (e.clientY / window.innerHeight) * 2 - 1;
  mouseNDC.set(nx, ny);
  targetRotY = nx * 0.12;
  targetRotX = -ny * 0.06;

  if (pointerDown) {
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragging = true;
    scrollTarget = clamp(startScroll - dy * SCROLL_SENS, minScroll, maxScroll);
  }
}

function onPointerDown(e) {
  pointerDown = true;
  dragging = false;
  startX = e.clientX;
  startY = e.clientY;
  startScroll = scrollTarget;
  startTime = performance.now();
}

function onPointerUp(e) {
  pointerDown = false;
  var elapsed = performance.now() - startTime;
  if (!dragging && elapsed < 500) {
    handleClick(e.clientX, e.clientY);
  }
}

function onWheel(e) {
  scrollTarget = clamp(scrollTarget + e.deltaY * SCROLL_SENS, minScroll, maxScroll);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

var raycaster = new THREE.Raycaster();

function handleClick(clientX, clientY) {
  var nx = (clientX / window.innerWidth) * 2 - 1;
  var ny = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  var hits = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    openDetail(hits[0].object.userData.index);
  }
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('wheel', onWheel, { passive: true });

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- Detail Panel ---------------- */
var detailEl = document.getElementById('detail');
var detailCategory = document.getElementById('detailCategory');
var detailTitle = document.getElementById('detailTitle');
var detailDescription = document.getElementById('detailDescription');
var detailFile = document.getElementById('detailFile');

function openDetail(index) {
  var data = GALLERY_IMAGES[index];
  detailCategory.textContent = data.category || '';
  detailTitle.textContent = data.title || '';
  detailDescription.textContent = data.description || '';
  detailFile.textContent = data.file || '';
  detailEl.classList.add('open');
}

function closeDetail() {
  detailEl.classList.remove('open');
}

document.getElementById('detailClose').addEventListener('click', closeDetail);
document.getElementById('detailCloseBtn').addEventListener('click', closeDetail);
document.querySelector('.detail-scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeDetail();
});

/* ---------------- Render Loop ---------------- */
function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function animate() {
  requestAnimationFrame(animate);

  scrollY += (scrollTarget - scrollY) * 0.08;
  group.position.y = scrollY;

  group.rotation.y += (targetRotY - group.rotation.y) * 0.06;
  group.rotation.x += (targetRotX - group.rotation.x) * 0.06;

  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    var d = mesh.userData;
    if (d.col !== HERO_COL) continue;

    var worldY = d.baseY + scrollY;
    var focus = smoothstep(1 - Math.abs(worldY) / (SPACING_Y * 0.75));

    var scale = 1 + (HERO_SCALE - 1) * focus;
    mesh.scale.setScalar(scale);
    mesh.rotation.y = d.baseRotY * (1 - focus);
    mesh.rotation.z = d.baseTilt * (1 - focus);
    mesh.position.z = d.baseZ + HERO_Z_PUSH * focus;
  }

  renderer.render(scene, camera);
}
animate();

/* ---------------- Boot ---------------- */
document.getElementById('year').textContent = new Date().getFullYear();
runLoader(function () {});
