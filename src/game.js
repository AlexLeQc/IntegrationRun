import { InputHandler } from './input.js';
import { Player } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { CoinManager } from './collectibles.js';
import { ScreenShake, triggerDamageFlash } from './ui.js';

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

    // Clear screen with Synthwave deep purple
    this.ctx.fillStyle = '#0a051b';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw sky horizon gradient
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
    skyGrad.addColorStop(0, '#05020c');
    skyGrad.addColorStop(1, '#1e0c3b');
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, this.width, this.horizonY);

    // Draw retro sunset
    this.drawSunset();

    // Draw moving perspective grid and lanes
    this.drawGrid();

    // Draw coins & particles
    this.coinManager.draw(this.ctx);

    // Draw hazards/obstacles
    this.obstacleManager.draw(this.ctx);

    // Draw player ship
    this.player.draw(this.ctx);

    this.ctx.restore();
  }

  drawSunset() {
    const radius = 55;
    const sunsetX = this.width / 2;
    const sunsetY = this.horizonY;

    this.ctx.shadowBlur = 25;
    this.ctx.shadowColor = '#ff007f';

    const grad = this.ctx.createLinearGradient(
      sunsetX, sunsetY - radius,
      sunsetX, sunsetY
    );
    grad.addColorStop(0, '#ff007f');
    grad.addColorStop(0.5, '#ffaa00');
    grad.addColorStop(1, '#ffea00');

    this.ctx.beginPath();
    this.ctx.arc(sunsetX, sunsetY, radius, Math.PI, 0);
    this.ctx.fillStyle = grad;
    this.ctx.fill();

    this.ctx.shadowBlur = 0;

    // Sun scanline cutouts
    this.ctx.strokeStyle = '#0a051b';
    this.ctx.lineWidth = 3;
    for (let y = sunsetY - 3; y > sunsetY - radius; y -= 8) {
      this.ctx.beginPath();
      this.ctx.moveTo(sunsetX - radius, y);
      this.ctx.lineTo(sunsetX + radius, y);
      this.ctx.stroke();
    }
  }

  drawGrid() {
    // Draw horizon line
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.horizonY);
    this.ctx.lineTo(this.width, this.horizonY);
    this.ctx.stroke();

    const vanishingX = this.width / 2;
    const vanishingY = this.horizonY;

    // Converging longitudinal lane dividers
    const bottomXs = [
      0,
      this.width / 3,
      (this.width / 3) * 2,
      this.width
    ];

    bottomXs.forEach((bx, index) => {
      this.ctx.strokeStyle = (index === 1 || index === 2) ? '#ff007f' : '#00f0ff';
      this.ctx.lineWidth = (index === 1 || index === 2) ? 2 : 4;

      if (index === 1 || index === 2) {
        this.ctx.setLineDash([12, 12]);
      } else {
        this.ctx.setLineDash([]);
      }

      this.ctx.beginPath();
      this.ctx.moveTo(bx, this.height);
      this.ctx.lineTo(vanishingX, vanishingY);
      this.ctx.stroke();
    });

    this.ctx.setLineDash([]);

    // Draw scrolling perspective horizontal grid lines
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
    this.ctx.lineWidth = 1;
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
