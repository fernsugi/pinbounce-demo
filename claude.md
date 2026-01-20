# Pin Bounce! - Game Documentation

## Overview
Pin Bounce! is a mobile-first arcade game built with vanilla JavaScript and HTML5 Canvas. Players shoot colored balls from a moving base to destroy blocks and score points.

## Core Mechanics

### Base & Shooting
- Base moves left/right automatically at the top of the screen
- Press SPACE to spin the slot machine and shoot balls downward
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
- SKILL basket triggers the skill wheel

### Skill Wheel
- Triggered when ball enters SKILL basket (if blocks remain)
- Segments: BOMB, SPLIT, BULLDOZE, and 3 MISS slots
- BOMB: Next hit explodes in area damage
- BULLDOZE: Ball doubles in size, pierces through blocks
- SPLIT: Spawn 3x balls on next shot
- If no balls on screen, skill is saved for next shot ("NEXT: SKILL" indicator)
- Press SPACE to skip animation instantly

### Scoring
- Points from block damage * basket multiplier
- +1 bonus point per wall bounce when all blocks cleared
- Final score multiplied by (1 + remaining spins * 0.1)

## Key Files

### main.js
Main game logic containing:
- `CONFIG` - Game configuration constants (line ~20)
- `JUICE` - Visual effects settings (line ~87)
- `GameState` - Core game state (line ~630)
- `Ball` - Ball physics and behavior (line ~716)
- `Block` - Block entities (line ~840)
- `SlotMachine` - Slot mechanics (line ~893)
- `SkillWheel` - Skill wheel mechanics (line ~1120)
- `Renderer` - Canvas rendering (line ~1340)
- `Game` - Main game loop and logic (line ~1960)

### index.html
Game structure with overlays for slot machine, skill wheel, settings, and game over.

### style.css
Mobile-first responsive styling with arcade aesthetic.

## Configuration

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
- Restart button - Reset game
- Settings - Toggle sound, haptics, performance mode
