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
  - **GOUV Target** *(special shootable hazard)*: A hot-pink/magenta target that can be **destroyed by a laser shot** for bonus points, or avoided. If not destroyed before reaching the player, it triggers a normal collision (−1 life, screen flash/shake, hit sound).

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

### Lanes & Perspective

- The perspective vanishing point/horizon is pushed high up the screen to **Y = 17%** (1/6th) of the total height.
- Consequently, the three lanes extend down to the bottom, occupying **5/6th (≈83%)** of the total canvas height.
- The track grid is rendered using graphite pencil sketch lines with organic hand-drawn line jitter.

### Scoreboard & High Scores (Arcade Leaderboard System)

- Score automatically increases continuously over time as the player survives (accumulating at a rate of +10 points per second elapsed) plus +100 points for collected coins.
- **Centralized Limit Configuration (`MAX_LEADERBOARD_ENTRIES`)**: The maximum number of entries displayed and stored on the global leaderboard is governed globally by the exported constant `MAX_LEADERBOARD_ENTRIES` (default `20` in `src/supabase.js`). Changing this single value scales the leaderboard limit across database queries, local storage fallbacks, qualification logic, and UI rendering.
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
- **20 Integration Teams**:
  Players select their orientation team from a custom list of 20 orientation teams (`INTEGRATION_TEAMS` exported from `src/supabase.js`):
  1. `Schtroumpfettes Pompettes`
  2. `Passe-MontAngine de Poitrine`
  3. `Johnny Alcooo-Test`
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
- **Dual-Tab Leaderboard System**:
  - **`[INDIVIDUAL]` Tab**: Displays individual player ranks (1st, 2nd, 3rd with gold, silver, bronze marker accents), runner names, team badges/names, and personal scores (Top `MAX_LEADERBOARD_ENTRIES`).
  - **`[TOP TEAMS]` Tab**: Displays overall team standings (Rank, Team Name, Total Combined Score of all team players in the Top 20, and Player Count).
- **Arcade Qualification Check**: On Game Over, `qualifiesForLeaderboard(score)` evaluates if the player's score qualifies using ALL stored entries:
  - If the board is **completely empty** (0 entries): any score qualifies at rank 1.
  - If the board has existing entries: qualifies **only if** `score > lowestExistingScore` (the score of the last entry currently on the board). Open cap slots do NOT automatically qualify a score.
  - If the board is full (`entries >= MAX_LEADERBOARD_ENTRIES`): additionally validates that `score > allScores[MAX_LEADERBOARD_ENTRIES - 1].score`.
- **Tie-Breaking Rule**: Higher score ranks better. If two entries have identical scores, the older entry is kept first, and the new score inserts *after* existing identical scores.
- **Automatic Database Trimming**: Calling `submitHighScore(username, team, score)` inserts the entry with the selected team, calculates rank, and executes `deleteLowestScore()` to purge any entries exceeding `MAX_LEADERBOARD_ENTRIES`.
- Parity between online (Supabase) and offline (`localStorage` fallback) modes.

---

## UI & Screen Flow

The game user interface is structured into notebook card modal overlays and an in-game HUD:

### Main Menu Screen (`#main-menu`)
- **Title Banner**: `C YINK UNE SEMAINE` logo with sketchy marker fonts and bright primary accent fills.
- **Subtitle**: `"Survie a ta semaine d'intégration!"`
- **Controls & Instructions**: Visual summary of mobile swipe gestures ("Glisse vers le haut pour Sauter", "Glisse vers le bas pour Glisser") and action keys ("Appuie sur Espace pour lancer des ballons d'eau").
- **Action Buttons**:
  - **`JOUER`**: Initializes the game loop and transitions to the HUD overlay.
  - **`LEADERBOARD`**: Opens the global high scores leaderboard overlay.
  - **`RÈGLES`**: Opens the tutorial screen / rules modal overlay (`#tutorial-screen`).

