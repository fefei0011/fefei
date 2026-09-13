let masterData = [];
let savedBillingData = [];
let manualTableCount = 0;

document.addEventListener("DOMContentLoaded", () => {
  const token =
    localStorage.getItem("invoiceToken") ||
    localStorage.getItem("timesheetToken") ||
    localStorage.getItem("token");
  if (!token) {
    window.location.href = "index.html";
    return;
  }
  initMonth();
});

const monthsList = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatShortMonth(fullVal) {
  const parts = String(fullVal).trim().split(" ");
  if (parts.length >= 2) {
    return parts[0].substring(0, 3) + " " + parts[1].substring(2, 4);
  }
  return fullVal;
}

function initMonth() {
  const optsContainer = document.getElementById("monthOptions");
  optsContainer.innerHTML = "";
  let currentD = new Date();
  for (let y = 2026; y <= currentD.getFullYear(); y++) {
    let mEnd = y === currentD.getFullYear() ? currentD.getMonth() : 11;
    for (let m = 0; m <= mEnd; m++) {
      let value = `${monthsList[m]} ${y}`;
      optsContainer.innerHTML += `<div class="custom-dropdown-item" onclick="selectMonth('${value}')">${value}</div>`;
    }
  }
  selectMonth(`${monthsList[currentD.getMonth()]} ${currentD.getFullYear()}`);
}

function selectMonth(val) {
  const textEl = document.getElementById("selectedMonthText");
  textEl.dataset.fullMonth = val;
  textEl.innerText = formatShortMonth(val);
  document.getElementById("monthOptions").classList.remove("show");

  let activeDrivers = [];
  document.querySelectorAll(".bill-card .driver").forEach((inp) => {
    let d = inp.value.trim();
    if (d && !activeDrivers.includes(d)) activeDrivers.push(d);
  });

  fetchDataFromERP(activeDrivers);
}

function prevMonthDriverBilling() {
  const textEl = document.getElementById("selectedMonthText");
  const currentVal = textEl.dataset.fullMonth || textEl.innerText.trim();
  const parts = currentVal.split(" ");
  if (parts.length < 2) return;

  let mIdx = monthsList.indexOf(parts[0]);
  let y = parseInt(parts[1], 10);
  if (mIdx === -1 || isNaN(y)) return;

  if (mIdx === 0) {
    mIdx = 11;
    y -= 1;
  } else {
    mIdx -= 1;
  }
  selectMonth(`${monthsList[mIdx]} ${y}`);
}

function nextMonthDriverBilling() {
  const textEl = document.getElementById("selectedMonthText");
  const currentVal = textEl.dataset.fullMonth || textEl.innerText.trim();
  const parts = currentVal.split(" ");
  if (parts.length < 2) return;

  let mIdx = monthsList.indexOf(parts[0]);
  let y = parseInt(parts[1], 10);
  if (mIdx === -1 || isNaN(y)) return;

  if (mIdx === 11) {
    mIdx = 0;
    y += 1;
  } else {
    mIdx += 1;
  }
  selectMonth(`${monthsList[mIdx]} ${y}`);
}

function toggleDropdown(id) {
  let el = document.getElementById(id);
  let isShowing = el.classList.contains("show");
  document.querySelectorAll(".custom-dropdown-options").forEach((d) => d.classList.remove("show"));
  if (!isShowing) el.classList.add("show");
}

document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".custom-dropdown-options").forEach((d) => d.classList.remove("show"));
  }
});

function filterCheckboxList(inputId, listId) {
  let filter = document.getElementById(inputId).value.toUpperCase();
  let items = document.getElementById(listId).querySelectorAll(".dynamic-item");
  items.forEach((item) => {
    let txt = item.innerText || item.textContent;
    item.style.display = txt.toUpperCase().includes(filter) ? "" : "none";
  });
}

function toggleAllCheckboxes(listId, isChecked) {
  let items = document.getElementById(listId).querySelectorAll(".dynamic-check");
  items.forEach((item) => {
    if (item.parentElement.style.display !== "none") item.checked = isChecked;
  });
  updateSelectTexts();
}

