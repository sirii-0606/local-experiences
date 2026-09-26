import React from "react";
import { Link } from "react-router";
import type { SpatialExperienceMarker } from "../types";

interface Props {
  experience: SpatialExperienceMarker;
  onClose: () => void;
}

export const ExperienceDetailDrawer: React.FC<Props> = ({ experience, onClose }) => {
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
        border: "1.5px solid #2a9d8f",
        borderRadius: "20px",
        padding: "24px",
        color: "#1e131d",
        boxShadow: "0 20px 60px rgba(42, 157, 143, 0.18)",
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
              color: "#2a9d8f",
            }}
          >
            {experience.tag}
          </span>
          <h3 style={{ margin: "4px 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "#1e131d" }}>
            {experience.title}
          </h3>
          <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "#b45309", fontWeight: 600 }}>
            Hosted by {experience.hostName}
          </p>
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

      {experience.image && (
        <div style={{ borderRadius: "12px", overflow: "hidden", margin: "14px 0", maxHeight: "170px", border: "1px solid #eedad2" }}>
          <img
            src={experience.image}
            alt={experience.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}

      <p style={{ fontSize: "0.86rem", lineHeight: 1.55, color: "#3d2b35", marginBottom: "16px" }}>
        {experience.shortBlurb}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          background: "#faede6",
          padding: "12px",
          borderRadius: "14px",
          border: "1px solid #eedad2",
          marginBottom: "16px",
        }}
      >
        <div>
          <span style={{ fontSize: "0.72rem", color: "#2a9d8f", fontWeight: 800 }}>RATING</span>
          <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 800, color: "#1e131d" }}>
            ⭐ {experience.rating} / 5.0
          </p>
        </div>
        <div>
          <span style={{ fontSize: "0.72rem", color: "#2a9d8f", fontWeight: 800 }}>PRICE / PERSON</span>
          <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 800, color: "#b45309" }}>
            ₹{experience.priceInr}
          </p>
        </div>
        <div>
          <span style={{ fontSize: "0.72rem", color: "#2a9d8f", fontWeight: 800 }}>DURATION</span>
          <p style={{ margin: "2px 0 0", fontSize: "0.95rem", fontWeight: 800, color: "#1e131d" }}>
            ⏱ {experience.durationMin} mins
          </p>
        </div>
        <div>
          <span style={{ fontSize: "0.72rem", color: "#2a9d8f", fontWeight: 800 }}>VERIFICATION</span>
          <p style={{ margin: "2px 0 0", fontSize: "0.85rem", fontWeight: 700, color: "#2e7d4f" }}>
            ✓ 100% Verified
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <Link
          to={`/trips/new?experienceId=${experience.experienceId}`}
          style={{
            flex: 1,
            padding: "10px",
            background: "linear-gradient(135deg, #2a9d8f, #1b4332)",
            borderRadius: "12px",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.85rem",
            textAlign: "center",
            textDecoration: "none",
            boxShadow: "0 6px 16px rgba(42, 157, 143, 0.3)",
          }}
        >
          Add to Trip Itinerary
        </Link>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "10px 14px",
            background: "#ffffff",
            border: "1.5px solid #eedad2",
            borderRadius: "12px",
            color: "#6e5864",
            fontWeight: 700,
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
