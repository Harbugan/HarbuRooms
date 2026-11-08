// Anomaly 02 — THE OBSERVER (docs/ANOMALIES.md).
// Timing + lifecycle as a pure state machine (no DOM / Three.js / audio), same shape as encroachingDarkness.js:
//   { id, state, active, trigger(), cancel(), tick(dt, playing) -> frame | null }
// Responsibilities are split:  timing           -> createObserverTimer (below)
//                              lifecycle        -> createObserver (below)
//                              placement/sight  -> observerPlacement.js (pure geometry on the wall grid)
//                              rendering        -> observerFigure.js (index.html applies the frame through it)
// The figure only exists while an observation (or the debug test figure) needs it; nothing is simulated in between.
//
// Lifecycle: IDLE -> LURKING -> PRESENT (type A, distant presence) -> IDLE
//                            -> PEEK -> RETREAT (type B, peripheral retreat) -> IDLE
//            TEST (debug FORCE VISIBLE: holds a figure in view until cancel()).
// LURKING: the figure has been placed where it is NOT on screen (off the side of the frame, or fully behind a wall); it becomes an
// observation only if the player turns / walks so that it comes into view. It is removed only while nothing of it can be seen, or on
// a frame that is masked by fast camera motion or by a small camcorder jolt (mask 'jolt': the game's existing handheld jolt).

import { findPlacement, testFallback, onScreen, fullyHidden, viewAngle, figureLean, DEG } from './observerPlacement.js';

export const STATE = Object.freeze({ IDLE: 'IDLE', LURKING: 'LURKING', PRESENT: 'PRESENT', PEEK: 'PEEK', RETREAT: 'RETREAT', TEST: 'TEST' });
export const LURK_MAX = 14;       // s an unseen placed figure waits for the player to look (manual trigger: 30 s)
export const MIN_NEAR = 8;        // m: closer than this the figure is removed (never confirmed up close)
const FOCUS = 7 * DEG;            // looking almost straight at it
const TURN = 0.6;                 // rad/s of camera yaw: fast enough to hide a removal in the motion
const MASK_WAIT = 0.25;           // s after the visibility budget it may wait for a natural mask before using the jolt
const PRESENT_CAP = 3;            // s after the visibility budget: hard cap for an intermittently seen figure
const RETREAT_CAP = 0.8;          // s past the visibility budget: hard cap for the retreat

/** Random interval timer. Draws a new uniform interval in [min, max] after every attempt; advances only when told to. */
export function createObserverTimer(random) {
  let remaining = 0, length = 0;
  return {
    get remaining() { return remaining; },
    get length() { return length; },
    draw(min, max) { const lo = Math.max(1, Math.min(min, max)), hi = Math.max(lo, Math.max(min, max)); length = remaining = lo + (hi - lo) * random(); return remaining; },
    advance(dt) { remaining -= dt; return remaining <= 0; },
  };
}

