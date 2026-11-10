import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { TEAM, WEAPONS, PRIMARIES, SECONDARIES, TEAM_PIECES, DEFAULT_LOADOUT, cleanLoadout } from '../public/src/config.js';

const make = (opts = {}) => new Game({ seed: 5, teamSize: 3, pieces: false, items: false, ...opts });

test('there are three primaries, two pistols and a knife, and every gun is automatic', () => {
  assert.deepEqual(PRIMARIES, ['rifle', 'lmg', 'sniper']);
  assert.equal(SECONDARIES.length, 2);
  for (const id of [...PRIMARIES, ...SECONDARIES]) assert.equal(WEAPONS[id].auto, true, `${id} is automatic`);
  assert.equal(WEAPONS.knife.melee, true);
});

test('the three primaries have the roles they were designed for', () => {
  const { rifle, lmg, sniper } = WEAPONS;
  // Assault rifle: the balance. Better range than the machine gun, faster than the sniper.
  assert.ok(rifle.range > lmg.range && sniper.range > rifle.range);
  assert.ok(rifle.interval < sniper.interval);
  // Machine gun: biggest magazine, full auto, but less range and impact than the rifle and the sniper.
  assert.ok(lmg.mag > rifle.mag && lmg.mag > sniper.mag);
  assert.ok(lmg.damage < rifle.damage && lmg.damage < sniper.damage);
  assert.ok(lmg.interval <= rifle.interval, 'machine gun fires at least as fast');
  // Sniper: slow reload, small magazine, scope zoom, high damage.
  assert.ok(sniper.reload > rifle.reload && sniper.reload > lmg.reload - 1.5);
  assert.ok(sniper.mag < rifle.mag && sniper.mag < lmg.mag);
  assert.ok(sniper.scope > 1 && !rifle.scope && !lmg.scope);
  assert.ok(sniper.damage > 2.5 * rifle.damage);
});

test('a round stops at its weapon range', () => {
  for (const id of ['lmg', 'rifle', 'sniper', 'pistol2']) {
    const g = make({ human: true, humanLoadout: { primary: id === 'pistol2' ? 'rifle' : id, secondary: 'pistol2' } });
    while (g.state === 'freeze') g.step();
    const h = g.human;
    for (const a of g.actors) if (a !== h) a.pos = { x: 1, y: 40, z: 1 };   // out of the way
    h.pos = { x: 48, y: 0, z: 86 }; h.yaw = 0; h.pitch = 0.4; g.drainEvents();
    g.fire(h, WEAPONS[id]);
    const shot = g.drainEvents().find(e => e.type === 'shot');
    let len = 0;
    for (let i = 1; i < shot.path.length; i++) len += Math.hypot(shot.path[i].x - shot.path[i - 1].x, shot.path[i].y - shot.path[i - 1].y, shot.path[i].z - shot.path[i - 1].z);
    assert.ok(len <= WEAPONS[id].range + 0.5, `${id} travelled ${len.toFixed(1)} m of ${WEAPONS[id].range}`);
    if (id === 'lmg') assert.ok(len > WEAPONS.lmg.range - 1, `the machine gun round goes its full range into open air: ${len.toFixed(1)}`);
  }
});

test('the human spawns with the picked loadout and a knife, in every combination', () => {
  for (const primary of PRIMARIES) for (const secondary of SECONDARIES) {
    const g = make({ human: true, humanLoadout: { primary, secondary } });
    const h = g.human;
    assert.deepEqual(h.loadout, [primary, secondary]);
    assert.equal(h.cur, primary);
    assert.equal(h.weapons[primary], WEAPONS[primary].mag);
    assert.equal(h.weapons[secondary], WEAPONS[secondary].mag);
    assert.equal(h.weapons.knife, Infinity);
  }
});

test('bad loadouts fall back to the default, and there are no classes', () => {
  assert.deepEqual(cleanLoadout({ primary: 'bazooka', secondary: 'smg' }), DEFAULT_LOADOUT);
  assert.deepEqual(cleanLoadout(undefined), DEFAULT_LOADOUT);
  const g = make({ human: true, humanLoadout: { primary: 'smg' } });
  assert.deepEqual(g.human.loadout, [DEFAULT_LOADOUT.primary, DEFAULT_LOADOUT.secondary]);
  assert.ok(g.actors.every(a => !('cls' in a) && a.gadget === null));
});

test('a new loadout takes effect at the next round', () => {
  const g = make({ human: true });
  g.setLoadout(g.human, { primary: 'sniper', secondary: 'pistol2' });
  assert.deepEqual(g.human.loadout, [DEFAULT_LOADOUT.primary, DEFAULT_LOADOUT.secondary]);
  g.startRound();
  assert.deepEqual(g.human.loadout, ['sniper', 'pistol2']);
});

test('bots carry a mix of primaries and pistols', () => {
  const g = make({ human: true, teamSize: 5 });
  for (const team of [TEAM.ATT, TEAM.DEF]) {
    const side = g.actors.filter(a => a.team === team);
    assert.ok(new Set(side.map(a => a.loadout[0])).size >= 3, `${team} has all three primaries`);
    assert.ok(new Set(side.map(a => a.loadout[1])).size === 2, `${team} has both pistols`);
  }
});

test('each side is one Tetris team, and the two sides are different teams', () => {
  for (const piece of TEAM_PIECES) {
    const g = make({ human: true, humanPiece: piece });
    assert.equal(g.human.piece, piece);
    assert.ok(g.actors.filter(a => a.team === TEAM.ATT).every(a => a.piece === piece), 'the human team shares one piece');
    const rival = new Set(g.actors.filter(a => a.team === TEAM.DEF).map(a => a.piece));
    assert.equal(rival.size, 1);
    assert.ok(!rival.has(piece) && TEAM_PIECES.includes([...rival][0]), 'a different, real team');
  }
  const d = make({ human: true, humanTeam: TEAM.DEF, humanPiece: 'J', rivalPiece: 'L' });
  assert.deepEqual(d.teamPiece, { attackers: 'L', defenders: 'J' });
  const spectate = make({ human: false });
  assert.notEqual(spectate.teamPiece.attackers, spectate.teamPiece.defenders);
});

test('a full bot match still finishes with the new loadouts', () => {
  const g = make({ human: false, teamSize: 3, seed: 11 });
  for (let i = 0; i < 60 * 60 * 40 && !g.matchOver; i++) g.step();
  assert.ok(g.matchOver, 'the match ended');
  assert.ok(g.actors.some(a => a.kills > 0));
});
