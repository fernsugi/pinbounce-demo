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
    WALL_LIVES_MEDIUM: 7,
    WALL_LIVES_BIG: 9,
    WALL_LIVES_RAINBALL: 6,

    // Ball movement speed
    BALL_SPEED: 6,

    // Anti-frustration grace period (ms)
    WALL_HIT_GRACE_PERIOD: 200,

    // Maximum active balls
    ACTIVE_BALL_CAP: 6,

    // Arrow spinner speed (radians per frame)
    ARROW_SPIN_SPEED: 0.04,

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
    BLOCK_SIZE: 30,

    // Level layout
    BLOCK_COUNT: 80,
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
    COLOR_WEIGHTS: { red: 3, yellow: 3, blue: 3, neutral: 1 }
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

class GameState {
    constructor() {
        this.balls = [];
        this.blocks = [];
        this.isRunning = false;
        this.isGameOver = false;
        this.hasWon = false;
        this.arrowAngle = -Math.PI / 2;

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
        this.isRunning = false;
        this.isGameOver = false;
        this.hasWon = false;
        this.arrowAngle = -Math.PI / 2;
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
        this.wallLives = this.getWallLivesByType(type);
        this.maxWallLives = this.wallLives;

        // Blue special: 3x speed + 2x size + breaks anything until first wall hit
        this.isBlue = color === 'blue';
        this.bluePiercing = this.isBlue;  // Loses piercing after first wall hit
        if (this.isBlue) {
            this.baseRadius *= 2;  // Double size
        }

        // Rainball: always 3x speed
        const isRainbow = color === 'rainbow';
        const speedMultiplier = this.isBlue ? 3 : (isRainbow ? 3 : 1);

        const speed = CONFIG.BALL_SPEED * speedMultiplier;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // Red special: AOE on first block break
        this.isRed = color === 'red';
        this.redAOEReady = this.isRed;  // Can only use AOE once

        this.lastWallHitTime = 0;
        this.spawnTime = Date.now();

        // Trail for visual effect
        this.trail = [];
    }

    // Dynamic radius based on remaining wall lives
    get radius() {
        const minScale = 0.4;  // Ball shrinks to 40% of original at 1 life
        const lifeRatio = this.wallLives / this.maxWallLives;
        const scale = minScale + (1 - minScale) * lifeRatio;
        return this.baseRadius * scale;
    }

    getRadiusByType(type) {
        switch(type) {
            case 'big': return CONFIG.BALL_RADIUS_BIG;
            case 'medium': return CONFIG.BALL_RADIUS_MEDIUM;
            default: return CONFIG.BALL_RADIUS_NORMAL;
        }
    }

    getWallLivesByType(type) {
        switch(type) {
            case 'big': return CONFIG.WALL_LIVES_BIG;
            case 'medium': return CONFIG.WALL_LIVES_MEDIUM;
            case 'rainball': return CONFIG.WALL_LIVES_RAINBALL;
            default: return CONFIG.WALL_LIVES_NORMAL;
        }
    }

    update(canvasWidth, canvasHeight, audioManager) {
        // Store trail
        if (JUICE.TRAIL_ENABLED && !JUICE.PERFORMANCE_MODE) {
            this.trail.unshift({ x: this.x, y: this.y });
            if (this.trail.length > JUICE.TRAIL_LENGTH) this.trail.pop();
        }

        this.x += this.vx;
        this.y += this.vy;

        // Normalize speed
        const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (Math.abs(currentSpeed - CONFIG.BALL_SPEED) > 0.1) {
            const factor = CONFIG.BALL_SPEED / currentSpeed;
            this.vx *= factor;
            this.vy *= factor;
        }

        // Wall collisions
        const now = Date.now();
        let hitWall = false;

        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = Math.abs(this.vx);
            hitWall = true;
        }
        if (this.x + this.radius > canvasWidth) {
            this.x = canvasWidth - this.radius;
            this.vx = -Math.abs(this.vx);
            hitWall = true;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = Math.abs(this.vy);
            hitWall = true;
        }
        if (this.y + this.radius > canvasHeight) {
            this.y = canvasHeight - this.radius;
            this.vy = -Math.abs(this.vy);
            hitWall = true;
        }

