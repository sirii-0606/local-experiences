import * as THREE from "three";
import type { MonumentId } from "../types";
import { createMaterialPalette } from "../procedural/Materials";

/**
 * Creates rich, expansive grounded land, terrain, roads, trees, and
 * environmental surroundings for each Jaipur monument.
 */
export function createLandEnvironment(monumentId: MonumentId): THREE.Group {
  const group = new THREE.Group();
  group.name = "TerrainEnvironment";
  const mats = createMaterialPalette();

  switch (monumentId) {
    case "hawa-mahal":
      buildHawaMahalCityGround(group, mats);
      break;
    case "amer-fort":
      buildAmerFortMountainTerrain(group, mats);
      break;
    case "panna-meena-stepwell":
      buildStepwellVillageGround(group, mats);
      break;
    case "jantar-mantar":
      buildJantarMantarObservatoryGround(group, mats);
      break;
    case "albert-hall":
      buildAlbertHallGardenGround(group, mats);
      break;
    case "nahargarh-fort":
      buildNahargarhCliffTerrain(group, mats);
      break;
    case "galta-ji":
      buildGaltaJiCanyonTerrain(group, mats);
      break;
    default:
      buildHawaMahalCityGround(group, mats);
      break;
  }

  return group;
}

/**
 * 1. Hawa Mahal: Badi Chaupar Heritage Boulevard & Bazaar Street
 */
function buildHawaMahalCityGround(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Vast City Ground Base (Radius 250)
  const mainGroundGeo = new THREE.PlaneGeometry(300, 300, 16, 16);
  const mainGroundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c7a788"), // Warm Jaipur street sandstone
    roughness: 0.92,
    metalness: 0.02,
  });
  const mainGround = new THREE.Mesh(mainGroundGeo, mainGroundMat);
  mainGround.rotation.x = -Math.PI / 2;
  mainGround.position.set(0, 0, 0);
  mainGround.receiveShadow = true;
  group.add(mainGround);

  // Main Sireh Deori Bazaar Heritage Avenue (Wide Road in front of Hawa Mahal)
  const roadGeo = new THREE.PlaneGeometry(300, 24);
  const roadMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#8d7363"), // Darker paved stone avenue
    roughness: 0.88,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, 16);
  road.receiveShadow = true;
  group.add(road);

  // Sidewalk Curbs
  [-4, 28].forEach((cz) => {
    const curbGeo = new THREE.BoxGeometry(300, 0.3, 1.2);
    const curb = new THREE.Mesh(curbGeo, mats.makranaMarble);
    curb.position.set(0, 0.15, cz);
    curb.receiveShadow = true;
    group.add(curb);
  });

  // Flanking Heritage Bazaar Shop Canopies (Striped Awnings on Avenue)
  const shopPositions = [-35, -25, 25, 35];
  shopPositions.forEach((sx) => {
    const shopGroup = new THREE.Group();
    shopGroup.position.set(sx, 0, 20);

    // Shop Structure
    const shopWall = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 5), mats.pinkSandstone);
    shopWall.position.set(0, 1.75, 0);
    shopWall.castShadow = true;
    shopWall.receiveShadow = true;
    shopGroup.add(shopWall);

    // Striped Awning Canopy
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.2, 3),
      new THREE.MeshStandardMaterial({ color: sx > 0 ? 0xd90429 : 0xe09f3e, roughness: 0.6 })
    );
    awning.rotation.x = 0.25;
    awning.position.set(0, 3.2, 2.2);
    awning.castShadow = true;
    shopGroup.add(awning);

    group.add(shopGroup);
  });

  // Royal Palm Trees lining the plaza boulevard
  const treePositions = [
    [-22, 0, 8],
    [22, 0, 8],
    [-28, 0, 26],
    [28, 0, 26],
    [-42, 0, 14],
    [42, 0, 14],
  ];
  treePositions.forEach(([tx, ty, tz]) => {
    const palm = buildDesertPalmTree(mats);
    palm.position.set(tx, ty, tz);
    group.add(palm);
  });

  // Surrounding Pink City Perimeter Boundary Havelis
  const backdropWallGeo = new THREE.BoxGeometry(300, 8, 4);
  const backdropWall = new THREE.Mesh(backdropWallGeo, mats.darkPinkSandstone);
  backdropWall.position.set(0, 4, -22);
  backdropWall.castShadow = true;
  backdropWall.receiveShadow = true;
  group.add(backdropWall);
}

/**
 * 2. Amer Fort: Aravali Mountain Valley & Maota Lake Surroundings
 */
