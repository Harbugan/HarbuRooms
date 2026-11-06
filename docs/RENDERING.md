# THE NULL ROOMS — Rendering profiles (4C.1)

Status: **4C.1 and 4C.2 merged, real-GPU visual acceptance pending.** 4C.3 (AO and subtle optics, below) is in review. The sections below keep their original wording, including the "in review" notes from when each phase was written.

## Pipeline (unchanged)
Scene -> half-float MSAA render target (linear light) -> one full-screen shader (`vhsMat`, `index.html`) -> canvas.
No EffectComposer. Profiles are **uniforms of the same shader**, so switching never recompiles, rebuilds chunks or touches the camera.

## The bug and the two profiles
`tDiffuse` is linear. The graded path encoded it with `pow(1/2.2)`, but the VHS-intensity bypass `mix(clean, col, intensity)`
used the raw **linear** frame for `clean`: any VHS value below 100 % mixed linear and encoded values (at 0 % the picture was
displayed as if linear: measured mean luma 94 vs 161 for a correctly encoded frame, headless test).

| Profile | Encode | Bypass (`clean`) | Purpose |
|---|---|---|---|
| **ORIGINAL** (default) | `pow(1/2.2)` | raw linear (legacy, kept on purpose) | Frozen reference. Byte-identical to the pre-4C.1 output (tested at VHS 75/40/0 %). |
| **REALISTIC** | exact sRGB OETF | sRGB-encoded | Corrected colour handling; base for 4C.2/4C.3. |

Post-processing **off** = neutral, correctly sRGB-encoded frame in both profiles (skips all effect taps).

## Controls
* F3 -> **VISUAL / RENDERING**: profile button, post on/off, grain, vignette, scanline, halation, chromatic aberration (0-200 %, 100 % = unchanged).
* **F4** switches profile during play (short on-screen label). Each profile stores its own effect gains (`visO_*` / `visR_*` in `nullrooms.dev`), so tuning one never affects the other.
* "RESET THIS PROFILE" resets the active profile; the global F3 RESET resets everything, including the profile choice (back to ORIGINAL).
* The normal VHS intensity setting still works in both profiles.

## Limitations
* Tested headless (software GL) with a deterministic harness; not on a real GPU / display. Judge the visual difference in a real browser.
* REALISTIC at VHS 75 % looks different from ORIGINAL by design (that is the colour fix); effect constants are otherwise identical.
* Gain sliders scale the effect strengths that existed before; tape wobble, dropouts and the bottom-edge head-switch band are not exposed.

## 4C.2 phase 1 — HDR fluorescent lamps + bloom (REALISTIC profile only)
Status: **in review**, verified headless (software GL, no shader errors, bloom visibly bleeds from lamps); needs a real-GPU visual check. ORIGINAL is unchanged by design (gain 1, full fog, bloom off; identical formulas, but not pixel-diffed).

* **HDR lamps:** `glowMat` (lamp panels) is patched via `onBeforeCompile` with `uGlow = (gain, fogKept)`. REALISTIC multiplies the lamp colour by `lampGain` (default 4 → ~4.0 linear in the half-float target) and keeps only `lampFog` (default 30 %) of the fog on lamps, so far lamps stay bright. Chunk meshes/geometry are untouched (live uniform).
* **Bloom:** after the scene render, `bloomPass()` runs a threshold bright-pass into a 1/4-res target, then 3 separable 9-tap gaussian levels (1/4, 1/8, 1/16). `vhsMat` adds them in linear light before sRGB encoding (also into the VHS-bypass path). ~7 tiny passes, skipped when ORIGINAL, post off or bloom off. No new dependency, no EffectComposer.
* **Existing smear/halation taps** read the frame clamped to 1 in REALISTIC (helper `T()`), so they behave as before; the bloom carries the HDR excess.
* **F3 → FLUORESCENT BLOOM (REALISTIC ONLY):** enable, lamp HDR gain, lamp fog kept, threshold, intensity (default 25 %), spread. All live; saved in `nullrooms.dev`; global F3 reset restores defaults.
* Defaults are visual hypotheses: tune in the browser first (intensity/gain), then bake into `DEV_DEFAULT`.
* WebXR: bloom targets are screen-sized; a stereo path would need per-eye passes.

## 4C.2 phase 2 — fog, exposure, shoulder, grade (REALISTIC profile only)
Status: **in review**, verified headless only (no shader errors; ORIGINAL mean colour within ~1 % of `main` in a noisy software-GL frame, not a pixel diff). Needs a real-GPU look.

