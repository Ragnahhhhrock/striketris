// Who a fighter is: which team (one per Tetris shape) and so which single block colour they are.
// Pure data with no rendering dependency, so tests can check it.
//
// Every fighter is the same blocky figure: a Minecraft-style head, torso, arms and legs, all in one Tetris colour.
// Only the face (eyes, mouth) is a different colour.
import { PIECE_COLOURS, TEAM_PIECES, teamLabel } from './config.js';

export { PIECE_COLOURS };
export const PIECES = TEAM_PIECES;

// Face colours. The face is the only part of a fighter that is not the team colour.
export const FACE = { eyeWhite: 0xf4f4f4, iris: 0x2a1a10, pupil: 0x0d0d0d, mouth: 0x1d1d22 };

export function lookFor(actor) {
  const piece = PIECE_COLOURS[actor.piece] != null ? actor.piece : 'T';
  return { piece, colour: PIECE_COLOURS[piece], eyes: FACE.iris };
}

// Short readable summary for tests and the character viewer.
export const describeLook = look => teamLabel(look.piece) + ' team';
