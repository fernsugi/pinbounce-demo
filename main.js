/* ===========================================
   PIN BOUNCE! - Main Game Logic
   Mobile-First Arcade Game with JUICE

   UNITY PORT NOTES:
   - GameManager.cs (singleton)
   - Ball.cs, Block.cs (MonoBehaviour)
   - AudioManager.cs (singleton with AudioSource pooling)
   - ParticleSystem (Unity's built-in)
   - CameraShake (Cinemachine or custom)
   =========================================== */

// ===========================================
// GAMEPLAY CONSTANTS - Core mechanics
// ===========================================

const CONFIG = {
    // Ball sizes (radius in pixels)
    BALL_RADIUS_NORMAL: 10,
    BALL_RADIUS_MEDIUM: 13,
    BALL_RADIUS_BIG: 16,

    // Ball wall lives by type
    WALL_LIVES_NORMAL: 6,
    WALL_LIVES_MEDIUM: 8,
    WALL_LIVES_BIG: 10,
    WALL_LIVES_RAINBALL: 6,

    // Ball movement speed
    BALL_SPEED: 2,
    GRAVITY: 0.05,  // Downward acceleration per frame

    // Base (spawn point) position - top center (X is calculated dynamically)
    BASE_Y: 0,
    BASE_RADIUS: 20,

    // Anti-frustration grace period (ms)
    WALL_HIT_GRACE_PERIOD: 200,

    // Maximum active balls
    ACTIVE_BALL_CAP: 6,

    // Arrow spinner speed (radians per frame)
    ARROW_SPIN_SPEED: 0.008,

    // Slot machine timing (ms)
    SLOT_SPIN_TIME: 700,
    SLOT_REEL1_INTERVAL: 350,       // First reel: slow & predictable (higher = slower)
    SLOT_REEL23_INTERVAL: 100,      // Other reels: fast & random
    SLOT_AUTO_STOP_DELAY: 200,
    SLOT_RESULT_DISPLAY: 400,

    // Slot probability bias (0-1, higher = more matches)
    SLOT_MATCH_BIAS: 0.45,

    // Block settings
    BLOCK_DEFAULT_HP: 1,
    BLOCK_SIZE: 26,

    // Level layout
    BLOCK_COUNT: 120,
    BLOCK_PADDING: 5,
    BLOCK_MARGIN: 30,

    // Win condition
    WIN_REQUIRES_ALL_BLOCKS: false,

    // Colors
    COLORS: {
        RED: '#ff4757',
        YELLOW: '#ffc312',
        BLUE: '#3498db',
        NEUTRAL: '#7f8c8d',
        RAINBALL: 'rainbow'
    },

    // Block color weights
    COLOR_WEIGHTS: { red: 1, yellow: 1, blue: 1, neutral: 1 }
};

// ===========================================
// JUICE TUNING CONSTANTS
// ===========================================

const JUICE = {
    // === SCREEN SHAKE ===
    SHAKE_ENABLED: true,
    SHAKE_MAX_OFFSET: 15,           // Max pixels offset
    SHAKE_BIG_SPAWN: { intensity: 12, duration: 200 },
    SHAKE_MEDIUM_SPAWN: { intensity: 6, duration: 150 },
    SHAKE_RAINBALL_SPAWN: { intensity: 8, duration: 180 },
    SHAKE_BLOCK_BREAK: { intensity: 3, duration: 80 },
    SHAKE_COMBO: { intensity: 8, duration: 150 },

    // === PARTICLES ===
    PARTICLES_ENABLED: true,
    PARTICLE_MAX: 300,              // Max particles in pool
    PARTICLE_BLOCK_BREAK: 12,       // Particles per block break
    PARTICLE_SPAWN_BURST: 20,       // Particles on ball spawn
    PARTICLE_SPEED: 4,
    PARTICLE_LIFETIME: 600,         // ms
    PARTICLE_SIZE: { min: 2, max: 5 },

    // === HIT STOP ===
    HITSTOP_ENABLED: true,
    HITSTOP_BLOCK_BREAK: 30,        // ms
    HITSTOP_BIG_SPAWN: 50,          // ms
    HITSTOP_COMBO: 40,              // ms

    // === SOUND ===
    SOUND_ENABLED: true,
    MASTER_VOLUME: 0.4,             // 0.0 - 1.0

    // === HAPTICS ===
    HAPTICS_ENABLED: true,
    HAPTIC_BIG_SPAWN: 20,           // ms
    HAPTIC_RAINBALL: 15,
    HAPTIC_BLOCK_BREAK: 5,
    HAPTIC_WARNING: 10,

    // === VISUALS ===
    TRAIL_LENGTH: 12,               // Trail positions stored
    TRAIL_ENABLED: true,
    GLOW_ENABLED: true,
    BALL_GLOW_SIZE: 4,              // Extra radius for glow
    LIVES_INDICATOR: true,          // Show wall lives around ball

    // === COMBO ===
    COMBO_DECAY_TIME: 2000,         // ms before combo resets
    COMBO_MILESTONES: [5, 10, 15, 20, 30],

    // === SCREEN FLASH ===
    FLASH_ENABLED: true,
    FLASH_COMBO_DURATION: 150,      // ms
    FLASH_COMBO_ALPHA: 0.4,         // opacity

    // === SLOW MOTION ===
    SLOWMO_ENABLED: true,
    SLOWMO_BLOCKS_THRESHOLD: 5,     // Trigger when this many blocks remain
    SLOWMO_FACTOR: 0.4,             // Game speed multiplier (0.4 = 40% speed)

    // === PERFORMANCE MODE ===
    PERFORMANCE_MODE: false         // Reduces particles & trails
};

// ===========================================
// AUDIO MANAGER - Procedural Web Audio
// ===========================================

class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = JUICE.SOUND_ENABLED;
        this.volume = JUICE.MASTER_VOLUME;
        this.initialized = false;
    }

    // Must be called on user interaction (mobile policy)
    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio not supported');
        }
    }

    // Create oscillator with envelope
    playTone(freq, duration, type = 'sine', volumeMod = 1) {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(this.volume * volumeMod, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // Noise burst for impacts
    playNoise(duration, volumeMod = 0.3) {
        if (!this.enabled || !this.ctx) return;

        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        noise.buffer = buffer;
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        gain.gain.setValueAtTime(this.volume * volumeMod, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    // === SOUND EFFECTS ===

    uiClick() {
        this.playTone(800, 0.05, 'square', 0.3);
    }

    slotTick() {
        this.playTone(600 + Math.random() * 200, 0.03, 'square', 0.15);
    }

    reelStop() {
        this.playTone(200, 0.1, 'square', 0.4);
        this.playNoise(0.05, 0.2);
    }

    ballSpawnNormal() {
        this.playTone(400, 0.1, 'sine', 0.3);
        this.playTone(600, 0.08, 'sine', 0.2);
    }

    ballSpawnMedium() {
        this.playTone(300, 0.15, 'sine', 0.4);
        this.playTone(450, 0.12, 'sine', 0.3);
    }

    ballSpawnBig() {
        this.playTone(150, 0.2, 'sine', 0.5);
        this.playTone(200, 0.15, 'triangle', 0.4);
        this.playNoise(0.1, 0.3);
    }

    ballSpawnRainball() {
        // Shimmer effect - quick arpeggio
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.15, 'sine', 0.3), i * 40);
        });
    }

    blockBreak() {
        this.playTone(800 + Math.random() * 400, 0.08, 'square', 0.25);
    }

    wrongColorBounce() {
        this.playTone(150, 0.1, 'triangle', 0.2);
        this.playNoise(0.03, 0.15);
    }

    wallHit(livesRemaining, maxLives) {
        const ratio = livesRemaining / maxLives;
        const freq = 200 + ratio * 300;
        this.playTone(freq, 0.05, 'square', 0.15);
        if (ratio < 0.3) {
            this.playTone(100, 0.1, 'sawtooth', 0.1);
        }
    }

    ballDeath() {
        // Downward chirp
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    comboMilestone() {
        const notes = [523, 659, 784];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.12, 'square', 0.35), i * 60);
        });
    }

    winJingle() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.4), i * 150);
        });
    }

    loseSound() {
        this.playTone(200, 0.3, 'sawtooth', 0.3);
        setTimeout(() => this.playTone(150, 0.4, 'sawtooth', 0.25), 150);
    }
}

// ===========================================
// PARTICLE SYSTEM - Object pooling
// ===========================================