function buildAmerFortMountainTerrain(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Vast Valley Basin Ground
  const groundGeo = new THREE.PlaneGeometry(350, 350, 24, 24);
  const groundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#bfa175"), // Desert golden earth
    roughness: 0.95,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Surrounding Aravali Mountain Ranges (360 Horizon peaks)
  const mountainClusters = [
    [-70, 0, -40, 55, 30],
    [75, 0, -50, 60, 35],
    [-90, 0, 30, 50, 26],
    [90, 0, 40, 55, 28],
    [0, 0, -90, 80, 42],
  ];
  mountainClusters.forEach(([mx, my, mz, radius, height]) => {
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 10),
      new THREE.MeshStandardMaterial({ color: 0x9b7e5a, roughness: 0.95 })
    );
    mountain.position.set(mx, height / 2 - 2, mz);
    mountain.scale.set(1.4, 1, 1.2);
    mountain.receiveShadow = true;
    group.add(mountain);
  });

  // Winding Mountain Ridge Wall (Great Wall of Amer / Jaigarh link)
  for (let w = -4; w <= 4; w++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(14, 3.5, 2.2), mats.goldenSandstone);
    seg.position.set(w * 12 + (w % 2) * 2, 8 + Math.abs(w) * 1.5, -28 - Math.abs(w) * 4);
    seg.rotation.y = (w * 0.12);
    seg.castShadow = true;
    group.add(seg);
  }

  // Desert Trees & Shrubs in valley
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const dist = 32 + (i % 3) * 15;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    if (tz > 8 && tz < 20 && Math.abs(tx) < 22) continue; // Keep lake area clear
    const tree = buildAcaciaDesertTree();
    tree.position.set(tx, 0, tz);
    group.add(tree);
  }
}

/**
 * 3. Stepwell: Heritage Village Plaza & Courtyard Surroundings
 */
function buildStepwellVillageGround(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Vast Courtyard Stone Ground
  const groundGeo = new THREE.PlaneGeometry(280, 280);
  const ground = new THREE.Mesh(groundGeo, mats.courtyardStone);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Village Boundary Stone Walls
  [-30, 30].forEach((wz) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(90, 4.5, 2.5), mats.darkPinkSandstone);
    wall.position.set(0, 2.25, wz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  });

  [-35, 35].forEach((wx) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4.5, 60), mats.darkPinkSandstone);
    wall.position.set(wx, 2.25, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  });

  // Courtyard Banyan & Neem Shade Trees
  [
    [-24, 0, -22],
    [24, 0, -22],
    [-24, 0, 22],
    [24, 0, 22],
  ].forEach(([tx, ty, tz]) => {
    const tree = buildAcaciaDesertTree();
    tree.position.set(tx, ty, tz);
    tree.scale.set(1.4, 1.4, 1.4);
    group.add(tree);
  });
}

/**
 * 4. Jantar Mantar: Royal Observatory Lawns & Sandstone Walkways
 */
function buildJantarMantarObservatoryGround(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Main Grass Lawn Ground
  const lawnGeo = new THREE.PlaneGeometry(280, 280);
  const lawnMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#6b8e23"), // Manicured observatory green lawns
    roughness: 0.9,
  });
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0, 0);
  lawn.receiveShadow = true;
  group.add(lawn);

  // Criss-crossing Red Sandstone Paved Pathways
  const pathGeoX = new THREE.PlaneGeometry(280, 8);
  const pathX = new THREE.Mesh(pathGeoX, mats.darkPinkSandstone);
  pathX.rotation.x = -Math.PI / 2;
  pathX.position.set(0, 0.03, 0);
  pathX.receiveShadow = true;
  group.add(pathX);

  const pathGeoZ = new THREE.PlaneGeometry(8, 280);
  const pathZ = new THREE.Mesh(pathGeoZ, mats.darkPinkSandstone);
  pathZ.rotation.x = -Math.PI / 2;
  pathZ.position.set(0, 0.04, 0);
  pathZ.receiveShadow = true;
  group.add(pathZ);

  // Boundary Marble Balustrade
  const perimeterPoints = [
    [-32, 0, -28],
    [32, 0, -28],
    [-32, 0, 28],
    [32, 0, 28],
  ];
  perimeterPoints.forEach(([px, py, pz]) => {
    const palm = buildDesertPalmTree(mats);
    palm.position.set(px, py, pz);
    group.add(palm);
  });
}

/**
 * 5. Albert Hall: Ram Niwas Garden & Fountains
 */
