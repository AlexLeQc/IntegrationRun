# Project Specification & Implementation Plan: Doodle Runner

We will build **DOODLE RUNNER**, a mobile-first, high-performance, 3-lane runner web game set in a bright, playful, hand-drawn sketchbook aesthetic inspired by childhood art class. The game features hand-drawn doodle graphics, graphite pencil perspective grid lines, audio synthesized dynamically via the Web Audio API, mobile touch swipe controls, and a global leaderboard integrated with Supabase.

---

## Environment Setup & Configuration

> [!NOTE]
> **Local Fallback Enabled:** The application includes a mock mode in `src/supabase.js` that falls back to `localStorage` if `.env` variables are missing. This allows local development and playtesting without setting up Supabase first.

### Configuration Files

- **`package.json`**: NPM package configuration detailing dependencies (such as `@supabase/supabase-js`) and dev tooling (`vite`).
- **`vite.config.js`**: Vite configuration defining server options and build settings.
- **`vercel.json`**: Hosting configuration for Vercel providing SPA route rewrites (`"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`) to guarantee smooth client-side routing and static asset serving.
- **`.env.example`**: Template showing required environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).

### Database Schema (Supabase)

When ready to connect live global leaderboards, create a `.env` file at the root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The leaderboard uses a `high_scores` table. Run this SQL in your Supabase SQL Editor to set it up:

```sql
-- Create high_scores table
create table public.high_scores (
  id uuid default gen_random_uuid() primary key,
  username varchar(30) not null check (char_length(username) >= 2),
  score integer check (score >= 0) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index the score column for high performance retrieval
create index high_scores_score_idx on public.high_scores (score desc);

-- Enable Row Level Security (RLS)
alter table public.high_scores enable row level security;

-- Create policy to allow anyone to read the leaderboard
create policy "Allow public read access" on public.high_scores
  for select using (true);

-- Create policy to allow anonymous score submissions
create policy "Allow public insert access" on public.high_scores
  for insert with check (true);
```

---

## Game Design & Specifications

### Player

- The player controls a hand-drawn paper airplane / doodle chevron with marker stroke outlines and crayon accents.
- Positioned at the bottom of the screen (Y ≈ 85% of screen height).
- Moves horizontally between three lanes (left, middle, right) using swipe touch inputs on mobile or arrow/AD keys on desktop.
- Can transition into a **Jumping** state (elevated Y-offset tracking a jump arc).
- Can transition into a **Sliding** state (vertically compressed ship layout and hitbox).
- **Movement State Canceling (Jump/Slide Overrides)**:
  - **Jump-to-Slide Cancel**: Swiping Down (or pressing Down/S) while in mid-jump immediately cancels the jump arc, snaps/drops the player down to ground level (`jumpHeight = 0`, `isJumping = false`), and initiates the Slide state (`isSliding = true`) with a full slide timer reset.
  - **Slide-to-Jump Cancel**: Swiping Up (or pressing Up/W) while in mid-slide immediately cancels the slide squish (`isSliding = false`), restores normal player vertical scale, and initiates the Jump arc (`isJumping = true`) with a fresh jump arc trajectory.
- Movements are smoothly interpolated for a responsive and fluid feel.

### Obstacles & Hazards

- Obstacles are procedurally generated in the active lanes.
- They spawn at the vanishing point (horizon) and move down towards the screen bottom, scaling up exponentially in size to create a 3D perspective effect.
- Hazards are divided into **four categorized types**:
  - **Hand-Drawn Cardboard Box**: 3D cardboard box with marker outlines, tape strips, and warm brown fill requiring a lane change.
  - **Pencil Fence / Hurdle**: Low-profile wooden pencil hurdle requiring a **Jump** (collision is bypassed if player is currently jumping).
  - **Ink-Splatter Beam Arch**: Overhead laser arch styled as dark ink pillars and a vibrant splattered ink bar requiring a **Slide** (collision is bypassed if player is currently sliding).
  - **GOUV Target** _(special shootable hazard)_: A hot-pink/magenta target that can be **destroyed by a laser shot** for bonus points, or avoided. If not destroyed before reaching the player, it triggers a normal collision (−1 life, screen flash/shake, hit sound).

### GOUV Targets & Tap-Shooting Mechanic (Water Balloons)

- **Spawn**: GOUV targets spawn procedurally in one of the 3 lanes at the horizon (~15% of obstacle spawns) and move down the track at the same speed as standard obstacles, scaling with perspective `zScale`.
- **Asset**: Renders `public/assets/gouv.png` scaled by `zScale`. Falls back to a magenta/hot-pink procedural box with a white target crosshair doodle if the asset is missing.
- **Player Collision (Penalty)**: If a GOUV reaches the player without being destroyed, it triggers a normal obstacle collision (−1 life, screen flash, screen shake, plays `hit` sound).
- **Water Balloon Projectile Theme**: Projectiles are themed as blue water balloons rather than laser beams. They render as bright cyan/sky-blue water spheres (`#00f0ff` / `#2196f3`) with specular highlights that scale along the perspective axis (`zScale`) towards the horizon.
- **Touch Input Separation Rules**:
  - **Swipes (Movement)**: Any touch gesture with horizontal or vertical drag displacement ($\Delta x \ge 30\text{px}$ or $\Delta y \ge 30\text{px}$) is strictly processed as movement (Lane Shift, Jump, or Slide) and **CANNOT** trigger shooting.
  - **Quick Taps (Shooting)**: Shooting is triggered ONLY by a stationary quick tap (touch movement $< 15\text{px}$ AND touch duration $< 250\text{ms}$), or `Spacebar` on desktop.
