// Anomaly 02 — THE OBSERVER: placement and visibility (docs/ANOMALIES.md).
// Pure geometry on the world's 1 m wall grid (no DOM / Three.js). Works on the same layout() data that addChunk() builds walls and
// collision from, so a placement can never stand inside a wall and an occlusion test agrees with what is rendered:
//   edge value 1 = wall (opaque floor to ceiling), 2 = wall with a window (opaque below 1.05 m and above 2.05 m),
//   open edge with a lintel = opaque above DOOR_TOP, pillars = opaque boxes.
// The thin-line test is conservative for "hidden": real walls are 0.3 m thick and corner runs are extended, so geometry can only
// hide MORE than this test says. A figure the test calls hidden is hidden on screen.

export const DEG = Math.PI / 180;
export const BODY_R = 0.37;      // min distance from a wall line (wall face is 0.15 m from it; arms hang ~0.2 m out)
export const HEAD_R = 0.14;      // min distance of the stooped head from walls / lintels
export const HIDE_W = 0.36;      // half width used for "fully hidden" (wider than the body: safety margin)
export const SEE_W = 0.2;        // half width used for "visible at all" / visible fraction

// ---- world adapter -------------------------------------------------------------------------------------------------------------
// layout(cx,cz) -> { I:{Hc}, hw, vw, lint, E:[{lint},{lint}], pillars }   (exactly what index.html / tools/gen-lib.mjs provide)
// built(cx,cz)  -> whether that chunk's meshes exist right now (placement only in built chunks)
export function makeGridWorld({ layout, N, doorTop = 2.25, built = () => true }) {
  const lintCache = new WeakMap();
  const lints = L => {
    let s = lintCache.get(L); if (s) return s; s = new Set();
    for (const [ax, l, a, b] of L.lint) for (let i = a; i < b; i++) s.add((ax * N + l) * N + i);
    for (let ax = 0; ax < 2; ax++) for (const [a, b] of (L.E && L.E[ax] && L.E[ax].lint) || []) for (let i = a; i < b; i++) s.add((ax * N) * N + i);
    lintCache.set(L, s); return s;
  };
  let lcx = NaN, lcz = NaN, lL = null; // tiny cache: rays walk mostly inside one chunk
  const lay = (cx, cz) => { if (cx !== lcx || cz !== lcz) { lcx = cx; lcz = cz; lL = layout(cx, cz); } return lL; };
  // 0 open, 1 wall, 2 window wall, 3 open with a lintel (door)
  function edge(ax, line, i) {
    const lineC = Math.floor(line / N), iC = Math.floor(i / N), l = line - lineC * N, li = i - iC * N;
    const L = ax ? lay(lineC, iC) : lay(iC, lineC), v = (ax ? L.vw : L.hw)[l * N + li];
    if (v) return v;
    return lints(L).has((ax * N + l) * N + li) ? 3 : 0;
  }
  const cellChunk = (x, z) => [Math.floor(x / N), Math.floor(z / N)];
  function ceil(x, z) { const [cx, cz] = cellChunk(x, z); return layout(cx, cz).I.Hc; }
  function isBuilt(x, z) { const [cx, cz] = cellChunk(x, z); return !!built(cx, cz); }
  function pillars(cx, cz) { const L = layout(cx, cz), out = []; for (const [x, z, s] of L.pillars) out.push([cx * N + x, cz * N + z, s / 2]); return out; }
  return { N, doorTop, edge, ceil, isBuilt, pillars };
}

// ---- occlusion -----------------------------------------------------------------------------------------------------------------
function edgeBlocks(v, y, doorTop) { return v === 1 || (v === 2 && (y < 1.05 || y > 2.05)) || (v === 3 && y > doorTop); }

function segBox(ex, ez, tx, tz, bx, bz, h) { // 2-D segment vs axis-aligned square (slab test)
  let t0 = 0, t1 = 1; const d = [tx - ex, tz - ez], o = [ex, ez], lo = [bx - h, bz - h], hi = [bx + h, bz + h];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k]; if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
  }
  return t1 > 1e-6 && t0 < 1 - 1e-6;
}

