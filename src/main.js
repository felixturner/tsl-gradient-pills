import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import gsap from 'gsap';
import { PostFX } from './PostFX.js';
import {
  buildMonoScene,
  buildDuoScene,
  buildGridScene,
  buildTubesScene,
  createMonoAnimation,
  createDuoAnimation,
  createGridAnimation,
  createTubesAnimation,
} from './scenes.js';
import { createGUI } from './gui.js';

// Main scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Parent group for responsive scaling (doesn't interfere with animations)
const sceneGroup = new THREE.Group();
scene.add(sceneGroup);

// Group for rotation (child of sceneGroup)
const pillGroup = new THREE.Group();
sceneGroup.add(pillGroup);

// Rotate pills to match reference (diagonal layout)
const ROTATION_Z = -0.5; // ~28 degrees
pillGroup.rotation.z = ROTATION_Z;

// Camera (Orthographic)
const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 5.5;
const camera = new THREE.OrthographicCamera(
  (frustumSize * aspect) / -2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000
);
camera.position.set(0, 0, 10);

// Renderer (1.5x supersampling for smoother edges)
let supersample = 1.5;
const renderer = new WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Stats (hidden by default)
const stats = new Stats();
stats.dom.style.display = 'none';
document.body.appendChild(stats.dom);

// Post-processing
const postFX = new PostFX(renderer, scene, camera, supersample);

// Frame rate limiting
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;
let lastFrameTime = 0;

function loop(currentTime) {
  requestAnimationFrame(loop);
  const delta = currentTime - lastFrameTime;
  if (delta >= frameInterval) {
    lastFrameTime = currentTime - (delta % frameInterval);
    animate();
  }
}

// Helper to update loading text
function setLoadingText(text) {
  const loading = document.getElementById('loading');
  console.log(text);
  if (loading) {
    loading.textContent = text;
  }
}

// Wait for WebGPU to initialize before building scenes and starting render loop
setLoadingText('Initializing WebGPU...');
renderer
  .init()
  .then(() => {
    initApp();
    console.log('Starting render loop');
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    console.error('WebGPU initialization failed:', err);
    setLoadingText(
      'WebGPU not supported.\nPlease use Chrome 113+, Edge 113+, Safari 18+, or Firefox with WebGPU enabled.'
    );
  });

// Controls (disabled by default)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

// Scene state - store all scenes
const scenes = {};
let currentSceneName = null;

// Helper to get all glow planes from current scene
function getGlowPlanes() {
  if (!currentSceneName || !scenes[currentSceneName]) return [];
  return scenes[currentSceneName].pills.map((pill) => pill.glowPlane);
}

// Get current scene's pills
function getCurrentPills() {
  if (!currentSceneName || !scenes[currentSceneName]) return [];
  return scenes[currentSceneName].pills;
}

// Animation state
let currentAnimation = null;
let gui = null;

// Animation control
function startAnimation() {
  if (currentAnimation) {
    currentAnimation.play();
  }
}

function stopAnimation() {
  if (currentAnimation) {
    currentAnimation.pause();
  }
}

// Fade in from black
function fadeIn() {
  gsap.fromTo(
    postFX.opacity,
    { value: 0 },
    { value: 1, duration: 2, ease: 'none' }
  );
}

// Build a single scene and store it
function buildScene(sceneName) {
  // Create container group for this scene
  const container = new THREE.Group();
  pillGroup.add(container);

  let result;
  if (sceneName === 'mono') {
    result = buildMonoScene(container);
  } else if (sceneName === 'duo') {
    result = buildDuoScene(container);
  } else if (sceneName === 'tubes') {
    result = buildTubesScene(container);
  } else {
    result = buildGridScene(container);
  }

  // Set wave rotation on all pills
  result.pills.forEach(
    (pill) => (pill.uniforms.waveRotation.value = pillGroup.rotation.z)
  );

  // Create animation (paused)
  let animation;
  if (sceneName === 'mono') {
    animation = createMonoAnimation();
  } else if (sceneName === 'duo') {
    animation = createDuoAnimation(result.pills, container);
  } else if (sceneName === 'tubes') {
    animation = createTubesAnimation(result.pills, container);
  } else {
    animation = createGridAnimation(
      result.columnGroups,
      result.pills,
      container
    );
  }
  animation.pause();

  // Hide container initially
  container.visible = false;

  scenes[sceneName] = {
    container,
    pills: result.pills,
    columnGroups: result.columnGroups,
    animation,
  };
}

// Build all scenes on init (forces shader compilation)
function buildAllScenes() {
  buildScene('mono');
  buildScene('duo');
  buildScene('grid');
  buildScene('tubes');

  // Make all scenes visible briefly to force shader compilation
  Object.values(scenes).forEach((s) => (s.container.visible = true));
}