- **Water Balloon Shooting & Impact**:
  - **Desktop**: Press `Spacebar` to launch a water balloon in the player's current lane.
  - **Mobile**: Perform a quick tap ($< 15\text{px}$ drag, $< 250\text{ms}$) anywhere to launch a water balloon in the player's current lane.
  - The water balloon projectile (`z` decreasing from `player.z` toward horizon) travels down the lane at high speed (~2.2 z-units/sec).
  - **Blocking Rule**: Standard obstacles (barrier, hurdle, beam) in the same lane between the player and the GOUV block the water balloon — it pops on impact with no reward and no GOUV destruction. The lane must be clear.
  - **GOUV Hit**: On impact with a GOUV, it pops immediately: spawns a cyan + sky-blue water splash particle explosion (`#00f0ff`, `#0288D1`, `#E0F7FA`), awards **+250 bonus points**, and plays wet, bubbly "splat" / splash sound effects (`shoot` + `destroy`).
- **Projectile System** (managed in `src/game.js`):
  - `this.projectiles[]` array tracks active water balloons with `{ lane, z }`.
  - Each frame: advance `z` toward horizon, check for obstacle/GOUV intersection, remove on hit or when past horizon.
  - Shot cooldown: 200ms between shots to prevent spam.
- Colliding with an obstacle (non-GOUV) decreases the player's life count and the obstacle collides normally.
- The spawn rate and speed gradually increase as the player's score increases.

### Spawn Interval Hardening

The obstacle spawn interval uses the original difficulty curve, wrapped in a `Math.max` guard to prevent NaN or a corrupted score from producing a zero/negative interval:

```javascript
const currentInterval = Math.max(0.7, this.spawnInterval - (score / 18000));
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `spawnInterval` | `1.5 s` | Base seconds between spawns |
| Difficulty reduction | `score / 18000` | Linear ramp — unchanged from original |
| Hard floor | `0.7 s` | Minimum enforced interval (original value preserved) |

**Debug Health-Check (Force-Spawn):** If the active obstacle array is empty and more than `2 × spawnInterval` (3 s) has elapsed without a new spawn, the manager immediately force-triggers a spawn and resets both timers. A `console.warn` is emitted to aid debugging.

**Asset Validation Guard:** Before calling `ctx.drawImage()` for any obstacle type (barrier, hurdle, beam, gouv), the renderer validates that the asset is fully decoded:
```javascript
const assetReady = imageAsset && imageAsset.complete && imageAsset.naturalWidth > 0;
```
If the asset is not ready, the procedural canvas fallback executes without throwing a runtime exception.

### Lanes & Perspective

- The perspective vanishing point/horizon is pushed high up the screen to **Y = 17%** (1/6th) of the total height.
- Consequently, the three lanes extend down to the bottom, occupying **5/6th (≈83%)** of the total canvas height.
- The track grid is rendered using graphite pencil sketch lines with organic hand-drawn line jitter.

### Scoreboard & High Scores (Arcade Leaderboard System)

- Score automatically increases continuously over time as the player survives (accumulating at a rate of +10 points per second elapsed) plus +100 points for collected coins.
- **Centralized Limit Configuration (`MAX_LEADERBOARD_ENTRIES`)**: The maximum number of entries displayed and stored on the global leaderboard is governed globally by the exported constant `MAX_LEADERBOARD_ENTRIES` (default `100` in `src/supabase.js`). Changing this single value scales the leaderboard limit across database queries, local storage fallbacks, qualification logic, and UI rendering.
- **Database Schema & SQL Setup**:
  ```sql
  CREATE TABLE high_scores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    team VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- **22 Integration Teams**:
  Players select their orientation team from a custom list of 22 orientation teams (`INTEGRATION_TEAMS` exported from `src/supabase.js`):
  1. `Schtroumpfettes Pompettes`
  2. `Passe-MontAngine de Poitrine`
  3. `Johnny Alcoo-Test`
  4. `Les Mélodibroues`
  5. `Garfeeling`
  6. `Loups-Guru`
  7. `Bubly Ponge`
  8. `Justin Bieberon`
  9. `Kabusch et les Krashpoils`
  10. `Arc'teryx et Obétwist`
  11. `Tequila Spies`
  12. `Buzzball chasseur`
  13. `Pabst Patrouille`
  14. `Homme sur Bière`
  15. `Clope penguin`
  16. `Pokérhum`
  17. `Pabst-Partout`
  18. `Teletobeerz`
  19. `Busch Lightyear`
  20. `Babush Ice`
  21. `GOUV`
  22. `CO`