// host: {
//   cfg() -> { auto, minS, maxS, prob 0..1, maxVis s, dist m, height m, speed m/s }
//   block(auto) -> '' when an observation may start, otherwise the reason (intro, menu, F3, another anomaly...)
//   world  -> makeGridWorld(...) (observerPlacement.js)
//   view() -> { x, y, z, yaw, pitch, hfov, vfov } of the rendered camera
//   random() -> [0,1)
// }
export function createObserver(host) {
  const rnd = host.random, timer = createObserverTimer(rnd);
  let state = STATE.IDLE, fig = null, seenT = 0, stateT = 0, lurkMax = LURK_MAX, hold = 0, s = 0, vel = 0, maskWait = 0, lastYaw = null, lastAng = null, turn = 0, angVel = 0, pending = false;
  const stats = { attempts: 0, seen: 0, unseen: 0, empty: 0, rejected: 0, lastType: '-', lastReason: '-', lastOutcome: '-', lastPlacement: null };
  { const c = host.cfg(); timer.draw(c.minS, c.maxS); }
  const redraw = () => { const c = host.cfg(); timer.draw(c.minS, c.maxS); };
  const top = () => figureLean(host.cfg().height, host.world.ceil(fig.x, fig.z)).top;
  const go = st => { state = st; stateT = 0; };

  function reject(reason) { stats.rejected++; stats.lastReason = reason; stats.lastOutcome = 'rejected'; redraw(); return reason; }
  function end(outcome, out, mask) {
    if (seenT > 0) stats.seen++; else stats.unseen++;
    stats.lastOutcome = outcome + (seenT > 0 ? ` (seen ${seenT.toFixed(2)} s)` : '');
    if (out) { out.events.push('remove'); if (mask) out.mask = mask; if (fig) out.last = { x: fig.x, z: fig.z }; }
    fig = null; go(STATE.IDLE); seenT = 0; lastYaw = lastAng = null; redraw();
  }
  function place(p, type, manual) {
    fig = { x: p.x, z: p.z, yaw: p.yaw, x0: p.x, z0: p.z, yaw0: p.yaw, type, path: p.path || null, seed: rnd() };
    stats.lastType = type === 'A' ? 'A distant presence' : type === 'B' ? 'B peripheral retreat' : 'TEST';
    stats.lastPlacement = { mode: p.mode, cell: p.cellKind, dist: p.dist, frac: p.frac, path: p.path ? +p.path.len.toFixed(2) : null };
    seenT = 0; s = 0; vel = 0; maskWait = 0; lastYaw = lastAng = null; lurkMax = manual ? 30 : LURK_MAX;
    hold = 0.08 + rnd() * 0.22;
  }
  /** One observation attempt. auto: from the timer (rolls the visible probability). Returns '' when a figure was placed. */
  function attempt(auto) {
    stats.attempts++;
    const c = host.cfg(), b = host.block(auto); if (b) return reject(b);
    if (auto && rnd() >= c.prob) { stats.empty++; stats.lastType = 'empty'; stats.lastOutcome = 'empty attempt (nothing shown)'; redraw(); return 'empty'; }
    const v = host.view(), first = rnd() < 0.5 ? 'A' : 'B', opts = { dist: c.dist, height: c.height, random: rnd };
    let type = first, p = findPlacement(host.world, v, type, opts);
    if (!p.ok) { const other = first === 'A' ? 'B' : 'A', q = findPlacement(host.world, v, other, opts); if (q.ok) { p = q; type = other; } else return reject(`no valid placement (${first}: ${p.reason}; ${other}: ${q.reason})`); }
    place(p, type, !auto); go(STATE.LURKING); stats.lastReason = '-'; return '';
  }

  function frame(out) {
    const f = out || { events: [], mask: null };
    f.state = state; f.show = !!fig;
    if (fig) { const c = host.cfg(); f.x = fig.x; f.z = fig.z; f.yaw = fig.yaw; f.height = c.height; f.ceil = host.world.ceil(fig.x, fig.z); f.seed = fig.seed; }
    return f;
  }

  const api = {
    id: 'observer', STATE, stats, timer,
    get state() { return state; },
    get active() { return state !== STATE.IDLE || pending; },
    get nextIn() { return timer.remaining; },
    get figure() { return fig; },
    get seenTime() { return seenT; },
    /** Manual observation: a real, validated attempt on the next playing frame (always visible type; no probability roll). */
    trigger() { const b = host.block(false); if (b) return b; if (state !== STATE.IDLE) return 'observer already active'; pending = true; return ''; },
    /** Debug only: put a figure clearly into view and hold it there (also while paused / in F3) until cancel(). */
    forceVisible() {
      if (state !== STATE.IDLE) api.cancel();
      const c = host.cfg(), v = host.view();
      let p = findPlacement(host.world, v, 'test', { dist: c.dist, height: c.height, random: rnd }); if (!p.ok) p = testFallback(host.world, v, c.dist, c.height);
      if (!p.ok) { stats.lastReason = 'test: ' + p.reason; return p.reason; }
      place(p, 'test', true); go(STATE.TEST); return '';
    },
    /** Immediate, silent return to IDLE (abort / exit to title / intro / reset). */
    cancel() { pending = false; if (state === STATE.IDLE) return; const wasTest = state === STATE.TEST; if (wasTest) { fig = null; go(STATE.IDLE); seenT = 0; } else end('aborted'); },
    redraw,
    frame,
    rest: () => ({ state: STATE.IDLE, show: false, events: ['remove'], mask: null }),
    /** Advance by dt seconds. Returns the frame to apply, or null when nothing changed. */
    tick(dt, playing) {
      const out = { events: [], mask: null };
      if (state === STATE.TEST) return frame(out);
      if (!playing) { if (state !== STATE.IDLE) { end('aborted (paused / menu / F3)', out); return frame(out); } return null; }
      if (state === STATE.IDLE) {
        if (pending) { pending = false; attempt(false); }
        else if (host.cfg().auto && timer.advance(dt)) attempt(true);
        if (state === STATE.IDLE) return null;
        out.events.push('spawn'); return frame(out);
      }
      const c = host.cfg(), W = host.world, v = host.view();
      stateT += dt;
      if (!W.isBuilt(fig.x, fig.z)) { end('chunk unloaded', out); return frame(out); }
      // camera motion: yaw speed and whether the view is swinging towards the figure
      if (lastYaw !== null) { let d = v.yaw - lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = Math.abs(d) / Math.max(dt, 1e-3); }
      const ang = viewAngle(v, fig.x, fig.z); angVel = lastAng === null ? 0 : (ang - lastAng) / Math.max(dt, 1e-3); lastYaw = v.yaw; lastAng = ang;
      const T = top(), vis = onScreen(W, v, fig.x, fig.z, T), dist = Math.hypot(fig.x - v.x, fig.z - v.z), hidden = () => fullyHidden(W, v, fig.x, fig.z, T);
      if (vis) seenT += dt;
      const vanish = (why, natural) => end(why, out, natural ? null : 'jolt');
      if (state === STATE.LURKING) {
        if (vis) { go(fig.type === 'A' ? STATE.PRESENT : STATE.PEEK); }
        else if (dist < MIN_NEAR && hidden()) end('unseen (player came close)', out);
        else if (stateT > lurkMax && hidden()) end('unseen (never came into view)', out);
        return frame(out);
      }
      const swingIn = angVel < -0.25 && turn > TURN;
      if (state === STATE.PRESENT) { // type A: stands still; gone before it can be examined
        if (!vis && hidden()) end('gone (out of sight)', out);
        else if (swingIn) vanish('gone (player turned towards it)', true);
        else if (vis && ang < FOCUS) vanish('gone (player looked straight at it)', turn > TURN * 0.5);
        else if (dist < MIN_NEAR) vanish('gone (player came close)', turn > TURN);
        else if (seenT >= c.maxVis) { maskWait += dt; if (turn > TURN || maskWait >= MASK_WAIT) vanish('gone (visibility budget)', turn > TURN); }
        else if (stateT > c.maxVis + PRESENT_CAP) vanish('gone (time cap)', turn > TURN);
        return frame(out);
      }
      if (state === STATE.PEEK) { // type B: a short, still moment at the edge of the frame, then it withdraws
        if (!vis && hidden()) { end('gone (out of sight)', out); return frame(out); }
        if (vis) hold -= dt;
        if (hold <= 0 || swingIn || (vis && ang < FOCUS * 2) || dist < MIN_NEAR || stateT > c.maxVis) go(STATE.RETREAT);
        return frame(out);
      }
      if (state === STATE.RETREAT) { // glides along the precomputed path until geometry hides it completely
        const P = fig.path, rem = P.len - s;
        vel = Math.min(c.speed, vel + c.speed * dt / 0.18, Math.max(0.05, rem / 0.12));
        s = Math.min(P.len, s + vel * dt);
        fig.x = fig.x0 + P.dx * s; fig.z = fig.z0 + P.dz * s;
        const mv = Math.atan2(P.dx, P.dz); let dy = mv - fig.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        fig.yaw = fig.yaw0 + dy * 0.35 * Math.min(1, s / Math.max(0.2, P.len));
        const T2 = top();
        if (fullyHidden(W, v, fig.x, fig.z, T2)) end('retreated out of sight', out);
        else if (seenT >= c.maxVis + RETREAT_CAP || stateT > c.maxVis + PRESENT_CAP) vanish('gone (retreat cap)', turn > TURN);
        return frame(out);
      }
      return frame(out);
    },
  };
  return api;
}