/** True when the straight line from the eye to the target point is blocked by a wall, window frame, lintel or pillar. */
export function blocked(W, ex, ey, ez, tx, ty, tz, pil) {
  const dx = tx - ex, dz = tz - ez;
  if (dx) { const s = dx > 0 ? 1 : -1; for (let k = s > 0 ? Math.floor(ex) + 1 : Math.ceil(ex) - 1; s > 0 ? k < tx : k > tx; k += s) {
    const t = (k - ex) / dx; if (t <= 0 || t >= 1) continue; if (edgeBlocks(W.edge(1, k, Math.floor(ez + dz * t)), ey + (ty - ey) * t, W.doorTop)) return true; } }
  if (dz) { const s = dz > 0 ? 1 : -1; for (let k = s > 0 ? Math.floor(ez) + 1 : Math.ceil(ez) - 1; s > 0 ? k < tz : k > tz; k += s) {
    const t = (k - ez) / dz; if (t <= 0 || t >= 1) continue; if (edgeBlocks(W.edge(0, k, Math.floor(ex + dx * t)), ey + (ty - ey) * t, W.doorTop)) return true; } }
  for (const [px, pz, h] of pil || pillarsNear(W, ex, ez, tx, tz)) if (segBox(ex, ez, tx, tz, px, pz, h)) return true;
  return false;
}
function pillarsNear(W, ex, ez, tx, tz, m = 0) {
  const N = W.N, out = [], x0 = Math.floor((Math.min(ex, tx) - m) / N), x1 = Math.floor((Math.max(ex, tx) + m) / N), z0 = Math.floor((Math.min(ez, tz) - m) / N), z1 = Math.floor((Math.max(ez, tz) + m) / N);
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) out.push(...W.pillars(cx, cz));
  return out;
}

// ---- figure proportions (shared with the renderer) ----------------------------------------------------------------------------
// The figure is taller than most Level 0 ceilings (2.9 m). It never clips: it stoops from the hips until its top is below the ceiling,
// and only if a 34 deg stoop is not enough is it scaled down. Returns the numbers the renderer and the placement checks both use.
export function figureLean(height, ceil) {
  const maxTop = ceil - 0.09, hip = 0.53 * height;
  let theta = 0, scale = 1;
  if (height > maxTop) {
    const c = (maxTop - hip) / (height - hip);
    theta = Math.acos(Math.max(-1, Math.min(1, c)));
    if (theta > 34 * DEG) { theta = 34 * DEG; const top = hip + (height - hip) * Math.cos(theta); scale = maxTop / top; }
  }
  const headOffset = (height - hip) * Math.sin(theta) * scale; // horizontal offset of the head towards the facing direction
  const top = (hip + (height - hip) * Math.cos(theta)) * scale;
  return { theta, scale, hip: hip * scale, headOffset, top };
}

// ---- view helpers --------------------------------------------------------------------------------------------------------------
// view: { x, y, z, yaw, pitch, hfov, vfov } (radians, full angles). Camera looks down -Z, rotation order YXZ (index.html).
export function toCam(v, px, py, pz) {
  const dx = px - v.x, dy = py - v.y, dz = pz - v.z, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
  return [x1, dy * cp + z1 * sp, -dy * sp + z1 * cp];
}
export function inFrustum(v, px, py, pz, margin = 0) {
  const [x, y, z] = toCam(v, px, py, pz); if (z >= -0.01) return false;
  return Math.abs(x / -z) <= Math.tan(Math.min(89 * DEG, v.hfov / 2 + margin)) && Math.abs(y / -z) <= Math.tan(Math.min(89 * DEG, v.vfov / 2 + margin));
}
/** Horizontal angle between the view centre and a point (radians, 0 = dead centre). */
export function viewAngle(v, px, pz) { const [x, , z] = toCam(v, px, v.y, pz); return Math.abs(Math.atan2(x, -z)); }

// Sample points on the figure's silhouette, as seen from (ex,ez): a few columns across its width at a few heights.
export function figurePoints(ex, ez, fx, fz, top, halfW, dense) {
  let ux = fx - ex, uz = fz - ez; const d = Math.hypot(ux, uz) || 1; ux /= d; uz /= d;
  const px = -uz, pz = ux, cols = dense ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1], rows = dense ? [0.12, 0.3, 0.5, 0.68, 0.84, 0.97] : [0.25, 0.55, 0.85];
  const out = []; for (const c of cols) for (const r of rows) out.push([fx + px * halfW * c, top * r, fz + pz * halfW * c]);
  return out;
}
/** Fraction (0..1) of the figure's sample points that have an unobstructed line from the eye (frustum ignored). */
export function visibleFraction(W, ex, ey, ez, fx, fz, top, halfW = SEE_W, dense = true) {
  const pts = figurePoints(ex, ez, fx, fz, top, halfW, dense), pil = pillarsNear(W, ex, ez, fx, fz, 1);
  let n = 0; for (const [x, y, z] of pts) if (!blocked(W, ex, ey, ez, x, y, z, pil)) n++;
  return n / pts.length;
}
/** On screen right now: some sample point is inside the frustum (with margin) and has a clear line of sight. */
export function onScreen(W, v, fx, fz, top, halfW = SEE_W, margin = 0) {
  const pts = figurePoints(v.x, v.z, fx, fz, top, halfW, true); let pil = null;
  for (const [x, y, z] of pts) { if (!inFrustum(v, x, y, z, margin)) continue; pil = pil || pillarsNear(W, v.x, v.z, fx, fz, 1); if (!blocked(W, v.x, v.y, v.z, x, y, z, pil)) return true; }
  return false;
}
/** Conservative "nothing of it can be seen": wider silhouette, wider frustum. Used before a figure may be removed or moved off-screen. */
export const fullyHidden = (W, v, fx, fz, top) => !onScreen(W, v, fx, fz, top, HIDE_W, 4 * DEG);

