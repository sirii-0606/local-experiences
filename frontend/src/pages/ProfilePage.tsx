import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import { v2 } from "../v2api";
import type { Profile } from "../types";

// P1 profile shell: account facts, basic details, password, your data. Full preferences
// (interests, accessibility, travel style, companions) arrive with onboarding in P2.
export default function ProfilePage() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState("");

  useEffect(() => { v2.getProfile().then(setProfile).catch((e) => setError(String(e))); }, []);

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
        <label>Home city <span className="muted small">(used to suggest trains and flights)</span>
          <input maxLength={60} value={profile.home_city ?? ""} onChange={(e) => setProfile({ ...profile, home_city: e.target.value || null })} /></label>
        <p className="muted small">Interests, accessibility needs and travel style come with onboarding (next step). Only you can see them.</p>
        <button>Save</button>
      </form>

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
