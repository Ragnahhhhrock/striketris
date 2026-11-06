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

// Weapon stats are shared by both factions (as in Battlefield 1942, where the national
// variants are statistically identical); WEAPON_NAMES gives each side its own models.
export const WEAPONS = {
  pistol: { name: 'Pistol', mag: 8, reload: 1.6, interval: 0.2, damage: 24, headMult: 3.5, spread: 0.004, moveSpread: 0.018, kick: 0.016, kickMax: 0.07, auto: false },
  smg: { name: 'SMG', mag: 32, reload: 2.2, interval: 0.075, damage: 17, headMult: 3, spread: 0.006, moveSpread: 0.03, kick: 0.007, kickMax: 0.1, auto: true },
  lmg: { name: 'LMG', mag: 60, reload: 4.2, interval: 0.1, damage: 22, headMult: 2.8, spread: 0.005, moveSpread: 0.06, kick: 0.008, kickMax: 0.13, auto: true, slow: 0.88 },
  rifle: { name: 'Rifle', mag: 8, reload: 2.6, interval: 0.55, damage: 62, headMult: 2.4, spread: 0.0012, moveSpread: 0.03, kick: 0.04, kickMax: 0.09, auto: false },
  sniper: { name: 'Sniper Rifle', mag: 5, reload: 3.4, interval: 1.3, damage: 78, headMult: 2.6, spread: 0.0006, moveSpread: 0.09, kick: 0.05, kickMax: 0.08, auto: false, scope: 3.2, slow: 0.9 },
  launcher: { name: 'Rocket Launcher', mag: 1, reload: 3.6, interval: 0.6, damage: 0, headMult: 1, spread: 0.002, moveSpread: 0.03, kick: 0.05, kickMax: 0.06, auto: false, slow: 0.9,
    proj: { kind: 'rocket', speed: 34, direct: 95, splash: 70, radius: 4.2, life: 4 } },
};

export const WEAPON_NAMES = {
  attackers: { pistol: 'Luger P08', smg: 'MP 40', lmg: 'MG 34', rifle: 'Kar 98k', sniper: 'Kar 98k Scoped', launcher: 'Panzerschreck' },
  defenders: { pistol: 'Colt M1911', smg: 'Thompson', lmg: 'BAR M1918', rifle: 'M1 Garand', sniper: 'M1903 Springfield', launcher: 'Bazooka' },
};
export const weaponName = (team, key) => WEAPON_NAMES[team]?.[key] ?? WEAPONS[key]?.name ?? key;

// Gadgets come from the kit. `n` is the count carried each round, `cd` the delay between uses.
export const GADGETS = {
  grenade: { name: 'Hand Grenades', n: 3, cd: 0.9, fuse: 2.2, speed: 15, radius: 6, damage: 120, hint: 'Throw' },
  medkit: { name: 'Medic Kit', n: 4, cd: 1.2, heal: 55, range: 2.6, hint: 'Heal' },
  mine: { name: 'Mines', n: 3, cd: 0.8, radius: 3.6, damage: 130, trigger: 1.3, arm: 1.2, hint: 'Lay mine' },
  binoculars: { name: 'Binoculars', n: Infinity, cd: 9, range: 110, cone: 0.35, time: 7, hint: 'Spot' },
};

// The five Battlefield 1942 kits. Everyone shares health and speed; the kit is the difference.
export const CLASS_ORDER = ['assault', 'scout', 'medic', 'engineer', 'antitank'];
export const CLASSES = {
  assault: { name: 'Assault', primary: 'smg', secondary: 'pistol', gadget: 'grenade', plant: 1, defuse: 1, blurb: 'Close-quarters SMG and hand grenades.' },
  scout: { name: 'Scout', primary: 'sniper', secondary: 'pistol', gadget: 'binoculars', plant: 1, defuse: 1, blurb: 'Scoped bolt-action rifle and binoculars that mark enemies.' },
  medic: { name: 'Medic', primary: 'lmg', secondary: 'pistol', gadget: 'medkit', plant: 1, defuse: 1, blurb: 'Light machine gun and a kit that heals teammates.' },
  engineer: { name: 'Engineer', primary: 'rifle', secondary: 'pistol', gadget: 'mine', plant: 0.6, defuse: 0.55, blurb: 'Rifle, mines, and the wrench: plants and defuses far faster.' },
  antitank: { name: 'Anti-Tank', primary: 'launcher', secondary: 'pistol', gadget: null, plant: 1, defuse: 1, blurb: 'Rocket launcher with splash damage. Slow to reload.' },
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
