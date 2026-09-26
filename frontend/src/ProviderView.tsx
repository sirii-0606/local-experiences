import { useEffect, useState } from "react";
import { api } from "./api";
import type { Catalog, Insights, ListingDraft } from "./api";

const EXAMPLE = "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Our family has made bangles for five generations. Visitors can watch and make their own bangle, 45 minutes, ₹250 per person, open 11am to 7pm, closed on Friday. Kids welcome, up to 6 people.";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

// Provider side (doc §10): describe -> review draft -> publish; then see who wanted it and why not.
export default function ProviderView({ catalog, clock, onChanged }: { catalog: Catalog | null; clock: string; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(EXAMPLE);
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [parser, setParser] = useState("");
  const [notice, setNotice] = useState("");
  // default to the provider's newest listing, else a seed example with interesting demand
  const [selected, setSelected] = useState(() => catalog?.provider_listings.at(-1) ?? "ex-cooking-class");
  const [ins, setIns] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const loadInsights = (id: string) => run(async () => setIns(await api.insights(id)));
  useEffect(() => { loadInsights(selected); }, [selected]);

  const makeDraft = () => run(async () => {
    const res = await api.draft(text);
    setDraft(res.draft);
    setParser(res.parser);
    setNotice("");
  });

  const publish = () => run(async () => {
    const res = await api.publish(draft!, `${clock}:00`);
    await onChanged();
    setNotice(`Live: "${res.experience.title}". Travelers near ${draft!.near} interested in ${draft!.tags.slice(0, 3).join(", ")} can now be matched with it.`);
    setDraft(null);
    setSelected(res.experience.id);
  });

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const mine = new Set(catalog?.provider_listings ?? []);
  const options = [...(catalog?.experiences ?? [])].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || a.title.localeCompare(b.title));
  const maxHour = Math.max(1, ...(ins?.start_hours.map(([, n]) => n) ?? []));

  return (
    <div className="provider">
      {error && <p className="error" role="alert">{error}</p>}
      <section className="panel">
        <h2>List your experience</h2>
        <p className="muted">Describe what you offer in your own words. We'll draft the listing; you check it before it goes live.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Describe your experience" />
        <button disabled={busy || !text.trim()} onClick={makeDraft}>Draft my listing</button>
        {notice && <p className="ok">✓ {notice}</p>}

        {draft && (
          <form className="draft" onSubmit={(e) => { e.preventDefault(); publish(); }}>
            <p className="muted small">Drafted by {parser === "llm" ? "Claude" : "the offline parser"}. Edit anything that's wrong.</p>
            <label>Title<input value={draft.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label>Your name / business<input value={draft.provider_name} onChange={(e) => set("provider_name", e.target.value)} /></label>
            <label className="wide">Description<textarea rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
            <label>Nearest landmark
              <select value={draft.near ?? ""} onChange={(e) => set("near", e.target.value || null)}>
                <option value="">Choose…</option>
                {catalog?.places.filter((p) => !p.id.startsWith("pl-u-")).map((p) => <option key={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Category
              <select value={draft.category} onChange={(e) => set("category", e.target.value)}>
                {catalog?.vocabulary.categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Minutes<input type="number" min={5} value={draft.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} /></label>
            <label>Price ₹<input type="number" min={0} value={draft.price_inr} onChange={(e) => set("price_inr", Number(e.target.value))} /></label>
            <label>Pricing
              <select value={draft.price_model} onChange={(e) => set("price_model", e.target.value as ListingDraft["price_model"])}>
                <option value="per_person">per person</option><option value="per_group">per group</option>
                <option value="free">free</option><option value="donation">donation</option>
              </select>
            </label>
            <label>Max group<input type="number" min={1} value={draft.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></label>
            <label>Minimum age<input type="number" min={0} value={draft.min_age} onChange={(e) => set("min_age", Number(e.target.value))} /></label>
            <label>Opens<input type="time" value={draft.open_time} onChange={(e) => set("open_time", e.target.value)} /></label>
            <label>Closes<input type="time" value={draft.close_time} onChange={(e) => set("close_time", e.target.value)} /></label>
            <fieldset className="wide"><legend>Open on</legend>
              {DAYS.map((d, i) => (
                <label key={d} className="check"><input type="checkbox" checked={draft.days.includes(i)} onChange={() => set("days", toggle(draft.days, i).sort())} />{d}</label>
              ))}
            </fieldset>
            <fieldset className="wide"><legend>What it's about (travelers are matched on these)</legend>
              <div className="chips">
                {catalog?.vocabulary.tags.map((t) => (
                  <button type="button" key={t} className={`chip ${draft.tags.includes(t) ? "on" : ""}`} aria-pressed={draft.tags.includes(t)}
                    onClick={() => set("tags", toggle(draft.tags, t))}>{t}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="wide"><legend>Good to know</legend>
              {catalog?.vocabulary.accessibility.map((a) => (
                <label key={a} className="check"><input type="checkbox" checked={draft.accessibility.includes(a)} onChange={() => set("accessibility", toggle(draft.accessibility, a))} />{a.replace("_", "-")}</label>
              ))}
              <label className="check"><input type="checkbox" checked={draft.indoor} onChange={(e) => set("indoor", e.target.checked)} />indoors</label>
              <label className="check"><input type="checkbox" checked={draft.weather_sensitive} onChange={(e) => set("weather_sensitive", e.target.checked)} />depends on weather</label>
              <label className="check"><input type="checkbox" checked={draft.community_led} onChange={(e) => set("community_led", e.target.checked)} />family / community run</label>
            </fieldset>
            <button className="wide" disabled={busy}>Publish</button>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Who wanted it, and why not</h2>
        <label className="pick">Experience
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {options.map((e) => <option key={e.id} value={e.id}>{mine.has(e.id) ? "★ " : ""}{e.title}</option>)}
          </select>
        </label>
        {ins && (
          <>
            <div className="stats">
              <div><strong>{ins.matching_searches}</strong><span>searches wanting this kind of thing</span></div>
              <div><strong>{ins.shown_to_matching}</strong><span>times you were recommended to them</span></div>
              <div><strong>{ins.with_kids}</strong><span>of those were families with kids</span></div>
            </div>
            <p className="muted">✓ {ins.accepted} added to a plan · ✕ {ins.passed} said "not for me"</p>
            {ins.searches === 0 &&<p className="muted">No traveler searches yet. Chat in the Traveler tab, then refresh.</p>}
            {ins.why_not_chosen.length > 0 && (
              <><h3>Why interested travelers didn't get you</h3>
                <ul className="bars">{ins.why_not_chosen.map(([r, n]) => <li key={r}><span>{r}</span><b>{n}</b></li>)}</ul></>
            )}
            {ins.tips.map((t) => <p key={t} className="tip">💡 {t}</p>)}
            {ins.start_hours.length > 0 && (
              <><h3>When they were free</h3>
                <div className="hours">{ins.start_hours.map(([h, n]) => (
                  <div key={h} title={`${n} searches`}><i style={{ height: `${(n / maxHour) * 60}px` }} /><span>{h}:00</span></div>
                ))}</div></>
            )}
            {ins.budget_per_person.length > 0 && <p className="muted">Budget per person: {ins.budget_per_person.map(([b, n]) => `${b} (${n})`).join(" · ")}</p>}
            {ins.also_wanted.length > 0 && <p className="muted">They also wanted: {ins.also_wanted.map(([t]) => t).join(", ")}</p>}
            <div className="row">
              <button disabled={busy} onClick={() => loadInsights(selected)}>Refresh</button>
              <button disabled={busy} className={ins.paused ? "" : "secondary"}
                onClick={() => run(async () => { await api.pause(selected, !ins.paused); await onChanged(); setIns(await api.insights(selected)); })}>
                {ins.paused ? "Resume bookings" : "Pause (not available today)"}
              </button>
            </div>
            <p className="muted small">Aggregates only: we never share who searched or where they were.</p>
          </>
        )}
      </section>
    </div>
  );
}