class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        this.size = 3;
        this.color = '#fff';
        this.alpha = 1;
    }

    init(x, y, color) {
        this.active = true;
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = JUICE.PARTICLE_SPEED * (0.5 + Math.random());
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = JUICE.PARTICLE_LIFETIME;
        this.maxLife = this.life;
        this.size = JUICE.PARTICLE_SIZE.min +
                    Math.random() * (JUICE.PARTICLE_SIZE.max - JUICE.PARTICLE_SIZE.min);
        this.color = color;
        this.alpha = 1;
    }

    update(dt) {
        if (!this.active) return;

        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // Gravity
        this.alpha = this.life / this.maxLife;
        this.size *= 0.98;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.rainbowHue = 0;

        // Pre-allocate particle pool
        for (let i = 0; i < JUICE.PARTICLE_MAX; i++) {
            this.particles.push(new Particle());
        }
    }

    getParticle() {
        for (const p of this.particles) {
            if (!p.active) return p;
        }
        return null; // Pool exhausted
    }

    emit(x, y, color, count) {
        if (!JUICE.PARTICLES_ENABLED) return;
        if (JUICE.PERFORMANCE_MODE) count = Math.floor(count / 2);

        for (let i = 0; i < count; i++) {
            const p = this.getParticle();
            if (p) p.init(x, y, color);
        }
    }

    emitRainbow(x, y, count) {
        if (!JUICE.PARTICLES_ENABLED) return;
        if (JUICE.PERFORMANCE_MODE) count = Math.floor(count / 2);

        const colors = ['#ff4757', '#ffc312', '#3498db', '#2ecc71', '#9b59b6'];
        for (let i = 0; i < count; i++) {
            const p = this.getParticle();
            if (p) p.init(x, y, colors[i % colors.length]);
        }
    }

    update(dt) {
        this.rainbowHue = (this.rainbowHue + 2) % 360;
        for (const p of this.particles) {
            p.update(dt);
        }
    }

    render(ctx) {
        for (const p of this.particles) {
            if (!p.active) continue;
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

// ===========================================
// CAMERA SHAKE
// ===========================================

class CameraShake {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.intensity = 0;
        this.duration = 0;
        this.elapsed = 0;
    }

    trigger(intensity, duration) {
        if (!JUICE.SHAKE_ENABLED) return;
        // Don't override stronger shake
        if (intensity > this.intensity || this.duration <= 0) {
            this.intensity = Math.min(intensity, JUICE.SHAKE_MAX_OFFSET);
            this.duration = duration;
            this.elapsed = 0;
        }
    }

    update(dt) {
        if (this.duration <= 0) {
            this.offsetX = 0;
            this.offsetY = 0;
            return;
        }

        this.elapsed += dt;
        const progress = this.elapsed / this.duration;

        if (progress >= 1) {
            this.duration = 0;
            this.offsetX = 0;
            this.offsetY = 0;
            return;
        }

        // Decay shake over time
        const currentIntensity = this.intensity * (1 - progress);
        this.offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
        this.offsetY = (Math.random() - 0.5) * 2 * currentIntensity;
    }

    apply(ctx) {
        ctx.translate(this.offsetX, this.offsetY);
    }
}

// ===========================================
// HIT STOP SYSTEM
// ===========================================

class HitStop {
    constructor() {
        this.active = false;
        this.duration = 0;
        this.elapsed = 0;
    }

    trigger(duration) {
        if (!JUICE.HITSTOP_ENABLED) return;
        this.active = true;
        this.duration = duration;
        this.elapsed = 0;
    }

    update(dt) {
        if (!this.active) return false;

        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.active = false;
            return false;
        }
        return true; // Still frozen
    }

    isFrozen() {
        return this.active;
    }
}

// ===========================================
// HAPTICS MANAGER
// ===========================================

class HapticsManager {
    constructor() {
        this.enabled = JUICE.HAPTICS_ENABLED && 'vibrate' in navigator;
    }

    vibrate(duration) {
        if (!this.enabled || !JUICE.HAPTICS_ENABLED) return;
        try {
            navigator.vibrate(duration);
        } catch (e) {}
    }

    bigSpawn() { this.vibrate(JUICE.HAPTIC_BIG_SPAWN); }
    rainball() { this.vibrate(JUICE.HAPTIC_RAINBALL); }
    blockBreak() { this.vibrate(JUICE.HAPTIC_BLOCK_BREAK); }
    warning() { this.vibrate(JUICE.HAPTIC_WARNING); }
}

// ===========================================
// COMBO SYSTEM
// ===========================================

class ComboSystem {
    constructor() {
        this.count = 0;
        this.lastBreakTime = 0;
        this.displayTimeout = null;
    }

    addBreak() {
        const now = Date.now();
        if (now - this.lastBreakTime > JUICE.COMBO_DECAY_TIME) {
            this.count = 0;
        }
        this.count++;
        this.lastBreakTime = now;

        // Check milestones
        if (JUICE.COMBO_MILESTONES.includes(this.count)) {
            return this.count; // Return milestone value
        }
        return 0;
    }

    update() {
        const now = Date.now();
        if (this.count > 0 && now - this.lastBreakTime > JUICE.COMBO_DECAY_TIME) {
            this.count = 0;
        }
    }

    reset() {
        this.count = 0;
    }
}

// ===========================================
// GAME STATE
// ===========================================

// ===========================================
// WALL CLASS (obstacles)
// ===========================================

class Wall {
    constructor(x, y, width, height, angle = 0) {
        this.x = x;  // Center X
        this.y = y;  // Center Y
        this.width = width;
        this.height = height;
        this.angle = angle;  // Rotation in radians
        this.hp = 2;  // Walls have 2 HP
        this.cracked = false;  // Shows crack when hp = 1
    }

    takeDamage() {
        this.hp--;
        if (this.hp === 1) {
            this.cracked = true;
        }
        return this.hp <= 0;  // Returns true if destroyed
    }

    get centerX() { return this.x; }
    get centerY() { return this.y; }

    // Get corners for collision detection
    getCorners() {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const hw = this.width / 2;
        const hh = this.height / 2;

        return [
            { x: this.x + (-hw * cos - -hh * sin), y: this.y + (-hw * sin + -hh * cos) },
            { x: this.x + (hw * cos - -hh * sin), y: this.y + (hw * sin + -hh * cos) },
            { x: this.x + (hw * cos - hh * sin), y: this.y + (hw * sin + hh * cos) },
            { x: this.x + (-hw * cos - hh * sin), y: this.y + (-hw * sin + hh * cos) }
        ];
    }
}

// ===========================================
// GAME STATE
// ===========================================

class GameState {
    constructor() {
        this.balls = [];
        this.blocks = [];
        this.walls = [];  // Obstacle walls
        this.isRunning = false;
        this.isGameOver = false;
        this.hasWon = false;
        // Indicator angle: oscillates between 0 (right) and π (left) - full 180°
        this.arrowAngle = Math.PI / 2;  // Start pointing down
        this.arrowDirection = 1;  // 1 = towards left, -1 = towards right
        this.damageTexts = [];  // Floating damage numbers

        // Spin counter (lose if it reaches 0 with blocks remaining)
        this.spinsRemaining = 10;

        // Points system
        this.points = 0;

        // Slot machine state
        this.slotState = 'idle';
        this.slotReels = ['?', '?', '?'];
        this.slotStoppedCount = 0;

        // Debug stats
        this.debugStats = {
            totalSpins: 0,
            triples: 0,
            pairs: 0,
            rainbows: 0,
            normals: 0,
            particles: 0,
            fps: 60
        };
    }

    reset() {
        this.balls = [];
        this.walls = [];
        this.damageTexts = [];
        this.isRunning = false;
        this.isGameOver = false;
        this.hasWon = false;
        this.arrowAngle = Math.PI / 2;  // Start pointing down
        this.arrowDirection = 1;
        this.spinsRemaining = 10;
        this.points = 0;
        this.slotState = 'idle';
        this.slotReels = ['?', '?', '?'];
        this.slotStoppedCount = 0;
    }

    get activeBallCount() {
        return this.balls.length;
    }

    get remainingColoredBlocks() {
        return this.blocks.filter(b => b.color !== 'neutral' && b.hp > 0).length;
    }

    get remainingBlocks() {
        return this.blocks.filter(b => b.hp > 0).length;
    }

    canSpawnBall() {
        // No ball cap - spawn unlimited!
        return !this.isGameOver && this.slotState === 'idle';
    }
}

// ===========================================
// BALL CLASS
// ===========================================

class Ball {
    constructor(x, y, color, type, angle) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.type = type;
        this.baseRadius = this.getRadiusByType(type);

        // Blue special: 2x size + breaks walls once + instant kill blocks until wall/obstacle hit
        this.isBlue = color === 'blue';
        this.bluePiercing = this.isBlue;  // Loses piercing after hitting wall/obstacle
        if (this.isBlue) {
            this.baseRadius *= 2;  // Double size
        }

