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
  return `Understood (${parser === "llm" ? "Claude" : "offline parser"}): ${hhmm(s.window_start)}–${hhmm(s.window_end)}, ` +
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

  const replan = (stops: Stop[], maxNew: number, add?: string) => run(async () => {
    const p = await api.plan(state!, { stops }, maxNew, add);
    setItinerary(p.itinerary);
    setProblems(p.problems);
  });

  // The engine picks the time: first gap where it's reachable, open and in budget.
  // Adding is also an explicit "accept": it teaches the ranking what this traveler likes.
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

  // State edited by the traveler (group, forgotten preferences): re-rank and re-check the plan.
  const applyState = (next: TravelerState) => run(async () => {
    const [d, p] = await Promise.all([api.discover(next), api.plan(next, itinerary, 0)]);
    setState(next);
    setRecs(d.recommendations);
    setExcluded(d.excluded);
    setItinerary(p.itinerary);
    setProblems(p.problems);
  });
  // Booking stub: holds spots (no payment), confirms and locks the stop.
  const [planNote, setPlanNote] = useState("");
  const bookStop = (s: Stop) => run(async () => {
    const b = await api.book(state!, itinerary, s.experience_id!);
    setItinerary(b.itinerary);
    setPlanNote(`🎟 Booked ${s.title} for ${b.people} at ${hhmm(b.start)}. Reference ${b.code}. The stop is now locked.`);
  });
  // Post-visit rating: good visits become traveler evidence, so confidence goes up for everyone.
  const rateStop = (s: Stop, value: string) => run(async () => {
    const [stars, flag] = value.split("-");
    const f = await api.rate(state!, s.experience_id!, Number(stars), flag !== "no", `${clock}:00`);
    setState(f.state);
    setRecs(f.recommendations);
    setExcluded(f.excluded);
    setPlanNote(`Thanks! Your rating of ${s.title} now helps other travelers.`);
  });

  // A different traveler / trip: nothing (group, locked stops, learned taste) carries over.
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
  // Same numbering as the map pins: plan stops A, B, C…; other recommendations 1, 2, 3…
  const stopLetter = new Map(liveStops.map((s, i) => [s.experience_id ?? s.title, String.fromCharCode(65 + i)]));
  const recNum = new Map(recs.filter((r) => !planned.has(r.experience_id)).map((r, i) => [r.experience_id, i + 1]));
  const category = (id: string | null) => catalog?.experiences.find((e) => e.id === id)?.category ?? "";

  return (
    <>
      <div className={`busy-bar ${busy ? "on" : ""}`} aria-hidden="true" />
      <aside className="side">
        <section className="panel chat" aria-live="polite">
          <h2 style={{ justifyContent: "space-between" }}>Tell us your situation
            {state && <button type="button" className="secondary mini" onClick={newTrip} title="Start over as a different traveler">↺ New trip</button>}
          </h2>
          <div className="msgs">
            {msgs.length === 0 && <p className="muted">Who's with you, where you are, how long you have, your budget and what you're in the mood for.</p>}
            {msgs.map((m, i) => <p key={i} className={`msg ${m.role}`}>{m.text}</p>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Your request"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); send(text.trim()); } }} />
            <button disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send"}</button>
          </form>
          <div className="examples">
            {EXAMPLES.map((ex) => <button key={ex} className="chip" title={ex} onClick={() => setText(ex)} type="button">{ex.slice(0, 38)}…</button>)}
          </div>
        </section>

        {state && (
          <section className="panel">
            <h2>Your situation</h2>
            <div className="chips">
              <span className="chip">🕓 {hhmm(state.window_start)}–{hhmm(state.window_end)}</span>
              <span className={`chip ${spent > state.budget_inr ? "warn" : ""}`}>💰 ₹{spent} of ₹{state.budget_inr}</span>
              <span className="chip">👥 {state.group.length}</span>
              <span className="chip">{state.mode === "walk" ? "🚶" : state.mode === "car" ? "🚗" : "🛺"} {state.mode}</span>
              {state.pace !== "normal" && <span className="chip">pace: {state.pace}</span>}
              {state.weather !== "clear" && <span className="chip warn">{ICON[state.weather as keyof typeof ICON]} {state.weather}</span>}
              {state.avoid_crowds && <span className="chip">avoid crowds</span>}
              {state.indoor_only && <span className="chip">indoors only</span>}
              {state.intents.map((t) => <span key={t} className="chip tag">{t}</span>)}
            </div>
            {Object.keys(state.learned).length > 0 && (
              <div className="learned">
                <span className="muted small">Learned from you (tap to forget):</span>
                <div className="chips">
                  {Object.entries(state.learned).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
                    <button key={t} type="button" className={`chip ${v > 0 ? "up" : "down"}`} onClick={() => forget(t)}
                      aria-label={`Forget that you ${v > 0 ? "like" : "dislike"} ${t}`}>{v > 0 ? "▲" : "▼"} {t} ✕</button>
                  ))}
                </div>
              </div>
            )}
            <GroupEditor key={JSON.stringify(state.group)} group={state.group} tags={catalog?.vocabulary.tags ?? []} busy={busy}
              onApply={(group) => applyState({ ...state, group })} />
          </section>
        )}
      </aside>

      <main>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="map-wrap">
          <MapView state={state} recs={recs} stops={itinerary.stops} />
          {state && (
            <div className="legend" aria-hidden="true">
              <span><i className="pin pin-you">●</i> you</span>
              <span><i className="pin pin-rec">1</i> option</span>
              <span><i className="pin pin-stop">A</i> in your plan</span>
            </div>
          )}
        </div>

        {!state && (
          <section className="panel welcome">
            <h2>Try it in 3 steps</h2>
            <ol className="steps">
              <li>
                <strong>Describe your situation.</strong> Who's with you, where, how long, your budget and what you feel like.
                <button disabled={busy} onClick={() => send(EXAMPLES[0])}>▶ Try the family example</button>
              </li>
              <li><strong>Change something.</strong> Late, rain, a closure, tired kids, less money: only the affected stops are replanned, and you see why.</li>
              <li><strong>Switch to 🏪 Provider.</strong> A local artisan lists themselves in their own words, goes live, and sees who wanted them and why they lost bookings.</li>
            </ol>
            <p className="muted small">Every option is checked for travel time, opening hours, budget for the whole group, ages, accessibility and weather, and it tells you why it was picked or ruled out.</p>
          </section>
        )}

        {state && (
        <div className="cols">
          <section className="panel">
            <h2>Recommended now <span className="count">{recs.length}</span></h2>
            {recs.length === 0 && <p className="muted">Nothing fits these constraints. See "why not" below.</p>}
            <ol className="recs">
              {recs.map((r) => {
                const inPlan = planned.has(r.experience_id);
                return (
                  <li key={r.experience_id} className={`card ${inPlan ? "in-plan" : ""}`}>
                    <div className="card-head">
                      <span className={`label ${inPlan ? "label-stop" : "label-rec"}`}>{inPlan ? stopLetter.get(r.experience_id) : recNum.get(r.experience_id)}</span>
                      <h3><span aria-hidden="true">{CAT_ICON[category(r.experience_id)] ?? "📍"}</span> {r.title}</h3>
                      {r.low_confidence && <span className="badge warn" title="Some details are unverified or stale">⚠ unverified</span>}
                    </div>
                    <p className="meta">🕓 {hhmm(r.start)}–{hhmm(r.end)} · {r.cost_inr ? `₹${r.cost_inr}` : "free"} · {r.travel_min ? `${r.travel_min} min away` : "right here"}</p>
                    <ul className="reasons">{r.reasons.slice(3).map((x) => <li key={x} className={x.startsWith("⚠") ? "caution" : ""}>{x.replace(/^⚠ /, "")}</li>)}</ul>
                    <div className="row">
                      {inPlan
                        ? <span className="in-plan-tag">✓ In your plan as stop {stopLetter.get(r.experience_id)}</span>
                        : <button disabled={busy} onClick={() => addToPlan(r)}>+ Add to plan</button>}
                      {!inPlan && (
                        <select className="pass" aria-label={`Not for me: ${r.title}`} value="" disabled={busy}
                          onChange={(e) => e.target.value && pass(r, e.target.value)}>
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

          <div className="stack">
            <section className="panel">
              <h2>Your plan</h2>
              {itinerary.stops.length === 0 && <p className="muted">No stops yet. Add an option, or let us fill your free time.</p>}
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
                          <select className="pass" aria-label={`Rate your visit to ${s.title}`} value="" disabled={busy}
                            onChange={(e) => e.target.value && rateStop(s, e.target.value)}>
                            <option value="">How was it?</option>
                            <option value="5">★★★★★ As listed, loved it</option>
                            <option value="4">★★★★ As listed, good</option>
                            <option value="3">★★★ As listed, okay</option>
                            <option value="2-no">★★ Not as described</option>
                            <option value="1-no">★ Not as described</option>
                          </select>
                        )}
                      </span>
                    )}
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
              <button className="secondary" disabled={busy} onClick={() => replan(itinerary.stops, 3)}>✨ Fill free time</button>
              {problems.length > 0 && <ul className="problems">{problems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>}
              {problems.length === 0 && itinerary.stops.length > 0 && <p className="ok">✓ Every stop is reachable, open and within budget.</p>}
              {planNote && <p className="note" role="status">{planNote}</p>}
            </section>

            <section className="panel">
              <h2>Something changed?</h2>
              <p className="muted small">We repair only the affected stops, from the demo clock time. Locked stops never move.</p>
              <div className="events">
                <button disabled={busy} onClick={() => trigger({ kind: "delay", delay_min: 40 })}>⏰ 40 min late</button>
                <button disabled={busy} onClick={() => trigger({ kind: "weather", weather: "rain" })}>🌧 It's raining</button>
                <button disabled={busy || !upcoming.length} onClick={() => trigger({ kind: "closure", experience_id: upcoming[0].experience_id! })}>🚫 Next stop closed</button>
                <button disabled={busy} onClick={() => trigger({ kind: "fatigue" })}>😴 We're tired</button>
                <button disabled={busy} onClick={() => trigger({ kind: "budget_change", budget_inr: 300 })}>💸 Only ₹300 left</button>
                <button disabled={busy} className="forecast" onClick={checkForecast}>🛰 Check live forecast</button>
              </div>
              {forecastCheck && (
                <div className="forecast-result" role="status">
                  {!forecastCheck.available && <p className="muted">Live forecast unavailable (offline). Use the buttons above to simulate.</p>}
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
            <ul>{Object.entries(excluded).map(([id, rs]) => <li key={id}><strong>{title(id)}</strong>: {rs.join("; ")}</li>)}</ul>
          </details>
        )}
      </main>
    </>
  );
}
