import { loadAudioAssets, DEFAULT_SOUND_PATHS } from "./assets.js";

/**
 * Centralized Web Audio API Sound Manager for Doodle Runner
 * Handles single AudioContext lifecycle, preloaded custom sound files (AudioBufferSourceNode),
 * procedural Web Audio API synthesis fallback, master mixing, self-disconnecting nodes,
 * sound cooldowns, tab visibility resume, mobile interaction unlocking, and optional debugging.
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.targetGain = null;
    this.isMuted = false;
    this.debug = false;

    // Active continuous sound sources
    this.bgmSource = null;
    this.gouvAlarmSource = null;
    this.gouvAlarmOsc = null;

    // Cache of preloaded AudioBuffers keyed by sound name (e.g. coin, jump)
    this.buffers = {};

    // Promise that resolves when preloadSounds() finishes
    this._preloadPromise = null;
    // Flag: BGM was requested but buffers weren't ready yet
    this._pendingBGM = false;

    // Cooldown management (in milliseconds)
    this.cooldowns = {
      coin: 45,
      click: 50,
      shoot: 80,
      jump: 100,
      slide: 100,
      destroy: 100,
      hit: 150,
      gameOver: 500,
    };
    this.lastPlayed = {};

    // Sound Volumes in Master Mix
    this.volumes = {
      coin: 0.25,
      jump: 0.35,
      slide: 0.3,
      hit: 0.5,
      shoot: 0.3,
      destroy: 0.45,
      gameOver: 0.6,
      click: 0.2,
      bgm: 0.3,
      gouv_alarm: 0.4,
    };

    this.unlocked = false;
  }

  setDebug(enabled) {
    this.debug = !!enabled;
  }

  log(...args) {
    if (this.debug || (typeof window !== "undefined" && window.AUDIO_DEBUG)) {
      console.log("[AudioManager]", ...args);
    }
  }

  init() {
    if (this.ctx) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn("Web Audio API not supported in this browser.");
        return;
      }

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.volumes.bgm || 0.3;
      this.bgmGain.connect(this.masterGain);

      this.targetGain = this.ctx.createGain();
      this.targetGain.gain.value = 0;
      this.targetGain.connect(this.masterGain);

      this.setupUnlockListeners();
      this.setupVisibilityListeners();

      this.log("AudioContext created. State:", this.ctx.state);

      // Asynchronously preload custom sound files from public/assets/
      this._preloadPromise = this.preloadSounds();
    } catch (e) {
      console.warn("Failed to initialize AudioContext:", e);
    }
  }

  async preloadSounds(paths = DEFAULT_SOUND_PATHS) {
    if (!this.ctx) return;
    try {
      const loaded = await loadAudioAssets(this.ctx, paths);
      Object.assign(this.buffers, loaded);
      this.log("Custom audio buffers preloaded:", Object.keys(this.buffers).filter(k => this.buffers[k]));

      // If playBGM() was called while buffers were still loading, start it now
      if (this._pendingBGM && this.buffers.bgm) {
        this._pendingBGM = false;
        this._startBGMSource();
      }
    } catch (e) {
      this.log(
        "Audio preloading error, falling back to Web Audio API synthesis:",
        e,
      );
    }
  }

  setupUnlockListeners() {
    const unlock = () => {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().then(() => {
          this.log(
            "AudioContext resumed via user gesture. State:",
            this.ctx.state,
          );
        });
      }
      this.unlocked = true;
    };

    // Bind on document.body with capture so overlay interactions (leaderboard
    // tabs, form inputs, team dropdown) always propagate to the unlock handler
    // even when event listeners on child elements exist.
    const target = document.body || window;
    ["pointerdown", "keydown", "touchstart", "click"].forEach((evt) => {
      target.addEventListener(evt, unlock, { capture: true, passive: true });
    });
  }

  setupVisibilityListeners() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().then(() => {
          this.log(
            "AudioContext resumed after tab returned. State:",
            this.ctx.state,
          );
        });
      }
    });
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
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

  playBGM() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    // Mark BGM as desired — if buffers haven't finished loading yet,
    // preloadSounds() will call _startBGMSource() once they're ready.
    this._pendingBGM = true;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().then(() => this._startBGMSource());
      return;
    }

    this._startBGMSource();
  }

  _startBGMSource() {
    if (this.bgmSource) return; // already playing
    const buffer = this.buffers.bgm;
    if (!buffer) {
      // Buffer not loaded yet — _pendingBGM flag will trigger start after preload
      this.log("BGM buffer not yet available, will start after preload.");
      return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.bgmGain);
      source.start(0);
      this.bgmSource = source;
      this._pendingBGM = false;
      this.log("BGM playback started.");
    } catch (e) {
      console.warn("Failed to start BGM source:", e);
    }
  }

  stopBGM() {
    this._pendingBGM = false; // Cancel any pending start
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch (e) {}
      this.bgmSource = null;
      this.log("BGM playback stopped.");
    }
  }

  startGouvSound() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    if (this.gouvAlarmSource || this.gouvAlarmOsc) return; // already active

    try {
      if (this.targetGain) {
        this.targetGain.gain.setValueAtTime(
          this.volumes.gouv_alarm || 0.4,
          this.ctx.currentTime,
        );
      }

      const buffer = this.buffers.gouv_alarm;
      if (buffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.targetGain);
        source.start(0);
        this.gouvAlarmSource = source;
        this.log("GOUV warning sound started (fixed volume).");
      } else {
        // Synthesis fallback alert siren at fixed volume and pitch
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

        osc.connect(filter);
        filter.connect(this.targetGain);
        osc.start(0);
        this.gouvAlarmOsc = osc;
        this.gouvAlarmFilter = filter;
        this.log("GOUV synth alarm started (fixed volume).");
      }
    } catch (e) {
      console.warn("Failed to start GOUV sound:", e);
    }
  }

  stopGouvSound() {
    try {
      if (this.gouvAlarmSource) {
        this.gouvAlarmSource.stop();
        this.gouvAlarmSource.disconnect();
        this.gouvAlarmSource = null;
      }
      if (this.gouvAlarmOsc) {
        this.gouvAlarmOsc.stop();
        this.gouvAlarmOsc.disconnect();
        this.gouvAlarmOsc = null;
        this.gouvAlarmFilter = null;
      }
      if (this.targetGain && this.ctx) {
        this.targetGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      this.log("GOUV sound stopped.");
    } catch (e) {
      this.gouvAlarmSource = null;
      this.gouvAlarmOsc = null;
    }
  }

  // Aliases for compatibility
  startGouvAlarm() {
    this.startGouvSound();
  }

  stopGouvAlarm() {
    this.stopGouvSound();
  }

  play(soundName) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    // If AudioContext is still suspended (browser autoplay policy),
    // resume first and defer scheduling until the context is actually running.
    // Scheduling nodes while suspended causes them to be fired at time=0 which
    // is already in the past once the clock jumps on resume — they get silently discarded.
    if (this.ctx.state === "suspended") {
      this.ctx
        .resume()
        .then(() => this._scheduleSound(soundName))
        .catch((e) => console.warn("AudioContext resume failed:", e));
      return;
    }

    this._scheduleSound(soundName);
  }

  _scheduleSound(soundName) {
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

    // Use currentTime AFTER resume has completed so the clock is valid
    const now = this.ctx.currentTime + 0.005;

    try {
      // Check if preloaded AudioBuffer exists for this sound
      const buffer = this.buffers[soundName];
      if (buffer) {
        this.playAudioBuffer(soundName, buffer, now);
        return;
      }

      // Procedural Web Audio API synthesis fallback if buffer missing/null
      this.log(
        `No audio buffer for '${soundName}', using Web Audio API synthesis fallback.`,
      );
      switch (soundName) {
        case "coin":
          this.createCoinSound(now);
          break;
        case "jump":
          this.createJumpSound(now);
          break;
        case "slide":
          this.createSlideSound(now);
          break;
        case "hit":
          this.createHitSound(now);
          break;
        case "shoot":
          this.createShootSound(now);
          break;
        case "destroy":
          this.createDestroySound(now);
          break;
        case "gameOver":
          this.createGameOverSound(now);
          break;
        case "click":
          this.createClickSound(now);
          break;
        default:
          this.log("Unknown sound effect:", soundName);
      }
    } catch (e) {
      console.warn(`Error playing sound '${soundName}':`, e);
    }
  }

  playAudioBuffer(soundName, buffer, now) {
    try {
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();

      source.buffer = buffer;
      const volume = this.volumes[soundName] || 0.3;

      gain.gain.setValueAtTime(volume, now);

      source.connect(gain);
      gain.connect(this.masterGain);

      source.start(now);

      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn(`[AudioManager] playAudioBuffer '${soundName}' failed:`, e);
    }
  }

  createCoinSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      const volume = this.volumes.coin || 0.25;

      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.0, now + 0.07); // A5

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
    } catch (e) {
      console.warn('[AudioManager] createCoinSound failed:', e);
    }
  }

  createJumpSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
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
    } catch (e) {
      console.warn('[AudioManager] createJumpSound failed:', e);
    }
  }

  createSlideSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      const volume = this.volumes.slide || 0.3;

      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);

      filter.type = "lowpass";
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
    } catch (e) {
      console.warn('[AudioManager] createSlideSound failed:', e);
    }
  }

  createHitSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      const volume = this.volumes.hit || 0.5;

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
    } catch (e) {
      console.warn('[AudioManager] createHitSound failed:', e);
    }
  }

  createShootSound(now) {
    try {
      // Wet, bubbly water balloon "splat" launch sound
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      const volume = this.volumes.shoot || 0.35;

      // Pitch drop from 520Hz down to 140Hz with a quick bubbly bend
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.14);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.14);

      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('[AudioManager] createShootSound failed:', e);
    }
  }

  createDestroySound(now) {
    try {
      // Bubbly water splash / pop impact sound
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      const volume = this.volumes.destroy || 0.45;

      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(250, now + 0.18);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.18);

      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('[AudioManager] createDestroySound failed:', e);
    }
  }

  createGameOverSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      const volume = this.volumes.gameOver || 0.6;

      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.25);
      osc.frequency.setValueAtTime(293.66, now + 0.5);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.9);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.9);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('[AudioManager] createGameOverSound failed:', e);
    }
  }

  createClickSound(now) {
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      const volume = this.volumes.click || 0.2;

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
    } catch (e) {
      console.warn('[AudioManager] createClickSound failed:', e);
    }
  }
}

export const audioManager = new AudioManager();
