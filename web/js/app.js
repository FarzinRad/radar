const NS='http://www.w3.org/2000/svg';
const $=s=>document.querySelector(s);
const el=(t,a={},p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e};
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const LIVE=window.__LIVE||null;if(LIVE)LV.init(LIVE);
const TMIN=LIVE?Math.max(-24,LV.minT):-12,TMAX=LIVE?LV.maxT:72;
const K=GEO.K, C=GEO.C;
const LON0=GEO.LON0,LAT0=GEO.LAT0;
const P=(lon,lat)=>[(lon-LON0)*K*C,(LAT0-lat)*K];
const U=(x,y)=>[x/(K*C)+LON0,LAT0-y/K];

/* ---------- models & storms (simulated) ---------- */
const MODELS_ALL=[
 {id:'wn3', name:'WN3', full:'WeatherNext 3', s:1.04, dlat:-.22, dlon:.28, g:1.05, col:'#7FD4FF'},
 {id:'ifs', name:'IFS', full:'ECMWF IFS', s:1.00, dlat:0, dlon:0, g:1.00, col:'#F2F6F8'},
 {id:'aifs',name:'AIFS',full:'ECMWF AIFS', s:1.07, dlat:.14, dlon:.22, g:.97, col:'#B58CFF'},
 {id:'gfs', name:'GFS', full:'NOAA GFS', s:.90, dlat:.42, dlon:-.25, g:.90, col:'#FF9F6B'},
 {id:'icon',name:'ICON',full:'DWD ICON', s:.97, dlat:-.12, dlon:-.18, g:1.00, col:'#7CF0B0'}];
const MODELS=LIVE?MODELS_ALL.filter(m=>LIVE.models.some(x=>x.id===m.id&&x.ok)):MODELS_ALL;
const MIX={id:'mix',name:'اجماع',full:'اجماع وزن‌دار'};
const STORMS=LIVE?LIVE.systems:[
 {id:'SYS-07', origin:'شرق ترکیه', kind:'بارش شدید و رعدوبرق', kf:[[-12,40.6,39.0,.55,1.1],[0,42.8,38.6,.70,1.25],[8,45.0,38.0,.82,1.3],[14,46.4,37.9,.90,1.25],[22,48.6,36.6,.85,1.2],[28,50.2,36.1,.88,1.15],[33,51.5,35.7,.92,1.1],[42,53.6,35.6,.60,1.2],[54,56.5,36.2,.30,1.3],[60,57.6,36.4,.18,1.3],[72,59.5,36.6,.10,1.3]]},
 {id:'SYS-08', origin:'جنوب عراق', kind:'بارش سیل‌آسا', kf:[[-12,45.5,29.8,.40,1.0],[6,47.5,30.6,.60,1.1],[16,48.7,31.4,.80,1.1],[26,49.6,32.6,.75,1.0],[38,50.8,33.6,.50,1.0],[50,51.8,34.2,.25,1.1],[60,52.4,34.5,.12,1.1],[72,53.0,34.8,.06,1.1]]},
 {id:'SYS-09', origin:'دریای عرب، از سمت پاکستان', kind:'توده‌ی مرطوب و رگبار', kf:[[-12,66.8,22.4,.50,1.4],[0,65.0,24.0,.62,1.4],[12,62.6,25.9,.76,1.3],[24,61.0,27.7,.82,1.25],[36,59.3,29.3,.66,1.2],[48,57.7,30.6,.46,1.2],[60,56.6,31.6,.28,1.3],[72,55.8,32.4,.14,1.3]]}];
function base(st,t){const k=st.kf;if(t<=k[0][0])return k[0].slice(1);if(t>=k[k.length-1][0]){const v=k[k.length-1].slice(1);v[2]*=Math.exp(-(t-k[k.length-1][0])/6);return v}
  for(let i=0;i<k.length-1;i++){const a=k[i],b=k[i+1];if(t>=a[0]&&t<=b[0]){const u=(t-a[0])/(b[0]-a[0]);const s=u*u*(3-2*u)*.35+u*.65;return [lerp(a[1],b[1],s),lerp(a[2],b[2],s),lerp(a[3],b[3],u),lerp(a[4],b[4],u)]}}}
function stormM(st,t,m,pert){ // pert: {s,dlat,dlon,g}
  if(t<=0) return base(st,t);
  const s=(pert?pert.s:m.s), tau=t*s; const b=base(st,tau); const f=t/30;
  return [b[0]+(pert?pert.dlon:m.dlon)*f, b[1]+(pert?pert.dlat:m.dlat)*f, b[2]*(pert?pert.g:m.g), b[3]];}
function stormAt(st,t,mid){
  if(LIVE){const k=st.kf,v=base(st,t);const t0=k[0][0],t1=k[k.length-1][0];if(t<t0)v[2]*=Math.max(0,1-(t0-t)/3);return v}
  if(mid!=='mix') return stormM(st,t,MODELS.find(m=>m.id===mid));
  const r=[0,0,0,0];MODELS.forEach(m=>{const v=stormM(st,t,m);for(let i=0;i<4;i++)r[i]+=v[i]/MODELS.length});return r;}
function fieldFrom(states,lon,lat){let v=0;for(const s of states){const dx=(lon-s[0])*Math.cos(lat*Math.PI/180),dy=lat-s[1];v+=s[2]*Math.exp(-(dx*dx+dy*dy)/(s[3]*s[3]))}return Math.min(v,1)}
function field(lon,lat,t,mid){return fieldFrom(STORMS.map(s=>stormAt(s,t,mid)),lon,lat)}
const level=v=>v>=.7?3:v>=.5?2:v>=.3?1:0;
// seeded rng
function gauss(r){return Math.sqrt(-2*Math.log(r()+1e-9))*Math.cos(2*Math.PI*r())}
const MEMBERS=(()=>{const r=rng(7),out=[];for(let i=0;i<30;i++){const m=MODELS_ALL[i%5];out.push({m,p:{s:m.s*(1+.07*gauss(r)),dlat:m.dlat+.35*gauss(r),dlon:m.dlon+.35*gauss(r),g:m.g*(1+.06*gauss(r))}})}return out})();
function eta(city,t,mid){
  if(LIVE){const cd=LV.byN[city.n];return cd?LV.eta(cd,t,mid):{none:true,p:0}}
  const now=field(city.lon,city.lat,t,mid); if(now>=.5) return {now:true,lv:level(now)};
  const mem=MEMBERS.filter(x=>mid==='mix'||x.m.id===mid); const hits=[];
  for(const x of mem){for(let tt=Math.ceil(t*2)/2;tt<=t+72;tt+=.5){const v=fieldFrom(STORMS.map(s=>stormM(s,tt,x.m,x.p)),city.lon,city.lat);if(v>=.5){hits.push(tt);break}}}
  const p=hits.length/mem.length; if(p<.2) return {none:true,p};
  hits.sort((a,b)=>a-b);const q=f=>hits[Math.min(hits.length-1,Math.floor(f*(hits.length-1)))];
  return {p,a:q(.15),b:q(.85),med:q(.5)};}


/* ---------- time formatting ---------- */
function clockOf(t){if(LIVE)return LV.clock(t);const abs=12+t;const d=Math.floor(abs/24);let h=abs-d*24;let hh=Math.floor(h),mm=Math.round((h-hh)*60/30)*30;if(mm===60){hh++;mm=0}
  return {day:DAYS[d]??'',hm:fa(String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')),d}}
function etaText(e){if(!e)return'—';if(e.now)return'در حال وقوع';if(e.none)return'احتمالاً نمی‌رسد';
  const A=clockOf(e.a),B=clockOf(e.b);const pr=fa(Math.round(e.p*100))+'٪';
  return A.d===B.d?`${pr}، ${A.day} ${A.hm} تا ${B.hm}`:`${pr}، ${A.day} ${A.hm} تا ${B.day} ${B.hm}`}
const tlabel=t=>(t>=0?'T+':'T−')+fa(Math.abs(Math.round(t)));

/* ---------- state ---------- */
const S={layers:{wind:false,ltg:false,dust:false,track:true,type:false,scene:true},anchor:null,view:'map',model:'mix',mode:'normal',tilt:true,spag:false,t:LIVE?0:-2,playing:false,speed:1,lock:STORMS[0]?STORMS[0].id:null,prov:null,city:null,levels:{},alerts:[]};
const W=GEO.W,H=GEO.H;
const HOME={x:500,y:215,w:730,h:670};
const REGION={x:110,y:30,w:1360,h:1130};
let vb={...HOME};

/* ---------- build map ---------- */
const svg=$('#map');
const defs=el('defs',{},svg);
defs.innerHTML=`<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<marker id="varrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#5FE1FF"/></marker>
<filter id="rain" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<radialGradient id="sweepG"><stop offset="0" stop-color="#FFB547" stop-opacity=".0"/><stop offset="1" stop-color="#FFB547" stop-opacity=".0"/></radialGradient>`;
el('rect',{x:-400,y:-400,width:W+800,height:H+800,fill:'var(--sea)'},svg);
const gGrat=el('g',{},svg);
for(let lon=28;lon<=74;lon+=2){const a=P(lon,47),b=P(lon,15);el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'var(--grat)','vector-effect':'non-scaling-stroke'},gGrat)}
for(let lat=16;lat<=46;lat+=2){const a=P(27,lat),b=P(75,lat);el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'var(--grat)','vector-effect':'non-scaling-stroke'},gGrat)}
const gC=el('g',{},svg); GEO.countries.forEach(c=>el('path',{d:c.d,class:'ctry'},gC));
const gP=el('g',{},svg); const provEls={};
GEO.provs.forEach(p=>{const e=el('path',{d:p.d,class:'prov','data-id':p.id,tabindex:0,role:'button','aria-label':'استان '+p.fa},gP);provEls[p.id]=e;
  e.addEventListener('click',ev=>{if(dragMoved)return;selectProv(p.id)});
  e.addEventListener('keydown',ev=>{if(ev.key==='Enter')selectProv(p.id)});});
el('path',{d:GEO.iran,class:'irline'},svg);
const gScene=el('g',{},svg);
const gDust=el('g',{filter:'url(#rain)'},svg);
const gRain=el('g',{filter:'url(#rain)',opacity:.85,style:'mix-blend-mode:screen'},svg);
const gTrack=el('g',{},svg);
const gCones=el('g',{},gTrack), gSpag=el('g',{},gTrack), gPaths=el('g',{},gTrack);
const gSweep=el('g',{},svg);const gBlob=el('g',{},svg);const gPeak=el('g',{},svg);
const gCL=el('g',{},svg);
GEO.countries.filter(c=>c.fa).forEach(c=>{const t=el('text',{x:c.l[0],y:c.l[1],'text-anchor':'middle',class:'lbl ctryl','font-size':14},gCL);t.textContent=c.fa});
const gExt=el('g',{},svg);
const extEls=GEO.ext.map(c=>{const d=el('circle',{cx:c.x,cy:c.y,r:1.6,fill:'#4C6C7E'},gExt);const t=el('text',{x:c.x,y:c.y-5,'text-anchor':'middle',class:'lbl dim','font-size':8.5},gExt);t.textContent=c.n;return{c,d,t}});
const gProvL=el('g',{},svg); const provLbl={};
GEO.provs.forEach(p=>{const t=el('text',{x:p.c[0],y:p.c[1],'text-anchor':'middle',class:'lbl dim','font-size':9,opacity:0},gProvL);t.textContent=p.fa;provLbl[p.id]=t});
[gGrat,gScene,gDust,gRain,gTrack,gSweep,gBlob,gPeak,gCL,gExt,gProvL].forEach(g=>g.style.pointerEvents='none');
const peakEls=GEO.peaks.map(p=>{const tri=el('path',{fill:'#9FB7C4','fill-opacity':.8},gPeak);const t=el('text',{class:'lbl dim','text-anchor':'middle'},gPeak);t.textContent=`${p.n} ${fa(p.h)}`;return{p,tri,t}});
const gCity=el('g',{},svg); const cityEls={};
GEO.cities.forEach(c=>{const g=el('g',{'data-n':c.n},gCity);
  const pr=el('circle',{cx:c.x,cy:c.y,r:6,class:'pulse','stroke-width':1.4,style:'display:none'},g);
  const d=el('circle',{cx:c.x,cy:c.y,r:c.m?3.2:2.4,class:'citydot',fill:'#CFE4EE','stroke-width':1.2},g);
  const t=el('text',{x:c.x,y:c.y-6,'text-anchor':'middle',class:'lbl','font-size':c.m?10.5:9},g);t.textContent=c.n;
  const ic=el('path',{fill:'none','stroke-width':1.3,'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke',style:'display:none'},g);
  g.addEventListener('click',()=>{if(dragMoved)return;selectCity(c.n)});cityEls[c.n]={g,pr,d,t,c,ic}});
const gStorm=el('g',{},svg); const stormEls={};
STORMS.forEach(st=>{const g=el('g',{style:'cursor:pointer'},gStorm);
  const r=el('path',{class:'reticle'},g);const lb=el('text',{class:'lbl','font-size':10,'font-family':'var(--mono)','text-anchor':'middle',fill:'#FFB547',style:'direction:ltr'},g);
  const hit=el('circle',{r:22,fill:'transparent'},g);
  g.addEventListener('click',()=>{S.lock=st.id;renderPanels();drawTracks()});stormEls[st.id]={g,r,lb,hit}});
// rain cell pools
const RAMP=['#3BD16F','#9BE33C','#F4E04D','#FFA33A','#FF4D4D','#E93BD8'];
const FLIR=['#3B1C6E','#7A1F86','#C2305F','#F06A2A','#FBB236','#FFF6C8'];
const ramp=v=>{const R=S.mode==='flir'?FLIR:RAMP;return R[clamp(Math.floor(v*R.length),0,R.length-1)]};
const CELLS=STORMS.map((st,i)=>{const r=rng(100+i),cells=[];for(let k=0;k<90;k++){const a=r()*Math.PI*2,d=Math.sqrt(r())*1.35;cells.push({a,d,ph:r()*6.28,sz:.35+r()*.55,e:el('circle',{},gRain)})}return cells});
$('#ramp').innerHTML=RAMP.map(c=>`<i style="background:${c}"></i>`).join('');

/* ---------- camera ---------- */
function stageAspect(){const r=svg.getBoundingClientRect();return r.width/Math.max(1,r.height)}
function fit(b,pad=.12){let {x,y,w,h}=b;w*=1+pad;h*=1+pad;x-=b.w*pad/2;y-=b.h*pad/2;const a=stageAspect();if(w/h<a){const nw=h*a;x-=(nw-w)/2;w=nw}else{const nh=w/a;y-=(nh-h)/2;h=nh}return{x,y,w,h}}
function setVB(v){vb=v;svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);updateScaleDeps()}
let flyAnim=null;
function flyTo(target,dur=1300){target=fit(target,0);if(reduce){setVB(target);buildMapScene();return}
  const from={...vb},t0=performance.now();const dist=Math.hypot(target.x+target.w/2-from.x-from.w/2,target.y+target.h/2-from.y-from.h/2);const bump=Math.min(.35,dist/1400);
  cancelAnimationFrame(flyAnim);
  const step=now=>{let u=clamp((now-t0)/dur,0,1);const e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;const z=1+bump*Math.sin(Math.PI*e);
    const cx=lerp(from.x+from.w/2,target.x+target.w/2,e),cy=lerp(from.y+from.h/2,target.y+target.h/2,e);const w=lerp(from.w,target.w,e)*z,h=lerp(from.h,target.h,e)*z;
    setVB({x:cx-w/2,y:cy-h/2,w,h});if(u<1)flyAnim=requestAnimationFrame(step);else buildMapScene()};flyAnim=requestAnimationFrame(step)}
