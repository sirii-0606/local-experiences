import { useEffect, useState } from "react";
import MapView from "./MapView";
import ProviderView from "./ProviderView";
import { api } from "./api";
import type { Catalog, Change, ContextEvent, Itinerary, Recommendation, Stop, TravelerState } from "./api";

const EXAMPLES = [
  "We're a family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500 total, want local food and something cultural.",
  "Actually, something less crowded please",
  "Solo, near Tripolia Bazaar, 10am to 2pm, ₹1200, hidden gems and craft workshops",
];
const hhmm = (iso: string) => iso.slice(11, 16);
const LIVE = (s: Stop) => s.status !== "replaced" && s.status !== "skipped";
type Msg = { role: "user" | "bot"; text: string };

function describe(s: TravelerState, parser: string, recs: number, excluded: number) {
  const kids = s.group.filter((t) => t.age < 16).length;
  const seniors = s.group.filter((t) => t.age >= 65).length;
  const who = `${s.group.length} ${s.group.length === 1 ? "person" : "people"}` +
    (kids ? `, ${kids} kid${kids > 1 ? "s" : ""}` : "") + (seniors ? `, ${seniors} senior${seniors > 1 ? "s" : ""}` : "");
  return `Understood (${parser === "llm" ? "Claude" : "offline parser"}): ${hhmm(s.window_start)}–${hhmm(s.window_end)}, ` +
    `₹${s.budget_inr}, ${who}${s.intents.length ? `, looking for ${s.intents.join(", ")}` : ""}. ` +
    `${recs} options fit; ${excluded} ruled out.`;
}

