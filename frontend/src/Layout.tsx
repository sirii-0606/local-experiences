import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "./auth";
import { useClock } from "./clock";
import { MOCK } from "./v2api";

const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "on" : "");

export default function Layout() {
  const { user, signOut } = useAuth();
  const { clock, setClock } = useClock();
  const navigate = useNavigate();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <div className="app-shell">
      {/* Floating Glassmorphic Header */}
      <header className="luxury-header">
        <Link to="/" className="brand-crest">
          <div className="crest-icon">🏛️</div>
          <div>
            <h1>TrueLocal</h1>
            <p className="sub">Local Experiences, Intelligently Planned</p>
          </div>
        </Link>

        <nav className="nav-pill-group" aria-label="Main navigation">
          <NavLink to="/explore" className={tab}>Explore</NavLink>
          <NavLink to="/3d" className={tab}>3D Discovery 🏛️</NavLink>
          <NavLink to="/trips" className={tab}>Plan a Trip</NavLink>
          <NavLink to="/provider" className={tab}>For Hosts</NavLink>
          <NavLink to="/verify" className={tab}>Review Check</NavLink>
          {user?.role === "admin" && <NavLink to="/admin" className={tab}>Admin</NavLink>}
        </nav>

        <div className="header-right">
          {!isLanding && <label className="clock" title="Adjust the simulated demo clock time">
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>Demo Clock:</span>
            <input type="datetime-local" value={clock} onChange={(e) => setClock(e.target.value)} />
          </label>}

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

      <footer className="luxury-footer">
        <div className="footer-inner">
          <div className="footer-main-grid">
            <div className="footer-brand">
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "1.8rem" }}>🏵️</span>
                <h3 style={{ margin: 0 }}>TrueLocal</h3>
              </div>
              <p>
                Local Experiences, Intelligently Planned. What to do next, right where you are: open, reachable, in budget, with reviews you can trust and local hosts who fit.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <span className="chip mini" style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)" }}>
                  Verified Reviews
                </span>
                <span className="chip mini" style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)" }}>
                  Live Context
                </span>
              </div>
            </div>

            <div className="footer-col">
              <h4>Experiences</h4>
              <ul>
                <li><Link to={`/explore?q=${encodeURIComponent("heritage and history nearby")}`}>Heritage &amp; History</Link></li>
                <li><Link to={`/explore?q=${encodeURIComponent("a local craft workshop")}`}>Craft Workshops</Link></li>
                <li><Link to={`/explore?q=${encodeURIComponent("local street food")}`}>Street Food</Link></li>
                <li><Link to={`/explore?q=${encodeURIComponent("hidden gems, not touristy")}`}>Hidden Gems</Link></li>
                <li><Link to={`/explore?q=${encodeURIComponent("a sunset view")}`}>Sunset Views</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Planning</h4>
              <ul>
                <li><Link to="/trips">Multi-Day Trips</Link></li>
                <li><Link to="/trips/new">Plan a New Trip</Link></li>
                <li><Link to="/provider">Host Your Experience</Link></li>
                <li><Link to="/profile">Traveler Profile</Link></li>
                <li><Link to="/verify">Check Reviews</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Traveler Moments</h4>
              <p style={{ fontSize: "0.82rem", color: "#9894b3", margin: "0 0 0.5rem" }}>
                The kind of places travelers plan around.
              </p>
              <div className="footer-gallery-grid">
                <img src="https://images.unsplash.com/photo-1597040663342-45b6af3d91a5?auto=format&fit=crop&w=300&q=75" alt="Museum hall" />
                <img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=300&q=75" alt="Block printing" />
                <img src="https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=300&q=75" alt="Stepwell" />
                <img src="https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=300&q=75" alt="Palace courtyard" />
                <img src="https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=300&q=75" alt="Hilltop sunset" />
                <img src="https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=300&q=75" alt="Street Food" />
              </div>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <span>© {new Date().getFullYear()} TrueLocal · Local Experiences, Intelligently Planned</span>
            <span>Open data: Wikidata, Wikipedia, Open-Meteo</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
