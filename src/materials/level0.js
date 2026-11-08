// THE NULL ROOMS — Level 0 hybrid material system (v0.2).  Docs: docs/MATERIALS.md
//
// Three replaceable surface materials for the existing procedural Level 0 geometry:
//   wall  = MAT_01 Yellowed Wallpaper    floor = MAT_02 Damp Office Carpet    ceil = MAT_03 Acoustic Ceiling
//
// Design rules (see docs/MATERIALS.md for the reasoning):
//  * Geometry, UVs, baked vertex-colour lighting and the Builder are NOT touched. This module only supplies materials.
//  * Each material exists in two forms: the original Lambert one ("legacy", created by index.html) and a
//    MeshStandardMaterial ("pbr") defined here. setMode() swaps between them so the two can be compared live.
//  * Every texture channel (baseColor / normal / roughness) is independently replaceable. Until an external file
//    loads - or if it is missing / fails - the channel keeps its deterministic procedural texture, so the game never
//    depends on any asset file.
//  * Materials and textures are created once and shared by every chunk (no per-chunk materials, no extra draw calls).
//  * Large-surface repetition is broken with a tiny world-space "macro" shader term, not by touching UVs.
//  * External base-colour textures are shown with their own colours: the baked palette hue is dropped (only the baked
//    light level is kept) and the macro colour drift is off. Both are configurable (externalPaletteInfluence / externalMacroColor).

const wrap = (i, n) => ((i % n) + n) % n;

// ---------------------------------------------------------------------------------------------------------------
// Parameters. Anything under `params` can be overridden per material from assets/textures/level0/manifest.json.
// ---------------------------------------------------------------------------------------------------------------
export const LEVEL0_DEFAULTS = {
  wall: {
    id: 'MAT_01', label: 'Yellowed Wallpaper', folder: 'wallpaper',
    params: {
      size: null,              // metres covered by ONE repeat of an external texture [width, height]; null = [2, wall height]
      externalPaletteInfluence: 0, // paletteInfluence used once an external base colour is loaded (0 = texture keeps its own colours)
      externalMacroColor: 0,   // macroColor used once an external base colour is loaded (0 = no colour drift)
      deriveMaps: true,        // external base colour but no external normal / roughness: derive them from it instead of keeping the old procedural ones
      normalScale: 0.28,       // strength of the normal map (subtle paper tooth / printed relief)
      roughness: 1,            // multiplier on the roughness map (map holds absolute values, glTF convention)
      paletteInfluence: 1,     // 1 = vertex colour tints the map exactly like the legacy material; 0 = vertex colour only dims it
      gain: 0.985,             // diffuse multiplier; measured Standard-vs-Lambert offset was about +1.3%
      specular: 1,             // multiplier on specular highlights (Standard adds a small torch sheen the Lambert look never had)
      macroColor: 0.045, macroRoughness: 0.03, // amplitude of the large-scale colour / roughness drift
    },
    macro: { plane: 'wall', scales: [5.3, 13.1], tint: [0.55, 0.8, 1.0], seed: [3.7, 9.1] },
    proc: { normalStrength: 2.2, normalBlur: 2, roughBase: 0.9, roughDetail: 0.35, roughLow: 0.2 },
  },
  floor: {
    id: 'MAT_02', label: 'Damp Office Carpet', folder: 'carpet',
    params: {
      size: [2, 2], normalScale: 0.6, roughness: 1, paletteInfluence: 1, gain: 0.985, specular: 1,
      externalPaletteInfluence: 0, externalMacroColor: 0, deriveMaps: true,
      macroColor: 0.07, macroRoughness: 0.07,
    },
    macro: { plane: 'xz', scales: [4.3, 11.7], tint: [0.9, 0.95, 1.0], seed: [12.3, 5.5] },
    proc: { normalStrength: 2.4, normalBlur: 1, roughBase: 0.95, roughDetail: 0.2, roughLow: 0.9 }, // damp = low-frequency dark patches get glossier
  },
  ceil: {
    id: 'MAT_03', label: 'Acoustic Ceiling', folder: 'ceiling',
    params: {
      size: null,              // null = exactly one ceiling panel (opts.ceilSize, 0.5 x 1.0 m) per repeat, so panel edges sit on the grid
      normalScale: 0.4, roughness: 1, paletteInfluence: 1, gain: 0.985, specular: 1,
      externalPaletteInfluence: 0, externalMacroColor: 0, deriveMaps: true,
      macroColor: 0.05, macroRoughness: 0.02,
    },
    macro: { plane: 'xz', scales: [6.1, 14.9], tint: [0.55, 0.8, 1.0], seed: [7.7, 1.3] },
    proc: { normalStrength: 3.0, normalBlur: 1, roughBase: 0.92, roughDetail: 0.3, roughLow: 0.15 },
  },
};
const KINDS = Object.keys(LEVEL0_DEFAULTS);