        // Calculate speed based on ball type
        const isRainbow = color === 'rainbow';
        let speed;
        if (this.isBlue) {
            speed = CONFIG.BALL_SPEED * 3;
        } else if (isRainbow) {
            speed = CONFIG.BALL_SPEED * 3;
        } else {
            speed = CONFIG.BALL_SPEED;
        }

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // Red special: AOE on first block hit
        this.isRed = color === 'red';
        this.redAOEReady = this.isRed;  // Can only use AOE once

        this.spawnTime = Date.now();

        // Trail for visual effect
        this.trail = [];

        // Points accumulated by this ball (from block damage)
        this.points = 0;
    }

    get radius() {
        return this.baseRadius;
    }

    getRadiusByType(type) {
        switch(type) {
            case 'big': return CONFIG.BALL_RADIUS_BIG;
            case 'medium': return CONFIG.BALL_RADIUS_MEDIUM;
            default: return CONFIG.BALL_RADIUS_NORMAL;
        }
    }

    update(canvasWidth, canvasHeight, audioManager) {
        // Store trail
        if (JUICE.TRAIL_ENABLED && !JUICE.PERFORMANCE_MODE) {
            this.trail.unshift({ x: this.x, y: this.y });
            if (this.trail.length > JUICE.TRAIL_LENGTH) this.trail.pop();
        }

        // Apply gravity
        this.vy += CONFIG.GRAVITY;

        this.x += this.vx;
        this.y += this.vy;

        // Side wall collisions (left and right)
        let hitOuterWall = false;
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = Math.abs(this.vx);
            hitOuterWall = true;
        }
        if (this.x + this.radius > canvasWidth) {
            this.x = canvasWidth - this.radius;
            this.vx = -Math.abs(this.vx);
            hitOuterWall = true;
        }

        // Top wall collision
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = Math.abs(this.vy);
            hitOuterWall = true;
        }

        // Blue loses piercing on outer wall hit (with spawn grace period)
        const timeSinceSpawn = Date.now() - this.spawnTime;
        if (hitOuterWall && this.bluePiercing && timeSinceSpawn > 200) {
            this.bluePiercing = false;
            // Slow down to normal speed
            const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeed > CONFIG.BALL_SPEED) {
                const factor = CONFIG.BALL_SPEED / currentSpeed;
                this.vx *= factor;
                this.vy *= factor;
            }
            // Shrink back to normal size
            this.baseRadius = this.getRadiusByType(this.type);
        }

        // Bottom: no collision - balls fall into baskets
        // Return false if ball went below screen (will be handled by basket system)
        if (this.y - this.radius > canvasHeight) {
            return false;  // Ball is off screen
        }

        return true;  // Ball still alive
    }

    // Returns damage amount (0 = no damage, just bounce)
    getDamage(block) {
        if (this.color === 'rainbow') return 999;  // Rainbow instant kill
        if (this.bluePiercing) return 999;  // Blue bulldoze instant kill
        // Same color or neutral = 5 damage, different color = 1 damage
        if (block.color === 'neutral' || block.color === this.color) {
            return 5;
        }
        return 1;
    }

    canDamage(block) {
        return this.getDamage(block) > 0;
    }

    getDisplayColor() {
        if (this.color === 'rainbow') return null;
        return CONFIG.COLORS[this.color.toUpperCase()];
    }
}

// ===========================================
// BLOCK CLASS
// ===========================================

class Block {
    constructor(x, y, size, color) {
        this.x = x;
        this.y = y;
        this.width = size;
        this.height = size;
        this.color = color;
        // Random HP between 5-10
        this.hp = 5 + Math.floor(Math.random() * 6);
        this.maxHp = this.hp;
        this.hitFlash = 0;
        this.breaking = false;
        this.breakProgress = 0;
    }

    takeDamage(amount = 1) {
        this.hp -= amount;
        this.hitFlash = 1;
        if (this.hp <= 0) {
            this.breaking = true;
        }
        return this.hp <= 0;
    }

    getDisplayColor() {
        return CONFIG.COLORS[this.color.toUpperCase()];
    }

    update() {
        if (this.hitFlash > 0) this.hitFlash -= 0.15;
        if (this.breaking) this.breakProgress += 0.2;
    }

    get isDestroyed() {
        return this.breaking && this.breakProgress >= 1;
    }

    get centerX() { return this.x + this.width / 2; }
    get centerY() { return this.y + this.height / 2; }
}

// ===========================================
// SLOT MACHINE
// ===========================================

class SlotMachine {
    constructor(gameState, audioManager) {
        this.gameState = gameState;
        this.audio = audioManager;
        this.colors = ['red', 'yellow', 'blue'];
        this.reel1Interval = null;
        this.reel23Interval = null;
        this.autoStopTimeouts = [];
        this.onResult = null;
        this.reel1Index = 0;  // For predictable cycling
    }

    startSpin() {
        if (this.gameState.slotState !== 'idle') return;
        if (this.gameState.spinsRemaining <= 0) return;  // No spins left

        this.gameState.spinsRemaining--;
        this.gameState.slotState = 'spinning';
        this.gameState.slotStoppedCount = 0;
        this.gameState.slotReels = ['?', '?', '?'];
        this.gameState.debugStats.totalSpins++;

        // Show overlay
        document.getElementById('slot-overlay').classList.remove('hidden');
        document.getElementById('slot-result').textContent = '';
        document.getElementById('slot-hint').textContent = 'Press SPACE to stop';

        // Randomize starting color each spin
        this.reel1Index = Math.floor(Math.random() * 3);

        // First reel: slow predictable cycle (red -> yellow -> blue -> red...)
        this.reel1Interval = setInterval(() => {
            if (this.gameState.slotStoppedCount === 0) {
                this.reel1Index = (this.reel1Index + 1) % 3;
                this.gameState.slotReels[0] = this.colors[this.reel1Index];
                this.updateReelDisplay();
            }
        }, CONFIG.SLOT_REEL1_INTERVAL);

        // Reels 2 & 3: fast random (sound follows these for excitement)
        this.reel23Interval = setInterval(() => {
            for (let i = Math.max(1, this.gameState.slotStoppedCount); i < 3; i++) {
                this.gameState.slotReels[i] = this.colors[Math.floor(Math.random() * 3)];
            }
            this.updateReelDisplay();
            if (this.audio) this.audio.slotTick();
        }, CONFIG.SLOT_REEL23_INTERVAL);

        // Initialize first reel with random starting color
        this.gameState.slotReels[0] = this.colors[this.reel1Index];
        this.updateReelDisplay();
    }

    stopReel() {
        if (this.gameState.slotState !== 'spinning' &&
            this.gameState.slotState !== 'stopping') return;

        const reelIndex = this.gameState.slotStoppedCount;
        let value;

        if (reelIndex === 0) {
            // First reel: use whatever color is currently displayed (player's choice)
            value = this.gameState.slotReels[0];
        } else {
            value = this.getBiasedReelValue();
        }

        this.gameState.slotReels[reelIndex] = value;
        this.gameState.slotStoppedCount++;

        if (this.audio) this.audio.reelStop();
        this.updateReelDisplay();

        if (this.gameState.slotStoppedCount === 1) {
            this.gameState.slotState = 'stopping';
            document.getElementById('slot-hint').textContent = '';
            this.autoStopTimeouts.push(
                setTimeout(() => this.stopReel(), CONFIG.SLOT_AUTO_STOP_DELAY)
            );
        } else if (this.gameState.slotStoppedCount === 2) {
            this.autoStopTimeouts.push(
                setTimeout(() => this.stopReel(), CONFIG.SLOT_AUTO_STOP_DELAY)
            );
        } else if (this.gameState.slotStoppedCount === 3) {
            clearInterval(this.reel1Interval);
            clearInterval(this.reel23Interval);
            this.gameState.slotState = 'result';
            setTimeout(() => this.resolveResult(), CONFIG.SLOT_RESULT_DISPLAY);
        }
    }

    getBiasedReelValue() {
        const prev = this.gameState.slotReels.slice(0, this.gameState.slotStoppedCount);
        if (Math.random() < CONFIG.SLOT_MATCH_BIAS && prev.length > 0) {
            return prev[Math.floor(Math.random() * prev.length)];
        }
        return this.colors[Math.floor(Math.random() * 3)];
    }

