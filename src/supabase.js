import { createClient } from "@supabase/supabase-js";

export const MAX_LEADERBOARD_ENTRIES = 100;

export const INTEGRATION_TEAMS = [
  "Schtroumpfettes Pompettes",
  "Passe-MontAngine de Poitrine",
  "Johnny Alcoo-Test",
  "Les Mélodibroues",
  "Garfeeling",
  "Loups-Guru",
  "Bubly Ponge",
  "Justin Bieberon",
  "Kabusch et les Krashpoils",
  "Arc'teryx et Obétwist",
  "Tequila Spies",
  "Buzzball chasseur",
  "Pabst Patrouille",
  "Homme sur Bière",
  "Clope penguin",
  "Pokérhum",
  "Pabst-Partout",
  "Teletobeerz",
  "Busch Lightyear",
  "Babush Ice",
  "GOUV",
  "CO",
];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
} else {
  console.log(
    "No Supabase credentials found. Running in Local Storage Fallback mode.",
  );
}

/**
 * Holds the signed session token issued by the Edge Function at game start.
 * Cleared on each new game start so a single token cannot be reused across runs.
 */
let _currentSessionToken = null;

/**
 * Requests a signed session token from the Edge Function.
 * Must be called each time the player starts a new run.
 * Falls back gracefully (returns null) when Supabase is unavailable.
 *
 * @returns {Promise<string|null>} The opaque session token, or null in fallback mode.
 */
export async function startRunSession() {
  _currentSessionToken = null; // invalidate any previous token

  if (!supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke("game-score", {
      body: { action: "start" },
    });
    if (!error && data?.sessionToken) {
      _currentSessionToken = data.sessionToken;
      console.log("[Session] Run session started.");
      return _currentSessionToken;
    }
    console.warn("[Session] Edge Function returned no token:", error);
  } catch (e) {
    console.warn("[Session] Could not start server session:", e);
  }
  return null;
}

const DEFAULT_LEADERBOARD = [
  {
    username: "Bïzoùnę SåùTę",
    team: "GOUV",
    score: 676767,
    created_at: new Date("2026-01-01").toISOString(),
  },
];

/**
 * Returns ALL local scores sorted by score desc, created_at asc (no limit slice).
 * Used internally for qualification checks that need the true total entry count.
 */
function getAllLocalScores() {
  const stored = localStorage.getItem("neon_runner_leaderboard");
  let leaderboard = stored ? JSON.parse(stored) : [...DEFAULT_LEADERBOARD];

  if (!stored) {
    localStorage.setItem(
      "neon_runner_leaderboard",
      JSON.stringify(DEFAULT_LEADERBOARD),
    );
  }

  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  return leaderboard;
}

/**
 * Fetches the top scores (up to limit = MAX_LEADERBOARD_ENTRIES) ordered by score desc, created_at asc.
 */
export async function getTopScores(limit = MAX_LEADERBOARD_ENTRIES) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("high_scores")
        .select("id, username, team, score, created_at")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data;
      }
      console.warn(
        "Supabase leaderboard fetch returned no rows or failed, falling back to local storage:",
        error,
      );
    } catch (e) {
      console.warn("Exception during Supabase fetch:", e);
    }
  }

  // Local Storage Fallback — return only top `limit` for display
  return getAllLocalScores().slice(0, limit);
}

/**
 * Backward compatibility alias for fetchLeaderboard
 */
export async function fetchLeaderboard() {
  return getTopScores(MAX_LEADERBOARD_ENTRIES);
}

/**
 * Checks whether a score qualifies for the leaderboard
 * and calculates predicted 1-indexed rank position.
 *
 * Rules:
 *  - score must be > 0.
 *  - Capacity Check: If scores.length < MAX_LEADERBOARD_ENTRIES, the player
 *    automatically qualifies (open slots available).
 *  - Threshold Check: If scores.length >= MAX_LEADERBOARD_ENTRIES, the player
 *    qualifies ONLY IF score > lowestScore (the entry at index MAX - 1).
 */
