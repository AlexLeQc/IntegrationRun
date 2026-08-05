import { projectLane } from './perspective.js';
import { audioManager } from './audio.js';

export class CoinManager {
  constructor(width = 360, height = 640, horizonY = 640 * (1 / 6), assets = null) {
    this.width = width;
    this.height = height;
    this.horizonY = horizonY;
    this.assets = assets;

    this.coins = [];
    this.particles = [];

    this.coinSpawnTimer = 0;
    this.coinSpawnInterval = 1.8; // seconds between coin patterns
  }

  setAssets(assets) {
    this.assets = assets;
  }

  getLaneX(laneIndex) {
    const laneWidth = this.width / 3;
    return laneWidth * laneIndex + laneWidth / 2;
  }

  reset() {
    this.coins = [];
    this.particles = [];
    this.coinSpawnTimer = 0;
  }

  addCoin(coinObj) {
    this.coins.push(coinObj);
  }

  spawnCoinLine(score) {
    const lane = Math.floor(Math.random() * 3);
    const count = 3 + Math.floor(Math.random() * 3); // 3 to 5 coins
    const speed = 0.35 + Math.min(0.25, score / 25000);
    const spacing = 0.07;
    const heightOffset = Math.random() > 0.7 ? 70 : 0;

    for (let i = 0; i < count; i++) {
      this.coins.push({
        lane,
        z: -i * spacing,
        speed,
        heightOffset,
        collected: false
      });
    }
  }

  spawnParticles(x, y, color, count) {
    const crayonColors = ['#FF3B30', '#FFCC00', '#007AFF', '#34C759', '#FF2D55'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      const maxLife = 0.3 + Math.random() * 0.3;
      const particleColor = color === '#ffea00' || color === '#FFCC00' ? crayonColors[Math.floor(Math.random() * crayonColors.length)] : color;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: particleColor,
        life: maxLife,
        maxLife,
        size: 1.5 + Math.random() * 2.5
      });
    }
  }

  playCoinSound() {
    audioManager.play('coin');
  }

  update(deltaTime, score, speedMultiplier, player, onCollectCoin) {
    // Coin Spawning Patterns
    this.coinSpawnTimer += deltaTime;
    if (this.coinSpawnTimer >= this.coinSpawnInterval) {
      this.coinSpawnTimer = 0;
      if (Math.random() > 0.4) {
        this.spawnCoinLine(score);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update and check collection for coins in 3D world space
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z += coin.speed * speedMultiplier * deltaTime;

      if (coin.z > 0.05) {
        const proj = projectLane(this.width, this.height, this.horizonY, coin.lane, coin.heightOffset, coin.z);

        // Collection overlap around player world position plane (z ~ 0.80 - 0.88)
        if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.88) {
          const laneCenterX = this.getLaneX(coin.lane);
          const distance = Math.abs(player.playerX - laneCenterX);

          if (distance < this.width / 6) {
            let matchesHeight = false;

            if (coin.heightOffset > 0) {
              if (player.isJumping && player.jumpHeight > 20) {
                matchesHeight = true;
              }
            } else {
              if (!player.isJumping || player.jumpHeight < 25) {
                matchesHeight = true;
              }
            }

            if (matchesHeight) {
              coin.collected = true;
              this.spawnParticles(proj.x, proj.y, '#ffea00', 8);
              this.playCoinSound();

              if (onCollectCoin) {
                onCollectCoin(coin);
              }
            }
          }
        }
      }

      // Clean up offscreen coins
      if (coin.z > 1.1) {
        this.coins.splice(i, 1);
      }
    }
  }

  drawSingleCoinShadow(ctx, coin) {
    if (coin.z <= 0.05 || coin.collected || coin.heightOffset <= 0) return;

    // Ground projection directly below airborne coin
    const groundProj = projectLane(this.width, this.height, this.horizonY, coin.lane, 0, coin.z);
    const zScale = groundProj.zScale;
    const baseRadius = 13 * zScale;
    const pulse = 1.0 + Math.sin(Date.now() / 90) * 0.08;

    // Become slightly smaller as coin heightOffset increases
    const heightFactor = Math.max(0.4, 1.0 - (coin.heightOffset / 200));
    const shadowRx = baseRadius * 1.1 * pulse * heightFactor;
    const shadowRy = baseRadius * 0.35 * pulse * heightFactor;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(groundProj.x, groundProj.y, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSingleCoin(ctx, coin) {
    if (coin.z <= 0.05 || coin.collected) return;

    const proj = projectLane(this.width, this.height, this.horizonY, coin.lane, coin.heightOffset, coin.z);
    const x = proj.x;
    const y = proj.y;
    const zScale = proj.zScale;

    const baseRadius = 13 * zScale;
    const spinScale = Math.sin(Date.now() / 150);
    const rx = baseRadius * Math.abs(spinScale);
    const ry = baseRadius;
    const pulse = 1.0 + Math.sin(Date.now() / 90) * 0.08;

    ctx.save();
    ctx.shadowBlur = 0;

    // Draw Coin Asset or Rich Procedural Golden Coin
    if (this.assets && this.assets.coin) {
      const w = rx * pulse * 2;
      const h = ry * pulse * 2;
      ctx.drawImage(this.assets.coin, x - w / 2, y - h / 2, w, h);
    } else {
      // Procedural Rich Glowing Golden Coin
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#2C2C2E';
      ctx.lineWidth = 1.5 + zScale;

      // Outer Coin Disk
      ctx.beginPath();
      ctx.ellipse(x, y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner Bright Gold Highlight Ring
      ctx.strokeStyle = '#FFF2A3';
      ctx.lineWidth = 1.2 * zScale;
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.65 * pulse, ry * 0.65 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Center Gold Core
      ctx.fillStyle = '#D48800';
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.3 * pulse, ry * 0.3 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  draw(ctx) {
    // 1. Draw Ground Shadows
    this.coins.forEach((coin) => {
      this.drawSingleCoinShadow(ctx, coin);
    });

    // 2. Draw Coin Disks
    this.coins.forEach((coin) => {
      this.drawSingleCoin(ctx, coin);
    });

    // 3. Draw Particles
    this.particles.forEach((p) => {
      const lifeRatio = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
