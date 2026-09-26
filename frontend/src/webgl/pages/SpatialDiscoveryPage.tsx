import React, { useState } from "react";
import { Link } from "react-router";
import type { MonumentId, TimeOfDay, ArchitecturalHotspot, SpatialExperienceMarker } from "../types";
import { MONUMENTS_DATA } from "../monumentsData";
import { MonumentCanvas } from "../components/MonumentCanvas";
import { MonumentNav } from "../components/MonumentNav";
import { TimeOfDayPicker } from "../components/TimeOfDayPicker";
import { HotspotDetailDrawer } from "../components/HotspotDetailDrawer";
import { ExperienceDetailDrawer } from "../components/ExperienceDetailDrawer";

export default function SpatialDiscoveryPage() {
  const [currentMonumentId, setCurrentMonumentId] = useState<MonumentId>("hawa-mahal");
  // Default to daytime
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("midday");
  const [activeHotspot, setActiveHotspot] = useState<ArchitecturalHotspot | null>(null);
  const [activeExperience, setActiveExperience] = useState<SpatialExperienceMarker | null>(null);
  const [isAutoOrbiting, setIsAutoOrbiting] = useState(true);
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);

  const monument = MONUMENTS_DATA[currentMonumentId] || MONUMENTS_DATA["hawa-mahal"];

  const handleSelectMonument = (id: MonumentId) => {
    setCurrentMonumentId(id);
    setActiveHotspot(null);
    setActiveExperience(null);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 120px)",
        minHeight: "680px",
        background: "#fdf6f2",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* 3D WebGL Three.js Canvas Layer */}
      <MonumentCanvas
        monumentId={currentMonumentId}
        timeOfDay={timeOfDay}
        activeHotspot={activeHotspot}
        activeExperience={activeExperience}
        onSelectHotspot={(hp) => {
          setActiveHotspot(hp);
          if (hp) setActiveExperience(null);
        }}
        onSelectExperience={(exp) => {
          setActiveExperience(exp);
          if (exp) setActiveHotspot(null);
        }}
        isCinematicRotating={isAutoOrbiting}
      />

      {/* Top Floating Controls Bar (Pink City Light Glassmorphic Style) */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          right: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          pointerEvents: "none",
          zIndex: 30,
          boxSizing: "border-box",
          maxWidth: "calc(100% - 32px)",
        }}
      >
        <div style={{ pointerEvents: "auto", flex: "1 1 auto", minWidth: 0, overflow: "hidden" }}>
          <MonumentNav currentMonumentId={currentMonumentId} onSelectMonument={handleSelectMonument} />
        </div>

        <div style={{ pointerEvents: "auto", flexShrink: 0 }}>
          <TimeOfDayPicker timeOfDay={timeOfDay} onChange={setTimeOfDay} />
        </div>
      </div>

      {/* Bottom Left Monument Info Panel (Pink Jaipuri Light Card) */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "20px",
          maxWidth: isCardCollapsed ? "260px" : "420px",
          background: "rgba(255, 252, 250, 0.95)",
          backdropFilter: "blur(20px)",
          border: "1.5px solid #ecd7cf",
          borderRadius: "18px",
          padding: isCardCollapsed ? "12px 16px" : "18px 22px",
          color: "#1e131d",
          boxShadow: "0 16px 40px rgba(184, 67, 48, 0.14)",
          zIndex: 25,
          pointerEvents: "auto",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isCardCollapsed ? 0 : "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              className="chip mini"
              style={{
                background: "rgba(216, 92, 72, 0.12)",
                color: "#d85c48",
                border: "1px solid rgba(216, 92, 72, 0.3)",
                fontWeight: 700,
              }}
            >
              🏛️ 3D SPATIAL DISCOVERY
            </span>
            <span style={{ fontSize: "0.78rem", color: "#6e5864", fontWeight: 600 }}>
              ☀️ Daytime
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCardCollapsed(!isCardCollapsed)}
            style={{
              background: "rgba(216, 92, 72, 0.08)",
              border: "1px solid rgba(216, 92, 72, 0.2)",
              borderRadius: "8px",
              padding: "4px 8px",
              color: "#d85c48",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isCardCollapsed ? "▲ Expand" : "▼ Collapse"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <h2 style={{ margin: 0, fontSize: isCardCollapsed ? "1.2rem" : "1.5rem", fontWeight: 800, color: "#1e131d", letterSpacing: "-0.02em" }}>
            {monument.name}
          </h2>
          <span style={{ fontSize: isCardCollapsed ? "0.9rem" : "1.05rem", color: "#d85c48", fontWeight: 600 }}>
            {monument.hindiName}
          </span>
        </div>

        {!isCardCollapsed && (
          <>
            <p style={{ margin: "4px 0 8px", fontSize: "0.82rem", fontWeight: 700, color: "#d85c48" }}>
              {monument.tagline}
            </p>

            <p style={{ margin: "0 0 12px", fontSize: "0.8rem", lineHeight: 1.5, color: "#4a3640" }}>
              {monument.heroStory}
            </p>

            {/* Architecture Highlights */}
            <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "12px" }}>
              {monument.architectureHighlights.slice(0, 3).map((hl, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.76rem", color: "#2d1820" }}>
                  <span style={{ color: "#d85c48", fontWeight: 700 }}>✦</span>
                  <span>{hl}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsAutoOrbiting(!isAutoOrbiting)}
                style={{
                  padding: "7px 12px",
                  background: isAutoOrbiting ? "rgba(216, 92, 72, 0.15)" : "#ffffff",
                  border: `1.5px solid ${isAutoOrbiting ? "#d85c48" : "#ecd7cf"}`,
                  borderRadius: "10px",
                  color: isAutoOrbiting ? "#b84330" : "#6e5864",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isAutoOrbiting ? "⏸ Pause" : "▶ Orbit"}
              </button>

              <Link
                to={`/trips/new?landmark=${monument.id}`}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "linear-gradient(135deg, #d85c48, #c4402c)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  textAlign: "center",
                  textDecoration: "none",
                  boxShadow: "0 4px 14px rgba(216, 92, 72, 0.35)",
                }}
              >
                Plan Around {monument.name}
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Active Architectural Hotspot Detail Drawer */}
      {activeHotspot && (
        <HotspotDetailDrawer hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />
      )}

      {/* Active Experience Detail Drawer */}
      {activeExperience && (
        <ExperienceDetailDrawer experience={activeExperience} onClose={() => setActiveExperience(null)} />
      )}
    </div>
  );
}
