// ? FONT & THEME LOGIC
function changeFont(fontName) {
  document.body.style.fontFamily = fontName;
  localStorage.setItem("erpFont", fontName);
}

function toggleHighlights() {
  const isOff = document.body.classList.contains("no-highlights");
  if (isOff) {
    document.body.classList.remove("no-highlights");
    localStorage.setItem("erpHighlights", "on");
    showToast("Highlights Enabled", "info");
  } else {
    document.body.classList.add("no-highlights");
    localStorage.setItem("erpHighlights", "off");
    showToast("Highlights Disabled", "info");
  }
}

function initSettings() {
  const savedTheme = localStorage.getItem("erpThemeMaster");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeIcon").innerText = "light_mode";
  } else {
    document.body.classList.remove("dark-mode");
    document.getElementById("themeIcon").innerText = "dark_mode";
  }

  const savedFont = localStorage.getItem("erpFont");
  if (savedFont) {
    document.body.style.fontFamily = savedFont;
    if (document.getElementById("fontSelector"))
      document.getElementById("fontSelector").value = savedFont;
  }
  if (localStorage.getItem("erpHighlights") === "off") {
    document.body.classList.add("no-highlights");
  }
}

function toggleTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  if (isDark) {
    document.body.classList.remove("dark-mode");
    localStorage.setItem("erpThemeMaster", "light");
    document.getElementById("themeIcon").innerText = "dark_mode";
  } else {
    document.body.classList.add("dark-mode");
    localStorage.setItem("erpThemeMaster", "dark");
    document.getElementById("themeIcon").innerText = "light_mode";
  }
}
initSettings();

// ? DATE FORMATTER (100% TIMEZONE SAFE)
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatToDDMMMYYYY(dateStr) {
  if (!dateStr) return "";
  dateStr = String(dateStr).trim();

  // 1. If Already Formatted (e.g., 15-Sep-2025)
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/i.test(dateStr)) return dateStr;

  // 2. Direct from HTML <input type="date"> (Format: YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    let p = dateStr.split("-");
    let m = parseInt(p[1], 10) - 1;
    return `${p[2]}-${monthNames[m]}-${p[0]}`;
  }

  // 3. From Excel Paste or Other formats (DD-MM-YYYY, DD/MM/YYYY)
  let p = dateStr.split(/[\/\- \.]/);
  if (p.length === 3) {
    let d, m, y;

    if (p[0].length === 4) {
      // Format: YYYY/MM/DD
      y = p[0];
      m = p[1];
      d = p[2];
    } else {
      // Format: DD/MM/YYYY
      d = p[0];
      m = p[1];
      y = p[2];
    }

    d = String(d).padStart(2, "0");
    y = y.length === 2 ? "20" + y : y;

    let mInt;
    if (isNaN(m)) {
      // If month is string like 'Sep'
      mInt = monthNames.findIndex(
        (mon) => mon.toLowerCase() === m.toLowerCase().substring(0, 3),
      );
    } else {
      mInt = parseInt(m, 10) - 1;
    }

    if (mInt >= 0 && mInt <= 11) {
      return `${d}-${monthNames[mInt]}-${y}`;
    }
  }

  // Fallback
  return dateStr;
}

function convertToInputDate(val) {
  if (!val) return "";
  let p = String(val)
    .trim()
    .split(/[\/\- \.]/);
  if (p.length === 3) {
    let dy = p[0].padStart(2, "0");
    let moStr = p[1].substring(0, 3);
    let moMap = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    let mo = moMap[moStr] || String(p[1]).padStart(2, "0");
    let yr = p[2].length === 2 ? "20" + p[2] : p[2];
    return `${yr}-${mo}-${dy}`;
  }
  return "";
}

function parseDateStr(dStr) {
  if (!dStr) return null;
  const p = String(dStr)
    .trim()
    .split(/[\/\- \.]/);
  const mNames = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  if (p.length === 3) {
    let d = parseInt(p[0]),
      m = mNames.indexOf(p[1].toUpperCase().substring(0, 3)),
      y = p[2].length === 2 ? 2000 + parseInt(p[2]) : parseInt(p[2]);
    if (!isNaN(d) && m !== -1 && !isNaN(y)) {
      // UTC noon aayi edukkunnu, timezone backlottu povan chance illa
      return new Date(Date.UTC(y, m, d, 12, 0, 0));
    }
  }
  return null;
}
const FIXED_COLUMNS = [
  "EQUIPMENT REACHED AT SITE",
  "WORK START",
  "LAST WORKING DAY",
  "RELEASE DATE",
  "REPLACED DATE",
  "OD WRK END",
  "OLD DRIVER NAME",
  "OD MOB",
  "DAYS WORKED",
  "DRIVER STATUS REMARK",
];

let currentUser = JSON.parse(localStorage.getItem("erpUser"));
let token = localStorage.getItem("erpToken");
if (!token || !currentUser) window.location.replace("index.html");

// 🟢 BACK BUTTON FIX (BFCache Protection)
// Browser back button vazhiyo cache vazhiyo page vannal udan check cheyyum
window.addEventListener("pageshow", function (event) {
  if (event.persisted || !localStorage.getItem("erpToken")) {
    window.location.replace("index.html");
  }
});

document.getElementById("userInfoDisplay").innerText = currentUser
  ? currentUser.username
  : "";
if (currentUser.role === "Super Admin")
  document.getElementById("btnAlerts").style.display = "inline-flex";

function buildUserMenu() {
  const menu = document.getElementById("userDropdownMenu");
  if (currentUser.role === "Super Admin") {
    menu.insertAdjacentHTML(
      "beforeend",
      `<a href="./admin/index.html" class="user-dropdown-item"><span class="material-icons" style="font-size:16px; color:var(--primary);">admin_panel_settings</span> Admin Console</a><a href="./log/index.html" class="user-dropdown-item"><span class="material-icons" style="font-size:16px; color:#14b8a6;">history</span> View Logs</a><button class="user-dropdown-item" onclick="runLegacyMigration()"><span class="material-icons" style="font-size:16px; color:#f59e0b;">sync_alt</span> Sync Legacy Logs</button><a href="./recycle_bin.html" class="user-dropdown-item"><span class="material-icons" style="font-size:16px; color:var(--danger);">delete_sweep</span> Recycle Bin</a><div class="user-dropdown-divider"></div>`,
    );
  }
  menu.insertAdjacentHTML(
    "beforeend",
    `<button class="user-dropdown-item danger" onclick="performLogout()"><span class="material-icons" style="font-size:16px;">logout</span> Logout</button>`,
  );
}
buildUserMenu();

function performLogout(isAuto = false) {
  if (isAuto) {
    Swal.fire({
      title: "Session Expired",
      text: "You have been logged out due to 60 minutes of inactivity.",
      icon: "warning",
      confirmButtonText: "Login Again",
    }).then(() => clearSession());
  } else clearSession();
}

function clearSession() {
  localStorage.removeItem("erpUser");
  localStorage.removeItem("erpToken");
  window.location.href = "index.html";
}

let inactivityTimeout;
function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => performLogout(true), 60 * 60 * 1000);
}
["mousemove", "keydown", "scroll", "click", "touchstart"].forEach((evt) =>
  document.addEventListener(evt, resetInactivityTimer, true),
);
resetInactivityTimer();

window.addEventListener("beforeunload", function (e) {
  if (saveQueue.length > 0) {
    clearTimeout(editDebounceTimer);
    processQueue(); 

    const confirmationMessage = "Data is saving in background. Leave site?";
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});

function toggleUserMenu(event) {
  event.stopPropagation();
  document.getElementById("userDropdownMenu").classList.toggle("show");
}

function toggleMobileTools(event) {
  event.stopPropagation();
  document.querySelector(".dt-buttons").classList.toggle("show");
}

document.addEventListener("click", function (event) {
  const userMenu = document.getElementById("userDropdownMenu");
  if (userMenu && !event.target.closest(".user-dropdown-container"))
    userMenu.classList.remove("show");
  const toolsMenu = document.querySelector(".dt-buttons");
  if (
    toolsMenu &&
    window.innerWidth <= 768 &&
    !event.target.closest(".ribbon-left")
  )
    toolsMenu.classList.remove("show");
  $("#headerContextMenu").fadeOut(100);
  $("#driverContextMenu").fadeOut(100);
  $("#rowContextMenu").fadeOut(100);
  if (
    !$(event.target).closest("#excelFilterMenu").length &&
    !$(event.target).hasClass("filter-icon")
  )
    $("#excelFilterMenu").hide();
});

let erpDataTable = null,
  cachedHeaders = [],
  cachedAlignments = [],
  cachedColTypes = [],
  cachedColWidths = [];

let DYNAMIC_COMPANIES = ["Haka", "Aljoda", "Masar Wheels", "We1"];
let globalNextSN = 1,
  saveQueue = [],
  isProcessingQueue = false,
  editDebounceTimer = null, 
  activeFilters = {},
  currentFilterColName = "";
let globalLockedCols = [],
  lastDataHash = "",
  undoStack = [],
  redoStack = [];
let contextColName = "",
  contextColIdx = -1,
  contextDriverDbId = null,
  contextRowDbId = null,
  contextDriverPlate = "",
  contextDriverName = "",
  contextDriverMob = "",
  contextDriverStart = "",
  contextDriverIqamaNo = "",
  contextDriverIqamaExp = "",
  contextDriverLicenceExp = "",
  contextDriverIqamaNote = "",
  contextDriverLicenceNote = "",
  contextDriverNationality = "";

let globalSearchMode = "general"; 

function updateUndoRedoUI() {
  $(".dt-undo-btn").prop("disabled", undoStack.length === 0);
  $(".dt-redo-btn").prop("disabled", redoStack.length === 0);
}

document.addEventListener("keydown", function (e) {
  let isInputActive = $(document.activeElement).is("input, textarea, select");
  if (e.ctrlKey && e.key.toLowerCase() === "z" && !isInputActive) {
    e.preventDefault();
    performUndo();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "y" && !isInputActive) {
    e.preventDefault();
    performRedo();
  }
});

function showToast(msg, color) {
  const t = document.getElementById("toastMsg");
  t.innerText = msg;
  t.style.background =
    color === "error" ? "#ef4444" : color === "info" ? "#0ea5e9" : "#10b981";
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 3000);
}

function updateSyncUI(state) {
  const el = document.getElementById("syncStatus");
  if (state === "saving") {
    el.style.color = "#d97706";
    el.style.background = "#fffbeb";
    el.style.borderColor = "#fde68a";
    el.innerHTML = `<span class="material-icons" style="font-size: 14px; animation: spin 2s linear infinite;">sync</span> Saving (${saveQueue.length})`;
  } else if (state === "live") {
    el.style.color = "#059669";
    el.style.background = "#ecfdf5";
    el.style.borderColor = "#a7f3d0";
    el.innerHTML = `<span class="material-icons" style="font-size: 14px;">cloud_done</span> Up to date`;
  } else if (state === "error") {
    el.style.color = "#dc2626";
    el.style.background = "#fef2f2";
    el.style.borderColor = "#fecaca";
    el.innerHTML = `<span class="material-icons" style="font-size: 14px;">error</span> Sync Error`;
  }
}

function formatPlateNumber(val) {
  if (!val) return "";
  let p = val.toString().toUpperCase().trim(),
    raw = p.replace(/\s+/g, ""),
    jMatch = raw.match(/^J(\d+)$/);
  if (jMatch) return "J" + jMatch[1];
  let normalMatch = raw.match(/^(\d+)([A-Z]+)$/);
  if (normalMatch) return normalMatch[1] + " " + normalMatch[2];
  return p.replace(/\s+/g, " ");
}

async function fetchData(isSilent = false) {
  if (!isSilent) document.getElementById("loader").style.display = "flex";
  $("#excelFilterMenu").hide();

  try {
    const res = await fetch("/api/get-master-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401 || res.status === 403) return performLogout();
    const data = await res.json();
    if (
      !data.success &&
      data.message &&
      (data.message.includes("Access Denied") ||
        data.message.toLowerCase().includes("invalid") ||
        data.message.toLowerCase().includes("expired"))
    )
      return performLogout();

    // Fix: Always update Global SN even during silent background fetch
    globalNextSN = data.nextSN || globalNextSN;

    let currentHash =
      JSON.stringify(data.lockedCols) +
      JSON.stringify(data.alignments) +
      JSON.stringify(data.colTypes) +
      JSON.stringify(data.colWidths);

    if (isSilent) {
      if (currentHash !== lastDataHash) {
        // Headers or settings changed, full re-render needed
        lastDataHash = currentHash;
        renderTable(data);
      } else {
        // Only data might have changed, update specific rows smoothly without destroying DOM
        updateTableDataSmoothly(data.rows);
        updateSyncUI("live");
      }
      return;
    }
    
    lastDataHash = currentHash;
    renderTable(data);
  } catch (e) {
    console.error("Fetch Data Error:", e);
    showToast("Connection failed", "error");
  }
}

setInterval(() => {
  if (
    $(".edit-input").length === 0 &&
    saveQueue.length === 0 &&
    $(".modal-overlay:visible").length === 0 &&
    $("#excelFilterMenu").css("display") === "none" &&
    document.visibilityState === "visible" &&
    !isProcessingQueue
  ) {
    // യൂസർ പേജിൽ ആക്റ്റീവ് ആണെങ്കിൽ മാത്രം ബാക്ക്ഗ്രൗണ്ട് സിങ്ക് ചെയ്യുക
    fetchData(true);
  }
}, 30000); // 15 സെക്കൻഡിന് പകരം 30 സെക്കൻഡ് ആക്കി ബ്രൗസർ ലോഡ് പകുതിയായി കുറയ്ക്കുന്നു
fetchData();

$.fn.dataTable.ext.search.push(
  function (settings, searchData, index, rowData, counter) {
    for (let colName in activeFilters) {
      let allowedValues = activeFilters[colName];
      if (!allowedValues || allowedValues.length === 0) continue;
      let cIdx = cachedHeaders.indexOf(colName);
      if (cIdx === -1) continue;

      // --- COLOR FILTER LOGIC ---
      let colorFilterVal = allowedValues.find(v => String(v).startsWith("__COLOR_"));
      if (colorFilterVal) {
          let statusIdx = cachedHeaders.findIndex(h => String(h).toUpperCase().trim() === "STATUS");
          let statusVal = statusIdx !== -1 ? String(rowData[statusIdx]).trim().toLowerCase() : "";
          let cellColor = "__COLOR_NONE__";

          if (statusVal === "running") {
              let dateStr = rowData[cIdx];
              if (dateStr && String(dateStr).trim() !== "") {
                  let parsedDateStr = convertToInputDate(dateStr);
                  if (parsedDateStr) {
                      let expDate = new Date(`${parsedDateStr}T00:00:00`);
                      if (!isNaN(expDate.getTime())) {
                          let today = new Date();
                          today.setHours(0, 0, 0, 0);
                          expDate.setHours(0, 0, 0, 0);
                          let diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          
                          if (diffDays < 0) cellColor = "__COLOR_EXPIRED__";
                          else if (diffDays >= 0 && diffDays <= 15) cellColor = "__COLOR_15_DAYS__";
                          else if (diffDays > 15 && diffDays <= 30) cellColor = "__COLOR_30_DAYS__";
                      }
                  }
              }
          }
          if (colorFilterVal !== cellColor) return false;
          continue;
      }
      // --- END COLOR FILTER LOGIC ---

      let cellVal = String(searchData[cIdx] || "").trim();
      if (!allowedValues.includes(cellVal)) return false;
    }
    return true;
  }
);

let isQuickEditMode = false;

function toggleQuickEditMode() {
  isQuickEditMode = !isQuickEditMode;
  const btn = $(".quick-edit-btn");
  
  if (isQuickEditMode) {
    btn.addClass("active-green");
    showToast("Quick Edit Mode ON (Single tap to edit)", "success");
  } else {
    btn.removeClass("active-green");
    showToast("Quick Edit Mode OFF (Double click to edit)", "info");
  }
}

let currentDriverModalMode = "handover";
function setDriverMode(mode) {
  currentDriverModalMode = mode;
  const activeStyle = { background: "white", color: "#0f172a", "box-shadow": "0 1px 3px rgba(0,0,0,0.1)" };
  const inactiveStyle = { background: "transparent", color: "#64748b", "box-shadow": "none" };

  $("#tabHandover").css(mode === "handover" ? activeStyle : inactiveStyle);
  $("#tabCurrentUpdate").css(mode === "current_update" ? activeStyle : inactiveStyle);
  $("#tabPastLog").css(mode === "past" ? activeStyle : inactiveStyle);

  if (mode === "handover") {
    $("#formHandoverMode").show();
    $("#formCurrentUpdateMode").hide();
    $("#formPastMode").hide();
    $("#handoverStartDateBlock").show();
    $("#pastLogDates").hide();
    $("#documentsBlock").show();
    $("#lblDriverName").text("New Driver Name");
    $("#lblDriverStart").text("New Driver Start Date").css("color", "var(--success)");
    $("#btnSaveDriverAction")
      .text("Save & Change Driver")
      .removeClass("btn-primary")
      .removeClass("btn-info")
      .addClass("btn-success")
      .css("background", "")
      .css("color", "");
      
    // Clear out current specific data so user enters fresh
    $("#drvUpdateNewName").val("");
    $("#drvUpdateNewMob").val("");
    $("#drvUpdateNewStart").val("");
  } else if (mode === "current_update") {
    $("#formHandoverMode").hide();
    $("#formCurrentUpdateMode").show();
    $("#formPastMode").hide();
    $("#handoverStartDateBlock").show();
    $("#pastLogDates").hide();
    $("#documentsBlock").show();
    $("#lblDriverName").text("Current Driver Name (Edit)");
    $("#lblDriverStart").text("Current Driver Start Date (Edit)").css("color", "var(--primary)");
    $("#btnSaveDriverAction")
      .text("Update Current Details")
      .removeClass("btn-success")
      .removeClass("btn-primary")
      .css("background", "var(--primary)")
      .css("color", "white");

    // Auto-fill existing current driver details & all documents
    $("#drvUpdateNewName").val(contextDriverName || "");
    $("#drvUpdateNewMob").val(contextDriverMob || "");
    if(contextDriverStart && contextDriverStart !== "IDK") {
       $("#drvUpdateNewStart").val(convertToInputDate(contextDriverStart));
    } else {
       $("#drvUpdateNewStart").val("");
    }
    $("#drvUpdateIqamaNo").val(contextDriverIqamaNo || "");
    $("#drvUpdateIqamaExp").val(convertToInputDate(contextDriverIqamaExp));
    $("#drvUpdateLicenceExp").val(convertToInputDate(contextDriverLicenceExp));
    $("#drvUpdateIqamaNote").val(contextDriverIqamaNote || "");
    $("#drvUpdateLicenceNote").val(contextDriverLicenceNote || "");
    $("#drvUpdateNationality").val(contextDriverNationality || "");
  } else {
    $("#formHandoverMode").hide();
    $("#formCurrentUpdateMode").hide();
    $("#formPastMode").show();
    $("#handoverStartDateBlock").hide();
    $("#pastLogDates").show();
    $("#documentsBlock").hide();
    $("#lblDriverName").text("Driver Name");
    $("#btnSaveDriverAction")
      .text("Add to History")
      .removeClass("btn-success")
      .removeClass("btn-info")
      .addClass("btn-primary")
      .css("background", "")
      .css("color", "");
  }
}

function reuseDriverDetails(name, mobile) {
  $("#drvUpdateNewName").val(name);
  $("#drvUpdateNewMob").val(mobile);
  showToast("Details copied!", "info");
}

function handleDriverAction(action) {
  if (action === "update") {
    if (currentUser.role === "Viewer")
      return showToast("Super Admin / Admin Only", "error");
    setDriverMode("handover");
    $("#drvUpdatePlateDisplay").text("Plate: " + contextDriverPlate);
    $("#drvUpdateCurrentName").text(contextDriverName || "N/A");
    $("#drvUpdateCurrentMob").text(contextDriverMob || "N/A");
    $("#drvUpdateOldStart").val("");
    $("#drvUpdateEnd").val("");
    $("#drvUpdateNewName").val("");
    $("#drvUpdateNewMob").val("");
    $("#drvUpdateNewStart").val("");
    fetchDriverLogsForSidePanel(contextDriverDbId);
    $("#driverUpdateModalOverlay").css("display", "flex");
  } else if (action === "view_log") {
    $("#drvLogPlateDisplay").text("Plate: " + contextDriverPlate);
    $("#driverLogTableBody").html(
      '<tr><td colspan="6" style="text-align:center;">Loading logs...</td></tr>',
    );
    $("#driverLogModalOverlay").css("display", "flex");
    fetchDriverLogsForModal(contextDriverDbId);
  }
}

async function fetchDriverLogsForModal(dbId) {
  try {
    const res = await fetch("/api/get-driver-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dbId: dbId }),
    });
    const data = await res.json();
    if (data.success) {
      let html = "";
      data.logs.forEach((l) => {
        let isCurrent = l.id === "current" || l.is_current;
        let badge = isCurrent
          ? '<span style="background:#059669; color:#ffffff; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; margin-left:8px; letter-spacing:0.5px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">CURRENT</span>'
          : "";
        let rowClass = isCurrent ? 'class="current-driver-row" style="background:#ecfdf5; font-weight:600;"' : '';
        let endVal = isCurrent
          ? '<span style="color:#059669; font-weight:700;">Present</span>'
          : (l.end || l.work_end || "-");

        html += `<tr ${rowClass}>
          <td style="font-weight: 600;">${l.name || l.driver_name || "-"}${badge}</td>
          <td>${l.mob || l.mobile || "-"}</td>
          <td style="text-align: center;">${l.start || l.work_start || "-"}</td>
          <td style="text-align: center;">${endVal}</td>
          <td>${l.updated_by || "-"}</td>
          <td style="text-align: center; color: #94a3b8;">-</td>
        </tr>`;
      });
      if (data.logs.length === 0)
        html =
          '<tr><td colspan="6" style="text-align:center; padding: 24px; color: #64748b;">No history records found.</td></tr>';
      $("#driverLogTableBody").html(html);
    }
  } catch (e) {
    $("#driverLogTableBody").html(
      '<tr><td colspan="6" style="text-align:center; color:var(--danger); padding: 20px;">Failed to load driver history.</td></tr>',
    );
  }
}

