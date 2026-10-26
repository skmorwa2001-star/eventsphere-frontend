/* ===========================================================
   app.js — EventSphere dashboard logic (needs api.js first)
   Sections: state · auth · shell · events · tickets · organizer
   =========================================================== */

/* ---------- state ---------- */
let user = JSON.parse(localStorage.getItem("es_user") || "null");
let evFilter = "all", role = "participant", mode = "login", editId = null, regEvent = null, mgEvent = null, events = [];

/* ---------- auth ---------- */
$$("#roleSeg button").forEach(b=>b.onclick=()=>{role=b.dataset.r;$$("#roleSeg button").forEach(x=>x.classList.toggle("on",x===b))});
$("#swBtn").onclick=e=>{e.preventDefault();mode=mode==="login"?"signup":"login";
  $("#nameWrap").classList.toggle("hide",mode==="login");
  $("#authT").textContent=mode==="login"?"Welcome back":"Create account";
  $("#authBtn").textContent=mode==="login"?"Log in":"Sign up";
  $("#swTxt").textContent=mode==="login"?"No account?":"Have an account?";
  $("#forgotWrap").classList.toggle("hide",mode!=="login"||!emailEnabled);
  $("#swBtn").textContent=mode==="login"?"Sign up":"Log in"};
$("#authBtn").onclick=async()=>{
  const email=$("#aEmail").value.trim(), password=$("#aPass").value;
  try{
    let d;
    if(mode==="signup"){
      if(role==="volunteer")throw new Error("Volunteer accounts are created by an organizer. Ask your organizer for your login.");
      const s=await api("/auth/signup","POST",{name:$("#aName").value.trim(),email,password,role});
      if(s.verification_required){toast("Account created. Check your email for the code.");showVerify(email);return}
      toast("Account created!");
    }
    d = await api("/auth/login","POST",{email,password,role});
    user={...d.user,token:d.access_token}; localStorage.setItem("es_user",JSON.stringify(user)); boot();
  }catch(e){
    if(e.status===403&&/not verified/i.test(e.message)){toast(e.message);showVerify(email,true)}   // account exists but email not confirmed yet
    else toast(e.message,true)
  }
};
$("#out").onclick=()=>{user=null;localStorage.removeItem("es_user");boot()};

/* ---------- shell ---------- */
function boot(){
  const li=!!user;
  $("#auth").classList.toggle("hide",li);
  ["#nav","#who","#out"].forEach(s=>$(s).classList.toggle("hide",!li));
  if(!li){$$("section[id^=v-]").forEach(s=>s.classList.add("hide"));return}
  const org=user.role==="organizer",vol=user.role==="volunteer",par=user.role==="participant";
  $$(".org").forEach(e=>e.classList.toggle("hide",!org));
  $$(".par").forEach(e=>e.classList.toggle("hide",!par));
  $$(".chk").forEach(e=>e.classList.toggle("hide",!(org||vol)));  // check-in: organizers + volunteers
  $$(".nvol").forEach(e=>e.classList.toggle("hide",vol));         // volunteers don't see the events list
  $("#who").textContent=user.name+" · "+user.role;
  if(org)refreshDevBadge();
  show(vol?"checkin":"events");
}
function show(v){
  if(v!=="checkin"){stopScan();clearInterval(devPoll)} // camera off + stop polling when leaving Check-in
  $$(".tab").forEach(t=>{const on=t.dataset.v===v;t.classList.toggle("on",on);on?t.setAttribute("aria-current","page"):t.removeAttribute("aria-current")});
  $$("section[id^=v-]").forEach(s=>s.classList.toggle("hide",s.id!=="v-"+v));
  if(v==="events")loadEvents(); if(v==="tickets")renderTickets();
  if(v==="volunteers")loadVolunteers(); if(v==="checkin"){loadVolInfo();loadDevBox()}
  if(v==="devices")loadDevices();
}
$$(".tab").forEach(t=>t.onclick=()=>show(t.dataset.v));

