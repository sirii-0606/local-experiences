import { Link } from "react-router";
import { useAuth } from "../auth";

// Placeholder until P3 (trip model + "Plan a trip" wizard). Signed-in only.
export default function TripsPage() {
  const { user } = useAuth();
  return (
    <section className="page narrow">
      <div className="panel">
        <h2>Plan a trip</h2>
        <p>Hi {user?.display_name}. Multi-day trip planning is coming next: budget, dates, where you'll stay, who's travelling,
          then a shortlist you can keep, preview or skip, and a day-by-day plan you can print.</p>
        <p className="muted small">Until then, <Link to="/">Explore</Link> plans a single afternoon around what you tell it.</p>
      </div>
    </section>
  );
}
