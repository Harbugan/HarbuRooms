#!/usr/bin/env node
// World-generator checks: determinism, playability (flood fill with the game's real collision rule) and layout statistics.
//   node tools/gen-check.mjs [--radius 6] [--legacy] [--compare] [--json]
//   node tools/gen-check.mjs --epochs [--runs 4] [--seed 1] [--max-epoch 3] [--baseline old-index.html]
// --compare runs the legacy generator (?gen=legacy) and the current one side by side.
// --epochs (region epochs, docs/WORLDGEN.md): runs the all-epoch-0 world and --runs worlds where every region gets a random epoch
// 0..max-epoch, and checks: epoch 0 unchanged (vs --baseline, e.g. `git show origin/main:index.html > /tmp/old.html`), locality
// (a chunk's layout depends only on its own region's epoch; its collision boxes only on the epochs of its 3x3 neighbourhood),
// determinism, boundary agreement, playability and the openings on region borders, in mixed-epoch worlds.
import {createHash} from 'node:crypto';
import {loadGen,chunkBoxes} from './gen-lib.mjs';

const argv=process.argv.slice(2),opt=n=>argv.includes('--'+n),val=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0?+argv[i+1]:d};
const R=val('radius',6);

function digest(G,L){const h=createHash('sha1');
  h.update(Buffer.from(L.hw));h.update(Buffer.from(L.vw));h.update(JSON.stringify([L.lint,L.pillars,L.lights,L.E.map(e=>[...e.open,e.h,e.lint])]));return h.digest('hex')}

function chunkList(){const l=[];for(let z=-R;z<=R+1;z++)for(let x=-R;x<=R+1;x++)l.push([x,z]);return l}

function generate(legacy,reverse=false,setup=null,file){const G=loadGen({legacy,file}),l=chunkList();if(setup)setup(G);if(reverse)l.reverse();
  const t0=performance.now(),dg=new Map();for(const [x,z] of l)dg.set(x+','+z,digest(G,G.layout(x,z)));
  return {G,dg,ms:performance.now()-t0,n:l.length}}