async function fetchDriverLogsForSidePanel(dbId) {
  $("#sidePanelDriverLogs").html(
    '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading history...</td></tr>',
  );
  try {
    const res = await fetch("/api/get-driver-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dbId: dbId }),
    });
    const data = await res.json();
    if (data.success) {
      let html = "";
      let logs = data.logs || [];
      
      // 🟢 FIX: കറന്റ് ഡ്രൈവറുടെ Start Date ഹിസ്റ്ററിയിൽ നിന്നോ DB റെക്കോർഡിൽ നിന്നോ എടുക്കുന്നു
      if (data.currentDriverStart) {
        contextDriverStart = data.currentDriverStart;
      } else if (logs.length > 0) {
        // ഹിസ്റ്ററി ഉണ്ടെങ്കിൽ അവസാനത്തെ ഡ്രൈവറുടെ End Date ആയിരിക്കും കറന്റ് ഡ്രൈവറുടെ തുടക്കം
        let sortedLogs = [...logs].sort((a, b) => new Date(a.end === "01-Jan-1990" ? 0 : a.end) - new Date(b.end === "01-Jan-1990" ? 0 : b.end));
        let lastPastLog = sortedLogs[sortedLogs.length - 1];
        contextDriverStart = lastPastLog.end;
      }
      
      $("#drvUpdateOldStart").val(convertToInputDate(contextDriverStart));
      if (currentDriverModalMode === "current_update") {
        $("#drvUpdateNewStart").val(convertToInputDate(contextDriverStart));
      }

      logs.forEach((l) => {
        let isCurrent = l.id === "current";
        let rowStyle = isCurrent
          ? "background:rgba(14, 165, 233, 0.05);"
          : "transition-colors hover:bg-slate-50";
        let badge = isCurrent
          ? '<span style="background:#0ea5e9; color:white; padding:2px 4px; border-radius:4px; font-size:9px; margin-left:5px;">CURRENT</span>'
          : "";
        let reuseBtn = `<i class="material-icons" style="font-size:16px; cursor:pointer; color:#10b981;" onclick="reuseDriverDetails('${(l.name || l.driver_name || "").replace(/'/g, "\\'")}', '${l.mob || l.mobile || ""}')" title="Copy Details to Form">content_copy</i>`;
        let editBtn = "",
          deleteBtn = "";

        if (currentUser.role !== "Viewer") {
          editBtn = `<i class="material-icons" style="font-size:16px; cursor:pointer; color:var(--primary);" onclick="openEditLogModal('${l.id}', '${(l.name || l.driver_name || "").replace(/'/g, "\\'")}', '${l.mob || l.mobile || ""}', '${l.start || l.work_start || ""}', '${l.end || l.work_end || ""}', '${(l.status_remark || "").replace(/'/g, "\\'")}')" title="Edit Log">edit</i>`;
          if (!isCurrent)
            deleteBtn = `<i class="material-icons" style="font-size:16px; cursor:pointer; color:var(--danger);" onclick="deleteDriverLog('${l.id}')" title="Delete Log">delete</i>`;
        }

        let actionButtons = `<div style="display:flex; justify-content:center; gap:10px;">${reuseBtn}${editBtn}${deleteBtn}</div>`;
        html += `<tr style="${rowStyle}"><td style="padding:8px; border-bottom:1px solid var(--border-color); font-weight:600;">${l.name || l.driver_name || "-"}${badge}</td><td style="padding:8px; border-bottom:1px solid var(--border-color);">${l.mob || l.mobile || "-"}</td><td style="padding:8px; border-bottom:1px solid var(--border-color);">${l.start || l.work_start || "-"}</td><td style="padding:8px; border-bottom:1px solid var(--border-color);">${l.end || l.work_end || "-"}</td><td style="padding:8px; border-bottom:1px solid var(--border-color); text-align:center;">${actionButtons}</td></tr>`;
      });
      if (logs.length === 0)
        html =
          '<tr><td colspan="5" style="text-align:center; padding: 20px;">No history found.</td></tr>';
      $("#sidePanelDriverLogs").html(html);
    }
  } catch (e) {
    $("#sidePanelDriverLogs").html(
      '<tr><td colspan="5" style="text-align:center; color:red; padding: 20px;">Failed to load.</td></tr>',
    );
  }
}

function openEditLogModal(id, name, mob, start, end, remark) {
  $("#editLogId").val(id);
  $("#editLogName").val(name);
  $("#editLogMob").val(mob);
  if (start === "IDK") $("#editLogStart").val("");
  else $("#editLogStart").val(convertToInputDate(start));
  if (id === "current") $("#editLogEnd").val("").prop("disabled", true);
  else $("#editLogEnd").val(convertToInputDate(end)).prop("disabled", false);
  $("#editLogStatusRemark").val(remark || "");
  $("#editLogModalOverlay").css("display", "flex");
}

async function submitEditLog() {
  let id = $("#editLogId").val(),
    name = $("#editLogName").val().trim(),
    mob = $("#editLogMob").val().trim(),
    startRaw = $("#editLogStart").val(),
    end = $("#editLogEnd").val();
  if (!name) return showToast("Name is required", "error");
  if (id !== "current" && !end)
    return showToast("End Date required for past logs", "error");
  let start = startRaw ? formatToDDMMMYYYY(startRaw) : "IDK";
  $("#editLogModalOverlay").hide();
  showToast("Updating log...", "info");

  try {
    if (id === "current") {
      let dNameCol =
        cachedHeaders.find((h) => h.toUpperCase() === "DRIVER NAME") ||
        "Driver Name";
      let mobCol =
        cachedHeaders.find((h) => h.toUpperCase() === "MOBILE") || "Mobile";
      // 🟢 FIX: മെയിൻ WORK START മാറ്റി DRIVER START DATE ആക്കുന്നു
      let dStartCol =
        cachedHeaders.find((h) => h.replace(/\s+/g, "").toUpperCase() === "DRIVERSTARTDATE") ||
        "DRIVER START DATE";
      let srCol = 
        cachedHeaders.find((h) => h.replace(/\s+/g, "").toUpperCase() === "DRIVERSTATUSREMARK") || 
        "Driver Status Remark";

      let edits = [
        { dbId: contextDriverDbId, colName: dNameCol, newValue: name },
        { dbId: contextDriverDbId, colName: mobCol, newValue: mob },
        { dbId: contextDriverDbId, colName: dStartCol, newValue: start },
        { dbId: contextDriverDbId, colName: srCol, newValue: $("#editLogStatusRemark").val().trim() }
      ];
      const res = await fetch("/api/update-cells-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ edits: edits }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Current driver updated!", "success");
        fetchData(true);
        fetchDriverLogsForSidePanel(contextDriverDbId);
        contextDriverName = name;
        contextDriverMob = mob;
        contextDriverStart = start;
        $("#drvUpdateCurrentName").text(name);
        $("#drvUpdateCurrentMob").text(mob);
        $("#drvUpdateOldStart").val(convertToInputDate(start));
      } else showToast(data.message, "error");
    } else {
      const res = await fetch("/api/edit-driver-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dbId: contextDriverDbId,
          logId: id,
          driverName: name,
          mobile: mob,
          workStart: start,
          workEnd: formatToDDMMMYYYY(end),
          statusRemark: $("#editLogStatusRemark").val().trim()
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchData(true);
        fetchDriverLogsForSidePanel(contextDriverDbId);
      } else showToast(data.message, "error");
    }
  } catch (e) {
    showToast("Error updating log", "error");
  }
}

function deleteDriverLog(id) {
  Swal.fire({
    title: "Delete this log?",
    text: "You won't be able to revert this!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "var(--danger)",
    cancelButtonColor: "#64748b",
    confirmButtonText: "Yes, delete it!",
    didOpen: () => {
      document.querySelector(".swal2-container").style.zIndex = "99999";
    },
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const res = await fetch("/api/delete-driver-log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ dbId: contextDriverDbId, logId: id }),
        });
        const data = await res.json();
        if (data.success) {
          showToast("Log deleted!", "success");
          fetchData(true);
          fetchDriverLogsForSidePanel(contextDriverDbId);
        } else showToast(data.message, "error");
      } catch (e) {
        showToast("Failed to delete log", "error");
      }
    }
  });
}

