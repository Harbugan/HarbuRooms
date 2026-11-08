#!/usr/bin/env node
// Checks the Encroaching Darkness state machine (src/anomalies/encroachingDarkness.js) without a browser:
// lifecycle order, spread duration, monotonic progress, reset only while the lids are fully closed, camera offsets end at exactly 0,
// pause freezes everything, no automatic start during grace / when disabled / when the host refuses, and the hazard is not a fixed timer.
//   node tools/anomaly-sim.mjs
import { createEncroachingDarkness, STATE, jerkEnvelope, GRACE_S } from '../src/anomalies/encroachingDarkness.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const mkRng = s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const baseCfg = { auto: false, meanMin: 15, intensity: 1, spread: 25, snap: 1, blink: 0.3, softness: 0.3, seedWeight: 0.4 };
const mk = (cfg = {}, can = () => true, seed = 1) => { const c = { ...baseCfg, ...cfg }; return { c, a: createEncroachingDarkness({ cfg: () => c, canStart: can, random: mkRng(seed) }) }; };

// 1. full run
{
  const { a } = mk(); ok(a.trigger(), 'manual trigger starts'); ok(!a.trigger(), 'second trigger refused while running');
  const dt = 1 / 60, order = [], seen = []; let prog = 0, mono = true, maxProg = 0, lidClosedAtReset = null, resetFrame = null, camMax = 0, t = 0, idleAt = null, gasps = 0, darkSeenAfterReset = false;
  let lastCamNonZeroT = 0, lidOpenT = null, lastState = null;
  for (let i = 0; i < 60 * 60; i++) {
    const f = a.tick(dt, true); t += dt; if (!f) { if (a.state === STATE.IDLE && idleAt === null) idleAt = t; continue; }
    if (f.state !== lastState) { order.push(f.state); lastState = f.state; }
    if (f.state !== STATE.SNAP_OUT && f.state !== STATE.RECOVERY && f.state !== STATE.IDLE) { if (f.progress < prog - 1e-9) mono = false; prog = f.progress; maxProg = Math.max(maxProg, f.progress); }
    if (f.events.includes('gasp')) gasps++;
    if (f.events.includes('reset')) { resetFrame = f; lidClosedAtReset = f.lid; }
    if (resetFrame && f.on) darkSeenAfterReset = true;
    // while any darkness is still on in SNAP_OUT before reset, lid must not be 0 at the reset frame; after reset progress must be 0
    if (f.state === STATE.SNAP_OUT && resetFrame && f.progress !== 0) darkSeenAfterReset = true;
    camMax = Math.max(camMax, Math.hypot(f.cam.yaw, f.cam.pitch, f.cam.roll));
    if (f.cam.yaw || f.cam.pitch || f.cam.roll) lastCamNonZeroT = t;
    if (f.state === STATE.SNAP_OUT && f.lid > 0 && resetFrame && f.lid < 1 && lidOpenT === null && f.lid < 0.99) lidOpenT = t;
    if (f.state === STATE.IDLE) { seen.push('idle'); break; }
  }
  ok(order.join('>') === 'STARTING>SPREADING>CONSUMING>SNAP_OUT>RECOVERY>IDLE', 'lifecycle order: ' + order.join('>'));
  ok(mono, 'darkness progress never decreases before the snap'); ok(maxProg > 1.3, 'progress reaches full coverage (' + maxProg.toFixed(2) + ')');
  ok(resetFrame && resetFrame.lid === 1, 'reset happens while lids are fully closed (lid=' + (resetFrame && resetFrame.lid) + ')');
  ok(resetFrame && resetFrame.progress === 0 && !resetFrame.on, 'darkness is zero on the reset frame'); ok(!darkSeenAfterReset, 'darkness never reappears after reset');
  ok(gasps === 1, 'gasp once'); ok(camMax > 3 * Math.PI / 180 && camMax < 5 * Math.PI / 180, 'camera jerk 3-5 deg (peak combined rotation ' + (camMax * 180 / Math.PI).toFixed(1) + ' deg)');
  ok(jerkEnvelope(0) === 0 && jerkEnvelope(0.33) === 0 && jerkEnvelope(5) === 0, 'jerk envelope is exactly 0 at start/end'); ok(a.state === STATE.IDLE, 'ends in IDLE');
  const total = t; ok(total > 25 + 0.7 && total < 25 + 0.7 + 1.5 + 1.6 + 0.2, 'total duration plausible (' + total.toFixed(1) + ' s)');
}
// 2. blink timing: eyes fully closed ~blink duration, camera back to 0 before lids open
{
  const { a } = mk({ blink: 0.3 }); a.trigger(); const dt = 1 / 240; let closed = 0, t = 0, camAfterOpen = 0, opening = false;
  for (let i = 0; i < 240 * 40; i++) { const f = a.tick(dt, true); if (!f) break; if (f.state === STATE.SNAP_OUT) { t += dt; if (f.lid >= 0.999) closed += dt; if (f.lid < 0.999 && closed > 0.1) opening = true; if (opening && (f.cam.yaw || f.cam.pitch)) camAfterOpen++; } }
  ok(Math.abs(closed - 0.3) < 0.03, 'eyes fully closed for ' + (closed * 1000).toFixed(0) + ' ms (target 300)'); ok(camAfterOpen === 0, 'camera offsets are back at 0 before the lids start opening');
}
// 3. pause freezes
{
  const { a } = mk(); a.trigger(); for (let i = 0; i < 300; i++) a.tick(1 / 60, true);
  const e0 = a.elapsed, f0 = a.frame(); for (let i = 0; i < 600; i++) a.tick(1 / 60, false);
  ok(a.elapsed === e0 && a.frame().progress === f0.progress, 'paused: time and progress frozen'); a.tick(1 / 60, true); ok(a.elapsed > e0, 'resumes after pause');
  const { a: b } = mk(); b.trigger(); for (let i = 0; i < 60 * 25.8; i++) b.tick(1 / 60, true); ok(b.state === STATE.SNAP_OUT || b.state === STATE.CONSUMING, 'reached end of spread (' + b.state + ')');
  while (b.state === STATE.CONSUMING) b.tick(1 / 60, true); for (let i = 0; i < 15; i++) b.tick(1 / 60, true); const e = b.frame(); b.tick(1 / 60, false); ok(b.frame().lid === e.lid, 'paused mid-blink: lids hold');
}
// 4. cancel
{
  const { a } = mk(); a.trigger(); for (let i = 0; i < 600; i++) a.tick(1 / 60, true); a.cancel(); const r = a.rest();
  ok(a.state === STATE.IDLE && !r.on && r.progress === 0 && r.lid === 0 && r.cam.yaw === 0, 'cancel returns to a fully reset frame');
}
// 5. host veto / auto rules
{
  let allow = false; const { a } = mk({ auto: true, meanMin: 1 }, () => allow, 3); let starts = 0;
  for (let i = 0; i < 60 * 3600; i++) { allow = false; a.tick(1 / 60, true); if (a.active) starts++; } ok(starts === 0, 'no automatic start while the host refuses (intro / menu)');
  const { a: m } = mk({ auto: false, meanMin: 1 }, () => true, 3); let n = 0; for (let i = 0; i < 60 * 3600; i++) { m.tick(1 / 60, true); if (m.active) n++; } ok(n === 0, 'auto disabled: never starts by itself in 1 h');
  const { a: g } = mk({ auto: true, meanMin: 0.01 }, () => true, 4); let early = false; for (let i = 0; i < 60 * (GRACE_S - 1); i++) { g.tick(1 / 60, true); if (g.active) early = true; } ok(!early, 'no automatic start inside the grace period');
  const { a: ma } = mk({ auto: true, meanMin: 15 }, () => true, 5); ok(!ma.trigger() === false, 'manual trigger works with auto on');
}
// 6. hazard is random, not a fixed timer: first-start times vary and the mean is near grace + meanMin
{
  const times = []; for (let s = 1; s <= 40; s++) { const { a } = mk({ auto: true, meanMin: 10 }, () => true, s * 7919); let t = 0; while (!a.active && t < 36000) { a.tick(1, true); t += 1; } times.push(t); }
  const mean = times.reduce((x, y) => x + y, 0) / times.length, sd = Math.sqrt(times.reduce((x, y) => x + (y - mean) ** 2, 0) / times.length);
  ok(sd > 120, 'start times vary (sd ' + sd.toFixed(0) + ' s) = no fixed timer'); ok(mean > GRACE_S + 200 && mean < GRACE_S + 1100, 'mean first start ' + mean.toFixed(0) + ' s (grace ' + GRACE_S + ' + ~600 expected)');
  ok(Math.min(...times) >= GRACE_S, 'never before the grace period (min ' + Math.min(...times) + ' s)');
}
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