function analyse(legacy,setup=null){
  const out={};
  const A=generate(legacy,false,setup),B=generate(legacy,true,setup);
  let diff=0;for(const [k,v] of A.dg)if(B.dg.get(k)!==v)diff++;
  out.determinism=diff?`FAIL: ${diff} chunks differ with reversed generation order`:'ok (forward == reverse order)';
  out.genMsPerChunk=+(A.ms/A.n).toFixed(2);
  const G=A.G,N=G.N,x0=-R*N,z0=-R*N,W=(2*R+1)*N;
  // global wall arrays: W0[line z][cell x] (walls along x), W1[line x][cell z] (walls along z); lines x0..x0+W inclusive
  const W0=new Uint8Array((W+1)*W),W1=new Uint8Array((W+1)*W);
  for(let cz=-R;cz<=R+1;cz++)for(let cx=-R;cx<=R+1;cx++){const L=G.layout(cx,cz);
    for(let line=0;line<N;line++)for(let i=0;i<N;i++){
      const gz=cz*N+line-z0,gx=cx*N+i-x0;if(gz>=0&&gz<=W&&gx>=0&&gx<W)W0[gz*W+gx]=L.hw[line*N+i];
      const gx2=cx*N+line-x0,gz2=cz*N+i-z0;if(gx2>=0&&gx2<=W&&gz2>=0&&gz2<W)W1[gx2*W+gz2]=L.vw[line*N+i]}}
  // edge agreement between neighbouring chunks (both compute the same boundary)
  let eb=0;for(let cz=-R;cz<=R;cz++)for(let cx=-R;cx<=R;cx++){const a=G.layout(cx,cz),s=G.layout(cx,cz+1),e=G.layout(cx+1,cz);
    if(a.E[2].open.join()!==s.E[0].open.join()||a.E[3].open.join()!==e.E[1].open.join())eb++}
  out.edgeAgreement=eb?`FAIL: ${eb} mismatching chunk boundaries`:'ok';
  // door intervals: open stretches of <=3 cells bounded by walls on both ends; rooms = cells connected without passing a door
  const isDoor0=new Uint8Array((W+1)*W),isDoor1=new Uint8Array((W+1)*W),doors=[];
  for(let ax=0;ax<2;ax++){const Wa=ax?W1:W0,D=ax?isDoor1:isDoor0;
    for(let line=0;line<=W;line++)for(let i=0;i<W;){if(Wa[line*W+i]){i++;continue}let j=i;while(j<W&&!Wa[line*W+j])j++;
      if(i>0&&j<W&&j-i<=3&&line>0&&line<W){for(let k=i;k<j;k++)D[line*W+k]=1;doors.push([ax,line,i,j])}i=j}}
  const room=new Int32Array(W*W).fill(-1),areas=[],touch=[];let nr=0;const st=[];
  const open=(gx,gz,dx,dz)=>{ // can we step from cell (gx,gz) to the neighbour without wall or door?
    if(dx){const line=dx>0?gx+1:gx;return !W1[line*W+gz]&&!isDoor1[line*W+gz]}
    const line=dz>0?gz+1:gz;return !W0[line*W+gx]&&!isDoor0[line*W+gx]};
  for(let s=0;s<W*W;s++){if(room[s]>=0)continue;let a=0,t=0;room[s]=nr;st.push(s);
    while(st.length){const c=st.pop(),gx=c%W,gz=(c-gx)/W;a++;if(gx===0||gz===0||gx===W-1||gz===W-1)t=1;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,nz=gz+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const n=nz*W+nx;
        if(room[n]<0&&open(gx,gz,dx,dz)){room[n]=nr;st.push(n)}}}
    areas.push(a);touch.push(t);nr++}
  const adj=Array.from({length:nr},()=>new Set());
  for(const [ax,line,i,j] of doors){const k=i;let p,q;
    if(ax===0){p=room[(line-1)*W+k];q=room[line*W+k]}else{p=room[k*W+line-1];q=room[k*W+line]}
    if(p!==q&&p>=0&&q>=0){adj[p].add(q);adj[q].add(p)}}
  const inner=[];for(let r=0;r<nr;r++)if(!touch[r])inner.push(r);
  const sz=[0,0,0,0,0],lim=[16,40,100,250,Infinity];let tot=0;
  for(const r of inner){const a=areas[r];tot+=a;sz[lim.findIndex(l=>a<l)]+=a}
  out.rooms={count:inner.length,medianArea:areas.filter((_,r)=>!touch[r]).sort((a,b)=>a-b)[inner.length>>1]|0,
    areaShare:{'<16':+(sz[0]/tot*100).toFixed(1),'16-40':+(sz[1]/tot*100).toFixed(1),'40-100':+(sz[2]/tot*100).toFixed(1),'100-250':+(sz[3]/tot*100).toFixed(1),'>250':+(sz[4]/tot*100).toFixed(1)},
    deadEndPct:+(inner.filter(r=>adj[r].size===1).length/inner.length*100).toFixed(1),
    isolatedPct:+(inner.filter(r=>adj[r].size===0).length/inner.length*100).toFixed(1),
    avgDoors:+(inner.reduce((s,r)=>s+adj[r].size,0)/inner.length).toFixed(2)};
  out.doorsPerChunk=+(doors.length/((2*R+1)**2)).toFixed(1);
  // lattice: wall coverage on chunk-boundary lines (multiples of 16 m) vs the other lines of the 4 m structural grid (4, 8, 12 m)
  const cov=Array(N).fill(0),tt=Array(N).fill(0);
  for(let ax=0;ax<2;ax++){const Wa=ax?W1:W0;for(let line=0;line<=W;line++){const m=(((line+(ax?x0:z0))%N)+N)%N;for(let i=0;i<W;i++){tt[m]++;if(Wa[line*W+i])cov[m]++}}}
  const pc=m=>cov[m]/tt[m],g4=(pc(4)+pc(8)+pc(12))/3,oth=[1,2,3,5,6,7,9,10,11,13,14,15].reduce((s,m)=>s+pc(m),0)/12;
  out.latticeRatio=+(pc(0)/g4).toFixed(2); // wall density on chunk lines / on other 4 m lines; ~1 = chunk size invisible
  out.wallCoverage={chunkLines:+(pc(0)*100).toFixed(1)+'%',other4mLines:+(g4*100).toFixed(1)+'%',offGridLines:+(oth*100).toFixed(1)+'%'};
  // free wall ends: a run of wall whose end vertex touches no other wall edge (pillars ignored)
  let free=0,runs=0;
  const wl=(ax,line,i)=>{if(line<0||line>W||i<0||i>=W)return 0;return (ax?W1:W0)[line*W+i]};
  for(let ax=0;ax<2;ax++)for(let line=1;line<W;line++)for(let i=0;i<W;){if(!wl(ax,line,i)){i++;continue}let j=i;while(j<W&&wl(ax,line,j))j++;runs++;
    // vertices (line,i) and (line,j) in own axis coordinates; perpendicular edges at these vertices: other axis, line=i/j, cells line-1 and line
    // an end beside a door-sized gap (<=3 cells) that is closed by more wall is a door jamb, not a dangling wall piece
    for(const e of [i,j]){if(e<=0||e>=W)continue;if(wl(1-ax,e,line-1)||wl(1-ax,e,line))continue;
      const d=e===i?-1:1;let g=0,k=e===i?i-1:j;while(g<=3&&k>=0&&k<W&&!wl(ax,line,k)){g++;k+=d}
      if(g>=1&&g<=3&&k>=0&&k<W&&wl(ax,line,k))continue;free++}i=j}
  out.freeWallEndsPerChunk=+(free/((2*R+1)**2)).toFixed(2);out.wallRunsPerChunk=+(runs/((2*R+1)**2)).toFixed(1);
  // playability: flood fill on a 0.25 m grid with the game's collision rule (half extent .37), from the spawn search of findSpawn()
  const boxes=[];for(let cz=-R;cz<=R+1;cz++)for(let cx=-R;cx<=R+1;cx++)boxes.push(...chunkBoxes(G,cx,cz,legacy));
  const BK=4,bk=new Map();for(const b of boxes){const hx=b.w/2+.37,hz=b.d/2+.37;
    for(let kx=Math.floor((b.x-hx)/BK);kx<=Math.floor((b.x+hx)/BK);kx++)for(let kz=Math.floor((b.z-hz)/BK);kz<=Math.floor((b.z+hz)/BK);kz++){const k=kx+','+kz;(bk.get(k)||bk.set(k,[]).get(k)).push(b)}}
  const hit=(x,z)=>{const l=bk.get(Math.floor(x/BK)+','+Math.floor(z/BK));if(!l)return false;for(const b of l)if(Math.abs(x-b.x)<b.w/2+.37&&Math.abs(z-b.z)<b.d/2+.37)return true;return false};
  let sp=null;for(let r=0;r<8&&!sp;r+=.5)for(let a=0;a<24&&!sp;a++){const x=8+Math.cos(a/24*6.2832)*r,z=8+Math.sin(a/24*6.2832)*r;if(!hit(x,z))sp=[x,z]}
  const S=.25,M=Math.round(W/S),free2=new Uint8Array(M*M);let nfree=0;
  for(let j=0;j<M;j++)for(let i=0;i<M;i++){if(!hit(x0+(i+.5)*S,z0+(j+.5)*S)){free2[j*M+i]=1;nfree++}}
  const seen=new Uint8Array(M*M),q=[];const si=Math.floor((sp[0]-x0)/S),sj=Math.floor((sp[1]-z0)/S);
  const flood=(s,mark)=>{let c=0,sx=0,sz=0;q.length=0;q.push(s);seen[s]=mark;let b=0;while(q.length){const p=q.pop(),i=p%M,j=(p-i)/M;c++;sx+=i;sz+=j;if(i===0||j===0||i===M-1||j===M-1)b=1;
      for(const n of [i>0?p-1:-1,i<M-1?p+1:-1,j>0?p-M:-1,j<M-1?p+M:-1])if(n>=0&&free2[n]&&!seen[n]){seen[n]=mark;q.push(n)}}return [c,b,x0+sx/c*S,z0+sz/c*S]};
  const [reach]=flood(sj*M+si,1);let pockets=[];
  for(let s=0;s<M*M;s++)if(free2[s]&&!seen[s]){const [c,b,px,pz]=flood(s,2);if(c*S*S>=2)pockets.push({m2:+(c*S*S).toFixed(1),touchesBorder:!!b,at:[+px.toFixed(1),+pz.toFixed(1)]})}
  out.playability={reachableM2:+(reach*S*S).toFixed(0),unreachablePockets:pockets.length,unreachableM2:+pockets.reduce((s,p)=>s+p.m2,0).toFixed(1),
    pocketsNotAtBorder:pockets.filter(p=>!p.touchesBorder).length,largest:pockets.sort((a,b)=>b.m2-a.m2).slice(0,opt('pockets')?99:3)};
  if(!legacy)out.regionBorders=regionBorders(G,W0,W1,x0,z0,W);
  return out}

