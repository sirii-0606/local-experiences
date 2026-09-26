# Jaipur Luxury UI Redesign (Voyagenix, MNTN & Luxury Escapes Style)

## What changed
1. **Visual Design System & Typography**:
   - `frontend/index.html`: Loaded luxury Google Fonts: `Playfair Display`, `Cinzel`, `Plus Jakarta Sans`, and `Rozha One`.
   - `frontend/src/styles.css`: Added complete luxury design system tokens:
     - Jaipur Sandstone Terracotta (`#c85a32`, `#d97760`), Royal Indigo (`#141738`, `#263388`), Marigold Gold & Saffron (`#e5a93c`, `#c48817`), Emerald (`#1b4332`), and Marble Lime-Wash (`#f8eeea`).
     - Glassmorphism classes (`.glass-planner-bar`, `.jaipur-hero-frame`, `.glass-pill`, `.gold-gradient`).
     - Sanganer butti motifs and subtle Jharokha arch radii.
2. **Floating Glassmorphic Header & Luxury Heritage Footer (`Layout.tsx`)**:
   - Upgraded `<header>` to `.luxury-header` with brand crest (`🏛️ Jaipur Experiences`), rounded pill navigation tabs, demo clock, live weather indicator with diurnal temperatures, and traveler profile menu.
   - Added `.luxury-footer` with multi-column layout, curated experience links, traveler tools, and a 6-item photo collage gallery.
3. **Cinematic Hero & Quick Planner (`ExplorePage.tsx`)**:
   - Built a full-bleed Jaipur golden-hour hero banner with frosted glassmorphic quick planner (`Where in Jaipur`, `Time Window`, `Travelers & Ages`, `Budget INR`, `Vibe / Style`, `Curate My Plan →`).
   - Integrated quick destination pill chips (`🏛️ Hawa Mahal`, `🎨 Sanganer Block-Printing`, `🌅 Nahargarh Sunset Bastion`, `🍲 Johari Night Food Walk`).
4. **Value Proposition Ribbon**:
   - Added 4 luxury trust badges: *100% Verified Local Masters*, *Diurnal Weather Engine*, *Centroid-Matched Stays*, and *AR & 360° Virtual Preview*.
5. **MNTN-Style Dark Editorial Storytelling Chapters**:
   - Chapter 01 (`01`): *Living Craft Traditions — Master Artisans of Sanganer & Bagru*.
   - Chapter 02 (`02`): *Sacred Geometry & Sunsets — Hidden Stepwells & High Bastions*.
   - Chapter 03 (`03`): *Royal Feasts & Night Bazaars — Secret Bazaars & Spice Trails*.
   - Each chapter features high-resolution photography cards and auto-populates the interactive AI engine upon clicking.
6. **Live Interactive Engine Integration**:
   - Seamlessly nested the real-time AI situation chat, interactive MapView, recommendation cards, and disruption simulator inside `#engine-workspace`.

## Files touched
- `frontend/index.html`
- `frontend/src/styles.css`
- `frontend/src/Layout.tsx`
- `frontend/src/pages/ExplorePage.tsx`
- `docs/context/2026-09-26-20-jaipur-luxury-ui-redesign.md`
- `CONTEXT.md`

## Current state
- Backend: 116 tests passing (115 passed, 1 skipped), `ruff check .` clean.
- Frontend: TypeScript clean build (`tsc --noEmit && vite build`).
- Modern luxury UI inspired by Voyagenix, MNTN, and Luxury Travel Escapes live.
