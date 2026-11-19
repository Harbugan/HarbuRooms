// Node check of src/perf/profiler.js with a mock renderer / WebGL2 timer-query context. Usage: node tools/perf-check.mjs
import { createProfiler, formatReport, NOOP } from '../src/perf/profiler.js';
import assert from 'node:assert/strict';
let T = 0; const now = () => T;
function mock(withExt) {
  const live = new Set(); let nq = 0, disjoint = false;
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 10, QUERY_RESULT: 11, isContextLost: () => false,
    getExtension: n => (withExt && n === 'EXT_disjoint_timer_query_webgl2') ? ext : null,
    createQuery: () => { const q = { id: ++nq, ready: false, ns: 0, active: false }; live.add(q); return q },
    deleteQuery: q => live.delete(q), beginQuery: (t, q) => { q.active = true }, endQuery: () => { },
    getParameter: p => p === 2 ? (disjoint ? (disjoint = false, true) : false) : 0,
    getQueryParameter: (q, p) => p === 10 ? q.ready : q.ns
  };
  const renderer = { info: { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 3, textures: 2 }, programs: [1, 2], reset() { this.render.calls = 0; this.render.triangles = 0 } }, getContext: () => gl };
  return { renderer, live, setDisjoint: () => { disjoint = true } };
}
let V = 0; // rAF timestamp clock; T (performance.now) is V plus the work done inside the frame
const step = (P, r, dt, cpu, gen = 0) => { V += dt; T = V; P.frameBegin(V); if (gen) P.gen(gen); r.info.render.calls = 100; r.info.render.triangles = 5000; T += cpu; P.frameEnd(42, 1) };

