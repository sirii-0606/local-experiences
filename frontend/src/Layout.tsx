import { Link, NavLink, Outlet, useNavigate } from "react-router";
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
    <div className="app-shell">
      {/* Floating Glassmorphic Header */}
      <header className="luxury-header">
        <Link to="/" className="brand-crest">
          <div className="crest-icon">🏛️</div>
          <div>
            <h1>Jaipur Experiences</h1>
            <p className="sub">Curated Heritage &amp; Artisans</p>
          </div>
        </Link>

        <nav className="nav-pill-group" aria-label="Main navigation">
          <NavLink to="/" end className={tab}>Explore</NavLink>
          <NavLink to="/trips" className={tab}>Plan a Trip</NavLink>
          <NavLink to="/provider" className={tab}>For Hosts</NavLink>
          {user?.role === "admin" && <NavLink to="/admin" className={tab}>Admin</NavLink>}
        </nav>

        <div className="header-right">
          <label className="clock" title="Adjust the simulated demo clock time">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>Demo Clock:</span>
            <input type="datetime-local" value={clock} onChange={(e) => setClock(e.target.value)} />
          </label>

          <span className="chip live-weather" title="Live forecast for Jaipur at the demo clock hour (Open-Meteo & OpenWeatherMap)">
            {live === null ? "…" : live === "offline" ? "Live weather offline"
              : `${ICON[live.condition]} ${live.temp_c.toFixed(0)}°C${live.precip_prob ? `, ${live.precip_prob}% rain` : ""}`}
          </span>

          {user ? (
            <div className="user-menu">
              <NavLink to="/profile" className="chip" style={{ fontWeight: 600 }}>👤 {user.display_name}</NavLink>
              <button type="button" className="secondary mini" onClick={async () => { await signOut(); navigate("/"); }}>Sign out</button>
            </div>
          ) : (
            <NavLink to="/login" className="button mini" style={{ textDecoration: "none" }}>Sign in</NavLink>
          )}

          {MOCK && <span className="chip warn" title="VITE_API_MOCK=1: accounts are simulated in the browser">Mock API</span>}
        </div>
      </header>

      {/* Main Page Content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>

      {/* Multi-Column Heritage Luxury Footer */}
      <footer className="luxury-footer">
        <div className="footer-inner">
          <div className="footer-main-grid">
            <div className="footer-brand">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "1.8rem" }}>🏵️</span>
                <h3 style={{ margin: 0 }}>Jaipur Local &amp; Experiences</h3>
              </div>
              <p>
                Feasible, authentic cultural discoveries crafted directly with master artisans, historians, and heritage havelis of the Pink City.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <span className="chip mini" style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)" }}>
                  Verified Artisans
                </span>
                <span className="chip mini" style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)" }}>
                  Diurnal Weather Engine
                </span>
              </div>
            </div>

            <div className="footer-col">
              <h4>Experiences</h4>
              <ul>
                <li><Link to="/?intent=heritage">Heritage &amp; Forts</Link></li>
                <li><Link to="/?intent=craft">Sanganer Block-Print</Link></li>
                <li><Link to="/?intent=local-food">Royal &amp; Street Feasts</Link></li>
                <li><Link to="/?intent=hidden-gem">Hidden Stepwells</Link></li>
                <li><Link to="/?intent=sunset">Nahargarh Sunsets</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Planning</h4>
              <ul>
                <li><Link to="/trips">Multi-Day Trips</Link></li>
                <li><Link to="/trips/new">Plan a New Trip</Link></li>
                <li><Link to="/provider">Host Your Experience</Link></li>
                <li><Link to="/profile">Traveler Profile</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Jaipur Moments</h4>
              <p style={{ fontSize: "0.82rem", color: "#9894b3", margin: "0 0 0.5rem" }}>
                Snapshots from live traveler itineraries.
              </p>
              <div className="footer-gallery-grid">
                <img src="https://images.unsplash.com/photo-1609137144822-7935a8740c49?auto=format&fit=crop&w=300&q=75" alt="Hawa Mahal" />
                <img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=300&q=75" alt="Block Print" />
                <img src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=300&q=75" alt="Stepwell" />
                <img src="https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=300&q=75" alt="City Palace" />
                <img src="https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=300&q=75" alt="Nahargarh" />
                <img src="https://images.unsplash.com/photo-1505253758473-96b3015f21c9?auto=format&fit=crop&w=300&q=75" alt="Street Food" />
              </div>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <span>© {new Date().getFullYear()} Local &amp; Experiences · Jaipur Cultural Tourism Platform</span>
            <span>Handcrafted with Rajasthan Sanganer Block-Print Design Language</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
