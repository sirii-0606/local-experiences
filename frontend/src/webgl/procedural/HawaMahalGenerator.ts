import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed, high-poly 3D model of Hawa Mahal (Palace of Winds).
 * Features 5 tiers of forward-facing semi-octagonal jharokha bays, white marble
 * jaali filigree trim, colored Belgian stained glass windows, bangaldar curved roofs,
 * Krishna Mukut crown chhatri, and grand entrance portals.
 */
export function buildHawaMahal(): THREE.Group {
  const group = new THREE.Group();
  group.name = "HawaMahalMonument";
  const mats = createMaterialPalette();

  // 1. Foundation Base & Ground Plaza
  const baseGeo = new THREE.BoxGeometry(36, 1.6, 12);
  const baseMesh = new THREE.Mesh(baseGeo, mats.darkPinkSandstone);
  baseMesh.position.set(0, 0.8, 0);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Plaza steps in warm stone
  for (let s = 1; s <= 4; s++) {
    const stepGeo = new THREE.BoxGeometry(36 + s * 1.4, 0.25, 12 + s * 1.4);
    const stepMesh = new THREE.Mesh(stepGeo, mats.courtyardStone);
    stepMesh.position.set(0, 0.8 - s * 0.25, 0);
    stepMesh.receiveShadow = true;
    group.add(stepMesh);
  }

  // 2. Main 5-Tier Facade Hierarchy
  const tiers = [
    { width: 30, height: 4.6, depth: 3.2, yPos: 3.9, bays: 9, tierName: "Sharad Mandir" },
    { width: 25, height: 4.2, depth: 2.8, yPos: 8.3, bays: 7, tierName: "Ratan Mandir" },
    { width: 20, height: 3.8, depth: 2.4, yPos: 12.3, bays: 5, tierName: "Vichitra Mandir" },
    { width: 15, height: 3.4, depth: 2.0, yPos: 15.9, bays: 3, tierName: "Prakash Mandir" },
    { width: 9, height: 3.2, depth: 1.8, yPos: 19.2, bays: 1, tierName: "Hawa Mandir" },
  ];

  tiers.forEach((tier, tierIdx) => {
    // Tier Backing Wall (Pink Sandstone)
    const wallGeo = new THREE.BoxGeometry(tier.width, tier.height, tier.depth);
    const wallMesh = new THREE.Mesh(wallGeo, mats.pinkSandstone);
    wallMesh.position.set(0, tier.yPos, 0);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    // Continuous Horizontal White Lime / Marble Molding Band
    const moldingGeo = new THREE.BoxGeometry(tier.width + 0.8, 0.35, tier.depth + 0.6);
    const moldingMesh = new THREE.Mesh(moldingGeo, mats.makranaMarble);
    moldingMesh.position.set(0, tier.yPos + tier.height / 2, 0);
    moldingMesh.castShadow = true;
    group.add(moldingMesh);

    // Top Cornice parapet (Kanguras / Battlement crenellations)
    const numKanguras = Math.floor(tier.width / 1.2);
    for (let k = 0; k < numKanguras; k++) {
      const kx = -tier.width / 2 + (k + 0.5) * 1.2;
      const kanguraGeo = new THREE.ConeGeometry(0.3, 0.45, 4);
      const kangura = new THREE.Mesh(kanguraGeo, mats.darkPinkSandstone);
      kangura.position.set(kx, tier.yPos + tier.height / 2 + 0.3, tier.depth / 2 + 0.1);
      kangura.rotation.y = Math.PI / 4;
      group.add(kangura);
    }

    // Semi-Octagonal Jharokha Bays across this tier (Facing +Z towards camera!)
    const baySpacing = (tier.width - 2.5) / (tier.bays + 1);
    const startX = -((tier.width - 2.5) / 2) + baySpacing;

    for (let b = 0; b < tier.bays; b++) {
      const bayX = startX + b * baySpacing;
      const bayGroup = buildDetailedJharokhaBay(tier.height * 0.82, mats, tierIdx, b);
      // Position clearly protruding out of the front wall at +Z
      bayGroup.position.set(bayX, tier.yPos, tier.depth / 2 + 0.45);
      group.add(bayGroup);
    }

    // Secondary decorative arched niches between bays
    if (tier.bays > 1) {
      for (let b = 0; b < tier.bays - 1; b++) {
        const midX = startX + (b + 0.5) * baySpacing;
        const nicheArch = buildWallNicheArch(tier.height * 0.45, mats);
        nicheArch.position.set(midX, tier.yPos, tier.depth / 2 + 0.05);
        group.add(nicheArch);
      }
    }
  });

  // 3. Top Tier Crown Krishna Mukut Chhatri
  const crownChhatri = buildCrownMukut(mats);
  crownChhatri.position.set(0, 21.0, 0);
  group.add(crownChhatri);

  // Side Flank Chhatris (Tier 4 flanks)
  const leftChhatri = buildSidePavilionChhatri(mats);
  leftChhatri.position.set(-6.8, 17.8, 0);
  group.add(leftChhatri);

  const rightChhatri = buildSidePavilionChhatri(mats);
  rightChhatri.position.set(6.8, 17.8, 0);
  group.add(rightChhatri);

  // 4. Ground Main Entrance Portal (Sireh Deori Gate)
  const portalGroup = buildEntrancePortal(mats);
  portalGroup.position.set(0, 2.6, 2.0);
  group.add(portalGroup);

  // 5. Street Heritage Lantern Posts on Plaza
  const lanternOffsets = [
    [-16, 1.6, 5.5],
    [16, 1.6, 5.5],
    [-8, 1.6, 5.5],
    [8, 1.6, 5.5],
  ];
  lanternOffsets.forEach(([lx, ly, lz]) => {
    const postGeo = new THREE.CylinderGeometry(0.1, 0.14, 2.4, 8);
    const post = new THREE.Mesh(postGeo, mats.royalGold);
    post.position.set(lx, ly + 1.2, lz);
    post.castShadow = true;
    group.add(post);

    const lampGeo = new THREE.OctahedronGeometry(0.32);
    const lamp = new THREE.Mesh(lampGeo, mats.glassAmber);
    lamp.position.set(lx, ly + 2.5, lz);
    group.add(lamp);

    const pl = new THREE.PointLight(0xffb703, 1.0, 8);
    pl.position.set(lx, ly + 2.5, lz);
    group.add(pl);
  });

  return group;
}

