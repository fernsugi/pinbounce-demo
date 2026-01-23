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
// ECONOMY CONSTANTS - Monetization system
// ===========================================

const ECONOMY = {
    STARTING_POINTS: 6000,          // New player starting balance
    SPIN_COST: 300,                 // Cost per slot spin
    DAILY_REWARD: 3000,             // Daily login reward
    AD_REWARD: 3000,                // Points for watching an ad
    FREE_SPIN_PACK_COUNT: 5,        // Spins in a pack
    FREE_SPIN_PACK_PRICE: 0.99,     // USD (dummy)

    // Cosmetics prices (in points for common, real money for rare)
    COSMETICS: {
        BALL_SKIN_COMMON: 500,      // Points
        BALL_SKIN_RARE: 1.99,       // USD (dummy)
        TRAIL_COMMON: 300,          // Points
        TRAIL_RARE: 0.99,           // USD (dummy)
    }
};

// ===========================================
// PLAYER DATA - Persistent storage
// ===========================================

class PlayerData {
    constructor() {
        this.load();
    }

    getDefaults() {
        return {
            points: ECONOMY.STARTING_POINTS,
            freeSpins: 0,
            totalGamesPlayed: 0,
            totalPointsEarned: 0,
            highScore: 0,
            lastDailyReward: null,
            ownedCosmetics: ['default_ball', 'default_trail'],
            equippedBallSkin: 'default_ball',
            equippedTrail: 'default_trail',
            adsWatched: 0,
            settings: {
                sound: true,
                haptics: true,
                performanceMode: false
            }
        };
    }

    load() {
        try {
            const saved = localStorage.getItem('pinbounce_playerdata');
            if (saved) {
                const data = JSON.parse(saved);
                // Merge with defaults to handle new fields
                const defaults = this.getDefaults();
                Object.assign(this, defaults, data);
            } else {
                Object.assign(this, this.getDefaults());
            }
        } catch (e) {
            console.error('Failed to load player data:', e);
            Object.assign(this, this.getDefaults());
        }
    }

    save() {
        try {
            const data = {
                points: this.points,
                freeSpins: this.freeSpins,
                totalGamesPlayed: this.totalGamesPlayed,
                totalPointsEarned: this.totalPointsEarned,
                highScore: this.highScore,
                lastDailyReward: this.lastDailyReward,
                ownedCosmetics: this.ownedCosmetics,
                equippedBallSkin: this.equippedBallSkin,
                equippedTrail: this.equippedTrail,
                adsWatched: this.adsWatched,
                settings: this.settings
            };
            localStorage.setItem('pinbounce_playerdata', JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save player data:', e);
        }
    }

    canAffordSpin() {
        return this.freeSpins > 0 || this.points >= ECONOMY.SPIN_COST;
    }

    spendSpin() {
        if (this.freeSpins > 0) {
            this.freeSpins--;
            this.save();
            return true;
        } else if (this.points >= ECONOMY.SPIN_COST) {
            this.points -= ECONOMY.SPIN_COST;
            this.save();
            return true;
        }
        return false;
    }

    addPoints(amount) {
        this.points += amount;
        this.totalPointsEarned += amount;
        if (amount > this.highScore) {
            this.highScore = amount;
        }
        this.save();
    }

    canClaimDailyReward() {
        if (!this.lastDailyReward) return true;
        const last = new Date(this.lastDailyReward);
        const now = new Date();
        // Check if it's a new day
        return last.toDateString() !== now.toDateString();
    }

    claimDailyReward() {
        if (!this.canClaimDailyReward()) return false;
        this.points += ECONOMY.DAILY_REWARD;
        this.lastDailyReward = new Date().toISOString();
        this.save();
        return true;
    }

    watchAd() {
        this.points += ECONOMY.AD_REWARD;
        this.adsWatched++;
        this.save();
    }

    purchaseFreeSpins() {
        // Dummy - in real implementation, this would go through payment
        this.freeSpins += ECONOMY.FREE_SPIN_PACK_COUNT;
        this.save();
        return true;
    }

    purchaseCosmetic(id, type) {
        if (this.ownedCosmetics.includes(id)) return false;
        this.ownedCosmetics.push(id);
        this.save();
        return true;
    }

    equipCosmetic(id, type) {
        if (!this.ownedCosmetics.includes(id)) return false;
        if (type === 'ball') {
            this.equippedBallSkin = id;
        } else if (type === 'trail') {
            this.equippedTrail = id;
        }
        this.save();
        return true;
    }

    resetProgress() {
        Object.assign(this, this.getDefaults());
        this.save();
    }
}

// Global player data instance
const playerData = new PlayerData();

// ===========================================
// TOAST NOTIFICATION SYSTEM
// ===========================================

function showToast(message, type = 'info', duration = 2500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===========================================
// MENU MANAGER - Main menu and shop
// ===========================================

class MenuManager {
    constructor() {
        this.mainMenu = document.getElementById('main-menu');
        this.shopPanel = document.getElementById('shop-panel');
        this.settingsPanel = document.getElementById('settings-panel');
        this.adPrompt = document.getElementById('ad-prompt');
        this.adPlayer = document.getElementById('ad-player');
        this.purchaseConfirm = document.getElementById('purchase-confirm');

        // Menu elements
        this.menuPoints = document.getElementById('menu-points');
        this.menuFreeSpinCount = document.getElementById('menu-free-spin-count');
        this.menuFreeSpins = document.getElementById('menu-free-spins');
        this.dailyRewardBanner = document.getElementById('daily-reward-banner');
        this.statGames = document.getElementById('stat-games');
        this.statHighscore = document.getElementById('stat-highscore');
        this.statTotal = document.getElementById('stat-total');

        // Shop elements
        this.shopPoints = document.getElementById('shop-points');

        // Current purchase context
        this.pendingPurchase = null;

        // Ad countdown
        this.adCountdown = 5;
        this.adTimer = null;

        this.setupEventListeners();
        this.updateMenuUI();
    }

    setupEventListeners() {
        // Play button
        document.getElementById('play-btn').addEventListener('click', () => {
            this.hideMainMenu();
            if (window.game) {
                window.game.startNewGame();
            }
        });

        // Shop button
        document.getElementById('shop-btn').addEventListener('click', () => {
            this.showShop();
        });

        // Menu settings button
        document.getElementById('menu-settings-btn').addEventListener('click', () => {
            this.mainMenu.classList.add('hidden');
            // Hide any lingering overlays
            document.getElementById('overlay').classList.add('hidden');
            document.getElementById('overlay-points-earned').classList.add('hidden');
            document.getElementById('slot-overlay').classList.add('hidden');
            document.getElementById('skill-wheel-overlay').classList.add('hidden');
            this.settingsPanel.classList.remove('hidden');
        });

        // Shop close
        document.getElementById('shop-close').addEventListener('click', () => {
            this.hideShop();
        });

        // Daily reward claim
        document.getElementById('claim-daily-btn').addEventListener('click', () => {
            if (playerData.claimDailyReward()) {
                showToast(`+${ECONOMY.DAILY_REWARD} points!`, 'reward', 3000);
                this.updateMenuUI();
            }
        });

        // Free spins purchase
        document.getElementById('buy-spins-btn').addEventListener('click', () => {
            this.showPurchaseConfirm(
                'Buy Free Spins',
                `Get ${ECONOMY.FREE_SPIN_PACK_COUNT} free spins for $${ECONOMY.FREE_SPIN_PACK_PRICE}?`,
                () => {
                    playerData.purchaseFreeSpins();
                    showToast(`+${ECONOMY.FREE_SPIN_PACK_COUNT} free spins!`, 'success');
                    this.updateMenuUI();
                    this.updateShopUI();
                }
            );
        });

        // Cosmetic items
        document.querySelectorAll('.cosmetic-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const type = item.dataset.type;
                const price = parseFloat(item.dataset.price);
                const currency = item.dataset.currency;

                if (playerData.ownedCosmetics.includes(id)) {
                    // Already owned - equip it
                    playerData.equipCosmetic(id, type);
                    showToast('Equipped!', 'success');
                    this.updateShopUI();
                } else {
                    // Purchase
                    if (currency === 'points') {
                        if (playerData.points >= price) {
                            this.showPurchaseConfirm(
                                'Buy Cosmetic',
                                `Buy this item for ${price} points?`,
                                () => {
                                    playerData.points -= price;
                                    playerData.purchaseCosmetic(id, type);
                                    playerData.equipCosmetic(id, type);
                                    showToast('Purchased & equipped!', 'success');
                                    this.updateMenuUI();
                                    this.updateShopUI();
                                }
                            );
                        } else {
                            showToast('Not enough points!', 'error');
                        }
                    } else {
                        // USD purchase (dummy)
                        this.showPurchaseConfirm(
                            'Buy Cosmetic',
                            `Buy this item for $${price}?`,
                            () => {
                                playerData.purchaseCosmetic(id, type);
                                playerData.equipCosmetic(id, type);
                                showToast('Purchased & equipped!', 'success');
                                this.updateShopUI();
                            }
                        );
                    }
                }
            });
        });

        // Purchase confirm buttons
        document.getElementById('confirm-purchase-btn').addEventListener('click', () => {
            if (this.pendingPurchase) {
                this.pendingPurchase();
                this.pendingPurchase = null;
            }
            this.hidePurchaseConfirm();
        });

        document.getElementById('cancel-purchase-btn').addEventListener('click', () => {
            this.pendingPurchase = null;
            this.hidePurchaseConfirm();
        });

        // Ad prompt buttons
        document.getElementById('watch-ad-btn').addEventListener('click', () => {
            this.hideAdPrompt();
            this.showAdPlayer();
        });

        document.getElementById('no-ad-btn').addEventListener('click', () => {
            this.hideAdPrompt();
            this.showMainMenu();
        });

        // Ad skip button
        document.getElementById('ad-skip-btn').addEventListener('click', () => {
            this.completeAd();
        });

        // Reset progress
        document.getElementById('reset-progress-btn').addEventListener('click', () => {
            if (confirm('Are you sure? This will reset ALL progress!')) {
                playerData.resetProgress();
                showToast('Progress reset', 'warning');
                this.updateMenuUI();
            }
        });

