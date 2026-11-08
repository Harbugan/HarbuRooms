#!/usr/bin/env node
// Checks anomaly 02, THE OBSERVER, without a browser (docs/ANOMALIES.md):
//   timing     - random uniform intervals in [min, max], redrawn after every attempt, only active play counts, auto off = never;
//   placement  - on the real world generator (tools/gen-lib.mjs): every accepted spot is clear of the collision boxes, in an
//                architecturally plausible cell, in the distance band, NOT on screen when it is created, and (type B) has a retreat
//                path that ends fully hidden; invalid situations are rejected instead of forced;
//   lifecycle  - scripted camera turns: removal only while hidden or on a masked frame (fast turn / jolt), visible time is capped,
//                pause / cancel abort cleanly, TEST holds until cancel, the probability roll gives empty attempts;
//   rendering  - figure proportions, fits under the ceiling, one mesh, all geometry disposed (needs three@0.160: set THREE=<path to
//                three.module.js> or have 'three' resolvable; otherwise this part is skipped and reported as SKIP).
//   node tools/observer-sim.mjs [--seed 1] [--poses 300]
import { loadGen, chunkBoxes } from './gen-lib.mjs';
import { createObserver, createObserverTimer, STATE, LURK_MAX } from '../src/anomalies/observer.js';
import * as P from '../src/anomalies/observerPlacement.js';

const argv = process.argv.slice(2), val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? +argv[i + 1] : d; };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mkRng = s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const rng = mkRng(val('seed', 1) * 7919 + 13);
const G = loadGen(), { N } = G, W = P.makeGridWorld({ layout: G.layout, N, doorTop: 2.25 });
const DEG = Math.PI / 180, VFOV = 78 * DEG, HFOV = 2 * Math.atan(Math.tan(VFOV / 2) * 16 / 9);
const baseCfg = { auto: true, minS: 60, maxS: 240, prob: 0.7, maxVis: 0.7, dist: 24, height: 2.85, speed: 1.4 };
const boxesCache = new Map(), boxes = (cx, cz) => { const k = cx + ',' + cz; if (!boxesCache.has(k)) boxesCache.set(k, chunkBoxes(G, cx, cz)); return boxesCache.get(k); };
const insideBox = (x, z, m) => { const cx = Math.floor(x / N), cz = Math.floor(z / N); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const w of boxes(cx + a, cz + b)) if (Math.abs(x - w.x) < w.w / 2 + m && Math.abs(z - w.z) < w.d / 2 + m) return true; return false; };
// a random standing pose for the player: a free cell within ~70 m of spawn
function randomView(r = rng) {
  for (;;) { const x = Math.floor((r() - 0.5) * 140) + 0.5, z = Math.floor((r() - 0.5) * 140) + 0.5; if (insideBox(x, z, 0.37)) continue; return { x, y: 1.7, z, yaw: r() * Math.PI * 2, pitch: 0, hfov: HFOV, vfov: VFOV }; }
}

