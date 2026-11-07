# THE NULL ROOMS — Roadmap

Updated: 2026-11-07

This is a **planning document**, not a claim that all items have been tested or completed. Progress is based on repository review; visual acceptance requires in-game testing. Work on one milestone at a time.

## Current state
**Playable browser prototype; Level 0 visual refinement in progress.**

Already implemented in the repository (subject to ongoing QA):
- Deterministic, chunk-based procedural world with corridors, rooms and special areas.
- First-person navigation, collision, pause/menu, fullscreen and configurable settings.
- Level 0 external wallpaper, carpet and ceiling textures with procedural fallback and material comparison.
- 0.5 × 1.0 m ceiling panel grid with aligned fluorescent fixtures.
- Baked vertex-lighting, hemisphere fill, fog and VHS effects.
- ORIGINAL / REALISTIC rendering profiles with F4 A/B comparison; REALISTIC HDR fluorescent bloom, fog, exposure, highlight shoulder and grade controls (4C.1 / 4C.2 merged; real-GPU visual acceptance pending).
- F3 debug FPS counter (merged; useful for measuring frame pacing and visual-effects overhead).
- Step 4A shader-based wall wear, carpet dampness and ceiling stains (merged; visual acceptance pending).
- Cinematic fall / landing / get-up intro (merged; in-browser acceptance pending).
- Controller support (Gamepad API): move, look, sprint, menus, hot-plug; see `docs/CONTROLS.md`.
- Fluorescent hum, clicking and flicker sounds. Footsteps and breathing are intentionally disabled for now.

## Prioritized milestones

| Priority | Milestone | Status | Definition of done |
| --- | --- | --- | --- |
| P1 | Level 0 lighting refinement | **IMPLEMENTED / VISUAL QA PENDING** (review `docs/LIGHTING.md` and current REALISTIC rendering) | Plausible diffuse fluorescent light; balanced bright/dim zones; preserved material colors; no obvious chunk seams or major performance regression. |
| P2 | Room generation and proportions | **IN PROGRESS** — step 0 + 1 (tools, global room structure) in review, see `docs/WORLDGEN.md`; steps 2-5 planned. Continuous world: region epochs, walkability repair and fixed start area with decal, region retirement active (steps 0-4) in review, see `docs/WORLDGEN.md` | More believable, coherent Kane Parsons-inspired office spaces; less visibly random layout; reliable navigation. |
| P2b | Cinematic intro (fall, landing, getting up) | **MERGED / VISUAL QA PENDING** — implemented in `index.html`, tuned via F3 "CINEMATIC INTRO"; needs in-browser visual/audio check (see `docs/INTRO.md`) | ~8 s first-person intro on Start; skip + replay work; no regressions in lighting, movement or audio. |
| P2c | 4C.1 Rendering foundation & A/B comparison | **MERGED / VISUAL QA PENDING** — Original reference, Realistic sRGB path, F3 controls and F4 A/B switch; see `docs/RENDERING.md`. | Original remains stable; Realistic uses consistent sRGB; A/B switch without rebuild or regressions. |
| P2d | 4C.2 HDR bloom, fog, exposure & grading | **MERGED / VISUAL QA PENDING** — phase 1 HDR fluorescent lamps and multi-level bloom (PR #30); phase 2 fog, exposure, shoulder and grade controls (PR #31). REALISTIC only; software-GL checks performed, real-GPU evaluation still needed. | Convincing fluorescent glow and balanced shadow/colour response; Original unchanged; acceptable frame-time overhead. |
| P2e | 4C.3 Ambient occlusion & subtle optics | **IN REVIEW / VISUAL QA PENDING** — analytic contact AO via a world-space occupancy map in the shared materials, plus subtle lens distortion, radial CA and shadow-weighted grain; REALISTIC only, F3 controls; ORIGINAL pixel-identical to `main` in headless test. Real-GPU look and FPS on/off (Apple Silicon) still to be checked; see `docs/RENDERING.md`. | Noticeable but subtle depth at wall/floor/ceiling contacts; no dirty halos, shimmer or seams; toggles and live tuning; measurable acceptable FPS cost; Original preserved. |
| P3 | Ambient audio landscape | **PARTIAL / PLANNED** — fluorescent hum, clicks and flicker present; full spatial ambience and variation outstanding. | Subtle spatial fluorescent hum and room ambience; controlled silence and variation; no intrusive breathing/footsteps. |
| P4 | Environmental detail pass | **Step 4A MERGED / VISUAL QA PENDING** — subtle wall wear/discoloration, carpet dampness, ceiling stains as a shader layer with F3 "ENVIRONMENT" controls (`docs/ENVIRONMENT.md`); needs in-browser visual check. Odd openings/spatial cues not started | Restrained stains, irregularities, odd openings and spatial cues without visual clutter. |
| P5 | Subtle anomalies | Planned | Rare, unsettling events that preserve ambiguity; no mandatory combat or monster systems. |
| P6 | Performance and polish | **FOUNDATION STARTED** — F3 FPS counter merged (PR #33); benchmarking, optimization and browser QA remain. | Stable frame pacing, manageable chunk/resource usage, browser testing, bug fixes and documentation. |

## Nice to have — not in current scope

### Controller support — IMPLEMENTED (in review)
- Done: Gamepad API (no dependencies), analog move/look, sprint, menu navigation, hot-plug, live settings and F3 debug info. See `docs/CONTROLS.md`.
- Needs real-hardware testing (Xbox, DualShock/DualSense) in Chrome/Edge and Firefox; crouch and interact are input-only until the game gets those mechanics.

### VR / Meta Quest
- Investigate **WebXR** support and headset/controller input.
- Requires stereo rendering, comfort controls, frame-rate optimization and compatible HTTPS/browser setup.
- Feasibility spike first; do not assume current desktop postprocessing is VR-ready.

### Multiplayer / co-op
- Initial concept: **2–4 players** exploring the same procedural world together.
- Requires shared world seed/version, player-state synchronization, networking, sessions and handling of anomalies.
- No combat or progression system required for an initial experiment.
- Most architecturally invasive of the optional ideas; defer until single-player foundations are stable.

## Working agreements
- Finish and visually evaluate each milestone before moving on.
- Preserve the approved Level 0 textures and 0.5 × 1.0 m ceiling geometry unless explicitly revised.
- Implement through separate branches/PRs; do not auto-merge.
- Keep scope narrow and avoid unrelated refactors during visual tuning.
- Update this roadmap when priorities or decisions change.

## Next action
Claude Code: prepare and implement **4C.3 ambient occlusion and subtle optics** on a separate branch/PR. First inspect the current render pipeline, `docs/RENDERING.md`, `CLAUDE.md` and active REALISTIC defaults. Keep ORIGINAL frozen and all changes scoped to REALISTIC. Prioritize stable, restrained depth cues at architectural contacts; avoid heavy full-screen effects and visible halos. Expose useful live F3 controls and an off switch; compare FPS and frame pacing with 4C.3 on/off using the merged counter, including Apple Silicon where available. Verify in a real browser/GPU before visual sign-off; do not auto-merge.

Documentation note: `docs/RENDERING.md` still contains earlier in-review wording; update it as part of the 4C.3 PR to distinguish merged implementation from pending visual acceptance.
