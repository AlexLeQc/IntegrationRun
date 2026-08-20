import { InputHandler } from './input.js';
import { Player, drawWaterBalloon } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { CoinManager } from './collectibles.js';
import { ScreenShake, triggerDamageFlash } from './ui.js';
import { loadAssets } from './assets.js';
import { audioManager } from './audio.js';

export class Game {
  constructor(canvas, onUpdateHUD, onGameOver) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onUpdateHUD = onUpdateHUD;
    this.onGameOver = onGameOver;

    // Internal base dimensions (maintaining 9:16 aspect ratio)
    this.width = 360;
    this.height = 640;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Game stats
    this.score = 0;
    this.scoreDecimal = 0;
    this.lives = 3;

    // Perspective coordinates
    // Horizon Y pushed up to 1/6 of screen height (~17% / 83% playable lanes)
    this.horizonY = this.height * (1 / 6);

    // Assets container
    this.assets = null;

    // Active laser projectiles fired by the player
    this.projectiles = [];
    this._lastShot = 0; // shot cooldown timestamp

    // Instantiate game sub-modules
    this.player = new Player(this.width, this.height);
    this.obstacleManager = new ObstacleManager(this.width, this.height, this.horizonY);
    this.coinManager = new CoinManager(this.width, this.height, this.horizonY);
    this.screenShake = new ScreenShake();

    // Scrolling background grid offset
    this.gridOffset = 0;

    // Game loop state
    this.lastTime = 0;
    this.isRunning = false;

    // Reset lastTime on tab resume to avoid massive dt spikes
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.lastTime = 0; // will be re-seeded on next rAF tick
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Preload image assets asynchronously
    this.initAssets();

