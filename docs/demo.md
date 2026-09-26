# 5-minute demo script

**Setup (before you present):** run `python scripts/dev.py --reset` and open http://localhost:5173. Keep the demo clock at **26 Sep 2026 15:30**. No API key is needed; the offline parser handles every line below. Pre-fill nothing else.

**One-line pitch:** *"Maps tell you what exists nearby. We tell you what you can actually do next, and why."*

## 1. The problem (30 s)
Travelers have constraints: time, budget, kids, access, an existing plan. Local hosts are invisible. Generic search lists places. It doesn't check whether they're feasible, and it doesn't explain anything.

## 2. Scenario A: constraint-aware discovery (75 s)
1. The family example is already in the chat box. Click **Send**.
2. Point at the summary line. The chat understood 4 people, 2 kids, 16:00–18:00, ₹1500, food and culture.
3. Point at a card's **reasons**: distance, time, cost, "run by a local community host". Point at the ⚠ **low confidence** badge: *"we flag stale info instead of hiding it."*
4. Open **Why not the others?** and show Hawa Mahal: *"closes at 16:30, you arrive at 16:00, it needs 45 minutes."* That's the difference from a listing site.
5. The plan: lassi, then the puppet show, with ✓ "every stop is reachable, open and within budget".

## 3. Scenario B: things change (75 s)
1. **Lock** the puppet show (🔓 → 🔒).
2. Click **Next stop closed**. The diff shows the lassi dropped, and why. The locked show is untouched.
3. Click **Only ₹300 left**. The show is locked, so it's reported rather than moved, or, if it's unlocked, swapped for the free Birla Mandir visit. *"We repair the affected piece, not the whole day."*
4. Optional: type *"actually, something less crowded"*. The refinement keeps the rest of the context.

## 4. It learns, and you stay in control (40 s)
1. On a card, choose **Not for me… → Not my thing**. It disappears, and the "Learned from you ▼" chips appear.
2. Tap a chip to **forget** it. *"Inferred preferences are visible and correctable, never a black box."*
3. Optional: in **Edit group**, set a child's age to 4 and click **Update group**. Kite-making drops out with "minimum age 5, youngest in your group is 4".

## 5. Scenario C: the provider side (60 s)
1. Switch to the **Provider** tab. Salim's own-words description is pre-filled. Click **Draft my listing**. It becomes "Make your own bangle with Salim", with the price, hours, "closed Friday" and tags filled in. Click **Publish**.
2. Switch to **Traveler** and send *"Solo, near Tripolia Bazaar, 12 to 3pm, ₹1000, hidden gems and craft"*. Salim's workshop is recommended and planned.
3. Back on **Provider**: Salim sees that 1 matching search recommended them. Then pick the **cooking class** from the list: *"interested families lost: over their budget"*, with a tip. *"Providers get demand signals, not just exposure. Aggregates only; we never show who searched or where they were."*

## 6. Close (20 s)
One engine does feasibility, ranking, explanation, planning, replanning and learning. Chat, map and provider views are just windows onto it. Claude only extracts intent and never decides. It runs fully offline too. **Next** (M9): 360° previews, live weather, booking, Hindi, provider accounts.

## If something goes wrong
- **Wrong results after experimenting:** stop the servers, run `python scripts/dev.py --reset`, and reload.
- **A button seems stuck:** check the red error bar. Every failure explains itself; for example, "doesn't fit around your current plan" is a real answer, not a bug.
- **Presenting with an API key set:** the parser line says "Claude" instead of "offline parser". The engine results are identical.