- **Dual-Tab Leaderboard System**:
  - **`[INDIVIDUAL]` Tab**: Displays individual player ranks (1st, 2nd, 3rd with gold, silver, bronze marker accents), runner names, team badges/names, and personal scores (Top `MAX_LEADERBOARD_ENTRIES`).
  - **`[TOP TEAMS]` Tab**: Displays overall team standings (Rank, Team Name, Total Combined Score of all team players in the Top 100, and Player Count).
- **Arcade Qualification Check**: On Game Over, `qualifiesForLeaderboard(score)` evaluates if the player's score qualifies using ALL stored entries:
  - If the board is **completely empty** (0 entries): any score qualifies at rank 1.
  - If the board has existing entries: qualifies **only if** `score > lowestExistingScore` (the score of the last entry currently on the board). Open cap slots do NOT automatically qualify a score.
  - If the board is full (`entries >= MAX_LEADERBOARD_ENTRIES`): additionally validates that `score > allScores[MAX_LEADERBOARD_ENTRIES - 1].score`.
- **Tie-Breaking Rule**: Higher score ranks better. If two entries have identical scores, the older entry is kept first, and the new score inserts _after_ existing identical scores.
- **Automatic Database Trimming**: Calling `submitHighScore(username, team, score)` inserts the entry with the selected team, calculates rank, and executes `deleteLowestScore()` to purge any entries exceeding `MAX_LEADERBOARD_ENTRIES`.
- Parity between online (Supabase) and offline (`localStorage` fallback) modes.

---

## UI Architecture & Design System

### Overview

All modal screens (Tutorial, Schedule, Leaderboard, Game Over) share a unified 3-tier overlay shell. This ensures consistent card framing, mobile safe-area handling, and pinned action buttons across the entire app.

### CSS Design Tokens (`:root`)

| Token                   | Value                              | Usage                    |
| ----------------------- | ---------------------------------- | ------------------------ |
| `--border-sketch`       | `2.5px solid var(--color-ink)`     | Standard ink border      |
| `--border-sketch-heavy` | `3px solid var(--color-ink)`       | Card/button outer border |
| `--shadow-sketch`       | `3px 3px 0px var(--color-ink)`     | Standard sketch shadow   |
| `--shadow-sketch-sm`    | `2.5px 2.5px 0px var(--color-ink)` | Small sketch shadow      |
| `--radius-card`         | `20px 14px 22px 16px`              | Outer modal card radius  |
| `--radius-inner`        | `12px`                             | Inner element radius     |
| `--radius-btn`          | `14px 10px 16px 12px`              | Button radius            |

### 3-Tier Overlay Shell

```text
.screen-overlay          ← position: absolute; inset: 0; height: 100%; safe-area padding; center alignment
  └── .modal-shell       ← flex column; max-width: 418px; max-height: 768px; margin: 0 auto;
                             (Exact same card geometry, borders, radius, bg, shadow as #main-menu)
        ├── .modal-header  ← flex-shrink: 0; titles, tabs, subtitles
        ├── .modal-body    ← flex: 1; min-height: 0; overflow-y: auto; scrollable content
        └── .modal-footer  ← flex-shrink: 0; back/action buttons (always visible)
```

**Rules:**

- All modal overlays (`#schedule-screen`, `#leaderboard-screen`, `#tutorial-screen`, `#game-over-screen`) must adhere to the **exact card geometry, width, and height constraints** established by the Home Screen (`#main-menu`).
- Safe-area inset padding is applied **once** on `.screen-overlay` via `env(safe-area-inset-*)` and `max(1rem, ...)`. Never set per-screen.
- `.screen-overlay` is constrained to `height: 100%` so it perfectly maps the bounds of the `#game-container` on desktop (which defines the 100dvh limit on mobile).
- Card styling (max dimensions, margin centering, border, border-radius, background, box-shadow) lives strictly in `.modal-shell`. Never duplicated per screen.
- `.modal-body` manages scrolling (`overflow-y: auto`, `-webkit-overflow-scrolling: touch`). Child containers (`tutorial-container`, `schedule-container`) do **not** set `overflow` or `max-height`.
- `.modal-footer` is always visible — never scrolls off on mobile.

**Exception — `#main-menu`:** Uses `.screen-overlay` directly with `justify-content: center` (centered layout, not a 3-tier modal). No `.modal-shell` wrapper, but matches the bounding boxes precisely via margins and calc.

### Button Token Hierarchy

| Class               | Role                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `.neon-btn.cyan`    | Primary CTA (start game, submit)                                                                |
| `.neon-btn.magenta` | Secondary emphasis (leaderboard)                                                                |
| `.neon-btn.outline` | Neutral/back actions                                                                            |
| `.neon-btn.yellow`  | Highlighted variant                                                                             |
| `.btn-back`         | Applied to RETOUR buttons — enforces `min-height: 48px`, `max-width: 320px`, centered in footer |

### Mobile Safe Area

- `<meta name="viewport" content="..., viewport-fit=cover">` — required for `env(safe-area-inset-*)`.
- `height: 100vh; height: 100dvh;` — fallback + dynamic viewport height to prevent iOS Safari toolbar overlap.
- All safe-area insets applied on `.screen-overlay`:
  ```css
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  ```

---

## UI & Screen Flow

The game user interface is structured into notebook card modal overlays and an in-game HUD:

