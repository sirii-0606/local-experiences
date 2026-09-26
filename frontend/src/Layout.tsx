import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "./auth";
import { useClock } from "./clock";
import { MOCK } from "./v2api";

const ICON = { rain: "🌧", heat: "🔥", clear: "☀" } as const;
const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : "");

export default function Layout() {
  const { user, signOut } = useAuth();
  const { clock, setClock, live } = useClock();
  const navigate = useNavigate();
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo" aria-hidden="true">📍</span>
          <div>
            <h1>Local &amp; Experiences <span>Jaipur</span></h1>
            <p className="tagline">What can you actually do next, and why?</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Main">
          <NavLink to="/" end className={tab}>🧭 Explore</NavLink>
          <NavLink to="/trips" className={tab}>🗺 Plan a trip</NavLink>
          <NavLink to="/provider" className={tab}>🏪 Provider</NavLink>
          {user?.role === "admin" && <NavLink to="/admin" className={tab}>🛡 Admin</NavLink>}
        </nav>
        <div className="header-right">
          <label className="clock">Demo clock
            <input type="datetime-local" value={clock} onChange={(e) => setClock(e.target.value)} />
          </label>
          <span className="chip live-weather" title="Live forecast for Jaipur at the demo clock hour (Open-Meteo)">
            {live === null ? "…" : live === "offline" ? "live weather offline"
              : `${ICON[live.condition]} ${live.temp_c.toFixed(0)}°C${live.precip_prob ? ` · ${live.precip_prob}% rain` : ""} · live`}
          </span>
          {user ? (
            <span className="user-menu">
              <NavLink to="/profile" className="chip">👤 {user.display_name}</NavLink>
              <button className="secondary mini" onClick={async () => { await signOut(); navigate("/"); }}>Sign out</button>
            </span>
          ) : (
            <NavLink to="/login" className="chip">Sign in</NavLink>
          )}
          {MOCK && <span className="chip warn" title="VITE_API_MOCK=1: accounts are simulated in the browser">mock API</span>}
        </div>
      </header>
      <Outlet />
    </div>
  );
}
