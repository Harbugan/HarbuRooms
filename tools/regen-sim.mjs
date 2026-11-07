#!/usr/bin/env node
// Region retirement simulator (docs/WORLDGEN.md, "Region retirement"). Walks a virtual player through the world with the same chunk
// loading rule as updateChunks() in index.html (build within `range`, keep within range+1) and runs the game's own regenTracker()
// from the GEN block. Teleport walk: walls are ignored, only the loading pattern matters.
//   node tools/regen-sim.mjs [--apply] [--seconds 3600] [--seed 1] [--dist 8] [--delay 20] [--json]
// --no-ring (test of the test): the tracker is told nothing is busy and dist is the only guard; with a small --dist the safety
// check must then report violations.
// Without --apply it is the dry run the game does (nothing changes). With --apply every retirable region gets epoch+1 (what step 4
// will do) and the safety property is checked every simulated second:
//   * no built chunk's layout, and no layout of its 3 x 3 neighbourhood (all that addChunk() reads), changes while it is built;
//   * the start chunks (within START_PIN of spawn) never change; every epoch change targets a region with no busy ring chunk.
import {createHash} from 'node:crypto';
import {loadGen} from './gen-lib.mjs';
const argv=process.argv.slice(2),opt=n=>argv.includes('--'+n),val=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0?+argv[i+1]:d};
const apply=opt('apply'),secs=val('seconds',3600),seed=val('seed',1),dist=val('dist',8),delay=val('delay',20);
const G=loadGen(),{N,range}=G,tr=G.regenTracker();
const dig=(x,z)=>{const L=G.layout(x,z),h=createHash('sha1');h.update(Buffer.from(L.hw));h.update(Buffer.from(L.vw));h.update(JSON.stringify([L.lint,L.pillars,L.lights,L.E.map(e=>[...e.open,e.h,e.lint])]));return h.digest('hex')};
const hood=(x,z)=>{let s='';for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)s+=dig(x+a,z+b);return s};
let r=seed>>>0;const rnd=()=>{r=r+0x6D2B79F5|0;let t=Math.imul(r^r>>>15,1|r);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const start=new Map();for(let a=-G.START_PIN;a<=G.START_PIN;a++)for(let b=-G.START_PIN;b<=G.START_PIN;b++)start.set(a+','+b,dig(a,b));
// walk: legs of 20-300 s at 1.4-4.6 m/s in a random direction; every 4th leg heads back towards the spawn (so old areas are revisited)
let px=8,pz=8,vx=0,vz=0,leg=0,legN=0;const built=new Map(); // id -> neighbourhood digest at build time
let events=0,violations=[],startBad=0,maxBuilt=0,revisitsChanged=0;const retiredAt=new Map(),epochs=new Map();
for(let t=0;t<secs;t++){
  if(--leg<=0){legN++;leg=20+Math.floor(rnd()*280);const sp=1.4+rnd()*3.2;let a=rnd()*Math.PI*2;if(legN%4===0)a=Math.atan2(8-pz,8-px)+(rnd()-.5)*.6;vx=Math.cos(a)*sp;vz=Math.sin(a)*sp}
  px+=vx;pz+=vz;const cx=Math.floor(px/N),cz=Math.floor(pz/N);
  for(const id of [...built.keys()]){const [x,z]=id.split(',').map(Number);if(Math.abs(x-cx)>range+1||Math.abs(z-cz)>range+1)built.delete(id)}
  for(let x=cx-range;x<=cx+range;x++)for(let z=cz-range;z<=cz+range;z++){const id=x+','+z;if(!built.has(id)){tr.seen(x,z);built.set(id,apply?hood(x,z):'');
    const [rx,rz]=G.regionAt(x,z);if(retiredAt.has(rx+','+rz)){revisitsChanged++;retiredAt.delete(rx+','+rz)}}}
  maxBuilt=Math.max(maxBuilt,built.size);
  for(const e of tr.update(t,cx,cz,opt('no-ring')?()=>false:(x,z)=>built.has(x+','+z),dist,delay)){events++;
    for(const [x,z] of G.regionChunks(e.rx,e.rz))for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++)if(built.has((x+a)+','+(z+b)))violations.push(`t=${t}: region ${e.rx},${e.rz} retirable while chunk ${x+a},${z+b} is built`);
    if(apply){if(!G.setRegionEpoch(e.rx,e.rz,e.epoch+1))violations.push(`t=${t}: pinned region ${e.rx},${e.rz} reported retirable`);tr.forget(e.rx,e.rz);retiredAt.set(e.rx+','+e.rz,t);epochs.set(e.rx+','+e.rz,e.epoch+1)}}
  if(apply&&t%5===0){for(const [id,h] of built){const [x,z]=id.split(',').map(Number);if(hood(x,z)!==h){violations.push(`t=${t}: built chunk ${id} (or a neighbour) changed while built`);built.set(id,hood(x,z))}}
    for(const [id,h] of start)if(dig(...id.split(',').map(Number))!==h)startBad++}}
const hist={};for(const e of epochs.values())hist[e]=(hist[e]||0)+1;
const res={mode:apply?'apply (epoch+1 on every retirable region)':'dry run',seconds:secs,seed,dist,delay,finalPos:[+px.toFixed(0),+pz.toFixed(0)],
  retireEvents:events,regionsTracked:tr.stats().tracked,maxBuiltChunks:maxBuilt,revisitedRegionsThatHadBeenRebuilt:apply?revisitsChanged:undefined,epochHistogram:apply?hist:undefined,
  safety:violations.length?`FAIL: ${violations.length} (first: ${violations[0]})`:'ok (no built chunk or neighbour changed while built; no busy ring at retirement)',
  startArea:startBad?`FAIL: changed ${startBad} times`:'ok (start chunks never changed)'};
console.log(opt('json')?JSON.stringify(res):JSON.stringify(res,null,1));