// Environmental details (step 4A, docs/ENVIRONMENT.md): a shader-only overlay inside the three shared materials. All values are fractions 0..1.
//   wear       share of 2 m wall segments (one side of a wall each) with baseboard grime or a soft discoloured patch
//   damp       share of 4 x 4 m floor cells holding one soft damp-carpet patch
//   ceil       share of 0.5 x 1.0 m ceiling panels with a faint stain
//   intensity  strength of every effect (0.25 = barely noticeable);  show = paint the affected spots in flat debug colours
export const ENV_DEFAULTS = { enabled: true, wear: 0.08, damp: 0.03, ceil: 0.02, intensity: 0.25, show: false };
const CHANNELS = ['baseColor', 'normal', 'roughness'];

// ---------------------------------------------------------------------------------------------------------------
// Procedural normal + roughness maps derived from the existing procedural base-colour canvases (deterministic).
// ---------------------------------------------------------------------------------------------------------------
function lumaField(canvas) {
  const { width: w, height: h } = canvas, d = canvas.getContext('2d').getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return { L, w, h };
}
// Separable wrap-around box blur (textures tile, so the blur must too).
function blurWrap(src, w, h, r) {
  const n = 2 * r + 1, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0; for (let k = -r; k <= r; k++) s += src[y * w + wrap(k, w)];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + wrap(x + r + 1, w)] - src[y * w + wrap(x - r, w)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += tmp[wrap(k, h) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[wrap(y + r + 1, h) * w + x] - tmp[wrap(y - r, h) * w + x]; }
  }
  return out;
}
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function deriveProceduralMaps(baseCanvas, p) {
  const { L, w, h } = lumaField(baseCanvas);
  const mean = L.reduce((a, b) => a + b, 0) / L.length;
  // high-pass = fine detail (fibres, pores, paper tooth); low-pass = stains / damp patches
  const smooth = blurWrap(L, w, h, p.normalBlur), coarse = blurWrap(L, w, h, 7), low = blurWrap(L, w, h, 24);
  const hp = new Float32Array(w * h), height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { hp[i] = L[i] - coarse[i]; height[i] = smooth[i] - coarse[i]; }

  // Normal map (OpenGL / +Y up). Canvas rows run top->bottom while V runs bottom->top (flipY), hence ny = +d/drow.
  const nc = newCanvas(w, h), ng = nc.getContext('2d'), nimg = ng.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (height[y * w + wrap(x + 1, w)] - height[y * w + wrap(x - 1, w)]) * 0.5 * p.normalStrength * 8,
          dy = (height[wrap(y + 1, h) * w + x] - height[wrap(y - 1, h) * w + x]) * 0.5 * p.normalStrength * 8,
          il = 1 / Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
    nimg.data[o] = (-dx * il * 0.5 + 0.5) * 255; nimg.data[o + 1] = (dy * il * 0.5 + 0.5) * 255; nimg.data[o + 2] = (il * 0.5 + 0.5) * 255; nimg.data[o + 3] = 255;
  }
  ng.putImageData(nimg, 0, 0);

  // Roughness map: absolute values in the G channel. Pores / fibre gaps are rougher; dark low-frequency patches are
  // slightly smoother (damp). Everything stays in a narrow, matte range.
  const rc = newCanvas(w, h), rg = rc.getContext('2d'), rimg = rg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const r = Math.min(1, Math.max(0.45, p.roughBase - hp[i] * p.roughDetail + (low[i] - mean) * p.roughLow)), v = r * 255, o = i * 4;
    rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = v; rimg.data[o + 3] = 255;
  }
  rg.putImageData(rimg, 0, 0);
  return { normalCanvas: nc, roughnessCanvas: rc };
}

