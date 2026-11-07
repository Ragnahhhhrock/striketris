// Who each fighter is: skin, hair, facial hair, headwear, eyewear and kit.
// Pure data with no rendering dependency, so tests can check that fighters are told apart.
// Shirts and sleeves always take the team colour; everything else belongs to the character.

export const SKIN = [0xf3d0b0, 0xe3b48c, 0xc78d62, 0x9d6b45, 0x6f4529, 0x472b1c];

export const HAIR = {
  black: 0x1a1412, brown: 0x4a2e1b, auburn: 0x7b3a1c, ginger: 0xb9531c,
  blonde: 0xe2c06a, grey: 0x9a9a9c, white: 0xeeeeee, blue: 0x2f6bff, pink: 0xff5fa8,
};

// 'team' as a colour means the wearer's team colour, 'teamDark' a darker shade of it.
export const HAT_STYLES = ['cap', 'capBack', 'beanie', 'cowboy', 'hardhat', 'helmet', 'bucket', 'tophat', 'headband', 'flatcap', 'headphones'];
export const HAIR_STYLES = ['bald', 'buzz', 'short', 'quiff', 'mohawk', 'long', 'ponytail', 'afro'];
export const MOUSTACHES = ['classic', 'handlebar', 'pencil', 'walrus'];
export const BEARDS = ['stubble', 'goatee', 'full', 'chinstrap', 'chops', 'soulpatch'];
export const EYEWEAR = ['sunglasses', 'aviators', 'round', 'eyepatch', 'monocle'];
export const BUILDS = { lean: 0.93, average: 1, stocky: 1.1 };