// FIX: Driver Strict Date Validation and Release Handling
async function submitDriverUpdate() {
  let nName = $("#drvUpdateNewName").val().trim();
  let nMob = $("#drvUpdateNewMob").val().trim();

  if (currentDriverModalMode === "current_update") {
    let nStartRaw = $("#drvUpdateNewStart").val();
    if (!nName) return showToast("Name is required", "error");
    
    let start = nStartRaw ? formatToDDMMMYYYY(nStartRaw) : "IDK";
    let iqamaNo = $("#drvUpdateIqamaNo").val().trim();
    let iqamaExpRaw = $("#drvUpdateIqamaExp").val();
    let iqamaExp = iqamaExpRaw ? formatToDDMMMYYYY(iqamaExpRaw) : "";
    let licenceExpRaw = $("#drvUpdateLicenceExp").val();
    let licenceExp = licenceExpRaw ? formatToDDMMMYYYY(licenceExpRaw) : "";
    let iqamaNote = $("#drvUpdateIqamaNote").val().trim();
    let licenceNote = $("#drvUpdateLicenceNote").val().trim();
    let nationality = $("#drvUpdateNationality").val().trim();

    showToast("Updating Current Driver...", "info");

    let edits = [
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.toUpperCase() === "DRIVER NAME") || "Driver Name", newValue: nName },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.toUpperCase() === "MOBILE") || "Mobile", newValue: nMob },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "DRIVERSTARTDATE") || "DRIVER START DATE", newValue: start },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "IQAMANUMBER") || "Iqama Number", newValue: iqamaNo },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "IQAMAEXPIREDATE" || h.replace(/\s+/g, "").toUpperCase() === "IQAMAEXPIRE") || "Iqama Expire Date", newValue: iqamaExp },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "LICENSEEXPIREDATE" || h.replace(/\s+/g, "").toUpperCase() === "LICENSEEXPIRE" || h.replace(/\s+/g, "").toUpperCase() === "LICENCEEXPIREDATE") || "License Expire Date", newValue: licenceExp },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "IQAMANOTE") || "Iqama Note", newValue: iqamaNote },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "LICENCENOTE" || h.replace(/\s+/g, "").toUpperCase() === "LICENSENOTE") || "Licence Note", newValue: licenceNote },
        { dbId: contextDriverDbId, colName: cachedHeaders.find(h => h.replace(/\s+/g, "").toUpperCase() === "NATIONALITY") || "Nationality", newValue: nationality },
    ];

    try {
        const res = await fetch("/api/update-cells-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ edits: edits }),
        });
        const data = await res.json();
        if (data.success) {
            showToast("Current driver updated!", "success");
            fetchData(true);
            fetchDriverLogsForSidePanel(contextDriverDbId);
            contextDriverName = nName;
            contextDriverMob = nMob;
            contextDriverStart = start;
            contextDriverIqamaNo = iqamaNo;
            contextDriverIqamaExp = iqamaExp;
            contextDriverLicenceExp = licenceExp;
            contextDriverIqamaNote = iqamaNote;
            contextDriverLicenceNote = licenceNote;
            contextDriverNationality = nationality;
            $("#drvUpdateCurrentName").text(nName);
            $("#drvUpdateCurrentMob").text(nMob);
            $("#drvUpdateOldStart").val(convertToInputDate(start));
            $('#driverUpdateModalOverlay').hide();
        } else {
            showToast(data.message, "error");
        }
    } catch (e) {
        showToast("Failed to update driver", "error");
    }
  } else if (currentDriverModalMode === "handover") {
    let oldStartRaw = $("#drvUpdateOldStart").val();
    let oldStart = oldStartRaw ? formatToDDMMMYYYY(oldStartRaw) : "IDK";
    let endRaw = $("#drvUpdateEnd").val();
    let nStartRaw = $("#drvUpdateNewStart").val();

    let iqamaNo = $("#drvUpdateIqamaNo").val().trim();
    let iqamaExpRaw = $("#drvUpdateIqamaExp").val();
    let iqamaExp = iqamaExpRaw ? formatToDDMMMYYYY(iqamaExpRaw) : "";
    let licenceExpRaw = $("#drvUpdateLicenceExp").val();
    let licenceExp = licenceExpRaw ? formatToDDMMMYYYY(licenceExpRaw) : "";
    let iqamaNote = $("#drvUpdateIqamaNote").val().trim();
    let licenceNote = $("#drvUpdateLicenceNote").val().trim();
    let nationality = $("#drvUpdateNationality").val().trim();

    if (!endRaw)
      return showToast("Current Driver End Date is required", "error");

    let oldStartObj = oldStartRaw ? new Date(oldStartRaw) : null;
    let endObj = new Date(endRaw);
    let newStartObj = nStartRaw ? new Date(nStartRaw) : null;

    if (oldStartObj && endObj < oldStartObj) {
      return showToast(
        "Error: End Date cannot be before the Start Date",
        "error",
      );
    }

    if (nName) {
      if (!nStartRaw)
        return showToast(
          "New Driver Start Date is required when assigning a new driver",
          "error",
        );
      if (newStartObj < endObj) {
        return showToast(
          "Error: New Driver Start Date cannot be before Old Driver End Date",
          "error",
        );
      }
    }

    let end = formatToDDMMMYYYY(endRaw);
    let finalNewStart = nStartRaw ? formatToDDMMMYYYY(nStartRaw) : "";

    showToast("Updating Driver Log...", "info");
    try {
      const res = await fetch("/api/update-driver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dbId: contextDriverDbId,
          plate_number: contextDriverPlate,
          currentDriver: contextDriverName,
          currentMob: contextDriverMob,
          oldWorkStart: oldStart,
          workEnd: end,
          newDriver: nName,
          newMob: nMob,
          newWorkStart: finalNewStart,
          statusRemark: $("#drvUpdateStatusRemark").val().trim(),
          iqamaNo: iqamaNo,
          iqamaExp: iqamaExp,
          licenceExp: licenceExp,
          iqamaNote: iqamaNote,
          licenceNote: licenceNote,
          nationality: nationality
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(nName ? "Driver updated!" : "Vehicle Released!", "success");
        fetchData(true);
        fetchDriverLogsForSidePanel(contextDriverDbId);
        $("#drvUpdateEnd").val("");
        $("#drvUpdateNewName").val("");
        $("#drvUpdateNewMob").val("");
        $("#drvUpdateNewStart").val("");
        $("#drvUpdateStatusRemark").val("");
      } else showToast(data.message, "error");
    } catch (e) {
      showToast("Failed to update driver", "error");
    }
  } else {
    // Past Log Mode
    let pStartRaw = $("#drvPastStart").val();
    let pEndRaw = $("#drvPastEnd").val();
    let pRemark = $("#drvPastStatusRemark").val().trim();
    if (!nName || !pStartRaw || !pEndRaw)
      return showToast("Name, Start Date, and End Date are required", "error");

    let pStartObj = new Date(pStartRaw);
    let pEndObj = new Date(pEndRaw);
    if (pEndObj < pStartObj) {
      return showToast(
        "Error: End Date cannot be before the Start Date",
        "error",
      );
    }

    showToast("Adding to history...", "info");
    try {
      const res = await fetch("/api/add-past-driver-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dbId: contextDriverDbId,
          driverName: nName,
          mobile: nMob,
          workStart: formatToDDMMMYYYY(pStartRaw),
          workEnd: formatToDDMMMYYYY(pEndRaw),
          statusRemark: pRemark
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Added to history!", "success");
        fetchData(true);
        fetchDriverLogsForSidePanel(contextDriverDbId);
        $("#drvPastStart").val("");
        $("#drvPastEnd").val("");
        $("#drvPastStatusRemark").val("");
      } else showToast(data.message, "error");
    } catch (e) {
      showToast("Failed to add past log", "error");
    }
  }
}

function openImportModal() {
  if (currentUser.role !== "Super Admin")
    return showToast("Super Admin Only.", "error");
  document.querySelector(".dt-buttons").classList.remove("show");
  $("#importExcelFile").val("");
  $("#importModalOverlay").css("display", "flex");
}

function updateImportUI() {
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  const warningText = document.getElementById("importWarningText");
  const submitBtn = document.getElementById("btnImportSubmit");
  if (mode === "rewrite") {
    warningText.style.color = "var(--danger)";
    warningText.innerText =
      "WARNING: This will rewrite the entire database! A backup will be mailed to you automatically before wiping.";
    submitBtn.className = "btn btn-warning";
    submitBtn.innerText = "Import & Rewrite";
  } else {
    warningText.style.color = "var(--primary)";
    warningText.innerText =
      "Info: This will safely add new records below the existing data.";
    submitBtn.className = "btn btn-primary";
    submitBtn.innerText = "Import & Append";
  }
}

function processBulkImport() {
  const fileInput = document.getElementById("importExcelFile");
  if (!fileInput.files.length)
    return showToast("Please select a file.", "error");
  const importMode = document.querySelector(
    'input[name="importMode"]:checked',
  ).value;
  const file = fileInput.files[0],
    reader = new FileReader();

  $("#btnImportSubmit").prop("disabled", true).text("Processing via Python...");
  reader.onload = async function (e) {
    const base64Data = e.target.result;
    try {
      showToast("Validating & Processing with Python Engine...", "info");
      const res = await fetch("/api/admin/import-excel-py", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          importMode: importMode,
        }),
      });
      const data = await res.json();
      updateImportUI();
      $("#btnImportSubmit").prop("disabled", false);
      if (data.success) {
        showToast(data.message, "success");
        $("#importModalOverlay").hide();
        setTimeout(() => location.reload(), 1500);
      } else {
        showToast(data.message, "error");
      }
    } catch (error) {
      updateImportUI();
      $("#btnImportSubmit").prop("disabled", false);
      showToast("Failed to upload to Python engine.", "error");
    }
  };
  reader.readAsDataURL(file);
}

async function renameColumn(event, oldName) {
  event.stopPropagation();
  if (currentUser.role !== "Super Admin") return;
  const modal = $("#renameColModalOverlay"),
    input = $("#renameColInput"),
    typeSelect = $("#renameColType"),
    confirmBtn = $("#btnConfirmRename");
  input.val(oldName);
  let existType =
    cachedColTypes.find((c) => c.name === oldName)?.type || "varchar";
  typeSelect.val(existType);
  modal.css("display", "flex");
  input.focus();
  confirmBtn.off("click").on("click", async function () {
    const newName = input.val().trim(),
      newType = typeSelect.val();
    if (!newName) return showToast("Name cannot be empty", "error");
    const normOld = String(oldName).replace(/\s+/g, " ").trim().toUpperCase();
    if (FIXED_COLUMNS.includes(normOld))
      return showToast("Cannot rename a core system column.", "error");
    modal.hide();
    showToast("Updating column...", "info");
    try {
      const res = await fetch("/api/admin/rename-column", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldName: oldName,
          newName: newName,
          colType: newType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchData(true);
      } else showToast(data.message, "error");
    } catch (e) {
      showToast("Error updating column.", "error");
    }
  });
  input.off("keypress").on("keypress", function (e) {
    if (e.key === "Enter") confirmBtn.click();
  });
}

async function toggleColumnLock(event, colName, newState) {
  event.stopPropagation();
  if (currentUser.role !== "Super Admin") return;
  try {
    showToast(newState ? "Locking..." : "Unlocking...", "info");
    const res = await fetch("/api/admin/toggle-lock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ colName: colName, isLocked: newState }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Column ${newState ? "Locked" : "Unlocked"}`, "success");
      fetchData(true);
    } else showToast(data.message, "error");
  } catch (e) {
    showToast("Error updating lock.", "error");
  }
}

async function triggerTelegramAlerts() {
  document.getElementById("userDropdownMenu").classList.remove("show");
  try {
    showToast("Sending alerts to Telegram...", "info");
    const res = await fetch("/api/admin/trigger-alerts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (data.success) showToast(data.message, "success");
    else showToast(data.message, "error");
  } catch (e) {
    showToast("Failed to send alerts.", "error");
  }
}

function attachContextMenus() {
  if (currentUser.role === "Super Admin") $(".admin-only-menu").show();
  else $(".admin-only-menu").hide();

  $("#erpTable thead")
    .off("contextmenu", "th")
    .on("contextmenu", "th", function (e) {
      e.preventDefault();
      contextColName = $(this).find(".col-title-text").text().trim();
      contextColIdx = erpDataTable.column(this).index();
      const normCol = String(contextColName)
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      if (FIXED_COLUMNS.includes(normCol)) {
        $(".admin-only-menu").hide();
      } else {
        if (currentUser.role === "Super Admin") $(".admin-only-menu").show();
      }
      let colWraps = JSON.parse(localStorage.getItem("erpColWraps")) || {};
      let currentWrap = colWraps[contextColName] || "nowrap";
      $("#contextWrapText").text(
        currentWrap === "wrap" ? "Unwrap Text" : "Wrap Text",
      );
      $("#headerContextMenu")
        .css({ top: e.pageY + "px", left: e.pageX + "px" })
        .fadeIn(200);
    });

  $("#erpTable tbody")
    .off("contextmenu", "td")
    .on("contextmenu", "td", function (e) {
      if ($(this).hasClass("sn-column")) {
          e.preventDefault();
          e.stopPropagation();
          let $row = $(this).closest("tr");
          contextRowDbId = $row.data("sheetrow");
          contextDriverDbId = contextRowDbId;

          let plateIdx = cachedHeaders.findIndex(
            (h) => h.trim().toLowerCase() === "plate number",
          );
          contextDriverPlate = plateIdx !== -1 ? $row.find("td").eq(plateIdx).text().trim() : "";
          
          let getCellVal = (matchStr) => {
            let foundH = cachedHeaders.find((h) => h.replace(/\s+/g, "").toUpperCase() === matchStr.replace(/\s+/g, "").toUpperCase());
            return foundH ? $row.find(`td[data-colname="${foundH}"]`).text().trim() : "";
          };

          contextDriverName = getCellVal("DRIVERNAME");
          contextDriverMob = getCellVal("MOBILE");
          contextDriverStart = getCellVal("DRIVERSTARTDATE") || getCellVal("DRIVERSTART") || "";
          contextDriverIqamaNo = getCellVal("IQAMANUMBER") || getCellVal("IQAMANO");
          contextDriverIqamaExp = getCellVal("IQAMAEXPIREDATE") || getCellVal("IQAMAEXPIRE");
          contextDriverLicenceExp = getCellVal("LICENSEEXPIREDATE") || getCellVal("LICENCEEXPIREDATE") || getCellVal("LICENSEEXPIRE") || getCellVal("LICENCEEXPIRE");
          contextDriverIqamaNote = getCellVal("IQAMANOTE");
          contextDriverLicenceNote = getCellVal("LICENCENOTE") || getCellVal("LICENSENOTE");
          contextDriverNationality = getCellVal("NATIONALITY");

          $("#rowContextMenu")
            .css({ top: e.pageY + "px", left: e.pageX + "px" })
            .fadeIn(200);
          return;
      }

      let colName = $(this).data("colname");
      if (colName && colName.toUpperCase() === "DRIVER NAME") {
        e.preventDefault();
        let plateIdx = cachedHeaders.findIndex(
          (h) => h.trim().toLowerCase() === "plate number",
        );
        let $row = $(this).closest("tr");
        contextDriverDbId = $row.data("sheetrow");
        contextDriverPlate = $row.find("td").eq(plateIdx).text().trim();
        contextDriverName = $(this).text().trim();
        
        let getCellVal = (matchStr) => {
          let foundH = cachedHeaders.find((h) => h.replace(/\s+/g, "").toUpperCase() === matchStr.replace(/\s+/g, "").toUpperCase());
          return foundH ? $row.find(`td[data-colname="${foundH}"]`).text().trim() : "";
        };

        contextDriverMob = getCellVal("MOBILE");
        contextDriverStart = getCellVal("DRIVERSTARTDATE") || getCellVal("DRIVERSTART") || "";
        contextDriverIqamaNo = getCellVal("IQAMANUMBER") || getCellVal("IQAMANO");
        contextDriverIqamaExp = getCellVal("IQAMAEXPIREDATE") || getCellVal("IQAMAEXPIRE");
        contextDriverLicenceExp = getCellVal("LICENSEEXPIREDATE") || getCellVal("LICENCEEXPIREDATE") || getCellVal("LICENSEEXPIRE") || getCellVal("LICENCEEXPIRE");
        contextDriverIqamaNote = getCellVal("IQAMANOTE");
        contextDriverLicenceNote = getCellVal("LICENCENOTE") || getCellVal("LICENSENOTE");
        contextDriverNationality = getCellVal("NATIONALITY");

        $("#driverContextMenu")
          .css({ top: e.pageY + "px", left: e.pageX + "px" })
          .fadeIn(200);
      }
    });
}

async function handleMenuAction(action) {
  if (action === "add_left" || action === "add_right") {
    const pos = action === "add_left" ? "left" : "right";
    $("#relativeColTitle").text(
      `Add Column ${pos === "left" ? "Left" : "Right"} of "${contextColName}"`,
    );
    $("#relativeColPosition").val(pos);
    $("#relativeColInput").val("");
    $("#relativeColType").val("varchar");
    $("#relativeColModal").css("display", "flex");
    $("#relativeColInput").focus();
  } else if (action === "delete_column") {
    if (currentUser.role !== "Super Admin")
      return showToast("Super Admin only.", "error");
    $("#deleteColNameDisplay").text(contextColName);
    $("#deleteColPassword").val("");
    $("#deleteColModalOverlay").css("display", "flex");
    $("#deleteColPassword").focus();
  } else if (action.startsWith("align_")) {
    const align = action.split("_")[1];
    
    // 1. Local Storage-ൽ സേവ് ചെയ്യുന്നു
    let userAligns = JSON.parse(localStorage.getItem("erpColAligns_" + currentUser.username)) || {};
    userAligns[contextColName] = align;
    localStorage.setItem("erpColAligns_" + currentUser.username, JSON.stringify(userAligns));
    
    // 2. Cache-ൽ അപ്‌ഡേറ്റ് ചെയ്യുന്നു (പിന്നീട് ടേബിൾ വരയ്ക്കുമ്പോൾ നഷ്ടപ്പെടാതിരിക്കാൻ)
    let existingAlign = cachedAlignments.find(a => a.name === contextColName);
    if (existingAlign) {
      existingAlign.align = align;
    } else {
      cachedAlignments.push({name: contextColName, align: align});
    }

    // 3. Header-ന്റെ Alignment അപ്പോൾ തന്നെ മാറ്റുന്നു (Live DOM Update)
    let $header = $(erpDataTable.column(contextColIdx).header());
    let justify = align === "center" ? "center" : align === "right" ? "flex-end" : "space-between";
    $header.find(".header-content").css("justify-content", justify);
    $header.find(".col-title-text").css("text-align", align);

    // 4. ആ കോളത്തിലെ എല്ലാ സെല്ലുകളുടെയും Alignment അപ്പോൾ തന്നെ മാറ്റുന്നു (Live DOM Update)
    erpDataTable.column(contextColIdx).nodes().to$().css("text-align", align);

    showToast("Alignment applied!", "success");
  } else if (action === "toggle_col_wrap") {
    let colWraps = JSON.parse(localStorage.getItem("erpColWraps")) || {};
    let currentWrap = colWraps[contextColName] || "nowrap";
    let newWrap = currentWrap === "wrap" ? "nowrap" : "wrap";
    colWraps[contextColName] = newWrap;
    localStorage.setItem("erpColWraps", JSON.stringify(colWraps));
    showToast(
      newWrap === "wrap" ? "Column Wrapped" : "Column Unwrapped",
      "info",
    );
    if (erpDataTable) erpDataTable.rows().invalidate().draw(false);
  } else if (action === "sort_asc") {
    erpDataTable.order([contextColIdx, "asc"]).draw();
    showToast("Sorted A-Z", "info");
  } else if (action === "sort_desc") {
    erpDataTable.order([contextColIdx, "desc"]).draw();
    showToast("Sorted Z-A", "info");
  } else if (action === "hide_column") {
    erpDataTable.column(contextColIdx).visible(false);
    showToast("Column Hidden", "info");
  } else if (action === "copy_col_data") {
    if (erpDataTable) {
      let colData = erpDataTable.column(contextColIdx, { search: 'applied', order: 'applied' }).data().toArray();
      let textToCopy = colData.join("\n");
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast("Column data copied to clipboard!", "success");
      }).catch(err => {
        showToast("Failed to copy data", "error");
        console.error("Clipboard Error:", err);
      });
    }
  }
}

function handleDriverActionFromRow(action) {
   $("#rowContextMenu").hide();
   handleDriverAction(action);
}

function openEditRowModal() {
   $("#rowContextMenu").hide();
   if(contextRowDbId) {
      openAddEntryModal(contextRowDbId);
   }
}