function updateScaleDeps(){const z=HOME.w/vb.w;
  Object.values(cityEls).forEach(o=>{const inP=S.prov&&o.c.p===S.prov;const show=(o.c.m&&!S.prov)||inP||z>3.4;o.t.style.display=show?'':'none';o.g.style.opacity=S.prov&&!inP?.3:1;placeIcon(o,z);{const u=pxU();o.t.setAttribute('font-size',(o.c.m?13:12)*u);o.t.setAttribute('y',o.c.y-7*u);o.d.setAttribute('r',(o.c.m?3.4:2.6)*u)}});
  Object.entries(provLbl).forEach(([id,t])=>{t.setAttribute('opacity',!S.prov&&z>1.3&&z<2.4?.75:0);t.setAttribute('font-size',9.5/Math.sqrt(z))});
  gCL.style.opacity=z>2?0:1;extEls.forEach(o=>{const q=Math.sqrt(z);o.t.setAttribute('font-size',8.5/q);o.t.setAttribute('y',o.c.y-5/q);o.d.setAttribute('r',1.6/q)});$('#stage').classList.toggle('tilted',S.tilt&&z<1.7);svg.style.setProperty('--lw',(2.6/z).toFixed(3)+'px');Object.values(cityEls).forEach(o=>o.pr.setAttribute('r',7*pxU()));
  const q=Math.sqrt(z);peakEls.forEach(o=>{const vis=S.layers.type||z>3;o.tri.style.display=vis?'':'none';o.t.style.display=vis&&(S.layers.type||z>4.5)?'':'none';const u=pxU(),s=4.5*u;o.tri.setAttribute('d',`M${o.p.x} ${o.p.y-s}L${o.p.x+s} ${o.p.y+s*.7}L${o.p.x-s} ${o.p.y+s*.7}Z`);o.t.setAttribute('x',o.p.x);o.t.setAttribute('y',o.p.y+s*.7+11*u);o.t.setAttribute('font-size',9.5*u)});
  hudBL()}
const pxU=()=>vb.w/Math.max(1,svg.clientWidth);
function placeIcon(o,z){const H=HZ[o.c.n];const l=H?H.now:0;const inP=S.prov&&o.c.p===S.prov;const ok=S.prov?(inP&&l>=1):(l>=2&&(o.c.m||z>2.5));if(!H||!ok||!H.dom){o.ic.style.display='none';return}const u=pxU(),sc=13*u/10,x=o.c.x+5*u,y=o.c.y+3*u;o.ic.setAttribute('d',ICON[H.dom]);o.ic.setAttribute('transform',`translate(${x} ${y}) scale(${sc})`);o.ic.setAttribute('stroke',['#CFE4EE','#F4E04D','#FFA33A','#FF4D5E'][l]);o.ic.setAttribute('fill',(H.dom==='rain'||H.dom==='ltg')?['#CFE4EE','#F4E04D','#FFA33A','#FF4D5E'][l]:'none');o.ic.style.display=''}
// pan & zoom
let drag=null,dragMoved=false;
svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,vb:{...vb},id:e.pointerId,cap:false};dragMoved=false});
svg.addEventListener('pointermove',e=>{hudCursor(e);if(!drag)return;const r=svg.getBoundingClientRect();const dx=(e.clientX-drag.x)*vb.w/r.width,dy=(e.clientY-drag.y)*vb.h/r.height;if(!dragMoved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){dragMoved=true;svg.classList.add('drag');try{svg.setPointerCapture(drag.id)}catch(_){}}if(dragMoved)setVB({...drag.vb,x:drag.vb.x-dx,y:drag.vb.y-dy})});
svg.addEventListener('pointerup',()=>{drag=null;svg.classList.remove('drag');setTimeout(()=>dragMoved=false,0)});
svg.addEventListener('pointercancel',()=>{drag=null;dragMoved=false;svg.classList.remove('drag')});
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();const fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;const k=Math.exp(e.deltaY*.0015);const w=clamp(vb.w*k,150,1700),h=w*vb.h/vb.w;setVB({x:vb.x+(vb.w-w)*fx,y:vb.y+(vb.h-h)*fy,w,h});clearTimeout(window.__sc);window.__sc=setTimeout(buildMapScene,220)},{passive:false});
let lastCur='—';
function hudTL(){$('#hudTL').innerHTML=`CURSOR <b>${lastCur}</b>${S.tilt&&HOME.w/vb.w<1.7?' · approx (tilt)':''}<br>MODEL <b>${S.model==='mix'?'CONSENSUS':MODELS.find(m=>m.id===S.model).full.toUpperCase()}</b> · SENSOR <b>${S.mode.toUpperCase()}</b>`}
function hudCursor(e){const r=svg.getBoundingClientRect();const x=vb.x+(e.clientX-r.left)/r.width*vb.w,y=vb.y+(e.clientY-r.top)/r.height*vb.h;const [lon,lat]=U(x,y);lastCur=`${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;hudTL()}
function hudBL(){$('#hudBL').innerHTML=`ZOOM <b>×${(HOME.w/vb.w).toFixed(1)}</b> · VIEW <b>${S.prov?'PROVINCE':(vb.w>HOME.w*1.4?'REGIONAL':'NATIONAL')}</b><br>${LIVE?liveHud():'FORECAST · <b>SIMULATED DATA</b>'}<br>ENSO · NIÑO3.4 <b>+3.3°C</b> · VERY STRONG (IRI, 19 OCT · REAL)`}

/* ---------- selection ---------- */
function boxOf(p){const [x0,y0,x1,y1]=p.bb;let w=Math.max(x1-x0,220),h=Math.max(y1-y0,165);const cx=(x0+x1)/2,cy=(y0+y1)/2;w*=1.3;h*=1.3;return{x:cx-w/2,y:cy-h/2,w,h}}
function selectProv(id){S.prov=id;S.city=null;S.anchor=null;Object.entries(provEls).forEach(([k,e])=>e.classList.toggle('sel',k===id));
  if(id){const p=GEO.provs.find(q=>q.id===id);flyTo(boxOf(p),1400)}else flyTo(HOME,1300);
  renderPanels();renderCrumbs();updateScaleDeps()}
function selectCity(n){const c=GEO.cities.find(q=>q.n===n);S.city=n;if(c.p&&S.prov!==c.p){S.prov=c.p;Object.entries(provEls).forEach(([k,e])=>e.classList.toggle('sel',k===c.p))}
  flyTo({x:c.x-110,y:c.y-80,w:220,h:160},1400);renderPanels();renderCrumbs();updateScaleDeps()}
function goUp(){if(S.city){S.city=null;const p=GEO.provs.find(q=>q.id===S.prov);if(p)flyTo(boxOf(p));renderPanels();renderCrumbs();updateScaleDeps()}else if(S.prov)selectProv(null)}
document.addEventListener('keydown',e=>{if(e.key==='Escape')goUp();if(e.key===' '&&e.target===document.body){e.preventDefault();togglePlay()}});
function renderCrumbs(){const p=S.prov&&GEO.provs.find(q=>q.id===S.prov);let h=`<button data-go="region">منطقه</button> › <button data-go="iran">ایران</button>`;
  if(p)h+=` › ${S.city?`<button data-go="prov">${p.fa}</button>`:`<span>${p.fa}</span>`}`;if(S.city)h+=` › <span>${S.city}</span>`;
  const n=$('#mapcrumbs');n.innerHTML=h;n.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(b.dataset.go==='region'){S.city=null;S.prov=null;Object.values(provEls).forEach(e=>e.classList.remove('sel'));flyTo(REGION,1500);renderPanels();renderCrumbs()}else if(b.dataset.go==='iran')selectProv(null);else{S.city=null;selectProv(S.prov)}})}

/* ---------- frame render ---------- */
function drawRain(){if(LIVE)return drawRainLive();const now=performance.now()/1000;
  STORMS.forEach((st,i)=>{const s=stormAt(st,S.t,S.model);const [cx,cy]=P(s[0],s[1]);const R=s[3]*K;const rot=S.t*.05;
    CELLS[i].forEach(c=>{const fl=.65+.35*Math.sin(c.ph+S.t*.9+now*.6*(reduce?0:1));const v=s[2]*Math.exp(-c.d*c.d/1.1)*fl;
      const a=c.a+rot;const x=cx+Math.cos(a)*c.d*R*1.15,y=cy+Math.sin(a)*c.d*R*.9;
      c.e.setAttribute('cx',x);c.e.setAttribute('cy',y);c.e.setAttribute('r',c.sz*R*.42*(.6+v));let fc=ramp(v);if(S.layers.type){const [lo,la]=U(x,y);const T=37-1.3*(la-25)-6*elevOf(lo,la)/1000-9*v-3;fc=T<.5?'#F2F6FF':T<2?'#C59BFF':['#2F7DE1','#4FA3FF','#7FC1FF'][clamp(Math.floor(v*3),0,2)]}c.e.setAttribute('fill',fc);c.e.setAttribute('opacity',v<.08?0:clamp(v*1.25,0,.9))})})}
function reticlePath(cx,cy,r){const k=r*.45;return `M${cx-r} ${cy-r+k}V${cy-r}H${cx-r+k}M${cx+r-k} ${cy-r}H${cx+r}V${cy-r+k}M${cx+r} ${cy+r-k}V${cy+r}H${cx+r-k}M${cx-r+k} ${cy+r}H${cx-r}V${cy+r-k}`}
function drawStorms(){const z=HOME.w/vb.w;STORMS.forEach(st=>{const s=stormAt(st,S.t,S.model);const [cx,cy]=P(s[0],s[1]);const o=stormEls[st.id];const r=(st.id===S.lock?26:18)/Math.sqrt(z);
  o.r.setAttribute('d',reticlePath(cx,cy,r));o.r.setAttribute('stroke-width',st.id===S.lock?1.8:1);o.r.setAttribute('opacity',s[2]<.15?.25:1);
  o.lb.setAttribute('x',cx);o.lb.setAttribute('y',cy-r-5*pxU());o.lb.setAttribute('font-size',11*pxU());o.lb.textContent=st.id+(st.id===S.lock?' · LOCK':'');
  o.hit.setAttribute('cx',cx);o.hit.setAttribute('cy',cy);o.hit.setAttribute('r',r)})}
function drawSweep(){gSweep.innerHTML='';if(reduce)return;const st=STORMS.find(s=>s.id===S.lock);if(!st)return;const s=stormAt(st,S.t,S.model);const [cx,cy]=P(s[0],s[1]);const R=s[3]*K*2.1;const ang=(performance.now()/1000*70)%360;
  for(let i=0;i<14;i++){const a=(ang-i*2.2)*Math.PI/180;el('line',{x1:cx,y1:cy,x2:cx+Math.cos(a)*R,y2:cy+Math.sin(a)*R,stroke:'#FFB547','stroke-opacity':(.32*(1-i/14)).toFixed(3),'stroke-width':1.2,'vector-effect':'non-scaling-stroke'},gSweep)}
  el('circle',{cx,cy,r:R,fill:'none',stroke:'#FFB547','stroke-opacity':.15,'stroke-dasharray':'2 5','vector-effect':'non-scaling-stroke'},gSweep)}
function pathOf(st,mid,t0,t1){const pts=[];for(let t=t0;t<=t1+1e-6;t+=1){const s=stormAt(st,t,mid);pts.push(P(s[0],s[1]))}return pts}
const poly=pts=>'M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L');
function drawTracks(){gCones.innerHTML='';gSpag.innerHTML='';gPaths.innerHTML='';
  STORMS.forEach(st=>{const locked=st.id===S.lock;
    const sp=LIVE?[st.kf[0][0],st.kf[st.kf.length-1][0]]:[TMIN,72];
    if(sp[0]<0)el('path',{d:poly(pathOf(st,'ifs',Math.max(TMIN,sp[0]),Math.min(0,sp[1]))),class:'track',stroke:'#9FC3D4','stroke-opacity':.55,'stroke-width':1.6},gPaths);
    if(sp[1]<=0)return;const fp=pathOf(st,S.model,Math.max(0,sp[0]),Math.min(72,sp[1]));if(fp.length<2)return;
    if(locked){const L=[],Rr=[];for(let i=0;i<fp.length-1;i++){const [x0,y0]=fp[i],[x1,y1]=fp[i+1];const dx=x1-x0,dy=y1-y0,n=Math.hypot(dx,dy)||1;const w=(4+i*.75);L.push([x0-dy/n*w,y0+dx/n*w]);Rr.push([x0+dy/n*w,y0-dx/n*w])}
      el('path',{d:poly(L.concat(Rr.reverse()))+'Z',fill:'#FFB547','fill-opacity':.08,stroke:'#FFB547','stroke-opacity':.35,'stroke-width':1,'vector-effect':'non-scaling-stroke'},gCones)}
    el('path',{d:poly(fp),class:'track',stroke:'#FFB547','stroke-opacity':locked?.9:.45,'stroke-width':locked?1.6:1.1,'stroke-dasharray':'5 5'},gPaths);
    if(S.spag&&!LIVE)MODELS.forEach(m=>el('path',{d:poly(pathOf(st,m.id,0,72)),class:'track',stroke:m.col,'stroke-opacity':.8,'stroke-width':1.2},gSpag))})}
let lastHeavy=-999,lastModel=null;
function heavy(force){ // levels, panels, alerts — throttled
  if(!force&&Math.abs(S.t-lastHeavy)<.5&&lastModel===S.model)return;lastHeavy=S.t;lastModel=S.model;
  computeHZ();const lv={};GEO.cities.forEach(c=>lv[c.n]=HZ[c.n].now);PHZ={};GEO.provs.forEach(p=>PHZ[p.id]=provHz(p.id));buildMapScene();
  // provinces
  GEO.provs.forEach(p=>{let m=0;GEO.cities.forEach(c=>{if(c.p===p.id)m=Math.max(m,lv[c.n])});
    const col=['#0F2433','#28311F','#3A2A1A','#43202A'][m];provEls[p.id].style.fill=S.mode==='flir'?['#1A0E2E','#311A40','#4A2038','#622030'][m]:col});
  Object.values(cityEls).forEach(o=>{const l=lv[o.c.n];o.d.setAttribute('fill',['#CFE4EE','#F4E04D','#FFA33A','#FF4D5E'][l]);o.pr.style.display=l===3?'':'none'});{const z=HOME.w/vb.w;Object.values(cityEls).forEach(o=>placeIcon(o,z))}
  // alerts on escalation (only when playing forward)
  if(S.playing){GEO.cities.filter(c=>c.m).forEach(c=>{const prev=S.levels[c.n]??0;if(lv[c.n]>prev&&lv[c.n]>=2)pushAlert(c,lv[c.n])})}
  S.levels=lv;renderPanels()}
function pushAlert(c,l){const e=eta(c,S.t,S.model);const ck=clockOf(S.t);const st=nearestStorm(c);
  const H=HZ[c.n];const msg=`${c.n} · ${LVLN[l]} · ${H&&H.dom?HZN[H.dom]:(STORMS.find(s=>s.id===st)||{}).kind||''}`;const sub=`ntfy · radar-alerts · ${st} · ${etaText(e)}`;
  const box=$('#toasts');const t=document.createElement('div');t.className='toast l'+l;t.innerHTML=`<span class="src">هشدار · ${st||'رادار'}</span><div>${msg}</div><small>${etaText(e)}</small>`;box.prepend(t);
  while(box.children.length>2)box.lastChild.remove();setTimeout(()=>t.remove(),5000);
  S.alerts.unshift(`${ck.day} ${ck.hm} — ${msg} — ${etaText(e)}`);S.alerts=S.alerts.slice(0,6);
  $('#ticker').innerHTML=`<div>${S.alerts.slice(0,3).join('   |   ')}</div>`}
function nearestStorm(c){let best=null,bd=1e9;STORMS.forEach(st=>{const s=stormAt(st,S.t,S.model);const d=Math.hypot(c.lon-s[0],c.lat-s[1]);if(d<bd){bd=d;best=st.id}});return best}

/* ---------- panels ---------- */

function renderPanels(){if(S.view!=='map')return;
  const R=$('#rightPanel');let h='';
  if(S.city)h=cityPanel(GEO.cities.find(q=>q.n===S.city));
  else if(!S.prov){const list=GEO.cities.filter(c=>c.m&&HZ[c.n]).sort((a,b)=>HZ[b.n].now-HZ[a.n].now||HZ[b.n].max72-HZ[a.n].max72);
    h=`<h2>شهرهای پایش</h2><p class="sub">سطح خطر ۱۲ ساعت آینده بر اساس آستانه‌های محلی هر شهر</p>${list.map(cityRow).join('')}
    <button class="sharebtn" data-share="iran">📣 کارت وضعیت ایران برای دوستان</button>
    <p class="note">روی هر استان کلیک کن تا دوربین رویش برود. Esc یک سطح برمی‌گردد.</p>`}
  else h=provPanel(GEO.provs.find(q=>q.id===S.prov));
  R.innerHTML=h;R.querySelectorAll('.strip').forEach(strip=>strip.onclick=e=>{const r=strip.getBoundingClientRect();const col=Math.floor((e.clientX-r.left)/r.width*strip.viewBox.baseVal.width/STW);if(col>=0&&col<72)jump(HZT+col)});const bp=$('#backProv');if(bp)bp.onclick=()=>{S.city=null;selectProv(S.prov)};const cs_=$('#cmpSel');if(cs_){cs_.onchange=cmpUpdate;cmpUpdate()}R.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>selectCity(b.dataset.city));const bi=$('#backIran');if(bi)bi.onclick=()=>selectProv(null);R.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>openShare(b.dataset.share));
  // left: dossier
  const st=STORMS.find(s=>s.id===S.lock);
  if(!st){let L0='<h2>سامانه‌ها</h2><p class="sub">در این اجرا سامانه‌ی بارشی مهمی نزدیک ایران ردیابی نشد.</p>';if(S.city)L0+=cityChart();L0+=alertsHTML();$('#leftPanel').innerHTML=L0;return}
  const s=stormAt(st,S.t,S.model),s2=stormAt(st,S.t+1,S.model);
  const kmx=(s2[0]-s[0])*111*Math.cos(s[1]*Math.PI/180),kmy=(s2[1]-s[1])*111;const spd=Math.round(Math.hypot(kmx,kmy));const brg=(Math.atan2(kmx,kmy)*180/Math.PI+360)%360;
  const dirs=['شمال','شمال‌شرق','شرق','جنوب‌شرق','جنوب','جنوب‌غرب','غرب','شمال‌غرب'];const dir=dirs[Math.round(brg/45)%8];
  const path=GEO.cities.filter(c=>c.m||c.p).map(c=>({c,e:eta(c,S.t,S.model)})).filter(x=>!x.e.none&&nearestStormFuture(x.c)===st.id).sort((a,b)=>(a.e.now?-1:a.e.a)-(b.e.now?-1:b.e.a)).slice(0,5);
  const agree=agreement(st);
  let L=`<h2>پرونده‌ی ${st.id}</h2><p class="sub">${st.kind}</p><dl class="kv">
   <dt>منشأ</dt><dd>${st.origin}</dd><dt>شدت فعلی</dt><dd><span class="num">${fa(Math.round(s[2]*100))}٪</span></dd>
   <dt>حرکت</dt><dd>${fa(spd)} کیلومتر بر ساعت به سمت ${dir}</dd><dt>مدل</dt><dd>${S.model==='mix'?'اجماع '+fa(MODELS.length)+' مدل':MODELS.find(m=>m.id===S.model).full}</dd>
   <dt>اجماع</dt><dd>${fa(agree)} از ${fa(MODELS.length)} مدل هم‌نظر</dd></dl>
   <div class="sect"><h3>شهرهای سر راه</h3>${path.map(x=>`<div class="etarow"><span>${x.c.n}</span><span>${etaText(x.e)}</span></div>`).join('')||'<p class="note">فعلاً شهری در مسیر نیست.</p>'}</div>`;
  {const T=TRK[st.id];if(T)L+=`<div class="sect"><h3>ردیابی لکه (اکنون‌نگری)</h3><dl class="kv"><dt>مساحت هسته</dt><dd>حدود ${fa(Math.round(T.area/1000)*1000)} کیلومتر مربع</dd><dt>سرعت سنجیده</dt><dd>${fa(Math.round(T.spd))} کیلومتر بر ساعت، ${fa(Math.round(T.brg))} درجه</dd><dt>برون‌یابی ۳ ساعته</dt><dd>${fa(Math.round(T.dkm))} کیلومتر با مدل فاصله دارد</dd></dl><p class="note">خط‌چین فیروزه‌ای مرز هسته است، فلش سرعت ۳ ساعت آینده را نشان می‌دهد، دایره‌های توخالی برون‌یابی خطی‌اند و ضربدر نارنجی جای پیش‌بینی مدل.</p></div>`}
  if(S.city)L+=cityChart();
  L+=alertsHTML();
  L+=`<div class="sect"><h3>سامانه‌های فعال</h3>${STORMS.map(x=>`<button class="city" data-lock="${x.id}" aria-current="${x.id===S.lock}"><span class="dot" style="background:#FFB547"></span><span><span class="n num">${x.id}</span><span class="e">${x.origin} · ${x.kind}</span></span><span></span></button>`).join('')}</div>`;
  const Lp=$('#leftPanel');Lp.innerHTML=L;Lp.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{S.lock=b.dataset.lock;drawTracks();renderPanels()})}
function nearestStormFuture(c){let best=null,bv=0;STORMS.forEach(st=>{let m=0;for(let t=S.t;t<=S.t+72;t+=2){const s=stormAt(st,t,S.model);const dx=(c.lon-s[0])*Math.cos(c.lat*Math.PI/180),dy=c.lat-s[1];m=Math.max(m,s[2]*Math.exp(-(dx*dx+dy*dy)/(s[3]*s[3])))}if(m>bv){bv=m;best=st.id}});return best}
function agreement(st){if(LIVE)return agreementLive(st);const tehr=GEO.cities.find(c=>c.n==='تهران');const ref=STORMS.find(x=>x.id===st.id);const ets=MODELS.map(m=>{const tgt={'SYS-07':[51.4,35.7],'SYS-08':[48.7,31.3],'SYS-09':[60.9,29.5]}[st.id];for(let t=Math.max(0,S.t);t<=S.t+72;t+=1){const s=stormAt(ref,t,m.id);if(Math.hypot(s[0]-tgt[0],s[1]-tgt[1])<.8)return t}return 99});
  const med=[...ets].sort((a,b)=>a-b)[2];return ets.filter(x=>Math.abs(x-med)<=3).length}
function cityChart(){if(LIVE)return cityChartLive();const c=GEO.cities.find(q=>q.n===S.city);const w=264,h=120,x0=6,x1=w-6,y0=8,y1=h-18;const X=t=>x0+(t-TMIN)/(72-TMIN)*(x1-x0),Y=v=>y1-v*(y1-y0);
  let s=`<div class="sect"><h3>${c.n}: شدت در طول زمان، هر مدل</h3><svg viewBox="0 0 ${w} ${h}" style="width:100%;direction:ltr" role="img" aria-label="شدت پیش‌بینی‌شده برای ${c.n}">`;
  [[.3,'#F4E04D'],[.5,'#FFA33A'],[.7,'#FF4D5E']].forEach(([v,col])=>s+=`<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="${col}" stroke-opacity=".35" stroke-dasharray="2 3"/>`);
  MODELS.forEach(m=>{let d='';for(let t=TMIN;t<=72;t+=1){d+=(t===TMIN?'M':'L')+X(t).toFixed(1)+' '+Y(field(c.lon,c.lat,t,m.id)).toFixed(1)}s+=`<path d="${d}" fill="none" stroke="${m.col}" stroke-width="1.3" opacity=".9"><title>${m.full}</title></path>`});
  s+=`<line x1="${X(S.t)}" x2="${X(S.t)}" y1="${y0}" y2="${y1}" stroke="var(--amber)" stroke-width="1.5"/><line x1="${X(0)}" x2="${X(0)}" y1="${y0}" y2="${y1}" stroke="var(--dim)" stroke-dasharray="1 3"/>`;
  [-12,0,12,24,36,48,60,72].forEach(t=>s+=`<text x="${X(t)}" y="${h-4}" font-size="9" fill="var(--dim)" text-anchor="middle" font-family="JetBrains Mono">${t>=0?'+':''}${t}h</text>`);
  s+=`</svg><div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--dim)">${MODELS.map(m=>`<span><i style="display:inline-block;width:10px;height:3px;background:${m.col};vertical-align:middle;margin-left:4px;outline:1px solid var(--line)"></i>${m.name}</span>`).join('')}</div></div>`;return s}