export async function qualifiesForLeaderboard(score) {
  if (!score || score <= 0) {
    return { qualifies: false, rank: null };
  }

  let allScores;

  if (supabase) {
    // Supabase: fetch all scores to get true total count and find lowest
    try {
      const { data, error } = await supabase
        .from("high_scores")
        .select("id, score, created_at")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true });

      if (!error && data) {
        allScores = data;
      } else {
        // Supabase failed — fall through to local
        allScores = getAllLocalScores();
      }
    } catch (e) {
      allScores = getAllLocalScores();
    }
  } else {
    // Local storage: read ALL entries for accurate count and lowest score
    allScores = getAllLocalScores();
  }

  const totalCount = allScores.length;

  // Calculate predicted rank among ALL existing scores
  let rank = 1;
  for (let i = 0; i < allScores.length; i++) {
    if (allScores[i].score >= score) {
      rank++;
    } else {
      break;
    }
  }

  // Capacity Check: board has open slots — any score > 0 qualifies
  if (totalCount < MAX_LEADERBOARD_ENTRIES) {
    return { qualifies: true, rank };
  }

  // Threshold Check: board is full — must beat the lowest entry
  const lowestScore = allScores[MAX_LEADERBOARD_ENTRIES - 1].score;
  if (score > lowestScore) {
    return { qualifies: true, rank };
  }

  return { qualifies: false, rank: null };
}

/**
 * Deletes any scores ranking beyond MAX_LEADERBOARD_ENTRIES place to maintain strict limit.
 */
export async function deleteLowestScore() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("high_scores")
        .select("id, score, created_at")
        .order("score", { ascending: false })
        .order("created_at", { ascending: true });

      if (!error && data && data.length > MAX_LEADERBOARD_ENTRIES) {
        const excessIds = data
          .slice(MAX_LEADERBOARD_ENTRIES)
          .map((item) => item.id);
        if (excessIds.length > 0) {
          await supabase.from("high_scores").delete().in("id", excessIds);
          console.log(
            `Deleted ${excessIds.length} excess low score(s) from Supabase.`,
          );
        }
      }
    } catch (e) {
      console.warn("Error during Supabase deleteLowestScore:", e);
    }
  }

  // Local Storage Fallback
  const stored = localStorage.getItem("neon_runner_leaderboard");
  if (stored) {
    try {
      let leaderboard = JSON.parse(stored);
      leaderboard.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });
      if (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
        leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);
        localStorage.setItem(
          "neon_runner_leaderboard",
          JSON.stringify(leaderboard),
        );
      }
    } catch (e) {
      console.error("Error during localStorage deleteLowestScore:", e);
    }
  }
}

/**
 * Submits a new high score, enforces name validation, saves team selection,
 * trims excess entries > MAX_LEADERBOARD_ENTRIES, and returns success status with confirmed rank.
 *
 * @param {string} username
 * @param {string} team
 * @param {number} score
 * @param {number} [runDurationSec=0] - Total wall-clock seconds of the run (for anti-cheat metadata)
 */