{ // frames, percentiles, spikes, classification
  const { renderer } = mock(false), P = createProfiler(renderer, now);
  P.setActive(true); assert.equal(renderer.info.autoReset, false, 'autoReset off while profiling');
  for (let i = 0; i < 1000; i++) step(P, renderer, 16.7, 3);
  step(P, renderer, 60, 3, 40); step(P, renderer, 120, 3); step(P, renderer, 30, 25); step(P, renderer, 30, 3); step(P, renderer, 16.7, 3);
  const s = P.stats();
  assert.equal(s.n, 1004, 'first frame skipped');
  assert.ok(Math.abs(s.dt.median - 16.7) < 1e-3); assert.ok(s.dt.p99 < 31 && s.dt.max === 120);
  assert.deepEqual(s.spikes.map(x => x.n), [4, 2, 1]);
  assert.deepEqual([s.spikes[0].stream, s.spikes[0].cpu, s.spikes[0].idle], [1, 1, 2], 'stream/cpu/idle classes');
  assert.equal(s.gen.built, 1); assert.equal(s.gen.maxBuildMs, 40); assert.equal(s.calls, 100); assert.equal(s.chunks, 42);
  assert.equal(P.recentSpikes(1)[0].cls, 'cpu');
  assert.equal(s.gpu.supported, false); assert.match(s.gpu.reason, /not supported/);
  const txt = formatReport(P, { date: 'd', userAgent: 'ua', platform: 'p', gpu: null, viewport: '1x1', canvas: '1x1', renderTarget: '1x1', msaa: 4, dpr: 1, rendererDpr: 1, profile: 'REALISTIC', quality: 'high', gen: 'bays', settings: 's' });
  for (const k of ['Frame time ms', 'Draw calls', 'Triangles', 'Geometries', 'Active chunks', 'N/A - ', 'Spikes', 'JS heap', 'frame samples']) assert.ok(txt.includes(k), k);
  assert.ok(!/NaN|undefined/.test(txt), 'no NaN/undefined in report');
  P.reset(); assert.equal(P.stats().n, 0);
  P.setActive(false); assert.equal(renderer.info.autoReset, true, 'autoReset restored');
  const before = P.totals().frames; step(P, renderer, 16, 1); assert.equal(P.totals().frames, before, 'inactive records nothing');
}
{ // 60 s window and bounded ring
  const { renderer } = mock(false), P = createProfiler(renderer, now); P.setActive(true);
  for (let i = 0; i < 40000; i++) step(P, renderer, 2, .1);   // 80 s of 2 ms frames > ring capacity
  let s = P.stats(); assert.equal(s.n, 16384, 'ring capped');
  const { renderer: r2 } = mock(false), P2 = createProfiler(r2, now); P2.setActive(true);
  for (let i = 0; i < 6000; i++) step(P2, r2, 16.7, 3);        // 100 s
  s = P2.stats(); assert.ok(s.n >= 3590 && s.n <= 3600, 'window ~60 s, n=' + s.n); assert.ok(s.spanMs <= 60000 + 20);
  P2.discontinuity(); step(P2, r2, 9000, 3); assert.equal(P2.stats().dt.max < 100, true, 'discontinuity does not create a spike');
}
{ // GPU timer queries
  const m = mock(true), { renderer } = m, P = createProfiler(renderer, now); P.setActive(true);
  assert.equal(m.live.size, 12, '3 passes x 4 queries'); assert.ok(P.gpuState().ok);
  const gpuFrame = () => { V += 16; T = V; P.frameBegin(V); for (let i = 0; i < 3; i++) { P.gpuBegin(i); P.gpuEnd(i) } for (const q of m.live) if (q.active) { q.active = false; q.ready = true; q.ns = (1 + 0) * 2e6 } T += 1; P.frameEnd(1, 0) };
  for (let i = 0; i < 20; i++) gpuFrame();
  let g = P.stats().gpu; assert.ok(g.supported); assert.equal(g.passes[0].name, 'scene'); assert.ok(g.passes.every(p => p.n >= 15 && Math.abs(p.median - 2) < 1e-6), JSON.stringify(g));
  m.setDisjoint(); gpuFrame(); assert.equal(P.stats().gpu.disjoint, 1);
  P.contextLost(); m.live.clear(); /* a lost context destroys its queries */ assert.equal(P.gpuState().ok, false); step(P, renderer, 16, 1); P.contextRestored(); assert.ok(P.gpuState().ok, 're-init after restore');
  P.setActive(false); assert.equal(m.live.size, 0, 'all queries deleted'); assert.equal(renderer.info.autoReset, true);
  // never-ready queries must not leak: pool exhausted -> dropped, still 12 queries
  const m2 = mock(true), P3 = createProfiler(m2.renderer, now); P3.setActive(true);
  for (let i = 0; i < 10; i++) { V += 16; T = V; P3.frameBegin(V); P3.gpuBegin(0); P3.gpuEnd(0); T += 1; P3.frameEnd(1, 0) }
  assert.equal(m2.live.size, 12); assert.ok(P3.stats().gpu.dropped > 0); P3.dispose(); assert.equal(m2.live.size, 0);
}
{ assert.equal(NOOP.on, false); NOOP.frameBegin(); NOOP.gpuBegin(0); assert.equal(NOOP.stats(), null) }
{ // overhead of the hot path (real clock)
  const { renderer } = mock(false); const P = createProfiler(renderer); P.setActive(true);
  const N = 200000, t0 = performance.now(); let t = 0;
  for (let i = 0; i < N; i++) { t += 16.7; P.frameBegin(t); P.enter(0); P.leave(0); P.gen(0); P.frameEnd(1, 0) }
  const per = (performance.now() - t0) / N * 1000;
  const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < N; i++) { t += 16.7; P.frameBegin(t); P.enter(1); P.leave(1); P.frameEnd(1, 0) }
  console.log(`hot path: ${per.toFixed(2)} us/frame; heap delta over ${N} frames: ${((process.memoryUsage().heapUsed - h0) / 1024).toFixed(0)} KB`);
  const t1 = performance.now(); for (let i = 0; i < 20; i++) P.stats(); const t2 = performance.now(); for (let i = 0; i < 20; i++) P.stats(60000, true);
  console.log(`stats(): full ${((t2 - t1) / 20).toFixed(2)} ms, light ${((performance.now() - t2) / 20).toFixed(2)} ms (16384 samples)`);
}
console.log('perf-check OK');
