// In-memory stand-in for the v2 backend (VITE_API_MOCK=1). Same types and error messages, so pages
// can be built and demoed while the backend evolves. Demo accounts: admin@example.com / "admin pass 123".
import type { Catalog } from "../api";
import type {
  AdminStats,
  AdminUserRow,
  Candidate,
  ContextEntry,
  Profile,
  ProfileContext,
  Question,
  Role,
  Stay,
  StayRecommendation,
  Trip,
  TripDraft,
  TripSuggestions,
  User,
} from "../types";
import { MAX_TRIP_DAYS, emptyProfile } from "../types";
import type { V2 } from "../v2api";

type Row = AdminUserRow & { password: string; profile: Profile | null; trips: Trip[] };
const now = () => new Date().toISOString().slice(0, 19);
const users: Row[] = [
  {
    id: 1,
    email: "admin@example.com",
    role: "admin",
    display_name: "Admin",
    disabled: false,
    created: now(),
    last_login: null,
    password: "admin pass 123",
    profile: null,
    trips: [],
  },
];
const KEY = "le.mockUser";
const current = (): Row | undefined => {
  try {
    return users.find((u) => u.id === Number(sessionStorage.getItem(KEY)));
  } catch {
    return undefined;
  }
};
const setCurrent = (id: number | null) => {
  try {
    id === null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, String(id));
  } catch {
    /* private mode */
  }
};
const toUser = (u: Row): User => ({
  id: u.id,
  email: u.email,
  role: u.role,
  display_name: u.display_name,
  created: u.created,
  onboarded: u.profile !== null,
});
const toAdmin = ({ password: _p, profile: _pr, trips: _t, ...row }: Row): AdminUserRow => row;
const fail = (msg: string): never => {
  throw new Error(msg);
};
const need = (role?: Role): Row => {
  const u = current() ?? fail("please sign in");
  if (role && u.role !== role) fail("you don't have access to this");
  return u;
};
const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
let tripSeq = 1;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

const checkTrip = (d: TripDraft) => {
  if (!d.title.trim()) fail("String should have at least 1 character");
  if (!d.travelers.length) fail("List should have at least 1 item after validation, not 0");
  if (days(d.start_date, d.end_date) < 0) fail("Value error, the trip can't end before it starts");
  if (days(d.start_date, d.end_date) >= MAX_TRIP_DAYS)
    fail(`Value error, trips can be at most ${MAX_TRIP_DAYS} days`);
  if (d.day_end <= d.day_start) fail("Value error, each day must end after it starts");
};

// learned context per user id; the mock only records imports (the real parser is server-side)
const contexts = new Map<number, ContextEntry[]>();
const ctxOf = (u: Row): ProfileContext => ({
  entries: contexts.get(u.id) ?? [],
  from_trips: [],
  summary: (contexts.get(u.id) ?? []).map((e) => `${e.weight > 0 ? "likes" : "avoids"} ${e.tag}`).join(", "),
});
const questions: Question[] = [
  { id: "interests", text: "What do you enjoy most when you travel?", kind: "multi", options: ["heritage", "history", "museum", "beach", "local-food", "craft", "nature"], max_choices: 5, why: "Ranks what matches your taste higher." },
  { id: "dislikes", text: "Anything you'd rather skip?", kind: "multi", options: ["nature", "shopping", "nightlife", "adventure"], max_choices: 5, why: "We won't suggest these unless you ask." },
  { id: "age", text: "How old are you?", kind: "number", options: [], max_choices: null, why: "Sets a comfortable pace and age limits. Only you can see it." },
  { id: "companions", text: "Who do you usually travel with?", kind: "companions", options: [], max_choices: null, why: "Plans for the whole group when you say you're with them." },
  { id: "pace", text: "How full do you like your days?", kind: "single", options: ["relaxed", "normal", "packed"], max_choices: null, why: "Adds breathing room between stops." },
  { id: "home_city", text: "Which city do you live in?", kind: "text", options: [], max_choices: null, why: "Where we plan when you don't say where you are." },
];

