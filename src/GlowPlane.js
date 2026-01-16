import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  uniform,
  positionLocal,
  positionWorld,
  vec3,
  mul,
  sub,
  div,
  add,
  clamp,
  abs,
  max,
  float,
  sqrt,
  pow,
} from 'three/tsl';
import { bsplineGradient, hash, calcWaveOffset } from './shaderUtils.js';

export class GlowPlane {
  constructor(pill) {
    this.pill = pill;
    const { radius, length } = pill;
    const u = pill.uniforms;

    // Pill dimensions
    const pillWidth = radius * 2;
    const pillHeight = length + radius * 2;
    const halfLength = length / 2;

    // Glow plane extends beyond pill
    const glowExtent = Math.max(pillWidth, pillHeight);
    const width = pillWidth + glowExtent * 2;
    const height = pillHeight + glowExtent * 2;

    this.geometry = new THREE.PlaneGeometry(width, height, 1, 32);

    // Glow-specific uniforms
    this.uniforms = {
      glowIntensity: uniform(0.5),
      glowFalloff: uniform(1.5),
      glowExtent: uniform(glowExtent),
      ditherStrength: uniform(0.02),
    };

    this.material = new MeshBasicNodeMaterial();
    this.material.transparent = true;
    this.material.blending = THREE.AdditiveBlending;
    this.material.depthWrite = false;

    // Wave deformation (same as pill)
    const curveX = calcWaveOffset(positionWorld, u.waveRotation, u.waveFreq, u.wavePhase, u.waveAmp);
    const deformedPosition = vec3(
      add(positionLocal.x, curveX),
      positionLocal.y,
      positionLocal.z
    );
    this.material.positionNode = deformedPosition;

    // SDF calculation in pill space
    const pillSpaceX = sub(positionLocal.x, curveX);
    const clampedY = clamp(positionLocal.y, float(-halfLength), float(halfLength));
    const dx = abs(pillSpaceX);
    const dy = abs(sub(positionLocal.y, clampedY));
    const distFromAxis = sqrt(add(mul(dx, dx), mul(dy, dy)));
    const distFromPill = max(sub(distFromAxis, float(radius)), float(0));

    // Falloff
    const falloffT = clamp(div(distFromPill, this.uniforms.glowExtent), float(0), float(1));
    const falloffLinear = sub(float(1), falloffT);
    const falloff = pow(falloffLinear, this.uniforms.glowFalloff);

    // Gradient (at edge, edgeFactor = 1)
    const pillHalfHeight = pillHeight / 2;
    const yNorm = div(add(positionLocal.y, float(pillHalfHeight)), float(pillHeight));
    const tBent = add(yNorm, u.bend);
    const t = clamp(tBent, float(0), float(1));

    const gradientColor = bsplineGradient(
      t,
      vec3(u.color1), vec3(u.color2), vec3(u.color3), vec3(u.color4),
      u.stop1, u.stop2, u.stop3, u.stop4
    );

    // Final color with falloff and dithering
    const glowColor = mul(gradientColor, mul(falloff, this.uniforms.glowIntensity));
    const noiseVal = hash(positionLocal);
    const dither = mul(sub(noiseVal, float(0.5)), this.uniforms.ditherStrength);
    this.material.colorNode = add(glowColor, dither);

    // Opacity
    const baseOpacity = mul(falloff, this.uniforms.glowIntensity);
    this.material.opacityNode = add(baseOpacity, mul(dither, float(0.5)));

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.z = -0.1;
  }

  setPosition(x, y, z = -0.1) {
    this.mesh.position.set(x, y, z);
    return this;
  }

  addTo(parent) {
    parent.add(this.mesh);
    return this;
  }
}
