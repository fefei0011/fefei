const token = localStorage.getItem("timesheetToken");
const userStr = localStorage.getItem("timesheetUser");

if (!token || !userStr || (localStorage.getItem("lastActive") && Date.now() - Number(localStorage.getItem("lastActive")) > 18000000)) { localStorage.clear(); window.location.href = "index.html"; } else { localStorage.setItem("lastActive", String(Date.now())); }

const dDate = new Date();
document.getElementById("selYear").value = dDate.getFullYear();
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
document.getElementById("selMonth").value = months[dDate.getMonth()];

if (userStr) {
  const u = JSON.parse(userStr);
  const uiEl = document.getElementById("userInfo");
  if (uiEl) uiEl.innerText = `${u.username} (${u.role})`;
}

let rulesCache = [];
let specialRulesCache = [];
let breakRulesCache = []; 
let vehiclesCache = [];
let currentFocus = -1;

let systemLockData = { month: null, year: null }; 
let isEditingInvoice = false;
let currentInvoices = [];
let loggedRowsTracker = new Set();
let currentLockedRecord = null; 
let recordPollGeneration = 0;

// 🟢 NEW: Variables for Live Lock Transfer
let isReadOnlyMode = false;
let recordPollTimer = null;
let incomingRequestActive = false;
let amIWaitingForApproval = false;
let editCountdownInterval = null; // 🟢 കൗണ്ട്ഡൗൺ ടൈമർ ട്രാക്ക് ചെയ്യാൻ

// 🟢 NEW: Month Navigation Arrow Functions
function prevMonth() {
  const sel = document.getElementById("selMonth");
  const yr = document.getElementById("selYear");
  if(sel.selectedIndex > 0) { sel.selectedIndex--; }
  else { sel.selectedIndex = 11; yr.value = parseInt(yr.value) - 1; }
  releaseLock();
  if(document.getElementById('selPlate').value) triggerFetch();
}

function nextMonth() {
  const sel = document.getElementById("selMonth");
  const yr = document.getElementById("selYear");
  if(sel.selectedIndex < 11) { sel.selectedIndex++; }
  else { sel.selectedIndex = 0; yr.value = parseInt(yr.value) + 1; }
  releaseLock();
  if(document.getElementById('selPlate').value) triggerFetch();
}

function releaseLock() {
  if (currentLockedRecord) {
    const lockToken = localStorage.getItem("timesheetToken");
    if (lockToken) {
      const payload = JSON.stringify(currentLockedRecord);
      fetch('/timesheet/api/record-lock/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + lockToken
        },
        body: payload,
        keepalive: true 
      }).catch(e => console.error("Lock release error:", e));
    }
    currentLockedRecord = null;
  }
}

document.getElementById("selMonth").addEventListener("change", releaseLock);
document.getElementById("selYear").addEventListener("change", releaseLock);

async function init() {
  const ts = new Date().getTime();

  const rRes = await fetch(`/timesheet/api/rules?_t=${ts}`, {
    headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache", Pragma: "no-cache" },
    cache: "no-store",
  });
  
  if (rRes.status === 401 || rRes.status === 403) {
    await customAlert("Session expired. Please login again.", "Session Timeout");
    logout();
    return;
  }
  
  let rData;
  try { rData = await rRes.json(); } catch (e) { return; }

  if (rData && rData.success) rulesCache = rData.data;

  const srRes = await fetch(`/timesheet/api/special-rules?_t=${ts}`, {
    headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache", Pragma: "no-cache" },
    cache: "no-store",
  });
  const srData = await srRes.json();
  if (srData.success) specialRulesCache = srData.data;

  const brRes = await fetch(`/timesheet/api/break-rules?_t=${ts}`, {
    headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache", Pragma: "no-cache" },
    cache: "no-store",
  });
  const brData = await brRes.json();
  if (brData.success) breakRulesCache = brData.data;

  const vRes = await fetch(`/timesheet/api/vehicle-info?_t=${ts}`, {
    headers: { Authorization: "Bearer " + token, "Cache-Control": "no-cache", Pragma: "no-cache" },
    cache: "no-store",
  });
  const vData = await vRes.json();
  if (vData.success) vehiclesCache = vData.data;

  const lRes = await fetch(`/api/lock/status?_t=${ts}`, { headers: { Authorization: "Bearer " + token }});
  const lData = await lRes.json().catch(()=>({}));
  if(lData.success && lData.data) {
      systemLockData = { month: lData.data.lock_month, year: lData.data.lock_year };
  }
}

function searchPlate() {
  const inputEl = document.getElementById("selPlate");
  delete inputEl.dataset.actualPlate; // 🟢 ടൈപ്പ് ചെയ്യുമ്പോൾ പഴയ പ്ലേറ്റ് നമ്പർ മെമ്മറിയിൽ നിന്ന് മായ്ക്കുന്നു

  const val = inputEl.value.trim().toUpperCase();
  const sug = document.getElementById("plateSuggestions");
  sug.innerHTML = ""; 
  currentFocus = -1;

  if(document.getElementById("actualLogsheetCount")) {
      document.getElementById("actualLogsheetCount").innerHTML = "";
  }

  document.getElementById("dispDName").innerText = "N/A";
  document.getElementById("dispDMob").innerText = "N/A";
  document.getElementById("dispOName").innerText = "N/A";
  document.getElementById("dispOMob").innerText = "N/A";
  document.getElementById("dispSite").innerText = "N/A";
  document.getElementById("dispVType").innerText = "N/A";
  document.getElementById("dispFieldCo").innerText = "N/A";
  document.getElementById("dispSiteCo").innerText = "N/A";
  document.getElementById("dispAsset").innerText = "N/A";
  document.getElementById("dispWorkOrder").innerText = "N/A";
  document.getElementById("dispSiteStart").innerText = "N/A";
  document.getElementById("dispSiteEnd").innerText = "N/A";
  if (document.getElementById("oldVehRow")) document.getElementById("oldVehRow").style.display = "none";
  if (document.getElementById("newVehRow")) document.getElementById("newVehRow").style.display = "none";

  document.getElementById("invSiteSelect").innerHTML = '<option value="">Waiting for data...</option>';
  clearInvoiceForm();
  isEditingInvoice = false;
  currentInvoices = [];
  
  releaseLock();

  if (!val) {
    let history = JSON.parse(localStorage.getItem("plateSearchHistory") || "[]");
    if (history.length > 0) {
      sug.style.display = "block";
      sug.style.maxHeight = "105px";
      sug.style.overflowY = "auto";
      history.forEach((hPlate) => {
        let div = document.createElement("div");
        div.innerHTML = `<b>${hPlate}</b>`;
        let masterObj = vehiclesCache.find((v) => v.plate_no.toUpperCase() === hPlate) || { plate_no: hPlate };
        div.onclick = () => selectPlate(masterObj);
        sug.appendChild(div);
      });
    } else { sug.style.display = "none"; }
    return;
  }

  sug.style.maxHeight = "250px";
  sug.style.overflowY = "auto";

  const selMonthName = document.getElementById("selMonth").value;
  const selYearNum = parseInt(document.getElementById("selYear").value);
  const selMonthIdx = months.indexOf(selMonthName);
  const selMonthStart = new Date(selYearNum, selMonthIdx, 1);
  const selMonthEnd = new Date(selYearNum, selMonthIdx + 1, 0);

  const getVehicleDisplayPlate = (v) => {
    let currentPlate = (v.plate_no || "").trim().toUpperCase();
    if (!v.plate_logs || v.plate_logs.length === 0) return currentPlate;

    for (let log of v.plate_logs) {
      if (!log.change_date) continue;
      let [cYear, cMonth, cDay] = log.change_date.split("-").map(Number);
      let cDate = new Date(cYear, cMonth - 1, cDay);

      let oPlate = (log.old_plate_no || "").trim().toUpperCase();
      let nPlate = (log.new_plate_no || "").trim().toUpperCase();

      if (cYear === selYearNum && (cMonth - 1) === selMonthIdx) {
        return `${oPlate} ➔ ${nPlate}`;
      } else if (selMonthEnd < cDate) {
        return oPlate;
      } else if (selMonthStart >= cDate) {
        return nPlate;
      }
    }
    return currentPlate;
  };

  const matches = vehiclesCache.filter((v) => {
    let dispPlate = getVehicleDisplayPlate(v);
    let allRelated = [dispPlate, v.plate_no];
    if (v.plate_logs) {
      v.plate_logs.forEach((pl) => {
        allRelated.push(pl.old_plate_no);
        allRelated.push(pl.new_plate_no);
      });
    }

    let plateMatch = allRelated.some((p) => p && p.toUpperCase().includes(val));
    let assetMatch = v.asset_code && v.asset_code.toUpperCase().includes(val);
    let woMatch = v.wrk_order_no && v.wrk_order_no.toUpperCase().includes(val);
    let driverMatch = v.driver_name && v.driver_name.toUpperCase().includes(val);

    return plateMatch || assetMatch || woMatch || driverMatch;
  });

  if (matches.length > 0) {
    sug.style.display = "block";
    matches.forEach((m) => {
      let div = document.createElement("div");
      let resolvedPlate = getVehicleDisplayPlate(m);
      let displayText = resolvedPlate;

      if (m.asset_code && m.asset_code.toUpperCase().includes(val)) {
        displayText += ` (${m.asset_code})`;
      } else if (m.wrk_order_no && m.wrk_order_no.toUpperCase().includes(val)) {
        displayText += ` [${m.wrk_order_no}]`;
      } else if (m.driver_name && m.driver_name.toUpperCase().includes(val)) {
        displayText += ` - ${m.driver_name}`;
      }

      div.innerText = displayText;
      div.onclick = () => selectPlate(m, resolvedPlate);
      sug.appendChild(div);
    });
  } else {
    sug.style.display = "none";
  }
}

function selectPlate(vObj, resolvedPlate) {
  // 🟢 ഇൻപുട്ടിൽ കാണാൻ മാത്രം resolvedPlate, എന്നാൽ യഥാർത്ഥ പ്ലേറ്റ് dataset-ൽ സൂക്ഷിക്കുന്നു
  const inputEl = document.getElementById("selPlate");
  inputEl.value = (resolvedPlate || vObj.plate_no).toUpperCase();
  inputEl.dataset.actualPlate = vObj.plate_no.toUpperCase();
  document.getElementById("plateSuggestions").style.display = "none";
}

