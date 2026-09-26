import * as THREE from "three";

/**
 * Creates rich, high-spec PBR materials with sandstone subsurface warmth,
 * marble inlays, brass speculars, and water effects.
 */
export function createMaterialPalette() {
  // Procedural Sandstone Canvas Texture
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#e07a5f";
    ctx.fillRect(0, 0, 512, 512);
    // Add micro-noise and stone grain
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const alpha = Math.random() * 0.15;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,230,210,${alpha})` : `rgba(140,50,40,${alpha})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
  const sandstoneTexture = new THREE.CanvasTexture(canvas);
  sandstoneTexture.wrapS = THREE.RepeatWrapping;
  sandstoneTexture.wrapT = THREE.RepeatWrapping;
  sandstoneTexture.repeat.set(4, 4);

  // Pink Sandstone Material (Hawa Mahal, City Palace)
  const pinkSandstone = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#df6d58"),
    roughness: 0.82,
    metalness: 0.04,
    map: sandstoneTexture,
    bumpMap: sandstoneTexture,
    bumpScale: 0.03,
  });

  // Dark Sandstone Material (Borders, Brackets)
  const darkPinkSandstone = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#b84a39"),
    roughness: 0.88,
    metalness: 0.05,
    map: sandstoneTexture,
  });

  // Golden Ochre Stone Material (Amer Fort, Nahargarh, Jantar Mantar)
  const goldenSandstone = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#d99b4a"),
    roughness: 0.8,
    metalness: 0.05,
    map: sandstoneTexture,
    bumpMap: sandstoneTexture,
    bumpScale: 0.04,
  });

  // White Makrana Marble (Arches, Flooring, Domes, Jantar Mantar scales)
  const makranaMarble = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#f8f6f0"),
    roughness: 0.25,
    metalness: 0.08,
  });

  // Polished Royal Brass / Gold Leaf
  const royalGold = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e5a93b"),
    roughness: 0.22,
    metalness: 0.88,
  });

  // Weathered Copper Patina (Domes, Spalls)
  const copperPatina = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#4a8570"),
    roughness: 0.65,
    metalness: 0.45,
  });

  // Stained Glass Red
  const glassRuby = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#d90429"),
    transmission: 0.85,
    opacity: 0.9,
    transparent: true,
    roughness: 0.1,
    ior: 1.52,
  });

  // Stained Glass Emerald
  const glassEmerald = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#06d6a0"),
    transmission: 0.85,
    opacity: 0.9,
    transparent: true,
    roughness: 0.1,
    ior: 1.52,
  });

  // Stained Glass Cobalt
  const glassCobalt = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#118ab2"),
    transmission: 0.85,
    opacity: 0.9,
    transparent: true,
    roughness: 0.1,
    ior: 1.52,
  });

  // Stained Glass Amber
  const glassAmber = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#ffd166"),
    transmission: 0.85,
    opacity: 0.9,
    transparent: true,
    roughness: 0.1,
    ior: 1.52,
  });

  // Stepwell & Lake Water Material
  const sacredWater = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1a535c"),
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85,
  });

  // Courtyard Cobblestones
  const courtyardStone = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a68a78"),
    roughness: 0.9,
    metalness: 0.02,
    map: sandstoneTexture,
  });

  // Dark Terracotta (Tile roofs, pottery)
  const terracotta = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#a04028"),
    roughness: 0.85,
    metalness: 0.05,
  });

  return {
    pinkSandstone,
    darkPinkSandstone,
    goldenSandstone,
    makranaMarble,
    royalGold,
    copperPatina,
    glassRuby,
    glassEmerald,
    glassCobalt,
    glassAmber,
    sacredWater,
    courtyardStone,
    terracotta,
  };
}
