# Project Specification & Implementation Plan: Neon Runner

We will build **NEON RUNNER**, a mobile-first, high-performance, 3-lane runner web game set in a retro-futuristic Synthwave aesthetic. The game features glowing neon graphics, a pseudo-3D perspective grid, audio synthesized dynamically via the Web Audio API, mobile touch swipe controls, and a global leaderboard integrated with Supabase.

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

- The player controls a glowing cyan neon chevron/ship.
- Positioned at the bottom of the screen (Y ≈ 85% of screen height).
- Moves horizontally between three lanes (left, middle, right) using swipe touch inputs on mobile or arrow/AD keys on desktop.
- Can transition into a **Jumping** state (elevated Y-offset tracking a jump arc).
- Can transition into a **Sliding** state (vertically compressed ship layout and hitbox).
- Movements are smoothly interpolated for a responsive and premium feel.

### Obstacles & Hazards

- Obstacles are procedurally generated in the active lanes.
- They spawn at the vanishing point (horizon) and move down towards the screen bottom, scaling up exponentially in size to create a 3D parallax effect.
- Hazards are divided into **three categorized types**:
  - **Full-Block Barrier**: Standard barrier requiring a lane change.
  - **Low Hurdle**: Low-profile barrier requiring a **Jump** (collision is bypassed if player is currently jumping).
  - **High Overhead Beam**: Laser line requiring a **Slide** (collision is bypassed if player is currently sliding).
- Colliding with an obstacle decreases the player's life count and destroys the obstacle.
- The spawn rate and speed gradually increase as the player's score increases.

### Lanes & Perspective

- The perspective vanishing point/horizon is pushed high up the screen to **Y = 17%** (1/6th) of the total height.
- Consequently, the three lanes extend down to the bottom, occupying **5/6th (≈83%)** of the total canvas height.
- This creates a longer track runway, offering a dramatic perspective and giving the player ample reaction time to dodge incoming obstacles.

### Scoreboard & High Scores

- Score automatically increases continuously over time as the player survives (accumulating at a rate of +10 points per second elapsed).
- Leaderboard retrieves and submits scores to a Supabase database, falling back automatically to local storage if API keys are absent.

### Lives & Health System

- The player starts with 3 lives.
- Lives are represented in the HUD using custom SVG heart elements rather than Unicode characters (such as `♥`). This prevents mobile operating systems (especially iOS) from overriding the custom styling with standard emojis, guaranteeing uniform neon-pink rendering across all devices.
- When the player hits an obstacle, it triggers a screen flash and screen shake effect, removing 1 heart from the visual health indicator on the screen.
- When 0 hearts remain, the Game Over state is triggered.

### Collectibles & Coins

- Coins are procedurally generated in lane patterns (such as lines of 3–5 consecutive coins) or individually placed (e.g. directly above low hurdles to reward jump triggers).
- They spawn at varying heights (ground level, low-jump height, or slide height).
- Styled as spinning/pulsing neon golden-yellow disks with a glowing outer ring.
- Collecting a coin immediately increases the player's active score by **+100 points**.

### Background & Visual Environment

- Retro-futuristic Synthwave/Cyberpunk design.
- Features a glowing retro sunset with scanlines, neon pink/cyan grid lanes, and a deep violet/purple horizon gradient.
- Custom typography loaded from Google Fonts ("Orbitron" for headers, score displays, and buttons; "Inter" for UI body text and labels).
- Glassmorphic screen overlays (`#main-menu`, `#leaderboard-screen`, `#game-over-screen`, `#hud-overlay`) featuring `backdrop-filter: blur(12px)` dark translucent backgrounds, subtle neon borders, and glowing text-shadow accents (`#ff007f`, `#00f0ff`).

---

## Code Structure & Architecture

The application follows a modular architecture using ES modules for clean separation of concerns:

- **`src/player.js`**: `Player` class managing player lane state, smooth horizontal interpolation, jump/slide physics, and cyan chevron canvas rendering.
- **`src/obstacles.js`**: `ObstacleManager` class managing procedural hazard spawning (Full Block, Low Hurdle, High Beam), 3D perspective scaling math, and wireframe rendering.
- **`src/collectibles.js`**: `CoinManager` class managing coin pattern generation, spinning coin animations, pickup collection checks, Web Audio sound synthesis, and spark particle explosions.
- **`src/ui.js`**: UI helper module managing HUD score displays, SVG heart indicators, screen shake transforms, damage screen flashes, glassmorphic overlay screen transitions, and leaderboard DOM updates.
- **`src/game.js`**: Main `Game` orchestrator managing the `requestAnimationFrame` loop, delta time calculations, background/grid rendering, module coordination, and collision checks.
- **`src/input.js`**: `InputHandler` managing keyboard and mobile touch swipe input events.
- **`src/audio.js`**: Web Audio API synthesizer for sound effects and Synthwave audio.
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
3. **Responsive Visuals**: Verify layout scaling from standard mobile screens up to tablet and desktop viewports.