// ---------------------------------------------------------------- 1. timing
{
  const t = createObserverTimer(mkRng(3)), xs = [];
  for (let i = 0; i < 2000; i++) xs.push(t.draw(60, 240));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  ok(Math.min(...xs) >= 60 && Math.max(...xs) <= 240, `intervals stay in [60, 240] (min ${Math.min(...xs).toFixed(1)}, max ${Math.max(...xs).toFixed(1)})`);
  ok(Math.abs(mean - 150) < 6 && sd > 45, `intervals are uniform-random, not fixed (mean ${mean.toFixed(1)}, sd ${sd.toFixed(1)})`);
  ok(t.draw(200, 100) >= 100 && t.draw(200, 100) <= 200, 'min > max is handled (swapped)');
  t.draw(10, 10); let n = 0; while (!t.advance(0.5)) n++; ok(n === 19, 'timer counts down only when advanced (10 s in 0.5 s steps)');
}
// host for lifecycle tests: real world, scripted view, configurable block
function mkObs(cfg = {}, opts = {}) {
  const c = { ...baseCfg, ...cfg }, view = opts.view || randomView(), host = { cfg: () => c, block: opts.block || (() => ''), world: W, view: () => view, random: opts.random || mkRng(opts.seed || 5) };
  return { c, view, o: createObserver(host), host };
}
{
  const { o } = mkObs({ auto: false }); let attempts = 0;
  for (let i = 0; i < 3600 * 10; i++) { o.tick(0.1, true); attempts = o.stats.attempts; } ok(attempts === 0, 'auto off: no attempt in 1 h');
  const { o: p } = mkObs({ minS: 60, maxS: 60 }); for (let i = 0; i < 6000; i++) p.tick(0.1, false); ok(p.stats.attempts === 0 && Math.abs(p.nextIn - 60) < 1e-9, 'paused / not playing: timer does not advance');
  const { o: q } = mkObs({ minS: 60, maxS: 60 }, { block: () => 'intro running' }); for (let i = 0; i < 6050; i++) q.tick(0.1, true);
  ok(q.stats.attempts >= 10 && q.stats.rejected === q.stats.attempts && q.state === STATE.IDLE && q.stats.lastReason === 'intro running', `blocked host: every attempt rejected with a reason, never a figure (${q.stats.attempts} attempts)`);
  // attempt times are random: gaps between attempts vary inside [min, max]
  const { o: g } = mkObs({ minS: 60, maxS: 240, prob: 0 }, { seed: 11 }); const at = []; let tt = 0, last = 0;
  for (let i = 0; i < 20 * 3600 * 10 && at.length < 60; i++) { g.tick(0.1, true); tt += 0.1; if (g.stats.attempts > at.length) { at.push(tt - last); last = tt; } }
  const mn = Math.min(...at), mx = Math.max(...at), m = at.reduce((a, b) => a + b, 0) / at.length;
  ok(mn >= 59.9 && mx <= 240.2 && mx - mn > 100, `attempt gaps random in [60, 240] (min ${mn.toFixed(0)}, max ${mx.toFixed(0)}, mean ${m.toFixed(0)} s)`);
  ok(g.stats.empty === g.stats.attempts, 'probability 0 %: every attempt is empty (no figure)');
  // probability 70 %: about 30 % empty
  let empty = 0, tot = 0; for (let s = 1; s <= 400; s++) { const { o: e } = mkObs({ minS: 1, maxS: 1, prob: 0.7 }, { seed: s * 31 }); for (let i = 0; i < 12; i++) e.tick(0.1, true); tot += e.stats.attempts; empty += e.stats.empty; }
  ok(Math.abs(empty / tot - 0.3) < 0.06, `visible probability 70 %: ${(100 * empty / tot).toFixed(1)} % of attempts empty`);
}

