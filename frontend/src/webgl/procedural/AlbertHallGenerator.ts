import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Albert Hall Museum.
 * Features Indo-Saracenic central bulbous domes, side octagonal towers,
 * arched arcades with marble inlays, and night illumination floodlights.
 */
export function buildAlbertHall(): THREE.Group {
  const group = new THREE.Group();
  group.name = "AlbertHallMonument";
  const mats = createMaterialPalette();

  // 1. Plinth Platform with Steps
  const plinthGeo = new THREE.BoxGeometry(36, 1.8, 22);
  const plinth = new THREE.Mesh(plinthGeo, mats.darkPinkSandstone);
  plinth.position.set(0, 0.9, 0);
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Central Main Hall Block
  const centralHallGeo = new THREE.BoxGeometry(16, 7.5, 14);
  const centralHall = new THREE.Mesh(centralHallGeo, mats.goldenSandstone);
  centralHall.position.set(0, 5.5, 0);
  centralHall.castShadow = true;
  centralHall.receiveShadow = true;
  group.add(centralHall);

  // Grand Indo-Saracenic Central Dome
  const domeBaseGeo = new THREE.CylinderGeometry(4.5, 4.8, 2.2, 16);
  const domeBase = new THREE.Mesh(domeBaseGeo, mats.makranaMarble);
  domeBase.position.set(0, 10.2, 0);
  group.add(domeBase);

  const mainDomeGeo = new THREE.SphereGeometry(4.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const mainDome = new THREE.Mesh(mainDomeGeo, mats.makranaMarble);
  mainDome.scale.set(1, 1.25, 1);
  mainDome.position.set(0, 11.2, 0);
  mainDome.castShadow = true;
  group.add(mainDome);

  const goldenFinial = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 8), mats.royalGold);
  goldenFinial.position.set(0, 17.5, 0);
  group.add(goldenFinial);

  // 3. Flanking Side Wings with Arcaded Porches
  [-12, 12].forEach((wx) => {
    const wingGeo = new THREE.BoxGeometry(9, 5.5, 12);
    const wing = new THREE.Mesh(wingGeo, mats.pinkSandstone);
    wing.position.set(wx, 4.5, 0);
    wing.castShadow = true;
    group.add(wing);

    // Octagonal Corner Towers
    const towerGeo = new THREE.CylinderGeometry(1.6, 1.8, 8.5, 8);
    const tower = new THREE.Mesh(towerGeo, mats.goldenSandstone);
    tower.position.set(wx > 0 ? wx + 3.8 : wx - 3.8, 6, 5);
    tower.castShadow = true;
    group.add(tower);

    // Tower Chhatri
    const towerDome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.makranaMarble);
    towerDome.position.set(wx > 0 ? wx + 3.8 : wx - 3.8, 10.5, 5);
    group.add(towerDome);
  });

  // 4. Arched Arcades across front facade
  for (let ax = -7; ax <= 7; ax += 2.8) {
    const archGeo = new THREE.TorusGeometry(1.1, 0.15, 6, 12, Math.PI);
    const arch = new THREE.Mesh(archGeo, mats.makranaMarble);
    arch.rotation.z = Math.PI;
    arch.position.set(ax, 3.8, 7.1);
    group.add(arch);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.8, 8), mats.darkPinkSandstone);
    pillar.position.set(ax, 2.2, 7.1);
    group.add(pillar);
  }

  // 5. Dynamic Night Floodlight Illuminators
  const floodlights = [
    [-14, 0.5, 12, 0xffaa44],
    [0, 0.5, 14, 0xffd166],
    [14, 0.5, 12, 0x4cc9f0],
  ];
  floodlights.forEach(([fx, fy, fz, color]) => {
    const spot = new THREE.SpotLight(color, 2.5, 25, Math.PI / 4, 0.5);
    spot.position.set(fx, fy, fz);
    spot.target.position.set(fx * 0.4, 8, 0);
    group.add(spot);
    group.add(spot.target);
  });

  return group;
}
