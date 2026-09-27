# Explore: a calm page that scrolls

## What changed
- Explore is no longer locked to one screen (`Layout.tsx` forced `100vh` + `overflow: hidden`, so every column scrolled inside a small box). The page scrolls normally and has the footer like every other page.
- Two columns instead of three: content on the left; weather at a glance and the map on the right, sticky below the header while you scroll. On phones it's one column with the map last.
- The assistant is an **Ask** box at the top (question, location button, your last question and the reply; the full conversation on demand) instead of a floating drawer over the filters. The reply is short (top picks with reasons); closed-now, weather and assumptions stay in the context strip below it.
- Filters: one row of category chips plus search; time, group, pace, transport and max price sit behind "More filters".
- Cards: roomier grid, two short reasons, "Why this?", price, time, reviews, add to plan. The teammate's Heat %/Rain % pills (which showed made-up defaults for most places) became one plain note ("Sheltered from rain", "Exposed to rain") shown only when it's actually raining or hot and only for places with a real value.
- Plan: a simple ordered list with lock/remove; What-if, Signals and Add to calendar are small buttons in its header. The what-if presets moved out of the plan (they're in the What-if dialog).
- ~12 KB of CSS rules from the old layout that matched nothing were deleted.

## Why
The user: "why is this page limited to one page height; make it free and the UI more comfy, सुटसुटीत (neat, uncluttered)".

## Files touched
`frontend/src/pages/ExplorePage.tsx`, `frontend/src/Layout.tsx`, `frontend/src/styles.css`, `CONTEXT.md`.

## Current state
Checked in the browser at 1440×900 and 375×812: the page scrolls (2,215 px tall with results), the map sticks at 76 px, no sideways scroll on phones, chat/filters/What-if/calendar work. `npm run build` clean; backend unchanged.

## Known gaps
- The browser preview sometimes renders scrolled pages blank in screenshots (a capture artifact, not the page).
- The header nav is crowded on phones (unchanged).

## How to proceed next
Push to `main` when the user says so.
