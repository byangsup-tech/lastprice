const RAW = /*__DATA__*/[];
const CARDS = /*__CARDS__*/[];
const CARDINDEX = /*__CARDINDEX__*/[];
let PF = /*__PORTFOLIO__*/null;
const MODE = "__MODE__";
const UPDATED = "__UPDATED__";
const GAME_ICON = {pokemon:"⚡",riftbound:"🗡️","one piece":"🏴‍☠️",sports:"🏀",
  magic:"🔮",yugioh:"🃏",lorcana:"✨",other:"🎴"};
const GAME_COLOR = {pokemon:"#3b4cca",riftbound:"#7c3aed","one piece":"#c0392b",
  sports:"#e67e22",magic:"#0e7490",yugioh:"#a16207",lorcana:"#9333ea",other:"#475569"};
const GAME_GRAD = {
  pokemon:["#1b2a6b","#0e1a3d"], riftbound:["#3b1d77","#1d0f3d"], "one piece":["#6b1f1a","#33100d"],
  sports:["#7a4310","#3d2208"], magic:["#0b4f5e","#062a33"], yugioh:["#5e470c","#2f2406"],
  lorcana:["#4d1a77","#260d3d"], other:["#2a3442","#161c26"]};
const GRADE_COLORS = ["#3ce0b6","#ffc762","#5fb0ff","#ff7ab0","#a8e05f","#ff8a76","#c08aff"];

let DATA = RAW.slice();
let ACTIVITY = [];
let CARDBYBASE = Object.fromEntries(CARDINDEX.map(c=>[c.base_key,c]));
let CARDMAP = Object.fromEntries(CARDS.map(c=>[c.key,c]));
let pfServer = PF !== null;
const hiddenGrades = new Set();
const state = {
  search:"", sort:"score", minpct:10, minusd:5, minprice:0, maxprice:Infinity,
  view:"table", tab:"ops",
  sel:{game:new Set(), grade_label:new Set(), marketplace:new Set(), grader:new Set()},
};

const $ = s => document.querySelector(s);
const money = n => "$"+Math.round(n).toLocaleString();
const titleCase = s => String(s).replace(/\b\w/g,c=>c.toUpperCase());
const mk = s => titleCase(String(s).replace(/_/g," "));
const emptyBox = (ic,msg) => `<div class="empty"><span class="big-ic">${ic}</span>${msg}</div>`;
const gameDot = g => `<i class="gdot" style="background:${GAME_COLOR[g]||'#475569'}"></i>`;
const gameTag = g => `<span class="gtag">${gameDot(g)}${titleCase(g)}</span>`;

/* ---------- thumbnails (real image or gradient placeholder) ---------- */
function thumb(o,size){
  if(o.image) return o.image;
  const [c1,c2]=GAME_GRAD[o.game]||GAME_GRAD.other;
  const ch=((o.name||"?").trim()[0]||"?").toUpperCase();
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>`+
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>`+
    `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>`+
    `<rect width='100%' height='100%' rx='${Math.round(size*0.2)}' fill='url(#g)'/>`+
    `<text x='50%' y='54%' font-size='${Math.round(size*0.44)}' fill='rgba(255,255,255,.92)' text-anchor='middle' `+
    `dominant-baseline='middle' font-family='sans-serif' font-weight='800'>${ch}</text></svg>`;
  return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
}
function artBg(game){const [c1,c2]=GAME_GRAD[game]||GAME_GRAD.other;
  return `background:radial-gradient(120% 140% at 20% 0%,${c1} 0%,${c2} 70%)`;}