// ---------------------------------------------------------------- 2. placement on the real generator
{
  const poses = val('poses', 300); let tested = { A: 0, B: 0, test: 0 }, placed = { A: 0, B: 0, test: 0 }, bad = [], reasons = {}, ms = 0;
  const kinds = new Set(), modes = new Set();
  for (let i = 0; i < poses; i++) {
    const v = randomView();
    for (const kind of ['A', 'B', 'test']) {
      tested[kind]++; const t0 = performance.now(), p = P.findPlacement(W, v, kind, { dist: 24, height: 2.85, random: rng }); ms += performance.now() - t0;
      if (!p.ok) { reasons[kind + ': ' + p.reason] = (reasons[kind + ': ' + p.reason] || 0) + 1; continue; }
      placed[kind]++; kinds.add(p.cellKind); modes.add(p.mode);
      const L = P.figureLean(2.85, W.ceil(p.x, p.z)), d = Math.hypot(p.x - v.x, p.z - v.z), err = [];
      if (insideBox(p.x, p.z, 0.2)) err.push('inside / touching a collision box');
      if (P.standCheck(W, p.x, p.z, 2.85, p.yaw)) err.push('standCheck: ' + P.standCheck(W, p.x, p.z, 2.85, p.yaw));
      if (!p.cellKind) err.push('open floor');
      if (d < 14 || d > 35) err.push('distance ' + d.toFixed(1));
      if (L.top > W.ceil(p.x, p.z) - 0.08) err.push('taller than the ceiling');
      if (kind !== 'test' && !P.fullyHidden(W, v, p.x, p.z, L.top)) err.push('on screen when created (pop-in)');
      if (kind === 'test' && P.fullyHidden(W, v, p.x, p.z, L.top)) err.push('test figure not visible');
      if (kind === 'B') {
        const q = p.path; if (!q) err.push('no path');
        else { for (let s = 0; s <= q.len + 1e-6; s += 0.05) { const x = p.x + q.dx * s, z = p.z + q.dz * s; if (insideBox(x, z, 0.15)) { err.push('retreat path through a wall'); break; } }
          if (P.visibleFraction(W, v.x, v.y, v.z, p.x + q.dx * q.len, p.z + q.dz * q.len, L.top, P.HIDE_W) > 0) err.push('retreat end not hidden'); }
      }
      if (err.length) bad.push(`${kind} @${p.x},${p.z} from ${v.x},${v.z}: ${err.join(', ')}`);
    }
  }
  const n = tested.A + tested.B + tested.test;
  ok(bad.length === 0, `every accepted placement valid (${placed.A}/${tested.A} A, ${placed.B}/${tested.B} B, ${placed.test}/${tested.test} test)` + (bad.length ? '\n  ' + bad.slice(0, 8).join('\n  ') : ''));
  ok(placed.A > tested.A * 0.3 && placed.B > tested.B * 0.2, 'both types find placements in a reasonable share of poses');
  ok(modes.has('edge') && modes.has('reveal'), 'both spawn modes occur (edge: ' + modes.has('edge') + ', reveal: ' + modes.has('reveal') + ')');
  ok([...kinds].every(k => P.KIND_SCORE[k] !== undefined) && kinds.size >= 3, 'observation points are doors / corridors / corners / wall ends: ' + [...kinds].join(', '));
  console.log('     rejections: ' + Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k} x${c}`).join('; '));
  console.log(`     mean placement time ${(ms / n).toFixed(2)} ms (Node, once per attempt)`);
  // a pose inside a closed small space / facing a wall: must reject rather than force
  const closed = { ...W, isBuilt: () => false }, v = randomView();
  const r = P.findPlacement(closed, v, 'A', { dist: 24, height: 2.85, random: rng }); ok(!r.ok && typeof r.reason === 'string', 'no built chunks: placement rejected with a reason (' + r.reason + ')');
  ok(P.figureLean(3.4, 2.9).top <= 2.82 && P.figureLean(2.6, 6.6).theta === 0, 'figure stoops / scales under a 2.9 m ceiling, stands upright in the 6.6 m atrium');
}

// ---------------------------------------------------------------- 3. lifecycle with a scripted camera
// The camera turns towards the figure (or stays still). Invariants checked every frame:
//  * the figure is never on screen on the frame it is created;
//  * when it is removed while still (partly) on screen, the frame is masked (mask 'jolt' or a fast turn);
//  * on-screen time stays within the budget (+ mask wait / retreat cap);
//  * the run ends in IDLE with a 'remove' event.
function runScenario(seed, turnRate, stopAt, cfg = {}) {
  const r = mkRng(seed), view = randomView(r), { o } = mkObs({ minS: 1, maxS: 1, prob: 1, ...cfg }, { view, random: r });
  let f = null, spawnHidden = null, seenMax = 0, unmasked = 0, removed = false, dt = 1 / 60, prevYaw = view.yaw, type = null, out = null, sawStates = new Set();
  for (let i = 0; i < 60 * 60 && !removed; i++) {
    // turn towards the figure while one exists
    const fig = o.figure; prevYaw = view.yaw;
    if (fig && turnRate) { const want = Math.atan2(-(fig.x - view.x), -(fig.z - view.z)); let d = want - view.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > stopAt) view.yaw += Math.sign(d) * Math.min(Math.abs(d) - stopAt, turnRate * dt); }
    const turning = Math.abs(view.yaw - prevYaw) / dt;
    f = o.tick(dt, true); sawStates.add(o.state);
    if (!f) continue;
    if (f.events.includes('spawn')) { type = o.figure.type; spawnHidden = P.fullyHidden(W, view, f.x, f.z, P.figureLean(f.height, f.ceil).top); }
    if (o.figure) seenMax = Math.max(seenMax, o.seenTime);
    if (f.events.includes('remove')) {
      removed = true; out = o.stats.lastOutcome;
      // where was it at removal? the previous figure position is the frame before; use the last frame's data via stats
    }
  }
  return { o, type, spawnHidden, seenMax, removed, out, sawStates, view };
}
{
  let runs = 0, spawned = 0, popIn = 0, over = 0, notIdle = 0, types = { A: 0, B: 0 }, outcomes = {}, retreated = 0, seenRuns = 0;
  for (let s = 1; s <= 160; s++) for (const [rate, stop] of [[0, 0], [1.6, 0], [0.35, 20 * DEG], [3, 25 * DEG]]) {
    runs++; const R = runScenario(s * 97 + rate * 13, rate, stop);
    if (!R.type) continue; spawned++; types[R.type]++;
    if (!R.spawnHidden) popIn++;
    if (R.seenMax > 0) seenRuns++;
    const cap = R.type === 'A' ? 0.7 + 0.25 + 0.05 : 0.7 + 0.8 + 0.05;
    if (R.seenMax > cap) over++;
    if (!R.removed || R.o.state !== STATE.IDLE) notIdle++;
    const k = (R.out || '?').replace(/ \(seen.*$/, ''); outcomes[R.type + ': ' + k] = (outcomes[R.type + ': ' + k] || 0) + 1;
    if (/retreated/.test(R.out || '')) retreated++;
  }
  ok(spawned > runs * 0.3, `scripted runs place a figure (${spawned}/${runs}; A ${types.A}, B ${types.B})`);
  ok(popIn === 0, 'no figure is on screen on the frame it is created (pop-in) — ' + popIn + ' violations');
  ok(over === 0, 'on-screen time stays within the visibility budget (+ mask wait / retreat cap) — ' + over + ' violations');
  ok(notIdle === 0, 'every observation ends (removed, back to IDLE) — ' + notIdle + ' did not');
  ok(seenRuns > 0 && retreated > 0, `figures are actually seen (${seenRuns} runs) and type B retreats out of sight (${retreated} runs)`);
  console.log('     outcomes: ' + Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} x${c}`).join('; '));
}
// removal safety, checked frame by frame: removal while (partly) on screen only with a mask
{
  let removals = 0, unsafe = 0, masked = 0;
  for (let s = 1; s <= 200; s++) for (const [rate, stop] of [[0.35, 15 * DEG], [0, 0], [2.2, 0]]) {
    const r = mkRng(s * 131 + 7), view = randomView(r), { o } = mkObs({ minS: 1, maxS: 1, prob: 1 }, { view, random: r }); let prevYaw = view.yaw;
    for (let i = 0; i < 60 * 40; i++) {
      const fig = o.figure; prevYaw = view.yaw;
      if (fig && rate) { const want = Math.atan2(-(fig.x - view.x), -(fig.z - view.z)); let d = want - view.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > stop) view.yaw += Math.sign(d) * Math.min(Math.abs(d) - stop, rate / 60); }
      const turn = Math.abs(view.yaw - prevYaw) * 60, f = o.tick(1 / 60, true);
      if (f && f.events.includes('remove') && f.last) { // position on the removal frame (a retreating figure has already moved)
        removals++; const hidden = P.fullyHidden(W, view, f.last.x, f.last.z, P.figureLean(2.85, W.ceil(f.last.x, f.last.z)).top);
        if (!hidden) { if (f.mask === 'jolt' || turn > 0.6) masked++; else unsafe++; }
        break;
      }
    }
  }
  ok(removals > 50 && unsafe === 0, `removal is hidden or masked (${removals} removals, ${masked} masked by jolt / fast turn, ${unsafe} unmasked while visible)`);
}
// pause, cancel, TEST, manual trigger
{
  let r = null, o = null;
  for (let s = 1; s < 80 && !(o && o.state === STATE.LURKING); s++) { r = mkObs({ minS: 1, maxS: 1, prob: 1 }, { seed: s * 17 }); o = r.o; for (let i = 0; i < 70; i++) o.tick(1 / 60, true); }
  ok(o.state === STATE.LURKING, 'a placed figure waits unseen (LURKING)');
  const f = o.tick(1 / 60, false); ok(o.state === STATE.IDLE && f && !f.show && f.events.includes('remove'), 'pause / menu / F3 aborts the observation and removes the figure');
  ok(o.tick(1 / 60, false) === null, 'nothing happens while paused afterwards');
  let ttt = 0; while (o.state === STATE.IDLE && ttt < 10) { o.tick(1 / 60, true); ttt += 1 / 60; }
  o.cancel(); ok(o.state === STATE.IDLE && !o.figure, 'cancel() returns to IDLE with no figure');
  // LURK timeout: a figure the player never looks at is removed silently
  let lurkOk = false;
  for (let s = 1; s < 60 && !lurkOk; s++) { const q = mkObs({ minS: 1, maxS: 1, prob: 1 }, { seed: s * 23 }); for (let i = 0; i < 70; i++) q.o.tick(1 / 60, true);
    if (q.o.state !== STATE.LURKING) continue; const fg = q.o.figure; q.view.yaw = Math.atan2(fg.x - q.view.x, fg.z - q.view.z); // turn the back to it
    for (let i = 0; i < 60 * (LURK_MAX + 2); i++) q.o.tick(1 / 60, true); if (q.o.stats.unseen > 0 && q.o.stats.seen === 0) lurkOk = true; }
  ok(lurkOk, 'an unseen figure is removed after the lurk timeout (counted as unseen)');
  // TEST: held while paused, cleared by cancel
  let t = null; for (let s = 1; s < 40; s++) { t = mkObs({}, { seed: s * 3 }); if (!t.o.forceVisible()) break; }
  ok(t.o.state === STATE.TEST && t.o.frame().show, 'FORCE VISIBLE places a test figure');
  for (let i = 0; i < 300; i++) t.o.tick(1 / 60, false); ok(t.o.state === STATE.TEST, 'test figure is held while paused / F3 open');
  for (let i = 0; i < 600; i++) t.o.tick(1 / 60, true); ok(t.o.state === STATE.TEST, 'test figure is never removed by the lifecycle');
  t.o.cancel(); ok(t.o.state === STATE.IDLE && !t.o.frame().show, 'ABORT clears the test figure');
  // manual trigger: refused when blocked, otherwise an attempt on the next playing frame without the probability roll
  const b = mkObs({ prob: 0 }, { block: () => 'another anomaly is active' }); ok(b.o.trigger() === 'another anomaly is active', 'manual trigger refused while another anomaly runs');
  let man = 0, placed = 0; for (let s = 1; s <= 40; s++) { const m = mkObs({ prob: 0, auto: false }, { seed: s * 41 }); if (m.o.trigger()) continue; m.o.tick(1 / 60, false); m.o.tick(1 / 60, true); man++; if (m.o.figure) placed++; if (m.o.stats.empty) placed = -999; }
  ok(placed > 0, `manual trigger ignores the probability roll and the auto switch (${placed}/${man} placed, rest rejected for lack of a valid spot)`);
}