function deleteSelectedRow() {
   $("#rowContextMenu").hide();
   if(!contextRowDbId) return;

   if (currentUser.role !== "Super Admin" && currentUser.role !== "Admin") {
      return showToast("Only Admins can delete rows.", "error");
   }

   Swal.fire({
      title: 'Move Row to Recycle Bin?',
      text: 'This row and all its data will be hidden from the master DB.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--danger)',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, move it!'
   }).then(async (result) => {
      if (result.isConfirmed) {
         showToast("Moving to recycle bin...", "info");
         try {
            const res = await fetch("/api/delete-row", {
               method: "POST",
               headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
               body: JSON.stringify({ dbId: contextRowDbId })
            });
            const data = await res.json();
            if(data.success) {
               showToast("Row moved to Recycle Bin", "success");
               fetchData(true);
            } else {
               showToast(data.message, "error");
            }
         } catch(e) {
            showToast("Delete failed", "error");
         }
      }
   });
}

async function submitRelativeColumn() {
  const newName = $("#relativeColInput").val().trim(),
    pos = $("#relativeColPosition").val(),
    type = $("#relativeColType").val();
  if (!newName) return showToast("Name cannot be empty.", "error");
  $("#relativeColModal").hide();
  showToast("Creating column...", "info");
  try {
    const res = await fetch("/api/add-column-relative", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        colName: newName,
        relativeTo: contextColName,
        position: pos,
        colType: type,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast("Column added!", "success");
      fetchData(true);
    } else showToast(data.message, "error");
  } catch (e) {
    showToast("Failed to add column", "error");
  }
}

async function submitDeleteColumn() {
  const adminPass = $("#deleteColPassword").val();
  if (!adminPass) return showToast("Password is required.", "error");
  $("#deleteColModalOverlay").hide();
  Swal.fire({
    title: "Moving to Recycle Bin...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });
  try {
    const res = await fetch("/api/admin/delete-column", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        colName: contextColName,
        adminPassword: adminPass,
      }),
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire("Moved!", "Column moved to Recycle Bin (30 Days).", "success");
      setTimeout(() => location.reload(), 1500);
    } else {
      Swal.fire("Error", data.message, "error");
    }
  } catch (e) {
    Swal.fire("Error", "Failed to delete column securely.", "error");
  }
}

function toggleTextWrap() {
  const table = $("#erpTable");
  if (table.hasClass("truncate-text")) {
    table.removeClass("truncate-text").addClass("wrap-text");
    localStorage.setItem("erpTextWrap", "wrap");
    showToast("Table Text Wrap Enabled", "info");
  } else {
    table.removeClass("wrap-text").addClass("truncate-text");
    localStorage.setItem("erpTextWrap", "truncate");
    showToast("Table Text Truncate Enabled", "info");
  }
  if (erpDataTable) erpDataTable.columns.adjust().draw(false);
}

function toggleHeaderWrap() {
  const table = $("#erpTable");
  if (table.hasClass("header-wrap")) {
    table.removeClass("header-wrap");
    localStorage.setItem("erpHeaderWrap", "nowrap");
    showToast("Header Wrap Disabled", "info");
  } else {
    table.addClass("header-wrap");
    localStorage.setItem("erpHeaderWrap", "wrap");
    showToast("Header Wrap Enabled", "info");
  }
  if (erpDataTable) erpDataTable.columns.adjust().draw(false);
}

function updateActiveUsersUI(users) {
  const count = users.length;
  document.getElementById("activeCountDisplay").innerText = `${count} active`;
  
  const badge = document.getElementById("activeUsersBadge");
  badge.removeAttribute("title");
  
  badge.onclick = function() {
    // Creating a premium badge layout for usernames
    let usersHtml = '<div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 15px;">';
    
    users.forEach(user => {
      usersHtml += `
        <div style="background: #f8fafc; color: #0f172a; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <span class="material-icons" style="font-size: 18px; color: #10b981;">account_circle</span>
          ${user}
        </div>
      `;
    });
    
    usersHtml += '</div>';

    Swal.fire({
      title: '<strong>Currently Active</strong>',
      html: usersHtml,
      showConfirmButton: true,
      confirmButtonColor: '#0ea5e9',
      confirmButtonText: 'Done',
      customClass: {
        popup: 'animated fadeIn faster'
      }
    });
  };
}

function renderTable(response) {
  if ($(".edit-input").length > 0 || saveQueue.length > 0) return;
  let scrollWrapper = document.querySelector(".table-scroll-wrapper"),
    preserveScrollTop = scrollWrapper ? scrollWrapper.scrollTop : 0,
    preserveScrollLeft = scrollWrapper ? scrollWrapper.scrollLeft : 0;
  let currentPage = 0;
  if ($.fn.DataTable.isDataTable("#erpTable")) {
    currentPage = $("#erpTable").DataTable().page();
  }
  document.getElementById("loader").style.display = "none";
  if (response.success) {
    updateSyncUI("live");
    if (response.activeUsers) {
      updateActiveUsersUI(response.activeUsers);
    }
  }
  const tableEl = document.getElementById("erpTable");
  tableEl.style.display = "table";

  if ($.fn.DataTable.isDataTable("#erpTable")) {
    $("#erpTable").DataTable().destroy();
    $("#erpTable").empty();
  }
  if (!response.success) {
    if (
      response.message &&
      (response.message.includes("Access Denied") ||
        response.message.toLowerCase().includes("invalid") ||
        response.message.toLowerCase().includes("expired"))
    )
      return performLogout();
    return showToast(response.message, "error");
  }

  let wrapPref = localStorage.getItem("erpTextWrap") || "truncate";
  if (wrapPref === "wrap")
    $(tableEl).addClass("wrap-text").removeClass("truncate-text");
  else $(tableEl).addClass("truncate-text").removeClass("wrap-text");

  let headerWrapPref = localStorage.getItem("erpHeaderWrap") || "nowrap";
  if (headerWrapPref === "wrap") $(tableEl).addClass("header-wrap");
  else $(tableEl).removeClass("header-wrap");

  cachedHeaders = response.headers;
  cachedAlignments = response.alignments || [];
  cachedColTypes = response.colTypes || [];
  cachedColWidths = response.colWidths || [];

  // 🟢 Extract all unique companies from DB rows dynamically
  let compIdx = cachedHeaders.findIndex(
    (h) => h.replace(/\s+/g, "").toUpperCase() === "COMPANY",
  );
  let dbCompanies = [];
  if (compIdx !== -1 && response.rows) {
    response.rows.forEach((r) => {
      let val = String(r[compIdx] || "").trim();
      if (val && !dbCompanies.includes(val)) dbCompanies.push(val);
    });
  }
  DYNAMIC_COMPANIES = [
    ...new Set(["Haka", "Aljoda", "Masar Wheels", "We1", ...dbCompanies]),
  ].sort();

  // Merge per-user alignments and column widths from localStorage
  let userAligns = JSON.parse(localStorage.getItem("erpColAligns_" + currentUser.username)) || {};
  cachedAlignments = cachedHeaders.map(h => ({
    name: h,
    align: userAligns[h] || (cachedAlignments.find(a => a.name === h)?.align || "left")
  }));

  let userWidths = JSON.parse(localStorage.getItem("erpColWidths_" + currentUser.username)) || {};
  cachedColWidths = cachedHeaders.map(h => ({
    name: h,
    width: userWidths[h] || (cachedColWidths.find(w => w.name === h)?.width || "100px")
  }));
  globalNextSN = response.nextSN || 1;
  globalLockedCols = response.lockedCols || [];

  let snCounter = 1;
  let plateIdx = cachedHeaders.findIndex((h) =>
      h.replace(/\s+/g, "").toUpperCase().includes("PLATENUMBER"),
    ),
    statusIdx = cachedHeaders.findIndex(
      (h) => h.replace(/\s+/g, "").toUpperCase() === "STATUS",
    ),
    mobIdx = cachedHeaders.findIndex(
      (h) => h.replace(/\s+/g, "").toUpperCase() === "EQUIPMENTREACHEDATSITE",
    ),
    lwdIdx = cachedHeaders.findIndex(
      (h) => h.replace(/\s+/g, "").toUpperCase() === "LASTWORKINGDAY",
    );
  let plateMap = {},
    conflictMap = {};

  response.rows.forEach((row) => {
    let sheetRow = row[row.length - 1],
      pRaw =
        plateIdx !== -1 && row[plateIdx]
          ? String(row[plateIdx])
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
          : "";
    if (pRaw) {
      if (!plateMap[pRaw]) plateMap[pRaw] = [];
      let mobVal =
        mobIdx !== -1 && row[mobIdx]
          ? parseDateStr(row[mobIdx])?.getTime()
          : null;
      let lwdVal =
        lwdIdx !== -1 && row[lwdIdx]
          ? parseDateStr(row[lwdIdx])?.getTime()
          : null;
      plateMap[pRaw].push({
        sheetRow: sheetRow,
        status:
          statusIdx !== -1 ? String(row[statusIdx]).trim().toLowerCase() : "",
        mobTime: mobVal,
        lwdTime: lwdVal,
      });
    }
  });

  Object.keys(plateMap).forEach((pRaw) => {
    let entries = plateMap[pRaw];
    if (entries.length > 1) {
      let runningRows = entries
        .filter((e) => e.status === "running")
        .map((e) => e.sheetRow);
      if (runningRows.length > 1)
        runningRows.forEach((r) => (conflictMap[r] = "conflict-running"));
      let validEntries = entries
        .filter((e) => e.mobTime !== null)
        .sort((a, b) => a.mobTime - b.mobTime);
      for (let k = 0; k < validEntries.length - 1; k++) {
        if (
          validEntries[k].lwdTime !== null &&
          validEntries[k + 1].mobTime < validEntries[k].lwdTime
        ) {
          conflictMap[validEntries[k].sheetRow] = "conflict-date";
          conflictMap[validEntries[k + 1].sheetRow] = "conflict-date";
        }
      }
    }
  });

  let theadHtml = "<thead><tr class='main-header'>";
  response.headers.forEach((h, i) => {
    let alignObj = cachedAlignments.find((a) => a.name === h),
      alignVal = alignObj ? alignObj.align : "left",
      colTypeObj = cachedColTypes.find((c) => c.name === h),
      cType = colTypeObj ? colTypeObj.type : "varchar",
      colHead = String(h).replace(/\s+/g, " ").trim().toUpperCase(),
      isCenter =
        [
          "PLATE NUMBER",
          "SITE",
          "IF SUB",
          "COMPANY",
          "CUSTOMER",
          "ASSET CODE",
          "VAT BILL OR NOT",
          "LAST WORKING DAY",
          "WORK START",
          "DAYS WORKED",
        ].includes(colHead) ||
        cType === "date" ||
        colHead.includes("DATE") ||
        colHead.includes("EXPIRE") ||
        colHead.includes("EQUIPMENT REACHED") ||
        alignVal === "center",
      isRight = alignVal === "right";
    let alignStyle = `justify-content: ${isCenter ? "center" : isRight ? "flex-end" : "space-between"};`,
      textAlign = isCenter
        ? "text-align: center;"
        : isRight
          ? "text-align: right;"
          : "text-align: left;";
    let isSN = colHead === "SN",
      isPlate = colHead === "PLATE NUMBER" || colHead === "PLATE NO",
      thClass = isSN ? "sn-column" : isPlate ? "plate-column" : "",
      iconsContainerHTML = "",
      renameFn = "";
    if (!isSN) {
      let isLocked = globalLockedCols.includes(h),
        lockClass = isLocked ? "lock-icon is-locked" : "lock-icon",
        lockStyle = isLocked ? "color:#dc2626;" : "color:#cbd5e1;",
        lockIconHTML = "";
      if (currentUser.role === "Super Admin") {
        lockIconHTML = `<span class="material-icons ${lockClass}" style="${lockStyle}" onclick="toggleColumnLock(event, '${h}', ${!isLocked})" title="${isLocked ? "Unlock Column" : "Lock Column"}">${isLocked ? "lock" : "lock_open"}</span>`;
      } else if (isLocked) {
        lockIconHTML = `<span class="material-icons ${lockClass}" style="${lockStyle} cursor:not-allowed;" title="Locked by Admin">lock</span>`;
      }
      let filterIconHTML = `<span class="material-icons filter-icon" onclick="openFilterMenu(event, '${h}', this)">filter_list</span>`;
      iconsContainerHTML = `<div class="header-icons">${lockIconHTML}${filterIconHTML}</div>`;
      renameFn =
        currentUser.role === "Super Admin" && !FIXED_COLUMNS.includes(colHead)
          ? `ondblclick="renameColumn(event, '${h}')"`
          : "";
    }
    theadHtml += `<th class="${thClass}" data-colidx="${i}" title="${isSN ? "" : "Right click for Column Options"}"><div class="header-content" style="${alignStyle}"><span class="col-title-text" style="${textAlign}" ${renameFn}>${h}</span>${iconsContainerHTML}</div></th>`;
  });
  theadHtml += "</tr></thead><tbody>";

  let tbodyHtml = "";
  response.rows.forEach((row) => {
    let dbId = row.pop(),
      cClass = conflictMap[dbId] || "";
    tbodyHtml += `<tr data-sheetrow="${dbId}" class="${cClass}">`;
    row.forEach((cell, index) => {
      let colName = response.headers[index],
        colTypeObj = cachedColTypes.find((c) => c.name === colName),
        cType = colTypeObj ? colTypeObj.type : "varchar",
        colHead = String(colName).replace(/\s+/g, " ").trim().toUpperCase(),
        alignObj = cachedAlignments.find((a) => a.name === colName),
        alignVal = alignObj ? alignObj.align : "left",
        isCenter =
          [
            "PLATE NUMBER",
            "SITE",
            "IF SUB",
            "COMPANY",
            "CUSTOMER",
            "ASSET CODE",
            "VAT BILL OR NOT",
            "LAST WORKING DAY",
            "WORK START",
            "DAYS WORKED",
          ].includes(colHead) ||
          cType === "date" ||
          colHead.includes("DATE") ||
          colHead.includes("EXPIRE") ||
          colHead.includes("EQUIPMENT REACHED") ||
          alignVal === "center",
        isRight = alignVal === "right",
        stylesArr = [];
      let isSN = colHead === "SN";
      if (isSN) {
        cell = snCounter++;
        stylesArr.push(
          "width: 40px",
          "min-width: 40px",
          "max-width: 40px",
          "text-align: center",
        );
      }
      if (!isSN && isCenter) stylesArr.push("text-align: center");
      else if (!isSN && isRight) stylesArr.push("text-align: right");

      let isPlate = colHead === "PLATE NUMBER" || colHead === "PLATE NO";
      let tdClass = isSN ? 'class="sn-column"' : isPlate ? 'class="plate-column"' : "";
      let styleAttr =
        stylesArr.length > 0 ? `style="${stylesArr.join("; ")}"` : "";

      // FIX: Force line breaks to render in browser for array history
      if (typeof cell === "string" && cell.includes("\n")) {
        styleAttr = styleAttr.replace(
          'style="',
          'style="white-space: pre-line !important; ',
        );
        if (!styleAttr) styleAttr = 'style="white-space: pre-line !important;"';
      }

      tbodyHtml += `<td data-colname="${colName}" ${tdClass} ${styleAttr}>${cell}</td>`;
    });
    tbodyHtml += "</tr>";
  });
  tbodyHtml += "</tbody>";
  tableEl.innerHTML = theadHtml + tbodyHtml;

  erpDataTable = $("#erpTable").DataTable({
    deferRender: true, // സ്ക്രീനിൽ കാണുന്ന വരികൾ മാത്രം DOM-ലേക്ക് വരയ്ക്കുന്നു
    bDestroy: true,
    processing: true,
    dom: '<"top-ribbon"<"ribbon-left"B> f <"right-controls"l i p>><"table-scroll-wrapper"t>',
    ordering: true,
    order: [],
    colReorder: { realtime: false },
    orderCellsTop: true,
    language: {
      search: "",
      searchPlaceholder: "Search records...",
      lengthMenu: "_MENU_ rows",
      info: "_START_ - _END_ of _TOTAL_",
      paginate: { previous: "Prev", next: "Next" },
    },
lengthMenu: [
      [50, 100, 200, 500, 1000, 2500, 5000],
      ["50", "100", "200", "500", "1000", "2500", "5000"],
    ],
    pageLength: 50, // പേജ് സൈസ് 50 ആയി നിലനിർത്തുന്നത് മെമ്മറി ക്രാഷ് ഒഴിവാക്കും
    autoWidth: false,
    stateSave: false, // ബ്രൗസർ ലോക്കൽ സ്റ്റോറേജ് ഓവർഫ്ലോ ആയി ക്രാഷ് ആവാതിരിക്കാൻ stateSave ഒഴിവാക്കുന്നു
    
   
    rowCallback: function (row, data) {
      if (data._dbId) $(row).attr("data-sheetrow", data._dbId);

      let sIdx = cachedHeaders.findIndex(
          (h) => h.trim().toLowerCase() === "status",
        ),
        statusVal = "";
      if (sIdx !== -1) {
        statusVal = String(data[sIdx]).trim().toLowerCase();
        $(row).removeClass("status-released status-replaced status-mobilizing");
        if (statusVal === "released") $(row).addClass("status-released");
        else if (statusVal === "replaced") $(row).addClass("status-replaced");
        else if (statusVal === "mobilizing")
          $(row).addClass("status-mobilizing");
      }
      let today = new Date();
      today.setHours(0, 0, 0, 0);
      let colWraps = JSON.parse(localStorage.getItem("erpColWraps")) || {};

      let api = this.api(); // Get DataTable API instance

      cachedHeaders.forEach((h, idx) => {
        // Safely get the specific cell node (skips if column is hidden)
        let cellNode = api.cell(row, idx).node();
        
        if (cellNode) {
          let $td = $(cellNode);
          let colHead = String(h).replace(/\s+/g, " ").trim().toUpperCase();
          
          if (colWraps[h] === "wrap") {
            $td[0].style.setProperty("white-space", "normal", "important");
            $td[0].style.setProperty("word-break", "break-word", "important");
          } else if (colWraps[h] === "nowrap") {
            $td[0].style.setProperty("white-space", "nowrap", "important");
            $td[0].style.setProperty("text-overflow", "ellipsis", "important");
            $td[0].style.setProperty("overflow", "hidden", "important");
          } else {
            $td.css({
              "white-space": "",
              "word-break": "",
              "text-overflow": "",
              overflow: "",
            });
          }

          // KEEP PRE-LINE FOR HISTORY NEWLINES OVERRIDING THE OTHERS
          if (typeof data[idx] === "string" && data[idx].includes("\n")) {
            $td[0].style.setProperty("white-space", "pre-line", "important");
          }

          if (
            colHead.includes("IQAMA EXPIRE") ||
            colHead.includes("LICENSE EXPIRE") ||
            colHead.includes("LICENCE EXPIRE") ||
            colHead.includes("EQ INSURAN") ||
            colHead.includes("FAHS MVPI")
          ) {
            // Reset previous manual styles if any
            $td[0].style.removeProperty("background-color");
            $td[0].style.removeProperty("color");
            
            if (statusVal === "running") {
              let dateStr = data[idx];
              if (dateStr && String(dateStr).trim() !== "") {
                let parsedDateStr = convertToInputDate(dateStr);
                if (parsedDateStr) {
                  let expDate = new Date(`${parsedDateStr}T00:00:00`);
                  if (!isNaN(expDate.getTime())) {
                    expDate.setHours(0, 0, 0, 0);
                    let diffDays = Math.ceil(
                      (expDate.getTime() - today.getTime()) /
                        (1000 * 60 * 60 * 24),
                    );
                    
                    if (diffDays < 0) {
                      // Already Expired (< 0 days)
                      $td[0].style.setProperty("background-color", "#800000", "important");
                      $td[0].style.setProperty("color", "#ffffff", "important");
                    } else if (diffDays >= 0 && diffDays <= 15) {
                      // 15 Days Gap (0 to 15 days)
                      $td[0].style.setProperty("background-color", "#FF9999", "important");
                      $td[0].style.setProperty("color", "#000000", "important");
                    } else if (diffDays > 15 && diffDays <= 30) {
                      // 30 Days Gap (16 to 30 days)
                      $td[0].style.setProperty("background-color", "#FFFF71", "important");
                      $td[0].style.setProperty("color", "#000000", "important");
                    }
                  }
                }
              }
            }
          }
        }
      });
    },
    buttons: [
      {
        text: '<span class="material-icons" style="font-size:16px;">download</span> Export',
        className: "dt-button btn-outline",
        action: async function (e, dt, node, config) {
          document.querySelector(".dt-buttons").classList.remove("show");
          showToast("Generating Premium Excel via Python Engine...", "info");
          
          const $btn = $(node);
          const originalText = $btn.html();
          $btn.prop("disabled", true).html('<span class="material-icons" style="font-size:16px; animation: spin 1s linear infinite;">sync</span> Exporting...');
          
          try {
            let visibleHeaders = [];
            erpDataTable.columns({ visible: true }).every(function () {
              let title = $(this.header()).find(".col-title-text").text().trim() || $(this.header()).text().trim();
              visibleHeaders.push(title);
            });

            let visibleRows = [];
            erpDataTable.rows({ search: "applied" }).every(function () {
              let rowData = this.data();
              let rowObj = [];
              erpDataTable.columns({ visible: true }).every(function (index) {
                rowObj.push(rowData[index] || "");
              });
              visibleRows.push(rowObj);
            });

            const res = await fetch("/api/export-excel-py", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ headers: visibleHeaders, rows: visibleRows }),
            });

            if (!res.ok) throw new Error("Export failed");
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Master_Data_Base_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showToast("Excel Downloaded Successfully!", "success");
          } catch (e) {
            console.error("Export Error:", e);
            showToast("Failed to export Excel", "error");
          } finally {
            $btn.prop("disabled", false).html(originalText);
          }
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">edit_note</span> Bulk Edit',
        className: "dt-button btn-outline bulk-edit-toggle-btn",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          toggleBulkEditMode();
        },
        init: function (api, node, config) {
          if (currentUser.role !== "Super Admin") {
            $(node).css("display", "none").remove();
          }
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">backup</span> Backup',
        className: "dt-button btn-outline",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          if (currentUser.role === "Viewer")
            return showToast("Access Denied.", "error");
          $("#tempBackupEmail").val("");
          $("#emailBackupModalOverlay").css("display", "flex");
          $("#tempBackupEmail").focus();
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">visibility</span> Columns',
        className: "dt-button btn-outline",
        action: () => {
          document.querySelector(".dt-buttons").classList.remove("show");
          openColVisModal();
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">wrap_text</span> Data Wrap',
        className: "dt-button btn-outline",
        action: function () {
          toggleTextWrap();
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">view_headline</span> Header Wrap',
        className: "dt-button btn-outline",
        action: function () {
          toggleHeaderWrap();
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">filter_alt_off</span> Clear Filters',
        className: "dt-button btn-outline",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          activeFilters = {};
          $(".filter-icon").removeClass("filter-active").text("filter_list");
          erpDataTable.draw();
          showToast("All Filters Cleared", "success");
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">edit</span> Edit Data',
        className: "dt-button btn-outline quick-edit-btn",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          toggleQuickEditMode();
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">restart_alt</span> Reset',
        className: "dt-button btn-outline",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          erpDataTable.colReorder.reset();
          erpDataTable.columns().visible(true);
          erpDataTable.order([]);
          activeFilters = {};
          $(".filter-icon").removeClass("filter-active").text("filter_list");
          erpDataTable.draw();
          localStorage.removeItem("erpColWidths_" + currentUser.username);
          localStorage.removeItem("erpColAligns_" + currentUser.username);
          showToast("Reloading...", "info");
          setTimeout(() => location.reload(), 1000);
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">undo</span>',
        className: "dt-button btn-outline dt-undo-btn",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          performUndo();
        },
        init: function (api, node, config) {
          $(node).prop("disabled", true);
        },
      },
      {
        text: '<span class="material-icons" style="font-size:16px;">redo</span>',
        className: "dt-button btn-outline dt-redo-btn",
        action: function () {
          document.querySelector(".dt-buttons").classList.remove("show");
          performRedo();
        },
        init: function (api, node, config) {
          $(node).prop("disabled", true);
        },
      },
    ],
    initComplete: function () {
      $("#erpTable thead th").off("click.DT");
      if ($(".mobile-tools-btn").length === 0) {
        $(".ribbon-left").prepend(
          '<button class="mobile-tools-btn" onclick="toggleMobileTools(event)"><span class="material-icons" style="font-size:16px;">settings</span> Tools</button>',
        );
      }
      if (currentUser.role !== "Super Admin") {
        $(".bulk-edit-toggle-btn").remove();
        $(".dt-button").filter(function () {
          return $(this).text().includes("Import") || $(this).text().includes("Bulk Edit");
        }).remove();
      }

      // --- CUSTOM SEARCH DROPDOWN LOGIC ---
      if ($("#searchModeSelector").length === 0) {
        let $searchLabel = $('.dataTables_filter label');
        $searchLabel.css({ 'display': 'flex', 'align-items': 'center', 'gap': '5px' });
        $searchLabel.prepend(`
            <select id="searchModeSelector" style="padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; outline: none; cursor: pointer; background: #f8fafc; color: #0f172a; font-weight: normal;">
                <option value="general" ${globalSearchMode === 'general' ? 'selected' : ''}>General</option>
                <option value="plate" ${globalSearchMode === 'plate' ? 'selected' : ''}>Plate No</option>
            </select>
        `);

        let $searchInput = $('.dataTables_filter input');
        $searchInput.off(); // Remove default DataTables search behavior

        let applyCustomSearch = () => {
            let val = $searchInput.val();
            let mode = $("#searchModeSelector").val();
            let plateIdx = cachedHeaders.findIndex(h => h.replace(/\s+/g, "").toUpperCase().includes("PLATENUMBER"));

            if (mode === "plate" && plateIdx !== -1) {
                erpDataTable.search(""); // Clear global search
                erpDataTable.column(plateIdx).search(val).draw();
            } else {
                if (plateIdx !== -1) erpDataTable.column(plateIdx).search(""); // Clear column search
                erpDataTable.search(val).draw();
            }
        };

        // Bind our custom search function
        $searchInput.on('keyup input search clear', applyCustomSearch);
        
        // Handle Dropdown change
        $("#searchModeSelector").on('change', function() {
            globalSearchMode = $(this).val(); // Save state
            applyCustomSearch();
            $searchInput.focus();
        });
      }
      // ------------------------------------

      applyColumnResizing();
      attachContextMenus();
      for (let colName in activeFilters) {
        if (activeFilters[colName].length > 0) {
          let targetTh = $("#erpTable th").filter(function () {
            return $(this).find(".col-title-text").text().trim() === colName;
          });
          if (targetTh.length > 0)
            targetTh
              .find(".filter-icon")
              .addClass("filter-active")
              .text("filter_alt");
        }
      }
      let newScrollWrapper = document.querySelector(".table-scroll-wrapper");
      if (newScrollWrapper) {
        newScrollWrapper.style.scrollBehavior = "auto";
        newScrollWrapper.scrollTop = preserveScrollTop;
        newScrollWrapper.scrollLeft = preserveScrollLeft;
        setTimeout(
          () => (newScrollWrapper.style.scrollBehavior = "smooth"),
          50,
        );
      }
    },
  });

  erpDataTable
    .on("order.dt", function () {
      let i = 1;
      erpDataTable
        .cells(null, 0, { search: "none", order: "applied" })
        .every(function (cell) {
          this.data(i++);
        });
    });

  if (currentPage > 0) {
    erpDataTable.page(currentPage).draw(false);
  } else {
    erpDataTable.draw(false);
  }
  attachEditListeners();
}

