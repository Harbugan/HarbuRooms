# Anomalies

Status: **Anomaly 01 (The Encroaching Darkness) implemented, in review.** Verified headless only (state-machine simulation, software-GL
browser run, no shader errors). **Not verified:** how it looks and feels on a real GPU in a normal browser, real audio, real frame times.
**Anomaly 02 (The Observer) IMPLEMENTED / VISUAL QA PENDING** (see below; verified in Node simulations and a headless software-GL run only).
No shared "Anomaly Director" exists; the two anomalies exclude each other through their start conditions (see "Interplay with the Encroaching Darkness" under Anomaly 02).
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
* Headless Chromium (software GL, three@0.160.1 served locally, deterministic 33 ms frame stepping, 640x360): full sequence in ORIGINAL (11 screenshots) and in
  REALISTIC (2 mid-sequence screenshots + end state); no shader compile errors or console errors in either run. Seen: darkness enters from the sides of a
  wall and merges until the wall is nearly black; the frame is fully black while the lids are closed; the first frame after the snap shows the wall as before.
* **Not covered by that run:** the camera stood close to a flat wall, so no corridor depth, ceiling, ceiling grid, start decal or lamps were in view (the code
  paths exist but were not visually checked); the jerk and the audio were not observed; ORIGINAL/REALISTIC "unchanged when inactive" was not pixel-diffed against
  `main` (only reasoned: `uDark.w = 0` skips the new branch, and the added varyings/uniforms do not alter the lit result).
* Close to a flat wall the front looks like a soft, almost straight edge, because the 6 m noise scale covers less than one cell; in rooms it should look
  more organic, but that is a hypothesis to check in the browser.

### Known limitations / risks
* Cost while active: ~7 3-D noise evaluations + AO taps per fragment; inactive cost is one uniform branch. Not measured on a real GPU.
* Baked light is per vertex on ~2 m tiles, so the "low light" part of the shadow seed is coarse; contact AO supplies the fine corner detail.
* The HDR bloom of the fixtures stays, so lamps remain visible in the dark by design.
* Black lift / grain / VHS grade in the post shader mean "fully dark" is a very dark, grainy grey rather than pure black.
* WebXR: lids are DOM overlays (like the intro fade) and would need an in-scene equivalent.

## Anomaly 02 — THE OBSERVER
**Status: IMPLEMENTED / VISUAL QA PENDING.** Not a monster: a very tall, very thin dark figure that the player *almost* sees, far away in a
corridor or doorway, or withdrawing behind a corner at the edge of the frame. It never attacks, follows, chases, makes a sound or leaves a trace;
when the player gets to the spot, it is ordinary. No explanation, no reward, no confirmation.

### Files and responsibilities
| File | Responsibility |
|---|---|
| `src/anomalies/observer.js` | `createObserverTimer` (random intervals) and `createObserver` (lifecycle state machine). Pure, no DOM / Three.js. |
| `src/anomalies/observerPlacement.js` | Placement search, validation and line of sight on the world's 1 m wall grid (`layout()` data). Pure. |
| `src/anomalies/observerFigure.js` | Builds the figure geometry and owns its single mesh (create / move / remove / dispose). Three.js is passed in. |
| `index.html` (`obs*`) | Host: world adapter, camera view, blocking rules, frame hook (`obsTick` after `introTick`), jolt mask, F3 section. |
| `tools/observer-sim.mjs` | Node checks for timing, placement (real generator), lifecycle, cleanup (see "Verification"). |

### Figure
Nominal height 2.85 m (F3 2.4-3.4 m), hips at 0.53 H, very long thin legs, flat narrow torso (shoulders ±0.125 m), long neck, a small elongated
head (0.24 m) tilted slightly to one side, arms hanging from the shoulders to below the knees, one shoulder a little lower. No face, no eyes, no glow,
no animation (type B only glides). Level 0 ceilings are 2.9 m, so the figure **stoops from the hips** until its top is 9 cm below the ceiling (about
14 deg at 2.85 m); only beyond a 34 deg stoop is it scaled down. Under the 6.6 m atrium ceiling it stands upright.
Rendering: one merged low-poly geometry (~1100 vertices) and one shared `MeshLambertMaterial` = **one draw call, only while a figure exists**.
Lit like the legacy walls / start decal: each vertex carries the baked fluorescent level at its world position (`bakeLevel` over the nearby panels,
re-evaluated when the figure moves), times a very dark albedo (F3 "Figure tone", default 3 %), plus the hemisphere light, fog and the normal post chain.