// Openings on region borders (the N and W border lines of every region fully inside the window). An open stretch between two
// border walls is split wherever a perpendicular wall touches the border line from either side; a 1-cell piece is 0.7 m clear,
// narrower than the player (0.74 m), so it is not passable on its own. Reported per border segment (one region's N or W side).
function regionBorders(G,W0,W1,x0,z0,W){const N=G.N,RS=G.RS,seen=new Set();let segs=0,blocked=0,pieces=0,narrow=0,minBest=1e9;
  const inside=(gx,gz)=>gx>=0&&gz>=0&&gx<W&&gz<W;
  for(let cz=-R;cz<=R+1;cz++)for(let cx=-R;cx<=R+1;cx++){const [rx,rz]=G.regionAt(cx,cz),id=rx+','+rz;if(seen.has(id))continue;seen.add(id);
    const R0=G.region(rx,rz),ox=R0.ox-x0,oz=R0.oz-z0;if(ox<1||oz<1||ox+RS>W-1||oz+RS>W-1)continue; // needs both sides inside the window
    for(let ax=0;ax<2;ax++){const line=ax?ox:oz,a=ax?oz:ox,Wa=ax?W1:W0,Wp=ax?W0:W1;let best=0;segs++;
      // perpendicular wall at vertex k on this line: other-axis line k, cells line-1 / line
      const perp=k=>Wp[k*W+line-1]||Wp[k*W+line];
      for(let i=a;i<a+RS;){if(Wa[line*W+i]===1||Wa[line*W+i]===2){i++;continue}let j=i;while(j<a+RS&&!Wa[line*W+j])j++;
        let s=i;for(let k=i+1;k<=j;k++)if(k===j||perp(k)){const w=k-s;pieces++;if(w<2)narrow++;if(w>best)best=w;s=k}i=j}
      if(best<2)blocked++;minBest=Math.min(minBest,best)}}
  return {segments:segs,segmentsWithoutPassableOpening:blocked,narrowestBestOpeningCells:minBest===1e9?null:minBest,openingPieces:pieces,onePieceGaps:narrow}}

