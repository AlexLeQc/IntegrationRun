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
  { username: 'NEO', score: 12500, created_at: new Date().toISOString() },
  { username: 'TRX', score: 9800, created_at: new Date().toISOString() },
  { username: 'CYB', score: 7500, created_at: new Date().toISOString() },
  { username: 'SYN', score: 5000, created_at: new Date().toISOString() },
  { username: 'RUN', score: 3200, created_at: new Date().toISOString() },
];

/**
 * Fetches the top 10 scores from Supabase, or falls back to localStorage.
 */
export async function fetchLeaderboard() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('high_scores')
        .select('username, score, created_at')
        .order('score', { ascending: false })
        .limit(10);
      
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
  if (stored) {
    try {
      return JSON.parse(stored).sort((a, b) => b.score - a.score).slice(0, 10);
    } catch (e) {
      console.error('Error parsing stored leaderboard:', e);
    }
  }

  // Initialize localStorage if it's empty
  localStorage.setItem('neon_runner_leaderboard', JSON.stringify(DEFAULT_LEADERBOARD));
  return DEFAULT_LEADERBOARD;
}

/**
 * Submits a score to Supabase, or falls back to localStorage.
 */
export async function submitScore(username, score) {
  const cleanUsername = (username || 'AAA').toUpperCase().trim().slice(0, 3);
  
  if (supabase) {
    try {
      const { error } = await supabase
        .from('high_scores')
        .insert([{ username: cleanUsername, score }]);
      
      if (!error) {
        console.log('Score submitted successfully to Supabase.');
        return true;
      }
      console.error('Supabase score submission failed:', error);
    } catch (e) {
      console.error('Exception during Supabase score submission:', e);
    }
  }

  // Local Storage Fallback
  const leaderboard = await fetchLeaderboard();
  leaderboard.push({
    username: cleanUsername,
    score,
    created_at: new Date().toISOString()
  });
  leaderboard.sort((a, b) => b.score - a.score);
  const trimmedLeaderboard = leaderboard.slice(0, 10);
  
  localStorage.setItem('neon_runner_leaderboard', JSON.stringify(trimmedLeaderboard));
  console.log('Score saved locally in fallback mode.');
  return true;
}