function toggleTree(iconEl) {
  let $icon = $(iconEl),
    $children = $icon.closest(".tree-node").children(".tree-children");
  if ($children.is(":visible")) {
    $children.slideUp(150);
    $icon.text("►");
    $icon.removeClass("text-blue-600");
  } else {
    $children.slideDown(150);
    $icon.text("▼");
    $icon.addClass("text-blue-600");
  }
}

function updateParentCheckboxes() {
  $(".month-cb").each(function () {
    let y = $(this).data("year"),
      m = $(this).data("month"),
      totalDays = $(`.day-cb[data-year="${y}"][data-month="${m}"]`).length,
      checkedDays = $(
        `.day-cb[data-year="${y}"][data-month="${m}"]:checked`,
      ).length;
    $(this).prop("checked", totalDays > 0 && totalDays === checkedDays);
  });
  $(".year-cb").each(function () {
    let y = $(this).data("year"),
      totalMonths = $(`.month-cb[data-year="${y}"]`).length,
      checkedMonths = $(`.month-cb[data-year="${y}"]:checked`).length;
    $(this).prop("checked", totalMonths > 0 && totalMonths === checkedMonths);
  });
  let visibleLeaves = $(".col-filter-cb:visible");
  if (visibleLeaves.length > 0) {
    let checkedLeaves = visibleLeaves.filter(":checked").length;
    $("#filterSelectAll").prop(
      "checked",
      visibleLeaves.length === checkedLeaves,
    );
  } else {
    $("#filterSelectAll").prop("checked", false);
  }
}

