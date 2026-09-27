import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import MapView from "../MapView";
import { ExperienceReviews } from "../ReviewsPanel";
import { api } from "../api";
import type { CalendarExport, ChatContext } from "../types";
import type {
  Catalog,
  Change,
  ContextCheck,
  ContextEvent,
  DigitalTwinResult,
  ImpactZonePolygon,
  Itinerary,
  Recommendation,
  SimulationScenario,
  SocialSignal,
  Stop,
  TravelerState,
  UserSocialReport,
  WeatherSummary,
} from "../api";
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
  const [showThread, setShowThread] = useState(false); // the whole conversation, not just the last reply
  const [moreFilters, setMoreFilters] = useState(false);
  const [chatText, setChatText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  // Weather & Live Atmospheric State
  const [weatherSummary, setWeatherSummary] = useState<WeatherSummary | null>(null);

  // Where the traveler is and what the planner assumed (from /chat), the device location if
  // shared, the calendar export, and the reviews dialog.
  const [chatCtx, setChatCtx] = useState<ChatContext | null>(null);
  // The page starts on a demo state; only a state from the traveler's own chat is refined further,
  // so a first message is read against their profile, not the demo family.
  const [ownState, setOwnState] = useState(false);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [calendar, setCalendar] = useState<CalendarExport | null>(null);
  const [reviewsFor, setReviewsFor] = useState<{ id: string; title: string } | null>(null);
  const [whyOpen, setWhyOpen] = useState<string | null>(null); // card whose full reasons are shown
  const [params, setParams] = useSearchParams();
  const askedFromUrl = useRef(false);

  // Real-World Social Signals State
  const [socialSignals, setSocialSignals] = useState<SocialSignal[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<Array<{ tag: string; count: number; trend: string; sentiment: string }>>([]);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportAuthor, setReportAuthor] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportLocation, setReportLocation] = useState("Badi Chaupar");
  const [reportSentiment, setReportSentiment] = useState<"positive" | "neutral" | "warning" | "critical">("warning");

  // Digital Twin Simulation State
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simPresets, setSimPresets] = useState<SimulationScenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<SimulationScenario>({
    name: "Custom What-If",
    temp_c: 28.0,
    rain_intensity_mm_h: 0.0,
    duration_hours: 2.0,
    epicenter_lat: 26.9239,
    epicenter_lon: 75.8267,
    epicenter_name: "Old Walled City, Jaipur",
    radius_km: 3.5,
    wind_kmh: 15.0,
  });
  const [simResult, setSimResult] = useState<DigitalTwinResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

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

        // No fallbacks: if the engine finds nothing feasible, the page says so instead of
        // inventing recommendations or plan stops.
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

  // Fetch Live Weather Meteorological Summary & Real-World Social Signals
  useEffect(() => {
    async function loadAtmosphericAndSocial() {
      try {
        const wRes = await api.weather(clock, chatCtx?.lat, chatCtx?.lon);
        if (wRes?.summary) {
          setWeatherSummary(wRes.summary);
        }
        const sRes = await api.getSocialSignals({ condition: wRes?.summary?.condition || "clear" });
        if (sRes?.signals) {
          setSocialSignals(sRes.signals);
          setTrendingHashtags(sRes.trending_hashtags || []);
        }
        const presets = await api.getSimulationPresets();
        if (presets?.length) {
          setSimPresets(presets);
        }
      } catch (err) {
        console.warn("Failed to load atmospheric/social context:", err);
      }
    }
    loadAtmosphericAndSocial();
  }, [clock, chatCtx?.lat, chatCtx?.lon]);

  // Landing-page examples arrive as /explore?q=...: ask the assistant once the page is ready.
  useEffect(() => {
    const q = params.get("q");
    if (!q || !state || askedFromUrl.current) return;
    askedFromUrl.current = true;
    sendChat(q);
    params.delete("q");
    setParams(params, { replace: true });
  }, [state]);

  const [appliedSimulationNotice, setAppliedSimulationNotice] = useState<string | null>(null);

  function scrollToPlan() {
    setTimeout(() => {
      const el = document.getElementById("day-plan-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("plan-section-highlight");
        setTimeout(() => el.classList.remove("plan-section-highlight"), 2500);
      }
    }, 120);
  }

  // Digital Twin Execution Handler
  async function triggerSimulation(scenarioToRun?: SimulationScenario) {
    const sc = scenarioToRun || currentScenario;
    if (!state) return;
    setSimLoading(true);
    try {
      const res = await api.runSimulation(sc, state, itinerary);
      setSimResult(res);
      if (res.simulated_social_signals?.length) {
        setSocialSignals(res.simulated_social_signals);
      }
    } catch (err) {
      console.error("Digital Twin simulation error:", err);
    } finally {
      setSimLoading(false);
    }
  }

  // Select a scenario, execute digital twin simulation, apply to day itinerary, and redirect/scroll to plan
  async function applyScenarioAndRedirectToPlan(scenarioToRun?: SimulationScenario) {
    const sc = scenarioToRun || currentScenario;
    if (!state) return;
    setSimLoading(true);
    try {
      const res = await api.runSimulation(sc, state, itinerary);
      setSimResult(res);
      if (res.simulated_social_signals?.length) {
        setSocialSignals(res.simulated_social_signals);
      }
      setItinerary(res.adapted_itinerary);
      const cond = res.metrics.weather_classification;
      const updatedState = {
        ...state,
        weather: cond,
      };
      setState(updatedState);
      run(async () => {
        const planRes = await api.plan(updatedState, res.adapted_itinerary, 3);
        setProblems(planRes.problems);
      });

      setWeatherSummary({
        condition: cond,
        temp_c: res.scenario.temp_c,
        precip_mm: res.scenario.rain_intensity_mm_h,
        precip_prob: cond === "rain" ? 95 : cond === "heat" ? 5 : 10,
        humidity_pct: cond === "rain" ? 88 : cond === "heat" ? 28 : 45,
        wind_kmh: res.scenario.wind_kmh,
        ai_guidance: res.ai_executive_summary,
        description: `${res.scenario.name} active in ${res.scenario.epicenter_name}`,
        available: true,
      });

      setAppliedSimulationNotice(
        `⚡ Applied What-If Scenario: ${res.scenario.name} (${cond.toUpperCase()}) — ${res.changes.length} stops adapted/sheltered, transit delay buffers added.`
      );
      setIsSimulationOpen(false);
      scrollToPlan();
    } catch (err) {
      console.error("Digital Twin simulation error:", err);
    } finally {
      setSimLoading(false);
    }
  }

  function applySimulatedPlan() {
    if (!simResult) return;
    setItinerary(simResult.adapted_itinerary);
    const cond = simResult.metrics.weather_classification;
    if (state) {
      const updatedState = {
        ...state,
        weather: cond,
      };
      setState(updatedState);
      run(async () => {
        const planRes = await api.plan(updatedState, simResult.adapted_itinerary, 3);
        setProblems(planRes.problems);
      });
    }

    setWeatherSummary({
      condition: cond,
      temp_c: simResult.scenario.temp_c,
      precip_mm: simResult.scenario.rain_intensity_mm_h,
      precip_prob: cond === "rain" ? 95 : cond === "heat" ? 5 : 10,
      humidity_pct: cond === "rain" ? 88 : cond === "heat" ? 28 : 45,
      wind_kmh: simResult.scenario.wind_kmh,
      ai_guidance: simResult.ai_executive_summary,
      description: `${simResult.scenario.name} active in ${simResult.scenario.epicenter_name}`,
      available: true,
    });

    setAppliedSimulationNotice(
      `⚡ Applied Digital Twin Simulation: ${simResult.scenario.name} (${cond.toUpperCase()}) — ${simResult.changes.length} stops adapted/sheltered, transit delay buffers added.`
    );
    setIsSimulationOpen(false);
    scrollToPlan();
  }

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reportContent.trim()) return;
    try {
      const newSig = await api.postSocialReport({
        author: reportAuthor.trim() || "Local Explorer",
        content: reportContent.trim(),
        location_name: reportLocation,
        lat: 26.9239,
        lon: 75.8267,
        sentiment: reportSentiment,
        tags: ["#LiveAlert", "#JaipurUpdate"],
        weather_related: true,
      });
      setSocialSignals((prev) => [newSig, ...prev]);
      setReportContent("");
      setIsReportOpen(false);
    } catch (err) {
      console.error("Failed to post report:", err);
    }
  }

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

    // An explicit search or category browses everything in the area (marked "not checked" on the
    // card unless the engine also recommended it); otherwise the list is the engine's own picks.
    if (query || selectedCategory !== "all") {
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

    return budgetLimit >= 6000 ? recs : recs.filter((r) => r.cost_inr <= budgetLimit);
  }, [allExperiences, searchQuery, selectedCategory, budgetLimit, placesMap, recs]);
  const recIds = useMemo(() => new Set(recs.map((r) => r.experience_id)), [recs]);

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
      const res = await api.chat(msgText, ownState ? state : null, `${clock}:00`, here?.lat, here?.lon);
      setOwnState(true);
      let plan = res.plan;
      const locked = itinerary.stops.filter((s) => s.locked && LIVE(s));
      if (locked.length) plan = await api.plan(res.state, { stops: locked }, 3);
      setState(res.state);
      setRecs(res.recommendations);
      setExcluded(res.excluded);
      setItinerary(plan.itinerary);
      setProblems(plan.problems);
      const ctx = res.context ?? null;
      setChatCtx(ctx);
      if (ctx && ctx.location_source !== "default") setCatalog(await api.catalog(ctx.lat, ctx.lon));
      setMsgs((m) => [...m, { role: "bot", text: botReply(res.recommendations, ctx, Object.keys(res.excluded).length) }]);
    });

  const shareLocation = () => {
    if (!navigator.geolocation) return setError("This browser can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setMsgs((m) => [...m, { role: "bot", text: "📍 Got your location. I'll plan around where you are." }]);
      },
      () => setError("Location wasn't shared. You can also just name the town or area you're in."),
      { timeout: 10000 },
    );
  };

  const exportCalendar = () =>
    run(async () => {
      if (!state) return;
      const cal = await api.calendar(state, { stops: itinerary.stops.filter(LIVE) });
      setCalendar(cal);
    });

  const downloadIcs = () => {
    if (!calendar) return;
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([calendar.ics], { type: "text/calendar" })),
      download: "truelocal-plan.ics",
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
  const lastYou = [...msgs].reverse().find((m) => m.role === "user");
  const heavyWeather = state?.weather === "rain" || state?.weather === "heat";

  return (
    <div className="explore">
      <div className={`busy-bar ${busy ? "on" : ""}`} aria-hidden="true" />
      {error && <p className="error explore-error" role="alert">{error}</p>}

      <div className="explore-layout">
        <div className="explore-main">
          {/* 1. Ask: the one place to say where you are and what you'd like */}
          <section className="ask-card" aria-label="Ask the planner">
            <h2 className="ask-title">What would you like to do?</h2>
            {lastYou && <p className="ask-you">You: {lastYou.text}</p>}
            {lastBot && <div className="ask-reply">{lastBot.text}</div>}
            {msgs.length > 2 && (
              <button type="button" className="link-btn" onClick={() => setShowThread(!showThread)}>
                {showThread ? "Hide conversation" : `Show whole conversation (${msgs.length})`}
              </button>
            )}
            {showThread && (
              <div className="ask-thread">
                {msgs.map((m, idx) => <div key={idx} className={`chat-msg ${m.role}`}>{m.text}</div>)}
              </div>
            )}
            <form className="ask-row" onSubmit={(e) => { e.preventDefault(); sendChat(chatText); }}>
              <input
                type="text"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="e.g. I'm in Pune with my parents, it's 6 pm, we love history"
                className="ask-input"
                aria-label="Where are you, and what would you like to do?"
              />
              <button type="button" className={`ask-loc ${here ? "on" : ""}`} onClick={shareLocation}
                title={here ? "Using your location" : "Plan around where you are"} aria-label="Use my location">
                📍
              </button>
              <button type="submit" className="ask-send" disabled={busy || !chatText.trim()}>
                {busy ? "Thinking…" : "Ask"}
              </button>
            </form>
            {!msgs.length && (
              <div className="ask-examples">
                {["It's 6 pm, I'm with my family, we love history", "4 hours before my train, a beach with a view", "A quick bite nearby"].map((ex) => (
                  <button key={ex} type="button" className="chip" onClick={() => sendChat(ex)}>{ex}</button>
                ))}
              </div>
            )}
          </section>

          {/* 2. What the planner took into account */}
          {chatCtx ? <ContextStrip ctx={chatCtx} /> : (
            <p className="explore-hint">Showing the demo city. Ask above, or tap 📍 to plan around where you are.</p>
          )}

          {/* 3. Filters: one calm row; the rest on demand */}
          <div className="filter-bar">
            <div className="filter-chips" role="group" aria-label="Category">
              {[
                { id: "all", label: "All" },
                { id: "food", label: "🍛 Food" },
                { id: "culture", label: "🏛️ Heritage" },
                { id: "craft", label: "🎨 Crafts" },
                { id: "hidden-gem", label: "💎 Hidden gems" },
                { id: "sunset", label: "🌅 Views" },
                { id: "shopping", label: "🛍️ Markets" },
                { id: "nature", label: "🌿 Nature" },
              ].map((c) => (
                <button key={c.id} type="button" className={`chip ${selectedCategory === c.id ? "on" : ""}`}
                  aria-pressed={selectedCategory === c.id} onClick={() => setSelectedCategory(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="filter-tools">
              <input type="search" className="filter-search" value={searchQuery} placeholder="Search…"
                aria-label="Search places" onChange={(e) => setSearchQuery(e.target.value)} />
              <button type="button" className={`secondary mini ${moreFilters ? "on" : ""}`} aria-expanded={moreFilters}
                onClick={() => setMoreFilters(!moreFilters)}>
                {moreFilters ? "Fewer filters" : "More filters"}
              </button>
            </div>
          </div>

          {moreFilters && (
            <div className="more-filters">
              <label>Time
                <select value={timeSlot} onChange={(e) => handleTimeSlotChange(e.target.value as any)}>
                  <option value="morning">Morning (8–1)</option>
                  <option value="afternoon">Afternoon (1–5)</option>
                  <option value="evening">Evening (4–9)</option>
                  <option value="night">Night (7–11)</option>
                </select>
              </label>
              <label>Who
                <select value={groupType} onChange={(e) => handleGroupTypeChange(e.target.value as any)}>
                  <option value="solo">Solo</option>
                  <option value="couple">Couple</option>
                  <option value="family">Family with kids</option>
                  <option value="friends">Friends</option>
                </select>
              </label>
              <label>Pace
                <select value={pacing} onChange={(e) => handlePacingChange(e.target.value as any)}>
                  <option value="relaxed">Relaxed</option>
                  <option value="balanced">Balanced</option>
                  <option value="fast">Packed</option>
                </select>
              </label>
              <label>Getting around
                <select value={transportMode} onChange={(e) => handleTransportChange(e.target.value as TransportMode)}>
                  <option value="auto">Auto</option>
                  <option value="cab">Cab</option>
                  <option value="walk">Walk</option>
                </select>
              </label>
              <label className="more-budget">Max price per place <b>₹{budgetLimit}{budgetLimit >= 6000 ? "+" : ""}</b>
                <input type="range" min="500" max="6000" step="250" value={budgetLimit}
                  onChange={(e) => setBudgetLimit(Number(e.target.value))} />
              </label>
            </div>
          )}

          {/* 4. Places that fit */}
          <section className="explore-section">
            <div className="section-head">
              <h3>{searchQuery.trim() || selectedCategory !== "all" ? "Places found" : "Places that fit now"}</h3>
              <span className="count-pill">{filteredRecs.length}</span>
            </div>
            {filteredRecs.length === 0 && !busy && (
              <p className="explore-empty">Nothing here right now. Try another time, a bigger budget, or ask for something else.</p>
            )}
            <div className="spots-grid">
              {filteredRecs.map((r, i) => {
                const exp = expMap.get(r.experience_id);
                const photo = getExperiencePhoto(r.experience_id, exp?.category);
                const isPlanned = liveStops.some((s) => s.experience_id === r.experience_id);
                const checked = recIds.has(r.experience_id);
                const category = exp?.category || "culture";
                const short = r.reasons.filter((x) => !x.startsWith("⚠")).slice(0, 2).join(" · ");
                const rating: number | null = exp?.rating ?? null;
                // only a real, curated comfort value, and only when the weather makes it matter
                const comfort = state?.weather === "rain" ? exp?.outdoor_convenience_rain : state?.weather === "heat" ? exp?.outdoor_convenience_heat : undefined;
                return (
                  <article key={r.experience_id}
                    className={`spot ${highlightedExpId === r.experience_id ? "hovered" : ""} ${isPlanned ? "planned" : ""}`}
                    onMouseEnter={() => setHighlightedExpId(r.experience_id)}
                    onMouseLeave={() => setHighlightedExpId(null)}>
                    <div className="spot-media">
                      {photo ? <img src={photo} alt="" loading="lazy" />
                        : <div className="spot-photo-placeholder" aria-hidden="true">{CAT_ICON[category] || "📍"}</div>}
                      <span className="spot-no">{i + 1}</span>
                    </div>
                    <div className="spot-body">
                      <h4>{r.title}</h4>
                      <p className="spot-why">{checked ? short || exp?.description : "Not checked against your time and budget yet."}</p>
                      {checked && r.reasons.length > 0 && (
                        <>
                          <button type="button" className="link-btn" aria-expanded={whyOpen === r.experience_id}
                            onClick={() => setWhyOpen(whyOpen === r.experience_id ? null : r.experience_id)}>
                            {whyOpen === r.experience_id ? "Hide why" : "Why this?"}
                          </button>
                          {whyOpen === r.experience_id && (
                            <ul className="why-list">{r.reasons.map((x) => <li key={x} className={x.startsWith("⚠") ? "warn" : ""}>{x}</li>)}</ul>
                          )}
                        </>
                      )}
                      {heavyWeather && typeof comfort === "number" && (
                        <span className={`spot-comfort ${comfort >= 0.75 ? "good" : comfort < 0.35 ? "bad" : ""}`}>
                          {state?.weather === "rain" ? (comfort >= 0.75 ? "Sheltered from rain" : comfort < 0.35 ? "Exposed to rain" : "Partly sheltered")
                            : comfort >= 0.75 ? "Cool in the heat" : comfort < 0.35 ? "Hot and exposed" : "Some shade"}
                        </span>
                      )}
                      <div className="spot-meta">
                        <span>{r.cost_inr ? `₹${r.cost_inr}` : "Free"}</span>
                        {checked && <span>{r.start.slice(11, 16)}–{r.end.slice(11, 16)}</span>}
                        <button type="button" className="link-btn" onClick={() => setReviewsFor({ id: r.experience_id, title: r.title })}>
                          ⭐ {rating !== null ? rating.toFixed(1) : "Reviews"}
                        </button>
                      </div>
                      <div className="spot-actions">
                        {isPlanned ? <span className="planned-indicator">✓ In your plan</span> : (
                          <button type="button" className="mini" onClick={() => handleAddStop(r)} disabled={busy}>+ Add to plan</button>
                        )}
                        <Link to="/3d" className="link-btn" title="3D view">3D</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <RuledOut excluded={excluded} expMap={expMap} wanted={[...(state?.intents ?? []), ...(state?.group ?? []).flatMap((g) => g.interests)]} />

          {/* 5. The plan */}
          <section className="explore-section plan-card" id="day-plan-section">
            <div className="section-head">
              <h3>Your plan</h3>
              <span className="count-pill">{liveStops.length} {liveStops.length === 1 ? "stop" : "stops"}</span>
              {liveStops.length > 0 && <span className="muted small">~{totalDurationMin} min · ₹{totalCost}</span>}
              <div className="section-actions">
                <button type="button" className="secondary mini" onClick={() => { setIsSimulationOpen(true); if (!simResult) triggerSimulation(); }}
                  title="Try rain, heat or a delay on this plan">What-if</button>
                <button type="button" className="secondary mini" onClick={() => setIsSocialOpen(true)}>Signals</button>
                <button type="button" className="mini" disabled={busy || liveStops.length === 0} onClick={exportCalendar}>📅 Add to calendar</button>
              </div>
            </div>

            {problems.length > 0 && (
              <ul className="plan-problems">{problems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>
            )}
            {appliedSimulationNotice && (
              <div className="plan-notice">
                <span>🛡️ {appliedSimulationNotice}</span>
                <button type="button" className="icon" onClick={() => setAppliedSimulationNotice(null)} aria-label="Dismiss">✕</button>
              </div>
            )}

            {liveStops.length === 0 ? (
              <p className="explore-empty">
                {recs.length === 0 && !busy
                  ? "Nothing fits this time window right now. Try another time, a bigger budget or a different area."
                  : "No stops yet. Add places from above, or ask the planner to build a plan."}
              </p>
            ) : (
              <ol className="plan-list">
                {liveStops.map((s, idx) => (
                  <li key={s.experience_id || idx}
                    className={highlightedExpId === s.experience_id ? "hovered" : ""}
                    onMouseEnter={() => s.experience_id && setHighlightedExpId(s.experience_id)}
                    onMouseLeave={() => setHighlightedExpId(null)}>
                    <span className="plan-letter">{String.fromCharCode(65 + idx)}</span>
                    <div className="plan-info">
                      <strong>{s.title}</strong>
                      <span className="muted small">{hhmm(s.start)}–{hhmm(s.end)} · {s.cost_inr ? `₹${s.cost_inr}` : "Free"}{s.locked ? " · 🔒 locked" : ""}</span>
                    </div>
                    <button type="button" className="icon" onClick={() => handleToggleLock(s)}
                      aria-label={s.locked ? `Unlock ${s.title}` : `Lock ${s.title}`} title={s.locked ? "Unlock time" : "Lock time"}>
                      {s.locked ? "🔒" : "🔓"}
                    </button>
                    <button type="button" className="icon" onClick={() => handleRemoveStop(s)} aria-label={`Remove ${s.title}`}>✕</button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right: weather at a glance and the map, which stays in view while you scroll */}
        <aside className="explore-side">
          <div className="side-sticky">
            <div className="weather-mini">
              <span className="weather-icon" aria-hidden="true">
                {weatherSummary?.condition === "rain" ? "🌧" : weatherSummary?.condition === "heat" ? "🔥" : "☀️"}
              </span>
              <div>
                <strong>{chatCtx ? chatCtx.location : "Demo city"} · {weatherSummary?.temp_c != null ? `${weatherSummary.temp_c.toFixed(0)}°C` : "weather unavailable"}</strong>
                <span className="muted small">
                  {weatherSummary?.available
                    ? [weatherSummary.precip_prob != null && `${weatherSummary.precip_prob}% rain`,
                       weatherSummary.humidity_pct != null && `${weatherSummary.humidity_pct}% humidity`,
                       weatherSummary.wind_kmh != null && `wind ${weatherSummary.wind_kmh.toFixed(0)} km/h`].filter(Boolean).join(" · ")
                    : "No live forecast right now"}
                </span>
                {weatherSummary?.available && weatherSummary.condition !== "clear" && weatherSummary.ai_guidance && (
                  <span className="weather-tip">{weatherSummary.ai_guidance}</span>
                )}
              </div>
            </div>
            <div className="map-box">
              <MapView
                state={state}
                recs={filteredRecs}
                stops={itinerary.stops}
                highlightedId={highlightedExpId}
                impactZones={simResult?.impact_zones}
                socialSignals={socialSignals}
                vulnerableStopIds={simResult?.vulnerable_stop_ids}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* =========================================================================
          DIGITAL TWIN WHAT-IF SIMULATION STUDIO MODAL
      ========================================================================== */}
      {isSimulationOpen && (
        <div className="exp-modal-backdrop" style={{ zIndex: 3000 }}>
          <div className="exp-modal-card" style={{ maxWidth: "860px", maxHeight: "92vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.4rem" }}>🌐</span>
                  <h3 style={{ margin: 0, fontSize: "1.4rem", fontFamily: "var(--serif)", color: "var(--ink)" }}>
                    Digital Twin · Environmental What-If Studio
                  </h3>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                  Simulate severe weather events across Jaipur, propagate physical transit delays, and watch the AI engine repair the day's itinerary.
                </p>
              </div>
              <button type="button" onClick={() => setIsSimulationOpen(false)} className="close-drawer-btn" style={{ fontSize: "1.2rem" }}>
                ✕
              </button>
            </div>

            {/* Presets Bar */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase", color: "var(--accent)", display: "block", marginBottom: "6px" }}>
                1-Click What-If Scenarios:
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(simPresets.length ? simPresets : [
                  { name: "Sudden Cloudburst (35 mm/h)", temp_c: 29.5, rain_intensity_mm_h: 35.0, duration_hours: 2.5, epicenter_lat: 26.9239, epicenter_lon: 75.8267, epicenter_name: "Old Walled City", radius_km: 3.8, wind_kmh: 32.0 },
                  { name: "Extreme Heatwave (43.8°C)", temp_c: 43.8, rain_intensity_mm_h: 0.0, duration_hours: 4.0, epicenter_lat: 26.9247, epicenter_lon: 75.8245, epicenter_name: "Jantar Mantar", radius_km: 5.0, wind_kmh: 18.0 },
                  { name: "Amer Flash Flood & Rampart Closure", temp_c: 27.0, rain_intensity_mm_h: 48.0, duration_hours: 3.0, epicenter_lat: 26.9855, epicenter_lon: 75.8513, epicenter_name: "Amer Fort Hills", radius_km: 2.8, wind_kmh: 28.0 },
                  { name: "Pleasant Autumn Evening (24.0°C)", temp_c: 24.0, rain_intensity_mm_h: 0.0, duration_hours: 3.0, epicenter_lat: 26.9378, epicenter_lon: 75.8155, epicenter_name: "Nahargarh Ridge", radius_km: 4.0, wind_kmh: 12.0 },
                ]).map((pre, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCurrentScenario(pre);
                      applyScenarioAndRedirectToPlan(pre);
                    }}
                    style={{
                      background: currentScenario.name === pre.name ? "var(--accent)" : "var(--panel-2)",
                      color: currentScenario.name === pre.name ? "#ffffff" : "var(--ink)",
                      border: "1px solid var(--line)",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title="Select and apply this scenario to plan"
                  >
                    ⚡ {pre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameter Sliders Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", background: "var(--panel-2)", padding: "14px", borderRadius: "12px", border: "1px solid var(--line)", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span>🌡️ Temperature</span>
                  <span style={{ color: "var(--accent)", fontWeight: 800 }}>{currentScenario.temp_c.toFixed(1)}°C</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="48"
                  step="0.5"
                  value={currentScenario.temp_c}
                  onChange={(e) => {
                    const next = { ...currentScenario, temp_c: Number(e.target.value) };
                    setCurrentScenario(next);
                  }}
                  className="budget-slider"
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span>🌧️ Rain Intensity</span>
                  <span style={{ color: "var(--accent)", fontWeight: 800 }}>{currentScenario.rain_intensity_mm_h.toFixed(1)} mm/h</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={currentScenario.rain_intensity_mm_h}
                  onChange={(e) => {
                    const next = { ...currentScenario, rain_intensity_mm_h: Number(e.target.value) };
                    setCurrentScenario(next);
                  }}
                  className="budget-slider"
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span>⏱️ Duration</span>
                  <span style={{ color: "var(--accent)", fontWeight: 800 }}>{currentScenario.duration_hours.toFixed(1)} hrs</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="6.0"
                  step="0.5"
                  value={currentScenario.duration_hours}
                  onChange={(e) => {
                    const next = { ...currentScenario, duration_hours: Number(e.target.value) };
                    setCurrentScenario(next);
                  }}
                  className="budget-slider"
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px" }}>
                  <span>📍 Epicenter</span>
                </div>
                <select
                  value={currentScenario.epicenter_name}
                  onChange={(e) => {
                    const val = e.target.value;
                    let lat = 26.9239;
                    let lon = 75.8267;
                    if (val.includes("Amer")) { lat = 26.9855; lon = 75.8513; }
                    else if (val.includes("Nahargarh")) { lat = 26.9378; lon = 75.8155; }
                    else if (val.includes("Jantar")) { lat = 26.9247; lon = 75.8245; }
                    setCurrentScenario({ ...currentScenario, epicenter_name: val, epicenter_lat: lat, epicenter_lon: lon });
                  }}
                  style={{ width: "100%", padding: "5px 8px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--panel)", fontSize: "0.78rem", fontWeight: 700, color: "var(--ink)" }}
                >
                  <option value="Old Walled City, Jaipur">Old Walled City & Badi Chaupar</option>
                  <option value="Amer Fort Hills & Maota Lake">Amer Fort Hills</option>
                  <option value="Jantar Mantar & Central Open Terraces">Jantar Mantar Open Area</option>
                  <option value="Nahargarh Ridge & Sunset Point">Nahargarh Ridge</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button
                type="button"
                className="ai-assistant-btn"
                style={{ width: "auto", padding: "8px 20px" }}
                onClick={() => applyScenarioAndRedirectToPlan(currentScenario)}
                disabled={simLoading}
              >
                {simLoading ? "Applying Simulation Physics..." : "⚡ Execute & Apply Scenario to Plan"}
              </button>
            </div>

            {/* Simulation Results Display */}
            {simResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* 4 Telemetry Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                  <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 800 }}>Safety Score</span>
                    <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", color: simResult.metrics.safety_score < 70 ? "var(--bad)" : "var(--ok)", fontWeight: 900 }}>
                      {simResult.metrics.safety_score}%
                    </h4>
                  </div>

                  <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 800 }}>Comfort Index</span>
                    <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", color: simResult.metrics.comfort_index < 70 ? "var(--warn)" : "var(--ok)", fontWeight: 900 }}>
                      {simResult.metrics.comfort_index}%
                    </h4>
                  </div>

                  <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 800 }}>Transit Friction</span>
                    <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", color: "var(--ink)", fontWeight: 900 }}>
                      {simResult.metrics.transit_friction_multiplier}x
                    </h4>
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>+{simResult.metrics.added_transit_delay_min} min delay</span>
                  </div>

                  <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 800 }}>Sheltered Ratio</span>
                    <h4 style={{ margin: "4px 0 0", fontSize: "1.3rem", color: "var(--accent)", fontWeight: 900 }}>
                      {simResult.metrics.sheltered_ratio_pct}%
                    </h4>
                  </div>
                </div>

                {/* AI Executive Summary */}
                <div style={{ background: "rgba(38, 51, 136, 0.08)", border: "1px solid rgba(38, 51, 136, 0.2)", borderRadius: "10px", padding: "12px 14px", fontSize: "0.82rem", lineHeight: 1.45, color: "var(--ink)" }}>
                  <strong style={{ display: "block", color: "var(--rec)", marginBottom: "4px" }}>
                    🤖 Digital Twin Assessment & Propagation Analysis:
                  </strong>
                  {simResult.ai_executive_summary}
                </div>

                {/* Itemized Replan Changes */}
                <div>
                  <h4 style={{ margin: "0 0 8px", fontSize: "0.92rem", fontWeight: 800, color: "var(--ink)" }}>
                    Automated Plan Repair ({simResult.changes.length} adjustments proposed):
                  </h4>
                  {simResult.changes.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>No itinerary changes required. Current stops remain safe and accessible.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {simResult.changes.map((c, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.82rem" }}>
                          <div>
                            <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: "0.72rem", color: c.action === "replaced" ? "var(--accent)" : "var(--warn)", marginRight: "8px" }}>
                              {c.action}
                            </span>
                            <strong>{c.stop}</strong>
                            {c.new_stop && <span> → <strong style={{ color: "var(--ok)" }}>{c.new_stop}</strong></span>}
                            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>Reason: {c.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "14px", marginTop: "6px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    Map now visualizes the simulated impact rings and vulnerable stops.
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setIsSimulationOpen(false)}
                      style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: "0.82rem", fontWeight: 700 }}
                    >
                      Close & Observe Map
                    </button>
                    <button
                      type="button"
                      onClick={applySimulatedPlan}
                      className="ai-assistant-btn"
                      style={{ width: "auto", padding: "8px 18px" }}
                    >
                      ✅ Apply Simulated Plan to My Day
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          REAL-WORLD SOCIAL SIGNAL RADAR DRAWER / MODAL
      ========================================================================== */}
      {isSocialOpen && (
        <div className="exp-modal-backdrop" style={{ zIndex: 3000 }}>
          <div className="exp-modal-card" style={{ maxWidth: "700px", maxHeight: "88vh", overflowY: "auto", padding: "22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.4rem" }}>📡</span>
                  <h3 style={{ margin: 0, fontSize: "1.3rem", fontFamily: "var(--serif)", color: "var(--ink)" }}>
                    Jaipur Real-World Social Signals Radar
                  </h3>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                  Sample posts for the demo, not a live feed. Reports you add are kept for this session.
                </p>
              </div>
              <button type="button" onClick={() => setIsSocialOpen(false)} className="close-drawer-btn" style={{ fontSize: "1.2rem" }}>
                ✕
              </button>
            </div>

            {/* Trending Hashtags */}
            {trendingHashtags.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                {trendingHashtags.map((h, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: h.sentiment === "critical" ? "rgba(179, 38, 30, 0.15)" : "var(--panel-2)",
                      color: h.sentiment === "critical" ? "var(--bad)" : "var(--accent)",
                      border: "1px solid var(--line)",
                      borderRadius: "999px",
                      padding: "3px 10px",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                    }}
                  >
                    {h.tag} <small style={{ opacity: 0.7 }}>({h.count})</small>
                  </span>
                ))}
              </div>
            )}

            {/* Report Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--ink)" }}>
                Latest Community Reports ({socialSignals.length}):
              </span>
              <button
                type="button"
                onClick={() => setIsReportOpen(!isReportOpen)}
                style={{
                  background: "var(--accent)",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: "8px",
                  padding: "5px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isReportOpen ? "Cancel Report" : "➕ Report Ground Hazard"}
              </button>
            </div>

            {/* Ground Hazard Submission Form */}
            {isReportOpen && (
              <form onSubmit={handleReportSubmit} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <strong style={{ fontSize: "0.82rem", color: "var(--ink)" }}>Submit Live Ground Report:</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Your Name (or Guide ID)"
                    value={reportAuthor}
                    onChange={(e) => setReportAuthor(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "0.8rem", background: "var(--panel)" }}
                  />
                  <input
                    type="text"
                    placeholder="Location (e.g. Hawa Mahal, Amer)"
                    value={reportLocation}
                    onChange={(e) => setReportLocation(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "0.8rem", background: "var(--panel)" }}
                  />
                </div>
                <textarea
                  placeholder="Describe current weather, crowd condition, road waterlogging, or advice..."
                  rows={2}
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "0.8rem", background: "var(--panel)" }}
                  required
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <select
                    value={reportSentiment}
                    onChange={(e) => setReportSentiment(e.target.value as any)}
                    style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--line)", fontSize: "0.76rem" }}
                  >
                    <option value="warning">⚠️ Warning / Delay</option>
                    <option value="critical">🚨 Critical / Closure</option>
                    <option value="positive">✨ Positive / Clear</option>
                    <option value="neutral">ℹ️ Informational</option>
                  </select>
                  <button type="submit" className="ai-assistant-btn" style={{ width: "auto", padding: "6px 16px", fontSize: "0.78rem" }}>
                    Publish to Live Radar
                  </button>
                </div>
              </form>
            )}

            {/* Signals Feed */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "380px", overflowY: "auto" }}>
              {socialSignals.map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    background: "var(--panel-2)",
                    border: `1.5px solid ${sig.sentiment === "critical" ? "#b3261e" : sig.sentiment === "warning" ? "var(--accent)" : "var(--line)"}`,
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "1.1rem" }}>{sig.avatar}</span>
                      <strong style={{ fontSize: "0.82rem", color: "var(--ink)" }}>{sig.author}</strong>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>({sig.handle})</span>
                      {sig.verified && <span style={{ fontSize: "0.68rem", color: "var(--ok)", fontWeight: 800 }}>✓ Official</span>}
                    </div>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: sig.sentiment === "critical" ? "#b3261e" : sig.sentiment === "warning" ? "var(--accent)" : "var(--ok)",
                        color: "#ffffff",
                      }}
                    >
                      {sig.sentiment}
                    </span>
                  </div>

                  <p style={{ margin: "4px 0", fontSize: "0.8rem", color: "var(--ink)", lineHeight: 1.35 }}>
                    {sig.content}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "var(--muted)", borderTop: "1px dashed var(--line)", paddingTop: "4px", marginTop: "2px" }}>
                    <span>📍 {sig.location_name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHighlightedExpId(null);
                        setIsSocialOpen(false);
                      }}
                      style={{ background: "transparent", border: 0, color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: "0.72rem" }}
                    >
                      Spotlight on Map ↗
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reviewsFor && (
        <ExperienceReviews experienceId={reviewsFor.id} title={reviewsFor.title} onClose={() => setReviewsFor(null)} />
      )}

      {calendar && (
        <div className="exp-modal-backdrop" style={{ zIndex: 3000 }} onClick={() => setCalendar(null)}>
          <div className="exp-modal-card cal-modal" role="dialog" aria-label="Add your plan to a calendar" onClick={(e) => e.stopPropagation()}>
            <div className="rv-modal-head">
              <div>
                <h3>Add your plan to a calendar</h3>
                <p className="muted small">Each reminder fires when it's time to leave: travel time from the previous stop, plus 15 minutes.</p>
              </div>
              <button type="button" className="close-drawer-btn" onClick={() => setCalendar(null)} aria-label="Close">✕</button>
            </div>
            <button type="button" onClick={downloadIcs}>⬇ Download all stops (.ics, with reminders)</button>
            <p className="muted small">Opens in Google Calendar, Apple Calendar or Outlook. Or add stops one by one:</p>
            <ul className="cal-list">
              {calendar.events.map((e) => (
                <li key={e.start + e.title}>
                  <div>
                    <strong>{hhmm(e.start)}–{hhmm(e.end)} {e.title}</strong>
                    <span className="muted small">🔔 {e.remind_min} min before · {e.reminder.split("\n")[0]}</span>
                  </div>
                  <a className="button mini" href={e.google_url} target="_blank" rel="noopener noreferrer">Google Calendar ↗</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

    </div>
  );
}

// The assistant's reply, from what the engine actually did (never a canned claim): the top picks
// with their own reasons, what was ruled out, and every assumption.
function botReply(recs: Recommendation[], ctx: ChatContext | null, ruledOut: number): string {
  // Short on purpose: weather, closed-now and assumptions are shown right below in the context strip.
  const where = ctx ? ` in ${ctx.location}` : "";
  if (!recs.length) return `Nothing fits right now${where}. See "Why not these?" below for each reason.`;
  const top = recs.slice(0, 3).map((r, i) => {
    const why = r.reasons.filter((x) => !x.startsWith("⚠")).slice(0, 2).join(", ");
    return `${i + 1}. ${r.title} (${why})`;
  });
  const extra = [ctx?.closed_now.length && "what's closed", ctx?.assumptions.length && "what I assumed",
    ruledOut && `${ruledOut} ruled out`].filter(Boolean);
  return [`Here's what works${where}:`, ...top, extra.length ? `Below: ${extra.join(", ")}.` : ""].filter(Boolean).join("\n");
}

// Everything the engine ruled out, with its reasons; the ones closest to what you wanted first.
function RuledOut({ excluded, expMap, wanted }: { excluded: Record<string, string[]>; expMap: Map<string, any>; wanted: string[] }) {
  const [all, setAll] = useState(false);
  const want = new Set(wanted);
  const rows = Object.entries(excluded)
    .map(([id, why]) => {
      const exp = expMap.get(id);
      return { id, why, title: exp?.title ?? id, match: (exp?.tags ?? []).filter((t: string) => want.has(t)).length };
    })
    .sort((a, b) => b.match - a.match || a.title.localeCompare(b.title));
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <details className="ruled-out">
      <summary>Why not these? <span className="count-pill">{rows.length} ruled out</span></summary>
      <p className="muted small">
        These can't work right now: closed, too far for your time, over budget, missing access you need,
        or something you said to skip. Everything else that's open is ranked, and the best are shown above.
      </p>
      <ul>
        {shown.map((r) => (
          <li key={r.id}>
            <b>{r.title}</b>{r.match > 0 && <span className="chip tag">matches you</span>}
            <span className="muted">{r.why.join("; ")}</span>
          </li>
        ))}
      </ul>
      {rows.length > 12 && (
        <button type="button" className="secondary mini" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </details>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${iso.slice(11, 16)}`;
}

function ContextStrip({ ctx }: { ctx: ChatContext }) {
  const src = { text: "you said", device: "your location", previous: "earlier", profile: "your profile", default: "demo city" }[ctx.location_source];
  return (
    <section className="ctx-strip" aria-label="What the planner took into account">
      <div className="ctx-row">
        <span className="ctx-item">📍 <b>{ctx.location}</b> <span className="muted">({src})</span></span>
        <span className="ctx-item">
          {ctx.weather.available
            ? `${ctx.weather.condition === "rain" ? "🌧" : ctx.weather.condition === "heat" ? "🔥" : "☀"} ${ctx.weather.temp_c != null ? Math.round(ctx.weather.temp_c) + "°C" : ""} ${ctx.weather.condition}`
            : "Weather unavailable"}
        </span>
        <span className="ctx-item">🚦 {ctx.traffic}</span>
        <span className="ctx-item muted">{ctx.places_considered} places checked ({ctx.data_source})</span>
        {ctx.profile_used && <span className="ctx-item">🧠 using your profile</span>}
      </div>
      {ctx.closed_now.length > 0 && (
        <div className="ctx-closed">
          <b>Closed right now:</b>
          {ctx.closed_now.map((c) => (
            <span key={c.experience_id} title={c.why}>
              {c.title}{c.next_open ? ` (opens ${fmtWhen(c.next_open)}${c.hours_confirmed ? "" : ", typical hours"})` : ""}
            </span>
          ))}
        </div>
      )}
      {ctx.assumptions.length > 0 && (
        <ul className="ctx-assume">{ctx.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      )}
    </section>
  );
}
