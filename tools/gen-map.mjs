#!/usr/bin/env node
// Top-down SVG map of the generated layout (walls, windows, pillars, ceiling panels, chunk grid).
//   node tools/gen-map.mjs out.svg [--cx 0] [--cz 0] [--radius 4] [--legacy] [--scale 4] [--no-grid]
import {writeFileSync} from 'node:fs';
import {loadGen} from './gen-lib.mjs';

const argv=process.argv.slice(2),out=argv[0],opt=n=>argv.includes('--'+n),val=(n,d)=>{const i=argv.indexOf('--'+n);return i>=0?+argv[i+1]:d};
if(!out||out.startsWith('--')){console.error('usage: gen-map.mjs out.svg [--cx n --cz n --radius n --legacy --scale px_per_m --no-grid]');process.exit(1)}
const G=loadGen({legacy:opt('legacy')}),N=G.N,cx0=val('cx',0),cz0=val('cz',0),R=val('radius',4),S=val('scale',4);
const x0=(cx0-R)*N,z0=(cz0-R)*N,Wm=(2*R+1)*N,P=v=>((v)*S).toFixed(1);
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${Wm*S}" height="${Wm*S}" viewBox="0 0 ${Wm*S} ${Wm*S}"><rect width="100%" height="100%" fill="#f4f1e6"/>`;
const wallLines=[],winLines=[],pill=[],lamp=[],kind=[];
for(let cz=cz0-R;cz<=cz0+R;cz++)for(let cx=cx0-R;cx<=cx0+R;cx++){const L=G.layout(cx,cz),ox=cx*N-x0,oz=cz*N-z0;
  kind.push([ox,oz,L.I.kind,L.I.sp]);
  for(let ax=0;ax<2;ax++){const arr=ax?L.vw:L.hw;for(let line=0;line<N;line++)for(let i=0;i<N;){const v=arr[line*N+i];if(!v){i++;continue}let j=i;while(j<N&&arr[line*N+j]===v)j++;
    const seg=ax?[ox+line,oz+i,ox+line,oz+j]:[ox+i,oz+line,ox+j,oz+line];(v===2?winLines:wallLines).push(seg);i=j}}
  for(const [x,z,s] of L.pillars)pill.push([ox+x,oz+z,s]);
  for(const l of L.lights)lamp.push([l.x-x0,l.z-z0,l.k]);}
for(const [ox,oz,k,sp] of kind){const c=sp==='red'?'#e8b8b0':sp==='atrium'?'#d8e4f0':sp==='forest'?'#d6e8d0':sp==='closets'?'#ecdcc0':k==='halls'?'#faf8ee':k==='maze'?'#ebe6d2':'#f4f1e6';
  svg+=`<rect x="${P(ox)}" y="${P(oz)}" width="${P(N)}" height="${P(N)}" fill="${c}"/>`}
for(const [x,z,k] of lamp)svg+=`<rect x="${P(x-.25)}" y="${P(z-.5)}" width="${P(.5)}" height="${P(1)}" fill="${k>.3?'#ffe27a':k>0?'#d8c890':'#bbb'}" opacity=".7"/>`;
if(!opt('no-grid'))for(let k=0;k<=2*R+1;k++){svg+=`<line x1="${P(k*N)}" y1="0" x2="${P(k*N)}" y2="${P(Wm)}" stroke="#c33" stroke-width=".5" stroke-dasharray="3 3"/><line x1="0" y1="${P(k*N)}" x2="${P(Wm)}" y2="${P(k*N)}" stroke="#c33" stroke-width=".5" stroke-dasharray="3 3"/>`}
const ln=(a,w,c)=>a.map(s=>`<line x1="${P(s[0])}" y1="${P(s[1])}" x2="${P(s[2])}" y2="${P(s[3])}" stroke="${c}" stroke-width="${w}" stroke-linecap="square"/>`).join('');
svg+=ln(winLines,S*.2,'#6aa0c8')+ln(wallLines,S*.3,'#2a2a22');
for(const [x,z,s] of pill)svg+=`<rect x="${P(x-s/2)}" y="${P(z-s/2)}" width="${P(s)}" height="${P(s)}" fill="#7a2"/>`;
svg+='</svg>';writeFileSync(out,svg);console.log('wrote',out,`(${Wm}x${Wm} m, ${wallLines.length} wall runs)`);
