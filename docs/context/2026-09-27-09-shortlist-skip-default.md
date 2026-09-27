# Shortlist: skipped by default, except must-sees

## What changed
In a trip's shortlist ("Scored Attractions"), every candidate used to start as **In Person**. Now only the must-sees the traveler picked in the wizard start as In Person, and everything else starts as **Skip**. Choices saved earlier still win. With no must-sees and nothing chosen, itinerary generation still falls back to the top candidates (`engine/trip.py`).

## Why
The user: attractions "should be skipped by default except the must not miss the user chose earlier".

## Files touched
`frontend/src/pages/TripShortlist.tsx`, `CONTEXT.md`.

## Current state
Build is clean. In the browser (scratch servers), a new trip with the must-see Hawa Mahal showed 55 candidates: 1 In Person (Hawa Mahal) and 54 Skip.

## Known gaps
Trips saved before this change keep their saved all-In-Person shortlist.

## How to proceed next
Polish items in CONTEXT.md.