// ---------------------------------------------------------------------------------------------------------------
// Shader patch: (1) palette influence, (2) deterministic world-space macro variation. Chunk meshes use an identity
// matrix (vertex positions ARE world positions), so `position` doubles as the world coordinate. Because the field is a
// pure function of world position it is identical on both sides of every chunk seam.
// ---------------------------------------------------------------------------------------------------------------
const GLSL_COMMON = /* glsl */`
uniform vec3 uMacroTint; uniform vec2 uMacroScale, uMacroSeed, uMacroAmp; uniform float uPalette, uGain, uSpec;
varying vec3 vMacroP; varying float vLight;
float mHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float mNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mHash(i),mHash(i+vec2(1.,0.)),f.x),mix(mHash(i+vec2(0.,1.)),mHash(i+vec2(1.,1.)),f.x),f.y);}
float macroField(vec3 P){
  #ifdef MACRO_WALL
  vec2 q=vec2(P.x+P.z,P.y);
  #else
  vec2 q=P.xz;
  #endif
  q+=uMacroSeed;return (mNoise(q/uMacroScale.x)*.65+mNoise(q/uMacroScale.y+17.)*.35)*2.-1.;}
`;
// Environmental details. Every decision is a pure hash of WORLD cell coordinates (wall segment / floor cell / ceiling panel), so
// a spot looks identical after a chunk is unloaded and rebuilt, on both sides of a chunk seam, and nothing is stored per chunk.
// A cell is affected when its hash < frequency, so raising a slider only ever adds cells. Effects multiply the albedo only
// (baked light, normal and roughness are untouched) and fade out inside their cell, so there are no hard overlay edges.
const GLSL_ENV = /* glsl */`
uniform vec4 uEnvF; uniform vec2 uEnvI; varying vec3 vEnvN;
float eH(vec2 c,float s){return mHash(c+vec2(s*7.31,s*3.17));}
vec3 envDetail(vec3 P,vec3 N,out float mk,out vec3 dbg){
  mk=0.;dbg=vec3(0.);
  if(uEnvF.x<.5)return vec3(1.);
  vec3 strong=vec3(1.);float amt=clamp(uEnvI.x*1.5,0.,1.);
  #ifdef ENV_WALL
  if(abs(N.y)<.5){
    bool ax=abs(N.x)>abs(N.z);
    float al=ax?P.z:P.x,ac=ax?P.x:P.z,sd=ax?N.x:N.z;
    vec2 c=vec2(floor(al/2.),floor(ac+.5)*4.+(ax?1.:0.)+(sd>0.?2.:0.)); // 2 m segment of ONE wall face
    if(eH(c,1.)<uEnvF.y){
      float lx=al-c.x*2.,edge=smoothstep(0.,.45,lx)*smoothstep(0.,.45,2.-lx);
      float n=mNoise(vec2(al*1.9,P.y*1.3)+c*5.3);
      if(eH(c,2.)<.5){ // grime along the baseboard
        float h=(.22+.3*eH(c,3.))*(.55+.9*mNoise(vec2(al*2.3,c.y)+c.x*3.1));
        mk=(1.-smoothstep(h*.25,h,P.y))*edge;strong=vec3(.62,.55,.40);
      }else{ // soft yellowed / slightly darker patch of wallpaper
        vec2 d=(vec2(lx,P.y)-vec2(.8+.4*eH(c,4.),.9+eH(c,5.)))/vec2(.5+.35*eH(c,6.),.4+.4*eH(c,7.));
        d+=(n-.5)*.6;mk=(1.-smoothstep(.25,1.,length(d)))*edge*(.7+.6*n);
        strong=eH(c,8.)<.3?vec3(.78,.74,.68):vec3(.84,.78,.58);
      }
      dbg=vec3(1.,0.,.8);
    }
  }
  #endif
  #ifdef ENV_FLOOR
  if(N.y>.5){
    vec2 c=floor(P.xz/4.); // 4 x 4 m cell; patch (<= 1.9 m reach) never crosses the cell border
    if(eH(c,11.)<uEnvF.z){
      vec2 d=P.xz-((c+.5)*4.+(vec2(eH(c,12.),eH(c,13.))-.5));
      d+=(vec2(mNoise(P.xz*1.4+c),mNoise(P.xz*1.4+c+9.1))-.5)*.55;
      float rad=.6+.5*eH(c,14.);
      mk=(1.-smoothstep(rad*.3,rad,length(d)))*(.65+.35*mNoise(P.xz*3.7));
      strong=vec3(.62,.57,.50);dbg=vec3(0.,.5,1.);
    }
  }
  #endif
  #ifdef ENV_CEIL
  if(N.y<-.5){
    vec2 pp=vec2(P.x/.5,P.z),c=floor(pp),f=fract(pp); // exactly one 0.5 x 1.0 m panel
    if(eH(c,21.)<uEnvF.w){
      vec2 cn=vec2(eH(c,22.)<.5?0.:1.,eH(c,23.)<.5?0.:1.);
      float m=1.-smoothstep(.05,.95,length((f-cn)*vec2(.5,1.)));
      mk=(.4+.6*m)*(.8+.4*mNoise(P.xz*6.));
      strong=vec3(.86,.80,.66);dbg=vec3(.2,1.,.2);amt=clamp(uEnvI.x*2.2,0.,1.);
    }
  }
  #endif
  mk=clamp(mk,0.,1.);
  return mix(vec3(1.),strong,mk*amt);
}
`;
const GLSL_ENV_APPLY = /* glsl */`
{float em;vec3 ed;vec3 et=envDetail(vMacroP,vEnvN,em,ed);diffuseColor.rgb*=et;
 if(uEnvI.y>.5&&em>.02)diffuseColor.rgb=mix(diffuseColor.rgb,ed,clamp(em*2.,0.,1.));}
`;
const GLSL_AO = /* glsl */`
// Contact ambient occlusion (4C.3, REALISTIC only: uAO.x = 0 skips everything, so ORIGINAL is untouched). Analytic, no screen-space
// pass: floor/ceiling read a world-space occupancy map (R = walls reaching the floor, G = walls/lintels reaching the ceiling, 0.25 m texels,
// toroidal, filled per chunk in index.html), walls use height above floor / below ceiling plus the map for inside corners.
uniform sampler2D tOcc; uniform vec4 uAO; varying float vAoH;
float aoT(vec2 p,bool up){vec2 t=texture2D(tOcc,p*(1./256.)).rg;return up?t.r:t.g;}
float aoFactor(vec3 P,vec3 N){
  float R=uAO.y,ao=0.;
  #if defined(ENV_FLOOR) || defined(ENV_CEIL)
  if(abs(N.y)>.5){
    bool up=N.y>0.;vec2 q=P.xz,a=vec2(.5*R,0.),b=vec2(0.,.5*R),d=vec2(.7071*R),e=vec2(.7071*R,-.7071*R);
    float s=aoT(q,up)*.16+(aoT(q+a,up)+aoT(q-a,up)+aoT(q+b,up)+aoT(q-b,up))*.12+(aoT(q+d,up)+aoT(q-d,up)+aoT(q+e,up)+aoT(q-e,up))*.09;
    ao=smoothstep(0.,.55,s);
  }
  #endif
  #ifdef ENV_WALL
  if(abs(N.y)<.5){
    float y=P.y,vf=1.-smoothstep(0.,R*.9,y),vc=1.-smoothstep(0.,R*.9,vAoH-y);vf*=vf;vc*=vc;
    bool up=y<2.;vec2 o=P.xz+N.xz*uAO.z,t=vec2(N.z,-N.x);
    float c=0.;
    for(int i=0;i<3;i++){float l=R*(i==0?.3:i==1?.6:.95),w=i==0?.4:i==1?.35:.25;c+=w*max(aoT(o+t*l,up),aoT(o-t*l,up));}
    ao=1.-(1.-vf*.8)*(1.-vc*.8)*(1.-smoothstep(0.,.6,c)*.9);
  }
  #endif
  return ao;
}
`;
const GLSL_AO_APPLY = /* glsl */`
if(uAO.x>0.)diffuseColor.rgb*=1.-uAO.x*aoFactor(vMacroP,vEnvN);
`;

