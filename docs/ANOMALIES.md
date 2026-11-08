# Anomalies

Status: **Anomaly 01 (The Encroaching Darkness) implemented, in review.** Verified headless only (state-machine simulation, software-GL
browser run, no shader errors). **Not verified:** how it looks and feels on a real GPU in a normal browser, real audio, real frame times.
No shared "Anomaly Director" exists yet; the structure below is deliberately small.

## Anomaly 01 — THE ENCROACHING DARKNESS
The player slowly realises that the darkness in the room's existing shadows is growing: it creeps out of corners and wall joints, merges and
swallows nearly the whole visible world while the fluorescent fixtures keep glowing. Walking, looking away or leaving the room does not stop it.
When it is about to reach the player: a short involuntary camera jerk, then eyelids close (from top and bottom), the darkness is reset while the
eyes are fully shut, and the eyes open on a room that is exactly as before.

### Lifecycle (`src/anomalies/encroachingDarkness.js`)
`IDLE -> STARTING -> SPREADING -> CONSUMING -> SNAP_OUT -> RECOVERY -> IDLE`

| State | Time (default spread 25 s) | What happens |
|---|---|---|
| STARTING | 0-12 % | darkness begins only in the deepest shadows |
| SPREADING | 12-72 % | fronts spread and merge |
| CONSUMING | 72-100 % + 0.7 s hold | nearly everything is dark |
| SNAP_OUT | ~0.9 s | jerk (0 s), lids close (0.14-0.26 s), eyes closed for the blink time (default 300 ms), **reset while closed**, lids open (0.18 s) |
| RECOVERY | 1.6 s | everything is back to baseline; auto-start is blocked for the next 4 minutes of calm play |

The file is a pure state machine (no DOM / Three.js / audio) with the shape `{ id, state, trigger(), cancel(), tick(dt, playing) -> frame }`.
`index.html` applies the returned frame (uniforms, camera offsets, lids, audio). A second anomaly can copy this shape; no director is implemented.
Time advances only while `playing`, so pause, the title menu and F3 freeze the sequence exactly where it was (also mid-blink).
It cannot start during the intro (and starting the intro or "Exit to title" cancels it), nor while it is already running.

### Visual technique (`src/materials/level0.js`, `GLSL_DARK`)
Level 0 uses baked vertex lighting, so Three.js lights cannot produce this. Darkness is a **shader-only layer in the shared Level 0 materials**, in
the same family as AO and environmental details: uniforms only, no new pass / mesh / material / draw call, no chunk rebuild, no change to
generation or collision.

* Every surface point gets an **arrival time** `T` in [0,1], a pure and *static* function of world position. `T` is low where the room is
  already in shadow (contact AO + low baked light, weight = "shadow anchoring", default 40 %) and where a large-scale (6 m), domain-warped 3-D
  noise is low. A fragment is dark when `smoothstep(T, T + softness, progress)`.
* `progress` only ever grows and `T` never changes, so darkness **only advances** (it never retreats) and the iso-contours of `T` sweep outward as
  organic, merging blobs that start in corners and joints. Walls, floor and ceiling are one continuous 3-D field, so surfaces and chunk seams join up.
  It is not a radial wave, not a screen overlay and not a global brightness change; the player's position does not enter the formula.
* Albedo goes to ~3 % at full darkness. Specular is removed with it. **Fog is darkened per fragment** (`GLSL_DARK_FOG`) so far surfaces and openings go
  black instead of staying hazy. The lamp material (`glowMat`) is deliberately untouched: fixtures keep glowing and their bloom stays.
* Also patched (`patchDarkness`) so nothing stays unnaturally bright: the **ceiling grid strips** (`gridMat`), the **start-room decal** and the
  legacy Lambert wall/floor/ceiling materials (`?materials=legacy`, F8). The patches are inert when the anomaly is off.