const findTrip = (u: Row, id: number) => u.trips.find((t) => t.id === id) ?? fail("no such trip");

const mockStays: Stay[] = [
  {
    id: "stay-kalwara-haveli",
    name: "Haveli Kalwara (Heritage Homestay)",
    type: "homestay",
    area: "Old City (Pink City)",
    lat: 26.9242,
    lon: 75.8225,
    price_per_night_inr: 3200,
    rating: 4.8,
    review_count: 142,
    accessibility: ["step_free"],
    description: "Restored 120-year-old Rajput haveli inside the walled city, minutes from City Palace.",
    phone: "+91 141 2601234",
    website: "https://example.com/kalwara-haveli",
    sample_contact: true,
  },
  {
    id: "stay-pearl-palace",
    name: "Hotel Pearl Palace",
    type: "hotel",
    area: "Hathroi Fort / MI Road",
    lat: 26.918,
    lon: 75.7975,
    price_per_night_inr: 2800,
    rating: 4.7,
    review_count: 310,
    accessibility: ["wheelchair", "step_free"],
    description: "Famous boutique heritage hotel with intricate Rajasthani art and rooftop dining.",
    phone: "+91 141 2373700",
    website: "https://example.com/pearl-palace",
    sample_contact: true,
  },
  {
    id: "stay-moustache-hostel",
    name: "Moustache Jaipur (Boutique Hostel)",
    type: "hostel",
    area: "MI Road / Park Street",
    lat: 26.916,
    lon: 75.802,
    price_per_night_inr: 850,
    rating: 4.6,
    review_count: 480,
    accessibility: ["step_free"],
    description: "Vibrant design hostel with private rooms and dorms, terrace lounge and local walking tours.",
    phone: "+91 141 4038888",
    website: "https://example.com/moustache-jaipur",
    sample_contact: true,
  },
];

const catalog: Catalog = {
  places: [],
  provider_listings: [],
  paused: [],
  experiences: [
    ["ex-hawa-mahal", "Hawa Mahal: Palace of Winds", "culture"],
    ["ex-amer-fort", "Amer Fort", "culture"],
    ["ex-city-palace", "City Palace museum & courtyards", "culture"],
    ["ex-jantar-mantar", "Jantar Mantar observatory", "learning"],
    ["ex-nahargarh-sunset", "Nahargarh Fort sunset over the Pink City", "nature"],
    ["ex-street-food-walk", "Johari Bazaar street-food walk", "food"],
    ["ex-cooking-class", "Rajasthani home cooking class with Meena Devi", "food"],
    ["ex-block-print-workshop", "Hand block-printing workshop", "art"],
    ["ex-puppet-show", "Kathputli puppet show", "culture"],
    ["ex-leopard-safari", "Jhalana leopard safari", "nature"],
    ["ex-balloon", "Hot-air balloon over Amer at sunrise", "adventure"],
    ["ex-bazaar-evening-walk", "Bazaars after dark: textiles & jewellery", "shopping"],
  ].map(([id, title, category]) => ({ id, title, category, place_id: "" })),
  vocabulary: {
    tags: [
      "local-food",
      "street-food",
      "vegetarian",
      "sweets",
      "heritage",
      "history",
      "architecture",
      "museum",
      "spiritual",
      "craft",
      "art",
      "music",
      "dance",
      "workshop",
      "shopping",
      "market",
      "textiles",
      "nature",
      "wildlife",
      "sunset",
      "photography",
      "adventure",
      "active",
      "relaxed",
      "nightlife",
      "family",
      "kids",
      "learning",
      "walking-tour",
      "hidden-gem",
      "iconic",
    ],
    categories: [],
    accessibility: ["wheelchair", "step_free", "seating", "quiet"],
  },
};

