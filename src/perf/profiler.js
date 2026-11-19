// Lightweight performance profiler (docs/PERFORMANCE.md). Measures only; never changes rendering, gameplay or world generation.
// - Bounded ring buffers (typed arrays, allocated once). No per-frame allocation in the hot path.
// - Records only while "active" (overlay visible or F3 open). When inactive every hot-path call returns immediately,
//   renderer.info.autoReset is restored and all GPU timer queries are deleted.
// - GPU timing uses EXT_disjoint_timer_query_webgl2 only. Without it GPU values are reported as N/A (never CPU time).
export const CAP = 16384;            // frame rows kept (>= 60 s at 240 Hz); the window is the lesser of WINDOW_MS and what fits
export const WINDOW_MS = 60000;      // measurement period used for statistics and the report
export const SPIKE_MS = [25, 50, 100];
const SPIKE_LOG = 48;                // last N spikes >= 25 ms, with their surrounding CPU work
const GPU_PASSES = ['scene', 'bloom', 'post'];
const POOL = 4;                      // queries in flight per pass
// slots for enter()/leave(): CPU time inside a code region, summed per frame
export const SLOT = { STREAM: 0, OCC: 1, RENDER: 2, GEN: 3, RETIRE: 4 };
// frame classification stored per row (see docs): 0 none, 1 streaming-coincident, 2 CPU-heavy (non-streaming), 3 CPU idle (GPU / vsync / GC / browser)
export const CLS = ['', 'streaming', 'cpu', 'idle'];

const f64 = n => new Float64Array(n), f32 = n => new Float32Array(n);

