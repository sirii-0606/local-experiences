import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Amer Fort & Palace.
 * Features the hilltop ramparts, Diwan-e-Aam columns, Sheesh Mahal mirrored hall,
 * Maota Lake with Kesar Kyari saffron garden, and floating hot-air balloons.
 */
export function buildAmerFort(): THREE.Group {
  const group = new THREE.Group();
  group.name = "AmerFortMonument";
  const mats = createMaterialPalette();

  // 1. Hillside Mountain Ridge Terrain (Aravali Hills)
  const mountainGeo = new THREE.ConeGeometry(38, 12, 16);
  const mountainMesh = new THREE.Mesh(mountainGeo, mats.courtyardStone);
  mountainMesh.position.set(0, 0, -10);
  mountainMesh.scale.set(1.4, 0.8, 1.1);
  mountainMesh.receiveShadow = true;
  group.add(mountainMesh);

  // 2. Fort Multi-Level Rampart Terraces
  const lowerRampartGeo = new THREE.BoxGeometry(36, 4, 18);
  const lowerRampart = new THREE.Mesh(lowerRampartGeo, mats.goldenSandstone);
  lowerRampart.position.set(0, 3, 0);
  lowerRampart.castShadow = true;
  lowerRampart.receiveShadow = true;
  group.add(lowerRampart);

  const upperRampartGeo = new THREE.BoxGeometry(26, 4.5, 14);
  const upperRampart = new THREE.Mesh(upperRampartGeo, mats.goldenSandstone);
  upperRampart.position.set(0, 7.25, -2);
  upperRampart.castShadow = true;
  upperRampart.receiveShadow = true;
  group.add(upperRampart);

  // Perimeter Fort Watchtowers (Burj Bastions)
  const bastionPositions = [
    [-17, 4, 8],
    [17, 4, 8],
    [-12, 8.5, 5],
    [12, 8.5, 5],
    [-18, 4, -8],
    [18, 4, -8],
  ];
  bastionPositions.forEach(([bx, by, bz]) => {
    const towerGeo = new THREE.CylinderGeometry(1.8, 2.2, 5.5, 12);
    const tower = new THREE.Mesh(towerGeo, mats.goldenSandstone);
    tower.position.set(bx, by, bz);
    tower.castShadow = true;
    group.add(tower);

    // Domed Chhatri top
    const domeGeo = new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, mats.darkPinkSandstone);
    dome.position.set(bx, by + 3.2, bz);
    group.add(dome);

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), mats.royalGold);
    finial.position.set(bx, by + 4.8, bz);
    group.add(finial);
  });

  // 3. Diwan-e-Aam (Hall of Public Audience Pavilion)
  const diwanGroup = new THREE.Group();
  diwanGroup.position.set(6, 5.5, 2);

  // Diwan Plinth
  const plinthGeo = new THREE.BoxGeometry(10, 0.6, 8);
  const plinth = new THREE.Mesh(plinthGeo, mats.makranaMarble);
  diwanGroup.add(plinth);

  // 40 Pillars Grid (4 x 6 double row)
  for (let r = -2; r <= 2; r++) {
    for (let c = -3; c <= 3; c++) {
      const pillarGeo = new THREE.CylinderGeometry(0.14, 0.18, 3.2, 8);
      const pillar = new THREE.Mesh(pillarGeo, mats.darkPinkSandstone);
      pillar.position.set(c * 1.3, 1.9, r * 1.4);
      pillar.castShadow = true;
      diwanGroup.add(pillar);
    }
  }

  // Diwan Roof & Bangaldar Cornice
  const diwanRoofGeo = new THREE.BoxGeometry(10.8, 0.8, 8.8);
  const diwanRoof = new THREE.Mesh(diwanRoofGeo, mats.goldenSandstone);
  diwanRoof.position.set(0, 3.8, 0);
  diwanRoof.castShadow = true;
  diwanGroup.add(diwanRoof);
  group.add(diwanGroup);

  // 4. Sheesh Mahal (Hall of Mirrors Pavilion)
  const sheeshGroup = new THREE.Group();
  sheeshGroup.position.set(-6.5, 9.8, -1.5);

  const sheeshHallGeo = new THREE.BoxGeometry(8.5, 4.2, 7.5);
  const sheeshHall = new THREE.Mesh(sheeshHallGeo, mats.makranaMarble);
  sheeshHall.castShadow = true;
  sheeshGroup.add(sheeshHall);

  // Convex Mirror Facets & Golden Arches
  for (let a = -2; a <= 2; a++) {
    const archGeo = new THREE.TorusGeometry(0.6, 0.08, 6, 12, Math.PI);
    const arch = new THREE.Mesh(archGeo, mats.royalGold);
    arch.rotation.z = Math.PI;
    arch.position.set(a * 1.4, 0.2, 3.8);
    sheeshGroup.add(arch);

    // Mirror Glass Inlay
    const mirrorGeo = new THREE.CircleGeometry(0.45, 8);
    const mirror = new THREE.Mesh(mirrorGeo, mats.glassCobalt);
    mirror.position.set(a * 1.4, 0.2, 3.82);
    sheeshGroup.add(mirror);
  }
  group.add(sheeshGroup);

  // 5. Maota Lake with Kesar Kyari (Saffron Terraces)
  const lakeGeo = new THREE.PlaneGeometry(36, 14, 16, 16);
  const lake = new THREE.Mesh(lakeGeo, mats.sacredWater);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0.05, 14);
  group.add(lake);

  // Saffron Garden Island (Kesar Kyari)
  const islandGeo = new THREE.BoxGeometry(14, 0.3, 7);
  const island = new THREE.Mesh(islandGeo, mats.pinkSandstone);
  island.position.set(0, 0.2, 14);
  group.add(island);

  // Star-shaped geometric planter beds
  for (let gx = -4; gx <= 4; gx += 2.5) {
    const planterGeo = new THREE.BoxGeometry(1.6, 0.25, 1.6);
    const planter = new THREE.Mesh(planterGeo, mats.darkPinkSandstone);
    planter.rotation.y = Math.PI / 4;
    planter.position.set(gx, 0.45, 14);
    group.add(planter);
  }

  // 6. Sunrise Hot-Air Balloons Hovering in Sky
  const balloon1 = buildHotAirBalloon(mats, "#e76f51", "#2a9d8f");
  balloon1.position.set(-15, 16, 6);
  balloon1.scale.set(0.9, 0.9, 0.9);
  group.add(balloon1);

  const balloon2 = buildHotAirBalloon(mats, "#f4a261", "#e9c46a");
  balloon2.position.set(18, 22, -6);
  balloon2.scale.set(0.7, 0.7, 0.7);
  group.add(balloon2);

  return group;
}

