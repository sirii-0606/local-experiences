import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import { v2 } from "../v2api";
import type { Companion, Profile, Question } from "../types";

// Onboarding (doc §13.1): the backend's questions (GET /me/onboarding), a few per step, every
// answer optional. Saved into the profile; the last step can import a past trip as context.
const PER_STEP = 3;
const TAG_LABEL = (t: string) => t.replace(/-/g, " ");

export default function OnboardingPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);
  const [pastTrip, setPastTrip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([v2.onboarding(), v2.getProfile()])
      .then(([q, p]) => { setQuestions(q); setProfile(p); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!profile) return <section className="page narrow"><p className="muted">Loading…</p>{error && <p className="error">{error}</p>}</section>;

  const steps = Math.ceil(questions.length / PER_STEP);
  const last = step >= steps; // the "past trip" step
  const shown = questions.slice(step * PER_STEP, step * PER_STEP + PER_STEP);
  const value = (id: string) => (profile as unknown as Record<string, unknown>)[id];
  const set = (id: string, v: unknown) => setProfile({ ...profile, [id]: v } as Profile);

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      await v2.putProfile({ ...profile, companions: profile.companions.filter((c) => c.name.trim()) });
      if (pastTrip.trim()) {
        try { await v2.importContext(pastTrip.trim()); }
        catch { /* nothing usable in the text: the profile is still saved */ }
      }
      await refresh();
      navigate("/explore");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page narrow onboarding">
      <div className="onb-progress" aria-label={`Step ${Math.min(step + 1, steps + 1)} of ${steps + 1}`}>
        {Array.from({ length: steps + 1 }, (_, i) => <i key={i} className={i <= step ? "on" : ""} />)}
      </div>
      <h2>{last ? "One last thing (optional)" : step === 0 ? "Let's get to know you" : "A little more"}</h2>
      <p className="muted small">
        Everything is optional and only you can see it. You can change it any time in your profile.
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="panel form">
        {!last && shown.map((q) => (
          <div key={q.id} className="onb-q">
            <span className="onb-q-text">{q.text}</span>
            <span className="muted small">{q.why}</span>
            <Answer q={q} value={value(q.id)} onChange={(v) => set(q.id, v)} />
          </div>
        ))}
        {last && (
          <label>
            Paste a past trip or itinerary, in your own words. We'll learn what you liked and what you skipped.
            <textarea rows={5} maxLength={4000} value={pastTrip} onChange={(e) => setPastTrip(e.target.value)}
              placeholder="e.g. Goa last winter: the old churches, the fort at sunset, beach shacks. Skipped the nightlife." />
          </label>
        )}
      </div>

      <div className="onb-nav">
        {step > 0 && <button type="button" className="secondary" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="secondary" onClick={() => navigate("/explore")}>Skip for now</button>
        {last
          ? <button type="button" disabled={busy} onClick={finish}>{busy ? "Saving…" : "Finish and start planning"}</button>
          : <button type="button" onClick={() => setStep(step + 1)}>Next</button>}
      </div>
    </section>
  );
}

function Answer({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  if (q.kind === "multi" || q.kind === "single") {
    const picked = q.kind === "multi" ? ((value as string[]) ?? []) : value ? [value as string] : [];
    const full = q.kind === "multi" && q.max_choices !== null && picked.length >= q.max_choices;
    return (
      <div className="chips">
        {q.options.map((o) => {
          const on = picked.includes(o);
          return (
            <button key={o} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on}
              disabled={!on && full}
              onClick={() => q.kind === "single"
                ? onChange(on ? null : o)
                : onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}>
              {TAG_LABEL(o)}
            </button>
          );
        })}
        {q.max_choices && <span className="muted small">{picked.length}/{q.max_choices}</span>}
      </div>
    );
  }
  if (q.kind === "bool") {
    return (
      <div className="chips">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" className={`chip ${value === b ? "on" : ""}`} aria-pressed={value === b}
            onClick={() => onChange(b)}>{b ? "Yes" : "No"}</button>
        ))}
      </div>
    );
  }
  if (q.kind === "number") {
    return <input type="number" min={0} max={110} value={(value as number | null) ?? ""} aria-label={q.text}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  }
  if (q.kind === "text") {
    return <input maxLength={60} value={(value as string | null) ?? ""} aria-label={q.text}
      onChange={(e) => onChange(e.target.value || null)} />;
  }
  const people = (value as Companion[]) ?? [];
  const update = (i: number, c: Partial<Companion>) => onChange(people.map((p, j) => (j === i ? { ...p, ...c } : p)));
  return (
    <div className="onb-companions">
      {people.map((p, i) => (
        <div key={i} className="onb-companion">
          <input placeholder="Name" maxLength={60} value={p.name} aria-label="Companion name"
            onChange={(e) => update(i, { name: e.target.value })} />
          <input type="number" placeholder="Age" min={0} max={110} value={p.age ?? ""} aria-label="Companion age"
            onChange={(e) => update(i, { age: e.target.value === "" ? null : Number(e.target.value) })} />
          <button type="button" className="icon" aria-label={`Remove ${p.name || "companion"}`}
            onClick={() => onChange(people.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="secondary mini" onClick={() => onChange([...people,
        { name: "", age: null, interests: [], dislikes: [], accessibility: [], diet: null }])}>
        + Add someone
      </button>
    </div>
  );
}