export const mockV2: V2 = {
  async register(email, password, display_name) {
    email = email.trim().toLowerCase();
    if (users.some((u) => u.email === email)) fail("an account with this email already exists");
    if (password.length < 8) fail("String should have at least 8 characters");
    const u: Row = {
      id: users.length + 1,
      email,
      role: "traveler",
      display_name,
      disabled: false,
      created: now(),
      last_login: now(),
      password,
      profile: null,
      trips: [],
    };
    users.push(u);
    setCurrent(u.id);
    return delay(toUser(u));
  },
  async login(email, password) {
    const u = users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || u.password !== password) fail("wrong email or password");
    if (u!.disabled) fail("this account is disabled; contact an admin");
    u!.last_login = now();
    setCurrent(u!.id);
    return delay(toUser(u!));
  },
  async logout() {
    setCurrent(null);
  },
  async me() {
    const u = current();
    return delay(u ? toUser(u) : null);
  },
  async getProfile() {
    const u = need();
    return delay(u.profile ?? emptyProfile(u.display_name));
  },
  async putProfile(p) {
    const u = need();
    u.profile = p;
    u.display_name = p.display_name;
    return delay(p);
  },
  async changePassword(cur, next) {
    const u = need();
    if (u.password !== cur) fail("current password is wrong");
    u.password = next;
  },
  async exportData() {
    const u = need();
    return delay({ account: toUser(u), profile: u.profile, trips: u.trips });
  },
  async deleteAccount(password) {
    const u = need();
    if (u.password !== password) fail("password is wrong");
    users.splice(users.indexOf(u), 1);
    setCurrent(null);
  },
  async adminUsers() {
    need("admin");
    return delay(users.map(toAdmin));
  },
  async adminPatch(id, patch) {
    need("admin");
    const u = users.find((x) => x.id === id) ?? fail("no such user");
    if (patch.role) u.role = patch.role;
    if (patch.disabled !== undefined) u.disabled = patch.disabled;
    if (patch.temp_password) u.password = patch.temp_password;
    return delay(toAdmin(u));
  },
  async adminStats() {
    need("admin");
    return delay({
      users: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      providers: users.filter((u) => u.role === "provider").length,
      disabled: users.filter((u) => u.disabled).length,
      active_sessions: current() ? 1 : 0,
      provider_listings: 0,
    });
  },
  async trips() {
    return delay(
      [...need().trips].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id)
    );
  },
  async trip(id) {
    return delay(findTrip(need(), id));
  },
  async createTrip(d) {
    const u = need();
    checkTrip(d);
    const t: Trip = { ...d, id: tripSeq++, created: now(), updated: now() };
    u.trips.push(t);
    return delay(t);
  },
  async updateTrip(id, d) {
    const u = need();
    const t = findTrip(u, id);
    checkTrip(d);
    Object.assign(t, d, { updated: now() });
    return delay(t);
  },
  async deleteTrip(id) {
    const u = need();
    u.trips.splice(u.trips.indexOf(findTrip(u, id)), 1);
  },
  async stays() {
    return delay(mockStays);
  },
  async candidates(tripId) {
    const t = findTrip(need(), tripId);
    const list: Candidate[] = catalog.experiences.map((e, idx) => ({
      experience_id: e.id,
      title: e.title,
      score: 0.85 - idx * 0.05,
      reasons: [t.must_see.includes(e.id) ? "Pinned as must-see" : "Top match for your interests"],
      travel_by_mode: { walk: 12 + idx * 4, auto: 6 + idx * 2, bus: 15 + idx * 3, car: 5 + idx * 2 },
      duration_min: 60,
      cost_inr: 300 * t.travelers.length,
      feasible_days: [0, 1],
      must_see: t.must_see.includes(e.id),
      along_route: 0.8,
      outdoor_convenience_heat: e.outdoor_convenience_heat ?? (e.indoor ? 0.9 : 0.4),
      outdoor_convenience_rain: e.outdoor_convenience_rain ?? (e.indoor ? 0.95 : 0.3),
    }));
    return delay(list);
  },
  async stayRecommendations(_tripId) {
    const recs: StayRecommendation[] = mockStays.map((s, idx) => ({
      stay: s,
      score: 0.92 - idx * 0.08,
      distance_to_picks_km: 1.2 + idx * 0.9,
      travel_to_centroid_min: 6 + idx * 4,
      reasons: ["Central location close to your selected activities", "Within your budget"],
    }));
    return delay(recs);
  },
  async generateItinerary(tripId) {
    const u = need();
    const t = findTrip(u, tripId);
    
    // Parse dates cleanly
    const [sy, sm, sd] = t.start_date.split("-").map(Number);
    const [ey, em, ed] = t.end_date.split("-").map(Number);
    const sDate = new Date(sy, sm - 1, sd);
    const eDate = new Date(ey, em - 1, ed);
    const totalDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1);

    const pad = (n: number) => String(n).padStart(2, "0");
    const days: string[] = [];
    for (let d = 0; d < totalDays; d++) {
      const cur = new Date(sy, sm - 1, sd + d);
      days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    }

    const mockPool = [
      { title: "Hawa Mahal: Palace of Winds", id: "ex-hawa-mahal", lat: 26.9239, lon: 75.8267, dur: 90, cost: 300 },
      { title: "Jantar Mantar observatory", id: "ex-jantar-mantar", lat: 26.9248, lon: 75.8246, dur: 60, cost: 200 },
      { title: "City Palace museum & courtyards", id: "ex-city-palace", lat: 26.9258, lon: 75.8237, dur: 90, cost: 400 },
      { title: "Hand block-printing workshop", id: "ex-block-print-workshop", lat: 26.9205, lon: 75.8280, dur: 60, cost: 500 },
      { title: "Nahargarh Fort sunset over the Pink City", id: "ex-nahargarh-sunset", lat: 26.9372, lon: 75.8155, dur: 120, cost: 200 },
      { title: "Johari Bazaar street-food walk", id: "ex-street-food-walk", lat: 26.9162, lon: 75.8569, dur: 90, cost: 100 },
      { title: "Amer Fort", id: "ex-amer-fort", lat: 26.9855, lon: 75.8513, dur: 120, cost: 500 },
      { title: "Rajasthani home cooking class with Meena Devi", id: "ex-cooking-class", lat: 26.9124, lon: 75.7873, dur: 90, cost: 800 },
    ];

    const shortlistedInPerson = Object.entries(t.shortlist ?? {})
      .filter(([_, dec]) => dec === "in_person")
      .map(([id]) => id);

    let activePool = mockPool.filter((m) => shortlistedInPerson.includes(m.id));
    if (activePool.length === 0) {
      activePool = mockPool;
    }

    const stops: any[] = [];
    let poolIdx = 0;

    for (let d = 0; d < days.length; d++) {
      const dayStr = days[d];

      const s1 = activePool[poolIdx % activePool.length];
      poolIdx++;
      const s2 = activePool[poolIdx % activePool.length];
      poolIdx++;

      stops.push({
        title: s1.title,
        experience_id: s1.id,
        lat: s1.lat,
        lon: s1.lon,
        start: `${dayStr}T10:00:00`,
        end: `${dayStr}T11:30:00`,
        status: "proposed",
        locked: false,
        cost_inr: s1.cost * (t.travelers?.length || 1),
      });

      stops.push({
        title: s2.title,
        experience_id: s2.id,
        lat: s2.lat,
        lon: s2.lon,
        start: `${dayStr}T14:00:00`,
        end: `${dayStr}T15:30:00`,
        status: "proposed",
        locked: false,
        cost_inr: s2.cost * (t.travelers?.length || 1),
      });
    }

    t.itinerary = { stops };
    return delay(t);
  },
  async suggestions(_tripId) {
    const suggs: TripSuggestions = {
      meals: [
        {
          meal_type: "lunch",
          experience_id: "ex-street-food-walk",
          title: "Johari Bazaar street-food walk",
          place_name: "Johari Bazaar",
          price_inr: 600,
          duration_min: 60,
          distance_km: 0.8,
          travel_min: 5,
          reason: "Popular lunch break 5 min ride away",
        },
      ],
      quick_stops: [
        {
          experience_id: "ex-jantar-mantar",
          title: "Jantar Mantar observatory",
          place_name: "City Palace complex",
          duration_min: 45,
          distance_km: 0.3,
          reason: "Near City Palace (0.3 km, 45m visit)",
        },
      ],
      guides: [
        {
          type: "driver",
          title: "Dedicated AC Cab & Driver for Jaipur",
          description: "Point-to-point transit across forts, bazaars and stays.",
          estimated_cost_inr: 4400,
          reason: "Recommended for family group convenience.",
        },
      ],
      splits: [],
    };
    return delay(suggs);
  },
  async simulateTripWeather(id, payload) {
    const u = need();
    const t = findTrip(u, id);
    const cond =
      payload.weather ||
      (payload.scenario?.rain_intensity_mm_h && payload.scenario.rain_intensity_mm_h >= 1.0
        ? "rain"
        : "clear");
    t.weather = cond;
    t.weather_scenario_name = payload.scenario?.name || "Simulated Weather";
    t.weather_temp_c = payload.scenario?.temp_c || 28.0;
    t.weather_rain_mm_h = payload.scenario?.rain_intensity_mm_h || 0.0;
    return delay({
      trip: t,
      simulation: {
        scenario: payload.scenario || {
          name: "Simulated Weather",
          temp_c: 28.0,
          rain_intensity_mm_h: 0.0,
          duration_hours: 2.0,
          epicenter_lat: 26.9239,
          epicenter_lon: 75.8267,
          epicenter_name: "Jaipur",
          radius_km: 3.5,
          wind_kmh: 15.0,
        },
        metrics: {
          safety_score: 90,
          comfort_index: 85,
          transit_friction_multiplier: cond === "rain" ? 1.4 : 1.0,
          added_transit_delay_min: cond === "rain" ? 25 : 0,
          sheltered_ratio_pct: 100,
          weather_classification: cond as any,
        },
        impact_zones: [],
        original_itinerary: {
          stops: (t.itinerary?.stops || []).map((s) => ({
            title: s.title,
            experience_id: s.experience_id,
            lat: s.lat,
            lon: s.lon,
            start: s.start,
            end: s.end,
            status: "proposed" as const,
            locked: s.locked,
            cost_inr: s.cost_inr,
          })),
        },
        adapted_itinerary: {
          stops: (t.itinerary?.stops || []).map((s) => ({
            title: s.title,
            experience_id: s.experience_id,
            lat: s.lat,
            lon: s.lon,
            start: s.start,
            end: s.end,
            status: "proposed" as const,
            locked: s.locked,
            cost_inr: s.cost_inr,
          })),
        },
        changes: [],
        vulnerable_stop_ids: [],
        protected_stop_ids: [],
        simulated_social_signals: [],
        ai_executive_summary: "Mock simulation adapted for " + (payload.scenario?.name || "weather"),
      },
    });
  },
  async catalog() {
    return delay(catalog);
  },
  async onboarding() {
    need();
    return delay(questions);
  },
  async context() {
    return delay(ctxOf(need()));
  },
  async importContext(text) {
    const u = need();
    const found = ["heritage", "beach", "museum", "local-food", "craft", "nature"].filter((t) =>
      text.toLowerCase().includes(t.replace("local-", "")),
    );
    if (!found.length) fail("couldn't find anything about what you liked in that text");
    const entries = contexts.get(u.id) ?? [];
    for (const tag of found) {
      const e = entries.find((x) => x.tag === tag);
      if (e) e.weight = Math.min(1, e.weight + 0.3);
      else entries.push({ tag, weight: 0.3, source: "import", updated: now() });
    }
    contexts.set(u.id, entries);
    return delay(ctxOf(u));
  },
  async forgetContext(tag) {
    const u = need();
    contexts.set(u.id, tag ? (contexts.get(u.id) ?? []).filter((e) => e.tag !== tag) : []);
  },
};
