# Demo guide (about 6 minutes)

Every step below was rehearsed end to end on 2026-09-26 against the real app, and the results quoted are what you'll see.

## Before you present (5 min)
1. In a terminal in the project folder, run `python scripts/dev.py --reset`. It opens http://localhost:5173 by itself when it's ready. **Don't press Ctrl+C until you're done**, because that stops the app.
2. Leave the **demo clock** at **26 Sep 2026, 15:30**. Every scenario depends on it.
3. You need internet for map tiles and the live-weather chip only. The chat needs no API key.
4. Make the browser full screen and zoom to 90% if the plan panel doesn't fit.

**One-line pitch:** *"Maps tell you what exists nearby. We tell you what you can actually do next, and why."*

## 1. The problem (30 s)
Travelers have constraints: time, budget, kids, access and a plan already. Local hosts are invisible. Search lists places, but it doesn't check what's feasible and doesn't explain.

## 2. Scenario A: what actually fits (90 s)
1. Click **▶ Try the family example** on the "Try it in 3 steps" card.
2. **Read the summary aloud:** *"16:00–18:00, ₹1500, 4 people, 2 kids, looking for local food, heritage, performance. 5 options fit; 31 ruled out."*
3. **Map ↔ cards:** the blue numbers 1–4 are options, and the orange letters A and B are your plan. The dashed line is the route.
4. **Reasons:** on **1 Masala Chowk**, *"especially for child1, child2 · run by a local community host"*. Then point at the puppet show's **⚠ unverified** badge: *"we flag unconfirmed prices instead of hiding them."*
5. Open **🔍 Why not the others?**, then **Hawa Mahal:** *"no time left to fit its 45 min after you arrive at 16:00 (open 09:00–16:30)."* That's the difference from a listing site.
6. **The plan:** A is the lassi at 16:20, B is the puppet show at 17:00, and it shows ✓ *"Every stop is reachable, open and within budget."*

## 3. Scenario B: things change (90 s)
1. Click **💸 Only ₹300 left**. The diff shows:
   - **🔁 Swapped** Kulhad lassi → **Pyaz kachori at 16:25**, "because it doesn't fit your budget any more"
   - **➖ Dropped** Kathputli puppet show, "nothing comparable fits that slot"

   *"We repair the affected stops, not the whole day, and say why."*
2. To restore the plan, click the first example chip (the family one), then **Send**. The budget is ₹1500 again.
3. **Lock** the puppet show (🔓 → 🔒), then click **🚫 Next stop closed**. The result is **➖ Dropped Kulhad lassi, "closed today"**, and the **locked show is untouched**.
4. Optional: click **🛰 Check live forecast**. It checks the real Jaipur forecast against your outdoor stops and only *proposes* a replan if there's a risk. On a clear day it says ✓ no risk.

## 4. It learns, and you stay in control (45 s)
1. On **Masala Chowk**, choose **Not for me… → Not my thing**. It disappears, and **"Learned from you: ▼ local-food ▼ street-food"** appears. It never learns "family" or "kids": those are who you are, not your taste.
2. Tap a chip to **forget** it. *"Inferred preferences are visible and correctable."*
3. In **▸ Edit group**, set the last child's age to **4**, then click **Update group**. Why-not now says **Kite-making: "minimum age 5, youngest in your group is 4"**.

## 5. Booking and ratings (30 s, optional)
1. On the puppet show in the plan, click **🎟 Book**. You get *"Booked … for 4 at 17:00. Reference LE-…"*, and the stop becomes confirmed and locked. Capacity is enforced: a full slot is refused with the reason.
2. Set the demo clock to **17:50**. **"How was it?"** appears on the finished stop; choose **★★★★★**. *"Good visits become traveler evidence, so the unverified badge clears for everyone."* Set the clock back to **15:30**.

## 6. Scenario C: the provider side (75 s)
1. Click **🏪 Provider**. Salim's own-words description is pre-filled. Click **Draft my listing**. It becomes **"Make your own bangle with Salim"**: ₹250, 45 min, 11:00–19:00, Friday off, tags craft/jewellery/family/kids. Click **Publish**, which shows ✓ *"Live…"*.
2. Click **🧭 Traveler**, then **↺ New trip** (a different traveler). Click the third example chip (*"Solo, near Tripolia Bazaar, 4 to 7pm, ₹1000, hidden gems and craft"*), then **Send**. The summary reads "1 person", and Salim's workshop is **recommended and planned (stop C, 18:45)**.
3. Back on **🏪 Provider**, Salim's listing is selected (★): it shows matching searches, "1 time recommended", and when those travelers were free. Pick **Rajasthani home cooking class** in the list: *"why interested travelers didn't get you: over their budget"*, plus a tip. *"Demand signals, not just exposure. Aggregates only: we never show who searched or where they were."*
4. Optional: the owner sees **Edit listing, Pause, Remove**. Other people can't change it, because each listing has a secret edit token.

## 7. Close (20 s)
One engine does feasibility, ranking, explanation, planning, replanning and learning. Chat, map, provider view and live weather are windows onto it. Claude only extracts intent and never decides, and everything works offline. **Next:** Hindi UI, 360° previews, and ratings tied to bookings.

## If something goes wrong
- **Results look off after experimenting:** click **↺ New trip**. For a fully clean slate, press Ctrl+C, run `python scripts/dev.py --reset`, and reload.
- **"Port 8000 is already in use":** an old copy is still running. Close that terminal and retry.
- **The map is grey:** there's no internet for tiles. Everything else still works.
- **A red bar appears:** read it out. Messages like "doesn't fit around your current plan" are real answers, not bugs.
- **http://localhost:8000** opens the API docs. That's the backend, and it's fine; the app is on **:5173**.