document.getElementById("selPlate").addEventListener("keydown", function (e) {
  let sug = document.getElementById("plateSuggestions");
  if (sug.style.display === "none") {
    if (e.key === "Enter") { e.preventDefault(); triggerFetch(); }
    return;
  }
  let items = sug.getElementsByTagName("div");
  if (e.key === "ArrowDown") {
    e.preventDefault(); currentFocus++; addActive(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault(); currentFocus--; addActive(items);
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click();
    else if (items.length > 0) items[0].click();
    if (e.key === "Enter") setTimeout(() => triggerFetch(), 100);
  }
});

function addActive(items) {
  if (!items) return false;
  removeActive(items);
  if (currentFocus >= items.length) currentFocus = 0;
  if (currentFocus < 0) currentFocus = items.length - 1;
  items[currentFocus].classList.add("suggestion-active");
  items[currentFocus].scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function removeActive(items) {
  for (let i = 0; i < items.length; i++) items[i].classList.remove("suggestion-active");
}

function parseLogDate(dStr, defaultDate) {
  if (!dStr) return defaultDate;
  let parts = dStr.split("T")[0].split("-");
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getGapStatus(d, sLogs, dLogs) {
  let sActive = false, sGap = false, isReplaced = false, isBeforeStart = false, isAfterEnd = false;
  let dActive = false, dGap = false;

  if (sLogs && sLogs.length > 0) {
    let ascSLogs = [...sLogs].sort((a, b) => parseLogDate(a.work_start_date, new Date("2000-01-01")) - parseLogDate(b.work_start_date, new Date("2000-01-01")));
    for (let i = 0; i < ascSLogs.length; i++) {
      let st = parseLogDate(ascSLogs[i].work_start_date, new Date("2000-01-01"));
      let ed = parseLogDate(ascSLogs[i].work_end_date, new Date("2099-01-01"));
      if (d >= st && d <= ed) { sActive = true; break; }
      if (d > ed) {
        if (ascSLogs[i].status === "Replaced") isReplaced = true;
        else isReplaced = false; 
      }
    }
    if (!sActive) {
      let firstStart = parseLogDate(ascSLogs[0].work_start_date, new Date("2000-01-01"));
      let lastEnd = parseLogDate(ascSLogs[ascSLogs.length - 1].work_end_date, new Date("2099-01-01"));
      if (d >= firstStart && d <= lastEnd) sGap = true;
      else if (d < firstStart) isBeforeStart = true;
      else if (d > lastEnd) isAfterEnd = true;
    }
  } else { sActive = true; }

  if (!sActive) {
    if (isReplaced) return "R";
    if (sGap) return "SC";
    if (isBeforeStart) return "WS";  
    if (isAfterEnd) return "Re";
    return "AB";
  }

  if (dLogs && dLogs.length > 0) {
    let ascDLogs = [...dLogs].sort((a, b) => parseLogDate(a.work_start_date, new Date("2000-01-01")) - parseLogDate(b.work_start_date, new Date("2000-01-01")));
    for (let i = 0; i < ascDLogs.length; i++) {
      let st = parseLogDate(ascDLogs[i].work_start_date, new Date("2000-01-01"));
      let ed = parseLogDate(ascDLogs[i].work_end_date, new Date("2099-01-01"));
      if (d >= st && d <= ed) { dActive = true; break; }
    }
  } else { dActive = true; }

  if (!dActive) return "DC";
  return "ACTIVE";
}

function getDaysInMonth(monthStr, year) {
  return new Date(year, months.indexOf(monthStr) + 1, 0).getDate();
}
function getDayName(dayNum, monthStr, year) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${monthStr} ${dayNum}, ${year}`).getDay()];
}
function formatDateUI(dStr) {
  if (!dStr || dStr === "N/A") return "N/A";
  let p = dStr.split("-");
  return `${p[2]}-${p[1]}-${p[0]}`;
}

async function triggerFetch() {
  const inputEl = document.getElementById("selPlate");
  let rawVal = inputEl.value.trim().toUpperCase();
  
  // 🟢 "2380 XSB ➔ 1999 NTA" എന്നതിൽ നിന്ന് അവസാനത്തെ മാസ്റ്റർ പ്ലേറ്റ് (1999 NTA) വേർതിരിച്ചെടുക്കുന്നു
  let p = inputEl.dataset.actualPlate || rawVal;
  if (p.includes("➔")) {
    p = p.split("➔").pop().trim();
  } else if (p.includes("->")) {
    p = p.split("->").pop().trim();
  }

  document.getElementById("plateSuggestions").style.display = "none";

  if (!p) {
    await customAlert("Please enter a Plate No.", "Missing Information");
    return;
  }

  // 🟢 FIX: പുതിയ പ്ലേറ്റ് ഫെച്ച് ചെയ്യുമ്പോൾ മുൻപത്തെ എല്ലാ ലോക്ക് സ്റ്റേറ്റുകളും പൂർണ്ണമായി റീസെറ്റ് ചെയ്യുന്നു
  clearInterval(recordPollTimer);
  recordPollTimer = null;
  recordPollGeneration++;
  isReadOnlyMode = false;
  amIWaitingForApproval = false;
  incomingRequestActive = false;
  
  const btnReq = document.getElementById("btnRequestEdit");
  if (btnReq) {
    btnReq.style.display = "none";
    btnReq.disabled = false;
    btnReq.style.opacity = "1";
  }

  loggedRowsTracker.clear();
  resetBellButton(); // 🟢 ബെൽ കൗണ്ട്ഡൗൺ റീസെറ്റ് ചെയ്യുന്നു
  savePlateHistory(p);

  const inlineLogsheet = document.getElementById("inlineLogsheet");
  if (inlineLogsheet && inlineLogsheet.style.display !== "none") openLogsheetViewer(p);

  const m = document.getElementById("selMonth").value;
  const y = document.getElementById("selYear").value;

  // 🟢 വേറെ പ്ലേറ്റിലേക്കോ മാസത്തിലേക്കോ മാറിയാൽ മാത്രം പഴയ ലോക്ക് റിലീസ് ചെയ്യുക
  if (currentLockedRecord && (currentLockedRecord.plate !== p || currentLockedRecord.month !== m || currentLockedRecord.year !== y)) {
    releaseLock();
  }

  const tbody = document.getElementById("gridBody");
  const btn = document.getElementById("fetchBtn");
  const loader = document.getElementById("fetchLoader");
  const text = document.getElementById("fetchText");

  btn.disabled = true;
  text.innerText = "Wait...";
  loader.style.display = "block";
  tbody.innerHTML = '<tr class="loading-row"><td colspan="13">Fetching database records...</td></tr>';

  try {
    const ts = new Date().getTime();
    const headers = { Authorization: "Bearer " + token, "Cache-Control": "no-cache", Pragma: "no-cache" };

    let lockRes, lockData;
    try {
      lockRes = await fetch('/timesheet/api/record-lock/request', {
        method: 'POST',
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ plate: p, month: m, year: y })
      });
      lockData = await lockRes.json();
    } catch (e) {
      await customAlert("Network connection lost. Please check your internet and try again.", "Connection Error");
      throw e; 
    }

    if (lockRes.status === 401 || lockRes.status === 403) {
      await customAlert("Session expired or invalid. Please login again.", "Session Timeout");
      logout();
      return;
    }

    if (!lockData.success) {
      if (lockData.lockedBy) {
        let lockedUser = lockData.lockedBy.toUpperCase();

        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "warning",
          title: `Locked by [ ${lockedUser} ]`,
          text: "Opening in Read-Only mode",
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
        });

        isReadOnlyMode = true;
        currentLockedRecord = null;
        let btnReq = document.getElementById("btnRequestEdit");
        if (btnReq) {
          btnReq.style.display = "inline-block";
          btnReq.style.opacity = "1";
          btnReq.disabled = false;
        }
        amIWaitingForApproval = false;
      } else {
        // 🟢 FIX: അനാവശ്യമായി ലോഗൗട്ട് ആകുന്നത് ഒഴിവാക്കി. സിസ്റ്റം സേഫ് ആയി Read-Only യിൽ ഓപ്പൺ ചെയ്യും.
        console.warn("Lock acquire notice:", lockData.message);
        isReadOnlyMode = true;
        currentLockedRecord = null;
      }
    } else {
      // 🟢 OWNERSHIP CONFIRMED: യൂസർ 2 ആക്സസ് നേടിയാൽ ആക്സസ് സുരക്ഷിതമായി നിലനിർത്തുന്നു
      isReadOnlyMode = false;
      currentLockedRecord = { plate: p, month: m, year: y };
      const btnReq = document.getElementById("btnRequestEdit");
      if (btnReq) btnReq.style.display = "none";
    }

    const res = await fetch(`/timesheet/api/grid-data?month=${m}&year=${y}&plate=${p}&_t=${ts}`, { headers, cache: "no-store" });

    if (res.status === 401 || res.status === 403) {
      releaseLock(); 
      await customAlert("Session expired. Please login again.", "Session Timeout");
      logout();
      return;
    }

    let data;
    try { data = await res.json(); } 
    catch (e) {
      releaseLock(); 
      await customAlert("Session expired or invalid response. Please login again.", "Session Timeout");
      logout();
      return;
    }

    if (data.success === false) {
      releaseLock(); 
      throw new Error(data.message);
    }
    
    const logRes = await fetch(`/timesheet/api/vehicle-logs?plate=${p}&_t=${ts}`, { headers, cache: "no-store" });
    let logs;
    try { logs = await logRes.json(); } catch (e) { logs = { drivers: [], sites: [], owners: [], rates: [] }; }

    let mIdx = months.indexOf(m);
    let monthStart = new Date(y, mIdx, 1);
    let monthEnd = new Date(y, mIdx + 1, 0);

    let dNameArr = [], dMobArr = [], siteArr = [], activeSites = [];
    let oNameArr = [], oMobArr = [];

    if (logs.success) {
      // 1. Driver Logs
      let activeDrivers = (logs.drivers || []).filter((d) => {
        let st = d.work_start_date ? new Date(d.work_start_date) : new Date("2000-01-01");
        let ed = d.work_end_date ? new Date(d.work_end_date) : new Date("2099-01-01");
        return st <= monthEnd && ed >= monthStart;
      });
      if (activeDrivers.length === 0 && logs.drivers && logs.drivers.length > 0) {
        activeDrivers = [ [...logs.drivers].sort((a, b) => new Date(b.work_start_date || "2000-01-01") - new Date(a.work_start_date || "2000-01-01"))[0] ];
      }
      if (activeDrivers.length > 0) {
        dNameArr = [...new Set(activeDrivers.map((d) => d.driver_name))].filter(Boolean);
        dMobArr = [...new Set(activeDrivers.map((d) => d.driver_mobile))].filter(Boolean);
      }

      // 2. Site Logs
      activeSites = (logs.sites || []).filter((s) => {
        let st = s.work_start_date ? new Date(s.work_start_date) : new Date("2000-01-01");
        let ed = s.work_end_date ? new Date(s.work_end_date) : new Date("2099-01-01");
        return st <= monthEnd && ed >= monthStart;
      });
      if (activeSites.length === 0 && logs.sites && logs.sites.length > 0) {
        activeSites = [ [...logs.sites].sort((a, b) => new Date(b.work_start_date || "2000-01-01") - new Date(a.work_start_date || "2000-01-01"))[0] ];
      }
      if (activeSites.length > 0) {
        siteArr = [...new Set(activeSites.map((s) => s.site_name))].filter(Boolean);
      }

      // 3. 🟢 Owner Logs (Monthly Filter & Fallback)
      let activeOwners = (logs.owners || []).filter((o) => {
        let st = o.work_start_date ? new Date(o.work_start_date) : new Date("2000-01-01");
        let ed = o.work_end_date ? new Date(o.work_end_date) : new Date("2099-01-01");
        return st <= monthEnd && ed >= monthStart;
      });
      if (activeOwners.length === 0 && logs.owners && logs.owners.length > 0) {
        activeOwners = (logs.owners || []).filter((o) => o.status === "Running");
        if (activeOwners.length === 0) {
          activeOwners = [ [...logs.owners].sort((a, b) => new Date(b.work_start_date || "2000-01-01") - new Date(a.work_start_date || "2000-01-01"))[0] ];
        }
      }
      if (activeOwners.length > 0) {
        oNameArr = [...new Set(activeOwners.map((o) => o.owner_name))].filter(Boolean);
        oMobArr = [...new Set(activeOwners.map((o) => o.owner_mobile))].filter(Boolean);
      }
    }

    let vObjMaster = vehiclesCache.find((v) => v.plate_no.toUpperCase() === p);
    document.getElementById("dispDName").innerText = dNameArr.length > 0 ? dNameArr.join(" & ") : (vObjMaster ? vObjMaster.driver_name || "N/A" : "N/A");
    document.getElementById("dispDMob").innerText = dMobArr.length > 0 ? dMobArr.join(" & ") : (vObjMaster ? vObjMaster.driver_mobile || "N/A" : "N/A");
    document.getElementById("dispSite").innerText = siteArr.length > 0 ? siteArr.join(" & ") : (vObjMaster ? vObjMaster.site_name || "N/A" : "N/A");
    
    // 🟢 Owner Details directly populated from Owner Log
    document.getElementById("dispOName").innerText = oNameArr.length > 0 ? oNameArr.join(" & ") : (vObjMaster ? vObjMaster.owner_name || "N/A" : "N/A");
    document.getElementById("dispOMob").innerText = oMobArr.length > 0 ? oMobArr.join(" & ") : (vObjMaster ? vObjMaster.owner_mobile || "N/A" : "N/A");
    
    document.getElementById("dispVType").innerText = vObjMaster ? vObjMaster.vehicle_type || "N/A" : "N/A";

    // Global variable ആയി activeSites സേവ് ചെയ്യുന്നു (Invoice site മാറുമ്പോൾ റീയൂസ് ചെയ്യാൻ)
    window.currentActiveSitesList = activeSites;
    window.currentVehicleMasterObj = vObjMaster;

    updateSiteLogDetailsCard(activeSites.length > 0 ? activeSites[0] : null);

    let sStartVal = activeSites.length > 0 && activeSites[0].work_start_date ? activeSites[0].work_start_date.split("T")[0] : null;
    let sEndVal = activeSites.length > 0 && activeSites[0].work_end_date ? activeSites[0].work_end_date.split("T")[0] : null;

    try {
      const invRes = await fetch(`/payment/get-invoice?plate_no=${p}&month=${m + " " + y}&_t=${ts}`, { headers, cache: "no-store" });
      const invData = await invRes.json();
      currentInvoices = invData.success && invData.data ? invData.data : [];
    } catch (e) { currentInvoices = []; }

    const invSiteSelect = document.getElementById("invSiteSelect");
    invSiteSelect.innerHTML = "";
    if (siteArr.length > 0) {
      siteArr.forEach((siteName) => {
        let opt = document.createElement("option");
        opt.value = siteName; opt.text = siteName;
        invSiteSelect.appendChild(opt);
      });
      loadInvoiceForSelectedSite();
    } else {
      invSiteSelect.innerHTML = '<option value="">No Site Active</option>';
      clearInvoiceForm();
    }

    // 🟢 RESTORED: Fetch and Display Actual Logsheet Count
    fetch("/timesheet/api/logsheets/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ month: m, year: y, plate_no: p }),
    })
    .then(res => res.json())
    .then(lsData => {
      const actualLsSpan = document.getElementById("actualLogsheetCount");
      if (actualLsSpan) {
        if (lsData.success && lsData.files && lsData.files.length > 0) {
          let validCount = 0;
          let zeroCount = 0;
          
          lsData.files.forEach(f => {
            if (f.size === 0) zeroCount++;
            else validCount++;
          });
          
          let htmlStr = `<span style="font-weight: 700;">[ ${validCount} ]</span>`;
          
          if (zeroCount > 0) {
            htmlStr += `<span style="color: #ef4444; font-weight: 700; margin-left: 6px; font-size: 13px;" title="${zeroCount} Empty (0B) files">${zeroCount}</span>`;
          }
          
          actualLsSpan.innerHTML = htmlStr;
        } else {
          actualLsSpan.innerHTML = "";
        }
      }
    })
    .catch(e => console.log("Error fetching logsheet count:", e));

    let existingData = data.success ? data.data : [];
    let pLogsForGrid = data.plateLogs || (logs.plateChanges || []);
    
    try {
        renderGrid(m, y, p, existingData, sStartVal, sEndVal, logs, pLogsForGrid);
        await applyLockStatus(m, y, false);
        
        if(typeof startRecordPoll === "function") {
            startRecordPoll(p, m, y);
        }
    } catch (renderError) {
        console.error("Render Grid Error:", renderError);
    } finally {
        btn.disabled = false;
        text.innerText = "Fetch Data";
        loader.style.display = "none";
    }

  } catch (error) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="13" style="color:red;">Error fetching data. Check connection.</td></tr>';
    btn.disabled = false;
    text.innerText = "Fetch Data";
    loader.style.display = "none";
  }
}

// 🟢 NEW: Site Log Details Card അപ്ഡേറ്റ് ചെയ്യുന്ന ഹെൽപ്പർ ഫംഗ്ഷൻ (Old / New Vehicle സഹിതം)
// 🟢 NEW: ഒന്നിലധികം സൈറ്റുകൾ ഉള്ളപ്പോൾ നിർദ്ദിഷ്ട സൈറ്റിന്റെ മണിക്കൂറുകൾ മാത്രം കണക്കാക്കുന്നു
function calculateHoursForSite(targetSiteLog) {
  const siteHoursBlock = document.getElementById("siteHoursBlock");
  if (!siteHoursBlock) return;

  // ഒരു സൈറ്റ് മാത്രമാണെങ്കിൽ ഈ ബ്ലോക്ക് കാണിക്കേണ്ടതില്ല
  if (!window.currentActiveSitesList || window.currentActiveSitesList.length <= 1 || !targetSiteLog) {
    siteHoursBlock.style.display = "none";
    return;
  }

  const monthStr = document.getElementById("selMonth").value;
  const year = parseInt(document.getElementById("selYear").value);
  const mIdx = months.indexOf(monthStr);
  const days = getDaysInMonth(monthStr, year);

  let stDate = targetSiteLog.work_start_date ? new Date(targetSiteLog.work_start_date) : new Date(year, mIdx, 1);
  stDate.setHours(0, 0, 0, 0);
  let edDate = targetSiteLog.work_end_date ? new Date(targetSiteLog.work_end_date) : new Date(year, mIdx + 1, 0);
  edDate.setHours(23, 59, 59, 999);

  let siteNormal = 0, siteOT = 0;

  for (let i = 1; i <= days; i++) {
    let curDate = new Date(year, mIdx, i);
    curDate.setHours(12, 0, 0, 0);

    // സൈറ്റ് ആക്ടീവ് ആയ തീയതിക്കുള്ളിൽ ആണോ എന്ന് നോക്കുന്നു
    if (curDate >= stDate && curDate <= edDate) {
      let tm = parseFloat(document.getElementById(`time_${i}`)?.value) || 0;
      let bd = document.querySelector(`.grid-input[data-row="${i}"][data-col="bd"]`)?.value.trim().toUpperCase() || "";
      let dayName = getDayName(i, monthStr, year);

      let formattedDateForSum = new Date(year, mIdx, i).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric"
      }).replace(/ /g, " ");

      let targetSiteName = (targetSiteLog.site_name || "").trim().toUpperCase();
      let sumOtRule = specialRulesCache.find(r =>
        r.is_active && r.rule_type === "FULL_OT" &&
        (r.sites.includes("ALL") || r.sites.includes(targetSiteName)) &&
        r.dates.includes(formattedDateForSum)
      );

      let isFullOT = dayName === "Fri" || i === 31 || !!sumOtRule;
      let nr = 0, ot = 0;

      if (bd === "ID" || bd === "NP") {
        if (isFullOT) ot = 10; else nr = 10;
      } else if (["BD", "NW", "NS", "NR", "H", "AB", "DC", "SC", "R", "WS", "RE", "FRI", "Fri"].includes(bd)) {
        // No hours
      } else if (tm > 0) {
        if (isFullOT) {
          ot = tm;
        } else {
          if (tm > 10) {
            nr = 10;
            ot = tm - 10;
          } else {
            nr = tm;
          }
        }
      }
      siteNormal += nr;
      siteOT += ot;
    }
  }

  document.getElementById("dispSiteNR").innerText = siteNormal;
  document.getElementById("dispSiteOT").innerText = siteOT;
  document.getElementById("dispSiteTot").innerText = siteNormal + siteOT;
  siteHoursBlock.style.display = "block";
}

function updateSiteLogDetailsCard(targetSiteLog) {
  const vMaster = window.currentVehicleMasterObj;
  const oldVehRow = document.getElementById("oldVehRow");
  const newVehRow = document.getElementById("newVehRow");

  if (!targetSiteLog) {
    document.getElementById("dispFieldCo").innerText = vMaster ? vMaster.field_co || "N/A" : "N/A";
    document.getElementById("dispSiteCo").innerText = vMaster ? vMaster.site_co || "N/A" : "N/A";
    document.getElementById("dispSiteStart").innerText = "N/A";
    document.getElementById("dispSiteEnd").innerText = "N/A";
    document.getElementById("dispAsset").innerText = vMaster ? vMaster.asset_code || "N/A" : "N/A";
    document.getElementById("dispWorkOrder").innerText = vMaster ? vMaster.wrk_order_no || "N/A" : "N/A";
    if (oldVehRow) oldVehRow.style.display = "none";
    if (newVehRow) newVehRow.style.display = "none";
    const siteHoursBlock = document.getElementById("siteHoursBlock");
    if (siteHoursBlock) siteHoursBlock.style.display = "none";
    return;
  }

  const sStart = targetSiteLog.work_start_date ? targetSiteLog.work_start_date.split("T")[0] : null;
  const sEnd = targetSiteLog.work_end_date ? targetSiteLog.work_end_date.split("T")[0] : null;

  document.getElementById("dispFieldCo").innerText = targetSiteLog.field_co || (vMaster ? vMaster.field_co : "N/A");
  document.getElementById("dispSiteCo").innerText = targetSiteLog.site_co || (vMaster ? vMaster.site_co : "N/A");
  document.getElementById("dispSiteStart").innerText = formatDateUI(sStart || "N/A");
  document.getElementById("dispSiteEnd").innerText = sEnd ? formatDateUI(sEnd) + (targetSiteLog.new_vehicle_no ? " (Replaced)" : " (Released)") : "Running";
  document.getElementById("dispAsset").innerText = targetSiteLog.asset_code || (vMaster ? vMaster.asset_code : "N/A");
  document.getElementById("dispWorkOrder").innerText = targetSiteLog.work_order_no || (vMaster ? vMaster.wrk_order_no : "N/A");

  // 🟢 Old Vehicle ഉണ്ടെങ്കിൽ മാത്രം കാണിക്കുന്നു
  if (targetSiteLog.old_vehicle_no && targetSiteLog.old_vehicle_no.trim() !== "" && targetSiteLog.old_vehicle_no !== "null") {
    document.getElementById("dispOldVeh").innerText = targetSiteLog.old_vehicle_no.toUpperCase();
    if (oldVehRow) oldVehRow.style.display = "flex";
  } else {
    if (oldVehRow) oldVehRow.style.display = "none";
  }

  // 🟢 New Vehicle ഉണ്ടെങ്കിൽ മാത്രം കാണിക്കുന്നു
  if (targetSiteLog.new_vehicle_no && targetSiteLog.new_vehicle_no.trim() !== "" && targetSiteLog.new_vehicle_no !== "null") {
    document.getElementById("dispNewVeh").innerText = targetSiteLog.new_vehicle_no.toUpperCase();
    if (newVehRow) newVehRow.style.display = "flex";
  } else {
    if (newVehRow) newVehRow.style.display = "none";
  }

  // 🟢 Multi-site ഉണ്ടെങ്കിൽ നിർദ്ദിഷ്ട സൈറ്റിന്റെ മണിക്കൂറുകൾ അപ്ഡേറ്റ് ചെയ്യുന്നു
  calculateHoursForSite(targetSiteLog);
}

// 🟢 Invoice Site ഡ്രോപ്പ്ഡൗൺ മാറുമ്പോൾ Invoice ഫോമും ഒപ്പം Site Log Details കാർഡും അപ്ഡേറ്റ് ആകുന്നു
function loadInvoiceForSelectedSite() {
  const selectedSite = document.getElementById("invSiteSelect").value;
  if (!selectedSite) {
    clearInvoiceForm();
    updateSiteLogDetailsCard(null);
    return;
  }

  // തിരഞ്ഞെടുത്ത സൈറ്റിൻ്റെ ശരിയായ Site Log കണ്ടെത്തുന്നു
  if (window.currentActiveSitesList && window.currentActiveSitesList.length > 0) {
    const matchedSiteLog = window.currentActiveSitesList.find(s => s.site_name === selectedSite) || window.currentActiveSitesList[0];
    updateSiteLogDetailsCard(matchedSiteLog);
  }

  const inv = currentInvoices.find((i) => i.site_name === selectedSite);
  if (inv) {
    isEditingInvoice = true;
    document.getElementById("invNo").value = inv.invoice_no || "";
    document.getElementById("invBillNo").value = inv.bill_no || "";
    document.getElementById("invNr").value = inv.bill_nr || "";
    document.getElementById("invOt").value = inv.bill_ot || "";
    document.getElementById("invAmt").value = inv.invoice_amount || "";
  } else {
    isEditingInvoice = false;
    clearInvoiceForm();
  }
}

function clearInvoiceForm() {
  document.getElementById("invNo").value = "";
  document.getElementById("invBillNo").value = "";
  document.getElementById("invNr").value = "";
  document.getElementById("invOt").value = "";
  document.getElementById("invAmt").value = "";
  isEditingInvoice = false;
}

function renderGrid(
  month,
  year,
  plate,
  existingData,
  siteStart,
  siteEnd,
  logs = { drivers: [], sites: [] },
  plateLogs = []
) {
  const tbody = document.getElementById("gridBody");
  tbody.innerHTML = "";
  const siteLogs = logs.sites || [];
  const driverLogs = logs.drivers || [];
  const days = getDaysInMonth(month, year);
  const mIdx = months.indexOf(month);

  const cleanVal = (val) =>
    val === null || val === "null" || val === undefined ? "" : val;

  // 🟢 ആ മാസത്തിൽ പ്ലേറ്റ് നമ്പർ ചേഞ്ച് നടന്നിട്ടുണ്ടോ എന്ന് പരിശോധിക്കുന്നു
  let activeMonthChanges = [];
  if (plateLogs && plateLogs.length > 0) {
    activeMonthChanges = plateLogs.filter(pl => {
      if (!pl.change_date) return false;
      let cDate = new Date(pl.change_date);
      return cDate.getFullYear() === parseInt(year) && cDate.getMonth() === mIdx;
    });
  }

  // 🟢 ശുദ്ധമായ മാസ്റ്റർ പ്ലേറ്റ് നമ്പർ എടുക്കുന്നു (Arrow ചിഹ്നങ്ങൾ പൂർണ്ണമായി ഒഴിവാക്കുന്നു)
  let cleanMasterPlate = plate;
  if (cleanMasterPlate.includes("➔")) cleanMasterPlate = cleanMasterPlate.split("➔").pop().trim();
  else if (cleanMasterPlate.includes("->")) cleanMasterPlate = cleanMasterPlate.split("->").pop().trim();

  for (let i = 1; i <= days; i++) {
    const rowData =
      existingData.find((r) => parseInt(r.record_date) === i) || {};
    let dbDist = cleanVal(rowData.calc_distance);
    if (dbDist !== "") dbDist = parseFloat(dbDist).toFixed(1);

    // 🟢 ടേബിളിൽ കൃത്യമായ ഒരൊറ്റ പ്ലേറ്റ് നമ്പർ മാത്രം വരുന്നു
    let dayPlate = cleanMasterPlate;
    let curDateObj = new Date(parseInt(year), mIdx, i);
    curDateObj.setHours(0, 0, 0, 0);

    if (plateLogs && plateLogs.length > 0) {
      for (let pl of plateLogs) {
        if (!pl.change_date) continue;
        let cParts = String(pl.change_date).split("T")[0].split("-").map(Number);
        let cDate = new Date(cParts[0], cParts[1] - 1, cParts[2]);
        cDate.setHours(0, 0, 0, 0);

        let oPlate = String(pl.old_plate_no || "").trim().toUpperCase();
        let nPlate = String(pl.new_plate_no || "").trim().toUpperCase();

        if (curDateObj < cDate) {
          dayPlate = oPlate;
        } else {
          dayPlate = nPlate;
        }
      }
    }

    let dayName = getDayName(i, month, year);
    let rowClass = dayName === "Fri" ? "row-friday" : "";
    let currentDateObj = new Date(year, mIdx, i);
    currentDateObj.setHours(0, 0, 0, 0);
    let currentSiteStr = document
      .getElementById("dispSite")
      .innerText.split("&")[0]
      .trim()
      .toUpperCase();
    let formattedDate = currentDateObj
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, " ");

    let specialRule = specialRulesCache.find(
      (r) =>
        r.is_active &&
        (r.sites.includes("ALL") || r.sites.includes(currentSiteStr)) &&
        r.dates.includes(formattedDate),
    );

    let displayBd = cleanVal(rowData.bd).toUpperCase();
    if (displayBd === "B") displayBd = "BD";
    else if (displayBd === "N") displayBd = "NW";
    else if (displayBd === "S") displayBd = "NS";

    let ws = cleanVal(rowData.wrk_start);
    let we = cleanVal(rowData.wrk_end);
    let hmr = cleanVal(rowData.hmr_start);
    let rowRemark = cleanVal(rowData.remark);

    if (ws !== "" && we !== "") {
      if (isNaN(parseFloat(displayBd))) {
        displayBd = "";
      }
    }

    let statusCode = getGapStatus(currentDateObj, siteLogs, driverLogs);
    let hasData = displayBd !== "" || ws !== "" || hmr !== "";

    if (!hasData) {
      if (specialRule && specialRule.rule_type !== "FULL_OT") {
        displayBd = specialRule.rule_type;
        rowRemark = specialRule.reason || "";
      } else if (statusCode !== "ACTIVE") {
        displayBd = statusCode;
      }
    }

    let disabledAttr = isReadOnlyMode ? 'disabled style="background-color: #f1f5f9; cursor: not-allowed;"' : '';

    let tr = document.createElement("tr");
    tr.className = rowClass;
    tr.innerHTML = `
      <td><input type="text" class="grid-readonly" value="${dayPlate}" tabindex="-1" readonly style="font-weight:600; color:#0f172a; text-align:center;"></td>
      <td><input type="text" class="grid-readonly" value="${i}" tabindex="-1" readonly></td>
      <td><input type="text" class="grid-readonly" value="${dayName}" tabindex="-1" readonly style="color:#64748b;"></td>
      <td><input type="text" class="grid-input" data-col="wrk_start" data-row="${i}" value="${ws}" ${disabledAttr}></td>
      <td><input type="text" class="grid-input" data-col="wrk_end" data-row="${i}" value="${cleanVal(rowData.wrk_end)}" ${disabledAttr}></td>
      <td><input type="text" class="grid-input" data-col="hmr_start" data-row="${i}" value="${cleanVal(rowData.hmr_start)}" ${disabledAttr}></td>
      <td><input type="text" class="grid-input" data-col="hmr_end" data-row="${i}" value="${cleanVal(rowData.hmr_end)}" ${disabledAttr}></td>
      <td><input type="text" class="grid-input" data-col="fuel" data-row="${i}" value="${cleanVal(rowData.fuel)}" ${disabledAttr}></td>
      <td><input type="text" class="grid-input" data-col="bd" data-row="${i}" value="${displayBd}" ${disabledAttr}></td>
      <td><input type="checkbox" class="grid-input" data-col="nl_checked" data-row="${i}" ${rowData.nl_checked ? "checked" : ""} ${isReadOnlyMode ? 'disabled' : ''}></td>
      <td><input type="text" class="grid-readonly" id="dist_${i}" value="${dbDist}" tabindex="-1" readonly></td>
      <td><input type="text" class="grid-readonly" id="time_${i}" value="${cleanVal(rowData.calc_time)}" tabindex="-1" readonly></td>
      <td><textarea class="grid-input" data-col="remark" data-row="${i}" ${disabledAttr}>${rowRemark}</textarea></td>
      <td><input type="text" class="grid-readonly" id="mod_${i}" value="${cleanVal(rowData.modified_by)}" tabindex="-1" readonly style="font-size: 11px; color: #64748b; background: transparent; text-transform: capitalize;"></td>
    `;
    tbody.appendChild(tr);
  }
  attachGridEvents();
  updateSummaryBox();

  // 🟢 FIX: Grid table render aayi kazhinja shesham Site Summary recalculate cheyyunnu
  if (typeof loadInvoiceForSelectedSite === "function") {
    loadInvoiceForSelectedSite();
  }
}

function updateSummaryBox() {
  let tNormal = 0,
    tOT = 0,
    tTime = 0,
    tDist = 0,
    tFuel = 0,
    logCount = 0;
  const monthStr = document.getElementById("selMonth").value;
  const year = document.getElementById("selYear").value;
  const days = getDaysInMonth(monthStr, year);

  for (let i = 1; i <= days; i++) {
    let tm = parseFloat(document.getElementById(`time_${i}`)?.value) || 0;
    let dt = parseFloat(document.getElementById(`dist_${i}`)?.value) || 0;
    let fl =
      parseFloat(
        document.querySelector(`.grid-input[data-row="${i}"][data-col="fuel"]`)
          ?.value,
      ) || 0;
    let bd =
      document
        .querySelector(`.grid-input[data-row="${i}"][data-col="bd"]`)
        ?.value.trim()
        .toUpperCase() || "";
    let ws =
      document
        .querySelector(`.grid-input[data-row="${i}"][data-col="wrk_start"]`)
        ?.value.trim() || "";
    let we =
      document
        .querySelector(`.grid-input[data-row="${i}"][data-col="wrk_end"]`)
        ?.value.trim() || "";

    let hasLog =
      (bd !== "" && !isNaN(parseFloat(bd))) || (ws !== "" && we !== "");
    if (hasLog) logCount++;

    let dayName = getDayName(i, monthStr, year);
    let siteForSum = document
      .getElementById("dispSite")
      .innerText.split("&")[0]
      .trim()
      .toUpperCase();
    let formattedDateForSum = new Date(year, months.indexOf(monthStr), i)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, " ");

    let sumOtRule = specialRulesCache.find(
      (r) =>
        r.is_active &&
        r.rule_type === "FULL_OT" &&
        (r.sites.includes("ALL") || r.sites.includes(siteForSum)) &&
        r.dates.includes(formattedDateForSum),
    );
    let isFullOT = dayName === "Fri" || i === 31 || !!sumOtRule;
    let normalHr = 0,
      otHr = 0;

    if (bd === "ID" || bd === "NP") {
      if (isFullOT) otHr = 10;
      else normalHr = 10;
    } else if (["BD", "NW", "NS", "NR", "H", "AB", "DC", "SC", "R", "WS", "RE", "FRI", "Fri"].includes(bd)) {
    } else if (tm > 0) {
      if (isFullOT) {
        otHr = tm;
      } else {
        if (tm > 10) {
          normalHr = 10;
          otHr = tm - 10;
        } else {
          normalHr = tm;
        }
      }
    }
    tNormal += normalHr;
    tOT += otHr;
    tDist += dt;
    tFuel += fl;
  }
  tTime = tNormal + tOT;
  document.getElementById("logSheetCount").innerText =
    logCount > 0 ? `( ${logCount} )` : "";
  document.getElementById("sumNormal").innerText = tNormal > 0 ? tNormal : "0";
  document.getElementById("sumOT").innerText = tOT > 0 ? tOT : "0";
  document.getElementById("sumTime").innerText = tTime > 0 ? tTime : "0";
  document.getElementById("sumDist").innerText = tDist.toFixed(1);
  document.getElementById("sumFuel").innerText = tFuel.toFixed(1);

  let mileage = "0.00";
  if (tFuel > 0) mileage = (tDist / tFuel).toFixed(2);
  document.getElementById("sumMileage").innerText = mileage;

  // 🟢 FIX: Main summary update aavumbol Site Summary-yum auto refresh aakunnu
  const curSite = document.getElementById("invSiteSelect")?.value;
  if (curSite && window.currentActiveSitesList && window.currentActiveSitesList.length > 0) {
    const matchedLog = window.currentActiveSitesList.find(s => s.site_name === curSite) || window.currentActiveSitesList[0];
    if (typeof calculateHoursForSite === "function") {
      calculateHoursForSite(matchedLog);
    }
  }
}

function attachGridEvents() {
  const inputs = document.querySelectorAll(".grid-input");
  inputs.forEach((input) => {
    if (input.tagName !== "TEXTAREA") {
      input.addEventListener("keydown", function (e) {
        const row = parseInt(this.getAttribute("data-row"));
        const col = this.getAttribute("data-col");
        let nextEl = null;
        if (e.key === "ArrowDown")
          nextEl = document.querySelector(
            `.grid-input[data-row="${row + 1}"][data-col="${col}"]`,
          );
        else if (e.key === "ArrowUp")
          nextEl = document.querySelector(
            `.grid-input[data-row="${row - 1}"][data-col="${col}"]`,
          );
        else if (
          e.key === "ArrowRight" &&
          this.selectionStart === this.value.length
        ) {
          e.preventDefault();
          let td = this.closest("td").nextElementSibling;
          while (td && !td.querySelector(".grid-input"))
            td = td.nextElementSibling;
          if (td) nextEl = td.querySelector(".grid-input");
        } else if (e.key === "ArrowLeft" && this.selectionStart === 0) {
          e.preventDefault();
          let td = this.closest("td").previousElementSibling;
          while (td && !td.querySelector(".grid-input"))
            td = td.previousElementSibling;
          if (td) nextEl = td.querySelector(".grid-input");
        }
        if (nextEl) nextEl.focus();
      });
    }

    input.addEventListener("focus", function () {
      this.dataset.oldVal = this.type === "checkbox" ? this.checked : this.value;
    });

    input.addEventListener("blur", function () {
      const row = this.getAttribute("data-row");
      const col = this.getAttribute("data-col");
      let currentVal = this.type === "checkbox" ? this.checked : this.value;
      
      if (String(this.dataset.oldVal) !== String(currentVal)) {
        calculateRow(row); 
        const finalVal = this.type === "checkbox" ? this.checked : this.value; 
        saveCellData(row, col, finalVal);
        updateSummaryBox();
        this.dataset.oldVal = finalVal; 
      }
    });

    if (input.type === "checkbox") {
      input.addEventListener("change", function () {
        const row = this.getAttribute("data-row");
        const col = this.getAttribute("data-col");
        let currentVal = this.checked;
        
        if (String(this.dataset.oldVal) !== String(currentVal)) {
          calculateRow(row);
          const finalVal = this.checked;
          saveCellData(row, col, finalVal);
          updateSummaryBox();
          this.dataset.oldVal = finalVal;
        }
      });
    }
  });
}

function parseRailwayTime(val) {
  if (!val) return 0;
  let [hStr, mStr] = String(val).split(".");
  let h = parseInt(hStr) || 0;
  let m = 0;
  if (mStr) {
    mStr = mStr.length === 1 ? mStr + "0" : mStr.substring(0, 2);
    m = parseInt(mStr);
  }
  return h + m / 60;
}

function customRound(val) {
  let h = Math.floor(val);
  let m = Math.round((val - h) * 60);
  return m >= 45 ? h + 1 : h;
}

function calculateRow(rowIdx) {
  const hs = parseFloat(
    document.querySelector(
      `.grid-input[data-row="${rowIdx}"][data-col="hmr_start"]`,
    ).value,
  );
  const he = parseFloat(
    document.querySelector(
      `.grid-input[data-row="${rowIdx}"][data-col="hmr_end"]`,
    ).value,
  );
  let dist = "";
  if (!isNaN(hs) && !isNaN(he)) dist = (he - hs).toFixed(1);
  document.getElementById(`dist_${rowIdx}`).value = dist;

  const ws = document.querySelector(
    `.grid-input[data-row="${rowIdx}"][data-col="wrk_start"]`,
  ).value;
  const we = document.querySelector(
    `.grid-input[data-row="${rowIdx}"][data-col="wrk_end"]`,
  ).value;
  let bdInput = document.querySelector(
    `.grid-input[data-row="${rowIdx}"][data-col="bd"]`,
  );
  let bd = bdInput.value.trim().toUpperCase();

  if (bd === "B") bd = "BD";
  else if (bd === "N") bd = "NW";
  else if (bd === "S") bd = "NS";
  else if (bd === "NR") bd = "NR";
  else if (bd === "F") bd = "Fri";
  
  bdInput.value = bd; 
  let bdCheck = bd.toUpperCase();

  if (ws !== "" && we !== "") {
    if (isNaN(parseFloat(bdCheck)) && bdCheck !== "") {
      bd = "";
      bdInput.value = "";
      saveCellData(rowIdx, "bd", "");
    }
  }

  const nl = document.querySelector(
    `.grid-input[data-row="${rowIdx}"][data-col="nl_checked"]`,
  ).checked;
  const site = document
    .getElementById("dispSite")
    .innerText.split("&")[0]
    .trim()
    .toUpperCase();

  let finalTime = "";
  if (bd) {
    let bdNum = parseFloat(bd);
    if (!isNaN(bdNum)) finalTime = bdNum;
    else if (["ID", "NP"].includes(bdCheck)) finalTime = 10;
      else if (["BD", "NW", "NS", "NR", "H", "AB", "DC", "SC", "R", "WS", "RE", "FRI"].includes(bdCheck))
        finalTime = 0;
    } else if (ws && we) {
    let sHour = parseRailwayTime(ws);
    let eHour = parseRailwayTime(we);
    let diff = eHour - sHour;
    if (diff < 0) diff += 24;

    let endIsMorning = eHour >= 6 && eHour <= 12.5;
    let isNightShift = sHour >= 15 || endIsMorning;

    let monthStr = document.getElementById("selMonth").value;
    let year = document.getElementById("selYear").value;
    let currentDate = new Date(year, months.indexOf(monthStr), rowIdx);

    let formattedDateForOT = currentDate
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, " ");

    let otRule = specialRulesCache.find(
      (r) =>
        r.is_active &&
        r.rule_type === "FULL_OT" &&
        (r.sites.includes("ALL") || r.sites.includes(site)) &&
        r.dates.includes(formattedDateForOT),
    );

    let breakOverlap = 0;
    let activeBreakRule = breakRulesCache.find((r) => {
      if (!r.is_active) return false;
      let sitesArray = [];
      try {
        sitesArray =
          typeof r.sites === "string" ? JSON.parse(r.sites) : r.sites;
      } catch (e) {
        sitesArray = [];
      }

      let siteMatch =
        sitesArray.includes("ALL") ||
        sitesArray.some((keyword) => site.includes(keyword));

      if (!siteMatch) return false;
      let ruleStart = new Date(r.start_date);
      ruleStart.setHours(0, 0, 0, 0);
      let ruleEnd = new Date(r.end_date);
      ruleEnd.setHours(23, 59, 59, 999);
      return currentDate >= ruleStart && currentDate <= ruleEnd;
    });

    if (activeBreakRule && !isNightShift) {
      let bStart = parseRailwayTime(activeBreakRule.break_start);
      let bEnd = parseRailwayTime(activeBreakRule.break_end);
      let overlapStart = Math.max(sHour, bStart);
      let overlapEnd = Math.min(eHour, bEnd);
      if (overlapStart < overlapEnd) breakOverlap = overlapEnd - overlapStart;
    }

    if (nl || !!otRule) {
      finalTime = customRound(diff);
    } else if (activeBreakRule && !isNightShift) {
      finalTime = customRound(diff - breakOverlap);
    } else if (isNightShift) {
      finalTime = customRound(diff);
    } else {
      let rule =
        rulesCache.find((r) => site.includes(r.site_keyword)) ||
        rulesCache.find((r) => r.site_keyword === "DEFAULT");
      let deduction = rule ? rule.default_deduct : 1;
      if (rule && diff <= 11) deduction = rule.deduct_under_11;
      else if (rule && diff >= 12) deduction = rule.deduct_over_12;
      finalTime = customRound(diff - deduction);
    }
  }
  document.getElementById(`time_${rowIdx}`).value = finalTime;
}

let saveTimeout;
let pendingSaves = 0; 


window.addEventListener("beforeunload", function (e) {
  if (pendingSaves > 0) {
    e.preventDefault();
    e.returnValue = "Data is still saving. Are you sure you want to leave?";
    return e.returnValue;
  }
});


window.addEventListener("pagehide", function () {
  releaseLock();
});

async function saveCellData(rowIdx, colName, colValue) {
  const mainPlateInput = document.getElementById("selPlate");
  let p = mainPlateInput.dataset.actualPlate || mainPlateInput.value.trim().toUpperCase();
  if (p.includes("➔")) p = p.split("➔").pop().trim();
  else if (p.includes("->")) p = p.split("->").pop().trim();

  const plate = p;
  if (!plate || !colName) return;

  pendingSaves++; 
  const statusLabel = document.getElementById("saveStatus");
  statusLabel.innerText = "Saving...";
  statusLabel.className = "save-indicator status-saving";

  const calc_distance = document.getElementById(`dist_${rowIdx}`).value || null;
  const calc_time = document.getElementById(`time_${rowIdx}`).value || null;

  const payload = {
    month: document.getElementById("selMonth").value,
    year: document.getElementById("selYear").value,
    plate_no: plate,
    record_date: rowIdx,
    col_name: colName,
    col_value: colValue,
    calc_distance: calc_distance,
    calc_time: calc_time,
  };

  try {
    const response = await fetch("/timesheet/api/upsert-grid-cell", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
      keepalive: true 
    });

    if (response.status === 401 || response.status === 403) {
      openTimesheetReLoginModal(() => saveCellData(rowIdx, colName, colValue));
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Database rejected the save. Possible sync issue.");
    }

    try {
      const user = JSON.parse(localStorage.getItem("timesheetUser"));
      if (user && user.username) {
        const modInput = document.getElementById(`mod_${rowIdx}`);
        if (modInput) modInput.value = user.username;
      }
    } catch (e) {}

    clearTimeout(saveTimeout);
    statusLabel.innerText = "✓ Saved";
    statusLabel.className = "save-indicator status-saved";
    saveTimeout = setTimeout(() => {
      statusLabel.className = "save-indicator";
    }, 2000);

    try {
      const user = JSON.parse(localStorage.getItem("timesheetUser"));
      const mIdx = months.indexOf(payload.month) + 1;
      const padMonth = String(mIdx).padStart(2, "0");
      const padDay = String(rowIdx).padStart(2, "0");
      const formattedDate = `${payload.year}-${padMonth}-${padDay}`;
      const logKey = `${payload.plate_no}_${formattedDate}`;

      if (!loggedRowsTracker.has(logKey)) {
        loggedRowsTracker.add(logKey);
        await fetch("/api/entrylog/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("timesheetToken")}`,
          },
          body: JSON.stringify({
            username: user ? user.username : "Unknown",
            plate_number: payload.plate_no,
            entry_date: formattedDate,
            action: "UPDATE",
          }),
          keepalive: true
        });
      }
    } catch (logErr) {}
  } catch (e) {
    console.error("Strict Save Error:", e);
    statusLabel.innerText = "Error";
    statusLabel.style.backgroundColor = "#dc3545";
    
    await customAlert("CRITICAL ERROR: Data failed to save securely to the database. To prevent data loss, your session will be closed. Reason: " + (e.message || "Server Connection Error"), "Database Error");
    logout(); 
  } finally {
    pendingSaves = Math.max(0, pendingSaves - 1); 
  }
}

