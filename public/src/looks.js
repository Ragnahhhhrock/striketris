// Who each fighter is: which Tetris piece their body is, face, eyewear and kit.
// Pure data with no rendering dependency, so tests can check that fighters are told apart.
// Arms and sleeves always take the team colour; the body takes the piece colour.

// Piece colours match SHAPE_TINT in render.js and the block colours in DESIGN.md.
export const PIECE_COLOURS = { I: 0x00e5ff, O: 0xffe600, T: 0xb44dff, S: 0x2ee62e, Z: 0xff2d2d, J: 0x3a63ff, L: 0xff9a1a };
export const PIECES = Object.keys(PIECE_COLOURS);

// Cells as [column, row], row 0 at the bottom. Every piece stands upright and at most two cells wide,
// so the arms can always reach a weapon held in front of the body.
export const PIECE_CELLS = {
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  I: [[0, 0], [0, 1], [0, 2], [0, 3]],
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  S: [[1, 0], [1, 1], [0, 1], [0, 2]],
  Z: [[0, 0], [0, 1], [1, 1], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 0]],
  L: [[0, 0], [0, 1], [0, 2], [1, 0]],
};

export const EYEWEAR = ['sunglasses', 'aviators', 'round', 'eyepatch', 'monocle'];
export const BUILDS = { lean: 0.93, average: 1, stocky: 1.1 };

// Hand-made roster, one per bot name in game.js. Teammates never share a piece, and no team
// wears the piece that matches its own colour (orange attackers skip L, blue defenders skip J).
export const ROSTER = {
  // Attackers
  Ash:   { piece: 'T', build: 'average', eyes: 0x4a7a3a, pants: 0x4b5563, boots: 0x2b2b2b },
  Brick: { piece: 'O', build: 'stocky', eyes: 0x3f6fb5, backpack: 0x45503f, gloves: 0x222222, pants: 0x3b3f35, boots: 0x1f1f1f },
  Cole:  { piece: 'J', build: 'lean', eyes: 0x6b8fb5, eyewear: ['sunglasses', 0x111111], pants: 0x3d4f73, boots: 0x5a3a22 },
  Dune:  { piece: 'I', build: 'lean', eyes: 0x2a1a10, eyewear: ['round', 0xd4af37], pants: 0x6b6256, boots: 0x3a2d22 },
  Echo:  { piece: 'S', build: 'average', eyes: 0x2a1a10, backpack: 0x39424f, pants: 0x20242a, boots: 0xf0f0f0 },
  Flint: { piece: 'Z', build: 'stocky', eyes: 0x6b8fb5, gloves: 0x6b4a2a, pants: 0x55493a, boots: 0x3a2d22 },
  // Defenders
  Grit:  { piece: 'O', build: 'stocky', eyes: 0x2a1a10, gloves: 0x222222, pants: 0x4a5239, boots: 0x1f1f1f },
  Hale:  { piece: 'T', build: 'lean', eyes: 0x4a7a3a, eyewear: ['aviators', 0xd4af37], pants: 0x7a6d52, boots: 0x6b5a3e },
  Ivo:   { piece: 'Z', build: 'average', eyes: 0x6b8fb5, eyewear: ['monocle', 0xd4af37], pants: 0x2a2a30, boots: 0x111111 },
  Jett:  { piece: 'I', build: 'lean', eyes: 0x2a1a10, eyewear: ['aviators', 0xd4af37], pants: 0x1f2a44, boots: 0x111111 },
  Knox:  { piece: 'L', build: 'stocky', eyes: 0x2a1a10, backpack: 0xd9772b, gloves: 0xf5c518, pants: 0x3b4252, boots: 0x3a2d22 },
  Lark:  { piece: 'S', build: 'average', eyes: 0x6b8fb5, eyewear: ['eyepatch', 0x111111], pants: 0x5a4a3a, boots: 0x2b2b2b },
  // The human player: the classic T piece, so you read as the odd one out in a kill cam.
  You:   { piece: 'T', build: 'average', eyes: 0x4a7a3a, gloves: 0x2b2b2b, pants: 0x3f4654, boots: 0x222222 },
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
const PANTS = [0x3b3f35, 0x4b5563, 0x3d4f73, 0x55493a, 0x20242a, 0x4a5239];

// Fighters with no hand-made entry (extra team sizes, future modes) get a stable random one.
export function generateLook(seed) {
  const rng = mulberry32(seed * 7919 + 17);
  return {
    piece: pick(rng, PIECES),
    build: pick(rng, Object.keys(BUILDS)),
    eyewear: rng() < 0.25 ? [pick(rng, EYEWEAR), 0x1a1a1a] : null,
    eyes: pick(rng, [0x2a1a10, 0x4a7a3a, 0x6b8fb5]),
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
  const bits = [`${look.piece} piece`];
  if (look.eyewear) bits.push(look.eyewear[0]);
  if (look.backpack != null) bits.push('backpack');
  if (look.gloves != null) bits.push('gloves');
  return bits.join(', ');
}

// What the eye picks out first at range: the shape of the body, then the build.
export const silhouette = look => [look.piece, look.build].join('/');
