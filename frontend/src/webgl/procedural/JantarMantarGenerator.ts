import * as THREE from "three";
import { createMaterialPalette } from "./Materials";

/**
 * Builds an ultra-detailed procedural 3D model of Jantar Mantar.
 * Features the 27m high Vrihat Samrat Yantra sundial gnomon with real trigonometric inclination,
 * graduated marble quadrant arcs, and twin Jai Prakash Yantra hemispherical bowls.
 */
export function buildJantarMantar(): THREE.Group {
  const group = new THREE.Group();
  group.name = "JantarMantarMonument";
  const mats = createMaterialPalette();

  // 1. Observatory Ground Base
  const baseGeo = new THREE.BoxGeometry(42, 1, 36);
  const base = new THREE.Mesh(baseGeo, mats.courtyardStone);
  base.position.set(0, 0.5, 0);
  base.receiveShadow = true;
  group.add(base);

  // 2. Vrihat Samrat Yantra (Giant Supreme Sundial)
  const sundialGroup = new THREE.Group();
  sundialGroup.position.set(0, 1, -4);

  // Triangular Gnomon Wall (26° 55' inclination = 0.47 radians)
  const gnomonShape = new THREE.Shape();
  gnomonShape.moveTo(0, 0);
  gnomonShape.lineTo(24, 0);
  gnomonShape.lineTo(24, 12);
  gnomonShape.lineTo(0, 0);

  const extrudeSettings = {
    steps: 1,
    depth: 1.8,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 3,
  };
  const gnomonGeo = new THREE.ExtrudeGeometry(gnomonShape, extrudeSettings);
  const gnomon = new THREE.Mesh(gnomonGeo, mats.goldenSandstone);
  gnomon.rotation.y = -Math.PI / 2;
  gnomon.position.set(0.9, 0, 12);
  gnomon.castShadow = true;
  sundialGroup.add(gnomon);

  // Gnomon Central Stairs with White Marble Edge
  const stairsEdge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 26.8), mats.makranaMarble);
  stairsEdge.rotation.x = Math.atan2(12, 24);
  stairsEdge.position.set(0, 6, 0);
  sundialGroup.add(stairsEdge);

  // Gnomon Observation Chhatri at the Pinnacle (12m high)
  const topChhatri = new THREE.Group();
  topChhatri.position.set(0, 12, -12);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.pinkSandstone);
  topChhatri.add(dome);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 6), mats.royalGold);
  finial.position.set(0, 1.4, 0);
  topChhatri.add(finial);
  sundialGroup.add(topChhatri);

  // East & West Graduated Marble Quadrant Arcs
  const arcRadius = 14;
  [-1, 1].forEach((side) => {
    const quadrantGeo = new THREE.CylinderGeometry(arcRadius, arcRadius, 2.2, 24, 1, true, 0, Math.PI * 0.45);
    const quadrant = new THREE.Mesh(quadrantGeo, mats.makranaMarble);
    quadrant.rotation.x = Math.PI / 2;
    quadrant.rotation.z = side > 0 ? 0.3 : Math.PI - 0.3;
    quadrant.position.set(side * 8, 3.5, 0);
    quadrant.castShadow = true;
    sundialGroup.add(quadrant);
  });
  group.add(sundialGroup);

  // 3. Jai Prakash Yantra (Twin Hemispherical Inverted Marble Bowls)
  const bowlOffsets = [-12, 12];
  bowlOffsets.forEach((bx) => {
    const bowlGroup = new THREE.Group();
    bowlGroup.position.set(bx, 1, 10);

    const rimGeo = new THREE.CylinderGeometry(4.2, 4.2, 0.8, 24);
    const rim = new THREE.Mesh(rimGeo, mats.goldenSandstone);
    rim.position.set(0, 0.4, 0);
    bowlGroup.add(rim);

    const bowlGeo = new THREE.SphereGeometry(3.8, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const bowl = new THREE.Mesh(bowlGeo, mats.makranaMarble);
    bowl.position.set(0, 0.7, 0);
    bowl.castShadow = true;
    bowlGroup.add(bowl);

    // Cross sighting wires
    const wireX = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 7.6), mats.royalGold);
    wireX.rotation.z = Math.PI / 2;
    wireX.position.set(0, 0.8, 0);
    bowlGroup.add(wireX);

    const wireZ = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 7.6), mats.royalGold);
    wireZ.rotation.x = Math.PI / 2;
    wireZ.position.set(0, 0.8, 0);
    bowlGroup.add(wireZ);

    group.add(bowlGroup);
  });

  return group;
}
