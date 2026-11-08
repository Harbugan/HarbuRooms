// Anomaly 01 — THE ENCROACHING DARKNESS (docs/ANOMALIES.md).
// Pure state machine + timeline: no DOM, no Three.js, no audio. index.html owns the side effects and applies the frame object returned
// by tick(); that keeps this file testable in Node (tools/anomaly-sim.mjs) and gives later anomalies the same small shape:
//   { id, state, trigger(), cancel(), tick(dt, playing) -> frame | null }
// Lifecycle: IDLE -> STARTING -> SPREADING -> CONSUMING -> SNAP_OUT -> RECOVERY -> IDLE.
// Time only advances while `playing` is true, so pause / menu / F3 freeze the sequence at the exact moment it was paused.

export const STATE = Object.freeze({
  IDLE: 'IDLE', STARTING: 'STARTING', SPREADING: 'SPREADING', CONSUMING: 'CONSUMING', SNAP_OUT: 'SNAP_OUT', RECOVERY: 'RECOVERY',
});

// Fractions of the spread duration at which STARTING / SPREADING end (CONSUMING runs to 1, then holds briefly at full darkness).
const U_STARTING = 0.12, U_SPREADING = 0.72, HOLD_FULL = 0.7; // seconds held at maximum darkness before the snap
// Snap Out timeline (seconds from entering SNAP_OUT). The camera jerk comes first; the lids start closing while it is still decaying.
const JERK_ATTACK = 0.07, JERK_DECAY = 0.26, LID_START = 0.14, LID_CLOSE = 0.12, LID_OPEN = 0.18, RECOVERY_S = 1.6;
// Head jerk ~4 degrees in total (yaw 3.2, pitch 2.2 down, roll 1.6): short, asymmetric (fast attack, slower decay), tiny counter-swing.
const JERK_YAW = 3.2 * Math.PI / 180, JERK_PITCH = -2.2 * Math.PI / 180, JERK_ROLL = 1.6 * Math.PI / 180;
export const GRACE_S = 240; // minimum calm play time before an automatic start is even considered

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
// Spread curve: starts immediately but very gently, accelerates, then settles into full darkness (u 0..1 -> 0..1).
export const spreadCurve = u => { u = clamp01(u); return 0.35 * u + 0.65 * smooth(u); };

// Camera offset envelope, 0 at t = 0 and exactly 0 from JERK_ATTACK + JERK_DECAY on.
export function jerkEnvelope(t) {
  if (t <= 0 || t >= JERK_ATTACK + JERK_DECAY) return 0;
  if (t < JERK_ATTACK) { const a = t / JERK_ATTACK; return 1 - (1 - a) * (1 - a); } // fast ease-out attack
  const d = (t - JERK_ATTACK) / JERK_DECAY, back = Math.sin(d * Math.PI) * 0.12;  // slower return with a small counter-swing
  return (1 - smooth(d)) - back * (1 - d);
}