    resolveResult() {
        const reels = this.gameState.slotReels;
        const firstReelColor = reels[0];

        // Count how many times the first color appears
        const firstColorCount = reels.filter(r => r === firstReelColor).length;

        // Check for rainbow (all different colors)
        const isRainbow = new Set(reels).size === 3;

        let ballColor, ballCount, resultText;

        if (isRainbow) {
            ballColor = 'rainbow';
            ballCount = 1;
            resultText = 'RAINBALL!';
            this.gameState.debugStats.rainbows++;
        } else {
            ballColor = firstReelColor;
            ballCount = firstColorCount;

            if (ballCount === 3) {
                resultText = 'TRIPLE! x3 BALLS!';
                this.gameState.debugStats.triples++;
            } else if (ballCount === 2) {
                resultText = 'DOUBLE! x2 BALLS!';
                this.gameState.debugStats.pairs++;
            } else {
                resultText = 'x1 BALL';
                this.gameState.debugStats.normals++;
            }
        }

        document.getElementById('slot-result').textContent = resultText;

        // Hide overlay after brief delay
        setTimeout(() => {
            document.getElementById('slot-overlay').classList.add('hidden');
            this.gameState.slotState = 'idle';
            if (this.onResult) this.onResult(ballColor, ballCount);
        }, 300);
    }

    updateReelDisplay() {
        for (let i = 0; i < 3; i++) {
            const reelEl = document.getElementById(`reel-${i}`);
            const value = this.gameState.slotReels[i];

            reelEl.className = 'reel';

            if (value === '?') {
                reelEl.textContent = '?';
            } else {
                const emoji = { red: '🔴', yellow: '🟡', blue: '🔵' }[value] || '?';
                reelEl.textContent = emoji;
                reelEl.classList.add(value);
            }

            if ((this.gameState.slotState === 'spinning' || this.gameState.slotState === 'stopping')
                && i >= this.gameState.slotStoppedCount) {
                reelEl.classList.add('spinning');
            }
            if (i < this.gameState.slotStoppedCount) {
                reelEl.classList.add('stopped');
            }

            // Rainbow effect
            if (this.gameState.slotState === 'result') {
                if (new Set(reels).size === 3 &&
                    reels.every(r => ['red', 'yellow', 'blue'].includes(r))) {
                    reelEl.classList.add('rainbow');
                }
            }
        }
    }

    reset() {
        clearInterval(this.reel1Interval);
        clearInterval(this.reel23Interval);
        this.autoStopTimeouts.forEach(t => clearTimeout(t));
        this.autoStopTimeouts = [];
        this.gameState.slotState = 'idle';
        this.gameState.slotReels = ['?', '?', '?'];
        this.gameState.slotStoppedCount = 0;
        document.getElementById('slot-overlay').classList.add('hidden');
    }
}

// ===========================================
// PHYSICS & COLLISION
// ===========================================

function circleRectCollision(ball, block) {
    const closestX = Math.max(block.x, Math.min(ball.x, block.x + block.width));
    const closestY = Math.max(block.y, Math.min(ball.y, block.y + block.height));
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < ball.radius) {
        return {
            hit: true,
            nx: distance > 0 ? dx / distance : 0,
            ny: distance > 0 ? dy / distance : 1,
            penetration: ball.radius - distance
        };
    }
    return { hit: false };
}

function reflectVelocity(ball, nx, ny) {
    const dot = ball.vx * nx + ball.vy * ny;
    ball.vx = ball.vx - 2 * dot * nx;
    ball.vy = ball.vy - 2 * dot * ny;
}

// Collision detection for rotated rectangles (walls)
function circleRotatedRectCollision(ball, wall) {
    // Transform ball position into wall's local space
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);

    // Translate ball relative to wall center, then rotate
    const dx = ball.x - wall.x;
    const dy = ball.y - wall.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Now do normal rect collision in local space
    const hw = wall.width / 2;
    const hh = wall.height / 2;

    const closestX = Math.max(-hw, Math.min(localX, hw));
    const closestY = Math.max(-hh, Math.min(localY, hh));

    const distX = localX - closestX;
    const distY = localY - closestY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (distance < ball.radius) {
        // Calculate normal in local space
        let nx = distance > 0 ? distX / distance : 0;
        let ny = distance > 0 ? distY / distance : 1;

        // Rotate normal back to world space
        const cosBack = Math.cos(wall.angle);
        const sinBack = Math.sin(wall.angle);
        const worldNx = nx * cosBack - ny * sinBack;
        const worldNy = nx * sinBack + ny * cosBack;

        return {
            hit: true,
            nx: worldNx,
            ny: worldNy,
            penetration: ball.radius - distance
        };
    }
    return { hit: false };
}

// ===========================================
// RENDERER
// ===========================================