/**
 * Builds a realistic 3D hot-air balloon with envelope, basket, and burner glow.
 */
function buildHotAirBalloon(
  mats: ReturnType<typeof createMaterialPalette>,
  stripeColor1: string,
  stripeColor2: string
): THREE.Group {
  const balloon = new THREE.Group();

  // Balloon Envelope (Tear-drop shaped)
  const envelopeGeo = new THREE.SphereGeometry(2.4, 16, 12);
  const envMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(stripeColor1),
    roughness: 0.5,
    metalness: 0.1,
  });
  const envelope = new THREE.Mesh(envelopeGeo, envMat);
  envelope.scale.set(1, 1.35, 1);
  balloon.add(envelope);

  // Wicker Basket
  const basketGeo = new THREE.BoxGeometry(0.8, 0.7, 0.8);
  const basket = new THREE.Mesh(basketGeo, mats.terracotta);
  basket.position.set(0, -4.2, 0);
  balloon.add(basket);

  // Rigging Ropes
  const ropePositions = [
    [-0.35, 0.35],
    [0.35, 0.35],
    [-0.35, -0.35],
    [0.35, -0.35],
  ];
  ropePositions.forEach(([rx, rz]) => {
    const ropeGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.8);
    const rope = new THREE.Mesh(ropeGeo, mats.darkPinkSandstone);
    rope.position.set(rx, -2.6, rz);
    balloon.add(rope);
  });

  // Burner Flame Point Light
  const flameLight = new THREE.PointLight(0xff7b00, 2.0, 15);
  flameLight.position.set(0, -3.2, 0);
  balloon.add(flameLight);

  return balloon;
}
