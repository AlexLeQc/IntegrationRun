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
- Hazards are divided into **three categorized types**:
  - **Hand-Drawn Cardboard Box**: 3D cardboard box with marker outlines, tape strips, and warm brown fill requiring a lane change.
  - **Pencil Fence / Hurdle**: Low-profile wooden pencil hurdle requiring a **Jump** (collision is bypassed if player is currently jumping).
  - **Ink-Splatter Beam Arch**: Overhead laser arch styled as dark ink pillars and a vibrant splattered ink bar requiring a **Slide** (collision is bypassed if player is currently sliding).
- Colliding with an obstacle decreases the player's life count and destroys the obstacle.
- The spawn rate and speed gradually increase as the player's score increases.

### Lanes & Perspective

- The perspective vanishing point/horizon is pushed high up the screen to **Y = 17%** (1/6th) of the total height.
- Consequently, the three lanes extend down to the bottom, occupying **5/6th (≈83%)** of the total canvas height.
- The track grid is rendered using graphite pencil sketch lines with organic hand-drawn line jitter.

### Scoreboard & High Scores (Arcade Leaderboard System)

- Score automatically increases continuously over time as the player survives (accumulating at a rate of +10 points per second elapsed) plus +100 points for collected coins.
- **Centralized Limit Configuration (`MAX_LEADERBOARD_ENTRIES`)**: The maximum number of entries displayed and stored on the global leaderboard is governed globally by the exported constant `MAX_LEADERBOARD_ENTRIES` (default `20` in `src/supabase.js`). Changing this single value scales the leaderboard limit across database queries, local storage fallbacks, qualification logic, and UI rendering.
- **Arcade Qualification Check**: On Game Over, `qualifiesForLeaderboard(score)` evaluates if the player's score qualifies using ALL stored entries:
  - If the board is **completely empty** (0 entries): any score qualifies at rank 1.
  - If the board has existing entries: qualifies **only if** `score > lowestExistingScore` (the score of the last entry currently on the board). Open cap slots do NOT automatically qualify a score.
  - If the board is full (`entries >= MAX_LEADERBOARD_ENTRIES`): additionally validates that `score > allScores[MAX_LEADERBOARD_ENTRIES - 1].score`.
- **Tie-Breaking Rule**: Higher score ranks better. If two entries have identical scores, the older entry is kept first, and the new score inserts *after* existing identical scores.
- **Automatic Database Trimming**: Calling `submitHighScore(name, score)` inserts the entry, calculates rank, and executes `deleteLowestScore()` to purge any entries exceeding `MAX_LEADERBOARD_ENTRIES`.
- Parity between online (Supabase) and offline (`localStorage` fallback) modes.

---

## UI & Screen Flow

The game user interface is structured into notebook card modal overlays and an in-game HUD:

### Main Menu Screen (`#main-menu`)
- **Title Banner**: Doodle Runner logo with sketchy marker fonts and bright primary accent fills.
- **Controls & Instructions**: Visual summary of mobile swipe gestures (Swipe Left/Right, Swipe Up to Jump, Swipe Down to Slide) and desktop keys (Arrow keys / WASD).
- **Action Buttons**:
  - **`START DASH`**: Initializes the game loop and transitions to the HUD overlay.
  - **`SKETCHBOOK`**: Opens the global high scores leaderboard overlay.

### In-Game HUD (`#hud-overlay`)
- **Score Display**: 6-digit zero-padded score counter (e.g. `001250`) rendered on a lined paper badge.
- **Health Indicator**: 3 hand-drawn crayon heart elements transitioning from bright red fill to empty sketch outline on damage.
- **Damage Flash**: `#damage-flash` overlay element that flashes red on obstacle collision alongside canvas screen shake.

### Dual-State Game Over Screen (`#game-over-screen`)

- **Modal Fit & Layout**: Centered vertically inside `#game-over-screen` with `max-height: 90vh; overflow-y: auto;` and compact touch-friendly padding (`12px 20px` for buttons and input fields). Headers are contained strictly inside the modal card borders.
- **Arcade Qualification Check**: On Game Over, `qualifiesForLeaderboard(finalScore)` determines which substate to display:
  - Reads ALL stored entries to determine the true total count and current lowest score.
  - Qualifies if board is empty OR `finalScore > lowestExistingScore` (open cap slots do NOT qualify a score by themselves).