// 🟢 NEW: Navbar-ലെ 🔒 Lock ഐക്കണിൽ ക്ലിക്ക് ചെയ്യുമ്പോൾ അൺലോക്ക് പോപ്പ്-അപ്പ് ഓപ്പൺ ആകുന്നു
function openPeriodUnlockModal() {
  if (systemLockData && systemLockData.month && systemLockData.year) {
    customAlert(`The period up to ${systemLockData.month} ${systemLockData.year} is locked. You cannot edit this data without unlocking.`, "Period Locked 🔒");
  }
}

function customAlert(message, title = "Notice") {
  return new Promise((resolve) => {
    document.getElementById("customAlertTitle").innerText = title;
    document.getElementById("customAlertTitle").style.color = (title.includes("Success") || title.includes("Unlocked") || title.includes("Transferred")) ? "#10b981" : "#ef4444";
    document.getElementById("customAlertMessage").innerText = message;
    
    const logoutBtn = document.getElementById("alertLogoutBtn");
    const unlockBtn = document.getElementById("alertUnlockBtn");
    const reqOtpBtn = document.getElementById("alertRequestOtpBtn");
    const okBtn = document.getElementById("alertOkBtn");
    const closeBtn = document.getElementById("alertCloseBtn");
    const otpInput = document.getElementById("gridUnlockInput");
    
    if (logoutBtn) {
      if (title === "Database Error" || title === "Connection Error") {
        logoutBtn.style.display = "inline-block";
      } else {
        logoutBtn.style.display = "none";
      }
    }

    if (unlockBtn && reqOtpBtn && otpInput) {
      if (title === "Period Locked" || title === "Period Locked 🔒") {
        unlockBtn.style.display = "inline-block";
        reqOtpBtn.style.display = "inline-block";
        otpInput.style.display = "none"; 
        otpInput.value = ""; 
        if (okBtn) okBtn.style.display = "none"; // 🟢 OK ബട്ടൺ മറയ്ക്കുന്നു
        if (closeBtn) closeBtn.style.display = "inline-block"; // 🟢 Close ബട്ടൺ കാണിക്കുന്നു
      } else {
        unlockBtn.style.display = "none";
        reqOtpBtn.style.display = "none";
        otpInput.style.display = "none";
        if (okBtn) okBtn.style.display = "inline-block";
        if (closeBtn) closeBtn.style.display = "none";
      }
    }
    
    document.getElementById("customAlertModal").style.display = "flex";
    window.closeCustomAlert = function () {
      document.getElementById("customAlertModal").style.display = "none";
      resolve();
    };
  });
}

