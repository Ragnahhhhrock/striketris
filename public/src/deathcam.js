import { eyePos } from './actor.js';

// When the player dies the camera leaves their eyes, swings out to the front of the body and circles it slowly while it
// crumples, then main.js hands over to the spectator view. Pure maths on the game state, so tests can run it headless.
export const DEATH_CAM = 2.6;     // seconds before spectating starts
const SWING = 0.45;               // seconds to move from the eyes to the orbit
const ELEVATION = 0.35;           // radians above the body
const ease = u => u * u * (3 - 2 * u);
const turn = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;

// `a` is the dead actor and `t` the seconds since death. The orbit stops short of any wall behind the camera.
export function deathView(grid, a, t) {
  const b = ease(Math.min(1, t / SWING));
  const az = a.yaw + 2.4 + t * 0.25, r0 = 3 + t * 0.5;
  const tx = a.pos.x, ty = a.pos.y + 0.7, tz = a.pos.z;
  const dx = Math.sin(az) * Math.cos(ELEVATION), dy = Math.sin(ELEVATION), dz = Math.cos(az) * Math.cos(ELEVATION);
  const r = Math.max(0.5, Math.min(r0, grid.raycast(tx, ty, tz, dx, dy, dz, r0) - 0.25));
  const eye = eyePos(a);
  return {
    mode: 'death', actor: a,
    x: eye.x + (tx + dx * r - eye.x) * b,
    y: eye.y + (ty + dy * r - eye.y) * b,
    z: eye.z + (tz + dz * r - eye.z) * b,
    yaw: turn(a.yaw, az, b),
    pitch: a.pitch + (-ELEVATION - a.pitch) * b,
  };
}
