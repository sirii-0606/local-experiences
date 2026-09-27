// Types mirror backend/app/{models,main}.py — contract in docs/api.md. Only fields the UI reads.
import type { CalendarExport, ChatContext } from "./types";

export type TravelerState = {
  lat: number;
  lon: number;
  window_start: string;
  window_end: string;
  budget_inr: number;
  group: { name: string; age: number; interests: string[]; accessibility: string[] }[];
  intents: string[];
  avoid?: string[];
  mode: string;
  pace: string;
  avoid_crowds: boolean;
  indoor_only: boolean;
  weather: string;
  learned: Record<string, number>;
  rejected: string[];
  [k: string]: unknown;
};

export type Member = TravelerState["group"][number];
export type FeedbackKind = "accept" | "reject" | "skip";

export type Recommendation = {
  experience_id: string;
  title: string;
  score: number;
  lat: number;
  lon: number;
  start: string;
  end: string;
  km: number;
  travel_min: number;
  cost_inr: number;
  confidence: number;
  low_confidence: boolean;
  reasons: string[];
};

export type Stop = {
  title: string;
  experience_id: string | null;
  lat: number;
  lon: number;
  start: string;
  end: string;
  status: "proposed" | "confirmed" | "active" | "completed" | "skipped" | "replaced";
  locked: boolean;
  cost_inr: number;
};

export type Itinerary = { stops: Stop[] };

export type Change = {
  action: "retimed" | "replaced" | "dropped" | "at_risk";
  stop: string;
  reason: string;
  new_stop: string | null;
  why: string[];
};

export type ContextEvent = {
  kind: "closure" | "provider_cancel" | "weather" | "delay" | "budget_change" | "fatigue";
  at: string;
  experience_id?: string;
  weather?: "rain" | "heat" | "clear";
  delay_min?: number;
  budget_inr?: number;
};

export type WeatherHour = { at: string; condition: "rain" | "heat" | "clear"; temp_c: number; precip_mm: number; precip_prob: number | null };
export type WeatherRisk = { stop: string; condition: string; message: string };
export type ContextCheck = { available: boolean; risks: WeatherRisk[]; proposed: ContextEvent | null };

export type WeatherSummary = {
  condition: "rain" | "heat" | "clear" | "unknown";
  temp_c: number | null;
  precip_mm: number | null;
  precip_prob: number | null;
  humidity_pct: number | null; // null = the provider didn't report it (never estimated)
  wind_kmh: number | null;
  description: string;
  ai_guidance: string;
  available: boolean;
};

export type ReviewCheck = {
  id: string;
  at: string;
  rating: number;
  text: string;
  verified: boolean; // tied to a booking made here
  trust: number; // 0..1
  counted: boolean; // feeds the trusted rating
  flags: string[];
};
export type ReviewReport = {
  total: number;
  counted: number;
  suspicious: number;
  verified: number;
  rating_all: number | null;
  rating_trusted: number | null;
  verdict: string;
  bursts: string[];
  reviews: ReviewCheck[];
};

export type SocialSignal = {
  id: string;
  source: "x_twitter" | "reddit" | "traffic_police" | "local_guide" | "crowd_report" | "instagram";
  author: string;
  handle: string;
  avatar: string;
  content: string;
  tags: string[];
  lat: number;
  lon: number;
  location_name: string;
  timestamp: string;
  sentiment: "positive" | "neutral" | "warning" | "critical";
  weather_related: boolean;
  verified: boolean;
  impact_level: "low" | "medium" | "high";
  relevance_score: number;
};

export type UserSocialReport = {
  author: string;
  content: string;
  location_name: string;
  lat: number;
  lon: number;
  sentiment?: "positive" | "neutral" | "warning" | "critical";
  tags?: string[];
  weather_related?: boolean;
};

export type SimulationScenario = {
  name: string;
  temp_c: number;
  rain_intensity_mm_h: number;
  duration_hours: number;
  epicenter_lat: number;
  epicenter_lon: number;
  epicenter_name: string;
  radius_km: number;
  wind_kmh: number;
};

export type ImpactZonePolygon = {
  name: string;
  severity: "low" | "medium" | "high" | "extreme";
  center: [number, number];
  radius_meters: number;
  description: string;
  waterlogging_prob: number;
  heat_index_c: number;
};

