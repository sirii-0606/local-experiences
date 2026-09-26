import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { MonumentId, TimeOfDay, ArchitecturalHotspot, SpatialExperienceMarker } from "../types";
import { MONUMENTS_DATA } from "../monumentsData";
import { createMonumentScene } from "../procedural/MonumentFactory";
import { createLandEnvironment } from "../environment/TerrainEnvironment";
import { TIME_CONFIGS, createDustParticleSystem } from "../environment/AtmosphericLighting";

interface Props {
  monumentId: MonumentId;
  timeOfDay: TimeOfDay;
  activeHotspot: ArchitecturalHotspot | null;
  activeExperience: SpatialExperienceMarker | null;
  onSelectHotspot: (hotspot: ArchitecturalHotspot | null) => void;
  onSelectExperience: (exp: SpatialExperienceMarker | null) => void;
  isCinematicRotating: boolean;
}

export const MonumentCanvas: React.FC<Props> = ({
  monumentId,
  timeOfDay,
  activeHotspot,
  activeExperience,
  onSelectHotspot,
  onSelectExperience,
  isCinematicRotating,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screenCoords, setScreenCoords] = useState<{
    hotspots: Array<{ id: string; x: number; y: number; visible: boolean; data: ArchitecturalHotspot }>;
    experiences: Array<{ id: string; x: number; y: number; visible: boolean; data: SpatialExperienceMarker }>;
  }>({ hotspots: [], experiences: [] });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const monumentGroupRef = useRef<THREE.Group | null>(null);
  const dustRef = useRef<THREE.Points | null>(null);

  // Lighting refs
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

  // Smooth Camera Target Lerp State
  const targetCamPos = useRef(new THREE.Vector3(0, 8, 38));
  const targetCamLookAt = useRef(new THREE.Vector3(0, 9, 0));
  const currentCamLookAt = useRef(new THREE.Vector3(0, 9, 0));

  // User Orbit & Mouse Interaction State
  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const orbitTheta = useRef(0);
  const orbitPhi = useRef(Math.PI / 3);
  const orbitRadius = useRef(38);

  const monument = MONUMENTS_DATA[monumentId] || MONUMENTS_DATA["hawa-mahal"];

  // Update target camera when monument or active hotspot changes
  useEffect(() => {
    if (activeHotspot) {
      targetCamPos.current.set(...activeHotspot.cameraTarget.position);
      targetCamLookAt.current.set(...activeHotspot.cameraTarget.lookAt);
    } else if (activeExperience) {
      targetCamPos.current.set(activeExperience.position[0] * 0.7, activeExperience.position[1] + 5, activeExperience.position[2] + 10);
      targetCamLookAt.current.set(...activeExperience.position);
    } else {
      targetCamPos.current.set(...monument.defaultCamera.position);
      targetCamLookAt.current.set(...monument.defaultCamera.lookAt);
      orbitRadius.current = targetCamPos.current.length();
    }
  }, [monumentId, activeHotspot, activeExperience, monument]);

  // Main Three.js Initialization & Lifecycle
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    camera.position.set(...monument.defaultCamera.position);
    cameraRef.current = camera;
    currentCamLookAt.current.set(...monument.defaultCamera.lookAt);

    // 3. WebGL Renderer with High-DPI & Anti-aliasing
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Atmospheric Lights
    const hemi = new THREE.HemisphereLight(0xffcad4, 0x9a8c98, 0.8);
    scene.add(hemi);
    hemiLightRef.current = hemi;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const sun = new THREE.DirectionalLight(0xffb703, 2.5);
    sun.position.set(-40, 25, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 150;
    const d = 30;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    dirLightRef.current = sun;

    // 5. Dust Particle System
    const dust = createDustParticleSystem(600);
    scene.add(dust);
    dustRef.current = dust;

    // 6. Build Expansive Land / Ground Environment
    const landMesh = createLandEnvironment(monumentId);
    scene.add(landMesh);

    // 7. Build Monument Geometry
    const monMesh = createMonumentScene(monumentId);
    scene.add(monMesh);
    monumentGroupRef.current = monMesh;

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Cinematic Auto-Orbit when idle
      if (isCinematicRotating && !activeHotspot && !activeExperience && !isDragging.current) {
        orbitTheta.current += delta * 0.08;
        const radius = orbitRadius.current;
        targetCamPos.current.x = Math.sin(orbitTheta.current) * radius;
        targetCamPos.current.z = Math.cos(orbitTheta.current) * radius;
      }

      // Smooth Camera Lerp
      camera.position.lerp(targetCamPos.current, 0.05);
      currentCamLookAt.current.lerp(targetCamLookAt.current, 0.05);
      camera.lookAt(currentCamLookAt.current);

      // Animate Dust Particles
      if (dustRef.current) {
        dustRef.current.rotation.y = elapsed * 0.02;
        const positions = dustRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
          positions[i] += Math.sin(elapsed + i) * 0.01;
        }
        dustRef.current.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);

      // Project 3D Hotspot Coordinates to 2D Screen Space
      const tempVec = new THREE.Vector3();
      const currentMon = MONUMENTS_DATA[monumentId] || MONUMENTS_DATA["hawa-mahal"];

      const hpCoords = currentMon.hotspots.map((hp) => {
        tempVec.set(...hp.position);
        tempVec.project(camera);
        const isVisible = tempVec.z < 1;
        const x = (tempVec.x * 0.5 + 0.5) * container.clientWidth;
        const y = (-(tempVec.y * 0.5) + 0.5) * container.clientHeight;
        return { id: hp.id, x, y, visible: isVisible, data: hp };
      });

      const expCoords = currentMon.nearbyExperiences.map((exp) => {
        tempVec.set(...exp.position);
        tempVec.project(camera);
        const isVisible = tempVec.z < 1;
        const x = (tempVec.x * 0.5 + 0.5) * container.clientWidth;
        const y = (-(tempVec.y * 0.5) + 0.5) * container.clientHeight;
        return { id: exp.id, x, y, visible: isVisible, data: exp };
      });

      setScreenCoords({ hotspots: hpCoords, experiences: expCoords });
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [monumentId]);

  // Handle Dynamic Time of Day & Lighting Update
  useEffect(() => {
    if (!sceneRef.current) return;
    const cfg = TIME_CONFIGS[timeOfDay];
    const scene = sceneRef.current;

    scene.background = new THREE.Color(cfg.skyColor);
    scene.fog = new THREE.FogExp2(cfg.fogColor, 0.012);

    if (hemiLightRef.current) {
      hemiLightRef.current.color.setHex(cfg.skyColor);
      hemiLightRef.current.groundColor.setHex(cfg.groundColor);
      hemiLightRef.current.intensity = cfg.ambientIntensity;
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = cfg.ambientIntensity * 0.6;
    }

    if (dirLightRef.current) {
      dirLightRef.current.color.setHex(cfg.sunColor);
      dirLightRef.current.intensity = cfg.sunIntensity;
      dirLightRef.current.position.set(...cfg.sunPosition);
    }

    if (dustRef.current && dustRef.current.material) {
      const pm = dustRef.current.material as THREE.PointsMaterial;
      pm.opacity = timeOfDay === "midday" ? 0.2 : 0.7;
    }
  }, [timeOfDay]);

  // Mouse Orbit Drag Controls
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || activeHotspot) return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    orbitTheta.current -= deltaX * 0.006;
    orbitPhi.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbitPhi.current - deltaY * 0.006));

    const r = orbitRadius.current;
    targetCamPos.current.x = r * Math.sin(orbitPhi.current) * Math.sin(orbitTheta.current);
    targetCamPos.current.y = r * Math.cos(orbitPhi.current);
    targetCamPos.current.z = r * Math.sin(orbitPhi.current) * Math.cos(orbitTheta.current);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (activeHotspot) return;
    orbitRadius.current = Math.max(12, Math.min(65, orbitRadius.current + e.deltaY * 0.04));
    const r = orbitRadius.current;
    targetCamPos.current.x = r * Math.sin(orbitPhi.current) * Math.sin(orbitTheta.current);
    targetCamPos.current.y = r * Math.cos(orbitPhi.current);
    targetCamPos.current.z = r * Math.sin(orbitPhi.current) * Math.cos(orbitTheta.current);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        userSelect: "none",
        cursor: isDragging.current ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 2D Hotspot Overlays Rendered in 3D Screen Coordinates */}
      {screenCoords.hotspots.map((hp) => {
        if (!hp.visible || (activeHotspot && activeHotspot.id !== hp.id)) return null;
        const isSelected = activeHotspot?.id === hp.id;

        return (
          <div
            key={hp.id}
            style={{
              position: "absolute",
              left: hp.x,
              top: hp.y,
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
              cursor: "pointer",
              zIndex: 20,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectHotspot(isSelected ? null : hp.data);
            }}
          >
            <div
              className={`hotspot-badge ${isSelected ? "selected" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: isSelected ? "8px 16px" : "6px 14px",
                background: isSelected
                  ? "linear-gradient(135deg, #d85c48, #c4402c)"
                  : "rgba(255, 252, 250, 0.94)",
                backdropFilter: "blur(12px)",
                border: isSelected ? "2px solid #ffffff" : "1.5px solid #d85c48",
                borderRadius: "30px",
                color: isSelected ? "#ffffff" : "#1e131d",
                boxShadow: isSelected
                  ? "0 8px 24px rgba(216, 92, 72, 0.45)"
                  : "0 4px 16px rgba(184, 67, 48, 0.15)",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: isSelected ? "#ffffff" : "#d85c48",
                  display: "inline-block",
                  animation: isSelected ? "none" : "pulse 1.8s infinite",
                }}
              />
              <span>{hp.data.title}</span>
            </div>
          </div>
        );
      })}

      {/* Nearby Spatial Experience Markers */}
      {!activeHotspot &&
        screenCoords.experiences.map((exp) => {
          if (!exp.visible) return null;
          const isSelected = activeExperience?.id === exp.id;

          return (
            <div
              key={exp.id}
              style={{
                position: "absolute",
                left: exp.x,
                top: exp.y,
                transform: "translate(-50%, -50%)",
                pointerEvents: "auto",
                cursor: "pointer",
                zIndex: 15,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectExperience(isSelected ? null : exp.data);
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "rgba(255, 255, 255, 0.96)",
                  backdropFilter: "blur(14px)",
                  border: "1.5px solid #2a9d8f",
                  borderRadius: "14px",
                  padding: "8px 12px",
                  color: "#1e131d",
                  boxShadow: "0 6px 20px rgba(42, 157, 143, 0.2)",
                  transition: "transform 0.2s ease",
                  transform: isSelected ? "scale(1.1)" : "scale(1)",
                  maxWidth: "190px",
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "0.8rem" }}>📍</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#2a9d8f" }}>{exp.data.tag}</span>
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.25, color: "#1e131d" }}>
                  {exp.data.title}
                </span>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px", fontSize: "0.74rem", fontWeight: 600, color: "#b45309" }}>
                  <span>⭐ {exp.data.rating}</span>
                  <span>₹{exp.data.priceInr}</span>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
};