function getSelectedCheckboxes(listId) {
  let selected = [];
  document.getElementById(listId).querySelectorAll(".dynamic-check:checked").forEach((chk) => selected.push(chk.value));
  return selected;
}

function updateSelectTexts() {
  let drivers = getSelectedCheckboxes("driverList");
  let sites = getSelectedCheckboxes("siteList");
  document.getElementById("driverSelectText").innerText =
    drivers.length > 0 ? `${drivers.length} Selected` : "None Selected";
  document.getElementById("siteSelectText").innerText =
    sites.length > 0 ? `${sites.length} Selected` : "None Selected";
}

function getShortDate() {
  const textEl = document.getElementById("selectedMonthText");
  let val = (textEl?.dataset?.fullMonth || textEl?.innerText || "").trim();
  let parts = val.split(" ");
  if (parts.length >= 2) {
    let yearPart = parts[1].length === 4 ? parts[1].substring(2, 4) : parts[1];
    return parts[0].substring(0, 3) + " " + yearPart;
  }
  return val;
}

// 🟢 FETCH DATA
function cleanPlate(p) {
  return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function calculateClientLogHours(records, monthIndex, year, siteName, specialRules) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const normalizedSite = String(siteName || "").split("&")[0].trim().toUpperCase();
  let nhr = 0, othr = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const record = (records || []).find((item) => parseInt(item.record_date, 10) === day);
    const workHours = record ? parseFloat(record.calc_time) || 0 : 0;
    let status = record ? String(record.bd || "").trim().toUpperCase() : "";
    const formattedDate = new Date(year, monthIndex, day)
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const specialRule = (specialRules || []).find(
      (rule) =>
        Array.isArray(rule.sites) &&
        Array.isArray(rule.dates) &&
        (rule.sites.includes("ALL") || rule.sites.includes(normalizedSite)) &&
        rule.dates.includes(formattedDate),
    );

    if (!record && specialRule && specialRule.rule_type !== "FULL_OT") {
      status = specialRule.rule_type;
    }

    const isFullOt = new Date(year, monthIndex, day).getDay() === 5 ||
      day === 31 ||
      specialRule?.rule_type === "FULL_OT";

    if (["ID", "NP", "W", "P"].includes(status)) {
      if (isFullOt) othr += 10;
      else nhr += 10;
    } else if (!["B", "H", "A", "L", "S"].includes(status) && workHours > 0) {
      if (isFullOt) othr += workHours;
      else {
        nhr += Math.min(workHours, 10);
        othr += Math.max(workHours - 10, 0);
      }
    }
  }
  return { nhr, othr };
}

