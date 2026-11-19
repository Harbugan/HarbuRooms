# THE NULL ROOMS — Performance baseline & diagnostics (Phase A)

Measurement only. Phase A changes no visuals, audio, gameplay, world generation or existing settings, and contains no optimizations.
Code: `src/perf/profiler.js` (ring buffers, GPU timer queries, report text), hooks in `index.html` (`PERF.*` calls in `frame()`, `addChunk`/`removeChunk` wrappers, `bloomPass`), F3 section **PERFORMANCE**. Node check: `node tools/perf-check.mjs`.

## Using it
- **F3 > PERFORMANCE**: live readout (redrawn ~2x/s), checkbox **Show performance overlay**, buttons **COPY PERFORMANCE REPORT** and **RESET MEASUREMENTS**. The existing "Show FPS Counter" is unchanged.
- **Overlay** (top right, hidden by default, stored in the F3 values as `perfOverlay`): FPS, P95 frame time, draw calls, active chunks. Visible with F3 closed.
- **Recording is on only while the overlay is visible or F3 is open.** Otherwise every hook returns immediately, `renderer.info.autoReset` is left at the three.js default and no GPU queries exist. For a benchmark use the overlay and keep F3 closed while measuring; open F3 afterwards to copy the report.
- The report uses a fixed **60 s window** (up to 16,384 frame rows, enough for 240 Hz) and prints the number of samples and the span actually covered.

## What is measured
| Metric | Source / definition | Limitations |
|---|---|---|
| FPS now / average | now = frames in the last 1 s; average = 1000 / mean interval over the window | Capped by display refresh (vsync). |
| Frame time median / P95 / P99 / max | Interval between consecutive `requestAnimationFrame` timestamps | Includes vsync waiting. A tab that was hidden is skipped, not counted as a spike. |
| JS time per frame (+ updateChunks, occFlush, render submit) | `performance.now()` around the code regions inside `frame()` | **CPU/submit time only.** Does not include GPU execution. |
| Draw calls, triangles | `renderer.info.render`, read once at the end of `frame()` after the scene, bloom and post passes. `autoReset` is switched off while profiling and `info.reset()` is called at the start of each frame, so all passes are summed. | Counts the post-processing quads and bloom blits too, so numbers are higher than "scene only". |
| Geometries, textures | `renderer.info.memory` | **Object counts only, not GPU memory.** Render targets and shared materials make them a poor VRAM proxy. |
| Active chunks, queued | `chunks.size`, `queue.length` | Generator-agnostic; verified path is `?gen=bays`. |
| Generation time | `addChunk` wrapper: CPU ms per chunk actually built (includes layout/region lookups it triggers, geometry build, baked lighting) | Layout work done outside `addChunk` (e.g. `layout()` for the status label) is not included. |
| Retirement time | `removeChunk` wrapper: remove from scene + geometry dispose | GPU-side frees happen later in the driver. |
| Spikes | Frame intervals >= 25 / 50 / 100 ms, with per-spike class and last 48 spikes logged | See below. |
| GPU time (scene, bloom, post) | `EXT_disjoint_timer_query_webgl2`, `TIME_ELAPSED` queries around the scene render (includes MSAA resolve), the bloom pass (only when bloom is active) and the final VHS/post composite | **`N/A` if the extension is missing** (e.g. Safari, some Firefox configs). Never replaced by CPU time. Results arrive 1-3 frames late; browsers may quantize them; disjoint results are discarded and counted. Browser compositing and presentation are not covered. |
| JS heap | `performance.memory` (Chromium) | **`N/A` elsewhere.** Coarse, not live, not GPU memory. |

Spike class (per spike, attributed to the work of the **previous** frame, because an rAF interval is caused by what ran before it):
- `streaming`: generation + retirement >= 25 % of the interval;
- `cpu`: previous-frame JS time >= 70 % of the interval but not streaming;
- `idle`: JS was mostly idle, so the stall came from the GPU, vsync, garbage collection or the browser.