### Main Menu Screen (`#main-menu`)

- **Presenter Header**: The dual sponsor logos (Freddy Pizzeria and Crème Glacée en Folie) side-by-side, followed by the `"présentent..."` sub-header text and `C YINK UNE SEMAINE` title logo with sketchy marker fonts and bright primary accent fills.
- **Subtitle**: `"Survis à ta semaine d'intégration!"`
- **Controls & Instructions**: Visual summary of mobile swipe gestures ("Glisse vers le haut pour Sauter", "Glisse vers le bas pour Glisser") and action keys ("Appuie sur Espace pour lancer des ballons d'eau").
- **Action Buttons**:
  - **`JOUER`**: Initializes the game loop and transitions to the HUD overlay.
  - **`LEADERBOARD`**: Opens the global high scores leaderboard overlay.
  - **`HORAIRE`**: Opens the integration schedule screen / timetable modal overlay (`#schedule-screen`).
  - **`RÈGLES`**: Opens the tutorial screen / rules modal overlay (`#tutorial-screen`).

### Tutorial Screen / Modal (`#tutorial-screen`)

- **Accessibility & Navigation**: Accessible via the `RÈGLES` button on the Main Menu located directly under the Horaire button. Includes a prominent `RETOUR` button at the bottom returning smoothly to the Main Menu.
- **Notebook Modal Card Layout**: Designed as a concise, scrollable notebook modal card (`max-height: 80vh; overflow-y: auto;`) highlighting core gameplay mechanics and rewards using hand-drawn graphics and short descriptions in French:
  - **Prix & Récompenses (Freddy Pizzeria)**: Highlights prizes for 1st place individual runner (15$ promo code at Freddy Pizzeria) and winning team (15$ promo code draw).
  - **Commandes (Controls)**: Visual swipe & action icons:
    - Glisse Gauche/Droite pour changer de voie.
    - Glisse Haut pour Sauter.
    - Glisse Bas pour Glisser.
    - Tapoter l'écran (ou Espace) pour Lancer un Ballon d'eau.
  - **Obstacles & Hazards**:
    - **Boîte en Carton (Cardboard Box)**: Changer de voie.
    - **Haie de Crayon (Pencil Hurdle)**: Sauter par-dessus.
    - **Barre d'Encre (Ink Beam)**: Glisser en dessous.
    - **Cibles GOUV**: Les GOUVs s'approchent comme des obstacles ! Tapoter pour leur lancer un ballon d'eau (+250 pts). Si touché, vous perdez une vie.
  - **Pièces D'or (Coins) & Vies**: Ramasser les pièces (+100 pts). Vous avez 3 cœurs de vie.

### Schedule / Horaire Screen (`#schedule-screen`)

- **Accessibility & Navigation**: Accessible via the `HORAIRE` button on the Main Menu. Includes a prominent `RETOUR` button (`#schedule-back-btn`) at the bottom returning smoothly to the Main Menu.
- **Top-Level View Switcher**: A dual-tab switcher (`.schedule-main-tabs`) located directly beneath the hero header:
  - **`[HORAIRE]` (`#tab-schedule-view`)**: Default view showing the schedule category color legend, sticky weekday tabs, and interactive daily timelines.
  - **`[CODE VESTIMENTAIRE]` (`#tab-dresscode-view`)**: Isolated view displaying the daily clothing guidelines and notes; hides the category color legend.
- **Schedule Container & Hero Header**: Displays header `"Ta p'tite semaine d'intégration"`, subtitle `"Faculté de génie · Université de Sherbrooke"`, and category color legend (`#schedule-legend`):
  - **Accueil officiel** (Green leaf indicator `.dot.feuille`)
  - **Activités** (Yellow sun indicator `.dot.soleil`)
  - **Soirées** (Red strawberry indicator `.dot.fraise`)
- **Interactive Daily Schedule View (`#view-schedule`)**:
  - **Sticky Weekday Selector (`#schedule-tabs`)**: Pinned to the top of `.modal-body` during scroll with `position: sticky; top: 0; backdrop-filter: blur(4px);` to remain accessible across long day timelines.
  - **`LUN` (11 août - 🐸)**: Timeline featuring Accueil festif (7:00 – 8:30, Faculté de génie), Accueil facultaire (8:30 – 10:00, Salle Maurice-O'Bready), Kiosques des groupes & distribution des sacs (10:00 – 13:30, Studio de création), Rallye (16:30 – 18:00, Campus principal), Souper spaghetti du Café Chaos (18:00 – 20:00, Faculté de génie), and Marathon Monday (20:00 – minuit, P'tite Grenouille).
  - **`MAR` (1 sept. - 🧀)**: Timeline featuring Mardi détente (19:00 – 3:00, Bus departure from Faculté de génie) and free day notice for remaining hours.
  - **`MER` (2 sept. - 🎭)**: Timeline featuring Souper de la doyenne (16:30 – 18:30, Faculté de génie) and Spectacle de la rentrée de la FEUS (19:00 – 23:00, Campus principal).
  - **`JEU` (3 sept. - 🎈)**: Timeline featuring Activités propres (9:30 – 11:00, Departure Faculté de génie), Dîner (11:00 – 12:00), Activités sales (12:00 – 14:00, Campus principal), and 5 à 8 (17:00 – 20:00, Faculté de génie).