    // Setup input handler — Spacebar & quick tap fire a water balloon
    this.input = new InputHandler(
      () => this.player.moveLane(-1),
      () => this.player.moveLane(1),
      () => this.player.jump(),
      () => this.player.slide(),
      () => this.fireProjectile()
    );
  }

  async initAssets() {
    try {
      this.assets = await loadAssets();
      this.player.setAssets(this.assets);
      this.obstacleManager.setAssets(this.assets);
      this.coinManager.setAssets(this.assets);
    } catch (e) {
      console.warn('Asset initialization warning:', e);
    }
  }

  start() {
    this.isRunning = true;
    this.score = 0;
    this.scoreDecimal = 0;
    this.lives = 3;
    this.gridOffset = 0;
    this.projectiles = [];
    this._lastShot = 0;

    this.player.reset();
    this.obstacleManager.reset();
    this.coinManager.reset();
    this.screenShake.reset();

    this.lastTime = performance.now();

    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    // Start background music
    audioManager.playBGM();

    requestAnimationFrame((time) => this.loop(time));
  }

  stop() {
    this.isRunning = false;
    audioManager.stopBGM();
    audioManager.stopGouvSound();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  takeDamage() {
    this.lives = Math.max(0, this.lives - 1);

    // Play hit sound effect
    audioManager.play('hit');

    // Screen shake & visual flash
    this.screenShake.trigger(0.25, 8);
    triggerDamageFlash();

    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    if (this.lives <= 0) {
      this.stop();
      audioManager.play('gameOver');
      if (this.onGameOver) {
        this.onGameOver(this.score);
      }
    }
  }

  fireProjectile() {
    if (!this.isRunning) return;
    const now = performance.now();
    if (now - this._lastShot < 200) return; // 200ms shot cooldown
    this._lastShot = now;

    this.projectiles.push({
      lane: this.player.lane,
      z: this.player.z - 0.03 // launch slightly in front of player
    });
    audioManager.play('shoot');
  }

  update(deltaTime) {
    // 1. Update Player
    this.player.update(deltaTime);

    // 2. Update Screen Shake
    this.screenShake.update(deltaTime);

    // 3. Accumulate survival score (+10 points/sec)
    this.scoreDecimal += deltaTime * 10;
    this.score = Math.floor(this.scoreDecimal);
    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    // 4. Scroll perspective background grid
    const speedMultiplier = 1.0 + (this.score / 20000);
    this.gridOffset = (this.gridOffset + deltaTime * 0.45 * speedMultiplier) % 1.0;

    // 5. Update Obstacles and smart coin spawning
    this.obstacleManager.update(
      deltaTime,
      this.score,
      speedMultiplier,
      (coinObj) => this.coinManager.addCoin(coinObj)
    );

    // 6. Update Collectibles & Coin pickups
    this.coinManager.update(
      deltaTime,
      this.score,
      speedMultiplier,
      this.player,
      () => {
        this.scoreDecimal += 100;
        this.score = Math.floor(this.scoreDecimal);
        if (this.onUpdateHUD) {
          this.onUpdateHUD({ score: this.score, lives: this.lives });
        }
      }
    );

    // 7. Check Collisions between Player and Hazards
    this.obstacleManager.checkCollisions(this.player, (obs, ox, oy) => {
      this.takeDamage();
      const particleColor = obs.type === 'beam' ? '#00f0ff' : obs.type === 'gouv' ? '#FF2D55' : '#ff007f';
      this.coinManager.spawnParticles(ox, oy, particleColor, 14);
    });

    // 8. Update laser projectiles
    const PROJ_SPEED = 2.2;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.z -= PROJ_SPEED * deltaTime;

      if (proj.z <= 0.04) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check for obstacle or GOUV in same lane within hit range
      let hit = false;
      for (let j = this.obstacleManager.obstacles.length - 1; j >= 0; j--) {
        const obs = this.obstacleManager.obstacles[j];
        if (obs.lane !== proj.lane) continue;
        // Projectile travels from player.z toward 0; obstacle must be ahead of current projectile position
        if (obs.z > this.player.z) continue; // behind player, skip
        if (Math.abs(obs.z - proj.z) > 0.12) continue; // not close enough yet

        hit = true;
        if (obs.type === 'gouv') {
          // GOUV destroyed — award bonus points and spawn splash FX
          const result = this.obstacleManager.destroyGouv(j);
          if (result) {
            this.scoreDecimal += 250;
            this.score = Math.floor(this.scoreDecimal);
            if (this.onUpdateHUD) this.onUpdateHUD({ score: this.score, lives: this.lives });
            audioManager.play('destroy');
            // Blue water splash particles
            this.coinManager.spawnParticles(result.x, result.y, '#00f0ff', 16);
            this.coinManager.spawnParticles(result.x, result.y, '#0288D1', 12);
            this.coinManager.spawnParticles(result.x, result.y, '#E0F7FA', 8);
          }
        }
        // Standard obstacle blocks the laser — no reward
        this.projectiles.splice(i, 1);
        break;
      }
    }
  }

  draw() {
    this.ctx.save();

    // Apply screen shake translation if active
    this.screenShake.applyTransform(this.ctx);

    if (this.assets && this.assets.background) {
      // Clear canvas and render custom background image at full brightness and contrast
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(this.assets.background, 0, 0, this.width, this.height);
    } else {
      // Procedural Fallback Background (when no image asset is loaded)
      this.ctx.fillStyle = '#FAF8F5';
      this.ctx.fillRect(0, 0, this.width, this.height);

      const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
      skyGrad.addColorStop(0, '#E3F2FD');
      skyGrad.addColorStop(1, '#FAF8F5');
      this.ctx.fillStyle = skyGrad;
      this.ctx.fillRect(0, 0, this.width, this.horizonY);

      this.drawSun();
    }

    // Draw grid overlay (only used for procedural fallback)
    this.drawGrid();

    // Unified World Depth Sorting Pipeline
    const renderQueue = [];

    // 1. Add active obstacles
    this.obstacleManager.obstacles.forEach((obs) => {
      if (obs.z > 0.05) {
        renderQueue.push({
          z: obs.z,
          typePriority: 2,
          render: () => this.obstacleManager.drawSingleObstacle(this.ctx, obs)
        });
      }
    });

    // 2. Add active coins and coin shadows
    this.coinManager.coins.forEach((coin) => {
      if (coin.z > 0.05 && !coin.collected) {
        if (coin.heightOffset > 0) {
          renderQueue.push({
            z: coin.z,
            typePriority: 0, // Shadows draw under coins/obstacles at same Z
            render: () => this.coinManager.drawSingleCoinShadow(this.ctx, coin)
          });
        }
        renderQueue.push({
          z: coin.z,
          typePriority: 1, // Coin disk
          render: () => this.coinManager.drawSingleCoin(this.ctx, coin)
        });
      }
    });

    // 3. Add player at fixed world depth z = 0.85
    renderQueue.push({
      z: this.player.z,
      typePriority: 3,
      render: () => this.player.draw(this.ctx, this.width, this.height, this.horizonY)
    });

    // 4. Add active laser projectiles
    this.projectiles.forEach((proj) => {
      if (proj.z > 0.04) {
        renderQueue.push({
          z: proj.z,
          typePriority: 4,
          render: () => this.drawProjectile(proj)
        });
      }
    });

    // Sort renderQueue ascending by world depth z (farther objects z small draw first, closer objects z large draw last)
    renderQueue.sort((a, b) => {
      if (Math.abs(a.z - b.z) > 0.0001) {
        return a.z - b.z;
      }
      return a.typePriority - b.typePriority;
    });

    // Execute sorted render queue
    renderQueue.forEach((item) => item.render());

    // Draw particles on top of sorted queue
    this.coinManager.particles.forEach((p) => {
      const lifeRatio = p.life / p.maxLife;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.restore();
  }

  drawProjectile(proj) {
    drawWaterBalloon(this.ctx, proj, this.width, this.height, this.horizonY);
  }

  drawSun() {
    const radius = 45;
    const sunX = this.width / 2;
    const sunY = this.horizonY;

    this.ctx.save();

    // Yellow crayon sun fill
    this.ctx.fillStyle = '#FFCC00';
    this.ctx.strokeStyle = '#2C2C2E';
    this.ctx.lineWidth = 2.5;

    // Draw hand-drawn sun body with slight organic wobbly arc
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, radius, Math.PI, 0);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw radiating crayon rays
    const numRays = 7;
    for (let i = 0; i < numRays; i++) {
      const angle = Math.PI + (Math.PI / (numRays - 1)) * i;
      const rayInner = radius + 6;
      const rayOuter = radius + 18;

      const x1 = sunX + Math.cos(angle) * rayInner;
      const y1 = sunY + Math.sin(angle) * rayInner;
      const x2 = sunX + Math.cos(angle) * rayOuter;
      const y2 = sunY + Math.sin(angle) * rayOuter;

      this.ctx.strokeStyle = '#FF3B30';
      this.ctx.lineWidth = 3;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawGrid() {
    // When custom background image is loaded, the background handles the horizon line, lateral lane boundaries, and grid lines directly.
    if (this.assets && this.assets.background) {
      return;
    }

    this.ctx.save();

    // Procedural horizon pencil line
    this.ctx.strokeStyle = '#2C2C2E';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.horizonY);
    this.ctx.lineTo(this.width, this.horizonY);
    this.ctx.stroke();

    const vanishingX = this.width / 2;
    const vanishingY = this.horizonY;

    // Converging longitudinal lane dividers (Graphite / Crayon strokes)
    const bottomXs = [
      0,
      this.width / 3,
      (this.width / 3) * 2,
      this.width
    ];

    bottomXs.forEach((bx, index) => {
      this.ctx.strokeStyle = (index === 1 || index === 2) ? '#007AFF' : '#2C2C2E';
      this.ctx.lineWidth = (index === 1 || index === 2) ? 2.5 : 3.5;

      if (index === 1 || index === 2) {
        this.ctx.setLineDash([8, 8]);
      } else {
        this.ctx.setLineDash([]);
      }

      this.ctx.beginPath();
      const midX = (bx + vanishingX) / 2 + Math.sin(index * 2) * 1.5;
      const midY = (this.height + vanishingY) / 2;

      this.ctx.moveTo(bx, this.height);
      this.ctx.quadraticCurveTo(midX, midY, vanishingX, vanishingY);
      this.ctx.stroke();
    });

    this.ctx.setLineDash([]);

    // Draw scrolling perspective horizontal graphite pencil lines
    this.ctx.strokeStyle = 'rgba(44, 44, 46, 0.28)';
    this.ctx.lineWidth = 1.5;
    const numHorizontalLines = 14;
    for (let i = 0; i <= numHorizontalLines; i++) {
      const lineZ = Math.pow((i + this.gridOffset) / numHorizontalLines, 2.5);
      if (lineZ > 1.0) continue;

      const y = this.horizonY + (this.height - this.horizonY) * lineZ;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  loop(time) {
    if (!this.isRunning) return;

    // Seed lastTime on the very first tick (or after tab resume reset)
    if (this.lastTime === 0) {
      this.lastTime = time;
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    const rawDt = (time - this.lastTime) / 1000;

    // Guard against massive time spikes (tab suspension, debugger pauses, etc.).
    // Clamp dt to 100ms so the spawn timer and physics never jump ahead wildly.
    const deltaTime = Math.min(rawDt, 0.1);

    this.lastTime = time;

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }
}