// --------------------------------------------------------
// 🟢 OTP & UNLOCK FUNCTIONS
// --------------------------------------------------------

async function requestOtpFromGrid() {
  const btn = document.getElementById("alertRequestOtpBtn");
  btn.disabled = true;
  btn.innerText = "Sending...";
  try {
      const token = localStorage.getItem("timesheetToken");
      const res = await fetch("/api/lock/request-unlock", {
          method: "POST",
          headers: { Authorization: "Bearer " + token }
      });
      const data = await res.json();
      
      if(data.success) {
          document.getElementById("customAlertTitle").innerText = "OTP Sent 📩";
          document.getElementById("customAlertTitle").style.color = "#3b82f6";
          document.getElementById("customAlertMessage").innerText = data.message;
          document.getElementById("gridUnlockInput").style.display = "block";
          document.getElementById("gridUnlockInput").focus();
      } else {
          document.getElementById("customAlertMessage").innerText = data.message;
      }
  } catch(e) {
      document.getElementById("customAlertMessage").innerText = "Network issue while sending OTP.";
  } finally {
      btn.disabled = false;
      btn.innerText = "📩 Req OTP";
  }
}

async function triggerGridUnlock() {
  const otpInput = document.getElementById("gridUnlockInput");
  
  if (otpInput && otpInput.style.display === "none") {
      otpInput.style.display = "block";
      otpInput.focus();
      return; 
  }

  const code = otpInput ? otpInput.value.trim() : "";
  
  if (!code) {
      if (otpInput) {
          otpInput.style.borderColor = "#ef4444";
          otpInput.placeholder = "Enter Code First!";
          setTimeout(() => {
              otpInput.style.borderColor = "#cbd5e1";
              otpInput.placeholder = "Enter OTP or Master Code";
          }, 2000);
      }
      return;
  }

  const btn = document.getElementById("alertUnlockBtn");
  btn.disabled = true;
  btn.innerText = "Wait...";

  try {
      const token = localStorage.getItem("timesheetToken");
      const res = await fetch("/api/lock/verify-unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ code })
      });
      const data = await res.json();
      
      if (data.success) {
          closeCustomAlert(); 
          await customAlert("System unlocked successfully! You can now edit the data.", "Success");
          
          systemLockData = { month: null, year: null }; 
          
          document.querySelectorAll(".grid-input").forEach(el => {
              el.disabled = false;
              el.style.backgroundColor = ""; 
              el.style.cursor = "text";
              el.style.color = "";
              el.style.opacity = "1"; 
          });
          
          const invBtn = document.querySelector(".btn-inv-save");
          if(invBtn) {
              invBtn.disabled = false;
              invBtn.style.opacity = "1";
              invBtn.innerText = "Save Invoice Data";
          }
      } else {
          if (otpInput) {
              otpInput.value = "";
              otpInput.style.borderColor = "#ef4444";
              otpInput.placeholder = "Invalid Code!";
              setTimeout(() => {
                  otpInput.style.borderColor = "#cbd5e1";
                  otpInput.placeholder = "Enter OTP or Master Code";
              }, 2000);
          }
      }
  } catch (e) {
      document.getElementById("customAlertMessage").innerText = "Verification failed. Check network.";
  } finally {
      btn.disabled = false;
      btn.innerText = "🔑 Unlock";
  }
}

