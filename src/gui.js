import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

export function createGUI({
  switchScene,
  pillGroup,
  pills,
  postFX,
  startAnimation,
  stopAnimation,
  orbitControls,
  sceneOrder,
  updateSceneCounter,
  renderer,
  camera,
}) {
  const gui = new GUI({ container: document.getElementById('gui-container') });

  // State
  let selectedPillIndex = 0;
  let savedEdgeGlow = 1.0;
  const controllers = {};

  // Scene presets (rotation in degrees, 0-360)
  const scenePresets = {
    mono: {
      rotation: 0,
      glowFalloff: 1.5,
      edgeGlow: 1.0,
      waveAmp: 0,
      glowIntensity: 0.5,
    },
    grid: {
      rotation: 19,
      glowFalloff: 5,
      edgeGlow: 1.5,
      waveAmp: 0,
      glowIntensity: 0.3,
    },
    duo: {
      rotation: 331,
      glowFalloff: 1.5,
      edgeGlow: 1.0,
      waveAmp: 0,
      glowIntensity: 0.5,
    },
    waves: {
      rotation: 90,
      glowFalloff: 3,
      edgeGlow: 1.0,
      waveAmp: 0.9,
      glowIntensity: 0.3,
    },
  };
  const params = {
    selected: 0,
    color1: '#000000',
    color2: '#000000',
    color3: '#000000',
    color4: '#000000',
    stop1: 0.1,
    stop2: 0.35,
    stop3: 0.65,
    stop4: 0.9,
    bend: 0.3,
  };

  // Helper functions
  function getSelectedPill() {
    return pills()[selectedPillIndex];
  }

  function updateGUIFromPill(index) {
    const pill = pills()[index];
    if (!pill) return;
    const u = pill.uniforms;
    params.selected = index;
    params.color1 = '#' + u.color1.value.getHexString();
    params.color2 = '#' + u.color2.value.getHexString();
    params.color3 = '#' + u.color3.value.getHexString();
    params.color4 = '#' + u.color4.value.getHexString();
    params.stop1 = u.stop1.value;
    params.stop2 = u.stop2.value;
    params.stop3 = u.stop3.value;
    params.stop4 = u.stop4.value;
    params.bend = u.bend.value;
    Object.values(controllers).forEach((c) => c.updateDisplay());
  }

  // Scene selector
  const sceneParams = { scene: sceneOrder[0] };
  const sceneController = gui
    .add(sceneParams, 'scene', sceneOrder)
    .name('scene');

  // Rotation control (0-360 degrees)
  const ROTATION_Z = pillGroup.rotation.z;
  const rotationParams = { rotation: (ROTATION_Z / (Math.PI * 2)) * 360 };
  gui
    .add(rotationParams, 'rotation', 0, 360, 1)
    .name('rotation')
    .listen()
    .onChange((v) => {
      const angle = (v / 360) * Math.PI * 2;
      pillGroup.rotation.z = angle;
      pills().forEach((pill) => (pill.uniforms.waveRotation.value = angle));
    });

  // Render settings
  const renderParams = { wireframe: false };

  // Animation pause
  const animParams = { paused: false };
  gui
    .add(animParams, 'paused')
    .name('pause animation')
    .onChange((v) => {
      if (v) stopAnimation();
      else startAnimation();
    });

  // Orbit controls
  const orbitParams = { enabled: false };
  gui
    .add(orbitParams, 'enabled')
    .name('orbit controls')
    .onChange((v) => {
      orbitControls.enabled = v;
    });

  // Debug view
  const viewMap = { final: 0, mask: 1, edges: 2, color: 3, glow: 4 };
  const debugParams = { view: 'final' };
  gui
    .add(debugParams, 'view', ['final', 'mask', 'edges', 'color', 'glow'])
    .name('debug view')
    .onChange((v) => {
      postFX.debugViewUniform.value = viewMap[v];
    });

  // Wireframe
  gui
    .add(renderParams, 'wireframe')
    .name('wireframe')
    .onChange((v) => {
      pills().forEach((pill) => (pill.material.wireframe = v));
    });

  // Sensor noise
  const noiseParams = { noise: 0.04 };
  gui
    .add(noiseParams, 'noise', 0, 0.1)
    .name('sensor noise')
    .onChange((v) => {
      postFX.noiseStrength.value = v;
    });

  // Screenshot
  const screenshotParams = {
    save: () => {
      const canvas = renderer.domElement;
      const link = document.createElement('a');
      link.download = `gradient-pills-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  };
  gui.add(screenshotParams, 'save').name('save screenshot');

  // Edges folder
  const edgesFolder = gui.addFolder('Edges');
  edgesFolder.close();
  const colorParams = { edgeGlow: 1.0, edgeWidth: 0.5 };
  const edgesParams = {
    visible: true,
    strength: 1.5,
    radius: 0.5,
  };

  // Visible toggle at top
  edgesFolder
    .add(edgesParams, 'visible')
    .name('visible')
    .onChange((v) => {
      postFX.edgesVisible.value = v ? 1 : 0;
    });

  // Edge glow and width
  edgesFolder
    .add(colorParams, 'edgeGlow', 0, 5)
    .name('edge glow')
    .listen()
    .onChange((v) => {
      savedEdgeGlow = v;
    });
  edgesFolder
    .add(colorParams, 'edgeWidth', 0.1, 1.0)
    .name('edge width')
    .onChange((v) => {
      pills().forEach((pill) => (pill.uniforms.edgeWidth.value = v));
    });

  // Edges bloom controls
  edgesFolder
    .add(edgesParams, 'strength', 0, 3)
    .name('bloom strength')
    .onChange((v) => (postFX.edgesPass.strength.value = v));
  edgesFolder
    .add(edgesParams, 'radius', 0, 1)
    .name('bloom radius')
    .onChange((v) => (postFX.edgesPass.radius.value = v));

  // Glow folder
  const glowFolder = gui.addFolder('Glow');
  glowFolder.close();
  const glowParams = { intensity: 0.5, falloff: 1.5, visible: true };
  glowFolder
    .add(glowParams, 'visible')
    .name('visible')
    .onChange((v) => {
      postFX.glowVisible.value = v ? 1 : 0;
    });
  glowFolder
    .add(glowParams, 'intensity', 0, 2)
    .name('intensity')
    .listen()
    .onChange((v) => {
      pills().forEach(
        (pill) => (pill.glowPlane.uniforms.glowIntensity.value = v)
      );
    });
  glowFolder
    .add(glowParams, 'falloff', 0.5, 5)
    .name('falloff')
    .listen()
    .onChange((v) => {
      pills().forEach(
        (pill) => (pill.glowPlane.uniforms.glowFalloff.value = v)
      );
    });

  // Wave folder
  const waveFolder = gui.addFolder('Wave');
  waveFolder.close();
  const waveParams = { amp: 0, freq: 0.8, phase: 0 };
  waveFolder
    .add(waveParams, 'amp', 0, 1)
    .name('amplitude')
    .listen()
    .onChange((v) => {
      pills().forEach((pill) => (pill.uniforms.waveAmp.value = v));
    });
  waveFolder
    .add(waveParams, 'freq', 0, 2)
    .name('frequency')
    .onChange((v) => {
      pills().forEach((pill) => (pill.uniforms.waveFreq.value = v));
    });
  waveFolder
    .add(waveParams, 'phase', 0, Math.PI * 2)
    .name('phase')
    .onChange((v) => {
      pills().forEach((pill) => (pill.uniforms.wavePhase.value = v));
    });

  // Pill Colors folder
  const pillFolder = gui.addFolder('Pill Colors');
  pillFolder.close();
  controllers.selected = pillFolder
    .add(params, 'selected', 0, 1, 1)
    .name('pill #')
    .onChange((v) => {
      selectedPillIndex = v;
      updateGUIFromPill(v);
    });

  controllers.color1 = pillFolder
    .addColor(params, 'color1')
    .onChange((v) => getSelectedPill().uniforms.color1.value.set(v));
  controllers.color2 = pillFolder
    .addColor(params, 'color2')
    .onChange((v) => getSelectedPill().uniforms.color2.value.set(v));
  controllers.color3 = pillFolder
    .addColor(params, 'color3')
    .onChange((v) => getSelectedPill().uniforms.color3.value.set(v));
  controllers.color4 = pillFolder
    .addColor(params, 'color4')
    .onChange((v) => getSelectedPill().uniforms.color4.value.set(v));
  controllers.stop1 = pillFolder
    .add(params, 'stop1', 0, 1)
    .onChange((v) => (getSelectedPill().uniforms.stop1.value = v));
  controllers.stop2 = pillFolder
    .add(params, 'stop2', 0, 1)
    .onChange((v) => (getSelectedPill().uniforms.stop2.value = v));
  controllers.stop3 = pillFolder
    .add(params, 'stop3', 0, 1)
    .onChange((v) => (getSelectedPill().uniforms.stop3.value = v));
  controllers.stop4 = pillFolder
    .add(params, 'stop4', 0, 1)
    .onChange((v) => (getSelectedPill().uniforms.stop4.value = v));
  controllers.bend = pillFolder
    .add(params, 'bend', -1, 1)
    .onChange((v) => (getSelectedPill().uniforms.bend.value = v));

  // Export button
  const exportParams = {
    export: () => {
      const palettesOut = [];
      const stopsOut = [];
      const bendsOut = [];
      pills().forEach((pill) => {
        const u = pill.uniforms;
        palettesOut.push([
          '#' + u.color1.value.getHexString(),
          '#' + u.color2.value.getHexString(),
          '#' + u.color3.value.getHexString(),
          '#' + u.color4.value.getHexString(),
        ]);
        stopsOut.push([
          u.stop1.value,
          u.stop2.value,
          u.stop3.value,
          u.stop4.value,
        ]);
        bendsOut.push(u.bend.value);
      });
      const output = `// Palettes (one per pill)
const palettes = ${JSON.stringify(palettesOut, null, 2)};

// Stops (one per pill)
const stops = ${JSON.stringify(stopsOut, null, 2)};

// Bends (one per pill)
const bends = ${JSON.stringify(bendsOut)};`;
      console.log(output);
      navigator.clipboard.writeText(output).then(() => {
        console.log('Copied to clipboard!');
      });
    },
  };
  pillFolder.add(exportParams, 'export').name('Export to Console');

  // Public methods
  function updatePillSelectorMax() {
    controllers.selected.max(pills().length - 1);
    controllers.selected.updateDisplay();
  }

  function selectPill(index) {
    selectedPillIndex = index;
    updateGUIFromPill(index);
  }

  // Pill selection via raycasting (click on pill to edit its colors in the GUI)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onCanvasClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = pills().map((p) => p.mesh);
    const intersects = raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      const index = meshes.indexOf(clickedMesh);
      if (index !== -1) {
        selectPill(index);
      }
    }
  }
  renderer.domElement.addEventListener('click', onCanvasClick);

  function getSavedEdgeGlow() {
    return savedEdgeGlow;
  }

  function applySceneSettings(sceneName) {
    const preset = scenePresets[sceneName];
    if (!preset) return;

    // Apply rotation (0-360 degrees)
    rotationParams.rotation = preset.rotation;
    const angle = (preset.rotation / 360) * Math.PI * 2;
    pillGroup.rotation.z = angle;
    pills().forEach((pill) => (pill.uniforms.waveRotation.value = angle));

    // Apply glow falloff
    glowParams.falloff = preset.glowFalloff;
    pills().forEach(
      (pill) => (pill.glowPlane.uniforms.glowFalloff.value = preset.glowFalloff)
    );

    // Apply edge glow
    colorParams.edgeGlow = preset.edgeGlow;
    savedEdgeGlow = preset.edgeGlow;

    // Apply wave amplitude
    waveParams.amp = preset.waveAmp;
    pills().forEach((pill) => (pill.uniforms.waveAmp.value = preset.waveAmp));

    // Apply glow intensity
    glowParams.intensity = preset.glowIntensity;
    pills().forEach(
      (pill) => (pill.glowPlane.uniforms.glowIntensity.value = preset.glowIntensity)
    );

    // Update GUI displays
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  // Set up scene selector onChange (after applySceneSettings is defined)
  sceneController.onChange((v) => {
    switchScene(v);
    applySceneSettings(v);
    updatePillSelectorMax();
    selectPill(0);
    updateSceneCounter(sceneOrder.indexOf(v));
    // Start animation if not paused
    if (!animParams.paused) {
      startAnimation();
    }
  });

  function setScene(sceneName) {
    sceneParams.scene = sceneName;
    sceneController.updateDisplay();
  }

  // Apply all GUI defaults to effects (GUI is source of truth)
  function applyDefaults() {
    // PostFX defaults
    postFX.noiseStrength.value = noiseParams.noise;
    postFX.edgesVisible.value = edgesParams.visible ? 1 : 0;
    postFX.edgesPass.strength.value = edgesParams.strength;
    postFX.edgesPass.radius.value = edgesParams.radius;
    postFX.glowVisible.value = glowParams.visible ? 1 : 0;
  }

  // Apply defaults on init
  applyDefaults();

  return {
    updatePillSelectorMax,
    selectPill,
    getSavedEdgeGlow,
    getSelectedPillIndex: () => selectedPillIndex,
    applySceneSettings,
    setScene,
  };
}
