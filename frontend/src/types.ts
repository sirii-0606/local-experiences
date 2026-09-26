// v2 website contract, mirroring backend/app/schemas.py (snapshot: docs/openapi.json).
// Keep in sync: when the backend contract test fails, update these types too.

export type Role = "traveler" | "provider" | "admin";
export type Diet = "vegetarian" | "non_vegetarian" | "vegan" | "jain";
export type Mode = "walk" | "auto" | "bus" | "car";
export type Pace = "relaxed" | "normal" | "packed";

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
  display_name, age: null, home_city: null, interests: [], dislikes: [], accessibility: [],
  walking_limit_km: null, needs_rest_breaks: false, diet: null, pace: "normal", budget_style: null,
  transport: [], languages: [], companions: [],
});

// ---------- trips (P3)
export type TripTraveler = Companion & { is_me: boolean };
export type StayType = "any" | "hotel" | "homestay" | "hostel";
export type StayPref = { type: StayType; max_per_night_inr: number | null; area: string | null };

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
};

export type Trip = TripDraft & { id: number; created: string; updated: string };
export const MAX_TRIP_DAYS = 7;