function customPrompt(message, isPassword = false, title = "Input Required") {
  return new Promise((resolve) => {
    document.getElementById("customPromptTitle").innerText = title;
    document.getElementById("customPromptMessage").innerText = message;
    const inputEl = document.getElementById("customPromptInput");
    inputEl.type = isPassword ? "password" : "text";
    inputEl.value = "";
    document.getElementById("customPromptModal").style.display = "flex";
    inputEl.focus();
    window.submitCustomPrompt = function () {
      const val = inputEl.value;
      document.getElementById("customPromptModal").style.display = "none";
      resolve(val);
    };
    window.closeCustomPrompt = function () {
      document.getElementById("customPromptModal").style.display = "none";
      resolve(null);
    };
  });
}

async function saveInvoiceData() {
  const plate_no = document
    .getElementById("selPlate")
    .value.trim()
    .toUpperCase();
  if (!plate_no) {
    await customAlert("Please fetch a Plate Number first.", "Action Required");
    return;
  }
  const site_name = document.getElementById("invSiteSelect").value;
  if (!site_name) {
    await customAlert("Please select a Site before saving.", "Action Required");
    return;
  }
  const month =
    document.getElementById("selMonth").value +
    " " +
    document.getElementById("selYear").value;
  const invoice_no = document.getElementById("invNo").value.trim();
  const bill_no = document.getElementById("invBillNo").value.trim();
  const bill_nr = document.getElementById("invNr").value.trim();
  const bill_ot = document.getElementById("invOt").value.trim();
  const invoice_amount = document.getElementById("invAmt").value.trim();

  if (!invoice_no || !bill_nr) {
    await customAlert(
      "Invoice Number and Bill N.Hr are mandatory!",
      "Validation Error",
    );
    return;
  }

  let edit_reason = "";
  if (isEditingInvoice) {
    let code = await customPrompt(
      "Enter Secret Code to edit existing record:",
      true,
      "Security Check",
    );
    if (code !== "imissu") {
      await customAlert(
        "Incorrect Secret Code. Editing cancelled.",
        "Access Denied",
      );
      return;
    }
    edit_reason = await customPrompt(
      "Please enter the reason for editing:",
      false,
      "Edit Reason",
    );
    if (!edit_reason || edit_reason.trim() === "") {
      await customAlert("Edit reason is required!", "Validation Error");
      return;
    }
  }

  const payload = {
    plate_no,
    month,
    site_name,
    invoice_no,
    bill_no,
    bill_nr,
    bill_ot,
    invoice_amount,
    edit_reason,
  };
  try {
    const res = await fetch("/payment/save-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      await customAlert(data.message, "Success");
      isEditingInvoice = true;
      let existingIdx = currentInvoices.findIndex(
        (i) => i.site_name === site_name,
      );
      if (existingIdx > -1) currentInvoices[existingIdx] = payload;
      else currentInvoices.push(payload);
    } else {
      await customAlert("Error: " + data.message, "Error");
    }
  } catch (e) {
    await customAlert(
      "Failed to save data. Check connection.",
      "Network Error",
    );
  }
}