export async function submitHighScore(username, team, score, runDurationSec = 0) {
  // Support both (username, team, score) and legacy (username, score)
  if (typeof team === "number" && score === undefined) {
    score = team;
    team = INTEGRATION_TEAMS[0];
  }

  // Score integrity check: must be a finite positive integer within bounds
  const safeScore = Math.floor(Number(score));
  if (!Number.isFinite(safeScore) || safeScore <= 0 || safeScore > 10_000_000) {
    return { success: false, rank: null };
  }

  const cleanUsername = (username || "").toUpperCase().trim().slice(0, 12);
  if (!cleanUsername || cleanUsername.length < 2) {
    return { success: false, rank: null };
  }

  // Team allowlist check: must be a recognized integration team
  const trimmedTeam = (team || "").trim() || INTEGRATION_TEAMS[0];
  const cleanTeam = INTEGRATION_TEAMS.includes(trimmedTeam)
    ? trimmedTeam
    : INTEGRATION_TEAMS[0];

  // --- Physical Plausibility Guard -------------------------------------------
  // Maximum theoretically earnable score:
  //   Survival points: 10 pts/sec × runDurationSec
  //   Coin pickups:    100 pts each — conservatively allow 1 coin/sec
  //   GOUV kills:      250 pts each — conservatively allow 1 GOUV/3sec
  // If the reported score is higher than this ceiling, reject as implausible.
  const safeDuration = Math.max(0, Math.floor(Number(runDurationSec) || 0));
  if (safeDuration > 0) {
    const maxSurvival  = safeDuration * 10;
    const maxCoins     = safeDuration * 100;          // 1 coin/sec ceiling
    const maxGouvKills = Math.floor(safeDuration / 3) * 250; // 1 GOUV every 3 sec ceiling
    const maxTheoretical = maxSurvival + maxCoins + maxGouvKills;
    if (safeScore > maxTheoretical) {
      console.warn(
        `[AntiCheat] Score ${safeScore} exceeds theoretical max ${maxTheoretical} for ${safeDuration}s run. Submission rejected.`
      );
      return { success: false, rank: null };
    }
  }
  // ---------------------------------------------------------------------------

  const qualification = await qualifiesForLeaderboard(safeScore);
  if (!qualification.qualifies) {
    return { success: false, rank: null };
  }

  // Determine is_top_score: true when this entry would sit at rank 1
  const isTopScore = qualification.rank === 1;

  const newEntry = {
    username: cleanUsername,
    team: cleanTeam,
    score: safeScore,
    created_at: new Date().toISOString(),
    // Lightweight verification metadata (no extra row, no extra DB query)
    is_top_score: isTopScore,
    run_duration_sec: safeDuration,
  };

  if (supabase) {
    try {
      // Submit through the secure Edge Function.
      // The Edge Function uses the service_role key to insert — bypassing RLS —
      // after validating the signed session token and all anti-cheat rules.
      const { data, error } = await supabase.functions.invoke("game-score", {
        body: {
          action: "submit",
          sessionToken: _currentSessionToken,
          username: cleanUsername,
          team: cleanTeam,
          score: safeScore,
        },
      });

      if (!error && data?.success) {
        console.log("Score submitted successfully via Edge Function.", {
          rank: qualification.rank,
          run_duration_sec: safeDuration,
        });
        _currentSessionToken = null; // consume token — one run, one submission
        await deleteLowestScore();
        return {
          success: true,
          rank: qualification.rank,
          username: cleanUsername,
          team: cleanTeam,
        };
      }
      console.error("Edge Function score submission failed:", error ?? data);
    } catch (e) {
      console.error("Exception during Edge Function score submission:", e);
    }
  }

  // Local Storage Fallback (metadata stored locally too for consistency)
  const stored = localStorage.getItem("neon_runner_leaderboard");
  let leaderboard = stored ? JSON.parse(stored) : [...DEFAULT_LEADERBOARD];
  leaderboard.push(newEntry);
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
  leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);

  localStorage.setItem("neon_runner_leaderboard", JSON.stringify(leaderboard));
  console.log("Score saved locally in fallback mode.");
  return {
    success: true,
    rank: qualification.rank,
    username: cleanUsername,
    team: cleanTeam,
  };
}

/**
 * Backward compatibility alias for submitScore
 */
export async function submitScore(username, team, score, runDurationSec = 0) {
  return submitHighScore(username, team, score, runDurationSec);
}

/**
 * Computes team standings from top scores (or provided scores list).
 * Groups entries by team, calculates sum of scores per team and player count,
 * sorts teams in descending order by total score, and assigns team rank.
 */
export async function fetchTeamLeaderboard(scoresInput = null) {
  let scores = scoresInput;
  if (!scores) {
    scores = await getTopScores(MAX_LEADERBOARD_ENTRIES);
  }

  const teamMap = {};

  (scores || []).forEach((entry) => {
    const teamName = entry.team || "Independent";
    if (!teamMap[teamName]) {
      teamMap[teamName] = {
        team: teamName,
        totalScore: 0,
        playerCount: 0,
      };
    }
    teamMap[teamName].totalScore += entry.score || 0;
    teamMap[teamName].playerCount += 1;
  });

  const teamList = Object.values(teamMap);
  teamList.sort((a, b) => b.totalScore - a.totalScore);

  return teamList.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));
}
