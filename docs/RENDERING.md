# THE NULL ROOMS — Rendering profiles (4C.1)

Status: **in review.** Foundation only: no exposure, tone mapping, AO or optical effects yet (planned 4C.2 / 4C.3).

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
