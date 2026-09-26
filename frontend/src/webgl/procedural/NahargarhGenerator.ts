import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Nahargarh Fort & Padao Sunset Ridge.
 * Features the ridge-top cliff, Madhavendra Bhawan royal suites, bastions,
 * and illuminated Jaipur city grid vista below.
 */
export function buildNahargarh(): THREE.Group {
  const group = new THREE.Group();
  group.name = "NahargarhMonument";
  const mats = createMaterialPalette();

  // 1. Cliff Ridge Terrain
  const cliffGeo = new THREE.ConeGeometry(36, 16, 12);
  const cliff = new THREE.Mesh(cliffGeo, mats.courtyardStone);
  cliff.scale.set(1.5, 0.6, 1.2);
  cliff.position.set(0, -3, -4);
  cliff.receiveShadow = true;
  group.add(cliff);

  // 2. Madhavendra Bhawan (Royal Palace Block)
  const palaceGeo = new THREE.BoxGeometry(28, 4.5, 16);
  const palace = new THREE.Mesh(palaceGeo, mats.goldenSandstone);
  palace.position.set(0, 4, -2);
  palace.castShadow = true;
  palace.receiveShadow = true;
  group.add(palace);

  // 9 Royal Queen Suite Domes on Roof
  for (let rx = -10; rx <= 10; rx += 10) {
    for (let rz = -6; rz <= 6; rz += 6) {
      const suiteDome = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mats.darkPinkSandstone
      );
      suiteDome.position.set(rx, 6.5, rz - 2);
      suiteDome.castShadow = true;
      group.add(suiteDome);

      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6), mats.royalGold);
      finial.position.set(rx, 8.2, rz - 2);
      group.add(finial);
    }
  }

  // 3. Padao Sunset Viewpoint Terrace
  const terraceGeo = new THREE.BoxGeometry(18, 1.2, 10);
  const terrace = new THREE.Mesh(terraceGeo, mats.darkPinkSandstone);
  terrace.position.set(-6, 2.8, 10);
  terrace.castShadow = true;
  group.add(terrace);

  // Decorative Safety Balustrades
  const balustradeGeo = new THREE.BoxGeometry(18, 0.8, 0.2);
  const balustrade = new THREE.Mesh(balustradeGeo, mats.makranaMarble);
  balustrade.position.set(-6, 3.8, 14.9);
  group.add(balustrade);

  // 4. Jaipur City Grid Floor with Twinkling Street Grid Lights
  const cityFloorGeo = new THREE.PlaneGeometry(60, 40, 20, 20);
  const cityFloorMat = new THREE.MeshBasicMaterial({ color: 0x090814 });
  const cityFloor = new THREE.Mesh(cityFloorGeo, cityFloorMat);
  cityFloor.rotation.x = -Math.PI / 2;
  cityFloor.position.set(0, -6, 20);
  group.add(cityFloor);

  // City Grid Golden Glowing Dots (Jaipur Plan)
  for (let gx = -24; gx <= 24; gx += 4) {
    for (let gz = 4; gz <= 36; gz += 4) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
      );
      dot.position.set(gx + (Math.random() - 0.5) * 1.5, -5.9, gz + (Math.random() - 0.5) * 1.5);
      group.add(dot);
    }
  }

  return group;
}