export function createProfiler(renderer, now = () => performance.now()) {
  const R = {
    t: f64(CAP), dt: f32(CAP), cpu: f32(CAP), stream: f32(CAP), occ: f32(CAP), rend: f32(CAP),
    gen: f32(CAP), genMax: f32(CAP), ret: f32(CAP),
    calls: new Uint32Array(CAP), tris: new Uint32Array(CAP), chunks: new Uint16Array(CAP),
    built: new Uint8Array(CAP), removed: new Uint8Array(CAP), cls: new Uint8Array(CAP)
  };
  let head = 0, count = 0;           // next write index, rows stored
  const scratch = f32(CAP);          // sort buffer for percentiles
  const tmp = f64(8), acc = f32(8);  // enter() timestamps / per-frame accumulators
  let genMax = 0, built = 0, removed = 0;
  let lastNow = 0, skip = true, frameStart = 0, curDt = 0;
  let prev = { cpu: 0, gen: 0, ret: 0, stream: 0, occ: 0, built: 0, removed: 0 };
  const spikesCum = [0, 0, 0], spikeStreamCum = [0, 0, 0];
  let framesTotal = 0, discont = 0, startedAt = now();
  const spikeLog = { t: f64(SPIKE_LOG), v: f32(SPIKE_LOG * 8), cls: new Uint8Array(SPIKE_LOG), built: new Uint8Array(SPIKE_LOG), removed: new Uint8Array(SPIKE_LOG), head: 0, count: 0 };
  const P = { on: false, ctxLost: false, last: { calls: 0, tris: 0, geometries: 0, textures: 0, programs: 0, chunks: 0, queue: 0 } };

  // ---- GPU timer queries ----
  const G = { ok: false, reason: 'not started', gl: null, ext: null, pass: GPU_PASSES.map(() => null), dropped: 0, disjoint: 0 };
  const mkRing = () => ({ v: f32(CAP), t: f64(CAP), head: 0, count: 0 });
  const gpuRings = GPU_PASSES.map(mkRing);
  function gpuInit() {
    gpuDispose();
    try {
      const gl = renderer.getContext();
      if (!gl || (gl.isContextLost && gl.isContextLost())) { G.reason = 'context lost'; return }
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext || typeof gl.createQuery !== 'function') { G.reason = 'EXT_disjoint_timer_query_webgl2 not supported by this browser/GPU'; return }
      G.gl = gl; G.ext = ext;
      G.pass = GPU_PASSES.map(() => ({ q: Array.from({ length: POOL }, () => gl.createQuery()), busy: new Uint8Array(POOL), cur: -1 }));
      G.ok = true; G.reason = 'supported';
    } catch (e) { G.ok = false; G.reason = 'init failed: ' + (e && e.message || e) }
  }
  function gpuDispose() {
    if (G.gl && !P.ctxLost) {
      try { for (const p of G.pass) if (p) { if (p.cur >= 0) { try { G.gl.endQuery(G.ext.TIME_ELAPSED_EXT) } catch (e) { } } for (const q of p.q) G.gl.deleteQuery(q) } } catch (e) { }
    }
    G.pass = GPU_PASSES.map(() => null); G.gl = null; G.ext = null; G.ok = false;
  }
  function gpuPoll() {
    if (!G.ok) return;
    const gl = G.gl, ext = G.ext;
    try {
      let any = false;
      for (const p of G.pass) for (let k = 0; k < POOL; k++) if (p.busy[k]) { any = true; break }
      if (!any) return;
      const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT); // also clears the flag
      if (disjoint) G.disjoint++;
      const t = now();
      for (let i = 0; i < G.pass.length; i++) {
        const p = G.pass[i], ring = gpuRings[i];
        for (let k = 0; k < POOL; k++) {
          if (!p.busy[k] || !gl.getQueryParameter(p.q[k], gl.QUERY_RESULT_AVAILABLE)) continue;
          if (!disjoint) {
            const ms = gl.getQueryParameter(p.q[k], gl.QUERY_RESULT) / 1e6;
            ring.v[ring.head] = ms; ring.t[ring.head] = t; ring.head = (ring.head + 1) % CAP; if (ring.count < CAP) ring.count++;
          }
          p.busy[k] = 0;
        }
      }
    } catch (e) { G.ok = false; G.reason = 'query error: ' + (e && e.message || e) }
  }
  function gpuBegin(i) {
    if (!P.on || !G.ok) return;
    const p = G.pass[i]; if (!p || p.cur >= 0) return;
    let k = -1; for (let j = 0; j < POOL; j++) if (!p.busy[j]) { k = j; break }
    if (k < 0) { G.dropped++; return }
    try { G.gl.beginQuery(G.ext.TIME_ELAPSED_EXT, p.q[k]); p.cur = k } catch (e) { G.ok = false; G.reason = 'beginQuery failed' }
  }
  function gpuEnd(i) {
    if (!G.ok) return;
    const p = G.pass[i]; if (!p || p.cur < 0) return;
    try { G.gl.endQuery(G.ext.TIME_ELAPSED_EXT); p.busy[p.cur] = 1 } catch (e) { G.ok = false; G.reason = 'endQuery failed' }
    p.cur = -1;
  }

  function setActive(on) {
    on = !!on; if (on === P.on) return;
    P.on = on;
    if (on) {
      renderer.info.autoReset = false;     // several renderer.render() calls per frame (scene, bloom blits, post): reset once per frame ourselves
      renderer.info.reset();
      skip = true; lastNow = 0;
      if (!P.ctxLost) gpuInit();
    } else {
      renderer.info.autoReset = true;
      gpuDispose();
    }
  }

  // ---- hot path (called from frame()) ----
  function frameBegin(t) {
    if (!P.on) return;
    frameStart = now();
    curDt = lastNow && !skip ? t - lastNow : 0;
    lastNow = t; skip = false;
    if (!P.ctxLost) { renderer.info.reset(); gpuPoll() }
  }
  function enter(slot) { if (P.on) tmp[slot] = now() }
  function leave(slot) { if (P.on) acc[slot] += now() - tmp[slot] }
  function gen(ms) { if (!P.on) return; acc[SLOT.GEN] += ms; built++; if (ms > genMax) genMax = ms }
  function retire(ms) { if (!P.on) return; acc[SLOT.RETIRE] += ms; removed++ }
  function frameEnd(chunkCount, queueLen) {
    if (!P.on || P.ctxLost) return;
    const t = now(), cpu = t - frameStart, info = renderer.info;
    // renderer.info is read here: after the scene, bloom and post passes, so all of them are included.
    P.last.calls = info.render.calls; P.last.tris = info.render.triangles;
    P.last.geometries = info.memory.geometries; P.last.textures = info.memory.textures;
    P.last.programs = info.programs ? info.programs.length : 0;
    P.last.chunks = chunkCount; P.last.queue = queueLen;
    if (curDt > 0) {
      const dt = curDt;
      // The interval ending at this frame's rAF timestamp was caused by the work of the PREVIOUS frame.
      let c = 0;
      if (dt >= SPIKE_MS[0]) {
        const stream = prev.gen + prev.ret;
        c = stream >= 0.25 * dt ? 1 : prev.cpu >= 0.7 * dt ? 2 : 3;
        for (let k = 0; k < 3; k++) if (dt >= SPIKE_MS[k]) { spikesCum[k]++; if (c === 1) spikeStreamCum[k]++ }
        const s = spikeLog, i = s.head, o = i * 8;
        s.t[i] = t; s.v[o] = dt; s.v[o + 1] = prev.cpu; s.v[o + 2] = prev.stream; s.v[o + 3] = prev.gen; s.v[o + 4] = prev.ret; s.v[o + 5] = prev.occ; s.v[o + 6] = cpu; s.v[o + 7] = 0;
        s.cls[i] = c; s.built[i] = prev.built; s.removed[i] = prev.removed;
        s.head = (i + 1) % SPIKE_LOG; if (s.count < SPIKE_LOG) s.count++;
      }
      const h = head;
      R.t[h] = t; R.dt[h] = dt; R.cpu[h] = cpu; R.stream[h] = acc[SLOT.STREAM]; R.occ[h] = acc[SLOT.OCC]; R.rend[h] = acc[SLOT.RENDER];
      R.gen[h] = acc[SLOT.GEN]; R.genMax[h] = genMax; R.ret[h] = acc[SLOT.RETIRE];
      R.calls[h] = P.last.calls; R.tris[h] = P.last.tris; R.chunks[h] = chunkCount;
      R.built[h] = built > 255 ? 255 : built; R.removed[h] = removed > 255 ? 255 : removed; R.cls[h] = c;
      head = (h + 1) % CAP; if (count < CAP) count++; framesTotal++;
    }
    prev.cpu = cpu; prev.gen = acc[SLOT.GEN]; prev.ret = acc[SLOT.RETIRE]; prev.stream = acc[SLOT.STREAM]; prev.occ = acc[SLOT.OCC]; prev.built = built; prev.removed = removed;
    acc.fill(0); genMax = 0; built = 0; removed = 0;
  }

  // ---- statistics (called ~2x/s while visible, or when copying the report) ----
  function sortedWindow(arr, from, n, out) { // gather window rows (oldest -> newest) into scratch, sorted ascending
    for (let i = 0; i < n; i++) scratch[i] = arr[(from + i) % CAP];
    const v = scratch.subarray(0, n); v.sort(); return v;
  }
  const pct = (v, p) => v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN;
  function windowRange(t, windowMs) { // returns [startIndex, n] of rows with time >= t - windowMs
    const cutoff = t - windowMs; let lo = 0, hi = count; // rows are time-ordered, binary search first row >= cutoff
    const base = (head - count + CAP) % CAP;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (R.t[(base + mid) % CAP] < cutoff) lo = mid + 1; else hi = mid }
    return [(base + lo) % CAP, count - lo];
  }
  function series(arr, from, n) {
    if (!n) return { n: 0, mean: NaN, median: NaN, p95: NaN, p99: NaN, max: NaN };
    let sum = 0, max = -Infinity; for (let i = 0; i < n; i++) { const x = arr[(from + i) % CAP]; sum += x; if (x > max) max = x }
    const v = sortedWindow(arr, from, n);
    return { n, mean: sum / n, median: pct(v, .5), p95: pct(v, .95), p99: pct(v, .99), max };
  }
  // light = only what the on-screen overlay needs (one sort)
  function stats(windowMs = WINDOW_MS, light = false) {
    const t = now(), [from, n] = windowRange(t, windowMs);
    const out = { windowMs, n, spanMs: 0, fpsAvg: NaN, fpsNow: NaN, dt: series(R.dt, from, n), calls: P.last.calls, tris: P.last.tris, geometries: P.last.geometries, textures: P.last.textures, chunks: P.last.chunks, queue: P.last.queue, ctxLost: P.ctxLost };
    if (n) { out.spanMs = t - R.t[from]; out.fpsAvg = 1000 / out.dt.mean }
    { let c = 0, s = 0; for (let i = n - 1; i >= 0; i--) { const idx = (from + i) % CAP; if (t - R.t[idx] > 1000) break; c++; s += R.dt[idx] } out.fpsNow = c ? 1000 * c / s : NaN }
    if (light) return out;
    out.cpu = series(R.cpu, from, n); out.stream = series(R.stream, from, n); out.occ = series(R.occ, from, n); out.rend = series(R.rend, from, n);
    out.callsS = series(R.calls, from, n); out.trisS = series(R.tris, from, n); out.chunksS = series(R.chunks, from, n);
    // spikes in window, per threshold, with how many coincided with streaming; frames spent in streaming
    out.spikes = SPIKE_MS.map(() => ({ n: 0, stream: 0, cpu: 0, idle: 0 }));
    let genMs = 0, retMs = 0, built = 0, removedN = 0, genMaxV = 0, genFrames = 0;
    for (let i = 0; i < n; i++) {
      const idx = (from + i) % CAP, dt = R.dt[idx];
      for (let k = 0; k < 3; k++) if (dt >= SPIKE_MS[k]) { const s = out.spikes[k]; s.n++; const c = R.cls[idx]; if (c === 1) s.stream++; else if (c === 2) s.cpu++; else if (c === 3) s.idle++ }
      genMs += R.gen[idx]; retMs += R.ret[idx]; built += R.built[idx]; removedN += R.removed[idx]; if (R.gen[idx] > 0) genFrames++; if (R.genMax[idx] > genMaxV) genMaxV = R.genMax[idx];
    }
    out.gen = { totalMs: genMs, retireMs: retMs, built, removed: removedN, maxBuildMs: genMaxV, avgBuildMs: built ? genMs / built : NaN, framesWithGen: genFrames, maxFrameMs: n ? series(R.gen, from, n).max : NaN, retireMaxFrameMs: n ? series(R.ret, from, n).max : NaN };
    out.gpu = gpuStats(t, windowMs);
    return out;
  }
  function gpuStats(t, windowMs) {
    const res = { supported: G.ok, reason: G.reason, disjoint: G.disjoint, dropped: G.dropped, passes: [] };
    if (!G.ok) return res;
    const cutoff = t - windowMs;
    for (let i = 0; i < GPU_PASSES.length; i++) {
      const r = gpuRings[i], base = (r.head - r.count + CAP) % CAP; let k = 0;
      for (let j = 0; j < r.count; j++) { const idx = (base + j) % CAP; if (r.t[idx] >= cutoff) scratch[k++] = r.v[idx] }
      if (!k) { res.passes.push({ name: GPU_PASSES[i], n: 0 }); continue }
      let sum = 0, max = -Infinity; for (let j = 0; j < k; j++) { sum += scratch[j]; if (scratch[j] > max) max = scratch[j] }
      const v = scratch.subarray(0, k); v.sort();
      res.passes.push({ name: GPU_PASSES[i], n: k, mean: sum / k, median: pct(v, .5), p95: pct(v, .95), max });
    }
    return res;
  }
  function recentSpikes(limit = 12) { // newest first
    const s = spikeLog, out = [];
    for (let j = 0; j < Math.min(limit, s.count); j++) {
      const i = (s.head - 1 - j + SPIKE_LOG) % SPIKE_LOG, o = i * 8;
      out.push({ ageS: (now() - s.t[i]) / 1000, dt: s.v[o], prevCpu: s.v[o + 1], stream: s.v[o + 2], gen: s.v[o + 3], retire: s.v[o + 4], occ: s.v[o + 5], cpu: s.v[o + 6], cls: CLS[s.cls[i]], built: s.built[i], removed: s.removed[i] });
    }
    return out;
  }
  function heap() {
    const m = typeof performance !== 'undefined' && performance.memory;
    return m && m.usedJSHeapSize ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null;
  }
  function reset() {
    head = 0; count = 0; framesTotal = 0; spikesCum.fill(0); spikeStreamCum.fill(0); spikeLog.head = 0; spikeLog.count = 0; discont = 0;
    for (const r of gpuRings) { r.head = 0; r.count = 0 }
    G.dropped = 0; G.disjoint = 0; acc.fill(0); genMax = 0; built = 0; removed = 0; startedAt = now(); skip = true;
    prev = { cpu: 0, gen: 0, ret: 0, stream: 0, occ: 0, built: 0, removed: 0 };
  }
  // discontinuity (tab hidden, long pause): drop the next interval instead of recording one huge fake spike
  function discontinuity() { skip = true; discont++ }
  function contextLost() { P.ctxLost = true; G.pass = GPU_PASSES.map(() => null); G.gl = null; G.ext = null; G.ok = false; G.reason = 'WebGL context lost'; skip = true }
  function contextRestored() { P.ctxLost = false; skip = true; lastNow = 0; if (P.on) { renderer.info.autoReset = false; renderer.info.reset(); gpuInit() } }

  return {
    get on() { return P.on }, get ctxLost() { return P.ctxLost },
    setActive, frameBegin, frameEnd, enter, leave, gen, retire, gpuBegin, gpuEnd,
    stats, recentSpikes, heap, reset, discontinuity, contextLost, contextRestored, dispose: () => { setActive(false) },
    gpuState: () => ({ ok: G.ok, reason: G.reason }),
    totals: () => ({ frames: framesTotal, spikes: spikesCum.slice(), spikesStreaming: spikeStreamCum.slice(), discontinuities: discont, sinceMs: now() - startedAt }),
    CAP, WINDOW_MS, SPIKE_MS, GPU_PASSES
  };
}

