import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Panna Meena Ka Kund (Amer Stepwell).
 * Features 8 tiers of symmetrical zigzag criss-crossing stairs, subterranean
 * water reservoir, four corner pavilions (chhatris), and mossy sandstone patina.
 */
export function buildStepwell(): THREE.Group {
  const group = new THREE.Group();
  group.name = "PannaMeenaStepwellMonument";
  const mats = createMaterialPalette();

  // 1. Ground Plaza Perimeter Surround
  const plazaGeo = new THREE.BoxGeometry(38, 2, 38);
  const plaza = new THREE.Mesh(plazaGeo, mats.goldenSandstone);
  plaza.position.set(0, 0, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  // 2. Central Inverted Stepped Pyramid Void (8 Tiers)
  const numTiers = 7;
  const topSize = 24;
  const stepHeight = 0.9;

  for (let t = 0; t < numTiers; t++) {
    const tierSize = topSize - t * 2.6;
    const tierY = -t * stepHeight;

    // Four wall sections of this tier
    const wallThickness = 1.3;
    const wallGeo = new THREE.BoxGeometry(tierSize, stepHeight, wallThickness);

    // North wall
    const nw = new THREE.Mesh(wallGeo, mats.darkPinkSandstone);
    nw.position.set(0, tierY - stepHeight / 2, -tierSize / 2 + wallThickness / 2);
    nw.castShadow = true;
    group.add(nw);

    // South wall
    const sw = new THREE.Mesh(wallGeo, mats.darkPinkSandstone);
    sw.position.set(0, tierY - stepHeight / 2, tierSize / 2 - wallThickness / 2);
    sw.castShadow = true;
    group.add(sw);

    // East wall
    const ew = new THREE.Mesh(wallGeo, mats.darkPinkSandstone);
    ew.rotation.y = Math.PI / 2;
    ew.position.set(tierSize / 2 - wallThickness / 2, tierY - stepHeight / 2, 0);
    ew.castShadow = true;
    group.add(ew);

    // West wall
    const ww = new THREE.Mesh(wallGeo, mats.darkPinkSandstone);
    ww.rotation.y = Math.PI / 2;
    ww.position.set(-tierSize / 2 + wallThickness / 2, tierY - stepHeight / 2, 0);
    ww.castShadow = true;
    group.add(ww);

    // Zigzag Triangular Steps on each side
    const stepsCount = 6;
    const stepSpan = tierSize / stepsCount;
    for (let s = 0; s < stepsCount; s++) {
      const sx = -tierSize / 2 + (s + 0.5) * stepSpan;
      const stepMesh = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.75, 4), mats.goldenSandstone);
      stepMesh.rotation.y = Math.PI / 4;
      stepMesh.position.set(sx, tierY - 0.2, -tierSize / 2 + 1.2);
      stepMesh.castShadow = true;
      group.add(stepMesh);
    }
  }

  // 3. Subterranean Water Reservoir
  const waterGeo = new THREE.BoxGeometry(10, 0.4, 10);
  const water = new THREE.Mesh(waterGeo, mats.sacredWater);
  water.position.set(0, -numTiers * stepHeight + 0.2, 0);
  group.add(water);

  // 4. Four Corner Pavilions (Chhatris)
  const cornerPositions = [
    [-13, 1, -13],
    [13, 1, -13],
    [-13, 1, 13],
    [13, 1, 13],
  ];
  cornerPositions.forEach(([cx, cy, cz]) => {
    const chhatri = buildCornerChhatri(mats);
    chhatri.position.set(cx, cy, cz);
    group.add(chhatri);
  });

  return group;
}

function buildCornerChhatri(mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const ch = new THREE.Group();

  // Plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 4.2), mats.darkPinkSandstone);
  plinth.position.set(0, 0.25, 0);
  ch.add(plinth);

  // 4 Pillars
  const offsets = [-1.4, 1.4];
  offsets.forEach((px) => {
    offsets.forEach((pz) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8), mats.makranaMarble);
      pillar.position.set(px, 1.6, pz);
      pillar.castShadow = true;
      ch.add(pillar);
    });
  });

  // Dome & Finial
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.pinkSandstone);
  dome.scale.set(1, 1.15, 1);
  dome.position.set(0, 2.9, 0);
  dome.castShadow = true;
  ch.add(dome);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 6), mats.royalGold);
  finial.position.set(0, 4.8, 0);
  ch.add(finial);

  return ch;
}
