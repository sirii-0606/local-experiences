import { useEffect, useState } from "react";
import { api } from "./api";
import type { ReviewReport } from "./api";

// How the review verification engine judged a set of reviews: the verdict, the trusted rating
// next to the naive one, and each review with its trust and the reasons behind it.
export function ReportView({ report }: { report: ReviewReport }) {
  const [all, setAll] = useState(false);
  const shown = all ? report.reviews : report.reviews.slice(0, 8);
  return (
    <div className="rv-report">
      <p className="rv-verdict">{report.verdict}</p>
      {report.total > 0 && (
        <div className="rv-ratings">
          <div><b>{report.rating_trusted?.toFixed(1) ?? "–"}★</b><span>trusted rating ({report.counted} counted)</span></div>
          <div className={report.rating_all !== report.rating_trusted ? "rv-naive" : ""}><b>{report.rating_all?.toFixed(1) ?? "–"}★</b><span>if every review counted</span></div>
          <div><b>{report.suspicious}</b><span>set aside</span></div>
          <div><b>{report.verified}</b><span>verified visits</span></div>
        </div>
      )}
      {report.bursts.map((b) => <p key={b} className="rv-burst">⚡ Burst: {b}</p>)}
      <ul className="rv-list">
        {shown.map((r) => (
          <li key={r.id} className={r.counted ? "" : "rv-out"}>
            <div className="rv-head">
              <span className="rv-stars" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
              {r.verified && <span className="chip up">✓ Verified visit</span>}
              <span className={`chip ${r.counted ? "tag" : "down"}`}>{r.counted ? "Counted" : "Not counted"}</span>
              <span className="rv-trust" title="How much we trust this review">
                <i style={{ width: `${Math.round(r.trust * 100)}%` }} />
              </span>
              <span className="muted small">{r.at.slice(0, 10)}</span>
            </div>
            {r.text && <p className="rv-text">{r.text}</p>}
            {r.flags.length > 0 && <ul className="rv-flags">{r.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
          </li>
        ))}
      </ul>
      {report.reviews.length > 8 && (
        <button type="button" className="secondary mini" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${report.reviews.length}`}
        </button>
      )}
    </div>
  );
}

// One experience's reviews, plus a form to add yours (a booking code makes it a verified visit).
export function ExperienceReviews({ experienceId, title, onClose }: { experienceId: string; title: string; onClose(): void }) {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.reviews(experienceId).then(setReport).catch((e) => setError(String(e))); }, [experienceId]);

  const submit = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const res = await api.postReview({ experience_id: experienceId, rating, text: text.trim(),
        ...(code.trim() ? { booking_code: code.trim() } : {}) });
      setReport(res.report);
      setNote(res.review.counted ? "Thanks! Your review counts towards the rating."
        : `Saved, but it isn't counted yet: ${res.review.flags[0] ?? "low trust"}.`);
      setRating(0); setText(""); setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="exp-modal-backdrop" style={{ zIndex: 3000 }} onClick={onClose}>
      <div className="exp-modal-card rv-modal" role="dialog" aria-label={`Reviews for ${title}`} onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <div>
            <h3>Reviews: {title}</h3>
            <p className="muted small">Checked for bot bursts, copy-paste praise and machine-written text.</p>
          </div>
          <button type="button" className="close-drawer-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {report ? <ReportView report={report} /> : <p className="muted">Loading…</p>}

        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h4>Been there? Add your review</h4>
          <div className="rv-star-pick" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} className={n <= rating ? "on" : ""}
                onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="What was it really like? Names, prices, the wait, the good and the annoying bits." />
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20}
            placeholder="Booking code (optional, makes it a verified visit)" />
          {note && <p className="ok">{note}</p>}
          <button disabled={busy || !rating}>{busy ? "Posting…" : "Post review"}</button>
        </form>
      </div>
    </div>
  );
}