function savePlateHistory(plate) {
  if (!plate) return;
  let history = JSON.parse(localStorage.getItem("plateSearchHistory") || "[]");
  history = history.filter((p) => p !== plate);
  history.unshift(plate);
  if (history.length > 30) history = history.slice(0, 30);
  localStorage.setItem("plateSearchHistory", JSON.stringify(history));
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById("userDropdownMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

// 🟢 NEW: Options dropdown menu toggle function
function toggleOptionsMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById("optionsDropdownMenu");
  if (menu) {
    menu.style.display = menu.style.display === "flex" ? "none" : "flex";
  }
}

document.addEventListener("click", function (e) {
  if (!e.target.closest(".user-profile-container")) {
    const menu = document.getElementById("userDropdownMenu");
    if (menu) menu.style.display = "none";
  }
  // 🟢 NEW: Options menu purathu click cheyyumbol close aavunnu
  if (!e.target.closest(".options-dropdown-container")) {
    const optMenu = document.getElementById("optionsDropdownMenu");
    if (optMenu) optMenu.style.display = "none";
  }
  // 🟢 പുറത്ത് ക്ലിക്ക് ചെയ്യുമ്പോൾ suggestions ക്ലോസ് ആകാൻ
  if (!e.target.closest(".autocomplete-container")) {
    const sug = document.getElementById("plateSuggestions");
    if (sug) sug.style.display = "none";
  }
});

// 🟢 ഇൻപുട്ടിൽ ഫോക്കസ് ചെയ്യുമ്പോഴും ക്ലിക്ക് ചെയ്യുമ്പോഴും suggestions ഉടൻ വരാൻ
document.getElementById("selPlate").addEventListener("focus", searchPlate);
document.getElementById("selPlate").addEventListener("click", searchPlate);
function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("timesheetTheme", isDark ? "dark" : "light");
  document.getElementById("userDropdownMenu").style.display = "none";
}
function logout() {
  releaseLock(); 
  localStorage.removeItem("timesheetToken");
  localStorage.removeItem("timesheetUser");
  
  const currentPage = encodeURIComponent(
    window.location.pathname.split("/").pop() + window.location.search
  );
  
  setTimeout(() => {
    window.location.href = "index.html?redirect=" + currentPage;
  }, 300);
}

