import { projectLane } from './perspective.js';

export class ObstacleManager {
  constructor(width = 360, height = 640, horizonY = 640 * (1 / 6), assets = null) {
    this.width = width;
    this.height = height;
    this.horizonY = horizonY;
    this.assets = assets;

    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // base seconds between spawns
  }

  setAssets(assets) {
    this.assets = assets;
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
          heightOffset: 70, // requires jump
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
              const proj = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, obs.z);
              onCollision(obs, proj.x, proj.y);
            }
          }
        }
      }
    }

    return collisions;
  }

  drawSingleObstacle(ctx, obs) {
    if (obs.z <= 0.05) return;

    const proj = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, obs.z);
    const x = proj.x;
    const y = proj.y;
    const zScale = proj.zScale;

    ctx.shadowBlur = 0;

    const imageAsset = this.assets && (this.assets[obs.type] || this.assets.obstacle);

    if (obs.type === 'barrier') {
      const w = (this.width / 3) * zScale;
      const aspect = (imageAsset && imageAsset.height > 0) ? (imageAsset.height / imageAsset.width) : (48 / 42);
      const h = w * aspect;

      if (imageAsset) {
        ctx.drawImage(imageAsset, x - w / 2, y - h, w, h);
      } else {
        // Hand-Drawn Cardboard Box Barrier
        ctx.strokeStyle = '#2C2C2E';
        ctx.lineWidth = 1.5 + 2.5 * zScale;
        ctx.fillStyle = obs.collided ? '#FF3B30' : '#D2B48C';

        // Front Face
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, h);
        ctx.fill();
        ctx.stroke();

        // Cardboard tape strips
        ctx.fillStyle = '#E5C494';
        ctx.beginPath();
        ctx.rect(x - w * 0.15, y - h, w * 0.3, h);
        ctx.fill();
        ctx.stroke();

        // 3D Box Perspective Flaps/Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const projBack = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, zBack);
          const xBack = projBack.x;
          const yBack = projBack.y;
          const wBack = (this.width / 3) * projBack.zScale;
          const hBack = wBack * aspect;

          ctx.fillStyle = '#C2A37B';
          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - h);
          ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.lineTo(x + w / 2, y - h);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + w / 2, y - h);
          ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.lineTo(xBack + wBack / 2, yBack);
          ctx.lineTo(x + w / 2, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (obs.type === 'hurdle') {
      const w = (this.width / 3) * zScale;
      const aspect = (imageAsset && imageAsset.height > 0) ? (imageAsset.height / imageAsset.width) : (20 / 46);
      const h = w * aspect;

      if (imageAsset) {
        ctx.drawImage(imageAsset, x - w / 2, y - h, w, h);
      } else {
        // Hand-Drawn Pencil Fence / Hurdle
        ctx.strokeStyle = '#2C2C2E';
        ctx.lineWidth = 1.5 + 2.0 * zScale;

        // Main Yellow Pencil Body Bar
        ctx.fillStyle = obs.collided ? '#FF3B30' : '#FFCC00';
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, h * 0.6);
        ctx.fill();
        ctx.stroke();

        // Pink Eraser End
        ctx.fillStyle = '#FF2D55';
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w * 0.2, h * 0.6);
        ctx.fill();
        ctx.stroke();

        // Pencil Legs (Posts)
        ctx.fillStyle = '#2C2C2E';
        ctx.beginPath();
        ctx.rect(x - w * 0.4, y - h * 0.4, w * 0.1, h * 1.4);
        ctx.rect(x + w * 0.3, y - h * 0.4, w * 0.1, h * 1.4);
        ctx.fill();

        // 3D Depth Lines
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const projBack = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, zBack);
          const xBack = projBack.x;
          const yBack = projBack.y;
          const wBack = (this.width / 3) * projBack.zScale;
          const hBack = wBack * aspect;

          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - h); ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.moveTo(x + w / 2, y - h); ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.stroke();
        }
      }
    } else if (obs.type === 'beam') {
      const w = (this.width / 3) * zScale;
      const aspect = (imageAsset && imageAsset.height > 0) ? (imageAsset.height / imageAsset.width) : 1.0;
      const h = w * aspect;
      const beamH = 14 * zScale;

      if (imageAsset) {
        ctx.drawImage(imageAsset, x - w / 2, y - h, w, h);
      } else {
        // Hand-Drawn Ink Splatter Laser Arch
        ctx.strokeStyle = '#2C2C2E';
        ctx.lineWidth = 1.5 + 2.0 * zScale;

        // Ink Pillars
        ctx.fillStyle = '#2C2C2E';
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w * 0.12, h);
        ctx.rect(x + w * 0.38, y - h, w * 0.12, h);
        ctx.fill();

        // Sky Blue / Red Ink Laser Splatter Bar
        ctx.fillStyle = obs.collided ? '#FF3B30' : '#007AFF';
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, beamH);
        ctx.fill();
        ctx.stroke();

        // Ink Splatter Doodles
        ctx.beginPath();
        ctx.arc(x - w * 0.2, y - h + beamH / 2, beamH * 0.4, 0, Math.PI * 2);
        ctx.arc(x + w * 0.2, y - h + beamH / 2, beamH * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0055CC';
        ctx.fill();

        // 3D Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const projBack = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, zBack);
          const xBack = projBack.x;
          const yBack = projBack.y;
          const wBack = (this.width / 3) * projBack.zScale;
          const hBack = wBack * aspect;

          ctx.beginPath();
          ctx.moveTo(x - w / 2, y - h); ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          ctx.moveTo(x + w / 2, y - h); ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          ctx.stroke();
        }
      }
    }

    ctx.shadowBlur = 0;
  }

  draw(ctx) {
    this.obstacles.forEach((obs) => {
      this.drawSingleObstacle(ctx, obs);
    });
  }
}
