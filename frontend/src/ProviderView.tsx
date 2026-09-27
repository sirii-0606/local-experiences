import { useEffect, useState } from "react";
import { api, tokens } from "./api";
import type { Catalog, Insights, ListingDraft } from "./api";

const EXAMPLE = "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Our family has made bangles for five generations. Visitors can watch and make their own bangle, 45 minutes, ₹250 per person, open 11am to 7pm, closed on Friday. Kids welcome, up to 6 people.";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

// Provider side (doc §10): describe -> review draft -> publish; then see who wanted it and why not.
export default function ProviderView({ catalog, clock, onChanged }: { catalog: Catalog | null; clock: string; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(EXAMPLE);
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [parser, setParser] = useState("");
  const [fits, setFits] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  // default to the provider's newest listing, else a seed example with interesting demand
  const [selected, setSelected] = useState(() => catalog?.provider_listings.at(-1) ?? "ex-cooking-class");
  const [ins, setIns] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"list" | "insights">("list");
  const [allTags, setAllTags] = useState(false);

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
    setFits(res.fits ?? []);
    setNotice("");
  });

  const pinHere = () => {
    if (!navigator.geolocation) return setError("This browser can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setDraft((d) => (d ? { ...d, near: null, lat: pos.coords.latitude, lon: pos.coords.longitude } : d)),
      () => setError("Location wasn't shared. Pick a landmark or type the area instead."),
      { timeout: 10000 },
    );
  };

  const [editing, setEditing] = useState<string | null>(null);
  const publish = () => run(async () => {
    let id: string;
    if (editing) {
      const res = await api.updateListing(editing, draft!, `${clock}:00`);
      id = editing;
      setNotice(`Saved: "${res.experience.title}" is updated for travelers.`);
    } else {
      const res = await api.publish(draft!, `${clock}:00`);
      id = res.experience.id;
      tokens.set(id, res.edit_token); // only this browser can edit it later
      setNotice(`Live: "${res.experience.title}". Travelers near ${draft!.near ?? (draft!.area || "your pin")} interested in ${draft!.tags.slice(0, 3).join(", ")} can now be matched with it.`);
    }
    await onChanged();
    setDraft(null);
    setEditing(null);
    setSelected(id); // the effect on `selected` loads its insights (not the previous listing's)
    setIns(await api.insights(id));
    setTab("insights");
  });
  const startEdit = (id: string) => run(async () => {
    setDraft((await api.listing(id)).draft);
    setEditing(id);
    setParser("stored");
    setNotice("");
    setTab("list");
  });
  const remove = (id: string) => run(async () => {
    await api.deleteListing(id);
    await onChanged();
    setNotice("Listing removed. Travelers won't see it any more.");
    setSelected("ex-cooking-class");
  });

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const mine = new Set(catalog?.provider_listings ?? []);
  const options = [...(catalog?.experiences ?? [])].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || a.title.localeCompare(b.title));
  const maxHour = Math.max(1, ...(ins?.start_hours.map(([, n]) => n) ?? []));

  const tagsShown = allTags ? catalog?.vocabulary.tags ?? [] : draft?.tags ?? [];

  return (
    <div className="host">
      <header className="host-head">
        <h2>For hosts</h2>
        <p className="muted">Describe what you offer in your own words. We turn it into a listing, match it with the right travelers, and show you who wanted it and why they didn't book.</p>
        <div className="host-tabs" role="tablist" aria-label="Host tools">
          <button type="button" role="tab" aria-selected={tab === "list"} className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
            List an experience
          </button>
          <button type="button" role="tab" aria-selected={tab === "insights"} className={tab === "insights" ? "on" : ""} onClick={() => setTab("insights")}>
            Who wanted it
          </button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="host-notice" role="status">✓ {notice}</p>}

      {tab === "list" && (
        <>
          <section className="host-card">
            <div className="host-step"><span>1</span><h3>Describe it</h3></div>
            <p className="muted small">Who you are, what guests do, where, how long, the price and your hours. You check everything before it goes live.</p>
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Describe your experience" />
            <div className="host-actions start">
              <button type="button" disabled={busy || !text.trim()} onClick={makeDraft}>{busy && !draft ? "Drafting…" : "Draft my listing"}</button>
              {text !== EXAMPLE && <button type="button" className="link-btn" onClick={() => setText(EXAMPLE)}>Use the example</button>}
            </div>
          </section>

          {draft && (
            <form className="host-card host-draft" onSubmit={(e) => { e.preventDefault(); publish(); }}>
              <div className="host-step"><span>2</span><h3>{editing ? "Edit your listing" : "Check your listing"}</h3></div>
              <p className="muted small">
                {editing ? "You're editing your live listing." : `Drafted by ${parser === "llm" ? "the AI" : "the offline parser"}. Fix anything that's wrong.`}
              </p>
              {fits.length > 0 && (
                <p className="fits">We'll match it with {fits.map((f) => <span key={f} className="chip tag">{f}</span>)}</p>
              )}

              <fieldset className="host-group">
                <legend>Basics</legend>
                <label className="span-2">Title<input value={draft.title} onChange={(e) => set("title", e.target.value)} /></label>
                <label>Your name or business<input value={draft.provider_name} onChange={(e) => set("provider_name", e.target.value)} /></label>
                <label>Category
                  <select value={draft.category} onChange={(e) => set("category", e.target.value)}>
                    {catalog?.vocabulary.categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="span-2">Description<textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
              </fieldset>

              <fieldset className="host-group">
                <legend>Where</legend>
                <label>Nearest landmark
                  <select value={draft.near ?? ""} onChange={(e) => set("near", e.target.value || null)}>
                    <option value="">None of these (pin it instead)</option>
                    {catalog?.places.filter((p) => !p.id.startsWith("pl-u-")).map((p) => <option key={p.id}>{p.name}</option>)}
                  </select>
                </label>
                {!draft.near && (
                  <>
                    <label>Area and town<input value={draft.area ?? ""} placeholder="e.g. Versova, Mumbai" onChange={(e) => set("area", e.target.value)} /></label>
                    <div className="pin-row span-2">
                      <span className="muted small">
                        {draft.lat != null && draft.lon != null ? `📍 Pinned at ${draft.lat.toFixed(4)}, ${draft.lon.toFixed(4)}` : "No pin yet: travelers need one to find you."}
                      </span>
                      <button type="button" className="secondary mini" onClick={pinHere}>📍 Use where I am now</button>
                    </div>
                  </>
                )}
              </fieldset>

              <fieldset className="host-group">
                <legend>When</legend>
                <label>Opens<input type="time" value={draft.open_time} onChange={(e) => set("open_time", e.target.value)} /></label>
                <label>Closes<input type="time" value={draft.close_time} onChange={(e) => set("close_time", e.target.value)} /></label>
                <label>Takes (minutes)<input type="number" min={5} value={draft.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} /></label>
                <div className="span-2">
                  <span className="host-sub">Open on</span>
                  <div className="chips">
                    {DAYS.map((d, i) => (
                      <button key={d} type="button" className={`chip ${draft.days.includes(i) ? "on" : ""}`} aria-pressed={draft.days.includes(i)}
                        onClick={() => set("days", toggle(draft.days, i).sort())}>{d}</button>
                    ))}
                  </div>
                </div>
              </fieldset>

              <fieldset className="host-group">
                <legend>Price and group</legend>
                <label>Price ₹<input type="number" min={0} value={draft.price_inr} onChange={(e) => set("price_inr", Number(e.target.value))} /></label>
                <label>Charged
                  <select value={draft.price_model} onChange={(e) => set("price_model", e.target.value as ListingDraft["price_model"])}>
                    <option value="per_person">per person</option><option value="per_group">per group</option>
                    <option value="free">free</option><option value="donation">donation</option>
                  </select>
                </label>
                <label>Max group<input type="number" min={1} value={draft.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /></label>
                <label>Minimum age<input type="number" min={0} value={draft.min_age} onChange={(e) => set("min_age", Number(e.target.value))} /></label>
              </fieldset>

              <fieldset className="host-group">
                <legend>What it's about</legend>
                <div className="span-2">
                  <span className="host-sub">Travelers are matched on these{allTags ? "" : ` (${draft.tags.length} chosen)`}</span>
                  <div className="chips">
                    {tagsShown.map((t) => (
                      <button type="button" key={t} className={`chip ${draft.tags.includes(t) ? "on" : ""}`} aria-pressed={draft.tags.includes(t)}
                        onClick={() => set("tags", toggle(draft.tags, t))}>{t.replace(/-/g, " ")}</button>
                    ))}
                    <button type="button" className="link-btn" onClick={() => setAllTags(!allTags)}>{allTags ? "Done" : "Edit tags"}</button>
                  </div>
                </div>
              </fieldset>

              <fieldset className="host-group">
                <legend>Good to know</legend>
                <div className="host-checks span-2">
                  {catalog?.vocabulary.accessibility.map((a) => (
                    <label key={a} className="check"><input type="checkbox" checked={draft.accessibility.includes(a)} onChange={() => set("accessibility", toggle(draft.accessibility, a))} />{a.replace("_", "-")}</label>
                  ))}
                  <label className="check"><input type="checkbox" checked={draft.indoor} onChange={(e) => set("indoor", e.target.checked)} />indoors</label>
                  <label className="check"><input type="checkbox" checked={draft.weather_sensitive} onChange={(e) => set("weather_sensitive", e.target.checked)} />depends on weather</label>
                  <label className="check"><input type="checkbox" checked={draft.community_led} onChange={(e) => set("community_led", e.target.checked)} />family or community run</label>
                </div>
              </fieldset>

              <div className="host-actions">
                <button type="button" className="secondary" onClick={() => { setDraft(null); setEditing(null); }}>Cancel</button>
                <button disabled={busy}>{editing ? "Save changes" : "Publish"}</button>
              </div>
            </form>
          )}
        </>
      )}

      {tab === "insights" && (
        <section className="host-card">
          <label className="host-pick">Experience
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {options.map((e) => <option key={e.id} value={e.id}>{mine.has(e.id) ? "★ " : ""}{e.title}</option>)}
            </select>
          </label>

          {ins && (
            <>
              <div className="host-stats">
                <div><strong>{ins.matching_searches}</strong><span>searches wanting this kind of thing</span></div>
                <div><strong>{ins.shown_to_matching}</strong><span>times recommended to them</span></div>
                <div><strong>{ins.booked_people}</strong><span>people booked</span></div>
              </div>
              <p className="muted small">
                ✓ {ins.accepted} added to a plan · ✕ {ins.passed} said "not for me" · {ins.with_kids} were families with kids
                {ins.rating !== null && ` · ★ ${ins.rating.toFixed(1)} (${ins.review_count} reviews)`}
              </p>
              {ins.fits && ins.fits.length > 0 && (
                <p className="fits">Suits {ins.fits.map((f) => <span key={f} className="chip tag">{f}</span>)}</p>
              )}

              {ins.searches === 0 && <p className="host-empty">No traveler searches yet. Ask something on Explore, then come back and refresh.</p>}

              {ins.why_not_chosen.length > 0 && (
                <div className="host-block">
                  <h4>Why interested travelers didn't get you</h4>
                  <ul className="bars">{ins.why_not_chosen.map(([r, n]) => <li key={r}><span>{r}</span><b>{n}</b></li>)}</ul>
                  {ins.tips.map((t) => <p key={t} className="tip">💡 {t}</p>)}
                </div>
              )}

              {ins.start_hours.length > 0 && (
                <div className="host-block">
                  <h4>When they were free</h4>
                  <div className="hours">{ins.start_hours.map(([h, n]) => (
                    <div key={h} title={`${n} searches`}><i style={{ height: `${(n / maxHour) * 60}px` }} /><span>{h}:00</span></div>
                  ))}</div>
                </div>
              )}

              {(ins.budget_per_person.length > 0 || ins.also_wanted.length > 0) && (
                <div className="host-block">
                  {ins.budget_per_person.length > 0 && <p className="muted small">Budget per person: {ins.budget_per_person.map(([b, n]) => `${b} (${n})`).join(" · ")}</p>}
                  {ins.also_wanted.length > 0 && <p className="muted small">They also wanted: {ins.also_wanted.map(([t]) => t).join(", ")}</p>}
                </div>
              )}

              <div className="host-actions start">
                <button type="button" className="secondary" disabled={busy} onClick={() => loadInsights(selected)}>Refresh</button>
                {(!mine.has(selected) || tokens.get(selected)) && (
                  <button type="button" disabled={busy} className="secondary"
                    onClick={() => run(async () => { await api.pause(selected, !ins.paused); await onChanged(); setIns(await api.insights(selected)); })}>
                    {ins.paused ? "Resume bookings" : "Pause for today"}
                  </button>
                )}
                {mine.has(selected) && tokens.get(selected) && <>
                  <button type="button" disabled={busy} className="secondary" onClick={() => startEdit(selected)}>Edit listing</button>
                  <button type="button" disabled={busy} className="danger" onClick={() => remove(selected)}>Remove</button>
                </>}
              </div>
              {mine.has(selected) && !tokens.get(selected) && <p className="muted small">Listed from another browser: only its owner can edit, pause or remove it.</p>}
              <p className="muted small">Aggregates only: we never share who searched or where they were.</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
