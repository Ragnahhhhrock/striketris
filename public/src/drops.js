// Weapons dropped by the dead. Walking up and pressing Use swaps your primary for the dropped one,
// and your old primary (with the ammo left in it) is left on the ground in its place.
export const DROP_REACH = 1.7;

export function makeDrops() { return []; }

// Leaves `weapon` with `ammo` rounds where `pos` is.
export function addDrop(game, weapon, ammo, pos) {
  const d = { id: game.nextDrop = (game.nextDrop ?? 0) + 1, weapon, ammo, x: pos.x, y: pos.y, z: pos.z };
  game.drops.push(d);
  game.emit('drop', { drop: d });
  return d;
}

// A dead actor drops its primary weapon.
export function dropPrimary(game, a) {
  const id = a.loadout[0];
  if (a.weapons[id] === undefined) return;
  addDrop(game, id, a.weapons[id], a.pos);
}

export function nearestDrop(game, a) {
  let best = null, bestD = DROP_REACH;
  for (const d of game.drops) {
    if (Math.abs(a.pos.y - d.y) > 1.5) continue;
    const dist = Math.hypot(a.pos.x - d.x, a.pos.z - d.z);
    if (dist < bestD) { best = d; bestD = dist; }
  }
  return best;
}

// Swaps the actor's primary for the dropped weapon. The old primary drops at their feet at once.
export function swapForDrop(game, a, d) {
  const old = a.loadout[0], oldAmmo = a.weapons[old];
  game.drops.splice(game.drops.indexOf(d), 1);
  delete a.weapons[old];
  a.loadout = [d.weapon, ...a.loadout.slice(1)];
  const rk = d.weapon === 'rocket';
  a.weapons[d.weapon] = rk && a.weapons.rocket ? a.weapons.rocket + d.ammo : d.ammo;
  a.cur = d.weapon; a.reloadT = 0; a.fireCd = 0.4; a.shotStreak = 0; a.scoped = false;
  if (oldAmmo !== undefined) addDrop(game, old, oldAmmo, a.pos);
  game.emit('weaponPickup', { actor: a, weapon: d.weapon, dropped: old });
}

// Press Use next to a dropped weapon to swap. Edge triggered, so holding Use to plant or defuse never swaps by accident.
export function stepDropPickup(game, a) {
  const press = a.input.use && !a.lastUse;
  a.lastUse = a.input.use;
  if (!press || game.useBusy(a)) return;
  const d = nearestDrop(game, a);
  if (d) swapForDrop(game, a, d);
}
