# THE NULL ROOMS — Claude Code project instructions

## Purpose and creative direction
THE NULL ROOMS is a browser-based, first-person, procedurally generated liminal exploration game. The immediate goal is a convincing Level 0 inspired primarily by Kane Parsons' Backrooms footage: ordinary yet unsettling office architecture, restrained fluorescent lighting, subdued materials, oppressive repetition and subtle anomalies.

Creative balance: approximately 70% classic Backrooms, 20% dreamcore, 10% analog horror. Prioritize environmental credibility and atmosphere over jump scares, monsters or additional gameplay systems. Inspiration is a visual reference, not an instruction to reproduce footage frame-for-frame.

## Source of truth
- Inspect the **current repository** and relevant files before changing anything; do not assume this document describes every implementation detail.
- `index.html` currently contains the main game loop, chunk/layout generation, baked lighting, audio, UI and VHS rendering.
- `src/materials/level0.js` provides Level 0 materials, external texture loading and procedural fallbacks.
- `assets/textures/level0/manifest.json` configures external textures and repeat sizes.
- `docs/MATERIALS.md` documents material behavior and comparison tools.
- `ROADMAP.md` contains priorities and future ideas; it is not permission to implement backlog features.

## Approved Level 0 decisions
- Three approved material categories: wallpaper, carpet and acoustic ceiling. Preserve the supplied image assets and their intended colors; never overwrite or recolor them without an explicit request.
- Ceiling grid: **0.5 × 1.0 m panels**. Keep ceiling texture orientation, grid and fluorescent fixtures aligned.
- Prefer the existing baked vertex-lighting and shared-material architecture over many dynamic lights.
- No camera-attached flashlight effect in Level 0.
- VHS/analog treatment should be subtle enough not to obscure the environment.
- Existing controls, settings, procedural continuity, collision and deployment must remain functional.
- The current audio intentionally omits footsteps and breathing; do not restore them unless requested.

## Working method
1. Read the relevant code and recent changes before proposing or implementing a fix.
2. Make the smallest coherent change that solves the requested task. Do not bundle unrelated refactors or features.
3. Preserve deterministic world generation and chunk-boundary consistency.
4. Prefer configurable parameters over hardcoded visual experiments when tuning is likely.
5. Avoid simultaneous changes to lighting, fog, textures and VHS grading; isolate the effect of each adjustment.
6. Validate syntax, loading paths, runtime assumptions and performance where tooling permits. Clearly distinguish code review from an actual in-browser visual test.
7. Work on a separate branch and prepare a pull request. **Do not merge automatically.**
8. Report briefly in Danish: what changed, why, what to test visually, and known limitations.

## Current milestone: Level 0 lighting
Improve soft, plausible fluorescent illumination originating from the ceiling fixtures, with restrained variation between brighter and dimmer areas. Preserve approved texture colors, panel dimensions and performance. Avoid obvious circular light pools, exaggerated cinematic contrast, artificial yellow casts and flashlight-like lighting. A previous lighting change caused a major visual regression, so retain a clear comparison baseline and keep changes narrowly scoped.

## Scope control
Do not implement controller support, VR or multiplayer as part of routine Level 0 work. These are optional backlog items, documented in `ROADMAP.md`.

## Communication
Use Danish for task discussions and handovers unless asked otherwise. Keep responses concise, concrete and technically precise. Ask before making a major architectural or artistic change that is outside the current task.

## Developer tuning rule
When adding a new adjustable audio or visual parameter, register it in the F3 debug console (`devRegistry` and relevant live apply function in `index.html`). Keep normal settings and debug controls synchronized. Debug tuning must not alter game behavior until the user changes a value. Verify audio test buttons and pointer-lock resume after changes.