// host: {
//   cfg() -> { auto, meanMin, intensity 0..1, spread s, snap 0..2, blink s, softness 0..1, seedWeight 0..1 }
//   canStart(auto) -> bool   (index.html: game started, intro not running, nothing else running)
//   random() -> [0,1)        (Math.random in the game; seeded in the test)
// }
export function createEncroachingDarkness(host) {
  let state = STATE.IDLE, t = 0, calm = 0, seed = 0, jerkSign = 1, resetDone = false, gaspDone = false;
  const snapLen = () => LID_START + LID_CLOSE + host.cfg().blink + LID_OPEN;

  function idleFrame() {
    return { state, on: false, progress: 0, intensity: 0, seed, level: 0, cam: { yaw: 0, pitch: 0, roll: 0, shake: 0 }, lid: 0, events: [] };
  }

  function begin() { state = STATE.STARTING; t = 0; resetDone = false; gaspDone = false; seed = host.random() * 97 + 3; jerkSign = host.random() < 0.5 ? -1 : 1; calm = 0; }

  const api = {
    id: 'encroaching-darkness',
    get state() { return state; },
    get active() { return state !== STATE.IDLE; },
    get elapsed() { return t; },
    get calm() { return calm; },
    /** Manual / debug start. Returns false when it cannot start (already running, or the host refuses). */
    trigger() { if (state !== STATE.IDLE || !host.canStart(false)) return false; begin(); return true; },
    /** Immediate, silent return to IDLE (exit to title, intro start...). The caller applies api.rest() afterwards. */
    cancel() { state = STATE.IDLE; t = 0; calm = 0; resetDone = false; gaspDone = false; },
    rest: idleFrame,
    /** Advance by dt seconds. Returns the frame to apply, or null when nothing changed (idle, or paused while active). */
    tick(dt, playing) {
      if (!playing) return state === STATE.IDLE ? null : api.frame();
      const c = host.cfg(), events = [];
      if (state === STATE.IDLE) {
        calm += dt;
        // Automatic start: memoryless (constant hazard per second, no fixed timer), only after a calm period, only if enabled.
        if (c.auto && calm >= GRACE_S && host.canStart(true) && host.random() < 1 - Math.exp(-dt / (Math.max(1, c.meanMin) * 60))) begin();
        else return null;
      }
      t += dt;
      const S = Math.max(4, c.spread);
      if (state === STATE.STARTING || state === STATE.SPREADING || state === STATE.CONSUMING) {
        const u = t / S;
        state = u < U_STARTING ? STATE.STARTING : u < U_SPREADING ? STATE.SPREADING : STATE.CONSUMING;
        if (t >= S + HOLD_FULL) { state = STATE.SNAP_OUT; t = 0; }
      } else if (state === STATE.SNAP_OUT) {
        if (!gaspDone) { gaspDone = true; events.push('gasp'); }
        const closedAt = LID_START + LID_CLOSE;
        if (!resetDone && t >= closedAt + Math.min(0.1, c.blink * 0.4)) { resetDone = true; events.push('reset'); }
        if (t >= snapLen()) { state = STATE.RECOVERY; t = 0; }
      } else if (state === STATE.RECOVERY) {
        if (t >= RECOVERY_S) { state = STATE.IDLE; t = 0; calm = 0; return idleFrame(); }
      }
      const f = api.frame(); f.events = events; return f;
    },
    /** The frame for the current state (also used while paused, so a frozen sequence stays frozen on screen). */
    frame() {
      const c = host.cfg(), f = idleFrame(), S = Math.max(4, c.spread);
      f.state = state; f.intensity = c.intensity;
      const pMax = 1 + c.softness + 0.08;
      if (state === STATE.IDLE) return f;
      if (state === STATE.RECOVERY) return f; // fully reset: baseline rendering
      if (state === STATE.SNAP_OUT) {
        const reset = resetDone;
        f.on = !reset; f.progress = reset ? 0 : pMax; f.level = reset ? 0 : 1;
        const e = jerkEnvelope(t) * c.snap;
        f.cam = { yaw: jerkSign * JERK_YAW * e, pitch: JERK_PITCH * e, roll: -jerkSign * JERK_ROLL * e, shake: Math.abs(e) * 1.4 };
        const closeAt = LID_START, openAt = LID_START + LID_CLOSE + c.blink;
        f.lid = t < closeAt ? 0 : t < closeAt + LID_CLOSE ? Math.pow(smooth((t - closeAt) / LID_CLOSE), 0.8)
          : t < openAt ? 1 : 1 - Math.pow(smooth((t - openAt) / LID_OPEN), 1.3);
        return f;
      }
      const u = clamp01(t / S);
      f.on = true; f.progress = spreadCurve(u) * pMax; f.level = clamp01(f.progress / pMax); f.seed = seed;
      return f;
    },
  };
  return api;
}
