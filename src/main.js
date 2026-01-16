import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import gsap from 'gsap';
import { PostFX } from './PostFX.js';
import { buildAllScenes, sceneOrder } from './scenes.js';
import { createGUI } from './gui.js';

// Main scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Parent group for responsive scaling (doesn't interfere with animations)
const sceneGroup = new THREE.Group();
sceneGroup.scale.setScalar(1.2);
scene.add(sceneGroup);

// Group for rotation (child of sceneGroup)
const pillGroup = new THREE.Group();
sceneGroup.add(pillGroup);

// Camera (Orthographic)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.set(0, 0, 10);

// Renderer - size set by resize()
let supersample = 1.5;
const renderer = new WebGPURenderer({ antialias: true });
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

// Wait for WebGPU to initialize before building scenes and starting render loop
renderer
  .init()
  .then(() => {
    initApp();
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    console.error('WebGPU initialization failed:', err);
    document.getElementById('loading').textContent =
      'WebGPU not supported.\nPlease use Chrome 113+, Edge 113+, Safari 18+, or Firefox with WebGPU enabled.';
  });

// Controls (disabled by default)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

// Scene state
let scenes = {};
let currentSceneName = null;
let currentAnimation = null;
let gui = null;

// Getters
function getCurrentPills() {
  if (!currentSceneName || !scenes[currentSceneName]) return [];
  return scenes[currentSceneName].pills;
}

function getGlowPlanes() {
  if (!currentSceneName || !scenes[currentSceneName]) return [];
  return scenes[currentSceneName].pills.map((pill) => pill.glowPlane);
}

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
    { value: 1, duration: 1, ease: 'none' }
  );
}

// Switch to a scene
function switchScene(sceneName) {
  Object.values(scenes).forEach((s) => {
    s.container.visible = false;
    if (s.animation) {
      s.animation.pause();
    }
  });

  currentSceneName = sceneName;
  const sceneData = scenes[sceneName];
  sceneData.container.visible = true;

  currentAnimation = sceneData.animation;
  currentAnimation.restart();

  fadeIn();
}

// Core resize logic (called immediately)
// Hardcoded canvas size for recording mode
const CANVAS_WIDTH = 1924;
const CANVAS_HEIGHT = 1084;

function doResize() {
  const frustumSize = 5.5;
  const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
  renderer.setPixelRatio(1);

  // Responsive scaling disabled for recording mode (keep fixed 1.2 scale)

  postFX.resize(supersample);
}

// Debounced resize for window resize events
let resizeTimeout;
function resize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(doResize, 50);
}
window.addEventListener('resize', resize);

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
function getSceneIndex(sceneName) {
  return sceneOrder.indexOf(sceneName);
}

function updateSceneCounter(index) {
  const counter = document.getElementById('scene-counter');
  if (counter) {
    counter.textContent = `${index + 1}/${sceneOrder.length}`;
  }
}

function goToScene(index) {
  const sceneName = sceneOrder[index];
  currentSceneName = sceneName;
  switchScene(sceneName);
  gui.applySceneSettings(sceneName);
  gui.updatePillSelectorMax();
  gui.selectPill(0);
  gui.setScene(sceneName);
  updateSceneCounter(index);
}

function prevScene() {
  const currentIndex = getSceneIndex(currentSceneName);
  const newIndex = (currentIndex - 1 + sceneOrder.length) % sceneOrder.length;
  goToScene(newIndex);
}

function nextScene() {
  const currentIndex = getSceneIndex(currentSceneName);
  const newIndex = (currentIndex + 1) % sceneOrder.length;
  goToScene(newIndex);
}

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') {
    prevScene();
  } else if (e.key === 'ArrowRight') {
    nextScene();
  } else if (e.key === 'q' || e.key === 'Q') {
    toggleControls();
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

  if (
    Math.abs(deltaX) > Math.abs(deltaY) &&
    Math.abs(deltaX) > SWIPE_THRESHOLD
  ) {
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
  pills: getCurrentPills,
  postFX,
  resize,
  startAnimation,
  stopAnimation,
  getSupersample: () => supersample,
  setSupersample: (v) => {
    supersample = v;
  },
  orbitControls: controls,
  sceneOrder,
  updateSceneCounter,
  renderer,
  camera,
});

// Initialize app after WebGPU is ready
function initApp() {
  // Start with black screen (opacity 0) - fadeIn will animate to 1
  postFX.opacity.value = 0;

  // Resize immediately before rendering (don't wait for debounce)
  doResize();

  // Build all scenes upfront (containers start visible for shader compilation)
  scenes = buildAllScenes(pillGroup);

  // Collect all pills and glow planes for shader compilation
  const allPills = Object.values(scenes).flatMap((s) => s.pills);
  const allGlowPlanes = allPills.map((p) => p.glowPlane);

  // Render one frame with all scenes visible to compile shaders
  // (opacity is 0 so user sees black)
  postFX.render(allPills, 1.0, allGlowPlanes);

  // Hide all scenes after shader compilation
  Object.values(scenes).forEach((s) => (s.container.visible = false));

  // Hide loading screen
  document.getElementById('loading').style.display = 'none';

  // Wait for fade to complete before switching to first scene
  setTimeout(() => {
    // Hide footer for recording mode
    const footer = document.querySelector('.footer');
    if (footer) {
      footer.style.display = 'none';
    }

    // Recording mode: play scenes 1, 2, 3 in sequence
    const recordingScenes = ['duo', 'grid', 'tubes'];
    const sceneDurations = [7300, 9000, 10000]; // ms per scene
    let sceneIndex = 0;

    function playNextScene() {
      if (sceneIndex >= recordingScenes.length) {
        // Loop back to start
        sceneIndex = 0;
      }

      const sceneName = recordingScenes[sceneIndex];
      console.log(`Playing scene: ${sceneName}`);
      switchScene(sceneName);
      gui.applySceneSettings(sceneName);
      gui.updatePillSelectorMax();
      gui.selectPill(0);
      gui.setScene(sceneName);
      updateSceneCounter(sceneIndex);
      startAnimation();

      // Fade to black after 8s on tubes scene (1s fade, ends at 9s, scene is 10s)
      if (sceneName === 'tubes') {
        setTimeout(() => {
          gsap.to(postFX.opacity, { value: 0, duration: 1, ease: 'power2.in' });
        }, 8000);
      }

      // Schedule next scene
      setTimeout(() => {
        sceneIndex++;
        playNextScene();
      }, sceneDurations[sceneIndex]);
    }

    playNextScene();
  }, 300);
}
