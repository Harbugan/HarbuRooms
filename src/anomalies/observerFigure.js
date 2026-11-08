// Anomaly 02 — THE OBSERVER: the figure (docs/ANOMALIES.md). Three.js is passed in (index.html loads it from the CDN), so this file
// has no import of its own beyond the shared proportions and can be checked in Node with any three@0.160 build.
// One merged, low-poly BufferGeometry + one shared Lambert material = one draw call, only while an observation needs it.
// Lit like the legacy walls and the start decal: vertex colours carry the baked fluorescent level at each vertex (lightAt = the game's
// bakeLevel over the nearby panels), the hemisphere light and the fog do the rest. No glow, no eyes, no face, no animation.

import { figureLean } from './observerPlacement.js';

// Proportions (fractions of the nominal height H): hip 0.53 H, knee 0.275 H, fingertips ~0.19 H above the floor (below the knees),
// shoulders only ±0.125 m, head 0.24 m tall on a long neck. Slightly asymmetric (one shoulder lower, head tilted) per observation.
export function buildObserverGeometry(THREE, { height, ceil, seed = 0.5 }) {
  const H = height, lean = figureLean(H, ceil), hipY = 0.53 * H, kneeY = 0.275 * H, ankY = 0.035 * H;
  const headC = H - 0.118, neckTop = headC - 0.085, shY = neckTop - 0.15, side = seed < 0.5 ? -1 : 1, asym = 0.012 + 0.02 * ((seed * 7.31) % 1);
  const V = (x, y, z) => new THREE.Vector3(x, y, z), M = () => new THREE.Matrix4();
  const up = M().makeTranslation(0, hipY, 0).multiply(M().makeRotationX(lean.theta)).multiply(M().makeTranslation(0, -hipY, 0)); // stoop
  const U = v => v.applyMatrix4(up);
  const parts = [];
  const limb = (a, b, r0, r1, flat = 1, seg = 6) => {
    const d = b.clone().sub(a), len = d.length(), g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
    g.applyMatrix4(M().makeScale(1, 1, flat));
    g.applyMatrix4(M().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())));
    g.applyMatrix4(M().makeTranslation((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)); parts.push(g);
  };
  const blob = (m, rx, ry, rz) => { const g = new THREE.SphereGeometry(1, 9, 7); g.applyMatrix4(m.multiply(M().makeScale(rx, ry, rz))); parts.push(g); };
  // legs (not stooped), knees very slightly bent, small narrow feet
  for (const sx of [-1, 1]) {
    const hip = V(0.068 * sx, hipY, 0), knee = V(0.058 * sx, kneeY, 0.016), ank = V(0.056 * sx, ankY, 0);
    limb(hip, knee, 0.05, 0.036); limb(knee, ank, 0.034, 0.021); limb(ank, V(0.06 * sx, 0.012, 0.15), 0.022, 0.01, 0.6, 5);
    blob(M().makeTranslation(knee.x, knee.y, knee.z), 0.036, 0.04, 0.036);
  }
  blob(M().makeTranslation(0, hipY, 0), 0.1, 0.075, 0.064);                           // pelvis
  limb(U(V(0, hipY, 0)), U(V(0, shY - 0.03, 0)), 0.068, 0.095, 0.6, 7);                 // long, flat, narrow torso
  blob(up.clone().multiply(M().makeTranslation(0, shY - 0.18, 0)), 0.1, 0.2, 0.062);    // rib cage
  const shL = U(V(-0.125, shY - (side < 0 ? asym : 0), 0)), shR = U(V(0.125, shY - (side > 0 ? asym : 0), 0));
  limb(shL, shR, 0.034, 0.034, 0.8, 6);                                                 // shoulder line
  limb(U(V(0, shY - 0.04, 0)), U(V(0, neckTop, 0.022)), 0.032, 0.026);                  // neck
  blob(up.clone().multiply(M().makeTranslation(0, headC, 0.035)).multiply(M().makeRotationZ(side * 0.19)).multiply(M().makeRotationX(0.12 + lean.theta * 0.6)), 0.066, 0.12, 0.08); // small, long head
  // arms hang straight down from the (stooped) shoulders, far too long: fingertips below the knees
  for (const [sh, sx] of [[shL, -1], [shR, 1]]) {
    const len = sh.y - 0.19 * H, el = sh.clone().add(V(0.03 * sx, -0.45 * len, 0.035)), wr = el.clone().add(V(0.012 * sx, -0.4 * len, 0.03)), tip = wr.clone().add(V(0.004 * sx, -0.15 * len, 0.025));
    limb(sh, el, 0.03, 0.024); limb(el, wr, 0.023, 0.017); limb(wr, tip, 0.019, 0.004, 0.55, 5);
    blob(M().makeTranslation(el.x, el.y, el.z), 0.025, 0.028, 0.025);
  }
  // merge (positions, normals, index), then scale down if even the stoop does not fit under the ceiling
  let nv = 0, ni = 0; for (const g of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint16Array(ni); let ov = 0, oi = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count; oi += ix.length; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (lean.scale < 1) geo.applyMatrix4(M().makeScale(lean.scale, lean.scale, lean.scale));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

// Owns at most one mesh. update(frame) creates / moves / removes it; hide() and dispose() free the GPU resources.
// lightAt(x,y,z) -> baked light level (index.html: bakeLevel over the panels near that point), albedo() -> 0..1 (F3 "Figure tone").
export function createObserverRenderer(THREE, { scene, lightAt, albedo = () => 0.03 }) {
  let mesh = null, key = '', mat = null, lx = NaN, lz = NaN, lyaw = NaN;
  const stats = { builds: 0, disposals: 0 };
  const material = () => mat || (mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x080706 }));
  function recolor(x, z, yaw) {
    const g = mesh.geometry, p = g.attributes.position.array, c = g.attributes.color, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < c.count; i++) { const px = p[i * 3], py = p[i * 3 + 1], pz = p[i * 3 + 2], l = lightAt(px * cy + pz * sy + x, py, -px * sy + pz * cy + z); c.setXYZ(i, l, l, l); }
    c.needsUpdate = true; lx = x; lz = z; lyaw = yaw;
  }
  function hide() { if (!mesh) return; scene.remove(mesh); mesh.geometry.dispose(); mesh = null; key = ''; stats.disposals++; }
  return {
    stats,
    get mesh() { return mesh; },
    update(f) {
      if (!f || !f.show) { hide(); return; }
      const k = f.height.toFixed(3) + '|' + f.ceil + '|' + (f.seed ?? 0.5);
      if (!mesh || key !== k) {
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); stats.disposals++; }
        mesh = new THREE.Mesh(buildObserverGeometry(THREE, { height: f.height, ceil: f.ceil, seed: f.seed ?? 0.5 }), material());
        mesh.name = 'observer'; scene.add(mesh); key = k; lx = NaN; stats.builds++;
      }
      material().color.setScalar(Math.max(0.005, albedo()));
      mesh.position.set(f.x, 0, f.z); mesh.rotation.set(0, f.yaw, 0);
      if (!(Math.abs(f.x - lx) < 0.05 && Math.abs(f.z - lz) < 0.05 && Math.abs(f.yaw - lyaw) < 0.05)) recolor(f.x, f.z, f.yaw);
    },
    hide,
    dispose() { hide(); if (mat) { mat.dispose(); mat = null; } },
  };
}
