# StrikeTris

Tetris meets Counter-Strike. A team arena shooter where giant Tetris blocks fall into the map, crush anyone underneath and rebuild cover mid-round. This is the grey box build: untextured, single-player against bots, made to test whether the idea is fun. Target domain: striketris.com.

## Run it

```
npm start        # serves public/ at localhost:8080
npm test         # simulation tests, including full bot-only matches
```

No build step. The site is the static `public/` folder.

## Deploy to Cloudflare Pages

Connect this repo in Workers & Pages, leave the build command empty, set the output directory to `public`, then add striketris.com as a custom domain.

## Mobile

Touch devices get on-screen controls automatically (add `?touch=1` to force them on a desktop). Left thumb is a floating move stick, right thumb drags to look, and the buttons are Fire (drag on it to aim while shooting), Jump, Use, Reload, Crouch and Swap (cycles weapons, including the launcher once you have one). The Steer button appears when you can steer the falling block and swaps the buttons for arrows, rotate, flip, tumble and drop. Landscape works best. Code is in `public/src/touch.js`.

## The rules being tested

- **Rounds:** team arena combat, first to 8. Attackers and defenders fight over the map while blocks fall. The round objective is a plant-and-defuse bomb at sites A and B.
- **Spectate:** pick "Spectate only" in the menu, or press F after you die, for a free-fly camera. 1-4 set speed, P pauses, G drops a block. "Play, invulnerable" lets you walk the map without dying.
- **Blocks:** classic Tetris colours (I cyan, O yellow, T purple, S green, Z red, J blue, L orange).
- **Blocks:** a tetromino drops every few seconds. A red ghost and sky beam show where, about 3 seconds ahead. It kills anything underneath.
- **Steering:** a block takes about 4.5 seconds to fall and can be moved, rotated, flipped over and tumbled upright the whole way down, until the last 1.5 cells. Arrow keys move (relative to your camera), Z and X rotate, V flips, B tumbles, Enter hard drops. Rotations pivot around the centre and try small wall kicks. Anyone spectating, dead or invulnerable can steer. If nobody does, an AI director nudges the block once to help finish a line. A steered block can never seal off a site or trap a player.
- **Arena:** a dark Tetris well with a neon rim and corner towers, glass walls up to the sky and neon blocks drifting around it. Walls and floor are bright base colours in bands that sweep across the room. About one wall cube in six is a glowing neon block.
- **Shifting arena:** every wall cube rotates, flips or slides and returns in a travelling wave, changing colour as it goes. This is visual only: collision stays on the voxel grid, so the room is always where the simulation says it is. Floor tiles and the floating neon blocks do not move at all, so a gap in the floor is always a real hole and nothing is shown falling unless it is heading for the bottom of the world. Code is in `public/src/arenaFx.js`. Reduced-motion users get the colours without the wall movement.
- **Elevators:** nine floor sections (mid, both sites, both long lanes and more) rest flush with the floor, rise 3 to 6 m, hold, then lower. Raised, they are solid: they block movement and shots and give a high vantage. They carry anyone standing on them, shove up anyone over them as they rise, and squash anyone left with no headroom. The cap turns orange while moving. Blocks cannot land on them. Mirrored lifts share a timer. **Pistons:** five more (cyan caps) run from the bedrock up through a hole in the floor. They start the round standing up, then sink out of sight, leaving an open shaft you can fall down, and rise through the floor again. Tunables are `LIFT` in `config.js`; spots and timing are in `public/src/lifts.js`.
- **Closing walls:** 40 seconds into a live round four slabs start sliding in from the edges, shaded red on the minimap, with a countdown on the HUD beforehand. They meet in the middle at 100 seconds, leaving a gap narrower than a player, so anyone still alive is squashed. Walls shove players inward and squash anyone pinned against something solid. They block movement, shots and sight. A planted bomb the walls reach goes off at once, a dropped bomb is nudged ahead of them, and blocks no longer land near them. Bots drift toward the shrinking floor. If both teams are crushed with no bomb down, defenders win the round. Tunables are `CLOSE` in `config.js`; code is in `public/src/walls.js`.
- **Pickups:** health packs (+35, up to 100), ammo boxes and rocket launchers sit on the map and come back after 20 to 25 seconds. Spots are in `public/src/pickups.js`: two launchers in mid, one toward each team, and health and ammo near the sites and lanes. Blocks never land on a pickup column. Everything resets each round. The minimap shows items that are up. Tunables are `PICKUP` in `config.js`.
- **Knife:** every kit carries one (key 3). A stab reaches 2.2 m along the crosshair, never through walls, blocks or pieces, and only injures: 34 damage, so it takes three stabs to kill. No headshots. Tunables are `WEAPONS.knife` in `config.js`.
- **Friendly fire:** on by default. Bullets, stabs, rockets, grenades and mines hurt teammates as well as enemies, and a teamkill does not count as a kill. Pass `friendlyFire: false` to `new Game(...)` to turn it off. Bots do not yet hold fire for a teammate in the way.
- **Rocket launcher:** nobody spawns with it. Walking over one gives it to you with 5 rockets and puts it in your hands. Keys 1 and 2 pick the kit's guns, 3 the knife and 4 the launcher, and the mouse wheel cycles them. Rockets fly at 24 m/s and burst on the first wall, crate, lift or body. The blast does up to 100 damage, fading to nothing at 5 m, plus 30 for a direct hit. Walls shield from it. It shoves everyone nearby, so firing at your feet is a rocket jump that costs about half the blast in health. Teammates are shoved and, with friendly fire on, hurt too. Blasts also damage settled blocks: one rocket destroys the block it hits, and cubes the blast can see nearby darken as they crack and break after 120 damage, so a second rocket opens up a thick wall. It breaks map walls, crates and the floor as well, and a bomb resting on a broken block drops to whatever is below it. Out of rockets it drops back to the rifle. Tunables are `WEAPONS.rocket` in `config.js`.
- **Destructible blocks:** settled blocks have 120 HP. A rocket breaks the block it hits in one go. Bullets only chip them (`blockDmg` in `config.js`): about 24 rifle hits or 9 pistol hits per block, less on a ricochet. Damaged blocks darken toward charred. Falling blocks can be shot too: each cube has the same 120 HP, so you can shoot cubes out of an incoming block (rockets break the one they hit) and it lands with only what is left, still damaged. Destroy every cube and the block is gone. Everything in the arena can be destroyed: map walls (the same 120 HP), the floor, and crates (half that). Grenades and mines break blocks too. Only the bedrock at the bottom of the world is permanent, along with the lifts and pistons, which are machinery. Everything resets each round.
- **Holes and the pit:** the floor is one layer of blocks over an open pit 15 m deep with a bedrock bottom. Shoot a hole in the floor and anything that steps in falls, takes fall damage on landing (about 38 from the full drop) and stays down there until it rides a piston back up; bots do this on their own. Falling blocks drop into holes and rest on the bedrock. Broken blocks throw chips that fall into holes as well. The minimap shows holes in black and shafts in violet.
- **Ammo boxes:** refill the rifle and pistol magazines instantly and add 4 rockets if you carry the launcher.
- **Fall damage:** it depends on how far you drop. Up to 6 m is free, which covers a lift ride, a rocket jump and climbing back down a ledge. Past that damage climbs steadily to 100 at 30 m, so a drop that far kills from full health. Your health bar drains, the screen flashes red, the camera jolts and a dust ring marks the landing. Tunables are `MOVE.fallSafe` and `MOVE.fallLethal` in `config.js`.
- **Dropped weapons:** a fighter who dies leaves their primary weapon, with the ammo left in it, where they fell. Stand next to it and press E to swap: you take it and your own primary drops at your feet at once. Walking over it does nothing, and drops clear each round. Code is in `public/src/drops.js`.
- **Reload:** in first person the gun tips up and rolls aside, the old magazine drops out, a fresh one slides in and the gun comes back level. The HUD shows reload progress.
- **Death:** when you die the camera swings out of your eyes and circles your fighter as it collapses and drops its weapon, with the cause on screen ("You fell too far", "Killed by Ash"). After a couple of seconds it hands over to spectating. Space, E, Q or F skips ahead. The camera maths lives in `public/src/deathcam.js`.
- **Bots and items:** a hurt bot detours for health, and the nearest bot without a launcher goes for one. They fire rockets at mid range when the path is clear and switch back to the rifle up close.
- **Block lighting:** the falling block glows and lights the map in its own colour.
- **Stacks are terrain:** blocks stay for the round as cover, walls and high ground. Hold Space at a ledge to climb up to one cube.
- **Line clears:** fill a wall-to-wall run of at least 5 cubes and it clears, damages anyone close, and drops what sat above it.
- **No softlocks:** a block never lands on a spawn or plant spot, and is rejected if it would cut off a site or trap a player.

