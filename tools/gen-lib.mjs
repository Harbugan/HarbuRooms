// Loads the pure world generator (the block between "GEN START" and "GEN END" in index.html) into Node.
// Nothing here duplicates generator logic: the code is taken from index.html itself.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');

export function loadGen({legacy=false,file=join(root,'index.html')}={}){
  const html=readFileSync(file,'utf8'),a=html.indexOf('// --- GEN START'),b=html.indexOf('// --- GEN END');
  if(a<0||b<0)throw new Error('GEN START/END markers not found in index.html');
  const body=html.slice(a,b);
  const names=['N','tile','H','info','layout','edgeOpen','infoCache','layoutCache','regCache','RS','regionAt','region','regionEpoch','setRegionEpoch'];
  const f=new Function('GEN_LEGACY',body+'\nreturn {'+names.map(n=>`${n}:typeof ${n}!=="undefined"?${n}:undefined`).join(',')+'};');
  return f(legacy);
}

// Collision boxes of a chunk, built exactly like addChunk()/wallRun() in index.html: one box per maximal run of equal wall
// value on a line (wall thickness .3, extended by .15 at both ends unless the wall continues into the neighbouring chunk), plus one per pillar.
// If addChunk()'s collision logic changes, update this function too.
export function chunkBoxes(G,cx,cz,legacy=false){
  const {N}=G,L=G.layout(cx,cz),ox=cx*N,oz=cz*N,t=.3,out=[];
  for(let ax=0;ax<2;ax++){const arr=ax?L.vw:L.hw,pa=legacy?null:(ax?G.layout(cx,cz-1).vw:G.layout(cx-1,cz).hw),na=legacy?null:(ax?G.layout(cx,cz+1).vw:G.layout(cx+1,cz).hw);
    for(let line=0;line<N;line++)for(let i=0;i<N;){const v=arr[line*N+i];if(!v){i++;continue}let j=i;while(j<N&&arr[line*N+j]===v)j++;
      const s=i-(pa&&i===0&&pa[line*N+N-1]?0:t/2),e=j+(na&&j===N&&na[line*N]?0:t/2),m=(s+e)/2;out.push(ax?{x:ox+line,z:oz+m,w:t,d:e-s}:{x:ox+m,z:oz+line,w:e-s,d:t});i=j}}
  for(const [x,z,s] of L.pillars)out.push({x:ox+x,z:oz+z,w:s,d:s});
  return out}