- **Isolated Dress Code View (`#view-dresscode`)**: Daily clothing cards for Lundi (clothes to get dirty), Mardi (yoga clothes), Mercredi (clean clothes), and Jeudi (swimsuit under costume, evening attire for school photo). Hidden by default when viewing the main schedule.

### In-Game HUD (`#hud-overlay`)

- **Score Display**: `SCORE` 6-digit zero-padded score counter (e.g. `001250`) rendered on a lined paper badge.
- **Health Indicator**: `VIES` header with 3 hand-drawn crayon heart elements transitioning from bright red fill to empty sketch outline on damage.
- **Damage Flash**: `#damage-flash` overlay element that flashes red on obstacle collision alongside canvas screen shake.

### Dual-State Game Over Screen (`#game-over-screen`)

- **Modal Fit & Layout**: Centered vertically inside `#game-over-screen` with `max-height: 90vh; overflow-y: auto;` and compact touch-friendly padding (`12px 20px` for buttons and input fields). Headers are contained strictly inside the modal card borders.
- **Arcade Qualification Check**: On Game Over, `qualifiesForLeaderboard(finalScore)` determines which substate to display:
  - Reads ALL stored entries to determine the true total count.
  - **Capacity Check** (`scores.length < MAX_LEADERBOARD_ENTRIES`): If the total number of recorded scores is less than `MAX_LEADERBOARD_ENTRIES`, the player automatically qualifies (as long as `score > 0`).
  - **Threshold Check** (`scores.length >= MAX_LEADERBOARD_ENTRIES`): If the leaderboard is full, the player qualifies ONLY IF `score > lowestScore` (where `lowestScore` is the score of the entry at index `MAX_LEADERBOARD_ENTRIES - 1`).
- **State 1 – Regular Game Over (Not Qualified)**:
  - Displayed when the leaderboard is full and the final score does NOT beat the current lowest leaderboard entry.
  - Hides `#game-over-highscore` completely and skips the name entry form and rank badge.
  - Displays header "GAME OVER", score label "SCORE FINAL", final score, and action buttons: primary button `[RÉESSAYER]` (full width), `[MENU PRINCIPAL]`, and `[LEADERBOARD]`.

- **State 2 – New High Score Prompt (Qualified)**:
  - Displayed when `scores.length < MAX_LEADERBOARD_ENTRIES` OR when the final score beats the current lowest leaderboard entry (`score > lowestScore`).
  - Hides `#game-over-regular` completely and displays header "GOD DAMM!", subtitle "Ahh ouais pas mal le score", a compact combined header badge (`RANG #X • SCORE: 001250`), and score submission form (`#score-submit-form`).
  - **Form Requirements**: Requires both **Runner Name** (input field `#username` with label "ENTRE TON NOM" and placeholder "JOUEUR 1", 2–12 characters, uppercase/trimmed) and **Team Selection** (styled `<select id="team-select" required>` dropdown with label "SÉLECTIONNE TON ÉQUIPE" populated with the 22 orientation teams including `GOUV` and `CO`).
  - **Primary Action Button**: `[TU FLEX, TU BOIS]` (Submits score and transitions to Leaderboard).
  - **Secondary Actions (below form)**:
    - `[RÉESSAYER SANS ENREGISTRER]` (`#skip-submit-retry-btn`): Retries run immediately without submitting score.
    - `[MENU PRINCIPAL]` (`#skip-submit-menu-btn`): Returns to Main Menu without submitting score.
  - Upon submission, displays `✔ SCORE SOUMIS !` and automatically transitions to the Leaderboard Screen with the player's new entry highlighted.

### Leaderboard Screen (`#leaderboard-screen`)

- **Vertical Spacing & Layout**: `#leaderboard-screen` is configured as a flex container (`flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; padding: 1.5rem 1rem;`). The `.screen-title` ("LES TRYHARDs") stays firmly at the top, tab toggles (`#tab-individual` and `#tab-teams`) sit directly below, `#leaderboard-back-btn` is pinned cleanly at the bottom, and `.leaderboard-table-container` fills the spacious center (`flex: 1; min-height: 50vh; width: 100%; overflow-y: auto; margin: 0.75rem 0;`).
- **Dual-Tab System**:
  - `[INDIVIDUEL]` Tab: Displays top runner scores (`#`, `NEUVE`, `ÉQUIPE`, `SCORE`, up to `MAX_LEADERBOARD_ENTRIES`).
  - `[ÉQUIPES]` Tab: Displays team rankings (`#`, `ÉQUIPE`, `MEMBRES`, `POINTS TOTAL`), computing total points and runner count per team from the leaderboard dataset.
- **Rankings Table & Styling**: Formatted with rank numbers (1st, 2nd, 3rd highlighted with gold, silver, bronze marker accents). Styled with a subtle paper card background, notebook border line, custom sketch scrollbar, and notebook button tab toggles. Newly submitted scores are highlighted with a gold marker stroke background.
- **Navigation**: `RETOUR` button returning smoothly to the Main Menu.

---

## Centralized Audio System Architecture