/* ---------- opportunity sparkline (synthesized from 24h trend) ---------- */
function seedRand(seed){let s=2166136261>>>0;for(const c of seed)s=Math.imul(s^c.charCodeAt(0),16777619)>>>0;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function series(o,n){const r=seedRand(o.card);const end=o.market_price_usd;
  const chg=(o.trend_pct_24h||0)/100;const start=end/(1+chg||1);const p=[];
  for(let i=0;i<n;i++){const t=i/(n-1);const base=start+(end-start)*t;
    const noise=(r()-0.5)*0.05*end*(i<n-1?1:0);p.push(Math.max(1,base+noise));}
  p[n-1]=end;return p;}
function spark(o,w,h){const p=series(o,16);const mn=Math.min(...p),mx=Math.max(...p);
  const dx=w/(p.length-1);const rng=(mx-mn)||1;
  const pts=p.map((v,i)=>`${(i*dx).toFixed(1)},${(h-2-((v-mn)/rng)*(h-4)).toFixed(1)}`).join(" ");
  const col=(o.trend_pct_24h||0)>=0?"var(--green)":"var(--red)";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${col}" stroke-width="1.5" points="${pts}"/></svg>`;}

/* ---------- facets (opportunities sidebar) ---------- */
function uniqCounts(field){const m=new Map();
  for(const o of DATA){const k=o[field]||"—";m.set(k,(m.get(k)||0)+1);}
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);}
function buildFacet(field){
  const box=$("#facet-"+field);const counts=uniqCounts(field);
  if(state.sel[field].size===0){counts.forEach(([v])=>state.sel[field].add(v));}
  else{counts.forEach(([v])=>{if(![...state.sel[field]].includes(v))state.sel[field].add(v);});}
  box.innerHTML=counts.map(([v,c])=>{
    const ic=field==="game"?`<span class="ic">${gameDot(v)}</span>`:"";
    const checked=state.sel[field].has(v)?"checked":"";
    const label=field==="game"?titleCase(v):(field==="grader"||field==="grade_label"?v:mk(v));
    return `<label class="opt">${ic}<input type="checkbox" data-f="${field}" value="${v}" ${checked}>
      <span>${label}</span><span class="cnt">${c}</span></label>`;}).join("");
}
function rebuildFacets(){["game","grade_label","marketplace","grader"].forEach(buildFacet);}

/* ---------- filter + sort ---------- */
function passes(o){
  if(o.spread_pct<state.minpct)return false;
  if(o.spread_usd<state.minusd)return false;
  if(o.listing_price_usd<state.minprice||o.listing_price_usd>state.maxprice)return false;
  if(!state.sel.game.has(o.game))return false;
  if(!state.sel.grade_label.has(o.grade_label))return false;
  if(!state.sel.marketplace.has(o.marketplace))return false;
  if(!state.sel.grader.has(o.grader))return false;
  if(state.search){const q=state.search.toLowerCase();
    if(!(o.card+" "+o.game+" "+o.marketplace).toLowerCase().includes(q))return false;}
  return true;}
const SORTS={score:o=>o.score,edge_usd:o=>o.spread_usd,spread_pct:o=>o.spread_pct,
  trend:o=>o.trend_pct_24h??-999,price_desc:o=>o.listing_price_usd,
  price_asc:o=>-o.listing_price_usd,name:o=>o.card.toLowerCase()};
function filtered(){let rows=DATA.filter(passes);const key=SORTS[state.sort];
  rows.sort((a,b)=>{const x=key(a),y=key(b);
    if(typeof x==="string")return state.sort==="name"?x.localeCompare(y):y.localeCompare(x);
    return y-x;});return rows;}

function trendCell(o){if(o.trend_pct_24h==null)return '<span class="flat">—</span>';
  const t=o.trend_pct_24h,cls=t>0?"up":t<0?"down":"flat",a=t>0?"▲":t<0?"▼":"·";
  return `<span class="${cls}">${a} ${Math.abs(t)}%</span>`;}

function renderStats(rows){
  const totEdge=rows.reduce((s,o)=>s+o.spread_usd,0);
  const avgPct=rows.length?rows.reduce((s,o)=>s+o.spread_pct,0)/rows.length:0;
  const best=rows.reduce((m,o)=>Math.max(m,o.spread_pct),0);
  const cards=[["Underpriced finds",rows.length,""],["Total edge",money(totEdge),"green"],
    ["Avg discount",avgPct.toFixed(0)+"%","acc"],["Best discount",best.toFixed(0)+"%","green"],
    ["Markets",new Set(rows.map(o=>o.marketplace)).size,""],["Games",new Set(rows.map(o=>o.game)).size,""]];
  $("#stats").innerHTML=cards.map(([k,v,c])=>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join("");}

const COLS=[["","",false],["card","Card",false],["game","Game",false],["marketplace","Market",false],
  ["grade_label","Grade",false],["listing_price_usd","Ask",true],["market_price_usd","Value",true],
  ["spread_usd","Edge",true],["spread_pct","%",true],["trend_pct_24h","24h",true],
  ["spark","Trend",false],["act","",true]];
const COL_SORT={listing_price_usd:"price_desc",market_price_usd:"price_desc",
  spread_usd:"edge_usd",spread_pct:"spread_pct",trend_pct_24h:"trend",card:"name"};

function renderTable(rows){
  const head="<tr>"+COLS.map(([f,l,r])=>{
    const ar=(COL_SORT[f]===state.sort)?' <span class="ar">▼</span>':"";
    return `<th class="${r?'r':''}" data-col="${f}">${l}${ar}</th>`;}).join("")+"</tr>";
  const body=rows.map(o=>`<tr data-key="${o.key}" style="cursor:pointer">
    <td><img class="thumb" loading="lazy" src="${thumb(o,42)}" alt=""></td>
    <td><div class="cardcell"><span class="nm">${o.name}</span>
      <span class="meta">${[o.set,o.number].filter(Boolean).join(" · ")||"&nbsp;"}</span></div></td>
    <td><span class="badge">${gameTag(o.game)}</span></td>
    <td><span class="mk">${mk(o.marketplace)}</span></td>
    <td><span class="badge">${o.grade_label}</span></td>
    <td class="r" style="font-weight:650">${money(o.listing_price_usd)}</td>
    <td class="r" style="color:var(--dim)">${money(o.market_price_usd)}</td>
    <td class="r edge">+${money(o.spread_usd)}</td>
    <td class="r pct">${o.spread_pct.toFixed(0)}%</td>
    <td class="r">${trendCell(o)}</td>
    <td>${spark(o,84,26)}</td>
    <td class="r"><a class="buy" href="${o.url||'#'}" target="_blank" rel="noopener">Buy →</a></td>
  </tr>`).join("");
  $("#tablewrap").innerHTML=rows.length
    ?`<table><thead>${head}</thead><tbody>${body}</tbody></table>`
    :emptyBox("🔎","No underpriced listings match these filters.");}

function renderGrid(rows){
  $("#gridwrap").innerHTML=rows.length?rows.map(o=>`
    <div class="gcard" data-key="${o.key}" style="cursor:pointer">
      <div class="top"><img src="${thumb(o,46)}" alt="">
        <div><div class="nm">${o.name}</div>
          <div class="sub">${gameTag(o.game)} · ${o.grade_label}</div></div></div>
      <div class="big">+${money(o.spread_usd)} <span class="pct" style="font-size:13px">(${o.spread_pct.toFixed(0)}%)</span></div>
      <div>${spark(o,196,30)}</div>
      <div class="pr"><span>ask ${money(o.listing_price_usd)}</span><span>value ${money(o.market_price_usd)}</span></div>
      <div class="pr"><span>${trendCell(o)} · ${mk(o.marketplace)}</span>
        <a class="buy" href="${o.url||'#'}" target="_blank" rel="noopener">Buy →</a></div>
    </div>`).join(""):emptyBox("🔎","No underpriced listings match these filters.");}

/* ---------- activity ---------- */
const EV_META={new:["🆕","New listing"],price_down:["🔻","Price drop"],
  price_up:["🔺","Price up"],removed:["✔️","Sold / delisted"],hot:["🔥","Heating up"]};
function relTime(mins){if(mins<60)return mins+"m ago";const h=Math.floor(mins/60);
  return h<24?h+"h ago":Math.floor(h/24)+"d ago";}
function synthActivity(){
  return DATA.slice().sort((a,b)=>b.score-a.score).map((o,i)=>{
    let type=o.trend_pct_24h>=12?"hot":(i%3===1?"price_down":"new");
    return {type,card:o.card,key:o.key,game:o.game,marketplace:o.marketplace,
      price_usd:o.listing_price_usd,
      prev_price_usd:type==="price_down"?Math.round(o.listing_price_usd*1.12):null,
      spread_pct:o.spread_pct,url:o.url,_mins:4+(i*13)%240};});}
function renderActivity(){
  const synth=!ACTIVITY.length;
  $("#actnote").hidden=!synth;
  const feed=synth?synthActivity():ACTIVITY.map((e,i)=>({...e,_mins:e._mins??(2+i*5)}));
  $("#actcount").textContent=feed.length;
  $("#feed").innerHTML=feed.length?feed.map(e=>{
    const [ic,label]=EV_META[e.type]||["•","Update"];
    const px=e.prev_price_usd?`<span class="down">${money(e.price_usd)}</span> <span class="s">from ${money(e.prev_price_usd)}</span>`
      :`<span class="px">${money(e.price_usd)}</span>`;
    return `<div class="ev" data-key="${e.key||''}" style="cursor:pointer"><div class="ic">${ic}</div>
      <div class="mid"><div class="t">${label} · <a href="${e.url||'#'}" target="_blank" rel="noopener">${e.card}</a></div>
        <div class="s">${gameTag(e.game)} · ${mk(e.marketplace||"")} · ${(e.spread_pct||0).toFixed(0)}% edge</div></div>
      <div style="text-align:right">${px}<div class="when">${relTime(e._mins||3)}</div></div></div>`;}).join("")
    :emptyBox("📡","No activity yet.");}

function renderOps(){
  const rows=filtered();renderStats(rows);
  $("#count").textContent=`${rows.length} of ${DATA.length} listings`;
  const t=state.view==="table";
  $("#tablewrap").hidden=!t;$("#gridwrap").hidden=t;
  if(state.tab==="ops"){$("#pane-ops").hidden=false;$("#pane-activity").hidden=true;t?renderTable(rows):renderGrid(rows);}
  else{$("#pane-ops").hidden=true;$("#pane-activity").hidden=false;renderActivity();}
}

function initPriceRange(){
  const mx=Math.max(100,...DATA.map(o=>o.listing_price_usd));
  for(const id of ["minprice","maxprice"]){$("#"+id).max=mx;}
  $("#minprice").value=0;$("#maxprice").value=mx;
  state.minprice=0;state.maxprice=mx;
  $("#minpricev").textContent="$0";$("#maxpricev").textContent=money(mx);}

/* ---------- opportunity drawer: where to BUY and PULL ---------- */
function vsMarket(price,mkt){if(!mkt)return"";const d=(mkt-price)/mkt*100;
  const cls=d>=0?"pos":"neg";return `<span class="${cls}">${d>=0?"−":"+"}${Math.abs(d).toFixed(0)}% vs value</span>`;}
function openCard(key){
  const c=CARDMAP[key];if(!c)return;
  const mv=c.market_price, cd=c.cheapest_direct_usd, bg=c.best_gacha_cost_usd;
  const buy=c.listings.length?c.listings.map((l,i)=>`
    <div class="opt-row ${i===0?'best':''}">
      <div class="mk">${mk(l.marketplace)}${i===0?' <span class="tag">cheapest</span>':''}
        <div class="evp">${mv?vsMarket(l.price_usd,mv):''}</div></div>
      <div class="pr">${money(l.price_usd)}</div>
      <a class="buy" href="${l.url||'#'}" target="_blank" rel="noopener">Buy →</a>
    </div>`).join(''):'<div class="evp">No direct listing available right now.</div>';
  const gacha=c.gacha.length?c.gacha.map((g,i)=>{
    const cheaper=cd!=null&&g.expected_cost_usd<cd;
    return `<div class="opt-row ${i===0?'best':''}">
      <div class="mk">${g.name} <span class="tag">${mk(g.marketplace)}</span>
        <div class="evp">pull ${money(g.pull_cost_usd)} · ${(g.odds*100).toFixed(1)}% odds · ~${g.expected_pulls} pulls ·
          pack EV <span class="${g.pack_ev_usd>=0?'pos':'neg'}">${g.pack_ev_usd>=0?'+':''}${money(g.pack_ev_usd)}</span></div>
        <div class="evp">expected cost to hit: <b>${money(g.expected_cost_usd)}</b>
          ${cd!=null?`<span class="${cheaper?'pos':'neg'}">(${cheaper?'cheaper':'pricier'} than buying)</span>`:''}</div></div>
      <a class="buy" href="${g.url||'#'}" target="_blank" rel="noopener">Open pack →</a>
    </div>`;}).join(''):'<div class="evp">No gacha pool currently offers this card.</div>';
  let reco='';
  if(cd!=null&&bg!=null)reco=bg<cd
    ?`Cheapest path: pulling is cheaper in expectation (~${money(bg)}) than buying (${money(cd)}) — but gacha carries variance.`
    :`Cheapest path: buy directly for ${money(cd)} (gacha expected ~${money(bg)}).`;
  else if(cd!=null)reco=`Only available to buy — cheapest ${money(cd)}.`;
  else if(bg!=null)reco=`Only available via gacha — expected ~${money(bg)} to hit.`;
  const detailLink=c.base_key?`<a class="back" href="#/card/${encodeURIComponent(c.base_key)}" onclick="closeDrawer()">View full card page →</a>`:"";
  $("#drawerbody").innerHTML=`
    <div class="dh"><img src="${thumb(c,64)}" alt="">
      <div><div class="nm">${c.name}</div>
        <div class="sub">${gameTag(c.game)} · ${c.grade_label}${[c.set,c.number].filter(Boolean).length?' · '+[c.set,c.number].filter(Boolean).join(' · '):''}</div>
        <div class="sub">market value ${mv?money(mv):'—'}</div></div></div>
    ${reco?`<div class="reco">${reco}</div>`:''}
    <div class="sec"><h5>🛒 Buy directly (${c.listings.length})</h5>${buy}</div>
    <div class="sec"><h5>🎰 Pull via gacha (${c.gacha.length})</h5>${gacha}</div>
    <div class="sec">${detailLink}</div>`;
  $("#drawerbg").classList.add('open');$("#drawer").classList.add('open');
}
function closeDrawer(){$("#drawerbg").classList.remove('open');$("#drawer").classList.remove('open');}

/* ===================== CARDS BROWSE ===================== */
function renderCards(){
  const q=state.search.toLowerCase();
  let list=CARDINDEX.filter(c=>!q||(c.name+" "+(c.set||"")+" "+c.game+" "+(c.number||"")).toLowerCase().includes(q));
  list.sort((a,b)=>(b.best_grade_estimate_usd||0)-(a.best_grade_estimate_usd||0));
  $("#cardscount").textContent=`${list.length} cards`;
  $("#cardsgrid").innerHTML=list.length?list.map(c=>{
    const chips=c.grades.slice(0,4).map(g=>{
      const e=g.estimate?g.estimate.estimate_usd:null;
      const v=e!=null?e:g.lowest_ask_usd;
      return `<span class="chip">${g.grade_label} <b>${v!=null?money(v):'—'}</b></span>`;}).join("");
    const setline=[c.set,c.number].filter(Boolean).join(" · ");
    const hasImg=!!c.image;
    return `<a class="ccard" href="#/card/${encodeURIComponent(c.base_key)}">
      <div class="art" style="${artBg(c.game)}">
        <span class="gi">${gameDot(c.game)}</span>
        ${c.total_listings?`<span class="listings">${c.total_listings} for sale</span>`:''}
        <img class="${hasImg?'':'ph'}" loading="lazy" src="${hasImg?c.image:thumb(c,160)}" alt=""></div>
      <div class="body">
        <div class="nm">${c.name}</div>
        ${setline?`<div class="setline">${setline}</div>`:''}
        <div class="price"><span class="v">${c.best_grade_estimate_usd!=null?money(c.best_grade_estimate_usd):'—'}</span>
          <span class="l">top grade</span></div>
        <div class="chips">${chips}</div>
        <div class="metaline">${gameTag(c.game)} · ${c.total_sales} recent sales</div>
      </div></a>`;}).join("")
    :emptyBox("🃏",`No cards match “${state.search}”.`);}

/* ===================== CARD DETAIL ===================== */
function historyChart(c){
  const W=860,H=250,padL=48,padR=14,padT=14,padB=24,now=Date.now();
  const ser=[];
  c.grades.forEach((g,gi)=>{
    const pts=g.sales.map(s=>({d:(now-new Date(s.sold_at).getTime())/86400000,p:s.price_usd}))
      .filter(x=>x.d<=180&&!isNaN(x.d)).sort((a,b)=>a.d-b.d);
    if(pts.length)ser.push({label:g.grade_label,color:GRADE_COLORS[gi%GRADE_COLORS.length],pts});
  });
  if(!ser.length)return `<div class="sub" style="color:var(--dim)">No sold history to chart yet.</div>`;
  const shown=ser.filter(s=>!hiddenGrades.has(s.label));
  const allP=(shown.length?shown:ser).flatMap(s=>s.pts.map(p=>p.p));
  const minP=Math.min(...allP)*0.95,maxP=Math.max(...allP)*1.03,rng=(maxP-minP)||1,maxD=180;
  const X=d=>padL+(1-d/maxD)*(W-padL-padR);
  const Y=p=>padT+(1-(p-minP)/rng)*(H-padT-padB);
  const grid=[0,.33,.66,1].map(t=>{const y=padT+t*(H-padT-padB),val=maxP-t*rng;
    return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#161d28"/>`+
      `<text x="6" y="${y+3.5}" fill="#56617a" font-size="10.5">${money(val)}</text>`;}).join("");
  const xticks=[0,60,120,180].map(d=>`<text x="${X(d)}" y="${H-7}" fill="#56617a" font-size="10" text-anchor="middle">${d===0?'today':d+'d'}</text>`).join("");
  let defs="",areas="";
  if(shown.length){const s=shown[0];
    const poly=s.pts.map(p=>`${X(p.d).toFixed(1)},${Y(p.p).toFixed(1)}`).join(" ");
    const first=s.pts[0],last=s.pts[s.pts.length-1];
    defs=`<defs><linearGradient id="af" x1="0" y1="0" x2="0" y2="1">`+
      `<stop offset="0" stop-color="${s.color}" stop-opacity=".22"/>`+
      `<stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
    areas=`<polygon fill="url(#af)" points="${X(first.d).toFixed(1)},${H-padB} ${poly} ${X(last.d).toFixed(1)},${H-padB}"/>`;}
  const lines=shown.map(s=>{
    const poly=s.pts.map(p=>`${X(p.d).toFixed(1)},${Y(p.p).toFixed(1)}`).join(" ");
    const dots=s.pts.map(p=>`<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.p).toFixed(1)}" r="2.4" fill="${s.color}"/>`).join("");
    return `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" points="${poly}"/>${dots}`;}).join("");
  const legend=ser.map(s=>`<span class="leg ${hiddenGrades.has(s.label)?'off':''}" data-grade="${s.label}"><i style="background:${s.color}"></i>${s.label}</span>`).join("");
  return `<div class="legend">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:270px">${defs}${grid}${areas}${lines}${xticks}</svg>`;
}
function rangeBar(e){
  if(!e)return"";
  const lo=e.low_usd,hi=e.high_usd,v=e.estimate_usd;
  const span=(hi-lo)||1;
  const pct=Math.min(98,Math.max(2,(v-lo)/span*100));
  return `<div class="rangebar"><div class="fill" style="left:8%;width:84%"></div>
      <div class="mark" style="left:${(8+pct*0.84).toFixed(1)}%"></div></div>
    <div class="rangelab"><span>low ${money(lo)}</span><span>high ${money(hi)}</span></div>`;
}
function renderCardDetail(baseKey){
  const c=CARDBYBASE[baseKey];
  if(!c){$("#carddetail").innerHTML=`<a class="back" href="#/cards">← All cards</a>`+emptyBox("🃏","Card not found.");return;}
  const top=c.grades.find(g=>g.estimate)||c.grades[0];
  const topEst=top&&top.estimate?top.estimate:null;
  const ladder=c.grades.map(g=>{
    const e=g.estimate,ask=g.lowest_ask_usd;
    const delta=(e&&ask!=null)?(ask-e.estimate_usd)/e.estimate_usd*100:null;
    return `<tr>
      <td><span class="badge">${g.grade_label}</span></td>
      <td class="r" style="font-weight:700">${e?money(e.estimate_usd):'—'}${e?`<div class="sub">${e.n_sales} sales · ${e.confidence}</div>`:''}</td>
      <td class="r">${e?money(e.last_sold_price_usd):'—'}${e?`<div class="sub">${e.last_sold_days_ago}d ago</div>`:''}</td>
      <td class="r">${ask!=null?money(ask):'—'}</td>
      <td class="r">${g.listings.length}</td>
      <td class="r ${delta==null?'':(delta<0?'pos':'neg')}">${delta==null?'—':(delta>=0?'+':'')+delta.toFixed(0)+'%'}</td></tr>`;}).join("");
  const allL=[];c.grades.forEach(g=>g.listings.forEach(l=>allL.push({...l,grade:g.grade_label,est:g.estimate?g.estimate.estimate_usd:null})));
  allL.sort((a,b)=>a.price_usd-b.price_usd);
  const xmkt=allL.length?allL.map(l=>{
    const d=l.est?(l.est-l.price_usd)/l.est*100:null;
    return `<tr><td><span class="mk">${mk(l.marketplace)}</span></td><td><span class="badge">${l.grade}</span></td>
      <td class="r" style="font-weight:650">${money(l.price_usd)}</td>
      <td class="r" style="color:var(--txt2)">${l.insured_usd!=null?money(l.insured_usd):'—'}</td>
      <td class="r ${d==null?'':(d>=0?'pos':'neg')}">${d==null?'—':(d>=0?'−':'+')+Math.abs(d).toFixed(0)+'%'}</td>
      <td class="r"><a class="buy" href="${l.url||'#'}" target="_blank" rel="noopener">Buy →</a></td></tr>`;}).join("")
    :`<tr><td colspan="6" class="sub" style="padding:14px 10px">No live listings across markets.</td></tr>`;
  const allS=[];c.grades.forEach(g=>g.sales.forEach(s=>allS.push({...s,grade:g.grade_label})));
  allS.sort((a,b)=>b.sold_at.localeCompare(a.sold_at));
  const sold=allS.slice(0,40).map(s=>`<tr><td class="sub">${new Date(s.sold_at).toLocaleDateString()}</td>
    <td><span class="badge">${s.grade}</span></td><td class="r" style="font-weight:650">${money(s.price_usd)}</td>
    <td class="sub">${mk(s.source||"")}</td></tr>`).join("");
  const gradeOpts=c.grades.map(g=>`<option value="${g.grade_label}">${g.grade_label}</option>`).join("");
  const setline=[c.set,c.number].filter(Boolean).join(" · ");
  $("#carddetail").innerHTML=`
    <a class="back" href="#/cards">← All cards</a>
    <div class="dhead">
      <img src="${thumb(c,84)}" alt="">
      <div><h2>${c.name}</h2>
        <div class="sub">${gameTag(c.game)}${setline?' · '+setline:''}</div>
        <div class="sub">${c.total_listings} live listings · ${c.total_sales} recent sales</div></div>
      <div class="est">
        <div class="l">${top?top.grade_label:''} est. value${topEst?`<span class="conf ${topEst.confidence}">${topEst.confidence}</span>`:''}</div>
        <div class="v">${c.best_grade_estimate_usd!=null?money(c.best_grade_estimate_usd):'—'}</div>
        ${rangeBar(topEst)}
        <div class="addbox">
          <select id="pf-grade">${gradeOpts}</select>
          <input id="pf-qty" type="number" min="1" value="1" title="quantity">
          <input id="pf-cost" type="number" min="0" placeholder="cost ea (opt)">
          <button class="btn add" id="pf-add" data-base="${c.base_key}">+ Portfolio</button></div>
      </div></div>
    <div class="card-sec"><h5>Price history · sold sales per grade · 180 days</h5>${historyChart(c)}</div>
    <div class="grid2">
      <div class="card-sec"><h5>Grade ladder</h5>
        <table class="tbl"><thead><tr><th>Grade</th><th class="r">Est. value</th><th class="r">Last sold</th><th class="r">Lowest ask</th><th class="r">#</th><th class="r">Ask vs est</th></tr></thead><tbody>${ladder}</tbody></table>
        <div class="sub" style="padding:8px 2px;color:var(--faint);font-size:11px">Est. value = weighted median of sales within 180d.</div></div>
      <div class="card-sec"><h5>Live listings · all markets</h5>
        <table class="tbl"><thead><tr><th>Market</th><th>Grade</th><th class="r">Ask</th><th class="r">Insured</th><th class="r">vs est</th><th></th></tr></thead><tbody>${xmkt}</tbody></table>
        <div class="sub" style="padding:8px 2px;color:var(--faint);font-size:11px">Insured = each vault's declared coverage (modeled from grade value × platform policy in demo).</div></div>
    </div>
    <div class="card-sec"><h5>Recent sales</h5>
      <table class="tbl"><thead><tr><th>Date</th><th>Grade</th><th class="r">Price</th><th>Source</th></tr></thead>
      <tbody>${sold||'<tr><td colspan="4" class="sub" style="padding:14px 10px">No sales recorded.</td></tr>'}</tbody></table></div>`;
}

