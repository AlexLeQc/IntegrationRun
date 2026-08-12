import {
  MAX_LEADERBOARD_ENTRIES,
  fetchTeamLeaderboard,
  INTEGRATION_TEAMS,
} from "./supabase.js";

export class ScreenShake {
  constructor() {
    this.duration = 0;
    this.intensity = 0;
  }

  trigger(duration = 0.25, intensity = 8) {
    this.duration = duration;
    this.intensity = intensity;
  }

  reset() {
    this.duration = 0;
    this.intensity = 0;
  }

  update(deltaTime) {
    if (this.duration > 0) {
      this.duration -= deltaTime;
    }
  }

  applyTransform(ctx) {
    if (this.duration > 0) {
      const dx = (Math.random() - 0.5) * this.intensity;
      const dy = (Math.random() - 0.5) * this.intensity;
      ctx.translate(dx, dy);
    }
  }
}

/**
 * Triggers the visual damage flash overlay
 */
export function triggerDamageFlash() {
  const flash = document.getElementById("damage-flash");
  if (flash) {
    flash.classList.add("flash-active");
    setTimeout(() => {
      flash.classList.remove("flash-active");
    }, 100);
  }
}

/**
 * Renders HUD score and glowing SVG heart health icons
 */
export function updateHUD({ score, lives }) {
  const hudScore = document.getElementById("hud-score");
  const hudLives = document.getElementById("hud-lives");

  if (hudScore) {
    hudScore.textContent = String(score).padStart(6, "0");
  }

  if (hudLives) {
    let heartsHtml = "";
    for (let i = 0; i < 3; i++) {
      if (i < lives) {
        heartsHtml += `
          <svg class="heart-icon filled" viewBox="0 0 24 24" stroke="#2C2C2E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        `;
      } else {
        heartsHtml += `
          <svg class="heart-icon empty" viewBox="0 0 24 24" stroke="#2C2C2E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        `;
      }
    }
    hudLives.innerHTML = heartsHtml;
  }
}

/**
 * Transitions smoothly between UI screen overlays
 */
export function showScreen(activeScreen) {
  const mainMenu = document.getElementById("main-menu");
  const hudOverlay = document.getElementById("hud-overlay");
  const leaderboardScreen = document.getElementById("leaderboard-screen");
  const gameOverScreen = document.getElementById("game-over-screen");

  const screens = [mainMenu, hudOverlay, leaderboardScreen, gameOverScreen];
  screens.forEach((screen) => {
    if (!screen) return;
    if (screen === activeScreen) {
      screen.classList.remove("hidden");
      screen.classList.add("active");
    } else if (screen === hudOverlay && activeScreen === hudOverlay) {
      hudOverlay.classList.remove("hidden");
      hudOverlay.classList.add("active");
    } else {
      if (screen !== hudOverlay) {
        screen.classList.remove("active");
        screen.classList.add("hidden");
      }
    }
  });

  if (activeScreen === hudOverlay) {
    if (hudOverlay) {
      hudOverlay.classList.remove("hidden");
      hudOverlay.classList.add("active");
    }
  } else if (activeScreen === mainMenu || activeScreen === leaderboardScreen) {
    if (hudOverlay) {
      hudOverlay.classList.remove("active");
      hudOverlay.classList.add("hidden");
    }
  }
}

/**
 * Fetches and renders leaderboard entries into DOM table for individual or team tabs
 */
