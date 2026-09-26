# 5-minute demo script

**Setup (before you present):** run `python scripts/dev.py --reset`. The browser opens at http://localhost:5173 by itself. Leave the demo clock at **26 Sep 2026 15:30**. No API key is needed; the offline parser handles every line below. You need internet only for map tiles and the live-weather chip; everything else runs offline.

**One-line pitch:** *"Maps tell you what exists nearby. We tell you what you can actually do next, and why."*

## 1. The problem (30 s)
Travelers have constraints: time, budget, kids, access, an existing plan. Local hosts are invisible. Generic search lists places. It doesn't check whether they're feasible, and it doesn't explain anything.

## 2. Scenario A: constraint-aware discovery (75 s)
1. Point at the **Try it in 3 steps** card, then click **▶ Try the family example**.
2. Point at the summary in the chat. It understood 4 people, 2 kids, 16:00–18:00, ₹1500, food and culture.
3. The **numbered badges** on the cards match the **map pins**. Plan stops are lettered A and B, and the route is dashed.
4. Point at a card's **reasons**: travel time, "especially for child1, child2", "run by a local community host". Then point at **⚠ unverified**: *"we flag stale info instead of hiding it."*
5. Open **🔍 Why not the others?** and show Hawa Mahal: *"closes at 16:30, you arrive at 16:00, it needs 45 minutes."* That's the difference from a listing site.
6. The plan shows the lassi, then the puppet show, with ✓ "every stop is reachable, open and within budget".

## 3. Scenario B: things change (75 s)
1. In **Your plan**, **lock** the puppet show (🔓 → 🔒).
2. In **Something changed?**, click **🚫 Next stop closed**. The diff reads "➖ Dropped Kulhad lassi… because closed today". The locked show is untouched.
3. Click **💸 Only ₹300 left**. The locked show is reported "⚠ At risk" rather than moved. If it's unlocked, it's swapped or dropped with a reason. *"We repair the affected piece, not the whole day."*
4. Click **🛰 Check live forecast**. It checks the real Jaipur forecast against your outdoor stops and *proposes* a replan only if there's a risk. The chip in the header shows live conditions.

## 4. It learns, and you stay in control (40 s)
1. On a card, choose **Not for me… → Not my thing**. It disappears, and "Learned from you ▼" chips appear.
2. Tap a chip to **forget** it. *"Inferred preferences are visible and correctable, never a black box."*
3. Optional: in **▸ Edit group**, set child2's age to **4** and click **Update group**. Kite-making drops out with "minimum age 5, youngest in your group is 4".

## 5. Scenario C: the provider side (60 s)
1. Click the **🏪 Provider** tab. Salim's own-words description is pre-filled. Click **Draft my listing**. It becomes "Make your own bangle with Salim", with price, hours, "closed Friday" and tags filled in. Click **Publish**.
2. Switch to **🧭 Traveler** and send *"Solo, near Tripolia Bazaar, 12 to 3pm, ₹1000, hidden gems and craft"* (the third example chip is close). Salim's workshop is recommended and planned.
3. Back on **Provider**, Salim sees that 1 matching search recommended them. Then pick the **cooking class** from the list: *"interested families lost: over their budget"*, plus a tip. *"Providers get demand signals, not just exposure. Aggregates only; we never show who searched or where they were."*

## 6. Close (20 s)
One engine does feasibility, ranking, explanation, planning, replanning and learning. Chat, map, provider and live weather are just windows onto it. Claude only extracts intent and never decides, and everything runs offline too. **Next:** post-visit ratings, Hindi UI, 360° previews, provider accounts, booking.

## If something goes wrong
- **Wrong results after experimenting:** press Ctrl+C, run `python scripts/dev.py --reset`, and reload.
- **"Port 8000 is already in use":** an old copy is still running. Close that terminal, or restart the machine if you can't find it.
- **The map is grey:** there's no internet for map tiles. Everything else still works, including the badges, plan and reasons.
- **A button seems stuck:** check the red bar under the header. Every failure explains itself; for example, "doesn't fit around your current plan" is a real answer, not a bug.
- **Presenting with an API key set:** the summary says "Claude" instead of "offline parser". The engine results are identical.
