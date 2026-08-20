import { projectLane } from './perspective.js';
import { audioManager } from './audio.js';

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
    this._emptyTrackTimer = 0; // health-check timer
    audioManager.stopGouvSound();
  }

  spawnObstacle(score, onSpawnCoin) {
    const lane = Math.floor(Math.random() * 3);
    // GOUV targets spawn ~15% of the time; rest are standard obstacle types
    const rand = Math.random();
    const type = rand < 0.15 ? 'gouv' : ['barrier', 'hurdle', 'beam'][Math.floor(Math.random() * 3)];
    const speed = 0.35 + Math.min(0.25, score / 25000);

    const obs = {
      lane,
      type,
      z: 0.0,
      speed,
      collided: false
    };

    this.obstacles.push(obs);

    if (type === 'gouv') {
      audioManager.startGouvSound();
    }

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
    // --- Hardened Spawn Interval -----------------------------------------------
    // Original difficulty curve preserved exactly. Wrapped in Math.max as a
    // safety net so NaN or a corrupted score value cannot produce a negative
    // or zero interval and cause an infinite spawn loop.
    const currentInterval = Math.max(0.7, this.spawnInterval - (score / 18000));

    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= currentInterval) {
      this.spawnTimer = 0;
      this.spawnObstacle(score, onSpawnCoin);
    }

    // --- Update obstacles movement along z-axis ---------------------------------
    // Iterate in reverse so splice(i,1) during cleanup doesn't skip elements.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += obs.speed * speedMultiplier * deltaTime;

      // Clean up offscreen obstacles
      if (obs.z > 1.1) {
        const removed = this.obstacles.splice(i, 1)[0];
        if (removed && removed.type === 'gouv') {
          if (!this.obstacles.some(o => o.type === 'gouv')) {
            audioManager.stopGouvSound();
          }
        }
      }
    }

    // --- Debug Health-Check: force spawn if track has been empty too long --------
    // Fires only when no obstacles are visible and we've waited > 2 × maxInterval.
    const maxInterval = this.spawnInterval; // 1.5 s (upper bound)
    if (this.obstacles.length === 0) {
      this._emptyTrackTimer = (this._emptyTrackTimer || 0) + deltaTime;
      if (this._emptyTrackTimer > 2 * maxInterval) {
        this._emptyTrackTimer = 0;
        this.spawnTimer = 0;
        this.spawnObstacle(score, onSpawnCoin);
        console.warn('[ObstacleManager] Force-spawned obstacle — track was empty for > 2× maxInterval');
      }
    } else {
      this._emptyTrackTimer = 0;
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
          } else if (obs.type === 'gouv') {
            collided = true; // GOUV always hits if not shot down
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
    // Validate that the asset is fully loaded before using it; fall back to procedural canvas otherwise.
    const assetReady = imageAsset && imageAsset.complete && imageAsset.naturalWidth > 0;

    if (obs.type === 'barrier') {
      const w = (this.width / 3) * zScale;
      const aspect = assetReady ? (imageAsset.height / imageAsset.width) : (48 / 42);
      const h = w * aspect;

      if (assetReady) {
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
      const aspect = assetReady ? (imageAsset.height / imageAsset.width) : (20 / 46);
      const h = w * aspect;

      if (assetReady) {
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
      const aspect = assetReady ? (imageAsset.height / imageAsset.width) : 1.0;
      const h = w * aspect;
      const beamH = 14 * zScale;

      if (assetReady) {
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
    } else if (obs.type === 'gouv') {
      const w = (this.width / 3) * zScale;
      const gouvAsset = this.assets && this.assets.gouv;
      const gouvAssetReady = gouvAsset && gouvAsset.complete && gouvAsset.naturalWidth > 0;
      const aspect = gouvAssetReady ? (gouvAsset.height / gouvAsset.width) : 1.2;
      const h = w * aspect;

      if (gouvAssetReady) {
        ctx.drawImage(gouvAsset, x - w / 2, y - h, w, h);
      } else {
        // Hot-pink / magenta procedural fallback box
        ctx.fillStyle = obs.collided ? '#FF3B30' : '#FF2D55';
        ctx.strokeStyle = '#2C2C2E';
        ctx.lineWidth = 1.5 + 2.0 * zScale;
        ctx.beginPath();
        ctx.rect(x - w / 2, y - h, w, h);
        ctx.fill();
        ctx.stroke();

        // White crosshair target doodle
        const cx = x;
        const cy = y - h * 0.55;
        const cr = Math.min(w, h) * 0.28;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, 1.5 * zScale);
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - cr * 1.6, cy);
        ctx.lineTo(cx + cr * 1.6, cy);
        ctx.moveTo(cx, cy - cr * 1.6);
        ctx.lineTo(cx, cy + cr * 1.6);
        ctx.stroke();

        // Inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, cr * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;
  }

  /**
   * Destroys a GOUV target at the given index. Returns screen position { x, y } for particle FX.
   */
  destroyGouv(index) {
    if (index >= 0 && index < this.obstacles.length) {
      const obs = this.obstacles[index];
      const proj = projectLane(this.width, this.height, this.horizonY, obs.lane, 0, obs.z);
      this.obstacles.splice(index, 1);
      if (!this.obstacles.some((o) => o.type === 'gouv')) {
        audioManager.stopGouvSound();
      }
      return { x: proj.x, y: proj.y };
    }
    return null;
  }

  draw(ctx) {
    this.obstacles.forEach((obs) => {
      this.drawSingleObstacle(ctx, obs);
    });
  }
}
