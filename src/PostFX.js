import * as THREE from 'three';
import { PostProcessing, MeshBasicNodeMaterial } from 'three/webgpu';
import { pass, float, sub, uniform, select, texture, mul, screenUV, vec3, sin, fract, add } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

// Max texture size for large displays
const MAX_TEXTURE_SIZE = 4096;

// Calculate render target size with DPR and max size cap
function getTargetSize() {
  const dpr = Math.min(window.devicePixelRatio, 2);
  return {
    w: Math.min(window.innerWidth * dpr, MAX_TEXTURE_SIZE),
    h: Math.min(window.innerHeight * dpr, MAX_TEXTURE_SIZE),
  };
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // White material for mask pass
    this.whiteMaterial = new MeshBasicNodeMaterial();
    this.whiteMaterial.colorNode = float(1.0);

    // Render targets (sized by resize())
    const { w, h } = getTargetSize();
    this.colorTarget = new THREE.RenderTarget(w, h);
    this.maskTarget = new THREE.RenderTarget(w, h);
    this.glowTarget = new THREE.RenderTarget(w, h);

    // Texture nodes
    const colorTexture = texture(this.colorTarget.texture);
    const maskTexture = texture(this.maskTarget.texture);
    const glowTexture = texture(this.glowTarget.texture);

    // Post-processing pipeline
    this.postProcessing = new PostProcessing(renderer);
    this.scenePass = pass(scene, camera);
    const scenePassColor = this.scenePass.getTextureNode('output');

    // Extract emissive by subtracting clean color from full render
    const emissiveOnly = scenePassColor.sub(colorTexture);

    // Edges (bloom effect on pill edges)
    this.edgesPass = bloom(emissiveOnly);
    this.edgesPass.threshold.value = 0.0;
    this.edgesPass.strength.value = 1.5;
    this.edgesPass.radius.value = 0.5;

    // Debug view uniform (0=final, 1=mask, 2=edges, 3=color, 4=glow)
    this.debugViewUniform = uniform(0);

    // Sensor noise uniform
    this.noiseStrength = uniform(0.1);

    // Visibility toggles
    this.glowVisible = uniform(1);
    this.edgesVisible = uniform(1);

    // Scene opacity for fade transitions
    this.opacity = uniform(1);

    // Final composite: clean color where pills are, bloom + glow on background only
    const invertedMask = sub(float(1.0), maskTexture.r);
    const maskedGlow = glowTexture.mul(invertedMask).mul(this.glowVisible);
    const maskedEdges = this.edgesPass.mul(invertedMask).mul(this.edgesVisible);
    const finalComposite = colorTexture
      .mul(maskTexture.r)
      .add(maskedEdges)
      .add(maskedGlow);

    // Static RGB sensor noise using sin/fract hash
    const seed1 = add(mul(screenUV.x, float(12.9898)), mul(screenUV.y, float(78.233)));
    const seed2 = add(mul(screenUV.x, float(93.9898)), mul(screenUV.y, float(67.345)));
    const seed3 = add(mul(screenUV.x, float(43.332)), mul(screenUV.y, float(93.532)));
    const noiseR = fract(mul(sin(seed1), float(43758.5453)));
    const noiseG = fract(mul(sin(seed2), float(43758.5453)));
    const noiseB = fract(mul(sin(seed3), float(43758.5453)));
    const noise = vec3(noiseR, noiseG, noiseB);
    const noiseOffset = mul(sub(noise, float(0.5)), this.noiseStrength);
    const finalWithNoise = finalComposite.add(noiseOffset);
    // Fade from black to scene
    const fadeColor = vec3(0, 0, 0);
    const finalOutput = finalWithNoise.mul(this.opacity).add(fadeColor.mul(sub(float(1), this.opacity)));

    // Select output based on debug view
    const debugOutput = select(
      this.debugViewUniform.lessThan(0.5),
      finalOutput,
      select(
        this.debugViewUniform.lessThan(1.5),
        maskTexture,
        select(
          this.debugViewUniform.lessThan(2.5),
          this.edgesPass,
          select(this.debugViewUniform.lessThan(3.5), colorTexture, glowTexture)
        )
      )
    );

    this.postProcessing.outputNode = debugOutput;
  }

  resize() {
    const { w, h } = getTargetSize();
    this.colorTarget.setSize(w, h);
    this.maskTarget.setSize(w, h);
    this.glowTarget.setSize(w, h);

    // Resize the scenePass internal render target (must match other targets)
    this.scenePass.setSize(w, h);
  }

  render(pills, savedEdgeGlow, glowPlanes = []) {
    const { renderer, scene, camera, colorTarget, maskTarget, glowTarget, whiteMaterial, postProcessing } = this;

    // Hide glow planes for all main renders (they'll be composited separately)
    glowPlanes.forEach((glow) => (glow.mesh.visible = false));

    // Render color pass with edgeGlow=0
    pills.forEach((pill) => (pill.uniforms.edgeGlow.value = 0));
    renderer.setRenderTarget(colorTarget);
    renderer.render(scene, camera);

    // Render mask pass (pills only with white override)
    scene.overrideMaterial = whiteMaterial;
    renderer.setRenderTarget(maskTarget);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;

    // Restore edgeGlow for scenePass (used in bloom extraction)
    pills.forEach((pill) => (pill.uniforms.edgeGlow.value = savedEdgeGlow));

    // Render glow planes to separate target (pills hidden)
    pills.forEach((pill) => (pill.mesh.visible = false));
    glowPlanes.forEach((glow) => (glow.mesh.visible = true));
    renderer.setRenderTarget(glowTarget);
    renderer.render(scene, camera);

    // Restore pills visibility
    pills.forEach((pill) => (pill.mesh.visible = true));
    // Hide glow planes again for scenePass render
    glowPlanes.forEach((glow) => (glow.mesh.visible = false));

    renderer.setRenderTarget(null);

    // Render post-processing (scenePass renders without glow planes)
    postProcessing.render();

    // Restore glow planes visibility
    glowPlanes.forEach((glow) => (glow.mesh.visible = true));
  }

  async renderAsync(pills, savedEdgeGlow, glowPlanes = []) {
    const { renderer, scene, camera, colorTarget, maskTarget, glowTarget, whiteMaterial, postProcessing } = this;

    // Hide glow planes for all main renders (they'll be composited separately)
    glowPlanes.forEach((glow) => (glow.mesh.visible = false));

    // Render color pass with edgeGlow=0
    pills.forEach((pill) => (pill.uniforms.edgeGlow.value = 0));
    renderer.setRenderTarget(colorTarget);
    await renderer.renderAsync(scene, camera);

    // Render mask pass (pills only with white override)
    scene.overrideMaterial = whiteMaterial;
    renderer.setRenderTarget(maskTarget);
    await renderer.renderAsync(scene, camera);
    scene.overrideMaterial = null;

    // Restore edgeGlow for scenePass (used in bloom extraction)
    pills.forEach((pill) => (pill.uniforms.edgeGlow.value = savedEdgeGlow));

    // Render glow planes to separate target (pills hidden)
    pills.forEach((pill) => (pill.mesh.visible = false));
    glowPlanes.forEach((glow) => (glow.mesh.visible = true));
    renderer.setRenderTarget(glowTarget);
    await renderer.renderAsync(scene, camera);

    // Restore pills visibility
    pills.forEach((pill) => (pill.mesh.visible = true));
    // Hide glow planes again for scenePass render
    glowPlanes.forEach((glow) => (glow.mesh.visible = false));

    renderer.setRenderTarget(null);

    // Render post-processing
    await postProcessing.renderAsync();

    // Restore glow planes visibility
    glowPlanes.forEach((glow) => (glow.mesh.visible = true));
  }
}