/* ---------- controls ---------- */
const mBox=$('#models');[...MODELS,MIX].forEach((m,i)=>{const b=document.createElement('button');b.textContent=m.name;b.title=m.full+' (کلید '+fa(i+1)+')';b.dataset.m=m.id;b.setAttribute('aria-pressed',m.id===S.model);b.onclick=()=>setModel(m.id);mBox.appendChild(b)});
function setModel(id){S.model=id;setTimeout(hudTL);mBox.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===id));drawTracks();heavy(true)}
document.addEventListener('keydown',e=>{const n=parseInt(e.key,10);if(n>=1&&n<=6&&S.view==='map'&&!(e.target instanceof HTMLInputElement))setModel([...MODELS,MIX][n-1].id)});
const MODES=[['normal','عادی'],['flir','حرارتی'],['nvg','دید در شب'],['crt','CRT']];
const mdBox=$('#modes');MODES.forEach(([id,n])=>{const b=document.createElement('button');b.textContent=n;b.dataset.m=id;b.setAttribute('aria-pressed',id===S.mode);b.onclick=()=>{S.mode=id;$('#stage').dataset.mode=id;mdBox.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.m===id));heavy(true);hudTL()};mdBox.appendChild(b)});
$('#tiltBtn').onclick=e=>{S.tilt=!S.tilt;e.currentTarget.setAttribute('aria-pressed',S.tilt);updateScaleDeps()};
$('#spagBtn').onclick=e=>{S.spag=!S.spag;e.currentTarget.setAttribute('aria-pressed',S.spag);drawTracks()};
const spBox=$('#speeds');[1,2,4].forEach(v=>{const b=document.createElement('button');b.className='sp';b.textContent='×'+fa(v);b.dataset.v=v;b.setAttribute('aria-pressed',v===S.speed);b.onclick=()=>{S.speed=v;spBox.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',+x.dataset.v===v))};spBox.appendChild(b)});
const scrub=$('#scrub');scrub.oninput=()=>{S.t=+scrub.value;tick(true)};
function togglePlay(){if(!S.playing&&S.t>=TMAX)S.t=TMIN;S.playing=!S.playing;$('#playIco').innerHTML=S.playing?'<path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/>':'<path d="M11 7 3 12V2z" fill="currentColor"/>';$('#playTxt').textContent=S.playing?'توقف':'پخش سناریو';}
function jump(t){S.t=clamp(t,TMIN,TMAX);tick(true);renderPanels()}
$('#playBtn').onclick=togglePlay;$('#back6').onclick=()=>jump(S.t-6);$('#fwd6').onclick=()=>jump(S.t+6);$('#nowBtn').onclick=()=>jump(0);
(function ticks(){const box=$('#ticks');scrub.min=TMIN;scrub.max=TMAX;const sp=TMAX-TMIN;let h='';for(let t=Math.ceil(TMIN/12)*12;t<=TMAX;t+=12){const p=(t-TMIN)/sp*100;h+=`<span style="left:${p}%">${t===0?'NOW':(t>0?'+':'')+t+'h'}</span>`}box.innerHTML=h;$('#tlNow').style.left=`calc(${-TMIN/sp*100}% - 1px)`})();
function tick(force){scrub.value=S.t;const ck=clockOf(S.t);$('#clock').innerHTML=`<b>${ck.day} ${ck.hm}</b> <span class="num" style="color:var(--dim)">${tlabel(S.t)}</span><br><span style="font-size:11.5px;color:var(--dim)">${S.t<=0?'مشاهده‌شده':'پیش‌بینی'} · وقت تهران</span>`;
  drawStorms();drawTracks();heavy(force)}
// tabs
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{S.view=b.dataset.view;$('#app').dataset.view=S.view;document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));$('#mapctl').style.visibility=S.view==='map'?'visible':'hidden';if(S.view==='score')renderScore();else{renderPanels();setVB(vb)}});

/* ---------- main loop ---------- */
let last=performance.now(),frameN=0;
function loop(now){const dt=(now-last)/1000;last=now;
  if(S.view==='map'){if(S.playing){S.t=Math.min(TMAX,S.t+dt*S.speed*2.6);if(S.t>=TMAX)togglePlay();tick(false)}else drawStorms();drawRain();drawSweep();drawFx(dt);animMapScene(now);if((++frameN)%2===0)drawBlobs()}
  requestAnimationFrame(loop)}


/* ---------- extra layers ---------- */
document.querySelectorAll('.layers button').forEach(b=>b.onclick=()=>{const k=b.dataset.layer;S.layers[k]=!S.layers[k];b.setAttribute('aria-pressed',S.layers[k]);if(k==='dust'){gDust.style.display=S.layers.dust?'':'none'}if(k==='type'){legendUpd();updateScaleDeps()}if(k==='scene')buildMapScene();renderPanels()});
const LEG0=$('#legend').innerHTML;function legendUpd(){$('#legend').innerHTML=S.layers.type?'<div>نوع بارش</div><div style="display:flex;gap:10px;margin-top:4px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4FA3FF;margin-left:4px"></i>باران</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#F2F6FF;margin-left:4px"></i>برف</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#C59BFF;margin-left:4px"></i>مخلوط</span></div>':LEG0}
const DUST=[[0,43.0,32.8,0],[10,44.2,32.6,.5],[24,46.2,32.0,.78],[36,48.0,31.6,.62],[48,49.5,31.2,.36],[60,50.6,30.9,.15],[72,51.0,30.8,0]];
function dustState(t){if(t<=DUST[0][0]||t>=DUST[DUST.length-1][0])return[0,0,0];for(let i=0;i<DUST.length-1;i++){const a=DUST[i],b=DUST[i+1];if(t>=a[0]&&t<=b[0]){const u=(t-a[0])/(b[0]-a[0]);return[lerp(a[1],b[1],u),lerp(a[2],b[2],u),lerp(a[3],b[3],u)]}}return[0,0,0]}
function dustAt(lon,lat,t){const d=dustState(t);if(!d[2])return 0;const dx=(lon-d[0])*Math.cos(lat*Math.PI/180),dy=lat-d[1];return d[2]*Math.exp(-(dx*dx/5.8+dy*dy/1.4))}
const DCELLS=(()=>{const r=rng(55),a=[];for(let i=0;i<34;i++)a.push({ox:(r()-.5)*4.4,oy:(r()-.5)*2.0,sz:.5+r()*.8,e:el('ellipse',{fill:'#C9A36A'},gDust)});return a})();gDust.style.display='none';
function drawDust(){if(!S.layers.dust)return;if(LIVE)return drawDustLive();const d=dustState(S.t);DCELLS.forEach(c=>{const [x,y]=P(d[0]+c.ox,d[1]+c.oy);const v=dustAt(d[0]+c.ox,d[1]+c.oy,S.t);c.e.setAttribute('cx',x);c.e.setAttribute('cy',y);c.e.setAttribute('rx',c.sz*K*.9);c.e.setAttribute('ry',c.sz*K*.45);c.e.setAttribute('opacity',(v*.42).toFixed(3))})}
const fx=$('#fx'),fctx=fx.getContext('2d');let fxW=0,fxH=0,lastVB='';const PART=[];const FLASH=[];
function toScreen(lon,lat){const [x,y]=P(lon,lat);return[(x-vb.x)/vb.w*fxW,(y-vb.y)/vb.h*fxH]}
function spawn(p){const [lon,lat]=U(vb.x+Math.random()*vb.w,vb.y+Math.random()*vb.h);p.lon=lon;p.lat=lat;p.age=Math.random()*80}
function windAt(lon,lat,states){let u=.32,v=.04;for(const s of states){const dx=(lon-s[0])*Math.cos(lat*Math.PI/180),dy=lat-s[1],d=Math.hypot(dx,dy)+1e-6,q=d/s[3];const m=s[2]*1.5*q*Math.exp(-q*q);u+=(-dy/d-dx/d*.3)*m;v+=(dx/d-dy/d*.3)*m}return[u,v]}
function drawFx(dt){const r=fx.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
  if(Math.round(r.width*dpr)!==fx.width||Math.round(r.height*dpr)!==fx.height){fx.width=Math.round(r.width*dpr);fx.height=Math.round(r.height*dpr);fxW=fx.width;fxH=fx.height}
  const key=vb.x.toFixed(1)+vb.y.toFixed(1)+vb.w.toFixed(1);if(key!==lastVB){fctx.clearRect(0,0,fxW,fxH);lastVB=key}
  if(!S.layers.wind&&!S.layers.ltg){fctx.clearRect(0,0,fxW,fxH);return}
  fctx.globalCompositeOperation='destination-out';fctx.fillStyle='rgba(0,0,0,.09)';fctx.fillRect(0,0,fxW,fxH);fctx.globalCompositeOperation='source-over';
  const states=STORMS.map(st=>stormAt(st,S.t,S.model));
  if(S.layers.wind&&!reduce){if(PART.length<650)for(let i=0;i<650;i++){const p={};spawn(p);PART.push(p)}
    fctx.lineWidth=1.4*dpr;fctx.strokeStyle='rgba(215,238,250,.75)';fctx.beginPath();
    for(const p of PART){const [u,v]=LIVE?windLive(p.lon,p.lat):windAt(p.lon,p.lat,states);const a=toScreen(p.lon,p.lat);p.lon+=u*.05;p.lat+=v*.05;const b=toScreen(p.lon,p.lat);fctx.moveTo(a[0],a[1]);fctx.lineTo(b[0],b[1]);
      if(++p.age>110||b[0]<0||b[1]<0||b[0]>fxW||b[1]>fxH)spawn(p)}
    fctx.stroke()}
  if(S.layers.ltg){(LIVE?ltgLive():states).forEach(s=>{if(s[2]>.62&&Math.random()<(s[2]-.6)*.9){const a=Math.random()*6.28,d=Math.sqrt(Math.random())*s[3]*.55;FLASH.push({lon:s[0]+Math.cos(a)*d,lat:s[1]+Math.sin(a)*d*.8,life:1})}});
    for(let i=FLASH.length-1;i>=0;i--){const f=FLASH[i];const [x,y]=toScreen(f.lon,f.lat);fctx.save();fctx.shadowColor='#E6F4FF';fctx.shadowBlur=14*dpr;fctx.fillStyle=`rgba(240,248,255,${f.life})`;fctx.beginPath();fctx.arc(x,y,2.2*dpr,0,6.28);fctx.fill();
      fctx.strokeStyle=`rgba(255,255,255,${f.life*.8})`;fctx.lineWidth=1.2*dpr;fctx.beginPath();fctx.moveTo(x,y-7*dpr);fctx.lineTo(x-3*dpr,y);fctx.lineTo(x+2*dpr,y);fctx.lineTo(x-1*dpr,y+7*dpr);fctx.stroke();fctx.restore();f.life-=.06;if(f.life<=0)FLASH.splice(i,1)}}
  drawDust()}

