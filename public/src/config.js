// All tunables live here so the grey box can be balanced without touching logic.
export const CELL = 3;            // metres per voxel: one tetromino cube
export const GRID_W = 32;         // cells on X
export const GRID_D = 32;         // cells on Z
export const GRID_H = 16;         // cells on Y
export const PIT = 6;             // layers under the playfield: y = -1 is the floor, y = -PIT is unbreakable bedrock, the cells between are open air
export const WALL_H = 5;          // interior wall height in cells
export const MAX_STACK = 12;      // pieces may not rest above this layer
export const MIN_LINE = 5;        // shortest wall-to-wall run that clears

export const TICK = 1 / 60;

export const MOVE = {
  run: 6.5, walk: 3.2, crouch: 2.6,
  groundAccel: 12, airAccel: 2.5,
  gravity: 14, jump: 5.2,
  radius: 0.35, height: 1.8, crouchHeight: 1.3,
  eye: 1.62, crouchEye: 1.12,
  mantleReach: 3.3, mantleTime: 0.42,
  // Fall damage is worked out from the height you drop (from your landing speed), not your speed. Up to fallSafe metres is
  // free: that covers a lift ride, a rocket jump and climbing back down a ledge you mantled. Past it, damage climbs in a
  // straight line to 100 at fallLethal metres, so a drop that far or further always kills from full health.
  fallSafe: 6, fallLethal: 30,
};

// The open rim. Two raised ledges (levels.js RIM_LEDGES) run out through gaps in the west and east walls with nothing at
// the end, so the outer side is a sheer drop into the void. z0..z1 are the wall columns the gap covers. Anyone whose
// centre is past the wall line and below killY metres is gone ("void" death). A fighter shoved off within `credit`
// seconds of the last rocket blast that pushed them dies to that attacker, otherwise it counts as a plain fall.
export const RIM = { z0: 16, z1: 19, killY: 5, credit: 8 };

export const BULLET_RANGE = 200;   // total metres a round can travel, bounces included
export const BLOCK_HP = 120;       // damage a settled block takes before it is destroyed, from bullets and rockets alike

// The loadout guns. Every gun is block-shaped, fully automatic and fires blocks. Three primaries, two pistols.
//   kick / kickYaw   view punch per shot in radians; kickMax / kickYawMax cap the build-up
//   recover          how fast the punch settles per second
//   bounces          walls a round can glance off; bounceKeep is the damage kept after each
//   range            metres a round can travel before it drops out (BULLET_RANGE when absent)
//   scope            zoom factor while scoped (right mouse)
//   blockDmg         damage each hit does to a settled block (BLOCK_HP to break it), scaled by bounceKeep on a ricochet
//   shake / fov      camera shudder and FOV punch for the shooter; vm* drive the gun model
//   tracer / flash   colours and sizes of the visible round and muzzle flash
const fx = (colour, size, light = 6) => ({ colour, size, life: 0.06, light });
const tr = (colour, width, life = 0.08) => ({ colour, ricochet: 0xfff2b0, width, life });
export const WEAPONS = {
  // Assault rifle: the balanced one. Good range, good rate of fire, one glance off a wall.
  rifle: {
    name: 'Assault Rifle', blurb: 'Balanced range and rate of fire.', mag: 30, reload: 2.4, interval: 0.09, damage: 28, headMult: 3.6, spread: 0.002, moveSpread: 0.035, auto: true, blockDmg: 5, range: 170,
    kick: 0.017, kickMax: 0.16, kickYaw: 0.006, kickYawMax: 0.05, recover: 4.2,
    bounces: 1, bounceKeep: 0.55,
    shake: 0.1, fov: 0.5, vmBack: 0.085, vmPitch: 0.1, vmRecover: 16,
    tracer: { colour: 0xffb347, ricochet: 0xfff2b0, width: 0.026, life: 0.07 },
    flash: { colour: 0xffa63d, size: 1.5, life: 0.05, light: 5 },
  },
  // Machine gun: belt fed, full auto, the biggest magazine. Short on range and punch next to the rifle and sniper.
  lmg: {
    name: 'Machine Gun', blurb: 'Full auto, belt fed, big magazine. Less range and impact.', mag: 100, reload: 4.6, interval: 0.07, damage: 15, headMult: 2.6, spread: 0.007, moveSpread: 0.06, auto: true, blockDmg: 3, range: 85, slow: 0.9,
    kick: 0.008, kickMax: 0.13, kickYaw: 0.006, kickYawMax: 0.05, recover: 3.5, bounces: 0, bounceKeep: 1,
    shake: 0.14, fov: 0.6, vmBack: 0.09, vmPitch: 0.1, vmRecover: 14, tracer: tr(0xffa63d, 0.03, 0.08), flash: fx(0xff9a2a, 1.8, 6),
  },
  // Sniper rifle: slow reload, tiny magazine, scope zoom, and every round hits hard.
  sniper: {
    name: 'Sniper Rifle', blurb: 'Scope zoom and huge damage. Slow reload, small magazine.', mag: 5, reload: 3.6, interval: 0.9, damage: 92, headMult: 2.6, spread: 0.0006, moveSpread: 0.09, auto: true, blockDmg: 22, scope: 3.2, slow: 0.9, range: 320,
    kick: 0.05, kickMax: 0.08, kickYaw: 0.008, kickYawMax: 0.03, recover: 4, bounces: 0, bounceKeep: 1,
    shake: 0.5, fov: 1.5, vmBack: 0.16, vmPitch: 0.3, vmRecover: 8, tracer: tr(0xffffff, 0.04, 0.14), flash: fx(0xfff0c0, 2.4, 9),
  },
  // Two pistols. The heavy one is slow and hits hard; the machine pistol is fast and light.
  pistol: {
    name: 'Heavy Pistol', blurb: 'Slow, hard-hitting hand cannon.', mag: 8, reload: 1.7, interval: 0.28, damage: 46, headMult: 2.6, spread: 0.0015, moveSpread: 0.02, auto: true, blockDmg: 14, range: 200,
    kick: 0.05, kickMax: 0.14, kickYaw: 0.01, kickYawMax: 0.04, recover: 7,
    bounces: 2, bounceKeep: 0.7,
    shake: 0.5, fov: 1.8, vmBack: 0.15, vmPitch: 0.28, vmRecover: 10,
    tracer: { colour: 0x7fe9ff, ricochet: 0xffffff, width: 0.045, life: 0.11 },
    flash: { colour: 0x9fe8ff, size: 2.4, life: 0.07, light: 9 },
  },
  pistol2: {
    name: 'Machine Pistol', blurb: 'Rapid fire, light hits.', mag: 20, reload: 1.5, interval: 0.1, damage: 15, headMult: 2.4, spread: 0.008, moveSpread: 0.03, auto: true, blockDmg: 3, range: 60,
    kick: 0.012, kickMax: 0.1, kickYaw: 0.006, kickYawMax: 0.04, recover: 7, bounces: 0, bounceKeep: 1,
    shake: 0.1, fov: 0.4, vmBack: 0.07, vmPitch: 0.12, vmRecover: 16, tracer: tr(0xc8a8ff, 0.022, 0.06), flash: fx(0xc8a8ff, 1.2, 4),
  },
};

