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

export const BULLET_RANGE = 200;   // total metres a round can travel, bounces included
export const BLOCK_HP = 120;       // damage a settled block takes before it is destroyed, from bullets and rockets alike

// Two guns, two jobs. The rifle is a fast climbing spray that pings once off a wall.
// The pistol is a slow hand cannon: heavy kick, one-tap headshots, and it skips off two walls.
//   kick / kickYaw   view punch per shot in radians; kickMax / kickYawMax cap the build-up
//   recover          how fast the punch settles per second
//   bounces          walls a round can glance off; bounceKeep is the damage kept after each
//   blockDmg         damage each hit does to a settled block (BLOCK_HP to break it), scaled by bounceKeep on a ricochet
//   shake / fov      camera shudder and FOV punch for the shooter; vm* drive the gun model
//   tracer / flash   colours and sizes of the visible round and muzzle flash
export const WEAPONS = {
  rifle: {
    name: 'Rifle', mag: 30, reload: 2.4, interval: 0.09, damage: 28, headMult: 3.6, spread: 0.002, moveSpread: 0.035, auto: true, blockDmg: 5,
    kick: 0.017, kickMax: 0.16, kickYaw: 0.006, kickYawMax: 0.05, recover: 4.2,
    bounces: 1, bounceKeep: 0.55,
    shake: 0.1, fov: 0.5, vmBack: 0.085, vmPitch: 0.1, vmRecover: 16,
    tracer: { colour: 0xffb347, ricochet: 0xfff2b0, width: 0.026, life: 0.07 },
    flash: { colour: 0xffa63d, size: 1.5, life: 0.05, light: 5 },
  },
  pistol: {
    name: 'Pistol', mag: 8, reload: 1.7, interval: 0.28, damage: 46, headMult: 2.6, spread: 0.0015, moveSpread: 0.02, auto: false, blockDmg: 14,
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

// ---- Classes (Battlefield 1942 kits) -------------------------------------------------------------------------
// More guns in the same schema as the rifle and pistol above. Weapon stats are shared by both sides, as in
// Battlefield 1942; WEAPON_NAMES gives each side its own models. `slow` scales walking speed, `scope` is the
// zoom factor while scoped.
const fx = (colour, size, light = 6) => ({ colour, size, life: 0.06, light });
const tr = (colour, width, life = 0.08) => ({ colour, ricochet: 0xfff2b0, width, life });
Object.assign(WEAPONS, {
  smg: {
    name: 'SMG', mag: 32, reload: 2.2, interval: 0.075, damage: 17, headMult: 3, spread: 0.006, moveSpread: 0.03, auto: true, blockDmg: 3,
    kick: 0.007, kickMax: 0.1, kickYaw: 0.005, kickYawMax: 0.04, recover: 5, bounces: 1, bounceKeep: 0.5,
    shake: 0.08, fov: 0.35, vmBack: 0.06, vmPitch: 0.08, vmRecover: 18, tracer: tr(0xffc65a, 0.022, 0.06), flash: fx(0xffb347, 1.2, 4),
  },
  lmg: {
    name: 'LMG', mag: 60, reload: 4.2, interval: 0.1, damage: 22, headMult: 2.8, spread: 0.005, moveSpread: 0.06, auto: true, blockDmg: 6, slow: 0.88,
    kick: 0.008, kickMax: 0.13, kickYaw: 0.006, kickYawMax: 0.05, recover: 3.5, bounces: 1, bounceKeep: 0.55,
    shake: 0.14, fov: 0.6, vmBack: 0.09, vmPitch: 0.1, vmRecover: 14, tracer: tr(0xffa63d, 0.03, 0.08), flash: fx(0xff9a2a, 1.8, 6),
  },
  bolt: {
    name: 'Bolt Rifle', mag: 8, reload: 2.6, interval: 0.55, damage: 62, headMult: 2.4, spread: 0.0012, moveSpread: 0.03, auto: false, blockDmg: 12,
    kick: 0.04, kickMax: 0.09, kickYaw: 0.008, kickYawMax: 0.03, recover: 6, bounces: 1, bounceKeep: 0.6,
    shake: 0.35, fov: 1.2, vmBack: 0.13, vmPitch: 0.22, vmRecover: 10, tracer: tr(0xffe08a, 0.035, 0.09), flash: fx(0xffd27a, 2.0, 7),
  },
  sniper: {
    name: 'Sniper Rifle', mag: 5, reload: 3.4, interval: 1.3, damage: 78, headMult: 2.6, spread: 0.0006, moveSpread: 0.09, auto: false, blockDmg: 20, scope: 3.2, slow: 0.9,
    kick: 0.05, kickMax: 0.08, kickYaw: 0.008, kickYawMax: 0.03, recover: 4, bounces: 0, bounceKeep: 1,
    shake: 0.5, fov: 1.5, vmBack: 0.16, vmPitch: 0.3, vmRecover: 8, tracer: tr(0xffffff, 0.04, 0.14), flash: fx(0xfff0c0, 2.4, 9),
  },
});

export const WEAPON_NAMES = {
  attackers: { pistol: 'Luger P08', smg: 'MP 40', lmg: 'MG 34', rifle: 'StG 44', bolt: 'Kar 98k', sniper: 'Kar 98k Scoped', rocket: 'Panzerschreck' },
  defenders: { pistol: 'Colt M1911', smg: 'Thompson', lmg: 'BAR M1918', rifle: 'M1 Carbine', bolt: 'M1 Garand', sniper: 'M1903 Springfield', rocket: 'Bazooka' },
};
export const weaponName = (team, key) => WEAPON_NAMES[team]?.[key] ?? WEAPONS[key]?.name ?? key;

// Gadgets come from the kit. `n` is the count carried each round, `cd` the delay between uses.
export const GADGETS = {
  grenade: { name: 'Hand Grenades', n: 3, cd: 0.9, fuse: 2.2, speed: 15, radius: 6, damage: 120, hint: 'Throw' },
  medkit: { name: 'Medic Kit', n: 4, cd: 1.2, heal: 55, range: 2.6, hint: 'Heal' },
  mine: { name: 'Mines', n: 3, cd: 0.8, radius: 3.6, damage: 130, trigger: 1.3, arm: 1.2, hint: 'Lay mine' },
  binoculars: { name: 'Binoculars', n: Infinity, cd: 9, range: 110, cone: 0.35, time: 7, hint: 'Spot' },
};

// The five kits. Everyone shares health and speed; the kit is the difference. `rifleman` is the classic
// rifle-and-pistol loadout, used when a game is made without classes. `rockets` is the starting launcher ammo.
export const CLASS_ORDER = ['assault', 'scout', 'medic', 'engineer', 'antitank'];
export const CLASSES = {
  assault: { name: 'Assault', primary: 'smg', secondary: 'pistol', gadget: 'grenade', plant: 1, defuse: 1, blurb: 'Close-quarters SMG and hand grenades.' },
  scout: { name: 'Scout', primary: 'sniper', secondary: 'pistol', gadget: 'binoculars', plant: 1, defuse: 1, blurb: 'Scoped bolt-action rifle and binoculars that mark enemies.' },
  medic: { name: 'Medic', primary: 'lmg', secondary: 'pistol', gadget: 'medkit', plant: 1, defuse: 1, blurb: 'Light machine gun and a kit that heals teammates.' },
  engineer: { name: 'Engineer', primary: 'bolt', secondary: 'pistol', gadget: 'mine', plant: 0.6, defuse: 0.55, blurb: 'Bolt-action rifle, mines, and the wrench: plants and defuses far faster.' },
  antitank: { name: 'Anti-Tank', primary: 'rocket', secondary: 'pistol', gadget: null, rockets: 8, plant: 1, defuse: 1, blurb: 'Rocket launcher: splash damage, rocket jumps, and it breaks blocks. Pick up more rockets.' },
  rifleman: { name: 'Rifleman', primary: 'rifle', secondary: 'pistol', gadget: null, plant: 1, defuse: 1, blurb: 'Classic rifle and pistol.' },
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