// Random epoch table for all regions touching the window (plus one chunk of margin), from a run seed. 0 is included on purpose.
function epochSetup(seed,maxE){return G=>{for(let cz=-R-2;cz<=R+3;cz++)for(let cx=-R-2;cx<=R+3;cx++){const [rx,rz]=G.regionAt(cx,cz);
  let h=Math.imul(rx,374761393)^Math.imul(rz,668265263)^Math.imul(seed+1,1442695041);h=Math.imul(h^(h>>>13),1274126177);G.setRegionEpoch(rx,rz,((h^(h>>>16))>>>0)%(maxE+1))}}}
function epochs(){const out={},runs=val('runs',4),seed=val('seed',1),maxE=val('max-epoch',3),bi=argv.indexOf('--baseline');
  const all=chunkList(),dig=(G,cx,cz)=>digest(G,G.layout(cx,cz)),box=(G,cx,cz)=>JSON.stringify(chunkBoxes(G,cx,cz));
  const Z=generate(false);
  if(bi>=0){const O=generate(false,false,null,argv[bi+1]);let d=0;for(const [k,v] of Z.dg)if(O.dg.get(k)!==v)d++;
    out.epoch0VsBaseline=d?`FAIL: ${d} of ${Z.n} chunks differ from ${argv[bi+1]}`:`ok (${Z.n} chunks bit-identical)`}
  else out.epoch0VsBaseline='skipped (no --baseline)';
  // setting and clearing epochs on a live generator must give back the original world (cache self-invalidation)
  {const G=loadGen();for(const [x,z] of all)G.layout(x,z);epochSetup(seed,maxE)(G);for(const [x,z] of all)G.layout(x,z);
    for(const [x,z] of all){const [rx,rz]=G.regionAt(x,z);G.setRegionEpoch(rx,rz,0)}let d=0;for(const [x,z] of all)if(dig(G,x,z)!==Z.dg.get(x+','+z))d++;
    out.cacheInvalidation=d?`FAIL: ${d} chunks still show a stale epoch after reset`:'ok (epochs set and reset on a live generator)'}
  out.runs=[];
  for(let k=0;k<runs;k++){const setup=epochSetup(seed+k,maxE),G=loadGen();setup(G);
    let changed=0,loc=0,locN=0,boxBad=0,boxN=0,regs=new Map();
    for(const [x,z] of all){const [rx,rz]=G.regionAt(x,z),e=G.regionEpoch(rx,rz);regs.set(rx+','+rz,e);const d=dig(G,x,z),z0=Z.dg.get(x+','+z);
      if(e===0){locN++;if(d!==z0)loc++}else if(d!==z0)changed++}
    for(let cz=-R+1;cz<=R;cz++)for(let cx=-R+1;cx<=R;cx++){let all0=true;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)if(G.regionEpoch(...G.regionAt(cx+a,cz+b)))all0=false;
      if(!all0)continue;boxN++;if(box(G,cx,cz)!==box(Z.G,cx,cz))boxBad++}
    const nE=[...regs.values()].filter(e=>e).length,A=analyse(false,setup);
    out.runs.push({seed:seed+k,regions:regs.size,regionsWithEpoch:nE,chunksChangedInEpochRegions:changed,
      locality:loc?`FAIL: ${loc} of ${locN} epoch-0 chunks changed`:`ok (${locN} epoch-0 chunks unchanged)`,
      collisionLocality:boxBad?`FAIL: ${boxBad} of ${boxN} chunks with an all-epoch-0 3x3 neighbourhood changed`:`ok (${boxN} chunks)`,
      determinism:A.determinism,edgeAgreement:A.edgeAgreement,playability:A.playability,regionBorders:A.regionBorders,rooms:{count:A.rooms.count,deadEndPct:A.rooms.deadEndPct}})}
  out.allEpoch0={playability:analyse(false).playability,regionBorders:analyse(false).regionBorders};
  return out}

const modes=opt('compare')?[true,false]:[opt('legacy')];const res={};
if(opt('epochs'))res.epochs=epochs();else
for(const m of modes)res[m?'legacy':'current']=analyse(m);
if(opt('json'))console.log(JSON.stringify(res,null,1));
else for(const k in res){console.log(`\n=== ${k} (radius ${R} chunks = ${(2*R+1)**2} chunks) ===`);console.log(JSON.stringify(res[k],null,1))}
