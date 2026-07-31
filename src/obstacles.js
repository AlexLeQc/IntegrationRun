export class ObstacleManager {
  constructor(width = 360, height = 640, horizonY = 640 * (1 / 6)) {
    this.width = width;
    this.height = height;
    this.horizonY = horizonY;

    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // base seconds between spawns
  }

  getLaneX(laneIndex) {
    const laneWidth = this.width / 3;
    return laneWidth * laneIndex + laneWidth / 2;
  }

  reset() {
    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5;
  }

  spawnObstacle(score, onSpawnCoin) {
    const lane = Math.floor(Math.random() * 3);
    const types = ['barrier', 'hurdle', 'beam'];
    const type = types[Math.floor(Math.random() * types.length)];
    const speed = 0.35 + Math.min(0.25, score / 25000);

    const obs = {
      lane,
      type,
      z: 0.0,
      speed,
      collided: false
    };

    this.obstacles.push(obs);

    // Smart Coin placement above hurdles or under beams
    if (onSpawnCoin) {
      if (type === 'hurdle') {
        onSpawnCoin({
          lane,
          z: 0.0,
          speed,
          heightOffset: 45, // requires jump
          collected: false
        });
      } else if (type === 'beam') {
        onSpawnCoin({
          lane,
          z: 0.0,
          speed,
          heightOffset: 0, // ground under laser arch
          collected: false
        });
      }
    }

    return obs;
  }

  update(deltaTime, score, speedMultiplier, onSpawnCoin) {
    // Spawning Hazards
    this.spawnTimer += deltaTime;
    const dynamicInterval = Math.max(0.7, this.spawnInterval - (score / 18000));
    if (this.spawnTimer >= dynamicInterval) {
      this.spawnTimer = 0;
      this.spawnObstacle(score, onSpawnCoin);
    }

    // Update obstacles movement along z-axis
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += obs.speed * speedMultiplier * deltaTime;

      // Clean up offscreen obstacles
      if (obs.z > 1.1) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  checkCollisions(player, onCollision) {
    const collisions = [];

    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];

      if (!obs.collided && obs.z >= 0.81 && obs.z <= 0.88) {
        const laneCenterX = this.getLaneX(obs.lane);
        const distance = Math.abs(player.playerX - laneCenterX);

        if (distance < this.width / 6) {
          let collided = false;

          if (obs.type === 'barrier') {
            collided = true;
          } else if (obs.type === 'hurdle') {
            if (!player.isJumping) collided = true;
          } else if (obs.type === 'beam') {
            if (!player.isSliding) collided = true;
          }

          if (collided) {
            obs.collided = true;
            collisions.push(obs);

            if (onCollision) {
              const vanishingX = this.width / 2;
              const bottomX = laneCenterX;
              const ox = vanishingX + (bottomX - vanishingX) * obs.z;
              const oy = this.horizonY + (this.height - this.horizonY) * obs.z;
              onCollision(obs, ox, oy);
            }
          }
        }
      }
    }

    return collisions;
  }

  draw(ctx) {
    const vanishingX = this.width / 2;

    this.obstacles.forEach((obs) => {
      if (obs.z <= 0.05) return;

      const bottomX = this.getLaneX(obs.lane);
      const x = vanishingX + (bottomX - vanishingX) * obs.z;
      const y = this.horizonY + (this.height - this.horizonY) * obs.z;

      const zScale = obs.z;
      ctx.shadowBlur = 10 * zScale;

      if (obs.type === 'barrier') {
        // Full-Block Barrier: Tall neon pink grid-box
        const w = 42 * zScale;
        const h = 48 * zScale;

        ctx.shadowColor = '#ff007f';
        ctx.strokeStyle = obs.collided ? '#ffaa00' : '#ff007f';
        ctx.lineWidth = 1.5 + 2.5 * zScale;
        ctx.fillStyle = obs.collided ? 'rgba(255, 170, 0, 0.2)' : 'rgba(255, 0, 127, 0.15)';

        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, h);
        ctx.fill();
        ctx.stroke();

        // 3D Wireframe Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 42 * zBack;
          const hBack = 48 * zBack;

          ctx.beginPath();
          ctx.rect(xBack - wBack / 2, yBack - hBack, wBack, hBack);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - w / 2, y); ctx.lineTo(xBack - wBack / 2, yBack);
          ctx.moveTo(x + w / 2, y); ctx.lineTo(xBack + wBack / 2, yBack);
          ctx.moveTo(x - w / 2, y - h); ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.moveTo(x + w / 2, y - h); ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.stroke();
        }
      } else if (obs.type === 'hurdle') {
        // Low Hurdle: Flat neon orange hurdle
        const w = 46 * zScale;
        const h = 18 * zScale;

        ctx.shadowColor = '#ffaa00';
        ctx.strokeStyle = obs.collided ? '#ff007f' : '#ffaa00';
        ctx.lineWidth = 1.5 + 2.0 * zScale;
        ctx.fillStyle = obs.collided ? 'rgba(255, 0, 127, 0.2)' : 'rgba(255, 170, 0, 0.15)';

        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x - w * 0.4, y - h);
        ctx.lineTo(x + w * 0.4, y - h);
        ctx.lineTo(x + w / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3D Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 46 * zBack;
          const hBack = 18 * zBack;

          ctx.beginPath();
          ctx.moveTo(xBack - wBack / 2, yBack);
          ctx.lineTo(xBack - wBack * 0.4, yBack - hBack);
          ctx.lineTo(xBack + wBack * 0.4, yBack - hBack);
          ctx.lineTo(xBack + wBack / 2, yBack);
          ctx.closePath();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - w / 2, y); ctx.lineTo(xBack - wBack / 2, yBack);
          ctx.moveTo(x + w / 2, y); ctx.lineTo(xBack + wBack / 2, yBack);
          ctx.moveTo(x - w * 0.4, y - h); ctx.lineTo(xBack - wBack * 0.4, yBack - hBack);
          ctx.moveTo(x + w * 0.4, y - h); ctx.lineTo(xBack + wBack * 0.4, yBack - hBack);
          ctx.stroke();
        }
      } else if (obs.type === 'beam') {
        // High Overhead Beam: Neon cyan laser arch
        const w = 48 * zScale;
        const h = 48 * zScale;
        const beamH = 14 * zScale;

        ctx.shadowColor = '#00f0ff';
        ctx.strokeStyle = obs.collided ? '#ff007f' : '#00f0ff';
        ctx.lineWidth = 1.5 + 2.0 * zScale;

        // Pillars
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x - w / 2, y - h);
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y - h);
        ctx.stroke();

        // Laser bar
        ctx.fillStyle = obs.collided ? 'rgba(255, 0, 127, 0.4)' : 'rgba(0, 240, 255, 0.35)';
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, beamH);
        ctx.fill();
        ctx.stroke();

        // 3D Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 48 * zBack;
          const hBack = 48 * zBack;
          const beamHBack = 14 * zBack;

          ctx.beginPath();
          ctx.moveTo(xBack - wBack / 2, yBack);
          ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.moveTo(xBack + wBack / 2, yBack);
          ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.stroke();

          ctx.beginPath();
          ctx.rect(xBack - wBack / 2, yBack - hBack, wBack, beamHBack);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - h); ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.moveTo(x + w / 2, y - h); ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.moveTo(x - w / 2, y - h + beamH); ctx.lineTo(xBack - wBack / 2, yBack - hBack + beamHBack);
          ctx.moveTo(x + w / 2, y - h + beamH); ctx.lineTo(xBack + wBack / 2, yBack - hBack + beamHBack);
          ctx.stroke();
        }
      }

      ctx.shadowBlur = 0;
    });
  }
}