## Overhead
Recording costs about 0.5 microseconds per frame (Node micro-benchmark, `tools/perf-check.mjs`), no allocation in the frame loop, fixed memory of roughly 1.5 MB (typed arrays, allocated once). The 2 Hz overlay redraw uses one sort of the window (about 0.5 ms at 16k samples); the full F3 readout sorts several series (about 7 ms at 16k samples, about 1.5 ms at 60 fps) and only runs while F3 is open. GPU queries add a small driver cost while profiling; they are created on activation and deleted on deactivation, context loss and `dispose()`. On `webglcontextlost` measurement pauses and GPU timing shows N/A until `webglcontextrestored`.

## Benchmark procedure
Use the same machine, browser, window size and power mode for all runs (laptops: plugged in). Close other heavy tabs. Use `?gen=bays` (default).
1. Start the game and complete the intro (do not skip it, to get the same warm-up).
2. Wait 30 s at a fixed spot (shader/texture warm-up, GC settle).
3. **Idle run**: enable the overlay, close F3, do not move for 60 s. Open F3, **RESET MEASUREMENTS** before step 3 starts, then **COPY PERFORMANCE REPORT** afterwards. Save as `idle`.
4. **Navigation run**: reset, walk normally for 60 s around the starting area (re-using the same route each time), copy report as `walk`.
5. **Streaming run**: reset, walk continuously in a straight line (hold W / Shift) for 60 s so new chunks are generated and old ones retired, copy report as `stream`. Check that the report shows built chunks > 0.
6. Repeat steps 3-5 with **bloom and AO on, then off** (F3 BLOOM / AO checkboxes; both are REALISTIC-profile effects, F4 switches profile). Also run ORIGINAL once as a reference.
7. Compare the reports: paste them into one conversation, labelled by run.

## Interpreting results
| Observation | Likely cause |
|---|---|
| JS time median close to frame-time median, FPS below refresh rate | **CPU-bound** (main thread). Look at which of updateChunks / occFlush / render submit dominates. |
| JS time small (a few ms) but frame time large; GPU sum of medians close to frame time | **GPU-bound**. Compare the `scene`, `bloom`, `post` rows; run again with bloom/AO off to see the delta. |
| JS time small, frame time large, GPU timings N/A | Cannot tell GPU from vsync/compositor in this browser. Compare runs with RES/quality preset and bloom/AO to see whether cost follows pixel count. |
| High draw calls / triangles with high render-submit time | Submission-bound; many small meshes (chunks, furniture) rather than shader cost. |
| P99 / max far above median, spikes classed `streaming`, generation max per frame large | **Streaming problem** (chunk build or disposal on the main thread). Idle run should show none. |
| Spikes classed `idle` that also occur in the idle run | GC, browser or OS, not streaming. Check JS heap trend between runs. |
| Idle run clean but navigation run has spikes without generation | Gameplay/render work (e.g. occupancy texture upload: see occFlush max). |
| Geometries/textures rise steadily across a long streaming run | Possible resource leak. Counts should plateau once the chunk ring is full. |

Reports from different browsers are not comparable in absolute terms (vsync, timer precision, extension support); compare runs from the same setup.

## Known limitations
- Not validated in a real browser by the author of this phase (headless run was not possible in the authoring environment): the GPU timer path in particular needs a first real run on Chrome/Edge (Apple Silicon and Windows) and a Safari check that it reports `N/A` cleanly.
- Measurements are only taken while the overlay is on or F3 is open; F3 being open also changes what is on screen and releases pointer lock, so do not benchmark with F3 open.
- `renderer.info.programs` and `info.memory` are three.js bookkeeping, not driver data. VRAM cannot be measured from WebGL.
- GPU timing is per pass, not per draw; MSAA resolve is part of `scene`.
- Only the `bays` generator is verified; `region`/`legacy` go through the same wrappers but were not exercised.
