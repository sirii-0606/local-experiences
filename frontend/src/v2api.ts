// v2 website client (accounts, profile, admin, trips). Real backend by default; VITE_API_MOCK=1 swaps in
// the in-memory mock so pages can be built while the backend is still in development.
import { api, call } from "./api";
import type { Catalog } from "./api";
import { mockV2 } from "./mocks/v2";
import type { AdminStats, AdminUserPatch, AdminUserRow, Profile, Trip, TripDraft, User } from "./types";

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
  catalog(): Promise<Catalog>; // the existing /catalog; mocked so the wizard works without a backend
};

const realV2: V2 = {
  register: (email, password, display_name) => call<User>("/auth/register", { email, password, display_name }),
  login: (email, password) => call<User>("/auth/login", { email, password }),
  logout: () => call<void>("/auth/logout", undefined, "POST"),
  me: async () => {
    const r = await fetch("/api/auth/me");
    return r.ok ? r.json() : null;
  },
  getProfile: () => call<Profile>("/me/profile"),
  putProfile: (p) => call<Profile>("/me/profile", p, "PUT"),
  changePassword: (current_password, new_password) => call<void>("/me/password", { current_password, new_password }, "PUT"),
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
  catalog: api.catalog,
};

export const MOCK = import.meta.env.VITE_API_MOCK === "1";
export const v2: V2 = MOCK ? mockV2 : realV2;
