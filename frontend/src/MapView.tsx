import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Recommendation, Stop, TravelerState } from "./api";

const JAIPUR: L.LatLngTuple = [26.92, 75.82];

function pin(label: string, kind: "you" | "rec" | "stop") {
  return L.divIcon({ className: "", html: `<div class="pin pin-${kind}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

// The map only visualises engine output (doc §11.2): you, recommendations, and the plan route.
export default function MapView({ state, recs, stops }: { state: TravelerState | null; recs: Recommendation[]; stops: Stop[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const m = L.map(el.current!).setView(JAIPUR, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const g = layer.current!;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    if (state) {
      pts.push([state.lat, state.lon]);
      L.marker([state.lat, state.lon], { icon: pin("●", "you"), title: "You are here" }).addTo(g);
    }
    const live = stops.filter((s) => s.status !== "replaced" && s.status !== "skipped");
    const planned = new Set(live.map((s) => s.experience_id));
    recs.filter((r) => !planned.has(r.experience_id)).forEach((r, i) => {
      pts.push([r.lat, r.lon]);
      L.marker([r.lat, r.lon], { icon: pin(String(i + 1), "rec"), title: r.title }).bindTooltip(r.title).addTo(g);
    });
    live.forEach((s, i) => {
      pts.push([s.lat, s.lon]);
      L.marker([s.lat, s.lon], { icon: pin(String.fromCharCode(65 + i), "stop"), title: s.title }).bindTooltip(`${s.start.slice(11, 16)} ${s.title}`).addTo(g);
    });
    if (state && live.length) {
      L.polyline([[state.lat, state.lon], ...live.map((s): L.LatLngTuple => [s.lat, s.lon])], { color: "#b4532a", weight: 3, dashArray: "6 6" }).addTo(g);
    }
    if (pts.length > 1) map.current!.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) map.current!.setView(pts[0], 14);
  }, [state, recs, stops]);

  return <div ref={el} className="map" role="region" aria-label="Map of recommendations and plan" />;
}