* **Both rendering profiles.** The AO contact term is read from the occupancy map independently of the REALISTIC-only `uAO.x`, so ORIGINAL gets the
  same shadows-first behaviour. With the anomaly inactive `uDark.w = 0` and the added branch is skipped; output is meant to be identical in both
  profiles (see "Verification").
* Per-run seed (`uDark.z`) shifts the noise field, so every occurrence grows differently.

### Snap Out
* **Camera:** offsets are added after `handheld()` (exactly like the intro), `look`/`view` are never written, so the view direction can never change
  permanently. About 4 deg combined (yaw 3.2, pitch 2.2 down, roll 1.6, mirrored randomly per event), fast attack (70 ms), slower decay (260 ms)
  with a small counter-swing, back at exactly 0 before the lids open. A little extra `shake` is added to the post shader during the jerk.
* **Blink:** two DOM lids (z-index 3, same technique as the intro fade), curved and feathered edges, closing from the top and bottom. Not a plain fade.
* **Reset:** darkness (`uDark`), hum filter and ducking are reset on a frame where the lids are fully closed (0.1 s into the closed period). The player
  never sees the darkness retreat.

### Audio
Restrained: the fluorescent hum (and its clicks) gets duller and ~28 % quieter through a crossfade to a lowpassed copy (`humDry` / `humLPg`; idle values
1 / 0 are transparent). At Snap Out a very small procedural gasp (foley bus, volume in F3). Footsteps and breathing are not restored. Everything returns to
the original gains during the blink.

### Automatic activation
Off-switchable (F3 and `?anomalies=off`), conservative and unpredictable: a memoryless hazard (`1 - exp(-dt / mean)` per frame, no fixed timer) that only
runs while actively playing, after a 4-minute grace period since the game start or the last event, and never during the intro / menu / F3 / a running
anomaly. Default mean wait is **15 minutes** of active play (F3 range 4-60). Manual F3 testing is the priority for the first review.

### F3 — ANOMALIES — THE ENCROACHING DARKNESS
State readout, automatic on/off, **TRIGGER ANOMALY NOW** (closes F3 and resumes), **ABORT / RESET NOW**, darkness intensity, spread duration, snap camera
intensity, blink duration, shadow anchoring, front softness, gasp volume, auto mean wait, **RESET ANOMALY SETTINGS**. Values are stored in `nullrooms.dev`,
are included in COPY CONFIG and restored by the global F3 reset. Defaults leave the game unchanged until a value is edited.
Console: `NULLROOMS_ANOMALY.trigger()`, `.cancel()`, `.state`.

### Tuning hints (hypotheses, not verified on a real display)
* Too uniform / "everything dims at once": raise *shadow anchoring* or lower *front softness*.
* Too patchy / hard to see growing: lower *shadow anchoring*, raise *spread duration*.
* Noise scale (6 m) is `uDarkK.z`, set in `anomApply()`; it is not an F3 slider yet.

### Verification done
* `node tools/anomaly-sim.mjs`: lifecycle order, monotonic progress, reset only while the lids are fully closed, camera offsets exactly 0 at the end and
  3-5 deg, pause freezes time and lids, cancel resets, no automatic start in grace / when vetoed / when disabled, hazard is random (not a fixed timer).
* Headless Chromium (software GL, local three@0.160.1): no shader compile errors, full sequence run in both profiles, screenshots reviewed.

### Known limitations / risks
* Cost while active: ~7 3-D noise evaluations + AO taps per fragment; inactive cost is one uniform branch. Not measured on a real GPU.
* Baked light is per vertex on ~2 m tiles, so the "low light" part of the shadow seed is coarse; contact AO supplies the fine corner detail.
* The HDR bloom of the fixtures stays, so lamps remain visible in the dark by design.
* Black lift / grain / VHS grade in the post shader mean "fully dark" is a very dark, grainy grey rather than pure black.
* WebXR: lids are DOM overlays (like the intro fade) and would need an in-scene equivalent.
