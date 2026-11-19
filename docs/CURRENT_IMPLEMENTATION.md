# THE NULL ROOMS — Current index.html implementation audit
Updated: 2026-11-19
Source of truth: `index.html` on main, blob `2c446b7f661e9301ff882fa7d8444d097a954f7c` (2,422 physical lines, 288,845 characters). This is a **static code inventory**, not a browser acceptance test. Earlier documentation may describe historical implementations or earlier defaults.

## Architecture and runtime
- Single large HTML entry point: UI, CSS, game state, procedural generation, rendering, gameplay and frame loop. Imports Three.js 0.160.1 from jsDelivr, with unpkg fallback; also integrates local Level 0 material/anomaly modules. No build step is implied by the entry point.
- Startup loader prebuilds nearby chunks, waits for selected assets/audio, and precompiles shaders; error handling and timeout paths exist.
- Three.js WebGL renderer: `antialias:false`, pixel ratio capped at 1.5. Scene renders into a 4-sample half-float target; fullscreen VHS/realistic shader; REALISTIC optionally runs multiscale bloom. PR #40 removed redundant default framebuffer MSAA, not the offscreen target MSAA.
- ORIGINAL and REALISTIC rendering profiles, F4 A/B, F8 material comparison, adjustable exposure/fog/grade/bloom/analytic AO/optics, environmental wear, VHS, grain and F3 FPS display. Real GPU cost and correctness **not verified** in this audit.

## World and scene
- Three generator modes: `?gen=bays` (current default), `?gen=region` (region/BSP), `?gen=legacy` (per-chunk). The old roadmap's description of region/BSP as the only active world architecture is outdated.
- Default bay generator: 4 m structural bays, long walls/openings, corridor bands, local light states, fixed starting wall/decal. Region epochs, retirement/rebuild, walkability and pinned start code coexist; verify how regeneration behaves specifically in bay mode rather than assuming the region-generator tests cover it.
- Level 0: replaceable wallpaper/carpet/ceiling assets with fallback; 0.5 x 1.0 m ceiling tiles, fluorescent fixtures, baked vertex lighting, fog and optional shader AO.
- Procedural furniture: office/dining chairs, armchairs, sofas, cabinets, CRTs, lamps, crates, stools, bookcases; dump heaps, showrooms, chair rooms, lone chairs, structural columns; model/placement/collision/grounding and baked furniture light. Inspect draw calls, geometry build and cleanup under streaming.
- Chunk streaming, collision and disposal paths exist; memory and long-duration navigation still need profiling.

## Player, menus and interaction
- First-person movement with inertia, direction-dependent speed, stride-driven gait, head bob, crouch, collision/wall slide, mouse and Gamepad API input; fullscreen, pause, settings, localStorage-backed F3 controls.
- Intro now includes an outdoor warehouse/yard and noclip descent before the original fall, disorientation, impact and recovery. Earlier intro docs describing only a fall are incomplete.
- Four-slot pocket inventory; pickup E / controller A, drop Q / controller X, slot selection 1–4 / wheel / shoulder buttons, TAB / controller BACK pocket view. World items are separate from chunk geometry and reset on exit.
- Paper and pencil spawn near start. Hold M / controller Y to read a hand-drawn map. With both items, visibility raycasts progressively copy observed geometry; previous observations can become inaccurate when areas change. Map has F3 test/erase controls. Test visibility, controls, memory growth and map persistence semantics.

## Audio, anomalies and narrative systems
- Ambient fluorescent audio, footsteps, breathing, cough and intro impact have sample/fallback paths; verify actual manifest paths, defaults and audible output with real hardware. Current repository has audio uploads dated 2026-11-19.
- Existing Encroaching Darkness and Observer code; natural blinking/eyelid overlay.
- Additional PRESENCES section: temporary fluorescent silence; CRT static/positional audio; distant spatial 'hallo?' (recording `voice_hallo` when present, otherwise synthesized); a faceless 'colleague' that approaches only while unseen. Automatic scheduling, F3 triggers and tuning exist. Do not assume these have been visually accepted or that they match the desired ambiguity.
- SICKNESS is **implemented and enabled by default in code** (`sickOn:1`, `sickMins:20`, `endMins:4` unless saved overrides). Progressing cough fits, slowdown, blood effects, collapses, final death/return to title. This is a material design change from the previously *optional future idea*. Requires explicit creative acceptance before treating as locked gameplay.

## Change tracking and documentation discrepancies
- 2026-11-08: PR #38 Observer; PR #39 reduced Pillar Forest density.
- 2026-11-09: intro impact asset manifest registration.
- 2026-11-17: PR #40 disabled redundant canvas antialiasing.
- 2026-11-19: upload of current index and audio assets, then upload of index2 (identical blob at time of audit). These generic 'Add files via upload' commits do **not** identify which Copilot-authored features were introduced or their chronology. A precise per-feature change history requires commit-by-commit diffing against a selected baseline; do not attribute every new feature to a specific upload without evidence.
- Existing `docs/WORLDGEN.md` and `docs/RENDERING.md` contain historical 'in review' wording. Keep their test results but clarify that the present default generator is bays and merged rendering features still need real-browser acceptance.

## Verification matrix (not performed by this static audit)
1. Startup: load on desktop browsers, no console errors, assets and fallback paths, intro start/skip/replay/exit.
2. Rendering: ORIGINAL/REALISTIC, F4/F8, AO/bloom toggles; FPS, p95/p99 frame time, draw calls, textures, GPU memory on Apple Silicon.
3. World: walk > retirement distance, return, start pinned, collisions/doors, bay/region/legacy modes, furniture and streamed cleanup.
4. Controls: keyboard/mouse, crouch, gamepad analog axes, interaction/pockets/map, pause/resume/fullscreen.
5. Audio: samples, relative levels, silence, spatial voice/TV, intro impact and fallback.
6. Events: Observer, darkness, TV, colleague, scheduling, masking, no surprise spawn in view, pause/reset and F3 force.
7. Sickness: disabled/enabled, 20-minute progression, forced stages, death reset, blood/texture/geometry disposal.
8. Persistence: defaults vs localStorage, F3 reset, profile settings, corrupted values, title reset.

## Risks and proposed follow-up
- P0: browser regression/acceptance and snapshot baseline. Do not claim 'everything works' from static code alone.
- P1: measure GPU passes, fragment shader cost, geometry/draw calls and streaming spikes before optimizations; preserve visual mood.
- P1: audit default bay generator vs region-epoch regeneration compatibility and map memory/resource lifecycle.
- P1: confirm whether default-enabled sickness and the overt colleague model fit the game's psychological-horror direction.
- P2: split this large entry point into modules only if profiling and maintenance evidence justifies a scoped refactor; no broad rewrite.
