import './style.css';
import { Game } from './game.js';
import { fetchLeaderboard, submitScore } from './supabase.js';

// DOM elements
const mainMenu = document.getElementById('main-menu');
const hudOverlay = document.getElementById('hud-overlay');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const gameOverScreen = document.getElementById('game-over-screen');

const startBtn = document.getElementById('start-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
const restartBtn = document.getElementById('restart-btn');

const hudScore = document.getElementById('hud-score');
const hudLives = document.getElementById('hud-lives');
const finalScoreVal = document.getElementById('final-score-val');

const scoreSubmitForm = document.getElementById('score-submit-form');
const usernameInput = document.getElementById('username');
const submitScoreBtn = document.getElementById('submit-score-btn');
const canvas = document.getElementById('game-canvas');

// Game instance
let game;

// Helper to switch screens smoothly
function showScreen(activeScreen) {
  const screens = [mainMenu, hudOverlay, leaderboardScreen, gameOverScreen];
  screens.forEach((screen) => {
    if (screen === activeScreen) {
      screen.classList.remove('hidden');
      screen.classList.add('active');
    } else if (screen === hudOverlay && activeScreen === hudOverlay) {
      // Keep HUD visible if it's active screen
      hudOverlay.classList.remove('hidden');
      hudOverlay.classList.add('active');
    } else if (screen !== hudOverlay || activeScreen !== hudOverlay) {
      // Don't hide HUD if we are transitioning to a screen overlaying the HUD unless needed
      if (screen !== hudOverlay) {
        screen.classList.remove('active');
        screen.classList.add('hidden');
      }
    }
  });

  // Specific HUD rules
  if (activeScreen === hudOverlay) {
    hudOverlay.classList.remove('hidden');
    hudOverlay.classList.add('active');
  } else if (activeScreen === mainMenu || activeScreen === leaderboardScreen) {
    hudOverlay.classList.remove('active');
    hudOverlay.classList.add('hidden');
  }
}

// Update HUD values
function updateHUD({ score, lives }) {
  hudScore.textContent = String(score).padStart(6, '0');
  
  // Format lives as premium glowing SVG hearts
  let heartsHtml = '';
  for (let i = 0; i < 3; i++) {
    if (i < lives) {
      heartsHtml += `
        <svg class="heart-icon filled" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      `;
    } else {
      heartsHtml += `
        <svg class="heart-icon empty" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      `;
    }
  }
  hudLives.innerHTML = heartsHtml;
}

// Trigger Game Over screen
function onGameOver(score) {
  finalScoreVal.textContent = score;
  showScreen(gameOverScreen);
  // Reset the submission form
  usernameInput.value = '';
  usernameInput.disabled = false;
  submitScoreBtn.disabled = false;
  submitScoreBtn.textContent = 'SUBMIT RECORD';
}

// Fetch and render leaderboard entries
async function renderLeaderboard() {
  const entriesContainer = document.getElementById('leaderboard-entries');
  entriesContainer.innerHTML = '<tr><td colspan="3" style="text-align: center; color: rgba(255, 255, 255, 0.4);">CONNECTING NETWORK...</td></tr>';
  
  try {
    const scores = await fetchLeaderboard();
    entriesContainer.innerHTML = '';
    
    if (scores.length === 0) {
      entriesContainer.innerHTML = '<tr><td colspan="3" style="text-align: center; color: rgba(255, 255, 255, 0.4);">NO RECORDS FOUND</td></tr>';
      return;
    }

    scores.forEach((entry, index) => {
      const rank = index + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="${rankClass}" style="font-weight: bold; text-align: center;">${rank}</td>
        <td>${entry.username}</td>
        <td style="text-align: right; font-family: var(--font-display); color: var(--color-cyan);">${entry.score.toLocaleString()}</td>
      `;
      entriesContainer.appendChild(row);
    });
  } catch (error) {
    console.error('Error rendering leaderboard:', error);
    entriesContainer.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--color-magenta);">TRANSMISSION ERROR</td></tr>';
  }
}

// Initialize the game instance
game = new Game(canvas, updateHUD, onGameOver);

// Bind event listeners
startBtn.addEventListener('click', () => {
  showScreen(hudOverlay);
  game.start();
});

leaderboardBtn.addEventListener('click', async () => {
  showScreen(leaderboardScreen);
  await renderLeaderboard();
});

leaderboardBackBtn.addEventListener('click', () => {
  showScreen(mainMenu);
});

restartBtn.addEventListener('click', () => {
  showScreen(hudOverlay);
  game.start();
});

scoreSubmitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const initials = usernameInput.value.toUpperCase().trim();
  if (initials.length < 2 || initials.length > 3) return;

  usernameInput.disabled = true;
  submitScoreBtn.disabled = true;
  submitScoreBtn.textContent = 'TRANSMITTING...';

  try {
    await submitScore(initials, game.score);
    submitScoreBtn.textContent = 'RECORDED';
    
    // Smooth transition to leaderboard to view position
    setTimeout(async () => {
      showScreen(leaderboardScreen);
      await renderLeaderboard();
    }, 800);
  } catch (error) {
    console.error('Submission failed:', error);
    submitScoreBtn.textContent = 'RETRY';
    submitScoreBtn.disabled = false;
    usernameInput.disabled = false;
  }
});

// Setup responsive canvas scaling
function resizeCanvas() {
  const container = document.getElementById('game-container');
  const rect = container.getBoundingClientRect();
  
  // Set drawing buffer to match layout width/height
  canvas.width = 360;
  canvas.height = 640;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
