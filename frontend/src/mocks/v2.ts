// In-memory stand-in for the v2 backend (VITE_API_MOCK=1). Same types and error messages, so pages
// can be built and demoed while the backend evolves. Demo accounts: admin@example.com / "admin pass 123".
// Nothing persists across reloads except which user is signed in (sessionStorage).
import type { V2 } from "../v2api";
import type { AdminUserRow, Profile, Role, User } from "../types";
import { emptyProfile } from "../types";

type Row = AdminUserRow & { password: string; profile: Profile | null };
const now = () => new Date().toISOString().slice(0, 19);
const users: Row[] = [
  { id: 1, email: "admin@example.com", role: "admin", display_name: "Admin", disabled: false,
    created: now(), last_login: null, password: "admin pass 123", profile: null },
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
const toAdmin = ({ password: _p, profile: _pr, ...row }: Row): AdminUserRow => row;
const fail = (msg: string): never => { throw new Error(msg); };
const need = (role?: Role): Row => {
  const u = current() ?? fail("please sign in");
  if (role && u.role !== role) fail("you don't have access to this");
  return u;
};
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

export const mockV2: V2 = {
  async register(email, password, display_name) {
    email = email.trim().toLowerCase();
    if (users.some((u) => u.email === email)) fail("an account with this email already exists");
    if (password.length < 8) fail("String should have at least 8 characters");
    const u: Row = { id: users.length + 1, email, role: "traveler", display_name, disabled: false,
      created: now(), last_login: now(), password, profile: null };
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
  async exportData() { const u = need(); return delay({ account: toUser(u), profile: u.profile }); },
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
};