function openFilterMenu(event, colName, iconElement) {
  event.stopPropagation();
  currentFilterColName = colName;
  const menu = $("#excelFilterMenu"),
    listContainer = $("#filterChecklist");
  listContainer.empty();
  let colIdx = erpDataTable.column($(iconElement).closest("th")).index();

  // --- COLOR FILTER UI INJECTION ---
  $("#colorFilterContainer").remove();
  let colUpperForColor = String(colName).toUpperCase();
  let isDateAlertCol = colUpperForColor.includes("IQAMA EXPIRE") || colUpperForColor.includes("LICENSE EXPIRE") || colUpperForColor.includes("LICENCE EXPIRE") || colUpperForColor.includes("EQ INSURAN") || colUpperForColor.includes("FAHS MVPI");
  
  let prevSelectedColorData = activeFilters[colName] || [];
  let selectedColor = prevSelectedColorData.find(v => String(v).startsWith('__COLOR_'));

  if (isDateAlertCol) {
    let getBorder = (val) => selectedColor === val ? "3px solid #0f172a" : (val === "__COLOR_NONE__" && selectedColor !== val ? "1px solid #cbd5e1" : "2px solid transparent");
    
    let colorFilterHtml = `
      <div id="colorFilterContainer" style="border-bottom: 1px solid #e2e8f0; background: #fff; padding: 12px 15px;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 10px;">Filter by Color:</div>
        <div style="display:flex; gap: 12px; align-items:center;">
          <div class="color-filter-btn" data-color="__COLOR_EXPIRED__" style="width: 26px; height: 26px; background: #800000; border-radius: 4px; cursor: pointer; border: ${getBorder('__COLOR_EXPIRED__')}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" title="Expired (Red)"></div>
          <div class="color-filter-btn" data-color="__COLOR_15_DAYS__" style="width: 26px; height: 26px; background: #FF9999; border-radius: 4px; cursor: pointer; border: ${getBorder('__COLOR_15_DAYS__')}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" title="15 Days Gap (Light Red)"></div>
          <div class="color-filter-btn" data-color="__COLOR_30_DAYS__" style="width: 26px; height: 26px; background: #FFFF71; border-radius: 4px; cursor: pointer; border: ${getBorder('__COLOR_30_DAYS__')}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" title="30 Days Gap (Yellow)"></div>
          <div class="color-filter-btn" data-color="__COLOR_NONE__" style="width: 26px; height: 26px; background: #ffffff; border-radius: 4px; cursor: pointer; border: ${getBorder('__COLOR_NONE__')}; display:flex; align-items:center; justify-content:center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" title="Clear Color Filter">
             <span class="material-icons" style="font-size: 14px; color: #94a3b8;">format_color_reset</span>
          </div>
        </div>
      </div>
    `;
    $(colorFilterHtml).insertBefore($(".excel-filter-menu .filter-item").first());
    
    $("#colorFilterContainer").off('click', '.color-filter-btn').on('click', '.color-filter-btn', function() {
        let colorVal = $(this).data('color');
        if (selectedColor === colorVal || colorVal === "__COLOR_NONE__") {
            activeFilters[currentFilterColName] = []; // Deselect or Clear
        } else {
            activeFilters[currentFilterColName] = [colorVal]; // Select Color
        }
        closeCustomFilter();
        erpDataTable.draw();
        
        let targetTh = $("#erpTable th").filter(function () { return $(this).find(".col-title-text").text().trim() === currentFilterColName; });
        if (activeFilters[currentFilterColName].length > 0) {
            targetTh.find(".filter-icon").addClass("filter-active").text("filter_alt");
        } else {
            targetTh.find(".filter-icon").removeClass("filter-active").text("filter_list");
        }
    });
  }
  // --- END COLOR FILTER UI INJECTION ---

  let allOptions = new Set();
  erpDataTable.rows().every(function () {
    let rowData = this.data();
    let passesOtherFilters = true;
    for (let filterCol in activeFilters) {
      if (filterCol === colName) continue;
      let allowedValues = activeFilters[filterCol];
      if (!allowedValues || allowedValues.length === 0) continue;
      let fIdx = cachedHeaders.indexOf(filterCol);
      if (fIdx === -1) continue;
      let cellVal = String(rowData[fIdx] || "").trim();
      if (!allowedValues.includes(cellVal)) {
        passesOtherFilters = false;
        break;
      }
    }
    if (passesOtherFilters)
      allOptions.add(String(rowData[colIdx] || "").trim());
  });

  let allData = Array.from(allOptions).sort(),
    isDateCol = false;
  if (allData.length > 0) {
    let sample = allData.find((v) => v && v.trim() !== "");
    if (sample && /^\d{2}-[a-zA-Z]{3}-\d{4}$/.test(sample.trim()))
      isDateCol = true;
  }
  let previouslySelected = activeFilters[colName] || [],
    isAllSelected = previouslySelected.length === 0 && !selectedColor;
  $("#filterSelectAll").prop("checked", isAllSelected);
  $("#filterSelectAll")
    .off("change")
    .on("change", function () {
      let isChecked = $(this).is(":checked"),
        keyword = $("#filterSearchInput").val().toLowerCase();
      if (keyword === "") {
        $(".col-filter-cb").prop("checked", isChecked);
        $(".tree-cb").prop("checked", isChecked);
      } else {
        $(".col-filter-cb:visible").prop("checked", isChecked);
        $(".tree-cb:visible").prop("checked", isChecked);
      }
      updateParentCheckboxes();
    });

  if (isDateCol) {
    let dateTree = {},
      hasBlank = false,
      monthOrder = {
        Jan: 1,
        Feb: 2,
        Mar: 3,
        Apr: 4,
        May: 5,
        Jun: 6,
        Jul: 7,
        Aug: 8,
        Sep: 9,
        Oct: 10,
        Nov: 11,
        Dec: 12,
      };
    allData.forEach((val) => {
      if (!val || val.trim() === "") {
        hasBlank = true;
        return;
      }
      let p = convertToInputDate(val).split("-");
      if (p.length === 3) {
        let d = p[2],
          originalParts = val.split(/[\/\- \.]/),
          m = originalParts[1].substring(0, 3),
          y = p[0];
        if (!dateTree[y]) dateTree[y] = {};
        if (!dateTree[y][m]) dateTree[y][m] = [];
        if (!dateTree[y][m].includes(d)) dateTree[y][m].push(d);
      } else hasBlank = true;
    });

    if (hasBlank) {
      let isChecked = isAllSelected || previouslySelected.includes("");
      listContainer.append(
        `<div class="filter-item filter-row-item" style="padding-left:15px;"><input type="checkbox" value="" ${isChecked ? "checked" : ""} class="col-filter-cb leaf-cb"><label>(Blank)</label></div>`,
      );
    }
    Object.keys(dateTree)
      .sort((a, b) => b - a)
      .forEach((year) => {
        let yId = `flt_y_${year}`,
          yearHtml = `<div class="tree-node"><div class="filter-item tree-header" style="background:#f8fafc; border-top:1px solid #f1f5f9;"><span class="toggle-icon" onclick="toggleTree(this)">►</span><input type="checkbox" id="${yId}" class="tree-cb year-cb" data-year="${year}"><label for="${yId}" style="font-weight:700;">${year}</label></div><div class="tree-children" style="display:none; padding-left: 20px;">`;
        Object.keys(dateTree[year])
          .sort((a, b) => monthOrder[a] - monthOrder[b])
          .forEach((month) => {
            let mId = `flt_m_${year}_${month}`;
            yearHtml += `<div class="tree-node"><div class="filter-item tree-header"><span class="toggle-icon" onclick="toggleTree(this)">►</span><input type="checkbox" id="${mId}" class="tree-cb month-cb" data-year="${year}" data-month="${month}"><label for="${mId}" style="font-weight:600; color:#475569;">${month}</label></div><div class="tree-children" style="display:none; padding-left: 20px;">`;
            dateTree[year][month]
              .sort((a, b) => parseInt(a) - parseInt(b))
              .forEach((day) => {
                let dId = `flt_d_${year}_${month}_${day}`,
                  matchStr = `${day}-${month}-${year}`,
                  exactVal =
                    allData.find(
                      (v) =>
                        v &&
                        v.includes(day) &&
                        v.includes(month) &&
                        v.includes(year),
                    ) || matchStr,
                  isChecked =
                    isAllSelected || previouslySelected.includes(exactVal);
                yearHtml += `<div class="filter-item filter-row-item"><input type="checkbox" id="${dId}" value="${exactVal}" ${isChecked ? "checked" : ""} class="col-filter-cb leaf-cb day-cb" data-year="${year}" data-month="${month}"><label for="${dId}" style="color:#64748b;">${day}</label></div>`;
              });
            yearHtml += `</div></div>`;
          });
        yearHtml += `</div></div>`;
        listContainer.append(yearHtml);
      });
    updateParentCheckboxes();
    $(".year-cb").on("change", function () {
      let y = $(this).data("year"),
        isChecked = $(this).is(":checked");
      $(`.month-cb[data-year="${y}"], .day-cb[data-year="${y}"]`).prop(
        "checked",
        isChecked,
      );
      updateParentCheckboxes();
    });
    $(".month-cb").on("change", function () {
      let y = $(this).data("year"),
        m = $(this).data("month"),
        isChecked = $(this).is(":checked");
      $(`.day-cb[data-year="${y}"][data-month="${m}"]`).prop(
        "checked",
        isChecked,
      );
      updateParentCheckboxes();
    });
    $(".day-cb, .leaf-cb").on("change", updateParentCheckboxes);
  } else {
    allData.forEach((val) => {
      let displayVal = val.trim() === "" ? "(Blank)" : val,
        isChecked = isAllSelected || previouslySelected.includes(val),
        id = "flt_" + Math.random().toString(36).substr(2, 9);
      listContainer.append(
        `<div class="filter-item filter-row-item"><input type="checkbox" id="${id}" value="${val.replace(/"/g, "&quot;")}" ${isChecked ? "checked" : ""} class="col-filter-cb"><label for="${id}">${displayVal}</label></div>`,
      );
    });
    $(".col-filter-cb").on("change", updateParentCheckboxes);
  }

  $("#filterSearchInput")
    .off("keyup")
    .on("keyup", function () {
      let keyword = $(this).val().toLowerCase();
      if (keyword === "") {
        $(".tree-node, .filter-row-item").show();
      } else {
        if ($(".tree-node").length === 0) {
          $(".filter-row-item").each(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(keyword) > -1);
          });
        } else {
          $(".tree-node, .filter-row-item").hide();
          $(".filter-row-item, .tree-header").each(function () {
            if ($(this).text().toLowerCase().indexOf(keyword) > -1) {
              $(this).show();
              $(this).parents(".tree-node").show();
              $(this).parents(".tree-children").show();
              $(this)
                .parents(".tree-node")
                .find("> .tree-header .toggle-icon")
                .text("▼")
                .addClass("text-blue-600");
              if ($(this).hasClass("tree-header"))
                $(this)
                  .siblings(".tree-children")
                  .find(".filter-row-item, .tree-node")
                  .show();
            }
          });
        }
      }
      updateParentCheckboxes();
    });

  if (window.innerWidth <= 768) {
    menu
      .css({
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "90%",
        maxWidth: "350px",
        maxHeight: "80vh",
      })
      .show();
    if (!document.getElementById("mobileFilterOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "mobileFilterOverlay";
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      overlay.style.background = "rgba(0,0,0,0.5)";
      overlay.style.zIndex = "9998";
      overlay.onclick = closeCustomFilter;
      document.body.appendChild(overlay);
    } else
      document.getElementById("mobileFilterOverlay").style.display = "block";
  } else {
    let offset = $(iconElement).offset(),
      leftPos = offset.left - 200;
    if (leftPos < 0) leftPos = 10;
    menu
      .css({
        top: offset.top + 25 + "px",
        left: leftPos + "px",
        transform: "none",
      })
      .show();
  }
  $("#filterSearchInput").val("").focus();
}

function closeCustomFilter() {
  $("#excelFilterMenu").hide();
  const overlay = document.getElementById("mobileFilterOverlay");
  if (overlay) overlay.style.display = "none";
}

function applyCustomFilter() {
  let selectedValues = [],
    totalVisible = $(".col-filter-cb").length,
    checkedCount = 0;
  $(".col-filter-cb").each(function () {
    if ($(this).is(":checked")) {
      selectedValues.push($(this).val());
      checkedCount++;
    }
  });
  let targetTh = $("#erpTable th").filter(function () {
    return (
      $(this).find(".col-title-text").text().trim() === currentFilterColName
    );
  });
  if (targetTh.length > 0) {
    const icon = targetTh.find(".filter-icon");
    if (checkedCount === totalVisible || checkedCount === 0) {
      activeFilters[currentFilterColName] = [];
      icon.removeClass("filter-active").text("filter_list");
    } else {
      activeFilters[currentFilterColName] = selectedValues;
      icon.addClass("filter-active").text("filter_alt");
    }
  }
  closeCustomFilter();
  erpDataTable.draw();
}

function openAddColumnModal() {
  document.getElementById("userDropdownMenu").classList.remove("show");
  if (currentUser.role === "Viewer")
    return showToast("Access Denied.", "error");
  $("#newColName").val("");
  $("#newColType").val("varchar");
  $("#colModalOverlay").css("display", "flex");
  $("#newColName").focus();
}

async function submitNewColumn() {
  let colName = $("#newColName").val().trim(),
    colType = $("#newColType").val();
  if (colName === "") return showToast("Name cannot be empty.", "error");
  $("#colModalOverlay").hide();
  showToast("Adding...", "info");
  const res = await fetch("/api/add-column", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ colName: colName, colType: colType }),
  });
  const data = await res.json();
  if (data.success) {
    showToast("Added!", "success");
    fetchData(true);
  } else showToast(data.message, "error");
}

function toggleAllColumns(show) {
  $(".col-vis-cb").prop("checked", show);
  if (erpDataTable) {
    erpDataTable.columns().visible(show, false);
    erpDataTable.columns.adjust().draw(false);
  }
}

function openColVisModal() {
  $("#colVisSearch").val(""); // Clear search input when opening
  document.getElementById("colVisList").innerHTML = "";
  erpDataTable.columns().every(function (index) {
    let title = cachedHeaders[index];
    if (!title) return;
    $("#colVisList").append(
      `<div class="col-vis-item"><input type="checkbox" class="col-vis-cb" id="col_${index}" ${this.visible() ? "checked" : ""} onchange="erpDataTable.column(${index}).visible(this.checked)" style="margin:0; width: 16px; height: 16px;"><label for="col_${index}" style="cursor:pointer; width:100%; font-size:13px; font-weight:600;">${title}</label></div>`,
    );
  });
  $("#colVisModalOverlay").css("display", "flex");
  setTimeout(() => $("#colVisSearch").focus(), 100); // Auto focus on search box
}

// 🟢 NEW FUNCTION: Filter columns based on search input
function filterColVis(keyword) {
  const lowerKw = keyword.toLowerCase().trim();
  $(".col-vis-item").each(function () {
    const labelText = $(this).find("label").text().toLowerCase();
    if (labelText.includes(lowerKw)) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
}

let editingRowDbId = null;
function openAddEntryModal(dbId = null) {
  if (typeof dbId === "object") dbId = null; // Click object block
  document.getElementById("userDropdownMenu").classList.remove("show");
  if (currentUser.role === "Viewer")
    return showToast("Access Denied.", "error");

  editingRowDbId = dbId;
  if (editingRowDbId) {
    $("#entryModalOverlay h3").text("Edit Entire Row");
    $("#entryModalOverlay .btn-primary").hide(); // Hide 'Save & New' when editing
    $("#entryModalOverlay .btn-success").text("Update Record");
  } else {
    $("#entryModalOverlay h3").text("Create New Entry");
    $("#entryModalOverlay .btn-primary").show();
    $("#entryModalOverlay .btn-success").text("Save Entry");
  }

  $("#dynamicFormFields").empty();
  let listsHtml = "";
  const suggestionTargetCols = [
    "PLATE NO",
    "PLATE NUMBER",
    "TYPE OF VEHICLE",
    "VEHICLE TYPE",
    "SITE",
    "CUSTOMER",
    "OWNER",
    "FIELD COORDINATOR",
    "FIELD CO",
    "SITE COORDINATOR",
    "SITE CO",
  ];
  cachedHeaders.forEach((header, index) => {
    let colUpper = header.replace(/\s+/g, " ").trim().toUpperCase();
    if (suggestionTargetCols.includes(colUpper)) {
      let uniqueVals = new Set();
      if (erpDataTable) {
        erpDataTable
          .column(index)
          .data()
          .each((val) => {
            if (val && String(val).trim() !== "")
              uniqueVals.add(String(val).trim());
          });
      }
      let optionsHtml = Array.from(uniqueVals)
        .sort()
        .map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}">`)
        .join("");
      listsHtml += `<datalist id="datalist_entry_${index}">${optionsHtml}</datalist>`;
    }
  });
  $("#dynamicFormFields").append(listsHtml);

  // --- NEW CUSTOM ORDERING & HIDING LOGIC ---
  const isEditing = !!editingRowDbId;

  const excludedCols = isEditing ? [] : [
    "DAYS WORKED", "PAY FROM", "MUBARAK REMARK", "OFFICE REMARK",
    "LAST WORKING DAY", "RELEASE DATE", "REPLACED DATE", "REPLACED NEW VEHICLE",
    "DRIVER STATUS REMARK", "OD WRK END", "OLD DRIVER NAME", "OD MOB"
  ];

 const priorityOrder = [
    "SN", "WORK START", "PLATE NUMBER", "PLATE NO", "EQUIPMENT REACHED AT SITE",
    "TYPE OF VEHICLE", "RATE", "SITE", "IF SUB", "COMPANY", "CUSTOMER",
    // നിങ്ങൾ ആവശ്യപ്പെട്ട പുതിയ ക്രമം (Status തൊട്ട് Old Driver / Mobile വരെ):
    "STATUS", "STATUS REMARK", "LAST WORKING DAY", "RELEASE DATE", "REPLACED DATE", 
    "REPLACED NEW VEHICLE", "OLD VEHICLE", "OWNER NAME", "OWNER", "OWNER NUMBER", 
    "MOBILE (OWNER)", "VAT BILL OR NOT", "VAT BILL STATUS", "DRIVER NAME", "MOBILE", 
    "MOBILE (DRIVER)", "OLD DRIVER NAME", "OD MOB",
    // ബാക്കി ഫീൽഡുകൾ:
    "IQAMA NUMBER", "IQAMA EXPIRE DATE", "IQAMA EXPIRE", "LICENSE EXPIRE DATE", 
    "LICENSE EXPIRE", "LICENCE EXPIRE DATE", "LICENCE EXPIRE", 
    "EQ INSURANSE EXPIRE DATE", "EQ INSURAN", "FAHS MVPI EXPIRE", "FAHS MVPI", 
    "IQAMA NOTE", "LICENCE NOTE", "LICENSE NOTE", "NATIONALITY", 
    "CHASIS NO.", "CHASIS NO", "MODEL", "DAYS WORKED", "DRIVER STATUS REMARK"
  ];

  let generatedHtmlMap = {};
  let remainingHeaders = [];

  cachedHeaders.forEach((header, index) => {
    let colTypeObj = cachedColTypes.find((c) => c.name === header),
      cType = colTypeObj ? colTypeObj.type : "varchar",
      colUpper = header.replace(/\s+/g, " ").trim().toUpperCase();

    if (excludedCols.includes(colUpper)) return;

    let isDateCol =
        cType === "date" ||
        colUpper.includes("DATE") ||
        colUpper.includes("EXPIRE") ||
        colUpper.includes("EQUIPMENT REACHED") ||
        colUpper === "LAST WORKING DAY" ||
        colUpper === "WORK START";
    let isIntCol = cType === "int";
    
    let isSuggestionCol = suggestionTargetCols.includes(colUpper);
    let listAttr = isSuggestionCol ? `list="datalist_entry_${index}"` : "";

    // Fix: Link 'Old Vehicle' to 'Plate Number' suggestions
    if (colUpper === "OLD VEHICLE") {
      let plateIdx = cachedHeaders.findIndex(h => h.replace(/\s+/g, " ").trim().toUpperCase() === "PLATE NUMBER");
      if (plateIdx !== -1) {
        listAttr = `list="datalist_entry_${plateIdx}"`;
      }
    }

    let inputHtml = `<input type="text" class="modal-input entry-input" data-colname="${header}" ${listAttr}>`;

    if (isDateCol) {
      inputHtml = `<input type="date" class="modal-input entry-input" data-colname="${header}">`;
    } else if (isIntCol) {
      inputHtml = `<input type="number" class="modal-input entry-input" data-colname="${header}">`;
    } else if (["REMARK", "REMARKS", "DRIVER LOG"].includes(colUpper)) {
      inputHtml = `<textarea class="modal-input entry-input" data-colname="${header}"></textarea>`;
    } else if (colUpper === "IF SUB") {
      inputHtml = `<select class="modal-input entry-input" data-colname="${header}"><option value="">(Blank)</option><option value="Sub">Sub</option></select>`;
    } else if (colUpper === "STATUS") {
      inputHtml = `<select class="modal-input entry-input" data-colname="${header}"><option value="">Select Status</option><option value="Running">Running</option><option value="Released">Released</option><option value="Replaced">Replaced</option><option value="Mobilizing">Mobilizing</option></select>`;
    } else if (colUpper === "COMPANY") {
      let optionsCompHtml = DYNAMIC_COMPANIES.map(function (o) {
        return `<option value="${o.replace(/"/g, "&quot;")}">${o}</option>`;
      }).join("");
      optionsCompHtml += `<option value="ADD_NEW_COMPANY" style="font-weight:bold; color:#2563eb;">+ Add New Company</option>`;
      inputHtml = `<select class="modal-input entry-input company-modal-select" data-colname="${header}" onchange="handleModalCompanyChange(this)"><option value="">Select Company</option>${optionsCompHtml}</select>`;
    } else if (colUpper === "VAT BILL OR NOT") {
      inputHtml = `<select class="modal-input entry-input" data-colname="${header}"><option value="">Select Option</option><option value="Yes">Yes</option><option value="No">No</option></select>`;
    } else if (colUpper === "SN") {
      inputHtml = `<input type="text" class="modal-input entry-input" data-colname="${header}" value="${globalNextSN}" readonly style="background-color:#f8fafc; cursor:not-allowed;">`;
    } else if (
      colUpper === "SITE" &&
      currentUser.role !== "Admin" &&
      currentUser.role !== "Super Admin"
    ) {
      inputHtml = `<input type="text" class="modal-input entry-input" data-colname="${header}" value="${currentUser.site}" readonly style="background-color:#f8fafc; cursor:not-allowed;">`;
    }

    generatedHtmlMap[colUpper] = `<div class="form-group"><label class="form-label" style="display:block; margin-bottom:5px; font-weight:600; color:#334155; font-size:12px;">${header}</label>${inputHtml}</div>`;
    remainingHeaders.push({ original: header, upper: colUpper });
  });

  let finalHtml = "";
  // 1. Process items that match the priority order
  priorityOrder.forEach(priorityCol => {
    let matchingIndex = remainingHeaders.findIndex(h => h.upper === priorityCol);
    if (matchingIndex !== -1) {
      finalHtml += generatedHtmlMap[priorityCol];
      remainingHeaders.splice(matchingIndex, 1);
    }
  });

  // 2. Append any remaining fields that were not in the priority list
  remainingHeaders.forEach(h => {
    finalHtml += generatedHtmlMap[h.upper];
  });

  $("#dynamicFormFields").append(finalHtml);

  if (editingRowDbId) {
    let $row = $(`#erpTable tbody tr[data-sheetrow="${editingRowDbId}"]`);
    $(".entry-input").each(function () {
      let colName = $(this).data("colname");
      if (colName === "SN") return;
      let colUpper = String(colName).replace(/\s+/g, "").toUpperCase();

      let val = $row.find(`td[data-colname="${colName}"]`).text().trim();
      if ($(this).attr("type") === "date" && val) {
         $(this).val(convertToInputDate(val));
      } else {
         $(this).val(val);
      }

      // 🟢 Lock Driver Name & Mobile in Edit Entire Row to protect driver history
      if (colUpper === "DRIVERNAME" || colUpper === "MOBILE" || colUpper === "MOBILES") {
         $(this).prop("readonly", true).css({
            "background-color": "#f1f5f9",
            "cursor": "not-allowed",
            "border": "1px solid #cbd5e1"
         }).attr("title", "Please update driver details via Driver Management (Right-click Driver Name or SN)");
      }
    });
    let snVal = $row.find(`td[data-colname="SN"]`).text().trim() || $row.find("td.sn-column").text().trim();
    $(".entry-input[data-colname='SN']").val(snVal);
  }

  $("#entryModalOverlay").css("display", "flex");
}

async function submitNewEntry(keepOpen = false) {
  let rowDataObj = {};
  $(".entry-input").each(function () {
    let val = $(this).val().trim(),
      cName = String($(this).data("colname")).trim(),
      colTypeObj = cachedColTypes.find((c) => c.name === cName),
      cType = colTypeObj ? colTypeObj.type : "varchar",
      colUpper = cName.toUpperCase(),
      isDateCol =
        cType === "date" ||
        colUpper.includes("DATE") ||
        colUpper.includes("EXPIRE") ||
        colUpper.includes("EQUIPMENT REACHED") ||
        colUpper === "LAST WORKING DAY" ||
        colUpper === "WORK START";
    if (isDateCol && val) val = formatToDDMMMYYYY(val);
    rowDataObj[$(this).data("colname")] = val;
  });

  if (!keepOpen) {
    $("#entryModalOverlay").hide();
  } else {
    $("#entryModalOverlay .btn").prop("disabled", true);
    showToast("Saving...", "info");
  }

  updateSyncUI("saving");

  try {
    let res, data;
    
    if (editingRowDbId) {
      let edits = [];
      for (let col in rowDataObj) {
         if (col.toUpperCase() === "SN") continue;
         edits.push({ dbId: editingRowDbId, colName: col, newValue: rowDataObj[col] });
      }
      res = await fetch("/api/update-cells-batch", {
         method: "POST",
         headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
         body: JSON.stringify({ edits: edits }),
      });
      data = await res.json();
    } else {
      res = await fetch("/api/add-row", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rowDataObj: rowDataObj }),
      });
      data = await res.json();
    }
    
    if (data.success) {
      showToast(editingRowDbId ? "Record Updated!" : "Added!", "success");
      if (!editingRowDbId) globalNextSN++; 
      fetchData(true);
      
      if (keepOpen && !editingRowDbId) {
        openAddEntryModal(); 
      }
    } else {
      updateSyncUI("error");
      showToast(data.message, "error");
    }
  } catch (error) {
    updateSyncUI("error");
    showToast("Network Error", "error");
  } finally {
    if (keepOpen) {
      $("#entryModalOverlay .btn").prop("disabled", false);
    }
  }
}

