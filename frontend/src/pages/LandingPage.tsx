import { Link } from "react-router";
import { useAuth } from "../auth";

// Product landing page: what TrueLocal is, for travelers and for hosts. No city is named:
// the planner works wherever the traveler is.
const STEPS = [
  { icon: "🧭", title: "Tell us who you are", text: "A two-minute questionnaire: what you enjoy, what you'd rather skip, your pace and who you travel with." },
  { icon: "💬", title: "Say what you want now", text: "“It's 6 pm, I'm with my parents, we love history.” We read the time, place, weather and traffic for you." },
  { icon: "🗺️", title: "Get a plan that works", text: "Only places that are open, reachable and in budget, with the reason for each. Closed right now? We tell you when it opens." },
  { icon: "📅", title: "Go, with reminders", text: "Add the plan to your calendar. Reminders fire when it's time to leave, counting the travel time." },
];

const FEATURES = [
  { icon: "⏱️", title: "Feasible before fancy", text: "Opening hours, travel time, your budget and your group are checked before anything is ranked." },
  { icon: "🌦️", title: "Live context", text: "Weather where you are, rush-hour travel times and what's open now. If it rains, outdoor stops are swapped." },
  { icon: "🧠", title: "It remembers you", text: "Your profile learns from your chats and past trips. You can see, correct or delete everything it knows." },
  { icon: "🛡️", title: "Reviews you can trust", text: "Bot bursts, copy-paste praise and AI-written reviews are caught and left out of the rating." },
  { icon: "🏛️", title: "Anywhere in India", text: "Open data covers any town, and protected heritage sites are marked as government-listed." },
  { icon: "🤝", title: "Local hosts, matched", text: "Artisans, cooks and guides list in their own words and reach travelers who actually fit." },
];

const EXAMPLES = [
  "I'm 76, with my family, we love history and culture. It's 6 pm, what can we still see?",
  "I have 4 hours before my train back, I'm a student, I want a beach with a view",
  "Two of us, 3 hours, street food and something hidden, nothing too crowded",
];

export default function LandingPage() {
  const { user } = useAuth();
  const start = user ? (user.onboarded ? "/explore" : "/onboarding") : "/register?next=/onboarding";

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Local experiences, intelligently planned</p>
          <h1>What should you do next, right where you are?</h1>
          <p className="landing-lede">
            TrueLocal reads your time, place, company, weather and budget, then plans what is actually
            open and worth your evening. With reviews you can trust and local hosts you would never
            find on your own.
          </p>
          <div className="landing-ctas">
            <Link to={start} className="landing-btn primary">{user ? "Continue planning" : "Start planning, it's free"}</Link>
            <Link to="/explore" className="landing-btn ghost">Try it without an account →</Link>
          </div>
        </div>

        <div className="landing-demo" aria-label="Example conversation">
          <span className="landing-demo-tag">Example</span>
          <div className="landing-bubble user">It's 6 pm, I'm with my family and I'm 76. We like history, no parks please.</div>
          <div className="landing-bubble bot">
            <strong>Here's what still works tonight</strong>
            <ul>
              <li>🏛️ A protected heritage temple, 11 min away, free</li>
              <li>🕯️ An evening aarti nearby, relaxed pace</li>
            </ul>
            <p className="landing-closed">🔒 The museum you'd love closed at 5:30. Opens tomorrow 10:00.</p>
            <div className="landing-chips">
              <span>☀ 26°C clear</span><span>🚗 normal traffic</span><span>📅 add to calendar</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">How it works</h2>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="landing-step-no">{i + 1}</span>
              <span className="landing-step-icon" aria-hidden="true">{s.icon}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">Built for the real world</h2>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <article key={f.title}>
              <span aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-h2">Ask it like you'd ask a friend</h2>
        <div className="landing-examples">
          {EXAMPLES.map((q) => (
            <Link key={q} to={`/explore?q=${encodeURIComponent(q)}`}>“{q}” <b>Try it →</b></Link>
          ))}
        </div>
      </section>

      <section className="landing-band">
        <div>
          <h2 className="landing-h2">Fake reviews don't count here</h2>
          <p>
            Twenty glowing reviews on one Tuesday, the same praise pasted twenty times, text that reads
            machine-written: we flag it, explain why, and leave it out of the rating. Reviews from a
            booked visit are marked verified.
          </p>
        </div>
        <Link to="/verify" className="landing-btn primary">See how we check reviews</Link>
      </section>

      <section className="landing-band host">
        <div>
          <h2 className="landing-h2">Run a local experience?</h2>
          <p>
            Describe it in your own words. We turn it into a listing, tell you which travelers it suits,
            and show you who wanted it and why they didn't book.
          </p>
        </div>
        <Link to="/provider" className="landing-btn ghost light">List your experience</Link>
      </section>

      <section className="landing-final">
        <h2 className="landing-h2">Spend less time searching and more time there.</h2>
        <Link to={start} className="landing-btn primary">{user ? "Open the planner" : "Create your free account"}</Link>
      </section>
    </div>
  );
}