// No-op stand-in used when the module cannot be loaded (e.g. offline file://); keeps the call sites unconditional.
export const NOOP = Object.freeze({
  on: false, ctxLost: false, setActive() { }, frameBegin() { }, frameEnd() { }, enter() { }, leave() { }, gen() { }, retire() { }, gpuBegin() { }, gpuEnd() { },
  stats: () => null, recentSpikes: () => [], heap: () => null, reset() { }, discontinuity() { }, contextLost() { }, contextRestored() { }, dispose() { },
  gpuState: () => ({ ok: false, reason: 'profiler module not loaded' }), totals: () => ({ frames: 0, spikes: [0, 0, 0], spikesStreaming: [0, 0, 0], discontinuities: 0, sinceMs: 0 }),
  CAP, WINDOW_MS, SPIKE_MS, GPU_PASSES, unavailable: true
});

// ---- report text (pure: environment/context is supplied by the caller) ----
const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : 'n/a';
export function formatReport(P, env) {
  const s = P.stats(WINDOW_MS, false), L = [], tot = P.totals();
  L.push('# HarbuRooms performance report');
  L.push(`Date: ${env.date}`);
  L.push(`Browser: ${env.userAgent}`);
  L.push(`Platform: ${env.platform}`);
  L.push(`GPU (unmasked renderer, if exposed): ${env.gpu || 'n/a'}`);
  L.push(`Viewport: ${env.viewport} CSS px | canvas drawing buffer: ${env.canvas} | scene render target: ${env.renderTarget} (MSAA ${env.msaa}x)`);
  L.push(`Device pixel ratio: ${env.dpr} | renderer pixel ratio: ${env.rendererDpr}`);
  L.push(`Render profile: ${env.profile} | quality preset: ${env.quality} | world generator: ${env.gen}`);
  L.push(`Graphics settings: ${env.settings}`);
  L.push('');
  if (!s || !s.n) { L.push('NO SAMPLES: open the overlay (F3 > PERFORMANCE) or keep F3 open for a while before copying.'); return L.join('\n') }
  L.push(`## Measurement period`);
  L.push(`Window: last ${WINDOW_MS / 1000} s requested, ${f(s.spanMs / 1000, 1)} s covered, ${s.n} frame samples (ring buffer holds ${P.CAP}). Samples are only recorded while the overlay is on or F3 is open.`);
  L.push(`Since last reset: ${tot.frames} frames, ${f(tot.sinceMs / 1000, 1)} s, ${tot.discontinuities} discontinuities (tab hidden) skipped. Interval = rAF timestamp to rAF timestamp.`);
  L.push('');
  L.push('## Frame rate and frame time');
  L.push(`FPS: now ${f(s.fpsNow, 1)} | average ${f(s.fpsAvg, 1)}`);
  L.push(`Frame time ms: median ${f(s.dt.median)} | P95 ${f(s.dt.p95)} | P99 ${f(s.dt.p99)} | mean ${f(s.dt.mean)} | max ${f(s.dt.max)}`);
  L.push(`Main-thread (JS) time per frame ms: median ${f(s.cpu.median)} | P95 ${f(s.cpu.p95)} | max ${f(s.cpu.max)}  (CPU submit time only; not GPU time)`);
  L.push(`  of which: updateChunks median ${f(s.stream.median)} P95 ${f(s.stream.p95)} max ${f(s.stream.max)} | occFlush median ${f(s.occ.median)} P95 ${f(s.occ.p95)} max ${f(s.occ.max)} | render submit median ${f(s.rend.median)} P95 ${f(s.rend.p95)} max ${f(s.rend.max)}`);
  L.push('');
  L.push('## Renderer (three.js renderer.info, summed over scene + bloom + post passes of one frame)');
  L.push(`Draw calls: now ${s.calls} | median ${f(s.callsS.median, 0)} | max ${f(s.callsS.max, 0)}`);
  L.push(`Triangles: now ${s.tris} | median ${f(s.trisS.median, 0)} | max ${f(s.trisS.max, 0)}`);
  L.push(`Geometries: ${s.geometries} | Textures: ${s.textures}  (three.js object counts, NOT GPU memory)`);
  const h = P.heap();
  L.push(`JS heap: ${h ? `${f(h.used / 1048576, 1)} MB used / ${f(h.total / 1048576, 1)} MB allocated (limit ${f(h.limit / 1048576, 0)} MB) - Chromium performance.memory, coarse` : 'N/A (not supported by this browser)'}`);
  L.push('');
  L.push('## World streaming');
  L.push(`Active chunks: now ${s.chunks} | median ${f(s.chunksS.median, 0)} | max ${f(s.chunksS.max, 0)} | queued now ${s.queue}`);
  L.push(`Chunk generation (addChunk CPU time, incl. layout): ${s.gen.built} built, total ${f(s.gen.totalMs, 1)} ms, avg ${f(s.gen.avgBuildMs)} ms, max single ${f(s.gen.maxBuildMs)} ms, max per frame ${f(s.gen.maxFrameMs)} ms, frames with generation ${s.gen.framesWithGen}`);
  L.push(`Chunk retirement (removeChunk + geometry dispose): ${s.gen.removed} removed, total ${f(s.gen.retireMs, 1)} ms, max per frame ${f(s.gen.retireMaxFrameMs)} ms`);
  L.push('');
  L.push('## GPU timings (EXT_disjoint_timer_query_webgl2)');
  if (!s.gpu.supported) L.push(`N/A - ${s.gpu.reason}`);
  else {
    for (const p of s.gpu.passes) L.push(p.n ? `${p.name}: median ${f(p.median)} ms | P95 ${f(p.p95)} | mean ${f(p.mean)} | max ${f(p.max)} | ${p.n} samples` : `${p.name}: no samples${p.name === 'bloom' ? ' (bloom inactive in this profile/setting)' : ''}`);
    const sum = s.gpu.passes.reduce((a, p) => a + (p.n ? p.median : 0), 0);
    L.push(`Sum of pass medians (approx. GPU frame cost, excludes browser compositing/present): ${f(sum)} ms | disjoint events ${s.gpu.disjoint} | dropped queries ${s.gpu.dropped}`);
  }
  L.push('');
  L.push('## Spikes (frame interval)');
  s.spikes.forEach((x, k) => L.push(`>= ${P.SPIKE_MS[k]} ms: ${x.n} in window (streaming-coincident ${x.stream}, CPU-heavy ${x.cpu}, CPU-idle ${x.idle}) | since reset ${tot.spikes[k]} (streaming ${tot.spikesStreaming[k]})`));
  L.push('Class: streaming = generation+retirement >= 25% of the interval; cpu = previous-frame JS time >= 70% of interval; idle = JS was mostly idle (GPU, vsync, GC or browser). Work of the frame BEFORE the interval is attributed.');
  const sp = P.recentSpikes(12);
  if (sp.length) { L.push('Latest spikes (newest first), ms:'); for (const x of sp) L.push(`  ${f(x.ageS, 1)} s ago: interval ${f(x.dt, 1)} | prev frame JS ${f(x.prevCpu, 1)} (updateChunks ${f(x.stream, 1)}, gen ${f(x.gen, 1)} [${x.built} built], retire ${f(x.retire, 1)} [${x.removed} removed], occ ${f(x.occ, 1)}) -> ${x.cls}`) }
  else L.push('No spikes recorded.');
  if (s.ctxLost) L.push('\nWARNING: WebGL context is currently lost; values are stale.');
  return L.join('\n');
}
