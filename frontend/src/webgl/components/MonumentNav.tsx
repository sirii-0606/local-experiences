import React, { useRef } from "react";
import type { MonumentId } from "../types";
import { MONUMENTS_DATA } from "../monumentsData";

interface Props {
  currentMonumentId: MonumentId;
  onSelectMonument: (id: MonumentId) => void;
}

export const MonumentNav: React.FC<Props> = ({ currentMonumentId, onSelectMonument }) => {
  const monumentList = Object.values(MONUMENTS_DATA);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -240 : 240,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        maxWidth: "100%",
        position: "relative",
      }}
    >
      {/* Scroll Left Button */}
      <button
        type="button"
        onClick={() => scroll("left")}
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          border: "1.5px solid #ecd7cf",
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          color: "#d85c48",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1rem",
          fontWeight: 800,
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(184, 67, 48, 0.12)",
        }}
        title="Scroll left"
      >
        ‹
      </button>

      {/* Horizontal Scroll Track */}
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          overflowX: "auto",
          maxWidth: "100%",
          padding: "4px 2px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {monumentList.map((m) => {
          const isSelected = m.id === currentMonumentId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMonument(m.id as MonumentId)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 15px",
                background: isSelected
                  ? "linear-gradient(135deg, #d85c48, #e5a93c)"
                  : "rgba(255, 255, 255, 0.94)",
                backdropFilter: "blur(14px)",
                border: isSelected ? "1.5px solid #ffffff" : "1.5px solid #ecd7cf",
                borderRadius: "20px",
                color: isSelected ? "#ffffff" : "#2d1820",
                fontWeight: isSelected ? 800 : 600,
                fontSize: "0.82rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                boxShadow: isSelected
                  ? "0 6px 18px rgba(216, 92, 72, 0.35)"
                  : "0 2px 8px rgba(184, 67, 48, 0.08)",
                transition: "all 0.2s ease",
              }}
            >
              <span>🏛️</span>
              <span>{m.name}</span>
              <span
                style={{
                  fontSize: "0.72rem",
                  opacity: 0.9,
                  color: isSelected ? "#ffffff" : "#d85c48",
                  fontWeight: 700,
                }}
              >
                {m.hindiName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        onClick={() => scroll("right")}
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          border: "1.5px solid #ecd7cf",
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          color: "#d85c48",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1rem",
          fontWeight: 800,
          flexShrink: 0,
          boxShadow: "0 4px 12px rgba(184, 67, 48, 0.12)",
        }}
        title="Scroll right"
      >
        ›
      </button>
    </div>
  );
};