/* ---------- events ---------- */
async function loadEvents(){
  const g=$("#evGrid"); g.innerHTML=skeletons(3);
  try{
    const d=await api("/events");
    events=d.events.map(e=>({...e,taken:e.registered||0}));   // the list already includes how many have registered
    renderEvents();
  }catch(e){
    $("#evSummary").classList.add("hide");
    g.innerHTML=emptyState("alert","Can't load events",esc(e.message),'<button class="btn ghost" onclick="loadEvents()">Try again</button>');
  }
}
// Organizer dashboard tiles: a quick picture of your own events
function renderSummary(mine){
  const box=$("#evSummary");
  if(!mine){box.classList.add("hide");return}
  const registered=mine.reduce((n,e)=>n+e.taken,0),open=mine.reduce((n,e)=>n+Math.max(e.capacity-e.taken,0),0);
  const next=mine.filter(e=>e.event_date&&new Date(e.event_date)>=new Date()).sort((a,b)=>new Date(a.event_date)-new Date(b.event_date))[0];
  const tile=(icon,value,label)=>`<div class="sum-tile"><span class="icon-tile sm" aria-hidden="true">${ic(icon)}</span><div><b>${value}</b><span>${label}</span></div></div>`;
  box.innerHTML=tile("cal",mine.length,"Your events")+tile("users",registered,"Registrations")+tile("qr",open,"Seats still open")
    +tile("chart",next?esc(next.title):"None planned","Next event");
  box.classList.remove("hide");
}
function renderEvents(){
  const g=$("#evGrid"),org=user.role==="organizer",mine=events.filter(e=>e.organizer_id===user.id);
  renderSummary(org?mine:null);
  const newBtn='<button class="btn" onclick="$(\'#newEv\').click()">+ New Event</button>';
  if(!events.length){g.innerHTML=emptyState("cal","No events yet",org?"Create your first event and it will appear here.":"Check back soon. Organizers are adding events.",org?newBtn:"");return}
  const list=(org&&evFilter==="mine")?mine:events;
  if(!list.length){g.innerHTML=emptyState("plus","You haven't created any events yet","Events you create will show up here.",newBtn);return}
  g.innerHTML=list.map(e=>{
    const own=org&&e.organizer_id===user.id,rs=registerState(e);
    const details=`<button class="btn ghost sm" aria-label="View details for ${esc(e.title)}" onclick="showDetails(${e.id})">Details</button>`;
    const actions=own
      ?details+`<button class="btn sm" onclick="manage(${e.id})">Manage</button><span class="spacer"></span>`
        +`<button class="btn ghost sm icon-btn" aria-label="Edit ${esc(e.title)}" title="Edit" onclick="editEv(${e.id})">${ic("edit")}</button>`
        +`<button class="btn del sm icon-btn" aria-label="Delete ${esc(e.title)}" title="Delete" onclick="delEv(${e.id})">${ic("trash")}</button>`
      :details+(org?"":`<button class="btn sm" ${rs.disabled?"disabled":""} onclick="regOpen(${e.id})">${rs.label}</button>`);
    return eventCardHTML(e,actions,own?"Your event":"Hosted by "+esc(e.organizer_name||"Unknown"));
  }).join("");
}
$("#newEv").onclick=()=>{editId=null;$("#evT").textContent="New Event";["#eTitle","#eDesc","#eDate","#eLoc","#eCap"].forEach(s=>$(s).value="");formFields=[];$("#eVerify").checked=false;renderFormBuilder();open_("#mEv")};
window.editEv=id=>{const e=events.find(x=>x.id===id);editId=id;$("#evT").textContent="Edit Event";
  $("#eTitle").value=e.title;$("#eDesc").value=e.description||"";$("#eDate").value=e.event_date?e.event_date.slice(0,16):"";$("#eLoc").value=e.location;$("#eCap").value=e.capacity;formFields=(e.form_fields||[]).map(f=>({...f}));$("#eVerify").checked=!!e.verify_email;renderFormBuilder();open_("#mEv")};
$("#evSave").onclick=async()=>{
  const b={title:$("#eTitle").value.trim(),description:$("#eDesc").value.trim()||null,event_date:$("#eDate").value||null,location:$("#eLoc").value.trim(),capacity:+$("#eCap").value,
    verify_email:$("#eVerify").checked,
    form_fields:formFields.filter(f=>f.label.trim()).map(f=>({key:f.key,label:f.label.trim(),type:f.type,required:!!f.required}))};
  if(!b.event_date){toast("Please pick a date and time",true);return}
  try{
    await (editId?api("/events/"+editId,"PUT",b):api("/events","POST",b));
    $("#mEv").classList.remove("show");toast(editId?"Event updated":"Event created");loadEvents();
  }catch(e){toast(e.message,true)}
};
/* ---------- event details ---------- */
window.showDetails=id=>{
  const e=events.find(x=>x.id===id),left=Math.max(e.capacity-e.taken,0),pct=Math.min(100,e.taken/e.capacity*100);
  $("#dTitle").textContent=e.title;
  $("#dBody").innerHTML=`<ul class="meta"><li>${ic("cal")}<span>${fmtDate(e.event_date)}</span></li><li>${ic("pin")}<span>${esc(e.location)}</span></li></ul>
    <div class="host" style="margin:10px 0 12px">Hosted by ${esc(e.organizer_name||"Unknown")}</div>
    <p class="detail-desc">${esc(e.description||"No description provided.")}</p>
    <div class="stats"><div class="stat"><b>${e.capacity}</b><span class="small">Capacity</span></div>
    <div class="stat"><b>${e.taken}</b><span class="small">Registered</span></div>
    <div class="stat"><b>${left}</b><span class="small">Seats left</span></div></div>
    <div class="meter"><i style="width:${pct}%"></i></div>`;
  const org=user.role==="organizer",own=org&&e.organizer_id===user.id;
  $("#dActions").innerHTML=`<button class="btn ghost" onclick="$('#mDet').classList.remove('show')">Close</button>`+
    (own?`<button class="btn ghost" onclick="$('#mDet').classList.remove('show');editEv(${id})">Edit</button><button class="btn" onclick="$('#mDet').classList.remove('show');manage(${id})">Manage</button>`
        :org?"":`<button class="btn" ${registerState(e).disabled?"disabled":""} onclick="$('#mDet').classList.remove('show');regOpen(${id})">${registerState(e).label}</button>`);
  open_("#mDet");
};
window.delEv=async id=>{if(!confirm("Delete this event and its registrations?"))return;
  try{await api("/events/"+id,"DELETE");toast("Event deleted");loadEvents()}catch(e){toast(e.message,true)}};

