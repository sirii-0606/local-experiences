import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth";
import { useClock } from "../clock";
import { v2 } from "../v2api";
import type { Trip, TripDraft } from "../types";

// Trips dashboard (P3): upcoming and past trips as postcards; open, rename, delete. Signed-in only.
// "Upcoming/past" follows the demo clock like the rest of the app.

const day = (s: string) => new Date(`${s}T00:00`);
export const tripDays = (t: Pick<TripDraft, "start_date" | "end_date">) =>
  Math.round((day(t.end_date).getTime() - day(t.start_date).getTime()) / 86_400_000) + 1;
const addDay = (s: string) => { const d = day(s); d.setDate(d.getDate() + 1); return d.toLocaleDateString("en-CA"); };
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function dateRange(a: string, b: string): string {
  if (!a || !b || Number.isNaN(day(a).getTime()) || Number.isNaN(day(b).getTime())) return "Pick your dates";
  const f = (s: string, o: Intl.DateTimeFormatOptions) => day(s).toLocaleDateString("en-IN", o);
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return a === b ? f(a, full) : `${f(a, { day: "numeric", month: "short" })} – ${f(b, full)}`;
}

export const toDraft = ({ id: _i, created: _c, updated: _u, ...d }: Trip): TripDraft =>
  ({ ...d, day_start: d.day_start.slice(0, 5), day_end: d.day_end.slice(0, 5) });

// The trip's cover: a block-printed fabric swatch (CSS only, no photos). Each trip gets one of four dyes.
export function Postcard({ t, dye = 0, big }: { t: Pick<TripDraft, "start_date" | "end_date">; dye?: number; big?: boolean }) {
  const n = tripDays(t);
  return (
    <div className={`postcard dye-${dye % 4}${big ? " big" : ""}`} aria-hidden="true">
      {Number.isFinite(n) && n > 0 && <span className="postcard-stamp">{n} {n === 1 ? "day" : "days"}</span>}
      <span className="postcard-city">Jaipur</span>
    </div>
  );
}

function status(t: Trip, today: string): string {
  if (t.end_date < today) return "Travelled";
  if (t.start_date <= today) return "Happening now";
  const d = tripDays({ start_date: today, end_date: t.start_date }) - 1;
  return d === 1 ? "Tomorrow" : `In ${d} days`;
}

function TripCard({ t, today, highlight, onChange, onDelete }: {
  t: Trip; today: string; highlight: boolean; onChange(t: Trip): void; onDelete(): void;
}) {
  const [title, setTitle] = useState<string | null>(null); // non-null = renaming
  const [error, setError] = useState("");
  const rename = async () => {
    if (!title?.trim() || title === t.title) { setTitle(null); return; }
    try { onChange(await v2.updateTrip(t.id, { ...toDraft(t), title: title.trim() })); setTitle(null); }
    catch (e) { setError(msg(e)); }
  };
  return (
    <article className={`trip-card${highlight ? " saved" : ""}${t.end_date < today ? " past" : ""}`}>
      <Link to={`/trips/${t.id}`} className="trip-cover" tabIndex={-1}><Postcard t={t} dye={t.id} /></Link>
      <div className="trip-body">
        <p className="eyebrow">{status(t, today)}</p>
        {title === null ? (
          <h3 className="display"><Link to={`/trips/${t.id}`}>{t.title}</Link></h3>
        ) : (
          <form className="rename" onSubmit={(e) => { e.preventDefault(); rename(); }}>
            <input aria-label="Trip name" autoFocus required maxLength={80} value={title}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setTitle(null)} />
            <button className="mini">Save</button>
          </form>
        )}
        <p className="trip-meta">{dateRange(t.start_date, t.end_date)}</p>
        <div className="trip-foot">
          <span className="avatars" title={t.travelers.map((p) => p.name).join(", ")}>
            {t.travelers.slice(0, 4).map((p, i) => <i key={i}>{p.name.trim()[0]?.toUpperCase() ?? "?"}</i>)}
            {t.travelers.length > 4 && <i>+{t.travelers.length - 4}</i>}
          </span>
          <span className="muted small">{t.travelers.length} {t.travelers.length === 1 ? "traveler" : "travelers"}</span>
          <span className="trip-budget">{inr(t.budget_inr)}</span>
        </div>
        <div className="trip-actions" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <Link className="button mini primary" to={t.itinerary?.stops?.length ? `/trips/${t.id}/itinerary` : `/trips/${t.id}/shortlist`}>
            {t.itinerary?.stops?.length ? "View Plan" : "Shortlist"}
          </Link>
          <Link className="button mini secondary" to={`/trips/${t.id}`}>Edit</Link>
          <button type="button" className="secondary mini" onClick={() => setTitle(t.title)}>Rename</button>
          <button type="button" className="icon mini" aria-label={`Delete ${t.title}`}
            onClick={() => window.confirm(`Delete "${t.title}"? This can't be undone.`) && onDelete()}>Delete</button>
        </div>
      </div>
    </article>
  );
}

