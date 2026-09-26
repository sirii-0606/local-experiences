import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import MapView from "../MapView";
import { api } from "../api";
import type { Catalog, Change, ContextCheck, ContextEvent, Itinerary, Recommendation, Stop, TravelerState } from "../api";
import { useClock } from "../clock";
import { getExperiencePhoto } from "../photos";

const CAT_ICON: Record<string, string> = {
  food: "🍛",
  culture: "🏛️",
  art: "🎨",
  craft: "🎨",
  learning: "📚",
  adventure: "🧗",
  shopping: "🛍️",
  nightlife: "🌙",
  wellness: "🧘",
  community: "🤝",
  nature: "🌿",
  "hidden-gem": "🪜",
  sunset: "🌅",
};

const hhmm = (iso: string) => (iso && iso.includes("T") ? iso.slice(11, 16) : iso || "");
const LIVE = (s: Stop) => s.status !== "replaced" && s.status !== "skipped";
type Msg = { role: "user" | "bot"; text: string };

type TransportMode = "auto" | "cab" | "walk";

export default function ExplorePage() {
  const { clock, live: liveWeather } = useClock();

  // State
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<TravelerState | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [itinerary, setItinerary] = useState<Itinerary>({ stops: [] });
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Interactive Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [budgetLimit, setBudgetLimit] = useState<number>(3000);
  const [groupType, setGroupType] = useState<"solo" | "couple" | "family" | "friends">("family");
  const [timeSlot, setTimeSlot] = useState<"morning" | "afternoon" | "evening" | "night">("evening");
  const [pacing, setPacing] = useState<"relaxed" | "balanced" | "fast">("balanced");
  const [transportMode, setTransportMode] = useState<TransportMode>("auto");

  // Hover Spotlighting on Map
  const [highlightedExpId, setHighlightedExpId] = useState<string | null>(null);

  // Chat Drawer State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  // Initial Load: Populate catalog, initial traveler state, recommendations and itinerary
  useEffect(() => {
    let active = true;
    async function init() {
      setBusy(true);
      try {
        const cat = await api.catalog();
        if (!active) return;
        setCatalog(cat);

        // Build default initial state for Jaipur afternoon/evening
        const dateStr = clock.split("T")[0] || "2026-09-26";
        const initState: TravelerState = {
          lat: 26.9239,
          lon: 75.8267,
          window_start: `${dateStr}T15:00:00`,
          window_end: `${dateStr}T21:00:00`,
          budget_inr: 3000,
          group: [
            { name: "Adult 1", age: 34, interests: ["heritage", "local-food"], accessibility: [] },
            { name: "Adult 2", age: 32, interests: ["craft", "local-food"], accessibility: [] },
            { name: "Child", age: 8, interests: ["heritage"], accessibility: [] },
          ],
          intents: ["heritage", "local-food", "craft"],
          mode: "auto",
          pace: "normal",
          avoid_crowds: false,
          indoor_only: false,
          weather: "clear",
          learned: {},
          rejected: [],
        };

        const placesMap = new Map((cat?.places || []).map((p) => [p.id, p]));
        let initialRecs: Recommendation[] = [];
        let initialStops: Stop[] = [];

        try {
          const [discRes, planRes] = await Promise.all([
            api.discover(initState),
            api.plan(initState, { stops: [] }, 3),
          ]);
          if (discRes?.recommendations?.length) {
            initialRecs = discRes.recommendations;
          }
          if (discRes?.excluded) {
            setExcluded(discRes.excluded);
          }
          if (planRes?.itinerary?.stops?.length) {
            initialStops = planRes.itinerary.stops;
          }
          if (planRes?.problems) {
            setProblems(planRes.problems);
          }
        } catch (apiErr) {
          console.warn("API discover/plan call error, populating fallback catalog:", apiErr);
        }

        // Guaranteed fallback if discover returns 0
        if (initialRecs.length === 0 && cat?.experiences?.length) {
          initialRecs = cat.experiences.map((e) => {
            const pl = placesMap.get(e.place_id) || { lat: 26.9239, lon: 75.8267 };
            return {
              experience_id: e.id,
              title: e.title,
              score: 0.95,
              lat: pl.lat,
              lon: pl.lon,
              start: `${dateStr}T16:00:00`,
              end: `${dateStr}T17:30:00`,
              km: 1.5,
              travel_min: e.duration_min || 45,
              cost_inr: e.price_inr || 0,
              confidence: 0.9,
              low_confidence: false,
              reasons: [e.description || "Curated Jaipur experience", `${e.category || "Heritage"} highlight`],
            };
          });
        }

        // Guaranteed fallback if plan stops are 0
        if (initialStops.length === 0 && initialRecs.length > 0) {
          initialStops = initialRecs.slice(0, 2).map((r, idx) => ({
            title: r.title,
            experience_id: r.experience_id,
            lat: r.lat,
            lon: r.lon,
            start: `${dateStr}T${16 + idx * 2}:00:00`,
            end: `${dateStr}T${17 + idx * 2}:30:00`,
            status: "proposed" as const,
            locked: false,
            cost_inr: r.cost_inr || 0,
          }));
        }

        if (!active) return;
        setState(initState);
        setRecs(initialRecs);
        setItinerary({ stops: initialStops });
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setBusy(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  // Catalog item lookup maps
  const expMap = useMemo(() => {
    const map = new Map<string, any>();
    if (catalog?.experiences) {
      for (const exp of catalog.experiences) {
        map.set(exp.id, exp);
      }
    }
    return map;
  }, [catalog]);

  const placesMap = useMemo(() => {
    return new Map((catalog?.places || []).map((p) => [p.id, p]));
  }, [catalog]);

  // Unified items list: Combines all catalog experiences + recs engine scores
  const allExperiences = useMemo(() => {
    if (!catalog?.experiences) return [];
    const recsMap = new Map(recs.map((r) => [r.experience_id, r]));
    const dateStr = clock.split("T")[0] || "2026-09-26";

    return catalog.experiences.map((exp) => {
      const rec = recsMap.get(exp.id);
      const place = placesMap.get(exp.place_id) || { lat: 26.9239, lon: 75.8267 };

      const recObj: Recommendation = {
        experience_id: exp.id,
        title: exp.title,
        score: rec?.score ?? 0.9,
        lat: rec?.lat ?? place.lat,
        lon: rec?.lon ?? place.lon,
        start: rec?.start ?? `${dateStr}T16:00:00`,
        end: rec?.end ?? `${dateStr}T17:30:00`,
        km: rec?.km ?? 1.5,
        travel_min: rec?.travel_min ?? exp.duration_min ?? 45,
        cost_inr: exp.price_inr ?? 0,
        confidence: rec?.confidence ?? 0.9,
        low_confidence: false,
        reasons: rec?.reasons?.length
          ? rec?.reasons
          : [exp.description || "Curated Jaipur experience", `${exp.category || "Heritage"} highlight`],
      };
      return { exp, rec: recObj };
    });
  }, [catalog, recs, placesMap, clock]);

  // Comprehensive Search & Category Filtering across ALL experiences in Jaipur
  const filteredRecs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // If searching or filtering by a specific category, search across all experiences in Jaipur
    if (query || selectedCategory !== "all" || budgetLimit < 6000) {
      return allExperiences
        .filter(({ exp, rec }) => {
          // Category filter
          if (selectedCategory !== "all") {
            const cat = (exp.category || "").toLowerCase();
            const tags = (exp.tags || []).map((t: string) => t.toLowerCase());
            const catMatch =
              cat === selectedCategory ||
              (selectedCategory === "food" && (cat === "food" || tags.includes("local-food") || tags.includes("street-food"))) ||
              (selectedCategory === "culture" && (cat === "culture" || tags.includes("heritage") || tags.includes("history"))) ||
              (selectedCategory === "craft" && (cat === "art" || tags.includes("craft") || tags.includes("workshop"))) ||
              (selectedCategory === "hidden-gem" && tags.includes("hidden-gem")) ||
              (selectedCategory === "sunset" && (tags.includes("sunset") || tags.includes("viewpoint"))) ||
              (selectedCategory === "shopping" && (cat === "shopping" || tags.includes("shopping") || tags.includes("market"))) ||
              (selectedCategory === "nature" && (cat === "nature" || tags.includes("nature") || tags.includes("wildlife")));

            if (!catMatch) return false;
          }

          // Budget filter
          if (budgetLimit && exp.price_inr && exp.price_inr > budgetLimit) {
            return false;
          }

          // Search query across all attributes (title, description, tags, category, place name)
          if (query) {
            const place = placesMap.get(exp.place_id);
            const placeName = (place?.name || "").toLowerCase();
            const title = exp.title.toLowerCase();
            const desc = (exp.description || "").toLowerCase();
            const tags = (exp.tags || []).join(" ").toLowerCase();
            const cat = (exp.category || "").toLowerCase();

            const matches =
              title.includes(query) ||
              desc.includes(query) ||
              tags.includes(query) ||
              cat.includes(query) ||
              placeName.includes(query);

            if (!matches) return false;
          }

          return true;
        })
        .map(({ rec }) => rec);
    }

    // Default "All Spots" view: Show top curated AI recommendations (or top 8 iconic highlights)
    if (recs.length > 0) {
      return recs;
    }

    return allExperiences.slice(0, 8).map(({ rec }) => rec);
  }, [allExperiences, searchQuery, selectedCategory, budgetLimit, placesMap, recs]);

  // Actions
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const handleAddStop = (r: Recommendation) =>
    run(async () => {
      if (!state) return;
      const p = await api.plan(state, itinerary, 0, r.experience_id);
      setItinerary(p.itinerary);
      setProblems(p.problems);
      const f = await api.feedback(state, r.experience_id, "accept", null, `${clock}:00`);
      setState(f.state);
      setRecs(f.recommendations);
      setExcluded(f.excluded);
    });

  const handleRemoveStop = (s: Stop) =>
    run(async () => {
      if (!state) return;
      const updatedStops = itinerary.stops.filter((item) => item.experience_id !== s.experience_id);
      const p = await api.plan(state, { stops: updatedStops }, 0);
      setItinerary(p.itinerary);
      setProblems(p.problems);
    });

  const handleToggleLock = (s: Stop) =>
    run(async () => {
      const updated = itinerary.stops.map((st) =>
        st.experience_id === s.experience_id ? { ...st, locked: !st.locked } : st
      );
      setItinerary({ stops: updated });
    });

  const handleTimeSlotChange = (slot: "morning" | "afternoon" | "evening" | "night") => {
    setTimeSlot(slot);
    if (!state) return;
    const dateStr = clock.split("T")[0] || "2026-09-26";
    let start = `${dateStr}T16:00:00`;
    let end = `${dateStr}T21:00:00`;
    if (slot === "morning") {
      start = `${dateStr}T08:00:00`;
      end = `${dateStr}T13:00:00`;
    } else if (slot === "afternoon") {
      start = `${dateStr}T13:00:00`;
      end = `${dateStr}T17:00:00`;
    } else if (slot === "evening") {
      start = `${dateStr}T16:00:00`;
      end = `${dateStr}T21:00:00`;
    } else if (slot === "night") {
      start = `${dateStr}T19:00:00`;
      end = `${dateStr}T23:00:00`;
    }
    const updatedState = { ...state, window_start: start, window_end: end };
    setState(updatedState);
    run(async () => {
      const disc = await api.discover(updatedState);
      setRecs(disc.recommendations);
      setExcluded(disc.excluded);
    });
  };

  const handleGroupTypeChange = (grp: "solo" | "couple" | "family" | "friends") => {
    setGroupType(grp);
    if (!state) return;
    let groupArr = state.group;
    if (grp === "solo") {
      groupArr = [{ name: "Solo Explorer", age: 28, interests: ["heritage", "photography"], accessibility: [] }];
    } else if (grp === "couple") {
      groupArr = [
        { name: "Adult 1", age: 30, interests: ["heritage", "local-food"], accessibility: [] },
        { name: "Adult 2", age: 29, interests: ["craft", "sunset"], accessibility: [] },
      ];
    } else if (grp === "family") {
      groupArr = [
        { name: "Parent 1", age: 36, interests: ["heritage", "craft"], accessibility: [] },
        { name: "Parent 2", age: 34, interests: ["local-food"], accessibility: [] },
        { name: "Kid", age: 8, interests: ["nature"], accessibility: [] },
      ];
    } else if (grp === "friends") {
      groupArr = [
        { name: "Friend 1", age: 24, interests: ["adventure", "street-food"], accessibility: [] },
        { name: "Friend 2", age: 25, interests: ["sunset", "shopping"], accessibility: [] },
        { name: "Friend 3", age: 24, interests: ["nightlife"], accessibility: [] },
      ];
    }
    const updatedState = { ...state, group: groupArr };
    setState(updatedState);
    run(async () => {
      const disc = await api.discover(updatedState);
      setRecs(disc.recommendations);
      setExcluded(disc.excluded);
    });
  };

  const handlePacingChange = (p: "relaxed" | "balanced" | "fast") => {
    setPacing(p);
    if (!state) return;
    const paceVal = p === "relaxed" ? "relaxed" : p === "fast" ? "packed" : "normal";
    const updatedState = { ...state, pace: paceVal };
    setState(updatedState);
    run(async () => {
      const planRes = await api.plan(updatedState, itinerary, 3);
      setItinerary(planRes.itinerary);
      setProblems(planRes.problems);
    });
  };

  const handleTransportChange = (mode: TransportMode) => {
    setTransportMode(mode);
    if (!state) return;
    const modeVal = mode === "cab" ? "car" : mode;
    const updatedState = { ...state, mode: modeVal };
    setState(updatedState);
  };

  const sendChat = (msgText: string) =>
    run(async () => {
      if (!msgText.trim()) return;
      setMsgs((m) => [...m, { role: "user", text: msgText }]);
      setChatText("");
      const res = await api.chat(msgText, state, `${clock}:00`);
      let plan = res.plan;
      const locked = itinerary.stops.filter((s) => s.locked && LIVE(s));
      if (locked.length) plan = await api.plan(res.state, { stops: locked }, 3);
      setState(res.state);
      setRecs(res.recommendations);
      setExcluded(res.excluded);
      setItinerary(plan.itinerary);
      setProblems(plan.problems);
      setMsgs((m) => [
        ...m,
        { role: "bot", text: `Understood: Curated ${res.recommendations.length} matching spots for your schedule.` },
      ]);
    });

  // Calculate live plan stats
  const liveStops = itinerary.stops.filter(LIVE);
  const totalCost = liveStops.reduce((a, s) => a + (s.cost_inr || 0), 0);
  const totalDurationMin = liveStops.reduce((a, s) => {
    if (s.start && s.end) {
      const startMin = parseInt(s.start.slice(11, 13) || "0", 10) * 60 + parseInt(s.start.slice(14, 16) || "0", 10);
      const endMin = parseInt(s.end.slice(11, 13) || "0", 10) * 60 + parseInt(s.end.slice(14, 16) || "0", 10);
      return a + Math.max(30, endMin - startMin);
    }
    return a + 45;
  }, 0);

  return (
    <div className="explore-dashboard-root">
      <div className={`busy-bar ${busy ? "on" : ""}`} aria-hidden="true" />

      {/* 3-COLUMN MAIN DASHBOARD GRID (Matches Exact Blueprint) */}
      <div className="dashboard-grid">
        {/* =========================================================================
            COLUMN 1: FILTERS SIDEPANEL
        ========================================================================== */}
        <aside className="filters-sidepanel">
          <div className="panel-header-badge">
            <span style={{ fontSize: "1.1rem" }}>🎛️</span>
            <h3>Explore Filters</h3>
          </div>

          {/* Quick Categories */}
          <div className="filter-group">
            <label className="filter-label">Experience Categories</label>
            <div className="category-chips-grid">
              {[
                { id: "all", label: "All Spots", icon: "✨" },
                { id: "food", label: "Local Food", icon: "🍛" },
                { id: "culture", label: "Heritage", icon: "🏛️" },
                { id: "craft", label: "Crafts & Print", icon: "🎨" },
                { id: "hidden-gem", label: "Stepwells", icon: "🪜" },
                { id: "sunset", label: "Sunset Points", icon: "🌅" },
                { id: "shopping", label: "Bazaars", icon: "🛍️" },
                { id: "nature", label: "Nature Safari", icon: "🌿" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`filter-chip ${selectedCategory === c.id ? "active" : ""}`}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  <span className="chip-icon">{c.icon}</span>
                  <span className="chip-text">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Window */}
          <div className="filter-group">
            <label className="filter-label">Time Window</label>
            <div className="time-chips-grid">
              {[
                { id: "morning", title: "Morning", hours: "8am–1pm", icon: "🌅" },
                { id: "afternoon", title: "Afternoon", hours: "1pm–5pm", icon: "☀️" },
                { id: "evening", title: "Evening", hours: "4pm–9pm", icon: "🌇" },
                { id: "night", title: "Night", hours: "7pm–11pm", icon: "🌙" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`time-chip ${timeSlot === t.id ? "active" : ""}`}
                  onClick={() => handleTimeSlotChange(t.id as any)}
                >
                  <div className="chip-header-line">
                    <span className="chip-icon">{t.icon}</span>
                    <span className="chip-title">{t.title}</span>
                  </div>
                  <span className="chip-sub">{t.hours}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group & Ages */}
          <div className="filter-group">
            <label className="filter-label">Traveler Group</label>
            <div className="group-chips-grid">
              {[
                { id: "solo", title: "Solo", sub: "1 Person", icon: "👤" },
                { id: "couple", title: "Couple", sub: "2 Adults", icon: "👥" },
                { id: "family", title: "Family", sub: "With Kids", icon: "👨‍👩‍👧‍👦" },
                { id: "friends", title: "Friends", sub: "3+ Group", icon: "🎒" },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`group-chip ${groupType === g.id ? "active" : ""}`}
                  onClick={() => handleGroupTypeChange(g.id as any)}
                >
                  <div className="chip-header-line">
                    <span className="chip-icon">{g.icon}</span>
                    <span className="chip-title">{g.title}</span>
                  </div>
                  <span className="chip-sub">{g.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Budget Limit Slider */}
          <div className="filter-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="filter-label" style={{ margin: 0 }}>Budget Limit</label>
              <span className="budget-val">₹{budgetLimit}</span>
            </div>
            <input
              type="range"
              min="500"
              max="6000"
              step="250"
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(Number(e.target.value))}
              className="budget-slider"
            />
          </div>

          {/* Pacing Speed */}
          <div className="filter-group">
            <label className="filter-label">Itinerary Pacing</label>
            <div className="pacing-select-grid">
              {[
                { id: "relaxed", label: "☕ Relaxed", desc: "Unhurried & tea breaks" },
                { id: "balanced", label: "⚖️ Balanced", desc: "Curated highlights" },
                { id: "fast", label: "⚡ Fast-Paced", desc: "Cover all landmarks" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pacing-option ${pacing === p.id ? "active" : ""}`}
                  onClick={() => handlePacingChange(p.id as any)}
                >
                  <div style={{ fontWeight: 800 }}>{p.label}</div>
                  <div style={{ fontSize: "0.68rem", opacity: 0.85, marginTop: "1px" }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* AI Chat Assistant Toggle */}
          <div style={{ marginTop: "auto", paddingTop: "8px" }}>
            <button
              type="button"
              className="ai-assistant-btn"
              onClick={() => setIsChatOpen(!isChatOpen)}
            >
              <span>✨</span>
              <span>{isChatOpen ? "Close AI Assistant" : "Ask AI Assistant"}</span>
            </button>
          </div>
        </aside>

        {/* =========================================================================
            COLUMN 2: CENTER (SEARCH + RECOMMENDED SPOTS + DAY PLAN TIMELINE)
        ========================================================================== */}
        <div className="center-content-column">
          {/* Top Search Bar */}
          <div className="search-bar-container">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search spots, food walks, block-printing, stepwells in Jaipur..."
                className="main-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="clear-search-btn">
                  ✕
                </button>
              )}
            </div>

            {/* Quick Keyword Pills */}
            <div className="quick-keyword-pills">
              {["Hawa Mahal", "Sanganer Craft", "Amer Stepwell", "Nahargarh Sunset", "Johari Food"].map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => setSearchQuery(kw)}
                  className="kw-pill"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: Recommended Spots List */}
          <section className="recommended-section">
            <div className="section-header-row">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--ink)" }}>
                  Recommended Spots &amp; Experiences
                </h3>
                <span className="count-pill">{filteredRecs.length} curated</span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Hover a card to view route on map
              </span>
            </div>

            <div className="spots-cards-grid">
              {filteredRecs.map((r, i) => {
                const exp = expMap.get(r.experience_id);
                const photo = getExperiencePhoto(r.experience_id);
                const isPlanned = liveStops.some((s) => s.experience_id === r.experience_id);
                const isHovered = highlightedExpId === r.experience_id;
                const category = exp?.category || "culture";
                const reasonText =
                  r.reasons && r.reasons.length > 0
                    ? r.reasons.join(" • ")
                    : exp?.description || "Curated based on your preferences & Jaipur weather.";
                const rating = exp?.rating ?? 4.9;

                return (
                  <div
                    key={r.experience_id}
                    className={`spot-card ${isHovered ? "hovered" : ""} ${isPlanned ? "planned" : ""}`}
                    onMouseEnter={() => setHighlightedExpId(r.experience_id)}
                    onMouseLeave={() => setHighlightedExpId(null)}
                  >
                    <div className="spot-card-media">
                      <img src={photo} alt={r.title} loading="lazy" />
                      <span className="spot-number-badge">{i + 1}</span>
                      <span className="spot-cat-badge">
                        {CAT_ICON[category] || "🏛️"} {category}
                      </span>
                    </div>

                    <div className="spot-card-body">
                      <h4 className="spot-title">{r.title}</h4>
                      <p className="spot-reason">{reasonText}</p>

                      <div className="spot-meta-row">
                        <span className="spot-price">₹{r.cost_inr || "Free"}</span>
                        <span className="spot-time">⏱ {r.travel_min || 45} mins</span>
                        <span className="spot-rating">⭐ {rating}</span>
                      </div>

                      <div className="spot-card-actions">
                        {isPlanned ? (
                          <span className="planned-indicator">✓ In Day Plan</span>
                        ) : (
                          <button
                            type="button"
                            className="add-to-plan-btn"
                            onClick={() => handleAddStop(r)}
                            disabled={busy}
                          >
                            + Add to Day Plan
                          </button>
                        )}
                        <Link
                          to={`/3d`}
                          className="view-3d-btn"
                          title="View 3D Spatial Model"
                        >
                          🏛️ 3D
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Bottom: The Plan for the Day (Itinerary Timeline) */}
          <section className="day-plan-section">
            <div className="section-header-row">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>📅</span>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--ink)" }}>
                  The Plan for the Day
                </h3>
                <span className="count-pill" style={{ background: "rgba(216, 92, 72, 0.15)", color: "var(--accent)" }}>
                  {liveStops.length} Stops
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px", fontSize: "0.82rem", fontWeight: 700, color: "var(--muted)" }}>
                <span>⏱ ~{totalDurationMin} mins total</span>
                <span>💰 ₹{totalCost} total</span>
              </div>
            </div>

            {liveStops.length === 0 ? (
              <div className="empty-plan-placeholder">
                <p style={{ margin: 0, color: "var(--muted)", fontWeight: 600 }}>
                  No stops added yet. Click <b>"+ Add to Day Plan"</b> on any spot above to build your schedule!
                </p>
              </div>
            ) : (
              <div className="plan-timeline-list">
                {liveStops.map((s, idx) => {
                  const stopLetter = String.fromCharCode(65 + idx);
                  const isHovered = highlightedExpId === s.experience_id;
                  const photo = s.experience_id ? getExperiencePhoto(s.experience_id) : "";

                  return (
                    <div
                      key={s.experience_id || idx}
                      className={`timeline-stop-item ${isHovered ? "hovered" : ""}`}
                      onMouseEnter={() => s.experience_id && setHighlightedExpId(s.experience_id)}
                      onMouseLeave={() => setHighlightedExpId(null)}
                    >
                      <div className="stop-letter-badge">{stopLetter}</div>

                      {photo && <img src={photo} alt={s.title} className="stop-thumb" />}

                      <div className="stop-info-content">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--ink)" }}>
                            {s.title}
                          </h4>
                          {s.locked && <span style={{ fontSize: "0.75rem", color: "var(--accent)" }}>🔒 Locked</span>}
                        </div>
                        <div className="stop-time-details">
                          <span>🕒 {hhmm(s.start)} – {hhmm(s.end)}</span>
                          <span>•</span>
                          <span>₹{s.cost_inr || "Free"}</span>
                        </div>
                      </div>

                      <div className="stop-item-actions">
                        <button
                          type="button"
                          className={`stop-tool-btn ${s.locked ? "active" : ""}`}
                          onClick={() => handleToggleLock(s)}
                          title={s.locked ? "Unlock timing" : "Lock timing"}
                        >
                          {s.locked ? "🔒" : "🔓"}
                        </button>
                        <button
                          type="button"
                          className="stop-tool-btn remove"
                          onClick={() => handleRemoveStop(s)}
                          title="Remove stop"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* =========================================================================
            COLUMN 3: RIGHT (WEATHER & TRANSPORT MODEL + INTERACTIVE ROUTE MAP)
        ========================================================================== */}
        <aside className="right-map-column">
          {/* Top Box: Model of Transportation / Weather Conditions */}
          <div className="transport-weather-box">
            <div className="weather-header-row">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.3rem" }}>
                  {liveWeather === "offline" || !liveWeather ? "☀️" : liveWeather.condition === "rain" ? "🌧" : liveWeather.condition === "heat" ? "🔥" : "☀️"}
                </span>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--ink)" }}>
                    Jaipur Weather: {liveWeather && liveWeather !== "offline" ? `${liveWeather.temp_c.toFixed(0)}°C` : "32°C"}
                  </h4>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    Sunset: 6:18 PM • Perfect for outdoor exploration
                  </span>
                </div>
              </div>
            </div>

            {/* Transport Mode Switcher */}
            <div className="transport-selector">
              <span className="transport-label">Transit Mode:</span>
              <div className="transport-pill-row">
                {[
                  { id: "auto", label: "🛺 Auto (20km/h)", desc: "Bazaar Agility" },
                  { id: "cab", label: "🚗 AC Cab (35km/h)", desc: "Comfort" },
                  { id: "walk", label: "🚶 Walking", desc: "Old City Lanes" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`transport-btn ${transportMode === m.id ? "active" : ""}`}
                    onClick={() => setTransportMode(m.id as any)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Box: A map showcasing the route to all of the spots */}
          <div className="map-view-wrapper">
            <MapView
              state={state}
              recs={filteredRecs}
              stops={itinerary.stops}
              highlightedId={highlightedExpId}
            />
          </div>
        </aside>
      </div>

      {/* Floating AI Chat Drawer (Opens smoothly when requested) */}
      {isChatOpen && (
        <div className="floating-chat-drawer">
          <div className="chat-drawer-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>✨</span>
              <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--ink)" }}>TrueLocal AI Assistant</h4>
            </div>
            <button type="button" onClick={() => setIsChatOpen(false)} className="close-drawer-btn">
              ✕
            </button>
          </div>

          <div className="chat-drawer-messages">
            <div className="chat-msg bot">
              Hello! Tell me what you'd like to experience in Jaipur (e.g. "We have 3 hours near Hawa Mahal, budget ₹1500, want spicy food & crafts").
            </div>
            {msgs.map((m, idx) => (
              <div key={idx} className={`chat-msg ${m.role}`}>
                {m.text}
              </div>
            ))}
          </div>

          <form
            className="chat-drawer-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              sendChat(chatText);
            }}
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Ask anything about Jaipur or adapt your plan..."
              className="chat-input"
            />
            <button type="submit" className="chat-send-btn" disabled={busy || !chatText.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
