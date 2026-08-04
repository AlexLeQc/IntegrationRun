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
    const heightOffset = Math.random() > 0.7 ? 45 : 0;

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
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.00, now + 0.08);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Web Audio synthesis failed:', e);
    }
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

    const vanishingX = this.width / 2;

    // Update and check collection for coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z += coin.speed * speedMultiplier * deltaTime;

      if (coin.z > 0.05) {
        const bottomX = this.getLaneX(coin.lane);
        const cx = vanishingX + (bottomX - vanishingX) * coin.z;
        const cy = this.horizonY + (this.height - this.horizonY) * coin.z - coin.heightOffset * coin.z;

        // Collection overlap around player position (z ~ 0.85)
        if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.88) {
          const distance = Math.abs(player.playerX - cx);

          if (distance < this.width / 6) {
            let matchesHeight = false;

            if (coin.heightOffset > 0) {
              if (player.isJumping && player.jumpHeight > 25) {
                matchesHeight = true;
              }
            } else {
              if (!player.isJumping || player.jumpHeight < 25) {
                matchesHeight = true;
              }
            }

            if (matchesHeight) {
              coin.collected = true;
              this.spawnParticles(cx, cy, '#ffea00', 8);
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

  draw(ctx) {
    const vanishingX = this.width / 2;

    // Draw Coins
    this.coins.forEach((coin) => {
      if (coin.z <= 0.05 || coin.collected) return;

      const bottomX = this.getLaneX(coin.lane);
      const x = vanishingX + (bottomX - vanishingX) * coin.z;
      const y = this.horizonY + (this.height - this.horizonY) * coin.z - coin.heightOffset * coin.z;

      const zScale = coin.z;
      const baseRadius = 13 * zScale;

      const spinScale = Math.sin(Date.now() / 150);
      const rx = baseRadius * Math.abs(spinScale);
      const ry = baseRadius;

      const pulse = 1.0 + Math.sin(Date.now() / 90) * 0.08;

      ctx.save();
      ctx.shadowBlur = 0;

      if (this.assets && this.assets.coin) {
        // Draw custom coin image with horizontal spin scaling & pulse
        const w = rx * pulse * 2;
        const h = ry * pulse * 2;
        ctx.drawImage(this.assets.coin, x - w / 2, y - h / 2, w, h);
      } else {
        // Procedural Hand-Drawn Golden 5-Point Star Sticker
        ctx.strokeStyle = '#2C2C2E';
        ctx.lineWidth = 1.5 + zScale;
        ctx.fillStyle = '#FFCC00';

        const outerR = ry * pulse;
        const innerR = outerR * 0.45;
        const points = 5;

        ctx.beginPath();
        for (let p = 0; p < points * 2; p++) {
          const r = p % 2 === 0 ? outerR : innerR;
          const angle = (p * Math.PI) / points - Math.PI / 2;
          const sx = x + Math.cos(angle) * r * Math.abs(spinScale);
          const sy = y + Math.sin(angle) * r;
          if (p === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner crayon hatch detail line
        ctx.strokeStyle = '#FF9500';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(x, y, innerR * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });

    // Draw Particles
    this.particles.forEach((p) => {
      const lifeRatio = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
