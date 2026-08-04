export class Player {
  constructor(canvasWidth = 360, canvasHeight = 640, assets = null) {
    this.width = canvasWidth;
    this.height = canvasHeight;
    this.assets = assets;

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
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.jumpTime = 0;
    }
  }

  slide() {
    if (!this.isJumping && !this.isSliding) {
      this.isSliding = true;
      this.slideTime = 0;
    }
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

  draw(ctx) {
    const playerY = this.height * 0.85;
    const size = 32;

    ctx.save();

    // Account for jump elevation
    const drawY = playerY - this.jumpHeight;
    ctx.translate(this.playerX, drawY);

    // Apply vertical squish for sliding
    if (this.isSliding) {
      ctx.scale(1.4, 0.4);
    }

    if (this.assets && this.assets.player) {
      // Render custom player image centered
      const img = this.assets.player;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f0ff';
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      // Procedural cyan chevron fallback
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f0ff';

      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.lineTo(0, size / 4);
      ctx.lineTo(size / 2, size / 2);
      ctx.closePath();
      ctx.fill();

      // Hot pink engine flare
      ctx.shadowColor = '#ff007f';
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.arc(0, size / 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
