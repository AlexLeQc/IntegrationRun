# Doodle Runner

**Doodle Runner** is a high-performance, mobile-first, 3-lane runner web game built with Vite and Vanilla JS. Set in a bright, playful, hand-drawn sketchbook aesthetic inspired by childhood art class, it features paper airplane ships, 3D cardboard box barriers, wooden pencil hurdles, ink splatter arches, glowing gold coins with airborne ground shadows, real-time Canvas rendering, Web Audio synthesis, touch swipe controls, and a global leaderboard integrated with Supabase.

---

## Features

- **Playful Sketchbook Style**: Notebook paper card overlays with rounded hand-drawn borders, Google Fonts (`Fredoka` & `Kalam`), marker-styled buttons with playful hover tilts, and bright crayon accent colors.
- **Pseudo-3D Canvas Engine**: Smooth 60fps rendering of hand-drawn paper airplanes, cardboard boxes, pencil hurdles, ink splatter arches, and spinning gold coins with ground depth shadows—no external WebGL libraries required.
- **Full-Brightness Background Asset Engine**: Supports custom background images rendered at full contrast and true brightness without darkening overlays or duplicate line drawing.
- **Mobile-First Touch Swiping**: Fluid lane-shifting, jumping, and sliding with mobile touch swipe gestures, plus keyboard arrow and A/D/W/S key support for desktop.
- **Supabase Leaderboard**: Global high-score storage with a transparent `localStorage` fallback to support instant play during local development.
- **Dynamic Web Audio Synthesizer**: Sound effects generated in real-time using the browser's Web Audio API.

---

## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed (version 18+ recommended).

### Installation & Run

1. Clone or navigate to the repository directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
   *Note: Vite is configured to bind to your local network (`host: true`). You can open the displayed Network URL (e.g., `http://192.168.1.XX:3000`) on your mobile phone to test touch swipes.*

4. Build for production:
   ```bash
   npm run build
   ```

---

## Supabase Database Setup

To hook up the global high score leaderboards, you need to create a table in your Supabase project.

### 1. Run the SQL Schema

Navigate to the **SQL Editor** in your Supabase Dashboard and run the following script to create the `high_scores` table, index the score column, enable Row Level Security (RLS), and set up the public access policies:

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

### 2. Configure Environment Variables

Create a file named `.env` in the root of your project:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

*If `.env` variables are missing or undefined, the game automatically switches to **Local Storage Fallback Mode**, saving and displaying scores locally in the browser.*

---

## Deployment to Vercel

Vite applications can be deployed to Vercel instantly.

### Option 1: Vercel CLI (Recommended)

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Log in and deploy:
   ```bash
   vercel
   ```
3. Set your production environment variables:
   When prompted or in the Vercel Dashboard, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy to production:
   ```bash
   vercel --prod
   ```

### Option 2: Git Integration

1. Push your repository to GitHub, GitLab, or Bitbucket.
2. Import the repository into the [Vercel Dashboard](https://vercel.com/dashboard).
3. Under **Build & Development Settings**, verify the settings:
   - **Framework Preset**: `Vite` (automatically detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add your **Environment Variables** under the project settings before clicking **Deploy**.
