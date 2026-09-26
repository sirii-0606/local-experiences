import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Recommendation, Stop, TravelerState } from "./api";
import { getExperiencePhoto } from "./photos";

const JAIPUR: L.LatLngTuple = [26.9239, 75.8267];

function pin(label: string, kind: "you" | "rec" | "stop", isHighlighted = false) {
  const highlightStyle = isHighlighted
    ? "transform: scale(1.35); box-shadow: 0 0 0 4px #d85c48, 0 8px 24px rgba(216, 92, 72, 0.6); z-index: 1000;"
    : "box-shadow: 0 3px 10px rgba(0,0,0,0.25);";

  return L.divIcon({
    className: "leaflet-custom-marker",
    html: `<div class="pin pin-${kind}" style="${highlightStyle} font-weight: 800; transition: transform 0.2s ease;">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// Visualises engine output: you, recommendations, and the planned route with rich labels and popups.
export default function MapView({
  state,
  recs,
  stops,
  highlightedId,
}: {
  state: TravelerState | null;
  recs: Recommendation[];
  stops: Stop[];
  highlightedId?: string | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markerMap = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(JAIPUR, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;

    const ro = new ResizeObserver(() => {
      m.invalidateSize();
    });
    ro.observe(el.current);

    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  useEffect(() => {
    if (!layer.current || !map.current) return;
    const g = layer.current;
    g.clearLayers();
    markerMap.current.clear();
    const pts: L.LatLngTuple[] = [];

    if (state && typeof state.lat === "number" && typeof state.lon === "number") {
      pts.push([state.lat, state.lon]);
      const youMarker = L.marker([state.lat, state.lon], {
        icon: pin("●", "you"),
        title: "Your Origin / Stay",
      }).bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; padding: 4px;">
          <strong style="color: #2b1810;">📍 Your Location / Stay</strong>
          <p style="margin: 4px 0 0; color: #666; font-size: 12px;">Starting point for today's itinerary</p>
        </div>
      `);
      youMarker.addTo(g);
    }

    const live = stops.filter((s) => s.status !== "replaced" && s.status !== "skipped");
    const planned = new Set(live.map((s) => s.experience_id));

    // Recommendations (unplanned)
    recs
      .filter((r) => !planned.has(r.experience_id))
      .forEach((r, i) => {
        pts.push([r.lat, r.lon]);
        const isHigh = highlightedId === r.experience_id;
        const photoUrl = getExperiencePhoto(r.experience_id);
        const marker = L.marker([r.lat, r.lon], {
          icon: pin(String(i + 1), "rec", isHigh),
          title: r.title,
          zIndexOffset: isHigh ? 500 : 0,
        });

        marker.bindTooltip(`<b>${i + 1}. ${r.title}</b><br/>₹${r.cost_inr || "Free"}`, {
          direction: "top",
          offset: [0, -14],
        });

        marker.bindPopup(`
          <div style="font-family: inherit; max-width: 230px; font-size: 13px; line-height: 1.4;">
            <img src="${photoUrl}" alt="${r.title}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />
            <strong style="color: #1e131d; display: block; font-size: 13px; margin-bottom: 3px;">${r.title}</strong>
            <p style="margin: 0 0 6px; color: #6e5864; font-size: 12px;">
              🕓 ${r.start ? String(r.start).slice(11, 16) : ""}–${r.end ? String(r.end).slice(11, 16) : ""} · ₹${r.cost_inr || "Free"}
            </p>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}" target="_blank" rel="noopener noreferrer" style="color: #d85c48; font-weight: 700; font-size: 12px; text-decoration: none;">
              🗺️ Directions in Google Maps ↗
            </a>
          </div>
        `);
        marker.addTo(g);
        markerMap.current.set(r.experience_id, marker);

        if (isHigh) {
          L.circle([r.lat, r.lon], {
            radius: 180,
            color: "#d85c48",
            fillColor: "#d85c48",
            fillOpacity: 0.25,
            weight: 2,
          }).addTo(g);
        }
      });

    // Scheduled stops
    live.forEach((s, i) => {
      pts.push([s.lat, s.lon]);
      const isHigh = highlightedId === s.experience_id;
      const stopLabel = String.fromCharCode(65 + i);
      const photoUrl = s.experience_id ? getExperiencePhoto(s.experience_id) : "";
      const timeStr = s.start && String(s.start).includes("T") ? String(s.start).slice(11, 16) : String(s.start);
      const endStr = s.end && String(s.end).includes("T") ? String(s.end).slice(11, 16) : String(s.end);

      const marker = L.marker([s.lat, s.lon], {
        icon: pin(stopLabel, "stop", isHigh),
        title: `Stop ${stopLabel}: ${s.title}`,
        zIndexOffset: isHigh ? 600 : 100,
      });

      marker.bindTooltip(`<b>${stopLabel}. ${s.title}</b><br/>${timeStr}–${endStr}`, {
        direction: "top",
        offset: [0, -14],
      });

      marker.bindPopup(`
        <div style="font-family: inherit; max-width: 240px; font-size: 13px; line-height: 1.4;">
          ${photoUrl ? `<img src="${photoUrl}" alt="${s.title}" style="width: 100%; height: 115px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />` : ""}
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="background: #d85c48; color: #ffffff; font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 4px;">Stop ${stopLabel}</span>
            <strong style="color: #1e131d; font-size: 13px;">${s.title}</strong>
          </div>
          <p style="margin: 0 0 6px; color: #6e5864; font-size: 12px;">
            🕒 <b>${timeStr} – ${endStr}</b> ${s.cost_inr ? `· ₹${s.cost_inr}` : "· Free"}
          </p>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener noreferrer" style="color: #d85c48; font-weight: 700; font-size: 12px; text-decoration: none;">
            🗺️ Directions in Google Maps ↗
          </a>
        </div>
      `);
      marker.addTo(g);
      if (s.experience_id) markerMap.current.set(s.experience_id, marker);

      if (isHigh) {
        L.circle([s.lat, s.lon], {
          radius: 200,
          color: "#d85c48",
          fillColor: "#d85c48",
          fillOpacity: 0.3,
          weight: 2,
        }).addTo(g);
      }
    });

    // Draw route path between stops
    if (live.length > 0) {
      const routePoints: L.LatLngTuple[] = [];
      if (state && typeof state.lat === "number" && typeof state.lon === "number") {
        routePoints.push([state.lat, state.lon]);
      }
      live.forEach((s) => routePoints.push([s.lat, s.lon]));

      // Polyline solid & dash
      L.polyline(routePoints, {
        color: "#d85c48",
        weight: 4,
        opacity: 0.8,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(g);

      L.polyline(routePoints, {
        color: "#ffffff",
        weight: 2,
        dashArray: "6 8",
        opacity: 0.9,
      }).addTo(g);
    }

    // Dynamic Hover Spotlight Route: If an item is hovered, draw a vibrant direct connector route
    if (highlightedId) {
      const targetItem =
        live.find((s) => s.experience_id === highlightedId) ||
        recs.find((r) => r.experience_id === highlightedId);

      if (targetItem && state && typeof state.lat === "number" && typeof state.lon === "number") {
        const originPoint: L.LatLngTuple = [state.lat, state.lon];
        const targetPoint: L.LatLngTuple = [targetItem.lat, targetItem.lon];

        // Glowing spotlight connector polyline
        L.polyline([originPoint, targetPoint], {
          color: "#c4402c",
          weight: 6,
          opacity: 0.95,
          lineCap: "round",
        }).addTo(g);

        L.polyline([originPoint, targetPoint], {
          color: "#ffdd53",
          weight: 3,
          dashArray: "4 8",
          opacity: 1,
        }).addTo(g);

        // Open tooltip for the hovered marker
        const marker = markerMap.current.get(highlightedId);
        if (marker) {
          marker.openTooltip();
        }
      }
    }

    if (pts.length > 1) {
      map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
    } else if (pts.length === 1) {
      map.current.setView(pts[0], 14);
    }
  }, [state, recs, stops, highlightedId]);

  return (
    <div
      ref={el}
      className="map"
      role="region"
      aria-label="Map of recommendations and plan route"
      style={{ width: "100%", height: "100%", minHeight: 280, borderRadius: "14px", overflow: "hidden" }}
    />
  );
}
