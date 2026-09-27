import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useClock } from "../clock";
import { v2 } from "../v2api";
import type { Catalog, ExperienceItem } from "../api";
import type { Companion, Diet, Profile, StayType, TripDraft, TripTraveler } from "../types";
import { MAX_TRIP_DAYS } from "../types";
import { Postcard, dateRange, inr, msg, toDraft, tripDays } from "./TripsPage";
import { getExperiencePhoto } from "../photos";

// "Plan a trip" wizard (P3) at /trips/new, and the same screens to open/edit a trip at /trips/:id.
// Validation mirrors TripDraft in backend/app/schemas.py; the server has the final say.

const STEPS = ["Dates and budget", "Your stay", "Who's coming", "Must-sees and review"];
const ASK = ["When are you going?", "Where would you like to stay?", "Who's coming along?", "Anything you'd hate to miss?"];
const CITIES = [["Jaipur", "50 local experiences"], ["Udaipur", "Coming soon"], ["Jodhpur", "Coming soon"], ["Jaisalmer", "Coming soon"]];
const STAYS: [StayType, string, string][] = [
  ["any", "Surprise me", "We'll suggest the best fit"], ["hotel", "Hotel", "Front desk, fewer surprises"],
  ["homestay", "Homestay", "Stay with a local family"], ["hostel", "Hostel", "Social and easy on budget"]];
const ACCESS: [string, string][] = [["wheelchair", "Wheelchair"], ["step_free", "Step-free"], ["seating", "Needs seating"], ["quiet", "Quiet places"]];
const DIETS: [Diet, string][] = [["vegetarian", "Vegetarian"], ["non_vegetarian", "Non-veg"], ["vegan", "Vegan"], ["jain", "Jain"]];

const CAT_FILTERS: [string, string][] = [
  ["all", "All Sights"],
  ["culture", "🏛️ Heritage"],
  ["art", "🎨 Craft & Art"],
  ["food", "🍛 Food & Chai"],
  ["nature", "🌿 Nature & Views"],
  ["learning", "📚 Learning"],
  ["shopping", "🛍️ Bazaars"],
  ["nightlife", "🌙 Evening"],
  ["wellness", "🧘 Wellness"],
];

const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
};
const person = (c: Companion, is_me = false): TripTraveler => ({ ...c, interests: [...c.interests], dislikes: [...c.dislikes], accessibility: [...c.accessibility], is_me });
const fromProfile = (p: Profile): TripTraveler => person({ name: p.display_name, age: p.age, interests: p.interests, dislikes: p.dislikes, accessibility: p.accessibility, diet: p.diet }, true);
const month = (s: string) => new Date(`${s}T00:00`).toLocaleDateString("en-IN", { month: "long" });
const autoTitle = (d: TripDraft) => (d.start_date ? `Jaipur in ${month(d.start_date)}` : "Jaipur trip"); // dates show separately

function newDraft(p: Profile, today: string): TripDraft {
  const start = addDays(today, 7);
  const d: TripDraft = {
    title: "", destination: "jaipur", origin_city: p.home_city, start_date: start, end_date: addDays(start, 2),
    day_start: "09:30", day_end: "20:30", budget_inr: 20000, stay: { type: "any", max_per_night_inr: null, area: null },
    travelers: [fromProfile(p)], use_my_prefs_for_all: false, must_see: [],
  };
  return { ...d, title: autoTitle(d) };
}

// What's wrong with a step, in words (empty = fine to continue).
function problems(d: TripDraft, step: number): string[] {
  const out: string[] = [];
  if (step === 0) {
    const n = tripDays(d);
    if (!d.start_date || !d.end_date) out.push("Pick your dates.");
    else if (n < 1) out.push("The trip can't end before it starts.");
    else if (n > MAX_TRIP_DAYS) out.push(`Trips can be at most ${MAX_TRIP_DAYS} days for now.`);
    if (!d.day_start || !d.day_end || d.day_end <= d.day_start) out.push("Each day must end after it starts.");
    if (!(d.budget_inr >= 0)) out.push("Enter a budget (0 is fine for free things only).");
    if (!d.title.trim()) out.push("Give the trip a name.");
  }
  if (step === 2 && d.travelers.some((t) => !t.name.trim())) out.push("Every traveler needs a name.");
  return out;
}