// Rocket launcher, borrowed from Quake 3. It sits on the map as a pickup (nobody spawns with it), uses its
// own rocket pool instead of a magazine, and its blast shoves players around, so rocket jumps work.
//   speed      rocket flight speed in m/s
//   direct     extra damage to whoever the rocket hits head on, on top of the blast
//   splash     blast damage at the centre, falling off to nothing at radius metres
//   knock      blast shove in m/s at the centre; selfScale cuts the damage you do to yourself
//   blockCrush cubes the blast can see within this many metres break outright, so one rocket always destroys the
//              block it hits. Further out, blocks take splash damage with the same falloff as players and crack
//   max        most rockets you can carry; start is what the launcher pickup gives you
WEAPONS.rocket = {
  name: 'Rocket Launcher', mag: 12, max: 12, start: 5, noReload: true, reload: 0, interval: 0.8, auto: true,
  speed: 24, life: 6, direct: 30, splash: 100, radius: 5, knock: 12, selfScale: 0.5, blockCrush: 1,
  spread: 0, moveSpread: 0, damage: 0, headMult: 1, bounces: 0, bounceKeep: 1,
  kick: 0.06, kickMax: 0.12, kickYaw: 0.01, kickYawMax: 0.04, recover: 6,
  shake: 0.5, fov: 1.4, vmBack: 0.16, vmPitch: 0.22, vmRecover: 8,
  tracer: { colour: 0xff7a1a, ricochet: 0xffd36b, width: 0.05, life: 0.1 },
  flash: { colour: 0xff8a2a, size: 2.8, life: 0.09, light: 10 },
};

// Knife. Every loadout carries one. A stab only injures: damage is below half of full health, so it takes several
// to kill (three at 34). It reaches `range` metres along the crosshair, never goes through walls or blocks, never
// headshots, and hits teammates like any other weapon while friendly fire is on.
WEAPONS.knife = {
  name: 'Block Knife', melee: true, noReload: true, mag: Infinity, reload: 0, interval: 0.45, auto: true, damage: 34, headMult: 1, range: 2.2,
  spread: 0, moveSpread: 0, blockDmg: 0, bounces: 0, bounceKeep: 1,
  kick: 0, kickMax: 0, kickYaw: 0, kickYawMax: 0, recover: 6,
  shake: 0.2, fov: 0, vmBack: 0.12, vmPitch: 0.25, vmRecover: 12,
  tracer: { colour: 0xffffff, ricochet: 0xffffff, width: 0.02, life: 0.05 },
  flash: { colour: 0xffffff, size: 0.1, life: 0.01, light: 0 },
};

// Items that sit on the map and come back after a while. Positions are in pickups.js.
//   health     heals up to 100
//   ammo       refills every magazine at once and adds rockets for anyone who has the launcher
//   rocket     the launcher itself: first pickup gives it plus its starting rockets, later ones add rockets
export const PICKUP = {
  reach: 1.5,          // horizontal metres to touch an item
  rise: 2.2,           // vertical window above the item's floor
  health: { amount: 35, respawn: 20 },
  ammo: { rockets: 4, respawn: 20 },
  rocket: { respawn: 25 },
};