Doodle Runner features a deterministic, production-ready Web Audio pipeline managed by a central `AudioManager` ([audio.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/audio.js)) with support from `loadAudioAssets` in [assets.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/assets.js).

### Single AudioContext Lifecycle

- **Single Global Context**: Created once and reused across the application. Gameplay code never instantiates new `AudioContext` or audio nodes directly.
- **Autoplay & Mobile Unlock**: Global event listeners on `pointerdown`, `keydown`, `touchstart`, and `click` automatically resume the `AudioContext` on the first user gesture to comply with browser autoplay restrictions.
- **Universal Gesture Re-Unlocking**: Unlock listeners are bound to `document.body` (with `capture: true, passive: true`) rather than just `window`, ensuring DOM interactions inside overlay screens (such as clicking leaderboard tabs `#tab-individual` / `#tab-teams`, submitting the high-score form, or selecting the team dropdown `#team-select`) correctly propagate to the unlock handler and awaken suspended audio contexts. A redundant global resume binding on `document` level in `main.js` provides an additional safety net by calling `audioManager.resume()` on any `pointerdown`, `touchstart`, `click`, or `keydown` event across the entire page.
- **Play-Time Resume Guard**: Inside `play(soundName)`, if `ctx.state === 'suspended'`, `ctx.resume()` is called and sound scheduling is deferred via `.then()` until the context transitions to `'running'`, preventing silently discarded nodes.
- **Tab Visibility Handling**: A `visibilitychange` listener resumes the suspended `AudioContext` when returning to an active browser tab.

### Overlay Event Isolation Policy

- UI event listeners on the leaderboard screen (e.g. tab buttons `#tab-individual`, `#tab-teams`, `#leaderboard-back-btn`) and Game Over form inputs **MUST NOT** call `e.stopPropagation()` in ways that would prevent global audio unlock listeners (bound with `capture: true`) from catching user gestures. All current overlay handlers are verified clean of propagation blocking.

### Custom Sound Preloading & Dual-Engine Playback Pipeline

- **Audio Buffer Preloader**: `AudioManager` preloads custom sound files (`/assets/coin.mp3`, `/assets/jump.mp3`, `/assets/slide.mp3`, `/assets/hit.mp3`, `/assets/shoot.mp3`, `/assets/destroy.mp3`, `/assets/click.mp3`, `/assets/gameOver.mp3`, `/assets/bgm.mp3`, `/assets/gouv_alarm.mp3`).
- **Primary Playback Engine (`AudioBufferSourceNode`)**: When a sound is triggered (e.g. `audioManager.play('coin')`), `AudioManager` checks if a preloaded `AudioBuffer` exists in its buffer cache. If available, it instantiates an `AudioBufferSourceNode`, routes it through the sound's gain mix to `masterGain`, and plays the custom audio file.
- **Procedural Synthesis Fallback**: If a custom sound file is missing (404), fails to fetch, or fails decoding, the buffer entry remains `null`. `AudioManager` gracefully falls back to synthesized Web Audio API procedural sound generators (`OscillatorNode`, `BiquadFilterNode`, `GainNode`).

### Background Music (BGM) & GOUV Target Audio

- **Background Music (`bgm.mp3`)**: Optional looping background track loaded from `public/assets/bgm.mp3`. Managed via a dedicated `bgmGain` node (default volume `0.3`) connected to `masterGain`. If the file is missing from assets, BGM playback is skipped silently via `playBGM()` without throwing errors or playing fallback noise.
- **BGM Lifecycle Rules**:
  - **Active Playing State**: BGM starts playing strictly when the game transitions into the active playing loop (when the player clicks `JOUER` / `START DASH` or `RÉESSAYER` / `RETRY RUN` via `game.start()`).
  - **Game Over / Menu States**: BGM stops immediately as soon as the Game Over state is triggered (`game.stop()`) or when navigating to the Main Menu (`#main-menu`) or Leaderboard Screen (`#leaderboard-screen`) via `audioManager.stopBGM()`.
- **GOUV Warning Sound (`gouv_alarm.mp3` or synthesized alarm tone)**: A looping warning alarm (`startGouvSound()`) that plays at standard fixed volume as soon as a GOUV target spawns on track. The loop stops immediately (`stopGouvSound()`) when the GOUV target is hit by a water balloon or moves past the bottom of the screen.

### Master Mixer & Volumes

All sound channels route through a central `MasterGain` node:

- **Master Gain**: Default `0.5` (supports global mute toggle).
- **Sub-Mix Gain Nodes**: `bgmGain` (volume `0.3`) and `targetGain` (fixed GOUV alarm volume `0.4`).
- **Sound-Specific Mix Volumes**:
  - `coin`: 0.25 (dual-tone upward sweep D5 -> A5 in fallback)
  - `jump`: 0.35 (upward pitch slide 150 Hz -> 420 Hz in fallback)
  - `slide`: 0.30 (lowpass filtered triangle swoop 600 Hz -> 150 Hz in fallback)
  - `hit`: 0.50 (low impact pitch dive and crunch in fallback)
  - `shoot`: 0.30 (rapid high-frequency laser sweep in fallback)
  - `destroy`: 0.45 (heavy impact crunch in fallback)
  - `gameOver`: 0.60 (descending 3-note bass tone in fallback)
  - `click`: 0.20 (crisp UI button click in fallback)
  - `bgm`: 0.30 (looping music track)
  - `gouv_alarm`: 0.40 (standard fixed alarm volume)