export async function renderLeaderboard(
  fetchLeaderboardFn,
  highlightInfo = null,
  activeTab = "individual",
) {
  const entriesContainer = document.getElementById("leaderboard-entries");
  const theadContainer = document.getElementById("leaderboard-thead");
  if (!entriesContainer) return;

  const colCount = activeTab === "teams" ? 4 : 4;
  entriesContainer.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; color: rgba(44, 44, 46, 0.5);">CONNEXION AU RÉSEAU...</td></tr>`;

  try {
    const scores = await fetchLeaderboardFn(MAX_LEADERBOARD_ENTRIES);

    if (activeTab === "teams") {
      if (theadContainer) {
        theadContainer.innerHTML = `
          <tr>
            <th style="width: 12%">#</th>
            <th style="text-align: left">ÉQUIPE</th>
            <th style="text-align: center">MEMBRES</th>
            <th style="text-align: right">POINTS TOTAL</th>
          </tr>
        `;
      }

      const teamRankings = await fetchTeamLeaderboard(scores);
      entriesContainer.innerHTML = "";

      if (!teamRankings || teamRankings.length === 0) {
        entriesContainer.innerHTML = `<tr><td colspan="4" style="text-align: center; color: rgba(44, 44, 46, 0.5);">AUCUNE ÉQUIPE TROUVÉE</td></tr>`;
        return;
      }

      teamRankings.forEach((entry) => {
        const rank = entry.rank;
        let rankClass = "";
        if (rank === 1) rankClass = "rank-1";
        else if (rank === 2) rankClass = "rank-2";
        else if (rank === 3) rankClass = "rank-3";

        const row = document.createElement("tr");

        if (
          highlightInfo &&
          highlightInfo.team &&
          entry.team === highlightInfo.team
        ) {
          row.classList.add("row-highlight");
        }

        row.innerHTML = `
          <td class="${rankClass}" style="font-weight: bold; text-align: center;">${rank}</td>
          <td style="font-weight: 600;">${entry.team}</td>
          <td style="text-align: center; font-weight: 600;">${entry.playerCount}</td>
          <td style="text-align: right; font-family: var(--font-display); color: var(--color-cyan);">${entry.totalScore.toLocaleString()}</td>
        `;
        entriesContainer.appendChild(row);
      });
    } else {
      // Individual runner rankings
      if (theadContainer) {
        theadContainer.innerHTML = `
          <tr>
            <th style="width: 10%">#</th>
            <th style="text-align: left">NEUVE</th>
            <th style="text-align: left">ÉQUIPE</th>
            <th style="text-align: right">SCORE</th>
          </tr>
        `;
      }

      entriesContainer.innerHTML = "";

      if (!scores || scores.length === 0) {
        entriesContainer.innerHTML = `<tr><td colspan="4" style="text-align: center; color: rgba(44, 44, 46, 0.5);">AUCUN ENREGISTREMENT TROUVÉ</td></tr>`;
        return;
      }

      scores.slice(0, MAX_LEADERBOARD_ENTRIES).forEach((entry, index) => {
        const rank = index + 1;
        let rankClass = "";
        if (rank === 1) rankClass = "rank-1";
        else if (rank === 2) rankClass = "rank-2";
        else if (rank === 3) rankClass = "rank-3";

        const row = document.createElement("tr");

        if (
          highlightInfo &&
          entry.username === highlightInfo.username &&
          entry.score === highlightInfo.score
        ) {
          row.classList.add("row-highlight");
        }

        const teamName = entry.team || "Indépendant";

        row.innerHTML = `
          <td class="${rankClass}" style="font-weight: bold; text-align: center;">${rank}</td>
          <td style="font-weight: 600; text-align: left;">${entry.username}</td>
          <td style="text-align: left;"><span class="team-badge-text" title="${teamName}">${teamName}</span></td>
          <td style="text-align: right; font-family: var(--font-display); color: var(--color-cyan);">${entry.score.toLocaleString()}</td>
        `;
        entriesContainer.appendChild(row);
      });
    }
  } catch (error) {
    console.error("Error rendering leaderboard:", error);
    entriesContainer.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; color: var(--color-magenta);">ERREUR DE TRANSMISSION</td></tr>`;
  }
}

/**
 * Toggles Game Over UI between State 1 (Regular) and State 2 (New High Score Prompt)
 */
export function showGameOverState(isQualified, { score, rank }) {
  const regularSubstate = document.getElementById("game-over-regular");
  const highscoreSubstate = document.getElementById("game-over-highscore");
  const scoreValRegular = document.getElementById("final-score-val-regular");
  const scoreValHighscore = document.getElementById(
    "final-score-val-highscore",
  );
  const predictedRankVal = document.getElementById("predicted-rank-val");
  const submitStatusMsg = document.getElementById("submit-status-msg");
  const submitScoreBtn = document.getElementById("submit-score-btn");
  const usernameInput = document.getElementById("username");
  const teamSelect = document.getElementById("team-select");

  console.log(
    `[UI] showGameOverState isQualified=${isQualified} score=${score} rank=${rank}`,
  );

  if (scoreValRegular) scoreValRegular.textContent = score.toLocaleString();
  if (scoreValHighscore) scoreValHighscore.textContent = score.toLocaleString();

  if (submitStatusMsg) {
    submitStatusMsg.classList.add("hidden");
    submitStatusMsg.textContent = "";
  }

  // Always start by hiding BOTH substates, then reveal the correct one
  if (regularSubstate) regularSubstate.classList.add("hidden");
  if (highscoreSubstate) highscoreSubstate.classList.add("hidden");

  if (isQualified) {
    console.log("[UI] → Showing HIGH SCORE state");
    if (highscoreSubstate) highscoreSubstate.classList.remove("hidden");
    if (predictedRankVal)
      predictedRankVal.textContent = rank
        ? `RANG #${rank}`
        : `TOP ${MAX_LEADERBOARD_ENTRIES}`;

    if (usernameInput) {
      usernameInput.value = "";
      usernameInput.disabled = false;
    }
    if (teamSelect) {
      teamSelect.value = "";
      teamSelect.disabled = false;
    }
    if (submitScoreBtn) {
      submitScoreBtn.disabled = false;
      submitScoreBtn.textContent = "TU FLEX TU BOIS";
    }
  } else {
    console.log("[UI] → Showing REGULAR game over state");
    if (regularSubstate) regularSubstate.classList.remove("hidden");
  }
}
