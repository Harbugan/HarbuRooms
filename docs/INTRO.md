# Cinematic intro

Plays automatically on the first Start (and after "Exit to title"), ~8 s, inside the live Three.js world.

| Phase | Time (8 s ref.) | What happens |
| --- | --- | --- |
| FALLING | 0-1.5 | Near-black fade-in, gravity drop from max H-0.3 m, tumble, hard stop, impact + short dark dip |
| DISORIENTED | 1.5-3.5 | Camera lies tilted at 0.17 m, irregular drift, heavy breathing, cloth sounds, hum ducked |
| GETTING_UP | 3.5-6.5 | Head lift -> knees (pause) -> stand, small balance correction |
| RECOVERING | 6.5-8 | Sway settles, breathing calms, hum returns; mouse look re-enabled; control handed over |

All camera offsets are 0 at the end, so hand-over to normal movement has no snap. Movement is blocked and mouse/pad look is locked until RECOVERING.
Spawn: the current spot is used if a 1.1 m ring around it is free of walls, otherwise the nearest free spot is searched. World/lighting/materials are untouched.

**Skip:** Escape (releases pointer lock, which the browser handles first -> intro blends out in 0.4 s; in controller-only mode Esc skips directly). Leaving via F3 pauses instead.
**F3 section:** Intro enabled, duration (4-14 s, scales all phases), fall intensity, camera shake, breathing/impact volume, ambient ducking, Replay Intro. Saved with the other dev values (`nullrooms.dev`), included in RESET / COPY CONFIG.
**Audio:** optional manifest sounds `intro_impact`, `intro_breath`, `intro_cloth` (else `breathing_idle`, else procedural). Nothing is pre-scheduled, so skipping leaves at most ~1.5 s of tail.
**Not tested:** real audio and visual feel in a normal browser; verified headless only (state timing, camera height 0.157-2.6 m, hand-over, skip, disabled).