// Hand-made roster, one per bot name in game.js. Each has a different hat or hair
// silhouette from its teammates so you can read who is who at range.
export const ROSTER = {
  // Attackers
  Ash:   { skin: 1, build: 'average', hair: ['short', 'brown'], moustache: null, beard: ['stubble', 'brown'], hat: ['cap', 0xf2f2f2], eyes: 0x4a7a3a, pants: 0x4b5563, boots: 0x2b2b2b },
  Brick: { skin: 0, build: 'stocky', hair: ['bald', 'ginger'], moustache: null, beard: ['full', 'ginger'], hat: null, eyes: 0x3f6fb5, vest: 0x45503f, sleeves: 'long', gloves: 0x222222, pants: 0x3b3f35, boots: 0x1f1f1f },
  Cole:  { skin: 2, build: 'lean', hair: ['short', 'blonde'], moustache: ['handlebar', 'blonde'], beard: null, hat: ['cowboy', 0xa77b4a], eyes: 0x6b8fb5, scarf: 0xb3342e, sleeves: 'long', pants: 0x3d4f73, boots: 0x5a3a22 },
  Dune:  { skin: 4, build: 'lean', hair: ['afro', 'black'], moustache: null, beard: ['chinstrap', 'black'], hat: null, eyewear: ['round', 0xd4af37], eyes: 0x2a1a10, pants: 0x6b6256, boots: 0x3a2d22 },
  Echo:  { skin: 3, build: 'average', hair: ['long', 'pink'], moustache: null, beard: null, hat: ['headphones', 0x1c1c1c], eyes: 0x2a1a10, backpack: 0x39424f, sleeves: 'short', pants: 0x20242a, boots: 0xf0f0f0 },
  Flint: { skin: 0, build: 'stocky', hair: ['buzz', 'grey'], moustache: ['walrus', 'grey'], beard: null, hat: ['beanie', 0x2b2f3a], eyes: 0x6b8fb5, sleeves: 'short', gloves: 0x6b4a2a, pants: 0x55493a, boots: 0x3a2d22 },
  // Defenders
  Grit:  { skin: 2, build: 'stocky', hair: ['buzz', 'black'], moustache: ['handlebar', 'black'], beard: null, hat: ['helmet', 0x55603f], eyes: 0x2a1a10, vest: 0x39422f, sleeves: 'long', gloves: 0x222222, pants: 0x4a5239, boots: 0x1f1f1f },
  Hale:  { skin: 1, build: 'lean', hair: ['short', 'auburn'], moustache: null, beard: ['soulpatch', 'auburn'], hat: ['bucket', 0xb8a47a], eyewear: ['sunglasses', 0x111111], eyes: 0x4a7a3a, sleeves: 'short', pants: 0x7a6d52, boots: 0x6b5a3e },
  Ivo:   { skin: 0, build: 'average', hair: ['short', 'white'], moustache: ['pencil', 'white'], beard: null, hat: ['tophat', 0x17171c], eyewear: ['monocle', 0xd4af37], eyes: 0x6b8fb5, scarf: 0xe8e8e8, sleeves: 'long', pants: 0x2a2a30, boots: 0x111111 },
  Jett:  { skin: 3, build: 'lean', hair: ['quiff', 'black'], moustache: null, beard: ['chops', 'black'], hat: null, eyewear: ['aviators', 0xd4af37], eyes: 0x2a1a10, sleeves: 'short', pants: 0x1f2a44, boots: 0x111111 },
  Knox:  { skin: 5, build: 'stocky', hair: ['bald', 'black'], moustache: null, beard: ['full', 'black'], hat: ['hardhat', 0xf5c518], eyes: 0x2a1a10, vest: 0xd9772b, sleeves: 'long', gloves: 0xf5c518, pants: 0x3b4252, boots: 0x3a2d22 },
  Lark:  { skin: 1, build: 'average', hair: ['ponytail', 'blonde'], moustache: ['classic', 'blonde'], beard: ['stubble', 'blonde'], hat: ['headband', 0xc23b32], eyewear: ['eyepatch', 0x111111], eyes: 0x6b8fb5, sleeves: 'short', pants: 0x5a4a3a, boots: 0x2b2b2b },
  // The human player: clean cut, team-colour cap, so you read as friendly in a kill cam.
  You:   { skin: 2, build: 'average', hair: ['short', 'brown'], moustache: null, beard: null, hat: ['cap', 'team'], eyes: 0x4a7a3a, gloves: 0x2b2b2b, pants: 0x3f4654, boots: 0x222222 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const hairKeys = Object.keys(HAIR);
const HAT_COLOURS = [0x2b2f3a, 0x55603f, 0xb8a47a, 0xc23b32, 0xf2f2f2, 0x1c1c1c, 'team'];
const PANTS = [0x3b3f35, 0x4b5563, 0x3d4f73, 0x55493a, 0x20242a, 0x4a5239];

// Fighters with no hand-made entry (extra team sizes, future modes) get a stable random one.
export function generateLook(seed) {
  const rng = mulberry32(seed * 7919 + 17);
  const hairColour = pick(rng, hairKeys);
  return {
    skin: Math.floor(rng() * SKIN.length),
    build: pick(rng, Object.keys(BUILDS)),
    hair: [pick(rng, HAIR_STYLES), hairColour],
    moustache: rng() < 0.3 ? [pick(rng, MOUSTACHES), hairColour] : null,
    beard: rng() < 0.3 ? [pick(rng, BEARDS), hairColour] : null,
    hat: rng() < 0.6 ? [pick(rng, HAT_STYLES), pick(rng, HAT_COLOURS)] : null,
    eyewear: rng() < 0.25 ? [pick(rng, EYEWEAR), 0x1a1a1a] : null,
    eyes: pick(rng, [0x2a1a10, 0x4a7a3a, 0x6b8fb5]),
    sleeves: rng() < 0.5 ? 'long' : 'short',
    vest: rng() < 0.3 ? 0x45503f : null,
    backpack: rng() < 0.2 ? 0x39424f : null,
    gloves: rng() < 0.3 ? 0x222222 : null,
    pants: pick(rng, PANTS),
    boots: 0x2b2b2b,
  };
}

export function lookFor(actor) {
  return ROSTER[actor.lookName ?? actor.name] ?? generateLook(actor.id);
}

// Every hand-made fighter can be picked by the player. 'You' is the plain default recruit.
export const PLAYABLE = Object.keys(ROSTER);
export const displayName = n => (n === 'You' ? 'Rookie' : n);

// Short readable summary for tests and the character viewer.
export function describeLook(look) {
  const bits = [];
  if (look.hat) bits.push(look.hat[0]);
  if (look.hair[0] !== 'bald') bits.push(`${look.hair[1]} ${look.hair[0]} hair`); else bits.push('bald');
  if (look.moustache) bits.push(`${look.moustache[0]} moustache`);
  if (look.beard) bits.push(`${look.beard[0]} beard`);
  if (look.eyewear) bits.push(look.eyewear[0]);
  if (look.vest) bits.push('vest');
  if (look.backpack) bits.push('backpack');
  return bits.join(', ');
}

// What the eye picks out first at range: hat shape, hair shape, build.
export const silhouette = look => [look.hat?.[0] ?? 'nohat', look.hair[0], look.build].join('/');
