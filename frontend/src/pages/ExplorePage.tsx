import { useEffect, useState } from "react";
import MapView from "../MapView";
import GroupEditor from "../GroupEditor";
import { api } from "../api";
import type { Catalog, Change, ContextCheck, ContextEvent, Itinerary, Recommendation, Stop, TravelerState } from "../api";
import { useClock } from "../clock";

const ICON = { rain: "🌧", heat: "🔥", clear: "☀" } as const;
const CAT_ICON: Record<string, string> = {
  food: "🍛", culture: "🏛️", art: "🎨", learning: "📚", adventure: "🧗", shopping: "🛍️",
  nightlife: "🌙", wellness: "🧘", community: "🤝", nature: "🌿",
};
const CHANGE_LABEL: Record<Change["action"], string> = {
  retimed: "🕑 Moved", replaced: "🔁 Swapped", dropped: "➖ Dropped", at_risk: "⚠ At risk",
};

const EXAMPLES = [
  "We're a family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500 total, want local food and something cultural.",
  "Actually, something less crowded please",
  "Solo, near Tripolia Bazaar, 4 to 7pm, ₹1000, hidden gems and craft",
];
const hhmm = (iso: string) => iso.slice(11, 16);
const LIVE = (s: Stop) => s.status !== "replaced" && s.status !== "skipped";
type Msg = { role: "user" | "bot"; text: string };

function describe(s: TravelerState, parser: string, recs: number, excluded: number) {
  const kids = s.group.filter((t) => t.age < 16).length;
  const seniors = s.group.filter((t) => t.age >= 65).length;
  const who = `${s.group.length} ${s.group.length === 1 ? "person" : "people"}` +
    (kids ? `, ${kids} kid${kids > 1 ? "s" : ""}` : "") + (seniors ? `, ${seniors} senior${seniors > 1 ? "s" : ""}` : "");
  return `Understood (${parser === "llm" ? "Claude / NIM Vision" : "offline parser"}): ${hhmm(s.window_start)}–${hhmm(s.window_end)}, ` +
    `₹${s.budget_inr}, ${who}${s.intents.length ? `, looking for ${s.intents.join(", ")}` : ""}. ` +
    `${recs} options fit; ${excluded} ruled out.`;
}

