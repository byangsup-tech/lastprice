"""Web dashboard for the arbitrage scanner.

Pure-stdlib HTTP server (no web framework) so the package keeps zero runtime
deps and deploys anywhere Python runs.

    python -m lastprice --serve --port 8000           # live dashboard
    python -m lastprice --export-html public/index.html  # static snapshot

The page is a single-file app: opportunities are inlined as JSON and all
filtering / sorting / faceting happens client-side (Blur-style dense UI), so
the exported HTML is fully interactive with no backend. When served, it also
polls ``/api/opportunities`` and ``/api/activity`` to refresh live.

Routes: ``GET /`` (HTML), ``GET /api/opportunities`` (JSON),
``GET /api/activity`` (JSON), ``GET /healthz``.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import List

from .activity import ActivityTracker
from .engine import ArbitrageEngine
from .models import Opportunity

_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lastprice — card arbitrage terminal</title>
<style>
  :root{
    --bg:#0a0b0f; --panel:#10131a; --panel2:#141822; --line:#1d2430;
    --txt:#e7ebf3; --dim:#8a93a6; --dim2:#5d6678; --accent:#5eead4;
    --green:#22e0a1; --red:#ff5d6c; --amber:#ffcf6b; --chip:#1a2130;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--bg);color:var(--txt);
    font:13.5px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .num{font-variant-numeric:tabular-nums}
  .topbar{display:flex;align-items:center;gap:16px;height:52px;padding:0 18px;
    border-bottom:1px solid var(--line);background:linear-gradient(180deg,#0e1118,#0a0b0f);
    position:sticky;top:0;z-index:5}
  .brand{font-weight:800;font-size:17px;letter-spacing:-.5px}
  .brand span{color:var(--accent)}
  .mode{font-size:11.5px;color:var(--dim);border:1px solid var(--line);
    border-radius:999px;padding:3px 10px;background:var(--panel)}
  .mode.live{color:var(--green);border-color:#1d3a31}
  .mode.demo{color:var(--amber);border-color:#3a3220}
  .spacer{flex:1}
  .topbar .glob{flex:0 1 320px}
  .topbar input[type=search]{width:100%;background:var(--panel);border:1px solid var(--line);
    color:var(--txt);border-radius:8px;padding:8px 11px;font-size:13px;outline:none}
  .topbar input[type=search]:focus{border-color:#2b6b5f}
  .btn{background:var(--panel2);border:1px solid var(--line);color:var(--txt);
    border-radius:8px;padding:7px 11px;font-size:12.5px;cursor:pointer}
  .btn:hover{border-color:#2b3444}
  .toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim)}
  .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--line);
    border-bottom:1px solid var(--line)}
  .stat{background:var(--bg);padding:12px 16px}
  .stat .k{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim)}
  .stat .v{font-size:19px;font-weight:700;margin-top:3px}
  .stat .v.green{color:var(--green)}
  .stat .v.acc{color:var(--accent)}
  .layout{display:grid;grid-template-columns:248px 1fr;min-height:calc(100vh - 52px)}
  .sidebar{border-right:1px solid var(--line);padding:14px 14px 40px;overflow:auto}
  .facet{margin-bottom:18px}
  .facet h4{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;
    color:var(--dim);display:flex;justify-content:space-between}
  .facet h4 a{font-size:10.5px;color:var(--dim);cursor:pointer}
  .opt{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;
    font-size:12.5px;color:#cdd4e0}
  .opt:hover{background:var(--panel)}
  .opt input{accent-color:var(--accent)}
  .opt .cnt{margin-left:auto;color:var(--dim);font-size:11px;font-variant-numeric:tabular-nums}
  .opt .ic{width:16px;text-align:center}
  .range{display:flex;flex-direction:column;gap:4px}
  .range .lab{display:flex;justify-content:space-between;color:var(--dim);font-size:11.5px}
  input[type=range]{width:100%;accent-color:var(--accent)}
  select{width:100%;background:var(--panel);border:1px solid var(--line);color:var(--txt);
    border-radius:8px;padding:7px 9px;font-size:12.5px}
  .content{display:flex;flex-direction:column;min-width:0}
  .toolbar{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line)}
  .tabs{display:flex;gap:4px}
  .tabs button{background:transparent;border:0;color:var(--dim);padding:6px 12px;cursor:pointer;
    font-size:13px;border-radius:7px}
  .tabs button.active{background:var(--panel2);color:var(--txt)}
  .tabs .pill{margin-left:6px;background:var(--chip);border-radius:999px;padding:1px 7px;font-size:11px;color:var(--accent)}
  .viewtoggle{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-left:auto}
  .viewtoggle button{background:var(--bg);border:0;color:var(--dim);padding:6px 12px;cursor:pointer;font-size:12px}
  .viewtoggle button.active{background:var(--panel2);color:var(--txt)}
  .count{color:var(--dim);font-size:12.5px}
  .tablewrap{overflow:auto}
  table{width:100%;border-collapse:collapse}
  thead th{position:sticky;top:0;background:#0c0f15;text-align:left;padding:10px 12px;
    font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);
    border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap;user-select:none}
  thead th.r{text-align:right}
  thead th .ar{color:var(--accent);font-size:10px}
  tbody td{padding:9px 12px;border-bottom:1px solid #151b25;white-space:nowrap;vertical-align:middle}
  tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
  tbody tr:hover td{background:#0e131c}
  .thumb{width:40px;height:40px;border-radius:8px;display:block;object-fit:cover;background:var(--panel2)}
  .cardcell{display:flex;flex-direction:column;gap:2px;white-space:normal;max-width:320px}
  .cardcell .nm{font-weight:600}
  .cardcell .meta{color:var(--dim);font-size:11.5px}
  .badge{display:inline-flex;align-items:center;gap:5px;background:var(--chip);
    border:1px solid var(--line);border-radius:6px;padding:2px 8px;font-size:11.5px;color:#b9c2d2}
  .mk{font-size:11.5px;color:#9fb0c9}
  .edge{color:var(--green);font-weight:700}
  .pct{color:var(--accent);font-weight:600}
  .up{color:var(--green)} .down{color:var(--red)} .flat{color:var(--dim)}
  .buy{background:#11221c;border:1px solid #1f3d33;color:var(--green);border-radius:7px;
    padding:5px 10px;font-size:12px;font-weight:600}
  .buy:hover{background:#16302770}
  .empty{padding:48px;text-align:center;color:var(--dim)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:12px;padding:16px}
  .gcard{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;
    display:flex;flex-direction:column;gap:9px}
  .gcard:hover{border-color:#2b3444}
  .gcard .top{display:flex;gap:10px;align-items:center}
  .gcard .top img{width:48px;height:48px;border-radius:9px}
  .gcard .nm{font-weight:600;line-height:1.25}
  .gcard .sub{color:var(--dim);font-size:11.5px}
  .gcard .pr{display:flex;justify-content:space-between;font-size:12.5px;color:var(--dim)}
  .gcard .big{font-size:20px;font-weight:800;color:var(--green)}
  /* activity */
  .feed{display:flex;flex-direction:column}
  .ev{display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid #151b25}
  .ev:hover{background:#0e131c}
  .ev .ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;
    background:var(--chip);font-size:15px}
  .ev .mid{flex:1;min-width:0}
  .ev .t{font-weight:600}
  .ev .s{color:var(--dim);font-size:11.5px}
  .ev .when{color:var(--dim);font-size:11.5px;white-space:nowrap}
  .ev .px{font-variant-numeric:tabular-nums;font-weight:600}
  .note{color:var(--amber);font-size:11.5px;padding:8px 16px;background:#1a160d;border-bottom:1px solid var(--line)}
  footer{padding:14px 18px;color:#4d5667;font-size:11.5px;border-top:1px solid var(--line)}
  @media(max-width:860px){.layout{grid-template-columns:1fr}.sidebar{display:none}
    .stats{grid-template-columns:repeat(3,1fr)}.topbar .glob{flex:1}}
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">last<span>price</span></div>
  <span id="modepill" class="mode">—</span>
  <div class="glob"><input id="search" type="search" placeholder="Search cards, sets, players…"></div>
  <div class="spacer"></div>
  <label class="toggle"><input id="auto" type="checkbox" checked> auto-refresh</label>
  <button id="refresh" class="btn">↻ Refresh</button>
</div>

<div class="stats" id="stats"></div>

<div class="layout">
  <aside class="sidebar">
    <div class="facet">
      <h4>Sort</h4>
      <select id="sort">
        <option value="score">Best opportunity</option>
        <option value="edge_usd">Edge ($) high→low</option>
        <option value="spread_pct">Edge (%) high→low</option>
        <option value="trend">24h trend high→low</option>
        <option value="price_desc">List price high→low</option>
        <option value="price_asc">List price low→high</option>
        <option value="name">Card A→Z</option>
      </select>
    </div>
    <div class="facet">
      <h4>Min edge</h4>
      <div class="range">
        <div class="lab"><span>percent</span><span id="minpctv">10%</span></div>
        <input id="minpct" type="range" min="0" max="50" value="10">
        <div class="lab" style="margin-top:8px"><span>dollars</span><span id="minusdv">$5</span></div>
        <input id="minusd" type="range" min="0" max="1000" step="5" value="5">
      </div>
    </div>
    <div class="facet">
      <h4>List price</h4>
      <div class="range">
        <div class="lab"><span id="minpricev">$0</span><span id="maxpricev">$0</span></div>
        <input id="minprice" type="range" min="0" max="100" value="0">
        <input id="maxprice" type="range" min="0" max="100" value="100">
      </div>
    </div>
    <div class="facet"><h4>Game <a data-all="game">all</a></h4><div id="facet-game"></div></div>
    <div class="facet"><h4>Grade <a data-all="grade_label">all</a></h4><div id="facet-grade_label"></div></div>
    <div class="facet"><h4>Marketplace <a data-all="marketplace">all</a></h4><div id="facet-marketplace"></div></div>
    <div class="facet"><h4>Grader <a data-all="grader">all</a></h4><div id="facet-grader"></div></div>
  </aside>

  <div class="content">
    <div class="toolbar">
      <div class="tabs">
        <button data-tab="ops" class="active">Opportunities</button>
        <button data-tab="activity">Activity <span class="pill" id="actcount">0</span></button>
      </div>
      <div class="viewtoggle" id="viewtoggle">
        <button data-view="table" class="active">Table</button>
        <button data-view="grid">Grid</button>
      </div>
    </div>
    <div id="pane-ops">
      <div class="toolbar" style="border-top:0;padding-top:0;border-bottom:1px solid var(--line)">
        <span class="count" id="count"></span>
      </div>
      <div class="tablewrap" id="tablewrap"></div>
      <div class="grid" id="gridwrap" hidden></div>
    </div>
    <div id="pane-activity" hidden>
      <div class="note" id="actnote" hidden>Illustrative activity synthesized from the current snapshot — the live feed streams real listing/price changes when served.</div>
      <div class="feed" id="feed"></div>
    </div>
  </div>
</div>

<footer>
  Prices are estimates; verify before buying. Not financial advice. Sparklines are
  illustrative (reconstructed from the 24h trend until a historical price feed is wired).
  <span id="src"></span>
</footer>

<script>
const RAW = /*__DATA__*/[];
const MODE = "__MODE__";
const UPDATED = "__UPDATED__";
const GAME_ICON = {pokemon:"⚡",riftbound:"🗡️","one piece":"🏴‍☠️",sports:"🏀",
  magic:"🔮",yugioh:"🃏",lorcana:"✨",other:"🎴"};
const GAME_COLOR = {pokemon:"#3b4cca",riftbound:"#7c3aed","one piece":"#c0392b",
  sports:"#e67e22",magic:"#0e7490",yugioh:"#a16207",lorcana:"#9333ea",other:"#475569"};

let DATA = RAW.slice();
let ACTIVITY = [];
const state = {
  search:"", sort:"score", minpct:10, minusd:5, minprice:0, maxprice:Infinity,
  view:"table", tab:"ops",
  sel:{game:new Set(), grade_label:new Set(), marketplace:new Set(), grader:new Set()},
};

const $ = s => document.querySelector(s);
const money = n => "$"+Math.round(n).toLocaleString();
const titleCase = s => s.replace(/\b\w/g,c=>c.toUpperCase());

/* ---------- thumbnails (real image or SVG placeholder) ---------- */
function thumb(o,size){
  if(o.image) return o.image;
  const bg=GAME_COLOR[o.game]||"#475569";
  const ch=((o.name||"?").trim()[0]||"?").toUpperCase();
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>`+
    `<rect width='100%' height='100%' rx='8' fill='${bg}'/>`+
    `<text x='50%' y='53%' font-size='${Math.round(size*0.46)}' fill='#fff' text-anchor='middle' `+
    `dominant-baseline='middle' font-family='sans-serif' font-weight='700'>${ch}</text></svg>`;
  return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
}

/* ---------- sparkline (synthesized from 24h trend, deterministic) ---------- */
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

/* ---------- facets ---------- */
function uniqCounts(field){const m=new Map();
  for(const o of DATA){const k=o[field]||"—";m.set(k,(m.get(k)||0)+1);}
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);}
function buildFacet(field){
  const box=$("#facet-"+field);const counts=uniqCounts(field);
  if(state.sel[field].size===0){counts.forEach(([v])=>state.sel[field].add(v));}
  else{counts.forEach(([v])=>{if(![...state.sel[field]].includes(v))state.sel[field].add(v);});}
  box.innerHTML=counts.map(([v,c])=>{
    const ic=field==="game"?`<span class="ic">${GAME_ICON[v]||"🎴"}</span>`:"";
    const checked=state.sel[field].has(v)?"checked":"";
    const label=field==="game"?titleCase(v):(field==="grader"||field==="grade_label"?v:titleCase(String(v).replace(/_/g," ")));
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
  const mk=new Set(rows.map(o=>o.marketplace)).size;
  const gm=new Set(rows.map(o=>o.game)).size;
  const cards=[["Opportunities",rows.length,""],["Total edge",money(totEdge),"green"],
    ["Avg edge",avgPct.toFixed(0)+"%","acc"],["Best edge",best.toFixed(0)+"%","green"],
    ["Markets",mk,""],["Games",gm,""]];
  $("#stats").innerHTML=cards.map(([k,v,c])=>
    `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join("");}

const COLS=[["","",false],["card","Card",false],["game","Game",false],["marketplace","Market",false],
  ["grade_label","Grade",false],["listing_price_usd","List",true],["market_price_usd","Value",true],
  ["spread_usd","Edge",true],["spread_pct","%",true],["trend_pct_24h","24h",true],
  ["spark","Chart",false],["act","",true]];
const COL_SORT={listing_price_usd:"price_desc",market_price_usd:"price_desc",
  spread_usd:"edge_usd",spread_pct:"spread_pct",trend_pct_24h:"trend",card:"name"};

function renderTable(rows){
  const head="<tr>"+COLS.map(([f,l,r])=>{
    const ar=(COL_SORT[f]===state.sort)?' <span class="ar">▼</span>':"";
    return `<th class="${r?'r':''}" data-col="${f}">${l}${ar}</th>`;}).join("")+"</tr>";
  const body=rows.map(o=>`<tr>
    <td><img class="thumb" src="${thumb(o,40)}" alt=""></td>
    <td><div class="cardcell"><span class="nm">${o.name}</span>
      <span class="meta">${[o.set,o.number].filter(Boolean).join(" · ")||"&nbsp;"}</span></div></td>
    <td><span class="badge">${GAME_ICON[o.game]||"🎴"} ${titleCase(o.game)}</span></td>
    <td><span class="mk">${titleCase(o.marketplace.replace(/_/g," "))}</span></td>
    <td><span class="badge">${o.grade_label}</span></td>
    <td class="r">${money(o.listing_price_usd)}</td>
    <td class="r" style="color:var(--dim)">${money(o.market_price_usd)}</td>
    <td class="r edge">+${money(o.spread_usd)}</td>
    <td class="r pct">${o.spread_pct.toFixed(0)}%</td>
    <td class="r">${trendCell(o)}</td>
    <td>${spark(o,84,26)}</td>
    <td class="r"><a class="buy" href="${o.url||'#'}" target="_blank" rel="noopener">Buy →</a></td>
  </tr>`).join("");
  $("#tablewrap").innerHTML=rows.length
    ?`<table><thead>${head}</thead><tbody>${body}</tbody></table>`
    :`<div class="empty">No opportunities match these filters.</div>`;}

function renderGrid(rows){
  $("#gridwrap").innerHTML=rows.length?rows.map(o=>`
    <div class="gcard">
      <div class="top"><img src="${thumb(o,48)}" alt="">
        <div><div class="nm">${o.name}</div>
          <div class="sub">${GAME_ICON[o.game]||"🎴"} ${titleCase(o.game)} · ${o.grade_label}</div></div></div>
      <div class="big">+${money(o.spread_usd)} <span class="pct" style="font-size:13px">(${o.spread_pct.toFixed(0)}%)</span></div>
      <div>${spark(o,196,30)}</div>
      <div class="pr"><span>list ${money(o.listing_price_usd)}</span><span>val ${money(o.market_price_usd)}</span></div>
      <div class="pr"><span>${trendCell(o)} · ${titleCase(o.marketplace.replace(/_/g," "))}</span>
        <a class="buy" href="${o.url||'#'}" target="_blank" rel="noopener">Buy →</a></div>
    </div>`).join(""):`<div class="empty">No opportunities match these filters.</div>`;}

/* ---------- activity ---------- */
const EV_META={new:["🆕","New listing"],price_down:["🔻","Price drop"],
  price_up:["🔺","Price up"],removed:["✔️","Sold / delisted"],hot:["🔥","Heating up"]};
function relTime(mins){if(mins<60)return mins+"m ago";const h=Math.floor(mins/60);
  return h<24?h+"h ago":Math.floor(h/24)+"d ago";}
function synthActivity(){
  const rows=DATA.slice().sort((a,b)=>b.score-a.score);
  return rows.map((o,i)=>{
    let type=o.trend_pct_24h>=12?"hot":(i%3===1?"price_down":"new");
    return {type,card:o.card,game:o.game,marketplace:o.marketplace,
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
    return `<div class="ev"><div class="ic">${ic}</div>
      <div class="mid"><div class="t">${label} · <a href="${e.url||'#'}" target="_blank" rel="noopener">${e.card}</a></div>
        <div class="s">${GAME_ICON[e.game]||"🎴"} ${titleCase(e.game)} · ${titleCase((e.marketplace||"").replace(/_/g," "))} · ${(e.spread_pct||0).toFixed(0)}% edge</div></div>
      <div style="text-align:right">${px}<div class="when">${relTime(e._mins||3)}</div></div></div>`;}).join("")
    :`<div class="empty">No activity yet.</div>`;}

/* ---------- render orchestration ---------- */
function render(){
  if(state.tab==="ops"){
    const rows=filtered();renderStats(rows);
    $("#count").textContent=`${rows.length} of ${DATA.length} listings`;
    const t=state.view==="table";
    $("#tablewrap").hidden=!t;$("#gridwrap").hidden=t;
    t?renderTable(rows):renderGrid(rows);
  } else { renderActivity(); }
}

function initPriceRange(){
  const prices=DATA.map(o=>o.listing_price_usd);
  const mx=Math.max(100,...prices);
  for(const id of ["minprice","maxprice"]){$("#"+id).max=mx;}
  $("#minprice").value=0;$("#maxprice").value=mx;
  state.minprice=0;state.maxprice=mx;
  $("#minpricev").textContent="$0";$("#maxpricev").textContent=money(mx);}

function init(){
  const mp=$("#modepill");mp.textContent="mode "+MODE;mp.classList.add(MODE);
  $("#src").textContent="· updated "+UPDATED;
  initPriceRange();rebuildFacets();render();

  $("#search").addEventListener("input",e=>{state.search=e.target.value;render();});
  $("#sort").addEventListener("change",e=>{state.sort=e.target.value;render();});
  $("#minpct").addEventListener("input",e=>{state.minpct=+e.target.value;$("#minpctv").textContent=e.target.value+"%";render();});
  $("#minusd").addEventListener("input",e=>{state.minusd=+e.target.value;$("#minusdv").textContent="$"+e.target.value;render();});
  $("#minprice").addEventListener("input",e=>{state.minprice=+e.target.value;
    if(state.minprice>state.maxprice){state.maxprice=state.minprice;$("#maxprice").value=state.minprice;}
    $("#minpricev").textContent=money(state.minprice);$("#maxpricev").textContent=money(state.maxprice);render();});
  $("#maxprice").addEventListener("input",e=>{state.maxprice=+e.target.value;
    if(state.maxprice<state.minprice){state.minprice=state.maxprice;$("#minprice").value=state.maxprice;}
    $("#minpricev").textContent=money(state.minprice);$("#maxpricev").textContent=money(state.maxprice);render();});
  document.querySelectorAll(".viewtoggle button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".viewtoggle button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");state.view=b.dataset.view;render();}));
  document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");state.tab=b.dataset.tab;
    $("#pane-ops").hidden=state.tab!=="ops";$("#pane-activity").hidden=state.tab!=="activity";
    $("#viewtoggle").style.visibility=state.tab==="ops"?"visible":"hidden";render();}));
  document.querySelector(".layout").addEventListener("change",e=>{
    const f=e.target.dataset.f;if(!f)return;
    if(e.target.checked)state.sel[f].add(e.target.value);else state.sel[f].delete(e.target.value);render();});
  document.querySelectorAll(".facet h4 a[data-all]").forEach(a=>a.addEventListener("click",()=>{
    const f=a.dataset.all;uniqCounts(f).forEach(([v])=>state.sel[f].add(v));rebuildFacets();render();}));
  $("#tablewrap").addEventListener("click",e=>{
    const th=e.target.closest("th[data-col]");if(!th)return;
    const s=COL_SORT[th.dataset.col];if(!s)return;state.sort=s;
    if([...$("#sort").options].some(o=>o.value===s))$("#sort").value=s;render();});
  $("#refresh").addEventListener("click",refresh);
  setInterval(()=>{if($("#auto").checked)refresh();},20000);
}

async function refresh(){
  try{
    const [r1,r2]=await Promise.all([
      fetch("/api/opportunities",{cache:"no-store"}),
      fetch("/api/activity",{cache:"no-store"}).catch(()=>null)]);
    if(r1&&r1.ok){const d=await r1.json();if(Array.isArray(d)){DATA=d;rebuildFacets();}}
    if(r2&&r2.ok){const a=await r2.json();if(Array.isArray(a))ACTIVITY=a;}
    render();
  }catch(e){/* static file:// — keep inlined data + synthesized activity */}
}

init();
</script>
</body>
</html>"""