### Sound Cooldowns & Node Memory Management

- **Cooldown Policy**: Minimum replay intervals prevent audio choking and overlap stuttering during rapid gameplay events:
  - `coin`: 45ms
  - `click`: 50ms
  - `shoot`: 80ms
  - `jump`: 100ms
  - `slide`: 100ms
  - `destroy`: 100ms
  - `hit`: 150ms
  - `gameOver`: 500ms
- **Self-Cleaning Nodes**: Temporary audio nodes (`AudioBufferSourceNode`, `OscillatorNode`, `GainNode`, `BiquadFilterNode`) schedule playback using `ctx.currentTime` and automatically disconnect themselves in `onended` handlers to prevent memory leaks.
- **Audio Node Lifecycle Safety**: All audio node creation and playback methods (`playAudioBuffer`, `createCoinSound`, `createJumpSound`, `playBGM`, `startGouvSound`, `stopGouvSound`, etc.) are wrapped in `try...catch` blocks. If a sound buffer, context state, or Web Audio node operation fails temporarily, the error is logged via `console.warn` and the game loop continues uninterrupted.
- **Debug Mode**: Exposes `AUDIO_DEBUG` toggle and `audioManager.setDebug(true)` for console logging context state, sound play requests, buffer vs fallback usage, resume events, and cooldown skips.

---

## Code Structure & Architecture

The application follows a modular architecture using ES modules for clean separation of concerns:

- **`src/perspective.js`**: Central 3D perspective projection module exporting `projectPosition` and `projectLane` mapping 3D world coordinates `(posX/lane, worldY, z)` to 2D canvas screen coordinates.
- **`src/assets.js`**: Image asset preloader module loading static images from `public/assets/` (`player.png`, `barrier.png`, `hurdle.png`, `beam.png`, `obstacle.png`, `coin.png`, `background.png`, `gouv.png`) with graceful error handling that falls back to procedural doodle rendering if images are missing.
- **`src/player.js`**: `Player` class managing player lane state, smooth horizontal interpolation, jump/slide physics, and hand-drawn paper airplane / doodle chevron canvas rendering.
- **`src/obstacles.js`**: `ObstacleManager` class managing procedural hazard spawning (Cardboard Box, Pencil Hurdle, Ink Beam, GOUV target), 3D perspective scaling math, and hand-drawn sketch canvas rendering.
- **`src/collectibles.js`**: `CoinManager` class managing coin/star pattern generation, spinning star animations, pickup collection checks, Web Audio sound synthesis, crayon particle explosions, and custom image rendering.
- **`src/ui.js`**: UI helper module managing HUD score displays, hand-drawn crayon heart indicators, screen shake transforms, damage screen flashes, notebook screen overlay transitions (Main Menu, HUD, Leaderboard, Tutorial, Schedule, Game Over), and leaderboard DOM updates.
- **`src/game.js`**: Main `Game` orchestrator managing asset preloading, the `requestAnimationFrame` loop, delta time calculations, notebook background/doodle sun/pencil grid rendering, module coordination, water balloon projectiles, and collision checks.

### Game Loop Architecture (`src/game.js`)

#### Delta-Time Clamping

The `loop(time)` method guards against massive time spikes caused by tab suspension, browser throttling, or debugger pauses:

```javascript
// Clamp dt to 100 ms — prevents spawn-timer skip and instant despawns after resume
const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
```

| Guard | Value | Effect |
|-------|-------|--------|
| `Math.min(rawDt, 0.1)` | 100 ms cap | Physics, spawn timers, and score accumulation never advance more than one tenth of a second per frame |

#### Tab-Resume Reset (`visibilitychange`)

A `visibilitychange` listener is registered in the `Game` constructor and cleaned up in `stop()`:

```javascript
this._onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    this.lastTime = 0; // re-seeded to `time` on the next rAF tick
  }
};
```

When the browser returns from a backgrounded/suspended state, `lastTime` is reset to `0`. The `loop()` method detects this sentinel value, seeds `lastTime` from the fresh `time` argument without calling `update()`, and only begins normal simulation on the subsequent frame. This prevents a single enormous `dt` from advancing the spawn timer and despawning large numbers of obstacles at once.
- **`src/input.js`**: `InputHandler` managing keyboard and mobile touch swipe / stationary tap input events.
- **`src/audio.js`**: `AudioManager` class and singleton instance managing Web Audio synthesis, single `AudioContext` lifecycle, master mixer gain nodes, sound cooldowns, and mobile gesture unlocking.
- **`src/supabase.js`**: Supabase API client with local storage fallback for leaderboard operations. Defines and exports `MAX_LEADERBOARD_ENTRIES` constant (default `100`) governing global leaderboard entry limits across database queries, qualification checks, local storage slicing, and UI rendering. Also exports `INTEGRATION_TEAMS` (22 teams including `GOUV` and `CO`).
- **`src/main.js`**: Application entrypoint initializing DOM events, game instance, DPR-aware responsive canvas scaling (with `resize` and `orientationchange` listeners), tab toggles, schedule day switching, and screen management.