// Tap to cycle: no preference → like → dislike.
function Taste({ tags, t, onChange }: { tags: string[]; t: TripTraveler; onChange(p: Partial<TripTraveler>): void }) {
  return (
    <div className="chips">
      {tags.map((tag) => {
        const s = t.interests.includes(tag) ? "up" : t.dislikes.includes(tag) ? "down" : "";
        const i = t.interests.filter((x) => x !== tag), d = t.dislikes.filter((x) => x !== tag);
        const next = s === "" ? { interests: [...i, tag], dislikes: d } : s === "up" ? { interests: i, dislikes: [...d, tag] } : { interests: i, dislikes: d };
        return (
          <button type="button" key={tag} className={`chip ${s}`} onClick={() => onChange(next)}
            aria-label={`${tag}: ${s === "up" ? "likes" : s === "down" ? "dislikes" : "no preference"}. Click to change.`}>
            {s === "up" ? "♥ " : s === "down" ? "✕ " : ""}{tag.replace(/-/g, " ")}
          </button>
        );
      })}
    </div>
  );
}

function TravelerCard({ t, tags, onChange, onRemove }: { t: TripTraveler; tags: string[]; onChange(p: Partial<TripTraveler>): void; onRemove?: () => void }) {
  const toggle = (a: string) => onChange({ accessibility: t.accessibility.includes(a) ? t.accessibility.filter((x) => x !== a) : [...t.accessibility, a] });
  return (
    <li className="traveler">
      <div className="traveler-head">
        <i className="avatar" aria-hidden="true">{t.name.trim()[0]?.toUpperCase() ?? "?"}</i>
        <label>Name<input required maxLength={60} value={t.name} onChange={(e) => onChange({ name: e.target.value })} /></label>
        <label className="age">Age<input type="number" min={0} max={110} value={t.age ?? ""} onChange={(e) => onChange({ age: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        <label>Food<select value={t.diet ?? ""} onChange={(e) => onChange({ diet: (e.target.value || null) as Diet | null })}>
          <option value="">No preference</option>
          {DIETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
        {t.is_me ? <span className="chip tag">You</span>
          : onRemove && <button type="button" className="icon" aria-label={`Remove ${t.name || "traveler"}`} onClick={onRemove}>✕</button>}
      </div>
      <fieldset className="access">
        <legend>Accessibility</legend>
        {ACCESS.map(([v, l]) => <label key={v} className="check"><input type="checkbox" checked={t.accessibility.includes(v)} onChange={() => toggle(v)} />{l}</label>)}
      </fieldset>
      <details>
        <summary>Likes and dislikes <span className="muted">({t.interests.length} liked, {t.dislikes.length} disliked)</span></summary>
        <p className="muted small">Tap once to like, twice to dislike, three times to clear.</p>
        <Taste tags={tags} t={t} onChange={onChange} />
      </details>
    </li>
  );
}

export default function TripWizard() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { clock } = useClock();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null | "offline">(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(editing ? STEPS.length - 1 : 0);
  const [titleTouched, setTitleTouched] = useState(editing);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mustSeeSearch, setMustSeeSearch] = useState("");
  const [mustSeeCategory, setMustSeeCategory] = useState("all");
  const [infoExp, setInfoExp] = useState<ExperienceItem | null>(null);

  useEffect(() => {
    v2.catalog().then(setCatalog).catch(() => setCatalog("offline"));
    Promise.all([v2.getProfile(), editing ? v2.trip(Number(id)) : null])
      .then(([p, t]) => { setProfile(p); setDraft(t ? toDraft(t) : newDraft(p, clock.slice(0, 10))); })
      .catch((e) => setError(msg(e)));
  }, [id]); // not on clock changes: the clock only seeds a new trip's dates

  if (!draft) {
    return <section className="page narrow">{error ? <><p className="error" role="alert">{error}</p><Link to="/trips">Back to your trips</Link></> : <p className="muted">Loading…</p>}</section>;
  }

  const set = (patch: Partial<TripDraft>) => setDraft((d) => {
    const n = { ...d!, ...patch };
    return titleTouched ? n : { ...n, title: autoTitle(n) };
  });
  const me = draft.travelers.find((t) => t.is_me);
  const withMine = (t: TripTraveler): TripTraveler => (t.is_me || !me ? t : { ...t, interests: [...me.interests], dislikes: [...me.dislikes], accessibility: [...me.accessibility], diet: me.diet });
  const setTraveler = (i: number, p: Partial<TripTraveler>) => {
    let ts = draft.travelers.map((t, j) => (j === i ? { ...t, ...p } : t));
    if (draft.use_my_prefs_for_all && ts[i].is_me) { const mine = ts[i]; ts = ts.map((t) => (t.is_me ? t : { ...t, interests: [...mine.interests], dislikes: [...mine.dislikes], accessibility: [...mine.accessibility], diet: mine.diet })); }
    set({ travelers: ts });
  };
  const addTraveler = (c?: Companion) => {
    const t = person(c ?? { name: "", age: null, interests: [], dislikes: [], accessibility: [], diet: null });
    set({ travelers: [...draft.travelers, draft.use_my_prefs_for_all && !c ? withMine(t) : t] });
  };

  const tags = catalog && catalog !== "offline" ? catalog.vocabulary.tags : [];
  const issues = problems(draft, step);
  const n = tripDays(draft);
  const people = draft.travelers.length;
  const perDay = n > 0 && people ? Math.round(draft.budget_inr / (n * people)) : 0;
  const titles = new Map(catalog && catalog !== "offline" ? catalog.experiences.map((e) => [e.id, e.title]) : []);
  const go = (s: number) => { setStep(s); setReached((r) => Math.max(r, s)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const save = async () => {
    const bad = [0, 2].flatMap((s) => problems(draft, s));
    if (bad.length) { setError(bad.join(" ")); return; }
    setBusy(true); setError("");
    try {
      const t = editing ? await v2.updateTrip(Number(id), draft) : await v2.createTrip(draft);
      navigate(`/trips/${t.id}/shortlist`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <section className="page wizard-page">
      <div className="trips-hero">
        <div>
          <p className="eyebrow"><Link to="/trips">Your trips</Link> / {editing ? "Edit trip" : "New trip"}</p>
          <h1 className="display">{editing ? draft.title : "Plan a trip"}</h1>
        </div>
      </div>

      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "on" : i <= reached ? "done" : ""}>
            <button type="button" disabled={i > reached} aria-current={i === step ? "step" : undefined} onClick={() => go(i)}>
              <b>{i + 1}</b><span>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wizard">
        <form className="panel form wizard-step" onSubmit={(e) => { e.preventDefault(); if (!issues.length) (step < 3 ? go(step + 1) : save()); }}>
          <h2 className="display step-title">{ASK[step]}</h2>

          {step === 0 && <>
            <fieldset className="choices cities">
              <legend>Where to?</legend>
              {CITIES.map(([c, sub]) => (
                <label key={c} className="choice"><input type="radio" name="city" checked={c === "Jaipur"} disabled={c !== "Jaipur"} readOnly />
                  <strong>{c}</strong><span>{sub}</span></label>
              ))}
            </fieldset>
            <div className="field-row">
              <label>First day<input type="date" required value={draft.start_date} onChange={(e) => set({ start_date: e.target.value, end_date: draft.end_date < e.target.value ? e.target.value : draft.end_date })} /></label>
              <label>Last day<input type="date" required min={draft.start_date} value={draft.end_date} onChange={(e) => set({ end_date: e.target.value })} /></label>
            </div>
            <p className="hint">{n > 0 && n <= MAX_TRIP_DAYS ? `${n} ${n === 1 ? "day" : "days"}, ${n - 1} ${n === 2 ? "night" : "nights"}` : `Up to ${MAX_TRIP_DAYS} days`}</p>
            <div className="field-row">
              <label>Out from<input type="time" required value={draft.day_start} onChange={(e) => set({ day_start: e.target.value })} /></label>
              <label>Back by<input type="time" required value={draft.day_end} onChange={(e) => set({ day_end: e.target.value })} /></label>
            </div>
            <p className="hint">Your daily window. We plan activities and travel inside it, and get you back to your stay.</p>
            <div className="field-row">
              <label>Total budget (₹)<input type="number" min={0} step={500} required value={Number.isNaN(draft.budget_inr) ? "" : draft.budget_inr} onChange={(e) => set({ budget_inr: e.target.valueAsNumber })} /></label>
              <label><span>Travelling from <span className="muted small">(optional)</span></span><input maxLength={60} placeholder="e.g. Mumbai" value={draft.origin_city ?? ""} onChange={(e) => set({ origin_city: e.target.value || null })} /></label>
            </div>
            <p className="hint">For activities, food and local travel{perDay > 0 && <>: about <b>{inr(perDay)}</b> per person per day</>}. Your stay has its own budget in the next step.</p>
            <label>Trip name<input required maxLength={80} value={draft.title} onChange={(e) => { setTitleTouched(true); setDraft({ ...draft, title: e.target.value }); }} /></label>

            {/* Weather & Climate Scenario Consideration */}
            <fieldset className="choices" style={{ marginTop: "1.2rem" }}>
              <legend>🌤 Weather Forecast &amp; Scenario Consideration</legend>
              {[
                { id: "clear", label: "☀️ Pleasant Clear (29°C)", desc: "Optimal conditions, open-air ramparts and sunset points", temp: 29.0, rain: 0.0, name: "Pleasant Clear" },
                { id: "rain", label: "🌧 Monsoon Cloudburst (35 mm/h)", desc: "Heavy rainfall simulation, adapts schedule with sheltered indoor craft/museum alternatives", temp: 28.5, rain: 35.0, name: "Monsoon Cloudburst" },
                { id: "heat", label: "🔥 Extreme Heatwave (43.8°C)", desc: "Severe heatwave simulation, prioritizes shaded courtyards & air-cooled galleries", temp: 43.8, rain: 0.0, name: "Extreme Heatwave" },
              ].map((w) => (
                <label key={w.id} className="choice">
                  <input
                    type="radio"
                    name="weather_scenario"
                    checked={(draft.weather || "clear") === w.id}
                    onChange={() => set({
                      weather: w.id,
                      weather_scenario_name: w.name,
                      weather_temp_c: w.temp,
                      weather_rain_mm_h: w.rain,
                    })}
                  />
                  <strong>{w.label}</strong>
                  <span>{w.desc}</span>
                </label>
              ))}
            </fieldset>
            <p className="hint">The Digital Twin engine uses this forecast to evaluate outdoor vulnerability and automatically schedule sheltered alternatives.</p>
          </>}

          {step === 1 && <>
            <fieldset className="choices">
              <legend>What kind of place?</legend>
              {STAYS.map(([v, l, sub]) => (
                <label key={v} className="choice"><input type="radio" name="stay" checked={draft.stay.type === v} onChange={() => set({ stay: { ...draft.stay, type: v } })} />
                  <strong>{l}</strong><span>{sub}</span></label>
              ))}
            </fieldset>
            <div className="field-row">
              <label><span>Up to, per night (₹) <span className="muted small">(optional)</span></span>
                <input type="number" min={0} step={250} placeholder="No limit" value={draft.stay.max_per_night_inr ?? ""} onChange={(e) => set({ stay: { ...draft.stay, max_per_night_inr: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
              <label><span>Area <span className="muted small">(optional)</span></span>
                <input maxLength={60} placeholder="Anywhere near my must-sees" value={draft.stay.area ?? ""} onChange={(e) => set({ stay: { ...draft.stay, area: e.target.value || null } })} /></label>
            </div>
            <p className="hint">Once you've picked what to see, we'll suggest three stays that fit your budget and access needs and are closest to your plans.</p>
          </>}

          {step === 2 && <>
            <label className="check big">
              <input type="checkbox" disabled={!me || people < 2} checked={draft.use_my_prefs_for_all}
                onChange={(e) => set({ use_my_prefs_for_all: e.target.checked, travelers: e.target.checked ? draft.travelers.map(withMine) : draft.travelers })} />
              <span>Use my preferences for everyone <span className="muted small">Copies your likes, dislikes, access needs and food onto the others. You can still edit each one.</span></span>
            </label>
            <ul className="travelers">
              {draft.travelers.map((t, i) => (
                <TravelerCard key={i} t={t} tags={tags} onChange={(p) => setTraveler(i, p)}
                  onRemove={people > 1 ? () => set({ travelers: draft.travelers.filter((_, j) => j !== i) }) : undefined} />
              ))}
            </ul>
            {catalog === "offline" && <p className="hint">Likes and dislikes load from the server, which isn't reachable right now.</p>}
            <div className="row">
              <button type="button" className="secondary" disabled={people >= 12} onClick={() => addTraveler()}>Add a traveler</button>
              {profile?.companions.filter((c) => !draft.travelers.some((t) => t.name === c.name)).map((c) => (
                <button type="button" key={c.name} className="chip" onClick={() => addTraveler(c)}>Add {c.name}</button>
              ))}
            </div>
            <p className="muted small">Ages, food and access needs are only used to plan this trip. Only you can see them.</p>
          </>}

          {step === 3 && <>
            <p className="hint">We plan around these first. Pick the sights you definitely want to visit in person (up to 20).</p>
            {catalog === null && <p className="muted">Loading experiences…</p>}
            {catalog === "offline" && <p className="hint">The experience list loads from the server, which isn't reachable right now. You can save and add must-sees later.</p>}
            {catalog && catalog !== "offline" && (() => {
              const query = mustSeeSearch.trim().toLowerCase();
              const filtered = catalog.experiences.filter((e) => {
                const matchesCat = mustSeeCategory === "all" || e.category === mustSeeCategory;
                const matchesSearch = !query || e.title.toLowerCase().includes(query) || (e.description && e.description.toLowerCase().includes(query)) || (e.tags && e.tags.some((t) => t.toLowerCase().includes(query)));
                return matchesCat && matchesSearch;
              });

              return (
                <div className="must-see-section">
                  {/* Search and Category Filters */}
                  <div className="must-see-search-bar">
                    <input
                      type="text"
                      className="must-see-search-input"
                      placeholder="🔍 Search Jaipur attractions, forts, crafts, food..."
                      value={mustSeeSearch}
                      onChange={(e) => setMustSeeSearch(e.target.value)}
                    />
                    <div className="must-see-filter-chips">
                      {CAT_FILTERS.map(([k, label]) => (
                        <button
                          type="button"
                          key={k}
                          className={`chip ${mustSeeCategory === k ? "on" : ""}`}
                          onClick={() => setMustSeeCategory(k)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {draft.must_see.length > 0 && (
                    <div className="row" style={{ alignItems: "center", gap: "8px" }}>
                      <span className="small" style={{ fontWeight: 600, color: "var(--marigold-gold)" }}>
                        ★ {draft.must_see.length} must-see{draft.must_see.length > 1 ? "s" : ""} selected:
                      </span>
                      {draft.must_see.map((id) => (
                        <span key={id} className="chip mini on" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          {titles.get(id) ?? id}
                          <button
                            type="button"
                            style={{ background: "transparent", color: "inherit", padding: 0, fontSize: "0.75rem", border: 0, cursor: "pointer" }}
                            onClick={() => set({ must_see: draft.must_see.filter((x) => x !== id) })}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Attraction Photo Grid */}
                  <div className="must-see-grid">
                    {filtered.map((e) => {
                      const on = draft.must_see.includes(e.id);
                      const photo = getExperiencePhoto(e.id, e.category);
                      return (
                        <div
                          key={e.id}
                          className={`must-see-card ${on ? "selected" : ""}`}
                          onClick={() => {
                            if (on) {
                              set({ must_see: draft.must_see.filter((x) => x !== e.id) });
                            } else if (draft.must_see.length < 20) {
                              set({ must_see: [...draft.must_see, e.id] });
                            }
                          }}
                        >
                          <div className="must-see-img-wrap">
                            <img src={photo} alt={e.title} loading="lazy" />
                            <button
                              type="button"
                              className="must-see-info-trigger"
                              title="View Overview & Reviews"
                              onClick={(evt) => {
                                evt.stopPropagation();
                                setInfoExp(e);
                              }}
                            >
                              ℹ️
                            </button>
                            <span className="must-see-top-badge">
                              {on ? "★ Selected" : "+ Must-See"}
                            </span>
                            <span className="must-see-bottom-badge">
                              {e.duration_min ? `${e.duration_min}m` : "60m"} · {e.price_inr ? `₹${e.price_inr}` : "Free"}
                            </span>
                          </div>
                          <div className="must-see-card-body">
                            <h4 className="must-see-card-title">{e.title}</h4>
                            <div className="must-see-rating-row">
                              <span>★ {e.rating ?? 4.5}</span>
                              <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                                ({e.review_count ? e.review_count.toLocaleString() : "10k+"} reviews)
                              </span>
                            </div>
                            {e.description && (
                              <p className="must-see-desc-preview">{e.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Info Modal */}
            {infoExp && (
              <div className="exp-modal-backdrop" onClick={() => setInfoExp(null)}>
                <div className="exp-modal-card" onClick={(e) => e.stopPropagation()}>
                  <img
                    src={getExperiencePhoto(infoExp.id, infoExp.category)}
                    alt={infoExp.title}
                    className="exp-modal-img"
                  />
                  <div className="exp-modal-content">
                    <div className="exp-modal-head">
                      <div>
                        <span className="chip tag" style={{ marginBottom: "6px" }}>
                          {infoExp.category.toUpperCase()}
                        </span>
                        <h3>{infoExp.title}</h3>
                      </div>
                      <button
                        type="button"
                        className="chat-close-btn"
                        onClick={() => setInfoExp(null)}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span className="chip" style={{ color: "var(--marigold-gold)", fontWeight: 700 }}>
                        ★ {infoExp.rating ?? 4.5} / 5.0
                      </span>
                      <span className="chip">
                        👥 {infoExp.review_count ? infoExp.review_count.toLocaleString() : "10k+"} reviews
                      </span>
                      <span className="chip">
                        ⏱️ {infoExp.duration_min ? `${infoExp.duration_min} mins` : "1 hour"}
                      </span>
                      <span className="chip">
                        💰 {infoExp.price_inr ? `₹${infoExp.price_inr} per person` : "Free entry"}
                      </span>
                    </div>

                    <div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem" }}>Overview</h4>
                      <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, color: "var(--ink)" }}>
                        {infoExp.description || "A signature Jaipur cultural attraction featuring iconic Rajput architecture and rich artisan history."}
                      </p>
                    </div>

                    <div className="exp-modal-reviews">
                      <h4 style={{ margin: 0, fontSize: "0.88rem", color: "var(--marigold-gold)" }}>
                        Verified Traveler Feedback
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.85rem", fontStyle: "italic", color: "var(--muted)" }}>
                        "Breathtaking cultural experience with authentic local atmosphere. Unmissable when visiting the Pink City!"
                      </p>
                      <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>✓ 96% of TrueLocal travelers recommend</span>
                        <span>Jaipur Cultural Review Score: 9.4/10</span>
                      </div>
                    </div>

                    {infoExp.tags && infoExp.tags.length > 0 && (
                      <div className="chips">
                        {infoExp.tags.map((t) => (
                          <span key={t} className="chip mini tag">{t}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className={draft.must_see.includes(infoExp.id) ? "secondary" : ""}
                        onClick={() => {
                          const on = draft.must_see.includes(infoExp.id);
                          set({
                            must_see: on
                              ? draft.must_see.filter((x) => x !== infoExp.id)
                              : [...draft.must_see, infoExp.id],
                          });
                        }}
                      >
                        {draft.must_see.includes(infoExp.id) ? "✓ Added to Must-Sees (Remove)" : "★ Add to Must-Sees"}
                      </button>
                      <button type="button" className="secondary" onClick={() => setInfoExp(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <h3>Review</h3>
            <dl className="facts review">
              <dt>Trip</dt><dd>{draft.title} <button type="button" className="icon mini" onClick={() => go(0)}>Edit</button></dd>
              <dt>When</dt><dd>{dateRange(draft.start_date, draft.end_date)}, {draft.day_start}–{draft.day_end} each day</dd>
              <dt>Budget</dt><dd>{inr(draft.budget_inr || 0)}{perDay > 0 && ` (≈ ${inr(perDay)} per person per day)`}</dd>
              <dt>Stay</dt><dd>{STAYS.find(([v]) => v === draft.stay.type)![1]}{draft.stay.max_per_night_inr ? `, up to ${inr(draft.stay.max_per_night_inr)}/night` : ""}{draft.stay.area ? `, ${draft.stay.area}` : ""} <button type="button" className="icon mini" onClick={() => go(1)}>Edit</button></dd>
              <dt>Weather</dt><dd>{draft.weather === "rain" ? "🌧 Monsoon Rain (35 mm/h)" : draft.weather === "heat" ? "🔥 Extreme Heatwave (43.8°C)" : "☀️ Pleasant Clear (29°C)"} <button type="button" className="icon mini" onClick={() => go(0)}>Edit</button></dd>
              <dt>Who</dt><dd>{draft.travelers.map((t) => t.name || "?").join(", ")} <button type="button" className="icon mini" onClick={() => go(2)}>Edit</button></dd>
              <dt>Must-sees</dt><dd>{draft.must_see.length ? draft.must_see.map((m) => titles.get(m) ?? m).join(" · ") : "None yet"}</dd>
            </dl>
          </>}

          {issues.length > 0 && <ul className="problems" role="alert">{issues.map((p) => <li key={p}>{p}</li>)}</ul>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="wizard-nav">
            {step > 0 ? <button type="button" className="secondary" onClick={() => go(step - 1)}>Back</button> : <Link to="/trips" className="muted">Cancel</Link>}
            <span className="row">
              {editing && step < 3 && <button type="button" className="secondary" disabled={busy || issues.length > 0} onClick={save}>Save changes</button>}
              {step < 3
                ? <button disabled={issues.length > 0}>Next: {STEPS[step + 1].toLowerCase()}</button>
                : <button disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Save trip"}</button>}
            </span>
          </div>
        </form>

        <aside className="wizard-aside">
          <Postcard t={draft} dye={editing ? Number(id) : 0} big />
          <div className="ticket panel">
            <h3 className="display">{draft.title || "Your trip"}</h3>
            <dl className="facts">
              <dt>When</dt><dd>{dateRange(draft.start_date, draft.end_date)}</dd>
              <dt>Daily</dt><dd>{draft.day_start}–{draft.day_end}</dd>
              <dt>Who</dt><dd>{people} {people === 1 ? "traveler" : "travelers"}</dd>
              <dt>Budget</dt><dd>{inr(draft.budget_inr || 0)}</dd>
              <dt>Stay</dt><dd>{STAYS.find(([v]) => v === draft.stay.type)![1]}</dd>
              <dt>Must-sees</dt><dd>{draft.must_see.length || "–"}</dd>
            </dl>
            <p className="muted small">After saving: a shortlist of what fits your days, then stays and a day-by-day plan.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
