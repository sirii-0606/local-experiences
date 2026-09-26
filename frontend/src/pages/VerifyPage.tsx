import { useState } from "react";
import { api } from "../api";
import type { ReviewReport } from "../api";
import { ReportView } from "../ReviewsPanel";

// Check any set of reviews (e.g. copied from another site) without saving anything.
// The examples are made up to show each check, and are labelled as such.
type Row = { at: string; rating: number; text: string };

const EXAMPLES: Record<string, { label: string; rows: () => Row[] }> = {
  burst: {
    label: "A bot burst",
    rows: () => [
      { at: "2026-06-02", rating: 4, text: "Room 12 was small but spotless. The shower pressure was weak after 9 pm. Ravi at the desk found us an auto for ₹80." },
      { at: "2026-07-15", rating: 3, text: "Decent stay. Breakfast was cold by 10, parking is tight, the lift took ages. Fair for ₹1800." },
      ...Array.from({ length: 12 }, (_, i) => ({ at: "2026-09-22", rating: 5, text: `Amazing stay, loved everything, staff were wonderful and the location is perfect! ${"★".repeat(i % 3)}` })),
    ],
  },
  ai: {
    label: "Machine-written praise",
    rows: () => [
      { at: "2026-08-01", rating: 5, text: "This wasn't just a stay — it was an experience. The staff were exceptionally attentive, and every detail was impeccable. Truly unforgettable." },
      { at: "2026-08-19", rating: 5, text: "Not merely a hotel, but a sanctuary — seamless service, world-class dining and breathtaking views. Highly recommend!" },
      { at: "2026-09-03", rating: 4, text: "The bed was firm and the AC rattled a bit, but Meena from housekeeping brought extra pillows. Tea was ₹40." },
    ],
  },
  repeated: {
    label: "The same claim, repeated",
    rows: () => [
      { at: "2026-05-04", rating: 5, text: "Great location, and the Sea Breeze rooftop restaurant downstairs is superb." },
      { at: "2026-05-20", rating: 5, text: "Pool was nice. Dinner at the Sea Breeze rooftop restaurant was the highlight." },
      { at: "2026-06-11", rating: 5, text: "Check-in was quick; the Sea Breeze rooftop restaurant has amazing seafood." },
      { at: "2026-07-02", rating: 5, text: "Clean rooms. Don't miss the Sea Breeze rooftop restaurant for sunset drinks." },
      { at: "2026-07-28", rating: 3, text: "The restaurant downstairs has been shut for ages, a sign says renovation. Room 7 was fine, ₹2200." },
    ],
  },
};

const blank = (): Row => ({ at: new Date().toISOString().slice(0, 10), rating: 5, text: "" });

export default function VerifyPage() {
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const check = async () => {
    setBusy(true); setError("");
    try {
      setReport(await api.checkReviews(rows.filter((r) => r.text.trim())
        .map((r) => ({ at: `${r.at}T12:00:00`, rating: r.rating, text: r.text.trim() }))));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page verify-page">
      <h2>Can you trust these reviews?</h2>
      <p className="muted">
        Paste reviews from anywhere. We look for what fake ones have in common: bursts on a single day,
        the same claim repeated, generic praise with no real detail, and machine-written style (long
        dashes, “not just X but Y”). 1★ and 5★ weigh less than a considered 3★. Nothing is saved.
      </p>
      <div className="verify-examples">
        <span className="muted small">Made-up examples:</span>
        {Object.entries(EXAMPLES).map(([k, ex]) => (
          <button key={k} type="button" className="chip" onClick={() => { setRows(ex.rows()); setReport(null); }}>{ex.label}</button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="verify-grid">
        <div className="panel verify-rows">
          {rows.map((r, i) => (
            <div key={i} className="verify-row">
              <input type="date" value={r.at} aria-label="Review date" onChange={(e) => update(i, { at: e.target.value })} />
              <select value={r.rating} aria-label="Stars" onChange={(e) => update(i, { rating: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
              </select>
              <textarea rows={2} value={r.text} placeholder="Review text" aria-label="Review text"
                onChange={(e) => update(i, { text: e.target.value })} />
              <button type="button" className="icon" aria-label="Remove review" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="secondary mini" onClick={() => setRows([...rows, blank()])}>+ Add a review</button>
            <button type="button" disabled={busy || !rows.some((r) => r.text.trim())} onClick={check}>{busy ? "Checking…" : "Check these reviews"}</button>
          </div>
        </div>
        <div className="panel">{report ? <ReportView report={report} /> : <p className="muted">The verdict appears here.</p>}</div>
      </div>
    </section>
  );
}
