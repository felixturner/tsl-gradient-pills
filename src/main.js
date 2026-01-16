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

// Group for rotation
const pillGroup = new THREE.Group();
scene.add(pillGroup);

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

// Pill selection via raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onCanvasClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const meshes = getCurrentPills().map((p) => p.mesh);
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    const index = meshes.indexOf(clickedMesh);
    if (index !== -1) {
      gui.selectPill(index);
    }
  }
}
renderer.domElement.addEventListener('click', onCanvasClick);

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
  } else if (e.key === 'q' || e.key === 'Q') {
    toggleControls();
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
    // Hide footer for recording mode
    const footer = document.querySelector('.footer');
    if (footer) {
      footer.style.display = 'none';
    }

    // Recording mode: play scenes 1, 2, 3 in sequence
    const recordingScenes = ['duo', 'grid', 'tubes'];
    const sceneDurations = [7300, 9200, 15000]; // ms per scene
    let sceneIndex = 0;

    function playNextScene() {
      if (sceneIndex >= recordingScenes.length) {
        console.log('Recording sequence complete');
        return;
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

      // Fade to black after 12s on tubes scene
      if (sceneName === 'tubes') {
        setTimeout(() => {
          gsap.to(postFX.opacity, { value: 0, duration: 2, ease: 'power2.in' });
        }, 12000);
      }

      // Schedule next scene
      setTimeout(() => {
        sceneIndex++;
        playNextScene();
      }, sceneDurations[sceneIndex]);
    }

    playNextScene();

    // Hide loading screen completely
    if (loading) {
      loading.style.display = 'none';
    }
  }, 300);
}