export type DigitalTwinMetrics = {
  safety_score: number;
  comfort_index: number;
  transit_friction_multiplier: number;
  added_transit_delay_min: number;
  sheltered_ratio_pct: number;
  weather_classification: "rain" | "heat" | "clear";
};

export type DigitalTwinResult = {
  scenario: SimulationScenario;
  metrics: DigitalTwinMetrics;
  impact_zones: ImpactZonePolygon[];
  original_itinerary: Itinerary;
  adapted_itinerary: Itinerary;
  changes: Change[];
  vulnerable_stop_ids: string[];
  protected_stop_ids: string[];
  simulated_social_signals: SocialSignal[];
  ai_executive_summary: string;
};

export type PlanResponse ={ itinerary: Itinerary; problems: string[] };
export type DiscoverResponse = { recommendations: Recommendation[]; excluded: Record<string, string[]> };
export type ChatResponse = DiscoverResponse & {
  parser: "llm" | "rules";
  parsed: Record<string, unknown>;
  state: TravelerState;
  plan: PlanResponse;
  context?: ChatContext;
};
export type EventResponse = { itinerary: Itinerary; state: TravelerState; changes: Change[]; problems: string[] };
export type ExperienceItem = {
  id: string;
  title: string;
  category: string;
  place_id: string;
  description?: string;
  tags?: string[];
  duration_min?: number;
  price_inr?: number;
  rating?: number;
  review_count?: number;
  indoor?: boolean;
  weather_sensitive?: boolean;
  outdoor_convenience_heat?: number;
  outdoor_convenience_rain?: number;
  accessibility?: string[];
  tourist_index?: number;
};

export type Catalog = {
  places: { id: string; name: string; lat: number; lon: number }[];
  experiences: ExperienceItem[];
  provider_listings: string[];
  paused: string[];
  vocabulary: { tags: string[]; categories: string[]; accessibility: string[] };
};

export type ListingDraft = {
  provider_name: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  near: string | null;
  lat?: number | null;
  lon?: number | null;
  area?: string;
  duration_min: number;
  price_inr: number;
  price_model: "per_person" | "per_group" | "free" | "donation";
  capacity: number;
  min_age: number;
  accessibility: string[];
  indoor: boolean;
  weather_sensitive: boolean;
  open_time: string;
  close_time: string;
  days: number[];
  community_led: boolean;
};

export type Insights = {
  experience_id: string;
  paused: boolean;
  accepted: number;
  passed: number;
  booked_people: number;
  rating: number | null;
  review_count: number;
  searches: number;
  matching_searches: number;
  shown: number;
  shown_to_matching: number;
  why_not_chosen: [string, number][];
  tips: string[];
  start_hours: [number, number][];
  budget_per_person: [string, number][];
  with_kids: number;
  also_wanted: [string, number][];
  fits?: string[]; // traveler segments it suits
};

// Provider edit tokens, kept only in this browser. Losing one means the listing can't be edited.
const TOKENS_KEY = "le.providerTokens";
export const tokens = {
  all(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}"); } catch { return {}; }
  },
  get(id: string): string | undefined { return tokens.all()[id]; },
  set(id: string, token: string) {
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify({ ...tokens.all(), [id]: token })); } catch { /* private mode */ }
  },
};

