import * as THREE from "three";
import type { TimeOfDay } from "../types";

export interface LightingEnvironment {
  skyColor: number;
  groundColor: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  ambientIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

export const TIME_CONFIGS: Record<TimeOfDay, LightingEnvironment> = {
  midday: {
    skyColor: 0x4ea8de, // Vibrant Jaipur blue daylight sky
    groundColor: 0xf4a261, // Warm terracotta sandstone ground bounce
    sunColor: 0xfffaed, // Pure warm sun
    sunIntensity: 3.4,
    sunPosition: [25, 55, 35], // High sun casting realistic sharp facade shadows
    ambientIntensity: 1.35,
    fogColor: 0x90e0ef,
    fogNear: 55,
    fogFar: 200,
  },
  "golden-hour": {
    skyColor: 0xf39a59,
    groundColor: 0xb84a39,
    sunColor: 0xffb703,
    sunIntensity: 3.2,
    sunPosition: [-40, 22, 35],
    ambientIntensity: 1.15,
    fogColor: 0xf8ad68,
    fogNear: 45,
    fogFar: 180,
  },
  dawn: {
    skyColor: 0xfbbf24,
    groundColor: 0x9381ff,
    sunColor: 0xffe8d6,
    sunIntensity: 2.8,
    sunPosition: [45, 18, 25],
    ambientIntensity: 1.0,
    fogColor: 0xfde2e4,
    fogNear: 40,
    fogFar: 160,
  },
  sunset: {
    skyColor: 0xd90429,
    groundColor: 0x2b2d42,
    sunColor: 0xf77f00,
    sunIntensity: 3.0,
    sunPosition: [-50, 12, 25],
    ambientIntensity: 0.95,
    fogColor: 0xe63946,
    fogNear: 35,
    fogFar: 150,
  },
  night: {
    skyColor: 0x0a0c1b,
    groundColor: 0x05060d,
    sunColor: 0x7209b7,
    sunIntensity: 0.8,
    sunPosition: [15, 35, -25],
    ambientIntensity: 0.45,
    fogColor: 0x0f1123,
    fogNear: 30,
    fogFar: 120,
  },
};

/**
 * Creates animated dust particles / floating golden motes.
 */
export function createDustParticleSystem(count = 800): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 1] = Math.random() * 30 + 1;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    scales[i] = Math.random() * 0.35 + 0.1;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("scale", new THREE.BufferAttribute(scales, 1));

  // Canvas circle texture for particles
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 240, 200, 0.9)");
    grad.addColorStop(0.5, "rgba(255, 200, 120, 0.35)");
    grad.addColorStop(1, "rgba(255, 180, 80, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const particleTexture = new THREE.CanvasTexture(canvas);

  const material = new THREE.PointsMaterial({
    size: 0.45,
    map: particleTexture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const particles = new THREE.Points(geometry, material);
  particles.name = "DustParticles";
  return particles;
}
