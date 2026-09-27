# Trip wizard: Review and Save in the side column

## What changed
On the last step of the trip wizard ("Anything you'd hate to miss?"), the Review summary and the Back / Save trip buttons were at the bottom of a long must-see list. They now sit in their own card in the sticky side column, below the "Jaipur in October" postcard. On that step the ticket card is hidden, because Review shows the same facts, so the column fits on screen. The Save button submits the wizard form through `form="trip-wizard"`. On phones (≤900 px), Review and Save come after the must-sees, as before. Steps 1–3 are unchanged.

## Why
The user: "move this in a separate card below Jaipur in October so that we don't have to scroll down all the way".

## Files touched
`frontend/src/pages/TripWizard.tsx`, `frontend/src/styles.css`, `CONTEXT.md`.

## Current state
`npm run build` is clean. Checked in the browser (scratch servers):
- The side column is 608 px tall in a 720 px window.
- Scrolled 4,500 px down, Save trip is still on screen (y 559–602).
- Clicking it saves the trip and opens `/trips/1/shortlist`.
- At phone width the order is postcard → must-sees → Review, with no horizontal scroll.

## Known gaps
On phones the must-see list is still long before Review; a sticky bottom Save bar would fix that if needed.

## How to proceed next
Push `feat/photos-empty-plan` + `feat/host-loop` to `main` when the user asks (fetch first).
