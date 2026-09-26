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
  [k: string]: unknown;
};

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

export type PlanResponse = { itinerary: Itinerary; problems: string[] };
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
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* not JSON */ }
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
};