/* ---------- province 72h panel ---------- */
const NORM={'گیلان':160,'مازندران':110,'گلستان':60,'اردبیل':40,'آذربایجان شرقی':35,'آذربایجان غربی':45,'کردستان':60,'کرمانشاه':55,'ایلام':50,'لرستان':50,'خوزستان':30,'کهگیلویه و بویراحمد':70,'چهارمحال و بختیاری':50,'فارس':25,'بوشهر':25,'هرمزگان':10,'سیستان و بلوچستان':6,'کرمان':10,'یزد':6,'اصفهان':12,'تهران':25,'البرز':30,'قزوین':30,'زنجان':35,'قم':12,'مرکزی':25,'همدان':35,'سمنان':12,'خراسان رضوی':15,'خراسان شمالی':25,'خراسان جنوبی':8};
const STW=3.1;


/* ---------- terrain & weather physics (simulated, approximate) ---------- */
const RIDGES=[[[48.8,36.9],[51,36.4],[53,36.0],[55,36.6],[57,37.2],2300,.32],[[45.2,36.8],[46.8,34.6],[48.5,33],[50.5,31.2],[52.5,29.6],[54.5,28.4],1700,.55],[[56,30],[58,28.8],1500,.5],[[57,37.5],[60,36.2],1300,.4],[[46.0,38.6],[48.2,38.4],900,.6]];
function segD(lon,lat,a,b){const cx=Math.cos(lat*Math.PI/180);const ax=a[0]*cx,ay=a[1],bx=b[0]*cx,by=b[1],px=lon*cx,py=lat;const dx=bx-ax,dy=by-ay;const u=clamp(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(px-ax-u*dx,py-ay-u*dy)}
function elevOf(lon,lat){let e=1150;
  e-=1100*Math.exp(-(((lat-37.05)/.32)**2))*(lon>48.6&&lon<54.8?1:0);
  e-=1080*Math.exp(-(((lon-48.7)/1.3)**2+((lat-30.9)/1.1)**2));
  e-=950/(1+Math.exp((lat-27.6)*3.2));
  e-=650*Math.exp(-(((lon-61.4)/.9)**2+((lat-30.9)/.9)**2));e-=520*Math.exp(-(((lon-58.6)/1.1)**2+((lat-30.3)/1.4)**2));
  for(const r of RIDGES){const pts=r.slice(0,-2),h=r[r.length-2],w=r[r.length-1];let d=9;for(let i=0;i<pts.length-1;i++)d=Math.min(d,segD(lon,lat,pts[i],pts[i+1]));e+=h*Math.exp(-((d/w)**2))}
  for(const p of GEO.peaks){const d=Math.hypot((lon-p.lon)*Math.cos(lat*Math.PI/180),lat-p.lat);e+=Math.max(0,p.h-e)*Math.exp(-((d/.12)**2))}
  return Math.max(-25,Math.round(e))}
const ELV={"تهران": 1190, "تبریز": 1350, "رشت": -7, "یزد": 1216, "اهواز": 20, "دماوند": 1950, "فیروزکوه": 1930, "سرعین": 1650, "خلخال": 1800, "شهرکرد": 2070, "اردبیل": 1350, "همدان": 1850, "زاهدان": 1370, "مشهد": 985, "کرج": 1320, "لواسان": 1700, "شهمیرزاد": 1950, "بندرعباس": 10, "اصفهان": 1570, "شیراز": 1500, "کرمانشاه": 1350, "ارومیه": 1330, "سنندج": 1540, "خرم‌آباد": 1170, "ایلام": 1360, "کرمان": 1755, "ساری": 30, "گرگان": 155, "سمنان": 1130, "قم": 930, "اراک": 1750, "قزوین": 1300, "زنجان": 1660, "بوشهر": 10, "بیرجند": 1490, "بجنورد": 1070, "یاسوج": 1870, "چابهار": 10, "ایرانشهر": 590, "بم": 1060, "زابل": 480, "کاشان": 950, "چالوس": 0, "نوشهر": 0, "رامسر": 0, "بندر انزلی": -20, "آستارا": -20, "لاهیجان": 0, "آمل": 75, "بابل": 5, "قائمشهر": 50, "بهشهر": 15, "کلاردشت": 1250, "مرزن‌آباد": 1300, "ماسوله": 1050, "طالقان": 1800, "سقز": 1490, "بانه": 1550, "مریوان": 1290, "خوی": 1150, "ماکو": 1630, "میانه": 1100, "اهر": 1390, "مشگین‌شهر": 1490, "نیشابور": 1210, "سبزوار": 980, "قوچان": 1290, "دامغان": 1170, "گرمسار": 860, "شاهرود": 1350, "ابهر": 1540, "تاکستان": 1270, "نهاوند": 1650, "ملایر": 1730, "بروجرد": 1600, "الیگودرز": 2020, "ازنا": 1880, "خوانسار": 2250, "گلپایگان": 1800, "سمیرم": 2400, "بروجن": 2200, "فارسان": 2050, "اردل": 1900, "دهدشت": 830, "کازرون": 830, "سپیدان": 2200, "آباده": 2000, "اقلید": 2300, "نیک‌شهر": 500, "سراوان": 1180, "خاش": 1400, "کیش": 10, "قشم": 10, "جاسک": 10, "عسلویه": 10, "ماهشهر": 5, "آبادان": 3, "دزفول": 140, "شوشتر": 70, "اندیمشک": 150, "ایذه": 770, "بهبهان": 320, "مسجدسلیمان": 370, "پلدختر": 650, "دهلران": 230, "سرپل ذهاب": 550, "پاوه": 1540, "کلیبر": 1150, "ورزقان": 1700, "جلفا": 710, "مرند": 1350, "سراب": 1680, "میاندوآب": 1310, "مهاباد": 1330, "سردشت": 1480, "اشنویه": 1420, "پیرانشهر": 1450, "سلماس": 1380, "تالش": 30, "رودبار": 300, "مراغه": 1480, "بندر ترکمن": 0, "گنبد کاووس": 40, "نظرآباد": 1250, "ورامین": 920, "ساوه": 980, "خمین": 1830, "محلات": 1750, "نطنز": 1650, "نائین": 1550, "اردکان": 1000, "میبد": 1100, "بافق": 1000, "مهریز": 1500, "طبس": 690, "فردوس": 1290, "قائن": 1440, "کاشمر": 1050, "تربت حیدریه": 1330, "تایباد": 800, "سیرجان": 1730, "رفسنجان": 1470, "جیرفت": 650, "کهنوج": 470, "زرند": 1650, "بردسیر": 2050, "لار": 820, "داراب": 1180, "فسا": 1380, "مرودشت": 1620, "نورآباد": 940, "ممسنی": 940, "گچساران": 710, "برازجان": 70, "کنگان": 10, "بستک": 400, "میناب": 30, "کنارک": 10, "نهبندان": 1200, "زهک": 480, "شیروان": 1050, "اسفراین": 1220, "درگز": 450, "خور": 840, "سنقر": 1700, "کنگاور": 1460, "اسدآباد": 1600, "بیجار": 1940, "قروه": 1900, "اسلام‌آباد غرب": 1340, "لردگان": 1600, "شهرضا": 1840, "نجف‌آباد": 1600, "رباط‌کریم": 1000};
GEO.cities.forEach(c=>c.el=ELV[c.n]??elevOf(c.lon,c.lat));
if(LIVE)GEO.cities.forEach(c=>{const d=LV.byN[c.n];if(d)c.el=d.el});
function statesAt(t){return STORMS.map(st=>stormAt(st,t,S.model))}
function wxAt(lon,lat,el,t,st){const f=fieldFrom(st,lon,lat);const hour=((12+t)%24+24)%24;const amp=el<200?3.5:6.5;
  let T=37-1.3*(lat-25)-6*el/1000+(el<200&&lat<28?-4:0)+(el<60&&lat>36.4?-4:0)+amp*Math.cos(2*Math.PI*(hour-15)/24)-9*f;
  let sw=0;for(const s of st){const dx=(lon-s[0])*Math.cos(lat*Math.PI/180),dy=lat-s[1],q=Math.hypot(dx,dy)/s[3];sw+=s[2]*1.5*q*Math.exp(-q*q)}
  const wind=8+62*Math.min(sw,1.1),gust=wind*1.5;const pr=f<.08?0:7*Math.pow(f,1.8);
  const rh=clamp(28+62*f+(el<60&&lat>36.4?28:0)-.6*(T-15),8,100);const type=pr>.05?(T<.5?'snow':T<2?'mix':'rain'):null;
  return{f,T,rh,wind,gust,pr,type,dust:dustAt(lon,lat,t),ltg:f>.72&&T>6}}
function provName(c){const p=GEO.provs.find(q=>q.id===c.p);return p?p.fa:''}
function thrOf(c){if(LIVE&&LV.byN[c.n])return LV.byN[c.n].thr;const norm=NORM[provName(c)]??25;const p99=.4*norm+8;return{norm,r24:[Math.max(3,.35*p99),.6*p99,p99],s24:c.el>1500?[5,12,20]:[3,8,15],g:[55,75,95],d:[.3,.5,.7]}}
let HZ={},HZT=null,STC=[];
function computeHZ(){const t0=S.t;STC=[];for(let h=0;h<96;h++)STC.push(statesAt(t0+h));HZT=t0;HZ={};
  if(LIVE){for(const c of GEO.cities){const d=LV.byN[c.n];if(d)HZ[c.n]=LV.cityHZ(d,S.model,t0)}return}
  for(const c of GEO.cities){const th=thrOf(c);const wx=STC.map((st,h)=>wxAt(c.lon,c.lat,c.el,t0+h,st));
    const L={rain:[],snow:[],wind:[],ltg:[],dust:[],all:[]};
    for(let h=0;h<72;h++){let r6=0,s6=0;for(let k=h;k<h+6;k++){const w=wx[k];if(!w.type)continue;if(w.type==='snow')s6+=w.pr;else if(w.type==='mix'){s6+=w.pr/2;r6+=w.pr/2}else r6+=w.pr}
      const w=wx[h];L.rain[h]=comp(r6,th.r24.map(x=>x*.6));L.snow[h]=comp(s6,th.s24.map(x=>x*.6));L.wind[h]=comp(w.gust,th.g);L.ltg[h]=w.ltg?2:0;L.dust[h]=comp(w.dust,th.d);
      L.all[h]=Math.max(L.rain[h],L.snow[h],L.wind[h],L.ltg[h],L.dust[h])}
    let r24=0,s24=0,r24at=0,s24at=0;for(let h=0;h<72;h++){let r=0,s=0;for(let k=h;k<h+24;k++){const w=wx[k];if(!w.type)continue;if(w.type==='snow')s+=w.pr;else if(w.type==='mix'){s+=w.pr/2;r+=w.pr/2}else r+=w.pr}if(r>r24){r24=r;r24at=h}if(s>s24){s24=s;s24at=h}}
    const now=Math.max(...L.all.slice(0,12));let dom=null,dl=0;for(const k of ['rain','snow','wind','ltg','dust']){const m=Math.max(...L[k].slice(0,12));if(m>dl){dl=m;dom=k}}
    HZ[c.n]={wx,L,th,now,dom,r24,s24,r24at,s24at,max72:Math.max(...L.all),gmax:Math.max(...wx.slice(0,72).map(w=>w.gust)),prmax:Math.max(...wx.slice(0,72).map(w=>w.pr))}}}
function cityLevel(c){return HZ[c.n]?HZ[c.n].now:0}
const at=h=>{const k=clockOf(HZT+h);return `${k.day} ${k.hm}`};

/* ---------- meaning & actions ---------- */
function rateClass(r){return r<2.5?'سبک':r<7.6?'متوسط':r<50?'شدید':'بسیار شدید'}
function beaufort(g){return g<39?'نسیم تا باد ملایم':g<50?'باد قوی؛ چتر به‌سختی نگه داشته می‌شود':g<62?'تنه‌ی درخت‌ها تکان می‌خورد و راه‌رفتن خلاف باد سخت است':g<75?'شاخه‌ها می‌شکنند و راه‌رفتن بسیار سخت است':g<89?'آسیب به سازه‌های سبک، کنده‌شدن ورق و تابلو':g<103?'ریشه‌کن‌شدن درخت‌ها و آسیب جدی':'خسارت گسترده'}
function snowClass(cm){return cm<5?'لغزندگی معابر':cm<15?'اختلال در رفت‌وآمد شهری':cm<30?'بسته‌شدن گردنه‌ها محتمل است':'انسداد راه‌ها'}

/* ---------- strips ---------- */
function stripSVG(rows,opts={}){const lw=74,W=lw+72*STW+4,rh=19,top=opts.temp?54:20,Hh=top+rows.length*rh+2;
  let s=`<svg class="strip" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${opts.label||'۷۲ ساعت آینده'}">`;
  for(let h=0;h<72;h++){const abs=12+HZT+h;if(((abs%24)+24)%24<1&&((abs%24)+24)%24>=0&&Math.abs(abs-Math.round(abs))<.01){const x=h*STW;s+=`<line x1="${x}" x2="${x}" y1="12" y2="${Hh}" stroke="var(--line)"/><text x="${x+3}" y="10" font-size="10" fill="var(--dim)" font-family="Vazirmatn">${DAYS[Math.floor(abs/24)]??''}</text>`}}
  if(opts.temp){const T=opts.temp;const mn=Math.min(...T),mx=Math.max(...T);const Y=v=>16+(1-(v-mn)/((mx-mn)||1))*28;let d='';T.forEach((v,h)=>d+=(h?'L':'M')+(h*STW+STW/2).toFixed(1)+' '+Y(v).toFixed(1));
    s+=`<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.3" opacity=".8"/><text x="${W-2}" y="26" font-size="10.5" text-anchor="end" fill="var(--dim)" font-family="Vazirmatn">دما</text><text x="${W-2}" y="40" font-size="10" text-anchor="end" fill="var(--dim)" font-family="JetBrains Mono">${Math.round(mn)}…${Math.round(mx)}°</text>`}
  rows.forEach((r,i)=>{const y=top+i*rh;r.v.forEach((l,h)=>{const c=['','#F4E04D','#FFA33A','#FF4D5E'][l];s+=`<rect x="${h*STW+.2}" y="${y}" width="${STW-.4}" height="${rh-5}" rx="1" fill="${c||'var(--chip)'}"/>`});
    s+=`<text x="${W-2}" y="${y+11}" font-size="10.5" text-anchor="end" fill="var(--ink)" font-weight="${r.bold?700:400}" font-family="Vazirmatn">${r.n}</text>`});
  const cur=(S.t-HZT)*STW;if(cur>=0&&cur<=72*STW)s+=`<line x1="${cur}" x2="${cur}" y1="12" y2="${Hh}" stroke="var(--amber)" stroke-width="1.6"/>`;
  return s+'</svg>'}
function cityRow(c){const H=HZ[c.n];const l=H?H.now:0;let sub='بدون هشدار تا ۷۲ ساعت';
  if(H&&l>=1)sub=`${icoSVG(H.dom,LCOL[l],12)}${HZN[H.dom]}`;else if(H&&H.max72>=1){const f=firstHz(H);sub=`${icoSVG(f.k,LCOL[f.l],12)}${LVLN[f.l]} از ${at(f.s)}`}
  return `<button class="city l${l}" data-city="${c.n}" aria-current="${S.city===c.n}"><span class="dot"></span><span><span class="n">${c.n}</span><span class="e">${sub}</span></span><span class="lvl">${LVLN[l]}</span></button>`}
/* ---------- city panel ---------- */
function gaugeSVG(c,H){const th=H.th;const other=th.norm<60?GEO.cities.find(q=>q.n==='رشت'):GEO.cities.find(q=>q.n==='یزد');const th2=thrOf(other);const v=H.r24;
  const mx=Math.max(v*1.2,th.r24[2]*1.3,th2.r24[2]*1.15,10);const W=280,X=x=>8+x/mx*(W-16);
  const bar=(y,t,name)=>{let s=`<text x="${W-8}" y="${y-5}" font-size="10.5" text-anchor="end" fill="var(--dim)" font-family="Vazirmatn">${name}</text>`;const segs=[[0,t[0],'var(--chip)'],[t[0],t[1],'#F4E04D'],[t[1],t[2],'#FFA33A'],[t[2],mx,'#FF4D5E']];
    segs.forEach(([a,b,col])=>{if(b>a)s+=`<rect x="${X(a)}" y="${y}" width="${Math.max(0,X(Math.min(b,mx))-X(a))}" height="9" fill="${col}" opacity=".85"/>`});return s};
  let s=`<svg viewBox="0 0 ${W} 92" style="width:100%;direction:ltr" role="img" aria-label="مقایسه‌ی باران با آستانه‌های محلی">`+bar(22,th.r24,c.n)+bar(62,th2.r24,other.n);
  s+=`<line x1="${X(v)}" x2="${X(v)}" y1="14" y2="76" stroke="var(--ink)" stroke-width="2"/><text x="${X(v)}" y="88" font-size="10.5" text-anchor="middle" fill="var(--ink)" font-family="JetBrains Mono">${v.toFixed(0)} mm</text>`;
  [0,mx/2,mx].forEach(x=>s+=`<text x="${X(x)}" y="49" font-size="9" text-anchor="middle" fill="var(--dim)" font-family="JetBrains Mono">${x.toFixed(0)}</text>`);
  return {svg:s+'</svg>',other,lv2:comp(v,th2.r24)}}
function provPanel(p){const cs=GEO.cities.filter(c=>c.p===p.id&&HZ[c.n]);if(!cs.length)return`<h2>استان ${p.fa}</h2>`;
  const agg=[...Array(72).keys()].map(h=>Math.max(...cs.map(c=>HZ[c.n].L.all[h])));
  const top=[...cs].sort((a,b)=>HZ[b.n].max72-HZ[a.n].max72||HZ[b.n].r24-HZ[a.n].r24).slice(0,6);
  const rows=[{n:'کل استان',v:agg,bold:true},...top.map(c=>({n:c.n,v:HZ[c.n].L.all}))];
  const pk=Math.max(...agg);const pks=agg.indexOf(pk);let pkH=null;if(pk){const c=top[0];pkH=firstHz(HZ[c.n])}
  const wr=[...cs].sort((a,b)=>HZ[b.n].r24-HZ[a.n].r24)[0],ws=[...cs].sort((a,b)=>HZ[b.n].s24-HZ[a.n].s24)[0],wg=[...cs].sort((a,b)=>HZ[b.n].gmax-HZ[a.n].gmax)[0];
  const [plon,plat]=U(p.c[0],p.c[1]);const storms=STORMS.filter(st=>{for(let h=0;h<72;h+=3){const s=STC[h][STORMS.indexOf(st)];const dx=(plon-s[0])*Math.cos(plat*Math.PI/180),dy=plat-s[1];if(s[2]*Math.exp(-(dx*dx+dy*dy)/(s[3]*s[3]*1.6))>.2)return true}return false});
  const dust=cs.some(c=>Math.max(...HZ[c.n].L.dust)>=1);
  return `<div class="crumbs"><button id="backIran">ایران</button> › ${p.fa}</div><h2>استان ${p.fa}</h2><p class="sub">${fa(cs.length)} شهر · ۷۲ ساعت آینده از ${at(0)} · مدل ${S.model==='mix'?'اجماع':MODELS.find(m=>m.id===S.model).name}</p>
   ${stripSVG(rows)}<p class="note" style="margin-top:4px">روی نوار کلیک کن تا نقشه به همان ساعت برود. روی هر شهر کلیک کن تا جزئیاتش را ببینی.</p>
   <dl class="kv"><dt>اوج خطر</dt><dd>${pk?`${LVLN[pk]}، ${at(pks)}${pkH?'، '+HZN[pkH.k]:''}`:'خطری پیش‌بینی نشده'}</dd>
   <dt>بیشترین باران</dt><dd>${HZ[wr.n].r24>=1?`حدود ${fa(Math.round(HZ[wr.n].r24))} میلی‌متر در ۲۴ ساعت، ${wr.n}`:'ناچیز'}</dd>
   <dt>بیشترین برف</dt><dd>${HZ[ws.n].s24>=1?`حدود ${fa(Math.round(HZ[ws.n].s24))} سانتی‌متر، ${ws.n}`:'ندارد'}</dd>
   <dt>تندترین باد</dt><dd>حدود ${fa(Math.round(HZ[wg.n].gmax))} کیلومتر بر ساعت، ${wg.n}</dd></dl>
   <div class="chips">${storms.map(x=>`<span class="chip num">${x.id}</span>`).join('')}${dust?'<span class="chip dust">گردوغبار</span>':''}</div>
   <div class="sect"><h3>همه‌ی شهرها</h3>${[...cs].sort((a,b)=>HZ[b.n].now-HZ[a.n].now||HZ[b.n].max72-HZ[a.n].max72).map(cityRow).join('')}</div>`}
/* ---------- blob tracking ---------- */
let TRK={};
function drawBlobs(){gBlob.innerHTML='';TRK={};if(!S.layers.track)return;const z=HOME.w/vb.w,q=Math.sqrt(z);const st0=statesAt(S.t);
  STORMS.forEach((st,i)=>{const s=st0[i];if(s[2]<.3)return;const pts=[];
    for(let k=0;k<36;k++){const a=k/36*Math.PI*2;let r=.05;while(r<3.2){const lon=s[0]+Math.cos(a)*r/Math.cos(s[1]*Math.PI/180),lat=s[1]+Math.sin(a)*r;if(fieldFrom(st0,lon,lat)<.35)break;r+=.06}pts.push([s[0]+Math.cos(a)*r/Math.cos(s[1]*Math.PI/180),s[1]+Math.sin(a)*r])}
    let area=0;for(let k=0;k<36;k++){const [x1,y1]=pts[k],[x2,y2]=pts[(k+1)%36];const cx=111*Math.cos(s[1]*Math.PI/180);area+=(x1*cx)*(y2*111)-(x2*cx)*(y1*111)}area=Math.abs(area/2);
    const locked=st.id===S.lock;el('path',{d:'M'+pts.map(p=>P(...p).map(v=>v.toFixed(1)).join(' ')).join('L')+'Z',fill:'#5FE1FF','fill-opacity':.05,stroke:'#5FE1FF','stroke-width':locked?1.4:1,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke'},gBlob);
    const pp=stormAt(st,S.t-3,S.model);const vx=(s[0]-pp[0])/3,vy=(s[1]-pp[1])/3;const kmx=vx*111*Math.cos(s[1]*Math.PI/180),kmy=vy*111;const spd=Math.hypot(kmx,kmy);const brg=(Math.atan2(kmx,kmy)*180/Math.PI+360)%360;
    const [cx,cy]=P(s[0],s[1]);const [tx,ty]=P(s[0]+vx*3,s[1]+vy*3);
    el('path',{d:`M${cx} ${cy}L${tx} ${ty}`,stroke:'#5FE1FF','stroke-width':2,'marker-end':'url(#varrow)','vector-effect':'non-scaling-stroke'},gBlob);
    for(let k=1;k<=4;k++){const ps=stormAt(st,S.t-3*k,S.model);const [x,y]=P(ps[0],ps[1]);el('circle',{cx:x,cy:y,r:2.2/q,fill:'#5FE1FF','fill-opacity':.9-k*.18},gBlob)}
    let mdl=null;for(let k=1;k<=3;k++){const [gx,gy]=P(s[0]+vx*k,s[1]+vy*k);el('circle',{cx:gx,cy:gy,r:(9-k*1.5)/q,fill:'none',stroke:'#5FE1FF','stroke-opacity':.75-k*.15,'stroke-dasharray':'2 2','vector-effect':'non-scaling-stroke'},gBlob)}
    const m3=stormAt(st,S.t+3,S.model);const [mx,my]=P(m3[0],m3[1]);el('path',{d:`M${mx-4/q} ${my-4/q}L${mx+4/q} ${my+4/q}M${mx-4/q} ${my+4/q}L${mx+4/q} ${my-4/q}`,stroke:'#FFB547','stroke-width':1.6,'vector-effect':'non-scaling-stroke'},gBlob);
    const lx=P(s[0]+vx*3,s[1]+vy*3);const u=pxU();const t=el('text',{x:lx[0]+8*u,y:lx[1]-6*u,'font-size':11*u,fill:'#9BEBFF','font-family':'var(--mono)',class:'lbl',style:'direction:ltr'},gBlob);t.textContent=`${Math.round(spd)} km/h · ${Math.round(brg)}°`;
    const lin=[s[0]+vx*3,s[1]+vy*3];const dkm=Math.hypot((lin[0]-m3[0])*111*Math.cos(s[1]*Math.PI/180),(lin[1]-m3[1])*111);
    TRK[st.id]={area,spd,brg,dkm}})}

/* ---------- symbolic scenes: map (province) ---------- */
let PHZ={};const SCN=[];
function provHz(pid){const cs=GEO.cities.filter(c=>c.p===pid&&HZ[c.n]);const o={rain:0,snow:0,wind:0,ltg:0,dust:0};cs.forEach(c=>{for(const k in o)o[k]=Math.max(o[k],Math.max(...HZ[c.n].L[k].slice(0,12)))});return o}
function buildMapScene(){gScene.innerHTML='';SCN.length=0;if(!S.layers.scene)return;const u=pxU();
  GEO.provs.forEach((p,i)=>{const h=PHZ[p.id];if(!h)return;const mx=Math.max(h.rain,h.snow,h.wind,h.ltg,h.dust);const sel=S.prov===p.id;if(S.prov?!sel||mx<1:mx<2)return;
    let cp=document.getElementById('cp'+i);if(!cp){cp=el('clipPath',{id:'cp'+i},defs);el('path',{d:p.d},cp)}
    const g=el('g',{'clip-path':`url(#cp${i})`},gScene);const [x0,y0,x1,y1]=p.bb;const H=y1-y0,W=x1-x0;
    if(h.dust){el('rect',{x:x0,y:y0,width:W,height:H,fill:'#B98D57',opacity:[0,.22,.36,.5][h.dust]},g)}
    if(h.rain){const frac=[0,.18,.36,.56][h.rain];const w=el('path',{fill:'#2E8BFF','fill-opacity':.5},g);const crest=el('path',{fill:'none',stroke:'#9FD0FF','stroke-width':1.4,'vector-effect':'non-scaling-stroke'},g);SCN.push({t:'water',w,crest,x0,x1,y1,top:y1-frac*H,ph:i})}
    if(h.snow){const frac=[0,.14,.28,.46][h.snow];const bot=y0+frac*H;let d=`M${x0} ${y0}L${x0} ${bot}`;for(let x=x0;x<=x1;x+=W/24)d+=`L${x} ${bot+Math.abs(Math.sin(x*.7+i))*H*.035}`;d+=`L${x1} ${y0}Z`;el('path',{d,fill:'#EEF4FF','fill-opacity':.78},g);
      const r=rng(300+i),fl=[];for(let k=0;k<[0,18,34,60][h.snow];k++)fl.push({e:el('circle',{r:1.6*u,fill:'#fff','fill-opacity':.9},g),x:x0+r()*W,y:y0+r()*H,v:.15+r()*.25});SCN.push({t:'snow',fl,x0,y0,W,H})}
    if(h.wind){const cs=GEO.cities.filter(c=>c.p===p.id).slice(0,7);const pts=cs.length?cs:[{x:(x0+x1)/2,y:(y0+y1)/2}];const trees=pts.map((c,k)=>{const gt=el('g',{},g);el('path',{d:`M0 0L0 ${-9*u}`,stroke:'#7FE3A0','stroke-width':1.6,'vector-effect':'non-scaling-stroke'},gt);el('ellipse',{cx:0,cy:-13*u,rx:4.2*u,ry:5.5*u,fill:'#4CC27A','fill-opacity':.85},gt);return{gt,x:c.x+8*u,y:c.y+2*u,ph:k*1.3}});
      const r=rng(500+i),st=[];for(let k=0;k<[0,6,12,20][h.wind];k++)st.push({e:el('line',{stroke:'#D8F1FF','stroke-opacity':.55,'stroke-width':1,'vector-effect':'non-scaling-stroke'},g),x:x0+r()*W,y:y0+r()*H,len:(10+r()*16)*u});SCN.push({t:'wind',trees,st,amp:[0,5,11,19][h.wind],x0,W,lvl:h.wind})}
    if(h.ltg){const f=el('rect',{x:x0,y:y0,width:W,height:H,fill:'#F4FAFF',opacity:0},g);SCN.push({t:'ltg',f,next:0})}
    if(sel||mx>=2)el('path',{d:p.d,fill:'none',stroke:['','#F4E04D','#FFA33A','#FF4D5E'][mx],'stroke-width':1.6,'stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke'},gScene)})}
function animMapScene(now){if(!SCN.length||reduce&&now>0)return;const u=pxU(),T=now/1000;
  for(const s of SCN){if(s.t==='water'){const amp=2.2*u,k=2*Math.PI/(26*u);let top='';for(let x=s.x0;x<=s.x1+1;x+=(s.x1-s.x0)/60){const y=s.top+amp*Math.sin(x*k+T*2.2+s.ph);top+=(top?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}
      s.w.setAttribute('d',top+`L${s.x1} ${s.y1}L${s.x0} ${s.y1}Z`);s.crest.setAttribute('d',top)}
    else if(s.t==='snow'){for(const f of s.fl){f.y+=f.v*u*2;f.x+=Math.sin(T+f.y)*.15*u;if(f.y>s.y0+s.H)f.y=s.y0;f.e.setAttribute('cx',f.x);f.e.setAttribute('cy',f.y)}}
    else if(s.t==='wind'){for(const tr of s.trees){const a=s.amp*(.6+.4*Math.sin(T*3.1+tr.ph))*Math.sin(T*5+tr.ph);tr.gt.setAttribute('transform',`translate(${tr.x} ${tr.y}) rotate(${a.toFixed(1)})`)}
      for(const l of s.st){l.x+=(1.2+s.lvl*.8)*u;if(l.x>s.x0+s.W)l.x=s.x0-l.len;l.e.setAttribute('x1',l.x);l.e.setAttribute('x2',l.x+l.len);l.e.setAttribute('y1',l.y);l.e.setAttribute('y2',l.y)}}
    else if(s.t==='ltg'){if(T>s.next){s.f.setAttribute('opacity',.55);s.next=T+1.5+Math.random()*3;setTimeout(()=>s.f.setAttribute('opacity',.15),70);setTimeout(()=>s.f.setAttribute('opacity',.5),130);setTimeout(()=>s.f.setAttribute('opacity',0),220)}}}}

/* ---------- symbolic scene: city card ---------- */
function citySceneSVG(c,lv){const r=rng(c.n.length*97+7);const G=118;const water=[0,6,15,30][lv.rain],snowH=[0,4,9,16][lv.snow],amp=[2,6,12,22][lv.wind];
  const sky=lv.dust?['#2A3A48','#6B5A44','#7A5F3E','#8A6436'][lv.dust]:['#1C3448','#22384A','#1A2A38','#131E29'][Math.max(lv.rain,lv.snow,lv.ltg)];
  let s=`<svg class="scene" viewBox="0 0 300 150" role="img" aria-label="صحنه‌ی نمادین ${c.n}"><rect width="300" height="150" fill="${sky}"/>`;
  s+=`<path d="M0 ${G-28}L40 ${G-52}L75 ${G-34}L120 ${G-66}L165 ${G-38}L210 ${G-58}L260 ${G-30}L300 ${G-46}V${G}H0Z" fill="#2B4253" opacity=".7"/>`;
  if(lv.snow)s+=`<path d="M107 ${G-58}L120 ${G-66}L133 ${G-58}Z M200 ${G-52}L210 ${G-58}L220 ${G-52}Z M33 ${G-47}L40 ${G-52}L47 ${G-47}Z" fill="#F2F7FF"/>`;
  const houses=[[18,34,26],[50,26,36],[82,30,22],[118,40,30],[160,28,26],[194,22,34]];
  houses.forEach(([x,w,h])=>{s+=`<rect x="${x}" y="${G-h}" width="${w}" height="${h}" fill="#3A5466"/><path d="M${x-2} ${G-h}L${x+w/2} ${G-h-9}L${x+w+2} ${G-h}Z" fill="#4A6476"/>`;
    for(let k=0;k<2;k++)s+=`<rect x="${x+5+k*(w/2-2)}" y="${G-h+8}" width="5" height="6" fill="#F6D27A" opacity=".75"/>`;
    if(lv.snow)s+=`<path d="M${x-2} ${G-h}L${x+w/2} ${G-h-9}L${x+w+2} ${G-h}L${x+w} ${G-h+2}L${x+w/2} ${G-h-6}L${x} ${G-h+2}Z" fill="#F2F7FF"/>`});
  s+=`<rect x="0" y="${G}" width="300" height="32" fill="#1E2C36"/><path d="M0 ${G+12}H300" stroke="#E9C46A" stroke-dasharray="10 8" opacity=".5"/>`;
  s+=`<g><rect x="120" y="${G+3}" width="30" height="10" rx="3" fill="#C8553D"/><rect x="126" y="${G-3}" width="17" height="7" rx="2" fill="#C8553D"/><circle cx="127" cy="${G+14}" r="3" fill="#0E151B"/><circle cx="143" cy="${G+14}" r="3" fill="#0E151B"/></g>`;
  s+=`<g class="sc-tree" style="--a:${amp}deg;transform-origin:255px ${G}px"><path d="M255 ${G}V${G-24}" stroke="#6B4E33" stroke-width="3"/><ellipse cx="255" cy="${G-34}" rx="13" ry="15" fill="#3E9E5E"/>${lv.snow?`<ellipse cx="255" cy="${G-45}" rx="10" ry="4" fill="#F2F7FF"/>`:''}</g>`;
  s+=`<g class="sc-tree" style="--a:${amp*.8}deg;transform-origin:283px ${G}px;animation-delay:-.4s"><path d="M283 ${G}V${G-16}" stroke="#6B4E33" stroke-width="2.5"/><ellipse cx="283" cy="${G-24}" rx="9" ry="11" fill="#358A52"/></g>`;
  if(snowH)s+=`<rect x="0" y="${G-snowH+2}" width="300" height="${snowH+30}" fill="#EEF4FF"/>`;
  if(water)s+=`<g opacity=".82"><rect x="0" y="${G-water+10}" width="300" height="${water+30}" fill="#2E7BE0"/><path class="sc-wave" d="M0 ${G-water+10}${Array.from({length:12},(_,k)=>`q10 -4 20 0t20 0`).join('')}V160H0Z" fill="#4C98F0"/></g>`;
  if(lv.rain){const n=[0,26,50,90][lv.rain],sl=lv.wind*3;for(let k=0;k<n;k++){const x=r()*320-10,y=r()*120;s+=`<line class="sc-drop" x1="${x}" y1="${y}" x2="${x-sl-2}" y2="${y+9}" stroke="#A9D4FF" stroke-width="1" opacity=".7" style="animation-delay:-${(r()*.6).toFixed(2)}s"/>`}}
  if(lv.snow){const n=[0,20,40,70][lv.snow];for(let k=0;k<n;k++){s+=`<circle class="sc-flake" cx="${(r()*300).toFixed(0)}" cy="${(r()*110).toFixed(0)}" r="${(1+r()*1.6).toFixed(1)}" fill="#fff" style="animation-delay:-${(r()*4).toFixed(2)}s"/>`}}
  if(lv.wind>=1){const n=[0,4,8,14][lv.wind];for(let k=0;k<n;k++){const y=20+r()*90;s+=`<line class="sc-streak" x1="0" y1="${y.toFixed(0)}" x2="${(18+r()*22).toFixed(0)}" y2="${y.toFixed(0)}" stroke="#E6F4FF" stroke-width="1.2" opacity=".6" style="animation-delay:-${(r()*1.1).toFixed(2)}s"/>`}}
  if(lv.ltg)s+=`<rect class="sc-flash" width="300" height="150" fill="#F4FAFF"/><path class="sc-flash" d="M190 8L176 40H186L172 74L200 32H189L198 8Z" fill="#FFF7C2"/>`;
  if(lv.dust)s+=`<rect width="300" height="150" fill="#B98D57" opacity="${[0,.18,.32,.46][lv.dust]}"/>`;
  return s+'</svg>'}
/* ---------- level decoder ---------- */
function fmtV(k,v){return k==='dust'&&!LIVE?fa(v.toFixed(2)):fa(Math.round(v))}
function decoderHTML(c,H,k){const th=hzThr(H.th,k),v=hzValue(H,k),lv=comp(v,th);
  const rows=[[1,`${fmtV(k,th[0])} تا ${fmtV(k,th[1])}`],[2,`${fmtV(k,th[1])} تا ${fmtV(k,th[2])}`],[3,`بیش از ${fmtV(k,th[2])}`]];
  let h=`<div class="dec"><div class="dec-h">${icoSVG(k,LCOL[lv],15)}<b>${HZN[k]} در ${c.n}</b><span>پیش‌بینی: <b class="num">${fmtV(k,v)}</b> ${UNIT[k]}</span></div><table>`;
  rows.forEach(([l,rng_])=>h+=`<tr class="${l===lv?'hit l'+l:'l'+l}"><td style="white-space:nowrap"><i class="sw"></i>${LVLN[l]}${l===lv?' ◀':''}</td><td style="white-space:nowrap">${rng_}</td><td>${MEANING[k][l]}</td></tr>`);
  h+='</table>';
  if(k==='rain'){h+=`<p class="note" style="margin:6px 0 0">${c.n} در یک ماه عادی این فصل حدود ${fa(Math.round(H.th.norm))} میلی‌متر باران می‌گیرد؛ ${H.th.src==='est'?'آستانه‌ها فعلاً از نرمال استان تخمین زده شده‌اند؛ با ساخته‌شدن اقلیم ERA5 شهر دقیق می‌شوند.':'آستانه‌ها از باران‌های کم‌سابقه‌ی همین شهر (ERA5) ساخته شده‌اند.'}</p>
    <div class="cmp">همین ${fa(Math.round(v))} میلی‌متر در <select id="cmpSel" aria-label="مقایسه با شهر دیگر">${['رشت','یزد','تهران','اهواز','تبریز','بندرعباس','زاهدان'].filter(n=>n!==c.n).map(n=>`<option>${n}</option>`).join('')}</select> یعنی <b id="cmpOut"></b></div>`}
  return h+'</div>'}
function cmpUpdate(){const sel=$('#cmpSel');if(!sel||!S.city)return;const H=HZ[S.city];const o=GEO.cities.find(q=>q.n===sel.value);const th=thrOf(o);const l=comp(H.r24,th.r24);$('#cmpOut').innerHTML=`<span class="lvl l${l}" style="display:inline-block">${LVLN[l]}</span> <span class="note" style="display:inline">(قرمزِ ${o.n} از ${fa(Math.round(th.r24[2]))} میلی‌متر)</span>`}
/* ---------- city panel (verdict first) ---------- */
function cityPanel(c){const H=HZ[c.n];if(!H)return'';const w=H.wx[Math.max(0,Math.min(95,Math.round(S.t-HZT)))];const pn=provName(c);const lv=peak12(H);
  const win=windowOf(H.L.all,2);let v1,v2='',vl=H.max72;
  if(win){v1=win.s===0?`تا ${at(win.e+1)} بیرون نرو، مگر ضروری.`:`از ${at(win.s)} تا ${at(win.e+1)} بیرون نرو، مگر ضروری.`;if(win.s>0)v2=`اگر بیرون می‌روی، تا ${at(Math.max(0,win.s-1))} برگرد.`}
  else if(H.max72===1)v1='بیرون رفتن مشکلی ندارد؛ با احتیاط.';else v1='تا ۷۲ ساعت آینده هشداری نیست.';
  const pc=GEO.cities.filter(q=>q.p===c.p&&HZ[q.n]);let pe=-1;pc.forEach(q=>{const wq=windowOf(HZ[q.n].L.all,2);if(wq)pe=Math.max(pe,wq.e)});
  const mnt=pe>=0?`کوه نرو تا ${at(Math.min(95,pe+12))}؛ مسیل‌ها بعد از باران هم پرآب می‌مانند.`:'';
  let h=`<div class="crumbs"><button id="backIran">ایران</button> › <button id="backProv">${pn}</button> › ${c.n}</div><h2>${c.n}</h2><p class="sub">استان ${pn} · ارتفاع حدود ${fa(c.el)} متر · ${at(S.t-HZT)}</p>
   <div class="verdict l${vl}"><div class="v1">${v1}</div>${v2?`<div class="v2">${v2}</div>`:''}${mnt?`<div class="v2">⛰ ${mnt}</div>`:''}</div>
   <button class="sharebtn" data-share="${c.n}">📣 هشدار برای دوستان: عکس و ویدیو (تلگرام، اینستاگرام، X)</button>
   ${citySceneSVG(c,lv)}<p class="note" style="margin:4px 0 8px">صحنه‌ی نمادینِ اوج ۱۲ ساعت آینده: ${sceneCaption(lv)}.</p>
   <div class="chips">${['rain','snow','wind','ltg','dust'].filter(k=>Math.max(...H.L[k])>=1).map(k=>{const m=Math.max(...H.L[k]);const v=hzValue(H,k);const txt=k==='rain'?`${fa(Math.round(v))} میلی‌متر`:k==='snow'?`${fa(Math.round(v))} سانتی‌متر`:k==='wind'?`${fa(Math.round(v))} km/h`:'';return `<span class="chip hz l${m}">${icoSVG(k,LCOL[m],13)}${HZN[k]}: ${LVLN[m]}${txt?' · '+txt:''}</span>`}).join('')||'<span class="chip">بدون خطر</span>'}</div>`;
  const dk=['rain','snow','wind','dust'].filter(k=>Math.max(...H.L[k])>=1).sort((a,b)=>Math.max(...H.L[b])-Math.max(...H.L[a])).slice(0,2);
  if(!dk.length&&H.r24>=1)dk.push('rain');
  if(dk.length)h+=`<div class="sect"><h3>این رنگ برای ${c.n} یعنی چه؟</h3>${dk.map(k=>decoderHTML(c,H,k)).join('')}</div>`;
  let a=[];['rain','snow','wind','ltg','dust'].forEach(k=>{const ml=Math.max(...H.L[k]);if(!ml)return;(ACT[k][ml]||ACT[k][2]||[]).forEach(t=>a.push(`${icoSVG(k,LCOL[ml],13)}${t}`))});
  if(a.length)h+=`<div class="sect"><h3>اقدام‌های ایمنی</h3><ul class="acts">${a.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  h+=`<div class="sect"><h3>الان</h3><div class="now"><div><b class="num">${fa(Math.round(w.T))}°</b><span>دما</span></div><div><b class="num">${fa(Math.round(w.rh))}٪</b><span>رطوبت</span></div>
   <div><b class="num">${fa(Math.round(w.wind))}</b><span>باد، km/h · تندباد ${fa(Math.round(w.gust))}</span></div><div><b class="num">${w.pr>.05?fa(w.pr.toFixed(1)):'—'}</b><span>${w.pr>.05?'mm/h، '+TYPEN[w.type]:'بدون بارش'}</span></div></div></div>`;
  const rows=[{n:'سطح کلی',v:H.L.all,bold:true}];['rain','snow','wind','ltg','dust'].forEach(k=>{if(Math.max(...H.L[k])>=1)rows.push({n:HZN[k],v:H.L[k]})});
  h+=`<div class="sect"><h3>۷۲ ساعت آینده</h3>${stripSVG(rows,{temp:H.wx.slice(0,72).map(x=>x.T)})}</div>`;
  h+=`<p class="note">راهنمای عمومی است؛ دستور رسمی را از سازمان هواشناسی و هلال احمر بگیر.</p>`;return h}

/* ---------- scorecard (simulated) ---------- */
const SCORE=LIVE&&window.__SCORE&&window.__SCORE.weeks&&window.__SCORE.weeks.length?window.__SCORE:null;
const WEEKS=SCORE?SCORE.weeks.length:10;const LEADS=[6,12,24,48,72];
const VARS={t2m:{n:'دمای ۲ متری',u:'MAE به درجه‌ی سانتی‌گراد',lower:true},prcp:{n:'رخداد بارش',u:'CSI، بزرگ‌تر بهتر',lower:false},eta:{n:'زمان رسیدن',u:'خطای ETA به ساعت',lower:true}};
if(SCORE){delete VARS.eta;VARS.gust={n:'تندباد',u:'MAE به کیلومتر بر ساعت',lower:true}}
const REGIONS={all:'کل کشور',nw:'شمال‌غرب',sw:'جنوب‌غرب',teh:'تهران و البرز'};
const SKILL={wn3:{t2m:.86,prcp:1.12,eta:.82},ifs:{t2m:1,prcp:1,eta:1},aifs:{t2m:.9,prcp:1.06,eta:.9},gfs:{t2m:1.18,prcp:.86,eta:1.25},icon:{t2m:1.04,prcp:.95,eta:1.08}};
const RB={all:1,nw:1.08,sw:.95,teh:.92};
// store weekly SUMS and COUNTS, never averages
const DB=SCORE?scoreDB(SCORE):(()=>{const r=rng(42),db={};MODELS.forEach(m=>{db[m.id]={};Object.keys(VARS).forEach(v=>{db[m.id][v]={};Object.keys(REGIONS).forEach(g=>{db[m.id][v][g]=[];
  for(let w=0;w<WEEKS;w++){const gap=(m.id==='wn3'&&(w===3||w===4));const row={};LEADS.forEach(L=>{const n=gap?0:Math.round((v==='eta'?6:180)*(g==='all'?3:1)*(.7+r()*.6));const lead=1+L/48;
    const wk=1+.12*Math.sin(w*1.3+m.id.length)+.08*gauss(r);let sk=SKILL[m.id][v];if(m.id==='wn3'&&v!=='eta'&&L<=12)sk*=v==='prcp'?1.08:.9;if(m.id==='aifs'&&L>=48)sk*=v==='prcp'?1.05:.93;
    if(v==='t2m'){const mae=1.1*lead*sk*RB[g]*wk;row[L]={sum:mae*n,n}}else if(v==='eta'){const e=2.4*lead*sk*RB[g]*wk;row[L]={sum:e*n,n}}else{const csi=clamp(.42/lead*sk/RB[g]/wk,.05,.9);const ev=n;const hits=Math.round(ev*csi*1.3),miss=Math.round(ev*csi*.4+ev*.15),fa_=Math.round(ev*(1-csi)*.35);row[L]={hits,miss,fa:fa_,n}}});
    db[m.id][v][g].push(row)}})})});return db})();
const SC={range:1,v:'prcp',g:'all'};
const RANGES=[[1,'هفته‌ی گذشته'],[2,'۲ هفته‌ی گذشته'],[4,'۴ هفته‌ی گذشته'],[WEEKS,'از ابتدای فصل']];
function agg(mid,v,g,weeks,leads=LEADS){let S1=0,N=0,h=0,mi=0,f=0;for(const w of weeks)for(const L of leads){const c=(((DB[mid]||{})[v]||{})[g]||[])[w]?.[L];if(!c)continue;if(v==='prcp'){h+=c.hits;mi+=c.miss;f+=c.fa;N+=c.n}else{S1+=c.sum;N+=c.n}}
  if(!N)return{val:null,n:0};return v==='prcp'?{val:h/(h+mi+f),n:N}:{val:S1/N,n:N}}
function score(v,val,ref){if(val==null||ref==null)return null;return VARS[v].lower?(ref-val)/ref:(val-ref)/ref}
const fmtv=(v,x)=>x==null?'—':fa(v==='prcp'?x.toFixed(2):x.toFixed(1));
function renderScore(){const v=SC.v,g=SC.g;const wk=[...Array(SC.range).keys()].map(i=>WEEKS-1-i);const prevWk=wk.map(w=>w-SC.range).filter(w=>w>=0);
  const ref=agg('ifs',v,g,wk).val;const refP=prevWk.length?agg('ifs',v,g,prevWk).val:null;
  let rows=MODELS.map(m=>{const a=agg(m.id,v,g,wk);const p=prevWk.length?agg(m.id,v,g,prevWk):{val:null};return{m,...a,sk:score(v,a.val,ref),skp:score(v,p.val,refP)}});
  const rank=arr=>[...arr].filter(r=>r.sk!=null).sort((a,b)=>b.sk-a.sk);const now=rank(rows);const prevRank=[...rows].filter(r=>r.skp!=null).sort((a,b)=>b.skp-a.skp).map(r=>r.m.id);
  const win=now[0]||{m:{name:'—',full:'برای این انتخاب هنوز داده‌ای نیست'},sk:0,n:0};const finalTag=SCORE?(wk.some(w=>SCORE.weeks[w]&&!SCORE.weeks[w].final)?'<span class="tag">موقت؛ ERA5 هنوز کامل نشده</span>':'<span class="tag">نهایی</span>'):wk.includes(WEEKS-1)?'<span class="tag">هفته‌ی آخر موقت است</span>':'<span class="tag">نهایی</span>';
  const pills=(arr,key)=>`<div class="pills">${arr.map(([k,n])=>`<button data-k="${key}" data-v="${k}" aria-pressed="${String(SC[key])===String(k)}">${n}</button>`).join('')}</div>`;
  let h=(LIVE&&!SCORE?'<div class="card" style="margin-bottom:14px">کارنامه‌ی واقعی بعد از اولین هفته‌ی کامل آرشیو پیش‌بینی‌ها ساخته می‌شود. فعلاً این صفحه نمونه‌ی ساختگی است.</div>':'')+`<div class="bar"><label>بازه</label>${pills(RANGES,'range')}<label>متغیر</label>${pills(Object.entries(VARS).map(([k,o])=>[k,o.n]),'v')}<label>منطقه</label>${pills(Object.entries(REGIONS),'g')}</div>
  <div class="card winner" style="margin-bottom:16px"><div class="big">${win.m.name}</div><div><div style="font-weight:700">برنده‌ی ${RANGES.find(r=>r[0]===SC.range)[1]} در ${VARS[v].n}، ${REGIONS[g]}</div>
   <div style="color:var(--dim);font-size:13px">${win.m.full}؛ ${fa(Math.round(Math.abs(win.sk)*100))}٪ ${win.sk>=0?'بهتر':'بدتر'} از IFS · ${fa(win.n.toLocaleString('en'))} نمونه ${finalTag}</div></div></div>
  <div class="grid2"><div class="card"><h3>جدول رده‌بندی</h3><p class="sub">${VARS[v].u}؛ امتیاز مهارت نسبت به IFS. جمع خطاها و تعداد نمونه‌ها هفته‌به‌هفته جمع می‌شود، نه میانگین‌ها.</p>
   <table class="lb"><thead><tr><th>#</th><th>مدل</th><th>مقدار</th><th>مهارت</th><th>تغییر</th><th>نمونه</th></tr></thead><tbody>`;
  const maxAbs=Math.max(.05,...now.map(r=>Math.abs(r.sk)));
  [...now,...rows.filter(r=>r.sk==null)].forEach((r,i)=>{const pr=prevRank.indexOf(r.m.id);const ch=r.sk==null||pr<0?'':pr>i?`<span class="up">▲ ${fa(pr-i)}</span>`:pr<i?`<span class="dn">▼ ${fa(i-pr)}</span>`:'<span style="color:var(--dim)">—</span>';
    const wbar=r.sk==null?0:Math.abs(r.sk)/maxAbs*50;const col=r.sk>=0?'#2BB55E':'var(--alert)';
    h+=`<tr><td class="rk">${r.sk==null?'—':fa(i+1)}</td><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${r.m.col};outline:1px solid var(--line);margin-left:6px"></span>${r.m.name}</td><td class="num">${fmtv(v,r.val)}</td>
    <td><div class="bar"><i style="background:${col};${r.sk>=0?`left:50%;width:${wbar}%`:`right:50%;width:${wbar}%`}"></i><i style="left:50%;width:1px;background:var(--dim)"></i></div></td><td>${ch}</td><td class="num">${r.n?fa(r.n.toLocaleString('en')):'<span class="tag">بدون داده</span>'}</td></tr>`});
  h+=`</tbody></table></div><div class="card chart"><h3>روند هفتگی</h3><p class="sub">${VARS[v].u}؛ نوار روشن بازه‌ی انتخاب‌شده است. جاهای خالی یعنی آن هفته داده‌ای نرسیده.</p>${trendSVG(v,g)}</div></div>
  <div class="grid2" style="margin-top:16px"><div class="card chart"><h3>مدل در برابر افق پیش‌بینی</h3><p class="sub">${VARS[v].u} در بازه‌ی انتخاب‌شده؛ سبزتر یعنی بهتر از بقیه در همان افق.</p>${heatSVG(v,g,wk)}</div>
  <div class="card chart"><h3>بهترین مدل در هر استان</h3><p class="sub">هر استان به رنگ مدلی که در بازه‌ی انتخاب‌شده کمترین خطا را داشته.</p>${provSVG(v,wk)}</div></div>
  <p class="note">${SCORE?`کارنامه‌ی واقعی: پیش‌بینی اجراهای ۰۰ و ۱۲ UTC در برابر ERA5. رخداد بارش یعنی دست‌کم ${fa(SCORE.event_mm)} میلی‌متر در ۳ ساعت. به‌روزرسانی: ${fa(SCORE.generated.slice(0,10))}.`:'همه‌ی اعداد این صفحه ساختگی است و فقط شکل کارنامه را نشان می‌دهد.'}</p>`;
  const box=$('#score');box.innerHTML=h;box.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;SC[k]=k==='range'?+b.dataset.v:b.dataset.v;renderScore()})}
function trendSVG(v,g){const w=540,h=236,l=40,r=46,t=10,b=34;const series=MODELS.map(m=>({m,pts:[...Array(WEEKS).keys()].map(i=>agg(m.id,v,g,[i]).val)}));const all=series.flatMap(s=>s.pts).filter(x=>x!=null);
  const lo=Math.min(...all)*.92,hi=Math.max(...all)*1.05;const X=i=>l+i/(WEEKS-1)*(w-l-r),Y=val=>t+(1-(val-lo)/(hi-lo))*(h-t-b);
  let s=`<svg viewBox="0 0 ${w} ${h}" style="direction:ltr" role="img" aria-label="روند هفتگی خطای مدل‌ها">`;const x0=X(WEEKS-SC.range)-((w-l-r)/(WEEKS-1))/2;
  s+=`<rect x="${Math.max(l,x0)}" y="${t}" width="${X(WEEKS-1)+8-Math.max(l,x0)}" height="${h-t-b}" fill="var(--amber)" opacity=".1" rx="6"/>`;
  for(let k=0;k<=4;k++){const val=lo+(hi-lo)*k/4;s+=`<line x1="${l}" x2="${w-r}" y1="${Y(val)}" y2="${Y(val)}" stroke="var(--line)"/><text x="${l-6}" y="${Y(val)+3}" font-size="10" text-anchor="end" fill="var(--dim)" font-family="JetBrains Mono">${v==='prcp'?val.toFixed(2):val.toFixed(1)}</text>`}
  for(let i=0;i<WEEKS;i++)s+=`<text x="${X(i)}" y="${h-16}" font-size="10.5" text-anchor="middle" fill="var(--dim)" font-family="Vazirmatn">${SCORE?fa(SCORE.weeks[i].id.slice(5).replace('-','/')):fa(i+1)}</text>`;s+=`<text x="${(l+w-r)/2}" y="${h-2}" font-size="10.5" text-anchor="middle" fill="var(--dim)" font-family="Vazirmatn" direction="rtl">هفته‌ی فصل (آخری = هفته‌ی گذشته)</text>`;
  series.forEach(({m,pts})=>{let d='',pen=false;pts.forEach((p,i)=>{if(p==null){pen=false;return}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(p).toFixed(1);pen=true});
    s+=`<path d="${d}" fill="none" stroke="${m.col}" stroke-width="${m.id==='ifs'?1.4:2}" ${m.id==='ifs'?'stroke-dasharray="4 3"':''} style="filter:drop-shadow(0 0 1px rgba(0,0,0,.4))"/>`;
    pts.forEach((p,i)=>{if(p!=null)s+=`<circle cx="${X(i)}" cy="${Y(p)}" r="2.6" fill="${m.col}" stroke="var(--panel)"><title>${m.name} · هفته‌ی ${fa(i+1)}: ${fmtv(v,p)}</title></circle>`});
    const li=pts.length-1;if(pts[li]!=null)s+=`<text x="${X(li)+4}" y="${Y(pts[li])+3}" font-size="10" fill="var(--ink)" font-family="JetBrains Mono">${m.name}</text>`});
  return s+'</svg>'}
function heatSVG(v,g,wk){const w=520,cw=78,ch=34,l=70,t=26;const vals=MODELS.map(m=>LEADS.map(L=>agg(m.id,v,g,wk,[L]).val));
  let s=`<svg viewBox="0 0 ${w} ${t+ch*MODELS.length+8}" style="direction:ltr" role="img" aria-label="نقشه‌ی حرارتی مدل در برابر افق">`;
  LEADS.forEach((L,j)=>s+=`<text x="${l+j*cw+cw/2}" y="16" font-size="11" text-anchor="middle" fill="var(--dim)" font-family="JetBrains Mono">+${L}h</text>`);
  MODELS.forEach((m,i)=>{s+=`<text x="${l-10}" y="${t+i*ch+ch/2+4}" font-size="12" text-anchor="end" fill="var(--ink)" font-family="JetBrains Mono">${m.name}</text>`;
    LEADS.forEach((L,j)=>{const col=vals.map(r=>r[j]).filter(x=>x!=null);const x=vals[i][j];let q=.5;if(x!=null&&col.length>1){const mn=Math.min(...col),mx=Math.max(...col);q=(x-mn)/((mx-mn)||1);if(!VARS[v].lower)q=1-q}
      const fill=x==null?'var(--chip)':`hsl(${Math.round(150-q*150)} 70% ${42}%)`;s+=`<rect x="${l+j*cw+2}" y="${t+i*ch+2}" width="${cw-4}" height="${ch-4}" rx="6" fill="${fill}" opacity="${x==null?1:.85}"/><text x="${l+j*cw+cw/2}" y="${t+i*ch+ch/2+4}" font-size="11.5" text-anchor="middle" fill="#fff" font-family="JetBrains Mono">${x==null?'—':(v==='prcp'?x.toFixed(2):x.toFixed(1))}</text>`})});
  return s+'</svg>'}
function provSVG(v,wk){const r=rng(9+SC.range*3+v.length);const box=[HOME.x,HOME.y,HOME.x+HOME.w,HOME.y+HOME.h];let s=`<svg viewBox="${box[0]} ${box[1]} ${box[2]-box[0]} ${box[3]-box[1]}" role="img" aria-label="بهترین مدل هر استان">`;
  GEO.provs.forEach(p=>{const [lon,lat]=U(p.c[0],p.c[1]);const reg=SCORE?'p:'+p.id:lon<49&&lat>34?'nw':lon<51&&lat<33?'sw':(lon>50&&lon<53&&lat>35)?'teh':'all';
    let best=null,bv=null;MODELS.forEach(m=>{const a=agg(m.id,v,reg,wk).val;if(a==null)return;const noisy=SCORE?a:a*(1+(r()-.5)*.16);const better=bv==null||(VARS[v].lower?noisy<bv:noisy>bv);if(better){bv=noisy;best=m}});
    s+=`<path d="${p.d}" fill="${best?best.col:'var(--chip)'}" fill-opacity=".75" stroke="var(--panel)" stroke-width="1.2"><title>${p.fa}: ${best?best.name:'—'}</title></path>`});
  s+=`</svg><div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--dim)">${MODELS.map(m=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${m.col};vertical-align:middle;margin-left:5px;outline:1px solid var(--line)"></i>${m.name}</span>`).join('')}</div>`;return s}

/* ---------- live data: Open-Meteo grid layers ---------- */
const GR=LIVE&&LIVE.grid;
const GPTS=(()=>{if(!GR)return[];const pts=[];for(let j=0;j<=(GR.ny-1)*2;j++)for(let i=0;i<=(GR.nx-1)*2;i++)pts.push([GR.lon0+i*GR.d/2,GR.lat0+j*GR.d/2]);return pts})();
const RPOOL=[];let rainKey='';
function drawRainLive(){if(!GR)return;const key=S.t.toFixed(2)+S.mode+S.layers.type;if(key===rainKey)return;rainKey=key;
  if(!RPOOL.length)GPTS.forEach(()=>RPOOL.push(el('circle',{opacity:0},gRain)));const R=GR.d/2*K;
  GPTS.forEach(([lon,lat],i)=>{const pr=LV.gridVal('pr',S.t,lon,lat),e=RPOOL[i];if(pr<.25){e.setAttribute('opacity',0);return}
    const v=clamp(Math.log1p(pr)/Math.log1p(18),0,1);const [x,y]=P(lon,lat);let fc=ramp(v);
    if(S.layers.type){const sn=LV.gridVal('sn',S.t,lon,lat)*.7;fc=sn>pr*.6?'#F2F6FF':sn>pr*.2?'#C59BFF':['#2F7DE1','#4FA3FF','#7FC1FF'][clamp(Math.floor(v*3),0,2)]}
    e.setAttribute('cx',x);e.setAttribute('cy',y);e.setAttribute('r',(R*(.7+.5*v)).toFixed(1));e.setAttribute('fill',fc);e.setAttribute('opacity',clamp(.25+v*.75,0,.85).toFixed(2))})}
function gridK(){const st=LV.gridStep(S.t);return st.u>.5?Math.min(st.k+1,GR.t.length-1):st.k}
// باد ۱۰ متری: u و v در هر گوشه، بعد درون‌یابی (درون‌یابی مستقیم جهت دور ۳۶۰ درجه غلط می‌شود)
function windLive(lon,lat){if(!GR)return[.32,.04];const k=gridK();
  const x=clamp((lon-GR.lon0)/GR.d,0,GR.nx-1),y=clamp((lat-GR.lat0)/GR.d,0,GR.ny-1);const i=Math.min(Math.floor(x),GR.nx-2),j=Math.min(Math.floor(y),GR.ny-2),fx=x-i,fy=y-j;
  let u=0,v=0;[[i,j,(1-fx)*(1-fy)],[i+1,j,fx*(1-fy)],[i,j+1,(1-fx)*fy],[i+1,j+1,fx*fy]].forEach(([a,b,w])=>{const n=b*GR.nx+a,ws=GR.ws[k][n],wd=GR.wd[k][n]*Math.PI/180;u-=ws*Math.sin(wd)*w;v-=ws*Math.cos(wd)*w});
  return[u/40,v/40]}
let ltgK=-1,LTG=[];
function ltgLive(){if(!GR)return[];const k=gridK();if(k!==ltgK){ltgK=k;LTG=[];GR.cape[k].forEach((c,n)=>{const pr=GR.pr[k][n];if(c>=600&&pr>=1)LTG.push([GR.lon0+(n%GR.nx)*GR.d,GR.lat0+Math.floor(n/GR.nx)*GR.d,.62+Math.min(.3,c/6000+pr/40),1.1])})}return LTG}
const DPOOL=[];let dustKey='';
function drawDustLive(){if(!GR||!GR.du)return;const key=S.t.toFixed(1);if(key===dustKey)return;dustKey=key;
  if(!DPOOL.length)for(let n=0;n<GR.nx*GR.ny;n++)DPOOL.push(el('ellipse',{fill:'#C9A36A',opacity:0},gDust));
  DPOOL.forEach((e,n)=>{const lon=GR.lon0+(n%GR.nx)*GR.d,lat=GR.lat0+Math.floor(n/GR.nx)*GR.d;const v=LV.gridVal('du',S.t,lon,lat);const [x,y]=P(lon,lat);
    e.setAttribute('cx',x);e.setAttribute('cy',y);e.setAttribute('rx',GR.d*K*.85);e.setAttribute('ry',GR.d*K*.6);e.setAttribute('opacity',clamp((v-60)/500,0,.55).toFixed(3))})}
// اجماع: چند مدل برای نزدیک‌ترین شهر سر راه سامانه هم سطح اجماع را می‌بینند
function agreementLive(st){const fut=[];for(let t=Math.max(0,S.t);t<=S.t+48;t+=3)fut.push(stormAt(st,t,'mix'));
  let best=null,bd=1e9;GEO.cities.filter(c=>c.m).forEach(c=>fut.forEach(s=>{if(s[2]<.2)return;const d=Math.hypot(c.lon-s[0],c.lat-s[1]);if(d<bd){bd=d;best=c}}));
  const cd=best&&LV.byN[best.n];if(!cd)return 0;const i=LV.i0+Math.round(S.t);const ref=Math.max(1,...cd._L.mix.all.slice(i,i+48));
  return MODELS.filter(m=>cd._L[m.id]&&Math.max(...cd._L[m.id].all.slice(i,i+48))>=ref).length}
function cityChartLive(){const c=GEO.cities.find(q=>q.n===S.city),d=c&&LV.byN[c.n];if(!d)return'';const w=264,h=120,x0=6,x1=w-6,y0=10,y1=h-18;const X=t=>x0+(t-TMIN)/(TMAX-TMIN)*(x1-x0);
  let mx=.5;MODELS.forEach(m=>{const s=d.s[m.id];if(s)for(let t=TMIN;t<=TMAX;t++)mx=Math.max(mx,s.pr[LV.i0+t]||0)});const Y=v=>y1-v/mx*(y1-y0);
  let s=`<div class="sect"><h3>${c.n}: بارش ساعتی هر مدل</h3><svg viewBox="0 0 ${w} ${h}" style="width:100%;direction:ltr" role="img" aria-label="بارش ساعتی پیش‌بینی‌شده برای ${c.n}">`;
  MODELS.forEach(m=>{const sr=d.s[m.id];if(!sr)return;let p='';for(let t=TMIN;t<=TMAX;t++)p+=(t===TMIN?'M':'L')+X(t).toFixed(1)+' '+Y(sr.pr[LV.i0+t]||0).toFixed(1);s+=`<path d="${p}" fill="none" stroke="${m.col}" stroke-width="1.3" opacity=".9"><title>${m.full}</title></path>`});
  s+=`<line x1="${X(S.t)}" x2="${X(S.t)}" y1="${y0}" y2="${y1}" stroke="var(--amber)" stroke-width="1.5"/><line x1="${X(0)}" x2="${X(0)}" y1="${y0}" y2="${y1}" stroke="var(--dim)" stroke-dasharray="1 3"/>`;
  s+=`<text x="${x0}" y="${y0}" font-size="9" fill="var(--dim)" font-family="JetBrains Mono">${mx.toFixed(1)} mm/h</text>`;
  for(let t=Math.ceil(TMIN/24)*24;t<=TMAX;t+=24)s+=`<text x="${X(t)}" y="${h-4}" font-size="9" fill="var(--dim)" text-anchor="middle" font-family="JetBrains Mono">${t>=0?'+':''}${t}h</text>`;
  return s+`</svg><div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--dim)">${MODELS.map(m=>`<span><i style="display:inline-block;width:10px;height:3px;background:${m.col};vertical-align:middle;margin-left:4px;outline:1px solid var(--line)"></i>${m.name}</span>`).join('')}</div></div>`}
