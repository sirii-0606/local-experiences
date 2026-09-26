import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import MapView from "../MapView";
import type { Stop } from "../api";
import type { Trip, TripStop, TripSuggestions } from "../types";
import { v2 } from "../v2api";

function parseLocalDate(dateStr: string): [number, number, number] {
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  return [parts[0] || 2026, (parts[1] || 1) - 1, parts[2] || 1];
}

function getDaysBetween(startStr: string, endStr: string): string[] {
  const [sy, sm, sd] = parseLocalDate(startStr);
  const [ey, em, ed] = parseLocalDate(endStr);
  const s = new Date(sy, sm, sd);
  const e = new Date(ey, em, ed);
  const diffDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: string[] = [];
  for (let i = 0; i <= diffDays; i++) {
    const d = new Date(sy, sm, sd + i);
    days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return days.length > 0 ? days : [startStr.slice(0, 10)];
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = parseLocalDate(dateStr);
  const date = new Date(y, m, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function TripItineraryPage() {
  const { id } = useParams();
  const tripId = Number(id);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [suggestions, setSuggestions] = useState<TripSuggestions | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [acceptedSplits, setAcceptedSplits] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      v2.trip(tripId),
      v2.suggestions(tripId).catch(() => null),
    ])
      .then(([t, suggs]) => {
        setTrip(t);
        setSuggestions(suggs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [tripId]);

  const handleGenerateItinerary = async () => {
    if (!trip) return;
    setGenerating(true);
    setError("");
    try {
      const updated = await v2.generateItinerary(tripId);
      setTrip(updated);
      const suggs = await v2.suggestions(tripId).catch(() => null);
      if (suggs) setSuggestions(suggs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <section className="page narrow">
        <p className="muted">Loading your personalized multi-day itinerary…</p>
      </section>
    );
  }

  if (error && !trip) {
    return (
      <section className="page narrow">
        <p className="error" role="alert">{error || "Trip not found"}</p>
        <Link to="/trips">Back to your trips</Link>
      </section>
    );
  }

  if (!trip) return null;

  const daysList = getDaysBetween(trip.start_date, trip.end_date);
  const activeDate = daysList[activeDayIdx] || trip.start_date.slice(0, 10);
  const stops = trip.itinerary?.stops ?? [];
  const dayStops = stops.filter((s) => s.start.startsWith(activeDate));

  const mapStops: Stop[] = dayStops.map((s) => ({
    title: s.title,
    experience_id: s.experience_id,
    lat: s.lat,
    lon: s.lon,
    start: s.start,
    end: s.end,
    status: s.status as any,
    locked: s.locked,
    cost_inr: s.cost_inr,
  }));

  const formatTime = (iso: string) => {
    try {
      return iso.split("T")[1]?.slice(0, 5) ?? iso;
    } catch {
      return iso;
    }
  };

  return (
    <section className="page" style={{ maxWidth: 1140, margin: "0 auto", paddingBottom: "4rem" }}>
      <div className="trips-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", width: "100%", gap: "1rem" }}>
          <div>
            <p className="eyebrow"><Link to="/trips">Your trips</Link> / {trip.title}</p>
            <h1 className="display">{trip.title}</h1>
            <p className="hint">
              📅 {trip.start_date} to {trip.end_date} · 👥 {trip.travelers.length} travelers · 💰 ₹{trip.budget_inr.toLocaleString("en-IN")}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link to={`/trips/${tripId}/shortlist`} className="secondary button">
              Edit Shortlist / Stays
            </Link>
            <button type="button" className="secondary" onClick={() => window.print()}>
              🖨️ Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid var(--line)", marginBottom: "1.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {daysList.map((dStr, idx) => {
          const isActive = idx === activeDayIdx;
          const dayName = formatDayLabel(dStr);
          return (
            <button
              key={dStr}
              type="button"
              className={isActive ? "tab chip on" : "tab chip"}
              style={{
                padding: "0.5rem 1.1rem",
                border: isActive ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: isActive ? "var(--accent)" : "var(--panel-2)",
                color: isActive ? "var(--accent-ink)" : "var(--ink)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                borderRadius: "8px",
                fontSize: "0.88rem",
              }}
              onClick={() => setActiveDayIdx(idx)}
            >
              Day {idx + 1} ({dayName})
            </button>
          );
        })}
      </div>

      {/* Main Layout: Left = Timeline, Right = Map & Suggestions */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "2rem", alignItems: "start" }}>
        
        {/* Day Timeline */}
        <div>
          <h2>📅 Day {activeDayIdx + 1} Schedule</h2>
          
          {dayStops.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>
              <p className="muted" style={{ marginBottom: "1rem" }}>No scheduled activities yet for this day.</p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary"
                  disabled={generating}
                  onClick={handleGenerateItinerary}
                >
                  {generating ? "Planning itinerary…" : "⚡ Generate Itinerary Now"}
                </button>
                <Link to={`/trips/${tripId}/shortlist`} className="secondary button">
                  Select Shortlist & Stays
                </Link>
              </div>
            </div>
          ) : (
            <div className="timeline" style={{ position: "relative", paddingLeft: "1.5rem", borderLeft: "3px solid var(--line)" }}>
              {dayStops.map((stop: TripStop, sIdx: number) => (
                <div
                  key={sIdx}
                  className="panel"
                  style={{
                    position: "relative",
                    marginBottom: "1.25rem",
                    borderLeft: stop.locked ? "4px solid var(--accent)" : "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "-2.15rem",
                      top: "1rem",
                      width: "1.2rem",
                      height: "1.2rem",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      border: "2px solid var(--panel)",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span className="chip mini on" style={{ marginRight: "0.5rem" }}>
                        {formatTime(stop.start)} – {formatTime(stop.end)}
                      </span>
                      <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>{stop.title}</strong>
                    </div>
                    {stop.cost_inr > 0 && <span className="muted small font-mono">₹{stop.cost_inr}</span>}
                  </div>

                  {stop.who && stop.who.length > 0 && (
                    <p className="small muted" style={{ margin: "0.4rem 0 0" }}>
                      👥 Group: {stop.who.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline Meal Recommendations for this day */}
          {suggestions?.meals && suggestions.meals.length > 0 && (
            <div className="panel" style={{ marginTop: "1.5rem", background: "var(--panel-2)" }}>
              <h3>🍲 Recommended Meal Breaks for Today</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                {suggestions.meals.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed var(--line)", paddingBottom: "0.5rem" }}>
                    <div>
                      <strong style={{ color: "var(--ink)" }}>{m.title}</strong> <span className="chip mini" style={{ textTransform: "capitalize" }}>{m.meal_type}</span>
                      <p className="muted small" style={{ margin: "0.2rem 0" }}>{m.reason} · ₹{m.price_inr} total</p>
                    </div>
                    <span className="chip mini">🚗 {m.travel_min}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Map & Nearby Suggestions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Map View */}
          <div className="panel" style={{ padding: "0.5rem", overflow: "hidden", borderRadius: "10px" }}>
            <h3 style={{ padding: "0.5rem 0.5rem 0" }}>🗺️ Route Map (Day {activeDayIdx + 1})</h3>
            <div style={{ height: 260, borderRadius: "6px", overflow: "hidden", marginTop: "0.5rem" }}>
              <MapView
                state={dayStops.length > 0 ? ({ lat: dayStops[0].lat, lon: dayStops[0].lon } as any) : null}
                recs={[]}
                stops={mapStops}
              />
            </div>
          </div>

          {/* Guide / Driver Suggestions */}
          {suggestions?.guides && suggestions.guides.length > 0 && (
            <div className="panel">
              <h3>🚗 Transport & Guide Assistance</h3>
              {suggestions.guides.map((g, idx) => (
                <div key={idx} style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "8px" }}>
                  <strong style={{ color: "var(--ink)" }}>{g.title}</strong>
                  <p className="muted small" style={{ margin: "0.25rem 0" }}>{g.description}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                    <span className="chip mini on">Est. ₹{g.estimated_cost_inr.toLocaleString("en-IN")}</span>
                    <span className="muted small">{g.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Group Split Suggestions */}
          {suggestions?.splits && suggestions.splits.length > 0 && (
            <div className="panel" style={{ border: "2px dashed var(--accent)" }}>
              <h3>⚡ Suggested Group Split</h3>
              {suggestions.splits.map((sp, idx) => {
                const accepted = acceptedSplits[sp.reason];
                return (
                  <div key={idx} style={{ marginTop: "0.5rem" }}>
                    <p className="small" style={{ margin: "0 0 0.5rem", color: "var(--ink)" }}>{sp.reason}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
                      <div className="panel mini" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                        <strong style={{ color: "var(--ink)" }}>Subgroup 1: {sp.group_a.join(", ")}</strong>
                        <p style={{ margin: "0.2rem 0", color: "var(--muted)" }}>{sp.activity_a}</p>
                      </div>
                      <div className="panel mini" style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                        <strong style={{ color: "var(--ink)" }}>Subgroup 2: {sp.group_b.join(", ")}</strong>
                        <p style={{ margin: "0.2rem 0", color: "var(--muted)" }}>{sp.activity_b}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
                      <span className="muted small">Rejoin at: <b>{sp.rejoin_name}</b> ({sp.end_time.slice(0, 5)})</span>
                      <button
                        type="button"
                        className={accepted ? "primary mini" : "secondary mini"}
                        onClick={() => setAcceptedSplits({ ...acceptedSplits, [sp.reason]: !accepted })}
                      >
                        {accepted ? "✓ Split Accepted" : "Accept Split"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Stops En-Route */}
          {suggestions?.quick_stops && suggestions.quick_stops.length > 0 && (
            <div className="panel">
              <h3>⏱️ Quick Stops En-Route (≤ 45m)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                {suggestions.quick_stops.map((q, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                    <div>
                      <strong>{q.title}</strong>
                      <p className="muted small" style={{ margin: 0 }}>{q.reason}</p>
                    </div>
                    <span className="chip mini">{q.duration_min}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