        // Settings toggles
        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            playerData.settings.sound = e.target.checked;
            playerData.save();
            JUICE.SOUND_ENABLED = e.target.checked;
            if (window.game) window.game.audio.enabled = e.target.checked;
        });

        document.getElementById('haptics-toggle').addEventListener('change', (e) => {
            playerData.settings.haptics = e.target.checked;
            playerData.save();
            JUICE.HAPTICS_ENABLED = e.target.checked;
        });

        document.getElementById('perf-toggle').addEventListener('change', (e) => {
            playerData.settings.performanceMode = e.target.checked;
            playerData.save();
            JUICE.PERFORMANCE_MODE = e.target.checked;
        });

        document.getElementById('settings-close').addEventListener('click', () => {
            this.settingsPanel.classList.add('hidden');
            this.mainMenu.classList.remove('hidden');
            this.updateMenuUI();
        });
    }

    updateMenuUI() {
        // Update points display
        this.menuPoints.textContent = playerData.points.toLocaleString();

        // Update free spins display
        if (playerData.freeSpins > 0) {
            this.menuFreeSpins.classList.remove('hidden');
            this.menuFreeSpinCount.textContent = playerData.freeSpins;
        } else {
            this.menuFreeSpins.classList.add('hidden');
        }

        // Update daily reward banner
        if (playerData.canClaimDailyReward()) {
            this.dailyRewardBanner.classList.remove('hidden');
        } else {
            this.dailyRewardBanner.classList.add('hidden');
        }

        // Update stats
        this.statGames.textContent = playerData.totalGamesPlayed;
        this.statHighscore.textContent = playerData.highScore.toLocaleString();
        this.statTotal.textContent = playerData.totalPointsEarned.toLocaleString();

        // Sync settings toggles
        document.getElementById('sound-toggle').checked = playerData.settings.sound;
        document.getElementById('haptics-toggle').checked = playerData.settings.haptics;
        document.getElementById('perf-toggle').checked = playerData.settings.performanceMode;
    }

    updateShopUI() {
        this.shopPoints.textContent = playerData.points.toLocaleString();

        // Update cosmetic item states
        document.querySelectorAll('.cosmetic-item').forEach(item => {
            const id = item.dataset.id;
            const type = item.dataset.type;

            item.classList.remove('owned', 'equipped');

            if (playerData.ownedCosmetics.includes(id)) {
                item.classList.add('owned');

                // Check if equipped
                if ((type === 'ball' && playerData.equippedBallSkin === id) ||
                    (type === 'trail' && playerData.equippedTrail === id)) {
                    item.classList.add('equipped');
                }

                // Update price display to show status
                const priceEl = item.querySelector('.cosmetic-price');
                if (priceEl) {
                    if (item.classList.contains('equipped')) {
                        priceEl.textContent = 'EQUIPPED';
                        priceEl.className = 'cosmetic-status';
                    } else {
                        priceEl.textContent = 'OWNED';
                        priceEl.className = 'cosmetic-status';
                    }
                }
            }
        });
    }

    showMainMenu() {
        this.mainMenu.classList.remove('hidden');
        this.updateMenuUI();
    }

    hideMainMenu() {
        this.mainMenu.classList.add('hidden');
    }

    showShop() {
        this.mainMenu.classList.add('hidden');
        // Hide any lingering overlays
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('overlay-points-earned').classList.add('hidden');
        document.getElementById('slot-overlay').classList.add('hidden');
        document.getElementById('skill-wheel-overlay').classList.add('hidden');
        this.shopPanel.classList.remove('hidden');
        this.updateShopUI();
    }

    hideShop() {
        this.shopPanel.classList.add('hidden');
        this.mainMenu.classList.remove('hidden');
        this.updateMenuUI();
    }

    showPurchaseConfirm(title, desc, callback) {
        document.getElementById('purchase-title').textContent = title;
        document.getElementById('purchase-desc').textContent = desc;
        this.pendingPurchase = callback;
        this.purchaseConfirm.classList.remove('hidden');
    }

    hidePurchaseConfirm() {
        this.purchaseConfirm.classList.add('hidden');
    }

    showAdPrompt() {
        this.adPrompt.classList.remove('hidden');
    }

    hideAdPrompt() {
        this.adPrompt.classList.add('hidden');
    }

    showAdPlayer() {
        this.adPlayer.classList.remove('hidden');
        this.adCountdown = 5;
        document.getElementById('ad-countdown').textContent = this.adCountdown;
        document.getElementById('ad-skip-btn').classList.add('hidden');

        this.adTimer = setInterval(() => {
            this.adCountdown--;
            document.getElementById('ad-countdown').textContent = this.adCountdown;

            if (this.adCountdown <= 0) {
                clearInterval(this.adTimer);
                document.getElementById('ad-skip-btn').classList.remove('hidden');
            }
        }, 1000);
    }

    completeAd() {
        clearInterval(this.adTimer);
        this.adPlayer.classList.add('hidden');
        playerData.watchAd();
        showToast(`+${ECONOMY.AD_REWARD} points!`, 'reward', 3000);
        this.updateMenuUI();
        this.showMainMenu();
    }
}

