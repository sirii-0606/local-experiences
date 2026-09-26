# 2026-09-26-16 · Design refresh: "Sanganer block print" identity across the whole app

## What changed
The user ran the `frontend-design` skill with "fix and enhance the frontend design". The P3 pass had landed on the generic generated-UI look: cream background, serif display, terracotta accent, gradient buttons, ALL-CAPS labels, "·"-joined meta, "→" buttons, emoji nav. The mobile nav also wrapped. Everything is now grounded in Jaipur's block-print craft (Sanganer and Bagru are in the seed data).

- **Tokens** (`styles.css` `:root`, plus a dark "indigo night" set):
  - base: Pink City lime-wash `#f8eeea`; text: indigo ink `#1d1f4a`
  - rani pink `#b8174f` for actions and your plan; block-print indigo `#3342a0` for recommendations; marigold `#e89b0c`
  - new tokens: `--rec-ink` and `--lift`. Map pins and labels use `--accent-ink`/`--rec-ink`, so they're readable in dark mode.
- **Type:** **Rozha One** for display (a single weight, so every display rule uses 400) and **Hind** for body. Both are from Indian Type Foundry, loaded from Google Fonts in `index.html`, and replace Fraunces and Segoe UI. Headings are sentence case; tracked caps are gone, including table headers.
- **The one bold element:** the `--butti` motif (a block-print flower, as an SVG CSS mask).
  - It prints as a border under the header and as a small brand mark.
  - **Trip covers are dyed fabric swatches** (indigo, rani, marigold, henna; `dye = trip id % 4`). They replace the gradient "sunset" postcard.
  - Past trips are desaturated.
- **Quieter everything else:** solid buttons (no gradients), flat panels with a 1px shadow (lift only on hover or floating elements), a radius hierarchy (14 / 10 / 8 / pill), and a plain-text nav with a rani underline.
- **Copy and markup:**
  - Header: "Local & Experiences" with the tagline "What you can actually do next in Jaipur, and why". No emoji in the nav; "Provider" is now "For hosts". The weather reads "32°C, 1% chance of rain".
  - Trips: "Asha's trips"; no "Hi" eyebrow; the budget sits right-aligned instead of in a dotted meta string.
  - Wizard: steps are "Dates and budget / Your stay / Who's coming / Must-sees and review". Each panel asks a question ("When are you going?"…). "Next: your stay" replaces "Continue →", "Back" replaces "← Back", and "Add a traveler" drops the "+".
  - Explore welcome: a display heading and big numerals for the three steps (a real sequence); the step text says "Open For hosts".
- **Mobile:** below 700px the nav drops to its own full-width row and never wraps.

## Why
The user asked for a distinctive, subject-specific design and a fix for what was off. The old palette and type matched a common generated-UI pattern. The mobile header wrapping was a known gap.

## Files touched
`frontend/index.html`, `frontend/src/styles.css`, `frontend/src/Layout.tsx`, `frontend/src/pages/{TripsPage,TripWizard,ExplorePage}.tsx`, `docs/ideation/decisions.md`, `CONTEXT.md`

## Current state
- `npm run build` passes. There are no backend changes (tests still 109 pass).
- **Checked in the browser (isolated :8001/:5174, scratch DB deleted afterwards):**
  - Explore empty and populated (family example: pins, recommendation cards, plan) at 1366px light.
  - Trips dashboard with 3 trips (3 dyes, 1 past) and the wizard at 1366px dark.
  - Dashboard at 375px light: no horizontal overflow, the nav on one row, both fonts loaded.
  - The profile page inherits the new tokens.

## Known gaps
- Explore's recommendation meta lines still join time, price and distance with "·" (a data line, left as is). The category emoji in cards and the chips remain.
- Google Fonts still sees visitor IPs; self-host Rozha One and Hind if that matters.
- The provider and admin pages only inherited tokens and weren't individually redesigned.

## How to proceed next
Same as before: **P4** (shortlist and stays) or **P2** (onboarding). New screens should reuse `--butti`, the dye classes (`.postcard.dye-N`) and `.display` rather than adding new decoration.