function liveHud(){const age=LV.ageH(),g=new Date(LIVE.generated);const hm=String(g.getUTCHours()).padStart(2,'0')+':'+String(g.getUTCMinutes()).padStart(2,'0');
  return `FORECAST · <b>OPEN-METEO</b> · UPDATED <b>${hm}Z</b>${age>6?` · <b style="color:#FF4D5E">STALE ${Math.round(age)}H</b>`:''}<br>MAP FIELD <b>${GR?'ECMWF IFS · 2° GRID':'N/A'}</b> · CITIES <b>${LIVE.cities.length}</b>`}
function setStamp(){const s=$('#stamp');const q=new URLSearchParams(location.search);
  if(!LIVE){s.textContent=q.has('demo')?'داده‌ی ساختگی، نسخه‌ی نمایشی':'داده‌ی زنده در دسترس نیست · نسخه‌ی نمایشی';s.href='./';s.title='داده‌ی زنده';return}
  const age=LV.ageH();s.textContent=(age>6?'داده‌ی کهنه · ':'داده‌ی زنده · ')+liveStamp();s.href='?demo=1';s.title='نسخه‌ی نمایشی با داده‌ی ساختگی';
  if(age<=6){s.style.color='#2BB55E';s.style.borderColor='color-mix(in srgb,#2BB55E 45%,transparent)'}}