async function sendCustomBackup() {
  let targetEmail = $("#tempBackupEmail").val().trim();
  if (!targetEmail) return showToast("Please enter an email address.", "error");
  $("#emailBackupModalOverlay").hide();
  showToast(`Generating Backup for ${targetEmail}...`, "info");
  try {
    const res = await fetch("/api/custom-backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetEmail: targetEmail }),
    });
    const data = await res.json();
    if (data.success) showToast(`Backup sent!`, "success");
    else showToast(data.message, "error");
  } catch (error) {
    showToast("Server connection failed.", "error");
  }
}

function applyColumnResizing() {
  const table = document.getElementById("erpTable"),
    cols = table.querySelectorAll(".main-header th");
  cols.forEach((col, index) => {
    let colName = col.querySelector(".col-title-text").innerText.trim();
    if (colName.toUpperCase() === "SN") return;
    let widthObj = cachedColWidths.find((w) => w.name === colName);
    let widthToApply = widthObj && widthObj.width ? widthObj.width : "100px";
    col.style.width = widthToApply;
    col.style.minWidth = widthToApply;
    col.style.maxWidth = widthToApply;
    const resizer = document.createElement("div");
    resizer.classList.add("col-resizer");
    col.appendChild(resizer);
    let startX,
      startWidth,
      isResizing = false;

    resizer.addEventListener("mousedown", function (e) {
      startX = e.clientX;
      startWidth = col.offsetWidth;
      isResizing = true;
      resizer.classList.add("resizing");
      document.addEventListener("mousemove", mouseMoveHandler);
      document.addEventListener("mouseup", mouseUpHandler);
      e.stopPropagation();
      e.preventDefault();
    });

    const mouseMoveHandler = function (e) {
      if (isResizing) {
        requestAnimationFrame(() => {
          const newWidth = Math.max(40, startWidth + (e.clientX - startX));
          col.style.width = `${newWidth}px`;
          col.style.minWidth = `${newWidth}px`;
          col.style.maxWidth = `${newWidth}px`;
        });
      }
    };
    const mouseUpHandler = function () {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove("resizing");
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
        let finalWidth = col.style.width;
        let userWidths = JSON.parse(localStorage.getItem("erpColWidths_" + currentUser.username)) || {};
        userWidths[colName] = finalWidth;
        localStorage.setItem("erpColWidths_" + currentUser.username, JSON.stringify(userWidths));
        showToast("Column width saved locally", "info");
      }
    };
  });
}

async function processQueue() {
  if (isProcessingQueue || saveQueue.length === 0) {
    if (saveQueue.length === 0) updateSyncUI("live");
    return;
  }
  isProcessingQueue = true;
  updateSyncUI("saving");
  let currentBatch = [...saveQueue];
  saveQueue = [];
  try {
    // Routed to High-Speed Python Engine Proxy
    const res = await fetch("/api/update-cells-batch-py", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ edits: currentBatch }),
      keepalive: true 
    });
    const data = await res.json();
    isProcessingQueue = false;
    if (data.success) {
      if (saveQueue.length > 0) processQueue();
      else updateSyncUI("live");
    } else {
      updateSyncUI("error");
      Swal.fire({ icon: "error", title: "Save Failed", text: data.message });
      saveQueue = [...currentBatch, ...saveQueue];
    }
  } catch (e) {
    isProcessingQueue = false;
    updateSyncUI("error");
    saveQueue = [...currentBatch, ...saveQueue];
    setTimeout(() => processQueue(), 3000);
  }
}

function performUndo() {
  if (undoStack.length === 0) return;
  let action = undoStack.pop();
  redoStack.push(action);
  updateUndoRedoUI();
  applyHistoricalState(action.sheetRow, action.colName, action.oldVal);
  showToast("Undo applied", "info");
}
function performRedo() {
  if (redoStack.length === 0) return;
  let action = redoStack.pop();
  undoStack.push(action);
  updateUndoRedoUI();
  applyHistoricalState(action.sheetRow, action.colName, action.newVal);
  showToast("Redo applied", "info");
}

function applyHistoricalState(dbId, colName, value) {
  let rowIndex = erpDataTable.row(`[data-sheetrow="${dbId}"]`).index(),
    colIndex = cachedHeaders.indexOf(colName);
  if (rowIndex !== undefined && colIndex !== -1)
    erpDataTable.cell(rowIndex, colIndex).data(value).draw(false);
  let colUpper = String(colName).replace(/\s+/g, " ").trim().toUpperCase(),
    $row = $(`#erpTable tbody tr[data-sheetrow="${dbId}"]`);
  if (colUpper === "STATUS" && $row.length) {
    $row.removeClass("status-released status-replaced status-mobilizing");
    let sVal = value.trim().toLowerCase();
    if (sVal === "released") $row.addClass("status-released");
    else if (sVal === "replaced") $row.addClass("status-replaced");
    else if (sVal === "mobilizing") $row.addClass("status-mobilizing");
  }
  if ($row.length) {
    let $cell = $row.find(`td[data-colname="${colName}"]`);
    if ($cell.length) {
      $cell[0].scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
      $cell.css("transition", "background-color 0.3s ease");
      $cell.css("background-color", "#fef08a");
      setTimeout(() => {
        $cell.css("background-color", "");
      }, 1500);
    }
  }
  saveQueue.push({ dbId: dbId, colName: colName, newValue: value });
  processQueue();
}

/* --- NEW CODE --- */
// 🟢 INSTANT FRONT-END CALCULATION ENGINE
function autoCalculateRow(dbId) {
    let $row = $(`#erpTable tbody tr[data-sheetrow="${dbId}"]`);
    if (!$row.length) return;

    let getVal = (headerMatch) => {
        let colIdx = cachedHeaders.findIndex(h => h.replace(/\s+/g, "").toUpperCase().includes(headerMatch.replace(/\s+/g, "").toUpperCase()));
        if (colIdx === -1) return "";
        return $row.find(`td[data-colname="${cachedHeaders[colIdx]}"]`).text().trim();
    };

    let setVal = (headerMatch, val) => {
        let colIdx = cachedHeaders.findIndex(h => h.replace(/\s+/g, "").toUpperCase().includes(headerMatch.replace(/\s+/g, "").toUpperCase()));
        if (colIdx === -1) return;
        let colName = cachedHeaders[colIdx];
        let $td = $row.find(`td[data-colname="${colName}"]`);
        let oldVal = $td.text().trim();
        
        if (oldVal !== String(val)) {
            $td.text(val);
            if (erpDataTable) erpDataTable.cell($td[0]).data(val);
            
            let plateIdx = cachedHeaders.findIndex(h => h.replace(/\s+/g, "").toUpperCase().includes("PLATENUMBER"));
            let plateNo = plateIdx !== -1 ? $row.find("td").eq(plateIdx).text().trim() : "N/A";
            
            // Queue for instant backend sync
            saveQueue.push({
                dbId: dbId,
                colName: colName,
                newValue: String(val),
                plate: plateNo
            });
        }
    };

    let wsVal = getVal("WORKSTART");
    let lwdVal = getVal("LASTWORKINGDAY");
    let statusVal = getVal("STATUS").toLowerCase();
    let mobVal = getVal("EQUIPMENTREACHED");

    if (mobVal && !wsVal) {
        setVal("WORKSTART", mobVal);
        wsVal = mobVal;
    }

    if (wsVal && lwdVal) {
        let d1 = parseDateStr(wsVal);
        let d2 = parseDateStr(lwdVal);
        if (d1 && d2 && !isNaN(d1) && !isNaN(d2)) {
            let diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
            if (diffDays > 0) {
                setVal("DAYSWORKED", diffDays);
            }
        }
    }

    if (statusVal === "released" && lwdVal) {
        if (!getVal("RELEASEDATE")) setVal("RELEASEDATE", lwdVal);
    }
    if (statusVal === "replaced" && lwdVal) {
        if (!getVal("REPLACEDDATE")) setVal("REPLACEDDATE", lwdVal);
    }
}