/**
 * Builds a protruding, highly articulated semi-octagonal Jharokha bay
 * strictly facing +Z towards the camera.
 */
function buildDetailedJharokhaBay(
  height: number,
  mats: ReturnType<typeof createMaterialPalette>,
  tierIdx: number,
  bayIdx: number
): THREE.Group {
  const bay = new THREE.Group();

  // 1. Protruding Base Corbel Bracket (Scalloped red sandstone)
  const bracketGeo = new THREE.ConeGeometry(0.85, 0.75, 6);
  const bracket = new THREE.Mesh(bracketGeo, mats.darkPinkSandstone);
  bracket.rotation.x = Math.PI;
  bracket.rotation.y = Math.PI / 6;
  bracket.position.set(0, -height / 2 + 0.15, 0.25);
  bracket.castShadow = true;
  bay.add(bracket);

  // 2. Polygonal Bay Window Body (Oriented facing +Z)
  const bayBodyGeo = new THREE.CylinderGeometry(0.85, 0.8, height * 0.72, 6, 1, false, 0, Math.PI);
  const bayBody = new THREE.Mesh(bayBodyGeo, mats.pinkSandstone);
  bayBody.position.set(0, 0, 0);
  bayBody.castShadow = true;
  bay.add(bayBody);

  // 3. Stained Glass Window Pane (Ruby, Emerald, Cobalt, Amber)
  const glassColors = [mats.glassRuby, mats.glassEmerald, mats.glassCobalt, mats.glassAmber];
  const glassMat = glassColors[(tierIdx + bayIdx) % glassColors.length];

  const glassGeo = new THREE.PlaneGeometry(0.55, height * 0.5);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 0.05, 0.86);
  bay.add(glass);

  // 4. Intricate White Makrana Marble Jaali Lattice Trim Arch
  const archBorderGeo = new THREE.TorusGeometry(0.35, 0.045, 6, 12, Math.PI);
  const archBorder = new THREE.Mesh(archBorderGeo, mats.makranaMarble);
  archBorder.position.set(0, 0.15, 0.88);
  bay.add(archBorder);

  // Side mini-windows for the angled facets of the bay
  [-0.45, 0.45].forEach((sx, idx) => {
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.28, height * 0.4), glassMat);
    sideGlass.rotation.y = idx === 0 ? -Math.PI / 4 : Math.PI / 4;
    sideGlass.position.set(sx, 0.05, 0.62);
    bay.add(sideGlass);
  });

  // 5. Bangaldar Curved Rajput Roof Domelet
  const domeletGeo = new THREE.SphereGeometry(0.9, 10, 8, 0, Math.PI, 0, Math.PI / 2);
  const domelet = new THREE.Mesh(domeletGeo, mats.darkPinkSandstone);
  domelet.scale.set(1, 0.65, 0.95);
  domelet.position.set(0, height * 0.36, 0);
  domelet.castShadow = true;
  bay.add(domelet);

  // 6. Gilded Brass Kalash Finial on Bay Top
  const finialGeo = new THREE.ConeGeometry(0.09, 0.45, 6);
  const finial = new THREE.Mesh(finialGeo, mats.royalGold);
  finial.position.set(0, height * 0.36 + 0.65, 0.35);
  bay.add(finial);

  return bay;
}

