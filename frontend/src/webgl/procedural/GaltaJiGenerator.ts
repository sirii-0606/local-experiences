import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Galta Ji (Monkey Temple & Sacred Kund).
 * Features the mountain gorge canyon walls, natural spring water tanks,
 * temple pavilions with frescoes, and evening aarti brass lamps.
 */
export function buildGaltaJi(): THREE.Group {
  const group = new THREE.Group();
  group.name = "GaltaJiMonument";
  const mats = createMaterialPalette();

  // 1. Mountain Gorge Pass (Two Steep Rock Cliffs)
  [-16, 16].forEach((cx) => {
    const canyonGeo = new THREE.ConeGeometry(24, 20, 8);
    const canyon = new THREE.Mesh(canyonGeo, mats.courtyardStone);
    canyon.scale.set(0.8, 1, 1.6);
    canyon.position.set(cx, 6, 0);
    canyon.receiveShadow = true;
    group.add(canyon);
  });

  // Canyon Valley Floor
  const valleyFloorGeo = new THREE.BoxGeometry(26, 1.2, 36);
  const valleyFloor = new THREE.Mesh(valleyFloorGeo, mats.pinkSandstone);
  valleyFloor.position.set(0, 0.6, 0);
  valleyFloor.receiveShadow = true;
  group.add(valleyFloor);

  // 2. Multi-Level Sacred Spring Tanks (Galta Kund)
  const kundGeo = new THREE.BoxGeometry(12, 1.5, 14);
  const kund = new THREE.Mesh(kundGeo, mats.darkPinkSandstone);
  kund.position.set(0, 0.8, -2);
  group.add(kund);

  // Sacred Spring Water Plane
  const waterGeo = new THREE.PlaneGeometry(10.5, 12.5);
  const water = new THREE.Mesh(waterGeo, mats.sacredWater);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.5, -2);
  group.add(water);

  // 3. Main Temple Pavilion (Surya Mandir Pavilion)
  const templeGroup = new THREE.Group();
  templeGroup.position.set(0, 1.5, -12);

  // Temple Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 8), mats.goldenSandstone);
  base.position.set(0, 1.1, 0);
  templeGroup.add(base);

  // Temple Shikhara (Spire)
  const spireGeo = new THREE.ConeGeometry(3.2, 9, 8);
  const spire = new THREE.Mesh(spireGeo, mats.pinkSandstone);
  spire.position.set(0, 7.2, 0);
  spire.castShadow = true;
  templeGroup.add(spire);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 8), mats.royalGold);
  finial.position.set(0, 12.4, 0);
  templeGroup.add(finial);

  // Temple Front Pillared Mandapa
  for (let px = -3.6; px <= 3.6; px += 2.4) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 3.8, 8), mats.makranaMarble);
    pillar.position.set(px, 3.5, 4.5);
    templeGroup.add(pillar);
  }
  group.add(templeGroup);

  // 4. Evening Aarti Brass Lamps & Diya Glows
  const diyaPositions = [
    [-4, 1.8, 4],
    [4, 1.8, 4],
    [-2, 1.8, 8],
    [2, 1.8, 8],
    [0, 1.8, 10],
  ];
  diyaPositions.forEach(([dx, dy, dz]) => {
    const diya = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 8), mats.royalGold);
    diya.position.set(dx, dy, dz);
    group.add(diya);

    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    flame.position.set(dx, dy + 0.2, dz);
    group.add(flame);

    const diyaLight = new THREE.PointLight(0xff9900, 1.5, 8);
    diyaLight.position.set(dx, dy + 0.3, dz);
    group.add(diyaLight);
  });

  return group;
}