export default function App() {
  const [clock, setClock] = useState("2026-09-26T15:30");
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

  const [view, setView] = useState<"traveler" | "provider">("traveler");
  const loadCatalog = () => api.catalog().then(setCatalog);
  useEffect(() => { loadCatalog().catch((e) => setError(String(e))); }, []);
  const title = (id: string) => catalog?.experiences.find((e) => e.id === id)?.title ?? id;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const send = (msg: string) => run(async () => {
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
    setMsgs((m) => [...m, { role: "user", text: msg },
      { role: "bot", text: describe(res.state, res.parser, res.recommendations.length, Object.keys(res.excluded).length) }]);
    setText("");
  });

  const replan = (stops: Stop[], maxNew: number, add?: string) => run(async () => {
    const p = await api.plan(state!, { stops }, maxNew, add);
    setItinerary(p.itinerary);
    setProblems(p.problems);
  });

  // The engine picks the time: first gap where it's reachable, open and in budget.
  const addToPlan = (r: Recommendation) => replan(itinerary.stops, 0, r.experience_id);

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

  return (
    <div className="app">
      <header>
        <h1>Local &amp; Experiences <span>Jaipur</span></h1>
        <nav className="tabs" aria-label="View">
          <button className={view === "traveler" ? "on" : ""} aria-pressed={view === "traveler"} onClick={() => setView("traveler")}>Traveler</button>
          <button className={view === "provider" ? "on" : ""} aria-pressed={view === "provider"} onClick={() => setView("provider")}>Provider</button>
        </nav>
        <label className="clock">Demo clock
          <input type="datetime-local" value={clock} onChange={(e) => setClock(e.target.value)} />
        </label>
      </header>

      {view === "provider" ? <ProviderView catalog={catalog} clock={clock} onChanged={loadCatalog} /> : <>
      <aside className="side">
        <section className="panel chat" aria-live="polite">
          <h2>Tell us your situation</h2>
          <div className="msgs">
            {msgs.length === 0 && <p className="muted">Who's with you, where you are, how long you have, your budget and what you're in the mood for.</p>}
            {msgs.map((m, i) => <p key={i} className={`msg ${m.role}`}>{m.text}</p>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Your request" />
            <button disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send"}</button>
          </form>
          <div className="examples">
            {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => setText(ex)} type="button">{ex.slice(0, 38)}…</button>)}
          </div>
        </section>

        {state && (
          <section className="panel">
            <h2>Your situation</h2>
            <div className="chips">
              <span className="chip">🕓 {hhmm(state.window_start)}–{hhmm(state.window_end)}</span>
              <span className="chip">₹{spent} / ₹{state.budget_inr}</span>
              <span className="chip">👥 {state.group.length}</span>
              <span className="chip">🚗 {state.mode}</span>
              {state.pace !== "normal" && <span className="chip">pace: {state.pace}</span>}
              {state.weather !== "clear" && <span className="chip warn">weather: {state.weather}</span>}
              {state.avoid_crowds && <span className="chip">avoid crowds</span>}
              {state.indoor_only && <span className="chip">indoors only</span>}
              {state.intents.map((t) => <span key={t} className="chip tag">{t}</span>)}
            </div>
          </section>
        )}

        {state && (
          <section className="panel">
            <h2>Something changed?</h2>
            <p className="muted">Replans only the affected stops, from the demo clock time.</p>
            <div className="events">
              <button disabled={busy} onClick={() => trigger({ kind: "delay", delay_min: 40 })}>Running 40 min late</button>
              <button disabled={busy} onClick={() => trigger({ kind: "weather", weather: "rain" })}>It started raining</button>
              <button disabled={busy || !upcoming.length} onClick={() => trigger({ kind: "closure", experience_id: upcoming[0].experience_id! })}>
                Next stop closed
              </button>
              <button disabled={busy} onClick={() => trigger({ kind: "fatigue" })}>We're tired</button>
              <button disabled={busy} onClick={() => trigger({ kind: "budget_change", budget_inr: 300 })}>Only ₹300 left</button>
            </div>
            {changes && (
              <ul className="changes">
                {changes.length === 0 && <li className="muted">Nothing in your plan is affected.</li>}
                {changes.map((c, i) => (
                  <li key={i} className={`change ${c.action}`}>
                    <strong>{c.action.replace("_", " ")}</strong> {c.stop}
                    <div className="muted">because {c.reason}</div>
                    {c.new_stop && <div>→ {c.new_stop}</div>}
                    {c.why.length > 0 && <div className="muted small">{c.why.slice(0, 3).join(" · ")}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </aside>

      <main>
        {error && <p className="error" role="alert">{error}</p>}
        <MapView state={state} recs={recs} stops={itinerary.stops} />

        <div className="cols">
          <section className="panel">
            <h2>Recommended now</h2>
            {!state && <p className="muted">Send a message to see options that actually fit.</p>}
            {state && recs.length === 0 && <p className="muted">Nothing fits these constraints. See "why not" below.</p>}
            <ol className="recs">
              {recs.map((r) => (
                <li key={r.experience_id} className="card">
                  <div className="card-head">
                    <h3>{r.title}</h3>
                    {r.low_confidence && <span className="badge warn" title="Some details are unverified or stale">low confidence</span>}
                  </div>
                  <p className="meta">{hhmm(r.start)}–{hhmm(r.end)} · {r.cost_inr ? `₹${r.cost_inr}` : "free"} · {r.km} km</p>
                  <ul className="reasons">{r.reasons.slice(3).map((x) => <li key={x}>{x}</li>)}</ul>
                  <button disabled={busy || planned.has(r.experience_id)} onClick={() => addToPlan(r)}>
                    {planned.has(r.experience_id) ? "In plan" : "Add to plan"}
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel">
            <h2>Your plan</h2>
            {itinerary.stops.length === 0 && <p className="muted">No stops yet.</p>}
            <ol className="timeline">
              {itinerary.stops.map((s, i) => (
                <li key={`${s.title}-${s.start}-${i}`} className={`stop ${s.status}`}>
                  <span className="time">{hhmm(s.start)}–{hhmm(s.end)}</span>
                  <span className="stop-title">{s.title}</span>
                  <span className="stop-meta">{s.cost_inr ? `₹${s.cost_inr}` : "free"}{s.status !== "proposed" && ` · ${s.status}`}</span>
                  {LIVE(s) && s.status !== "completed" && (
                    <span className="stop-actions">
                      <button className="icon" aria-label={s.locked ? "Unlock" : "Lock"} title={s.locked ? "Locked: replanning won't move it" : "Lock this stop"}
                        onClick={() => replan(itinerary.stops.map((x) => x === s ? { ...x, locked: !x.locked } : x), 0)}>{s.locked ? "🔒" : "🔓"}</button>
                      <button className="icon" aria-label="Remove" title="Remove"
                        onClick={() => replan(itinerary.stops.filter((x) => x !== s), 0)}>✕</button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {state && (
              <button disabled={busy} onClick={() => replan(itinerary.stops, 3)}>Fill free time</button>
            )}
            {problems.length > 0 && <ul className="problems">{problems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>}
            {state && problems.length === 0 && itinerary.stops.length > 0 && <p className="ok">✓ Every stop is reachable, open and within budget.</p>}
          </section>
        </div>

        {Object.keys(excluded).length > 0 && (
          <details className="panel why-not">
            <summary>Why not the others? ({Object.keys(excluded).length} ruled out)</summary>
            <ul>{Object.entries(excluded).map(([id, rs]) => <li key={id}><strong>{title(id)}</strong>: {rs.join("; ")}</li>)}</ul>
          </details>
        )}
      </main>
      </>}
    </div>
  );
}
