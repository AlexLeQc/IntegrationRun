import { createClient } from "@supabase/supabase-js";

export const MAX_LEADERBOARD_ENTRIES = 20;

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
];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase client initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
  }
} else {
  console.log(
    "No Supabase credentials found. Running in Local Storage Fallback mode.",
  );
}

const DEFAULT_LEADERBOARD = [
  {
    username: "Bïzoùnę SåùTę",
    team: "GOUV",
    score: 676767,
    created_at: new Date("2026-01-01").toISOString(),
  },
  {
    username: "TRX",
    team: "Passe-MontAngine de Poitrine",
    score: 9800,
    created_at: new Date("2026-01-02").toISOString(),
  },
  {
    username: "CYB",
    team: "Johnny Alcoo-Test",
    score: 7500,
    created_at: new Date("2026-01-03").toISOString(),
  },
  {
    username: "SYN",
    team: "Garfeeling",
    score: 5000,
    created_at: new Date("2026-01-04").toISOString(),
  },
  {
    username: "RUN",
    team: "Bubly Ponge",
    score: 3200,
    created_at: new Date("2026-01-05").toISOString(),
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
 *  - If the board is completely empty: any score qualifies.
 *  - If the board has fewer entries than MAX_LEADERBOARD_ENTRIES AND the score
 *    beats the current lowest entry: qualifies.
 *  - If the board is full (entries >= MAX_LEADERBOARD_ENTRIES): qualifies only
 *    if score > the last-place entry.
 *  - Otherwise: does NOT qualify (score is not good enough to make the list).
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

  // Board is truly empty: any score qualifies at rank 1
  if (totalCount === 0) {
    return { qualifies: true, rank: 1 };
  }

  // Calculate predicted rank among ALL existing scores
  let rank = 1;
  for (let i = 0; i < allScores.length; i++) {
    if (allScores[i].score >= score) {
      rank++;
    } else {
      break;
    }
  }

  // Score must beat the current lowest entry on the board to qualify.
  // This applies whether the board is full or has open slots —
  // we don't want to show the form just because there are empty cap slots.
  const lowestExistingScore = allScores[totalCount - 1].score;

  if (score <= lowestExistingScore) {
    return { qualifies: false, rank: null };
  }

  // Score beats the lowest existing entry.
  // If board is already full, it must also beat the last-place cap entry.
  if (totalCount >= MAX_LEADERBOARD_ENTRIES) {
    const lastPlaceScore = allScores[MAX_LEADERBOARD_ENTRIES - 1].score;
    if (score <= lastPlaceScore) {
      return { qualifies: false, rank: null };
    }
  }

  return { qualifies: true, rank };
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
 */
export async function submitHighScore(username, team, score) {
  // Support both (username, team, score) and legacy (username, score)
  if (typeof team === "number" && score === undefined) {
    score = team;
    team = INTEGRATION_TEAMS[0];
  }

  const cleanUsername = (username || "").toUpperCase().trim().slice(0, 12);
  if (!cleanUsername || cleanUsername.length < 2) {
    return { success: false, rank: null };
  }

  const cleanTeam = (team || "").trim() || INTEGRATION_TEAMS[0];

  const qualification = await qualifiesForLeaderboard(score);
  if (!qualification.qualifies) {
    return { success: false, rank: null };
  }

  const newEntry = {
    username: cleanUsername,
    team: cleanTeam,
    score,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { error } = await supabase.from("high_scores").insert([newEntry]);

      if (!error) {
        console.log("Score submitted successfully to Supabase.");
        await deleteLowestScore();
        return {
          success: true,
          rank: qualification.rank,
          username: cleanUsername,
          team: cleanTeam,
        };
      }
      console.error("Supabase score submission failed:", error);
    } catch (e) {
      console.error("Exception during Supabase score submission:", e);
    }
  }

  // Local Storage Fallback
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
export async function submitScore(username, team, score) {
  return submitHighScore(username, team, score);
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