/* ===================== PORTFOLIO ===================== */
const PF_KEY="lastprice_portfolio_v1";
function loadLocalPF(){try{return JSON.parse(localStorage.getItem(PF_KEY))||[];}catch(e){return [];}}
function saveLocalPF(a){try{localStorage.setItem(PF_KEY,JSON.stringify(a));}catch(e){}}
function splitGrade(label){if(!label||label==="Raw")return {grader:"",grade:""};
  const m=label.match(/^([A-Za-z]+)\s*([0-9.]+)$/);return m?{grader:m[1],grade:m[2]}:{grader:"",grade:""};}
function findCard(value){const v=(value||"").toLowerCase().trim();
  return CARDINDEX.find(c=>(c.name+(c.number?" "+c.number:"")).toLowerCase()===v)
    ||CARDINDEX.find(c=>c.name.toLowerCase()===v)
    ||CARDINDEX.find(c=>(c.name+" "+(c.number||"")).toLowerCase().includes(v)&&v.length>2);}
function valueLocal(holdings){
  let total=0,cost=0;const byGame={};
  const rows=holdings.map(h=>{
    const c=CARDBYBASE[h.base_key];let unit=null,basis="none",game="other",name=h.title;
    if(c){game=c.game;name=c.name;const g=c.grades.find(x=>x.key===h.key);
      if(g){if(g.estimate){unit=g.estimate.estimate_usd;basis="comps";}
        else if(g.quote_usd!=null){unit=g.quote_usd;basis="quote";}
        else if(g.lowest_ask_usd!=null){unit=g.lowest_ask_usd;basis="ask";}}}
    const value=unit!=null?+(unit*h.qty).toFixed(2):null;
    if(value!=null){total+=value;byGame[game]=(byGame[game]||0)+value;}
    cost+=(h.cost_basis_usd||0)*h.qty;
    return {...h,name,game,unit_value_usd:unit,value_usd:value,value_basis:basis};});
  return {holdings:rows,total_value_usd:+total.toFixed(2),total_cost_usd:cost||null,
    unrealized_usd:cost?+(total-cost).toFixed(2):null,
    unrealized_pct:cost?+((total-cost)/cost*100).toFixed(1):null,
    allocation_by_game:byGame,n_holdings:rows.length};}