(function initTheme() {
  const savedTheme = localStorage.getItem("timesheetTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
})();

async function exportExcel() {
  const token = localStorage.getItem("timesheetToken");
  const m = document.getElementById("bulkMonth").value;
  const y = document.getElementById("bulkYear").value;
  try {
    const res = await fetch(`/timesheet/api/grid-data?month=${m}&year=${y}`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    let ws_data = [
      [
        "Plate No",
        "Date",
        "Wrk Start",
        "Wrk end",
        "HMR Start",
        "HMR End",
        "Fuel",
        "BD",
        "Remark",
        "NL",
        "Distance",
        "Time",
      ],
    ];
    if (data.success && data.data && data.data.length > 0) {
      data.data.forEach((row) => {
        ws_data.push([
          row.plate_no,
          row.record_date,
          row.wrk_start || "",
          row.wrk_end || "",
          row.hmr_start || "",
          row.hmr_end || "",
          row.fuel || "",
          row.bd || "",
          row.remark || "",
          row.nl_checked ? "TRUE" : "FALSE",
          row.calc_distance || "",
          row.calc_time || "",
        ]);
      });
    } else {
      ws_data.push([
        "EXAMPLE-123",
        "1",
        "6.00",
        "18.00",
        "1000",
        "1150",
        "150",
        "",
        "Sample Entry",
        "FALSE",
        "",
        "",
      ]);
      await customAlert(
        "Notice",
        "No data found for this month. Exporting blank template.",
      );
    }
    var ws = XLSX.utils.aoa_to_sheet(ws_data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
    var wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
    let blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    let url = window.URL.createObjectURL(blob);
    let a = document.createElement("a");
    document.body.appendChild(a);
    a.href = url;
    a.download = `Timesheet_DailyData_${m}_${y}.xlsx`;
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    customAlert("Error", "Failed to export data. Check server connection.");
  }
}

function s2ab(s) {
  var buf = new ArrayBuffer(s.length);
  var view = new Uint8Array(buf);
  for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
  return buf;
}

async function importExcel() {
  const file = document.getElementById("excelFile").files[0];
  if (!file) {
    customAlert("Warning", "Please select an Excel file first.");
    return;
  }
  const m = document.getElementById("bulkMonth").value;
  const y = document.getElementById("bulkYear").value;
  const sts = document.getElementById("importStatus");
  sts.innerText = "Parsing Excel... Please wait.";
  sts.style.color = "#ffc107";
  sts.style.backgroundColor = "#fff3cd";
  sts.style.border = "1px solid #ffe69c";

  const token = localStorage.getItem("timesheetToken");
  let rules = [];
  let spRules = [];
  let bkRules = [];
  try {
    const rRes = await fetch("/timesheet/api/rules", {
      headers: { Authorization: "Bearer " + token },
    });
    const rData = await rRes.json();
    if (rData.success) rules = rData.data;

    let vInfo = [];
    const vRes = await fetch("/timesheet/api/vehicle-info", {
      headers: { Authorization: "Bearer " + token },
    });
    const vData = await vRes.json();
    if (vData.success) vInfo = vData.data;

    const srRes = await fetch("/timesheet/api/special-rules", {
      headers: { Authorization: "Bearer " + token },
    });
    const srData = await srRes.json();
    if (srData.success) spRules = srData.data;

    const brRes = await fetch("/timesheet/api/break-rules", {
      headers: { Authorization: "Bearer " + token },
    });
    const brData = await brRes.json();
    if (brData.success) bkRules = brData.data;

    function calcRowDistTime(row, site, recordDate) {
      let hs = parseFloat(row["HMR Start"]);
      let he = parseFloat(row["HMR End"]);
      let dist = null;
      if (!isNaN(hs) && !isNaN(he)) dist = (he - hs).toFixed(2);
      let finalTime = null;
      let ws = String(row["Wrk Start"] || "").trim();
      let we = String(row["Wrk end"] || "").trim();
      let bd = String(row["BD"] || "")
        .trim()
        .toUpperCase();
      
      if (bd === "B") bd = "BD";
      else if (bd === "N") bd = "NW";
      else if (bd === "S") bd = "NS";
      else if (bd === "NR") bd = "NR";
      else if (bd === "F") bd = "FRI";

      let nlRaw = String(row["NL"]).trim().toUpperCase();
      let nl = nlRaw === "TRUE" || nlRaw === "Y" || nlRaw === "1";

      if (ws && we && isNaN(parseFloat(bd))) {
        bd = "";
      }

      if (bd) {
        let bdNum = parseFloat(bd);
        if (!isNaN(bdNum)) finalTime = bdNum;
        else if (["ID", "NP"].includes(bd)) finalTime = 10;
        else if (["BD", "NW", "NS", "NR", "H", "FRI"].includes(bd)) finalTime = 0;
      } else if (ws && we) {
        let parseRT = (val) => {
          let [hStr, mStr] = String(val).split(".");
          let h = parseInt(hStr) || 0;
          let m = 0;
          if (mStr) {
            mStr = mStr.length === 1 ? mStr + "0" : mStr.substring(0, 2);
            m = parseInt(mStr);
          }
          return h + m / 60;
        };
        let sHour = parseRT(ws);
        let eHour = parseRT(we);
        let diff = eHour - sHour;
        if (diff < 0) diff += 24;
        let cRound = (val) => {
          let h = Math.floor(val);
          let mm = Math.round((val - h) * 60);
          return mm >= 45 ? h + 1 : h;
        };

        let endIsMorning = eHour >= 6 && eHour <= 12.5;
        let isNightShift = sHour >= 15 || endIsMorning;
        let currentDate = new Date(y, months.indexOf(m), parseInt(recordDate));
        let formattedDateForOT = currentDate
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(/ /g, " ");

        let otRule = spRules.find(
          (r) =>
            r.is_active &&
            r.rule_type === "FULL_OT" &&
            (r.sites.includes("ALL") || r.sites.includes(site)) &&
            r.dates.includes(formattedDateForOT),
        );

        let breakOverlap = 0;
        let activeBreakRule = bkRules.find((r) => {
          if (!r.is_active) return false;
          let sitesArray = [];
          try {
            sitesArray =
              typeof r.sites === "string" ? JSON.parse(r.sites) : r.sites;
          } catch (e) {
            sitesArray = [];
          }

          let siteMatch =
            sitesArray.includes("ALL") ||
            sitesArray.some((keyword) => site.includes(keyword));

          if (!siteMatch) return false;
          let ruleStart = new Date(r.start_date);
          ruleStart.setHours(0, 0, 0, 0);
          let ruleEnd = new Date(r.end_date);
          ruleEnd.setHours(23, 59, 59, 999);
          return currentDate >= ruleStart && currentDate <= ruleEnd;
        });

        if (activeBreakRule && !isNightShift) {
          let bStart = parseRT(activeBreakRule.break_start);
          let bEnd = parseRT(activeBreakRule.break_end);
          let overlapStart = Math.max(sHour, bStart);
          let overlapEnd = Math.min(eHour, bEnd);
          if (overlapStart < overlapEnd)
            breakOverlap = overlapEnd - overlapStart;
        }

        if (nl || !!otRule) {
          finalTime = cRound(diff);
        } else if (activeBreakRule && !isNightShift) {
          finalTime = cRound(diff - breakOverlap);
        } else if (isNightShift) {
          finalTime = cRound(diff);
        } else {
          let rule =
            rules.find((r) => site.includes(r.site_keyword)) ||
            rules.find((r) => r.site_keyword === "DEFAULT");
          let ded = rule ? rule.default_deduct : 1;
          if (rule && diff <= 11) ded = rule.deduct_under_11;
          else if (rule && diff >= 12) ded = rule.deduct_over_12;
          finalTime = cRound(diff - ded);
        }
      }
      return { dist, finalTime };
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });
      let processedRecords = [];
      jsonData.forEach((row) => {
        let pNo = String(row["Plate No"]).trim();
        let rDateRaw = String(row["Date"]).trim();
        let rDate = parseInt(rDateRaw);
        if (
          !pNo ||
          isNaN(rDate) ||
          rDate < 1 ||
          rDate > 31 ||
          pNo.includes("EXAMPLE")
        )
          return;
        let vehicle = vInfo.find((v) => v.plate_no === pNo);
        let site = vehicle ? (vehicle.site_name || "").toUpperCase() : "";
        let calcRes = calcRowDistTime(row, site, rDate);
        let nlRaw = String(row["NL"]).trim().toUpperCase();
        let isNlChecked = nlRaw === "TRUE" || nlRaw === "Y" || nlRaw === "1";
        processedRecords.push({
          month: m,
          year: y,
          plate_no: pNo,
          record_date: rDate.toString(),
          wrk_start: String(row["Wrk Start"]).trim() || null,
          wrk_end: String(row["Wrk end"]).trim() || null,
          hmr_start: String(row["HMR Start"]).trim() || null,
          hmr_end: String(row["HMR End"]).trim() || null,
          fuel: String(row["Fuel"]).trim() || null,
          bd: String(row["BD"]).trim() || null,
          remark: String(row["Remark"]).trim() || "",
          nl_checked: isNlChecked,
          calc_distance: calcRes.dist,
          calc_time: calcRes.finalTime,
        });
      });

      if (processedRecords.length === 0) {
        sts.innerText = "No valid data found in Excel.";
        sts.style.color = "#842029";
        sts.style.backgroundColor = "#f8d7da";
        return;
      }
      sts.innerText = `Saving ${processedRecords.length} exact records...`;
      try {
        const sendRes = await fetch("/timesheet/api/bulk-import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ records: processedRecords }),
        });
        const resData = await sendRes.json();
        if (sendRes.ok && resData.success) {
          sts.innerText = "✓ Import Successful! Zero Errors.";
          sts.style.color = "#0f5132";
          sts.style.backgroundColor = "#d1e7dd";
          document.getElementById("excelFile").value = "";
        } else {
          sts.innerText = "Error: " + (resData.message || "Upload Failed");
          sts.style.color = "#842029";
          sts.style.backgroundColor = "#f8d7da";
        }
      } catch (err) {
        sts.innerText = "Network Error: Check Server connection.";
        sts.style.color = "#842029";
        sts.style.backgroundColor = "#f8d7da";
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    sts.innerText = "Error initializing process. Try again.";
    sts.style.color = "#842029";
    sts.style.backgroundColor = "#f8d7da";
  }
}

init();

// ==========================================
// 🔒 LOCK PERIOD CHECKER (UPDATED)
// ==========================================
async function applyLockStatus(selectedMonthStr, selectedYearStr, silent = false) {
    try {
        const ts = new Date().getTime();
        const lRes = await fetch(`/api/lock/status?_t=${ts}`, { headers: { Authorization: "Bearer " + token }});
        
        if (lRes.status === 401 || lRes.status === 403) {
            await customAlert("Session expired due to inactivity. Please login again to prevent data loss.", "Session Timeout");
            logout();
            return;
        }

        const lData = await lRes.json();
        if (lData.success && lData.data && lData.data.lock_month) {
            systemLockData = { month: lData.data.lock_month, year: lData.data.lock_year };
        } else {
            systemLockData = { month: null, year: null };
        }
    } catch (e) {
        console.error("Lock fetch error:", e);
    }

    const sYear = parseInt(selectedYearStr);
    const sMonthIdx = months.indexOf(selectedMonthStr);
    const lockYear = systemLockData.year ? parseInt(systemLockData.year) : 0;
    const lockMonthIdx = systemLockData.month ? months.indexOf(systemLockData.month) : -1;

    const selectedAbsolute = (sYear * 12) + sMonthIdx;
    const lockAbsolute = (lockYear * 12) + lockMonthIdx;

    const isCurrentlyLockedInDB = systemLockData.month && systemLockData.year && (selectedAbsolute <= lockAbsolute);
    
    if (isCurrentlyLockedInDB) {
        document.querySelectorAll(".grid-input").forEach(el => {
            el.disabled = true;
            el.style.backgroundColor = "transparent"; 
            el.style.cursor = "not-allowed";
            el.style.color = "Black";
            el.style.opacity = "0.9"; 
        });
        
        const invBtn = document.querySelector(".btn-inv-save");
        if (invBtn) {
            invBtn.disabled = true;
            invBtn.style.opacity = "0.5";
            invBtn.innerText = "🔒 Locked Period";
        }
        
        // 🟢 പീരിയഡ് ലോക്ക്ഡ് ആണെങ്കിൽ Pending-ന് അരികിൽ 🔒 ഐക്കൺ ദൃശ്യമാക്കുന്നു
        const lockBtn = document.getElementById("btnPeriodLock");
        if (lockBtn) lockBtn.style.display = "inline-block";

        // (ഓട്ടോമാറ്റിക് പോപ്പ്-അപ്പ് പൂർണ്ണമായും ഒഴിവാക്കി, ഉപയോക്താവിന് സുഗമമായി റീഡ്-മോഡിൽ ഡാറ്റ കാണാം)
    } else {
        // 🟢 അൺലോക്ക്ഡ് ആണെങ്കിൽ 🔒 ഐക്കൺ മറയ്ക്കുന്നു
        const lockBtn = document.getElementById("btnPeriodLock");
        if (lockBtn) lockBtn.style.display = "none";

        if (isReadOnlyMode) return;

        let isUIDisabled = document.querySelector(".grid-input")?.disabled === true;
        if (isUIDisabled) {
            document.querySelectorAll(".grid-input").forEach(el => {
                el.disabled = false;
                el.style.backgroundColor = ""; 
                el.style.cursor = "text";
                el.style.color = "";
                el.style.opacity = "1"; 
            });
            
            const invBtn = document.querySelector(".btn-inv-save");
            if(invBtn) {
                invBtn.disabled = false;
                invBtn.style.opacity = "1";
                invBtn.innerText = "Save Invoice Data";
            }
        }
    }
}

window.addEventListener("focus", async () => {
});


// ==========================================
// 🟢 LIVE LOCK TRANSFER & POLLING LOGIC
// ==========================================

function startRecordPoll(p, m, y) {
  clearInterval(recordPollTimer);
  const generation = ++recordPollGeneration;
  let pollInFlight = false;
  recordPollTimer = setInterval(async () => {
    if (pollInFlight) return;
      pollInFlight = true;
      try {
          const ts = new Date().getTime(); 
          const params = new URLSearchParams({ plate: p, month: m, year: y, _t: ts });
          const res = await fetch(`/timesheet/api/record-lock/poll?${params}`, {
              headers: { 
                  "Authorization": "Bearer " + token,
                  "Cache-Control": "no-cache",
                  "Pragma": "no-cache"
              },
              cache: "no-store"
          });
          const data = await res.json();
           if (generation !== recordPollGeneration || !res.ok || data.success === false) return;

          const isMe = data.isOwner;
          const isRequestedByMe = data.requestedByMe;
          const isRejected = data.requestedBy === "REJECTED";

          if (!data.locked) {
               if (currentLockedRecord && !isReadOnlyMode) {
                  const claimRes = await fetch('/timesheet/api/record-lock/request', {
                      method: 'POST',
                      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                      body: JSON.stringify({ plate: p, month: m, year: y })
                  });
                  const claim = await claimRes.json();
                  if (generation !== recordPollGeneration) return;
                  if (claim.success) return;
                  if (claim.lockedBy) {
                      data.locked = true;
                      data.owner = claim.lockedBy;
                  } else {
                      return;
                  }
              } else {
                  return;
              }
          }

          if (isMe && data.owner) {
              currentLockedRecord = { plate: p, month: m, year: y };

              if (isReadOnlyMode) {
                  isReadOnlyMode = false;
                  amIWaitingForApproval = false;
                  resetBellButton();
                  document.getElementById("btnRequestEdit").style.display = "none";
                   clearInterval(recordPollTimer);
                  
                  Swal.fire({
                      title: "Access Granted! 🔓",
                      text: "You now have full edit access.",
                      icon: "success",
                      timer: 1500,
                      showConfirmButton: false
                  }).then(() => {
                      if (generation === recordPollGeneration) triggerFetch();
                  });
                  return;
              }

              if (data.requestedBy && data.requestedBy !== "REJECTED" && !incomingRequestActive) {
                  incomingRequestActive = true;
                  playTransferAlertSound();
                  showTransferRequestPopup(data.requestedBy, p, m, y);
              }
         return;
          }

          if (data.owner) {
              if (!isReadOnlyMode) {
                  isReadOnlyMode = true;
                  currentLockedRecord = null;
                  makeGridReadOnlyLive();
                  Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'info',
                    title: 'Access Transferred',
                    text: 'You are now in Read-Only mode.',
                    showConfirmButton: false,
                    timer: 4000,
                    timerProgressBar: true
                  });
              }
              const requestButton = document.getElementById("btnRequestEdit");
              requestButton.style.display = "inline-block";
              if (!amIWaitingForApproval) resetBellButton();

              // 3. I AM THE REQUESTER WAITING FOR RESPONSE
              if (amIWaitingForApproval) {
                  if (isRejected) {
                      // 🟢 Request was REJECTED by Active User
                      amIWaitingForApproval = false;
                      resetBellButton(); // 🟢 ടൈമർ നിർത്തി പഴയ ബെൽ തിരികെ വെക്കുന്നു
                      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Request Rejected by the active user.", showConfirmButton: false, timer: 4000 });
                      
                      // Clear rejection state on backend
                      fetch("/timesheet/api/record-lock/clear-rejection", {
                          method: 'POST',
                          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                          body: JSON.stringify({ plate: p, month: m, year: y })
                      });
                  } else if (isRequestedByMe) {
                      // 🟢 Waiting for 30s Timeout
                      if (data.requestTime && (Date.now() - data.requestTime >= 30000)) {
                          forceClaimLock(p, m, y); 
                      }
                  } else if (!data.requestedBy) {
                      // 🟢 FAILSAFE: Active user closed tab or lock released naturally
                      amIWaitingForApproval = false;
                        resetBellButton();
                  }
              }
          }
      } catch (e) {
          console.error("Record lock poll failed:", e);
      } finally {
          pollInFlight = false;
      }
  }, 5000); 
}

