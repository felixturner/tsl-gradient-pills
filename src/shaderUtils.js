import {
  vec3,
  mul,
  sub,
  div,
  add,
  clamp,
  sin,
  cos,
  Fn,
  select,
  fract,
  dot,
} from 'three/tsl';

// B-spline basis function for 4 control points
export const bsplineBasis = Fn(([t, p0, p1, p2, p3]) => {
  const t2 = mul(t, t);
  const t3 = mul(t2, t);
  const w0 = div(add(sub(add(mul(t3, -1), mul(t2, 3)), mul(t, 3)), 1), 6);
  const w1 = div(add(sub(mul(t3, 3), mul(t2, 6)), 4), 6);
  const w2 = div(add(add(add(mul(t3, -3), mul(t2, 3)), mul(t, 3)), 1), 6);
  const w3 = div(t3, 6);
  const r = add(add(add(mul(w0, p0.x), mul(w1, p1.x)), mul(w2, p2.x)), mul(w3, p3.x));
  const g = add(add(add(mul(w0, p0.y), mul(w1, p1.y)), mul(w2, p2.y)), mul(w3, p3.y));
  const b = add(add(add(mul(w0, p0.z), mul(w1, p1.z)), mul(w2, p2.z)), mul(w3, p3.z));
  return vec3(r, g, b);
});

// B-spline gradient with positions
export const bsplineGradient = Fn(([t, c1, c2, c3, c4, s1, s2, s3, s4]) => {
  const tClamped = clamp(t, s1, s4);
  const localT1 = div(sub(tClamped, s1), sub(s2, s1));
  const seg1 = bsplineBasis(localT1, c1, c1, c2, c3);
  const localT2 = div(sub(tClamped, s2), sub(s3, s2));
  const seg2 = bsplineBasis(localT2, c1, c2, c3, c4);
  const localT3 = div(sub(tClamped, s3), sub(s4, s3));
  const seg3 = bsplineBasis(localT3, c2, c3, c4, c4);
  return select(tClamped.lessThan(s2), seg1, select(tClamped.lessThan(s3), seg2, seg3));
});

// Simple hash function for dithering noise
export const hash = Fn(([p]) => {
  const k = vec3(0.3183099, 0.3678794, 0.2831923);
  const scaled = mul(p, k);
  return fract(mul(sin(dot(scaled, vec3(12.9898, 78.233, 45.164))), 43758.5453));
});

// Calculate wave deformation offset
export const calcWaveOffset = Fn(([posWorld, waveRotation, waveFreq, wavePhase, waveAmp]) => {
  const cosR = cos(waveRotation);
  const sinR = sin(waveRotation);
  const alongPill = sub(mul(posWorld.y, cosR), mul(posWorld.x, sinR));
  const phase = add(mul(alongPill, waveFreq), wavePhase);
  return mul(sin(phase), waveAmp);
});