export default function ExplorePage() {
  const { clock } = useClock();
  const [text, setText] = useState(EXAMPLES[0]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [state, setState] = useState<TravelerState | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [itinerary, setItinerary] = useState<Itinerary>({ stops: [] });
  const [problems, setProblems] = useState<string[]>([]);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Voyagenix-style Quick Planner State
  const [quickArea, setQuickArea] = useState("Hawa Mahal / Old City");
  const [quickWindow, setQuickWindow] = useState("4 to 8 pm");
  const [quickGroup, setQuickGroup] = useState("Family of 4 with 2 kids");
  const [quickBudget, setQuickBudget] = useState("2000");
  const [quickStyle, setQuickStyle] = useState("heritage & local food");

  useEffect(() => { api.catalog().then(setCatalog).catch((e) => setError(String(e))); }, []);
  const title = (id: string) => catalog?.experiences.find((e) => e.id === id)?.title ?? id;

  const [forecastCheck, setForecastCheck] = useState<ContextCheck | null>(null);
  const checkForecast = () => run(async () => setForecastCheck(await api.contextCheck(state!, itinerary, `${clock}:00`)));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const send = (msg: string) => run(async () => {
    setIsChatOpen(true);
    const res = await api.chat(msg, state, `${clock}:00`);
    let plan = res.plan;
    const locked = itinerary.stops.filter((s) => s.locked && LIVE(s));
    if (locked.length) plan = await api.plan(res.state, { stops: locked }, 3); // keep what the user locked
    setState(res.state);
    setRecs(res.recommendations);
    setExcluded(res.excluded);
    setItinerary(plan.itinerary);
    setProblems(plan.problems);
    setChanges(null);
    setForecastCheck(null);
    setPlanNote("");
    setMsgs((m) =>[...m, { role: "user", text: msg },
      { role: "bot", text: describe(res.state, res.parser, res.recommendations.length, Object.keys(res.excluded).length) }]);
    setText("");
  });

  const handleQuickPlan = (e: React.FormEvent) => {
    e.preventDefault();
    setIsChatOpen(true);
    const prompt = `We're a ${quickGroup} near ${quickArea}, free ${quickWindow}, budget ₹${quickBudget}, looking for ${quickStyle}.`;
    send(prompt);
    const el = document.getElementById("engine-workspace");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const triggerChapterPrompt = (promptText: string) => {
    setIsChatOpen(true);
    send(promptText);
    const el = document.getElementById("engine-workspace");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const replan = (stops: Stop[], maxNew: number, add?: string) => run(async () => {
    const p = await api.plan(state!, { stops }, maxNew, add);
    setItinerary(p.itinerary);
    setProblems(p.problems);
  });

  const addToPlan = (r: Recommendation) => run(async () => {
    const p = await api.plan(state!, itinerary, 0, r.experience_id);
    setItinerary(p.itinerary);
    setProblems(p.problems);
    const f = await api.feedback(state!, r.experience_id, "accept", null, `${clock}:00`);
    setState(f.state);
    setRecs(f.recommendations);
    setExcluded(f.excluded);
  });

  const pass = (r: Recommendation, reason: string) => run(async () => {
    const f = await api.feedback(state!, r.experience_id, "reject", reason === "none" ? null : reason, `${clock}:00`);
    setState(f.state);
    setRecs(f.recommendations);
    setExcluded(f.excluded);
  });

  const applyState = (next: TravelerState) => run(async () => {
    const [d, p] = await Promise.all([api.discover(next), api.plan(next, itinerary, 0)]);
    setState(next);
    setRecs(d.recommendations);
    setExcluded(d.excluded);
    setItinerary(p.itinerary);
    setProblems(p.problems);
  });

  const [planNote, setPlanNote] = useState("");
  const bookStop = (s: Stop) => run(async () => {
    const b = await api.book(state!, itinerary, s.experience_id!);
    setItinerary(b.itinerary);
    setPlanNote(`🎟 Booked ${s.title} for ${b.people} at ${hhmm(b.start)}. Reference ${b.code}. The stop is now locked.`);
  });

  const rateStop = (s: Stop, value: string) => run(async () => {
    const [stars, flag] = value.split("-");
    const f = await api.rate(state!, s.experience_id!, Number(stars), flag !== "no", `${clock}:00`);
    setState(f.state);
    setRecs(f.recommendations);
    setExcluded(f.excluded);
    setPlanNote(`Thanks! Your rating of ${s.title} now helps other travelers.`);
  });

  const newTrip = () => {
    setMsgs([]); setState(null); setRecs([]); setExcluded({}); setItinerary({ stops: [] });
    setProblems([]); setChanges(null); setForecastCheck(null); setPlanNote(""); setError("");
  };

  const forget = (tag: string) => {
    const learned = { ...state!.learned };
    delete learned[tag];
    applyState({ ...state!, learned });
  };

  const trigger = (event: Omit<ContextEvent, "at">) => run(async () => {
    const out = await api.event(state!, itinerary, { ...event, at: `${clock}:00` } as ContextEvent);
    const fresh = await api.discover(out.state);
    setState(out.state);
    setItinerary(out.itinerary);
    setProblems(out.problems);
    setChanges(out.changes);
    setRecs(fresh.recommendations);
    setExcluded(fresh.excluded);
  });

  const upcoming = itinerary.stops.filter((s) => (s.status === "proposed" || s.status === "confirmed") && s.experience_id);
  const planned = new Set(itinerary.stops.filter(LIVE).map((s) => s.experience_id));
  const spent = itinerary.stops.filter(LIVE).reduce((a, s) => a + s.cost_inr, 0);

  const liveStops = itinerary.stops.filter(LIVE);
  const stopLetter = new Map(liveStops.map((s, i) => [s.experience_id ?? s.title, String.fromCharCode(65 + i)]));
  const recNum = new Map(recs.filter((r) => !planned.has(r.experience_id)).map((r, i) => [r.experience_id, i + 1]));
  const category = (id: string | null) => catalog?.experiences.find((e) => e.id === id)?.category ?? "";

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <div className={`busy-bar ${busy ? "on" : ""}`} aria-hidden="true" />

      {/* 1. CINEMATIC HERO SECTION (Unmapped & Voyagenix Hybrid Reference) */}
      <section className="jaipur-hero-container">
        <div className="jaipur-hero-backdrop" />
        <div className="jaipur-hero-frame">
          <div className="brand-script" style={{ marginBottom: "0.5rem", color: "var(--marigold)" }}>
            TrueLocal Jaipur
          </div>
          <div className="hero-tag">
            <span>👑</span> Local Experiences, Intelligently Planned
          </div>
          <h1>TRAVEL BEYOND THE GUIDEBOOK</h1>
          <p className="hero-subtitle">
            Discover centuries-old block printing workshops, hidden stepwells, and sunset bastions dynamically adapted to your real-time pace and weather.
          </p>

          {/* Unmapped Hero Pill CTA */}
          <div className="hero-cta-group" style={{ marginBottom: "2.25rem" }}>
            <a href="#engine-workspace" className="hero-cta-btn">START EXPLORING</a>
            <a href="#engine-workspace" className="hero-cta-arrow" aria-label="Start exploring">↗</a>
          </div>

          {/* Floating Glass Quick-Planner Bar */}
          <form className="glass-planner-bar" onSubmit={handleQuickPlan}>
            <div className="planner-field">
              <label>Location / Area</label>
              <input
                type="text"
                value={quickArea}
                onChange={(e) => setQuickArea(e.target.value)}
                placeholder="e.g. Hawa Mahal, Amer"
              />
            </div>
            <div className="planner-field">
              <label>Time Window</label>
              <input
                type="text"
                value={quickWindow}
                onChange={(e) => setQuickWindow(e.target.value)}
                placeholder="e.g. 4 to 8 pm"
              />
            </div>
            <div className="planner-field">
              <label>Group &amp; Ages</label>
              <input
                type="text"
                value={quickGroup}
                onChange={(e) => setQuickGroup(e.target.value)}
                placeholder="e.g. Family of 4 with kids"
              />
            </div>
            <div className="planner-field">
              <label>Budget (₹)</label>
              <input
                type="text"
                value={quickBudget}
                onChange={(e) => setQuickBudget(e.target.value)}
                placeholder="e.g. 2000"
              />
            </div>
            <div className="planner-field">
              <label>Vibe / Interest</label>
              <select
                value={quickStyle}
                onChange={(e) => setQuickStyle(e.target.value)}
                style={{ cursor: "pointer" }}
              >
                <option value="heritage & local food">Heritage &amp; Local Food</option>
                <option value="craft & block-printing">Handmade Craft &amp; Art</option>
                <option value="hidden gems & sunset">Hidden Gems &amp; Sunset</option>
                <option value="relaxed culture & tea">Relaxed Culture &amp; Chai</option>
              </select>
            </div>
            <button type="submit" className="planner-submit" disabled={busy}>
              {busy ? "Thinking…" : "Curate My Plan →"}
            </button>
          </form>

          {/* Quick Destination Pills */}
          <div className="hero-pills">
            <span className="pill-label">Popular in Jaipur:</span>
            <button type="button" onClick={() => triggerChapterPrompt("Family of 3 near Hawa Mahal, free 3–6 pm, ₹1200, love culture and sweets")}>
              🏛️ Hawa Mahal &amp; City Palace
            </button>
            <button type="button" onClick={() => triggerChapterPrompt("Solo near Sanganer, 2 to 5 pm, ₹1500, hands-on block printing and craft workshops")}>
              🎨 Sanganer Block-Printing
            </button>
            <button type="button" onClick={() => triggerChapterPrompt("Couple at Nahargarh Fort for sunset, 5 to 8 pm, ₹800, viewpoints and snacks")}>
              🌅 Nahargarh Sunset Bastion
            </button>
            <button type="button" onClick={() => triggerChapterPrompt("Two friends near Johari Bazaar, 6 to 9 pm, ₹1000, street food walk and evening shopping")}>
              🍲 Johari Night Food Walk
            </button>
          </div>
        </div>
      </section>

      {/* 2. VALUE PROPOSITION RIBBON (Luxury Escapes Reference Style) */}
      <div className="value-ribbon-container">
        <div className="value-ribbon-grid">
          <div className="value-card">
            <div className="value-icon">🏛️</div>
            <div>
              <h4>100% Verified Local Masters</h4>
              <p>Direct access to master block-printers, blue pottery artisans, and generational haveli keepers.</p>
            </div>
          </div>
          <div className="value-card">
            <div className="value-icon">⛅</div>
            <div>
              <h4>Diurnal Weather Engine</h4>
              <p>Automatic heat avoidance and sunset timing using live Jaipur micro-climate forecasts.</p>
            </div>
          </div>
          <div className="value-card">
            <div className="value-icon">🏨</div>
            <div>
              <h4>Centroid-Matched Stays</h4>
              <p>Heritage stays and boutique havelis scored by geographic closeness to your chosen activities.</p>
            </div>
          </div>
          <div className="value-card">
            <div className="value-icon">🕶️</div>
            <div>
              <h4>AR &amp; 360° Virtual Preview</h4>
              <p>Preview historic architecture in virtual 3D before committing your precious physical schedule.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MNTN-STYLE DARK EDITORIAL STORYTELLING CHAPTERS */}
      <section className="editorial-wrapper">
        <div className="editorial-container">
          <div className="editorial-header">
            <p className="eyebrow">A CURATED JAIPUR HERITAGE GUIDE</p>
            <h2>Uncover Jaipur's Royal Craft &amp; Hidden Bastions</h2>
          </div>

          {/* Chapter 01 */}
          <div className="editorial-chapter">
            <div className="editorial-text">
              <span className="editorial-watermark">01</span>
              <p className="editorial-eyebrow">LIVING CRAFT TRADITIONS</p>
              <h3 className="editorial-title">Master Artisans of Sanganer &amp; Bagru</h3>
              <p className="editorial-desc">
                Step into 300-year-old family workshops where hand-carved teakwood blocks meet natural vegetable dyes. Learn the rhythm of the wooden mallet and carve your own personalized souvenir with generational master craftsmen.
              </p>
              <button
                type="button"
                className="editorial-action-btn"
                onClick={() => triggerChapterPrompt("Solo traveler interested in traditional Sanganer block print workshops and blue pottery, 2 hours, ₹1000")}
              >
                Explore Craft Workshops →
              </button>
            </div>
            <div className="editorial-media-card">
              <img
                src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80"
                alt="Sanganer Block Printing Workshop"
              />
              <span className="editorial-media-badge">🎨 Hands-on Artisan Workshops</span>
            </div>
          </div>

          {/* Chapter 02 (Reverse) */}
          <div className="editorial-chapter reverse">
            <div className="editorial-text">
              <span className="editorial-watermark">02</span>
              <p className="editorial-eyebrow">SACRED GEOMETRY &amp; SUNSETS</p>
              <h3 className="editorial-title">Hidden Stepwells &amp; High Bastions</h3>
              <p className="editorial-desc">
                Descend past the mesmerizing criss-cross stairs of Panna Meena Kund and ascend the Aravalli hills to Nahargarh Fort at golden hour, watching the entire walled city turn into a glowing sea of amber and indigo.
              </p>
              <button
                type="button"
                className="editorial-action-btn"
                onClick={() => triggerChapterPrompt("Group of 3 visiting Panna Meena Kund stepwell and Nahargarh sunset, 4 to 7:30 pm, ₹1200 total")}
              >
                Explore Bastions &amp; Views →
              </button>
            </div>
            <div className="editorial-media-card">
              <img
                src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80"
                alt="Jaipur Stepwell & Amer Fort"
              />
              <span className="editorial-media-badge">🪜 Architectural Stepwells</span>
            </div>
          </div>

          {/* Chapter 03 */}
          <div className="editorial-chapter">
            <div className="editorial-text">
              <span className="editorial-watermark">03</span>
              <p className="editorial-eyebrow">ROYAL FEASTS &amp; NIGHT BAZAARS</p>
              <h3 className="editorial-title">Secret Bazaars &amp; Spice Trails</h3>
              <p className="editorial-desc">
                From steaming pyaz kachoris fried in pure ghee to secret haveli courtyards serving royal Dal Baati Churma and saffron-infused rabri ghewar, experience the authentic culinary soul of old Jaipur after dark.
              </p>
              <button
                type="button"
                className="editorial-action-btn"
                onClick={() => triggerChapterPrompt("Family of 4 near Johari Bazaar, evening street food tour, 6 to 9 pm, ₹1500 total, vegetarian")}
              >
                Explore Royal &amp; Street Feasts →
              </button>
            </div>
            <div className="editorial-media-card">
              <img
                src="https://images.unsplash.com/photo-1505253758473-96b3015f21c9?auto=format&fit=crop&w=1200&q=80"
                alt="Jaipur Food & Bazaars"
              />
              <span className="editorial-media-badge">🍲 Royal Rajasthani Cuisine</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE LIVE DISCOVERY ENGINE */}
      <section id="engine-workspace" className="engine-workspace">
        <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--accent)", margin: 0 }}>REAL-TIME ADAPTIVE ENGINE</p>
            <h2 className="display" style={{ fontSize: "2.2rem", margin: "0.25rem 0 0" }}>Interactive Jaipur Discovery</h2>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`chat-toggle-btn ${isChatOpen ? "active" : ""}`}
              onClick={() => setIsChatOpen((v) => !v)}
              aria-expanded={isChatOpen}
            >
              {isChatOpen ? "✕ Close AI Assistant" : "✨ Ask TrueLocal AI / Chatbot"}
            </button>
            {state && (
              <button type="button" className="secondary" onClick={newTrip}>
                ↺ Plan a Fresh Situation
              </button>
            )}
          </div>
        </div>

        <div className="engine-layout-container">
          {/* Left Column: Sliding Situation Chat & Inputs */}
          <aside className={`side-chat-drawer ${isChatOpen ? "open" : ""}`} aria-hidden={!isChatOpen}>
            <section className="panel chat" aria-live="polite">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Tell us your situation</h2>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {state && <button type="button" className="secondary mini" onClick={newTrip} title="Start over as a different traveler">↺ Reset</button>}
                  <button type="button" className="chat-close-btn" onClick={() => setIsChatOpen(false)} title="Close chat drawer">✕</button>
                </div>
              </div>
              <div className="msgs">
                {msgs.length === 0 && (
                  <p className="muted">
                    Tell us who is traveling, your current location in Jaipur, how many hours you have, budget, and desired vibe.
                  </p>
                )}
                {msgs.map((m, i) => <p key={i} className={`msg ${m.role}`}>{m.text}</p>)}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  aria-label="Your request"
                  placeholder="e.g. Family of 4 near City Palace, 3 hours free, budget ₹1500, want culture & snacks..."
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); send(text.trim()); } }}
                />
                <button disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send Request"}</button>
              </form>
              <div className="examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" title={ex} onClick={() => setText(ex)} type="button">
                    {ex.slice(0, 38)}…
                  </button>
                ))}
              </div>
            </section>

            {state && (
              <section className="panel">
                <h2>Your Situation &amp; Preferences</h2>
                <div className="chips">
                  <span className="chip">🕓 {hhmm(state.window_start)}–{hhmm(state.window_end)}</span>
                  <span className={`chip ${spent > state.budget_inr ? "warn" : ""}`}>💰 ₹{spent} of ₹{state.budget_inr}</span>
                  <span className="chip">👥 {state.group.length} travelers</span>
                  <span className="chip">{state.mode === "walk" ? "🚶" : state.mode === "car" ? "🚗" : "🛺"} {state.mode}</span>
                  {state.pace !== "normal" && <span className="chip">pace: {state.pace}</span>}
                  {state.weather !== "clear" && <span className="chip warn">{ICON[state.weather as keyof typeof ICON]} {state.weather}</span>}
                  {state.avoid_crowds && <span className="chip">avoid crowds</span>}
                  {state.indoor_only && <span className="chip">indoors only</span>}
                  {state.intents.map((t) => <span key={t} className="chip tag">{t}</span>)}
                </div>
                {Object.keys(state.learned).length > 0 && (
                  <div className="learned">
                    <span className="muted small">Learned from your feedback (tap to forget):</span>
                    <div className="chips">
                      {Object.entries(state.learned).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                        <button
                          key={t}
                          type="button"
                          className={`chip ${v > 0 ? "up" : "down"}`}
                          onClick={() => forget(t)}
                          aria-label={`Forget that you ${v > 0 ? "like" : "dislike"} ${t}`}
                        >
                          {v > 0 ? "▲" : "▼"} {t} ✕
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <GroupEditor
                  key={JSON.stringify(state.group)}
                  group={state.group}
                  tags={catalog?.vocabulary.tags ?? []}
                  busy={busy}
                  onApply={(group) => applyState({ ...state, group })}
                />
              </section>
            )}
          </aside>

          {/* Right Column / Full-Width: Map, Recommendations & Plan */}
          <div className="engine-main-content">
            {error && <p className="error" role="alert">{error}</p>}

            {/* MapView Box */}
            <div className="map-wrap">
              <MapView state={state} recs={recs} stops={itinerary.stops} />
              {state && (
                <div className="legend" aria-hidden="true">
                  <span><i className="pin pin-you">●</i> you</span>
                  <span><i className="pin pin-rec">1</i> option</span>
                  <span><i className="pin pin-stop">A</i> in your plan</span>
                </div>
              )}
              {!isChatOpen && (
                <button
                  type="button"
                  className="chat-toggle-btn"
                  style={{ position: "absolute", bottom: "16px", right: "16px", zIndex: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                  onClick={() => setIsChatOpen(true)}
                >
                  ✨ Ask AI Assistant
                </button>
              )}
            </div>

            {state && (
              <div className="cols">
                {/* Recommended Now */}
                <section className="panel">
                  <h2>Recommended Now <span className="count">{recs.length}</span></h2>
                  {recs.length === 0 && <p className="muted">Nothing fits these constraints. See "why not" below.</p>}
                  <ol className="recs">
                    {recs.map((r) => {
                      const inPlan = planned.has(r.experience_id);
                      return (
                        <li key={r.experience_id} className={`card ${inPlan ? "in-plan" : ""}`}>
                          <div className="card-head">
                            <span className={`label ${inPlan ? "label-stop" : "label-rec"}`}>
                              {inPlan ? stopLetter.get(r.experience_id) : recNum.get(r.experience_id)}
                            </span>
                            <h3><span aria-hidden="true">{CAT_ICON[category(r.experience_id)] ?? "📍"}</span> {r.title}</h3>
                            {r.low_confidence && <span className="badge warn" title="Some details are unverified or stale">⚠ unverified</span>}
                          </div>
                          <p className="meta">🕓 {hhmm(r.start)}–{hhmm(r.end)} · {r.cost_inr ? `₹${r.cost_inr}` : "free"} · {r.travel_min ? `${r.travel_min} min away` : "right here"}</p>
                          <ul className="reasons">
                            {r.reasons.slice(3).map((x) => (
                              <li key={x} className={x.startsWith("⚠") ? "caution" : ""}>{x.replace(/^⚠ /, "")}</li>
                            ))}
                          </ul>
                          <div className="row">
                            {inPlan ? (
                              <span className="in-plan-tag">✓ In your plan as stop {stopLetter.get(r.experience_id)}</span>
                            ) : (
                              <button disabled={busy} onClick={() => addToPlan(r)}>+ Add to Plan</button>
                            )}
                            {!inPlan && (
                              <select
                                className="pass"
                                aria-label={`Not for me: ${r.title}`}
                                value=""
                                disabled={busy}
                                onChange={(e) => e.target.value && pass(r, e.target.value)}
                              >
                                <option value="">Not for me…</option>
                                <option value="not_interested">Not my thing</option>
                                <option value="too_expensive">Too expensive</option>
                                <option value="too_far">Too far</option>
                                <option value="bad_time">Wrong time</option>
                                <option value="none">Just skip it</option>
                              </select>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                {/* Plan & Disruption Triggers */}
                <div className="stack">
                  <section className="panel">
                    <h2>Your Current Plan</h2>
                    {itinerary.stops.length === 0 && <p className="muted">No stops yet. Select an option on the left or tap below to auto-plan.</p>}
                    <ol className="timeline">
                      {itinerary.stops.map((s, i) => (
                        <li key={`${s.title}-${s.start}-${i}`} className={`stop ${s.status} ${s.locked ? "locked" : ""}`}>
                          <span className="label label-stop">{LIVE(s) ? stopLetter.get(s.experience_id ?? s.title) : "–"}</span>
                          <span className="time">{hhmm(s.start)}–{hhmm(s.end)}</span>
                          <span className="stop-title">{s.title}</span>
                          <span className="stop-meta">{s.cost_inr ? `₹${s.cost_inr}` : "free"}{s.status !== "proposed" && ` · ${s.status}`}{s.locked && " · locked"}</span>
                          {s.experience_id && LIVE(s) && (s.status === "proposed" || s.status === "completed" || s.end <= `${clock}:00`) && (
                            <span className="stop-extra">
                              {s.status === "proposed" && s.end > `${clock}:00` && (
                                <button className="mini" disabled={busy} onClick={() => bookStop(s)}>🎟 Book</button>
                              )}
                              {(s.status === "completed" || s.end <= `${clock}:00`) && (
                                <select
                                  className="pass"
                                  aria-label={`Rate your visit to ${s.title}`}
                                  value=""
                                  disabled={busy}
                                  onChange={(e) => e.target.value && rateStop(s, e.target.value)}
                                >
                                  <option value="">How was it?</option>
                                  <option value="5">★★★★★ Loved it</option>
                                  <option value="4">★★★★ Good</option>
                                  <option value="3">★★★ Okay</option>
                                  <option value="2-no">★★ Not as described</option>
                                  <option value="1-no">★ Not as described</option>
                                </select>
                              )}
                            </span>
                          )}
                          {LIVE(s) && s.status !== "completed" && (
                            <span className="stop-actions">
                              <button
                                className="icon"
                                aria-label={s.locked ? "Unlock" : "Lock"}
                                title={s.locked ? "Locked: replanning won't move it" : "Lock this stop"}
                                onClick={() => replan(itinerary.stops.map((x) => x === s ? { ...x, locked: !x.locked } : x), 0)}
                              >
                                {s.locked ? "🔒" : "🔓"}
                              </button>
                              <button
                                className="icon"
                                aria-label="Remove"
                                title="Remove"
                                onClick={() => replan(itinerary.stops.filter((x) => x !== s), 0)}
                              >
                                ✕
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <button className="secondary" disabled={busy} onClick={() => replan(itinerary.stops, 3)}>
                      ✨ Fill Remaining Time
                    </button>
                    {problems.length > 0 && <ul className="problems">{problems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>}
                    {problems.length === 0 && itinerary.stops.length > 0 && <p className="ok">✓ Every stop is reachable, open and within budget.</p>}
                    {planNote && <p className="note" role="status">{planNote}</p>}
                  </section>

                  {/* Disruption Simulator */}
                  <section className="panel">
                    <h2>Simulate Context &amp; Disruption</h2>
                    <p className="muted small">Only the affected stops are adjusted in real time. Locked stops stay preserved.</p>
                    <div className="events">
                      <button disabled={busy} onClick={() => trigger({ kind: "delay", delay_min: 40 })}>⏰ 40 min late</button>
                      <button disabled={busy} onClick={() => trigger({ kind: "weather", weather: "rain" })}>🌧 It's raining</button>
                      <button disabled={busy || !upcoming.length} onClick={() => trigger({ kind: "closure", experience_id: upcoming[0].experience_id! })}>🚫 Next stop closed</button>
                      <button disabled={busy} onClick={() => trigger({ kind: "fatigue" })}>😴 We're tired</button>
                      <button disabled={busy} onClick={() => trigger({ kind: "budget_change", budget_inr: 300 })}>💸 Only ₹300 left</button>
                      <button disabled={busy} className="forecast" onClick={checkForecast}>🛰 Check Live Forecast</button>
                    </div>
                    {forecastCheck && (
                      <div className="forecast-result" role="status">
                        {!forecastCheck.available && <p className="muted">Live forecast unavailable (offline). Use the simulation buttons above.</p>}
                        {forecastCheck.available && forecastCheck.risks.length === 0 && <p className="ok">✓ No weather risk to your plan in the live forecast.</p>}
                        {forecastCheck.risks.map((r) => <p key={r.stop} className="warn-line">{ICON[r.condition as keyof typeof ICON] ?? "⚠"} {r.message}</p>)}
                        {forecastCheck.proposed && (
                          <button disabled={busy} onClick={() => { const { at: _at, ...e } = forecastCheck.proposed!; setForecastCheck(null); trigger(e); }}>
                            Replan for {forecastCheck.proposed.weather}
                          </button>
                        )}
                      </div>
                    )}
                    {changes && (
                      <ul className="changes" aria-live="polite">
                        {changes.length === 0 && <li className="muted">Nothing in your plan is affected.</li>}
                        {changes.map((c, i) => (
                          <li key={i} className={`change ${c.action}`}>
                            <strong>{CHANGE_LABEL[c.action]}</strong> {c.stop}
                            <div className="muted">because {c.reason}</div>
                            {c.new_stop && <div className="new-stop">→ {c.new_stop}</div>}
                            {c.why.length > 0 && <div className="muted small">{c.why.slice(0, 3).join(" · ")}</div>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            )}

            {Object.keys(excluded).length > 0 && (
              <details className="panel why-not">
                <summary>🔍 Why not the others? ({Object.keys(excluded).length} ruled out)</summary>
                <ul>
                  {Object.entries(excluded).map(([id, rs]) => (
                    <li key={id}><strong>{title(id)}</strong>: {rs.join("; ")}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
