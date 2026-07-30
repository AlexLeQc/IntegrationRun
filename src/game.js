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

    // Game assets arrays
    this.obstacles = [];
    this.coins = [];
    this.particles = [];

    // Spawning timers
    this.spawnTimer = 0;
    this.spawnInterval = 1.5; // seconds between spawns
    this.coinSpawnTimer = 0;
    this.coinSpawnInterval = 1.8; // seconds between coin patterns

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
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.jumpTime = 0;
    }
  }

  slide() {
    if (!this.isRunning) return;
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
    this.coins = [];
    this.particles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.5;
    this.coinSpawnTimer = 0;
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
    const lane = Math.floor(Math.random() * 3);
    const types = ['barrier', 'hurdle', 'beam'];
    const type = types[Math.floor(Math.random() * types.length)];
    const speed = 0.35 + Math.min(0.25, this.score / 25000);

    this.obstacles.push({
      lane,
      type,
      z: 0.0,
      speed,
      collided: false
    });

    // Smart Coin placement above hurdles or below beams
    if (type === 'hurdle') {
      this.coins.push({
        lane,
        z: 0.0, // Staggered at same depth
        speed,
        heightOffset: 45, // requires a jump to collect
        collected: false
      });
    } else if (type === 'beam') {
      this.coins.push({
        lane,
        z: 0.0,
        speed,
        heightOffset: 0, // on the ground underneath the laser arch
        collected: false
      });
    }
  }

  spawnCoinLine() {
    // Choose a lane and count
    const lane = Math.floor(Math.random() * 3);
    const count = 3 + Math.floor(Math.random() * 3); // 3 to 5 coins
    const speed = 0.35 + Math.min(0.25, this.score / 25000);
    const spacing = 0.07;
    // Set a height pattern (flat on ground, or elevated jump path)
    const heightOffset = Math.random() > 0.7 ? 45 : 0;

    for (let i = 0; i < count; i++) {
      this.coins.push({
        lane,
        z: -i * spacing, // Staggered in a clean line behind
        speed,
        heightOffset,
        collected: false
      });
    }
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      const maxLife = 0.3 + Math.random() * 0.3;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
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
      // High retro pitch chime (D5 -> A5)
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

    // Spawning Hazards
    this.spawnTimer += deltaTime;
    const dynamicInterval = Math.max(0.7, this.spawnInterval - (this.score / 18000));
    if (this.spawnTimer >= dynamicInterval) {
      this.spawnTimer = 0;
      this.spawnObstacle();
    }

    // Spawning Coins (Lines/Patterns)
    this.coinSpawnTimer += deltaTime;
    if (this.coinSpawnTimer >= this.coinSpawnInterval) {
      this.coinSpawnTimer = 0;
      // Only spawn a line if we have space (e.g. 50% chance, and not directly blocking)
      if (Math.random() > 0.4) {
        this.spawnCoinLine();
      }
    }

    // Update and filter particles
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

    // Update and filter coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z += coin.speed * speedMultiplier * deltaTime;

      if (coin.z > 0.05) {
        const bottomX = this.getLaneX(coin.lane);
        const cx = vanishingX + (bottomX - vanishingX) * coin.z;
        const cy = this.horizonY + (this.height - this.horizonY) * coin.z - coin.heightOffset * coin.z;

        // Check collection overlap: player is located around z = 0.85
        if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.88) {
          const distance = Math.abs(this.playerX - cx);
          
          if (distance < this.width / 6) {
            let matchesHeight = false;

            if (coin.heightOffset > 0) {
              // High coin: requires jumping
              if (this.isJumping && this.jumpHeight > 25) {
                matchesHeight = true;
              }
            } else {
              // Ground coin: can collect if not jumping too high
              if (!this.isJumping || this.jumpHeight < 25) {
                matchesHeight = true;
              }
            }

            if (matchesHeight) {
              coin.collected = true;
              this.scoreDecimal += 100; // +100 bonus points
              this.score = Math.floor(this.scoreDecimal);
              
              this.spawnParticles(cx, cy, '#ffea00', 8); // Gold sparks
              this.playCoinSound();

              if (this.onUpdateHUD) {
                this.onUpdateHUD({ score: this.score, lives: this.lives });
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

    // Update and filter obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += obs.speed * speedMultiplier * deltaTime;

      // Check collision
      if (!obs.collided && obs.z >= 0.81 && obs.z <= 0.88) {
        const laneCenterX = this.getLaneX(obs.lane);
        const distance = Math.abs(this.playerX - laneCenterX);
        
        if (distance < this.width / 6) {
          let collided = false;
          
          if (obs.type === 'barrier') {
            collided = true;
          } else if (obs.type === 'hurdle') {
            if (!this.isJumping) collided = true;
          } else if (obs.type === 'beam') {
            if (!this.isSliding) collided = true;
          }

          if (collided) {
            obs.collided = true;
            this.takeDamage();
            
            // Spawn explosion particles
            const bottomX = this.getLaneX(obs.lane);
            const ox = vanishingX + (bottomX - vanishingX) * obs.z;
            const oy = this.horizonY + (this.height - this.horizonY) * obs.z;
            const color = obs.type === 'beam' ? '#00f0ff' : '#ff007f';
            this.spawnParticles(ox, oy, color, 14);
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

    // Draw coins
    this.drawCoins();

    // Draw obstacles
    this.drawObstacles();

    // Draw particles
    this.drawParticles();

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
      if (obs.z <= 0.05) return;

      const bottomX = this.getLaneX(obs.lane);
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

          this.ctx.beginPath();
          this.ctx.moveTo(x - w / 2, y); this.ctx.lineTo(xBack - wBack / 2, yBack);
          this.ctx.moveTo(x + w / 2, y); this.ctx.lineTo(xBack + wBack / 2, yBack);
          this.ctx.moveTo(x - w / 2, y - h); this.ctx.lineTo(xBack - wBack / 2, yBack - hBack);
          this.ctx.moveTo(x + w / 2, y - h); this.ctx.lineTo(xBack + wBack / 2, yBack - hBack);
          this.ctx.stroke();
        }
      } 
      else if (obs.type === 'hurdle') {
        // 2. Low Hurdle: Flat neon orange hurdle
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

          this.ctx.beginPath();
          this.ctx.moveTo(x - w / 2, y); this.ctx.lineTo(xBack - wBack / 2, yBack);
          this.ctx.moveTo(x + w / 2, y); this.ctx.lineTo(xBack + wBack / 2, yBack);
          this.ctx.moveTo(x - w * 0.4, y - h); this.ctx.lineTo(xBack - wBack * 0.4, yBack - hBack);
          this.ctx.moveTo(x + w * 0.4, y - h); this.ctx.lineTo(xBack + wBack * 0.4, yBack - hBack);
          this.ctx.stroke();
        }
      } 
      else if (obs.type === 'beam') {
        // 3. High Overhead Beam: Neon cyan laser arch
        const w = 48 * zScale;
        const h = 48 * zScale; // height of pillars
        const beamH = 14 * zScale;

        this.ctx.shadowColor = '#00f0ff';
        this.ctx.strokeStyle = obs.collided ? '#ff007f' : '#00f0ff';
        this.ctx.lineWidth = 1.5 + 2.0 * zScale;

        // Pillars
        this.ctx.beginPath();
        this.ctx.moveTo(x - w / 2, y);
        this.ctx.lineTo(x - w / 2, y - h);
        this.ctx.moveTo(x + w / 2, y);
        this.ctx.lineTo(x + w / 2, y - h);
        this.ctx.stroke();

        // Laser bar
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

  drawCoins() {
    const vanishingX = this.width / 2;

    this.coins.forEach((coin) => {
      if (coin.z <= 0.05 || coin.collected) return;

      const bottomX = this.getLaneX(coin.lane);
      const x = vanishingX + (bottomX - vanishingX) * coin.z;
      // Subtract heightOffset scaled by z to follow perspective
      const y = this.horizonY + (this.height - this.horizonY) * coin.z - coin.heightOffset * coin.z;

      const zScale = coin.z;
      const baseRadius = 13 * zScale;
      
      // Dynamic spinning: stretch horizontal radius over time
      const spinScale = Math.sin(Date.now() / 150);
      const rx = baseRadius * Math.abs(spinScale);
      const ry = baseRadius;

      // Pulsing glow
      const pulse = 1.0 + Math.sin(Date.now() / 90) * 0.08;

      this.ctx.save();
      
      this.ctx.shadowBlur = (15 + 5 * pulse) * zScale;
      this.ctx.shadowColor = '#ffea00';
      this.ctx.strokeStyle = '#ffea00';
      this.ctx.lineWidth = 1.5 + zScale;
      this.ctx.fillStyle = 'rgba(255, 234, 0, 0.35)';

      // Draw spinning coin ellipse
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, rx * pulse, ry * pulse, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      // Inner details (looks like a credit coin symbol)
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, rx * 0.5 * pulse, ry * 0.5 * pulse, 0, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.restore();
    });
  }

  drawParticles() {
    this.particles.forEach((p) => {
      const lifeRatio = p.life / p.maxLife;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      this.ctx.fill();
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