// Switch to a scene (toggle visibility)
function switchScene(sceneName) {
  // Hide all scenes and pause animations
  Object.values(scenes).forEach((s) => {
    s.container.visible = false;
    if (s.animation) {
      s.animation.pause();
    }
  });

  // Show new scene
  currentSceneName = sceneName;
  const sceneData = scenes[sceneName];
  sceneData.container.visible = true;

  // Restart animation from beginning
  currentAnimation = sceneData.animation;
  currentAnimation.restart();

  // Fade in from black
  fadeIn();
}

// Resize
function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Responsive scaling: scale down scene for narrow viewports
  // aspect >= 1: scale = 1, aspect 0.5-1: lerp from 0.6-1, aspect < 0.5: scale = 0.6
  let responsiveScale = 1;
  if (aspect < 1) {
    const t = Math.max(0, (aspect - 0.5) / 0.5); // 0 at aspect=0.5, 1 at aspect=1
    responsiveScale = 0.6 + t * 0.4; // lerp from 0.6 to 1
  }
  sceneGroup.scale.setScalar(responsiveScale);

  postFX.resize(supersample);
}
window.addEventListener('resize', resize);
resize(); // Call on init

function animate() {
  stats.update();
  controls.update();
  postFX.render(
    getCurrentPills(),
    gui ? gui.getSavedEdgeGlow() : 1.0,
    getGlowPlanes()
  );
}

// Scene navigation
const sceneOrder = ['duo', 'grid', 'tubes', 'mono'];

function getSceneIndex() {
  return sceneOrder.indexOf(currentSceneName);
}

function updateSceneCounter(index) {
  const counter = document.getElementById('scene-counter');
  if (counter) {
    counter.textContent = `${index + 1}/${sceneOrder.length}`;
  }
}

function goToScene(index) {
  const sceneName = sceneOrder[index];
  switchScene(sceneName);
  gui.applySceneSettings(sceneName);
  gui.updatePillSelectorMax();
  gui.selectPill(0);
  gui.setScene(sceneName);
  updateSceneCounter(index);
}

function prevScene() {
  const currentIndex = getSceneIndex();
  const newIndex = (currentIndex - 1 + sceneOrder.length) % sceneOrder.length;
  goToScene(newIndex);
}

function nextScene() {
  const currentIndex = getSceneIndex();
  const newIndex = (currentIndex + 1) % sceneOrder.length;
  goToScene(newIndex);
}

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    prevScene();
  } else if (e.key === 'ArrowRight') {
    nextScene();
  }
});

// Swipe gesture navigation
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;

window.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});

window.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  // Only trigger if horizontal swipe is dominant
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
    if (deltaX < 0) {
      nextScene();
    } else {
      prevScene();
    }
  }
});

// Toggle GUI and stats visibility
let controlsVisible = false;
function toggleControls() {
  controlsVisible = !controlsVisible;
  stats.dom.style.display = controlsVisible ? 'block' : 'none';
  const guiContainer = document.getElementById('gui-container');
  if (guiContainer) {
    guiContainer.style.display = controlsVisible ? 'block' : 'none';
  }
}

// Footer navigation buttons
document.getElementById('prev-scene')?.addEventListener('click', prevScene);
document.getElementById('next-scene')?.addEventListener('click', nextScene);
document
  .getElementById('show-controls')
  ?.addEventListener('click', toggleControls);

// GUI
gui = createGUI({
  switchScene,
  pillGroup,
  pills: () => getCurrentPills(),
  postFX,
  resize,
  startAnimation,
  stopAnimation,
  getSupersample: () => supersample,
  setSupersample: (v) => {
    supersample = v;
  },
  scenes,
  orbitControls: controls,
  sceneOrder,
  updateSceneCounter,
  renderer,
  camera,
});

// Initialize app after WebGPU is ready
function initApp() {
  // Set opacity to 0 before any rendering
  postFX.opacity.value = 0;

  // Build all scenes upfront
  buildAllScenes();

  // Collect all pills and glow planes from all scenes for shader compilation
  const allPills = Object.values(scenes).flatMap((s) => s.pills);
  const allGlowPlanes = allPills.map((p) => p.glowPlane);

  // Render one frame with all scenes visible to compile shaders
  postFX.render(allPills, 1.0, allGlowPlanes);

  // Hide all scenes after shader compilation (before render loop shows them)
  Object.values(scenes).forEach((s) => (s.container.visible = false));

  // Fade out loading screen after shaders compiled
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('fade-out');
  }

  // Wait for fade to complete before switching to first scene
  setTimeout(() => {
    // Switch to default scene and start animation
    switchScene('duo');
    gui.applySceneSettings('duo');
    updateSceneCounter(0);
    startAnimation();

    // Hide loading screen completely
    if (loading) {
      loading.style.display = 'none';
    }
  }, 300);
}
