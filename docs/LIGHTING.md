# THE NULL ROOMS — Level 0 lighting

Status: **P1 lighting refinement, awaiting in-game visual review.** Numbers below come from the code and from headless
software-rendered test frames; they are not a substitute for looking at it in a real browser on a real GPU.

## How the light works (unchanged architecture)

* **Baked vertex lighting.** `Builder.box()` (in `index.html`) computes one light level `s` per vertex from the ceiling
  panels of the chunk and of neighbouring chunks within 8 m, and multiplies it into the vertex colour (and writes it to the
  `aLight` attribute used by the external-texture shader, so texture colours stay untouched).
* **One hemisphere light** stands in for bounce light. `ambient.intensity` is `LIGHT.hemi` plus the global flicker.
* **No dynamic lights, no camera light.** Fog, VHS grade, textures and materials are not touched by this milestone.

Per vertex: `s = base[kind] + gain * sum_over_panels( k * w^2 / (1 + q/soft) )`, `w = 1 - q/reach^2`, `q` = squared distance
to the panel, then `s = shoulder(s) * dim`.

## What was wrong

The old model clamped `s` hard at 1.2. Panels sit on a 4 m grid and each pool reaches 8 m, so in any lit area the pools sum far
beyond the clamp: **every lit floor, wall and ceiling vertex was exactly 1.2** (checked numerically: 0 % spread across a lit
area). Consequences: lit areas were flat, and a single dead panel only changed the level under it from 1.20 to about 1.02,
a dim panel not at all. Only whole dark rooms showed up, as flat blocks with abrupt edges.

## What changed (all in `index.html`)

| Parameter | Before | Now | Why |
|---|---|---|---|
| clamp | hard `min(s, 1.2)` | `shoulder()`: linear to `knee` 1.05, eases to `max` 1.25 | no plateau; falloff stays smooth and visible |
| `base` wall / floor / ceil | .76 / .70 / .80 | .60 / .60 / .60 | level far from any panel (dead rooms) is darker; lit level is held by the shoulder |
| `gain` (new) | 1 | 1.1 | scales all panel pools without touching generation (`k` in `layout()` is unchanged) |
| lights-out zones `dim` | .42 | .50 | keeps those zones about as dark as before, since base is lower |
| `hemi` | `LIGHT.hemi` 1.9, but `frame()` hard-coded 2.25 | `LIGHT.hemi` 2.25, `frame()` uses it | same runtime value; the constant is now the real knob |

Unchanged on purpose: panel layout and `k`, pool shape (`reach` 8, `soft` 12), sky/ground colours, fog, VHS pass, materials,
textures, ceiling grid, audio, generation and chunk-boundary behaviour (the light sum still uses the same neighbour gather).

Expected effect (numeric model of an all-lit 4 m panel grid with the real formula; floor and mid-height wall; "old" is the legacy set):

| Situation | Floor old | Floor now | Wall mid old | Wall mid now |
|---|---|---|---|---|
| fully lit area | 1.20 | 1.15 | 1.20 | 1.24 |
| one dead panel (point under it) | 1.02 | 0.95 | 1.20 | 1.15 |
| one dim panel (`k` .12) | 1.08 | 1.01 | 1.20 | 1.19 |
| 8 x 8 m with four dead panels (centre) | 0.75 | 0.65 | 0.87 | 0.72 |
| large dead room (centre) | 0.70 | 0.60 | 0.76 | 0.60 |

So lit areas keep about the same exposure; the change is mainly that falloff towards dim and dead panels is now progressive
and visible instead of being cut off by the clamp. Lit-zone spread stays small (about 1 %): a regular fluorescent grid is
supposed to look even, the variation comes from dim/dead panels and dark rooms.

Walls get a gentle vertical gradient (brighter at the top near the fixtures) instead of a flat 1.2.

## Comparison baseline

* `?lighting=legacy` rebuilds the world with the previous constants (hard clamp 1.2, old bases, dark zones .42). Because
  the light is baked when chunks are built, switch by reloading the page, not live like `F8` for materials.
* Default (no parameter) is the new model. Parameters live in `LIGHT_SETS` near the top of the script.
* Combine with the material baseline if needed: `?lighting=legacy&materials=legacy`.

## What to check in game

1. Lit corridors and halls: even, soft light, no visible circles or squares under fixtures.
2. A dim or dead panel: a gentle, wide darkening, not a hard-edged patch.
3. Dark rooms / "LIGHTS OUT" zones: clearly darker than lit areas, edges soft (light still leaks through walls, see below).
4. Chunk seams (walk across 16 m boundaries): no brightness step.
5. Wallpaper, carpet and ceiling colours: the same hues as before (lighting only changes brightness).
6. Frame rate and chunk build time: unchanged by design (one extra `exp` per vertex at build time only).

## Known limitations

* Baked light has no occlusion: a lit panel still brightens the far side of a thin wall, which softens dark rooms.
* Vertices are about 2 m apart, so pools must stay wide and soft; do not shrink `reach` / `soft` without adding vertices.
* If lit areas now feel too even or too dark: tune `gain`, `knee`/`max` and `base` in `LIGHT_SETS` first; each is isolated
  from fog, VHS and textures.
