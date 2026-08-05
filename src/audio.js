/**
 * Centralized Web Audio API Sound Manager for Doodle Runner
 * Handles single AudioContext lifecycle, master mixing, self-disconnecting nodes,
 * sound cooldowns, tab visibility resume, mobile interaction unlocking, and optional debugging.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.debug = false;

    // Cooldown management (in milliseconds)
    this.cooldowns = {
      coin: 45,
      jump: 100,
      slide: 100,
      hit: 150,
      gameOver: 500,
      click: 50
    };
    this.lastPlayed = {};

    // Sound Volumes in Master Mix
    this.volumes = {
      coin: 0.25,
      jump: 0.35,
      slide: 0.30,
      hit: 0.50,
      gameOver: 0.60,
      click: 0.20
    };

    this.unlocked = false;
  }

  setDebug(enabled) {
    this.debug = !!enabled;
  }

  log(...args) {
    if (this.debug || (typeof window !== 'undefined' && window.AUDIO_DEBUG)) {
      console.log('[AudioManager]', ...args);
    }
  }

  init() {
    if (this.ctx) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported in this browser.');
        return;
      }

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.setupUnlockListeners();
      this.setupVisibilityListeners();

      this.log('AudioContext created. State:', this.ctx.state);
    } catch (e) {
      console.warn('Failed to initialize AudioContext:', e);
    }
  }

  setupUnlockListeners() {
    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.log('AudioContext resumed via user gesture. State:', this.ctx.state);
        });
      }
      this.unlocked = true;
    };

    ['pointerdown', 'keydown', 'touchstart', 'click'].forEach((evt) => {
      window.addEventListener(evt, unlock, { capture: true, passive: true });
    });
  }

  setupVisibilityListeners() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.log('AudioContext resumed after tab returned. State:', this.ctx.state);
        });
      }
    });
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : 0.5;
    }
    return this.isMuted;
  }

  play(soundName) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    // Check AudioContext state
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    // Cooldown check
    const nowMs = performance.now();
    const cooldown = this.cooldowns[soundName] || 0;
    const lastTime = this.lastPlayed[soundName] || 0;

    if (nowMs - lastTime < cooldown) {
      this.log(`Skipped '${soundName}' (cooldown active)`);
      return;
    }

    this.lastPlayed[soundName] = nowMs;
    this.log(`Playing '${soundName}' at context time:`, this.ctx.currentTime);

    const now = this.ctx.currentTime + 0.005; // tiny offset for smooth Web Audio scheduling

    try {
      switch (soundName) {
        case 'coin':
          this.createCoinSound(now);
          break;
        case 'jump':
          this.createJumpSound(now);
          break;
        case 'slide':
          this.createSlideSound(now);
          break;
        case 'hit':
          this.createHitSound(now);
          break;
        case 'gameOver':
          this.createGameOverSound(now);
          break;
        case 'click':
          this.createClickSound(now);
          break;
        default:
          this.log('Unknown sound effect:', soundName);
      }
    } catch (e) {
      console.warn(`Error playing sound '${soundName}':`, e);
    }
  }

  createCoinSound(now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const volume = this.volumes.coin || 0.25;

    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.00, now + 0.07); // A5

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }

  createJumpSound(now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const volume = this.volumes.jump || 0.35;

    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.18);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.18);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }

  createSlideSound(now) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const volume = this.volumes.slide || 0.30;

    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.22);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.22);

    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }

  createHitSound(now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const volume = this.volumes.hit || 0.50;

    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.28);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.28);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }

  createGameOverSound(now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const volume = this.volumes.gameOver || 0.60;

    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(349.23, now + 0.25);
    osc.frequency.setValueAtTime(293.66, now + 0.50);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.90);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.90);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.90);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }

  createClickSound(now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const volume = this.volumes.click || 0.20;

    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    };
  }
}

export const audioManager = new AudioManager();