function buildAlbertHallGardenGround(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Ram Niwas Garden Lawn
  const lawnGeo = new THREE.PlaneGeometry(300, 300);
  const lawn = new THREE.Mesh(
    lawnGeo,
    new THREE.MeshStandardMaterial({ color: 0x588157, roughness: 0.92 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0, 0);
  lawn.receiveShadow = true;
  group.add(lawn);

  // Circular Entrance Fountain Basin
  const fountainRing = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.5, 0.6, 24), mats.makranaMarble);
  fountainRing.position.set(0, 0.3, 24);
  group.add(fountainRing);

  const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24), mats.sacredWater);
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(0, 0.5, 24);
  group.add(fountainWater);

  // Symmetrical Rows of Palm Trees
  for (let p = -3; p <= 3; p++) {
    if (p === 0) continue;
    const palm1 = buildDesertPalmTree(mats);
    palm1.position.set(-28, 0, p * 12);
    group.add(palm1);

    const palm2 = buildDesertPalmTree(mats);
    palm2.position.set(28, 0, p * 12);
    group.add(palm2);
  }
}

/**
 * 6. Nahargarh Fort: Ridge Cliff Terrain & Horizon Vista
 */
function buildNahargarhCliffTerrain(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Cliff Mountain Plateau
  const plateauGeo = new THREE.PlaneGeometry(300, 300);
  const plateau = new THREE.Mesh(
    plateauGeo,
    new THREE.MeshStandardMaterial({ color: 0x938274, roughness: 0.95 })
  );
  plateau.rotation.x = -Math.PI / 2;
  plateau.position.set(0, 0, 0);
  plateau.receiveShadow = true;
  group.add(plateau);

  // Rocky Cliffs & Dropoffs
  for (let c = 0; c < 12; c++) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(4 + Math.random() * 3),
      new THREE.MeshStandardMaterial({ color: 0x786c5f, roughness: 0.9 })
    );
    rock.position.set((Math.random() - 0.5) * 60, -1, 18 + Math.random() * 14);
    group.add(rock);
  }
}

/**
 * 7. Galta Ji: Mountain Canyon Pass Gorge
 */
function buildGaltaJiCanyonTerrain(group: THREE.Group, mats: ReturnType<typeof createMaterialPalette>) {
  // Gorge Floor
  const floorGeo = new THREE.PlaneGeometry(280, 280);
  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: 0xb58a63, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Flanking Mountain Gorge Walls (Left and Right)
  for (let g = -4; g <= 4; g++) {
    const cliffLeft = new THREE.Mesh(
      new THREE.ConeGeometry(18, 26, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6b47, roughness: 0.95 })
    );
    cliffLeft.position.set(-32, 11, g * 20);
    cliffLeft.scale.set(0.9, 1, 1.4);
    group.add(cliffLeft);

    const cliffRight = new THREE.Mesh(
      new THREE.ConeGeometry(18, 26, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6b47, roughness: 0.95 })
    );
    cliffRight.position.set(32, 11, g * 20);
    cliffRight.scale.set(0.9, 1, 1.4);
    group.add(cliffRight);
  }
}

/**
 * Helper: Builds a realistic 3D Desert Palm Tree with segmented trunk and drooping fronds.
 */
function buildDesertPalmTree(mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const palm = new THREE.Group();

  // Segmented Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 7.5, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x735751, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.set(0, 3.75, 0);
  trunk.castShadow = true;
  palm.add(trunk);

  // Palm Fronds (Foliage Crown)
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2d6a4f,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  for (let f = 0; f < 8; f++) {
    const angle = (f / 8) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.2), leafMat);
    frond.position.set(Math.cos(angle) * 1.5, 7.6, Math.sin(angle) * 1.5);
    frond.rotation.y = angle;
    frond.rotation.x = 0.55;
    frond.castShadow = true;
    palm.add(frond);
  }

  return palm;
}

/**
 * Helper: Builds an ancient Acacia / Banyan shade tree.
 */
function buildAcaciaDesertTree(): THREE.Group {
  const tree = new THREE.Group();

  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.7, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c4d3c, roughness: 0.95 })
  );
  trunk.position.set(0, 2.5, 0);
  trunk.castShadow = true;
  tree.add(trunk);

  // Flat-top Acacia Foliage Canopy
  const foliage = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 3.5, 1.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.85 })
  );
  foliage.position.set(0, 5.5, 0);
  foliage.castShadow = true;
  tree.add(foliage);

  return tree;
}