/* ---------- registration & tickets ---------- */
const getTk=()=>JSON.parse(localStorage.getItem("es_tickets_"+user.email)||"[]");
window.regOpen=id=>{regEvent=events.find(e=>e.id===id);$("#rT").textContent="Register · "+regEvent.title;
  $("#rName").value=user.name;$("#rEmail").value=user.email;$("#rEmail").readOnly=true;$("#rExtra").innerHTML=extraFieldsHTML(regEvent.form_fields||[]);open_("#mReg")};
$("#rSave").onclick=async()=>{
  try{
    const d=await api(`/events/${regEvent.id}/register`,"POST",{attendee_name:$("#rName").value.trim(),attendee_email:$("#rEmail").value.trim(),extra:collectExtra($("#rExtra"),regEvent.form_fields)});
    const t={...d.registration,event_title:regEvent.title};
    localStorage.setItem("es_tickets_"+user.email,JSON.stringify([t,...getTk()]));
    $("#mReg").classList.remove("show");toast("Registered!");showTicket(t);loadEvents();
  }catch(e){toast(e.message,true)}
};
function showTicket(t){$("#tkSub").textContent=t.event_title+" · "+t.attendee_name;$("#tkQr").src=API+"/tickets/"+encodeURIComponent(t.ticket_code)+"/qr";$("#tkCode").textContent=t.ticket_code;open_("#mTk")}
function renderTickets(){
  const t=getTk(),g=$("#tkGrid");
  if(!t.length){g.innerHTML='<div class="empty glass" style="grid-column:1/-1">No tickets yet. Register for an event to get one.</div>';return}
  g.innerHTML=t.map((x,i)=>`<article class="glass card"><h3>${esc(x.event_title)}</h3><p>${esc(x.attendee_name)}<br>${esc(x.attendee_email)}</p>
    <div class="row"><button class="btn sm" onclick="showTicket(getTk()[${i}])">View QR</button>
    <button class="btn del sm" onclick="cancelTk(${i})">Cancel</button></div></article>`).join("");
}
$("#tkDl").onclick=async()=>{ // saves the QR image so it can be tested with "Upload QR image"
  try{const b=await(await fetch($("#tkQr").src)).blob();const a=document.createElement("a");
    a.href=URL.createObjectURL(b);a.download="ticket-qr.png";a.click()}catch{toast("Could not download the QR",true)}
};
window.cancelTk=async i=>{const t=getTk();if(!confirm("Cancel this registration?"))return;
  try{await api("/tickets/"+encodeURIComponent(t[i].ticket_code),"DELETE");t.splice(i,1);localStorage.setItem("es_tickets_"+user.email,JSON.stringify(t));toast("Registration cancelled");renderTickets()}
  catch(e){toast(e.message,true)}};
window.getTk=getTk;window.showTicket=showTicket;