// ---------------------------------------------------------------- 4. rendering + cleanup (needs three)
{
  let THREE = null;
  try { THREE = await import(process.env.THREE || 'three'); } catch (e) { THREE = null; }
  if (!THREE) console.log('SKIP rendering checks (three not found; run with THREE=/path/to/three.module.js)');
  else {
    const { buildObserverGeometry, createObserverRenderer } = await import('../src/anomalies/observerFigure.js');
    const g = buildObserverGeometry(THREE, { height: 2.85, ceil: 2.9, seed: 0.3 }), bb = g.boundingBox;
    ok(bb.max.y <= 2.82 + 1e-3 && bb.max.y > 2.7, `figure fits under a 2.9 m ceiling (top ${bb.max.y.toFixed(3)} m)`);
    ok(bb.max.x - bb.min.x < 0.5, `unnaturally narrow (width ${(bb.max.x - bb.min.x).toFixed(2)} m incl. arms)`);
    const g2 = buildObserverGeometry(THREE, { height: 3.1, ceil: 6.6, seed: 0.7 }); ok(Math.abs(g2.boundingBox.max.y - 3.1) < 0.02, `upright at full height under a high ceiling (${g2.boundingBox.max.y.toFixed(2)} m)`);
    ok(g.attributes.position.count < 3000 && g.index.count / 3 < 4000, `low poly: ${g.attributes.position.count} vertices, ${g.index.count / 3} triangles`);
    g.dispose(); g2.dispose();
    const scene = new THREE.Scene(), live = new Set(), wrap = THREE.BufferGeometry.prototype.dispose;
    const R = createObserverRenderer(THREE, { scene, lightAt: () => 0.8 });
    const fr = (x, h = 2.85) => ({ show: true, x, z: 3, yaw: 0.4, height: h, ceil: 2.9, seed: 0.2 });
    R.update(fr(1)); ok(scene.children.length === 1 && R.stats.builds === 1, 'one mesh in the scene while shown');
    for (let i = 0; i < 50; i++) R.update(fr(1 + i * 0.03)); ok(R.stats.builds === 1, 'moving the figure does not rebuild geometry');
    const c = R.mesh.geometry.attributes.color.array; ok(c.every(v => Math.abs(v - 0.8) < 1e-6), 'vertex colours carry the baked light level');
    R.update(fr(2, 3.0)); ok(R.stats.builds === 2 && R.stats.disposals === 1 && scene.children.length === 1, 'height change rebuilds and disposes the old geometry');
    for (let i = 0; i < 200; i++) { R.update(fr(i, 2.6 + (i % 7) * 0.1)); if (i % 3 === 0) R.update({ show: false }); }
    R.update({ show: false }); ok(scene.children.length === 0 && R.stats.builds === R.stats.disposals, `hide removes the mesh; every built geometry disposed (${R.stats.builds} built, ${R.stats.disposals} disposed)`);
    R.dispose(); ok(!R.mesh, 'dispose() leaves nothing behind');
    void live; void wrap;
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
