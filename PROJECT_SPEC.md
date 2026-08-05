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

### Scoreboard & High Scores

- Score automatically increases continuously over time as the player survives (accumulating at a rate of +10 points per second elapsed).
- Leaderboard retrieves and submits scores to a Supabase database, falling back automatically to local storage if API keys are absent.

### Lives & Health System

- The player starts with 3 lives.
- Lives are represented in the HUD using custom hand-drawn crayon/marker heart SVG elements filled with bright crayon red (`#FF3B30`) and dark wobbly stroke outlines (`#2C2C2E`).
- When the player hits an obstacle, it triggers a screen flash and screen shake effect, removing 1 heart from the visual health indicator on the screen.
- When 0 hearts remain, the Game Over state is triggered.

### Collectibles & Coins

- Coins are procedurally generated in lane patterns (such as lines of 3–5 consecutive items) or individually placed (e.g. directly above hurdles to reward jump triggers).
- Styled as spinning glowing golden coins (`coin.png` asset or procedural gold disk with rich golden yellow fills, a bright highlight ring, and marker stroke outlines).
- **Airborne Ground Shadows**: When coins spawn at elevated heights (`heightOffset > 0`, e.g. jump-height above hurdles), a soft semi-transparent oval shadow (`rgba(0, 0, 0, 0.3)`) renders directly on the lane track beneath them, scaling dynamically with perspective `zScale` to provide a clear visual depth cue indicating a jump is required.
- Collecting a coin immediately increases the player's active score by **+100 points** and triggers a colorful particle explosion.

### Background & Visual Environment

- Bright, playful, hand-drawn sketchbook aesthetic inspired by childhood art class.
- The background image asset (`background.png`) handles the perspective grid, lateral lane boundaries, horizon line, and visual background environment directly at full contrast, vibrant colors, and true brightness without darkening tint overlays or duplicate line drawing.
- Procedural canvas drawing maintains clean, transparent layer rendering while preserving internal 3D positioning coordinates (`horizonY = 1/6th` canvas height, 3 lane math) for hazard and player movement.
- Custom typography loaded from Google Fonts ("Fredoka" for headers, score displays, and buttons; "Kalam" for handwriting notes and body labels).
- Notebook paper overlay cards (`#main-menu`, `#leaderboard-screen`, `#game-over-screen`, `#hud-overlay`) featuring `backdrop-filter: blur(8px)`, rounded hand-drawn style borders (`border: 3px solid #2C2C2E; border-radius: 18px 12px 20px 14px`), and soft cardboard drop shadows.

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

### Game Over Screen (`#game-over-screen`)
- **Header**: Playful "GAME OVER" notebook header.
- **Final Score**: Displays total score achieved in the session.
- **Leaderboard Submission Form**: 3-character uppercase initials input box (`#username`) and `SUBMIT RECORD` button.
- **Restart Button**: `RETRY RUN` button allowing immediate game loop restart.

### Leaderboard Overlay (`#leaderboard-screen`)
- **Rankings Table**: Top 10 high score records formatted with rank numbers (1st, 2nd, 3rd highlighted with gold, silver, bronze marker accents), username initials, and numeric score.
- **Navigation**: `BACK TO MENU` button returning smoothly to the Main Menu.

---

## Code Structure & Architecture

The application follows a modular architecture using ES modules for clean separation of concerns:

- **`src/assets.js`**: Image asset preloader module loading static images from `public/assets/` (`player.png`, `barrier.png`, `hurdle.png`, `beam.png`, `obstacle.png`, `coin.png`, `background.png`) with graceful error handling that falls back to procedural doodle rendering if images are missing.
- **`src/player.js`**: `Player` class managing player lane state, smooth horizontal interpolation, jump/slide physics, and hand-drawn paper airplane / doodle chevron canvas rendering.
- **`src/obstacles.js`**: `ObstacleManager` class managing procedural hazard spawning (Cardboard Box, Pencil Hurdle, Ink Beam), 3D perspective scaling math, and hand-drawn sketch canvas rendering.
- **`src/collectibles.js`**: `CoinManager` class managing coin/star pattern generation, spinning star animations, pickup collection checks, Web Audio sound synthesis, crayon particle explosions, and custom image rendering.
- **`src/ui.js`**: UI helper module managing HUD score displays, hand-drawn crayon heart indicators, screen shake transforms, damage screen flashes, notebook screen overlay transitions, and leaderboard DOM updates.
- **`src/game.js`**: Main `Game` orchestrator managing asset preloading, the `requestAnimationFrame` loop, delta time calculations, notebook background/doodle sun/pencil grid rendering, module coordination, and collision checks.
- **`src/input.js`**: `InputHandler` managing keyboard and mobile touch swipe input events.
- **`src/audio.js`**: Web Audio API synthesizer for sound effects and playful audio.
- **`src/supabase.js`**: Supabase API client with local storage fallback for leaderboard operations.
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