// ---------------------------------------------------------------------------------------------------------------
// THE ENCROACHING DARKNESS (anomaly 01, docs/ANOMALIES.md). A shader-only layer, like AO / environment: no extra pass, mesh or material.
// uDark = (progress 0..~1.4, intensity 0..1, per-run seed, on 0/1). While on = 0 the branch is skipped and the shader output is unchanged.
// Every surface gets an "arrival time" T in [0,1] that is a pure, STATIC function of world position: T is low where the room already is in
// shadow (contact AO + baked light level, weight uDarkK.x) and where a large-scale, domain-warped 3D noise is low (weight 1 - uDarkK.x).
// The darkness of a fragment is smoothstep(T, T + uDarkK.y, progress). Because T never changes while progress only grows, darkness can
// only advance (it never retreats) and the iso-contours of T sweep outwards as organic, merging blobs that start in corners and
// wall joints. World-space + continuous in 3D, so walls, floor and ceiling join up and chunk seams are invisible. uDarkK.z = noise scale (m).
// ---------------------------------------------------------------------------------------------------------------
const GLSL_DARK = /* glsl */`
uniform vec4 uDark; uniform vec3 uDarkK;
float darkLocal=0.;
float dkH(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float dkN(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(dkH(i),dkH(i+vec3(1.,0.,0.)),f.x),mix(dkH(i+vec3(0.,1.,0.)),dkH(i+vec3(1.,1.,0.)),f.x),f.y),
             mix(mix(dkH(i+vec3(0.,0.,1.)),dkH(i+vec3(1.,0.,1.)),f.x),mix(dkH(i+vec3(0.,1.,1.)),dkH(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}
float darkMask(vec3 P,vec3 N,float ao,float vl){
  vec3 q=P/uDarkK.z+vec3(uDark.z,uDark.z*.37,uDark.z*.71);q.y*=1.25;
  vec3 w=vec3(dkN(q*1.6),dkN(q*1.6+vec3(5.2,1.3,9.1)),dkN(q*1.6+vec3(2.7,8.4,3.3)))-.5; // domain warp: bends the fronts into tendrils
  q+=w*1.5;
  float big=dkN(q)*.58+dkN(q*2.1+7.3)*.30+dkN(q*4.4+13.1)*.12;
  big=smoothstep(.22,.78,big);
  float shadow=clamp(ao*1.2+(1.-smoothstep(.55,1.05,vl))*.55,0.,1.); // existing shadow: contact AO + low baked light
  float T=mix(big,1.-shadow,uDarkK.x)+(dkN(P*3.1+uDark.z)-.5)*.07;
  return smoothstep(T,T+uDarkK.y,uDark.x);
}
`;
// P world position, N surface normal, L baked light level (without palette hue). Albedo goes to ~3 % at full darkness; lamps are other materials.
const darkApply = (P, N, L) => /* glsl */`
if(uDark.w>.5){darkLocal=darkMask(${P},${N},aoFactor(${P},${N}),${L})*uDark.y;diffuseColor.rgb*=1.-.97*darkLocal;}
`;
// Fog is applied after lighting; a darkened fragment must not be lifted back to the haze colour, so its fog share is darkened with it
// (far, dark surfaces and openings go black instead of staying hazy). darkLocal = 0 when the anomaly is off -> no change.
const GLSL_DARK_FOG = /* glsl */`
#ifdef USE_FOG
{float ffD=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);gl_FragColor.rgb*=1.-darkLocal*ffD*.92;}
#endif
`;
const GLSL_COLOR = /* glsl */`
float macroV=macroField(vMacroP);
#ifdef USE_COLOR
  diffuseColor.rgb*=mix(vec3(vLight),vColor,uPalette); // vLight = baked light level without the palette hue
#endif
diffuseColor.rgb*=uGain*(1.+uMacroAmp.x*macroV*uMacroTint);
`;
const GLSL_ROUGH = /* glsl */`
roughnessFactor=clamp(roughnessFactor+uMacroAmp.y*macroV,.3,1.);
`;

