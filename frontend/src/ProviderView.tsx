import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "./api";
import type { Catalog, Insights, ListingDraft } from "./api";
import { useAuth } from "./auth";
import type { AreaDemand, BookingRequestOut, HostListing } from "./types";
import { v2 } from "./v2api";

const EXAMPLE = "I'm Salim, a lac bangle maker in Maniharon ka Rasta near Tripolia Bazaar. Our family has made bangles for five generations. Visitors can watch and make their own bangle, 45 minutes, ₹250 per person, open 11am to 7pm, closed on Friday. Kids welcome, up to 6 people.";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const counts = (xs: [string, number][]) => xs.map(([t, n]) => `${t.replace(/-/g, " ")} (${n})`).join(" · ");
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

// Provider side (doc §10): describe -> review draft -> publish; then manage listings, answer
// booking requests, and see who wanted it, why not, and what travelers nearby found nothing for.
export default function ProviderView({ catalog, clock, onChanged }: { catalog: Catalog | null; clock: string; onChanged: () => Promise<void> }) {
  const { user, loading, refresh } = useAuth();
  const [text, setText] = useState(EXAMPLE);
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [parser, setParser] = useState("");
  const [fits, setFits] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [listings, setListings] = useState<HostListing[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [demand, setDemand] = useState<AreaDemand | null>(null);
  const [inbox, setInbox] = useState<BookingRequestOut[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"list" | "mine" | "requests">("list");
  const [allTags, setAllTags] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const loadHost = async () => {
    if (!user) return;
    const [ls, rq] = await Promise.all([v2.myListings(), v2.incomingRequests()]);
    setListings(ls);
    setInbox(rq);
    setSelected((s) => (s && ls.some((l) => l.experience_id === s) ? s : ls[0]?.experience_id ?? null));
  };
  useEffect(() => {
    if (!user) return;
    run(async () => {
      await loadHost();
      setTab((t) => (t === "list" ? "mine" : t)); // hosts land on their listings
    });
  }, [user?.id]);

  const current = listings.find((l) => l.experience_id === selected) ?? null;
  const loadInsights = () => run(async () => {
    if (!current) return;
    const [i, d] = await Promise.all([api.insights(current.experience_id), v2.areaDemand(current.lat, current.lon)]);
    setIns(i);
    setDemand(d);
  });
  useEffect(() => { setIns(null); setDemand(null); loadInsights(); }, [selected, listings.length]);

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
      setNotice(`Live: "${res.experience.title}". Travelers near ${draft!.near ?? (draft!.area || "your pin")} interested in ${draft!.tags.slice(0, 3).join(", ")} can now find it and ask to book.`);
    }
    await onChanged();
    await refresh(); // publishing makes a traveler a host
    await loadHost();
    setDraft(null);
    setEditing(null);
    setSelected(id);
    setTab("mine");
  });
  const startEdit = (id: string) => run(async () => {
    setDraft((await api.listing(id)).draft);
    setEditing(id);
    setParser("stored");
    setNotice("");
    setTab("list");
  });
  const remove = (id: string) => run(async () => {
    if (!confirm("Remove this listing? Travelers won't see it any more.")) return;
    await api.deleteListing(id);
    await onChanged();
    setNotice("Listing removed. Travelers won't see it any more.");
    setSelected(null);
    await loadHost();
  });
  const decide = (id: number, accept: boolean) => run(async () => {
    const r = await v2.decideRequest(id, accept);
    setNotice(accept
      ? `Accepted ${r.traveler_name}, ${people(r.people)}, ${when(r.start)}. Booking ${r.booking_code}.`
      : `Declined ${r.traveler_name}'s request.`);
    await loadHost();
  });

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const pending = inbox.filter((r) => r.status === "pending");
  const maxHour = Math.max(1, ...(ins?.start_hours.map(([, n]) => n) ?? []));
  const tagsShown = allTags ? catalog?.vocabulary.tags ?? [] : draft?.tags ?? [];
  const tabBtn = (id: typeof tab, label: ReactNode) => (
    <button type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
  );

  return (
    <div className="host">
      <header className="host-head">
        <h2>For hosts</h2>
        <p className="muted">Describe what you offer in your own words. We turn it into a listing, match it with the right travelers, and show you who wanted it and why they didn't book.</p>
        <div className="host-tabs" role="tablist" aria-label="Host tools">
          {tabBtn("list", "List an experience")}
          {tabBtn("mine", <>My listings{listings.length > 0 && ` (${listings.length})`}</>)}
          {tabBtn("requests", <>Requests{pending.length > 0 && <span className="badge">{pending.length}</span>}</>)}
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="host-notice" role="status">✓ {notice}</p>}

      {!user && tab !== "list" && (
        <section className="host-card host-empty">
          <p>Sign in to see your listings and booking requests on any device.</p>
          <div className="host-actions start">
            <Link className="button" to="/login?next=/provider">Sign in</Link>
            <Link className="button secondary" to="/register?next=/provider">Create an account</Link>
          </div>
        </section>
      )}

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
                {user
                  ? <button disabled={busy}>{editing ? "Save changes" : "Publish"}</button>
                  : <Link className="button" to="/login?next=/provider">{loading ? "…" : "Sign in to publish"}</Link>}
              </div>
              {!user && <p className="muted small">Listings belong to an account, so you can edit them and answer booking requests from any device.</p>}
            </form>
          )}
        </>
      )}

      {user && tab === "mine" && listings.length === 0 && (
        <section className="host-card host-empty">
          <p>No listings yet. Describe what you offer and it goes live in a minute.</p>
          <div className="host-actions start"><button type="button" onClick={() => setTab("list")}>List an experience</button></div>
        </section>
      )}

      {user && tab === "mine" && listings.length > 0 && (
        <>
          <ul className="host-listings">
            {listings.map((l) => (
              <li key={l.experience_id}>
                <button type="button" className={l.experience_id === selected ? "on" : ""} aria-pressed={l.experience_id === selected} onClick={() => setSelected(l.experience_id)}>
                  <strong>{l.title}</strong>
                  <span className="muted small">{l.place_name}{l.paused && " · paused"}</span>
                  {l.pending_requests > 0 && <span className="badge">{l.pending_requests} new</span>}
                </button>
              </li>
            ))}
          </ul>

          {current && ins && (
            <section className="host-card">
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

              {demand && (
                <div className="host-block">
                  <h4>Demand near you</h4>
                  {demand.searches < demand.min_searches ? (
                    <p className="muted small">
                      {demand.searches} {demand.searches === 1 ? "search" : "searches"} within about 5 km in the last 30 days. Details show from {demand.min_searches}, so no single traveler can be picked out.
                    </p>
                  ) : (
                    <>
                      <p className="muted small">{demand.searches} searches within about 5 km in the last 30 days.</p>
                      {demand.unmet.length > 0 && <p className="tip">🔎 Travelers found nothing for: {counts(demand.unmet)}. If you offer any of it, add it to your tags.</p>}
                      <p className="muted small">They asked for: {counts(demand.wanted)}</p>
                      <p className="muted small">Budget per person: {counts(demand.budget_per_person)} · Group size: {counts(demand.group_sizes)}</p>
                    </>
                  )}
                </div>
              )}

              <div className="host-actions start">
                <button type="button" className="secondary" disabled={busy} onClick={loadInsights}>Refresh</button>
                <button type="button" disabled={busy} className="secondary"
                  onClick={() => run(async () => { await api.pause(current.experience_id, !current.paused); await onChanged(); await loadHost(); })}>
                  {current.paused ? "Resume bookings" : "Pause for today"}
                </button>
                <button type="button" disabled={busy} className="secondary" onClick={() => startEdit(current.experience_id)}>Edit listing</button>
                <button type="button" disabled={busy} className="danger" onClick={() => remove(current.experience_id)}>Remove</button>
              </div>
              <p className="muted small">Aggregates only: we never share who searched or where they were.</p>
            </section>
          )}
        </>
      )}

      {user && tab === "requests" && (
        <section className="host-card">
          {inbox.length === 0 ? (
            <p className="host-empty">No booking requests yet. Travelers who find your listing on Explore can ask for a time.</p>
          ) : (
            <ul className="requests">
              {[...pending, ...inbox.filter((r) => r.status !== "pending")].map((r) => (
                <li key={r.id} className="request">
                  <div>
                    <strong>{r.traveler_name}</strong> · {people(r.people)} · {when(r.start)}
                    <div className="muted small">{r.title}</div>
                    {r.note && <p className="request-note">“{r.note}”</p>}
                  </div>
                  {r.status === "pending" ? (
                    <div className="host-actions start">
                      <button type="button" disabled={busy} onClick={() => decide(r.id, true)}>Accept</button>
                      <button type="button" disabled={busy} className="secondary" onClick={() => decide(r.id, false)}>Decline</button>
                    </div>
                  ) : (
                    <span className={`status ${r.status}`}>{r.status}{r.booking_code && ` · ${r.booking_code}`}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="host-actions start">
            <button type="button" className="secondary" disabled={busy} onClick={() => run(loadHost)}>Refresh</button>
          </div>
          <p className="muted small">You see the traveler's name, party size, time and note: never their email or location.</p>
        </section>
      )}
    </div>
  );
}