const KINDN={up:'تشدید',clear:'رفع خطر',shift:'تغییر زمان'};
function alertLine(x){const k=LV.clock((new Date(x.time)-LV.t0)/36e5);return{k,txt:`${k.day} ${k.hm} — ${x.city} · ${KINDN[x.kind]||''}${x.dom?' · '+HZN[x.dom]:''}${x.test?' (آزمایشی)':''}`}}
function alertsHTML(){const a=(LIVE&&LIVE.alerts)||[];if(!a.length)return'';
  return `<div class="sect"><h3>هشدارهای فرستاده‌شده</h3>${a.slice(0,8).map(x=>{const {k}=alertLine(x);return `<button class="city l${x.level}" data-city="${x.city}"><span class="dot"></span><span><span class="n">${x.city}${x.test?' · آزمایشی':''}</span><span class="e">${KINDN[x.kind]||''}${x.dom?' · '+HZN[x.dom]:''}</span></span><span class="lvl">${k.day} ${k.hm}</span></button>`}).join('')}</div>`}
function initTicker(){const a=(LIVE&&LIVE.alerts)||[];if(!a.length)return;S.alerts=a.slice(0,6).map(x=>alertLine(x).txt);$('#ticker').innerHTML=`<div>${S.alerts.slice(0,3).join('   |   ')}</div>`}
$('#leftPanel').addEventListener('click',e=>{const b=e.target.closest('[data-city]');if(b)selectCity(b.dataset.city)});

