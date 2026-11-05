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

export const WEAPONS = {
  rifle: { name: 'Rifle', mag: 30, reload: 2.4, interval: 0.1, damage: 33, headMult: 4, spread: 0.002, moveSpread: 0.035, kick: 0.009, kickMax: 0.11, auto: true },
  pistol: { name: 'Pistol', mag: 12, reload: 1.8, interval: 0.17, damage: 26, headMult: 3.8, spread: 0.003, moveSpread: 0.018, kick: 0.016, kickMax: 0.07, auto: false },
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
