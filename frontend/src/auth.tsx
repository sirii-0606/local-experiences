import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { v2 } from "./v2api";
import type { Role, User } from "./types";

type Auth = {
  user: User | null;
  loading: boolean;
  refresh(): Promise<void>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string, name: string): Promise<User>;
  signOut(): Promise<void>;
};

const AuthCtx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setUser(await v2.me()); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const value: Auth = {
    user, loading, refresh,
    signIn: async (e, p) => { const u = await v2.login(e, p); setUser(u); return u; },
    signUp: async (e, p, n) => { const u = await v2.register(e, p, n); setUser(u); return u; },
    signOut: async () => { await v2.logout(); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(AuthCtx);
  if (!a) throw new Error("useAuth outside AuthProvider");
  return a;
}

// Route guard: signed-out users go to /login and come back afterwards; wrong role gets a clear page.
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <section className="page"><p className="muted">Loading…</p></section>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (role && user.role !== role) {
    return (
      <section className="page narrow">
        <div className="panel">
          <h2>Not available</h2>
          <p>This area is for {role}s. You're signed in as {user.display_name} ({user.role}).</p>
          <Link to="/">Back to Explore</Link>
        </div>
      </section>
    );
  }
  return <>{children}</>;
}
