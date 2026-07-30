# Project Specification & Implementation Plan: Neon Runner

# Project Specification & Implementation Plan: Neon Runner

We will build **NEON RUNNER**, a mobile-first, high-performance, 3-lane runner web game set in a retro-futuristic Synthwave aesthetic. The game features glowing neon graphics, a pseudo-3D perspective grid, audio synthesized dynamically via the Web Audio API, mobile touch swipe controls, and a global leaderboard integrated with Supabase.

---

## Environment Setup & Supabase Configuration

> [!NOTE]
> **Local Fallback Enabled:** The application includes a mock mode in `src/supabase.js` that falls back to `localStorage` if `.env` variables are missing. This allows local development and playtesting without setting up Supabase first.

When ready to connect live global leaderboards, create a `.env` file at the root:

````env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

## Database Schema (Supabase)

The leaderboard will use a `high_scores` table. Run this SQL in your Supabase SQL Editor to set it up:

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
````

---

## Game Design & Specifications

### Player

- The player controls a glowing cyan neon chevron/ship.
- Positioned at the bottom of the screen (Y ≈ 85% of screen height).
- Moves horizontally between three lanes (left, middle, right) using swipe touch inputs on mobile or arrow/AD keys on desktop.
- Can transition into a **Jumping** state (elevated Y-offset tracking a jump arc)
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
- When the player hits an obstacle, it triggers a screen flash and screen shake effect, removing 1 heart from the visual health indicator on the screen. (Example: if the player hits an obstacle while having 3 lives, the player will have 2 lives left and the visual health indicator will show 2 hearts).
- When 0 hearts remain, the Game Over state is triggered.

### Collectibles & Coins

- Coins are procedurally generated in lane patterns (such as lines of 3–5 consecutive coins) or individually placed (e.g. directly above low hurdles to reward jump triggers).
- They spawn at varying heights (ground level, low-jump height, or slide height).
- Styled as spinning/pulsing neon golden-yellow disks with a glowing outer ring.
- Collecting a coin immediately increases the player's active score by **+100 points**

### Background & Visual Environment

- retro-futuristic Synthwave/Cyberpunk design.
- Features a glowing retro sunset with scanlines, neon pink/cyan grid lanes, and a deep violet/purple horizon gradient.

---

## Proposed Changes

We will initialize a clean Vite + Vanilla JS project in the workspace and build out the game and leaderboard.

### Project Setup & Configuration

#### [NEW] [package.json](file:///Users/alexisguerard/Projects/Gamefeeling/package.json)

Standard NPM package config detailing dependencies like `@supabase/supabase-js` and dev tools like `vite`.

#### [NEW] [vite.config.js](file:///Users/alexisguerard/Projects/Gamefeeling/vite.config.js)

Configuration for Vite, defining server options and build configurations.

#### [NEW] [vercel.json](file:///Users/alexisguerard/Projects/Gamefeeling/vercel.json)

Hosting configuration for Vercel, ensuring client-side routes and static files are served properly.

#### [NEW] [.env.example](file:///Users/alexisguerard/Projects/Gamefeeling/.env.example)

A template showing the required environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

### UI & Game Styling

#### [NEW] [style.css](file:///Users/alexisguerard/Projects/Gamefeeling/style.css)

A premium CSS stylesheet applying a Synthwave style:

- Glassmorphic panels with `backdrop-filter: blur(12px)`.
- Pulsing neon border-glows (`box-shadow`, `text-shadow`) using hot pink (`#ff007f`), cyan (`#00f0ff`), and deep violet.
- Grid-based overlays, responsive layout for portrait mobile screens, and smooth transitions.
- Custom typography from Google Fonts ("Orbitron" and "Inter").

---

### Core Logic & Game Architecture

#### [NEW] [index.html](file:///Users/alexisguerard/Projects/Gamefeeling/index.html)

The page structure containing:

- High-resolution `<canvas>` for the pseudo-3D game rendering.
- HTML overlay overlays for screens: Main Menu, Leaderboard, Game Over (score submission), and Settings.
- Responsive container structures.

#### [NEW] [src/supabase.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/supabase.js)

Initializes the Supabase client using environment variables and exports helper functions:

- `fetchLeaderboard()`: Fetches the top 10 scores sorted by descending order.
- `submitScore(username, score)`: Submits a new score.

#### [NEW] [src/audio.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/audio.js)

To keep the game lightweight and self-contained, we will synthesize audio in real-time using the browser's **Web Audio API**:

- Synthwave background drone/melody.
- Sound effects: swiping lane shift, collecting point boost, collision crash, and game over chord.

#### [NEW] [src/input.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/input.js)

Coordinates mobile touch swipes and keyboard key listeners:

- Swipe Detection: Listens to `touchstart` and `touchend`. Checks horizontal delta ($\Delta x$) and vertical delta ($\Delta y$) with a 30px threshold. Supports:
  - Swipe Left/Right: Shift lanes.
  - Swipe Up: Trigger Jump.
  - Swipe Down: Trigger Slide.
- Keyboard:
  - ArrowLeft / ArrowRight / `A` / `D`: Shift lanes.
  - ArrowUp / `W`: Jump.
  - ArrowDown / `S`: Slide.

#### [NEW] [src/game.js](file:///Users/alexisguerard/Projects/Gamefeeling/src/game.js)

The high-performance game loop utilizing `requestAnimationFrame`:

- **Pseudo-3D Rendering**: Renders a glowing perspective grid running down towards a virtual horizon. Renders obstacles scaling up and moving outward from the horizon center along three lanes.
- **Game State**: Manages player lane index, jump state physics (elevation offset), slide state timer (hitbox squish), current speed, scores, lives, and categorized obstacle spawning.
- **Collision Checking**: Evaluates if the player's current lane and animation states (jumping/sliding) match the approaching obstacle types.
- **Transitions**: Seamless transitions between menu, play, game over, and leaderboard views.

#### [NEW] [main.js](file:///Users/alexisguerard/Projects/Gamefeeling/main.js)

The entrypoint that wires up the UI buttons, initializes the game, connects the input events, loads the leaderboard, and controls audio settings.

---

## Read me

Add a readme with the current implementation. Include instructions on how to run the game, how to set up the Supabase database, and how to deploy the game to Vercel.

---

## Verification Plan

### Automated Verification

Since this is a client-side vanilla JavaScript app, verification will involve:

1. Running static compilation validation and dev server tests.
2. Checking JS lints/formatting.

### Manual Verification

1. **Swipe Interaction**: Test horizontal touch swiping on simulated mobile viewports via Chrome/Safari DevTools.
2. **Leaderboard Operations**: Attempt reading and inserting mock scores into a test database. We will include a mock mode in `supabase.js` that falls back to `localStorage` if environment credentials are not present, ensuring the app remains fully functional and testable immediately out of the box.
3. **Responsive Visuals**: Verify layout scaling from standard mobile widths (320px, 375px, 414px) up to tablet/desktop modes.
