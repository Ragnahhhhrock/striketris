# StrikeTris

A tactical shooter where giant falling blocks rebuild the map mid-round. This is the grey box build: untextured, single-player against bots, made to test whether the idea is fun. Target domain: striketris.com.

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

- **Rounds:** bomb defuse. Attackers plant at A or B, defenders stop them. First to 8.
- **Spectate:** pick "Spectate only" in the menu, or press F after you die, for a free-fly camera. 1-4 set speed, P pauses, G drops a block. "Play, invulnerable" lets you walk the map without dying.
- **Blocks:** classic Tetris colours (I cyan, O yellow, T purple, S green, Z red, J blue, L orange).
- **Blocks:** a tetromino drops every few seconds. A red ghost and sky beam show where, about 3 seconds ahead. It kills anything underneath.
- **Steering:** a block takes about 4.5 seconds to fall and can be moved, rotated, flipped over and tumbled upright the whole way down, until the last 1.5 cells. Arrow keys move (relative to your camera), Z and X rotate, V flips, B tumbles, Enter hard drops. Rotations pivot around the centre and try small wall kicks. Anyone spectating, dead or invulnerable can steer. If nobody does, an AI director nudges the block once to help finish a line. A steered block can never seal off a site or trap a player.
- **Arena:** a dark Tetris well with a neon rim and corner towers, glass walls up to the sky and neon blocks drifting around it. Walls and floor are bright base colours in bands that sweep across the room. About one wall cube in six is a glowing neon block.
- **Shifting arena:** every wall cube and floor tile rotates, flips, slides or drops out and returns in a travelling wave, changing colour as it goes. This is visual only: collision stays on the voxel grid, so the room is always where the simulation says it is. Code is in `public/src/arenaFx.js`. Reduced-motion users get the colours without the movement.
- **Elevators:** five floor sections (mid, both sites, both long lanes) rest flush with the floor, rise 4.5 m, hold, then lower. Raised, they are solid: they block movement and shots and give a high vantage. They carry anyone standing on them, shove up anyone over them as they rise, and squash anyone left with no headroom. The cap turns orange while moving. Blocks cannot land on them. Mirrored lifts share a timer. Tunables are `LIFT` in `config.js`; spots and timing are in `public/src/lifts.js`.
- **Pickups:** health packs (+35, up to 100), ammo boxes and rocket launchers sit on the map and come back after 20 to 25 seconds. Spots are in `public/src/pickups.js`: two launchers in mid, one toward each team, and health and ammo near the sites and lanes. Blocks never land on a pickup column. Everything resets each round. The minimap shows items that are up. Tunables are `PICKUP` in `config.js`.
- **Rocket launcher:** nobody spawns with it. Walking over one gives it to you with 5 rockets and puts it in your hands. Keys 1, 2 and 3 pick weapons and the mouse wheel cycles them. Rockets fly at 24 m/s and burst on the first wall, crate, lift or body. The blast does up to 100 damage, fading to nothing at 5 m, plus 30 for a direct hit. Walls shield from it. It shoves everyone nearby, so firing at your feet is a rocket jump that costs about half the blast in health. Teammates are shoved but never hurt. Out of rockets it drops back to the rifle. Tunables are `WEAPONS.rocket` in `config.js`.
- **Ammo boxes:** refill the rifle and pistol magazines instantly and add 4 rockets if you carry the launcher.
- **Bots and items:** a hurt bot detours for health, and the nearest bot without a launcher goes for one. They fire rockets at mid range when the path is clear and switch back to the rifle up close.
- **Block lighting:** the falling block glows and lights the map in its own colour.
- **Stacks are terrain:** blocks stay for the round as cover, walls and high ground. Hold Space at a ledge to climb up to one cube.
- **Line clears:** fill a wall-to-wall run of at least 5 cubes and it clears, damages anyone close, and drops what sat above it.
- **No softlocks:** a block never lands on a spawn or plant spot, and is rejected if it would cut off a site or trap a player.

## Design

Tokens are in `public/design/tokens.css`, the rules in `DESIGN.md`, and a live reference at `/style-guide.html`. Share images (`og-image.png`, `twitter-card.png`) and app icons are built from `tools/share/share.html` with `npm run share` (needs Chrome and rsvg-convert).

## Layout

| File | Purpose |
| --- | --- |
| `public/src/config.js` | Every tunable: speeds, damage, block timing, bot skill |
| `public/src/map.js` | Level layout, sites, spawns |
| `public/src/grid.js` | Voxel world, collision, raycasts |
| `public/src/pieces.js` | Shapes, landing spots, line clears |
| `public/src/pickups.js` | Item spots, collecting, respawning |
| `public/src/nav.js` | Bot pathfinding on the changing grid |
| `public/src/game.js` | Rounds, bomb, weapons, rockets, blocks. Runs headless |
| `public/src/bots.js` | Bot behaviour |
| `public/src/render.js`, `hud.js`, `audio.js`, `main.js` | Browser layer |

The simulation has no rendering dependency, which keeps a later move to a multiplayer server open.