function makePbrMaterial(THREE, kind, def, tex, envU) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex.baseColor, normalMap: tex.normal, roughnessMap: tex.roughness, roughness: def.params.roughness, metalness: 0,
  });
  m.name = `${def.id}_${def.label.replace(/\s+/g, '')}`;
  const u = {
    uMacroTint: { value: new THREE.Vector3(...def.macro.tint) }, uMacroScale: { value: new THREE.Vector2(...def.macro.scales) },
    uMacroSeed: { value: new THREE.Vector2(...def.macro.seed) }, uMacroAmp: { value: new THREE.Vector2() },
    uPalette: { value: 1 }, uGain: { value: 1 }, uSpec: { value: 1 },
  };
  m.userData.uniforms = u;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u, envU);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMacroP; attribute float aLight; attribute float aHc; varying float vAoH; varying float vLight; varying vec3 vEnvN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroP=position; vLight=aLight; vEnvN=normal; vAoH=aHc;');
    shader.fragmentShader = (def.macro.plane === 'wall' ? '#define MACRO_WALL\n' : '') + '#define ENV_' + kind.toUpperCase() + '\n' + shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_ENV + GLSL_AO + GLSL_DARK)
      .replace('#include <color_fragment>', GLSL_COLOR + GLSL_ENV_APPLY + GLSL_AO_APPLY + darkApply('vMacroP', 'vEnvN', 'vLight'))
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular*=uSpec*(1.-darkLocal);reflectedLight.indirectSpecular*=uSpec*(1.-darkLocal);')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + GLSL_DARK_FOG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + GLSL_ROUGH);
  };
  m.customProgramCacheKey = () => 'level0-' + kind; // one program per surface kind, shared by every chunk
  return m;
}