// Shared by the explore/provider endpoints and the v2 website client (v2api.ts).
// X-Requested-With is the CSRF guard the v2 routes require; session cookies go same-origin.
export async function call<T>(path: string, body?: unknown, method?: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-requested-with": "le" };
  if (token) headers["x-provider-token"] = token;
  const r = await fetch(`/api${path}`, body === undefined && !method ? undefined : {
    method: method ?? "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* not JSON */ }
    if (Array.isArray(detail)) detail = detail.map((d: { msg?: string }) => d.msg).join("; "); // pydantic 422
    throw new Error(typeof detail === "string" ? detail : `${path} failed (${r.status})`);
  }
  if (r.status === 204) return undefined as T; // logout, password change, delete: no body
  return r.json();
}

export const api = {
  catalog: (lat?: number, lon?: number) =>
    call<Catalog>(lat === undefined || lon === undefined ? "/catalog" : `/catalog?lat=${lat}&lon=${lon}`),
  chat: (text: string, state: TravelerState | null, now: string, lat?: number, lon?: number) =>
    call<ChatResponse>("/chat", { text, state, now, lat, lon }),
  calendar: (state: TravelerState, itinerary: Itinerary) =>
    call<CalendarExport>("/calendar/export", { state, itinerary }),
  discover: (state: TravelerState) => call<DiscoverResponse>("/discover", { state }),
  plan: (state: TravelerState, itinerary: Itinerary, max_new: number, add?: string) =>
    call<PlanResponse>("/plan", { state, itinerary, max_new, add }),
  event: (state: TravelerState, itinerary: Itinerary, event: ContextEvent) =>
    call<EventResponse>("/events", { state, itinerary, event }),
  weather: (at: string, lat?: number, lon?: number) =>
    call<{ available: boolean; hour: WeatherHour | null; summary?: WeatherSummary }>(
      `/weather?at=${encodeURIComponent(at)}${lat === undefined || lon === undefined ? "" : `&lat=${lat}&lon=${lon}`}`,
    ),
  photos: (ids: string[]) =>
    call<Record<string, { url: string; page: string; author: string; license: string }>>(
      `/photos?ids=${encodeURIComponent(ids.join(","))}`,
    ),
  reviews: (experience_id: string) => call<ReviewReport>(`/reviews/${encodeURIComponent(experience_id)}`),
  postReview: (r: { experience_id: string; rating: number; text: string; booking_code?: string; at?: string }) =>
    call<{ review: ReviewCheck; report: ReviewReport }>("/reviews", r),
  checkReviews: (reviews: { at: string; rating: number; text: string; verified?: boolean }[]) =>
    call<ReviewReport>("/reviews/check", { reviews }),
  getSocialSignals: (params?: { condition?: string; lat?: number; lon?: number }) => {
    const q = new URLSearchParams();
    if (params?.condition) q.set("condition", params.condition);
    if (params?.lat !== undefined) q.set("lat", String(params.lat));
    if (params?.lon !== undefined) q.set("lon", String(params.lon));
    const qs = q.toString();
    return call<{ signals: SocialSignal[]; trending_hashtags: Array<{ tag: string; count: number; trend: string; sentiment: string }> }>(`/social/signals${qs ? `?${qs}` : ""}`);
  },
  postSocialReport: (report: UserSocialReport) => call<SocialSignal>("/social/report", report),
  getSimulationPresets: () => call<SimulationScenario[]>("/simulation/presets"),
  runSimulation: (scenario: SimulationScenario, state: TravelerState, itinerary: Itinerary) =>
    call<DigitalTwinResult>("/simulation/what-if", { scenario, state, itinerary }),
  contextCheck: (state: TravelerState, itinerary: Itinerary, now: string) =>
    call<ContextCheck>("/context/check", { state, itinerary, now }),
  feedback: (state: TravelerState, experience_id: string, kind: FeedbackKind, reason: string | null, at: string) =>
    call<DiscoverResponse & { state: TravelerState }>("/feedback", { state, feedback: { experience_id, kind, reason, at } }),
  draft: (text: string) =>
    call<{ parser: string; draft: ListingDraft; fits?: string[] }>("/providers/draft", { text }),
  publish: (draft: ListingDraft, today: string) =>
    call<{ experience: { id: string; title: string }; edit_token: string }>("/providers/listings", { draft, today }),
  listing: (id: string) => call<{ draft: ListingDraft }>(`/providers/listings/${encodeURIComponent(id)}`),
  updateListing: (id: string, draft: ListingDraft, today: string) =>
    call<{ experience: { id: string; title: string } }>(`/providers/listings/${encodeURIComponent(id)}`, { draft, today }, "PUT", tokens.get(id)),
  deleteListing: (id: string) => call<{ deleted: boolean }>(`/providers/listings/${encodeURIComponent(id)}`, undefined, "DELETE", tokens.get(id)),
  pause: (experience_id: string, paused: boolean) =>
    call<{ paused: boolean }>("/providers/availability", { experience_id, paused }, "POST", tokens.get(experience_id)),
  book: (state: TravelerState, itinerary: Itinerary, experience_id: string) =>
    call<{ code: string; people: number; start: string; itinerary: Itinerary }>("/bookings", { state, itinerary, experience_id }),
  rate: (state: TravelerState, experience_id: string, rating: number, as_described: boolean | null, at: string) =>
    call<DiscoverResponse & { state: TravelerState }>("/feedback", { state, feedback: { experience_id, kind: "rating", rating, as_described, at } }),
  insights: (id: string) => call<Insights>(`/providers/insights/${encodeURIComponent(id)}`),
};
