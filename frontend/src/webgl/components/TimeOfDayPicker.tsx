import React from "react";
import type { TimeOfDay } from "../types";

interface Props {
  timeOfDay: TimeOfDay;
  onChange: (tod: TimeOfDay) => void;
}

const TIMES: Array<{ id: TimeOfDay; label: string; icon: string }> = [
  { id: "dawn", label: "Dawn", icon: "🌅" },
  { id: "golden-hour", label: "Golden Hour", icon: "🌇" },
  { id: "midday", label: "Midday", icon: "☀️" },
  { id: "sunset", label: "Sunset", icon: "🌆" },
  { id: "night", label: "Night Festival", icon: "🌙" },
];

export const TimeOfDayPicker: React.FC<Props> = ({ timeOfDay, onChange }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(14px)",
        border: "1.5px solid #ecd7cf",
        borderRadius: "40px",
        padding: "4px 6px",
        boxShadow: "0 8px 24px rgba(184, 67, 48, 0.1)",
      }}
    >
      <span
        style={{
          fontSize: "0.74rem",
          fontWeight: 800,
          color: "#d85c48",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          padding: "0 8px",
        }}
      >
        Lighting
      </span>
      {TIMES.map((t) => {
        const active = timeOfDay === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              border: active ? "1.5px solid #d85c48" : "1.5px solid transparent",
              borderRadius: "30px",
              background: active ? "rgba(216, 92, 72, 0.14)" : "transparent",
              color: active ? "#b84330" : "#6e5864",
              fontWeight: active ? 800 : 600,
              fontSize: "0.8rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};