// Adds the darkness layer to a material that is NOT one of the shared PBR materials: the legacy Lambert walls/floor/ceiling, the ceiling grid
// strips and the start-room decal. kind = 'wall' | 'floor' | 'ceil'. U = { tOcc, uAO, uDark, uDarkK } (the shared uniform objects).
// opts.light = 'aLight' (default, chunk meshes) | 'color' (decal: baked level is in the vertex colour); opts.hc = fixed ceiling height for
// geometry without the aHc attribute. With uDark.w = 0 the output is identical to the unpatched material.
export function patchDarkness(material, kind, U, opts = {}) {
  const lightExpr = opts.light === 'color' ? 'color.r' : 'aLight', hcExpr = opts.hc === undefined ? 'aHc' : Number(opts.hc).toFixed(3);
  material.onBeforeCompile = shader => {
    for (const k of ['tOcc', 'uAO', 'uDark', 'uDarkK']) shader.uniforms[k] = U[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDkP; varying vec3 vDkN; varying float vDkL; varying float vAoH;' + (opts.light === 'color' ? '' : ' attribute float aLight;') + (opts.hc === undefined ? ' attribute float aHc;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvDkP=position; vDkN=normal; vDkL=${lightExpr}; vAoH=${hcExpr};`);
    shader.fragmentShader = '#define ENV_' + kind.toUpperCase() + '\n' + shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDkP; varying vec3 vDkN; varying float vDkL;\n' + GLSL_AO + GLSL_DARK)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + darkApply('vDkP', 'vDkN', 'vDkL'))
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n' + GLSL_DARK_FOG);
  };
  material.customProgramCacheKey = () => 'dark-' + (opts.id || kind);
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------------------------------------------
// Public factory.
//   THREE      the Three.js namespace (index.html loads it dynamically, so it is injected)
//   opts.renderer, opts.H          renderer (for anisotropy) and wall height in metres (wall V unit = one H)
//   opts.ceilSize [w, l]           ceiling panel size in metres along x and z (default [0.5, 1])
//   opts.legacy {wall,floor,ceil}  the original Lambert materials (kept unmodified as the comparison baseline)
//   opts.procedural {wall,floor,ceil}  the original procedural base-colour CanvasTextures (reused as-is)
//   opts.mode                      'pbr' (default) | 'legacy'
//   opts.manifestUrl               defaults to assets/textures/level0/manifest.json
//   opts.onModeChange(active)      called whenever the active material set changes
// Returns synchronously with working materials; external textures stream in afterwards.
// ---------------------------------------------------------------------------------------------------------------
export function createLevel0Materials(THREE, opts) {
  const { renderer, H, legacy, procedural } = opts, ceilSize = opts.ceilSize || [0.5, 1];
  const manifestUrl = new URL(opts.manifestUrl || 'assets/textures/level0/manifest.json', document.baseURI).href;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const defs = {}, pbr = {}, tex = {}, state = {}, kindOf = new Map(), scaled = {};
  const env = { ...ENV_DEFAULTS }, envU = { uEnvF: { value: new THREE.Vector4() }, uEnvI: { value: new THREE.Vector2() }, ...(opts.aoUniforms || {}) }; // shared by all three materials: no recompiles, live
  const applyEnv = () => { envU.uEnvF.value.set(env.enabled ? 1 : 0, env.wear, env.damp, env.ceil); envU.uEnvI.value.set(env.intensity, env.show ? 1 : 0); };
  applyEnv();

  for (const kind of KINDS) {
    const def = defs[kind] = { ...LEVEL0_DEFAULTS[kind], params: { ...LEVEL0_DEFAULTS[kind].params } };
    const base = procedural[kind], image = base.image;
    const { normalCanvas, roughnessCanvas } = deriveProceduralMaps(image, def.proc);
    const mk = (canvas, srgb) => {
      const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
    };
    tex[kind] = { baseColor: base, normal: mk(normalCanvas, false), roughness: mk(roughnessCanvas, false) };
    state[kind] = { baseColor: 'procedural', normal: 'procedural', roughness: 'procedural' }; scaled[kind] = new Set();
    pbr[kind] = makePbrMaterial(THREE, kind, def, tex[kind], envU);
    kindOf.set(pbr[kind], kind); kindOf.set(legacy[kind], kind);
  }

  function applyParams(kind) {
    const { params: p } = defs[kind], m = pbr[kind], u = m.userData.uniforms;
    m.normalScale.set(p.normalScale, p.normalScale); m.roughness = p.roughness;
    const ext = state[kind].baseColor === 'external';
    u.uMacroAmp.value.set(ext ? p.externalMacroColor : p.macroColor, p.macroRoughness); u.uPalette.value = ext ? p.externalPaletteInfluence : p.paletteInfluence;
    u.uGain.value = p.gain; u.uSpec.value = p.specular;
    applyRepeat(kind);
  }
  // Size of one texture repeat in metres. UV units: 1 u = 2 m along walls/floor/ceiling; wall 1 v = H metres, floor/ceiling 1 v = 2 m.
  function sizeOf(kind) { return defs[kind].params.size || (kind === 'ceil' ? ceilSize : [2, kind === 'wall' ? H : 2]); }
  function applyRepeat(kind) { const s = sizeOf(kind); for (const t of scaled[kind]) t.repeat.set(2 / s[0], (kind === 'wall' ? H : 2) / s[1]); }
  KINDS.forEach(applyParams);

  let mode = opts.mode === 'legacy' ? 'legacy' : 'pbr';
  const active = {};
  const refresh = () => { for (const k of KINDS) active[k] = (mode === 'pbr' ? pbr : legacy)[k]; };
  refresh();

  const api = {
    get mode() { return mode; },
    active,
    defs,
    status: () => JSON.parse(JSON.stringify(state)),
    // Environmental details (docs/ENVIRONMENT.md). Pure uniforms: live, no chunk rebuild. NULLROOMS_MATERIALS.setEnvironment({ wear: .3, show: true })
    env,
    setEnvironment(p) { for (const k in ENV_DEFAULTS) if (p && k in p) env[k] = typeof ENV_DEFAULTS[k] === 'boolean' ? !!p[k] : Math.max(0, Math.min(1, Number(p[k]) || 0)); applyEnv(); return { ...env }; },
    kindOf: m => kindOf.get(m),
    // Re-point every mesh under `root` to the active material of its kind (no-op for glow / grid / unknown materials).
    apply(root) { root.traverse(o => { const k = o.isMesh && kindOf.get(o.material); if (k) o.material = active[k]; }); },
    setMode(next, root) {
      next = next === 'legacy' ? 'legacy' : 'pbr'; if (next === mode) return mode;
      mode = next; refresh(); if (root) api.apply(root); if (opts.onModeChange) opts.onModeChange(active, mode); return mode;
    },
    // Live tuning from the console, e.g. NULLROOMS_MATERIALS.setParams('floor',{normalScale:.8}). Not persisted.
    setParams(kind, p) { Object.assign(defs[kind].params, p); applyParams(kind); }, // also live: { size: [1.5, 1.5] }
    toggle(root) { return api.setMode(mode === 'pbr' ? 'legacy' : 'pbr', root); },
    ready: null,
  };

  // --- external assets -----------------------------------------------------------------------------------------
  const loader = new THREE.TextureLoader();
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const KEY = { baseColor: 'map', normal: 'normalMap', roughness: 'roughnessMap' };
  function assign(kind, channel, t, how) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    t.colorSpace = channel === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    scaled[kind].add(t); pbr[kind][KEY[channel]] = t; pbr[kind].needsUpdate = true; state[kind][channel] = how;
  }
  // External base colour but no external normal / roughness: derive them from the new image so relief matches what is painted.
  function deriveFromExternal(kind, img) {
    const c = newCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height); c.getContext('2d').drawImage(img, 0, 0);
    const { normalCanvas, roughnessCanvas } = deriveProceduralMaps(c, defs[kind].proc);
    for (const [ch, cv] of [['normal', normalCanvas], ['roughness', roughnessCanvas]])
      if (state[kind][ch] === 'procedural') assign(kind, ch, new THREE.CanvasTexture(cv), 'derived');
  }
  async function loadChannel(kind, channel, rel, baseUrl) {
    const url = new URL(rel, baseUrl).href;
    try {
      const t = await load(url);
      assign(kind, channel, t, 'external');
      if (channel === 'baseColor' && defs[kind].params.deriveMaps) deriveFromExternal(kind, t.image);
      applyParams(kind); // external base colour switches palette / macro influence and sets the repeat
    } catch (e) {
      state[kind][channel] = 'failed';
      console.warn(`[materials] ${kind}.${channel}: could not load ${url}; using procedural fallback`);
    }
  }
  // ?wallSize=1.2  ?floorSize=1x1.5  ?ceilSize=0.5   metres per texture repeat; wins over the manifest.
  function applyQuerySizes() {
    const q = new URLSearchParams(location.search);
    for (const kind of KINDS) {
      const n = (q.get(kind + 'Size') || '').split(/[x,]/).map(Number).filter(v => v > 0);
      if (n.length) { defs[kind].params.size = [n[0], n[n.length > 1 ? 1 : 0]]; applyParams(kind); }
    }
  }
  api.ready = (async () => {
    let manifest = null;
    try {
      const r = await fetch(manifestUrl, { cache: 'no-cache' });
      if (r.ok) manifest = await r.json(); else console.info(`[materials] no manifest (${r.status}); procedural materials only`);
    } catch (e) { console.info('[materials] manifest unavailable or invalid; procedural materials only'); }
    if (!manifest || typeof manifest !== 'object' || !manifest.materials) { applyQuerySizes(); return api.status(); }
    const jobs = [];
    for (const kind of KINDS) {
      const entry = manifest.materials[kind] || manifest.materials[LEVEL0_DEFAULTS[kind].folder];
      if (!entry || typeof entry !== 'object') continue;
      for (const [k, v] of Object.entries(entry.params || {})) if (k in defs[kind].params) defs[kind].params[k] = v;
      applyParams(kind);
      for (const ch of CHANNELS) {
        const rel = entry.textures && entry.textures[ch];
        if (typeof rel === 'string' && rel) jobs.push(loadChannel(kind, ch, rel, manifestUrl));
      }
    }
    applyQuerySizes();
    await Promise.all(jobs);
    if (jobs.length) console.info('[materials] texture status', api.status());
    return api.status();
  })();
  return api;
}