* **Bloom defaults** now follow the in-browser tuning after phase 1: spread 96 %, intensity 28 %, lamp fog kept 36 %.
* **Fog:** `scene.fog` colour/density are written live by `applyVisual()` (`FOG_BASE` = the original haze). REALISTIC defaults: colour brightness 65 % (distance goes darker instead of towards a bright yellow), density 100 %. `scene.background` follows the fog colour. ORIGINAL restores `HAZE` / `.027`.
* **Post shader:** the grade constants of the old VHS look (`.78` saturation, `.92` gain, lift `vec3(.035,.03,.04)`, blue `.9`) are now uniforms (`uGrade`, `uBlue`). ORIGINAL sets exactly the old values; contrast, exposure and shoulder are neutral there and skipped by guards.
* **Exposure** (`uExp`, linear, before grade) and a **highlight shoulder** (`uTone`, soft knee towards 1; 100 % = off) are new and default neutral.
* **REALISTIC defaults (hypotheses):** saturation 90 %, blue gain 90 %, black lift 50 %, gain 92 % (= old), contrast 110 %, exposure 100 %, shoulder off.
* **F3 → FOG, EXPOSURE & GRADE (REALISTIC ONLY):** nine sliders plus reset. All live, saved in `nullrooms.dev`, restored by the global F3 reset.

## 4C.3 — contact ambient occlusion + subtle optics (REALISTIC profile only)
Status: **in review.** Verified headless (software GL): no shader/console errors, ORIGINAL pixel-identical to `main` (0 differing pixels outside the HUD text, fixed time and camera), AO visibly adds depth at wall/floor/ceiling contacts and pillars. **Not verified:** real-GPU look, FPS / frame pacing on Apple Silicon (compare with the F3 FPS counter, AO on vs off).

### AO choice
SSAO/GTAO was rejected: the scene target has no depth texture (4x MSAA half-float), so it would need a depth/normal pre-pass or MSAA depth resolve plus AO, blur and upsample passes, and it halos/shimmers against grain and VHS. Baked vertex AO is too coarse (2 m floor/ceiling tiles, 4 vertices). Chosen: **analytic contact AO in the shared Level 0 materials** (`GLSL_AO`, `src/materials/level0.js`), no extra pass, no new meshes, materials or draw calls.

* **Occupancy map** (`occTex`, `index.html`): world-space toroidal 1024x1024 RG8 texture, 0.25 m per texel (256 m period > ~176 m of loaded chunks). R = walls reaching the floor, G = walls/lintels reaching the ceiling (area coverage). Built from each chunk's collision rects (+ lintels for G only), so it is deterministic and seamless across chunk borders. Blocks are re-rasterised in `frame()` (max 12 per frame) and uploaded with `copyTextureToTexture`; neighbours are re-rasterised so wall thickness spilling over a chunk border is included.
* **Floor/ceiling:** 9 taps of the map around the fragment (radius = AO radius) -> soft gradient away from walls, pillars, doorway lintels.
* **Walls:** height above floor and below ceiling (`aHc` vertex attribute = chunk ceiling height, so 6.6 m atrium rooms work) plus 6 map taps beside the fragment for inside corners.
* AO multiplies albedo before fog and bloom (lamps, bloom and fog are not darkened). The legacy Lambert materials (`?materials=legacy`, F8) have no AO, by design.
* ORIGINAL / AO off: `uAO.x = 0`, so the shader branch is skipped; F4 only writes uniforms (no rebuild, no recompile).

### Optics (existing `vhsMat`, no new pass)
* **Lens distortion:** gentle barrel warp of the post UV (corners fixed, centre magnified slightly). Uniform `uLens` = 0 in ORIGINAL.
* **Radial chromatic aberration:** red/blue shifted along the radius (zero at centre) on top of the existing horizontal tape CA (`uCAr`).
* **Grain:** `uGrainL` weights the existing grain by luminance (stronger in shadows, like sensor noise).
* Vignette, scanlines, halation and VHS effects are unchanged (not duplicated); temporal variation was left out (a 24 Hz flicker and dropouts already exist).

### Controls (F3 -> AMBIENT OCCLUSION & OPTICS (REALISTIC ONLY))
AO enabled, AO intensity (default 55 %), AO radius (default 60 cm), lens distortion (30 %), lens CA (40 %), grain shadow weighting (60 %), RESET AO / OPTICS. All live, saved in `nullrooms.dev`, restored by the global F3 reset. Defaults are hypotheses: tune in a real browser.

### Known limitations
* Occupancy resolution is 0.25 m; very thin features (door jambs) get only coarse AO. Walls taller than the chunk ceiling (edge walls) use the chunk ceiling height for ceiling contact.
* Cost: ~9 texture taps per floor/ceiling fragment and 6 per wall fragment while AO is on, plus a small texture upload when chunks stream. Not measured on a real GPU.
* Headless test harness lives outside the repo (local three.js, fixed time via stubbed `requestAnimationFrame`/`performance.now`).