/* ---------- organizer: manage & check-in ---------- */
window.manage=async id=>{
  mgEvent=id;
  try{
    const [a,r]=await Promise.all([api(`/events/${id}/analytics`),api(`/events/${id}/registrations`)]);
    $("#mgT").textContent=a.event_title;
    const fields=(events.find(e=>e.id===id)||{}).form_fields||[];
    $("#mgStats").innerHTML=[["Capacity",a.capacity],["Registered",a.total_registrations],["Checked in",a.checked_in],["Pending",a.pending_count_in],["Seats left",a.available_seats]]
      .map(([k,v])=>`<div class="stat"><b>${v}</b><span class="small">${k}</span></div>`).join("");
    $("#mgBody").innerHTML=r.attendees.length?r.attendees.map(x=>`<tr><td>${esc(x.attendee_name)}</td><td>${esc(x.attendee_email)}<div class="small">${esc(fields.map(f=>(x.extra||{})[f.key]).filter(Boolean).join(" · "))}</div></td>
      <td><span class="tag ${x.checked_in?"ok":""}">${x.checked_in?"Checked in":"Pending"}</span></td>
      <td><button class="btn del sm" onclick="rmReg(${x.id})">Remove</button></td></tr>`).join("")
      :'<tr><td colspan="4" class="empty">No registrations yet.</td></tr>';
    open_("#mMg");
  }catch(e){toast(e.message,true)}
};
window.rmReg=async rid=>{if(!confirm("Remove this attendee?"))return;
  try{await api("/registrations/"+rid,"DELETE");toast("Attendee removed");manage(mgEvent);loadEvents()}catch(e){toast(e.message,true)}};
/* ---------- check-in (manual + QR scanner) ---------- */
// Calls POST /registrations/check-in/{code} and shows the result.
async function doCheckIn(code){
  const out=$("#ciRes");
  code=(code||"").trim(); if(!code)return;
  try{
    const d=await api("/registrations/check-in/"+encodeURIComponent(code),"POST");
    out.className="ci-res ok";out.textContent="✓ "+d.attendee_name+" checked in (event #"+d.event_id+")";
    toast("Checked in: "+d.attendee_name);$("#ciCode").value="";
  }catch(e){out.className="ci-res bad";out.textContent="✕ "+e.message;toast(e.message,true)}
}
$("#ciBtn").onclick=()=>doCheckIn($("#ciCode").value);
$("#ciCode").addEventListener("keydown",e=>{if(e.key==="Enter")$("#ciBtn").click()});

/* ---------- QR scanner ---------- */
let stream=null, scanning=false, lastCode="", lastTime=0;
// Native detector where available (Chrome/Edge/Android); jsQR otherwise.
const detector=("BarcodeDetector" in window)?new BarcodeDetector({formats:["qr_code"]}):null;

// Decode a QR from a <video> or <img>. Tries the browser's native detector first,
// then jsQR at several scales (helps with big screenshots and small images).
// quick=true (used for live video) only tries the original size, to stay fast.
async function decodeQR(source,quick){
  if(detector){try{const r=await detector.detect(source);if(r[0])return r[0].rawValue}catch{/* native detector failed: fall back to jsQR */}}
  if(!window.jsQR)throw new Error("QR library not loaded");
  const w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;
  if(!w||!h)return null;
  const c=$("#scanCanvas"),ctx=c.getContext("2d",{willReadFrequently:true});
  for(const scale of(quick?[1]:[1,.5,.25,2])){
    const cw=Math.round(w*scale),ch=Math.round(h*scale);
    if(cw<60||ch<60||cw>3000)continue;
    const pad=Math.round(Math.min(cw,ch)*.1);          // white margin: QR codes need a "quiet zone"
    c.width=cw+pad*2;c.height=ch+pad*2;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height); // also fixes transparent PNGs
    ctx.drawImage(source,pad,pad,cw,ch);
    const d=ctx.getImageData(0,0,c.width,c.height);
    const r=jsQR(d.data,d.width,d.height,{inversionAttempts:"attemptBoth"});
    if(r&&r.data)return r.data;
  }
  return null;
}
async function startScan(){
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}})}
  catch(e){toast("Camera unavailable: "+e.message,true);$("#scanHint").textContent="Allow camera access, or use the image upload / manual entry.";return}
  const v=$("#scanVideo");v.srcObject=stream;await v.play();
  $("#scanBox").classList.remove("hide");$("#scanBtn").innerHTML=ic("stop")+" Stop scanner";
  $("#scanHint").textContent="Point the camera at the attendee's QR code.";
  scanning=true;scanLoop();
}
function stopScan(){
  scanning=false;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  $("#scanBox").classList.add("hide");$("#scanBtn").innerHTML=ic("camera")+" Start scanner";
}
async function scanLoop(){
  if(!scanning)return;
  const v=$("#scanVideo");
  if(v.readyState>=2){
    let code=null;try{code=await decodeQR(v,true)}catch{/* no QR in this frame */}
    // ignore the same code for 4s so one scan doesn't fire repeatedly
    if(code&&(code!==lastCode||Date.now()-lastTime>4000)){
      lastCode=code;lastTime=Date.now();await doCheckIn(code);
    }
  }
  requestAnimationFrame(scanLoop);
}
$("#scanBtn").onclick=()=>scanning?stopScan():startScan();
// Fallback: decode a saved QR image (e.g. screenshot of the ticket)
$("#scanFile").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  const img=new Image();img.src=URL.createObjectURL(f);
  try{await img.decode()}catch{toast("Could not read that image file",true);e.target.value="";return}
  let code=null;
  try{code=await decodeQR(img)}catch(err){toast(err.message,true);e.target.value="";return}
  code?doCheckIn(code):toast("No QR found. Use a clear, full image of the ticket QR.",true);
  e.target.value="";
};

