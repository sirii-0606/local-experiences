import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "./auth";
import { v2 } from "./v2api";

// Ask a host for a time slot (host listings only). The host accepts or declines in their inbox;
// an accepted request is a real booking whose code unlocks a verified-visit review.
export default function RequestBook({ experienceId, start, people }: { experienceId: string; start: string; people: number }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(start.slice(0, 16));
  const [count, setCount] = useState(people);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (result?.ok) return <p className="muted small" role="status">✓ {result.text} <Link to="/profile">See your requests</Link></p>;
  if (!open) return <button type="button" className="secondary mini" onClick={() => setOpen(true)}>Request to book</button>;
  if (!user) return <p className="muted small"><Link to="/login?next=/explore">Sign in</Link> to ask the host for a time.</p>;

  const send = async () => {
    setBusy(true);
    try {
      await v2.requestBooking({ experience_id: experienceId, start: `${when}:00`, people: count, note: note.trim() });
      setResult({ ok: true, text: "Request sent. The host will accept or decline." });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="request-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <div className="row">
        <label>When<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></label>
        <label>People<input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} required /></label>
      </div>
      <label>Note for the host (optional)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. first time, one child aged 8" /></label>
      {result && <p className="error" role="alert">{result.text}</p>}
      <div className="host-actions start">
        <button type="submit" className="mini" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