// ---- local architecture --------------------------------------------------------------------------------------------------------
// Distance from (x,z) to the nearest wall segment (values 1/2; with lintels also 3) in the surrounding 5 x 5 cells, and to pillars.
export function clearance(W, x, z, withLintels = false) {
  const cx = Math.floor(x), cz = Math.floor(z); let d = 9;
  for (let a = cx - 2; a <= cx + 2; a++) for (let b = cz - 2; b <= cz + 2; b++) {
    const h = W.edge(0, b, a); if (h === 1 || h === 2 || (withLintels && h === 3)) d = Math.min(d, Math.hypot(Math.max(a - x, 0, x - a - 1), z - b));
    const v = W.edge(1, a, b); if (v === 1 || v === 2 || (withLintels && v === 3)) d = Math.min(d, Math.hypot(x - a, Math.max(b - z, 0, z - b - 1)));
  }
  const N = W.N; for (const [px, pz, h] of W.pillars(Math.floor(x / N), Math.floor(z / N))) d = Math.min(d, Math.hypot(Math.max(Math.abs(x - px) - h, 0), Math.max(Math.abs(z - pz) - h, 0)));
  return d;
}
const isWall = v => v === 1 || v === 2;
/** What kind of observation point a cell is: 'door' | 'corridor' | 'corner' | 'wall' | 'edge' (a wall end touches it) | null (open floor). */
export function cellKind(W, x, z) {
  const n = W.edge(0, z, x), s = W.edge(0, z + 1, x), w = W.edge(1, x, z), e = W.edge(1, x + 1, z);
  if (n === 3 || s === 3 || w === 3 || e === 3) return 'door';
  const N_ = isWall(n), S = isWall(s), Wl = isWall(w), E = isWall(e);
  if ((N_ && S && !Wl && !E) || (Wl && E && !N_ && !S)) return 'corridor';
  if ((N_ || S) && (Wl || E)) return 'corner';
  if (N_ || S || Wl || E) return 'wall';
  // edges radiating out of the four corners (a wall end or a corner of the next room right next to this cell)
  const out = [W.edge(1, x, z - 1), W.edge(1, x + 1, z - 1), W.edge(1, x, z + 1), W.edge(1, x + 1, z + 1), W.edge(0, z, x - 1), W.edge(0, z + 1, x - 1), W.edge(0, z, x + 1), W.edge(0, z + 1, x + 1)];
  return out.some(isWall) ? 'edge' : null;
}
export const KIND_SCORE = { door: 1, corridor: 0.95, corner: 0.8, edge: 0.75, wall: 0.55 };

/** The stooped head must not be inside a wall or lintel either. */
function headOk(W, x, z, yaw, lean) {
  if (lean.headOffset < 0.02) return true;
  const fx = Math.sin(yaw), fz = Math.cos(yaw); // local +Z (the figure's front) rotated by yaw
  for (let s = 0.15; s <= lean.headOffset + 1e-6; s += 0.15) if (clearance(W, x + fx * s, z + fz * s, true) < HEAD_R) return false;
  return clearance(W, x + fx * lean.headOffset, z + fz * lean.headOffset, true) >= HEAD_R;
}
/** Every structural rule for a standing position (except visibility). Returns '' when valid, otherwise the reason. */
export function standCheck(W, x, z, height, yaw) {
  if (!W.isBuilt(x, z)) return 'chunk not built';
  const hc = W.ceil(x, z); if (hc < 2.45) return 'ceiling too low';
  if (clearance(W, x, z) < BODY_R) return 'too close to a wall';
  if (!headOk(W, x, z, yaw, figureLean(height, hc))) return 'stooped head would touch a wall/lintel';
  return '';
}
export const faceYaw = (fx, fz, ex, ez) => Math.atan2(ex - fx, ez - fz); // yaw that turns the figure's +Z towards the eye