## Characters

Every fighter is a procedural rig of merged box meshes with a real skeleton: head, torso, two-bone arms and legs. Nothing is loaded from disk.

- **Looks:** every fighter is a Tetris piece standing upright with a face, arms and legs. `public/src/looks.js` holds a hand-made look for each bot name plus a seeded generator for anyone else: piece (I, O, T, S, Z, J or L, in the block colours), eyewear (5), build, backpack and gloves. Teammates never share a piece. Arms always take the team colour so allies and enemies read at range. Body geometry is in `public/src/characters.js`; `/characters.html` shows the whole roster.
- **Animation:** `public/src/characters.js` drives the rig from live actor state. Gait follows velocity (strafe and backpedal turn the legs while the torso keeps aiming), crouch is a real squat, jumps tuck the legs, ledge climbs reach up, weapons follow your pitch and recoil, reloads swap the magazine, and the dead fall and drop their gun. Arms use two-bone IK, so hands stay on the weapon at any aim angle.
- **Bomb:** the carrier wears it on their back.
- **Viewer:** open `/characters.html` for the full lineup. Pick any animation, weapon or look angle, click a name to focus. Query options: `anim`, `gun`, `focus`, `team=def`, `yaw`, `pitch`, `dist`, `solo`, `fixed`, `bomb`.

