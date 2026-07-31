import './style.css';
import { Game } from './game.js';
import { fetchLeaderboard, submitScore } from './supabase.js';
import { showScreen, updateHUD, renderLeaderboard } from './ui.js';

// DOM elements
const mainMenu = document.getElementById('main-menu');
const hudOverlay = document.getElementById('hud-overlay');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const gameOverScreen = document.getElementById('game-over-screen');

const startBtn = document.getElementById('start-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
const restartBtn = document.getElementById('restart-btn');

const finalScoreVal = document.getElementById('final-score-val');
const scoreSubmitForm = document.getElementById('score-submit-form');
const usernameInput = document.getElementById('username');
const submitScoreBtn = document.getElementById('submit-score-btn');
const canvas = document.getElementById('game-canvas');

// Game instance
let game;

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

// Initialize the game instance
game = new Game(canvas, updateHUD, onGameOver);

// Bind event listeners
startBtn.addEventListener('click', () => {
  showScreen(hudOverlay);
  game.start();
});

leaderboardBtn.addEventListener('click', async () => {
  showScreen(leaderboardScreen);
  await renderLeaderboard(fetchLeaderboard);
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
      await renderLeaderboard(fetchLeaderboard);
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
  canvas.width = 360;
  canvas.height = 640;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
