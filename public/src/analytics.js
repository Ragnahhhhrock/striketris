// Google Analytics 4 events. The gtag snippet lives in index.html; this wrapper never throws and does nothing when
// the tag is missing or blocked (ad blockers, tests, file://), so game code can call track() freely.
// Only gameplay settings and outcomes are sent. No names, no free text.

export function track(name, params = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    window.gtag('event', name, params);
  } catch { /* analytics must never break the game */ }
}

// Events (all snake_case):
//   loadout_confirm  team_shape, primary, secondary, side
//   game_start       game_mode, side, team_shape, primary, secondary, team_size, bot_skill, block_rate, input, restart
//   block_steer      game_mode          first time the player steers a falling block in a match (terminal/spectate use)
//   line_clear       lines              rows cleared by one landing
//   player_death     cause, round       cause: bullet weapon id, piece, void, fall, blast, lift, line, wall
//   round_end        round, won, reason, score_for, score_against
//   match_end        won, rounds, duration_s, score_for, score_against, game_mode
//   match_abandon    round, duration_s  tab closed or navigated away mid-match
//   pause            round
