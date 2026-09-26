// v2 website client (accounts, profile, admin, trips, shortlist, itinerary).
import { api, call } from "./api";
import type { Catalog } from "./api";
import { mockV2 } from "./mocks/v2";
import type {
  AdminStats,
  AdminUserPatch,
  AdminUserRow,
  Candidate,
  Profile,
  ProfileContext,
  Question,
  Stay,
  StayRecommendation,
  Trip,
  TripDraft,
  TripSuggestions,
  User,
} from "./types";

export type V2 = {
  register(email: string, password: string, display_name: string): Promise<User>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  me(): Promise<User | null>; // null = not signed in
  getProfile(): Promise<Profile>;
  putProfile(p: Profile): Promise<Profile>;
  changePassword(current_password: string, new_password: string): Promise<void>;
  exportData(): Promise<unknown>;
  deleteAccount(password: string): Promise<void>;
  adminUsers(): Promise<AdminUserRow[]>;
  adminPatch(id: number, patch: AdminUserPatch): Promise<AdminUserRow>;
  adminStats(): Promise<AdminStats>;
  trips(): Promise<Trip[]>;
  trip(id: number): Promise<Trip>;
  createTrip(d: TripDraft): Promise<Trip>;
  updateTrip(id: number, d: TripDraft): Promise<Trip>;
  deleteTrip(id: number): Promise<void>;
  stays(): Promise<Stay[]>;
  candidates(tripId: number): Promise<Candidate[]>;
  stayRecommendations(tripId: number): Promise<StayRecommendation[]>;
  generateItinerary(tripId: number): Promise<Trip>;
  suggestions(tripId: number): Promise<TripSuggestions>;
  catalog(): Promise<Catalog>;
  onboarding(): Promise<Question[]>;
  context(): Promise<ProfileContext>;
  importContext(text: string): Promise<ProfileContext>;
  forgetContext(tag?: string): Promise<void>; // no tag = forget everything
};

const realV2: V2 = {
  register: (email, password, display_name) =>
    call<User>("/auth/register", { email, password, display_name }),
  login: (email, password) => call<User>("/auth/login", { email, password }),
  logout: () => call<void>("/auth/logout", undefined, "POST"),
  me: async () => {
    const r = await fetch("/api/auth/me");
    return r.ok ? r.json() : null;
  },
  getProfile: () => call<Profile>("/me/profile"),
  putProfile: (p) => call<Profile>("/me/profile", p, "PUT"),
  changePassword: (current_password, new_password) =>
    call<void>("/me/password", { current_password, new_password }, "PUT"),
  exportData: () => call<unknown>("/me/export"),
  deleteAccount: (password) => call<void>("/me", { password }, "DELETE"),
  adminUsers: () => call<AdminUserRow[]>("/admin/users"),
  adminPatch: (id, patch) => call<AdminUserRow>(`/admin/users/${id}`, patch, "PATCH"),
  adminStats: () => call<AdminStats>("/admin/stats"),
  trips: () => call<Trip[]>("/trips"),
  trip: (id) => call<Trip>(`/trips/${id}`),
  createTrip: (d) => call<Trip>("/trips", d),
  updateTrip: (id, d) => call<Trip>(`/trips/${id}`, d, "PUT"),
  deleteTrip: (id) => call<void>(`/trips/${id}`, undefined, "DELETE"),
  stays: () => call<Stay[]>("/trips/stays"),
  candidates: (id) => call<Candidate[]>(`/trips/${id}/candidates`, undefined, "POST"),
  stayRecommendations: (id) =>
    call<StayRecommendation[]>(`/trips/${id}/stays/recommendations`, undefined, "POST"),
  generateItinerary: (id) =>
    call<Trip>(`/trips/${id}/itinerary/generate`, undefined, "POST"),
  suggestions: (id) => call<TripSuggestions>(`/trips/${id}/suggestions`),
  catalog: api.catalog,
  onboarding: () => call<Question[]>("/me/onboarding"),
  context: () => call<ProfileContext>("/me/context"),
  importContext: (text) => call<ProfileContext>("/me/context/import", { text }),
  forgetContext: (tag) =>
    call<void>(tag ? `/me/context/${encodeURIComponent(tag)}` : "/me/context", undefined, "DELETE"),
};

export const MOCK = import.meta.env.VITE_API_MOCK === "1";
export const v2: V2 = MOCK ? mockV2 : realV2;
