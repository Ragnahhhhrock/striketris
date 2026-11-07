// All tunables live here so the grey box can be balanced without touching logic.
export const CELL = 3;            // metres per voxel: one tetromino cube
export const GRID_W = 32;         // cells on X
export const GRID_D = 32;         // cells on Z
export const GRID_H = 16;         // cells on Y
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
  fallSafeSpeed: 16, fallDamagePerSpeed: 6,
};

export const BULLET_RANGE = 200;   // total metres a round can travel, bounces included

// Two guns, two jobs. The rifle is a fast climbing spray that pings once off a wall.
// The pistol is a slow hand cannon: heavy kick, one-tap headshots, and it skips off two walls.
//   kick / kickYaw   view punch per shot in radians; kickMax / kickYawMax cap the build-up
//   recover          how fast the punch settles per second
//   bounces          walls a round can glance off; bounceKeep is the damage kept after each
//   shake / fov      camera shudder and FOV punch for the shooter; vm* drive the gun model
//   tracer / flash   colours and sizes of the visible round and muzzle flash
export const WEAPONS = {
  rifle: {
    name: 'Rifle', mag: 30, reload: 2.4, interval: 0.09, damage: 28, headMult: 3.6, spread: 0.002, moveSpread: 0.035, auto: true,
    kick: 0.017, kickMax: 0.16, kickYaw: 0.006, kickYawMax: 0.05, recover: 4.2,
    bounces: 1, bounceKeep: 0.55,
    shake: 0.1, fov: 0.5, vmBack: 0.085, vmPitch: 0.1, vmRecover: 16,
    tracer: { colour: 0xffb347, ricochet: 0xfff2b0, width: 0.026, life: 0.07 },
    flash: { colour: 0xffa63d, size: 1.5, life: 0.05, light: 5 },
  },
  pistol: {
    name: 'Pistol', mag: 8, reload: 1.7, interval: 0.28, damage: 46, headMult: 2.6, spread: 0.0015, moveSpread: 0.02, auto: false,
    kick: 0.05, kickMax: 0.14, kickYaw: 0.01, kickYawMax: 0.04, recover: 7,
    bounces: 2, bounceKeep: 0.7,
    shake: 0.5, fov: 1.8, vmBack: 0.15, vmPitch: 0.28, vmRecover: 10,
    tracer: { colour: 0x7fe9ff, ricochet: 0xffffff, width: 0.045, life: 0.11 },
    flash: { colour: 0x9fe8ff, size: 2.4, life: 0.07, light: 9 },
  },
};

// Rocket launcher, borrowed from Quake 3. It sits on the map as a pickup (nobody spawns with it), uses its
// own rocket pool instead of a magazine, and its blast shoves players around, so rocket jumps work.
//   speed      rocket flight speed in m/s
//   direct     extra damage to whoever the rocket hits head on, on top of the blast
//   splash     blast damage at the centre, falling off to nothing at radius metres
//   knock      blast shove in m/s at the centre; selfScale cuts the damage you do to yourself
//   blockHp    damage a settled block takes before it is destroyed. Blast damage to blocks uses the same
//              falloff as players, so a rocket at a wall breaks the cubes it touches and cracks the ones around them
//   max        most rockets you can carry; start is what the launcher pickup gives you
WEAPONS.rocket = {
  name: 'Rocket Launcher', mag: 12, max: 12, start: 5, noReload: true, reload: 0, interval: 0.8, auto: true,
  speed: 24, life: 6, direct: 30, splash: 100, radius: 5, knock: 12, selfScale: 0.5, blockHp: 120,
  spread: 0, moveSpread: 0, damage: 0, headMult: 1, bounces: 0, bounceKeep: 1,
  kick: 0.06, kickMax: 0.12, kickYaw: 0.01, kickYawMax: 0.04, recover: 6,
  shake: 0.5, fov: 1.4, vmBack: 0.16, vmPitch: 0.22, vmRecover: 8,
  tracer: { colour: 0xff7a1a, ricochet: 0xffd36b, width: 0.05, life: 0.1 },
  flash: { colour: 0xff8a2a, size: 2.8, life: 0.09, light: 10 },
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

export const ROUND = {
  freeze: 4, time: 115, post: 5,
  bombFuse: 40, plantTime: 3.2, defuseTime: 7, defuseRange: 2.2,
  blastRadius: 26, blastDamage: 220,
  winScore: 8,
};

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
};