// Global menu manager instance (created after DOM loads)
let menuManager = null;

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
    BALL_BOOST_MULTIPLIER: 2.5,  // Initial speed boost (lost on first wall hit)
    GRAVITY: 0.05,  // Downward acceleration per frame

    // Base (spawn point) - moves left/right at top
    BASE_Y: 0,
    BASE_RADIUS: 20,
    BASE_SPEED: 3,  // Horizontal movement speed

    // Anti-frustration grace period (ms)
    WALL_HIT_GRACE_PERIOD: 200,

    // Maximum active balls
    ACTIVE_BALL_CAP: 6,

    // Arrow spinner speed (radians per frame)
    ARROW_SPIN_SPEED: 0.008,

    // Slot machine timing (ms)
    SLOT_SPIN_TIME: 700,
    SLOT_REEL1_INTERVAL: 120,       // First reel: slow & predictable (higher = slower)
    SLOT_REEL23_INTERVAL: 50,       // Other reels: fast & random
    SLOT_AUTO_STOP_DELAY: 60,       // Quick stops between reels
    SLOT_RESULT_DISPLAY: 80,        // Brief result display

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

    // Block color weights (1,1,1,0 = no gray blocks)
    COLOR_WEIGHTS: { red: 1, yellow: 1, blue: 1, neutral: 0 }
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
        // Base position: moves left/right at top of screen
        this.baseX = 0;  // Will be set to canvas center on init
        this.baseDirection = 1;  // 1 = moving right, -1 = moving left
        this.damageTexts = [];  // Floating damage numbers

        // Spin counter (lose if it reaches 0 with blocks remaining)
        this.spinsRemaining = 10;

        // Points system
        this.points = 0;

        // Slot machine state
        this.slotState = 'idle';
        this.slotReels = ['?', '?', '?'];
        this.slotStoppedCount = 0;

        // Skill wheel state
        this.skillWheelState = 'idle';  // idle, spinning, result
        this.skillWheelCooldown = 0;    // Timestamp when cooldown ends

        // Basket order (shuffled each game)
        this.basketOrder = [0, 1, 2, 3, 4];  // Will be shuffled on reset

        // Pending skill (for next shot if skill wheel won with no balls)
        this.pendingSkill = null;

        // Fever Time fairies and jackpot
        this.fairies = [];           // Array of fairy objects
        this.fairiesCollected = 0;   // Count of collected fairies
        this.jackpotState = 'idle';  // idle, spinning, reward
        this.jackpotResults = [];    // Array of 'O' or 'X'
        this.jackpotRevealIndex = 0; // Current slot being revealed
        this.jackpotRewardTimer = 0; // Seconds of auto-shooting remaining

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
        // baseX will be set to canvas center by Game.init()
        this.baseDirection = 1;
        this.spinsRemaining = 10;
        this.points = 0;
        this.slotState = 'idle';
        this.slotReels = ['?', '?', '?'];
        this.slotStoppedCount = 0;
        this.skillWheelState = 'idle';
        this.skillWheelCooldown = 0;
        this.pendingSkill = null;
        // Reset fairies and jackpot
        this.fairies = [];
        this.fairiesCollected = 0;
        this.jackpotState = 'idle';
        this.jackpotResults = [];
        this.jackpotRevealIndex = 0;
        this.jackpotRewardTimer = 0;
        // Shuffle basket order
        this.basketOrder = [0, 1, 2, 3, 4];
        for (let i = this.basketOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.basketOrder[i], this.basketOrder[j]] = [this.basketOrder[j], this.basketOrder[i]];
        }
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

        // Calculate speed (rainbow is faster)
        const isRainbow = color === 'rainbow';
        let baseSpeed = isRainbow ? CONFIG.BALL_SPEED * 2 : CONFIG.BALL_SPEED;

        // Apply initial speed boost
        this.normalSpeed = baseSpeed;
        this.boosted = true;
        const boostedSpeed = baseSpeed * CONFIG.BALL_BOOST_MULTIPLIER;

        this.vx = Math.cos(angle) * boostedSpeed;
        this.vy = Math.sin(angle) * boostedSpeed;

        this.spawnTime = Date.now();

        // Trail for visual effect
        this.trail = [];

        // Points accumulated by this ball (from block damage)
        this.points = 0;

        // Skill wheel abilities (applied to all balls when triggered)
        this.hasBulldoze = false;  // Pierces through blocks
        this.hasExplosion = false; // Explodes on hit

        // Track wall hits this frame (for bonus points when no blocks left)
        this.hitWallThisFrame = false;
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

        const timeSinceSpawn = Date.now() - this.spawnTime;

        this.x += this.vx;
        this.y += this.vy;

        // Side wall collisions (left and right)
        let hitOuterWall = false;
        this.hitWallThisFrame = false;  // Reset each frame
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

        // Track wall hit for bonus points
        this.hitWallThisFrame = hitOuterWall;

        // Add tiny random nudge on wall hit to prevent infinite loops
        if (hitOuterWall) {
            this.vx += (Math.random() - 0.5) * 0.1;
            this.vy += (Math.random() - 0.5) * 0.1;
        }

        // Lose boost on outer wall hit (with spawn grace period)
        if (hitOuterWall && this.boosted && timeSinceSpawn > 200) {
            this.boosted = false;
            // Slow down to normal speed
            const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeed > this.normalSpeed) {
                const factor = this.normalSpeed / currentSpeed;
                this.vx *= factor;
                this.vy *= factor;
            }
        }

        // Bulldoze ability lost on outer wall hit (with spawn grace period)
        if (hitOuterWall && this.hasBulldoze && timeSinceSpawn > 200) {
            this.hasBulldoze = false;
            this.baseRadius = this.getRadiusByType(this.type);  // Shrink back to normal
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
        if (this.hasBulldoze) return 999;  // Bulldoze instant kill
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
        // Note: spending is handled by playerData.spendSpin() in Game.onActionButton()

        this.gameState.slotState = 'spinning';
        this.gameState.slotStoppedCount = 0;
        this.gameState.slotReels = ['?', '?', '?'];
        this.gameState.debugStats.totalSpins++;

        // Show overlay
        document.getElementById('slot-overlay').classList.remove('hidden');
        document.getElementById('slot-result').textContent = '';
        document.getElementById('slot-hint').textContent = '';  // No hint needed - auto completes

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

        // Auto-stop after brief spin animation (no second space needed)
        this.autoStopTimeouts.push(
            setTimeout(() => this.stopReel(), 150)  // First reel after 150ms
        );
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

        // Hide overlay quickly
        setTimeout(() => {
            document.getElementById('slot-overlay').classList.add('hidden');
            this.gameState.slotState = 'idle';
            if (this.onResult) this.onResult(ballColor, ballCount);
        }, 100);
    }

    skipToResult() {
        // Skip animation and show result immediately
        if (this.gameState.slotState !== 'spinning' &&
            this.gameState.slotState !== 'stopping') return;

        // Clear all intervals and timeouts
        clearInterval(this.reel1Interval);
        clearInterval(this.reel23Interval);
        this.autoStopTimeouts.forEach(t => clearTimeout(t));
        this.autoStopTimeouts = [];

        // Stop any remaining reels with final values
        while (this.gameState.slotStoppedCount < 3) {
            const reelIndex = this.gameState.slotStoppedCount;
            if (reelIndex === 0) {
                // First reel keeps current value
            } else {
                this.gameState.slotReels[reelIndex] = this.getBiasedReelValue();
            }
            this.gameState.slotStoppedCount++;
        }

        this.updateReelDisplay();
        this.gameState.slotState = 'result';
        this.resolveResult();
    }

    skipResultDisplay() {
        // Skip result display and spawn balls immediately
        if (this.gameState.slotState !== 'result') return;

        const reels = this.gameState.slotReels;
        const firstReelColor = reels[0];
        const firstColorCount = reels.filter(r => r === firstReelColor).length;
        const isRainbow = new Set(reels).size === 3;

        let ballColor, ballCount;
        if (isRainbow) {
            ballColor = 'rainbow';
            ballCount = 1;
        } else {
            ballColor = firstReelColor;
            ballCount = firstColorCount;
        }

        document.getElementById('slot-overlay').classList.add('hidden');
        this.gameState.slotState = 'idle';
        if (this.onResult) this.onResult(ballColor, ballCount);
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
// SKILL WHEEL
// ===========================================

class SkillWheel {
    constructor(gameState, audioManager) {
        this.gameState = gameState;
        this.audio = audioManager;

        // Wheel segments: 3 skills + 3 misses
        this.segments = [
            { name: 'BOMB', color: '#ff4757', skill: 'explosion' },
            { name: 'MISS', color: '#333', skill: null },
            { name: 'SPLIT', color: '#ffc312', skill: 'split' },
            { name: 'MISS', color: '#333', skill: null },
            { name: 'BULLDOZE', color: '#3498db', skill: 'bulldoze' },
            { name: 'MISS', color: '#333', skill: null }
        ];

        this.canvas = document.getElementById('skill-wheel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.overlay = document.getElementById('skill-wheel-overlay');
        this.resultEl = document.getElementById('skill-wheel-result');
        this.hintEl = document.getElementById('skill-wheel-hint');

        this.rotation = 0;
        this.spinning = false;
        this.spinSpeed = 0;
        this.targetRotation = 0;

        this.onResult = null;  // Callback when wheel stops

        this.drawWheel();
    }

    drawWheel() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const radius = Math.min(cx, cy) - 5;
        const segmentAngle = (Math.PI * 2) / this.segments.length;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);

        // Draw segments
        for (let i = 0; i < this.segments.length; i++) {
            const startAngle = i * segmentAngle - Math.PI / 2;
            const endAngle = startAngle + segmentAngle;

            // Segment fill
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = this.segments[i].color;
            ctx.fill();

            // Segment border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Segment text
            ctx.save();
            ctx.rotate(startAngle + segmentAngle / 2);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(this.segments[i].name, radius - 15, 0);
            ctx.restore();
        }

        // Center circle
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a3a';
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }

    show() {
        this.overlay.classList.remove('hidden');
        this.resultEl.textContent = '';
        this.resultEl.className = '';
        this.hintEl.textContent = '';  // No hint - auto completes
        this.stopping = false;
        this.gameState.skillWheelState = 'spinning';

        // Random starting position so players don't miss consecutively
        this.rotation = Math.random() * Math.PI * 2;
        this.drawWheel();

        // Auto-start spinning
        this.spinning = true;
        this.spinSpeed = 0.3;
        this.animateSpin();

        // Auto-stop after brief spin (quick so it's not frustrating)
        setTimeout(() => this.stopSpin(), 200);
    }

    hide() {
        this.overlay.classList.add('hidden');
        this.gameState.skillWheelState = 'idle';
        this.gameState.skillWheelCooldown = Date.now() + 2000;  // 2 second cooldown
    }

    stopSpin() {
        if (!this.spinning || this.stopping) return;

        this.stopping = true;
        this.hintEl.textContent = 'Stopping...';
        this.audio.uiClick();

        // Set target to current + 0.3-0.8 more rotations for quick slowdown
        const extraRotations = 0.3 + Math.random() * 0.5;
        this.targetRotation = this.rotation + (extraRotations * Math.PI * 2);
    }

    animateSpin() {
        if (!this.spinning) return;

        if (this.stopping) {
            // Ease out to target (faster deceleration)
            const remaining = this.targetRotation - this.rotation;
            if (remaining > 0.02) {
                this.spinSpeed = Math.max(0.02, remaining * 0.15);
                this.rotation += this.spinSpeed;
                this.drawWheel();
                requestAnimationFrame(() => this.animateSpin());
            } else {
                this.rotation = this.targetRotation;
                this.drawWheel();
                this.onSpinComplete();
            }
        } else {
            // Continuous spin until stopped
            this.rotation += this.spinSpeed;
            this.drawWheel();
            requestAnimationFrame(() => this.animateSpin());
        }
    }

    onSpinComplete() {
        this.spinning = false;
        this.gameState.skillWheelState = 'result';

        // Calculate which segment the pointer landed on
        // Pointer is at top (12 o'clock), so we need to find segment at -rotation
        const normalizedRotation = (((-this.rotation) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const segmentAngle = (Math.PI * 2) / this.segments.length;
        const segmentIndex = Math.floor(normalizedRotation / segmentAngle);
        const result = this.segments[segmentIndex];

        if (result.skill) {
            this.resultEl.textContent = `${result.name}!`;
            this.resultEl.className = 'skill';
            this.audio.winJingle();
        } else {
            this.resultEl.textContent = 'MISS!';
            this.resultEl.className = 'miss';
            this.audio.loseSound();
        }

        // Close overlay and trigger callback after brief delay
        setTimeout(() => {
            this.hide();
            if (this.onResult) this.onResult(result.skill);
        }, 250);
    }

    skipToResult() {
        // Skip animation and show result immediately
        if (!this.spinning) return;

        // If not stopping yet, pick a random target
        if (!this.stopping) {
            this.targetRotation = this.rotation + Math.random() * Math.PI * 2;
        }

        // Jump to target and complete
        this.rotation = this.targetRotation;
        this.drawWheel();
        this.onSpinComplete();
    }

    skipResult() {
        // Skip result display and close immediately
        if (this.gameState.skillWheelState !== 'result') return;

        // Calculate result (same as onSpinComplete)
        const normalizedRotation = (((-this.rotation) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const segmentAngle = (Math.PI * 2) / this.segments.length;
        const segmentIndex = Math.floor(normalizedRotation / segmentAngle);
        const result = this.segments[segmentIndex];

        this.hide();
        if (this.onResult) this.onResult(result.skill);
    }

    reset() {
        this.spinning = false;
        this.stopping = false;
        this.rotation = 0;
        this.hide();
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
        // Base basket types (indexed by basketOrder)
        const baseMultipliers = [0, 1, 3, 1, 0];  // skill, x1, x3, x1, skill
        const baseColors = ['#2d2d5a', '#2d5a3d', '#5a2d5a', '#2d5a3d', '#2d2d5a'];
        const baseLabels = ['SKILL', 'x1', 'x3', 'x1', 'SKILL'];

        // Check if skill wheel is on cooldown
        const skillOnCooldown = Date.now() < this.gameState.skillWheelCooldown;

        // Check if Fever Time is active
        const isFeverTime = this.gameState.remainingBlocks === 0 && this.gameState.balls.length > 0;

        for (let i = 0; i < 5; i++) {
            const x = i * basketWidth;
            const basketType = this.gameState.basketOrder[i];
            const multiplier = baseMultipliers[basketType];
            let color = baseColors[basketType];
            let label = baseLabels[basketType];

            const isSkillBasket = multiplier === 0;

            // Fever Time transformations
            if (isFeverTime) {
                if (isSkillBasket) {
                    // SKILL becomes PORTAL
                    color = '#005a5a';  // Cyan-ish
                    label = 'PORTAL';
                } else if (multiplier === 1) {
                    // x1 becomes x3
                    color = '#5a2d5a';  // Purple like x3
                    label = 'x3';
                } else if (multiplier === 3) {
                    // x3 becomes x5
                    color = '#5a5a2d';  // Gold-ish
                    label = 'x5';
                }
            } else {
                // Normal mode: SKILL baskets become PORTAL during cooldown
                if (isSkillBasket && skillOnCooldown) {
                    color = '#005a5a';  // Cyan-ish (same as Fever Time portal)
                    label = 'PORTAL';
                }
            }

            // Basket background
            const gradient = this.ctx.createLinearGradient(x, y, x, this.canvas.height);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, '#0a0a15');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, basketWidth, basketHeight);

            // Basket border
            let borderColor;
            if (isFeverTime && isSkillBasket) {
                borderColor = '#00d2d3';  // Cyan for portal
            } else if (isFeverTime && multiplier === 3) {
                borderColor = '#ffd700';  // Gold for x5
            } else if (multiplier === 3 || (isFeverTime && multiplier === 1)) {
                borderColor = '#9b59b6';  // Purple for x3
            } else if (multiplier === 1) {
                borderColor = '#27ae60';
            } else {
                borderColor = '#5555aa';
            }
            if (!isFeverTime && isSkillBasket && skillOnCooldown) {
                borderColor = '#00d2d3';  // Cyan for portal (same as Fever Time)
            }
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, basketWidth, basketHeight);

            // Label
            this.ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            let labelColor;
            if (isFeverTime && isSkillBasket) {
                labelColor = '#00ffff';  // Cyan for portal
            } else if (isFeverTime && multiplier === 3) {
                labelColor = '#ffd700';  // Gold for x5
            } else if (multiplier === 3 || (isFeverTime && multiplier === 1)) {
                labelColor = '#e056fd';  // Purple for x3
            } else if (multiplier === 1) {
                labelColor = '#2ecc71';
            } else {
                labelColor = '#8888ff';
            }
            if (!isFeverTime && isSkillBasket && skillOnCooldown) {
                labelColor = '#00ffff';  // Cyan for portal (same as Fever Time)
            }
            this.ctx.fillStyle = labelColor;
            this.ctx.fillText(label, x + basketWidth / 2, y + basketHeight / 2);
        }
    }

    drawBase() {
        const baseX = this.gameState.baseX;
        const baseY = CONFIG.BASE_Y;
        const baseWidth = CONFIG.BASE_RADIUS * 1.5;
        const baseHeight = CONFIG.BASE_RADIUS * 1.2;

        // Draw triangle pointing down with glow
        this.ctx.shadowColor = 'rgba(0, 210, 211, 0.6)';
        this.ctx.shadowBlur = 15;

        // Triangle path: top-left, top-right, bottom-center
        this.ctx.beginPath();
        this.ctx.moveTo(baseX - baseWidth, baseY);      // Top-left
        this.ctx.lineTo(baseX + baseWidth, baseY);      // Top-right
        this.ctx.lineTo(baseX, baseY + baseHeight);     // Bottom-center (point)
        this.ctx.closePath();

        // Fill with gradient
        const gradient = this.ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseHeight);
        gradient.addColorStop(0, 'rgba(0, 210, 211, 0.6)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 151, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 100, 101, 0.2)');
        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Stroke outline
        this.ctx.strokeStyle = 'rgba(0, 210, 211, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.shadowBlur = 0;

        // Draw pending skill indicator
        if (this.gameState.pendingSkill) {
            const skillNames = {
                'explosion': 'BOMB',
                'bulldoze': 'BULLDOZE',
                'split': 'SPLIT'
            };
            const skillColors = {
                'explosion': '#ff4757',
                'bulldoze': '#3498db',
                'split': '#2ecc71'
            };
            const skillName = skillNames[this.gameState.pendingSkill] || this.gameState.pendingSkill.toUpperCase();
            const skillColor = skillColors[this.gameState.pendingSkill] || '#ffd700';

            // Draw below base
            this.ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = skillColor;
            this.ctx.shadowColor = skillColor;
            this.ctx.shadowBlur = 8;
            this.ctx.fillText(`NEXT: ${skillName}`, baseX, baseY + baseHeight + 8);
            this.ctx.shadowBlur = 0;
        }
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

        // Explosion ready effect - pulsing explosion warning!
        if (ball.hasExplosion) {
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

        // Apply cosmetic skin effects
        this.drawBallSkin(ball);

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

    drawBallSkin(ball) {
        const skin = playerData.equippedBallSkin;
        if (skin === 'default_ball') return;

        const time = Date.now();

        switch (skin) {
            case 'fire_ball':
                // Flickering flame particles around the ball
                const flameCount = 6;
                for (let i = 0; i < flameCount; i++) {
                    const angle = (i / flameCount) * Math.PI * 2 + time * 0.005;
                    const flicker = Math.sin(time * 0.02 + i) * 3;
                    const dist = ball.radius + 4 + flicker;
                    const fx = ball.x + Math.cos(angle) * dist;
                    const fy = ball.y + Math.sin(angle) * dist;
                    const size = 3 + Math.sin(time * 0.015 + i * 2) * 1.5;

                    const gradient = this.ctx.createRadialGradient(fx, fy, 0, fx, fy, size);
                    gradient.addColorStop(0, 'rgba(255, 200, 50, 0.9)');
                    gradient.addColorStop(0.5, 'rgba(255, 100, 20, 0.6)');
                    gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
                    this.ctx.fillStyle = gradient;
                    this.ctx.beginPath();
                    this.ctx.arc(fx, fy, size, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                break;

            case 'ice_ball':
                // Frosty aura with ice crystals
                const frostGlow = this.ctx.createRadialGradient(
                    ball.x, ball.y, ball.radius * 0.8,
                    ball.x, ball.y, ball.radius + 8
                );
                frostGlow.addColorStop(0, 'rgba(150, 220, 255, 0)');
                frostGlow.addColorStop(0.5, 'rgba(100, 200, 255, 0.3)');
                frostGlow.addColorStop(1, 'rgba(50, 150, 255, 0)');
                this.ctx.fillStyle = frostGlow;
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius + 8, 0, Math.PI * 2);
                this.ctx.fill();

                // Small ice crystal sparkles
                for (let i = 0; i < 4; i++) {
                    const sparkAngle = (i / 4) * Math.PI * 2 + time * 0.002;
                    const sparkDist = ball.radius + 5;
                    const sx = ball.x + Math.cos(sparkAngle) * sparkDist;
                    const sy = ball.y + Math.sin(sparkAngle) * sparkDist;
                    const sparkAlpha = 0.5 + Math.sin(time * 0.01 + i) * 0.3;

                    this.ctx.fillStyle = `rgba(200, 240, 255, ${sparkAlpha})`;
                    this.ctx.beginPath();
                    this.ctx.arc(sx, sy, 2, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                break;

            case 'gold_ball':
                // Shimmering gold ring
                const shimmer = Math.sin(time * 0.008) * 0.3 + 0.7;
                this.ctx.strokeStyle = `rgba(255, 215, 0, ${shimmer})`;
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius + 3, 0, Math.PI * 2);
                this.ctx.stroke();

                // Gold sparkle highlight
                const sparkX = ball.x - ball.radius * 0.4;
                const sparkY = ball.y - ball.radius * 0.4;
                const sparkGrad = this.ctx.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, 4);
                sparkGrad.addColorStop(0, `rgba(255, 255, 200, ${shimmer})`);
                sparkGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
                this.ctx.fillStyle = sparkGrad;
                this.ctx.beginPath();
                this.ctx.arc(sparkX, sparkY, 4, 0, Math.PI * 2);
                this.ctx.fill();
                break;

            case 'neon_ball':
                // Pulsing neon glow (cyan/magenta)
                const pulse = Math.sin(time * 0.01) * 0.5 + 0.5;
                const hue = (time * 0.1) % 360;

                // Outer neon glow
                const neonGlow = this.ctx.createRadialGradient(
                    ball.x, ball.y, ball.radius,
                    ball.x, ball.y, ball.radius + 12
                );
                neonGlow.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.4 + pulse * 0.3})`);
                neonGlow.addColorStop(0.5, `hsla(${(hue + 60) % 360}, 100%, 50%, ${0.2 + pulse * 0.2})`);
                neonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.ctx.fillStyle = neonGlow;
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius + 12, 0, Math.PI * 2);
                this.ctx.fill();

                // Bright neon ring
                this.ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.8 + pulse * 0.2})`;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius + 2, 0, Math.PI * 2);
                this.ctx.stroke();
                break;
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

        // Draw base (moves left/right at top)
        if (!this.gameState.isGameOver) {
            this.drawBase();
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

        // Draw FEVER TIME banner when no blocks left and balls still bouncing
        if (this.gameState.remainingBlocks === 0 && this.gameState.balls.length > 0 && !this.gameState.isGameOver) {
            this.drawFairies();
            this.drawFeverTime();
        }

        // Draw jackpot overlay (on top of everything)
        this.drawJackpot();
    }

    drawFeverTime() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2 - 50;
        const time = Date.now();

        // Pulsing scale
        const pulse = 1 + Math.sin(time * 0.01) * 0.15;

        // Cycling fire colors (faster)
        const hue = (time * 0.3) % 60;  // Orange to red range
        const mainColor = `hsl(${hue}, 100%, 55%)`;
        const glowColor = `hsl(${hue + 20}, 100%, 65%)`;

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.scale(pulse, pulse);

        // Background banner (bigger)
        const bannerWidth = 280;
        const bannerHeight = 70;
        const bannerGradient = this.ctx.createLinearGradient(-bannerWidth/2, 0, bannerWidth/2, 0);
        bannerGradient.addColorStop(0, 'rgba(255, 100, 0, 0)');
        bannerGradient.addColorStop(0.15, 'rgba(255, 50, 0, 0.9)');
        bannerGradient.addColorStop(0.5, 'rgba(255, 80, 0, 1)');
        bannerGradient.addColorStop(0.85, 'rgba(255, 50, 0, 0.9)');
        bannerGradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        this.ctx.fillStyle = bannerGradient;
        this.ctx.fillRect(-bannerWidth/2, -bannerHeight/2, bannerWidth, bannerHeight);

        // Text glow (stronger)
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = 30 + Math.sin(time * 0.015) * 15;

        // Main text (bigger)
        this.ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = mainColor;
        this.ctx.fillText('FEVER TIME!', 0, -5);

        // White outline for pop
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeText('FEVER TIME!', 0, -5);

        // Bonus indicator
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = '#ff6600';
        this.ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
        this.ctx.fillStyle = '#ffff00';
        this.ctx.fillText('Bounces power up balls!', 0, 22);

        this.ctx.restore();
    }

    drawFairies() {
        const time = Date.now();

        for (const fairy of this.gameState.fairies) {
            if (fairy.collected) continue;

            const isGhost = fairy.isGhost;
            const isWarning = fairy.isWarning;
            const isSolid = fairy.isSolid;

            this.ctx.save();
            this.ctx.translate(fairy.x, fairy.y);

            // Warning flash when about to become solid
            if (isWarning) {
                const flash = Math.sin(time * 0.03) > 0;
                this.ctx.globalAlpha = flash ? 0.9 : 0.3;
            } else if (isGhost) {
                // Ghost mode - translucent
                this.ctx.globalAlpha = 0.25;
            } else {
                // Solid mode - fully visible
                this.ctx.globalAlpha = 1;
            }

            // Bobbing animation
            const bob = Math.sin(time * 0.004 + fairy.phaseStart) * 4;
            this.ctx.translate(0, bob);

            // Sparkle effect
            const sparkleCount = isSolid ? 8 : 4;
            for (let i = 0; i < sparkleCount; i++) {
                const angle = (time * 0.003 + i * Math.PI * 2 / sparkleCount);
                const dist = 20 + Math.sin(time * 0.006 + i) * 5;
                const sparkleX = Math.cos(angle) * dist;
                const sparkleY = Math.sin(angle) * dist;
                const sparkleAlpha = (isSolid ? 0.8 : 0.3) * (0.5 + Math.sin(time * 0.01 + i) * 0.5);

                // Gold when solid, blue/purple when ghost
                if (isSolid) {
                    this.ctx.fillStyle = `rgba(255, 215, 0, ${sparkleAlpha})`;
                } else {
                    this.ctx.fillStyle = `rgba(150, 100, 255, ${sparkleAlpha})`;
                }
                this.ctx.beginPath();
                this.ctx.arc(sparkleX, sparkleY, isSolid ? 3 : 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Outer glow - different color for ghost vs solid
            const glowRadius = fairy.radius * (isSolid ? 2.5 : 2);
            const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
            if (isSolid) {
                // Bright gold glow when catchable
                gradient.addColorStop(0, 'rgba(255, 230, 100, 0.9)');
                gradient.addColorStop(0.5, 'rgba(255, 180, 50, 0.5)');
                gradient.addColorStop(1, 'rgba(255, 150, 0, 0)');
            } else {
                // Purple/blue ghost glow
                gradient.addColorStop(0, 'rgba(150, 100, 255, 0.4)');
                gradient.addColorStop(0.5, 'rgba(100, 50, 200, 0.2)');
                gradient.addColorStop(1, 'rgba(80, 40, 150, 0)');
            }
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();

            // Main body
            const bodyGradient = this.ctx.createRadialGradient(-3, -3, 0, 0, 0, fairy.radius);
            if (isSolid) {
                // Bright golden when catchable
                bodyGradient.addColorStop(0, '#ffffcc');
                bodyGradient.addColorStop(0.5, '#ffd700');
                bodyGradient.addColorStop(1, '#ff8c00');
            } else {
                // Purple/blue ghost
                bodyGradient.addColorStop(0, '#ccccff');
                bodyGradient.addColorStop(0.5, '#8866dd');
                bodyGradient.addColorStop(1, '#5533aa');
            }
            this.ctx.fillStyle = bodyGradient;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, fairy.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Wings
            this.ctx.fillStyle = isSolid ? 'rgba(255, 255, 255, 0.7)' : 'rgba(200, 180, 255, 0.4)';
            const wingFlap = Math.sin(time * 0.025) * 0.4;

            // Left wing
            this.ctx.save();
            this.ctx.translate(-fairy.radius * 0.8, -2);
            this.ctx.rotate(-0.5 + wingFlap);
            this.ctx.scale(1.3, 0.6);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

            // Right wing
            this.ctx.save();
            this.ctx.translate(fairy.radius * 0.8, -2);
            this.ctx.rotate(0.5 - wingFlap);
            this.ctx.scale(1.3, 0.6);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 10, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

            // HP indicator (show dots above fairy)
            if (fairy.hp !== undefined) {
                this.ctx.globalAlpha = 1;
                for (let h = 0; h < fairy.hp; h++) {
                    this.ctx.fillStyle = isSolid ? '#ff4444' : '#aa6666';
                    this.ctx.beginPath();
                    this.ctx.arc(-5 + h * 10, -fairy.radius - 8, 4, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }

            // "CATCH ME!" indicator when solid
            if (isSolid) {
                this.ctx.globalAlpha = 0.8 + Math.sin(time * 0.01) * 0.2;
                this.ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillStyle = '#ffff00';
                this.ctx.fillText('!', 0, -fairy.radius - 18);
            }

            this.ctx.restore();
        }

        // Draw status text
        const gs = this.gameState;
        if (gs.fairies.length > 0 || gs.fairiesCollected > 0) {
            this.ctx.save();
            this.ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#ffd700';
            this.ctx.shadowColor = '#ff8c00';
            this.ctx.shadowBlur = 8;

            // Count solid fairies
            const solidCount = gs.fairies.filter(f => f.isSolid && !f.collected).length;
            let statusText = `FAIRIES: ${gs.fairiesCollected}/5`;
            if (solidCount > 0) {
                statusText += ` (${solidCount} CATCHABLE!)`;
            }
            this.ctx.fillText(statusText, this.canvas.width / 2, 80);
            this.ctx.restore();
        }
    }

    drawJackpot() {
        const gs = this.gameState;
        if (gs.jackpotState === 'idle') return;

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const time = Date.now();

        // During reward phase, just show a small HUD so player can see auto-fire
        if (gs.jackpotState === 'reward') {
            this.ctx.save();
            this.ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#00ff88';
            this.ctx.shadowColor = '#00ff88';
            this.ctx.shadowBlur = 15;
            this.ctx.fillText(`AUTO-FIRE: ${Math.ceil(gs.jackpotRewardTimer)}s`, cx, 120);
            this.ctx.restore();
            return;
        }

        // Darkened background overlay (only during spinning)
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Jackpot container
        const containerWidth = 300;
        const containerHeight = 180;

        this.ctx.save();
        this.ctx.translate(cx, cy);

        // Pulsing background
        const pulse = 1 + Math.sin(time * 0.005) * 0.02;
        this.ctx.scale(pulse, pulse);

        // Container background
        const bgGradient = this.ctx.createLinearGradient(0, -containerHeight/2, 0, containerHeight/2);
        bgGradient.addColorStop(0, '#2d1f5e');
        bgGradient.addColorStop(0.5, '#1a1040');
        bgGradient.addColorStop(1, '#0d0820');
        this.ctx.fillStyle = bgGradient;
        this.ctx.beginPath();
        this.roundRect(-containerWidth/2, -containerHeight/2, containerWidth, containerHeight, 15);
        this.ctx.fill();

        // Border glow
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.roundRect(-containerWidth/2, -containerHeight/2, containerWidth, containerHeight, 15);
        this.ctx.stroke();

        // Title
        this.ctx.shadowBlur = 10;
        this.ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillText('JACKPOT!', 0, -50);

        // Draw 5 slots
        const slotSize = 45;
        const slotGap = 10;
        const totalWidth = 5 * slotSize + 4 * slotGap;
        const startX = -totalWidth / 2 + slotSize / 2;

        for (let i = 0; i < 5; i++) {
            const slotX = startX + i * (slotSize + slotGap);
            const slotY = 10;

            // Slot background
            this.ctx.fillStyle = '#0a0515';
            this.ctx.beginPath();
            this.roundRect(slotX - slotSize/2, slotY - slotSize/2, slotSize, slotSize, 8);
            this.ctx.fill();

            // Slot border
            this.ctx.strokeStyle = i < gs.jackpotRevealIndex ? '#ffd700' : '#444';
            this.ctx.lineWidth = 2;
            this.ctx.shadowBlur = i < gs.jackpotRevealIndex ? 8 : 0;
            this.ctx.beginPath();
            this.roundRect(slotX - slotSize/2, slotY - slotSize/2, slotSize, slotSize, 8);
            this.ctx.stroke();

            // Slot content
            if (i < gs.jackpotRevealIndex) {
                // Revealed
                const result = gs.jackpotResults[i];
                this.ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';

                if (result === 'O') {
                    this.ctx.fillStyle = '#00ff88';
                    this.ctx.shadowColor = '#00ff88';
                    this.ctx.shadowBlur = 10;
                } else {
                    this.ctx.fillStyle = '#ff4444';
                    this.ctx.shadowColor = '#ff4444';
                    this.ctx.shadowBlur = 5;
                }
                this.ctx.fillText(result, slotX, slotY);
            } else if (i === gs.jackpotRevealIndex && gs.jackpotState === 'spinning') {
                // Currently spinning
                const spinChar = ['O', 'X', 'O', 'X'][Math.floor(time / 80) % 4];
                this.ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#888';
                this.ctx.shadowBlur = 0;
                this.ctx.fillText(spinChar, slotX, slotY);
            } else {
                // Not yet revealed
                this.ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillStyle = '#333';
                this.ctx.shadowBlur = 0;
                this.ctx.fillText('?', slotX, slotY);
            }
        }

        this.ctx.restore();
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
        this.slotMachine.onResult = (color, count) => this.queueBalls(color, count);

        // Skill wheel (triggered by x3 basket)
        this.skillWheel = new SkillWheel(this.gameState, this.audio);
        this.skillWheel.onResult = (skill) => this.applySkillToAllBalls(skill);

        // Screen flash state
        this.flashAlpha = 0;
        this.flashColor = '#ffd700';
        this.flashDuration = 0;
        this.flashElapsed = 0;

        // Slow-motion state
        this.slowmoActive = false;

        // Queue system for batched ball spawning
        this.queuedBalls = [];  // Array of {color, count} objects
        this.pendingBallSpawns = 0;  // Balls waiting to spawn (in setTimeout)
        this.isInGame = false;  // Are we in an active game session?
        this.sessionPoints = 0;  // Points earned this session

        // UI elements
        this.spacebarHint = document.getElementById('spacebar-hint');
        this.actionLabel = document.getElementById('action-label');
        this.balanceDisplay = document.getElementById('balance-display');
        this.pointsCountEl = document.getElementById('points-count');
        this.costDisplay = document.getElementById('cost-display');
        this.freeSpinBadge = document.getElementById('free-spin-badge');
        this.overlay = document.getElementById('overlay');
        this.overlayTitle = document.getElementById('overlay-title');
        this.overlayMessage = document.getElementById('overlay-message');
        this.overlayBtn = document.getElementById('overlay-btn');
        this.overlayPointsEarned = document.getElementById('overlay-points-earned');
        this.earnedAmount = document.getElementById('earned-amount');
        this.debugPanel = document.getElementById('debug-panel');
        this.debugStats = document.getElementById('debug-stats');
        this.comboDisplay = document.getElementById('combo-display');
        this.comboText = document.getElementById('combo-text');
        this.settingsPanel = document.getElementById('settings-panel');
        this.queueDisplay = document.getElementById('queue-display');
        this.queueItems = document.getElementById('queue-items');
        this.queueCount = document.getElementById('queue-count');
        this.header = document.getElementById('header');
        this.controls = document.getElementById('controls');

        // Timing
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsTime = 0;

        // Apply saved settings
        JUICE.SOUND_ENABLED = playerData.settings.sound;
        JUICE.HAPTICS_ENABLED = playerData.settings.haptics;
        JUICE.PERFORMANCE_MODE = playerData.settings.performanceMode;
        this.audio.enabled = playerData.settings.sound;

        this.setupEventListeners();
        this.resizeCanvas();
        // Don't call init() - wait for player to start game from menu
        this.startGameLoop();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isInGame) {
                    this.onSpinButton();
                }
            }
            if (e.code === 'ArrowDown') {
                e.preventDefault();
                if (this.isInGame) {
                    this.onLaunchButton();
                }
            }
            if (e.key === 'd' || e.key === 'D') {
                this.debugPanel.classList.toggle('hidden');
            }
        });

        // Touch/click for spacebar hint (mobile) - spins slot
        this.spacebarHint.addEventListener('click', () => this.onSpinButton());
        this.spacebarHint.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onSpinButton();
        });

        // Mobile touch controls on canvas
        let touchStartY = 0;
        let touchStartTime = 0;
        const SWIPE_THRESHOLD = 50;  // Minimum swipe distance
        const TAP_THRESHOLD = 200;   // Max time for tap (ms)

        this.canvas.addEventListener('touchstart', (e) => {
            if (!this.isInGame) return;
            e.preventDefault();
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            if (!this.isInGame) return;
            e.preventDefault();
            const touchEndY = e.changedTouches[0].clientY;
            const touchDuration = Date.now() - touchStartTime;
            const swipeDistance = touchEndY - touchStartY;

            if (swipeDistance > SWIPE_THRESHOLD) {
                // Swipe down = launch balls
                this.onLaunchButton();
            } else if (touchDuration < TAP_THRESHOLD && Math.abs(swipeDistance) < 20) {
                // Quick tap = spin slot
                this.onSpinButton();
            }
        }, { passive: false });

        // Also allow click on canvas for desktop
        this.canvas.addEventListener('click', () => {
            if (this.isInGame) {
                this.onSpinButton();
            }
        });

        // Forfeit button - end game and return to menu
        document.getElementById('forfeit-btn').addEventListener('click', () => {
            if (this.isInGame) {
                this.forfeitGame();
            }
        });

        // Overlay button - back to menu
        this.overlayBtn.addEventListener('click', () => {
            this.hideOverlay();
            this.endGame();
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
        this.gameState.baseX = this.canvas.width / 2;  // Start at center
        this.combo.reset();
        generateLevel(this.gameState, this.canvas.width, this.canvas.height);
        this.slotMachine.reset();
        this.skillWheel.reset();
        this.queuedBalls = [];
        this.pendingBallSpawns = 0;
        this.sessionPoints = 0;
        this.updateUI();
        this.updateQueueUI();
    }

    // Called from menu when player presses PLAY
    startNewGame() {
        this.isInGame = true;
        this.audio.init();  // Initialize audio on game start

        // Hide any overlays from previous game
        this.overlay.classList.add('hidden');
        this.overlayPointsEarned.classList.add('hidden');

        // Show game UI
        this.header.classList.remove('hidden');
        this.canvas.classList.remove('hidden');
        this.controls.classList.remove('hidden');

        // Initialize game
        this.resizeCanvas();
        this.init();

        playerData.totalGamesPlayed++;
        playerData.save();
    }

    // Called when player forfeits or game ends
    endGame() {
        this.isInGame = false;

        // Hide game UI
        this.header.classList.add('hidden');
        this.canvas.classList.add('hidden');
        this.controls.classList.add('hidden');
        this.queueDisplay.classList.add('hidden');

        // Check if player is out of points
        if (!playerData.canAffordSpin()) {
            menuManager.showAdPrompt();
        } else {
            menuManager.showMainMenu();
        }
    }

    forfeitGame() {
        // Forfeit = lose all session points, no reward
        showToast(`Forfeited - 0 points earned`, 'warning');
        this.gameState.points = 0;  // Clear session points
        this.gameState.isGameOver = true;
        this.endGame();
    }

    // SPACE - spin slot to pile up balls
    onSpinButton() {
        // Initialize audio on first interaction (mobile policy)
        this.audio.init();

        if (!this.isInGame || this.gameState.isGameOver) return;

        // Block spinning during Fever Time (all blocks cleared, balls still bouncing)
        // Player can still launch queued balls with DOWN arrow
        if (this.gameState.remainingBlocks === 0 && this.gameState.balls.length > 0) {
            showToast('Fever Time! No spinning allowed', 'warning');
            return;
        }

        // Handle skill wheel - press to skip straight to result
        if (this.gameState.skillWheelState === 'spinning') {
            this.skillWheel.skipToResult();
            return;
        }
        if (this.gameState.skillWheelState === 'result') {
            // Skip result display, close immediately
            this.skillWheel.skipResult();
            return;
        }

        // Handle slot machine
        if (this.gameState.slotState === 'spinning' || this.gameState.slotState === 'stopping') {
            // Skip straight to result
            this.slotMachine.skipToResult();
            return;
        }
        if (this.gameState.slotState === 'result') {
            // Skip result display
            this.slotMachine.skipResultDisplay();
            return;
        }

        // Slot is idle - spin to add more balls to queue
        if (this.gameState.slotState === 'idle') {
            if (!playerData.canAffordSpin()) {
                showToast('Not enough points!', 'error');
                return;
            }
            // Spend the spin cost
            playerData.spendSpin();
            this.slotMachine.startSpin();
            this.audio.uiClick();
            this.updateUI();
        }
    }

    // DOWN ARROW - launch all queued balls
    onLaunchButton() {
        this.audio.init();

        if (!this.isInGame || this.gameState.isGameOver) return;
        if (this.gameState.slotState !== 'idle') return;  // Can't launch while slot is spinning

        if (this.queuedBalls.length > 0) {
            this.launchQueuedBalls();
            this.audio.uiClick();
            this.updateUI();
        }
    }

    // Queue balls instead of spawning immediately
    queueBalls(color, count) {
        this.queuedBalls.push({ color, count });
        this.updateQueueUI();
        this.updateUI();  // Update action label to show "LAUNCH"
    }

    // Launch all queued balls one by one from moving base
    launchQueuedBalls() {
        if (this.queuedBalls.length === 0) return;

        // Check for pending skill (applies to all balls in this launch)
        const pendingSkill = this.gameState.pendingSkill;
        this.gameState.pendingSkill = null;

        // Flatten queued balls into individual balls
        const allBalls = [];
        for (const queued of this.queuedBalls) {
            // Split skill = 2x balls (1 clone per ball)
            const count = pendingSkill === 'split' ? queued.count * 2 : queued.count;
            for (let i = 0; i < count; i++) {
                allBalls.push(queued.color);
            }
        }

        this.queuedBalls = [];
        this.updateQueueUI();

        // Track pending spawns to prevent premature game end
        this.pendingBallSpawns = allBalls.length;

        // Spawn balls one by one with quick delay (each from current base position)
        const spawnDelay = 80; // ms between each ball
        allBalls.forEach((color, index) => {
            setTimeout(() => {
                this.spawnSingleBall(color, pendingSkill);
                this.pendingBallSpawns--;
            }, index * spawnDelay);
        });
    }

    // Spawn a single ball from current base position
    spawnSingleBall(color, skill = null) {
        const baseX = this.gameState.baseX;
        const baseY = CONFIG.BASE_Y;
        const angle = Math.PI / 2;  // Always shoot straight down
        const isRainbow = color === 'rainbow';

        const ballType = isRainbow ? 'rainball' : 'normal';
        const ball = new Ball(baseX, baseY, color, ballType, angle);

        // Apply skill if any (split already handled in launchQueuedBalls)
        if (skill === 'explosion') {
            ball.hasExplosion = true;
        } else if (skill === 'bulldoze') {
            ball.hasBulldoze = true;
            ball.baseRadius *= 2;
        }

        this.gameState.balls.push(ball);
        this.gameState.isRunning = true;

        // Spawn effects (lighter effects for rapid fire)
        if (isRainbow) {
            this.particles.emitRainbow(baseX, baseY, 8);
            this.audio.ballSpawnRainball();
        } else {
            this.particles.emit(baseX, baseY, CONFIG.COLORS[color.toUpperCase()], 6);
            this.audio.ballSpawnNormal();
        }

        this.updateUI();
    }

    // Update the queue display UI
    updateQueueUI() {
        if (this.queuedBalls.length === 0) {
            this.queueDisplay.classList.add('hidden');
            return;
        }

        this.queueDisplay.classList.remove('hidden');

        // Clear existing items
        this.queueItems.innerHTML = '';

        // Add ball icons for each queued ball
        let totalBalls = 0;
        for (const queued of this.queuedBalls) {
            for (let i = 0; i < queued.count; i++) {
                const ball = document.createElement('div');
                ball.className = `queue-ball ${queued.color}`;
                this.queueItems.appendChild(ball);
                totalBalls++;
            }
        }

        this.queueCount.textContent = totalBalls;
    }

    spawnBalls(color, count) {
        // Spawn from moving base position
        const baseX = this.gameState.baseX;
        const baseY = CONFIG.BASE_Y;
        const angle = Math.PI / 2;  // Always shoot straight down
        const isRainbow = color === 'rainbow';

        // Check for pending skill from previous skill wheel
        const pendingSkill = this.gameState.pendingSkill;
        this.gameState.pendingSkill = null;  // Clear it now

        // Split pending skill = spawn 2x the balls (1 clone per ball)
        const actualCount = pendingSkill === 'split' ? count * 2 : count;

        // Delay between ball spawns (ms)
        const spawnDelay = 150;

        for (let i = 0; i < actualCount; i++) {
            setTimeout(() => {
                // Slight horizontal offset for multiple balls
                const xOffset = actualCount > 1 ? (i - (actualCount - 1) / 2) * 15 : 0;
                const cx = baseX + xOffset;
                const cy = baseY;

                const ballAngle = angle;

                const ballType = isRainbow ? 'rainball' : 'normal';
                const ball = new Ball(cx, cy, color, ballType, ballAngle);

                // Apply pending skill if any (split already handled via actualCount)
                if (pendingSkill === 'explosion') {
                    ball.hasExplosion = true;
                } else if (pendingSkill === 'bulldoze') {
                    ball.hasBulldoze = true;
                    ball.baseRadius *= 2;
                }

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
        const baseMultipliers = [0, 1, 3, 1, 0];  // skill, x1, x3, x1, skill
        let triggerSkillWheel = false;

        // Check if Fever Time is active (no blocks left AND balls still in play)
        const isFeverTime = this.gameState.remainingBlocks === 0;

        // Check each ball
        this.gameState.balls = this.gameState.balls.filter(ball => {
            // Check if ball entered basket zone
            if (ball.y + ball.radius >= basketY) {
                // Determine which basket (using shuffled order)
                const basketIndex = Math.floor(ball.x / basketWidth);
                const clampedIndex = Math.max(0, Math.min(4, basketIndex));
                const basketType = this.gameState.basketOrder[clampedIndex];
                let multiplier = baseMultipliers[basketType];

                // SKILL baskets become PORTAL during Fever Time OR during cooldown
                const skillOnCooldown = Date.now() <= this.gameState.skillWheelCooldown;
                if (multiplier === 0 && (isFeverTime || skillOnCooldown)) {
                    // Teleport ball back to base position
                    ball.x = this.gameState.baseX;
                    ball.y = CONFIG.BASE_Y + CONFIG.BASE_RADIUS + ball.radius + 20;
                    // Give it a new downward velocity with random spread
                    const speed = CONFIG.BALL_SPEED * CONFIG.BALL_BOOST_MULTIPLIER;
                    ball.vx = (Math.random() - 0.5) * speed * 0.6;
                    ball.vy = speed;
                    ball.boosted = true;  // Re-boost the ball
                    // Portal effect
                    this.particles.emit(ball.x, ball.y, '#00ffff', 12);
                    // Show "PORTAL!" text
                    this.gameState.damageTexts.push({
                        x: ball.x,
                        y: ball.y + 30,
                        damage: 'PORTAL!',
                        life: 500,
                        maxLife: 500,
                        isPoints: true
                    });
                    return true;  // Keep ball (teleported)
                }

                // Fever Time: Multipliers increase (x1→x3, x3→x5)
                if (isFeverTime) {
                    if (multiplier === 1) multiplier = 3;
                    else if (multiplier === 3) multiplier = 5;
                }

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

                // Trigger skill wheel on SKILL basket (multiplier === 0) - only when NOT Fever Time
                if (multiplier === 0 && !isFeverTime) {
                    triggerSkillWheel = true;
                }

                // Particles for basket entry
                const color = multiplier >= 5 ? '#ffd700' :  // Gold for x5
                              multiplier === 3 ? '#e056fd' :
                              multiplier === 1 ? '#2ecc71' : '#8888ff';
                this.particles.emit(ball.x, basketY, color, 10);

                return false;  // Remove ball
            }
            return true;  // Keep ball
        });

        // Show skill wheel if triggered (cooldown must have passed)
        // Don't show if no blocks left or game is over
        const cooldownPassed = Date.now() > this.gameState.skillWheelCooldown;
        const hasBlocksLeft = this.gameState.remainingBlocks > 0;
        if (triggerSkillWheel && this.gameState.skillWheelState === 'idle' && cooldownPassed && hasBlocksLeft && !this.gameState.isGameOver) {
            this.skillWheel.show();
        }
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

                    // Track wall hit for bonus points when no blocks left
                    ball.hitWallThisFrame = true;

                    // Lose boost on obstacle wall hit
                    if (ball.boosted) {
                        ball.boosted = false;
                        const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
                        if (currentSpeed > ball.normalSpeed) {
                            const factor = ball.normalSpeed / currentSpeed;
                            ball.vx *= factor;
                            ball.vy *= factor;
                        }
                    }

                    // Bulldoze: lose ability on wall hit (walls are unbreakable)
                    if (ball.hasBulldoze) {
                        ball.hasBulldoze = false;
                        ball.baseRadius = ball.getRadiusByType(ball.type);  // Shrink back
                        this.particles.emit(ball.x, ball.y, '#5a5a7a', 8);
                    }
                }
            }
        }

        // Walls are unbreakable - no need to filter destroyed walls
    }

    processBallBlockCollisions() {
        for (const ball of this.gameState.balls) {
            for (const block of this.gameState.blocks) {
                if (block.hp <= 0) continue;

                const collision = circleRectCollision(ball, block);

                if (collision.hit) {
                    const damage = ball.getDamage(block);

                    if (damage > 0) {
                        // Explosion ability: AOE on first hit (any block)
                        if (ball.hasExplosion) {
                            ball.hasExplosion = false;
                            this.triggerExplosionAOE(block.centerX, block.centerY, ball);
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

                            // Bulldoze: pass through without bouncing or position adjustment
                            if (!ball.hasBulldoze) {
                                ball.x += collision.nx * collision.penetration;
                                ball.y += collision.ny * collision.penetration;
                            }
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

    // Explosion AOE: destroy all blocks within radius
    triggerExplosionAOE(x, y, ball) {
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

        // Walls are unbreakable - explosions don't damage them
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

    // ==========================================
    // FEVER TIME FAIRIES & JACKPOT
    // ==========================================

    updateFairies() {
        const gs = this.gameState;

        // Don't update if jackpot is active
        if (gs.jackpotState !== 'idle') return;

        // Fairy config - PHASE SYSTEM makes them hard to catch
        const FAIRY_SPEED = 2.5;           // Slow, visible movement
        const GHOST_DURATION = 4000;       // 4 seconds ghost (invincible)
        const SOLID_DURATION = 1500;       // 1.5 seconds solid (catchable)
        const WARNING_TIME = 800;          // Flash warning before becoming solid
        const CYCLE_TIME = GHOST_DURATION + SOLID_DURATION;

        // Spawn 5 fairies if none exist
        if (gs.fairies.length === 0 && gs.fairiesCollected < 5) {
            const now = Date.now();
            for (let i = 0; i < 5; i++) {
                const angle = Math.random() * Math.PI * 2;
                gs.fairies.push({
                    x: Math.random() * (this.canvas.width - 100) + 50,
                    y: Math.random() * (this.canvas.height - 250) + 120,
                    vx: Math.cos(angle) * FAIRY_SPEED,
                    vy: Math.sin(angle) * FAIRY_SPEED,
                    radius: 15,
                    collected: false,
                    // Phase system - each fairy has offset so they don't all sync
                    phaseStart: now - (i * CYCLE_TIME / 5),  // Stagger phases
                    hp: 2  // Need 2 hits to catch!
                });
            }
        }

        const now = Date.now();

        // Update fairy positions
        for (const fairy of gs.fairies) {
            if (fairy.collected) continue;

            // Calculate phase (ghost or solid)
            const cycleTime = (now - fairy.phaseStart) % CYCLE_TIME;
            const isGhost = cycleTime < GHOST_DURATION;
            const isWarning = isGhost && cycleTime > (GHOST_DURATION - WARNING_TIME);
            const isSolid = !isGhost;

            fairy.isGhost = isGhost;
            fairy.isWarning = isWarning;
            fairy.isSolid = isSolid;

            // Simple gentle movement - no crazy dodging
            fairy.x += fairy.vx;
            fairy.y += fairy.vy;

            // Gentle floating motion
            fairy.x += Math.sin(now * 0.002 + fairy.phaseStart) * 0.3;
            fairy.y += Math.cos(now * 0.0015 + fairy.phaseStart) * 0.3;

            // Bounce off walls smoothly
            if (fairy.x < 40 || fairy.x > this.canvas.width - 40) {
                fairy.vx *= -1;
                fairy.x = Math.max(40, Math.min(this.canvas.width - 40, fairy.x));
            }
            if (fairy.y < 100 || fairy.y > this.canvas.height - 100) {
                fairy.vy *= -1;
                fairy.y = Math.max(100, Math.min(this.canvas.height - 100, fairy.y));
            }

            // Occasionally change direction
            if (Math.random() < 0.005) {
                const angle = Math.random() * Math.PI * 2;
                fairy.vx = Math.cos(angle) * FAIRY_SPEED;
                fairy.vy = Math.sin(angle) * FAIRY_SPEED;
            }

            // Only check collision when SOLID (not ghost)
            if (isSolid) {
                for (const ball of gs.balls) {
                    const dx = ball.x - fairy.x;
                    const dy = ball.y - fairy.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < ball.radius + fairy.radius) {
                        fairy.hp--;

                        // Knockback effect
                        fairy.vx += dx / dist * 3;
                        fairy.vy += dy / dist * 3;

                        if (fairy.hp <= 0) {
                            // Caught!
                            fairy.collected = true;
                            gs.fairiesCollected++;

                            // Big effects
                            this.particles.emit(fairy.x, fairy.y, '#ffff00', 30);
                            this.particles.emit(fairy.x, fairy.y, '#ff69b4', 25);
                            this.audio.blockBreak();
                            this.cameraShake.trigger(10, 250);

                            gs.damageTexts.push({
                                x: fairy.x,
                                y: fairy.y,
                                damage: `FAIRY ${gs.fairiesCollected}/5`,
                                life: 1000,
                                maxLife: 1000,
                                isPoints: true
                            });

                            if (gs.fairiesCollected >= 5) {
                                this.startJackpot();
                            }
                        } else {
                            // Hit but not caught - show HP
                            this.particles.emit(fairy.x, fairy.y, '#ff6666', 10);
                            this.audio.wrongColorBounce();

                            gs.damageTexts.push({
                                x: fairy.x,
                                y: fairy.y - 20,
                                damage: `${fairy.hp} HP`,
                                life: 600,
                                maxLife: 600,
                                isPoints: false
                            });
                        }
                        break;
                    }
                }
            }
        }

        // Remove collected fairies
        gs.fairies = gs.fairies.filter(f => !f.collected);
    }

    startJackpot() {
        const gs = this.gameState;
        gs.jackpotState = 'spinning';
        gs.jackpotResults = [];
        gs.jackpotRevealIndex = 0;

        // Generate 5 random O/X results
        for (let i = 0; i < 5; i++) {
            gs.jackpotResults.push(Math.random() < 0.5 ? 'O' : 'X');
        }

        // Flash effect
        this.triggerFlash('#ffd700', 0.5);
        this.cameraShake.trigger(10, 300);

        // Start revealing slots one by one
        this.revealNextJackpotSlot();
    }

    revealNextJackpotSlot() {
        const gs = this.gameState;

        if (gs.jackpotRevealIndex >= 5) {
            // All revealed - start reward phase
            setTimeout(() => {
                this.startJackpotReward();
            }, 500);
            return;
        }

        // Reveal current slot after delay
        setTimeout(() => {
            gs.jackpotRevealIndex++;
            this.audio.blockBreak();

            // Continue to next slot
            setTimeout(() => {
                this.revealNextJackpotSlot();
            }, 400);
        }, 300);
    }

    startJackpotReward() {
        const gs = this.gameState;

        // Count O's - each O = 1 second of auto-shooting
        const oCount = gs.jackpotResults.filter(r => r === 'O').length;

        if (oCount > 0) {
            gs.jackpotState = 'reward';
            gs.jackpotRewardTimer = oCount;  // seconds

            // Show reward text
            gs.damageTexts.push({
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                damage: `${oCount} SECONDS!`,
                life: 1500,
                maxLife: 1500,
                isPoints: true
            });
        } else {
            // No O's - end jackpot
            this.endJackpot();
        }
    }

    updateJackpotReward(dt) {
        const gs = this.gameState;

        if (gs.jackpotState !== 'reward') return;

        // Decrease timer
        gs.jackpotRewardTimer -= dt / 1000;

        // Spawn random balls from base
        if (Math.random() < 0.15) {  // ~9 balls per second
            const colors = ['red', 'yellow', 'blue'];
            const isRainbow = Math.random() < 0.1;  // 10% chance rainbow
            const color = isRainbow ? 'rainbow' : colors[Math.floor(Math.random() * colors.length)];

            const ball = new Ball(
                gs.baseX,
                CONFIG.BASE_Y + 20,
                color,
                isRainbow ? 'rainbow' : 'normal'
            );

            // Random spread angle
            const angle = (Math.random() - 0.5) * 0.8 + Math.PI / 2;
            const speed = CONFIG.BALL_SPEED * CONFIG.BALL_BOOST_MULTIPLIER;
            ball.vx = Math.cos(angle) * speed;
            ball.vy = Math.sin(angle) * speed;
            ball.boosted = true;

            gs.balls.push(ball);
            this.particles.emit(ball.x, ball.y, ball.getDisplayColor() || '#ffffff', 5);
        }

        // End reward when timer runs out
        if (gs.jackpotRewardTimer <= 0) {
            this.endJackpot();
        }
    }

    endJackpot() {
        const gs = this.gameState;
        gs.jackpotState = 'idle';
        gs.jackpotResults = [];
        gs.jackpotRevealIndex = 0;
        gs.jackpotRewardTimer = 0;
        gs.fairiesCollected = 0;  // Reset for potential next fever time
    }

    applySkillToAllBalls(skill) {
        if (!skill) return;  // MISS - no skill applied

        // If no balls on screen, save as pending for next shot
        if (this.gameState.balls.length === 0) {
            this.gameState.pendingSkill = skill;
            return;
        }

        // Copy current balls array to avoid infinite loop when adding new balls
        const currentBalls = [...this.gameState.balls];
        const newBalls = [];

        for (const ball of currentBalls) {
            if (skill === 'explosion') {
                ball.hasExplosion = true;
            } else if (skill === 'bulldoze') {
                ball.hasBulldoze = true;
                ball.baseRadius *= 2;  // Double size like old blue ball
            } else if (skill === 'split') {
                // Split each ball into 2 - spawn 1 clone at each ball's position
                const angle = Math.atan2(ball.vy, ball.vx) + 0.5;  // Offset angle
                const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

                const clone = new Ball(ball.x, ball.y, ball.color, ball.type, angle);
                clone.vx = Math.cos(angle) * speed;
                clone.vy = Math.sin(angle) * speed;
                clone.points = 0;  // Clones don't inherit points
                clone.boosted = ball.boosted;
                clone.normalSpeed = ball.normalSpeed;

                newBalls.push(clone);

                // Effects for split
                this.particles.emit(ball.x, ball.y, ball.getDisplayColor() || '#ffc312', 10);
            }
        }

        // Add split balls after loop
        if (newBalls.length > 0) {
            this.gameState.balls.push(...newBalls);
        }

        // Visual feedback
        this.cameraShake.trigger(8, 200);
        this.triggerFlash('#ffd700', 0.3);
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

        // Check for win even during slot/skill wheel (in case all balls finished during animation)
        this.checkGameEnd();
        if (this.gameState.isGameOver) return;

        // Pause while slot is active
        if (this.gameState.slotState !== 'idle') {
            this.updateUI();
            return;
        }

        // Freeze game during jackpot spinning (balls stop, only jackpot animates)
        if (this.gameState.jackpotState === 'spinning') {
            this.updateUI();
            return;
        }

        // Pause while skill wheel is active (but keep balls visible)
        if (this.gameState.skillWheelState !== 'idle') {
            this.updateUI();
            return;
        }

        // Move base left/right
        const baseRadius = CONFIG.BASE_RADIUS;
        this.gameState.baseX += CONFIG.BASE_SPEED * this.gameState.baseDirection;
        if (this.gameState.baseX >= this.canvas.width - baseRadius) {
            this.gameState.baseX = this.canvas.width - baseRadius;
            this.gameState.baseDirection = -1;
        } else if (this.gameState.baseX <= baseRadius) {
            this.gameState.baseX = baseRadius;
            this.gameState.baseDirection = 1;
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

        // Fever Time: bounces add to ball's points (multiplied by basket later)
        const isFeverTime = this.gameState.remainingBlocks === 0 && this.gameState.balls.length > 0;
        if (isFeverTime) {
            for (const ball of this.gameState.balls) {
                if (ball.hitWallThisFrame) {
                    ball.points += 1;
                }
            }
            // Update fairies and jackpot during Fever Time
            this.updateFairies();
        } else {
            // Reset fairies when not in Fever Time
            if (this.gameState.fairies.length > 0) {
                this.gameState.fairies = [];
                this.gameState.fairiesCollected = 0;
            }
        }

        // Update jackpot reward (auto-shooting)
        this.updateJackpotReward(dt);

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
        // Already ended (forfeit, etc.)
        if (this.gameState.isGameOver) return;

        const remaining = CONFIG.WIN_REQUIRES_ALL_BLOCKS
            ? this.gameState.remainingBlocks
            : this.gameState.remainingColoredBlocks;

        // Win condition: all blocks destroyed AND all balls in baskets
        if (remaining === 0 && this.gameState.balls.length === 0 &&
            this.queuedBalls.length === 0 && this.pendingBallSpawns === 0) {
            this.gameState.isGameOver = true;
            this.gameState.hasWon = true;
            this.showOverlay(true);
            this.audio.winJingle();
            return;
        }

        // Lose condition: can't afford spin AND no active balls AND no queued/pending balls AND slot is idle
        if (!playerData.canAffordSpin() &&
            this.gameState.balls.length === 0 &&
            this.queuedBalls.length === 0 &&
            this.pendingBallSpawns === 0 &&
            this.gameState.slotState === 'idle') {
            this.gameState.isGameOver = true;
            this.gameState.hasWon = false;
            this.showOverlay(false);
            this.audio.loseSound();
        }
    }

    updateUI() {
        // Update balance display (persistent currency)
        this.balanceDisplay.textContent = playerData.points.toLocaleString();

        // Update session points display
        this.sessionPoints = this.gameState.points;
        this.pointsCountEl.textContent = this.sessionPoints.toLocaleString();

        // Update spin cost display
        if (playerData.freeSpins > 0) {
            this.costDisplay.classList.add('hidden');
            this.freeSpinBadge.classList.remove('hidden');
        } else {
            this.costDisplay.classList.remove('hidden');
            this.costDisplay.textContent = `-${ECONOMY.SPIN_COST}`;
            this.freeSpinBadge.classList.add('hidden');
        }

        // Action label - SPACE always spins, DOWN launches
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
        // Hide any active overlays first
        this.skillWheel.hide();
        document.getElementById('slot-overlay').classList.add('hidden');

        this.overlay.classList.remove('hidden');
        this.overlayTitle.className = won ? 'win' : 'lose';
        this.overlayTitle.textContent = won ? 'LEVEL CLEAR!' : 'SESSION END';

        // Use gameState.points directly (sessionPoints may be stale)
        const earnedPoints = this.gameState.points;

        if (earnedPoints > 0) {
            // Add session points to player's balance
            playerData.addPoints(earnedPoints);

            // Show earned points
            this.overlayPointsEarned.classList.remove('hidden');
            this.earnedAmount.textContent = `+${earnedPoints.toLocaleString()}`;

            if (won) {
                this.overlayMessage.textContent = 'All blocks cleared!';
            } else {
                this.overlayMessage.textContent = 'Better luck next time!';
            }
        } else {
            this.overlayPointsEarned.classList.add('hidden');
            this.overlayMessage.textContent = won ? 'All blocks cleared!' : 'No points earned.';
        }

        // Update button text
        this.overlayBtn.textContent = 'BACK TO MENU';
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
    // Create menu manager first
    menuManager = new MenuManager();

    // Create game instance (starts on main menu)
    window.game = new Game();

    // Show main menu
    menuManager.showMainMenu();
});
