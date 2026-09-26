// v2 website contract, mirroring backend/app/schemas.py (snapshot: docs/openapi.json).
// Keep in sync: when the backend contract test fails, update these types too.

export type Role = "traveler" | "provider" | "admin";
export type Diet = "vegetarian" | "non_vegetarian" | "vegan" | "jain";
export type Mode = "walk" | "auto" | "bus" | "car";
export type Pace = "relaxed" | "normal" | "packed";
export type ShortlistDecision = "in_person" | "ar" | "skip";

export type User = {
  id: number;
  email: string;
  role: Role;
  display_name: string;
  created: string;
  onboarded: boolean;
};

export type Companion = {
  name: string;
  age: number | null;
  interests: string[];
  dislikes: string[];
  accessibility: string[];
  diet: Diet | null;
};

export type Profile = {
  display_name: string;
  age: number | null;
  home_city: string | null;
  interests: string[];
  dislikes: string[];
  accessibility: string[];
  walking_limit_km: number | null;
  needs_rest_breaks: boolean;
  diet: Diet | null;
  pace: Pace;
  budget_style: "budget" | "mid" | "premium" | null;
  transport: Mode[];
  languages: string[];
  companions: Companion[];
};

export type AdminUserRow = {
  id: number;
  email: string;
  role: Role;
  display_name: string;
  disabled: boolean;
  created: string;
  last_login: string | null;
};

export type AdminUserPatch = { role?: Role; disabled?: boolean; temp_password?: string };

export type AdminStats = {
  users: number;
  admins: number;
  providers: number;
  disabled: number;
  active_sessions: number;
  provider_listings: number;
};

export const emptyProfile = (display_name: string): Profile => ({
  display_name,
  age: null,
  home_city: null,
  interests: [],
  dislikes: [],
  accessibility: [],
  walking_limit_km: null,
  needs_rest_breaks: false,
  diet: null,
  pace: "normal",
  budget_style: null,
  transport: [],
  languages: [],
  companions: [],
});

// ---------- stays & trips (P3-P5)
export type StayType = "any" | "hotel" | "homestay" | "hostel";
export type StayPref = { type: StayType; max_per_night_inr: number | null; area: string | null };

export type Stay = {
  id: string;
  name: string;
  type: "hotel" | "homestay" | "hostel";
  area: string;
  lat: number;
  lon: number;
  price_per_night_inr: number;
  rating: number;
  review_count: number;
  accessibility: string[];
  description: string;
  phone: string;
  website: string;
  sample_contact: boolean;
};

export type Candidate = {
  experience_id: string;
  title: string;
  score: number;
  reasons: string[];
  travel_by_mode: Record<string, number>;
  duration_min: number;
  cost_inr: number;
  feasible_days: number[];
  must_see: boolean;
  along_route: number;
};

export type StayRecommendation = {
  stay: Stay;
  score: number;
  distance_to_picks_km: number;
  travel_to_centroid_min: number;
  reasons: string[];
};

export type MealSuggestion = {
  meal_type: string;
  experience_id: string;
  title: string;
  place_name: string;
  price_inr: number;
  duration_min: number;
  distance_km: number;
  travel_min: number;
  reason: string;
};

export type QuickStopSuggestion = {
  experience_id: string;
  title: string;
  place_name: string;
  duration_min: number;
  distance_km: number;
  reason: string;
};

export type GuideSuggestion = {
  type: string;
  title: string;
  description: string;
  estimated_cost_inr: number;
  reason: string;
};

export type SplitSuggestion = {
  day: string;
  start_time: string;
  end_time: string;
  rejoin_name: string;
  rejoin_place_id: string;
  reason: string;
  group_a: string[];
  activity_a: string;
  group_b: string[];
  activity_b: string;
};

export type TripSuggestions = {
  meals: MealSuggestion[];
  quick_stops: QuickStopSuggestion[];
  guides: GuideSuggestion[];
  splits: SplitSuggestion[];
};

export type TripTraveler = Companion & { is_me: boolean };

export type TripDraft = {
  title: string;
  destination: "jaipur";
  origin_city: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  day_start: string; // HH:MM[:SS]
  day_end: string;
  budget_inr: number;
  stay: StayPref;
  travelers: TripTraveler[];
  use_my_prefs_for_all: boolean;
  must_see: string[];
  shortlist?: Record<string, ShortlistDecision>;
  stay_id?: string | null;
};

export type TripStop = {
  title: string;
  experience_id: string | null;
  lat: number;
  lon: number;
  start: string;
  end: string;
  status: string;
  locked: boolean;
  cost_inr: number;
  who?: string[];
};

export type TripItinerary = {
  stops: TripStop[];
};

export type Trip = TripDraft & {
  id: number;
  created: string;
  updated: string;
  itinerary?: TripItinerary;
};

export const MAX_TRIP_DAYS = 7;