function attachEditListeners() {
  $("#erpTable tbody")
    .off("click", "td")
    .on("click", "td", function (e) {
      if ($(this).find(".edit-input").length > 0) return;
      if (isQuickEditMode) {
        let $openInputs = $(".edit-input");
        if ($openInputs.length > 0) {
          $openInputs.blur();
        }
        $(this).trigger("dblclick");
        return;
      }
      const range = document.createRange(),
        sel = window.getSelection();
      range.selectNodeContents(this);
      sel.removeAllRanges();
      sel.addRange(range);
    });

  $("#erpTable tbody")
    .off("dblclick", "td")
    .on("dblclick", "td", function () {
      if ($(this).find(".edit-input").length > 0) return;
      if (currentUser.role === "Viewer")
        return showToast("Access Denied.", "error");

      let $cell = $(this),
        colName = $cell.data("colname"),
        colUpper = String(colName).replace(/\s+/g, " ").trim().toUpperCase();
        
      if (globalLockedCols.includes(colName) && currentUser.role !== "Super Admin")
        return showToast("Column is locked by Super Admin.", "error");
      if (colUpper === "SN")
        return showToast("Access Denied: SN is auto-generated.", "error");
      if (colUpper === "DAYS WORKED")
        return showToast("Auto calculated column.", "warning");

      // STRICT READ-ONLY COLUMNS TO PREVENT DATA LOSS & MAINTAIN ACCURACY
      const strictReadOnlyCols = [
        "OLD DRIVER NAME", 
        "OD MOB", 
        "OD WRK END", 
        "DRIVER STATUS REMARK",
        "DRIVER NAME"
      ];
      if (strictReadOnlyCols.includes(colUpper)) {
        return showToast(`Access Denied: '${colUpper}' is strictly Read-Only.`, "error");
      }

      let oldVal = $cell.text(),
        sheetRow = $cell.closest("tr").data("sheetrow");

      // Helper function to open cell (Safe Fallback)
      const openCellForEditing = () => {
          let colTypeObj = cachedColTypes.find((c) => c.name === colName),
            cType = colTypeObj ? colTypeObj.type : "varchar";
          let inputHtml = "",
            isSelect = false,
            isDateCol =
              cType === "date" ||
              colUpper.includes("DATE") ||
              colUpper.includes("EXPIRE") ||
              colUpper.includes("EQUIPMENT REACHED") ||
              colUpper === "LAST WORKING DAY" ||
              colUpper === "WORK START",
            isIntCol = cType === "int";

          if (isDateCol) {
            inputHtml = `<input type="date" class="edit-input" value="${convertToInputDate(oldVal)}">`;
          } else if (isIntCol) {
            inputHtml = `<input type="number" class="edit-input" value="${oldVal.replace(/"/g, "&quot;")}">`;
          } else if (["REMARK", "REMARKS", "DRIVER LOG"].includes(colUpper)) {
            inputHtml = `<textarea class="edit-input">${oldVal}</textarea>`;
          } else if (colUpper === "STATUS") {
            let optsStatus = ["Running", "Released", "Replaced", "Mobilizing"],
              optionsStatusHtml = optsStatus
                .map(function (o) {
                  return `<option value="${o}" ${oldVal.toLowerCase() === o.toLowerCase() ? "selected" : ""}>${o}</option>`;
                })
                .join("");
            inputHtml = `<select class="edit-input"><option value=""></option>${optionsStatusHtml}</select>`;
            isSelect = true;
          } else if (colUpper === "IF SUB") {
            let optsSub = ["Sub"],
              optionsSubHtml = optsSub
                .map(function (o) {
                  return `<option value="${o}" ${oldVal === o ? "selected" : ""}>${o}</option>`;
                })
                .join("");
            inputHtml = `<select class="edit-input"><option value=""></option>${optionsSubHtml}</select>`;
            isSelect = true;
          } else if (colUpper === "COMPANY") {
            let optionsCompHtml = DYNAMIC_COMPANIES.map(function (o) {
              return `<option value="${o.replace(/"/g, "&quot;")}" ${oldVal === o ? "selected" : ""}>${o}</option>`;
            }).join("");
            optionsCompHtml += `<option value="ADD_NEW_COMPANY" style="font-weight:bold; color:#2563eb;">+ Add New</option>`;
            inputHtml = `<select class="edit-input"><option value=""></option>${optionsCompHtml}</select>`;
            isSelect = true;
          } else if (colUpper === "VAT BILL OR NOT") {
            let optsVat = ["Yes", "No"],
              optionsVatHtml = optsVat
                .map(function (o) {
                  return `<option value="${o}" ${oldVal === o ? "selected" : ""}>${o}</option>`;
                })
                .join("");
            inputHtml = `<select class="edit-input"><option value=""></option>${optionsVatHtml}</select>`;
            isSelect = true;
          } else {
            inputHtml = `<input type="text" class="edit-input" value="${oldVal.replace(/"/g, "&quot;")}">`;
          }

          let $input = $(inputHtml);
          $cell.html($input);
          $input.focus();

          if (colUpper === "COMPANY") {
            $input.on("change", function () {
              if ($(this).val() === "ADD_NEW_COMPANY") {
                let newComp = prompt("Enter New Company Name:")?.trim();
                if (newComp) {
                  if (!DYNAMIC_COMPANIES.includes(newComp)) {
                    DYNAMIC_COMPANIES.push(newComp);
                    DYNAMIC_COMPANIES.sort();
                  }
                  $(this).append(
                    `<option value="${newComp.replace(/"/g, "&quot;")}" selected>${newComp}</option>`,
                  );
                  $(this).val(newComp);
                } else {
                  $(this).val(oldVal);
                }
              }
            });
          }

          if (!isSelect && !isDateCol) {
            let v = $input.val();
            $input.val("");
            $input.val(v);
            if ($input.is("textarea")) {
              $input.css("height", Math.max($cell.outerHeight(), $input[0].scrollHeight) + "px");
            } else {
              $input.css("height", $cell.outerHeight() + "px");
            }
          }

          $input.on("keydown", function (e) {
            if (e.key === "Escape") {
              $cell.text(oldVal);
              erpDataTable.cell($cell[0]).data(oldVal);
              
              // Unlock cell if cancelled
              fetch("/api/unlock-cell", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ dbId: sheetRow, colName: colName }),
              }).catch(()=> console.warn("Unlock bypass"));
              return;
            }
            if (e.key === "Enter" && e.altKey && $(this).is("textarea")) {
              e.preventDefault();
              let start = this.selectionStart,
                end = this.selectionEnd,
                val = $(this).val();
              $(this).val(val.substring(0, start) + "\n" + val.substring(end));
              this.selectionStart = this.selectionEnd = start + 1;
              $(this).css("height", "auto");
              $(this).css("height", this.scrollHeight + "px");
              return;
            }
            if (["Enter", "Tab", "ArrowUp", "ArrowDown"].includes(e.key)) {
              if (!isSelect || ["Enter", "Tab"].includes(e.key)) {
                if (e.key === "Enter") e.preventDefault();
                let direction = "";
                if (e.key === "Enter") direction = e.shiftKey ? "UP" : "DOWN";
                else if (e.key === "Tab") {
                  direction = e.shiftKey ? "LEFT" : "RIGHT";
                  e.preventDefault();
                } else if (e.key === "ArrowUp" && !isDateCol) direction = "UP";
                else if (e.key === "ArrowDown" && !isDateCol) direction = "DOWN";

                if (direction) {
                  let $currentRow = $cell.closest("tr"),
                    colIndex = $cell.index(),
                    $nextCell = null;
                  function getValidHorizontalCell($td, dir) {
                    let $nxt = dir === "RIGHT" ? $td.next("td") : $td.prev("td");
                    if ($nxt.length) {
                      if (
                        String($nxt.data("colname")).trim().toUpperCase() === "SN" ||
                        $nxt.css("display") === "none"
                      )
                        return getValidHorizontalCell($nxt, dir);
                      return $nxt;
                    }
                    return null;
                  }
                  if (direction === "DOWN")
                    $nextCell = $currentRow.next("tr").find("td").eq(colIndex);
                  else if (direction === "UP")
                    $nextCell = $currentRow.prev("tr").find("td").eq(colIndex);
                  else if (direction === "RIGHT")
                    $nextCell = getValidHorizontalCell($cell, "RIGHT");
                  else if (direction === "LEFT")
                    $nextCell = getValidHorizontalCell($cell, "LEFT");

                  $(this).blur();

                  if ($nextCell && $nextCell.length) {
                    requestAnimationFrame(() => $nextCell.trigger("dblclick"));
                  }
                }
              }
            }
          });

          // BLUR EVENT TO RELEASE LOCK AND SAVE
          $input.on("blur", function () {
            if ($cell.find(".edit-input").length === 0) return;
            let newVal = $(this).val();
            if (isDateCol && newVal) newVal = formatToDDMMMYYYY(newVal);
            else if (colUpper === "PLATE NUMBER") newVal = formatPlateNumber(newVal);

            $cell.removeClass("editing-cell").css({ height: "", width: "", "min-width": "" });
            $cell.text(newVal);

            // Release the lock in backend
            fetch("/api/unlock-cell", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ dbId: sheetRow, colName: colName }),
            }).catch(()=> console.warn("Unlock bypass"));

            if (newVal !== oldVal) {
              erpDataTable.cell($cell[0]).data(newVal);

              undoStack.push({
                sheetRow: sheetRow,
                colName: colName,
                oldVal: oldVal,
                newVal: newVal,
              });
              if (undoStack.length > 50) undoStack.shift();
              redoStack = [];
              updateUndoRedoUI();

              let plateIdxInTable = cachedHeaders.findIndex((h) =>
                h.replace(/\s+/g, "").toUpperCase().includes("PLATENUMBER")
              );
              let rowPlateNo =
                plateIdxInTable !== -1
                  ? $cell.closest("tr").find("td").eq(plateIdxInTable).text().trim()
                  : "N/A";

              saveQueue.push({
                dbId: sheetRow,
                colName: colName,
                newValue: newVal,
                plate: rowPlateNo,
              });

              autoCalculateRow(sheetRow);

              clearTimeout(editDebounceTimer);
              editDebounceTimer = setTimeout(() => {
                processQueue();
              }, 800);
            }
          });
      };

      // 🟢 Check Lock with Safe Fallback
      fetch("/api/lock-cell", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dbId: sheetRow, colName: colName }),
      })
        .then(async (res) => {
            if (!res.ok) throw new Error("API not ready");
            return res.json();
        })
        .then(lockData => {
          if (lockData && lockData.locked) {
            showToast(`This cell is currently being edited by @${lockData.lockedBy}`, "error");
            return; // Cell is locked by someone else
          }
          openCellForEditing(); // Open successfully
        })
        .catch(err => {
            console.warn("Lock API offline, opening anyway.");
            openCellForEditing(); // Safe Fallback: Open even if API fails!
        });
    });
}

// ==========================================
// ? BULK EDIT EXCEL COPY-PASTE ENGINE
// ==========================================
let isBulkEditModeActive = false;

function toggleBulkEditMode() {
  isBulkEditModeActive = !isBulkEditModeActive;
  const btn = $(".bulk-edit-toggle-btn");

  if (isBulkEditModeActive) {
    $("#erpTable").addClass("bulk-edit-grid-active");
    btn.css({
      background: "var(--success)",
      color: "white",
      "border-color": "var(--success)",
    });
    showToast(
      "Bulk Edit Enabled! Click a starting cell and press Ctrl+V to paste from Excel.",
      "success",
    );
  } else {
    $("#erpTable").removeClass("bulk-edit-grid-active");
    btn.css({ background: "", color: "", "border-color": "" });
    showToast("Bulk Edit Disabled", "info");
  }
}

// Intercept Clipboard Paste Event on Table Cells (High-Performance Zero-Lag Mode)
$(document).on(
  "paste",
  "#erpTable.bulk-edit-grid-active tbody td",
  function (e) {
    if (currentUser.role !== "Super Admin") return;
    e.preventDefault();

    let clipboardData = (e.originalEvent || e).clipboardData.getData("text");
    if (!clipboardData) return;

    let rows = clipboardData.split(/\r?\n/);
    let $startTd = $(this);
    let $startTr = $startTd.closest("tr");
    let startColIdx = $startTd.index();

    let $currentTr = $startTr;
    let bulkEditsBatch = [];
    let updatedRowIndexes = new Set();
    let isSmallBatch = (rows.length * (rows[0] ? rows[0].split("\t").length : 1)) <= 40;

    // 🟢 NEW CODE: AUTO-CREATE ROWS WHEN PASTING FROM EXCEL
    let newRowsToCreate = [];

    rows.forEach((rowText) => {
      if (!rowText.trim() && rows.length > 1) return;
      let cols = rowText.split("\t");

      // 1. നിലവിൽ വരി ഉണ്ടെങ്കിൽ അതിലെ സെല്ലുകൾ അപ്ഡേറ്റ് ചെയ്യുന്നു
      if ($currentTr.length) {
        let dbId = $currentTr.data("sheetrow");
        let dtRowIndex = erpDataTable.row($currentTr).index();

        cols.forEach((cellText, cIdx) => {
          let targetColIdx = startColIdx + cIdx;
          let $targetTd = $currentTr.find("td").eq(targetColIdx);
          if (!$targetTd.length) return;

          let colName = $targetTd.data("colname");
          if (!colName) return;

          let colUpper = String(colName).toUpperCase();
          if (colUpper === "SN" || colUpper === "DAYS WORKED") return;
          if (globalLockedCols.includes(colName) && currentUser.role !== "Super Admin") return;

          let newValue = cellText.trim();
          let oldValue = $targetTd.text().trim();

          let colTypeObj = cachedColTypes.find((c) => c.name === colName);
          let cType = colTypeObj ? colTypeObj.type : "varchar";
          let isDateCol =
            cType === "date" ||
            colUpper.includes("DATE") ||
            colUpper.includes("EXPIRE") ||
            colUpper.includes("EQUIPMENT REACHED") ||
            colUpper === "LAST WORKING DAY" ||
            colUpper === "WORK START";

          if (isDateCol && newValue) newValue = formatToDDMMMYYYY(newValue);
          else if (colUpper === "PLATE NUMBER") newValue = formatPlateNumber(newValue);

          if (oldValue !== newValue) {
            let colIdxInDataTable = cachedHeaders.indexOf(colName);
            if (dtRowIndex !== undefined && colIdxInDataTable !== -1) {
              $targetTd.text(newValue);

              let rowDataArray = erpDataTable.row(dtRowIndex).data();
              if (rowDataArray) {
                rowDataArray[colIdxInDataTable] = newValue;
                updatedRowIndexes.add(dtRowIndex);
              }

              if (isSmallBatch) {
                $targetTd.css("transition", "background-color 0.3s");
                $targetTd.css("background-color", "#fef08a");
                setTimeout(() => $targetTd.css("background-color", ""), 1500);
              }

              bulkEditsBatch.push({
                dbId: dbId,
                colName: colName,
                newValue: newValue,
              });

              undoStack.push({
                sheetRow: dbId,
                colName: colName,
                oldVal: oldValue,
                newVal: newValue,
              });
            }
          }
        });

        $currentTr = $currentTr.next("tr");
      } 
      // 2. 🟢 അധികമായി വരുന്ന വരികളെ പുതിയ റെക്കോർഡുകളായി മാറ്റുന്നു
      else {
        let newRowData = {};
        cols.forEach((cellText, cIdx) => {
          let targetColIdx = startColIdx + cIdx;
          let colName = cachedHeaders[targetColIdx];
          if (colName) {
            let colUpper = String(colName).toUpperCase();
            if (colUpper !== "SN" && colUpper !== "DAYS WORKED") {
              let val = cellText.trim();
              if (colUpper === "PLATE NUMBER") val = formatPlateNumber(val);
              newRowData[colName] = val;
            }
          }
        });

        if (Object.keys(newRowData).length > 0) {
          newRowData["SN"] = globalNextSN++;
          newRowsToCreate.push(newRowData);
        }
      }
    });

    if (undoStack.length > 50) undoStack = undoStack.slice(-50);
    updateUndoRedoUI();

    if (undoStack.length > 50) undoStack = undoStack.slice(-50);
    updateUndoRedoUI();

    // 🟢 പുതിയ വരികൾ ഉണ്ടെങ്കിൽ ബാക്കെൻഡിലേക്ക് അയച്ചു ചേർക്കുന്നു
    if (newRowsToCreate.length > 0) {
      showToast(`Creating ${newRowsToCreate.length} new rows...`, "info");
      fetch("/api/add-rows-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newRows: newRowsToCreate }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            showToast(`Added ${newRowsToCreate.length} new rows!`, "success");
            setTimeout(() => fetchData(true), 1000);
          } else {
            showToast("Error creating new rows", "error");
          }
        });
    }

    // നിലവിലുള്ള വരികളിൽ അപ്ഡേറ്റുകൾ ഉണ്ടെങ്കിൽ അവ സേവ് ചെയ്യുന്നു
    if (bulkEditsBatch.length > 0) {
      saveQueue.push(...bulkEditsBatch);
      
      updatedRowIndexes.forEach((rIdx) => {
        let dbId = erpDataTable.row(rIdx).node().getAttribute("data-sheetrow");
        // 🟢 AUTO-CALCULATE PASTED ROWS INSTANTLY
        autoCalculateRow(dbId);
        erpDataTable.row(rIdx).invalidate("data");
      });
      
      erpDataTable.draw(false);
      processQueue();
      
      showToast(`Pasted ${bulkEditsBatch.length} cells instantly! Syncing to DB...`, "success");
    } else if (newRowsToCreate.length === 0) {
      showToast("No valid changes detected in paste.", "info");
    }
  },
);

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "hidden") {
    if (saveQueue.length > 0) {
      clearTimeout(editDebounceTimer); // Cancels the 800ms wait
      processQueue(); // Forces immediate save
    }
  }
});

function updateTableDataSmoothly(newRows) {
    if (!erpDataTable) return;

    // യൂസർ എന്തെങ്കിലും എഡിറ്റ് ചെയ്തുകൊണ്ടിരിക്കുകയാണെങ്കിൽ ബാക്ക്ഗ്രൗണ്ട് അപ്ഡേറ്റ് ഒഴിവാക്കുന്നു
    if ($(".edit-input").length > 0 || saveQueue.length > 0) return;

    let existingRows = {};
    let hasChanges = false;
    
    erpDataTable.rows().every(function () {
        let node = this.node();
        let dbId = node ? $(node).attr("data-sheetrow") : (this.data()._dbId || null);
        if (dbId) existingRows[String(dbId)] = this.index();
    });

    let currentScroll = $('.table-scroll-wrapper').scrollTop();

    newRows.forEach(newRow => {
        let dbId = String(newRow[newRow.length - 1]);
        let rowDataForTable = [...newRow];
        rowDataForTable.pop();
        rowDataForTable._dbId = dbId;

        if (existingRows.hasOwnProperty(dbId)) {
            let rowIndex = existingRows[dbId];
            let oldRowData = erpDataTable.row(rowIndex).data();
            
            if (JSON.stringify(oldRowData) !== JSON.stringify(rowDataForTable)) {
                erpDataTable.row(rowIndex).data(rowDataForTable);
                let node = erpDataTable.row(rowIndex).node();
                if (node) $(node).attr("data-sheetrow", dbId);
                hasChanges = true;
            }
            delete existingRows[dbId];
        } else {
            let addedRow = erpDataTable.row.add(rowDataForTable);
            let node = addedRow.node();
            if (node) $(node).attr("data-sheetrow", dbId);
            hasChanges = true;
        }
    });

    for (let dbId in existingRows) {
        erpDataTable.row(existingRows[dbId]).remove();
        hasChanges = true;
    }

    // മാറ്റങ്ങൾ ഉണ്ടെങ്കിൽ മാത്രം ബ്രൗസർ റീ-ഡ്രോ ചെയ്യുക (CPU യൂസേജ് ഗണ്യമായി കുറയും)
    if (hasChanges) {
        erpDataTable.draw(false);
        $('.table-scroll-wrapper').scrollTop(currentScroll);
    }
}

// 🟢 Helper for Add New Company in Modal
function handleModalCompanyChange(selectEl) {
  if (selectEl.value === "ADD_NEW_COMPANY") {
    let newComp = prompt("Enter New Company Name:")?.trim();
    if (newComp) {
      if (!DYNAMIC_COMPANIES.includes(newComp)) {
        DYNAMIC_COMPANIES.push(newComp);
        DYNAMIC_COMPANIES.sort();
      }
      $(selectEl).append(
        `<option value="${newComp.replace(/"/g, "&quot;")}" selected>${newComp}</option>`,
      );
      selectEl.value = newComp;
    } else {
      selectEl.value = "";
    }
  }
}

// --- LEGACY LOG MIGRATION TRIGGER ---
async function runLegacyMigration() {
  document.getElementById("userDropdownMenu").classList.remove("show");
  Swal.fire({
    title: "Migrate Legacy Data?",
    text: "This will scan the database and move all old driver column data into the JSON driver history safely.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes, Start Migration!",
    confirmButtonColor: "#0ea5e9"
  }).then(async (result) => {
    if (result.isConfirmed) {
      showToast("Migration Started...", "info");
      try {
        const res = await fetch("/api/admin/migrate-legacy-logs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          }
        });
        const data = await res.json();
        if (data.success) {
          Swal.fire("Success!", data.message, "success");
          fetchData(true);
        } else {
          Swal.fire("Error", data.message, "error");
        }
      } catch (e) {
        showToast("Migration failed to start.", "error");
      }
    }
  });
}