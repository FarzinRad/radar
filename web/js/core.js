/* رادار — هسته‌ی مشترک داشبورد و کارت هشدار: متن‌ها، اقدام‌ها، و خواندن داده‌ی زنده.
   سطح خطرها در پایپلاین پایتون حساب می‌شوند (pipeline/radar/hazards.py)؛ اینجا فقط خوانده می‌شوند. */
const FA='۰۱۲۳۴۵۶۷۸۹';
const fa=v=>String(v).replace(/\d/g,d=>FA[d]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
const LVLN=['عادی','زرد','نارنجی','قرمز'];
const LVCOL=['#3BD16F','#F4E04D','#FFA33A','#FF4D5E'];
const HZK=['rain','snow','wind','ltg','dust'];
const HZN={rain:'باران سنگین',snow:'برف',wind:'باد شدید',ltg:'رعدوبرق و تگرگ',dust:'گردوغبار'};
const comp=(v,th)=>v>=th[2]?3:v>=th[1]?2:v>=th[0]?1:0;
function windowOf(arr,minL){let s=-1,e=-1;for(let h=0;h<arr.length;h++){if(arr[h]>=minL){if(s<0)s=h;e=h}}return s<0?null:{s,e}}
const DAYS={'-1':'دیروز','0':'امروز','1':'فردا','2':'پس‌فردا','3':'سه روز بعد','4':'چهار روز بعد'};

const ACT={
 rain:{1:['چتر و کفش مناسب؛ آرام‌تر رانندگی کن، جاده لغزنده است.'],2:['از زیرگذرها، مسیل‌ها و کنار رودخانه دور بمان.','خودرو را در مسیل یا کنار رود پارک نکن.'],3:['در بازه‌ی هشدار بیرون نرو، مگر ضروری.','هرگز از آب روان رد نشو: حدود ۱۵ سانتی‌متر آب روان آدم را می‌اندازد و حدود ۳۰ سانتی‌متر خودروی سواری را می‌برد.','اگر در دره یا کنار رود هستی، همین حالا به زمین بلند برو.']},
 snow:{1:['برای سفر جاده‌ای زنجیر چرخ همراه داشته باش.'],2:['از گردنه‌ها و جاده‌های کوهستانی صرف‌نظر کن.','باک را پر نگه دار؛ لباس گرم، آب و خوراکی در خودرو بگذار.'],3:['سفر جاده‌ای نه؛ بسته‌شدن گردنه‌ها محتمل است.','اگر در برف گیر افتادی در خودرو بمان، اگزوز را از برف باز نگه دار و موتور را هر ساعت فقط حدود ۱۰ دقیقه روشن کن.']},
 wind:{1:['اشیای سبک بالکن و پشت‌بام را جمع کن.'],2:['زیر درخت، تابلو و داربست نایست.','موتورسیکلت و دوچرخه سوار نشو.'],3:['در بازه‌ی هشدار بیرون نرو؛ افتادن درخت و تابلو محتمل است.','از پنجره‌ها فاصله بگیر.']},
 ltg:{1:['به آسمان نگاه کن؛ با اولین صدای رعد به ساختمان برو.'],2:['قاعده‌ی ۳۰-۳۰: اگر فاصله‌ی برق تا صدای رعد کمتر از ۳۰ ثانیه است، به ساختمان یا خودروی سقف‌دار برو و تا ۳۰ دقیقه بعد از آخرین رعد بیرون نیا.','زیر درخت تنها، روی قله یا در فضای باز نایست.']},
 dust:{1:['بیماران قلبی و تنفسی، سالمندان و کودکان فعالیت بیرون را کم کنند.'],2:['پنجره‌ها را ببند و بیرون ماسک N95 بزن.'],3:['بیرون نرو؛ دید بسیار کم است و رانندگی خطرناک.']}};
const ICON={rain:'M5 1C5 1 1.5 5.2 1.5 7.2a3.5 3.5 0 0 0 7 0C8.5 5.2 5 1 5 1Z',snow:'M5 .8v8.4M1.4 2.9l7.2 4.2M1.4 7.1l7.2-4.2',wind:'M.8 3.4h5.6a1.6 1.6 0 1 0-1.6-1.6M.8 6.2h7.4a1.6 1.6 0 1 1-1.6 1.6',ltg:'M5.8.6 2 5.6h2.6L3.6 9.4 8 4.2H5.3Z',dust:'M1 3h6M2.5 5.2h6.5M1 7.4h5'};
const icoSVG=(k,col,sz=14)=>`<svg width="${sz}" height="${sz}" viewBox="0 0 10 10" style="vertical-align:-2px;margin-left:4px"><path d="${ICON[k]}" fill="${k==='rain'||k==='ltg'?col:'none'}" stroke="${col}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LCOL=['var(--dim)','#E0C33A','#FF8F1F','#FF4D5E'];
const UNIT={rain:'میلی‌متر در ۲۴ ساعت',snow:'سانتی‌متر برف در ۲۴ ساعت',wind:'کیلومتر بر ساعت تندباد',dust:'میکروگرم PM10 در متر مکعب'};
const TYPEN={rain:'باران',snow:'برف',mix:'برف و باران'};
const MEANING={rain:['ناچیز تا معمولی','خیس‌شدن معابر؛ رانندگی با احتیاط','آب‌گرفتگی معابر و زیرگذرها، پرشدن مسیل‌ها','سیلاب ناگهانی در مسیل‌ها و معابر پست؛ خطر جانی'],
 snow:['ناچیز','لغزندگی معابر','اختلال در رفت‌وآمد، زنجیر چرخ لازم','بسته‌شدن گردنه‌ها و راه‌ها'],
 wind:['عادی','راه‌رفتن خلاف باد سخت، تکان شدید درخت‌ها','شکستن شاخه‌ها، کنده‌شدن تابلو و ورق','افتادن درخت و آسیب به سازه‌های سبک'],
 dust:['عادی','آزار برای گروه‌های حساس','ناسالم برای همه، دید کم','بسیار ناسالم، دید خیلی کم']};
function sceneCaption(lv){const a=[];if(lv.rain)a.push(['','آب‌گرفتگی جزئی معابر','آب‌گرفتگی معابر و پرشدن مسیل‌ها','سیلاب در معابر پست و مسیل‌ها'][lv.rain]);
  if(lv.snow)a.push(['','لایه‌ی نازک برف','برف روی زمین و لغزندگی راه‌ها','برف سنگین و بسته‌شدن راه‌ها'][lv.snow]);
  if(lv.wind)a.push(['','باد قوی','شکستن شاخه‌ها','افتادن درخت و تابلو'][lv.wind]);if(lv.ltg)a.push('صاعقه و احتمال تگرگ');if(lv.dust)a.push(['','هوای غبارآلود','دید کم','دید بسیار کم'][lv.dust]);
  return a.length?a.join('، '):'هوای آرام'}
function peak12(H){const o={};for(const k of HZK)o[k]=Math.max(...H.L[k].slice(0,12));return o}
function hzValue(H,k){return k==='rain'?H.r24:k==='snow'?H.s24:k==='wind'?H.gmax:k==='dust'?Math.max(...H.wx.slice(0,72).map(w=>w.dust)):0}
function hzThr(th,k){return k==='rain'?th.r24:k==='snow'?th.s24:k==='wind'?th.g:th.d}
function firstHz(H){let best=null;for(const k of HZK){const m=Math.max(...H.L[k]);if(m<1)continue;const s=H.L[k].indexOf(m);if(!best||m>best.l||(m===best.l&&s<best.s))best={k,l:m,s}}return best}

/* حکم «چه کنم»: یک جمله‌ی درشت با ساعت، و هشدار کوه. at(h) ساعت h نسبت به شروع H را متن می‌کند. */
function verdictOf(H,at,provEnd){const win=windowOf(H.L.all,2);let v1,v2='';
  if(win){v1=win.s===0?`تا ${at(win.e+1)} بیرون نرو، مگر ضروری.`:`از ${at(win.s)} تا ${at(win.e+1)} بیرون نرو، مگر ضروری.`;if(win.s>0)v2=`اگر بیرون می‌روی، تا ${at(Math.max(0,win.s-1))} برگرد.`}
  else if(H.max72===1)v1='بیرون رفتن مشکلی ندارد؛ با احتیاط.';else v1='تا ۷۲ ساعت آینده هشداری نیست.';
  const mnt=provEnd>=0?`کوه نرو تا ${at(Math.min(95,provEnd+12))}؛ مسیل‌ها بعد از باران هم پرآب می‌مانند.`:'';
  return {v1,v2,mnt,win}}
function actionsOf(H){const a=[];HZK.forEach(k=>{const ml=Math.max(...H.L[k]);if(!ml)return;(ACT[k][ml]||ACT[k][2]||[]).forEach(t=>a.push({k,l:ml,t}))});
  return a.sort((x,y)=>y.l-x.l)}

/* ---------- داده‌ی زنده (web/data/latest.json) ---------- */
const LV={d:null,byN:{},init(d){this.d=d;this.t0=new Date(d.t0);this.i0=d.now;this.n=d.hours;this.byN={};
    d.cities.forEach(c=>{this.byN[c.n]=c;c._L={};for(const m in c.s){c._L[m]={};for(const k in c.s[m].L)c._L[m][k]=Array.from(c.s[m].L[k],Number)}});
    this.minT=-d.now;this.maxT=Math.min(72,d.hours-1-d.now-1)},
  ageH(){return (Date.now()-new Date(this.d.generated).getTime())/36e5},
  // ساعت t نسبت به اکنونِ داده، به وقت تهران
  clock(t){const ms=this.t0.getTime()+t*36e5+210*6e4;const dt=new Date(ms);const today=new Date(Date.now()+210*6e4);
    const dayN=Math.round((Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate())-Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()))/864e5);
    const hm=String(dt.getUTCHours()).padStart(2,'0')+':'+String(dt.getUTCMinutes()).padStart(2,'0');return{day:DAYS[dayN]??'',hm:fa(hm),d:dayN}},
  modelOf(c,mid){return c.s[mid]?mid:'mix'},
  // شیء HZ هم‌شکل دمو، از ساعت t (نسبت به اکنون) به بعد
  cityHZ(c,mid,t){mid=this.modelOf(c,mid);const s=c.s[mid],Ls=c._L[mid];const i=this.i0+Math.round(t);const N=this.n;
    const at_=(arr,h)=>arr[clamp(h,0,N-1)];
    const wx=[];for(let h=0;h<96;h++){const k=i+h;const pr=at_(s.pr,k),sn=at_(s.sn,k),sw=sn*.7;
      const type=pr>.05?(sw>pr*.6?'snow':sw>pr*.2?'mix':'rain'):null;
      wx.push({T:at_(s.T,k),rh:at_(s.rh,k),wind:at_(s.w,k),gust:at_(s.g,k),pr,sn,type,dust:at_(c.dust,k)??0,ltg:at_(Ls.ltg,k)>=2})}
    const L={};for(const k of [...HZK,'all']){L[k]=[];for(let h=0;h<72;h++){const k2=i+h;L[k].push(k2<N?Ls[k][k2]:0)}}
    let r24=0,s24=0,r24at=0,s24at=0;for(let h=0;h<72;h++){let r=0,sn=0;for(let q=h;q<h+24;q++){const w=wx[q];if(!w)continue;sn+=w.sn;r+=Math.max(0,w.pr-w.sn*.7)}if(r>r24){r24=r;r24at=h}if(sn>s24){s24=sn;s24at=h}}
    const now=Math.max(...L.all.slice(0,12));let dom=null,dl=0;for(const k of HZK){const m=Math.max(...L[k].slice(0,12));if(m>dl){dl=m;dom=k}}
    const th={...c.thr};
    return{wx,L,th,now,dom,r24,s24,r24at,s24at,max72:Math.max(...L.all),gmax:Math.max(...wx.slice(0,72).map(w=>w.gust)),prmax:Math.max(...wx.slice(0,72).map(w=>w.pr)),model:mid}},
  // ETA روی اعضای اجماع (هر مدل یک عضو)؛ ساعت‌ها نسبت به اکنون
  eta(c,t,mid){const i=this.i0+Math.round(t);const mem=Object.keys(c._L).filter(m=>m!=='mix'&&(mid==='mix'||m===mid)).map(m=>c._L[m].all);
    if(!mem.length)return{none:true,p:0};const nowc=mem.filter(L=>L[i]>=2).length;if(nowc/mem.length>=.5)return{now:true,lv:Math.max(...mem.map(L=>L[i]))};
    const hits=[];for(const L of mem){for(let h=i;h<Math.min(L.length,i+73);h++){if(L[h]>=2){hits.push(h-this.i0);break}}}
    const p=hits.length/mem.length;if(p<.2)return{none:true,p};hits.sort((a,b)=>a-b);const q=f=>hits[Math.min(hits.length-1,Math.floor(f*(hits.length-1)))];
    return{p,a:q(.15),b:q(.85),med:q(.5),n:mem.length}},
  gridStep(t){const g=this.d.grid;if(!g)return null;const tt=clamp(t,g.t[0],g.t[g.t.length-1]);let k=0;while(k<g.t.length-2&&g.t[k+1]<=tt)k++;return{k,u:clamp((tt-g.t[k])/((g.t[k+1]-g.t[k])||1),0,1)}},
  gridVal(f,t,lon,lat){const g=this.d.grid;if(!g)return 0;const st=this.gridStep(t);const x=(lon-g.lon0)/g.d,y=(lat-g.lat0)/g.d;if(x<0||y<0||x>g.nx-1||y>g.ny-1)return 0;
    const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j;const i1=Math.min(i+1,g.nx-1),j1=Math.min(j+1,g.ny-1);
    const v=k=>{const a=g[f][k];return (a[j*g.nx+i]*(1-fx)+a[j*g.nx+i1]*fx)*(1-fy)+(a[j1*g.nx+i]*(1-fx)+a[j1*g.nx+i1]*fx)*fy};
    const k1=Math.min(st.k+1,g.t.length-1);return v(st.k)*(1-st.u)+v(k1)*st.u}};

/* ---------- محتوای کارت هشدار ---------- */
// H: شیء HZ شهر از اکنون؛ ctx: {at, provEnd, provLevels, model, stamp, eta, link, test}
function cardPayload(c,H,ctx){const lv=peak12(H);const level=H.max72;const dom=H.dom||(firstHz(H)||{}).k||null;
  const chips=HZK.filter(k=>Math.max(...H.L[k])>=1).map(k=>{const m=Math.max(...H.L[k]);const v=hzValue(H,k);
    const txt=k==='rain'?`${fa(Math.round(v))} میلی‌متر`:k==='snow'?`${fa(Math.round(v))} سانتی‌متر`:k==='wind'?`${fa(Math.round(v))} km/h`:k==='dust'?`PM10 ${fa(Math.round(v))}`:'';return{k,l:m,txt}}).sort((a,b)=>b.l-a.l);
  const vd=verdictOf(H,ctx.at,ctx.provEnd??-1);const acts=actionsOf(H);
  const domTxt=dom?HZN[dom]:'هوای آرام';const first=firstHz(H);
  // اگر خطر بعد از ۱۲ ساعت آینده است، صحنه اوجِ همان خطر را نشان می‌دهد
  const later=level>=1&&!Object.values(lv).some(Boolean)&&first;const sc={...lv,...(later?{[first.k]:first.l}:{})};
  return{city:c.n,prov:c.pfa||'',xy:[c.x,c.y],pid:c.p,level,now:H.now,dom,domTxt,chips,verdict:vd,acts,scene:sc,
    nowTxt:H.wx&&H.wx[0]?`الان: ${fa(Math.round(H.wx[0].T))}° · رطوبت ${fa(Math.round(H.wx[0].rh))}٪ · باد ${fa(Math.round(H.wx[0].wind))} تا ${fa(Math.round(H.wx[0].gust))} km/h`:'',
    caption:(later?`از ${ctx.at(first.s)}: `:'')+sceneCaption(sc),eta:ctx.eta||'',model:ctx.model||'',stamp:ctx.stamp||'',link:ctx.link||'',provLevels:ctx.provLevels||{},
    test:!!ctx.test,firstAt:first?ctx.at(first.s):''}}

function etaFmt(e,clk){if(!e)return'—';if(e.now)return'در حال وقوع';if(e.none)return'احتمالاً نمی‌رسد';
  const A=clk(e.a),B=clk(e.b);const pr=fa(Math.round(e.p*100))+'٪';
  if(e.a===e.b)return `${pr}، حدود ${A.day} ${A.hm}`;
  return A.d===B.d?`${pr}، ${A.day} ${A.hm} تا ${B.hm}`:`${pr}، ${A.day} ${A.hm} تا ${B.day} ${B.hm}`}
// همه‌ی شهرها از اکنون، با مدل mid: {HZ, provLevels, provEnd(pid)}
function liveSnapshot(mid='mix'){const HZ={},prov={},pend={};LV.d.cities.forEach(c=>{const H=LV.cityHZ(c,mid,0);HZ[c.n]=H;prov[c.p]=Math.max(prov[c.p]|0,H.now);
    const w=windowOf(H.L.all,2);if(w)pend[c.p]=Math.max(pend[c.p]??-1,w.e)});return{HZ,provLevels:prov,provEnd:pid=>pend[pid]??-1}}
function liveStamp(){const g=(new Date(LV.d.generated)-LV.t0)/36e5;const k=LV.clock(g);return `${k.day} ${k.hm} · وقت تهران`}
function cardText(P){const E=['🟢','🟡','🟠','🔴'];
  if(P.view==='iran')return `وضعیت ایران · ${P.stamp}\n`+(P.top.length?P.top.slice(0,8).map(t=>`${E[t.l]} ${t.n}: ${HZN[t.k]||''}`).join('\n'):'هیچ شهری در خطر نیست.')+`\nپیش‌بینی مدل، نه هشدار رسمی.\n${P.link}`;
  return `${E[P.level]} ${P.city} · ${P.level?P.domTxt:'بدون هشدار'} (${LVLN[P.level]})\nچه کنم: ${P.verdict.v1}\n${P.acts[0]?P.acts[0].t+'\n':''}${P.eta?'کی: '+P.eta+'\n':''}پیش‌بینی مدل، نه هشدار رسمی.\n${P.link}`}