/* ---------- organizer filter: All events / My events ---------- */
$$("#evFilter button").forEach(b=>b.onclick=()=>{
  evFilter=b.dataset.f;$$("#evFilter button").forEach(x=>x.classList.toggle("on",x===b));renderEvents();
});

/* ---------- spinner on buttons while a request runs ---------- */
["#authBtn","#evSave","#rSave","#ciBtn"].forEach(s=>{
  const b=$(s),handler=b.onclick;
  b.onclick=async e=>{b.classList.add("loading");try{await handler(e)}finally{b.classList.remove("loading")}};
});

/* ---------- volunteers (organizer) ---------- */
let volunteers=[], myEvents=[], assignId=null;

async function loadVolunteers(){
  const g=$("#volGrid");g.innerHTML=skeletons(2);
  try{
    const [vd,ed]=await Promise.all([api("/volunteers"),api("/events")]);
    volunteers=vd.volunteers;myEvents=ed.events.filter(e=>e.organizer_id===user.id);
    if(!volunteers.length){g.innerHTML='<div class="empty glass" style="grid-column:1/-1">No volunteers yet. Add one above.</div>';return}
    g.innerHTML=volunteers.map(v=>{
      const tags=v.event_ids.map(id=>myEvents.find(e=>e.id===id)).filter(Boolean)
        .map(e=>`<span class="tag">${esc(e.title)}</span>`).join(" ");
      const initials=esc(v.name.split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase());
      return `<article class="glass card"><div class="ec-top"><span class="avatar" aria-hidden="true">${initials}</span>
        <div class="ec-title"><h3>${esc(v.name)}</h3><div class="host">${esc(v.email)}</div></div></div>
        <div class="small">Can check in tickets for:</div>
        <div class="row">${tags||'<span class="small">No events assigned yet</span>'}</div>
        <div class="actions"><button class="btn sm" onclick="assignOpen(${v.id})">Assign events</button>
        <span class="spacer"></span><button class="btn ghost sm icon-btn" aria-label="Reset password for ${esc(v.name)}" title="Reset password" onclick="resetVol(${v.id})">${ic("key")}</button>
        <button class="btn del sm icon-btn" aria-label="Remove ${esc(v.name)}" title="Remove" onclick="delVol(${v.id})">${ic("trash")}</button></div></article>`}).join("");
  }catch(e){g.innerHTML=`<div class="empty glass" style="grid-column:1/-1">${esc(e.message)}</div>`}
}
$("#volAdd").onclick=async()=>{
  try{
    const d=await api("/volunteers","POST",{name:$("#vName").value.trim(),email:$("#vEmail").value.trim(),password:$("#vPass").value});
    ["#vName","#vEmail","#vPass"].forEach(s=>$(s).value="");
    toast("Volunteer created. Share their email and password with them.");
    await loadVolunteers();assignOpen(d.volunteer.id);   // straight on to choosing their events
  }catch(e){toast(e.message,true)}
};
window.assignOpen=id=>{
  assignId=id;const v=volunteers.find(x=>x.id===id);
  $("#asT").textContent="Access for "+v.name;
  $("#asList").innerHTML=myEvents.length?myEvents.map(e=>`<label class="chk-row"><input type="checkbox" value="${e.id}" ${v.event_ids.includes(e.id)?"checked":""}>
    <span>${esc(e.title)}<span class="small"> · ${fmtDate(e.event_date)}</span></span></label>`).join(""):'<p class="small" style="margin-top:14px">Create an event first.</p>';
  open_("#mAs");
};
$("#asSave").onclick=async()=>{
  const ids=$$("#asList input:checked").map(i=>+i.value);
  try{await api(`/volunteers/${assignId}/events`,"PUT",{event_ids:ids});$("#mAs").classList.remove("show");toast("Access updated");loadVolunteers()}
  catch(e){toast(e.message,true)}
};
window.resetVol=async id=>{
  const p=prompt("New password for this volunteer (min 8 characters):");if(!p)return;
  try{await api(`/volunteers/${id}/reset-password`,"POST",{password:p});toast("Password updated")}catch(e){toast(e.message,true)}
};
window.delVol=async id=>{
  if(!confirm("Remove this volunteer? They will no longer be able to log in."))return;
  try{await api("/volunteers/"+id,"DELETE");toast("Volunteer removed");loadVolunteers()}catch(e){toast(e.message,true)}
};

