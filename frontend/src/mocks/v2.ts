// In-memory stand-in for the v2 backend (VITE_API_MOCK=1). Same types and error messages, so pages
// can be built and demoed while the backend evolves. Demo accounts: admin@example.com / "admin pass 123".
// Nothing persists across reloads except which user is signed in (sessionStorage).
import type { V2 } from "../v2api";
import type { Catalog } from "../api";
import type { AdminUserRow, Profile, Role, Trip, TripDraft, User } from "../types";
import { MAX_TRIP_DAYS, emptyProfile } from "../types";

type Row = AdminUserRow & { password: string; profile: Profile | null; trips: Trip[] };
const now = () => new Date().toISOString().slice(0, 19);
const users: Row[] = [
  { id: 1, email: "admin@example.com", role: "admin", display_name: "Admin", disabled: false,
    created: now(), last_login: null, password: "admin pass 123", profile: null, trips: [] },
];
const KEY = "le.mockUser";
const current = (): Row | undefined => {
  try { return users.find((u) => u.id === Number(sessionStorage.getItem(KEY))); } catch { return undefined; }
};
const setCurrent = (id: number | null) => {
  try { id === null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, String(id)); } catch { /* private mode */ }
};
const toUser = (u: Row): User => ({ id: u.id, email: u.email, role: u.role, display_name: u.display_name,
  created: u.created, onboarded: u.profile !== null });
const toAdmin = ({ password: _p, profile: _pr, trips: _t, ...row }: Row): AdminUserRow => row;
const fail = (msg: string): never => { throw new Error(msg); };
const need = (role?: Role): Row => {
  const u = current() ?? fail("please sign in");
  if (role && u.role !== role) fail("you don't have access to this");
  return u;
};
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
let tripSeq = 1;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
// Same rules as TripDraft in schemas.py (must-see ids aren't checked here).
const checkTrip = (d: TripDraft) => {
  if (!d.title.trim()) fail("String should have at least 1 character");
  if (!d.travelers.length) fail("List should have at least 1 item after validation, not 0");
  if (days(d.start_date, d.end_date) < 0) fail("Value error, the trip can't end before it starts");
  if (days(d.start_date, d.end_date) >= MAX_TRIP_DAYS) fail(`Value error, trips can be at most ${MAX_TRIP_DAYS} days`);
  if (d.day_end <= d.day_start) fail("Value error, each day must end after it starts");
};
const findTrip = (u: Row, id: number) => u.trips.find((t) => t.id === id) ?? fail("no such trip");
// A slice of the real seed (ids match backend/data/seed), enough for the wizard's pickers.
const catalog: Catalog = {
  places: [], provider_listings: [], paused: [],
  experiences: [
    ["ex-hawa-mahal", "Hawa Mahal: Palace of Winds", "culture"], ["ex-amer-fort", "Amer Fort", "culture"],
    ["ex-city-palace", "City Palace museum & courtyards", "culture"], ["ex-jantar-mantar", "Jantar Mantar observatory", "learning"],
    ["ex-nahargarh-sunset", "Nahargarh Fort sunset over the Pink City", "nature"], ["ex-street-food-walk", "Johari Bazaar street-food walk", "food"],
    ["ex-cooking-class", "Rajasthani home cooking class with Meena Devi", "food"], ["ex-block-print-workshop", "Hand block-printing workshop", "art"],
    ["ex-puppet-show", "Kathputli puppet show", "culture"], ["ex-leopard-safari", "Jhalana leopard safari", "nature"],
    ["ex-balloon", "Hot-air balloon over Amer at sunrise", "adventure"], ["ex-bazaar-evening-walk", "Bazaars after dark: textiles & jewellery", "shopping"],
  ].map(([id, title, category]) => ({ id, title, category, place_id: "" })),
  vocabulary: {
    tags: ["local-food", "street-food", "vegetarian", "sweets", "heritage", "history", "architecture", "museum", "spiritual",
      "craft", "art", "music", "dance", "workshop", "shopping", "market", "textiles", "nature", "wildlife", "sunset",
      "photography", "adventure", "active", "relaxed", "nightlife", "family", "kids", "learning", "walking-tour", "hidden-gem", "iconic"],
    categories: [], accessibility: ["wheelchair", "step_free", "seating", "quiet"],
  },
};

export const mockV2: V2 = {
  async register(email, password, display_name) {
    email = email.trim().toLowerCase();
    if (users.some((u) => u.email === email)) fail("an account with this email already exists");
    if (password.length < 8) fail("String should have at least 8 characters");
    const u: Row = { id: users.length + 1, email, role: "traveler", display_name, disabled: false,
      created: now(), last_login: now(), password, profile: null, trips: [] };
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
  async logout() { setCurrent(null); },
  async me() { const u = current(); return delay(u ? toUser(u) : null); },
  async getProfile() { const u = need(); return delay(u.profile ?? emptyProfile(u.display_name)); },
  async putProfile(p) { const u = need(); u.profile = p; u.display_name = p.display_name; return delay(p); },
  async changePassword(cur, next) {
    const u = need();
    if (u.password !== cur) fail("current password is wrong");
    u.password = next;
  },
  async exportData() { const u = need(); return delay({ account: toUser(u), profile: u.profile, trips: u.trips }); },
  async deleteAccount(password) {
    const u = need();
    if (u.password !== password) fail("password is wrong");
    users.splice(users.indexOf(u), 1);
    setCurrent(null);
  },
  async adminUsers() { need("admin"); return delay(users.map(toAdmin)); },
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
    return delay({ users: users.length, admins: users.filter((u) => u.role === "admin").length,
      providers: users.filter((u) => u.role === "provider").length, disabled: users.filter((u) => u.disabled).length,
      active_sessions: current() ? 1 : 0, provider_listings: 0 });
  },
  async trips() { return delay([...need().trips].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id)); },
  async trip(id) { return delay(findTrip(need(), id)); },
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
  async deleteTrip(id) { const u = need(); u.trips.splice(u.trips.indexOf(findTrip(u, id)), 1); },
  async catalog() { return delay(catalog); },
};
