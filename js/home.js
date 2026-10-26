/* ===========================================================
   home.js — landing page (needs api.js first)
   - lists events from GET /events
   - "View details" modal
   - registration WITHOUT login: POST /events/{id}/register
     (the form shows whatever questions the organizer chose)
   =========================================================== */

let homeEvents = [];
let regEvent = null;
let showAll = false;
const PREVIEW = 6;

async function loadHome() {
  $("#liveEvents").innerHTML = skeletons(3);
  try {
    const data = await api("/events");
    homeEvents = data.events;
    countUp($("#statEvents"), data.total);
    countUp($("#statSeats"), homeEvents.reduce((n, e) => n + e.capacity, 0));
    renderEvents();
  } catch (err) {
    $("#statEvents").textContent = "–";
    $("#statSeats").textContent = "–";
    $("#liveEvents").innerHTML = emptyState("alert", "Can't load events", esc(err.message), '<button class="btn ghost" onclick="loadHome()">Try again</button>');
  }
}

const seatsLeft = e => Math.max(e.capacity - (e.registered || 0), 0);

function renderEvents() {
  const grid = $("#liveEvents");
  if (!homeEvents.length) {
    grid.innerHTML = emptyState("cal", "No events yet", "Check back soon. Organizers are adding events.", '<a class="btn" href="app.html">I\'m an organizer</a>');
    $("#showAll").classList.add("hide");
    return;
  }
  const list = showAll ? homeEvents : homeEvents.slice(0, PREVIEW);
  grid.innerHTML = list.map(e => eventCardHTML(e,
    `<button class="btn ghost sm" aria-label="View details for ${esc(e.title)}" onclick="showDetails(${e.id})">Details</button>
     <button class="btn sm" ${registerState(e).disabled ? "disabled" : ""} onclick="regOpen(${e.id})">${registerState(e).label}</button>`,
    "Hosted by " + esc(e.organizer_name || "Unknown"))).join("");
  const more = homeEvents.length > PREVIEW;
  $("#showAll").classList.toggle("hide", !more);
  $("#showAll").textContent = showAll ? "Show fewer" : `Show all ${homeEvents.length} events`;
}
$("#showAll").onclick = () => { showAll = !showAll; renderEvents(); };

/* ---------- event details modal ---------- */
function showDetails(id) {
  const e = homeEvents.find(x => x.id === id);
  const left = seatsLeft(e);
  const pct = Math.min(100, ((e.registered || 0) / e.capacity) * 100);
  $("#dTitle").textContent = e.title;
  $("#dBody").innerHTML = `
    <ul class="meta"><li>${ic("cal")}<span>${fmtDate(e.event_date)}</span></li><li>${ic("pin")}<span>${esc(e.location)}</span></li></ul>
    <div class="host" style="margin:10px 0 12px">Hosted by ${esc(e.organizer_name || "Unknown")}</div>
    <p class="detail-desc">${esc(e.description || "No description provided.")}</p>
    <div class="stats">
      <div class="stat"><b>${e.capacity}</b><span class="small">Capacity</span></div>
      <div class="stat"><b>${e.registered || 0}</b><span class="small">Registered</span></div>
      <div class="stat"><b>${left}</b><span class="small">Seats left</span></div>
    </div>
    <div class="meter"><i style="width:${pct}%"></i></div>`;
  $("#dActions").innerHTML = `
    <button class="btn ghost" id="dClose">Close</button>
    <button class="btn" ${registerState(e).disabled ? "disabled" : ""} id="dReg">${registerState(e).disabled ? registerState(e).label : "Register now"}</button>`;
  $("#dClose").onclick = () => $("#mDet").classList.remove("show");
  $("#dReg").onclick = () => { $("#mDet").classList.remove("show"); regOpen(id); };
  $("#mDet").classList.add("show");
}

/* ---------- registration (no login) ---------- */
function regOpen(id) {
  regEvent = homeEvents.find(x => x.id === id);
  $("#rT").textContent = "Register · " + regEvent.title;
  $("#rName").value = "";
  $("#rEmail").value = "";
  $("#rExtra").innerHTML = extraFieldsHTML(regEvent.form_fields);   // the organizer's questions
  $("#rCodeWrap").classList.toggle("hide", !regEvent.verify_required);  // organizer asked for verified emails
  $("#rCode").value = "";
  $("#rSend").disabled = false;
  $("#rSend").textContent = "Send code";
  $("#mReg").classList.add("show");
  $("#rName").focus();
}

$("#rSave").onclick = async () => {
  const btn = $("#rSave");
  btn.classList.add("loading");
  try {
    const name = $("#rName").value.trim(), email = $("#rEmail").value.trim();
    if (name.length < 2) throw new Error("Please enter your full name");
    if (!email) throw new Error("Please enter your email");
    const extra = collectExtra($("#rExtra"), regEvent.form_fields);
    const code = $("#rCode").value.trim();
    if (regEvent.verify_required && !/^\d{6}$/.test(code)) throw new Error("Please enter the 6-digit code we emailed you");
    const d = await api(`/events/${regEvent.id}/register`, "POST",
      { attendee_name: name, attendee_email: email, extra, email_code: regEvent.verify_required ? code : null });
    $("#mReg").classList.remove("show");
    showTicket(d.registration, regEvent.title);
    loadHome();                                                       // refresh seats left
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.classList.remove("loading");
  }
};

/* ---------- email code for events that verify attendee emails ---------- */
let sendTimer = null;
$("#rSend").onclick = async () => {
  const email = $("#rEmail").value.trim(), btn = $("#rSend");
  if (!email) { toast("Enter your email first", true); return; }
  btn.classList.add("loading");
  try {
    await api("/email/send-code", "POST", { email });
    $("#rCodeHint").textContent = "Code sent to " + email + ". Check your inbox and spam folder. It expires in 10 minutes.";
    $("#rCode").focus();
    let n = 60;                               // wait a minute before allowing "Send again"
    clearInterval(sendTimer);
    btn.disabled = true;
    const tick = () => { btn.textContent = n > 0 ? `Send again (${n}s)` : "Send again"; if (n-- <= 0) { clearInterval(sendTimer); btn.disabled = false; } };
    tick(); sendTimer = setInterval(tick, 1000);
  } catch (err) { toast(err.message, true); }
  finally { btn.classList.remove("loading"); }
};

function showTicket(reg, title) {
  $("#tkSub").textContent = title + " · " + reg.attendee_name;
  $("#tkQr").src = API + "/tickets/" + encodeURIComponent(reg.ticket_code) + "/qr";
  $("#tkCode").textContent = reg.ticket_code;
  $("#mTk").classList.add("show");
}
$("#tkDl").onclick = async () => {   // saves the QR image to the device
  try {
    const blob = await (await fetch($("#tkQr").src)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ticket-qr.png";
    a.click();
  } catch { toast("Could not download the QR. Take a screenshot instead.", true); }
};

loadHome();

/* ---------- scroll-reveal: sections fade in as they enter the screen ---------- */
document.documentElement.classList.add("js");
const io = new IntersectionObserver(entries => entries.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
}), { threshold: 0.12 });
$$(".section, .final").forEach(el => { el.classList.add("reveal"); io.observe(el); });