/* ---------- volunteer: which events can I check in? ---------- */
async function loadVolInfo(){
  const el=$("#volInfo");
  if(user.role!=="volunteer"){el.classList.add("hide");return}
  el.classList.remove("hide");
  try{
    const d=await api("/volunteer/events");
    el.innerHTML=d.events.length?"You can check in tickets for: "+d.events.map(e=>`<span class="tag">${esc(e.title)}</span>`).join(" ")
      :"No events assigned yet. Ask your organizer to give you access.";
  }catch(e){el.textContent=e.message}
}

/* ---------- participant list downloads (CSV) ---------- */
$("#expAll").onclick=()=>downloadFile("/exports/participants","all-participants.csv");
$("#mgCsv").onclick=()=>downloadFile(`/events/${mgEvent}/registrations/export`,`participants-event-${mgEvent}.csv`);

["#volAdd","#asSave"].forEach(s=>{   // spinner while these requests run
  const b=$(s),handler=b.onclick;
  b.onclick=async e=>{b.classList.add("loading");try{await handler(e)}finally{b.classList.remove("loading")}};
});

/* ---------- check-in device status (volunteers + organizers) ---------- */
let devPoll=null;
const guessDeviceName=()=>{const u=navigator.userAgent;
  const os=/iPhone|iPad/.test(u)?"iPhone/iPad":/Android/.test(u)?"Android phone":/Windows/.test(u)?"Windows PC":/Mac/.test(u)?"Mac":/Linux/.test(u)?"Linux PC":"Device";
  return os+" ("+(user?user.name.split(" ")[0]:"me")+")"};

async function registerThisDevice(name){
  const d=await api("/devices/register","POST",{device_token:deviceToken(),name});
  toast(d.status==="approved"?"Device registered":"Request sent. Waiting for organizer approval.");
  loadDevBox();
}
async function loadDevBox(){
  clearInterval(devPoll);
  const box=$("#devBox"),area=$("#scanArea");
  if(!["organizer","volunteer"].includes(user.role)){box.classList.add("hide");return}
  try{
    const s=await api("/devices/me");
    let ok=true,html="",cls="";
    const form=`<div class="row"><input id="devName" maxlength="60" value="${esc(guessDeviceName())}" placeholder="Device name, e.g. Gate 1 phone">
      <button class="btn sm" id="devReq">${user.role==="organizer"?"Register this device":"Request approval"}</button></div>`;
    if(s.network_locked&&!s.network_ok){ok=false;cls="warn";html="📶 <b>Not on the event network.</b> Connect to the venue Wi-Fi to check people in."}
    else if(s.required){
      if(s.status==="approved"){cls="ok";html=`✓ This device is approved${s.name?" as <b>"+esc(s.name)+"</b>":""}.`}
      else if(s.status==="pending"){ok=false;html="⏳ <b>Waiting for the organizer to approve this device…</b> This page updates automatically.";
        devPoll=setInterval(loadDevBox,5000)}
      else if(s.status==="unregistered"&&user.role==="organizer"){   // organizers approve their own devices
        await registerThisDevice(guessDeviceName());return}
      else{ok=false;cls="warn";html=(s.status==="unregistered"?"This device isn't registered yet. The organizer must approve it before it can check people in.":
        "This device was "+(s.status==="rejected"?"rejected":"removed")+" by the organizer. You can ask again.")+form}
    }else if(s.network_locked){cls="ok";html="✓ You're on the event network."}
    box.className="dev-box "+cls+(html?"":" hide");box.innerHTML=html;
    area.classList.toggle("locked",!ok);
    if(!ok)stopScan();
    const req=$("#devReq");
    if(req)req.onclick=async()=>{req.classList.add("loading");
      try{await registerThisDevice($("#devName").value.trim()||guessDeviceName())}catch(e){toast(e.message,true)}finally{req.classList.remove("loading")}};
  }catch(e){box.className="dev-box warn";box.textContent=e.message}
}

