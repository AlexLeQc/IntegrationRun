import { projectPosition } from './perspective.js';
import { audioManager } from './audio.js';

export class Player {
  constructor(canvasWidth = 360, canvasHeight = 640, horizonY = 640 * (1 / 6), assets = null) {
    this.width = canvasWidth;
    this.height = canvasHeight;
    this.horizonY = horizonY;
    this.assets = assets;

    // Fixed world depth on track
    this.z = 0.85;

    // Lane state (0 = Left, 1 = Middle, 2 = Right)
    this.lane = 1;
    this.playerX = this.getLaneX(this.lane);
    this.targetPlayerX = this.playerX;

    // Jump physics
    this.isJumping = false;
    this.jumpTime = 0;
    this.jumpDuration = 0.72; // seconds
    this.jumpHeight = 0;

    // Slide state
    this.isSliding = false;
    this.slideTime = 0;
    this.slideDuration = 0.65; // seconds
  }

  setAssets(assets) {
    this.assets = assets;
  }

  getLaneX(laneIndex) {
    const laneWidth = this.width / 3;
    return laneWidth * laneIndex + laneWidth / 2;
  }

  moveLane(direction) {
    this.lane = Math.max(0, Math.min(2, this.lane + direction));
    this.targetPlayerX = this.getLaneX(this.lane);
  }

  jump() {
    // Slide-to-Jump Cancel: cancel active slide state and restore normal scale
    if (this.isSliding) {
      this.isSliding = false;
      this.slideTime = 0;
    }

    // Initiate fresh jump arc trajectory
    if (!this.isJumping) {
      this.isJumping = true;
      this.jumpTime = 0;
      this.jumpHeight = 0;
      audioManager.play('jump');
    }
  }

  slide() {
    // Jump-to-Slide Cancel: cancel mid-jump arc and snap immediately to ground level
    if (this.isJumping) {
      this.isJumping = false;
      this.jumpTime = 0;
      this.jumpHeight = 0;
    }

    // Activate/restart Slide state with a full slide timer reset
    this.isSliding = true;
    this.slideTime = 0;
    audioManager.play('slide');
  }

  reset() {
    this.lane = 1;
    this.playerX = this.getLaneX(this.lane);
    this.targetPlayerX = this.playerX;
    this.isJumping = false;
    this.jumpTime = 0;
    this.jumpHeight = 0;
    this.isSliding = false;
    this.slideTime = 0;
  }

  update(deltaTime) {
    // Smooth horizontal interpolation between lanes
    this.playerX += (this.targetPlayerX - this.playerX) * 0.22;

    // Jump arc physics
    if (this.isJumping) {
      this.jumpTime += deltaTime;
      if (this.jumpTime >= this.jumpDuration) {
        this.isJumping = false;
        this.jumpHeight = 0;
      } else {
        this.jumpHeight = Math.sin((this.jumpTime / this.jumpDuration) * Math.PI) * 75;
      }
    }

    // Slide active duration
    if (this.isSliding) {
      this.slideTime += deltaTime;
      if (this.slideTime >= this.slideDuration) {
        this.isSliding = false;
      }
    }
  }

  draw(ctx, width = this.width, height = this.height, horizonY = this.horizonY) {
    const proj = projectPosition(width, height, horizonY, this.playerX, this.jumpHeight, this.z);
    const laneWidthAtZ = (width / 3) * proj.zScale;
    const size = laneWidthAtZ * 0.75; // 75% of lane width at zScale

    ctx.save();
    ctx.translate(proj.x, proj.y);

    // Apply vertical squish for sliding
    if (this.isSliding) {
      ctx.scale(1.4, 0.4);
    }

    if (this.assets && this.assets.player) {
      // Render custom player image centered while maintaining aspect ratio
      const img = this.assets.player;
      const aspect = img.height > 0 ? img.height / img.width : 1.0;
      const imgW = size;
      const imgH = imgW * aspect;
      ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
    } else {
      // Procedural Hand-Drawn Paper Airplane / Doodle Chevron
      ctx.strokeStyle = '#2C2C2E';
      ctx.lineWidth = 2.5;

      // Outer Paper Airplane Body
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.lineTo(-size * 0.55, size * 0.5);
      ctx.lineTo(0, size * 0.15);
      ctx.lineTo(size * 0.55, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing fold line
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.lineTo(0, size * 0.5);
      ctx.stroke();

      // Sky Blue crayon wing stripe
      ctx.fillStyle = '#007AFF';
      ctx.beginPath();
      ctx.moveTo(-size * 0.25, 0);
      ctx.lineTo(-size * 0.45, size * 0.4);
      ctx.lineTo(-size * 0.1, size * 0.1);
      ctx.closePath();
      ctx.fill();

      // Crayon Red right wing stripe
      ctx.fillStyle = '#FF3B30';
      ctx.beginPath();
      ctx.moveTo(size * 0.25, 0);
      ctx.lineTo(size * 0.45, size * 0.4);
      ctx.lineTo(size * 0.1, size * 0.1);
      ctx.closePath();
      ctx.fill();

      // Yellow thruster doodle spark
      ctx.fillStyle = '#FFCC00';
      ctx.beginPath();
      ctx.arc(0, size * 0.4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Renders an active water balloon projectile traveling down a track lane toward the horizon.
 */
export function drawWaterBalloon(ctx, proj, width = 360, height = 640, horizonY = 640 / 6) {
  const laneWidth = width / 3;
  const posX = laneWidth * proj.lane + laneWidth / 2;
  const vanishingX = width / 2;
  const zScale = proj.z;

  const x = vanishingX + (posX - vanishingX) * zScale;
  const y = horizonY + (height - horizonY) * zScale;
  const radius = Math.max(3, 14 * zScale);

  ctx.save();

  // Water balloon outer glow and body
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 10 * zScale;

  // Blue water balloon radial gradient (#00f0ff -> #0288D1)
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
  grad.addColorStop(0, '#E0F7FA');
  grad.addColorStop(0.45, '#00F0FF');
  grad.addColorStop(1, '#0288D1');

  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0055CC';
  ctx.lineWidth = Math.max(1, 1.5 * zScale);

  // Teardrop / rounded water balloon shape
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Balloon tie knot at top/back
  const knotRadius = Math.max(1, radius * 0.28);
  ctx.fillStyle = '#0288D1';
  ctx.beginPath();
  ctx.arc(x, y - radius * 0.85, knotRadius, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight shine
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x - radius * 0.32, y - radius * 0.32, radius * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

