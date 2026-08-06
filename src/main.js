import './style.css';
import { Game } from './game.js';
import { getTopScores, qualifiesForLeaderboard, submitHighScore } from './supabase.js';
import { showScreen, updateHUD, renderLeaderboard, showGameOverState } from './ui.js';
import { audioManager } from './audio.js';

// DOM elements
const mainMenu = document.getElementById('main-menu');
const hudOverlay = document.getElementById('hud-overlay');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const gameOverScreen = document.getElementById('game-over-screen');

const startBtn = document.getElementById('start-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');

// Regular Game Over buttons (State 1)
const retryBtnRegular = document.getElementById('retry-btn-regular');
const mainMenuBtnRegular = document.getElementById('main-menu-btn-regular');
const leaderboardBtnRegular = document.getElementById('leaderboard-btn-regular');

// High Score submit form (State 2)
const scoreSubmitForm = document.getElementById('score-submit-form');
const usernameInput = document.getElementById('username');
const submitScoreBtn = document.getElementById('submit-score-btn');
const submitStatusMsg = document.getElementById('submit-status-msg');

const canvas = document.getElementById('game-canvas');

// Initialize audio system
audioManager.init();

// Game instance
let game;

// Trigger Game Over screen with Arcade qualification logic
async function onGameOver(score) {
  try {
    const qualification = await qualifiesForLeaderboard(score);
    showGameOverState(qualification.qualifies, { score, rank: qualification.rank });
    showScreen(gameOverScreen);
  } catch (e) {
    console.error('Error during qualification check:', e);
    showGameOverState(false, { score, rank: null });
    showScreen(gameOverScreen);
  }
}

// Initialize the game instance
game = new Game(canvas, updateHUD, onGameOver);

// Bind event listeners with audio triggers
startBtn.addEventListener('click', () => {
  audioManager.play('click');
  showScreen(hudOverlay);
  game.start();
});

leaderboardBtn.addEventListener('click', async () => {
  audioManager.play('click');
  showScreen(leaderboardScreen);
  await renderLeaderboard(getTopScores);
});

leaderboardBackBtn.addEventListener('click', () => {
  audioManager.play('click');
  showScreen(mainMenu);
});

// State 1 Action Buttons
if (retryBtnRegular) {
  retryBtnRegular.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(hudOverlay);
    game.start();
  });
}

if (mainMenuBtnRegular) {
  mainMenuBtnRegular.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(mainMenu);
  });
}

if (leaderboardBtnRegular) {
  leaderboardBtnRegular.addEventListener('click', async () => {
    audioManager.play('click');
    showScreen(leaderboardScreen);
    await renderLeaderboard(getTopScores);
  });
}

// State 2 Score Submission Form
scoreSubmitForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = usernameInput.value.toUpperCase().trim();
  if (name.length < 2 || name.length > 12) return;

  usernameInput.disabled = true;
  submitScoreBtn.disabled = true;
  submitScoreBtn.textContent = 'SAVING...';

  try {
    const res = await submitHighScore(name, game.score);

    if (res && res.success) {
      if (submitStatusMsg) {
        submitStatusMsg.textContent = '✔ SCORE SUBMITTED!';
        submitStatusMsg.classList.remove('hidden');
      }

      // Smooth transition to leaderboard showing highlighted score
      setTimeout(async () => {
        showScreen(leaderboardScreen);
        await renderLeaderboard(getTopScores, { username: res.username, score: game.score });
      }, 750);
    } else {
      submitScoreBtn.textContent = 'RETRY';
      submitScoreBtn.disabled = false;
      usernameInput.disabled = false;
    }
  } catch (error) {
    console.error('Submission failed:', error);
    submitScoreBtn.textContent = 'RETRY';
    submitScoreBtn.disabled = false;
    usernameInput.disabled = false;
  }
});

// Setup responsive canvas scaling
function resizeCanvas() {
  canvas.width = 360;
  canvas.height = 640;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