/* ---------- organizer: Devices tab ---------- */
async function refreshDevBadge(){
  try{const s=await api("/devices/settings"),t=$('[data-v="devices"]');t.textContent=s.pending_count?`Devices (${s.pending_count})`:"Devices"}catch{/* the badge is optional */}
}
async function loadDevices(){
  const g=$("#devGrid");g.innerHTML=skeletons(2);
  try{
    const [st,ds]=await Promise.all([api("/devices/settings"),api("/devices")]);
    $("#setApprove").checked=st.device_approval;$("#setNet").checked=!!st.venue_network;
    $("#netInfo").textContent=(st.venue_network?"Locked to network "+st.venue_network+". ":"")+"Your current network: "+st.current_network;
    refreshDevBadge();
    if(!ds.devices.length){g.innerHTML='<div class="empty glass" style="grid-column:1/-1">No devices yet. When a volunteer opens Check-in on a new phone, the request appears here.</div>';return}
    const tagCls={approved:"ok",pending:"wait",rejected:"bad",revoked:"bad"};
    g.innerHTML=ds.devices.map(d=>{
      const btns=d.status==="pending"?`<button class="btn sm" onclick="devSet(${d.id},'approved')">Approve</button><button class="btn del sm" onclick="devSet(${d.id},'rejected')">Reject</button>`
        :d.status==="approved"?`<button class="btn ghost sm" onclick="devSet(${d.id},'revoked')">Revoke access</button>`
        :`<button class="btn sm" onclick="devSet(${d.id},'approved')">Approve again</button>`;
      return `<article class="glass card"><div class="row" style="justify-content:space-between;align-items:center"><h3>${esc(d.name)}</h3><span class="tag ${tagCls[d.status]||""}">${esc(d.status)}</span></div>
        <div class="small">👤 ${esc(d.user_name)} · ${esc(d.user_role)}<br>${esc(d.user_email)}</div>
        <div class="small">📶 ${esc(d.ip||"unknown")} · requested ${fmtDate(d.requested_at)}${d.last_seen_at?"<br>Last check-in "+fmtDate(d.last_seen_at):""}</div>
        <div class="row">${btns}<button class="btn del sm" onclick="devDel(${d.id})">Remove</button></div></article>`}).join("");
  }catch(e){g.innerHTML=`<div class="empty glass" style="grid-column:1/-1">${esc(e.message)}</div>`}
}
async function saveDevSettings(){
  try{await api("/devices/settings","PUT",{device_approval:$("#setApprove").checked,lock_to_network:$("#setNet").checked});toast("Settings saved");loadDevices()}
  catch(e){toast(e.message,true);loadDevices()}
}
$("#setApprove").onchange=saveDevSettings;$("#setNet").onchange=saveDevSettings;
window.devSet=async(id,status)=>{try{await api(`/devices/${id}/status`,"PUT",{status});toast("Device "+status);loadDevices()}catch(e){toast(e.message,true)}};
window.devDel=async id=>{if(!confirm("Remove this device?"))return;try{await api("/devices/"+id,"DELETE");toast("Device removed");loadDevices()}catch(e){toast(e.message,true)}};
setInterval(()=>{if(user&&user.role==="organizer")refreshDevBadge()},20000);   // keeps the pending count fresh

/* ---------- registration form builder (inside the event form) ---------- */
const PRESETS=[
  {key:"institute",label:"Institute name",type:"text"},{key:"mobile",label:"Mobile number",type:"tel"},
  {key:"class",label:"Class / Year",type:"text"},{key:"department",label:"Department",type:"text"},{key:"city",label:"City",type:"text"}];
const TYPE_NAMES={text:"Text",tel:"Phone",number:"Number",email:"Email"};
let formFields=[];

function renderFormBuilder(){
  $("#fPresets").innerHTML=PRESETS.filter(p=>!formFields.some(f=>f.key===p.key))
    .map(p=>`<button type="button" class="btn ghost sm" data-p="${p.key}">+ ${esc(p.label)}</button>`).join("")
    +'<button type="button" class="btn ghost sm" data-p="custom">+ Custom field</button>';
  $("#fRows").innerHTML=formFields.map((f,i)=>`<div class="frow">
    <input data-i="${i}" data-k="label" value="${esc(f.label)}" maxlength="60" placeholder="Field name" aria-label="Field name">
    <select data-i="${i}" data-k="type" aria-label="Field type">${Object.keys(TYPE_NAMES).map(t=>`<option value="${t}" ${f.type===t?"selected":""}>${TYPE_NAMES[t]}</option>`).join("")}</select>
    <label class="req"><input type="checkbox" data-i="${i}" data-k="required" ${f.required?"checked":""}> Required</label>
    <button type="button" class="btn del sm" data-rm="${i}" title="Remove field" aria-label="Remove field">✕</button></div>`).join("");
}
$("#fPresets").onclick=e=>{
  const b=e.target.closest("[data-p]");if(!b||formFields.length>=10)return;
  const p=PRESETS.find(x=>x.key===b.dataset.p);
  formFields.push(p?{...p,required:false}:{key:"c"+Date.now().toString(36),label:"",type:"text",required:false});
  renderFormBuilder();
  if(!p)$("#fRows").querySelector(".frow:last-child input").focus();
};
$("#fRows").addEventListener("input",e=>{const t=e.target,i=t.dataset.i;if(i===undefined)return;
  formFields[i][t.dataset.k]=t.type==="checkbox"?t.checked:t.value});