---

## Responsive Design & Device Compatibility

The game is designed as **mobile-first** and must run cleanly on all viewport sizes from 320px-wide phones (iPhone SE original) to modern large-screen devices.

### Dynamic Viewport Sizing (`100dvh`)

- All full-screen containers (`body`, `#game-container`, `.screen-overlay`) use `height: 100dvh` with a `100vh` fallback to correctly fill the visual viewport on iOS/Android where the browser chrome (address bar, bottom nav) shrinks the effective height at runtime.
- Modal shells use `max-height: min(768px, calc(100dvh - 2rem))` to ensure they never overflow the visible viewport on short screens.
- On very narrow screens (`max-width: 380px`), modals tighten further to `max-height: calc(100dvh - 1rem)`.

### High-DPI Canvas Scaling (DPR Capping)

Implemented in `src/main.js` — `resizeCanvas()`:

```javascript
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width  = Math.round(cssWidth  * dpr);
canvas.height = Math.round(cssHeight * dpr);
ctx.scale(dpr, dpr);
```

- **DPR cap at 2.0**: Prevents the backing buffer from ballooning on 3× / 4× screens (some high-end Android devices), which would cause significant GPU memory and fill-rate overhead with no perceptible visual benefit.
- The context is re-scaled each resize so all Game draw calls continue to use CSS-pixel coordinates without modification.
- Game sub-module logical sizes (`width`, `height`, `horizonY`) are updated in-place after each resize so perspective calculations stay correct.

### Orientation & Resize Listener

```javascript
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 150); // 150ms delay lets browser finish rotating
});
```

Both `resize` and `orientationchange` events trigger canvas recalibration so the game adjusts to landscape/portrait switches and split-screen resizing without requiring a page reload.

### Safe-Area Insets

`.screen-overlay` padding uses `env(safe-area-inset-*)` with a `1rem` floor value to avoid UI content sitting under notches, Dynamic Island cutouts, or home-indicator bars:

```css
padding-top:    max(1rem, env(safe-area-inset-top));
padding-bottom: max(1rem, env(safe-area-inset-bottom));
padding-left:   max(1rem, env(safe-area-inset-left));
padding-right:  max(1rem, env(safe-area-inset-right));
```

### Fluid Typography (`clamp()`)

All major text elements scale fluidly between a min and max size using CSS `clamp()`:

| Element | Rule |
|---------|------|
| `.game-title` | `clamp(2rem, 8vw, 3.2rem)` |
| `.game-title .highlight` | `clamp(2.1rem, 8.5vw, 3.4rem)` |
| `.game-subtitle` | `clamp(0.9rem, 3.5vw, 1.15rem)` |
| `.screen-title` | `clamp(1.5rem, 5vw, 2.1rem)` |
| `.sponsor-logo` height | `clamp(85px, 12vh, 120px)` |

This ensures text never breaks out of modal boundaries on narrow screens while remaining large and readable on modern devices.

### Screen Breakpoint Strategy

| Breakpoint | Target Devices | Key Adjustments |
|------------|----------------|-----------------|
| `max-height: 700px` | Landscape phones, iPhone SE, short Android viewports | Reduced sponsor logo heights, tighter button gaps, compressed modal padding, smaller title sizes |
| `max-width: 380px` | iPhone SE (1st/2nd gen, 320–375px), narrow Androids | Tighter sponsor logos, narrower `menu-actions` max-width, smaller button text, tighter modal max-height |
| `max-height: 600px` | Very short landscape views | Most aggressive compression — nearly all spacings and font sizes further reduced |

### Touch Behavior Guardrails & Adaptive Tables

- **Leaderboard Table (`.leaderboard-table`)**: Strict `table-layout: fixed; width: 100%` with exact column percentage allocations (`col-rank`, `col-name`, `col-team`, `col-members`, `col-score`) and text ellipsis truncation. Combined with `overflow-x: hidden` on `.leaderboard-table-container`, horizontal scrollbars are eliminated entirely while maintaining smooth vertical scrolling.
- **Canvas** (`#game-canvas`): `touch-action: none` — prevents iOS elastic bounce, overscroll, and accidental pinch-zoom on the active gameplay surface.
- **Modal bodies** (`.modal-body`): `touch-action: pan-y` + `-webkit-overflow-scrolling: touch` — allows native momentum scrolling for rules, schedule, and leaderboard content while blocking horizontal drift that could interfere with swipe-based game input.
- **Schedule day tabs**: `-webkit-tap-highlight-color: transparent` for clean, no-flash tap feedback.

---

## Verification Plan

### Automated Verification

1. Vite production build validation (`npm run build`).
2. Syntax check across all ES modules.

### Manual Verification

1. **Swipe & Keyboard Interaction**: Test horizontal touch swiping on simulated mobile viewports via DevTools, and arrow/WASD keys on desktop.
2. **Leaderboard Operations**: Reading and inserting scores into Supabase database with local storage fallback.
3. **Responsive Visuals**: Verify layout scaling from standard mobile screens up to tablet and desktop viewports with the new sketchbook aesthetic.