## Character select

The game opens on a selection screen: a rotating 3D preview, a side (sets your shirt colour and weapon names), one of the five classes, and any of the 13 hand-made fighters or the default Rookie. If a bot already wears your pick it takes the Rookie look. Choices are remembered; "Change fighter" in the menu reopens the screen. Add `?skipselect=1` to go straight to the menu.

## Classes

Five kits modelled on Battlefield 1942. Health and speed are shared; the kit is the difference. Pick one in the menu (it applies from the next round; bots fill the other kits on both teams). Weapon stats are identical across sides, only the names differ (Axis/Allies, attackers/defenders).

| Class | Primary | Secondary | Gadget (`F`) | Trait |
| --- | --- | --- | --- | --- |
| Assault | SMG (MP 40 / Thompson) | Pistol | 3 hand grenades | Best up close |
| Scout | Scoped bolt rifle (Kar 98k / Springfield) | Pistol | Binoculars | `Right mouse` (or `T`) zooms 3.2x; spots enemies onto the minimap and shows a marker for the team |
| Medic | LMG (MG 34 / BAR) | Pistol | Medic kit, 4 charges | Heals the most hurt teammate in reach, else yourself |
| Engineer | Bolt rifle (Kar 98k / M1 Garand) | Pistol | 3 mines | The wrench: plants in 0.6x and defuses in 0.55x the time |
| Anti-Tank | Rocket launcher (Panzerschreck / Bazooka) | Pistol | none | The map's rocket launcher: 8 rockets to start, splash damage, rocket jumps and it breaks blocks. Ammo pickups add rockets |

Adaptations: there are no vehicles here, so mines and rockets are used against infantry; there is no kit pickup mid-round. Class data lives in `config.js` (`WEAPONS`, `GADGETS`, `CLASSES`) and the sim in `game.js` handles projectiles, mines and gadgets, so it all runs headless. Rigs show each kit: its weapons, plus gear on the body (grenade belt, binoculars, red-cross pack, mines, spare rockets).

## Design

Tokens are in `public/design/tokens.css`, the rules in `DESIGN.md`, and a live reference at `/style-guide.html`. Share images (`og-image.png`, `twitter-card.png`) and app icons are built from `tools/share/share.html` with `npm run share` (needs Chrome and rsvg-convert).

## Layout

| File | Purpose |
| --- | --- |
| `public/src/config.js` | Every tunable: speeds, damage, block timing, bot skill |
| `public/src/map.js` | Level layout, sites, spawns |
| `public/src/grid.js` | Voxel world, collision, raycasts |
| `public/src/pieces.js` | Shapes, landing spots, line clears |
| `public/src/walls.js` | Closing walls: timing, pushing, squashing |
| `public/src/pickups.js` | Item spots, collecting, respawning |
| `public/src/nav.js` | Bot pathfinding on the changing grid |
| `public/src/game.js` | Rounds, bomb, weapons, rockets, blocks. Runs headless |
| `public/src/bots.js` | Bot behaviour |
| `public/src/looks.js` | Who each fighter is: which Tetris piece, eyewear, build, gear |
| `public/src/characters.js` | Character rigs, weapons, kit gear and animation |
| `public/src/render.js`, `hud.js`, `audio.js`, `main.js` | Browser layer |

The simulation has no rendering dependency, which keeps a later move to a multiplayer server open.