class Renderer {
    constructor(canvas, gameState, particles, cameraShake) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.particles = particles;
        this.cameraShake = cameraShake;
        this.rainbowHue = 0;
        this.game = null;  // Set by Game class after construction
    }

    setGame(game) {
        this.game = game;
    }

    // Helper to convert ball color names to HSL hues for vibrant trails
    getHueFromColor(color) {
        switch(color) {
            case 'red': return 5;      // Vibrant red
            case 'yellow': return 45;   // Warm golden yellow
            case 'blue': return 210;    // Bright blue
            default: return 0;
        }
    }

    clear() {
        // Background with subtle gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#0f0f23');
        gradient.addColorStop(0.5, '#151530');
        gradient.addColorStop(1, '#0a0a18');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Subtle grid pattern
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        this.ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawWall(wall) {
        this.ctx.save();

        // Move to wall center and rotate
        this.ctx.translate(wall.x, wall.y);
        this.ctx.rotate(wall.angle);

        const hw = wall.width / 2;
        const hh = wall.height / 2;

        // Dark wall with subtle gradient
        const gradient = this.ctx.createLinearGradient(-hw, -hh, hw, hh);
        gradient.addColorStop(0, '#2a2a4a');
        gradient.addColorStop(0.5, '#3a3a5a');
        gradient.addColorStop(1, '#2a2a4a');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.roundRect(-hw, -hh, wall.width, wall.height, 4);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(100, 100, 140, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.roundRect(-hw, -hh, wall.width, wall.height, 4);
        this.ctx.stroke();

        // Inner highlight
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.roundRect(-hw + 2, -hh + 2, wall.width - 4, wall.height - 4, 3);
        this.ctx.stroke();

        // Draw cracks if damaged
        if (wall.cracked) {
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.lineWidth = 2;
            // Main crack lines (at center, which is 0,0 in local space)
            this.ctx.beginPath();
            this.ctx.moveTo(-8, -6);
            this.ctx.lineTo(0, 0);
            this.ctx.lineTo(6, -8);
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(-5, 7);
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(8, 5);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawBaskets() {
        const basketHeight = 40;
        const basketWidth = this.canvas.width / 5;
        const y = this.canvas.height - basketHeight;
        const multipliers = [0, 1, 3, 1, 0];  // void, x1, x3, x1, void
        const colors = ['#1a1a2e', '#2d5a3d', '#5a2d5a', '#2d5a3d', '#1a1a2e'];
        const labels = ['VOID', 'x1', 'x3', 'x1', 'VOID'];

        for (let i = 0; i < 5; i++) {
            const x = i * basketWidth;

            // Basket background
            const gradient = this.ctx.createLinearGradient(x, y, x, this.canvas.height);
            gradient.addColorStop(0, colors[i]);
            gradient.addColorStop(1, '#0a0a15');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, basketWidth, basketHeight);

            // Basket border
            this.ctx.strokeStyle = multipliers[i] === 3 ? '#9b59b6' :
                                   multipliers[i] === 1 ? '#27ae60' : '#333';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, basketWidth, basketHeight);

            // Label
            this.ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = multipliers[i] === 3 ? '#e056fd' :
                                 multipliers[i] === 1 ? '#2ecc71' : '#555';
            this.ctx.fillText(labels[i], x + basketWidth / 2, y + basketHeight / 2);
        }
    }

    drawBase(angle) {
        const baseX = this.canvas.width / 2;  // Top center
        const baseY = CONFIG.BASE_Y;
        const baseRadius = CONFIG.BASE_RADIUS;

        // Draw half circle base stuck to top wall with glow
        this.ctx.shadowColor = 'rgba(0, 210, 211, 0.6)';
        this.ctx.shadowBlur = 15;

        // Base outer arc (half circle from left to right)
        this.ctx.strokeStyle = 'rgba(0, 210, 211, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(baseX, baseY, baseRadius, 0, Math.PI);
        this.ctx.stroke();

        // Base inner fill (half circle)
        const gradient = this.ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, baseRadius);
        gradient.addColorStop(0, 'rgba(0, 210, 211, 0.5)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 151, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 100, 101, 0.1)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.moveTo(baseX - baseRadius, baseY);
        this.ctx.arc(baseX, baseY, baseRadius, Math.PI, 0, true);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.shadowBlur = 0;

        // Calculate line endpoint at wall
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Find distance to each wall and pick the closest
        let dist = Infinity;
        if (cos > 0) dist = Math.min(dist, (this.canvas.width - baseX) / cos);
        if (cos < 0) dist = Math.min(dist, -baseX / cos);
        if (sin > 0) dist = Math.min(dist, (this.canvas.height - baseY) / sin);
        if (sin < 0) dist = Math.min(dist, -baseY / sin);

        const endX = baseX + cos * dist;
        const endY = baseY + sin * dist;

        // Dashed line to wall
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 6]);
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(baseX, baseY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);  // Reset dash
    }

    drawBall(ball) {
        // Draw trail - VIBRANT version!
        if (JUICE.TRAIL_ENABLED && !JUICE.PERFORMANCE_MODE && ball.trail.length > 0) {
            // First pass: outer glow for extra vibrancy
            for (let i = 0; i < ball.trail.length; i++) {
                const t = ball.trail[i];
                const progress = i / ball.trail.length;
                const glowAlpha = (1 - progress) * 0.25;
                const glowRadius = ball.radius * (1.8 - progress * 0.8);

                if (ball.color === 'rainbow') {
                    this.ctx.fillStyle = `hsla(${(this.rainbowHue + i * 30) % 360}, 100%, 60%, ${glowAlpha})`;
                } else {
                    // Convert hex to more saturated HSL
                    const hue = this.getHueFromColor(ball.color);
                    this.ctx.fillStyle = `hsla(${hue}, 100%, 55%, ${glowAlpha})`;
                }

                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, glowRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Second pass: core trail
            for (let i = 0; i < ball.trail.length; i++) {
                const t = ball.trail[i];
                const progress = i / ball.trail.length;
                const alpha = (1 - progress) * 0.7;  // Much brighter than before (was 0.4)
                const radius = ball.radius * (1 - progress * 0.5);

                if (ball.color === 'rainbow') {
                    this.ctx.fillStyle = `hsla(${(this.rainbowHue + i * 30) % 360}, 100%, 65%, ${alpha})`;
                } else {
                    // Use vibrant saturated colors
                    const hue = this.getHueFromColor(ball.color);
                    this.ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
                }

                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Glow effect
        if (JUICE.GLOW_ENABLED) {
            const glowRadius = ball.radius + JUICE.BALL_GLOW_SIZE;
            if (ball.color === 'rainbow') {
                this.ctx.fillStyle = `hsla(${this.rainbowHue}, 80%, 60%, 0.3)`;
            } else {
                this.ctx.fillStyle = ball.getDisplayColor();
                this.ctx.globalAlpha = 0.3;
            }
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }

        // Red AOE ready effect - pulsing explosion warning!
        if (ball.redAOEReady) {
            const pulse = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;  // 0-1 pulsing
            const pulseRadius = ball.radius + 8 + pulse * 12;

            // Outer pulsing ring
            this.ctx.strokeStyle = `rgba(255, 100, 50, ${0.4 + pulse * 0.4})`;
            this.ctx.lineWidth = 2 + pulse * 2;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, pulseRadius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Inner expanding glow
            const gradient = this.ctx.createRadialGradient(
                ball.x, ball.y, ball.radius,
                ball.x, ball.y, pulseRadius + 5
            );
            gradient.addColorStop(0, `rgba(255, 150, 50, ${0.3 * pulse})`);
            gradient.addColorStop(0.5, `rgba(255, 80, 30, ${0.2 * pulse})`);
            gradient.addColorStop(1, 'rgba(255, 50, 20, 0)');
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, pulseRadius + 5, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Main ball
        if (ball.color === 'rainbow') {
            const gradient = this.ctx.createRadialGradient(
                ball.x - ball.radius/3, ball.y - ball.radius/3, 0,
                ball.x, ball.y, ball.radius
            );
            gradient.addColorStop(0, `hsl(${this.rainbowHue}, 80%, 75%)`);
            gradient.addColorStop(0.5, `hsl(${(this.rainbowHue + 120) % 360}, 80%, 60%)`);
            gradient.addColorStop(1, `hsl(${(this.rainbowHue + 240) % 360}, 80%, 50%)`);
            this.ctx.fillStyle = gradient;
        } else {
            const color = ball.getDisplayColor();
            const gradient = this.ctx.createRadialGradient(
                ball.x - ball.radius/3, ball.y - ball.radius/3, 0,
                ball.x, ball.y, ball.radius
            );
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, color);
            gradient.addColorStop(1, color);
            this.ctx.fillStyle = gradient;
        }

        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Ball outline
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Show accumulated points above ball (grows with bigger numbers)
        if (ball.points > 0) {
            // Scale font size based on points (12px base, grows up to ~24px)
            const baseSize = 12;
            const scale = Math.min(2, 1 + Math.log10(ball.points + 1) * 0.4);
            const fontSize = Math.round(baseSize * scale);
            const textY = ball.y - ball.radius - 8 - fontSize / 2;

            this.ctx.font = `bold ${fontSize}px "Segoe UI", system-ui, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // Dark outline
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(ball.points, ball.x, textY);
            // White text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(ball.points, ball.x, textY);
        }
    }

    drawBlock(block) {
        if (block.hp <= 0 && !block.breaking) return;

        let alpha = 1;
        let scale = 1;

        if (block.breaking) {
            alpha = 1 - block.breakProgress;
            scale = 1 + block.breakProgress * 0.3;
        }

        let color = block.getDisplayColor();
        if (block.hitFlash > 0) {
            color = '#ffffff';
        }

        this.ctx.save();

        if (scale !== 1) {
            const cx = block.x + block.width / 2;
            const cy = block.y + block.height / 2;
            this.ctx.translate(cx, cy);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-cx, -cy);
        }

        this.ctx.globalAlpha = alpha;

        // Block shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.roundRect(block.x + 2, block.y + 2, block.width, block.height, 6);
        this.ctx.fill();

        // Block fill
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.roundRect(block.x, block.y, block.width, block.height, 6);
        this.ctx.fill();

        // Highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.roundRect(block.x + 2, block.y + 2, block.width - 4, block.height / 3, 4);
        this.ctx.fill();

        // Border
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.roundRect(block.x, block.y, block.width, block.height, 6);
        this.ctx.stroke();

        // HP number
        if (block.hp > 0) {
            const cx = block.x + block.width / 2;
            const cy = block.y + block.height / 2;
            this.ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // Shadow for readability
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillText(block.hp, cx + 1, cy + 1);
            // White text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(block.hp, cx, cy);
        }

        this.ctx.restore();
    }

    roundRect(x, y, width, height, radius) {
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    render() {
        this.ctx.save();

        // Apply camera shake
        this.cameraShake.apply(this.ctx);

        this.clear();
        this.rainbowHue = (this.rainbowHue + 2) % 360;

        // Draw baskets at bottom
        this.drawBaskets();

        // Draw walls (obstacles)
        for (const wall of this.gameState.walls) {
            this.drawWall(wall);
        }

        // Draw blocks
        for (const block of this.gameState.blocks) {
            this.drawBlock(block);
        }

        // Draw particles (behind balls)
        this.particles.render(this.ctx);

        // Draw base and indicator (top-left spawn point)
        if (!this.gameState.isGameOver) {
            this.drawBase(this.gameState.arrowAngle);
        }

        // Draw balls
        for (const ball of this.gameState.balls) {
            this.drawBall(ball);
        }

        // Draw damage/points texts
        for (const dt of this.gameState.damageTexts) {
            const alpha = dt.life / dt.maxLife;
            this.ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            const text = dt.isPoints ? dt.damage : `-${dt.damage}`;
            const color = dt.isPoints ? `rgba(46, 204, 113, ${alpha})` : `rgba(255, 80, 80, ${alpha})`;

            // Shadow
            this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
            this.ctx.fillText(text, dt.x + 1, dt.y + 1);
            // Colored text
            this.ctx.fillStyle = color;
            this.ctx.fillText(text, dt.x, dt.y);
        }

        this.ctx.restore();

        // Draw screen flash overlay (after restore so it's not affected by shake)
        if (this.game && this.game.flashAlpha > 0) {
            this.ctx.fillStyle = this.game.flashColor;
            this.ctx.globalAlpha = this.game.flashAlpha;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
        }

        // Draw slow-motion visual effect
        if (this.game && this.game.slowmoActive) {
            // Subtle blue tint + vignette for slowmo
            const gradient = this.ctx.createRadialGradient(
                this.canvas.width / 2, this.canvas.height / 2, 0,
                this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.7
            );
            gradient.addColorStop(0, 'rgba(0, 100, 200, 0)');
            gradient.addColorStop(0.7, 'rgba(0, 50, 150, 0.1)');
            gradient.addColorStop(1, 'rgba(0, 30, 100, 0.25)');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}

// ===========================================
// LEVEL GENERATOR
// ===========================================

function generateLevel(gameState, canvasWidth, canvasHeight) {
    gameState.blocks = [];
    gameState.walls = [];

    const blockSize = CONFIG.BLOCK_SIZE;
    const padding = CONFIG.BLOCK_PADDING;
    const margin = CONFIG.BLOCK_MARGIN;
    const count = CONFIG.BLOCK_COUNT;

    // Base clear zone (top center)
    const baseX = canvasWidth / 2;
    const baseY = CONFIG.BASE_Y;
    const baseClearRadius = 80;  // Keep area around base clear for shooting

    // Generate walls first
    const wallCount = 5 + Math.floor(Math.random() * 4);  // 5-8 walls
    const wallPadding = 30;  // Space around walls
    const basketHeight = 40;  // Keep clear of baskets

    function isValidWallPosition(cx, cy, w, h, angle) {
        // Check distance from base
        const dx = cx - baseX;
        const dy = cy - baseY;
        const maxDim = Math.max(w, h);
        if (Math.sqrt(dx * dx + dy * dy) < baseClearRadius + maxDim / 2) return false;

        // Check not too close to basket area
        if (cy + maxDim / 2 > canvasHeight - basketHeight - 20) return false;

        // Check against other walls (simple center distance check)
        for (const wall of gameState.walls) {
            const dist = Math.sqrt((cx - wall.x) ** 2 + (cy - wall.y) ** 2);
            const minDist = (maxDim + Math.max(wall.width, wall.height)) / 2 + wallPadding;
            if (dist < minDist) return false;
        }
        return true;
    }

    let wallAttempts = 0;
    while (gameState.walls.length < wallCount && wallAttempts < 150) {
        wallAttempts++;

        // Varied wall sizes
        const sizeType = Math.random();
        let wallWidth, wallHeight;

        if (sizeType < 0.3) {
            // Long thin wall
            wallWidth = 80 + Math.random() * 60;
            wallHeight = 12 + Math.random() * 8;
        } else if (sizeType < 0.6) {
            // Medium wall
            wallWidth = 50 + Math.random() * 40;
            wallHeight = 15 + Math.random() * 15;
        } else if (sizeType < 0.8) {
            // Small square-ish
            wallWidth = 25 + Math.random() * 25;
            wallHeight = 20 + Math.random() * 20;
        } else {
            // Thick short
            wallWidth = 30 + Math.random() * 30;
            wallHeight = 25 + Math.random() * 15;
        }

        // Random angle (including diagonal)
        const angle = (Math.random() - 0.5) * Math.PI * 0.8;  // -72 to +72 degrees

        const maxDim = Math.max(wallWidth, wallHeight);
        const cx = margin + maxDim / 2 + Math.random() * (canvasWidth - 2 * margin - maxDim);
        const cy = margin + 60 + Math.random() * (canvasHeight - margin - 60 - basketHeight - maxDim);

        if (isValidWallPosition(cx, cy, wallWidth, wallHeight, angle)) {
            gameState.walls.push(new Wall(cx, cy, wallWidth, wallHeight, angle));
        }
    }

    // Color pool for blocks
    const colorPool = [];
    for (const [color, weight] of Object.entries(CONFIG.COLOR_WEIGHTS)) {
        for (let i = 0; i < weight; i++) {
            colorPool.push(color);
        }
    }

    function isValidBlockPosition(x, y) {
        const blockCenterX = x + blockSize / 2;
        const blockCenterY = y + blockSize / 2;

        // Check distance from base
        const dx = blockCenterX - baseX;
        const dy = blockCenterY - baseY;
        if (Math.sqrt(dx * dx + dy * dy) < baseClearRadius) return false;

        // Check not in basket area
        if (y + blockSize > canvasHeight - basketHeight - 10) return false;

        // Check against walls (center-based, with buffer for rotation)
        for (const wall of gameState.walls) {
            const dist = Math.sqrt((blockCenterX - wall.x) ** 2 + (blockCenterY - wall.y) ** 2);
            const minDist = (blockSize + Math.max(wall.width, wall.height)) / 2 + padding;
            if (dist < minDist) return false;
        }

        // Check against other blocks
        for (const block of gameState.blocks) {
            if (x < block.x + block.width + padding &&
                x + blockSize + padding > block.x &&
                y < block.y + block.height + padding &&
                y + blockSize + padding > block.y) {
                return false;
            }
        }
        return true;
    }

    let attempts = 0;
    const maxAttempts = 1000;

    while (gameState.blocks.length < count && attempts < maxAttempts) {
        attempts++;
        const x = margin + Math.random() * (canvasWidth - 2 * margin - blockSize);
        const y = margin + Math.random() * (canvasHeight - 2 * margin - blockSize);

        if (isValidBlockPosition(x, y)) {
            const color = colorPool[Math.floor(Math.random() * colorPool.length)];
            gameState.blocks.push(new Block(x, y, blockSize, color));
        }
    }
}

// ===========================================
// MAIN GAME CONTROLLER
// ===========================================

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.gameState = new GameState();

        // Juice systems
        this.particles = new ParticleSystem();
        this.cameraShake = new CameraShake();
        this.hitStop = new HitStop();
        this.audio = new AudioManager();
        this.haptics = new HapticsManager();
        this.combo = new ComboSystem();

        this.renderer = new Renderer(this.canvas, this.gameState, this.particles, this.cameraShake);
        this.renderer.setGame(this);  // Give renderer access to game state for flash/slowmo
        this.slotMachine = new SlotMachine(this.gameState, this.audio);
        this.slotMachine.onResult = (color, count) => this.spawnBalls(color, count);

        // Screen flash state
        this.flashAlpha = 0;
        this.flashColor = '#ffd700';
        this.flashDuration = 0;
        this.flashElapsed = 0;

        // Slow-motion state
        this.slowmoActive = false;

        // UI elements
        this.spacebarHint = document.getElementById('spacebar-hint');
        this.actionLabel = document.getElementById('action-label');
        this.spinCountEl = document.getElementById('spin-count');
        this.pointsCountEl = document.getElementById('points-count');
        this.overlay = document.getElementById('overlay');
        this.overlayTitle = document.getElementById('overlay-title');
        this.overlayMessage = document.getElementById('overlay-message');
        this.overlayBtn = document.getElementById('overlay-btn');
        this.debugPanel = document.getElementById('debug-panel');
        this.debugStats = document.getElementById('debug-stats');
        this.comboDisplay = document.getElementById('combo-display');
        this.comboText = document.getElementById('combo-text');
        this.settingsPanel = document.getElementById('settings-panel');
        this.arrowIndicator = document.getElementById('arrow-indicator-icon');

        // Timing
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsTime = 0;

        this.setupEventListeners();
        this.resizeCanvas();
        this.init();
        this.startGameLoop();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.onActionButton();
            }
            if (e.key === 'd' || e.key === 'D') {
                this.debugPanel.classList.toggle('hidden');
            }
        });

        // Touch/click for spacebar hint (mobile)
        this.spacebarHint.addEventListener('click', () => this.onActionButton());
        this.spacebarHint.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onActionButton();
        });

        // Restart
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());

        // Overlay button
        this.overlayBtn.addEventListener('click', () => {
            this.hideOverlay();
            this.restart();
        });

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.settingsPanel.classList.remove('hidden');
            this.audio.uiClick();
        });

        document.getElementById('settings-close').addEventListener('click', () => {
            this.settingsPanel.classList.add('hidden');
            this.audio.uiClick();
        });

        // Settings toggles
        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.audio.enabled = e.target.checked;
            JUICE.SOUND_ENABLED = e.target.checked;
        });

        document.getElementById('haptics-toggle').addEventListener('change', (e) => {
            JUICE.HAPTICS_ENABLED = e.target.checked;
        });

        document.getElementById('perf-toggle').addEventListener('change', (e) => {
            JUICE.PERFORMANCE_MODE = e.target.checked;
        });
    }

    resizeCanvas() {
        const container = document.getElementById('game-container');
        const header = document.getElementById('header');
        const controls = document.getElementById('controls');

        const canvasHeight = container.clientHeight - header.offsetHeight - controls.offsetHeight;

        this.canvas.width = container.clientWidth;
        this.canvas.height = Math.max(canvasHeight, 300);

        if (this.gameState.blocks.length > 0 && !this.gameState.isRunning) {
            generateLevel(this.gameState, this.canvas.width, this.canvas.height);
        }
    }

    init() {
        this.gameState.reset();
        this.combo.reset();
        generateLevel(this.gameState, this.canvas.width, this.canvas.height);
        this.slotMachine.reset();
        this.updateUI();
    }

    restart() {
        this.init();
        this.audio.uiClick();
    }

    onActionButton() {
        // Initialize audio on first interaction (mobile policy)
        this.audio.init();

        if (this.gameState.isGameOver) return;

        if (this.gameState.slotState === 'idle') {
            if (!this.gameState.canSpawnBall()) return;
            this.slotMachine.startSpin();
            this.audio.uiClick();
        } else if (this.gameState.slotState === 'spinning') {
            this.slotMachine.stopReel();
        }
        this.updateUI();
    }

    spawnBalls(color, count) {
        // Spawn from base position (top center)
        const baseX = this.canvas.width / 2;
        const baseY = CONFIG.BASE_Y;
        const angle = this.gameState.arrowAngle;
        const isRainbow = color === 'rainbow';

        // Yellow special: always 3x the balls!
        if (color === 'yellow') {
            count *= 3;
        }

        // Delay between ball spawns (ms)
        const spawnDelay = 150;

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const cx = baseX;
                const cy = baseY;

                // Slight angle variation for multiple balls
                const angleOffset = count > 1 ? (i - (count - 1) / 2) * 0.15 : 0;
                const ballAngle = angle + angleOffset;

                const ballType = isRainbow ? 'rainball' : 'normal';
                const ball = new Ball(cx, cy, color, ballType, ballAngle);
                this.gameState.balls.push(ball);
                this.gameState.isRunning = true;

                // Spawn effects
                if (isRainbow) {
                    this.cameraShake.trigger(JUICE.SHAKE_RAINBALL_SPAWN.intensity, JUICE.SHAKE_RAINBALL_SPAWN.duration);
                    this.particles.emitRainbow(cx, cy, JUICE.PARTICLE_SPAWN_BURST);
                    this.audio.ballSpawnRainball();
                    this.haptics.rainball();
                } else if (count >= 3) {
                    this.cameraShake.trigger(JUICE.SHAKE_BIG_SPAWN.intensity, JUICE.SHAKE_BIG_SPAWN.duration);
                    this.hitStop.trigger(JUICE.HITSTOP_BIG_SPAWN);
                    this.particles.emit(cx, cy, CONFIG.COLORS[color.toUpperCase()], JUICE.PARTICLE_SPAWN_BURST);
                    this.audio.ballSpawnBig();
                    this.haptics.bigSpawn();
                } else if (count === 2) {
                    this.cameraShake.trigger(JUICE.SHAKE_MEDIUM_SPAWN.intensity, JUICE.SHAKE_MEDIUM_SPAWN.duration);
                    this.particles.emit(cx, cy, CONFIG.COLORS[color.toUpperCase()], JUICE.PARTICLE_SPAWN_BURST / 2);
                    this.audio.ballSpawnMedium();
                } else {
                    this.audio.ballSpawnNormal();
                }

                this.updateUI();
            }, i * spawnDelay);
        }
    }

    processBaskets() {
        const basketHeight = 40;
        const basketWidth = this.canvas.width / 5;
        const basketY = this.canvas.height - basketHeight;
        const multipliers = [0, 1, 3, 1, 0];  // void, x1, x3, x1, void

        // Check each ball
        this.gameState.balls = this.gameState.balls.filter(ball => {
            // Check if ball entered basket zone
            if (ball.y + ball.radius >= basketY) {
                // Determine which basket
                const basketIndex = Math.floor(ball.x / basketWidth);
                const clampedIndex = Math.max(0, Math.min(4, basketIndex));
                const multiplier = multipliers[clampedIndex];

                // Add points (ball.points * multiplier)
                const earnedPoints = ball.points * multiplier;
                if (earnedPoints > 0) {
                    this.gameState.points += earnedPoints;
                    // Show floating points text
                    this.gameState.damageTexts.push({
                        x: ball.x,
                        y: basketY - 20,
                        damage: `+${earnedPoints}`,
                        life: 800,
                        maxLife: 800,
                        isPoints: true
                    });
                    this.audio.blockBreak();
                }

                // Particles for basket entry
                const color = multiplier === 3 ? '#e056fd' :
                              multiplier === 1 ? '#2ecc71' : '#555';
                this.particles.emit(ball.x, basketY, color, 10);

                return false;  // Remove ball
            }
            return true;  // Keep ball
        });
    }

    processBallWallCollisions() {
        for (const ball of this.gameState.balls) {
            for (const wall of this.gameState.walls) {
                if (wall.hp <= 0) continue;  // Skip destroyed walls

                const collision = circleRotatedRectCollision(ball, wall);
                if (collision.hit) {
                    reflectVelocity(ball, collision.nx, collision.ny);
                    ball.x += collision.nx * collision.penetration;
                    ball.y += collision.ny * collision.penetration;

                    // Blue special: break wall once before losing piercing
                    if (ball.bluePiercing) {
                        const destroyed = wall.takeDamage();
                        if (destroyed) {
                            this.particles.emit(wall.centerX, wall.centerY, '#5a5a7a', 15);
                            this.audio.blockBreak();
                        }
                        ball.bluePiercing = false;
                        // Slow down to normal speed
                        const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
                        const factor = CONFIG.BALL_SPEED / currentSpeed;
                        ball.vx *= factor;
                        ball.vy *= factor;
                        // Shrink back to normal size
                        ball.baseRadius = ball.getRadiusByType(ball.type);
                    }
                }
            }
        }

        // Remove destroyed walls
        this.gameState.walls = this.gameState.walls.filter(w => w.hp > 0);
    }

    processBallBlockCollisions() {
        for (const ball of this.gameState.balls) {
            for (const block of this.gameState.blocks) {
                if (block.hp <= 0) continue;

                const collision = circleRectCollision(ball, block);

                if (collision.hit) {
                    const damage = ball.getDamage(block);

                    if (damage > 0) {
                        // Red special: AOE explosion on first hit (any block)
                        if (ball.redAOEReady) {
                            ball.redAOEReady = false;
                            this.triggerRedAOE(block.centerX, block.centerY, ball);
                        }

                        // Skip if block was already destroyed by AOE
                        if (block.hp <= 0) continue;

                        // Show damage text (cap display at actual HP for instant kills)
                        const actualDamage = Math.max(0, Math.min(damage, block.hp));
                        this.spawnDamageText(block.centerX, block.y, actualDamage);

                        // Accumulate points on the ball
                        ball.points += actualDamage;

                        const destroyed = block.takeDamage(damage);

                        if (destroyed) {
                            // Block break effects
                            this.cameraShake.trigger(JUICE.SHAKE_BLOCK_BREAK.intensity, JUICE.SHAKE_BLOCK_BREAK.duration);
                            this.hitStop.trigger(JUICE.HITSTOP_BLOCK_BREAK);

                            const particleColor = ball.color === 'rainbow'
                                ? block.getDisplayColor()
                                : ball.getDisplayColor();
                            this.particles.emit(block.centerX, block.centerY, particleColor, JUICE.PARTICLE_BLOCK_BREAK);

                            this.audio.blockBreak();
                            this.haptics.blockBreak();

                            // Combo
                            const milestone = this.combo.addBreak();
                            if (milestone > 0) {
                                this.showCombo(milestone);
                                this.cameraShake.trigger(JUICE.SHAKE_COMBO.intensity, JUICE.SHAKE_COMBO.duration);
                                this.hitStop.trigger(JUICE.HITSTOP_COMBO);
                                this.audio.comboMilestone();
                                this.particles.emitRainbow(block.centerX, block.centerY, JUICE.PARTICLE_SPAWN_BURST);
                            }

                            // Pass through - just push out
                            ball.x += collision.nx * collision.penetration;
                            ball.y += collision.ny * collision.penetration;
                        } else {
                            reflectVelocity(ball, collision.nx, collision.ny);
                            ball.x += collision.nx * collision.penetration;
                            ball.y += collision.ny * collision.penetration;
                        }
                    } else {
                        // Wrong color bounce
                        reflectVelocity(ball, collision.nx, collision.ny);
                        ball.x += collision.nx * collision.penetration;
                        ball.y += collision.ny * collision.penetration;
                        this.audio.wrongColorBounce();
                    }
                }
            }
        }
    }

    // Red AOE: destroy all blocks within radius
    triggerRedAOE(x, y, ball) {
        const aoeRadius = 130;  // Explosion radius in pixels

        // Big shake and effects for AOE
        this.cameraShake.trigger(15, 300);
        this.hitStop.trigger(80);
        this.particles.emit(x, y, CONFIG.COLORS.RED, 40);
        this.audio.ballSpawnBig();  // Use big sound for explosion
        this.haptics.bigSpawn();

        // Find and destroy all blocks in radius
        for (const block of this.gameState.blocks) {
            if (block.hp <= 0) continue;

            const dx = block.centerX - x;
            const dy = block.centerY - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= aoeRadius) {
                const actualDamage = block.hp;  // Full HP as points
                this.spawnDamageText(block.centerX, block.y, actualDamage);

                // Accumulate points to the ball that triggered explosion
                if (ball) {
                    ball.points += actualDamage;
                }

                block.takeDamage(999);  // Instant kill
                this.particles.emit(block.centerX, block.centerY, CONFIG.COLORS.RED, JUICE.PARTICLE_BLOCK_BREAK);
                this.audio.blockBreak();
                this.combo.addBreak();
            }
        }

        // Damage walls in radius (1 damage per explosion)
        for (const wall of this.gameState.walls) {
            if (wall.hp <= 0) continue;

            const dx = wall.centerX - x;
            const dy = wall.centerY - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= aoeRadius) {
                const destroyed = wall.takeDamage();
                if (destroyed) {
                    this.particles.emit(wall.centerX, wall.centerY, '#5a5a7a', 15);
                }
            }
        }

        // Remove destroyed walls
        this.gameState.walls = this.gameState.walls.filter(w => w.hp > 0);
    }

    spawnDamageText(x, y, damage) {
        this.gameState.damageTexts.push({
            x: x,
            y: y - 10,  // Start slightly above
            damage: damage,
            life: 600,  // ms
            maxLife: 600
        });
    }

    showCombo(count) {
        this.comboText.textContent = `COMBO x${count}!`;
        this.comboDisplay.classList.remove('hidden');

        // Force re-animation
        this.comboText.style.animation = 'none';
        void this.comboText.offsetWidth;
        this.comboText.style.animation = '';

        // Trigger screen flash on combo milestone
        if (JUICE.FLASH_ENABLED) {
            // Color based on combo size
            if (count >= 20) {
                this.triggerFlash('#ff00ff', JUICE.FLASH_COMBO_ALPHA + 0.2);  // Magenta for huge combos
            } else if (count >= 10) {
                this.triggerFlash('#00ffff', JUICE.FLASH_COMBO_ALPHA + 0.1);  // Cyan for big combos
            } else {
                this.triggerFlash('#ffd700', JUICE.FLASH_COMBO_ALPHA);  // Gold for normal combos
            }
        }

        clearTimeout(this.comboTimeout);
        this.comboTimeout = setTimeout(() => {
            this.comboDisplay.classList.add('hidden');
        }, 1000);
    }

    triggerFlash(color, alpha) {
        this.flashColor = color;
        this.flashAlpha = alpha;
        this.flashDuration = JUICE.FLASH_COMBO_DURATION;
        this.flashElapsed = 0;
    }

    update(dt) {
        // Update screen flash
        if (this.flashAlpha > 0) {
            this.flashElapsed += dt;
            const progress = this.flashElapsed / this.flashDuration;
            if (progress >= 1) {
                this.flashAlpha = 0;
            } else {
                // Quick flash in, slow fade out
                this.flashAlpha = this.flashAlpha * (1 - progress * progress);
            }
        }

        // Update camera shake
        this.cameraShake.update(dt);

        // Check hit stop
        if (this.hitStop.update(dt)) {
            // Frozen - skip physics but still render
            return;
        }

        if (this.gameState.isGameOver) return;

        // Pause indicator while slot is active
        if (this.gameState.slotState !== 'idle') {
            this.updateUI();
            return;
        }

        // Ping-pong indicator between 0 (right) and π (left) - full 180 degrees
        this.gameState.arrowAngle += CONFIG.ARROW_SPIN_SPEED * this.gameState.arrowDirection;
        if (this.gameState.arrowAngle >= Math.PI) {
            this.gameState.arrowAngle = Math.PI;
            this.gameState.arrowDirection = -1;
        } else if (this.gameState.arrowAngle <= 0) {
            this.gameState.arrowAngle = 0;
            this.gameState.arrowDirection = 1;
        }

        // Check for slow-motion trigger
        const remaining = CONFIG.WIN_REQUIRES_ALL_BLOCKS
            ? this.gameState.remainingBlocks
            : this.gameState.remainingColoredBlocks;

        if (JUICE.SLOWMO_ENABLED && remaining > 0 && remaining <= JUICE.SLOWMO_BLOCKS_THRESHOLD) {
            this.slowmoActive = true;
            dt *= JUICE.SLOWMO_FACTOR;  // Slow down time!
        } else {
            this.slowmoActive = false;
        }

        // Update balls
        const deadBalls = [];
        this.gameState.balls = this.gameState.balls.filter(ball => {
            const alive = ball.update(this.canvas.width, this.canvas.height, this.audio);
            if (!alive) {
                deadBalls.push(ball);
                this.audio.ballDeath();
                // Warning haptic if ball dies with low lives
                if (ball.wallLives <= 0) {
                    this.haptics.warning();
                }
            }
            return alive;
        });

        // Update blocks
        for (const block of this.gameState.blocks) {
            block.update();
        }
        this.gameState.blocks = this.gameState.blocks.filter(b => !b.isDestroyed);

        // Process collisions
        this.processBaskets();
        this.processBallWallCollisions();
        this.processBallBlockCollisions();

        // Update particles
        this.particles.update(dt);

        // Update damage texts
        for (const dt of this.gameState.damageTexts) {
            dt.life -= 16;  // ~60fps
            dt.y -= 0.8;  // Float up
        }
        this.gameState.damageTexts = this.gameState.damageTexts.filter(dt => dt.life > 0);

        // Update combo
        this.combo.update();

        // Check win/lose
        this.checkGameEnd();

        // Update UI
        this.updateUI();

        // Update debug stats
        this.gameState.debugStats.particles = this.particles.particles.filter(p => p.active).length;
    }

    checkGameEnd() {
        const remaining = CONFIG.WIN_REQUIRES_ALL_BLOCKS
            ? this.gameState.remainingBlocks
            : this.gameState.remainingColoredBlocks;

        // Win condition: all blocks destroyed AND all balls in baskets
        if (remaining === 0 && this.gameState.balls.length === 0) {
            this.gameState.isGameOver = true;
            this.gameState.hasWon = true;
            this.showOverlay(true);
            this.audio.winJingle();
            return;
        }

        // Lose condition: no spins left and no active balls
        if (this.gameState.spinsRemaining <= 0 &&
            this.gameState.balls.length === 0 &&
            this.gameState.slotState === 'idle') {
            this.gameState.isGameOver = true;
            this.gameState.hasWon = false;
            this.showOverlay(false);
            this.audio.loseSound();
        }
    }

    updateUI() {
        this.spinCountEl.textContent = `${this.gameState.spinsRemaining}`;
        this.pointsCountEl.textContent = `${this.gameState.points}`;

        // Action label
        if (this.gameState.slotState === 'idle') {
            this.actionLabel.textContent = 'to SPIN';
            this.spacebarHint.classList.remove('active');
        } else if (this.gameState.slotState === 'spinning') {
            this.actionLabel.textContent = 'to STOP';
            this.spacebarHint.classList.add('active');
        } else {
            this.actionLabel.textContent = '...';
            this.spacebarHint.classList.add('active');
        }

        // Update arrow indicator rotation on slot overlay
        const angleDeg = (this.gameState.arrowAngle * 180 / Math.PI);
        this.arrowIndicator.style.transform = `rotate(${angleDeg}deg)`;

        this.updateDebugPanel();
    }

    updateDebugPanel() {
        const stats = this.gameState.debugStats;
        const total = stats.totalSpins || 1;

        this.debugStats.innerHTML = `
            <div>FPS: ${stats.fps}</div>
            <div>Particles: ${stats.particles}</div>
            <div>Combo: ${this.combo.count}</div>
            <div>---</div>
            <div>Spins: ${stats.totalSpins}</div>
            <div>Triple: ${(stats.triples/total*100).toFixed(0)}%</div>
            <div>Pair: ${(stats.pairs/total*100).toFixed(0)}%</div>
            <div>Rainbow: ${(stats.rainbows/total*100).toFixed(0)}%</div>
        `;
    }

    showOverlay(won) {
        this.overlay.classList.remove('hidden');
        this.overlayTitle.className = won ? 'win' : 'lose';
        this.overlayTitle.textContent = won ? 'LEVEL CLEAR!' : 'GAME OVER';
        const points = this.gameState.points;
        this.overlayMessage.textContent = won
            ? `Final Score: ${points} points!`
            : `Score: ${points} points - Out of spins!`;
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
    }

    startGameLoop() {
        const loop = (currentTime) => {
            const dt = currentTime - this.lastTime;
            this.lastTime = currentTime;

            // FPS counter
            this.frameCount++;
            this.fpsTime += dt;
            if (this.fpsTime >= 1000) {
                this.gameState.debugStats.fps = this.frameCount;
                this.frameCount = 0;
                this.fpsTime = 0;
            }

            this.update(dt);
            this.renderer.render();

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

// ===========================================
// INITIALIZE
// ===========================================

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