- **State 1 – Regular Game Over (Not Qualified)**:
  - Displayed when final score does NOT beat the current lowest leaderboard entry.
  - Hides `#game-over-highscore` completely and skips the name entry form and rank badge.
  - Displays header "GAME OVER", final score, and action buttons in a 2-tier layout: top primary button `[RETRY RUN]` (full width) and bottom row container (`.button-row`) with `[MAIN MENU]` and `[SKETCHBOOK]` side-by-side.

- **State 2 – New High Score Prompt (Qualified)**:
  - Displayed ONLY when final score beats the current lowest leaderboard entry.
  - Hides `#game-over-regular` completely and displays header "NEW HIGH SCORE!", a compact combined header badge (`RANK #X • SCORE: 001250`), and name entry form (2–12 characters, uppercase/trimmed).
  - Upon submission, displays `✔ SCORE SUBMITTED!` and automatically transitions to the Leaderboard Screen with the player's new entry highlighted.

### Leaderboard Screen (`#leaderboard-screen`)
- **Vertical Spacing & Layout**: `#leaderboard-screen` is configured as a flex container (`flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; padding: 1.5rem 1rem;`). The `.screen-title` stays firmly at the top, `#leaderboard-back-btn` is pinned cleanly at the bottom, and `.leaderboard-table-container` fills the spacious center (`flex: 1; min-height: 55vh; width: 100%; overflow-y: auto; margin: 1rem 0;`).
- **Rankings Table & Styling**: Top 20 high score records formatted with rank numbers (1st, 2nd, 3rd highlighted with gold, silver, bronze marker accents), runner names, and numeric scores. Table rows feature expanded padding (`padding: 10px 12px`) and larger font sizes to fill vertical card height comfortably without looking tiny or cramped. Styled with a subtle paper card background, notebook border line, and custom sketch scrollbar. Newly submitted scores are highlighted with a gold marker stroke background.
- **Navigation**: `BACK` button returning smoothly to the Main Menu.

---

## Centralized Audio System Architecture

Doodle Runner features a deterministic, production-ready Web Audio pipeline managed by a central `AudioManager` ([audio.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/audio.js)) with support from `loadAudioAssets` in [assets.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/assets.js).

### Single AudioContext Lifecycle

- **Single Global Context**: Created once and reused across the application. Gameplay code never instantiates new `AudioContext` or audio nodes directly.
- **Autoplay & Mobile Unlock**: Global event listeners on `pointerdown`, `keydown`, `touchstart`, and `click` automatically resume the `AudioContext` on the first user gesture to comply with browser autoplay restrictions.
- **Tab Visibility Handling**: A `visibilitychange` listener resumes the suspended `AudioContext` when returning to an active browser tab.

### Custom Sound Preloading & Dual-Engine Playback Pipeline

- **Audio Buffer Preloader**: `AudioManager` preloads custom sound files (`/assets/coin.mp3`, `/assets/jump.mp3`, `/assets/slide.mp3`, `/assets/hit.mp3`, `/assets/shoot.mp3`, `/assets/destroy.mp3`, `/assets/click.mp3`, `/assets/gameOver.mp3`).
- **Primary Playback Engine (`AudioBufferSourceNode`)**: When a sound is triggered (e.g. `audioManager.play('coin')`), `AudioManager` checks if a preloaded `AudioBuffer` exists in its buffer cache. If available, it instantiates an `AudioBufferSourceNode`, routes it through the sound's gain mix to `masterGain`, and plays the custom audio file.
- **Procedural Synthesis Fallback**: If a custom sound file is missing (404), fails to fetch, or fails decoding, the buffer entry remains `null`. `AudioManager` gracefully falls back to synthesized Web Audio API procedural sound generators (`OscillatorNode`, `BiquadFilterNode`, `GainNode`).

### Master Mixer & Volumes

All sound channels route through a central `MasterGain` node:
- **Master Gain**: Default `0.5` (supports global mute toggle).
- **Sound-Specific Mix Volumes**:
  - `coin`: 0.25 (dual-tone upward sweep D5 -> A5 in fallback)
  - `jump`: 0.35 (upward pitch slide 150 Hz -> 420 Hz in fallback)
  - `slide`: 0.30 (lowpass filtered triangle swoop 600 Hz -> 150 Hz in fallback)
  - `hit`: 0.50 (low impact pitch dive and crunch in fallback)
  - `shoot`: 0.30 (rapid high-frequency laser sweep in fallback)
  - `destroy`: 0.45 (heavy impact crunch in fallback)
  - `gameOver`: 0.60 (descending 3-note bass tone in fallback)
  - `click`: 0.20 (crisp UI button click in fallback)

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
