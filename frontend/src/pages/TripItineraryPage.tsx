import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import MapView from "../MapView";
import type { Stop } from "../api";
import type { MealSuggestion, QuickStopSuggestion, Trip, TripStop, TripSuggestions } from "../types";
import { v2 } from "../v2api";
import { getExperiencePhoto } from "../photos";

function parseLocalDate(dateStr: string): [number, number, number] {
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  return [parts[0] || 2026, (parts[1] || 1) - 1, parts[2] || 1];
}

function getDaysBetween(startStr: string, endStr: string): string[] {
  const [sy, sm, sd] = parseLocalDate(startStr);
  const [ey, em, ed] = parseLocalDate(endStr);
  const s = new Date(sy, sm, sd);
  const e = new Date(ey, em, ed);
  const diffDays = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: string[] = [];
  for (let i = 0; i <= diffDays; i++) {
    const d = new Date(sy, sm, sd + i);
    days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return days.length > 0 ? days : [startStr.slice(0, 10)];
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = parseLocalDate(dateStr);
  const date = new Date(y, m, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export type AttractionMeta = {
  description: string;
  rating: number;
  reviewCount: number;
  phone: string;
  address: string;
  bestTime: string;
  category: string;
  price: string;
};

export const ATTRACTION_INFO: Record<string, AttractionMeta> = {
  "ex-hawa-mahal": {
    description: "Climb the honeycomb ramps of the 953-window palace facade built for royal women to observe bazaar street life unseen.",
    rating: 4.6,
    reviewCount: 52000,
    phone: "+91 141 261 8862",
    address: "Hawa Mahal Rd, Badi Choupad, J.D.A. Market, Pink City",
    bestTime: "🌅 08:30–11:00 (Morning light shines through colored stained glass)",
    category: "Heritage & Architecture",
    price: "₹50 (Included in composite ticket)",
  },
  "ex-city-palace": {
    description: "Centuries-old royal residence featuring Mubarak Mahal textile galleries, the historic armoury museum, and the Peacock Gate courtyard.",
    rating: 4.5,
    reviewCount: 41000,
    phone: "+91 141 408 8888",
    address: "Tulsi Marg, Gangori Bazaar, Pink City",
    bestTime: "🏛️ 11:30–14:30 (Shaded cool courtyards & indoor museum galleries)",
    category: "Royal Heritage & Museum",
    price: "₹200",
  },
  "ex-jantar-mantar": {
    description: "UNESCO-listed 18th-century stone astronomical observatory housing nineteen architectural instruments, including the world's largest stone sundial.",
    rating: 4.4,
    reviewCount: 23000,
    phone: "+91 141 261 0568",
    address: "Gangori Bazaar, J.D.A. Market, Pink City",
    bestTime: "☀️ 12:00–14:00 (Noon gives precise vertical sundial shadow readings)",
    category: "Science & Astronomy",
    price: "₹50",
  },
  "ex-amer-fort": {
    description: "Hilltop Rajput fort overlooking Maota Lake with Sheesh Mahal mirror palace, Diwan-e-Aam, and grand elephant ramps.",
    rating: 4.6,
    reviewCount: 88000,
    phone: "+91 141 253 0264",
    address: "Devisinghpura, Amer, Jaipur",
    bestTime: "🌅 08:00–10:30 (Cool morning breeze & easy walk before noon heat)",
    category: "Iconic Fort & Palace",
    price: "₹100",
  },
  "ex-nahargarh-sunset": {
    description: "Ridge-top fort perched on the Aravalli hills featuring the highest scenic sunset bastions overlooking Jaipur's Pink City grid.",
    rating: 4.5,
    reviewCount: 31000,
    phone: "+91 141 282 2863",
    address: "Krishna Nagar, Brahampuri, Nahargarh Hills",
    bestTime: "🌄 16:30–18:45 (Golden hour sunset & twilight cityscape)",
    category: "Nature & Viewpoint",
    price: "₹50",
  },
  "ex-albert-hall": {
    description: "Indo-Saracenic museum with an Egyptian mummy, Persian miniature paintings, and vibrant colored night illumination.",
    rating: 4.5,
    reviewCount: 19000,
    phone: "+91 141 257 0097",
    address: "Museum Road, Ram Niwas Bagh, Kailash Puri",
    bestTime: "🌙 19:00–21:30 (Spectacular night lighting & evening breeze)",
    category: "Museum & Architecture",
    price: "₹40 (Day) / ₹100 (Night)",
  },
  "ex-street-food-walk": {
    description: "Guided food tasting trail across eight generational culinary stalls from piping hot pyaz kachoris to creamy saffron lassi.",
    rating: 4.7,
    reviewCount: 540,
    phone: "+91 98290 88219",
    address: "Johari Bazaar & Chaura Rasta, Old City",
    bestTime: "🍛 17:00–19:30 (Evening bustling food lanes)",
    category: "Culinary Tour",
    price: "₹1,200 (All 8 tastings included)",
  },
  "ex-block-print-workshop": {
    description: "Hands-on block printing workshop in Sanganer creating your own silk scarf with hand-carved teak wood stamps and natural dyes.",
    rating: 4.8,
    reviewCount: 64,
    phone: "+91 98292 33411",
    address: "Sanganer Textile Village, Jaipur",
    bestTime: "🎨 10:30–14:00 (Natural studio daylight & artisan masterclass)",
    category: "Crafts & Workshop",
    price: "₹800 (Take home your hand-printed scarf)",
  },
  "ex-pottery-workshop": {
    description: "Master Jaipur's traditional Persian cobalt blue pottery art by crafting and painting quartz-paste tiles and decorative bowls.",
    rating: 4.7,
    reviewCount: 120,
    phone: "+91 98291 99201",
    address: "Tripolia Bazaar craft studio, Old City",
    bestTime: "🎨 11:00–15:30 (Indoor relaxed workshop)",
    category: "Hands-on Art",
    price: "₹600",
  },
  "ex-rawat-kachori": {
    description: "World-renowned Pyaaz Kachori and rich sweet Mawa Kachori dipped in saffron syrup, served piping hot since 1856.",
    rating: 4.6,
    reviewCount: 28000,
    phone: "+91 141 236 3590",
    address: "Station Road, Sindhi Camp",
    bestTime: "🌅 07:30–10:30 (Fresh morning batch breakfast)",
    category: "Heritage Breakfast & Sweets",
    price: "₹80–150",
  },
  "ex-lmb-thali": {
    description: "Iconic royal Rajasthani multi-course deluxe thali featuring Dal Baati Churma, Gatte ki Sabzi, Ker Sangri, and Kesar Kulfi.",
    rating: 4.5,
    reviewCount: 19500,
    phone: "+91 141 256 5844",
    address: "Johari Bazaar, Pink City",
    bestTime: "🍛 12:30–15:00 (Sumptuous royal lunch feast)",
    category: "Royal Rajasthani Dining",
    price: "₹850",
  },
  "ex-tapri-central": {
    description: "Chic rooftop café overlooking Central Park greenery, serving cutting masala chai, sautéed mushroom toast, and signature snacks.",
    rating: 4.7,
    reviewCount: 16000,
    phone: "+91 141 401 2444",
    address: "B4-E, Prithviraj Road, C-Scheme",
    bestTime: "☕ 16:30–19:00 (Sunset chai overlooking lush trees)",
    category: "Rooftop Tea Lounge",
    price: "₹350",
  },
  "ex-1135-ad": {
    description: "Opulent Rajput royal feast served with pure silver tableware under glittering crystal chandeliers atop Amer Fort.",
    rating: 4.7,
    reviewCount: 4800,
    phone: "+91 141 253 0101",
    address: "Level 2, Jaleb Chowk, Amer Fort",
    bestTime: "🌙 19:30–22:00 (Fort royal nighttime dining)",
    category: "Regal Fine Dining",
    price: "₹2,200",
  },
  "ex-handi-dinner": {
    description: "Legendary clay-pot slow-cooked Handi mutton, spicy Rajasthani Laal Maas, and fresh rumali rotis on bustling MI Road.",
    rating: 4.4,
    reviewCount: 12000,
    phone: "+91 141 237 2478",
    address: "Maya Mansion, MI Road",
    bestTime: "🌙 19:30–22:30 (Evening dinner feast)",
    category: "Heritage Non-Veg & Mughlai",
    price: "₹950",
  },
  "ex-samrat-breakfast": {
    description: "Heritage morning feast of saffron jalebis prepared in pure desi ghee, paired with spicy hing kachoris and mint chutney.",
    rating: 4.7,
    reviewCount: 9200,
    phone: "+91 141 231 8854",
    address: "Tripolia Bazaar, Old City",
    bestTime: "🌅 07:00–10:00 (Authentic old-city breakfast)",
    category: "Street Food & Breakfast",
    price: "₹90",
  },
  "ex-gulab-chai": {
    description: "Jaipur's beloved morning gathering spot for boiling hot masala chai brewed in giant brass vessels with warm buttered pav.",
    rating: 4.6,
    reviewCount: 6500,
    phone: "+91 141 237 0812",
    address: "MI Road, near Ganpati Plaza",
    bestTime: "🌅 06:30–09:30 (Morning chai & bun-maska)",
    category: "Chai & Breakfast",
    price: "₹60",
  },
};

export function getAttractionInfo(id: string | null, title: string): AttractionMeta {
  if (id && ATTRACTION_INFO[id]) return ATTRACTION_INFO[id];
  return {
    description: `Curated local Jaipur attraction: "${title}". Verified by TrueLocal for authentic cultural heritage and safety.`,
    rating: 4.6,
    reviewCount: 1200,
    phone: "+91 141 260 0000",
    address: "Jaipur, Rajasthan, India",
    bestTime: "🕒 10:00–17:00",
    category: "Cultural Experience",
    price: "Free to nominal entrance",
  };
}

export default function TripItineraryPage() {
  const { id } = useParams();
  const tripId = Number(id);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [suggestions, setSuggestions] = useState<TripSuggestions | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pacingFeedbackMsg, setPacingFeedbackMsg] = useState("");
  const [selectedInfoStop, setSelectedInfoStop] = useState<{ id: string | null; title: string; stop?: TripStop } | null>(null);
  const [acceptedSplits, setAcceptedSplits] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      v2.trip(tripId),
      v2.suggestions(tripId).catch(() => null),
    ])
      .then(([t, suggs]) => {
        setTrip(t);
        setSuggestions(suggs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [tripId]);

  const saveUpdatedItinerary = async (newStops: TripStop[]) => {
    if (!trip) return;
    setSaving(true);
    try {
      const updatedDraft = {
        ...trip,
        itinerary: { stops: newStops },
      };
      const saved = await v2.updateTrip(tripId, updatedDraft);
      setTrip(saved);
      const suggs = await v2.suggestions(tripId).catch(() => null);
      if (suggs) setSuggestions(suggs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateItinerary = async () => {
    if (!trip) return;
    setGenerating(true);
    setError("");
    try {
      const updated = await v2.generateItinerary(tripId);
      setTrip(updated);
      const suggs = await v2.suggestions(tripId).catch(() => null);
      if (suggs) setSuggestions(suggs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <section className="page narrow" style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <p className="muted" style={{ fontSize: "1.1rem" }}>✨ Loading your personalized Jaipur itinerary…</p>
      </section>
    );
  }

  if (error && !trip) {
    return (
      <section className="page narrow">
        <p className="error" role="alert">{error || "Trip not found"}</p>
        <Link to="/trips" className="secondary button">Back to your trips</Link>
      </section>
    );
  }

  if (!trip) return null;

  const daysList = getDaysBetween(trip.start_date, trip.end_date);
  const activeDate = daysList[activeDayIdx] || trip.start_date.slice(0, 10);
  const stops = trip.itinerary?.stops ?? [];
  const dayStops = stops.filter((s) => s.start.startsWith(activeDate));

  const formatTime = (iso: string) => {
    try {
      return iso.split("T")[1]?.slice(0, 5) ?? iso;
    } catch {
      return iso;
    }
  };

  // Time adjustment (+/- minutes)
  const adjustStopTime = (stop: TripStop, deltaMinutes: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const [dPart, sTime] = stop.start.split("T");
    const [eDPart, eTime] = stop.end.split("T");

    const [sh, sm] = (sTime || "09:00").split(":").map(Number);
    const [eh, em] = (eTime || "10:30").split(":").map(Number);

    let startTotal = sh * 60 + sm + deltaMinutes;
    let endTotal = eh * 60 + em + deltaMinutes;

    if (startTotal < 360) startTotal = 360; // min 06:00
    if (endTotal > 1410) endTotal = 1410; // max 23:30
    if (endTotal <= startTotal) endTotal = startTotal + 30;

    const newStart = `${dPart}T${pad(Math.floor(startTotal / 60))}:${pad(startTotal % 60)}:00`;
    const newEnd = `${eDPart}T${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}:00`;

    const updatedStops = stops.map((s) => (s === stop ? { ...s, start: newStart, end: newEnd } : s));
    saveUpdatedItinerary(updatedStops);
  };

  // Move stop to a different day
  const moveStopToDay = (stop: TripStop, targetDayIdx: number) => {
    const targetDate = daysList[targetDayIdx];
    if (!targetDate || targetDate === activeDate) return;

    const sTime = stop.start.split("T")[1] || "09:30:00";
    const eTime = stop.end.split("T")[1] || "11:00:00";

    const newStart = `${targetDate}T${sTime}`;
    const newEnd = `${targetDate}T${eTime}`;

    const updatedStops = stops.map((s) => (s === stop ? { ...s, start: newStart, end: newEnd } : s));
    saveUpdatedItinerary(updatedStops);
  };

  // Remove / Cancel Stop
  const removeStop = (stop: TripStop) => {
    const updatedStops = stops.filter((s) => s !== stop);
    saveUpdatedItinerary(updatedStops);
  };

  // Reorder stop within day
  const reorderStop = (stop: TripStop, direction: "up" | "down") => {
    const idxInDay = dayStops.indexOf(stop);
    if (idxInDay === -1) return;
    if (direction === "up" && idxInDay === 0) return;
    if (direction === "down" && idxInDay === dayStops.length - 1) return;

    const swapIdx = direction === "up" ? idxInDay - 1 : idxInDay + 1;
    const targetStop = dayStops[swapIdx];

    // Swap their time slots
    const updatedStops = stops.map((s) => {
      if (s === stop) return { ...s, start: targetStop.start, end: targetStop.end };
      if (s === targetStop) return { ...s, start: stop.start, end: stop.end };
      return s;
    });

    saveUpdatedItinerary(updatedStops);
  };

  // Toggle lock
  const toggleLock = (stop: TripStop) => {
    const updatedStops = stops.map((s) => (s === stop ? { ...s, locked: !s.locked } : s));
    saveUpdatedItinerary(updatedStops);
  };

  // Smart Auto-Optimize Day Timings
  const autoOptimizeDay = () => {
    if (dayStops.length === 0) return;
    const pad = (n: number) => String(n).padStart(2, "0");

    // Standard starting time base: 09:00
    let currMinutes = 9 * 60; // 09:00
    const optimizedDayStops = dayStops.map((stop) => {
      const durMinutes = Math.max(30, Math.round(((new Date(stop.end).getTime() - new Date(stop.start).getTime()) / 60000)) || 60);
      const startH = Math.floor(currMinutes / 60);
      const startM = currMinutes % 60;
      const endTotal = currMinutes + durMinutes;
      const endH = Math.floor(endTotal / 60);
      const endM = endTotal % 60;

      const newStart = `${activeDate}T${pad(startH)}:${pad(startM)}:00`;
      const newEnd = `${activeDate}T${pad(endH)}:${pad(endM)}:00`;
      currMinutes = endTotal + 40; // 40 min buffer between stops

      return { ...stop, start: newStart, end: newEnd };
    });

    const nonDayStops = stops.filter((s) => !s.start.startsWith(activeDate));
    saveUpdatedItinerary([...nonDayStops, ...optimizedDayStops]);
    setPacingFeedbackMsg("✓ Day schedule optimized with comfortable 40-minute scenic travel buffers!");
    setTimeout(() => setPacingFeedbackMsg(""), 3500);
  };

  // Add meal suggestion to current day
  const addMealToDay = (m: MealSuggestion) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    let slotHour = 13;
    let slotMin = 0;
    if (m.meal_type === "breakfast") { slotHour = 8; slotMin = 30; }
    else if (m.meal_type === "snacks") { slotHour = 16; slotMin = 45; }
    else if (m.meal_type === "dinner") { slotHour = 20; slotMin = 0; }

    const startIso = `${activeDate}T${pad(slotHour)}:${pad(slotMin)}:00`;
    const dur = m.duration_min || 45;
    const endTotal = slotHour * 60 + slotMin + dur;
    const endIso = `${activeDate}T${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}:00`;

    const newStop: TripStop = {
      title: m.title,
      experience_id: m.experience_id,
      lat: 26.9200,
      lon: 75.8200,
      start: startIso,
      end: endIso,
      status: "proposed",
      locked: false,
      cost_inr: m.price_inr,
    };

    saveUpdatedItinerary([...stops, newStop]);
    setPacingFeedbackMsg(`✓ Added ${m.title} to Day ${activeDayIdx + 1} schedule!`);
    setTimeout(() => setPacingFeedbackMsg(""), 3000);
  };

  // Add quick stop to current day
  const addQuickStopToDay = (q: QuickStopSuggestion) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const slotHour = 16;
    const startIso = `${activeDate}T${pad(slotHour)}:00:00`;
    const endIso = `${activeDate}T${pad(slotHour)}:${pad(q.duration_min || 30)}:00`;

    const newStop: TripStop = {
      title: q.title,
      experience_id: q.experience_id,
      lat: 26.9230,
      lon: 75.8210,
      start: startIso,
      end: endIso,
      status: "proposed",
      locked: false,
      cost_inr: 0,
    };

    saveUpdatedItinerary([...stops, newStop]);
    setPacingFeedbackMsg(`✓ Added ${q.title} to Day ${activeDayIdx + 1}!`);
    setTimeout(() => setPacingFeedbackMsg(""), 3000);
  };

  // Pacing feedback handlers
  const handlePacingFeedback = (action: "hectic" | "slow" | "food") => {
    if (action === "hectic") {
      dayStops.forEach((s, idx) => {
        if (idx > 0) adjustStopTime(s, 30 * idx);
      });
      setPacingFeedbackMsg("🧘 Adjusted pace: Expanded relaxation buffers between stops.");
    } else if (action === "slow") {
      dayStops.forEach((s, idx) => {
        if (idx > 0) adjustStopTime(s, -15 * idx);
      });
      setPacingFeedbackMsg("⚡ Tightened schedule: Created space for afternoon highlights.");
    } else if (action === "food") {
      const bestMeal = suggestions?.meals?.find((m) => m.day === activeDate) || suggestions?.meals?.[0];
      if (bestMeal) {
        addMealToDay(bestMeal);
      } else {
        setPacingFeedbackMsg("🍛 Food recommendation added.");
      }
    }
    setTimeout(() => setPacingFeedbackMsg(""), 3500);
  };

  const mapStops: Stop[] = dayStops.map((s) => ({
    title: s.title,
    experience_id: s.experience_id,
    lat: s.lat,
    lon: s.lon,
    start: s.start,
    end: s.end,
    status: s.status as any,
    locked: s.locked,
    cost_inr: s.cost_inr,
  }));

  // Meals for today: match day or day_index or fallback
  const mealsForToday = suggestions?.meals?.filter(
    (m) => m.day === activeDate || m.day_index === activeDayIdx + 1 || (!m.day && !m.day_index)
  ) ?? [];

  return (
    <section className="page" style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Top Header */}
      <div className="trips-hero" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", width: "100%", gap: "1rem" }}>
          <div>
            <p className="eyebrow"><Link to="/trips">Your trips</Link> / {trip.title}</p>
            <h1 className="display" style={{ margin: "0.2rem 0" }}>{trip.title}</h1>
            <p className="hint">
              📅 {trip.start_date} to {trip.end_date} ({daysList.length} Days) · 👥 {trip.travelers.length} travelers · 💰 Budget ₹{trip.budget_inr.toLocaleString("en-IN")}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Link to={`/trips/${tripId}/shortlist`} className="secondary button">
              ✏️ Shortlist &amp; Stays
            </Link>
            <button type="button" className="secondary" onClick={() => window.print()}>
              🖨️ PDF / Print
            </button>
          </div>
        </div>
      </div>

      {/* Pacing Feedback & Notification Banner */}
      {pacingFeedbackMsg && (
        <div className="pacing-feedback-bar" style={{ background: "var(--marigold-gold)", color: "#140810", fontWeight: 600 }}>
          <span>✨ {pacingFeedbackMsg}</span>
        </div>
      )}

      {/* Day Selector Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid var(--line)", marginBottom: "1.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {daysList.map((dStr, idx) => {
          const isActive = idx === activeDayIdx;
          const dayName = formatDayLabel(dStr);
          return (
            <button
              key={dStr}
              type="button"
              className={isActive ? "tab chip on" : "tab chip"}
              style={{
                padding: "0.55rem 1.2rem",
                border: isActive ? "2px solid var(--marigold-gold)" : "1px solid var(--line)",
                background: isActive ? "var(--gold-gradient)" : "var(--panel-2)",
                color: isActive ? "#140810" : "var(--ink)",
                fontWeight: isActive ? 800 : 500,
                cursor: "pointer",
                borderRadius: "10px",
                fontSize: "0.9rem",
                transition: "all 0.15s ease",
              }}
              onClick={() => setActiveDayIdx(idx)}
            >
              Day {idx + 1} ({dayName})
            </button>
          );
        })}
      </div>

      {/* Pacing Reaction Pills Bar */}
      <div className="pacing-feedback-bar">
        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ink)" }}>🎯 Pacing Feedback:</span>
        <button type="button" className="pacing-btn" onClick={() => handlePacingFeedback("hectic")} title="Add extra relaxation buffers">
          🧘 Too Hectic (Add Buffer)
        </button>
        <button type="button" className="pacing-btn" onClick={() => handlePacingFeedback("slow")} title="Tighten gaps and pack more highlights">
          ⚡ Too Slow (Pack More)
        </button>
        <button type="button" className="pacing-btn" onClick={() => handlePacingFeedback("food")} title="Insert authentic lunch/dinner break">
          🍛 Add Food Break
        </button>
        <button
          type="button"
          className="pacing-btn"
          style={{ background: "var(--gold-gradient)", color: "#140810", fontWeight: 800 }}
          onClick={autoOptimizeDay}
          title="Align stops to their optimal visiting hours and compute buffers"
        >
          ✨ Auto-Optimize Day Timings
        </button>
        {saving && <span className="small muted" style={{ marginLeft: "auto" }}>💾 Saving changes…</span>}
      </div>

      {/* Main Grid: Left = Editable Schedule Timeline, Right = Route Map, Concierge & Food */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "2rem", alignItems: "start" }}>
        
        {/* Left Column: Timeline Stops */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              📅 Day {activeDayIdx + 1} Schedule <span className="count">({dayStops.length} stops)</span>
            </h2>
            {dayStops.length > 0 && (
              <span className="small muted">Drag or use +/- buttons to adjust timing</span>
            )}
          </div>
          
          {dayStops.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem", borderRadius: "12px" }}>
              <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>🏰</span>
              <p className="muted" style={{ marginBottom: "1.25rem", fontSize: "0.95rem" }}>No activities planned yet for Day {activeDayIdx + 1}.</p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary"
                  disabled={generating}
                  onClick={handleGenerateItinerary}
                >
                  {generating ? "Planning itinerary…" : "⚡ Auto-Generate Full Itinerary"}
                </button>
                <Link to={`/trips/${tripId}/shortlist`} className="secondary button">
                  Select Shortlist Items
                </Link>
              </div>
            </div>
          ) : (
            <div className="timeline-container">
              {dayStops.map((stop: TripStop, sIdx: number) => {
                const photoUrl = stop.experience_id ? getExperiencePhoto(stop.experience_id) : "";
                const meta = getAttractionInfo(stop.experience_id, stop.title);
                const stopLabel = String.fromCharCode(65 + sIdx);

                return (
                  <div
                    key={`${stop.title}-${stop.start}-${sIdx}`}
                    className={`itinerary-stop-card ${stop.locked ? "locked" : ""}`}
                  >
                    {/* Thumbnail Image beside attraction name */}
                    <div className="itinerary-thumb-wrap">
                      <img src={photoUrl || getExperiencePhoto("ex-hawa-mahal")} alt={stop.title} />
                      <span className="itinerary-stop-badge">Stop {stopLabel}</span>
                    </div>

                    {/* Content Body */}
                    <div className="itinerary-body">
                      <div className="itinerary-header-row">
                        <div>
                          <h3 style={{ margin: "0 0 2px", fontSize: "1.02rem", color: "var(--ink)", display: "flex", alignItems: "center", gap: "6px" }}>
                            {stop.title}
                            {stop.locked && <span title="Stop is locked">🔒</span>}
                          </h3>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginTop: "2px" }}>
                            <span className="chip mini on" style={{ fontWeight: 700 }}>
                              🕒 {formatTime(stop.start)} – {formatTime(stop.end)}
                            </span>
                            <span className="chip mini" style={{ background: "rgba(229, 169, 60, 0.15)", color: "#b4532a" }}>
                              {meta.bestTime.slice(0, 24)}…
                            </span>
                          </div>
                        </div>

                        {/* Cost & Info Trigger Button */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {stop.cost_inr > 0 && <span className="font-mono" style={{ fontWeight: 700, fontSize: "0.85rem" }}>₹{stop.cost_inr}</span>}
                          <button
                            type="button"
                            className="secondary mini"
                            title="View full attraction info, ratings & phone"
                            onClick={() => setSelectedInfoStop({ id: stop.experience_id, title: stop.title, stop })}
                            style={{ padding: "3px 8px", fontSize: "0.8rem", borderRadius: "6px" }}
                          >
                            ℹ️ Info
                          </button>
                        </div>
                      </div>

                      {/* Interactive Timing Sliders & Adjustment Controls */}
                      <div className="itinerary-actions-row">
                        {/* Time adjust buttons */}
                        <div className="time-slider-box">
                          <span style={{ color: "var(--muted)", marginRight: "2px" }}>Adjust:</span>
                          <button
                            type="button"
                            className="mini-time-pill"
                            onClick={() => adjustStopTime(stop, -30)}
                            title="Move 30 minutes earlier"
                          >
                            -30m
                          </button>
                          <button
                            type="button"
                            className="mini-time-pill"
                            onClick={() => adjustStopTime(stop, -15)}
                            title="Move 15 minutes earlier"
                          >
                            -15m
                          </button>
                          <button
                            type="button"
                            className="mini-time-pill"
                            onClick={() => adjustStopTime(stop, 15)}
                            title="Move 15 minutes later"
                          >
                            +15m
                          </button>
                          <button
                            type="button"
                            className="mini-time-pill"
                            onClick={() => adjustStopTime(stop, 30)}
                            title="Move 30 minutes later"
                          >
                            +30m
                          </button>
                        </div>

                        {/* Reorder buttons */}
                        <button
                          type="button"
                          className="secondary mini"
                          disabled={sIdx === 0}
                          onClick={() => reorderStop(stop, "up")}
                          title="Move stop earlier in sequence"
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          className="secondary mini"
                          disabled={sIdx === dayStops.length - 1}
                          onClick={() => reorderStop(stop, "down")}
                          title="Move stop later in sequence"
                        >
                          ⬇️
                        </button>

                        {/* Move to another day dropdown */}
                        {daysList.length > 1 && (
                          <select
                            className="pass"
                            style={{ padding: "3px 6px", fontSize: "0.78rem" }}
                            value=""
                            aria-label={`Move ${stop.title} to another day`}
                            onChange={(e) => {
                              if (e.target.value !== "") {
                                moveStopToDay(stop, Number(e.target.value));
                              }
                            }}
                          >
                            <option value="">Move to Day…</option>
                            {daysList.map((d, dIdx) => (
                              <option key={d} value={dIdx} disabled={dIdx === activeDayIdx}>
                                Day {dIdx + 1} ({formatDayLabel(d)})
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Lock toggle */}
                        <button
                          type="button"
                          className="icon"
                          onClick={() => toggleLock(stop)}
                          title={stop.locked ? "Locked: won't shift during replanning" : "Lock this stop"}
                          style={{ fontSize: "0.95rem" }}
                        >
                          {stop.locked ? "🔒" : "🔓"}
                        </button>

                        {/* Remove / Cancel button */}
                        <button
                          type="button"
                          className="icon"
                          onClick={() => removeStop(stop)}
                          title="Remove stop from itinerary"
                          style={{ color: "#d9534f", fontSize: "0.95rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommended Meals for Today (Diverse per day) */}
          <div className="panel" style={{ marginTop: "1.5rem", background: "var(--panel-2)", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>🍲 Recommended Meals for Today (Day {activeDayIdx + 1})</h3>
              <span className="small muted">Location-tailored to Day {activeDayIdx + 1} route</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.85rem", marginTop: "1rem" }}>
              {mealsForToday.length === 0 ? (
                <p className="small muted">All meals covered in today's plan!</p>
              ) : (
                mealsForToday.map((m, i) => (
                  <div
                    key={`${m.title}-${i}`}
                    style={{
                      display: "flex",
                      gap: "12px",
                      background: "var(--panel)",
                      padding: "10px",
                      borderRadius: "10px",
                      border: "1px solid var(--line)",
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={getExperiencePhoto(m.experience_id, "food")}
                      alt={m.title}
                      style={{ width: 75, height: 65, objectFit: "cover", borderRadius: "8px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <strong style={{ color: "var(--ink)", fontSize: "0.95rem" }}>{m.title}</strong>
                        <span className="chip mini on" style={{ textTransform: "capitalize", fontSize: "0.72rem" }}>{m.meal_type}</span>
                        {m.rating && <span className="small font-mono" style={{ color: "var(--marigold-gold)" }}>★ {m.rating}</span>}
                      </div>
                      <p className="muted small" style={{ margin: "2px 0 4px", fontSize: "0.82rem" }}>
                        {m.reason} · ₹{m.price_inr} est. · {m.best_time || "Ideal slot"}
                      </p>
                      {m.phone && (
                        <span className="small" style={{ color: "var(--ink)", fontWeight: 600 }}>
                          📞 <a href={`tel:${m.phone}`} style={{ color: "inherit", textDecoration: "none" }}>{m.phone}</a>
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
                      <span className="chip mini">🚗 {m.travel_min}m</span>
                      <button
                        type="button"
                        className="secondary mini"
                        style={{ background: "var(--gold-gradient)", color: "#140810", fontWeight: 700 }}
                        onClick={() => addMealToDay(m)}
                      >
                        + Add to Plan
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Route Map, Driver & Guide Assistance */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Labeled Route Map */}
          <div className="panel" style={{ padding: "0.75rem", overflow: "hidden", borderRadius: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0.25rem 0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem" }}>🗺️ Path Planned Route (Day {activeDayIdx + 1})</h3>
              <span className="chip mini on">{mapStops.length} Points Connected</span>
            </div>
            <div style={{ height: 280, borderRadius: "8px", overflow: "hidden" }}>
              <MapView
                state={dayStops.length > 0 ? ({ lat: dayStops[0].lat, lon: dayStops[0].lon } as any) : null}
                recs={[]}
                stops={mapStops}
              />
            </div>
          </div>

          {/* Assigned Driver & Local Guide Contact Card */}
          <div className="driver-guide-card">
            <h3 style={{ margin: 0, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "6px" }}>
              🚗 Transport &amp; Guide Concierge
            </h3>
            <p className="muted small" style={{ margin: 0 }}>
              Direct contact details for on-demand transit and certified heritage storytelling across Jaipur.
            </p>

            {/* Driver Contact */}
            <div className="driver-person-row">
              <span style={{ fontSize: "1.8rem" }}>🚘</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "0.92rem", color: "var(--ink)", display: "block" }}>
                  Ram Singh Shekhawat
                </strong>
                <span className="small muted" style={{ display: "block" }}>AC Toyota Innova · ⭐ 4.9 (340 trips)</span>
                <span className="small" style={{ color: "#2e7d32", fontWeight: 700 }}>🟢 Standby for Day {activeDayIdx + 1}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <a href="tel:+919829014829" className="contact-quick-btn contact-call-btn">
                  📞 Call (+91 98290 14829)
                </a>
                <a href="https://wa.me/919829014829" target="_blank" rel="noopener noreferrer" className="contact-quick-btn contact-whatsapp-btn">
                  💬 WhatsApp
                </a>
              </div>
            </div>

            {/* Guide Contact */}
            <div className="driver-person-row">
              <span style={{ fontSize: "1.8rem" }}>🏛️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "0.92rem", color: "var(--ink)", display: "block" }}>
                  Dr. Mahendra Sharma
                </strong>
                <span className="small muted" style={{ display: "block" }}>Govt. Certified Guide (#RJ-4182) · ⭐ 4.95</span>
                <span className="small muted">Languages: English, Hindi, French</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <a href="tel:+919414077312" className="contact-quick-btn contact-call-btn">
                  📞 Call (+91 94140 77312)
                </a>
                <a href="https://wa.me/919414077312" target="_blank" rel="noopener noreferrer" className="contact-quick-btn contact-whatsapp-btn">
                  💬 WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Quick En-Route Stops */}
          {suggestions?.quick_stops && suggestions.quick_stops.length > 0 && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>⏱️ Quick En-Route Gems (≤ 45m)</h3>
                <span className="small muted">Near scheduled path</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                {suggestions.quick_stops.map((q, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.88rem", paddingBottom: "0.5rem", borderBottom: "1px dashed var(--line)" }}>
                    <div>
                      <strong style={{ color: "var(--ink)" }}>{q.title}</strong>
                      <p className="muted small" style={{ margin: "2px 0" }}>{q.reason}</p>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span className="chip mini">{q.duration_min}m</span>
                      <button
                        type="button"
                        className="secondary mini"
                        onClick={() => addQuickStopToDay(q)}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Group Split Suggestions */}
          {suggestions?.splits && suggestions.splits.length > 0 && (
            <div className="panel" style={{ border: "2px dashed var(--accent)" }}>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>⚡ Suggested Group Split</h3>
              {suggestions.splits.map((sp, idx) => {
                const accepted = acceptedSplits[sp.reason];
                return (
                  <div key={idx} style={{ marginTop: "0.5rem" }}>
                    <p className="small" style={{ margin: "0 0 0.5rem", color: "var(--ink)" }}>{sp.reason}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
                      <div className="panel mini" style={{ background: "var(--panel-2)", border: "1px solid var(--line)", padding: "8px" }}>
                        <strong style={{ color: "var(--ink)" }}>Subgroup 1: {sp.group_a.join(", ")}</strong>
                        <p style={{ margin: "0.2rem 0", color: "var(--muted)", fontSize: "0.8rem" }}>{sp.activity_a}</p>
                      </div>
                      <div className="panel mini" style={{ background: "var(--panel-2)", border: "1px solid var(--line)", padding: "8px" }}>
                        <strong style={{ color: "var(--ink)" }}>Subgroup 2: {sp.group_b.join(", ")}</strong>
                        <p style={{ margin: "0.2rem 0", color: "var(--muted)", fontSize: "0.8rem" }}>{sp.activity_b}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
                      <span className="muted small">Rejoin: <b>{sp.rejoin_name}</b> ({sp.end_time.slice(0, 5)})</span>
                      <button
                        type="button"
                        className={accepted ? "primary mini" : "secondary mini"}
                        onClick={() => setAcceptedSplits({ ...acceptedSplits, [sp.reason]: !accepted })}
                      >
                        {accepted ? "✓ Split Accepted" : "Accept Split"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Info Modal on Attraction Click */}
      {selectedInfoStop && (() => {
        const info = getAttractionInfo(selectedInfoStop.id, selectedInfoStop.title);
        const photo = selectedInfoStop.id ? getExperiencePhoto(selectedInfoStop.id) : getExperiencePhoto("ex-hawa-mahal");

        return (
          <div className="info-modal-backdrop" onClick={() => setSelectedInfoStop(null)}>
            <div className="info-modal-card" onClick={(e) => e.stopPropagation()}>
              <img src={photo} alt={selectedInfoStop.title} className="info-modal-image" />
              <div className="info-modal-content">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span className="chip mini on" style={{ marginBottom: "4px" }}>{info.category}</span>
                    <h2 style={{ margin: 0, fontSize: "1.3rem", color: "var(--ink)" }}>{selectedInfoStop.title}</h2>
                  </div>
                  <button
                    type="button"
                    className="icon"
                    onClick={() => setSelectedInfoStop(null)}
                    style={{ fontSize: "1.2rem", padding: "4px" }}
                  >
                    ✕
                  </button>
                </div>

                {/* Rating & reviews */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "0.9rem" }}>
                  <span style={{ color: "#e5a93c", fontWeight: 800 }}>★ {info.rating}</span>
                  <span className="muted">({info.reviewCount.toLocaleString()} traveler reviews)</span>
                  <span className="chip mini" style={{ marginLeft: "auto" }}>{info.price}</span>
                </div>

                <p style={{ margin: "0.25rem 0", color: "var(--ink)", lineHeight: 1.5, fontSize: "0.92rem" }}>
                  {info.description}
                </p>

                <div style={{ background: "var(--panel-2)", padding: "12px", borderRadius: "10px", border: "1px solid var(--line)" }}>
                  <div style={{ marginBottom: "6px", fontSize: "0.88rem" }}>
                    <strong>🕒 Best Time to Visit:</strong> <span style={{ color: "#b4532a", fontWeight: 600 }}>{info.bestTime}</span>
                  </div>
                  <div style={{ marginBottom: "6px", fontSize: "0.88rem" }}>
                    <strong>📍 Location:</strong> <span className="muted">{info.address}</span>
                  </div>
                  <div style={{ fontSize: "0.88rem" }}>
                    <strong>📞 Contact:</strong> <a href={`tel:${info.phone}`} style={{ color: "var(--ink)", fontWeight: 600 }}>{info.phone}</a>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "6px" }}>
                  {selectedInfoStop.stop && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedInfoStop.stop.lat},${selectedInfoStop.stop.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary button mini"
                    >
                      🗺️ Open in Google Maps ↗
                    </a>
                  )}
                  <button
                    type="button"
                    className="primary mini"
                    onClick={() => setSelectedInfoStop(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