/* ---------- share card ---------- */
function shareLink(name){const base=location.href.split(/[?#]/)[0].replace(/index\.html$/,'');return base+(name?'?city='+encodeURIComponent(name):'')}
function sharePayload(name){
  const hz=LIVE?liveSnapshot(S.model):null;const H_=LIVE?hz.HZ:HZ;const stamp=LIVE?liveStamp():'نسخه‌ی نمایشی · داده‌ی ساختگی';
  const prov={};GEO.cities.forEach(c=>{if(H_[c.n])prov[c.p]=Math.max(prov[c.p]|0,H_[c.n].now)});
  if(name==='iran'){const top=GEO.cities.filter(c=>H_[c.n]).map(c=>({n:c.n,l:Math.max(...H_[c.n].L.all.slice(0,24)),k:H_[c.n].dom||(firstHz(H_[c.n])||{}).k})).filter(t=>t.l>=1).sort((a,b)=>b.l-a.l);
    return{view:'iran',provLevels:prov,top,stamp,link:shareLink(''),social:(LIVE&&LIVE.social)||{}}}
  const c=GEO.cities.find(q=>q.n===name);const H=H_[name];let etaS='',model,provEnd=-1;
  if(LIVE){const e=LV.eta(LV.byN[name],0,S.model);etaS=H.max72>=2?etaFmt(e,LV.clock.bind(LV)):'';provEnd=hz.provEnd(c.p);model=S.model==='mix'?'اجماع '+fa(MODELS.length)+' مدل':MODELS.find(m=>m.id===S.model).name}
  else{const e=eta(c,S.t,S.model);etaS=H.max72>=2?etaText(e):'';model='داده‌ی ساختگی'}
  const at_=h=>{const k=clockOf((LIVE?0:HZT)+h);return `${k.day} ${k.hm}`};
  return cardPayload({...c,pfa:provName(c)},H,{at:at_,provEnd,provLevels:prov,model,stamp,eta:etaS,link:shareLink(name),social:(LIVE&&LIVE.social)||{}})}
const SH={P:null,fmt:'post',anim:true,raf:0,frame:null,name:''};
async function openShare(name){SH.name=name;SH.P=sharePayload(name);const m=$('#shareModal');m.hidden=false;const cv=$('#shareCv'),cx=cv.getContext('2d');
  const size=()=>{const [w,h]=Card.SIZES[SH.fmt];cv.width=w;cv.height=h};size();await Card.fontsReady();
  SH.frame=T=>SH.P.view==='iran'?Card.drawIran(cx,SH.P,T,SH.fmt):Card.draw(cx,SH.P,T,SH.fmt);SH.anim=true;
  $('#shareFmt').value=SH.fmt;$('#shareFmt').onchange=e=>{SH.fmt=e.target.value;size()};
  $('#shareTitle').textContent=name==='iran'?'کارت وضعیت ایران':'کارت هشدار '+name;
  $('#shareOpen').href='card.html?'+(name==='iran'?'view=iran':'city='+encodeURIComponent(name));
  const t0=performance.now();cancelAnimationFrame(SH.raf);const lp=now=>{if(SH.anim)SH.frame((now-t0)/1000);if(!m.hidden)SH.raf=requestAnimationFrame(lp)};SH.raf=requestAnimationFrame(lp);$('#shareClose').focus()}
function closeShare(){$('#shareModal').hidden=true;cancelAnimationFrame(SH.raf)}
const shMsg=t=>$('#shareMsg').textContent=t;
$('#shareClose').onclick=closeShare;$('#shareModal').addEventListener('click',e=>{if(e.target.id==='shareModal')closeShare()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#shareModal').hidden){closeShare();e.stopImmediatePropagation()}},true);
$('#sharePng').onclick=()=>{SH.anim=false;SH.frame(1.6);$('#shareCv').toBlob(async b=>{const r=await Card.share(b,`radar-${SH.name}.png`,cardText(SH.P));shMsg(r==='download'?'عکس دانلود شد.':'');SH.anim=true},'image/png')};
$('#shareVid').onclick=async e=>{const b=e.currentTarget;b.disabled=true;SH.anim=false;shMsg('در حال ضبط ۸ ثانیه…');
  try{const blob=await Card.record($('#shareCv'),SH.frame,8);const ext=blob.type.includes('mp4')?'mp4':'webm';const r=await Card.share(blob,`radar-${SH.name}.${ext}`,cardText(SH.P));
    shMsg(r==='download'?`ویدیو (${ext.toUpperCase()}) دانلود شد.${ext==='webm'?' برای اینستاگرام از سافاری یا کروم جدید استفاده کن تا MP4 بسازد.':''}`:'')}catch(err){shMsg('ضبط نشد: '+err.message)}
  b.disabled=false;SH.anim=true};
$('#shareCopy').onclick=async()=>{try{await navigator.clipboard.writeText(cardText(SH.P));shMsg('متن کپی شد.')}catch(_){shMsg(cardText(SH.P))}};

// کارنامه‌ی واقعی: خانه‌ها آرایه‌اند ([جمع، n] یا [hits، miss، fa، n])
function scoreDB(sc){const db={};for(const m in sc.db){db[m]={};for(const v in sc.db[m]){db[m][v]={};for(const g in sc.db[m][v])db[m][v][g]=sc.db[m][v][g].map(w=>{const o={};for(const L in w){const a=w[L];o[L]=a.length===4?{hits:a[0],miss:a[1],fa:a[2],n:a[3]}:{sum:a[0],n:a[1]}}return o})}}return db}
/* ---------- start ---------- */
function start(){renderCrumbs();setStamp();if(LIVE)$('#spagBtn').style.display='none';
  const q=new URLSearchParams(location.search);if(q.get('model')&&[...MODELS,MIX].some(m=>m.id===q.get('model')))S.model=q.get('model');if(q.get('t'))S.t=clamp(+q.get('t')||0,TMIN,TMAX);
  if(STORMS.length){const s=stormAt(STORMS[0],0,'mix');const [cx,cy]=P(s[0],s[1]);setVB(fit({x:cx-110,y:cy-75,w:220,h:150},0))}else setVB(fit(REGION,0));
  setModel(S.model);tick(true);hudBL();hudTL();initTicker();
  const city=q.get('city'),prov=q.get('prov');
  if(city&&GEO.cities.some(c=>c.n===city))setTimeout(()=>selectCity(city),reduce?0:600);
  else if(prov){const p=GEO.provs.find(x=>x.id===prov||x.fa===prov);setTimeout(()=>p?selectProv(p.id):flyTo(HOME,1600),reduce?0:600)}
  else setTimeout(()=>flyTo(HOME,2200),reduce?0:900);
  if(q.get('share'))setTimeout(()=>openShare(q.get('share')),1500);
  requestAnimationFrame(loop)}
window.addEventListener('resize',()=>setVB(fit(vb,0)));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(start);else start();