def _payload(opps: List[Opportunity]):
    return [o.to_dict() for o in opps]


def render_html(opps: List[Opportunity], engine: ArbitrageEngine) -> str:
    data = json.dumps(_payload(opps)).replace("<", "\\u003c")
    mode = getattr(engine, "mode", "live")
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        _TEMPLATE.replace("/*__DATA__*/[]", data)
        .replace("__MODE__", mode)
        .replace("__UPDATED__", updated)
    )


class _Handler(BaseHTTPRequestHandler):
    engine: ArbitrageEngine = None  # set per-server via subclass
    tracker: ActivityTracker = None

    def _send(self, code: int, body: str, ctype: str) -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802 (stdlib naming)
        if self.path.startswith("/healthz"):
            return self._send(200, "ok", "text/plain; charset=utf-8")
        if self.path.startswith("/api/activity"):
            feed = self.tracker.feed() if self.tracker else []
            return self._send(200, json.dumps(feed, indent=2), "application/json; charset=utf-8")
        opps = self.engine.scan()
        if self.tracker:
            self.tracker.record(opps)
        if self.path.startswith("/api/opportunities"):
            return self._send(200, json.dumps(_payload(opps), indent=2),
                              "application/json; charset=utf-8")
        return self._send(200, render_html(opps, self.engine), "text/html; charset=utf-8")

    def log_message(self, *args):  # keep stdout clean
        return


def serve(engine: ArbitrageEngine, host: str = "0.0.0.0", port: int = 8000) -> None:
    handler = type("BoundHandler", (_Handler,),
                   {"engine": engine, "tracker": ActivityTracker()})
    httpd = ThreadingHTTPServer((host, port), handler)
    print(f"lastprice dashboard → http://{host}:{port}  (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


def export_html(engine: ArbitrageEngine, path: str) -> int:
    import os

    opps = engine.scan()
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(render_html(opps, engine))
    return len(opps)
