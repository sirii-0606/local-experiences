// Types mirror backend/app/{models,main}.py — contract in docs/api.md. Only fields the UI reads.

export type TravelerState = {
  lat: number;
  lon: number;
  window_start: string;
  window_end: string;
  budget_inr: number;
  group: { name: string; age: number; interests: string[]; accessibility: string[] }[];
  intents: string[];
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

export type PlanResponse ={ itinerary: Itinerary; problems: string[] };
export type DiscoverResponse = { recommendations: Recommendation[]; excluded: Record<string, string[]> };
export type ChatResponse = DiscoverResponse & {
  parser: "llm" | "rules";
  parsed: Record<string, unknown>;
  state: TravelerState;
  plan: PlanResponse;
};
export type EventResponse = { itinerary: Itinerary; state: TravelerState; changes: Change[]; problems: string[] };
export type Catalog = {
  places: { id: string; name: string; lat: number; lon: number }[];
  experiences: { id: string; title: string; category: string; place_id: string }[];
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

async function call<T>(path: string, body?: unknown, method?: string, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
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
  return r.json();
}

export const api = {
  catalog: () => call<Catalog>("/catalog"),
  chat: (text: string, state: TravelerState | null, now: string) =>
    call<ChatResponse>("/chat", { text, state, now }),
  discover: (state: TravelerState) => call<DiscoverResponse>("/discover", { state }),
  plan: (state: TravelerState, itinerary: Itinerary, max_new: number, add?: string) =>
    call<PlanResponse>("/plan", { state, itinerary, max_new, add }),
  event: (state: TravelerState, itinerary: Itinerary, event: ContextEvent) =>
    call<EventResponse>("/events", { state, itinerary, event }),
  weather: (at: string) => call<{ available: boolean; hour: WeatherHour | null }>(`/weather?at=${encodeURIComponent(at)}`),
  contextCheck: (state: TravelerState, itinerary: Itinerary, now: string) =>
    call<ContextCheck>("/context/check", { state, itinerary, now }),
  feedback: (state: TravelerState, experience_id: string, kind: FeedbackKind, reason: string | null, at: string) =>
    call<DiscoverResponse & { state: TravelerState }>("/feedback", { state, feedback: { experience_id, kind, reason, at } }),
  draft: (text: string) => call<{ parser: string; draft: ListingDraft }>("/providers/draft", { text }),
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
