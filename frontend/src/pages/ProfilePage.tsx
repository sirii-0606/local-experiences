import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { v2 } from "../v2api";
import type { Profile, ProfileContext } from "../types";

const list = (xs: string[]) => (xs.length ? xs.map((x) => x.replace(/[-_]/g, " ")).join(", ") : "not set");

// Account, preferences (edited through onboarding), what the planner has learned about you
// (visible and correctable, doc §12.2), password, and your data.
export default function ProfilePage() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState("");

  const [ctx, setCtx] = useState<ProfileContext | null>(null);
  const [pastTrip, setPastTrip] = useState("");

  useEffect(() => {
    v2.getProfile().then(setProfile).catch((e) => setError(String(e)));
    v2.context().then(setCtx).catch(() => setCtx(null));
  }, []);

  const act = async (fn: () => Promise<void>) => {
    setError(""); setNote("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const save = () => act(async () => { setProfile(await v2.putProfile(profile!)); await refresh(); setNote("Saved."); });
  const download = () => act(async () => {
    const blob = new Blob([JSON.stringify(await v2.exportData(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "my-local-experiences-data.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (!user || !profile) return <section className="page narrow"><p className="muted">Loading…</p>{error && <p className="error">{error}</p>}</section>;
  return (
    <section className="page narrow">
      <h2>Your profile</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="ok" role="status">{note}</p>}

      <div className="panel">
        <h3>Account</h3>
        <dl className="facts">
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Role</dt><dd>{user.role}</dd>
          <dt>Member since</dt><dd>{user.created.slice(0, 10)}</dd>
        </dl>
      </div>

      <form className="panel form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h3>About you</h3>
        <label>Name<input required maxLength={60} value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></label>
        <label>Home city <span className="muted small">(where we plan when you don't say where you are)</span>
          <input maxLength={60} value={profile.home_city ?? ""} onChange={(e) => setProfile({ ...profile, home_city: e.target.value || null })} /></label>
        <button>Save</button>
      </form>

      <div className="panel">
        <h3>Your preferences</h3>
        <dl className="facts">
          <dt>Enjoys</dt><dd>{list(profile.interests)}</dd>
          <dt>Would rather skip</dt><dd>{list(profile.dislikes)}</dd>
          <dt>Pace</dt><dd>{profile.pace}{profile.needs_rest_breaks ? ", with rest breaks" : ""}</dd>
          <dt>Age</dt><dd>{profile.age ?? "not set"}</dd>
          <dt>Gets around by</dt><dd>{list(profile.transport)}</dd>
          <dt>Needs</dt><dd>{list(profile.accessibility)}</dd>
          <dt>Travels with</dt><dd>{profile.companions.length ? profile.companions.map((c) => c.name + (c.age !== null ? ` (${c.age})` : "")).join(", ") : "not set"}</dd>
          <dt>Crowds / hidden gems</dt><dd>{profile.avoid_crowds ? "avoids crowds" : "crowds are fine"} · {profile.hidden_gems ? "prefers hidden gems" : "famous places are fine"}</dd>
        </dl>
        <Link to="/onboarding" className="button mini">Edit preferences</Link>
      </div>

      <div className="panel form ctx-panel">
        <h3>What we've learned about you</h3>
        <p className="muted small">
          From your chats, the places you liked or passed on, trips you saved and itineraries you shared.
          It shapes what we suggest first. Remove anything that's wrong.
        </p>
        {ctx?.summary && <p className="ctx-summary">“{ctx.summary}”</p>}
        {ctx && ctx.entries.length + ctx.from_trips.length === 0 && <p className="muted">Nothing yet. Chat with the planner or share a past trip below.</p>}
        {ctx && ctx.entries.length > 0 && (
          <ul className="ctx-list">
            {ctx.entries.map((e) => (
              <li key={e.tag}>
                <span className={`chip ${e.weight > 0 ? "up" : "down"}`}>{e.weight > 0 ? "likes" : "avoids"} {e.tag.replace(/-/g, " ")}</span>
                <span className="ctx-bar" title={`${e.weight > 0 ? "+" : ""}${e.weight}`}><i className={e.weight > 0 ? "pos" : "neg"} style={{ width: `${Math.abs(e.weight) * 100}%` }} /></span>
                <span className="muted small">from {e.source}</span>
                <button type="button" className="icon" aria-label={`Forget ${e.tag}`}
                  onClick={() => act(async () => { await v2.forgetContext(e.tag); setCtx(await v2.context()); })}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {ctx && ctx.from_trips.length > 0 && (
          <p className="muted small">From your saved trips: {ctx.from_trips.map((e) => `${e.weight > 0 ? "+" : "−"}${e.tag}`).join(" · ")}</p>
        )}
        <label>Share a past trip
          <textarea rows={3} maxLength={4000} value={pastTrip} onChange={(e) => setPastTrip(e.target.value)}
            placeholder="e.g. Udaipur in March: the palace museum, a boat at sunset, a cooking class. Skipped the shopping." />
        </label>
        <div className="row">
          <button type="button" disabled={!pastTrip.trim()} onClick={() => act(async () => {
            setCtx(await v2.importContext(pastTrip.trim())); setPastTrip(""); setNote("Added to what we know about you.");
          })}>Learn from this trip</button>
          {ctx && ctx.entries.length > 0 && (
            <button type="button" className="secondary" onClick={() => act(async () => { await v2.forgetContext(); setCtx(await v2.context()); })}>
              Forget everything learned
            </button>
          )}
        </div>
      </div>

      <form className="panel form" onSubmit={(e) => { e.preventDefault(); act(async () => {
        await v2.changePassword(pw.current, pw.next); setPw({ current: "", next: "" }); setNote("Password changed. Other devices were signed out.");
      }); }}>
        <h3>Change password</h3>
        <label>Current password<input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label>New password<input type="password" autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
        <button>Change password</button>
      </form>

      <div className="panel form">
        <h3>Your data</h3>
        <p className="muted small">Download everything we hold about you, or delete your account and all of it permanently.</p>
        <button type="button" className="secondary" onClick={download}>⬇ Download my data</button>
        <label>Type your password to delete your account
          <input type="password" autoComplete="current-password" value={del} onChange={(e) => setDel(e.target.value)} /></label>
        <button type="button" className="danger" disabled={!del} onClick={() => act(async () => {
          await v2.deleteAccount(del); await signOut().catch(() => {}); navigate("/");
        })}>Delete my account permanently</button>
      </div>
    </section>
  );
}