// Retreat path for the peripheral type: an axis direction mostly across the line of sight along which the figure can glide (clear of
// walls, head included) until it is fully hidden from the eye. Returns { dx, dz, hideAt, len } or null.
export function retreatPath(W, eye, x, z, height, yaw, maxLen = 2.4) {
  const ux = x - eye.x, uz = z - eye.z, d = Math.hypot(ux, uz) || 1; let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (Math.abs((dx * ux + dz * uz) / d) > 0.6) continue;
    let hideAt = -1, okTo = 0;
    for (let s = 0.1; s <= maxLen + 1e-6; s += 0.1) {
      const qx = x + dx * s, qz = z + dz * s;
      if (clearance(W, qx, qz) < BODY_R - 0.05 || !W.isBuilt(qx, qz) || !headOk(W, qx, qz, yaw, figureLean(height, W.ceil(qx, qz)))) break;
      okTo = s; const top = figureLean(height, W.ceil(qx, qz)).top;
      const hid = visibleFraction(W, eye.x, eye.y, eye.z, qx, qz, top, HIDE_W, true) === 0;
      if (!hid) hideAt = -1; else if (hideAt < 0) hideAt = s; // must stay hidden from hideAt to the end of the path
      if (hideAt >= 0 && s >= hideAt + 0.4 - 1e-6) break;
    }
    if (hideAt < 0.25 || okTo < hideAt + 0.4 - 1e-6) continue;
    if (!best || hideAt < best.hideAt) best = { dx, dz, hideAt, len: hideAt + 0.4 };
  }
  return best;
}