export default function TripsPage() {
  const { user } = useAuth();
  const { clock } = useClock();
  const [params] = useSearchParams();
  const saved = Number(params.get("saved"));
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { v2.trips().then(setTrips).catch((e) => setError(msg(e))); }, []);

  const today = clock.slice(0, 10);
  const upcoming = trips?.filter((t) => t.end_date >= today) ?? [];
  const past = trips?.filter((t) => t.end_date < today).reverse() ?? [];
  const remove = async (t: Trip) => {
    try { await v2.deleteTrip(t.id); setTrips((ts) => ts!.filter((x) => x.id !== t.id)); } catch (e) { setError(msg(e)); }
  };
  const grid = (list: Trip[]) => (
    <div className="trip-grid">
      {list.map((t) => (
        <TripCard key={t.id} t={t} today={today} highlight={t.id === saved} onDelete={() => remove(t)}
          onChange={(n) => setTrips((ts) => ts!.map((x) => (x.id === n.id ? n : x)))} />
      ))}
    </div>
  );

  return (
    <section className="page trips">
      <div className="trips-hero">
        <div>
          <h1 className="display">{user ? `${user.display_name.split(" ")[0]}'s trips` : "Your trips"}</h1>
          <p className="lede">Multi-day plans that fit opening hours, travel time, your budget and everyone coming along.</p>
        </div>
        {!!trips?.length && <Link className="button" to="/trips/new">Plan a new trip</Link>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {saved > 0 && trips?.some((t) => t.id === saved) && (
        <p className="note" role="status">Trip saved. Choosing what to see from a shortlist, and where to stay, comes in the next update.</p>
      )}
      {trips === null && !error && <p className="muted">Loading your trips…</p>}
      {trips?.length === 0 && (
        <div className="trips-empty panel">
          <div className="postcard-stack" aria-hidden="true"><span className="postcard dye-2" /><span className="postcard dye-1" /><Postcard t={{ start_date: today, end_date: addDay(today) }} /></div>
          <div>
            <h2 className="display">No trips yet</h2>
            <p>Tell us when you're going, who's coming and what you'd hate to miss. Every suggestion is checked against opening hours, travel time and your budget first, and anything we're unsure about is flagged.</p>
            <Link className="button" to="/trips/new">Plan your first trip</Link>
            <p className="muted small">Just have an afternoon? <Link to="/">Explore</Link> plans the next few hours around you.</p>
          </div>
        </div>
      )}
      {upcoming.length > 0 && <><h2>Upcoming <span className="count">{upcoming.length}</span></h2>{grid(upcoming)}</>}
      {past.length > 0 && <><h2>Past trips <span className="count">{past.length}</span></h2>{grid(past)}</>}
    </section>
  );
}
