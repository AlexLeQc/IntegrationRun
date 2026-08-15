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
const tutorialScreen = document.getElementById('tutorial-screen');
const scheduleScreen = document.getElementById('schedule-screen');

const startBtn = document.getElementById('start-btn');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');
const tutorialBtn = document.getElementById('tutorial-btn');
const tutorialBackBtn = document.getElementById('tutorial-back-btn');
const scheduleBtn = document.getElementById('schedule-btn');
const scheduleBackBtn = document.getElementById('schedule-back-btn');

// Leaderboard Tabs
const tabIndividual = document.getElementById('tab-individual');
const tabTeams = document.getElementById('tab-teams');
let currentTab = 'individual';

// Regular Game Over buttons (State 1)
const retryBtnRegular = document.getElementById('retry-btn-regular');
const mainMenuBtnRegular = document.getElementById('main-menu-btn-regular');
const leaderboardBtnRegular = document.getElementById('leaderboard-btn-regular');

// High Score submit form (State 2)
const scoreSubmitForm = document.getElementById('score-submit-form');
const usernameInput = document.getElementById('username');
const teamSelect = document.getElementById('team-select');
const submitScoreBtn = document.getElementById('submit-score-btn');
const submitStatusMsg = document.getElementById('submit-status-msg');
const skipSubmitRetryBtn = document.getElementById('skip-submit-retry-btn');
const skipSubmitMenuBtn = document.getElementById('skip-submit-menu-btn');

const canvas = document.getElementById('game-canvas');

// AudioManager initializes lazily on first play() call (requires user gesture first).
// Do NOT call audioManager.init() here — it creates AudioContext before any user interaction
// which puts it into 'suspended' state. Instead, init happens automatically on first play().

// Global gesture-based audio context resume (redundant safety net).
// Ensures ANY user interaction across the entire document (including overlay tabs,
// form inputs, team dropdown selections) will re-awaken a suspended AudioContext.
["pointerdown", "touchstart", "click", "keydown"].forEach((evt) => {
  document.addEventListener(evt, () => audioManager.resume(), {
    capture: true,
    passive: true,
  });
});

// Game instance
let game;

// Helper to switch leaderboard tabs
async function setLeaderboardTab(tab, highlightInfo = null) {
  currentTab = tab;
  if (tabIndividual) tabIndividual.classList.toggle('active', tab === 'individual');
  if (tabTeams) tabTeams.classList.toggle('active', tab === 'teams');
  await renderLeaderboard(getTopScores, highlightInfo, currentTab);
}

// Trigger Game Over screen with Arcade qualification logic
async function onGameOver(score) {
  try {
    const qualification = await qualifiesForLeaderboard(score);
    console.log(`[GAMEOVER] score=${score} qualifies=${qualification.qualifies} rank=${qualification.rank}`);
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

// Tab toggle listeners
if (tabIndividual) {
  tabIndividual.addEventListener('click', async () => {
    audioManager.play('click');
    await setLeaderboardTab('individual');
  });
}

if (tabTeams) {
  tabTeams.addEventListener('click', async () => {
    audioManager.play('click');
    await setLeaderboardTab('teams');
  });
}

// Bind event listeners with audio triggers
startBtn.addEventListener('click', () => {
  audioManager.play('click');
  showScreen(hudOverlay);
  game.start();
});

leaderboardBtn.addEventListener('click', async () => {
  audioManager.play('click');
  audioManager.stopBGM();
  showScreen(leaderboardScreen);
  await setLeaderboardTab(currentTab);
});

leaderboardBackBtn.addEventListener('click', () => {
  audioManager.play('click');
  audioManager.stopBGM();
  showScreen(mainMenu);
});

if (tutorialBtn) {
  tutorialBtn.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(tutorialScreen);
  });
}

if (tutorialBackBtn) {
  tutorialBackBtn.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(mainMenu);
  });
}

if (scheduleBtn) {
  scheduleBtn.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(scheduleScreen);
  });
}

if (scheduleBackBtn) {
  scheduleBackBtn.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(mainMenu);
  });
}

// Schedule Day Tab Switching
const scheduleTabs = document.querySelectorAll('#schedule-screen .schedule-tab');
const schedulePanels = document.querySelectorAll('#schedule-screen .schedule-panel');
scheduleTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    audioManager.play('click');
    const day = tab.dataset.day;
    scheduleTabs.forEach((t) => t.classList.toggle('active', t === tab));
    schedulePanels.forEach((p) =>
      p.classList.toggle('active', p.id === 'panel-' + day),
    );
  });
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
    audioManager.stopBGM();
    showScreen(mainMenu);
  });
}

if (leaderboardBtnRegular) {
  leaderboardBtnRegular.addEventListener('click', async () => {
    audioManager.play('click');
    audioManager.stopBGM();
    showScreen(leaderboardScreen);
    await setLeaderboardTab(currentTab);
  });
}

// State 2 Secondary Bypass Action Buttons
if (skipSubmitRetryBtn) {
  skipSubmitRetryBtn.addEventListener('click', () => {
    audioManager.play('click');
    showScreen(hudOverlay);
    game.start();
  });
}

if (skipSubmitMenuBtn) {
  skipSubmitMenuBtn.addEventListener('click', () => {
    audioManager.play('click');
    audioManager.stopBGM();
    showScreen(mainMenu);
  });
}

// State 2 Score Submission Form — Finding 4: 5-second cooldown guard
let lastSubmitTime = 0;
scoreSubmitForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const now = Date.now();
  if (now - lastSubmitTime < 5000) return; // 5-second submission cooldown
  lastSubmitTime = now;

  const name = usernameInput.value.toUpperCase().trim();
  const team = teamSelect ? teamSelect.value : '';

  if (name.length < 2 || name.length > 12) return;
  if (!team) return;

  usernameInput.disabled = true;
  if (teamSelect) teamSelect.disabled = true;
  submitScoreBtn.disabled = true;
  submitScoreBtn.textContent = 'ENREGISTREMENT...';

  try {
    const res = await submitHighScore(name, team, game.score);

    if (res && res.success) {
      if (submitStatusMsg) {
        submitStatusMsg.textContent = '✔ SCORE SOUMIS !';
        submitStatusMsg.classList.remove('hidden');
      }

      // Smooth transition to leaderboard showing highlighted score
      setTimeout(async () => {
        audioManager.stopBGM();
        showScreen(leaderboardScreen);
        await setLeaderboardTab('individual', { username: res.username, score: game.score, team: res.team });
      }, 750);
    } else {
      submitScoreBtn.textContent = 'RÉESSAYER';
      submitScoreBtn.disabled = false;
      usernameInput.disabled = false;
      if (teamSelect) teamSelect.disabled = false;
    }
  } catch (error) {
    console.error('Submission failed:', error);
    submitScoreBtn.textContent = 'RÉESSAYER';
    submitScoreBtn.disabled = false;
    usernameInput.disabled = false;
    if (teamSelect) teamSelect.disabled = false;
  }
});

// Setup responsive canvas scaling
function resizeCanvas() {
  canvas.width = 360;
  canvas.height = 640;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