function currentPF(){return (pfServer&&PF)?PF:valueLocal(loadLocalPF());}

async function pfPost(body){
  if(pfServer){try{const r=await fetch("/api/portfolio",{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(r.ok){PF=await r.json();return true;}}catch(e){pfServer=false;}}
  return false;}
async function addHolding(base,gradeLabel,qty,cost){
  const c=CARDBYBASE[base];if(!c)return;
  const g=c.grades.find(x=>x.grade_label===gradeLabel);
  const sp=splitGrade(gradeLabel);
  const title=`${c.name}${c.number?' '+c.number:''}${c.set?' '+c.set:''}`.trim();
  const ok=await pfPost({action:"add",title,grader:sp.grader,grade:sp.grade,qty,cost_basis:cost});
  if(!ok){const arr=loadLocalPF();arr.push({id:Math.random().toString(36).slice(2,10),
    title:c.name,base_key:base,key:g?g.key:base+"|"+gradeLabel,grade_label:gradeLabel,
    qty:qty||1,cost_basis_usd:cost||null,added_at:new Date().toISOString()});saveLocalPF(arr);}
  renderPortfolio();}
async function removeHolding(id){
  const ok=await pfPost({action:"remove",id});
  if(!ok)saveLocalPF(loadLocalPF().filter(h=>h.id!==id));
  renderPortfolio();}

function renderPortfolio(){
  const v=currentPF();
  const alloc=Object.entries(v.allocation_by_game||{}).sort((a,b)=>b[1]-a[1]);
  const bar=alloc.length?alloc.map(([g,val])=>`<div class="seg" style="flex:${val};background:${GAME_COLOR[g]||'#475569'}" title="${titleCase(g)} ${money(val)}"></div>`).join(""):"";
  const allocLegend=alloc.length?`<div class="alloclegend">${alloc.map(([g,val])=>
    `<span><i style="background:${GAME_COLOR[g]||'#475569'}"></i>${titleCase(g)} ${money(val)}</span>`).join("")}</div>`:"";
  const rows=(v.holdings||[]).map(h=>`<tr>
    <td><div class="cardcell"><span class="nm">${h.name}</span><span class="meta">${h.grade_label}</span></div></td>
    <td class="r">${h.qty}</td>
    <td class="r">${h.unit_value_usd!=null?money(h.unit_value_usd):'—'}</td>
    <td class="r" style="font-weight:700">${h.value_usd!=null?money(h.value_usd):'—'} <span class="tag">${h.value_basis}</span></td>
    <td class="r" style="color:var(--dim)">${h.cost_basis_usd!=null?money(h.cost_basis_usd*h.qty):'—'}</td>
    <td class="r"><button class="btn rm" data-rm="${h.id}">✕</button></td></tr>`).join("");
  const up=v.unrealized_usd;
  $("#portfolio").innerHTML=`
    <div class="pf-head">
      <div class="pf-stat"><div class="k">Total value</div><div class="v green">${money(v.total_value_usd||0)}</div></div>
      <div class="pf-stat"><div class="k">Cost basis</div><div class="v">${v.total_cost_usd!=null?money(v.total_cost_usd):'—'}</div></div>
      <div class="pf-stat"><div class="k">Unrealized P/L</div><div class="v ${up==null?'':(up>=0?'green':'neg')}">${up!=null?((up>=0?'+':'')+money(up)+(v.unrealized_pct!=null?` (${v.unrealized_pct}%)`:'')):'—'}</div></div>
      <div class="pf-stat"><div class="k">Holdings</div><div class="v">${v.n_holdings||0}</div></div></div>
    ${bar?`<div class="allocbar">${bar}</div>${allocLegend}`:''}
    <div class="card-sec" style="margin-top:0"><h5>Add a card you own</h5>
      <div class="addrow">
        <input id="pf-search" list="pf-cards" placeholder="Search your cards…">
        <datalist id="pf-cards">${CARDINDEX.map(c=>`<option value="${c.name}${c.number?' '+c.number:''}">`).join("")}</datalist>
        <select id="pf-grade2"></select>
        <input id="pf-qty2" type="number" min="1" value="1">
        <input id="pf-cost2" type="number" min="0" placeholder="cost ea (opt)">
        <button class="btn add" id="pf-add2">+ Add</button></div>
      <div class="sub" id="pf-mode" style="margin-top:9px;color:var(--faint);font-size:11.5px"></div></div>
    <div class="pfwrap">
    <table class="tbl"><thead><tr><th style="padding-left:16px">Card</th><th class="r">Qty</th><th class="r">Unit est.</th><th class="r">Value</th><th class="r">Cost</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6"><div class="empty"><span class="big-ic">💼</span>No holdings yet — search a card above and add it with its grade.</div></td></tr>'}</tbody></table></div>`;
  $("#pf-mode").textContent=pfServer?"Saved on the server (.lastprice_portfolio.json).":"Saved in this browser (localStorage).";
  const sEl=$("#pf-search"),gEl=$("#pf-grade2");
  function sync(){const c=findCard(sEl.value);gEl.innerHTML=c?c.grades.map(g=>`<option value="${g.grade_label}">${g.grade_label}</option>`).join(""):"";gEl.dataset.base=c?c.base_key:"";}
  sEl.addEventListener("input",sync);sync();}

/* ===================== ROUTER ===================== */
function setPage(page){
  for(const id of ["ops","cards","card","portfolio"])$("#page-"+id).hidden=(id!==page);
  document.querySelectorAll(".nav a").forEach(a=>a.classList.toggle("active",a.dataset.nav===(page==="card"?"cards":page)));}
function route(){
  const h=location.hash.replace(/^#\/?/,"");
  if(h.startsWith("card/")){setPage("card");renderCardDetail(decodeURIComponent(h.slice(5)));}
  else if(h==="ops"){setPage("ops");renderOps();}
  else if(h==="portfolio"){setPage("portfolio");renderPortfolio();}
  else{setPage("cards");renderCards();}}

function init(){
  const mp=$("#modepill");mp.textContent="mode "+MODE;mp.classList.add(MODE);
  $("#src").textContent="· data updated "+UPDATED;
  if(MODE==="demo")$("#demobar").hidden=false;
  initPriceRange();rebuildFacets();

  $("#search").addEventListener("input",e=>{state.search=e.target.value;route();});
  $("#sort").addEventListener("change",e=>{state.sort=e.target.value;renderOps();});
  $("#minpct").addEventListener("input",e=>{state.minpct=+e.target.value;$("#minpctv").textContent=e.target.value+"%";renderOps();});
  $("#minusd").addEventListener("input",e=>{state.minusd=+e.target.value;$("#minusdv").textContent="$"+e.target.value;renderOps();});
  $("#minprice").addEventListener("input",e=>{state.minprice=+e.target.value;
    if(state.minprice>state.maxprice){state.maxprice=state.minprice;$("#maxprice").value=state.minprice;}
    $("#minpricev").textContent=money(state.minprice);$("#maxpricev").textContent=money(state.maxprice);renderOps();});
  $("#maxprice").addEventListener("input",e=>{state.maxprice=+e.target.value;
    if(state.maxprice<state.minprice){state.minprice=state.maxprice;$("#minprice").value=state.maxprice;}
    $("#minpricev").textContent=money(state.minprice);$("#maxpricev").textContent=money(state.maxprice);renderOps();});
  document.querySelectorAll(".viewtoggle button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".viewtoggle button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");state.view=b.dataset.view;renderOps();}));
  document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");state.tab=b.dataset.tab;
    $("#viewtoggle").style.visibility=state.tab==="ops"?"visible":"hidden";renderOps();}));
  $(".layout").addEventListener("change",e=>{const f=e.target.dataset.f;if(!f)return;
    if(e.target.checked)state.sel[f].add(e.target.value);else state.sel[f].delete(e.target.value);renderOps();});
  document.querySelectorAll(".facet h4 a[data-all]").forEach(a=>a.addEventListener("click",()=>{
    const f=a.dataset.all;uniqCounts(f).forEach(([v])=>state.sel[f].add(v));rebuildFacets();renderOps();}));
  $("#tablewrap").addEventListener("click",e=>{const th=e.target.closest("th[data-col]");if(!th)return;
    const s=COL_SORT[th.dataset.col];if(!s)return;state.sort=s;
    if([...$("#sort").options].some(o=>o.value===s))$("#sort").value=s;renderOps();});
  $("#refresh").addEventListener("click",refresh);
  setInterval(()=>{if($("#auto").checked)refresh();},20000);

  // opportunity drawer
  $(".content").addEventListener("click",e=>{
    if(e.target.closest("a"))return;if(e.target.closest("th[data-col]"))return;
    const el=e.target.closest("[data-key]");if(el&&el.dataset.key)openCard(el.dataset.key);});
  $("#dclose").addEventListener("click",closeDrawer);
  $("#drawerbg").addEventListener("click",closeDrawer);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer();});

  // card detail: legend toggle + add-to-portfolio
  $("#page-card").addEventListener("click",e=>{
    const leg=e.target.closest(".leg");
    if(leg){const g=leg.dataset.grade;hiddenGrades.has(g)?hiddenGrades.delete(g):hiddenGrades.add(g);
      renderCardDetail(decodeURIComponent(location.hash.replace(/^#\/?card\//,"")));return;}
    if(e.target.id==="pf-add"){const base=e.target.dataset.base;
      addHolding(base,$("#pf-grade").value,+$("#pf-qty").value||1,parseFloat($("#pf-cost").value)||null);
      location.hash="#/portfolio";}});
  // portfolio add/remove
  $("#page-portfolio").addEventListener("click",e=>{
    if(e.target.id==="pf-add2"){const gEl=$("#pf-grade2");const base=gEl.dataset.base;
      if(!base){$("#pf-search").focus();return;}
      addHolding(base,gEl.value,+$("#pf-qty2").value||1,parseFloat($("#pf-cost2").value)||null);return;}
    const rm=e.target.closest("[data-rm]");if(rm)removeHolding(rm.dataset.rm);});

  window.addEventListener("hashchange",route);
  route();
}

async function refresh(){
  try{
    const [r1,r2,r3,r4]=await Promise.all([
      fetch("/api/opportunities",{cache:"no-store"}),
      fetch("/api/activity",{cache:"no-store"}).catch(()=>null),
      fetch("/api/catalog",{cache:"no-store"}).catch(()=>null),
      pfServer?fetch("/api/portfolio",{cache:"no-store"}).catch(()=>null):Promise.resolve(null)]);
    if(r1&&r1.ok){const d=await r1.json();if(Array.isArray(d)){DATA=d;rebuildFacets();}}
    if(r2&&r2.ok){const a=await r2.json();if(Array.isArray(a))ACTIVITY=a;}
    if(r3&&r3.ok){const c=await r3.json();if(Array.isArray(c))CARDMAP=Object.fromEntries(c.map(x=>[x.key,x]));}
    if(r4&&r4.ok){PF=await r4.json();}
    route();
  }catch(e){/* static file:// — keep inlined data */}
}

init();
