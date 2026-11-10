# Striketris design notes

## Game modes (selected at game start)
Two modes, chosen on a mode-select screen before the loadout screen.

### Mode 1: Soldier (the standard shooter)
- Everything described in the rest of these notes: loadout, weapons, teams, verticality, dynamic map.

### Mode 2: Architect (overseer mode)
- You are placed at the far edge of the arena, out of harm's way, with a view of the entire arena.
- You are unarmed. Your only tool is control of the blocks falling from the sky.
- You position (and presumably rotate) the falling blocks and use them to squash your opponents.
- The opponents are the players on the arena floor; they can't reach you.
- Open questions:
  - Is the Architect a player in a normal match (everyone else is a Soldier hunted by one or more Architects), or a solo mode against bots?
  - Do Soldiers get any way to fight back (shooting blocks to redirect or destroy them, per the dynamic-map rules)?
  - Control scheme for placing a piece: free cursor on the arena floor, then rotate and drop? Or steer the piece while it falls?
  - Limits so it isn't a free win: cooldown between pieces, a limited piece queue, or a drop-speed cap.
  - Does the existing anti-camp targeting (dwell-time weighting) still run automatically, or does the Architect replace it?
  - Does the Architect have a lose condition (e.g. the arena fills up with locked blocks and line clears you can't control)?

## Loadout screen (no classes, no character selection)
- No class system and no character selection.
- A loadout screen is shown at game start. Players pick their weapons there.
- Pick one primary: assault rifle, machine gun or sniper rifle.
- Pick one secondary: one of two pistols.
- Every loadout includes the block knife for melee.

## Respawning
- On death, a player respawns at their original spawn point with a fresh loadout.
- Open: is the fresh loadout the one chosen on the loadout screen, or can the player re-pick on respawn? Is there a respawn delay or brief spawn protection?

## Teams
- Characters belong to teams. There is one team per Tetris shape: 7 teams.
- Teams: I, O, T, S, Z, J, L.
- Team colour follows the standard Tetris colours: I cyan, O yellow, T purple, S green, Z red, J blue, L orange.
- A character's single body colour is their team's colour.
- Open: how players get assigned to a team (auto-balance vs free pick), and the minimum number of teams per match.

## Characters
- All characters are standardised: one Minecraft-style block-shaped figure.
- Each character is a single Tetris colour (its team colour), built from Tetris-like block colours.
- Only facial features (e.g. eyes) can use other colours.

## Weapons
- All guns are block-shaped, automatic, and shoot blocks.
- Assault rifle: good balance of range and rate of fire.
- Machine gun: full auto, belt fed, higher magazine capacity. Less range and impact than the assault rifle or sniper rifle.
- Sniper rifle: slow reload, small magazine, scope zoom, high-impact bullets that do a lot of damage.
- Secondary: two pistol options.
- Knife: block-shaped melee weapon. A stab only injures the opponent, it never kills in one hit. Multiple stabs kill.
- Reloading: show a reload animation.
- On death, the player drops their primary weapon.
- Players can pick up a dead player's dropped weapon.
- Picking up a weapon instantly drops your current primary weapon (swap).
- Rockets: a well-placed rocket can ricochet a player off the edge of the map to their death.

## Rules
- Friendly fire is on: you can injure and kill your teammates.
- The map has open edges: you can fall off the edge to your death.
- Falling off the edge: the primary weapon falls with the player and is lost (not recoverable). (Proposed default, to confirm.)
- Falling off the edge on your own counts as a self-inflicted death with no kill credit. (Proposed default, to confirm.)
- If a player is knocked off the edge by an attacker (e.g. a rocket ricochet), the attacker gets the kill credit.

## Verticality and level layout
- The map is multi-level: an upper level, the main arena floor, and a lower level underneath it.
- Verticality is a core part of the game: fights happen above, below and across levels, not just on one plane.
- Lower level: sits underneath the main arena floor and is packed with additional Tetris blocks (more cover, tighter lanes, hiding spots).
- Upper level: raised platforms and walkways above the arena floor, with sightlines down onto the main floor.
- Stairways: made of Tetris blocks, connecting the lower level, main floor and upper level. Several routes between levels so no single chokepoint.
- All levels contain moving blocks and walls (sliding, rotating, shifting routes and cover) and falling blocks.
- Falling pieces drop onto every level, not only the main floor, so no level is a safe zone.

## Drop terminals (player-controlled piece drops)
Soldiers can take control of the falling pieces from two terminals and use them as a weapon. This is the in-match version of the Architect idea: the power is there, but you have to climb for it, and you are exposed while using it.

### Placement
- Two terminals, at opposite ends of the map.
- Each sits in a high, difficult-to-reach position (top of the upper level). Reaching one takes real traversal through block stairways and walkways, and there is no easy single route.
- Because stairways and bridges are made of blocks, falling pieces and shooting can cut the routes up to a terminal.

### Piece ownership
- The falling pieces are split between the two terminals: each terminal controls half of them.
- Only one piece falls at a time. When a piece has landed on the arena, the next piece starts falling.
- Each piece is assigned to whoever is operating the terminal it belongs to. Whoever is at that terminal when the piece spawns controls it.
- Proposed default: pieces alternate between terminal A and terminal B (A, B, A, B...), so each gets half and the pacing is predictable. Alternative: random 50/50.
- If nobody is operating the terminal when its piece spawns, the piece falls on its own (using the normal automatic targeting) after a short delay.

### Operating a terminal
- Interact with the terminal to take it over. Only one operator per terminal at a time.
- The operator can position the falling piece (move left/right/forward/back, rotate) and drop it onto the arena, crushing opponents underneath.
- Proposed default: a time limit per piece (about 8-10s). If it runs out, the piece drops where it is.
- Proposed default: the piece's target area is shown to everyone as a ghost outline plus a warning sound, so dodging is still a skill.
- Kill credit for a crush goes to the operator.
- Friendly fire is on, so the operator can crush their own teammates (and themselves, if they stand under the drop).

### Vulnerability and the weapon lock
- While operating, the player is vulnerable to attack: their character stays in the world at the terminal and can be shot or stabbed.
- The player cannot operate the terminal and use their weapons at the same time. Entering the terminal holsters the weapons, and leaving it returns them (proposed: a short draw delay after exit).
- Proposed default: taking damage while operating interrupts the control. A hit above a damage threshold ejects the operator and the piece continues on its own, so being shot has a cost.
- If the operator is killed, the terminal is free for anyone else to take over, and the dead player drops their primary weapon as usual.

### Balance and open questions
- Camping: a high, hard-to-reach spot could favour snipers and make the terminal holder a sitting duck. Proposed mitigations: some cover around the terminal, and a visible beam or light showing which terminal is occupied and by whom.
- Is there a cooldown after you operate (stops one player holding a terminal for the whole match)?
- Can the operator see the whole arena from the terminal, or only a limited view?
- How does this relate to Architect mode? Either Architect replaces the terminals (mode 2 only), or the terminals are the Soldier-mode version and Architect is a separate role.
- It overlaps with the existing "piece-control pickups" and the automatic anti-camp targeting. Do the pickups stay, and does the auto-targeting only run on pieces nobody controls?
- Do pieces still lock in place and trigger line clears when player-controlled? (Assumed yes.)
- Teams: with 7 teams there is no team-owned terminal in this version. Is that intended, or should a team be able to hold or defend one?

## Making the Tetris pieces a core mechanic (not a gimmick)
Problem: the game felt like an arena shooter with falling pieces as decoration. Goal: pieces are a system players compete over. Core idea: **dynamic map + line clears + anti-camp targeting**.

### Pieces change the map
- Pieces lock in place on landing and become permanent geometry (cover, stairs, walls, bridges).
- Line clears: a full row of locked blocks vanishes and everything above drops. The map is constantly rebuilt; safe spots expire.
- Players can shoot blocks to destroy or shift them (open sightlines, collapse enemy cover).
- Pieces gradually fill the lower level and build new upper-level bridges.

### Block hit points (destructible blocks)
- Every block has hit points and takes damage from bullets and knife stabs. Enough hits break the block and it is removed from the map.
- Built in the current build: settled blocks and falling cubes have 120 HP each, a rocket breaks the block it hits, bullets chip (`blockDmg` in `config.js`), and damaged blocks darken toward charred. See the README for the full rules.
- Still open:
  - Knife damage against blocks (the stab is currently tuned for players only).
  - Whether blocks stacked above a broken one should fall like a line clear.
  - Whether a destroyed block should deny a line clear (a gap stops the row completing).

### Anti-camping targeting
- Spawn targeting is weighted by dwell time: staying in one spot ~10s+ draws pieces aimed near you.
- Aim at the space around players, not directly at them, to push campers out rather than instakill.
- Every piece is telegraphed (ghost outline/shadow + warning sound) so dodging is skill, not luck.
- Some pieces hunt the leader or the team holding an objective (comeback mechanic).

### Pacing
- Start slow so the map is readable; ramp drop rate and fall speed over the round, like Tetris levels.
- Surge moments (piece storms) every ~60-90s for contrast between calm and chaos.

### Player agency
- Piece-control pickups: nudge/rotate the next piece, or call one down on a target area.
- Players can stand on, ride, or hide under locked blocks; a piece landing on someone is a kill or heavy injury, so terrain is a weapon.
- Structure-linked objectives: hold the highest block, complete a line in your territory.
- Pieces can knock out stairways or push players off edges (more edge kills).
- Drop terminals (see above): two high-up terminals let a player steer a falling piece onto opponents.
