import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import {
  uniform,
  positionLocal,
  positionWorld,
  normalLocal,
  vec3,
  mul,
  sub,
  div,
  add,
  smoothstep,
  clamp,
} from 'three/tsl';
import { bsplineGradient, calcWaveOffset } from './shaderUtils.js';
import { GlowPlane } from './GlowPlane.js';

// Create capsule geometry with height segments for smooth deformation
function createCapsuleGeometry(radius, length, capSegments, radialSegments, heightSegments) {
  const halfLength = length / 2;

  const topSphere = new THREE.SphereGeometry(radius, radialSegments, capSegments, 0, Math.PI * 2, 0, Math.PI / 2);
  topSphere.translate(0, halfLength, 0);

  const bottomSphere = new THREE.SphereGeometry(radius, radialSegments, capSegments, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bottomSphere.translate(0, -halfLength, 0);

  const cylinder = new THREE.CylinderGeometry(radius, radius, length, radialSegments, heightSegments, true);

  return BufferGeometryUtils.mergeGeometries([topSphere, cylinder, bottomSphere]);
}

export class Pill {
  constructor(radius, length, colors, stops = [0.1, 0.35, 0.65, 0.9]) {
    this.radius = radius;
    this.length = length;

    this.geometry = createCapsuleGeometry(radius, length, 16, 24, 32);
    this.geometry.computeBoundingBox();

    this.uniforms = {
      color1: uniform(new THREE.Color(colors[0])),
      color2: uniform(new THREE.Color(colors[1])),
      color3: uniform(new THREE.Color(colors[2])),
      color4: uniform(new THREE.Color(colors[3])),
      stop1: uniform(stops[0]),
      stop2: uniform(stops[1]),
      stop3: uniform(stops[2]),
      stop4: uniform(stops[3]),
      boundsMin: uniform(this.geometry.boundingBox.min.y),
      boundsMax: uniform(this.geometry.boundingBox.max.y),
      pillRadius: uniform(radius),
      bend: uniform(0.3),
      baseColor: uniform(1.0),
      edgeGlow: uniform(1.0),
      edgeWidth: uniform(0.6),
      waveAmp: uniform(0),
      waveFreq: uniform(0.8),
      wavePhase: uniform(0),
      waveRotation: uniform(0),
    };

    this.material = new MeshBasicNodeMaterial();
    const u = this.uniforms;

    const yNorm = div(sub(positionLocal.y, u.boundsMin), sub(u.boundsMax, u.boundsMin));

    // Wave deformation
    const curveX = calcWaveOffset(positionWorld, u.waveRotation, u.waveFreq, u.wavePhase, u.waveAmp);
    const deformedPosition = vec3(
      add(positionLocal.x, curveX),
      positionLocal.y,
      positionLocal.z
    );
    this.material.positionNode = deformedPosition;

    const edgeFactor = sub(1, normalLocal.z);
    const tRaw = add(yNorm, mul(edgeFactor, u.bend));
    const t = clamp(tRaw, 0, 1);

    const gradientColor = bsplineGradient(
      t,
      vec3(u.color1), vec3(u.color2), vec3(u.color3), vec3(u.color4),
      u.stop1, u.stop2, u.stop3, u.stop4
    );
    this.material.colorNode = mul(gradientColor, u.baseColor);

    const edgeFalloff = smoothstep(u.edgeWidth, 0.0, normalLocal.z);
    this.material.emissiveNode = mul(gradientColor, mul(edgeFalloff, u.edgeGlow));

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.userData.uniforms = this.uniforms;

    // Create associated glow plane
    this.glowPlane = new GlowPlane(this);
  }

  setPosition(x, y, z = 0) {
    this.mesh.position.set(x, y, z);
    this.glowPlane.mesh.position.set(x, y, z);
    return this;
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.glowPlane.mesh);
    return this;
  }

  dispose() {
    // Remove from parent
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this.glowPlane.mesh.parent) this.glowPlane.mesh.parent.remove(this.glowPlane.mesh);

    // Dispose geometry and materials
    this.geometry.dispose();
    this.material.dispose();
    this.glowPlane.geometry.dispose();
    this.glowPlane.material.dispose();
  }
}
