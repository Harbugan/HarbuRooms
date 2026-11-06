# THE NULL ROOMS — Roadmap

Updated: 2026-11-05

This is a **planning document**, not a claim that all items have been tested or completed. Progress is based on repository review; visual acceptance requires in-game testing. Work on one milestone at a time.

## Current state
**Playable browser prototype; Level 0 visual refinement in progress.**

Already implemented in the repository (subject to ongoing QA):
- Deterministic, chunk-based procedural world with corridors, rooms and special areas.
- First-person navigation, collision, pause/menu, fullscreen and configurable settings.
- Level 0 external wallpaper, carpet and ceiling textures with procedural fallback and material comparison.
- 0.5 × 1.0 m ceiling panel grid with aligned fluorescent fixtures.
- Baked vertex-lighting, hemisphere fill, fog and VHS effects.
- Fluorescent hum, clicking and flicker sounds. Footsteps and breathing are intentionally disabled for now.

## Prioritized milestones

| Priority | Milestone | Status | Definition of done |
| --- | --- | --- | --- |
| P1 | Level 0 lighting refinement | **IN REVIEW** (PR open, needs in-game visual check; see `docs/LIGHTING.md`) | Plausible diffuse fluorescent light; balanced bright/dim zones; preserved material colors; no obvious chunk seams or major performance regression. |
| P2 | Room generation and proportions | **IN PROGRESS** — step 0 + 1 (tools, global room structure) in review, see `docs/WORLDGEN.md`; steps 2-5 planned | More believable, coherent Kane Parsons-inspired office spaces; less visibly random layout; reliable navigation. |
| P3 | Ambient audio landscape | Planned | Subtle spatial fluorescent hum and room ambience; controlled silence and variation; no intrusive breathing/footsteps. |
| P4 | Environmental detail pass | Planned | Restrained stains, irregularities, odd openings and spatial cues without visual clutter. |
| P5 | Subtle anomalies | Planned | Rare, unsettling events that preserve ambiguity; no mandatory combat or monster systems. |
| P6 | Performance and polish | Later | Stable frame pacing, manageable chunk/resource usage, browser testing, bug fixes and documentation. |

## Nice to have — not in current scope

### Controller support
- Use browser **Gamepad API**, including compatible Xbox/XInput-style controllers where supported.
- Movement, camera look, pause/menu and settings navigation; dead zones and sensitivity.
- Likely the smallest of these optional features, but still requires browser/device testing.

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
Claude Code: inspect the current lighting implementation, refine it conservatively, retain a comparison baseline and prepare a PR for visual review. See `CLAUDE.md` for project instructions.
