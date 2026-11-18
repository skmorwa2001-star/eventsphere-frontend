/* ===========================================================
   api.js — shared by the home page and the app
   Backend URL, tiny DOM helpers, fetch wrapper, status pill
   =========================================================== */
// Backend address: saved choice > js/config.js > local default
let API = localStorage.getItem("es_api") || window.EVENTSPHERE_API || "http://127.0.0.1:8000";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

function toast(m, bad){const t=$("#toast");t.textContent=m;t.style.color=bad?"var(--err)":"var(--ok)";t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),3200)}
// Login token saved by app.js; sent with every request so the server knows who we are
// Secret random ID for THIS browser/device (created once). Used for check-in device approval.
function deviceToken(){
  let t=localStorage.getItem("es_device");
  if(!t){t=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");localStorage.setItem("es_device",t)}
  return t;
}
const getToken = () => (JSON.parse(localStorage.getItem("es_user") || "null") || {}).token;

async function api(path, method="GET", body){
  let r;
  const headers = body ? {"Content-Type":"application/json"} : {};
  if (getToken()) { headers.Authorization = "Bearer " + getToken(); headers["X-Device-Token"] = deviceToken(); }
  try{ r = await fetch(API+path,{method,headers,body:body?JSON.stringify(body):undefined}); }
  catch(e){ throw new Error("Cannot reach the server at "+API); }
  const d = await r.json().catch(()=>({}));
  if(!r.ok){
    // expired / invalid token: clear the session and go back to the login screen
    if(r.status===401 && getToken() && !path.startsWith("/auth/")){
      localStorage.removeItem("es_user");
      toast("Session expired. Please log in again.",true);
      setTimeout(()=>location.reload(),1200);
    }
    let m = d.detail;
    if(Array.isArray(m)) m = m.map(x=>(x.loc?.slice(-1)[0]||"")+": "+x.msg).join("; ");
    const err = new Error(m || "Request failed"); err.status = r.status; throw err;
  }
  return d;
}
// Format an ISO date from the API for display, e.g. "Thu, Nov 5, 2026, 6:30 PM"
function fmtDate(iso){
  if(!iso)return "Date to be announced";
  return new Date(iso).toLocaleString([],{weekday:"short",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const open_ = id => $(id).classList.add("show");
$$(".close").forEach(b=>b.onclick=()=>b.closest(".modal").classList.remove("show"));
$$(".modal").forEach(m=>m.addEventListener("mousedown",e=>{if(e.target===m)m.classList.remove("show")}));

/* ---------- backend status pill (GET /) ---------- */
const HINT='<span class="sr-only"> (backend status, click to change address)</span>';
async function ping(){const s=$("#st");try{const d=await(await fetch(API+"/")).json();s.innerHTML="● "+esc(d.status||"online")+HINT;s.className="chip on"}catch{s.innerHTML="● offline"+HINT;s.className="chip off"}}
$("#st").onclick=()=>{const u=prompt("Backend URL",API);if(u){API=u.trim().replace(/\/$/,"");localStorage.setItem("es_api",API);ping();if(user)show("events")}};
ping();setInterval(ping,15000);

/* ---------- UI polish helpers ---------- */
// Shimmering placeholder cards shown while data loads
const skeletons = (n=3) => Array.from({length:n},()=>'<div class="glass card skel"><i></i><i></i><i></i></div>').join("");
// Header gets a stronger shadow once the page is scrolled
addEventListener("scroll",()=>{const h=$("header");if(h)h.classList.toggle("scrolled",scrollY>8)},{passive:true});
// Number count-up animation
function countUp(el,to){
  if(isNaN(to)){el.textContent=to;return}
  const t0=performance.now();
  (function step(t){const p=Math.min((t-t0)/800,1);el.textContent=Math.round(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step)})(t0);
}

// Download a file that needs the login token (e.g. CSV exports)
async function downloadFile(path, filename){
  try{
    const r=await fetch(API+path,{headers:{Authorization:"Bearer "+getToken()}});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||"Download failed")}
    const url=URL.createObjectURL(await r.blob()),el=document.createElement("a");
    el.href=url;el.download=filename;el.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    toast("Download started");
  }catch(e){toast(e.message,true)}
}

/* ---------- registration form helpers (used by the home page and the app) ---------- */
// Build the inputs for an event's extra questions
function extraFieldsHTML(fields){
  return (fields||[]).map(f=>`<label>${esc(f.label)}${f.required?" *":""}
    <input data-xk="${esc(f.key)}" type="${f.type==="tel"?"tel":f.type}" ${f.type==="tel"?'inputmode="tel"':""} maxlength="200" placeholder="${esc(f.label)}"></label>`).join("");
}
// Read the answers back out; throws a friendly error if a required one is empty
function collectExtra(box,fields){
  const out={};
  for(const f of (fields||[])){
    const el=box.querySelector(`[data-xk="${f.key}"]`);
    out[f.key]=(el?el.value:"").trim();
    if(f.required&&!out[f.key])throw new Error(`Please fill in "${f.label}"`);
  }
  return out;
}

/* ---------- shared UI pieces ---------- */
// "ended" once 12 hours have passed since the start time, "live" in those first 12 hours (we only store the start time)
function eventState(e){
  if(!e.event_date)return "upcoming";
  const hours=(Date.now()-new Date(e.event_date))/36e5;
  return hours>12?"ended":hours>=0?"live":"upcoming";
}
// Label + disabled state of the Register button
function registerState(e){
  const left=Math.max(e.capacity-(e.registered??e.taken??0),0);
  if(eventState(e)==="ended")return {label:"Ended",disabled:true};
  return left?{label:"Register",disabled:false}:{label:"Sold out",disabled:true};
}
// Status tag for an event card: Ended / Happening now / Sold out / Almost full
function eventBadges(e){
  const left=Math.max(e.capacity-(e.registered??e.taken??0),0),state=eventState(e);
  if(state==="ended")return '<span class="tag">Ended</span>';
  if(left===0)return '<span class="tag bad">Sold out</span>';
  if(state==="live")return '<span class="tag ok">Happening now</span>';
  if(left/e.capacity<=0.2)return '<span class="tag wait">Almost full</span>';
  return "";
}
/* ---------- icons (one SVG sprite, drawn with currentColor) ---------- */
const ICONS={
  cal:'<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
  user:'<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M21 21h.01M17.5 17.5V21"/>',
  check:'<circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16.5v.01"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  camera:'<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  download:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M14 9l2 2"/>',
  phone:'<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  instagram:'<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  linkedin:'<path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  twitter:'<path d="M4 4l16 16M20 4L4 20"/>',
  youtube:'<path d="M22.5 6.4a2.8 2.8 0 00-1.9-2C18.9 4 12 4 12 4s-6.9 0-8.6.4a2.8 2.8 0 00-1.9 2A29 29 0 001 11.8a29 29 0 00.5 5.3 2.8 2.8 0 001.9 2c1.7.4 8.6.4 8.6.4s6.9 0 8.6-.4a2.8 2.8 0 001.9-2 29 29 0 00.5-5.3 29 29 0 00-.5-5.4z"/><path d="M9.8 15l5.7-3.2-5.7-3.2z"/>',
  github:'<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 00-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0020 4.8 5.1 5.1 0 0019.9 1S18.7.7 16 2.5a13.4 13.4 0 00-7 0C6.3.7 5.1 1 5.1 1A5.1 5.1 0 005 4.8a5.4 5.4 0 00-1.5 3.8c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 009 18.1V22"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};
document.body.insertAdjacentHTML("afterbegin",`<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${Object.entries(ICONS).map(([n,p])=>`<symbol id="i-${n}" viewBox="0 0 24 24">${p}</symbol>`).join("")}</svg>`);
const ic=(name,extra="")=>`<svg class="ic ${extra}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

// Month/day tile shown on the left of every event card
function dateTile(iso){
  if(!iso)return '<div class="date-tile tba" aria-hidden="true"><b>TBA</b></div>';
  const d=new Date(iso);
  return `<div class="date-tile" aria-hidden="true"><span>${d.toLocaleString([],{month:"short"})}</span><b>${d.getDate()}</b></div>`;
}
// One event card, used by the home page and the app. `actions` and `hostLine` are safe HTML.
function eventCardHTML(e,actions,hostLine){
  const reg=e.registered??e.taken??0,left=Math.max(e.capacity-reg,0),pct=Math.min(100,reg/e.capacity*100);
  return `<article class="glass card event-card">
    <div class="ec-top">${dateTile(e.event_date)}
      <div class="ec-title"><div class="card-head"><h3>${esc(e.title)}</h3>${eventBadges(e)}</div><div class="host">${hostLine}</div></div></div>
    <ul class="meta"><li>${ic("cal")}<span>${fmtDate(e.event_date)}</span></li><li>${ic("pin")}<span>${esc(e.location)}</span></li></ul>
    ${e.description?`<p class="desc">${esc(e.description)}</p>`:""}
    <div class="seats"><div class="meter" role="img" aria-label="${reg} of ${e.capacity} seats taken"><i style="width:${pct}%"></i></div>
      <div class="seats-row"><span>${left} ${left===1?"seat":"seats"} left</span><span>${reg} / ${e.capacity}</span></div></div>
    <div class="actions">${actions}</div></article>`;
}

// Friendly empty / error state. `icon` is an icon name; `text` and `action` must already be safe HTML.
const emptyState=(icon,title,text,action="")=>
  `<div class="glass empty-state"><span class="icon-tile big" aria-hidden="true">${ic(icon)}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;

/* ---------- accessible dialogs ----------
   Focus moves into a dialog when it opens, Tab stays inside it, Esc closes it,
   and focus goes back to the button that opened it. Works with the existing show/hide code. */
(function(){
  const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const openers=new WeakMap();
  // Remember the last control used OUTSIDE a dialog (page code may move focus into the dialog before we get to look)
  let lastOutside=null;
  document.addEventListener("focusin",e=>{if(!e.target.closest(".modal"))lastOutside=e.target});
  document.addEventListener("click",e=>{const b=e.target.closest("button,a");if(b&&!b.closest(".modal"))lastOutside=b},true);
  const items=root=>[...root.querySelectorAll(FOCUSABLE)].filter(el=>!el.closest(".hide"));
  const watcher=new MutationObserver(list=>list.forEach(({target:modal})=>{
    const isOpen=modal.classList.contains("show");
    if(isOpen&&!openers.has(modal)){
      openers.set(modal,lastOutside||document.activeElement);
      const box=modal.querySelector(".box");box.tabIndex=-1;
      // Never land on a destructive button: prefer a text field, otherwise the dialog's Close button
      setTimeout(()=>(box.querySelector("input:not([type=hidden]):not([type=checkbox]):not([hidden]),textarea,select")||box.querySelector(".close")||box).focus(),60);
    }else if(!isOpen&&openers.has(modal)){
      const back=openers.get(modal);openers.delete(modal);
      if(back&&document.contains(back))back.focus();
    }
  }));
  document.querySelectorAll(".modal").forEach(m=>watcher.observe(m,{attributes:true,attributeFilter:["class"]}));
  document.addEventListener("keydown",e=>{
    const modal=[...document.querySelectorAll(".modal.show")].pop();
    if(!modal)return;
    if(e.key==="Escape"){modal.classList.remove("show");return}
    if(e.key!=="Tab")return;
    const list=items(modal);if(!list.length)return;
    const first=list[0],last=list[list.length-1],box=modal.querySelector(".box");
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===box)){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
})();

/* ---------- site footer: About + Contact, text comes from js/config.js ---------- */
function renderFooter(){
  const el=$("#siteFooter");if(!el)return;
  const site=window.EVENTSPHERE_SITE||{},c=site.contact||{},s=site.social||{},brand=esc(site.brand||"EventSphere");
  const email=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email||"")?c.email:"";
  const phone=(c.phone||"").replace(/[^\d+]/g,"");
  const webUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"||x.protocol==="http:"?x.href:""}catch{return ""}};  // never javascript: or data: links
  const row=(icon,label,inner)=>`<li>${ic(icon)}<span><span class="sr-only">${label}: </span>${inner}</span></li>`;
  const contact=[
    email&&row("mail","Email",`<a href="mailto:${esc(email)}">${esc(email)}</a>`),
    phone.length>=6&&row("phone","Phone",`<a href="tel:${esc(phone)}">${esc(c.phone)}</a>`),
    c.address&&row("pin","Address",esc(c.address)),
    c.hours&&row("clock","Hours",esc(c.hours)),
  ].filter(Boolean).join("");
  const networks={instagram:"Instagram",linkedin:"LinkedIn",twitter:"X (Twitter)",youtube:"YouTube",github:"GitHub"};
  const social=Object.entries(networks).map(([key,name])=>{
    const url=webUrl(s[key]);
    return url?`<a class="social" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${name} (opens in a new tab)">${ic(key)}</a>`:"";
  }).join("");
  el.innerHTML=`<div class="f-grid">
    <div class="f-about"><a class="logo" href="index.html"><span aria-hidden="true">◉</span> ${brand}</a>
      ${site.tagline?`<p class="f-tag">${esc(site.tagline)}</p>`:""}
      ${site.about?`<p>${esc(site.about)}</p>`:""}
      ${social?`<div class="socials">${social}</div>`:""}</div>
    <nav aria-label="Footer"><h2 class="f-title">Explore</h2><ul class="f-links">
      <li><a href="index.html#features">Features</a></li><li><a href="index.html#how">How it works</a></li>
      <li><a href="index.html#events">Upcoming events</a></li><li><a href="app.html">Log in / Sign up</a></li></ul></nav>
    ${contact?`<div><h2 class="f-title">Contact</h2><ul class="f-contact">${contact}</ul></div>`:""}
  </div>
  <div class="f-bottom"><span>© ${new Date().getFullYear()} ${brand}. All rights reserved.</span>
    <span>Details you give when registering are shared only with the event organizer.</span></div>`;
}
renderFooter();
