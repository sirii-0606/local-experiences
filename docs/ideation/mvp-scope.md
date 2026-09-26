# MVP Scope & Gaps Filled

This fills the parts the baseline doc leaves open that a hackathon prototype needs. **Status: proposed, needs team review.**

## In scope
- Constraint filtering (hard constraints, see `decisions.md`)
- Ranking with explanations built from the scoring factors, plus confidence badges
- Itinerary gap detection and filling, with lock/flexible stops
- Localized replanning for closure, rain, delay, budget change and "tired"
- Chat input (LLM + rule-based fallback), map, itinerary timeline
- Provider onboarding (free text → structured, editable), availability toggles, demand insights
- Basic group mode (hard-constraint union, fairness-weighted soft score)
- Visible feedback loop (accept/reject changes later rankings)

## Out of scope (roadmap slide only)
Real AR/3D/360, booking and payments, Track-A operator API integrations, live weather/traffic/crowd feeds, user accounts and auth, multilingual beyond English/Hindi UI strings, mobile app.

## Success metrics (shown in the demo)
1. **Feasibility: 100%.** Every recommended item and plan passes an independent validator. Enforced in tests.
2. **Replanning is local.** A disruption changes only the affected segment; locked stops stay untouched. Enforced in tests.
3. **Relevance.** On 10 scripted personas, at least 2 of the top 3 results match a hand-labelled "good" set.
4. **Speed.** From typed request to plan in under 2 s (fallback parser) or under 5 s (LLM).
5. **Provider reach.** In the demo, a newly onboarded informal provider appears in results for the matching persona.

## Cold start
Up to 4 questions: who's with you, how long do you have, budget, and pick up to 3 interests. Traveler-type defaults fill the rest (e.g. family → pace relaxed, child-friendly required).

## Demo script (flagship scenarios)
**A. "Family, 2 hours, near hotel, affordable food + culture."**
"We're a family of 4 with two kids near Hawa Mahal, free 4–6 pm, ₹1500 total, want local food and something cultural."
→ Feasible ranked list with reasons, map, then a 2-stop plan.

**B. Disruption.**
With plan A active: (1) "we're running 40 min late" → the second stop is swapped for a shorter nearby one and the first is kept; (2) "simulate rain" → the outdoor stop becomes an indoor equivalent; (3) "provider cancels" → a same-intent alternative. Each change shows a diff and a reason.

**C. Provider.**
A block-print artisan types a description, and the system structures it and shows demand insights. Switch to the traveler view and it now appears for a "craft, hidden gems" persona.

## Things the baseline doc doesn't cover (kept short on purpose)
- **Abuse and fake reviews:** in the MVP only traveler-reported evidence from completed plans counts. Roadmap: anomaly checks on review bursts.
- **Monetization:** non-goal for the MVP. Roadmap: commission on bookings, plus paid demand insights for providers. No pay-to-rank, which protects relevance.
- **Privacy stance for the demo:** location stays in the session and is never persisted. Providers see aggregate demand only (counts, time windows, budget bands), never individual travelers.
- **Safety:** late-night recommendations for solo travelers favour well-reviewed, central venues (soft factor). Roadmap item.
