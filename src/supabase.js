import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase client initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
  }
} else {
  console.log('No Supabase credentials found. Running in Local Storage Fallback mode.');
}

const DEFAULT_LEADERBOARD = [
  { username: 'NEO', score: 12500, created_at: new Date('2026-01-01').toISOString() },
  { username: 'TRX', score: 9800, created_at: new Date('2026-01-02').toISOString() },
  { username: 'CYB', score: 7500, created_at: new Date('2026-01-03').toISOString() },
  { username: 'SYN', score: 5000, created_at: new Date('2026-01-04').toISOString() },
  { username: 'RUN', score: 3200, created_at: new Date('2026-01-05').toISOString() },
];

/**
 * Fetches the top scores (up to limit = 20) ordered by score desc, created_at asc.
 */
export async function getTopScores(limit = 20) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('high_scores')
        .select('id, username, score, created_at')
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (!error && data) {
        return data;
      }
      console.warn('Supabase leaderboard fetch failed, falling back to local storage:', error);
    } catch (e) {
      console.warn('Exception during Supabase fetch:', e);
    }
  }

  // Local Storage Fallback
  const stored = localStorage.getItem('neon_runner_leaderboard');
  let leaderboard = stored ? JSON.parse(stored) : [...DEFAULT_LEADERBOARD];

  if (!stored) {
    localStorage.setItem('neon_runner_leaderboard', JSON.stringify(DEFAULT_LEADERBOARD));
  }

  leaderboard.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return leaderboard.slice(0, limit);
}

/**
 * Backward compatibility alias for fetchLeaderboard
 */
export async function fetchLeaderboard() {
  return getTopScores(20);
}

/**
 * Checks whether a score qualifies for the Top 20 leaderboard
 * and calculates predicted 1-indexed rank position.
 */
export async function qualifiesForLeaderboard(score) {
  if (score <= 0) return { qualifies: false, rank: null };

  const topScores = await getTopScores(20);

  // Calculate rank: new score inserts AFTER existing identical scores (older entry first)
  let rank = 1;
  for (let i = 0; i < topScores.length; i++) {
    if (topScores[i].score >= score) {
      rank++;
    } else {
      break;
    }
  }

  if (topScores.length < 20) {
    return { qualifies: true, rank };
  }

  const scoreAt20thPlace = topScores[19].score;
  if (score > scoreAt20thPlace) {
    return { qualifies: true, rank };
  }

  return { qualifies: false, rank: null };
}

/**
 * Deletes any scores ranking beyond 20th place to maintain strict Top 20 limit.
 */
export async function deleteLowestScore() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('high_scores')
        .select('id, score, created_at')
        .order('score', { ascending: false })
        .order('created_at', { ascending: true });
      
      if (!error && data && data.length > 20) {
        const excessIds = data.slice(20).map((item) => item.id);
        if (excessIds.length > 0) {
          await supabase.from('high_scores').delete().in('id', excessIds);
          console.log(`Deleted ${excessIds.length} excess low score(s) from Supabase.`);
        }
      }
    } catch (e) {
      console.warn('Error during Supabase deleteLowestScore:', e);
    }
  }

  // Local Storage Fallback
  const stored = localStorage.getItem('neon_runner_leaderboard');
  if (stored) {
    try {
      let leaderboard = JSON.parse(stored);
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });
      if (leaderboard.length > 20) {
        leaderboard = leaderboard.slice(0, 20);
        localStorage.setItem('neon_runner_leaderboard', JSON.stringify(leaderboard));
      }
    } catch (e) {
      console.error('Error during localStorage deleteLowestScore:', e);
    }
  }
}

/**
 * Submits a new high score, enforces name validation, trims excess entries > 20,
 * and returns success status with confirmed rank.
 */
export async function submitHighScore(username, score) {
  const cleanUsername = (username || '').toUpperCase().trim().slice(0, 12);
  if (!cleanUsername || cleanUsername.length < 2) {
    return { success: false, rank: null };
  }

  const qualification = await qualifiesForLeaderboard(score);
  if (!qualification.qualifies) {
    return { success: false, rank: null };
  }

  const newEntry = {
    username: cleanUsername,
    score,
    created_at: new Date().toISOString()
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from('high_scores')
        .insert([newEntry]);
      
      if (!error) {
        console.log('Score submitted successfully to Supabase.');
        await deleteLowestScore();
        return { success: true, rank: qualification.rank, username: cleanUsername };
      }
      console.error('Supabase score submission failed:', error);
    } catch (e) {
      console.error('Exception during Supabase score submission:', e);
    }
  }

  // Local Storage Fallback
  const stored = localStorage.getItem('neon_runner_leaderboard');
  let leaderboard = stored ? JSON.parse(stored) : [...DEFAULT_LEADERBOARD];
  leaderboard.push(newEntry);
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  leaderboard = leaderboard.slice(0, 20);

  localStorage.setItem('neon_runner_leaderboard', JSON.stringify(leaderboard));
  console.log('Score saved locally in fallback mode.');
  return { success: true, rank: qualification.rank, username: cleanUsername };
}

/**
 * Backward compatibility alias for submitScore
 */
export async function submitScore(username, score) {
  return submitHighScore(username, score);
}
