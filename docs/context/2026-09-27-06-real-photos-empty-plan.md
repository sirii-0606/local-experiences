# Real photos, and no plan you didn't make

## What changed
- **Photos:** the hand-picked stock photos were mostly wrong (the Taj Mahal for Amer Fort, a South Indian temple for City Palace, Humayun's Tomb for Albert Hall, a nightclub for Birla Mandir, a galaxy for kite-making, fish for a BBQ restaurant). Replaced with Wikimedia Commons photos, each checked by eye on contact sheets:
  - landmarks use their own Wikipedia article's lead image;
  - activities and dishes use a Commons photo of that thing in Rajasthan (blue pottery, pyaz kachori, Ghoomar…);
  - 5 experiences have none that's right (Bapu Bazaar, Handi, Anokhi Café, block-printing workshop, Amer lanes) and show a category placeholder.
  - `frontend/src/photos.ts` keeps URL, file page, author and licence; cards show a small "© Wikimedia" credit link.
- **Open-data places anywhere** get the image Wikidata links to that exact place (P18), or the lead image of their Wikipedia article when the Wikipedia fallback was used: `GET /photos?ids=ex-od-…` (Commons only, so credit is known; cached 30 days including "no photo").
- `getExperiencePhoto` always returns a usable URL: the real photo or a generated category placeholder, never another place's picture.
- **Explore no longer invents a traveler or a plan on load** (it built a demo Jaipur family and a 3-stop plan). Nothing is recommended until the traveler asks. After a chat the engine's plan is offered as a suggestion ("Use this plan"); the traveler's plan only holds what they chose, and their own stops are re-checked, not replaced.

## Why
The user: images don't make sense; "places in my plan but I haven't made any plan".

## Files touched
`frontend/src/photos.ts`, `frontend/src/pages/ExplorePage.tsx`, `frontend/src/MapView.tsx`, `frontend/src/api.ts`, `frontend/src/styles.css`, `backend/app/opendata.py`, `backend/app/main.py`, `backend/tests/test_anywhere.py`, `docs/openapi.json`, `CONTEXT.md`.

## Current state
154 passed, 1 skipped; frontend builds. Browser check (scratch servers): empty page on load; Pune question → 5 places, all 5 with their real photos and credits, plan empty with a 2-stop suggestion.

## How to proceed next
Hosts/vendors improvements (see the proposal in the session), then push to `main`.