### Tutorial Screen / Modal (`#tutorial-screen`)
- **Accessibility & Navigation**: Accessible via the `RÈGLES` button on the Main Menu located directly under the Leaderboard button. Includes a prominent `RETOUR` button at the bottom returning smoothly to the Main Menu.
- **Notebook Modal Card Layout**: Designed as a concise, scrollable notebook modal card (`max-height: 80vh; overflow-y: auto;`) highlighting core gameplay mechanics using hand-drawn graphics and short descriptions in French:
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
  - **Form Requirements**: Requires both **Runner Name** (input field `#username` with label "ENTRE TON NOM" and placeholder "JOUEUR 1", 2–12 characters, uppercase/trimmed) and **Team Selection** (styled `<select id="team-select" required>` dropdown with label "SÉLECTIONNE TON ÉQUIPE" populated with the orientation teams).
  - **Primary Action Button**: `[TU FLEX, TU BOIS]` (Submits score and transitions to Leaderboard).
  - **Secondary Actions (below form)**:
    - `[RÉESSAYER SANS ENREGISTRER]` (`#skip-submit-retry-btn`): Retries run immediately without submitting score.
    - `[MENU PRINCIPAL]` (`#skip-submit-menu-btn`): Returns to Main Menu without submitting score.
  - Upon submission, displays `✔ SCORE SOUMIS !` and automatically transitions to the Leaderboard Screen with the player's new entry highlighted.

### Leaderboard Screen (`#leaderboard-screen`)
- **Vertical Spacing & Layout**: `#leaderboard-screen` is configured as a flex container (`flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; padding: 1.5rem 1rem;`). The `.screen-title` ("LES TRYHARDs") stays firmly at the top, tab toggles (`#tab-individual` and `#tab-teams`) sit directly below, `#leaderboard-back-btn` is pinned cleanly at the bottom, and `.leaderboard-table-container` fills the spacious center (`flex: 1; min-height: 50vh; width: 100%; overflow-y: auto; margin: 0.75rem 0;`).
- **Dual-Tab System**:
  - `[INDIVIDUEL]` Tab: Displays top 20 runner scores (`#`, `NEUVE`, `ÉQUIPE`, `SCORE`).
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
- **`src/assets.js`**: Image asset preloader module loading static images from `public/assets/` (`player.png`, `barrier.png`, `hurdle.png`, `beam.png`, `obstacle.png`, `coin.png`, `background.png`) with graceful error handling that falls back to procedural doodle rendering if images are missing.
- **`src/player.js`**: `Player` class managing player lane state, smooth horizontal interpolation, jump/slide physics, and hand-drawn paper airplane / doodle chevron canvas rendering.
- **`src/obstacles.js`**: `ObstacleManager` class managing procedural hazard spawning (Cardboard Box, Pencil Hurdle, Ink Beam), 3D perspective scaling math, and hand-drawn sketch canvas rendering.
- **`src/collectibles.js`**: `CoinManager` class managing coin/star pattern generation, spinning star animations, pickup collection checks, Web Audio sound synthesis, crayon particle explosions, and custom image rendering.
- **`src/ui.js`**: UI helper module managing HUD score displays, hand-drawn crayon heart indicators, screen shake transforms, damage screen flashes, notebook screen overlay transitions, and leaderboard DOM updates.
- **`src/game.js`**: Main `Game` orchestrator managing asset preloading, the `requestAnimationFrame` loop, delta time calculations, notebook background/doodle sun/pencil grid rendering, module coordination, and collision checks.
- **`src/input.js`**: `InputHandler` managing keyboard and mobile touch swipe input events.
- **`src/audio.js`**: `AudioManager` class and singleton instance managing Web Audio synthesis, single `AudioContext` lifecycle, master mixer gain nodes, sound cooldowns, and mobile gesture unlocking.
- **`src/supabase.js`**: Supabase API client with local storage fallback for leaderboard operations. Defines and exports `MAX_LEADERBOARD_ENTRIES` constant governing global leaderboard entry limits across database queries, qualification checks, local storage slicing, and UI rendering.
- **`src/main.js`**: Application entrypoint initializing DOM events, game instance, responsive canvas scaling, and screen management.

---

## Verification Plan

### Automated Verification

1. Vite production build validation (`npm run build`).
2. Syntax check across all ES modules.

### Manual Verification

1. **Swipe & Keyboard Interaction**: Test horizontal touch swiping on simulated mobile viewports via DevTools, and arrow/WASD keys on desktop.
2. **Leaderboard Operations**: Reading and inserting scores into Supabase database with local storage fallback.
3. **Responsive Visuals**: Verify layout scaling from standard mobile screens up to tablet and desktop viewports with the new sketchbook aesthetic.