/**
 * Builds decorative recessed wall arches between jharokha bays.
 */
function buildWallNicheArch(height: number, mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const niche = new THREE.Group();

  const archFrame = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.035, 4, 10, Math.PI),
    mats.makranaMarble
  );
  archFrame.position.set(0, height * 0.2, 0);
  niche.add(archFrame);

  const innerPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, height),
    mats.darkPinkSandstone
  );
  innerPanel.position.set(0, 0, 0);
  niche.add(innerPanel);

  return niche;
}

/**
 * Builds the Lord Krishna Mukut (Crown) Supreme Chhatri for Tier 5.
 */
function buildCrownMukut(mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const chhatri = new THREE.Group();

  // Grand Fluted Rajput Copper / Patina Dome
  const domeGeo = new THREE.SphereGeometry(2.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, mats.copperPatina);
  dome.scale.set(1, 1.3, 1);
  dome.position.set(0, 0, 0);
  dome.castShadow = true;
  chhatri.add(dome);

  // Golden Spire & Finials (Sawai Pratap Singh dedication)
  const spireBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 8), mats.royalGold);
  spireBase.position.set(0, 2.8, 0);
  chhatri.add(spireBase);

  const spireNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2.2, 8), mats.royalGold);
  spireNeedle.position.set(0, 4.0, 0);
  chhatri.add(spireNeedle);

  // 8 Surrounding White Marble Columns
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = Math.cos(angle) * 1.9;
    const pz = Math.sin(angle) * 1.9;

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 2.4, 8),
      mats.makranaMarble
    );
    pillar.position.set(px, -1.2, pz);
    pillar.castShadow = true;
    chhatri.add(pillar);
  }

  return chhatri;
}

/**
 * Builds flanking pavilion chhatris on Tier 4 wings.
 */
function buildSidePavilionChhatri(mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const chhatri = new THREE.Group();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.darkPinkSandstone
  );
  dome.scale.set(1, 1.15, 1);
  chhatri.add(dome);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), mats.royalGold);
  finial.position.set(0, 1.8, 0);
  chhatri.add(finial);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6),
      mats.makranaMarble
    );
    pillar.position.set(Math.cos(angle) * 1.0, -0.8, Math.sin(angle) * 1.0);
    chhatri.add(pillar);
  }

  return chhatri;
}

/**
 * Builds the Grand Entrance Portal with multi-foil marble arch.
 */
function buildEntrancePortal(mats: ReturnType<typeof createMaterialPalette>): THREE.Group {
  const portal = new THREE.Group();

  // Outer Sandstone Frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.8, 0.6), mats.darkPinkSandstone);
  portal.add(frame);

  // Multi-foil Makrana Marble Archway
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 6, 16, Math.PI), mats.makranaMarble);
  arch.position.set(0, 0.4, 0.32);
  portal.add(arch);

  // Flanking Columns
  [-1.6, 1.6].forEach((cx) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.2, 8), mats.makranaMarble);
    col.position.set(cx, -0.2, 0.32);
    col.castShadow = true;
    portal.add(col);
  });

  // Dark Inner Entry Passage
  const passage = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.8), new THREE.MeshBasicMaterial({ color: 0x140a08 }));
  passage.position.set(0, -0.3, 0.31);
  portal.add(passage);

  return portal;
}
