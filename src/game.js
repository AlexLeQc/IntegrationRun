import { InputHandler } from './input.js';

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
    // horizon Y pushed up to 1/6 of screen height (~17% / 83% playable lanes)
    this.horizonY = this.height * (1 / 6);

    // Player state
    this.lane = 1; // 0 = Left, 1 = Middle, 2 = Right
    this.playerX = this.getLaneX(this.lane);
    this.targetPlayerX = this.playerX;
    
    // Jump physics
    this.isJumping = false;
    this.jumpTime = 0;
    this.jumpDuration = 0.72; // duration in seconds
    this.jumpHeight = 0;

    // Slide state
    this.isSliding = false;
    this.slideTime = 0;
    this.slideDuration = 0.65; // duration in seconds

    // Obstacles list
    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // seconds between spawns

    // Scrolling background grid offset
    this.gridOffset = 0;

    // Screen shake parameters
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    
    // Game loops
    this.lastTime = 0;
    this.isRunning = false;

    // Setup controls (left, right, jump, slide)
    this.input = new InputHandler(
      () => this.moveLane(-1),
      () => this.moveLane(1),
      () => this.jump(),
      () => this.slide()
    );

    // Test damage listener (Spacebar)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.isRunning) {
        this.takeDamage();
      }
    });
  }

  getLaneX(laneIndex) {
    const laneWidth = this.width / 3;
    return laneWidth * laneIndex + laneWidth / 2;
  }

  moveLane(direction) {
    if (!this.isRunning) return;
    this.lane = Math.max(0, Math.min(2, this.lane + direction));
    this.targetPlayerX = this.getLaneX(this.lane);
  }

  jump() {
    if (!this.isRunning) return;
    // Bypassed if already active
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.jumpTime = 0;
    }
  }

  slide() {
    if (!this.isRunning) return;
    // Bypassed if already active
    if (!this.isJumping && !this.isSliding) {
      this.isSliding = true;
      this.slideTime = 0;
    }
  }

  start() {
    this.isRunning = true;
    this.score = 0;
    this.scoreDecimal = 0;
    this.lives = 3;
    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5;
    this.gridOffset = 0;
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    this.isJumping = false;
    this.jumpTime = 0;
    this.jumpHeight = 0;
    this.isSliding = false;
    this.slideTime = 0;
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
    
    // Trigger screen shake
    this.shakeDuration = 0.25; // 250ms
    this.shakeIntensity = 8;

    // Trigger visual red damage flash overlay in index.html
    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.add('flash-active');
      setTimeout(() => {
        flash.classList.remove('flash-active');
      }, 100);
    }
    
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

  spawnObstacle() {
    // Choose a random lane (0, 1, 2)
    const lane = Math.floor(Math.random() * 3);
    
    // Choose hazard type
    const types = ['barrier', 'hurdle', 'beam'];
    const type = types[Math.floor(Math.random() * types.length)];

    // Speed increases slightly based on score
    const speed = 0.35 + Math.min(0.25, this.score / 25000);

    this.obstacles.push({
      lane,
      type,
      z: 0.0, // Start at horizon (depth = 0)
      speed,
      collided: false
    });
  }

  update(deltaTime) {
    // Smooth interpolation for moving between lanes
    this.playerX += (this.targetPlayerX - this.playerX) * 0.22;

    // Decrease screen shake duration
    if (this.shakeDuration > 0) {
      this.shakeDuration -= deltaTime;
    }

    // Update Jump arc physics
    if (this.isJumping) {
      this.jumpTime += deltaTime;
      if (this.jumpTime >= this.jumpDuration) {
        this.isJumping = false;
        this.jumpHeight = 0;
      } else {
        // Sine wave for smooth parabolic jump height
        this.jumpHeight = Math.sin((this.jumpTime / this.jumpDuration) * Math.PI) * 75;
      }
    }

    // Update Slide active duration
    if (this.isSliding) {
      this.slideTime += deltaTime;
      if (this.slideTime >= this.slideDuration) {
        this.isSliding = false;
      }
    }

    // Accumulate score (+10 points per second elapsed)
    this.scoreDecimal += deltaTime * 10;
    this.score = Math.floor(this.scoreDecimal);
    if (this.onUpdateHUD) {
      this.onUpdateHUD({ score: this.score, lives: this.lives });
    }

    // Scroll perspective grid lines (speed multiplier increases with score)
    const speedMultiplier = 1.0 + (this.score / 20000);
    this.gridOffset = (this.gridOffset + deltaTime * 0.45 * speedMultiplier) % 1.0;

    // Procedural Spawning
    this.spawnTimer += deltaTime;
    const dynamicInterval = Math.max(0.7, this.spawnInterval - (this.score / 18000));
    if (this.spawnTimer >= dynamicInterval) {
      this.spawnTimer = 0;
      this.spawnObstacle();
    }

    // Update and filter obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += obs.speed * speedMultiplier * deltaTime;

      // Check collision: player is located around z = 0.85 (85% down the screen)
      if (!obs.collided && obs.z >= 0.81 && obs.z <= 0.88) {
        const laneCenterX = this.getLaneX(obs.lane);
        const distance = Math.abs(this.playerX - laneCenterX);
        
        // If player is horizontally within the lane boundaries
        if (distance < this.width / 6) {
          let collided = false;
          
          if (obs.type === 'barrier') {
            collided = true; // Full barrier blocks regardless of jump/slide
          } else if (obs.type === 'hurdle') {
            // Hurdle is bypassed if player is in the air
            if (!this.isJumping) {
              collided = true;
            }
          } else if (obs.type === 'beam') {
            // Laser beam is bypassed if player is sliding underneath
            if (!this.isSliding) {
              collided = true;
            }
          }

          if (collided) {
            obs.collided = true;
            this.takeDamage();
          }
        }
      }

      // Clean up offscreen obstacles
      if (obs.z > 1.1) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  draw() {
    this.ctx.save();
    
    // Apply screen shake translation if active
    if (this.shakeDuration > 0) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(dx, dy);
    }

    // Clear screen with Synthwave deep purple
    this.ctx.fillStyle = '#0a051b';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw sky horizon gradient (up to horizonY)
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
    skyGrad.addColorStop(0, '#05020c');
    skyGrad.addColorStop(1, '#1e0c3b');
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, this.width, this.horizonY);

    // Draw retro neon sunset
    this.drawSunset();

    // Draw moving perspective grid and lanes
    this.drawGrid();

    // Draw obstacles
    this.drawObstacles();

    // Draw player ship
    this.drawPlayer();

    this.ctx.restore();
  }

  drawSunset() {
    const radius = 55;
    const sunsetX = this.width / 2;
    const sunsetY = this.horizonY;

    // Sun sits centered at the horizon with glow
    this.ctx.shadowBlur = 25;
    this.ctx.shadowColor = '#ff007f';

    const grad = this.ctx.createLinearGradient(
      sunsetX, sunsetY - radius,
      sunsetX, sunsetY
    );
    grad.addColorStop(0, '#ff007f'); // Hot pink
    grad.addColorStop(0.5, '#ffaa00'); // Orange
    grad.addColorStop(1, '#ffea00'); // Yellow

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
    this.ctx.strokeStyle = '#00f0ff'; // Neon cyan
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.horizonY);
    this.ctx.lineTo(this.width, this.horizonY);
    this.ctx.stroke();

    const vanishingX = this.width / 2;
    const vanishingY = this.horizonY;

    // Converging longitudinal lane dividers
    const bottomXs = [
      0,                  // Far Left
      this.width / 3,     // Left lane division
      (this.width / 3) * 2, // Right lane division
      this.width          // Far Right
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
      // Exponential density curve (tighter layout closer to the horizon)
      const lineZ = Math.pow((i + this.gridOffset) / numHorizontalLines, 2.5);
      if (lineZ > 1.0) continue;
      
      const y = this.horizonY + (this.height - this.horizonY) * lineZ;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  drawObstacles() {
    const vanishingX = this.width / 2;
    const vanishingY = this.horizonY;

    this.obstacles.forEach((obs) => {
      // Wait until it moves out slightly from the horizon vanishing point
      if (obs.z <= 0.05) return;

      const bottomX = this.getLaneX(obs.lane);
      
      // Interpolated center coordinates
      const x = vanishingX + (bottomX - vanishingX) * obs.z;
      const y = this.horizonY + (this.height - this.horizonY) * obs.z;

      const zScale = obs.z;
      this.ctx.shadowBlur = 10 * zScale;

      if (obs.type === 'barrier') {
        // 1. Full-Block Barrier: Tall neon pink grid-box
        const w = 42 * zScale;
        const h = 48 * zScale;
        
        this.ctx.shadowColor = '#ff007f';
        this.ctx.strokeStyle = obs.collided ? '#ffaa00' : '#ff007f';
        this.ctx.lineWidth = 1.5 + 2.5 * zScale;
        this.ctx.fillStyle = obs.collided ? 'rgba(255, 170, 0, 0.2)' : 'rgba(255, 0, 127, 0.15)';

        this.ctx.beginPath();
        this.ctx.rect(x - w / 2, y - h, w, h);
        this.ctx.fill();
        this.ctx.stroke();

        // 3D Wireframe Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 42 * zBack;
          const hBack = 48 * zBack;

          this.ctx.beginPath();
          this.ctx.rect(xBack - wBack / 2, yBack - hBack, wBack, hBack);
          this.ctx.stroke();

          // Connect corners
          this.ctx.beginPath();
          this.ctx.moveTo(x - w / 2, y); this.ctx.lineTo(xBack - wBack / 2, yBack);
          this.ctx.moveTo(x + w / 2, y); this.ctx.lineTo(xBack + wBack / 2, yBack);
          this.ctx.moveTo(x - w / 2, y - h); this.ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          this.ctx.moveTo(x + w / 2, y - h); this.ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          this.ctx.stroke();
        }
      } 
      else if (obs.type === 'hurdle') {
        // 2. Low Hurdle: Flat neon orange hurdle (requires Jump)
        const w = 46 * zScale;
        const h = 18 * zScale;

        this.ctx.shadowColor = '#ffaa00';
        this.ctx.strokeStyle = obs.collided ? '#ff007f' : '#ffaa00';
        this.ctx.lineWidth = 1.5 + 2.0 * zScale;
        this.ctx.fillStyle = obs.collided ? 'rgba(255, 0, 127, 0.2)' : 'rgba(255, 170, 0, 0.15)';

        this.ctx.beginPath();
        this.ctx.moveTo(x - w / 2, y);
        this.ctx.lineTo(x - w * 0.4, y - h);
        this.ctx.lineTo(x + w * 0.4, y - h);
        this.ctx.lineTo(x + w / 2, y);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // 3D Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 46 * zBack;
          const hBack = 18 * zBack;

          this.ctx.beginPath();
          this.ctx.moveTo(xBack - wBack / 2, yBack);
          this.ctx.lineTo(xBack - wBack * 0.4, yBack - hBack);
          this.ctx.lineTo(xBack + wBack * 0.4, yBack - hBack);
          this.ctx.lineTo(xBack + wBack / 2, yBack);
          this.ctx.closePath();
          this.ctx.stroke();

          // Connect corners
          this.ctx.beginPath();
          this.ctx.moveTo(x - w / 2, y); this.ctx.lineTo(xBack - wBack / 2, yBack);
          this.ctx.moveTo(x + w / 2, y); this.ctx.lineTo(xBack + wBack / 2, yBack);
          this.ctx.moveTo(x - w * 0.4, y - h); this.ctx.lineTo(xBack - wBack * 0.4, yBack - hBack);
          this.ctx.moveTo(x + w * 0.4, y - h); this.ctx.lineTo(xBack + wBack * 0.4, yBack - hBack);
          this.ctx.stroke();
        }
      } 
      else if (obs.type === 'beam') {
        // 3. High Overhead Beam: Neon cyan glowing laser line arch (requires Slide)
        const w = 48 * zScale;
        const h = 48 * zScale; // height of pillars
        const beamH = 14 * zScale; // beam thickness

        this.ctx.shadowColor = '#00f0ff';
        this.ctx.strokeStyle = obs.collided ? '#ff007f' : '#00f0ff';
        this.ctx.lineWidth = 1.5 + 2.0 * zScale;

        // Draw side pillars
        this.ctx.beginPath();
        this.ctx.moveTo(x - w / 2, y);
        this.ctx.lineTo(x - w / 2, y - h);
        this.ctx.moveTo(x + w / 2, y);
        this.ctx.lineTo(x + w / 2, y - h);
        this.ctx.stroke();

        // Draw horizontal laser bar
        this.ctx.fillStyle = obs.collided ? 'rgba(255, 0, 127, 0.4)' : 'rgba(0, 240, 255, 0.35)';
        this.ctx.beginPath();
        this.ctx.rect(x - w / 2, y - h, w, beamH);
        this.ctx.fill();
        this.ctx.stroke();

        // 3D Depth
        if (zScale > 0.15) {
          const zBack = zScale - 0.06 * zScale;
          const xBack = vanishingX + (bottomX - vanishingX) * zBack;
          const yBack = this.horizonY + (this.height - this.horizonY) * zBack;
          const wBack = 48 * zBack;
          const hBack = 48 * zBack;
          const beamHBack = 14 * zBack;

          this.ctx.beginPath();
          this.ctx.moveTo(xBack - wBack / 2, yBack);
          this.ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          this.ctx.moveTo(xBack + wBack / 2, yBack);
          this.ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.rect(xBack - wBack / 2, yBack - hBack, wBack, beamHBack);
          this.ctx.stroke();

          // Connect top beam corners
          this.ctx.beginPath();
          this.ctx.moveTo(x - w / 2, y - h); this.ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          this.ctx.moveTo(x + w / 2, y - h); this.ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          this.ctx.moveTo(x - w / 2, y - h + beamH); this.ctx.lineTo(xBack - wBack / 2, yBack - hBack + beamHBack);
          this.ctx.moveTo(x + w / 2, y - h + beamH); this.ctx.lineTo(xBack + wBack / 2, yBack - hBack + beamHBack);
          this.ctx.stroke();
        }
      }

      this.ctx.shadowBlur = 0;
    });
  }

  drawPlayer() {
    const playerY = this.height * 0.85;
    const size = 32;

    this.ctx.save();

    // Account for jump elevation
    const drawY = playerY - this.jumpHeight;
    this.ctx.translate(this.playerX, drawY);

    // Apply vertical squish for sliding
    if (this.isSliding) {
      this.ctx.scale(1.4, 0.4);
    }

    this.ctx.shadowBlur = 18;
    this.ctx.shadowColor = '#00f0ff';

    // Glowing cyan chevron
    this.ctx.fillStyle = '#00f0ff';
    this.ctx.beginPath();
    this.ctx.moveTo(0, -size / 2);
    this.ctx.lineTo(-size / 2, size / 2);
    this.ctx.lineTo(0, size / 4);
    this.ctx.lineTo(size / 2, size / 2);
    this.ctx.closePath();
    this.ctx.fill();

    // Hot pink engine flare
    this.ctx.shadowColor = '#ff007f';
    this.ctx.fillStyle = '#ff007f';
    this.ctx.beginPath();
    this.ctx.arc(0, size / 4, 4, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  loop(time) {
    if (!this.isRunning) return;

    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame((time) => this.loop(time));
  }
}
