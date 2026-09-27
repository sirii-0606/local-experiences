import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Candidate, ShortlistDecision, StayRecommendation, Trip } from "../types";
import { v2 } from "../v2api";

export default function TripShortlist() {
  const { id } = useParams();
  const tripId = Number(id);
  const navigate = useNavigate();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stayRecs, setStayRecs] = useState<StayRecommendation[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ShortlistDecision>>({});
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [arModalExp, setArModalExp] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      v2.trip(tripId),
      v2.candidates(tripId),
      v2.stayRecommendations(tripId),
    ])
      .then(([t, cands, stays]) => {
        setTrip(t);
        setCandidates(cands);
        setStayRecs(stays);
        setSelectedStayId(t.stay_id ?? (stays.length > 0 ? stays[0].stay.id : null));

        // Saved choices win; otherwise only the traveler's own must-sees start in, the rest are skipped
        const initialDecs: Record<string, ShortlistDecision> = { ...(t.shortlist ?? {}) };
        cands.forEach((c) => {
          initialDecs[c.experience_id] ??= c.must_see ? "in_person" : "skip";
        });
        setDecisions(initialDecs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [tripId]);

  const setDecision = (expId: string, decision: ShortlistDecision) => {
    const updated = { ...decisions, [expId]: decision };
    setDecisions(updated);
    if (decision === "ar") {
      setArModalExp(expId);
    }
  };

  const handleGenerateItinerary = async () => {
    if (!trip) return;
    setSaving(true);
    setError("");
    try {
      // 1. Save shortlist and stay selection
      const updated = {
        ...trip,
        shortlist: decisions,
        stay_id: selectedStayId,
      };
      await v2.updateTrip(tripId, updated);

      // 2. Generate multi-day itinerary
      await v2.generateItinerary(tripId);

      // 3. Navigate to itinerary view
      navigate(`/trips/${tripId}/itinerary`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="page narrow">
        <p className="muted">Evaluating attractions and matching stays for your trip…</p>
      </section>
    );
  }

  if (error && !trip) {
    return (
      <section className="page narrow">
        <p className="error" role="alert">{error}</p>
        <Link to="/trips">Back to your trips</Link>
      </section>
    );
  }

  if (!trip) return null;

  const inPersonCount = Object.values(decisions).filter((d) => d === "in_person").length;
  const arCount = Object.values(decisions).filter((d) => d === "ar").length;

  return (
    <section className="page" style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: "4rem" }}>
      <div className="trips-hero">
        <div>
          <p className="eyebrow"><Link to="/trips">Your trips</Link> / {trip.title}</p>
          <h1 className="display">Curate your Jaipur Shortlist</h1>
          <p className="hint">
            Choose what to experience <b>in person</b> vs <b>virtual AR preview</b> vs <b>skip</b>. We'll build your multi-day itinerary around these.
          </p>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {/* Weather Status Bar in Shortlist */}
      <div className="panel" style={{ marginBottom: "1.5rem", background: "var(--panel-2)", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.2rem" }}>
                {trip.weather === "rain" ? "🌧" : trip.weather === "heat" ? "🔥" : "☀️"}
              </span>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>
                Trip Climate Scenario: <b>{trip.weather === "rain" ? "Monsoon Cloudburst (35 mm/h)" : trip.weather === "heat" ? "Extreme Heatwave (43.8°C)" : "Pleasant Clear (29°C)"}</b>
              </h3>
            </div>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {trip.weather === "rain"
                ? "Digital Twin prioritizes indoor museums and handcraft workshops over rained-out open ramparts."
                : trip.weather === "heat"
                ? "Digital Twin prioritizes shaded stepwells and naturally cooled galleries over sun-exposed observatories."
                : "Optimal conditions for hilltop fort viewpoints and heritage bazaar walks."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "clear", label: "☀️ Clear" },
              { id: "rain", label: "🌧 Rain" },
              { id: "heat", label: "🔥 Heat" },
            ].map((w) => (
              <button
                key={w.id}
                type="button"
                className={`chip ${(trip.weather || "clear") === w.id ? "on" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={async () => {
                  const updated = { ...trip, weather: w.id };
                  setTrip(updated);
                  await v2.updateTrip(tripId, updated);
                  const newCands = await v2.candidates(tripId);
                  setCandidates(newCands);
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stay Selection Banner */}
      <div className="panel" style={{ marginBottom: "2rem", border: "2px solid var(--accent)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.5rem" }}>🏨 Recommended Stays for Your Plan</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Scored by closeness to the central point of your in-person choices, group accessibility, and budget.
            </p>
          </div>
          <span className="chip on">
            {selectedStayId ? "Stay Selected" : "Select a Stay"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {stayRecs.slice(0, 3).map((rec) => {
            const isSelected = selectedStayId === rec.stay.id;
            return (
              <div
                key={rec.stay.id}
                style={{
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "1rem",
                  background: isSelected ? "var(--accent-soft)" : "var(--panel-2)",
                  color: "var(--ink)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>{rec.stay.name}</strong>
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>{rec.stay.rating}★</span>
                  </div>
                  <p className="muted small" style={{ margin: "0.25rem 0" }}>{rec.stay.area} · <span style={{ textTransform: "capitalize" }}>{rec.stay.type}</span></p>
                  <p style={{ margin: "0.5rem 0", fontWeight: 600, color: "var(--ink)" }}>₹{rec.stay.price_per_night_inr.toLocaleString("en-IN")} / night</p>
                  <ul className="muted small" style={{ paddingLeft: "1.2rem", margin: "0.5rem 0" }}>
                    {rec.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
                <button
                  type="button"
                  className={isSelected ? "primary" : "secondary"}
                  style={{ width: "100%", marginTop: "0.75rem" }}
                  onClick={() => setSelectedStayId(rec.stay.id)}
                >
                  {isSelected ? "✓ Selected Stay" : "Select this stay"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Candidate Experiences Grid */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>🏛️ Scored Attractions ({candidates.length})</h2>
          <div style={{ display: "flex", gap: "1rem" }}>
            <span className="badge">✓ {inPersonCount} In Person</span>
            <span className="badge">🕶️ {arCount} AR Preview</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {candidates.map((c) => {
            const dec = decisions[c.experience_id] ?? (c.must_see ? "in_person" : "skip");
            return (
              <div
                key={c.experience_id}
                className="panel"
                style={{
                  opacity: dec === "skip" ? 0.6 : 1,
                  border: dec === "in_person" ? "2px solid var(--accent)" : "1px solid var(--line)",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--ink)" }}>{c.title}</h3>
                    {c.must_see && <span className="chip on" style={{ fontSize: "0.75rem" }}>Must-see</span>}
                  </div>

                  {/* Travel Modes Table */}
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
                    <span className="chip mini" title="Walking time">🚶 {c.travel_by_mode.walk ?? "–"}m</span>
                    <span className="chip mini" title="Auto Rickshaw time">🛺 {c.travel_by_mode.auto ?? "–"}m</span>
                    <span className="chip mini" title="Bus time">🚌 {c.travel_by_mode.bus ?? "–"}m</span>
                    <span className="chip mini" title="Cab/Car time">🚗 {c.travel_by_mode.car ?? "–"}m</span>
                    <span className="chip mini muted">⏱️ {c.duration_min}m visit</span>
                    <span className="chip mini muted">₹{c.cost_inr}</span>
                  </div>

                  {/* Outdoor Convenience Values for Heat & Rain */}
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <span
                      className="chip mini"
                      style={{
                        background: (c.outdoor_convenience_heat ?? 0.5) >= 0.75 ? "rgba(45, 106, 79, 0.15)" : (c.outdoor_convenience_heat ?? 0.5) < 0.35 ? "rgba(186, 24, 27, 0.15)" : "rgba(224, 122, 95, 0.15)",
                        color: (c.outdoor_convenience_heat ?? 0.5) >= 0.75 ? "#1b4332" : (c.outdoor_convenience_heat ?? 0.5) < 0.35 ? "#ba181b" : "#8d3a1b",
                        fontWeight: 700,
                      }}
                      title={`Outdoor convenience in heat: ${Math.round((c.outdoor_convenience_heat ?? 0.5) * 100)}%`}
                    >
                      ☀️ Heat Conv: {Math.round((c.outdoor_convenience_heat ?? 0.5) * 100)}%
                    </span>
                    <span
                      className="chip mini"
                      style={{
                        background: (c.outdoor_convenience_rain ?? 0.5) >= 0.75 ? "rgba(45, 106, 79, 0.15)" : (c.outdoor_convenience_rain ?? 0.5) < 0.35 ? "rgba(186, 24, 27, 0.15)" : "rgba(38, 51, 136, 0.15)",
                        color: (c.outdoor_convenience_rain ?? 0.5) >= 0.75 ? "#1b4332" : (c.outdoor_convenience_rain ?? 0.5) < 0.35 ? "#ba181b" : "#263388",
                        fontWeight: 700,
                      }}
                      title={`Outdoor convenience in rain: ${Math.round((c.outdoor_convenience_rain ?? 0.5) * 100)}%`}
                    >
                      🌧️ Rain Conv: {Math.round((c.outdoor_convenience_rain ?? 0.5) * 100)}%
                    </span>
                  </div>

                  {/* Reasons */}
                  <ul className="muted small" style={{ paddingLeft: "1.2rem", margin: "0.5rem 0" }}>
                    {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>

                {/* 3-way selector */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem", marginTop: "1rem" }}>
                  <button
                    type="button"
                    className={dec === "in_person" ? "primary mini" : "secondary mini"}
                    onClick={() => setDecision(c.experience_id, "in_person")}
                  >
                    In Person
                  </button>
                  <button
                    type="button"
                    className={dec === "ar" ? "primary mini" : "secondary mini"}
                    onClick={() => setDecision(c.experience_id, "ar")}
                  >
                    AR Preview
                  </button>
                  <button
                    type="button"
                    className={dec === "skip" ? "primary mini" : "secondary mini"}
                    onClick={() => setDecision(c.experience_id, "skip")}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Action Bar */}
      <div
        style={{
          position: "sticky",
          bottom: "1rem",
          marginTop: "2rem",
          background: "var(--panel)",
          color: "var(--ink)",
          border: "2px solid var(--line)",
          boxShadow: "var(--lift)",
          borderRadius: "12px",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          zIndex: 100,
        }}
      >
        <div>
          <strong style={{ color: "var(--ink)" }}>Ready to build your multi-day itinerary?</strong>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            {inPersonCount} in-person activities · Stay: {stayRecs.find((s) => s.stay.id === selectedStayId)?.stay.name || "Default location"}
          </p>
        </div>
        <button
          type="button"
          className="primary big"
          disabled={saving || inPersonCount === 0}
          onClick={handleGenerateItinerary}
        >
          {saving ? "Planning your days…" : "Generate Day-by-Day Itinerary →"}
        </button>
      </div>

      {/* AR Preview Placeholder Modal */}
      {arModalExp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
          onClick={() => setArModalExp(null)}
        >
          <div
            className="panel"
            style={{ maxWidth: 450, width: "100%", background: "var(--panel)", color: "var(--ink)", borderRadius: "12px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>🕶️ AR & 360° Preview Mode</h3>
            <p className="muted">
              <b>{candidates.find((c) => c.experience_id === arModalExp)?.title}</b> has been marked for virtual / AR preview!
            </p>
            <div
              style={{
                height: 160,
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                margin: "1rem 0",
              }}
            >
              <span style={{ fontSize: "2.5rem" }}>🏛️</span>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                Interactive 3D / AR Preview Hook
              </span>
            </div>
            <p className="small muted">
              This experience will be kept in your virtual collection without occupying physical travel time on your daily schedule.
            </p>
            <button
              type="button"
              className="primary"
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={() => setArModalExp(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