### Placement (`findPlacement`)
Uses the same `layout()` wall grid that `addChunk()` builds walls and collision from (edge values: wall, window wall, door with lintel; pillars).
* Only **built chunks**, ceiling >= 2.45 m, at least 0.37 m from every wall line (body), and the stooped head at least 0.14 m from walls and lintels.
* Only **plausible observation points**: cells next to a doorway, in a corridor, in a corner, beside a wall or a wall end. Open floor is rejected.
* **Partly hidden**: 20-80 % (type B 15-70 %) of the silhouette's sample rays reach the eye; the rest is behind walls / lintels / window frames.
* Distance band 0.62 x - 1.45 x the preferred distance (default 24 m -> ~15-35 m).
* **Never on screen when created** (no pop-in). Two spawn modes:
  * `edge` - just outside the side of the frame (type A up to 50 deg beyond it, type B 3-35 deg): it is seen when the player turns;
  * `reveal` (type A) - in the direction of view but fully behind geometry, and 20-80 % visible from 2 or 4 m further along the walking direction:
    it comes into view by parallax.
* **Type B** also needs a retreat path: an axis direction mostly across the line of sight, clear of walls (head included), along which it is
  fully hidden after 0.25-2.4 m and stays hidden for another 0.4 m.
* If nothing qualifies the attempt is **rejected with a reason** (shown in F3); nothing is forced. Cost: ~3-6 ms in Node once per attempt.
* Line-of-sight test is conservative for "hidden": it uses the wall *lines*; real walls are 0.3 m thick and corner runs are extended, so geometry can
  only hide more than the test says. "Fully hidden" additionally uses a wider silhouette (±0.36 m) and a frustum widened by 4 deg.

### Lifecycle (`createObserver`)
`IDLE -> LURKING -> PRESENT -> IDLE` (type A) and `IDLE -> LURKING -> PEEK -> RETREAT -> IDLE` (type B); `TEST` for the debug figure.

| State | What happens |
|---|---|
| LURKING | Placed, not on screen. Becomes an observation when it comes into view. Removed silently (counted *unseen*) after 14 s (manual: 30 s) or when the player comes within 8 m, in both cases only while fully hidden. |
| PRESENT (A) | Stands still. Removed when it is fully out of sight; when the player swings the view towards it (>0.6 rad/s); when the player looks almost straight at it (<7 deg); when the player comes within 8 m; or when the visibility budget (default 0.7 s on screen) is used up. |
| PEEK (B) | Still for 0.08-0.3 s of on-screen time at the edge of the frame (cut short if the player turns towards it). |
| RETREAT (B) | Glides along the retreat path (ease-in / ease-out, F3 speed, default 1.4 m/s, turning slightly into the motion) and is removed the moment it is fully hidden. |

**Removal rule:** the mesh is removed only (a) while nothing of it can be seen, (b) during a fast camera swing, or (c) masked by the game's existing
handheld camera *jolt* (`mask: 'jolt'`): the jolt is started and the mesh is removed on the next frame, the first frame the jolt shows. (c) is used only when
the budget runs out (after waiting up to 0.25 s for a natural mask), when the player stares at it, or at the hard caps (budget + 3 s for A, budget + 0.8 s of
on-screen time for B). Which of these happens depends on what the player does, so there is no fixed disappearance pattern.

### Timing
* Automatic attempts at a **uniform random interval** in [min, max] (default 60-240 s), drawn anew after every attempt (placed, empty or rejected).
  Only active play counts: the timer runs while the game is playing (not paused / title menu / F3, not during the intro) and automatic sightings are on.
* Each attempt: blocked? (intro, menu, F3, Encroaching Darkness active) -> rejected; probability roll (default 70 %) -> otherwise an **empty** attempt;
  type A or B at random (the other type is tried if the first has no valid placement) -> otherwise rejected. Many placed figures are never seen (the player
  does not turn that way): that is intended and adds to the unpredictability.
* Pause / title menu / F3 / intro start / Exit to title **abort** a running observation (figure removed, behind the menu overlay).
* Manual **TRIGGER OBSERVER NOW** arms one real attempt (no probability roll, works with auto off) that runs on the first playing frame after F3 closes.

