import { Link, Route, Routes } from "react-router";
import Layout from "./Layout";
import { RequireAuth } from "./auth";
import AdminPage from "./pages/AdminPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import ExplorePage from "./pages/ExplorePage";
import ProfilePage from "./pages/ProfilePage";
import ProviderPage from "./pages/ProviderPage";
import TripsPage from "./pages/TripsPage";

// Explore and Provider stay open without an account (demo continuity); trips need one.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ExplorePage />} />
        <Route path="provider" element={<ProviderPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="trips" element={<RequireAuth><TripsPage /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />
        <Route path="*" element={<section className="page narrow"><div className="panel"><h2>Page not found</h2><Link to="/">Back to Explore</Link></div></section>} />
      </Route>
    </Routes>
  );
}
