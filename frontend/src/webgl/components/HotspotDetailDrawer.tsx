import React from "react";
import type { ArchitecturalHotspot } from "../types";

interface Props {
  hotspot: ArchitecturalHotspot;
  onClose: () => void;
}

export const HotspotDetailDrawer: React.FC<Props> = ({ hotspot, onClose }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        width: "360px",
        maxHeight: "calc(100% - 40px)",
        background: "rgba(255, 252, 250, 0.96)",
        backdropFilter: "blur(20px)",
        border: "1.5px solid #ecd7cf",
        borderRadius: "20px",
        padding: "24px",
        color: "#1e131d",
        boxShadow: "0 20px 60px rgba(184, 67, 48, 0.18)",
        zIndex: 50,
        overflowY: "auto",
        animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#d85c48",
            }}
          >
            Architectural Hotspot
          </span>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "1.25rem", fontWeight: 800, color: "#1e131d" }}>
            {hotspot.title}
          </h3>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#6e5864", fontWeight: 600 }}>{hotspot.subTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "#faede6",
            border: "1px solid #eedad2",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            color: "#6e5864",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            fontWeight: 700,
          }}
        >
          ✕
        </button>
      </div>

      {hotspot.image && (
        <div style={{ borderRadius: "12px", overflow: "hidden", margin: "14px 0", maxHeight: "160px", border: "1px solid #eedad2" }}>
          <img
            src={hotspot.image}
            alt={hotspot.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}

      <p style={{ fontSize: "0.86rem", lineHeight: 1.55, color: "#3d2b35", marginBottom: "16px" }}>
        {hotspot.description}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "#faede6",
          padding: "14px",
          borderRadius: "14px",
          border: "1px solid #eedad2",
          marginBottom: "16px",
        }}
      >
        <div>
          <span style={{ fontSize: "0.72rem", color: "#d85c48", fontWeight: 800, textTransform: "uppercase" }}>
            Historical Period
          </span>
          <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#1e131d", fontWeight: 600 }}>{hotspot.details.period}</p>
        </div>

        <div>
          <span style={{ fontSize: "0.72rem", color: "#d85c48", fontWeight: 800, textTransform: "uppercase" }}>
            Artisan Engineering Fact
          </span>
          <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#4a3640" }}>{hotspot.details.artisanFact}</p>
        </div>

        <div>
          <span style={{ fontSize: "0.72rem", color: "#d85c48", fontWeight: 800, textTransform: "uppercase" }}>
            Local Secret
          </span>
          <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#b84330", fontStyle: "italic", fontWeight: 600 }}>
            "{hotspot.details.secretSpot}"
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          width: "100%",
          padding: "10px",
          background: "linear-gradient(135deg, #d85c48, #c4402c)",
          border: "none",
          borderRadius: "12px",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: "0.85rem",
          cursor: "pointer",
          boxShadow: "0 6px 16px rgba(216, 92, 72, 0.3)",
        }}
      >
        Return to Overview
      </button>
    </div>
  );
};