// ---- placement search ----------------------------------------------------------------------------------------------------------
// kind 'A' (distant presence), 'B' (peripheral retreat) or 'test' (debug: clearly in view).
// Placements are chosen so that the figure is NOT on screen at the moment it is created (no pop-in):
//   'edge'   - just outside the side of the frame with a partial line of sight: it is seen when the player turns;
//   'reveal' - inside the frame direction but fully hidden behind geometry, and partly visible from a little further along the
//              player's walking direction: it slides into view by parallax (type A only).
// opts: { dist (preferred metres), height, random, eyeForward:[fx,fz] }
// Returns { ok:true, x, z, yaw, mode, kind, cellKind, dist, frac, path? } or { ok:false, reason }.
export function findPlacement(W, v, kind, opts) {
  const D = opts.dist, dMin = Math.max(10, D * 0.62), dMax = Math.max(dMin + 6, D * 1.45), rnd = opts.random || Math.random, height = opts.height;
  const halfH = v.hfov / 2, eye = { x: v.x, y: v.y, z: v.z };
  const fwd = opts.eyeForward || [-Math.sin(v.yaw), -Math.cos(v.yaw)];
  // predicted eyes for 'reveal': 2 and 4 m ahead, only if the walk there is not through a wall
  const ahead = [];
  for (const s of [2, 4]) { const ax = v.x + fwd[0] * s, az = v.z + fwd[1] * s; if (!blocked(W, v.x, 1, v.z, ax, 1, az) && clearance(W, ax, az) > 0.3) ahead.push({ x: ax, y: v.y, z: az }); }
  const reasons = {}, why = r => { reasons[r] = (reasons[r] || 0) + 1; };
  const cands = [];
  const x0 = Math.floor(v.x - dMax), x1 = Math.floor(v.x + dMax), z0 = Math.floor(v.z - dMax), z1 = Math.floor(v.z + dMax);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const x = cx + 0.5, z = cz + 0.5, d = Math.hypot(x - v.x, z - v.z); if (d < dMin || d > dMax) continue;
    const ang = viewAngle(v, x, z), inView = ang < halfH - 3 * DEG;
    if (kind === 'test' ? !inView || ang > halfH * 0.75 : kind === 'B' ? (ang < halfH + 3 * DEG || ang > halfH + 35 * DEG) : (ang > halfH + 50 * DEG)) continue;
    const ck = cellKind(W, cx, cz); if (!ck) { why('open floor (no wall nearby)'); continue; }
    cands.push({ x, z, d, ang, inView, ck });
  }
  if (!cands.length) return { ok: false, reason: Object.keys(reasons)[0] ? 'no plausible observation point in range' : 'no cell in range / view band' };
  // cheap structural filter, then visibility on a random subset (keeps the cost bounded, a few ms once per attempt)
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
  const good = []; let evals = 0, checks = 0;
  for (const c of cands) {
    if (evals >= 110 || checks++ >= 320 || good.length >= 12) break;
    const yaw = faceYaw(c.x, c.z, v.x, v.z) + (rnd() - 0.5) * 0.5;
    const bad = standCheck(W, c.x, c.z, height, yaw); if (bad) { why(bad); continue; }
    evals++;
    const top = figureLean(height, W.ceil(c.x, c.z)).top, coarse = visibleFraction(W, v.x, v.y, v.z, c.x, c.z, top, SEE_W, false);
    // cheap 9-ray pre-check: edge/test modes need some line of sight, reveal mode needs none
    if ((kind === 'test' || kind === 'B' || !c.inView) ? coarse === 0 : coarse > 0) { why(coarse === 0 ? 'mostly hidden by walls' : 'would pop into view'); continue; }
    const frac = visibleFraction(W, v.x, v.y, v.z, c.x, c.z, top);
    let mode = null, f = frac;
    if (kind === 'test') { if (frac >= 0.5 && !fullyHidden(W, v, c.x, c.z, top)) mode = 'test'; else why('not clearly visible'); }
    else if (!c.inView || kind === 'B') { // edge mode: partial line of sight, but nothing of it in the (widened) frame yet
      const lo = kind === 'B' ? 0.15 : 0.2, hi = kind === 'B' ? 0.7 : 0.8;
      if (frac < lo || frac > hi) why(frac < lo ? 'mostly hidden by walls' : 'not partly hidden (open view)');
      else if (!fullyHidden(W, v, c.x, c.z, top)) why('would pop into view');
      else mode = 'edge';
    } else { // reveal mode (type A, in view direction): hidden now, partly visible a few steps further on
      if (frac > 0) why('would pop into view');
      else {
        for (const e of ahead) { if (visibleFraction(W, e.x, e.y, e.z, c.x, c.z, top, SEE_W, false) === 0) continue; const g = visibleFraction(W, e.x, e.y, e.z, c.x, c.z, top); if (g >= 0.2 && g <= 0.8) { mode = 'reveal'; f = g; break; } }
        if (!mode) why('not revealed by walking on');
        else if (!fullyHidden(W, v, c.x, c.z, top)) { mode = null; why('would pop into view'); }
      }
    }
    if (!mode) continue;
    const score = (KIND_SCORE[c.ck] || 0.5) * Math.exp(-(((c.d - D) / 7) ** 2)) * (mode === 'edge' ? 1.1 - Math.min(1, Math.max(0, (c.ang - halfH) / (50 * DEG))) * 0.5 : 1) * (0.55 + 0.45 * rnd());
    good.push({ ok: true, x: c.x, z: c.z, yaw, mode, kind, cellKind: c.ck, dist: +c.d.toFixed(1), frac: +f.toFixed(2), path: null, score });
  }
  if (!good.length) {
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    return { ok: false, reason: top ? top[0] : 'no valid placement' };
  }
  good.sort((a, b) => b.score - a.score);
  if (kind !== 'B') return good[0];
  // the retreat path is the expensive part: only for the best few
  for (const g of good.slice(0, 5)) { g.path = retreatPath(W, eye, g.x, g.z, height, g.yaw); if (g.path) return g; }
  return { ok: false, reason: 'no retreat path behind a corner' };
}

/** Debug fallback for FORCE VISIBLE: the farthest clear spot (up to dist) within ±30 deg of straight ahead, nearest to the centre
 *  first. Not used by real observations (no plausibility / distance / pop-in rules). */
export function testFallback(W, v, dist, height) {
  for (const a of [0, 8, -8, 16, -16, 24, -24, 30, -30]) {
    const yaw = v.yaw + a * DEG, fx = -Math.sin(yaw), fz = -Math.cos(yaw); let best = null;
    for (let s = 1.5; s <= dist; s += 0.25) {
      const x = v.x + fx * s, z = v.z + fz * s;
      if (blocked(W, v.x, 1.2, v.z, x, 1.2, z)) break;
      const fy = faceYaw(x, z, v.x, v.z); if (!standCheck(W, x, z, height, fy)) best = { ok: true, x, z, yaw: fy, mode: 'test-fallback', kind: 'test', cellKind: cellKind(W, Math.floor(x), Math.floor(z)) || 'open', dist: +s.toFixed(1), frac: 1, path: null };
    }
    if (best) return best;
  }
  return { ok: false, reason: 'no free spot within 30 deg of the view direction (turn towards open space)' };
}
