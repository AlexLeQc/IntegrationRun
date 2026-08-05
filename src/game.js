import { InputHandler } from './input.js';
import { Player } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { CoinManager } from './collectibles.js';
import { ScreenShake, triggerDamageFlash } from './ui.js';
import { loadAssets } from './assets.js';

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

    // Preload image assets asynchronously
    this.initAssets();

    // Setup input handler
    this.input = new InputHandler(
      () => this.player.moveLane(-1),
      () => this.player.moveLane(1),
      () => this.player.jump(),
      () => this.player.slide()
    );

    // Test damage listener (Spacebar)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.isRunning) {
        this.takeDamage();
      }
    });
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

    this.player.reset();
    this.obstacleManager.reset();
    this.coinManager.reset();
    this.screenShake.reset();

    this.lastTime = performance.now();

    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    requestAnimationFrame((time) => this.loop(time));
  }

  stop() {
    this.isRunning = false;
  }

  takeDamage() {
    this.lives = Math.max(0, this.lives - 1);

    // Screen shake & visual flash
    this.screenShake.trigger(0.25, 8);
    triggerDamageFlash();

    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    if (this.lives <= 0) {
      this.stop();
      if (this.onGameOver) {
        this.onGameOver(this.score);
      }
    }
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
      const particleColor = obs.type === 'beam' ? '#00f0ff' : '#ff007f';
      this.coinManager.spawnParticles(ox, oy, particleColor, 14);
    });
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

    // Draw coins & particles
    this.coinManager.draw(this.ctx);

    // Draw hazards/obstacles
    this.obstacleManager.draw(this.ctx);

    // Draw player ship
    this.player.draw(this.ctx);

    this.ctx.restore();
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

    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }
}
