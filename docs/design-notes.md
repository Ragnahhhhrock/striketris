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
- Friendly fire is on: you can kill your teammates.
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

## Making the Tetris pieces a core mechanic (not a gimmick)
Problem: the game felt like an arena shooter with falling pieces as decoration. Goal: pieces are a system players compete over. Core idea: **dynamic map + line clears + anti-camp targeting**.

### Pieces change the map
- Pieces lock in place on landing and become permanent geometry (cover, stairs, walls, bridges).
- Line clears: a full row of locked blocks vanishes and everything above drops. The map is constantly rebuilt; safe spots expire.
- Players can shoot blocks to destroy or shift them (open sightlines, collapse enemy cover).
- Pieces gradually fill the lower level and build new upper-level bridges.

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