function fetchDataFromERP(autoArrangeDrivers = []) {
  const textEl = document.getElementById("selectedMonthText");
  const fullMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  const token =
    localStorage.getItem("invoiceToken") ||
    localStorage.getItem("timesheetToken") ||
    localStorage.getItem("token");

  document.getElementById("loader").style.display = "flex";
  fetch(`/driver-billing/vehicles?month=${encodeURIComponent(fullMonth)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((res) => {
      document.getElementById("loader").style.display = "none";
      if (res.success) {
        processFetchedData(res, autoArrangeDrivers);
      } else {
        showToast("Error: " + res.message);
      }
    })
    .catch((err) => {
      document.getElementById("loader").style.display = "none";
      showToast("Server error fetching driver data");
    });
}

function processFetchedData(res, autoArrangeDrivers = []) {
  const textEl = document.getElementById("selectedMonthText");
  const currentMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  savedBillingData = res.saved_bills || [];
  const timesheetRows = res.timesheets || [];
  const invoiceRows = res.invoices || [];
  const plateLogs = res.plate_logs || [];
  const specialRules = res.special_rules || [];
  const targetMonthIdx = res.target_month_idx;
  const targetYearNum = res.target_year_num;

  let rows = [];
  (res.vehicles || []).forEach((v) => {
    let masterPlate = (v.plate_no || "").trim().toUpperCase();
    if (!masterPlate) return;

    let relatedPlates = [masterPlate];
    (plateLogs || []).forEach((pl) => {
      let op = (pl.old_plate_no || "").trim().toUpperCase();
      let np = (pl.new_plate_no || "").trim().toUpperCase();
      if (op === masterPlate && !relatedPlates.includes(np)) relatedPlates.push(np);
      if (np === masterPlate && !relatedPlates.includes(op)) relatedPlates.push(op);
    });

    let dLogs = (res.driver_logs || []).filter((d) => relatedPlates.includes((d.plate_no || "").trim().toUpperCase()));
    let sLogs = (res.site_logs || []).filter((s) => relatedPlates.includes((s.plate_no || "").trim().toUpperCase()));

    let driver = dLogs.length > 0 ? dLogs[0].driver_name : (v.driver_name || "Unassigned");
    let site = sLogs.length > 0 ? sLogs[0].site_name : (v.site_name || "N/A");

    function matchesPlate(targetP) {
      if (!targetP) return false;
      let raw = String(targetP).trim().toUpperCase();
      let parts = raw.split(/➔|→|->/).map(p => cleanPlate(p)).filter(Boolean);
      let cleanRelated = relatedPlates.map(p => cleanPlate(p));
      return parts.some(p => cleanRelated.includes(p)) || cleanRelated.includes(cleanPlate(raw));
    }

    let saved = savedBillingData.find(
      (b) =>
        matchesPlate(b.plate_no) &&
        (b.site_name || "").trim().toUpperCase() === site.trim().toUpperCase()
    );

    let driverOt = saved ? parseFloat(saved.driver_ot) || 0 : 0;
    let driverAmount = saved ? parseFloat(saved.driver_amount) || 0 : 0;
    let rate = driverOt > 0 && driverAmount > 0 ? Number((driverAmount / driverOt).toFixed(2)) : 15;

    // Logsheet Calculations
    const vehicleTimesheets = timesheetRows.filter((t) => matchesPlate(t.plate_no));
    const logHours = targetMonthIdx >= 0
      ? calculateClientLogHours(vehicleTimesheets, targetMonthIdx, targetYearNum, site, specialRules)
      : { nhr: 0, othr: 0 };

    // Bill Summary & Supplier Hours
    const matchingInvoices = invoiceRows.filter((i) => matchesPlate(i.plate_no));
    const inv = matchingInvoices.find(
      (item) => String(item.site_name || "").trim().toUpperCase() === String(site || "").trim().toUpperCase(),
    ) || matchingInvoices[0];

    let supNr = saved ? parseFloat(saved.nhr) || 0 : 0;
    let supOt = saved ? parseFloat(saved.othr) || 0 : 0;

    rows.push({
      billing_month: currentMonth,
      date: getShortDate(),
      vehicle_type: v.vehicle_type || "-",
      driver: driver,
      site_name: site,
      plate_no: masterPlate,
      related_plates: relatedPlates,
      driver_ot: driverOt,
      rate: rate,
      driver_amount: driverAmount || (driverOt * rate),
      log_nr: logHours.nhr,
      log_ot: logHours.othr,
      bill_nr: inv ? parseFloat(inv.bill_nr) || 0 : 0,
      bill_ot: inv ? parseFloat(inv.bill_ot) || 0 : 0,
      sup_nr: supNr,
      sup_ot: supOt,
    });
  });

  masterData = rows;
  populateFilters();

  if (autoArrangeDrivers && autoArrangeDrivers.length > 0) {
    const container = document.getElementById("dynamicBillsContainer");
    container.innerHTML = "";
    autoArrangeDrivers.forEach((drName, idx) => {
      let drRows = masterData.filter(m => (m.driver || "").trim().toUpperCase() === drName.trim().toUpperCase());
      if (drRows.length > 0) {
        container.appendChild(createDriverBillCard(drName, drRows, `driver_${idx + 1}`));
      }
    });
    showToast(`Month changed! Re-loaded driver tables.`);
  } else {
    showToast(`Loaded ${rows.length} driver records.`);
  }
}

function populateFilters() {
  let drivers = [...new Set(masterData.map((d) => (d.driver || "").trim()))].filter(Boolean).sort();
  let sites = [...new Set(masterData.map((d) => (d.site_name || "").trim()))].filter(Boolean).sort();

  let dList = document.getElementById("driverList");
  let sList = document.getElementById("siteList");

  dList.querySelectorAll(".dynamic-item").forEach((e) => e.remove());
  sList.querySelectorAll(".dynamic-item").forEach((e) => e.remove());

  drivers.forEach((d) => {
    dList.innerHTML += `<label class="check-item dynamic-item"><input type="checkbox" class="dynamic-check" value="${d}" checked onchange="updateSelectTexts()"> ${d}</label>`;
  });

  sites.forEach((s) => {
    sList.innerHTML += `<label class="check-item dynamic-item"><input type="checkbox" class="dynamic-check" value="${s}" checked onchange="updateSelectTexts()"> ${s}</label>`;
  });

  updateSelectTexts();
}

function arrangeByDriver() {
  const selectedDrivers = getSelectedCheckboxes("driverList");
  const selectedSites = getSelectedCheckboxes("siteList");

  const filtered = masterData.filter(
    (d) => selectedDrivers.includes(d.driver) && selectedSites.includes(d.site_name)
  );

  const container = document.getElementById("dynamicBillsContainer");
  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:50px; background:white; border-radius:8px;"><h2>No records found for selected filters</h2></div>`;
    return;
  }

  let groups = {};
  filtered.forEach((item) => {
    let key = item.driver || "Unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let index = 0;
  for (let driverName in groups) {
    index++;
    container.appendChild(createDriverBillCard(driverName, groups[driverName], `driver_${index}`));
  }
}

// 🟢 1. MANUAL ENTRY FUNCTIONALITY (FIXED)
function createManualTable() {
  manualTableCount++;
  const container = document.getElementById("dynamicBillsContainer");
  if (container.innerHTML.includes("No Driver Bills Generated Yet")) {
    container.innerHTML = "";
  }

  const blankItems = [
    {
      date: getShortDate(),
      vehicle_type: "",
      driver: "",
      site_name: "",
      plate_no: "",
      driver_ot: 0,
      rate: 15,
      driver_amount: 0,
      log_nr: 0,
      log_ot: 0,
      bill_nr: 0,
      bill_ot: 0,
    },
  ];

  const card = createDriverBillCard("", blankItems, `manual_${manualTableCount}`, true);
  container.insertAdjacentElement("afterbegin", card);
  showToast("Manual Driver OT Table Added!");
}

function generateDriverRowHTML(index, item) {
  return `
    <tr>
      <td class="row-num" style="text-align:center; font-weight:600; color:#64748b;">${index}</td>
      <td class="date-cell" style="text-align:center; font-weight:600; color:#1a4d80;">${item.date || getShortDate()}</td>
      <td><input type="text" class="vtype" value="${item.vehicle_type || ""}" style="width:100%; border:none; background:transparent; padding:4px 6px; box-sizing:border-box; font-family:inherit; font-size:12px; outline:none;"></td>
      <td><input type="text" class="driver" value="${item.driver || ""}" style="width:100%; border:none; background:transparent; padding:4px 6px; box-sizing:border-box; font-family:inherit; font-size:12px; outline:none;"></td>
      <td class="site-col"><input type="text" class="site" value="${item.site_name || ""}" style="width:100%; border:none; background:transparent; padding:4px 6px; box-sizing:border-box; font-family:inherit; font-size:12px; outline:none;"></td>
      <td class="autocomplete-wrapper col-plate">
        <input type="text" class="plate" value="${item.plate_no || ""}" oninput="showPlateSuggestions(this)" onkeydown="handleDriverPlateKeyDown(event, this)" onblur="handlePlateBlur(this)" autocomplete="off" style="width:100%; border:none; background:transparent; text-align:center; font-weight:bold; font-family:inherit; font-size:12px; outline:none; text-transform:uppercase;">
        <div class="suggestion-box"></div>
      </td>
      <td><input type="number" step="any" class="dr-ot" value="${item.driver_ot || 0}" oninput="calcDriverRow(this)" style="width:100%; border:none; background:transparent; text-align:center; font-weight:600; font-family:inherit; font-size:12px; outline:none;"></td>
      <td class="rate-col"><input type="number" step="any" class="dr-rate" value="${item.rate || 15}" oninput="calcDriverRow(this)" style="width:100%; border:none; background:transparent; text-align:center; font-family:inherit; font-size:12px; outline:none;"></td>
      <td><input type="number" step="any" class="dr-amt" value="${item.driver_amount || 0}" readonly style="width:100%; border:none; background:transparent; text-align:center; font-weight:bold; font-family:inherit; font-size:12px; outline:none;"></td>
      <td class="site-col no-export log-nr" style="background:rgba(22, 101, 52, 0.04); text-align:center;">${item.log_nr || 0}</td>
      <td class="site-col no-export log-ot" style="background:rgba(22, 101, 52, 0.04); text-align:center;">${item.log_ot || 0}</td>
      <td class="site-col no-export bill-nr" style="background:rgba(30, 64, 175, 0.04); text-align:center;">${item.bill_nr || 0}</td>
      <td class="site-col no-export bill-ot" style="background:rgba(30, 64, 175, 0.04); text-align:center;">${item.bill_ot || 0}</td>
      <td class="site-col no-export sup-nr" style="background:rgba(107, 33, 168, 0.04); color:#6b21a8; font-weight:600; text-align:center;">${item.sup_nr || 0}</td>
      <td class="site-col no-export sup-ot" style="background:rgba(107, 33, 168, 0.04); color:#6b21a8; font-weight:600; text-align:center;">${item.sup_ot || 0}</td>
      <td class="no-export" style="text-align:center;"><button type="button" class="btn-remove" onclick="removeDriverRow(this)">✖</button></td>
    </tr>
  `;
}

// 🟢 2. NO HEADER, SEAL, SIGNATURE CARD CREATION
function createDriverBillCard(driverName, items, id, isManual = false) {
  const card = document.createElement("div");
  card.className = "container bill-card";
  card.id = `driverCard_${id}`;
  card.dataset.cardId = id;

  let rowsHtml = "";
  items.forEach((item, idx) => {
    rowsHtml += generateDriverRowHTML(idx + 1, item);
  });

  card.innerHTML = `
    <div class="no-export" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; background:#f8f9fa; padding:10px; border-radius:5px; border:1px solid #ddd;">
      <span style="font-weight:700; color:#1a4d80; font-size:15px;">Driver OT Statement</span>
      <div style="display:flex; gap:10px;">
        <button class="icon-btn" title="Download Image" style="background:#007bff;" onclick="exportSingleImage('${id}')"><i class="material-icons">download</i></button>
        <button class="icon-btn" title="Copy High Quality Image" style="background:#17a2b8;" onclick="copyHighQualityCard('${id}')"><i class="material-icons">content_copy</i></button>
        <button class="icon-btn" title="Remove Table" style="background:#dc3545;" onclick="this.closest('.bill-card').remove()"><i class="material-icons">delete</i></button>
      </div>
    </div>

    <div class="print-area" id="printArea_${id}">
      <table class="billTable">
        <thead>
          <tr>
            <th class="col-num" style="width:40px;">#</th>
            <th class="col-date" style="width:80px;">Date</th>
            <th class="col-vtype" style="width:150px;">Vehicle Type</th>
            <th class="col-driver" style="width:180px;">Driver</th>
            <th class="col-site site-col" style="width:150px;">Site</th>
            <th class="col-plate" style="width:120px;">Plate No</th>
            <th class="col-small" style="width:85px;">Over Time</th>
            <th class="col-rate rate-col" style="width:75px;">Rate</th>
            <th class="col-money" style="width:95px;">Amount</th>
            <th class="col-small site-col no-export" style="width:65px; background:#166534; color:white;">Log NR</th>
            <th class="col-small site-col no-export" style="width:65px; background:#166534; color:white;">Log OT</th>
            <th class="col-small site-col no-export" style="width:65px; background:#1e40af; color:white;">Bill NR</th>
            <th class="col-small site-col no-export" style="width:65px; background:#1e40af; color:white;">Bill OT</th>
            <th class="col-small site-col no-export" style="width:65px; background:#6b21a8; color:white;">Sup NR</th>
            <th class="col-small site-col no-export" style="width:65px; background:#6b21a8; color:white;">Sup OT</th>
            <th class="col-action no-export" style="width:45px;">Act</th>
          </tr>
        </thead>
        <tbody class="tableBody">
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="total-row" style="background:#f8fafc; font-weight:bold;">
            <td colspan="6" class="footer-colspan" style="text-align:right; padding-right:15px; font-weight:bold;">Total:</td>
            <td class="grandHr" style="font-weight:bold; text-align:center;">0</td>
            <td class="rate-col" style="text-align:center;"></td>
            <td class="grandAmt" style="font-weight:bold; text-align:center;">0</td>
            <td colspan="6" class="site-col no-export" style="background:transparent;"></td>
            <td class="no-export" style="text-align:center;">
              <button type="button" class="btn-add-circle" onclick="addDriverRow('${id}')">+</button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  updateDriverCardTotals(card);
  return card;
}

function updateDriverCardHeader(input, id) {
  const printName = document.getElementById(`printDriverName_${id}`);
  if (printName) {
    printName.innerText = `DRIVER: ${input.value.trim().toUpperCase() || "-"}`;
  }
}

function addDriverRow(cardId) {
  const card = document.getElementById(`driverCard_${cardId}`);
  const tbody = card.querySelector(".tableBody");
  const index = tbody.rows.length + 1;

  const tr = document.createElement("tr");
  tr.innerHTML = generateDriverRowHTML(index, {
    date: getShortDate(),
    vehicle_type: "",
    driver: "",
    site_name: "",
    plate_no: "",
    driver_ot: 0,
    rate: 15,
    driver_amount: 0,
    log_nr: 0,
    log_ot: 0,
    bill_nr: 0,
    bill_ot: 0,
    sup_nr: 0,
    sup_ot: 0,
  });
  tbody.appendChild(tr);
}

function removeDriverRow(btn) {
  const card = btn.closest(".bill-card");
  btn.closest("tr").remove();
  let tbody = card.querySelector(".tableBody");
  Array.from(tbody.rows).forEach((r, idx) => {
    r.querySelector(".row-num").innerText = idx + 1;
  });
  updateDriverCardTotals(card);
}

function calcDriverRow(input) {
  const row = input.closest("tr");
  const ot = parseFloat(row.querySelector(".dr-ot").value) || 0;
  const rate = parseFloat(row.querySelector(".dr-rate").value) || 0;
  row.querySelector(".dr-amt").value = Number((ot * rate).toFixed(2));
  updateDriverCardTotals(row.closest(".bill-card"));
}

function updateDriverCardTotals(card) {
  let totalHr = 0;
  let totalAmt = 0;

  card.querySelectorAll(".tableBody tr").forEach((r) => {
    totalHr += parseFloat(r.querySelector(".dr-ot")?.value) || 0;
    totalAmt += parseFloat(r.querySelector(".dr-amt")?.value) || 0;
  });

  card.querySelector(".grandHr").innerText = totalHr;
  card.querySelector(".grandAmt").innerText = Number(totalAmt.toFixed(2));
}

// 🟢 PLATE AUTOFILL IN MANUAL & DYNAMIC ROWS
function showPlateSuggestions(input) {
  const val = input.value.trim().toUpperCase().replace(/\s+/g, "");
  const box = input.parentElement.querySelector(".suggestion-box");
  if (!val) {
    box.style.display = "none";
    return;
  }

  let matches = [];
  masterData.forEach((r) => {
    let p = r.plate_no || "";
    if (p.toUpperCase().replace(/\s+/g, "").includes(val) && !matches.includes(p)) {
      matches.push(p);
    }
  });

  if (matches.length > 0) {
    box.innerHTML = "";
    matches.forEach((m, index) => {
      let div = document.createElement("div");
      div.className = "suggestion-item" + (index === 0 ? " active" : "");
      div.innerText = m;
      div.onmousedown = function (e) {
        e.preventDefault();
        input.value = m;
        box.style.display = "none";
        autoFillDriverPlate(input, m);
      };
      box.appendChild(div);
    });
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}

function handlePlateBlur(input) {
  setTimeout(() => {
    let box = input.parentElement.querySelector(".suggestion-box");
    if (box) box.style.display = "none";
    let val = input.value.trim().toUpperCase();
    if (val) autoFillDriverPlate(input, val);
  }, 200);
}

function autoFillDriverPlate(input, plateNo) {
  const cleanVal = cleanPlate(plateNo);
  const match = masterData.find((d) => {
    let p = cleanPlate(d.plate_no);
    let rp = (d.related_plates || []).map(cleanPlate);
    return p === cleanVal || rp.includes(cleanVal);
  });
  if (!match) return;

  const row = input.closest("tr");
  if (match.vehicle_type) row.querySelector(".vtype").value = match.vehicle_type;
  if (match.driver) row.querySelector(".driver").value = match.driver;
  if (match.site_name) row.querySelector(".site").value = match.site_name;
  if (match.driver_ot !== undefined) row.querySelector(".dr-ot").value = match.driver_ot;
  if (match.rate) row.querySelector(".dr-rate").value = match.rate;
  if (match.driver_amount !== undefined) row.querySelector(".dr-amt").value = match.driver_amount;

  if (row.querySelector(".log-nr")) row.querySelector(".log-nr").innerText = match.log_nr || 0;
  if (row.querySelector(".log-ot")) row.querySelector(".log-ot").innerText = match.log_ot || 0;
  if (row.querySelector(".bill-nr")) row.querySelector(".bill-nr").innerText = match.bill_nr || 0;
  if (row.querySelector(".bill-ot")) row.querySelector(".bill-ot").innerText = match.bill_ot || 0;
  if (row.querySelector(".sup-nr")) row.querySelector(".sup-nr").innerText = match.sup_nr || 0;
  if (row.querySelector(".sup-ot")) row.querySelector(".sup-ot").innerText = match.sup_ot || 0;

  calcDriverRow(input);
}

// 🟢 CLEAN EXPORT (NO SITE, RATE, LOG COLUMNS IN PRINT/COPY)
function prepareCardForCleanExport(printArea) {
  // 1. Site, Rate, Act, Log, Bill കോളങ്ങൾ പൂർണ്ണമായി ഹൈഡ് ചെയ്യുന്നു
  printArea.querySelectorAll(".site-col, .rate-col, .no-export").forEach((el) => {
    el.classList.add("hide-on-card-export");
    el.style.display = "none";
  });

  // 2. ഇൻപുട്ടുകൾ ടെക്സ്റ്റ് സ്പാനുകളാക്കുന്നു
  printArea.querySelectorAll("input").forEach((inp) => {
    const span = document.createElement("span");
    span.className = "temp-export-span";
    span.innerText = inp.value || "-";
    span.style.cssText =
      "display:block; width:100%; text-align:center; font-size:13px; font-weight:500; color:#1e293b; padding:4px 0;";
    inp.style.display = "none";
    inp.parentNode.appendChild(span);
  });

  // 3. ഫൂട്ടർ കോൾസ്പാൻ കൃത്യമായി 5 (#, Date, Vehicle Type, Driver, Plate No) ആക്കുന്നു
  const footerColspan = printArea.querySelector(".footer-colspan");
  if (footerColspan) {
    footerColspan.colSpan = 5;
  }
}

function revertCardAfterCleanExport(printArea) {
  printArea.querySelectorAll(".hide-on-card-export").forEach((el) => {
    el.classList.remove("hide-on-card-export");
    el.style.display = "";
  });
  printArea.querySelectorAll(".temp-export-span").forEach((s) => s.remove());
  printArea.querySelectorAll("input").forEach((inp) => (inp.style.display = ""));

  // സാധാരണ UI ലേക്ക് വരുമ്പോൾ (#, Date, Vehicle Type, Driver, Site, Plate No) 6 ആക്കുന്നു
  const footerColspan = printArea.querySelector(".footer-colspan");
  if (footerColspan) {
    footerColspan.colSpan = 6;
  }
}

async function exportSingleImage(id) {
  const printArea = document.getElementById(`printArea_${id}`);
  prepareCardForCleanExport(printArea);

  const canvas = await html2canvas(printArea, { scale: 3, useCORS: true });
  revertCardAfterCleanExport(printArea);

  const link = document.createElement("a");
  link.download = `Driver_OT_${id}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function copyHighQualityCard(id) {
  const printArea = document.getElementById(`printArea_${id}`);
  prepareCardForCleanExport(printArea);

  const canvas = await html2canvas(printArea, { scale: 4, useCORS: true });
  revertCardAfterCleanExport(printArea);

  canvas.toBlob(async (blob) => {
    if (navigator.clipboard && window.isSecureContext) {
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      showToast("Driver Card Copied to Clipboard!");
    } else {
      showToast("Direct copy unsupported. Downloading image.");
      exportSingleImage(id);
    }
  }, "image/png", 1.0);
}

// 🟢 MULTI-MONTH BULK SAVE (NO CONFLICTS)
function submitBulkDriverData() {
  const token =
    localStorage.getItem("invoiceToken") ||
    localStorage.getItem("timesheetToken") ||
    localStorage.getItem("token");
  const cards = document.querySelectorAll(".bill-card");
  const textEl = document.getElementById("selectedMonthText");
  const currentMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();

  let items = [];
  cards.forEach((card) => {
    card.querySelectorAll(".tableBody tr").forEach((r) => {
      let plate = r.querySelector(".plate").value.trim();
      let site = r.querySelector(".site").value.trim();
      let driver = r.querySelector(".driver").value.trim();
      let ot = parseFloat(r.querySelector(".dr-ot").value) || 0;
      let amt = parseFloat(r.querySelector(".dr-amt").value) || 0;

      if (plate) {
        items.push({
          billing_month: currentMonth,
          plate: plate,
          site_name: site,
          driver: driver,
          driver_ot: ot,
          driver_amount: amt,
        });
      }
    });
  });

  if (items.length === 0) return showToast("No driver records to save!");

  document.getElementById("loader").style.display = "flex";
  fetch("/driver-billing/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  })
    .then((res) => res.json())
    .then((res) => {
      document.getElementById("loader").style.display = "none";
      if (res.success) {
        showToast("Driver OT saved successfully!");
      } else {
        showToast("Save Error: " + res.message);
      }
    })
    .catch((err) => {
      document.getElementById("loader").style.display = "none";
      showToast("Server error while saving driver OT");
    });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.className = "show";
  setTimeout(() => (t.className = ""), 3000);
}

function handleDriverPlateKeyDown(e, input) {
  const box = input.parentElement.querySelector(".suggestion-box");
  if (box && box.style.display === "block") {
    let items = box.querySelectorAll(".suggestion-item");
    let activeIndex = Array.from(items).findIndex((item) =>
      item.classList.contains("active"),
    );

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveSuggestion(items, activeIndex, box);
      return;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveSuggestion(items, activeIndex, box);
      return;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      let targetVal = activeIndex > -1 ? items[activeIndex].innerText : items[0].innerText;
      input.value = targetVal;
      box.style.display = "none";
      autoFillDriverPlate(input, targetVal);
      return;
    } else if (e.key === "Escape") {
      box.style.display = "none";
      return;
    }
  }
}

function updateActiveSuggestion(items, index, box) {
  items.forEach((item) => item.classList.remove("active"));
  if (items[index]) {
    items[index].classList.add("active");
    const itemTop = items[index].offsetTop;
    if (itemTop < box.scrollTop) box.scrollTop = itemTop;
    else if (
      itemTop + items[index].offsetHeight >
      box.scrollTop + box.offsetHeight
    ) {
      box.scrollTop = itemTop + items[index].offsetHeight - box.offsetHeight;
    }
  }
}