// 🟢 FIX: ബാക്ക്‌ഗ്രൗണ്ട് വഴി അറിയാതെ ലോക്ക് റീ-ക്ലെയിം ചെയ്യുന്നത് ഒഴിവാക്കി
async function claimLockSilently(p, m, y) {
  // Disabled to prevent stealing lock back from active user
  return;
}

// 🟢 ബെൽ ബട്ടൺ കൗണ്ട്ഡൗൺ നിർത്തി പഴയ ബെൽ ഐക്കൺ (🔔) ആക്കുന്ന ഫംഗ്ഷൻ
function resetBellButton() {
  if (editCountdownInterval) {
    clearInterval(editCountdownInterval);
    editCountdownInterval = null;
  }
  const btn = document.getElementById("btnRequestEdit");
  if (btn) {
    btn.innerText = "🔔";
    btn.style.opacity = "1";
    btn.disabled = false;
  }
}

async function requestEditAccess() {
  const plateInput = document.getElementById("selPlate");
  let p = plateInput.dataset.actualPlate || plateInput.value.trim().toUpperCase();
  if (p.includes("➔")) p = p.split("➔").pop().trim();
  else if (p.includes("->")) p = p.split("->").pop().trim();
  const m = document.getElementById("selMonth").value;
  const y = document.getElementById("selYear").value;
  
  const btn = document.getElementById("btnRequestEdit");
  btn.style.opacity = "0.7";
  btn.disabled = true;

  try {
      const res = await fetch("/timesheet/api/record-lock/request-transfer", {
          method: 'POST',
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ plate: p, month: m, year: y })
      });
      const data = await res.json();
      if(data.success) {
          Swal.fire({ toast: true, position: "top-end", icon: "info", title: "Request sent. Waiting for approval...", showConfirmButton: false, timer: 3000 });
          amIWaitingForApproval = true;
          
          // 🟢 ബെല്ലിന് പകരം 29 സെക്കൻഡ് ലൈവ് കൗണ്ട്ഡൗൺ കാണിക്കുന്നു
          let timeLeft = 29;
          btn.innerText = `⏳ ${timeLeft}s`;

          if (editCountdownInterval) clearInterval(editCountdownInterval);
          editCountdownInterval = setInterval(() => {
              timeLeft--;
              if (timeLeft > 0) {
                  btn.innerText = `⏳ ${timeLeft}s`;
              } else {
                  clearInterval(editCountdownInterval);
                  editCountdownInterval = null;
                  if (amIWaitingForApproval) {
                      forceClaimLock(p, m, y);
                  }
              }
          }, 1000);

      } else {
          // 🟢 FIX: റെക്കോർഡ് നിലവിൽ ഫ്രീ ആണെങ്കിൽ (ആരും ലോക്ക് ചെയ്തിട്ടില്ലെങ്കിൽ) ഉടൻ ഈ യൂസർക്ക് എഡിറ്റ് ആക്സസ് നൽകുന്നു
          resetBellButton();
          
          if (data.message && data.message.toLowerCase().includes("not currently locked")) {
              const claimRes = await fetch('/timesheet/api/record-lock/request', {
                  method: 'POST',
                  headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                  body: JSON.stringify({ plate: p, month: m, year: y })
              });
              const claimData = await claimRes.json();
              
              if (claimData.success) {
                  isReadOnlyMode = false;
                  currentLockedRecord = { plate: p, month: m, year: y };
                  
                  // എല്ലാ ഇൻപുട്ടുകളും എഡിറ്റബിൾ ആക്കുന്നു
                  document.querySelectorAll(".grid-input").forEach(el => {
                      el.disabled = false;
                      el.style.backgroundColor = "";
                      el.style.cursor = "text";
                      el.style.color = "";
                      el.style.opacity = "1";
                  });
                  
                  const btnReq = document.getElementById("btnRequestEdit");
                  if (btnReq) btnReq.style.display = "none";
                  
                  const saveLabel = document.getElementById("saveStatus");
                  if (saveLabel) {
                      saveLabel.innerText = "✓ Editable";
                      saveLabel.className = "save-indicator status-saved";
                      setTimeout(() => { saveLabel.className = "save-indicator"; }, 2000);
                  }
                  
                  Swal.fire({
                      toast: true,
                      position: "top-end",
                      icon: "success",
                      title: "Unlocked! You have full edit access.",
                      showConfirmButton: false,
                      timer: 2500
                  });
                  return;
              }
          }
          
          customAlert(data.message, "Notice");
      }
  } catch(e) {
      resetBellButton();
  }
}

// 🟢 Background-il aayalum loud aayi play cheyyunna Audio function
function playTransferAlertSound() {
  try {
    const bellAudio = new Audio("../alert_mp3/bell_alert.mp3");
    bellAudio.volume = 1.0;
    
    // Background tab audio play fix
    let playPromise = bellAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.warn("Audio autoplay blocked or failed:", error);
      });
    }
  } catch (e) {
    console.error("Audio trigger error:", e);
  }
}

function showTransferRequestPopup(requester, p, m, y) {
  let timerInterval;
  Swal.fire({
    title: 'Edit Access Requested',
    html: `<b>${requester.toUpperCase()}</b> is requesting to edit this record.<br><br>Auto-approving in <b id="swal-timer" style="color:red; font-size:18px;"></b> seconds.`,
    timer: 29000,
    timerProgressBar: true,
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#ef4444',
    confirmButtonText: 'Approve',
    cancelButtonText: 'Reject',
    allowOutsideClick: false,
    didOpen: () => {
      const b = Swal.getHtmlContainer().querySelector('#swal-timer');
      if (b) {
        timerInterval = setInterval(() => {
          b.textContent = Math.ceil(Swal.getTimerLeft() / 1000);
        }, 1000);
      }
    },
    willClose: () => {
      clearInterval(timerInterval);
    }
  }).then((result) => {
    incomingRequestActive = false;
    if (result.isConfirmed || result.dismiss === Swal.DismissReason.timer) {
      resolveTransfer(p, m, y, 'approve');
    } else {
      resolveTransfer(p, m, y, 'reject');
    }
  });
}

async function resolveTransfer(p, m, y, action) {
  await fetch("/timesheet/api/record-lock/resolve-transfer", {
      method: 'POST',
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ plate: p, month: m, year: y, action: action })
  });
}

async function forceClaimLock(p, m, y) {
  await fetch("/timesheet/api/record-lock/resolve-transfer", {
      method: 'POST',
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ plate: p, month: m, year: y, action: 'force' })
  });
}

function makeGridReadOnlyLive() {
  document.querySelectorAll(".grid-input").forEach(el => {
      el.disabled = true;
      el.style.backgroundColor = "#f1f5f9";
      el.style.cursor = "not-allowed";
  });
  const saveLabel = document.getElementById("saveStatus");
  saveLabel.innerText = "Read Only";
  saveLabel.className = "save-indicator status-saving";
  saveLabel.style.opacity = "1";
}

/* ==========================================================
   🟢 TIMESHEET DYNAMIC RE-LOGIN & AUDIO ALERT ON SESSION EXPIRY
   ========================================================== */
let pendingTimesheetAction = null;

function playTimesheetAlertSound() {
  const audio = document.getElementById("sessionAlertAudio");
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch((err) => console.log("Audio play blocked:", err));
  }
}

function openTimesheetReLoginModal(resumeCallback) {
  pendingTimesheetAction = resumeCallback;
  playTimesheetAlertSound();

  const modal = document.getElementById("reLoginModal");
  const userInput = document.getElementById("reLoginUser");
  const passInput = document.getElementById("reLoginPass");
  const errDiv = document.getElementById("reLoginError");

  if (errDiv) errDiv.style.display = "none";
  if (passInput) passInput.value = "";

  let currentUsername = "";
  if (userStr) {
    try {
      const uObj = JSON.parse(userStr);
      currentUsername = uObj.username || "";
    } catch (e) {}
  }
  if (!currentUsername) {
    const lToken = localStorage.getItem("timesheetToken");
    if (lToken) {
      try {
        const payload = JSON.parse(atob(lToken.split(".")[1]));
        currentUsername = payload.username || payload.user || "";
      } catch (e) {}
    }
  }

  if (userInput) userInput.value = currentUsername;
  if (modal) modal.style.display = "flex";

  setTimeout(() => {
    if (passInput) passInput.focus();
  }, 200);
}

function closeTimesheetReLoginModal() {
  const modal = document.getElementById("reLoginModal");
  if (modal) modal.style.display = "none";
  pendingTimesheetAction = null;
}

async function executeReLoginAndResume() {
  const userInput = document.getElementById("reLoginUser");
  const passInput = document.getElementById("reLoginPass");
  const errDiv = document.getElementById("reLoginError");

  const username = userInput ? userInput.value.trim() : "";
  const password = passInput ? passInput.value.trim() : "";

  if (!password) {
    errDiv.innerText = "Please enter your password";
    errDiv.style.display = "block";
    if (passInput) passInput.focus();
    return;
  }

  errDiv.innerText = "Verifying...";
  errDiv.style.color = "#0284c7";
  errDiv.style.display = "block";

  try {
    const res = await fetch("/timesheet/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    });

    const data = await res.json();
    if (data.success && data.token) {
      localStorage.setItem("timesheetToken", data.token);
      if (data.user) {
        localStorage.setItem("timesheetUser", JSON.stringify(data.user));
      }
      localStorage.setItem("lastActive", String(Date.now()));

      closeTimesheetReLoginModal();
      
      // Toast message
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Session Restored! Resuming...",
        showConfirmButton: false,
        timer: 2000
      });

      if (typeof pendingTimesheetAction === "function") {
        setTimeout(() => {
          pendingTimesheetAction();
          pendingTimesheetAction = null;
        }, 300);
      }
    } else {
      errDiv.style.color = "#ef4444";
      errDiv.innerText = data.message || "Invalid Password!";
    }
  } catch (err) {
    errDiv.style.color = "#ef4444";
    errDiv.innerText = "Connection error. Try again.";
  }
}