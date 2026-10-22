/* رادار — کارت هشدار قابل‌اشتراک: صحنه‌ی متحرک شهر + میزان خطر + «چه کنم».
   همه‌چیز روی Canvas و تابعِ زمان T (ثانیه) است، تا هر فریم قطعی باشد:
   هم مرورگر با MediaRecorder ضبطش می‌کند، هم Playwright در GitHub Actions فریم‌به‌فریم. */
const Card=(()=>{
const F='Vazirmatn, Tahoma, sans-serif', M='"JetBrains Mono", Menlo, monospace';
const INK='#E6F1F7',DIM='#86A3B3',BG='#05080D',PANEL='#0B1620',LINE='#1B3242',AMBER='#FFB547';
const PROVF=['#12303F','#55501F','#6B3F15','#6E1F2C'];
const SIZES={post:[1080,1350],story:[1080,1920]};
const easeOut=u=>1-Math.pow(1-clamp(u,0,1),3);

function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function font(c,sz,w=400,fam=F){c.font=`${w} ${sz}px ${fam}`}
// متن راست‌چین با شکستن خط؛ x لبه‌ی راست است. برمی‌گرداند y بعد از آخرین خط.
function wrap(c,txt,x,y,maxW,lh,maxLines=3){c.direction='rtl';c.textAlign='right';const words=String(txt).split(/\s+/);let line='',n=0;
  for(let i=0;i<words.length;i++){const test=line?line+' '+words[i]:words[i];if(c.measureText(test).width>maxW&&line){
      if(++n>=maxLines){c.fillText(line+' …',x,y);return y+lh}c.fillText(line,x,y);y+=lh;line=words[i]}else line=test}
  if(line){c.fillText(line,x,y);y+=lh}return y}
function rtl(c,txt,x,y){c.direction='rtl';c.textAlign='right';c.fillText(txt,x,y)}
function ltr(c,txt,x,y,align='left'){c.direction='ltr';c.textAlign=align;c.fillText(txt,x,y)}
function icon(c,k,x,y,sz,col){c.save();c.translate(x,y);c.scale(sz/10,sz/10);const p=new Path2D(ICON[k]);c.lineWidth=1.3;c.lineCap='round';c.lineJoin='round';c.strokeStyle=col;c.stroke(p);if(k==='rain'||k==='ltg'){c.fillStyle=col;c.fill(p)}c.restore()}

/* ---------- صحنه‌ی نمادین شهر (فضای طراحی ۳۰۰×۱۵۰، مثل دمو) ---------- */
function scene(c,lv,T,seed){const r=rng(seed);const G=118;const water=[0,6,15,30][lv.rain|0],snowH=[0,4,9,16][lv.snow|0],amp=[2,6,12,22][lv.wind|0];
  const calm=!(lv.rain||lv.snow||lv.wind||lv.ltg||lv.dust);
  const sky=lv.dust?['#2A3A48','#6B5A44','#7A5F3E','#8A6436'][lv.dust]:['#1C3448','#22384A','#1A2A38','#131E29'][Math.max(lv.rain|0,lv.snow|0,lv.ltg|0)];
  const g=c.createLinearGradient(0,0,0,G);g.addColorStop(0,calm?'#2B6A8F':sky);g.addColorStop(1,calm?'#9CCBE0':'#2B4253');c.fillStyle=g;c.fillRect(0,0,300,150);
  if(calm){c.fillStyle='rgba(255,226,140,.95)';c.beginPath();c.arc(238,30,13,0,7);c.fill();c.fillStyle='rgba(255,226,140,.18)';c.beginPath();c.arc(238,30,22+2*Math.sin(T*2),0,7);c.fill();
    c.fillStyle='rgba(255,255,255,.75)';for(let k=0;k<3;k++){const x=((k*110+T*8)%380)-40,y=18+k*11;c.beginPath();c.ellipse(x,y,18,6,0,0,7);c.ellipse(x+12,y-4,12,6,0,0,7);c.fill()}}
  else{c.fillStyle='rgba(20,30,40,.55)';for(let k=0;k<4;k++){const x=((k*90+T*(6+lv.wind*6))%400)-50;c.beginPath();c.ellipse(x,14+k*6,40,11,0,0,7);c.ellipse(x+26,10+k*6,26,10,0,0,7);c.fill()}}
  c.fillStyle='rgba(43,66,83,.8)';c.beginPath();c.moveTo(0,G-28);[[40,G-52],[75,G-34],[120,G-66],[165,G-38],[210,G-58],[260,G-30],[300,G-46],[300,G],[0,G]].forEach(p=>c.lineTo(...p));c.fill();
  if(lv.snow){c.fillStyle='#F2F7FF';[[107,120,133,58,66],[200,210,220,52,58],[33,40,47,47,52]].forEach(([a,b,d,y1,y2])=>{c.beginPath();c.moveTo(a,G-y1);c.lineTo(b,G-y2);c.lineTo(d,G-y1);c.fill()})}
  [[18,34,26],[50,26,36],[82,30,22],[118,40,30],[160,28,26],[194,22,34]].forEach(([x,w,h],i)=>{c.fillStyle='#3A5466';c.fillRect(x,G-h,w,h);c.fillStyle='#4A6476';c.beginPath();c.moveTo(x-2,G-h);c.lineTo(x+w/2,G-h-9);c.lineTo(x+w+2,G-h);c.fill();
    c.fillStyle='rgba(246,210,122,.8)';for(let k=0;k<2;k++)c.fillRect(x+5+k*(w/2-2),G-h+8,5,6);
    if(lv.snow){c.fillStyle='#F2F7FF';c.beginPath();c.moveTo(x-2,G-h);c.lineTo(x+w/2,G-h-9);c.lineTo(x+w+2,G-h);c.lineTo(x+w,G-h+2);c.lineTo(x+w/2,G-h-6);c.lineTo(x,G-h+2);c.fill()}});
  c.fillStyle='#1E2C36';c.fillRect(0,G,300,32);c.strokeStyle='rgba(233,196,106,.5)';c.setLineDash([10,8]);c.lineWidth=1;c.beginPath();c.moveTo(0,G+12);c.lineTo(300,G+12);c.stroke();c.setLineDash([]);
  const cx=calm?((T*30)%360)-40:120;c.fillStyle='#C8553D';rr(c,cx,G+3,30,10,3);c.fill();rr(c,cx+6,G-3,17,7,2);c.fill();c.fillStyle='#0E151B';[cx+7,cx+23].forEach(x=>{c.beginPath();c.arc(x,G+14,3,0,7);c.fill()});
  const tree=(x,h,rx,ry,a,ph)=>{c.save();c.translate(x,G);const rot=(a*.3+a*.7*Math.sin(2*Math.PI*T/1.3+ph))*Math.PI/180;c.rotate(rot);c.strokeStyle='#6B4E33';c.lineWidth=3;c.beginPath();c.moveTo(0,0);c.lineTo(0,-h);c.stroke();
    c.fillStyle='#3E9E5E';c.beginPath();c.ellipse(0,-h-10,rx,ry,0,0,7);c.fill();if(lv.snow){c.fillStyle='#F2F7FF';c.beginPath();c.ellipse(0,-h-10-ry+4,rx*.75,4,0,0,7);c.fill()}c.restore()};
  tree(255,24,13,15,amp,0);tree(283,16,9,11,amp*.8,1.9);
  if(snowH){c.fillStyle='#EEF4FF';c.fillRect(0,G-snowH+2,300,snowH+40)}
  if(water){const top=G-water+10,off=-((T/1.8*40)%40);c.globalAlpha=.82;c.fillStyle='#2E7BE0';c.fillRect(0,top,300,water+40);c.fillStyle='#4C98F0';c.beginPath();c.moveTo(off,top);
    for(let x=off;x<340;x+=20){c.quadraticCurveTo(x+5,top-4,x+10,top);c.quadraticCurveTo(x+15,top+4,x+20,top)}c.lineTo(340,160);c.lineTo(off,160);c.fill();c.globalAlpha=1}
  if(lv.rain){const n=[0,26,50,90][lv.rain],sl=(lv.wind|0)*3;c.strokeStyle='rgba(169,212,255,.75)';c.lineWidth=1;c.beginPath();
    for(let k=0;k<n;k++){const x=r()*320-10,y0=r()*200,y=((y0+T*363)%200)-30;c.moveTo(x,y);c.lineTo(x-sl-2,y+9)}c.stroke()}
  if(lv.snow){const n=[0,20,40,70][lv.snow];c.fillStyle='#fff';for(let k=0;k<n;k++){const x0=r()*300,y0=r()*200,rad=1+r()*1.6;const y=((y0+T*40)%200)-30,x=x0+3*Math.sin(T*1.5+k)+(lv.wind|0)*T*4%300;c.beginPath();c.arc(((x%300)+300)%300,y,rad,0,7);c.fill()}}
  if(lv.wind>=1){const n=[0,4,8,14][lv.wind];c.strokeStyle='rgba(230,244,255,.6)';c.lineWidth=1.2;c.beginPath();for(let k=0;k<n;k++){const y=20+r()*90,len=18+r()*22,ph=r();const x=(((T+ph)%1)*400)-60;c.moveTo(x,y);c.lineTo(x+len,y)}c.stroke()}
  if(lv.ltg){const u=(T%3.4)/3.4;const o=u<.9?0:u<.92?(u-.9)/.02*.9:u<.94?.9-(u-.92)/.02*.7:u<.96?.2+(u-.94)/.02*.55:.75*(1-(u-.96)/.04);
    if(o>0){c.globalAlpha=o;c.fillStyle='#F4FAFF';c.fillRect(0,0,300,150);c.fillStyle='#FFF7C2';c.beginPath();[[190,8],[176,40],[186,40],[172,74],[200,32],[189,32],[198,8]].forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.fill();c.globalAlpha=1}}
  if(lv.dust){c.fillStyle=`rgba(185,141,87,${[0,.18,.32,.46][lv.dust]})`;c.fillRect(0,0,300,150);c.fillStyle='rgba(201,163,106,.25)';for(let k=0;k<6;k++){const x=((k*70+T*30*(1+lv.dust))%420)-60;c.beginPath();c.ellipse(x,60+k*12,50,10,0,0,7);c.fill()}}}

/* ---------- نقشه‌ی کوچک ایران ---------- */
let PATHS=null;
function miniMap(c,x,y,w,h,P,T,big){if(typeof GEO==='undefined')return;if(!PATHS)PATHS=GEO.provs.map(p=>({id:p.id,p:new Path2D(p.d)}));
  const B={x:500,y:215,w:730,h:670};const s=Math.min(w/B.w,h/B.h);const ox=x+(w-B.w*s)/2-B.x*s,oy=y+(h-B.h*s)/2-B.y*s;
  c.save();c.translate(ox,oy);c.scale(s,s);PATHS.forEach(q=>{const l=P.provLevels[q.id]|0;c.fillStyle=PROVF[l];c.fill(q.p);c.lineWidth=.9/s;c.strokeStyle=q.id===P.pid?AMBER:'#2A5268';c.stroke(q.p)});
  if(P.pid){const q=PATHS.find(z=>z.id===P.pid);if(q){c.lineWidth=2.4/s;c.strokeStyle=AMBER;c.stroke(q.p)}}
  if(P.xy&&P.xy[0]){const [px,py]=P.xy;const col=LVCOL[P.level];for(let k=0;k<2;k++){const u=((T*.8+k*.5)%1);c.strokeStyle=col;c.globalAlpha=1-u;c.lineWidth=2.5/s;c.beginPath();c.arc(px,py,(6+u*(big?34:26))/s*(big?1.2:1),0,7);c.stroke()}
    c.globalAlpha=1;c.fillStyle=col;c.beginPath();c.arc(px,py,(big?8:6)/s,0,7);c.fill();c.strokeStyle=BG;c.lineWidth=2/s;c.stroke()}
  c.restore()}

/* ---------- کارت شهر ---------- */
function draw(c,P,T,fmt='post'){const [W,H]=SIZES[fmt];const pad=56,story=fmt==='story';c.save();c.setTransform(1,0,0,1,0,0);
  c.fillStyle=BG;c.fillRect(0,0,W,H);c.strokeStyle='rgba(110,170,200,.06)';c.lineWidth=1;for(let x=0;x<W;x+=54){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=0;y<H;y+=54){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  const col=LVCOL[P.level];const glow=c.createRadialGradient(W*.8,0,0,W*.8,0,W);glow.addColorStop(0,col+'33');glow.addColorStop(1,'transparent');c.fillStyle=glow;c.fillRect(0,0,W,H);
  let y=story?150:96;
  // سربرگ
  c.fillStyle=INK;font(c,46,800);rtl(c,'رادار',W-pad,y);const bw=c.measureText('رادار').width;c.fillStyle=DIM;font(c,28,500);rtl(c,'· هشدار هواشناسی',W-pad-bw-14,y);
  font(c,24,500);c.fillStyle=DIM;ltr(c,P.stamp,pad,y);
  if(P.test){const sx=pad+c.measureText(P.stamp).width+18;font(c,22,700);const tw=c.measureText('آزمایشی').width+28;c.fillStyle=AMBER;rr(c,sx,y-30,tw,40,20);c.fill();c.fillStyle='#1A1205';rtl(c,'آزمایشی',sx+tw-14,y-2)}
  y+=story?140:118;
  // شهر و سطح
  c.fillStyle=INK;font(c,story?112:96,800);rtl(c,P.city,W-pad,y);
  font(c,30,500);c.fillStyle=DIM;rtl(c,(P.prov?'استان '+P.prov+' · ':'')+(P.level?P.domTxt:'بدون هشدار'),W-pad,y+56);
  const bx=pad,by=y-92,bW=290,bH=118;const pulse=P.level>=2?.55+.45*Math.sin(T*Math.PI*2/1.4):1;
  c.save();c.shadowColor=col;c.shadowBlur=30*pulse;c.fillStyle=col;rr(c,bx,by,bW,bH,26);c.fill();c.restore();
  c.fillStyle='#10161C';font(c,24,600);rtl(c,'سطح خطر',bx+bW-26,by+40);font(c,54,800);rtl(c,LVLN[P.level],bx+bW-26,by+98);
  if(P.dom&&P.level)icon(c,P.dom,bx+22,by+30,52,'#10161C');
  y+=story?110:96;
  // صحنه
  const sw=W-2*pad,sh=Math.round(sw*(story?.62:.4));c.save();rr(c,pad,y,sw,sh,28);c.clip();c.save();c.translate(pad,y);c.scale(sw/300,sh/150);scene(c,P.scene,T,(P.city.length*97+7)|0);c.restore();
  const gr=c.createLinearGradient(0,y+sh-120,0,y+sh);gr.addColorStop(0,'rgba(5,8,13,0)');gr.addColorStop(1,'rgba(5,8,13,.85)');c.fillStyle=gr;c.fillRect(pad,y+sh-120,sw,120);
  c.fillStyle=INK;font(c,30,600);rtl(c,P.caption,W-pad-28,y+sh-30);
  font(c,20,600);c.fillStyle='rgba(5,8,13,.6)';rr(c,pad+20,y+20,92,36,18);c.fill();c.fillStyle=DIM;rtl(c,'نمادین',pad+98,y+45);
  const mw=story?250:210,mh=story?230:190;c.fillStyle='rgba(5,8,13,.66)';rr(c,pad+20,y+66,mw,mh,18);c.fill();miniMap(c,pad+26,y+70,mw-12,mh-8,P,T,false);
  c.restore();c.strokeStyle=LINE;c.lineWidth=2;rr(c,pad,y,sw,sh,28);c.stroke();
  y+=sh+(story?90:56);
  // میزان خطر
  font(c,28,700);c.fillStyle=INK;rtl(c,'میزان خطر',W-pad,y);font(c,24,500);c.fillStyle=DIM;rtl(c,P.level?(P.firstAt&&P.now<P.level?`اوج از ${P.firstAt}`:'در ۱۲ ساعت آینده'):'۷۲ ساعت آینده',W-pad-150,y);
  y+=44;const segW=(sw-3*12)/4,app=easeOut(T/1.2);
  for(let i=0;i<4;i++){const sx=W-pad-(i+1)*segW-i*12;const on=i<=P.level;const cur=i===P.level;
    c.save();if(cur){c.shadowColor=LVCOL[i];c.shadowBlur=26*(.6+.4*Math.sin(T*4.5))}c.globalAlpha=on?(i<=Math.round(app*P.level)?1:.35):.18;c.fillStyle=LVCOL[i];rr(c,sx,y,segW,44,12);c.fill();c.restore();
    font(c,26,cur?800:500);c.fillStyle=cur?INK:DIM;rtl(c,LVLN[i],sx+segW-16,y+84)}
  {const i=P.level;const sx=W-pad-(i+1)*segW-i*12+segW/2;const px=lerp(W-pad-segW/2,sx,app);c.fillStyle=INK;c.beginPath();c.moveTo(px,y-6);c.lineTo(px-13,y-26);c.lineTo(px+13,y-26);c.fill()}
  y+=story?150:110;
  // چه کنم؟
  const bh=story?560:H-y-150;const by0=y;c.fillStyle=PANEL;rr(c,pad,y,sw,bh,26);c.fill();c.strokeStyle=P.level?col+'AA':LINE;c.lineWidth=2.5;rr(c,pad,y,sw,bh,26);c.stroke();
  let ty=y+58;font(c,32,800);c.fillStyle=AMBER;rtl(c,'چه کنم؟',W-pad-32,ty);ty+=56;
  font(c,story?42:38,800);c.fillStyle=INK;ty=wrap(c,P.verdict.v1,W-pad-32,ty,sw-64,story?56:50,2);
  font(c,story?30:27,500);c.fillStyle='#C9DCE6';
  const lines=[];if(P.verdict.v2)lines.push(['',P.verdict.v2]);P.acts.slice(0,story?4:2).forEach(a=>lines.push([a.k,a.t]));if(P.verdict.mnt&&story)lines.push(['','⛰ '+P.verdict.mnt]);if(P.nowTxt)lines.push(['',P.nowTxt]);
  for(const [k,t] of lines){if(ty>by0+bh-70)break;ty+=6;if(k)icon(c,k,W-pad-62,ty-24,26,LVCOL[Math.max(1,P.level)]);ty=wrap(c,t,W-pad-(k?76:32),ty,sw-(k?108:64),story?42:38,2)}
  y+=bh+(story?64:44);
  // کی؟ و پاورقی
  font(c,26,600);c.fillStyle=INK;if(P.eta)rtl(c,'کی می‌رسد؟ '+P.eta,W-pad,y);
  if(story){y+=40;const mh2=360;c.fillStyle=PANEL;rr(c,pad,y,sw,mh2,26);c.fill();miniMap(c,pad+20,y+16,sw-40,mh2-32,P,T,true);y+=mh2+60}
  const fy=H-(story?120:66);font(c,20,500);c.fillStyle=DIM;rtl(c,`پیش‌بینی مدل${P.model?' ('+P.model+')':''}، نه هشدار رسمی · هشدار رسمی را از سازمان هواشناسی بگیر.`,W-pad,fy);
  if(P.link){font(c,19,500,M);c.fillStyle='#5FC4E8';ltr(c,decodeURI(P.link).replace(/^https?:\/\//,''),W-pad,fy+34,'right')}
  c.restore()}

/* ---------- کارت وضعیت کشور (گزارش صبحگاهی) ---------- */
function drawIran(c,P,T,fmt='post'){const [W,H]=SIZES[fmt];const pad=56;c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=BG;c.fillRect(0,0,W,H);
  let y=96;c.fillStyle=INK;font(c,46,800);rtl(c,'رادار · وضعیت ایران',W-pad,y);font(c,24,500);c.fillStyle=DIM;ltr(c,P.stamp,pad,y);
  y+=40;const mh=fmt==='story'?900:640;c.fillStyle=PANEL;rr(c,pad,y,W-2*pad,mh,26);c.fill();miniMap(c,pad+16,y+16,W-2*pad-32,mh-32,{...P,xy:null,pid:null,level:0},T,true);
  y+=mh+70;font(c,30,800);c.fillStyle=INK;rtl(c,P.top.length?'شهرهای در خطر، ۲۴ ساعت آینده':'هیچ شهری در خطر نیست.',W-pad,y);y+=24;
  P.top.slice(0,fmt==='story'?10:6).forEach((t,i)=>{const yy=y+i*62;c.fillStyle=LVCOL[t.l];rr(c,W-pad-20,yy+14,20,20,5);c.fill();font(c,30,700);c.fillStyle=INK;rtl(c,t.n,W-pad-40,yy+36);
    font(c,26,500);c.fillStyle=DIM;rtl(c,`${LVLN[t.l]} · ${HZN[t.k]||''}`,W-pad-300,yy+36);if(t.k)icon(c,t.k,pad,yy+12,28,LVCOL[t.l])});
  font(c,20,500);c.fillStyle=DIM;rtl(c,'پیش‌بینی مدل، نه هشدار رسمی · سازمان هواشناسی',W-pad,H-54);if(P.link){font(c,20,500,M);c.fillStyle='#5FC4E8';ltr(c,P.link.replace(/^https?:\/\//,''),pad,H-54)}
  c.restore()}

async function fontsReady(){if(!document.fonts)return;try{await Promise.all(['400','500','600','700','800'].map(w=>document.fonts.load(`${w} 40px Vazirmatn`,'آب')).concat([document.fonts.load('500 20px "JetBrains Mono"','0')]));await document.fonts.ready}catch(e){}}

// ضبط ویدیو در مرورگر؛ MP4 اگر مرورگر بلد باشد (کروم جدید و سافاری)، وگرنه WebM
async function record(canvas,drawFrame,seconds=8,fps=30){const types=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'];const type=types.find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'';
  const stream=canvas.captureStream(fps);const rec=new MediaRecorder(stream,type?{mimeType:type,videoBitsPerSecond:6e6}:{});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  const done=new Promise(res=>rec.onstop=res);rec.start(250);const t0=performance.now();
  await new Promise(res=>{const step=now=>{const T=(now-t0)/1000;drawFrame(T);if(T<seconds)requestAnimationFrame(step);else res()};requestAnimationFrame(step)});
  rec.stop();await done;const mt=(rec.mimeType||type||'video/webm').split(';')[0];return new Blob(chunks,{type:mt})}

async function share(blob,name,text){const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],text});return'shared'}catch(e){if(e.name==='AbortError')return'cancel'}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);return'download'}

return{draw,drawIran,SIZES,fontsReady,record,share}})();
