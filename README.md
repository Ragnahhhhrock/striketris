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

## The rules being tested

- **Rounds:** bomb defuse. Attackers plant at A or B, defenders stop them. First to 8.
- **Blocks:** a tetromino drops every few seconds. A red ghost and sky beam show where, about 3 seconds ahead. It kills anything underneath.
- **Stacks are terrain:** blocks stay for the round as cover, walls and high ground. Hold Space at a ledge to climb up to one cube.
- **Line clears:** fill a wall-to-wall run of at least 5 cubes and it clears, damages anyone close, and drops what sat above it.
- **No softlocks:** a block never lands on a spawn or plant spot, and is rejected if it would cut off a site or trap a player.

## Layout

| File | Purpose |
| --- | --- |
| `public/src/config.js` | Every tunable: speeds, damage, block timing, bot skill |
| `public/src/map.js` | Level layout, sites, spawns |
| `public/src/grid.js` | Voxel world, collision, raycasts |
| `public/src/pieces.js` | Shapes, landing spots, line clears |
| `public/src/nav.js` | Bot pathfinding on the changing grid |
| `public/src/game.js` | Rounds, bomb, weapons, blocks. Runs headless |
| `public/src/bots.js` | Bot behaviour |
| `public/src/render.js`, `hud.js`, `audio.js`, `main.js` | Browser layer |

The simulation has no rendering dependency, which keeps a later move to a multiplayer server open.