$("#fRows").onclick=e=>{const b=e.target.closest("[data-rm]");if(!b)return;formFields.splice(+b.dataset.rm,1);renderFormBuilder()};

/* ---------- email: sign-up verification, forgotten password ---------- */
let emailEnabled=false, pendingEmail="", cooldownTimer=null;
const AUTH_VIEWS=["#authMain","#authVerify","#authForgot"];
const showAuthView=sel=>AUTH_VIEWS.forEach(v=>$(v).classList.toggle("hide",v!==sel));

// Disable a "send/resend" button for a minute and show the countdown
function startCooldown(btn,label="Resend code",secs=60){
  clearInterval(cooldownTimer);let n=secs;btn.disabled=true;
  const tick=()=>{btn.textContent=n>0?`${label} (${n}s)`:label;if(n--<=0){clearInterval(cooldownTimer);btn.disabled=false}};
  tick();cooldownTimer=setInterval(tick,1000);
}
function showVerify(email,sendNew){
  pendingEmail=email;$("#vEmailShow").textContent=email;$("#vCode").value="";
  showAuthView("#authVerify");startCooldown($("#vResend"));$("#vCode").focus();
  if(sendNew)api("/auth/resend-code","POST",{email}).catch(()=>{});   // came from a blocked login: make sure a fresh code is on its way
}
$("#vBtn").onclick=async()=>{
  try{
    const d=await api("/auth/verify-email","POST",{email:pendingEmail,code:$("#vCode").value.trim()});
    user={...d.user,token:d.access_token};localStorage.setItem("es_user",JSON.stringify(user));
    showAuthView("#authMain");boot();toast("Email verified. Welcome!");
  }catch(e){toast(e.message,true)}
};
$("#vResend").onclick=async()=>{
  try{await api("/auth/resend-code","POST",{email:pendingEmail});toast("A new code is on its way");startCooldown($("#vResend"))}
  catch(e){toast(e.message,true)}
};
$("#vBack").onclick=e=>{e.preventDefault();clearInterval(cooldownTimer);showAuthView("#authMain")};
$("#vCode").addEventListener("keydown",e=>{if(e.key==="Enter")$("#vBtn").click()});

$("#forgotBtn").onclick=e=>{
  e.preventDefault();$("#fEmail").value=$("#aEmail").value;$("#fStep2").classList.add("hide");
  $("#fSend").textContent="Send code";$("#fSend").disabled=false;showAuthView("#authForgot");
};
$("#fSend").onclick=async()=>{
  try{
    await api("/auth/forgot-password","POST",{email:$("#fEmail").value.trim()});
    toast("If an account exists for that email, a code is on its way.");
    $("#fStep2").classList.remove("hide");$("#fCode").focus();startCooldown($("#fSend"),"Resend code");
  }catch(e){toast(e.message,true)}
};
$("#fReset").onclick=async()=>{
  try{
    await api("/auth/reset-password","POST",{email:$("#fEmail").value.trim(),code:$("#fCode").value.trim(),password:$("#fPass").value});
    toast("Password updated. Please log in.");$("#aEmail").value=$("#fEmail").value;$("#aPass").value="";
    $("#fCode").value="";$("#fPass").value="";clearInterval(cooldownTimer);showAuthView("#authMain");
  }catch(e){toast(e.message,true)}
};
$("#fBack").onclick=e=>{e.preventDefault();clearInterval(cooldownTimer);showAuthView("#authMain")};

["#vBtn","#fSend","#fReset"].forEach(s=>{   // spinner while these requests run
  const b=$(s),handler=b.onclick;
  b.onclick=async e=>{b.classList.add("loading");try{await handler(e)}finally{b.classList.remove("loading")}};
});

// Does this server send email? Shows or hides the email features.
api("/config").then(c=>{
  emailEnabled=!!c.email_enabled;
  $("#forgotWrap").classList.toggle("hide",!emailEnabled||mode!=="login");
  $("#eVerify").disabled=!emailEnabled;
  if(!emailEnabled)$("#eVerifyHint").textContent="Email isn't set up on this server yet, so this option is unavailable (see the README: SMTP settings).";
}).catch(()=>{});

boot();