        if (hitWall && now - this.lastWallHitTime > CONFIG.WALL_HIT_GRACE_PERIOD) {
            this.wallLives--;
            this.lastWallHitTime = now;

            // Blue special: lose piercing, slow down, and shrink after first wall hit
            if (this.bluePiercing) {
                this.bluePiercing = false;
                // Slow down to normal speed
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                const factor = CONFIG.BALL_SPEED / currentSpeed;
                this.vx *= factor;
                this.vy *= factor;
                // Shrink back to normal size
                this.baseRadius = this.getRadiusByType(this.type);
            }

            if (audioManager) {
                audioManager.wallHit(this.wallLives, this.maxWallLives);
            }
        }

        return this.wallLives > 0;
    }

    canDamage(block) {
        if (this.color === 'rainbow') return true;
        if (block.color === 'neutral') return true;
        // Blue special: piercing mode breaks ANY block
        if (this.bluePiercing) return true;
        return this.color === block.color;
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
        this.hp = CONFIG.BLOCK_DEFAULT_HP;
        this.maxHp = this.hp;
        this.hitFlash = 0;
        this.breaking = false;
        this.breakProgress = 0;
    }

    takeDamage() {
        this.hp--;
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

        this.gameState.slotState = 'spinning';
        this.gameState.slotStoppedCount = 0;
        this.gameState.slotReels = ['?', '?', '?'];
        this.gameState.debugStats.totalSpins++;

        // Show overlay
        document.getElementById('slot-overlay').classList.remove('hidden');
        document.getElementById('slot-result').textContent = '';
        document.getElementById('slot-hint').textContent = 'Press SPACE to stop';

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

        // Initialize first reel with current index
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

    drawArrow() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        // Super long arrow - extends to edge of canvas
        const length = Math.max(this.canvas.width, this.canvas.height);
        const angle = this.gameState.arrowAngle;

        const endX = cx + Math.cos(angle) * length;
        const endY = cy + Math.sin(angle) * length;

        // Glow (half opacity)
        this.ctx.strokeStyle = 'rgba(0, 210, 211, 0.15)';
        this.ctx.lineWidth = 12;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();

        // Main line (half opacity)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();

        // Arrow head at a reasonable distance from center
        const headDist = 60;
        const headX = cx + Math.cos(angle) * headDist;
        const headY = cy + Math.sin(angle) * headDist;
        const headLength = 14;
        const headAngle = 0.5;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(headX, headY);
        this.ctx.lineTo(
            headX - Math.cos(angle - headAngle) * headLength,
            headY - Math.sin(angle - headAngle) * headLength
        );
        this.ctx.moveTo(headX, headY);
        this.ctx.lineTo(
            headX - Math.cos(angle + headAngle) * headLength,
            headY - Math.sin(angle + headAngle) * headLength
        );
        this.ctx.stroke();

        // Center dot
        this.ctx.fillStyle = 'rgba(0, 210, 211, 0.4)';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawBall(ball) {
        // Draw trail
        if (JUICE.TRAIL_ENABLED && !JUICE.PERFORMANCE_MODE && ball.trail.length > 0) {
            for (let i = 0; i < ball.trail.length; i++) {
                const t = ball.trail[i];
                const alpha = (1 - i / ball.trail.length) * 0.4;
                const radius = ball.radius * (1 - i / ball.trail.length * 0.6);

                if (ball.color === 'rainbow') {
                    this.ctx.fillStyle = `hsla(${(this.rainbowHue + i * 25) % 360}, 80%, 60%, ${alpha})`;
                } else {
                    this.ctx.fillStyle = ball.getDisplayColor();
                    this.ctx.globalAlpha = alpha;
                }

                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
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

        // Wall lives indicator (arc segments around ball)
        if (JUICE.LIVES_INDICATOR) {
            const livesRatio = ball.wallLives / ball.maxWallLives;
            const indicatorRadius = ball.radius + 4;

            // Background arc
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, indicatorRadius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Lives arc
            if (livesRatio > 0) {
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + (Math.PI * 2 * livesRatio);

                // Color based on remaining lives
                if (livesRatio > 0.5) {
                    this.ctx.strokeStyle = '#00d2d3';
                } else if (livesRatio > 0.25) {
                    this.ctx.strokeStyle = '#ffc312';
                } else {
                    this.ctx.strokeStyle = '#ff4757';
                }

                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, indicatorRadius, startAngle, endAngle);
                this.ctx.stroke();
            }
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

        // Draw blocks
        for (const block of this.gameState.blocks) {
            this.drawBlock(block);
        }

        // Draw arrow
        if (this.gameState.slotState === 'idle' && !this.gameState.isGameOver) {
            this.drawArrow();
        }

        // Draw particles (behind balls)
        this.particles.render(this.ctx);

        // Draw balls
        for (const ball of this.gameState.balls) {
            this.drawBall(ball);
        }

        this.ctx.restore();
    }
}

// ===========================================
// LEVEL GENERATOR
// ===========================================

function generateLevel(gameState, canvasWidth, canvasHeight) {
    gameState.blocks = [];

    const blockSize = CONFIG.BLOCK_SIZE;
    const padding = CONFIG.BLOCK_PADDING;
    const margin = CONFIG.BLOCK_MARGIN;
    const count = CONFIG.BLOCK_COUNT;

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const centerClearRadius = 80;

    const colorPool = [];
    for (const [color, weight] of Object.entries(CONFIG.COLOR_WEIGHTS)) {
        for (let i = 0; i < weight; i++) {
            colorPool.push(color);
        }
    }

    function isValidPosition(x, y) {
        const dx = (x + blockSize/2) - centerX;
        const dy = (y + blockSize/2) - centerY;
        if (Math.sqrt(dx*dx + dy*dy) < centerClearRadius) return false;

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

        if (isValidPosition(x, y)) {
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
        this.slotMachine = new SlotMachine(this.gameState, this.audio);
        this.slotMachine.onResult = (color, count) => this.spawnBalls(color, count);

        // UI elements
        this.spacebarHint = document.getElementById('spacebar-hint');
        this.actionLabel = document.getElementById('action-label');
        this.ballCountEl = document.getElementById('ball-count');
        this.blockCountEl = document.getElementById('block-count');
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
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
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

    processBallBlockCollisions() {
        for (const ball of this.gameState.balls) {
            for (const block of this.gameState.blocks) {
                if (block.hp <= 0) continue;

                const collision = circleRectCollision(ball, block);

                if (collision.hit) {
                    const canDamage = ball.canDamage(block);

                    if (canDamage) {
                        const destroyed = block.takeDamage();

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

                            // Red special: AOE explosion on first block break
                            if (ball.redAOEReady) {
                                ball.redAOEReady = false;
                                this.triggerRedAOE(block.centerX, block.centerY);
                            }

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
    triggerRedAOE(x, y) {
        const aoeRadius = 80;  // Explosion radius in pixels

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
                block.takeDamage();
                this.particles.emit(block.centerX, block.centerY, CONFIG.COLORS.RED, JUICE.PARTICLE_BLOCK_BREAK);
                this.audio.blockBreak();
                this.combo.addBreak();
            }
        }
    }

    showCombo(count) {
        this.comboText.textContent = `COMBO x${count}!`;
        this.comboDisplay.classList.remove('hidden');

        // Force re-animation
        this.comboText.style.animation = 'none';
        void this.comboText.offsetWidth;
        this.comboText.style.animation = '';

        clearTimeout(this.comboTimeout);
        this.comboTimeout = setTimeout(() => {
            this.comboDisplay.classList.add('hidden');
        }, 1000);
    }

    update(dt) {
        // Update camera shake
        this.cameraShake.update(dt);

        // Check hit stop
        if (this.hitStop.update(dt)) {
            // Frozen - skip physics but still render
            return;
        }

        if (this.gameState.isGameOver) return;

        // Pause game while slot is active (spinning/stopping/result)
        // Arrow is already locked when slot started, don't update anything
        if (this.gameState.slotState !== 'idle') {
            this.updateUI();
            return;
        }

        // Rotate arrow
        this.gameState.arrowAngle += CONFIG.ARROW_SPIN_SPEED;

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
        this.processBallBlockCollisions();

        // Update particles
        this.particles.update(dt);

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

        if (remaining === 0) {
            this.gameState.isGameOver = true;
            this.gameState.hasWon = true;
            this.showOverlay(true);
            this.audio.winJingle();
        }
    }

    updateUI() {
        this.ballCountEl.textContent = `${this.gameState.activeBallCount}`;

        const remaining = CONFIG.WIN_REQUIRES_ALL_BLOCKS
            ? this.gameState.remainingBlocks
            : this.gameState.remainingColoredBlocks;
        this.blockCountEl.textContent = remaining.toString();

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
        this.overlayTitle.textContent = won ? 'LEVEL CLEAR!' : 'TRY AGAIN';
        this.overlayMessage.textContent = won ? 'All blocks destroyed!' : 'Better luck next time!';
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