### Interplay with the Encroaching Darkness
No director: the darkness's automatic start additionally requires that the observer is idle, and an observer attempt is rejected while the darkness
runs (including its recovery). The darkness's manual F3 trigger aborts a running observation first. `?anomalies=off` disables both.

### F3 — ANOMALIES — THE OBSERVER
Readout: state (+ distance and on-screen time of the current figure), time to the next attempt (active play), last type, last outcome, counters
(attempts / seen / unseen / empty / rejected), last rejection reason, last placement (mode, cell kind, distance, visible share, retreat length).
Controls: automatic sightings on/off, **TRIGGER OBSERVER NOW**, **FORCE VISIBLE / TEST PLACEMENT** (debug only: puts a figure clearly in view and holds it,
also while F3 is open, until ABORT; height / tone sliders update it live), **ABORT / RESET NOW**, minimum / maximum interval, visible probability, maximum
visibility, preferred distance, height, retreat speed, figure tone, **RESET OBSERVER SETTINGS**. Values (`obs*`) live in `nullrooms.dev`, are in COPY CONFIG
and restored by the global F3 RESET. Console: `NULLROOMS_OBSERVER.trigger()`, `.forceVisible()`, `.cancel()`, `.state`, `.stats`.

### Verification done
* `node tools/observer-sim.mjs` (with `THREE=<path to three@0.160.1 three.module.js>` for the rendering part; it is skipped otherwise), all checks pass:
  * timing: intervals uniform in [min, max], redrawn per attempt, no counting while paused, auto off = no attempt in 1 h, blocked host = rejected with
    the reason, 70 % probability -> ~30 % empty attempts;
  * placement on the real generator (300 random poses x A / B / test): every accepted spot clear of the collision boxes (`chunkBoxes`), in a plausible
    cell, in the distance band, under the ceiling, not on screen when created, type B retreat path clear of walls and ending hidden; both spawn modes and
    door / corridor / corner / wall cells occur; unbuilt chunks are rejected with a reason;
  * lifecycle with scripted camera turns (640 + 600 runs): no pop-in, on-screen time within budget (+ mask wait / caps), every observation ends in IDLE,
    every removal while still visible is masked (jolt or fast swing), type B retreats out of sight, pause / cancel abort, lurk timeout, TEST held until
    abort, manual trigger refused while the darkness runs and ignores the roll otherwise;
  * rendering (three@0.160.1 in Node): fits under a 2.9 m ceiling (top 2.80 m), 0.37 m wide incl. arms, upright 3.1 m under 6.6 m, ~1100 vertices, one
    mesh, moving does not rebuild, every built geometry disposed, nothing left after `dispose()`.
* `node tools/anomaly-sim.mjs` and `node tools/gen-check.mjs --epochs` unchanged (all pass); the generator is not touched.
* Headless Chromium (software GL, three@0.160.1 served locally, 960x540): the page loads, all three modules import, no console / shader errors,
  F3 section renders and its readout updates, FORCE VISIBLE puts a mesh in the scene (screenshot: thin dark legs and long arms in the spawn room), ABORT
  removes it. **Not covered:** the spawn room is small, so the test figure stood 1.5-1.8 m away (fallback); headless mouse input did not turn the camera
  under pointer lock, so no real A/B sighting, no 15-35 m view and no jolt / swing removal was observed in a browser. FORCE VISIBLE needs open space
  within ±30 deg of the view; otherwise it reports why.

### Not verified / known limitations
* **How it looks and feels** (silhouette at 15-35 m in fog, darkness, stoop, whether the jolt mask and swing removals really go unnoticed) needs a real
  browser on a real GPU. Tone and distance are F3 sliders for that reason.
* The jolt mask is the one deliberate visual cue at a removal while visible; it is the game's ordinary handheld jolt, but a player who stares at the
  figure until the budget runs out may still notice the disappearance.
* No timer mixing with the darkness: an attempt that falls inside a darkness event is simply rejected.
* The figure ignores the Encroaching Darkness shader layer (they never overlap) and the start decal; a placement is never closer than ~10 m.
* Placement costs a few ms once per attempt (not per frame); per-frame cost while a figure exists is ~30 grid rays.
* WebXR: removal masking assumes a flat camera; not considered.