export const weaponName = (_team, key) => WEAPONS[key]?.name ?? key;

// ---- Loadouts --------------------------------------------------------------------------------------------------
// No classes. At the start of a game each player picks one primary and one pistol on the loadout screen, and every
// loadout carries the block knife. Health and speed are the same for everyone.
export const PRIMARIES = ['rifle', 'lmg', 'sniper'];
export const SECONDARIES = ['pistol', 'pistol2'];
export const DEFAULT_LOADOUT = { primary: 'rifle', secondary: 'pistol' };
export const cleanLoadout = l => ({
  primary: PRIMARIES.includes(l?.primary) ? l.primary : DEFAULT_LOADOUT.primary,
  secondary: SECONDARIES.includes(l?.secondary) ? l.secondary : DEFAULT_LOADOUT.secondary,
});

// ---- Teams -----------------------------------------------------------------------------------------------------
// One team per Tetris shape. A fighter is one block colour: their team's.
export const TEAM_PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const PIECE_COLOURS = { I: 0x00e5ff, O: 0xffe600, T: 0xb44dff, S: 0x2ee62e, Z: 0xff2d2d, J: 0x3a63ff, L: 0xff9a1a };
export const COLOUR_NAMES = { I: 'Cyan', O: 'Yellow', T: 'Purple', S: 'Green', Z: 'Red', J: 'Blue', L: 'Orange' };
export const teamLabel = piece => `${COLOUR_NAMES[piece] ?? piece} ${piece}`;
export const pieceHex = piece => '#' + (PIECE_COLOURS[piece] ?? 0x888888).toString(16).padStart(6, '0');

// Gadget definitions. Nothing hands them out now that there are no classes (every actor has gadget = null), but the grenade, mine,
// medkit and binocular code in game.js still works if a mode ever grants one. `n` is the count carried, `cd` the delay between uses.
export const GADGETS = {
  grenade: { name: 'Hand Grenades', n: 3, cd: 0.9, fuse: 2.2, speed: 15, radius: 6, damage: 120, hint: 'Throw' },
  medkit: { name: 'Medic Kit', n: 4, cd: 1.2, heal: 55, range: 2.6, hint: 'Heal' },
  mine: { name: 'Mines', n: 3, cd: 0.8, radius: 3.6, damage: 130, trigger: 1.3, arm: 1.2, hint: 'Lay mine' },
  binoculars: { name: 'Binoculars', n: Infinity, cd: 9, range: 110, cone: 0.35, time: 7, hint: 'Spot' },
};

export const ROUND = {
  freeze: 4, time: 115, post: 5,
  bombFuse: 40, plantTime: 3.2, defuseTime: 7, defuseRange: 2.2,
  blastRadius: 26, blastDamage: 220,
  winScore: 8,
};

// Closing walls. Four slabs slide in from the edges and meet in the middle, squashing anyone still alive.
// Times are seconds after the round goes live, so with ROUND.time at 115 everything is over before the clock.
//   start   when the walls begin to move
//   end     when they meet
//   gap     width left between them at the end, in metres (narrower than a player, so nobody fits)
//   lead    blocks do not land this close to a slab, in metres, since the slab keeps coming
export const CLOSE = { start: 40, end: 100, gap: 0.5, lead: 6 };

export const PIECE = {
  firstDelay: 1,      // seconds after freeze ends
  interval: 5,        // seconds between pieces at round start
  minInterval: 3.4,
  ramp: 0.97,         // interval multiplier per piece
  dropHeight: 54,     // metres above the landing spot at spawn
  fallSpeed: 12,      // m/s, so a block takes about 4.5s to land
  fastSpeed: 42,      // m/s after a hard drop
  lockHeight: 4.5,    // blocks cannot be steered once this close to landing
  dangerHeight: 42,   // bots and the warning react below this height
  directorAt: 44,     // the AI director steers an unattended block once, here
  clearBlastRadius: 5,
  clearBlastDamage: 35,
};

export const SKILL = {
  easy: { reaction: 0.6, aimError: 0.1, turn: 3.5 },
  normal: { reaction: 0.42, aimError: 0.075, turn: 5 },
  hard: { reaction: 0.22, aimError: 0.03, turn: 8 },
};

export const TEAM = { ATT: 'attackers', DEF: 'defenders' };

// Elevator floor sections. Each rests flush with the floor, rises, holds, then lowers.
export const LIFT = {
  rise: 4.5,     // metres above the floor at the top of the ride
  travel: 2.2,   // seconds to rise or lower
  down: 5,       // seconds resting at floor level
  up: 4,         // seconds held at the top
  // Pistons run from the bedrock under the arena up through a hole in the floor. They sink out of sight, leaving an
  // open shaft, then rise through the floor again. They are also the way back up for anyone who falls into a hole.
  deep: { travel: 5, down: 8, up: 3 },
};
