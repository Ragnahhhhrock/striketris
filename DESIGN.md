# StrikeTris design system

Source of truth: `public/design/tokens.css`. Live reference: `/style-guide.html`.

## Direction

StrikeTris is a prototype of a bomb-defusal shooter with falling Tetris blocks. The look comes from that: a dark well, a shifting arena in bright base colours with neon blocks, and seven saturated block colours. UI is plain, square and monospaced, like a debug overlay that grew up.

## Principles

1. **Colour carries meaning.** Each signal colour has one job (below). If a colour is not in the table, it does not go in the UI.
2. **The world and blocks are the rainbow.** The seven tetromino colours appear on blocks, the next-block preview and the brand strip. The arena uses bright base colours (`BASE_COLOURS`) and neon colours (`NEON_COLOURS`) in `public/src/arenaFx.js`. Never on buttons, panels or text.
3. **Square everything.** Radius is 0. Panels are flat translucent slabs.
4. **Legible over a moving scene.** HUD text sits on `--panel` and carries a soft text shadow. Never place text directly on the 3D view.
5. **One loud thing per screen.** The bomb red is the single accent: the main button, the bomb timer, the block warning.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--concrete` | `#c9ced3` | Page background, grey box world |
| `--well-900` | `#14161a` | Opaque panels, share images, theme colour |
| `--well-700` | `#2c2f33` | Inputs |
| `--well-500` | `#3a3e43` | Secondary buttons |
| `--ink` | `#f1f2f3` | Text |
| `--bomb` | `#ff4a3d` | Primary action, bomb timer, block warning |
| `--gold` | `#ffd76a` | Selection, freeze timer, your own row, progress |
| `--go` | `#5dff7d` | Health, crosshair |
| `--steer` | `#00e5ff` | Block steering mode bar |
| `--attackers` | `#e8953f` | Attacker team |
| `--defenders` | `#4f9be8` | Defender team |

Blocks: I `#00e5ff`, O `#ffe600`, T `#b44dff`, S `#2ee62e`, Z `#ff2d2d`, J `#3a63ff`, L `#ff9a1a`. These must match `SHAPE_TINT` in `public/src/render.js`.

Contrast: `--ink` on `--panel` and on `--well-900` passes WCAG AA at all sizes. `--bomb` carries white text at 16px bold (large text, AA). Do not put `--gold` or `--go` on `--concrete`.

## Type

One family: the system monospace stack (`--font`). No web fonts, so the menu paints instantly.

| Role | Token | Size | Weight |
| --- | --- | --- | --- |
| Display (title) | `--text-display` | 44px, letter-spacing -1px | 700 |
| Timer | `--text-3xl` | 30px | 700 |
| Banner heading | `--text-2xl` | 26px | 700 |
| Warning | `--text-xl` | 20px | 700 |
| Button | `--text-lg` | 16px | 700 |
| Body, HUD | `--text-md` | 14px | 400 |
| Labels, keys | `--text-sm` | 12px | 400 |
| Captions | `--text-xs` | 11px | 400 |

Body line height `--leading-body` (1.45). Keep copy lines under 80 characters. Sentence case everywhere, no all caps.

## Space and shape

4px base: 4, 8, 12, 16, 24, 32, 48 (`--space-1` to `--space-7`). HUD sits 14px from the screen edge (`--hud-edge`). Menu card has a 6px top bar in `--bomb`. Borders are 1px `--line`.

## Components

- **Primary button.** `--bomb` fill, white 16px bold, 12px 28px padding, hover `--bomb-hover`. One per view.
- **Secondary button.** `--well-500` fill, same shape.
- **Select.** `--well-700` fill, 1px `--line`, 8px padding.
- **Key cap (`kbd`).** `--well-600` fill, 1px `--line`, 1px 5px padding.
- **Panel.** `--panel` fill, 6px 18px padding. Banners and the feed use it.
- **Focus.** 2px white outline, 2px offset, on every interactive control.

## Motion

Motion answers game state in the HUD: hit marker (0.2s), damage vignette (0.4s), block warning pulse. The arena is the one decorative exception: walls and floor tiles rotate, flip and slide in waves, visual only. Respect `prefers-reduced-motion` for the warning pulse and the arena movement.

## Copy

Plain verbs, sentence case. Name actions by what happens: "Play", "Resume", "Plant", "Defuse". The warning says what to do: "Move! Block incoming".

## Share images

`tools/share/share.html` is the source for `public/og-image.png` (1200x630) and `public/twitter-card.png` (1200x600). Rebuild with `npm run share` after changing the title, tagline or tokens. Composition: dark well, seven-colour brand strip, a falling block with its red ghost and beam. Keep important content inside the central 1000x500.
