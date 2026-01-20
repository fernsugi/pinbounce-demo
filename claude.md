# Pin Bounce! - Game Documentation

## Overview
Pin Bounce! is a mobile-first arcade game built with vanilla JavaScript and HTML5 Canvas. Players shoot colored balls from a moving base to destroy blocks and score points.

## Economy System

### Points as Currency
- New players start with 5,000 points
- Each slot spin costs 100 points
- Points are persistent (saved to localStorage)
- Session points earned from gameplay are added to balance when game ends

### Free Spins
- Free spins bypass the point cost
- Purchased in packs of 5 (dummy $0.99)
- Shown with purple "FREE" badge in-game

### Daily Reward
- 2,500 points once per day
- Banner appears on main menu when available

### Ad System (Dummy)
- Prompted when player runs out of points
- 5-second countdown before skip available
- Rewards 2,500 points

### Shop
- Ball skins: Fire, Ice (500 points), Gold, Neon ($1.99)
- Trails: Spark (300 points), Rainbow ($0.99)
- Cosmetics can be purchased with points or real money (dummy)
- Equipped cosmetics persist across sessions

## Game Flow

### Main Menu
1. Player sees balance, daily reward (if available), stats
2. PLAY → starts new game session
3. SHOP → browse/buy cosmetics and free spins
4. SETTINGS → sound, haptics, performance mode, reset progress

### In-Game
1. Press SPACE to spin slot (costs 100 points or 1 free spin)
2. Balls queue up until player has balls on screen
3. LAUNCH ALL button appears when balls are queued
4. Session points accumulate from gameplay
5. Game ends when:
   - All blocks cleared (win) - session points added to balance
   - Can't afford spin + no balls in play (lose) - session points added
   - Player forfeits - session points saved

### Session End
- Points earned are added to player balance
- Overlay shows amount earned
- "BACK TO MENU" returns to main menu
- If out of points, ad prompt appears

## Core Mechanics

### Base & Shooting
- Base moves left/right automatically at the top of the screen
- Press SPACE to spin the slot machine and queue balls
- Balls always shoot straight down from the base position

### Slot Machine
- Determines ball color (red/yellow/blue) and quantity (1-3)
- Triple match = 3 balls, double match = 2 balls, no match = 1 ball
- All different colors = Rainbow ball (special, destroys any block instantly)
- Press SPACE to skip animation instantly

### Blocks
- Colored blocks (red/yellow/blue) - matching ball color deals 5 damage, mismatched deals 1 damage
- Each block has HP that must be depleted to destroy it
- Points earned based on damage dealt

### Baskets (Bottom)
- 5 baskets with shuffled positions each game: SKILL, x1, x3, x1, SKILL
- x1/x3 multiply the ball's accumulated points
- SKILL basket triggers the skill wheel (shows "---" when on cooldown)

### Skill Wheel
- Triggered when ball enters SKILL basket (if blocks remain)
- Segments: BOMB, SPLIT, BULLDOZE, and 3 MISS slots
- BOMB: All balls gain explosion ability (area damage on hit)
- BULLDOZE: All balls double in size and pierce through blocks
- SPLIT: Next shot spawns 3x the normal ball count
- Random starting position each spin (prevents consecutive misses)
- If no balls on screen, skill is saved for next shot ("NEXT: SKILL" indicator below base)
- 2-second cooldown between triggers
- Press SPACE to skip animation instantly

### Fever Time
- Activates when all blocks are cleared and balls are still bouncing
- Flashy "FEVER TIME!" banner appears in center
- +1 bonus point per wall bounce (outer walls AND obstacle walls)

## Key Files

### main.js
Main game logic containing:
- `ECONOMY` - Economy constants (line ~41)
- `PlayerData` - Persistent player data with localStorage (line ~62)
- `MenuManager` - Main menu, shop, ads handling (line ~228)
- `CONFIG` - Game configuration constants (line ~554)
- `JUICE` - Visual effects settings (line ~620)
- `GameState` - Core game state (line ~1160)
- `Ball` - Ball physics and behavior (line ~1250)
- `Block` - Block entities (line ~1375)
- `SlotMachine` - Slot mechanics (line ~1430)
- `SkillWheel` - Skill wheel mechanics (line ~1680)
- `Renderer` - Canvas rendering (line ~1960)
- `Game` - Main game loop and logic (line ~2682)

### index.html
Game structure with:
- Main menu overlay
- In-game header (balance + session points)
- Queue display for batched balls
- Shop panel with cosmetics
- Ad prompt and dummy ad player
- Purchase confirmation modal
- Toast notification container

### style.css
Mobile-first responsive styling with arcade aesthetic.

## Configuration

### Economy Constants (ECONOMY)
```javascript
STARTING_POINTS: 5000,      // New player balance
SPIN_COST: 100,             // Cost per slot spin
DAILY_REWARD: 2500,         // Daily login bonus
AD_REWARD: 2500,            // Points for watching ad
FREE_SPIN_PACK_COUNT: 5,    // Spins per pack
```

### Block Colors (CONFIG.COLOR_WEIGHTS)
```javascript
COLOR_WEIGHTS: { red: 1, yellow: 1, blue: 1, neutral: 0 }
```
Set weight to 0 to disable that color.

### Key Constants
- `BALL_SPEED` - Base ball speed
- `GRAVITY` - Downward acceleration
- `BALL_BOOST_MULTIPLIER` - Initial speed boost on spawn
- `SLOT_MATCH_BIAS` - Chance for reels to match

## Controls
- SPACE - Spin slot / Stop skill wheel / Skip animations
- D - Toggle debug panel
- FORFEIT button - End game early, keep earned points
- LAUNCH ALL - Launch all queued balls
- Settings - Toggle sound, haptics, performance mode

## Data Persistence (localStorage)
Player data saved as `pinbounce_playerdata`:
- points, freeSpins
- totalGamesPlayed, totalPointsEarned, highScore
- lastDailyReward (ISO date string)
- ownedCosmetics, equippedBallSkin, equippedTrail
- adsWatched
- settings (sound, haptics, performanceMode)
