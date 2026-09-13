const companyData = {
  Haka: {
    header: "https://i.ibb.co/Ld752yD5/hd.png",
    seal: "https://i.ibb.co/mrLFJdBy/sl.png",
    text: "Approved By Accounts Team",
    signature: "https://i.ibb.co/CK8X4YpV/Screenshot-2026-03-28-111438.png",
  },
  Aljoda: {
    header: "https://i.ibb.co/3yMwhgD5/Screenshot-2026-03-28-103621.png",
    seal: "https://i.ibb.co/4gRPdGXc/Screenshot-2026-03-28-103653.png",
    text: "Approved By Accounts Team",
    signature: "https://i.ibb.co/Z1b8gCwT/Screenshot-2026-03-28-111323.png",
  },
  "Masar Wheels": {
    header: "https://i.ibb.co/gM7QnS59/Screenshot-2026-03-28-103016.png",
    seal: "https://i.ibb.co/Y63vHZ9/Screenshot-2026-03-28-103341.png",
    text: "Approved By Accounts Team",
    signature: "https://i.ibb.co/bMPNp3SJ/Screenshot-2026-03-28-111529.png",
  },
  "We1 Track": {
    header: "./img/we1.png",
    seal: "https://i.ibb.co/XfybvXzL/Screenshot-2026-03-28-103519.png",
    text: "Approved By Accounts Team",
    signature: "https://i.ibb.co/pBmhnB2j/Screenshot-2026-03-28-111612.png",
  },
};

let masterData = [];
let savedBillingData = [];
let manualTableCount = 0;
let isCombinedView = false;

async function verifyToken(token) {
  document.getElementById("loader").style.display = "flex";
  try {
    const res = await fetch("/billing/verify-session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    document.getElementById("loader").style.display = "none";
    if (res.ok) {
      const data = await res.json();
      if (data.success) loadApp();
      else executeLogout();
    } else executeLogout();
  } catch (err) {
    document.getElementById("loader").style.display = "none";
    executeLogout();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("invoiceToken");
  
  if (token) {
      verifyToken(token);
  } else {
      document.getElementById("loginScreen").style.display = "flex";
      document.getElementById("mainAppContainer").style.display = "none";
      document.getElementById("loginUserId").focus();
  }
});

function toggleAuthView(viewId) {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('signupBox').style.display = 'none';
  document.getElementById('forgotBox').style.display = 'none';
  document.getElementById(viewId).style.display = 'block';
}

async function executeSignup() {
  const displayName = document.getElementById("regName").value;
  const username = document.getElementById("regUser").value;
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPass").value;

  if (!username || !email || !password) return showToast("Fill all required fields");

  document.getElementById("loader").style.display = "flex";
  try {
      const res = await fetch("/api/invoice-auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, username, email, password })
      });
      const data = await res.json();
      document.getElementById("loader").style.display = "none";
      alert(data.message);
      if (data.success) toggleAuthView('loginBox');
  } catch (err) { 
      document.getElementById("loader").style.display = "none";
      alert("Server Error"); 
  }
}

async function requestOtp() {
  const email = document.getElementById("forgotEmail").value;
  if (!email) return alert("Enter email");
  
  document.getElementById("loader").style.display = "flex";
  try {
      const res = await fetch("/api/invoice-auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
      });
      const data = await res.json();
      document.getElementById("loader").style.display = "none";
      alert(data.message);
      if (data.success) {
          document.getElementById("otpRequestSection").style.display = "none";
          document.getElementById("otpVerifySection").style.display = "block";
      }
  } catch (err) { 
      document.getElementById("loader").style.display = "none";
      alert("Server Error"); 
  }
}

async function resetPassword() {
  const email = document.getElementById("forgotEmail").value;
  const otp = document.getElementById("resetOtp").value;
  const newPassword = document.getElementById("newPass").value;
  if (!otp || !newPassword) return alert("Enter OTP and new password");
  
  document.getElementById("loader").style.display = "flex";
  try {
      const res = await fetch("/api/invoice-auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp, newPassword })
      });
      const data = await res.json();
      document.getElementById("loader").style.display = "none";
      alert(data.message);
      if (data.success) toggleAuthView('loginBox');
  } catch (err) { 
      document.getElementById("loader").style.display = "none";
      alert("Server Error"); 
  }
}

async function executeLogin() {
  const username = document.getElementById("loginUserId").value;
  const password = document.getElementById("loginPass").value;
  if (!username || !password) return alert("Enter credentials");

  document.getElementById("loader").style.display = "flex";
  try {
    const res = await fetch("/api/invoice-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    document.getElementById("loader").style.display = "none";
    
    if (data.success) {
      localStorage.setItem("invoiceToken", data.token);
      // Update local storage so existing ERP API calls use this token format temporarily
      localStorage.setItem("token", data.token); 
      loadApp();
    } else alert(data.message);
  } catch (err) {
    document.getElementById("loader").style.display = "none";
    alert("Server Error.");
  }
}

function executeLogout() {
  localStorage.removeItem("invoiceToken");
  localStorage.removeItem("token");
  localStorage.removeItem("timesheetToken"); 
  window.location.replace("index.html"); 
}

function loadApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainAppContainer").style.display = "block";
  initMonth();
}

function initMonth() {
  const optsContainer = document.getElementById("monthOptions");
  optsContainer.innerHTML = "";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  let currentD = new Date();
  for (let y = 2026; y <= currentD.getFullYear(); y++) {
    let mEnd = y === currentD.getFullYear() ? currentD.getMonth() : 11;
    for (let m = 0; m <= mEnd; m++) {
      let value = `${months[m]} ${y}`;
      optsContainer.innerHTML += `<div class="custom-dropdown-item" onclick="selectMonth('${value}')">${value}</div>`;
    }
  }
  selectMonth(`${months[currentD.getMonth()]} ${currentD.getFullYear()}`);
}

const monthsList = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function prevMonthBilling() {
  const textEl = document.getElementById("selectedMonthText");
  const currentVal = textEl.innerText.trim();
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

function nextMonthBilling() {
  const textEl = document.getElementById("selectedMonthText");
  const currentVal = textEl.innerText.trim();
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

function formatShortMonth(fullVal) {
  const parts = String(fullVal).trim().split(" ");
  if (parts.length >= 2) {
    return parts[0].substring(0, 3) + " " + parts[1].substring(2, 4);
  }
  return fullVal;
}

function selectMonth(val) {
  const textEl = document.getElementById("selectedMonthText");
  textEl.dataset.fullMonth = val;
  textEl.innerText = formatShortMonth(val);
  document.getElementById("monthOptions").classList.remove("show");

  let activeOwners = [];
  document.querySelectorAll(".bill-card").forEach((card) => {
    let ownerInput = card.querySelector(".owner-input");
    let owner = ownerInput ? ownerInput.value.trim().toUpperCase() : "";
    if (owner && owner !== "VARIOUS OWNERS" && !activeOwners.includes(owner)) {
      activeOwners.push(owner);
    }
  });

  masterData = [];
  savedBillingData = [];

  fetchDataFromERP(activeOwners);
}

function prevMonthBilling() {
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

function nextMonthBilling() {
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

function toggleDropdown(id) {
  let el = document.getElementById(id);
  let isShowing = el.classList.contains("show");
  document
    .querySelectorAll(".custom-dropdown-options")
    .forEach((d) => d.classList.remove("show"));
  if (!isShowing) el.classList.add("show");
}
document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document
      .querySelectorAll(".custom-dropdown-options")
      .forEach((d) => d.classList.remove("show"));
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
  let items = document
    .getElementById(listId)
    .querySelectorAll(".dynamic-check");
  items.forEach((item) => {
    if (item.parentElement.style.display !== "none") item.checked = isChecked;
  });
  updateSelectTexts();
}
function getSelectedCheckboxes(listId) {
  let selected = [];
  document
    .getElementById(listId)
    .querySelectorAll(".dynamic-check:checked")
    .forEach((chk) => selected.push(chk.value));
  return selected;
}
function updateSelectTexts() {
  let owners = getSelectedCheckboxes("ownerList");
  let sites = getSelectedCheckboxes("siteList");
  document.getElementById("ownerSelectText").innerText =
    owners.length > 0 ? `${owners.length} Selected` : "None Selected";
  document.getElementById("siteSelectText").innerText =
    sites.length > 0 ? `${sites.length} Selected` : "None Selected";
}

function fetchDataFromERP(autoArrangeOwners = []) {
  const textEl = document.getElementById("selectedMonthText");
  const fullMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  const token = localStorage.getItem("token");
  if (!fullMonth || fullMonth === "Loading...")
    return showToast("Select a month.");

  // 🟢 NEW: ഡാറ്റ മായ്ക്കുന്നതിന് മുൻപ് നിലവിലെ ഫിൽറ്ററുകൾ സേവ് ചെയ്യുന്നു
  let isFirstLoad = document.getElementById("siteList").querySelectorAll(".dynamic-item").length === 0;
  let prevOwners = getSelectedCheckboxes("ownerList");
  let prevSites = getSelectedCheckboxes("siteList");

  document.getElementById("dynamicBillsContainer").innerHTML = `
    <div style="text-align: center; padding: 50px; color: #666; background: white; border-radius: 8px; border: 1px dashed #ccc;">
      <h2>Data Fetched for ${fullMonth}</h2>
    </div>
  `;
  manualTableCount = 0;

  document.getElementById("loader").style.display = "flex";
  fetch("/billing/vehicles?month=" + encodeURIComponent(fullMonth), {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (res) => {
      if (res.status === 401 || res.status === 403) {
        executeLogout();
        throw new Error("Session Expired");
      }
      return res.json();
    })
    .then((data) => {
      if (data.success) {
        masterData = data.data;
        savedBillingData = data.saved_bills || [];
        
        // 🟢 NEW: സേവ് ചെയ്ത ഫിൽറ്ററുകൾ populateCheckboxes-ലേക്ക് അയക്കുന്നു
        populateCheckboxes(isFirstLoad, prevOwners, prevSites);

        // മുൻപ് screen-ൽ ഉണ്ടായിരുന്ന owners ഉണ്ടെങ്കിൽ auto re-arrange ചെയ്യുക
        if (autoArrangeOwners.length > 0) {
          autoArrangeForOwners(autoArrangeOwners);
        } else {
          showToast(
            `Fetched ${masterData.length} vehicles! Select filters and click 'Arrange ✨'`,
          );
        }
      } else showToast("Backend Error: " + data.message);
      document.getElementById("loader").style.display = "none";
    })
    .catch((err) => {
      document.getElementById("loader").style.display = "none";
      if (err.message !== "Session Expired")
        showToast("Server Connection Failed!");
    });
}

function autoArrangeForOwners(ownerNames) {
  const container = document.getElementById("dynamicBillsContainer");
  container.innerHTML = "";

  let groupCount = 0;

  ownerNames.forEach((ownerName) => {
    let ownerVehicles = masterData.filter(
      (v) => (v.owner || "").trim().toUpperCase() === ownerName,
    );
    if (ownerVehicles.length === 0) return;

    // Company അനുസരിച്ച് group ചെയ്യുക (owner_comp mode)
    let groups = {};
    ownerVehicles.forEach((item) => {
      let comp = getCompanyFromSite(item.site);
      let key = comp + "|||" + ownerName;
      if (!groups[key]) {
        groups[key] = { company: comp, owner: ownerName, items: [] };
      }
      groups[key].items.push(item);
    });

    Object.values(groups).forEach((group) => {
      group.items.sort((a, b) =>
        (a.plate_number || "").localeCompare(b.plate_number || ""),
      );
      groupCount++;
      container.appendChild(createBillCard(group, `month_switch_${groupCount}`));
    });
  });

  // Trigger calculation only via .nhr to preserve custom otrate from being overwritten
  document
    .querySelectorAll(".nhr")
    .forEach((el) => calculateRow(el));

  if (groupCount > 0) {
    showToast(`Month changed! ${groupCount} table(s) re-loaded.`);
  } else {
    container.innerHTML = `<div style="text-align:center; padding:50px; background:white; border-radius:8px; border:1px dashed #ccc;"><h2>No data found for selected owners in this month</h2></div>`;
    showToast(`No vehicles found for previous owners in this month.`);
  }
}

function populateCheckboxes(isFirstLoad = true, prevOwners = [], prevSites = []) {
  let owners = [
    ...new Set(
      masterData.map(
        (item) => item.owner?.trim().toUpperCase() || "COMPANY VEHICLE",
      ),
    ),
  ].sort();
  let sites = [
    ...new Set(masterData.map((item) => item.site?.trim() || "N/A")),
  ].sort();

  let oList = document.getElementById("ownerList");
  let sList = document.getElementById("siteList");

  // മുൻപ് 'Select All' ആയിരുന്നോ അതോ യൂസർ ചിലത് മാത്രം മാറ്റി വെച്ചതാണോ എന്ന് പരിശോധിക്കുന്നു
  let wasAllOwnersSelected = isFirstLoad || (document.getElementById("selectAllOwners") && document.getElementById("selectAllOwners").checked);
  let wasAllSitesSelected = isFirstLoad || (document.getElementById("selectAllSites") && document.getElementById("selectAllSites").checked);

  oList.querySelectorAll(".dynamic-item").forEach((e) => e.remove());
  sList.querySelectorAll(".dynamic-item").forEach((e) => e.remove());

  owners.forEach((o) => {
    // മുൻപ് Select All ആയിരുന്നെങ്കിൽ പുതിയ ഓണറും select ആകണം; അല്ലെങ്കിൽ പഴയ ലിസ്റ്റിൽ ഉള്ളതോ എന്ന് നോക്കണം
    let isChecked = wasAllOwnersSelected ? "checked" : (prevOwners.includes(o) ? "checked" : "");
    oList.innerHTML += `<label class="check-item dynamic-item"><input type="checkbox" class="dynamic-check" value="${o}" ${isChecked} onchange="updateSelectTexts()"> ${o}</label>`;
  });

  sites.forEach((s) => {
    // മുൻപ് Select All ആയിരുന്നെങ്കിൽ ആ മാസത്തിൽ വരുന്ന പുതിയ എല്ലാ സൈറ്റുകളും സ്വയം select ആകുന്നു
    let isChecked = wasAllSitesSelected ? "checked" : (prevSites.includes(s) ? "checked" : "");
    sList.innerHTML += `<label class="check-item dynamic-item"><input type="checkbox" class="dynamic-check" value="${s}" ${isChecked} onchange="updateSelectTexts()"> ${s}</label>`;
  });
  
  // Select All ചെക്ക്ബോക്സുകളുടെ നില അപ്ഡേറ്റ് ചെയ്യുന്നു
  if (document.getElementById("selectAllOwners")) {
    document.getElementById("selectAllOwners").checked = wasAllOwnersSelected;
  }
  if (document.getElementById("selectAllSites")) {
    document.getElementById("selectAllSites").checked = wasAllSitesSelected;
  }

  updateSelectTexts();
}

function getCompanyFromSite(siteName, fallbackCompany = "") {
  if (!siteName) return fallbackCompany || "Haka";
  let s = siteName.toUpperCase().replace(/[\s\-_]/g, "");
  if (s.includes("ALJODA")) return "Aljoda";
  if (s.includes("MASARWHEELS") || s.includes("MASAR")) return "Masar Wheels";
  if (s.includes("WE1TRACK") || s.includes("WE1") || s.includes("WETRACK")) return "We1 Track";
  if (s.includes("HAKA")) return "Haka";
  return fallbackCompany || "Haka";
}

let currentArrangeMode = "split";

window.setArrangeMode = function (mode) {
  currentArrangeMode = mode;
  const cards = document.querySelectorAll(".bill-card");

  // സ്ക്രീനിൽ ഇതിനകം ടേബിളുകൾ ഉണ്ടെങ്കിൽ അവയെ മാത്രം അറേഞ്ച് ചെയ്യുക
  if (cards.length > 0) {
    rearrangeScreenData();
  } else {
    // സ്ക്രീനിൽ ടേബിളുകൾ ഇല്ലെങ്കിൽ (ഉദാഹരണത്തിന് Fetch Data ചെയ്തയുടനെ) മുഴുവൻ ഡാറ്റയും അറേഞ്ച് ചെയ്യുക
    arrangeProperly();
  }
};

// 🟢 NEW FUNCTION: സ്ക്രീനിലുള്ള ഡാറ്റ മാത്രം വെച്ച് റീ-അറേഞ്ച് ചെയ്യാൻ
function rearrangeScreenData() {
  const cards = document.querySelectorAll(".bill-card");
  let itemsToGroup = [];
  let manualAdjs = [];

  cards.forEach((card) => {
    let fallbackOwner = card.querySelector(".owner-input")
      ? card.querySelector(".owner-input").value.trim()
      : card.dataset.owner;

    // സ്ക്രീനിലെ അഡ്ജസ്റ്റ്മെന്റ് ഡാറ്റകൾ ശേഖരിക്കുക
    card.querySelectorAll(".adjBody tr").forEach((adjRow) => {
      let date = adjRow.querySelector(".adj-date").value.trim();
      let plate = adjRow.querySelector(".adj-plate").value.trim().toUpperCase();
      let desc = adjRow.querySelector(".adj-desc").value.trim();
      let amt = parseFloat(adjRow.querySelector(".adj-amt").value) || 0;
      let type = adjRow.querySelector(".adj-type").value;

      if (date || plate || desc || amt !== 0) {
        manualAdjs.push({ date, plate, desc, amt: Math.abs(amt), type });
      }
    });

    // സ്ക്രീനിലെ വണ്ടികളുടെ ഡാറ്റകൾ ശേഖരിക്കുക
    card.querySelectorAll(".tableBody tr").forEach((row) => {
      let plate = row.querySelector(".plate").value.trim().toUpperCase();
      let site = row.querySelector(".site").value.trim();
      let vtype = row.querySelector(".vtype").value.trim();
      let driver = row.querySelector(".driver").value.trim();
      let nhr = parseFloat(row.querySelector(".nhr").value) || 0;
      let nrate = parseFloat(row.querySelector(".nrate").value) || 0;
      let othr = parseFloat(row.querySelector(".othr").value) || 0;
      let otrate = parseFloat(row.querySelector(".otrate").value) || 0;
      let masterMatch = masterData.find(
        (m) => (m.plate_number || m.plate || "").toUpperCase() === plate,
      );
      let vatSelect = row.querySelector(".vat-rate");
      let vatPerc = vatSelect 
        ? parseFloat(vatSelect.value) 
        : (masterMatch && (masterMatch.vat_bill === "Yes" || masterMatch.vat === "Yes") ? 15 : 0);
      let isVat = (vatPerc === 15 || (masterMatch && (masterMatch.vat_bill === "Yes" || masterMatch.vat === "Yes"))) ? "Yes" : "No";

      if (!plate && !site && nhr === 0 && othr === 0) return;

      let itemOwner = fallbackOwner;
      if (plate) {
        let masterMatch = masterData.find(
          (m) => (m.plate_number || m.plate || "").toUpperCase() === plate,
        );
        if (
          masterMatch &&
          masterMatch.owner &&
          masterMatch.owner.trim() !== ""
        ) {
          itemOwner = masterMatch.owner.trim();
        }
      }
      if (!itemOwner || itemOwner === "VARIOUS OWNERS")
        itemOwner = "COMPANY VEHICLE";

      itemsToGroup.push({
        plate_number: plate,
        site: site,
        vehicle_type: vtype,
        driver_name: driver,
        nrate: nrate,
        otrate: otrate,
        vat_bill: isVat,
        owner: itemOwner,
        log_nhr: parseFloat(row.querySelector(".log-nr")?.innerText) || 0,
        log_othr: parseFloat(row.querySelector(".log-ot")?.innerText) || 0,
        bill_nhr: parseFloat(row.querySelector(".bill-nr")?.innerText) || 0,
        bill_othr: parseFloat(row.querySelector(".bill-ot")?.innerText) || 0,
        driver_ot: parseFloat(row.querySelector(".driver-ot-input")?.value || row.querySelector(".driver-ot")?.innerText || 0),
        driver_amount: parseFloat(row.dataset.driverAmount) || 0,
        temp_nhr: nhr,
        temp_othr: othr,
        temp_remark: row.querySelector(".remark")
          ? row.querySelector(".remark").value
          : "",
      });
    });
  });

  if (itemsToGroup.length === 0)
    return showToast("No data on screen to arrange!");

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText =
    "Re-arranging Screen Data...";

  setTimeout(() => {
    let groups = {};

    itemsToGroup.forEach((item) => {
      let comp = getCompanyFromSite(item.site);
      let key = "";
      let groupOwner = item.owner.toUpperCase();
      let groupSite = item.site || "N/A";

      // നിങ്ങൾ തിരഞ്ഞെടുത്ത ഓപ്ഷൻ അനുസരിച്ച് സ്പ്ലിറ്റ് ചെയ്യാനുള്ള ലോജിക്
      if (currentArrangeMode === "site") {
        key = comp + "|||" + groupSite;
      } else if (currentArrangeMode === "split") {
        key = comp + "|||" + groupOwner + "|||" + groupSite;
      } else if (currentArrangeMode === "owner_comp") {
        key = comp + "|||" + groupOwner;
      } else if (currentArrangeMode === "owner_all") {
        key = groupOwner;
      } else {
        key = comp + "|||" + groupOwner;
      }

      if (!groups[key]) {
        groups[key] = {
          company: currentArrangeMode === "owner_all" ? "Haka" : comp,
          owner: currentArrangeMode === "site" ? "VARIOUS OWNERS" : groupOwner,
          items: [],
          manual_adjustments: [],
        };
      }
      groups[key].items.push(item);
    });

    manualAdjs.forEach((adj) => {
      let targetKey = null;
      for (let key in groups) {
        if (
          groups[key].items.some(
            (item) =>
              (item.plate_number || item.plate || "").toUpperCase() ===
              adj.plate,
          )
        ) {
          targetKey = key;
          break;
        }
      }
      if (!targetKey && Object.keys(groups).length > 0) {
        targetKey = Object.keys(groups)[0];
      }
      if (targetKey) {
        groups[targetKey].manual_adjustments.push(adj);
      }
    });

    const container = document.getElementById("dynamicBillsContainer");
    container.innerHTML = "";

    let groupCount = 0;
    Object.values(groups).forEach((group) => {
      group.items.sort((a, b) => {
        let plateA = (a.plate_number || a.plate || "").toUpperCase();
        let plateB = (b.plate_number || b.plate || "").toUpperCase();
        return plateA.localeCompare(plateB);
      });

      groupCount++;
      let newId = "screen_arr_" + Date.now() + "_" + groupCount;
      let newCard = createBillCard(group, newId);

      group.items.forEach((item, idx) => {
        let row = newCard.querySelector(`.tableBody tr:nth-child(${idx + 1})`);
        if (row) {
          row.querySelector(".nhr").value = item.temp_nhr;
          row.querySelector(".othr").value = item.temp_othr;
          if (row.querySelector(".remark") && item.temp_remark !== undefined) {
            row.querySelector(".remark").value = item.temp_remark;
          }
          calculateRow(row.querySelector(".nhr"));
        }
      });

      updateCardTotals(newCard);
      container.appendChild(newCard);
    });

    document.getElementById("loader").style.display = "none";
    document.getElementById("loaderText").innerText = "Processing Data...";
    showToast(`Re-arranged screen data into ${groupCount} table(s)!`);
  }, 300);
}

function arrangeProperly() {
  if (masterData.length === 0 && savedBillingData.length === 0)
    return showToast("Fetch data first!");

  let selectedOwners = getSelectedCheckboxes("ownerList");
  let selectedSites = getSelectedCheckboxes("siteList");

  if (selectedOwners.length === 0 || selectedSites.length === 0)
    return showToast("Please select at least one Owner and one Site.");

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Arranging Bills...";

  setTimeout(() => {
    let groups = {};
    masterData.forEach((item) => {
      let owner =
        item.owner && item.owner.trim() !== ""
          ? item.owner.trim().toUpperCase()
          : "COMPANY VEHICLE";
      let site = item.site || "N/A";
      if (!selectedOwners.includes(owner) || !selectedSites.includes(site))
        return;
      let comp = getCompanyFromSite(site);

      let key = "";
      if (currentArrangeMode === "site") {
        key = comp + "|||" + site;
      } else if (currentArrangeMode === "owner_comp") {
        key = comp + "|||" + owner;
      } else if (currentArrangeMode === "owner_all") {
        key = owner;
      } else {
        key = comp + "|||" + owner + "|||" + site;
      }

      if (!groups[key]) {
        groups[key] = {
          company: currentArrangeMode === "owner_all" ? "Haka" : comp,
          owner: currentArrangeMode === "site" ? "VARIOUS OWNERS" : owner,
          items: [],
        };
      }
      groups[key].items.push(item);
    });

    const container = document.getElementById("dynamicBillsContainer");
    container.innerHTML = "";

    if (Object.keys(groups).length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 50px; background: white; border-radius:8px;"><h2>No Vehicles Found for Selected Filters</h2></div>`;
    } else {
      let groupCount = 0;
      Object.values(groups).forEach((group) => {
        if (currentArrangeMode !== "split") {
          group.items.sort((a, b) => {
            let plateA = (a.plate_number || a.plate || "").toUpperCase();
            let plateB = (b.plate_number || b.plate || "").toUpperCase();
            return plateA.localeCompare(plateB);
          });
        }

        groupCount++;
      container.appendChild(createBillCard(group, `group_${groupCount}`));
    });
    
    // Trigger calculation only via .nhr to preserve custom otrate from being overwritten
    document
      .querySelectorAll(".nhr")
      .forEach((el) => calculateRow(el));
      
    showToast(`Successfully generated ${groupCount} table(s)!`);
    }
    document.getElementById("loader").style.display = "none";
    document.getElementById("loaderText").innerText = "Processing Data...";
  }, 500);
}

function createManualTable() {
  manualTableCount++;
  const container = document.getElementById("dynamicBillsContainer");
  if (container.innerHTML.includes("No Bills Generated Yet"))
    container.innerHTML = "";

  let manualGroup = {
    company: "",
    owner: "",
    items: [
      {
        vehicle_type: "",
        driver: "",
        site: "",
        plate_number: "",
        nrate: 0,
        otrate: 0,
        vat_bill: "Yes",
      },
    ],
  };
  container.insertAdjacentElement(
    "afterbegin",
    createBillCard(manualGroup, `manual_${manualTableCount}`),
  );
  showToast("Blank Manual Table Added!");
}

function generateAdjRowHTML(
  date = "",
  plate = "",
  desc = "",
  qty = "",
  rate = "",
  amt = 0,
  type = "less",
) {
  return `
    <tr>
        <td><input type="month" class="adj-date" value="${date}" style="width:100%; border:none; outline:none; text-align:center; background:transparent; font-family:inherit; font-size:13px; cursor:pointer;"></td>
        <td class="autocomplete-wrapper">
            <input type="text" class="adj-plate" value="${plate}" oninput="showSuggestions(this)" onkeydown="handleGlobalKeyDown(event, this)" onblur="handlePlateBlur(this)" autocomplete="off">
            <div class="suggestion-box"></div>
        </td>
        <td><input type="text" class="adj-desc" value="${desc}"></td>
        <td><input type="number" step="any" class="adj-qty" value="${qty}" oninput="calculateAdjAmount(this)"></td>
        <td><input type="number" step="any" class="adj-rate" value="${rate}" oninput="calculateAdjAmount(this)"></td>
        <td><input type="number" step="any" class="adj-amt" value="${Math.abs(amt)}" oninput="updateCardTotals(this.closest('.bill-card'))"></td>
        <td class="no-export-col">
            <select class="adj-type table-select" onchange="updateCardTotals(this.closest('.bill-card'))">
                <option value="add" ${type === "add" ? "selected" : ""}>Add</option>
                <option value="less" ${type === "less" ? "selected" : ""}>Less</option>
                <option value="none" ${type === "none" ? "selected" : ""}>None</option>
            </select>
        </td>
        <td class="no-export"><button class="btn-remove" onclick="this.closest('tr').remove(); updateCardTotals(this.closest('.bill-card'));">✖</button></td>
    </tr>
  `;
}

function calculateAdjAmount(input) {
  const row = input.closest("tr");
  const qty = parseFloat(row.querySelector(".adj-qty").value) || 0;
  const rate = parseFloat(row.querySelector(".adj-rate").value) || 0;

  if (qty > 0 && rate > 0) {
    row.querySelector(".adj-amt").value = (qty * rate).toFixed(2);
  }
  updateCardTotals(row.closest(".bill-card"));
}

function createBillCard(group, id) {
  const card = document.createElement("div");
  card.className = "container bill-card";
  card.id = `billCard_${id}`;
  card.dataset.company = group.company;
  card.dataset.owner = group.owner;

  const compConfig = companyData[group.company] || companyData["Haka"];
  const shortDate = getShortDate();

  let vatDisplay = "";

  let adjHtml = "";
  let parsedAdjs = [];

  if (group.manual_adjustments) {
    parsedAdjs = group.manual_adjustments;
  } else {
    for (let item of group.items) {
      let itemPlates = Array.isArray(item.related_plates) ? item.related_plates : [(item.plate_number || item.plate || "").trim().toUpperCase()];
      let saved = savedBillingData.find(
        (s) =>
          itemPlates.includes((s.plate_no || "").trim().toUpperCase()) &&
          (s.site_name || "").trim().toUpperCase() ===
            (item.site || "").trim().toUpperCase(),
      );
      if (saved && saved.adjustment_desc) {
        try {
          parsedAdjs = JSON.parse(saved.adjustment_desc);
        } catch (e) {
          parsedAdjs = [
            {
              date: "",
              plate: "",
              desc: saved.adjustment_desc,
              qty: "",
              rate: "",
              amt: saved.adjusted_amount || 0,
              type: saved.adjusted_amount < 0 ? "less" : "add",
            },
          ];
        }
        break;
      }
    }
  }

  let hasValidAdjustments = false;
  if (parsedAdjs.length > 0) {
    hasValidAdjustments = parsedAdjs.some(
      (adj) => adj.date || adj.plate || adj.desc || adj.amt !== 0,
    );
  }
  let adjDisplay = hasValidAdjustments ? "block" : "none";

  if (parsedAdjs.length > 0) {
    parsedAdjs.forEach((adj) => {
      adjHtml += generateAdjRowHTML(
        adj.date,
        adj.plate,
        adj.desc,
        adj.qty,
        adj.rate,
        adj.amt,
        adj.type,
      );
    });
  } else {
    adjHtml += generateAdjRowHTML();
  }

  let html = `
        <div class="no-export" style="display:flex; justify-content:space-between; margin-bottom:15px; background:#f8f9fa; padding:10px; border-radius:5px; border:1px solid #ddd;">
            <div style="display:flex; gap:10px; align-items:center;">
                <b class="card-title-text" style="color:#1a4d80; font-size:16px;">${group.company} - ${group.owner || "Manual Entry"}</b>
                <button class="icon-btn" title="Toggle Images" style="background:#6f42c1;" onclick="toggleCardImages('${id}')"><i class="material-icons">visibility</i></button>
                <button class="icon-btn" title="Adjustments" style="background:#6c757d;" onclick="toggleCardAdjustments('${id}')"><i class="material-icons">settings</i></button>
            </div>
            <div style="display:flex; gap:10px;">
                <button class="icon-btn" title="Download Image" style="background:#007bff;" onclick="exportSingleImage('${id}')"><i class="material-icons">download</i></button>
<button class="icon-btn" title="Copy High Quality Image" style="background:#17a2b8;" onclick="copyHighQualityCard('${id}')"><i class="material-icons">content_copy</i></button>
                <button class="icon-btn" title="Share WhatsApp" style="background:#25D366;" onclick="shareSingleWhatsApp('${id}')"><i class="material-icons">chat</i></button>
                <button class="icon-btn" title="Remove Table" style="background:#dc3545; margin-left:15px;" onclick="this.closest('.bill-card').remove()"><i class="material-icons">delete</i></button>
            </div>
        </div>

        <div class="print-area" id="printArea_${id}">
            <img src="${compConfig.header}" class="header-img hidden-image" alt="Header" crossorigin="anonymous">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <div class="owner-text-wrapper" style="font-weight: 800; font-size: 16px; color: #1a4d80; text-transform: uppercase; display: flex; align-items: center; gap: 5px;">
                OWNER : 
                <div class="autocomplete-wrapper" style="display:inline-block;">
                    <input type="text" class="owner-input" value="${group.owner}" placeholder="Enter Owner Name" oninput="showOwnerSuggestions(this, '${id}'); updateCardTotals(this.closest('.bill-card'));" onkeydown="handleOwnerKeyDown(event, this, '${id}')" onblur="handleOwnerBlur(this)" autocomplete="off" style="border:none; border-bottom:1px solid #ccc; font-weight:bold; font-size:16px; color:#1a4d80; width:300px; text-transform:uppercase; background:transparent;">
                    <div class="suggestion-box owner-suggestion-box" style="top: 100%; width: 100%; font-size: 14px; text-transform: none;"></div>
                </div>
            </div>
            </div>

            <h3>Bill Summary for Each Month ملخص فاتورة الشهر</h3>

            <table class="billTable">
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-date">Date</th>
                        <th class="col-vtype">Vehicle Type</th>
                        <th class="col-driver">Driver</th>
                        <th class="col-site site-col">Site</th> <th class="col-plate">Plate No</th>
                        <th class="col-small">N.Hr</th>
                        <th class="col-rate rate-col">N.Rate</th> 
                        <th class="col-small">OT Hr</th>
                        <th class="col-rate rate-col">OT Rate</th> 
                        <th class="col-money">Rent</th>
                        <th class="col-vat-p vat-col" style="display:${vatDisplay};">VAT %</th>
                        <th class="col-money vat-col" style="display:${vatDisplay};">VAT Amt</th>
                        <th class="col-money total-col" style="display:${vatDisplay};">Total</th>
                        <th class="col-remark no-export-col" style="width: 12%;">Remark</th>
                        <th class="col-small no-export">Dr OT</th>
                        <th class="col-small no-export">Log NR</th>
                        <th class="col-small no-export">Log OT</th>
                        <th class="col-small no-export">Bill NR</th>
                        <th class="col-small no-export">Bill OT</th>
                        <th class="col-action no-export">Act</th>
                    </tr>
                </thead>
                <tbody class="tableBody">
    `;

  group.items.forEach((item, index) => {
    let itemPlates = Array.isArray(item.related_plates) ? item.related_plates : [(item.plate_number || item.plate || "").trim().toUpperCase()];
    function matchesBillingPlate(bPlate) {
      if (!bPlate) return false;
      let raw = String(bPlate).trim().toUpperCase();
      let parts = raw.split(/➔|→|->/).map(p => p.trim().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
      let cleanItemPlates = itemPlates.map(p => String(p).replace(/[^A-Z0-9]/g, ""));
      return parts.some(p => cleanItemPlates.includes(p)) || cleanItemPlates.includes(raw.replace(/[^A-Z0-9]/g, ""));
    }

    let saved = savedBillingData.find(
      (s) =>
        matchesBillingPlate(s.plate_no) &&
        (s.site_name || "").trim().toUpperCase() ===
          (item.site || "").trim().toUpperCase(),
    );

    let nhr = saved ? saved.nhr : 0;
    let othr = saved ? saved.othr : 0;

    let nrate = item.nrate || 0;
    let otrate = item.otrate || 0;

    if (saved && parseFloat(saved.nrate) > 0) {
      nrate = parseFloat(saved.nrate);
    }
    if (saved && parseFloat(saved.otrate) > 0) {
      otrate = parseFloat(saved.otrate);
    }

    // 🟢 Owner Log / Master പ്രകാരമുള്ള VAT തന്നെ അടിസ്ഥാനമായി എടുക്കുന്നു
    let isVatVehicle = (item.vat_bill === "Yes" || item.vat === "Yes" || item.vat === "15" || item.vat === true);
    let vatPerc = isVatVehicle ? 15 : 0;

    // മുൻപ് ബില്ലിംഗിൽ എഡിറ്റ് ചെയ്തു സേവ് ചെയ്ത റെക്കോർഡ് ഉണ്ടെങ്കിൽ മാത്രം അത് പരിഗണിക്കുക, അല്ലെങ്കിൽ വെഹിക്കിൾ ലോഗ് തുക തന്നെ നിൽക്കണം
    if (saved && saved.vat_percent !== null && saved.vat_percent !== undefined && (parseFloat(saved.nrate) > 0 || parseFloat(saved.rent) > 0)) {
        vatPerc = parseFloat(saved.vat_percent);
    } else {
        vatPerc = isVatVehicle ? 15 : 0;
    }
    let driverName = item.driver_name || item.driver || "";
    if (saved && saved.driver) driverName = saved.driver;
    let rowRemark = saved && saved.remark ? saved.remark : "";
    let driverOt = saved
      ? parseFloat(saved.driver_ot) || 0
      : parseFloat(item.driver_ot) || 0;
    let driverAmount = saved
      ? parseFloat(saved.driver_amount) || 0
      : parseFloat(item.driver_amount) || 0;

    html += generateRowHTML(
      index + 1,
      shortDate,
      item.vehicle_type,
      driverName,
      item.site,
      item.plate_number,
      nhr,
      nrate,
      othr,
      otrate,
      vatPerc,
      vatDisplay,
      rowRemark,
      driverOt,
      driverAmount,
      item.log_nhr,
      item.log_othr,
      item.bill_nhr,
      item.bill_othr,
    );
  });

  html += `
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <td colspan="6" class="footer-colspan" style="text-align:right; padding-right:15px;">Grand Total:</td>
                        <td class="grandNHr">0</td>
                        <td class="rate-col"></td>
                        <td class="grandOTHr">0</td>
                        <td class="rate-col"></td>
                        <td class="grandRent">0</td>
                        <td class="vat-col" style="display:${vatDisplay};"></td>
                        <td class="grandVat vat-col" style="display:${vatDisplay};">0</td>
                        <td class="grandTotal total-col" style="display:${vatDisplay};">0</td>
                        <td class="no-export-col"></td>
                        <td class="no-export"></td>
                        <td class="no-export"></td>
                        <td class="no-export"></td>
                        <td class="no-export"></td>
                        <td class="no-export"></td>
                        <td class="no-export" style="text-align: center;">
                            <button type="button" class="btn-add-circle" onclick="addDynamicRow('${id}')">+</button>
                        </td>
                    </tr>
                </tfoot>
            </table>

            ${
              id.toString().startsWith("manual_")
                ? `
            <div class="no-export" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                <button type="button" class="btn" style="background:#28a745; color:white; display:inline-flex; align-items:center; gap:5px; padding: 10px 15px;" onclick="submitSingleCard('${id}')">
                    <i class="material-icons" style="font-size:18px;">save</i> Save to ERP
                </button>
                <button type="button" class="btn" style="background:#ff9800; color:white; display:inline-flex; align-items:center; gap:5px; padding: 10px 15px;" onclick="arrangeSingleCard('${id}')">
                    <i class="material-icons" style="font-size:18px;">auto_awesome</i> Arrange Manual Data
                </button>
            </div>
            `
                : ""
            }

            <div class="adjustmentsSection" style="display:${adjDisplay}; margin-top: 20px;">
                <h4 style="margin-bottom:5px; color:#1a4d80;">Adjustments</h4>
                <table class="adjTable">
                    <thead>
                        <tr>
                            <th class="col-date">Month</th>
                            <th class="col-plate">Plate No</th>
                            <th>Description</th>
                            <th class="col-small">Qty</th>
                            <th class="col-small">Rate</th>
                            <th class="col-money">Amount</th>
                            <th class="col-small no-export-col">Type</th>
                            <th class="col-action no-export"><button type="button" class="btn-add-circle" onclick="addAdjRowToCard('${id}')">+</button></th>
                        </tr>
                    </thead>
                    <tbody class="adjBody">
                        ${adjHtml}
                    </tbody>
                    <tfoot>
                        <tr class="balance-row">
                            <td colspan="5" style="text-align:right; padding-right:15px; border:none;">Balance After Adjustment:</td>
                            <td class="finalBalance" style="width:130px; border: 1px solid #ccc; text-align:center;">0</td>
                            <td colspan="2" class="no-export" style="border:none;"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div class="footer" style="margin-top:40px; display:flex; justify-content:space-between; align-items:flex-end;">
                <!-- Left Side: Text and Line -->
                <div style="text-align: left; padding-bottom: 10px;">
                    <p class="company-text hidden-image" style="margin-bottom: 5px;"><b>${compConfig.text}</b></p>
                    <p style="border-top: 1px solid #333; width: 250px; margin: 0;"></p>
                </div>
                <!-- Right Side: Signature and Seal together -->
                <div style="display: flex; align-items: center; gap: 10px; justify-content: flex-end;">
                    <img src="${compConfig.signature}" class="signature-img hidden-image" alt="Signature" crossorigin="anonymous" style="margin-bottom: 0; max-height: 80px;">
                    <img src="${compConfig.seal}" class="seal hidden-image" alt="Company Seal" crossorigin="anonymous" style="margin-bottom: 0;">
                </div>
            </div>
        </div>
    `;

  card.innerHTML = html;
  return card;
}

function generateRowHTML(
  index,
  date,
  vtype,
  driver,
  site,
  plate,
  nhr,
  nrate,
  othr,
  otrate,
  vatPerc,
  vatDisplay,
  remark = "",
  driverOt = 0,
  driverAmount = 0,
  logNhr = 0,
  logOthr = 0,
  billNhr = 0,
  billOthr = 0,
) {
  return `
        <tr data-driver-amount="${driverAmount}">
            <td class="row-num">${index}</td>
            <td class="date-cell">${date}</td>
            <td><input type="text" class="vtype" value="${vtype || ""}"></td>
            <td><input type="text" class="driver" value="${driver || ""}"></td>
            <td class="site-col"><input type="text" class="site" value="${site || ""}" oninput="updateCardTotals(this.closest('.bill-card'))"></td>
            <td class="autocomplete-wrapper">
                <input type="text" class="plate" value="${plate || ""}" onpaste="handlePlatePaste(event, this)" oninput="showSuggestions(this)" onkeydown="handleGlobalKeyDown(event, this)" onblur="handlePlateBlur(this)" autocomplete="off">
                <div class="suggestion-box"></div>
            </td>
            <td><input type="number" step="any" class="nhr" value="${nhr}" oninput="calculateRow(this)"></td>
            <td class="rate-col"><input type="number" step="any" class="nrate" value="${nrate}" oninput="calculateRow(this)"></td> 
            <td><input type="number" step="any" class="othr" value="${othr}" oninput="calculateRow(this)"></td>
            <td class="rate-col"><input type="number" step="any" class="otrate" value="${otrate}" oninput="calculateRow(this)"></td> 
            <td><input type="number" step="any" class="rent" value="0" oninput="calculateFromRent(this)"></td>
            <td class="vat-col" style="display:${vatDisplay};">
                <select class="vat-rate table-select" onchange="calculateRow(this)">
                    <option value="15" ${vatPerc == 15 ? "selected" : ""}>15%</option>
                    <option value="0" ${vatPerc == 0 ? "selected" : ""}>0%</option>
                </select>
            </td>
            <td class="vat vat-col" style="display:${vatDisplay};">0</td>
            <td class="total total-col" style="display:${vatDisplay};">0</td>
            <td class="no-export-col"><input type="text" class="remark" value="${remark}" placeholder=" " style="text-align: left; padding-left: 5px;"></td>
             <td class="no-export"><input type="number" step="any" class="driver-ot-input" value="${driverOt || 0}" style="width:100%; border:none; background:transparent; text-align:center; font-family:inherit; font-size:12px; outline:none; font-weight:600; color:#854d0e;"></td>
            <td class="no-export log-nr">${logNhr}</td>
            <td class="no-export log-ot">${logOthr}</td>
            <td class="no-export bill-nr">${billNhr}</td>
            <td class="no-export bill-ot">${billOthr}</td>
            <td class="no-export"><button type="button" class="btn-remove" onclick="removeDynamicRow(this)">✖</button></td>
        </tr>
    `;
}

window.arrangeSingleCard = function (cardId) {
  const card = document.getElementById(`billCard_${cardId}`);
  let itemsToGroup = [];
  let fallbackOwner = card.querySelector(".owner-input")
    ? card.querySelector(".owner-input").value.trim()
    : card.dataset.owner;

  let manualAdjs = [];
  card.querySelectorAll(".adjBody tr").forEach((adjRow) => {
    let date = adjRow.querySelector(".adj-date").value.trim();
    let plate = adjRow.querySelector(".adj-plate").value.trim().toUpperCase();
    let desc = adjRow.querySelector(".adj-desc").value.trim();
    let amt = parseFloat(adjRow.querySelector(".adj-amt").value) || 0;
    let type = adjRow.querySelector(".adj-type").value;

    if (date || plate || desc || amt !== 0) {
      manualAdjs.push({ date, plate, desc, amt: Math.abs(amt), type });
    }
  });

  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let plate = row.querySelector(".plate").value.trim().toUpperCase();
    let site = row.querySelector(".site").value.trim();
    let vtype = row.querySelector(".vtype").value.trim();
    let driver = row.querySelector(".driver").value.trim();
    let nhr = parseFloat(row.querySelector(".nhr").value) || 0;
    let nrate = parseFloat(row.querySelector(".nrate").value) || 0;
    let othr = parseFloat(row.querySelector(".othr").value) || 0;
    let otrate = parseFloat(row.querySelector(".otrate").value) || 0;
    let vatSelect = row.querySelector(".vat-rate");
    let vatPerc = vatSelect ? parseFloat(vatSelect.value) || 0 : 0;
    let isVat = vatPerc > 0 ? "Yes" : "No";

    if (!plate && !site && nhr === 0 && othr === 0) return;

    let itemOwner = fallbackOwner;
    if (plate) {
      let masterMatch = masterData.find(
        (m) => (m.plate_number || m.plate || "").toUpperCase() === plate,
      );
      if (masterMatch && masterMatch.owner)
        itemOwner = masterMatch.owner.trim();
    }
    if (!itemOwner) itemOwner = "COMPANY VEHICLE";

    itemsToGroup.push({
      plate_number: plate,
      site: site,
      vehicle_type: vtype,
      driver_name: driver,
      nrate: nrate,
      otrate: otrate,
      vat_bill: isVat,
      owner: itemOwner,
      log_nhr: parseFloat(row.querySelector(".log-nr")?.innerText) || 0,
      log_othr: parseFloat(row.querySelector(".log-ot")?.innerText) || 0,
      bill_nhr: parseFloat(row.querySelector(".bill-nr")?.innerText) || 0,
      bill_othr: parseFloat(row.querySelector(".bill-ot")?.innerText) || 0,
      driver_ot: parseFloat(row.querySelector(".driver-ot-input")?.value || row.querySelector(".driver-ot")?.innerText || 0),
      driver_amount: parseFloat(row.dataset.driverAmount) || 0,
      temp_nhr: nhr,
      temp_othr: othr,
      temp_remark: row.querySelector(".remark")
        ? row.querySelector(".remark").value
        : "",
    });
  });

  if (itemsToGroup.length === 0) return showToast("No data to arrange!");

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Arranging Manual Data...";

  setTimeout(() => {
    let groups = {};
    itemsToGroup.forEach((item) => {
      let comp = getCompanyFromSite(item.site);

      // 🟢 Force split only by Company & Owner for Manual Data
      let key = comp + "|||" + item.owner.toUpperCase();

      if (!groups[key]) {
        groups[key] = {
          company: comp,
          owner: item.owner.toUpperCase(),
          items: [],
          manual_adjustments: [],
        };
      }
      groups[key].items.push(item);
    });

    manualAdjs.forEach((adj) => {
      let targetKey = null;
      for (let key in groups) {
        if (
          groups[key].items.some(
            (item) =>
              (item.plate_number || item.plate || "").toUpperCase() ===
              adj.plate,
          )
        ) {
          targetKey = key;
          break;
        }
      }
      if (!targetKey && Object.keys(groups).length > 0) {
        targetKey = Object.keys(groups)[0];
      }
      if (targetKey) {
        groups[targetKey].manual_adjustments.push(adj);
      }
    });

    let groupCount = 0;
    Object.values(groups).forEach((group) => {
      // Sorting Alphabetically by Site, then by Plate Number
      group.items.sort((a, b) => {
        let siteA = (a.site || "").toUpperCase();
        let siteB = (b.site || "").toUpperCase();
        if (siteA !== siteB) return siteA.localeCompare(siteB);
        
        let plateA = (a.plate_number || a.plate || "").toUpperCase();
        let plateB = (b.plate_number || b.plate || "").toUpperCase();
        return plateA.localeCompare(plateB);
      });

      groupCount++;
      let newId = "manual_arr_" + Date.now() + "_" + groupCount;
      let newCard = createBillCard(group, newId);

      group.items.forEach((item, idx) => {
        let row = newCard.querySelector(`.tableBody tr:nth-child(${idx + 1})`);
        if (row) {
          row.querySelector(".nhr").value = item.temp_nhr;
          row.querySelector(".othr").value = item.temp_othr;
          if (row.querySelector(".remark") && item.temp_remark !== undefined) {
            row.querySelector(".remark").value = item.temp_remark;
          }
          calculateRow(row.querySelector(".nhr"));
        }
      });

      updateCardTotals(newCard);
      card.insertAdjacentElement("afterend", newCard);
    });

    card.remove();
    document.getElementById("loader").style.display = "none";
    showToast(`Arranged into ${groupCount} table(s)!`);
  }, 300);
};

function addDynamicRow(cardId) {
  const card = document.getElementById(`billCard_${cardId}`);
  const tbody = card.querySelector(".tableBody");
  const index = tbody.rows.length + 1;
  let vatDisplay = ""; // Always visible on UI
  const tr = document.createElement("tr");

  // 🟢 പുതിയ ബ്ലാങ്ക് വരിക്ക് 15-ന് പകരം ഡിഫോൾട്ട് ആയി 0% നൽകുന്നു (വണ്ടി തിരഞ്ഞെടുക്കുമ്പോൾ ലോഗ് അനുസരിച്ച് തനിയെ മാറും)
  tr.innerHTML = generateRowHTML(
    index,
    getShortDate(),
    "",
    "",
    "",
    "",
    0,
    0,
    0,
    0,
    0,
    vatDisplay,
    "",
  );
  tbody.appendChild(tr);
}

function removeDynamicRow(btn) {
  const card = btn.closest(".bill-card");
  btn.closest("tr").remove();
  let tbody = card.querySelector(".tableBody");
  Array.from(tbody.rows).forEach(
    (r, idx) => (r.querySelector(".row-num").innerText = idx + 1),
  );
  updateCardTotals(card);
}

function showSuggestions(input) {
  const val = input.value.trim().toUpperCase().replace(/\s+/g, "");
  const box = input.parentElement.querySelector(".suggestion-box");
  if (!val) {
    box.style.display = "none";
    return;
  }

  let selectedSites = getSelectedCheckboxes("siteList");
  let filteredData = selectedSites.length > 0 ? masterData.filter(d => selectedSites.includes(d.site || "N/A")) : masterData;
  
  let matches = [];
  filteredData.forEach(r => {
    let p = r.plate_number || r.plate || "";
    let matchFound = false;

    if (p && p.toUpperCase().replace(/\s+/g, "").includes(val)) matchFound = true;
    if (r.master_plate && r.master_plate.toUpperCase().replace(/\s+/g, "").includes(val)) matchFound = true;
    if (Array.isArray(r.related_plates) && r.related_plates.some(rp => rp.toUpperCase().replace(/\s+/g, "").includes(val))) matchFound = true;

    if (matchFound && !matches.includes(p)) {
      matches.push(p);
    }
  });

  if (matches.length > 0) {
    box.innerHTML = "";
    matches.forEach((match, index) => {
      let div = document.createElement("div");
      div.className = "suggestion-item";
      if (index === 0) div.classList.add("active");
      div.innerText = match;
      div.onmousedown = function (e) {
        e.preventDefault();
        input.value = match;
        box.style.display = "none";
        if (!input.classList.contains("adj-plate")) autoFill(input);
      };
      box.appendChild(div);
    });
    box.style.display = "block";
  } else box.style.display = "none";
}

function handlePlateBlur(input) {
  setTimeout(() => {
    let box = input.parentElement.querySelector(".suggestion-box");
    if (box) box.style.display = "none";
    if (!input.classList.contains("adj-plate")) autoFill(input);
  }, 200);
}

function handlePlatePaste(e, input) {
  const clipboardData = e.clipboardData || window.clipboardData;
  const pastedText = clipboardData.getData("text");

  if (!pastedText) return;

  // പുതിയ ലൈനുകളോ കോമകളോ ഉള്ള ഒന്നിലധികം പ്ലേറ്റ് നമ്പറുകൾ ഉണ്ടോ എന്ന് പരിശോധിക്കുന്നു
  const plates = pastedText
    .split(/[\r\n,]+/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);

  // ഒന്നിൽ കൂടുതൽ പ്ലേറ്റ് നമ്പറുകൾ ഉണ്ടെങ്കിൽ മാത്രം ബൾക്ക് ആയി കൈകാര്യം ചെയ്യുക
  if (plates.length > 1) {
    e.preventDefault(); // സിംഗിൾ ഇൻപുട്ടിലേക്ക് എല്ലാം കൂടി ഒന്നിച്ച് പേസ്റ്റ് ആകുന്നത് തടയുന്നു

    const card = input.closest(".bill-card");
    const cardId = card.id.replace("billCard_", "");
    const tbody = card.querySelector(".tableBody");
    const currentRow = input.closest("tr");

    // 1. ആദ്യത്തെ പ്ലേറ്റ് നമ്പർ നിലവിലെ വരിയിൽ നൽകുന്നു
    input.value = plates[0];
    autoFill(input);

    let nextRow = currentRow.nextElementSibling;

    // 2. ബാക്കിയുള്ള പ്ലേറ്റ് നമ്പറുകൾ ഓരോ വരികളിലായി ചേർക്കുന്നു
    for (let i = 1; i < plates.length; i++) {
      let targetRow = nextRow;

      // തൊട്ടടുത്ത വരി ഒഴിഞ്ഞതാണെങ്കിൽ അവിടെ നൽകുക, ഇല്ലെങ്കിൽ പുതിയ വരി ഉണ്ടാക്കുക
      if (
        !targetRow ||
        (targetRow.querySelector(".plate") &&
          targetRow.querySelector(".plate").value.trim() !== "")
      ) {
        addDynamicRow(cardId);
        targetRow = tbody.lastElementChild;
      }

      const plateInput = targetRow.querySelector(".plate");
      plateInput.value = plates[i];
      autoFill(plateInput);

      nextRow = targetRow.nextElementSibling;
    }

    // അവസാന വരി പൂരിപ്പിച്ചതാണെങ്കിൽ പുതിയൊരു ബ്ലാങ്ക് വരി കൂടി താഴെ ചേർക്കുന്നു
    if (
      tbody.lastElementChild &&
      tbody.lastElementChild.querySelector(".plate").value.trim() !== ""
    ) {
      addDynamicRow(cardId);
    }

    // സീരിയൽ നമ്പറുകളും കാർഡ് ടോട്ടലുകളും പുനഃക്രമീകരിക്കുന്നു
    Array.from(tbody.rows).forEach(
      (r, idx) => (r.querySelector(".row-num").innerText = idx + 1),
    );
    updateCardTotals(card);

    showToast(`${plates.length} vehicles pasted & data fetched!`);
  }
}

function handleGlobalKeyDown(e, input) {
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
    } else if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      input.value =
        activeIndex > -1 ? items[activeIndex].innerText : items[0].innerText;
      box.style.display = "none";
      if (!input.classList.contains("adj-plate")) autoFill(input);
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

let currentAutoFillInput = null;
let currentAutoFillMatches = [];

function autoFill(input) {
  if (document.getElementById("siteSelectionModal").style.display === "flex") {
    return;
  }

  const val = input.value.trim().toUpperCase();
  if (!val) return;

  let selectedSites = getSelectedCheckboxes("siteList");
  let matches = masterData.filter((d) => {
    let p = (d.plate_number || d.plate || "").toUpperCase();
    let mp = (d.master_plate || "").toUpperCase();
    let rp = Array.isArray(d.related_plates) ? d.related_plates.map(x => x.toUpperCase()) : [];

    let isPlateMatch = (p === val || mp === val || rp.includes(val) || p.includes(val));
    let isSiteMatch = (selectedSites.length === 0 || selectedSites.includes(d.site || "N/A"));

    return isPlateMatch && isSiteMatch;
  });

  if (matches.length === 0) return;

  if (matches.length === 1) {
    applyAutoFillData(input, matches[0]);
  } else {
    currentAutoFillInput = input;
    currentAutoFillMatches = matches;

    document.getElementById("modalPlateNo").innerText = val;
    let listHtml = "";
    matches.forEach((m, idx) => {
      let siteName = m.site || m.site_name || "N/A";
      listHtml += `<label><input type="checkbox" class="modal-site-checkbox" value="${idx}"> <b>${siteName}</b> (Rate: ${m.nrate ? (m.nrate * 260).toFixed(2) : 0})</label>`;
    });
    document.getElementById("modalSiteList").innerHTML = listHtml;
    document.getElementById("modalSelectAll").checked = false;
    document.getElementById("siteSelectionModal").style.display = "flex";
  }
}

window.toggleModalSites = function (isChecked) {
  document.querySelectorAll(".modal-site-checkbox").forEach((chk) => {
    chk.checked = isChecked;
  });
};

window.closeSiteModal = function () {
  document.getElementById("siteSelectionModal").style.display = "none";
  currentAutoFillInput = null;
  currentAutoFillMatches = [];
};

window.applySiteSelection = function () {
  let checked = document.querySelectorAll(".modal-site-checkbox:checked");
  if (checked.length === 0)
    return showToast("Please select at least one site!");

  let selectedMatches = Array.from(checked).map(
    (chk) => currentAutoFillMatches[parseInt(chk.value)],
  );

  applyAutoFillData(currentAutoFillInput, selectedMatches[0], false);

  const row = currentAutoFillInput.closest("tr");
  const tbody = row.parentElement;
  const cardId = currentAutoFillInput
    .closest(".bill-card")
    .id.replace("billCard_", "");

  for (let i = 1; i < selectedMatches.length; i++) {
    addDynamicRow(cardId);
    let newRow = tbody.lastElementChild;
    let newInput = newRow.querySelector(".plate");
    newInput.value = (
      selectedMatches[i].plate_number ||
      selectedMatches[i].plate ||
      ""
    ).toUpperCase();
    applyAutoFillData(newInput, selectedMatches[i], false);
  }

  let lastRowInput = tbody.lastElementChild.querySelector(".plate").value;
  if (lastRowInput !== "") addDynamicRow(cardId);

  closeSiteModal();
};

function applyAutoFillData(input, match, addBlankRow = true) {
  const row = input.closest("tr");

  if (match.vehicle_type || match.vtype)
    row.querySelector(".vtype").value = match.vehicle_type || match.vtype;
  if (match.driver_name || match.driver)
    row.querySelector(".driver").value = match.driver_name || match.driver;
  if (match.site || match.site_name)
    row.querySelector(".site").value = match.site || match.site_name;

  if (match.nrate) row.querySelector(".nrate").value = parseFloat(match.nrate);
  if (match.otrate)
    row.querySelector(".otrate").value = parseFloat(match.otrate);

  row.querySelector(".log-nr").innerText = match.log_nhr || 0;
  row.querySelector(".log-ot").innerText = match.log_othr || 0;
  row.querySelector(".bill-nr").innerText = match.bill_nhr || 0;
  row.querySelector(".bill-ot").innerText = match.bill_othr || 0;
  const drOtInput = row.querySelector(".driver-ot-input");
  if (drOtInput) drOtInput.value = match.driver_ot || 0;
  row.dataset.driverAmount = match.driver_amount || 0;

  let matchPlates = Array.isArray(match.related_plates) ? match.related_plates : [(match.plate_number || match.plate || "").trim().toUpperCase()];
  function matchesSavedBillingPlate(bPlate) {
    if (!bPlate) return false;
    let raw = String(bPlate).trim().toUpperCase();
    let parts = raw.split(/➔|→|->/).map((p) => p.trim().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
    let cleanMatchPlates = matchPlates.map((p) => String(p).replace(/[^A-Z0-9]/g, ""));
    return parts.some((p) => cleanMatchPlates.includes(p)) || cleanMatchPlates.includes(raw.replace(/[^A-Z0-9]/g, ""));
  }

  let saved = savedBillingData.find(
    (s) =>
      matchesSavedBillingPlate(s.plate_no) &&
      (s.site_name || "").trim().toUpperCase() ===
        (match.site || match.site_name || "").trim().toUpperCase(),
  );

  if (saved) {
    const drOtInput = row.querySelector(".driver-ot-input");
    if (drOtInput) drOtInput.value = saved.driver_ot || 0;
    row.dataset.driverAmount = saved.driver_amount || 0;
    row.querySelector(".nhr").value = saved.nhr || 0;
    row.querySelector(".othr").value = saved.othr || 0;
    if (row.querySelector(".remark") && saved.remark) {      
      row.querySelector(".remark").value = saved.remark;
    } 

    let fillNrate = match.nrate || 0;
    if (saved.nrate !== null && saved.nrate !== undefined) {
      fillNrate = parseFloat(saved.nrate);
    }
    row.querySelector(".nrate").value = fillNrate;

    let fillOtrate = match.otrate || 0;
    if (saved.otrate !== null && saved.otrate !== undefined) {
      fillOtrate = parseFloat(saved.otrate);
    }
    row.querySelector(".otrate").value = fillOtrate;
  } else {
    let currentNhr = parseFloat(row.querySelector(".nhr").value) || 0;
    let currentOthr = parseFloat(row.querySelector(".othr").value) || 0;
    if (currentNhr === 0) row.querySelector(".nhr").value = 0;
    if (currentOthr === 0) row.querySelector(".othr").value = 0;
  }

  let vatSelect = row.querySelector(".vat-rate");
  if (vatSelect) {
    let savedForVat = savedBillingData.find(
      (s) =>
        matchesSavedBillingPlate(s.plate_no) &&
        (s.site_name || "").trim().toUpperCase() ===
          (match.site || match.site_name || "").trim().toUpperCase()
    );
    
    // 🟢 വണ്ടിക്ക് VAT ഉണ്ടോ ഇല്ലയോ എന്ന് കൃത്യമായി വേർതിരിക്കുന്നു
    let isVat = (match.vat_bill === "Yes" || match.vat === "Yes" || match.vat === "15" || match.vat === true);
    let vatVal = isVat ? "15" : "0";

    if (saved && saved.vat_percent !== null && saved.vat_percent !== undefined && (parseFloat(saved.nrate) > 0 || parseFloat(saved.rent) > 0)) {
      vatVal = String(parseFloat(saved.vat_percent));
    }
    vatSelect.value = vatVal;
  }

  calculateRow(input);

  if (addBlankRow) {
    const tbody = row.parentElement;
    if (row === tbody.lastElementChild) {
      const card = row.closest(".bill-card");
      const cardId = card.id.replace("billCard_", "");
      addDynamicRow(cardId);
    }
  }

  // 🟢 പ്ലേറ്റ് നമ്പർ അടിക്കുമ്പോൾ അതിൻ്റെ അഡ്ജസ്റ്റ്മെൻ്റ് കൂടി ഫെച്ച് ചെയ്യുക
  loadSavedAdjustmentsToCard(input.closest(".bill-card"));
}

function calculateRow(input) {
  const row = input.closest("tr");
  const card = input.closest(".bill-card");

  const nhr = parseFloat(row.querySelector(".nhr").value) || 0;
  let nrate = parseFloat(row.querySelector(".nrate").value) || 0;
  const othr = parseFloat(row.querySelector(".othr").value) || 0;
  let otrate = parseFloat(row.querySelector(".otrate").value) || 0;

  if (input && input.classList.contains("nrate")) {
    otrate = nrate * 0.7;
    row.querySelector(".otrate").value = otrate;
  }

  const rent = nhr * nrate + othr * otrate;
  row.querySelector(".rent").value = Number.isInteger(rent)
    ? rent
    : rent.toFixed(2);

  updateRowVat(row, rent);
  updateCardTotals(card);
}

function calculateFromRent(input) {
  const row = input.closest("tr");
  const card = input.closest(".bill-card");
  const rent = parseFloat(row.querySelector(".rent").value) || 0;

  row.querySelector(".nhr").value = 0;
  row.querySelector(".othr").value = 0;

  updateRowVat(row, rent);
  updateCardTotals(card);
}

function updateRowVat(row, rent) {
  let vatSelect = row.querySelector(".vat-rate");
  let vatRate = vatSelect ? parseFloat(vatSelect.value) || 0 : 0;
  let vat = rent * (vatRate / 100);
  let vatCell = row.querySelector(".vat");
  let totalCell = row.querySelector(".total");

  if (vatCell) vatCell.innerText = Number.isInteger(vat) ? vat : vat.toFixed(2);
  if (totalCell)
    totalCell.innerText = Number.isInteger(rent + vat)
      ? rent + vat
      : (rent + vat).toFixed(2);
}

function updateCardTotals(card) {
  let gRent = 0,
    gVat = 0,
    gTotal = 0,
    gNhr = 0,
    gOthr = 0;

  card.querySelectorAll(".tableBody tr").forEach((row) => {
    gNhr += parseFloat(row.querySelector(".nhr").value) || 0;
    gOthr += parseFloat(row.querySelector(".othr").value) || 0;
    gRent += parseFloat(row.querySelector(".rent").value) || 0;
    gVat += parseFloat(row.querySelector(".vat")?.innerText || 0);
    let rowTotalStr = row.querySelector(".total")?.innerText;
    gTotal += rowTotalStr
      ? parseFloat(rowTotalStr)
      : parseFloat(row.querySelector(".rent").value || 0);
  });

  card.querySelector(".grandNHr").innerText = gNhr;
  card.querySelector(".grandOTHr").innerText = gOthr;
  card.querySelector(".grandRent").innerText = Number.isInteger(gRent)
    ? gRent
    : gRent.toFixed(2);

  let gVatEl = card.querySelector(".grandVat");
  let gTotalEl = card.querySelector(".grandTotal");
  if (gVatEl)
    gVatEl.innerText = Number.isInteger(gVat) ? gVat : gVat.toFixed(2);
  if (gTotalEl)
    gTotalEl.innerText = Number.isInteger(gTotal) ? gTotal : gTotal.toFixed(2);

  let finalBal = gTotal;
  card.querySelectorAll(".adjBody tr").forEach((row) => {
    let amt = parseFloat(row.querySelector(".adj-amt").value) || 0;
    let type = row.querySelector(".adj-type").value;
    if (type !== "none") {
      finalBal += type === "add" ? amt : -Math.abs(amt);
    }
  });
  card.querySelector(".finalBalance").innerText = Number.isInteger(finalBal)
    ? finalBal
    : finalBal.toFixed(2);

  // 🟢 Dynamic Header & Company Count Update
  let companyCounts = {};
  let totalValidRows = 0;
  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let plate = row.querySelector(".plate").value.trim();
    let site = row.querySelector(".site").value.trim();
    if (plate || site) {
      let comp = getCompanyFromSite(site);
      companyCounts[comp] = (companyCounts[comp] || 0) + 1;
      totalValidRows++;
    }
  });

  let titleEl = card.querySelector(".card-title-text");
  if (titleEl) {
    let ownerInput = card.querySelector(".owner-input");
    let ownerName = ownerInput ? ownerInput.value.trim() : card.dataset.owner;
    if (!ownerName) ownerName = "Manual Entry";

    let cardIdRaw = card.id.replace("billCard_", "");
    let waSpan = `<span style="cursor:pointer;" title="Click to copy & WhatsApp" onclick="copyCardAndWhatsApp('${cardIdRaw}', '${ownerName}')">${ownerName}</span>`;

    if (totalValidRows > 0) {
      const order = ["We1 Track", "Aljoda", "Masar Wheels", "Haka"];
      let compStrings = [];
      let dominantCompany = "";

      order.forEach((comp) => {
        if (companyCounts[comp]) {
          compStrings.push(`${comp} (${companyCounts[comp]})`);
          if (!dominantCompany) dominantCompany = comp; // കൂടുതൽ വണ്ടികളുള്ള/ആദ്യത്തെ കമ്പനി എടുക്കുന്നു
        }
      });
      titleEl.innerHTML = compStrings.join(" - ") + " | " + waSpan;

      // 🟢 സൈറ്റിന്റെ അടിസ്ഥാനത്തിൽ Header, Seal, Signature തത്സമയം മാറ്റുന്നു
      if (dominantCompany) {
        updateCardBranding(card, dominantCompany);
      }
    } else {
      titleEl.innerHTML = (card.dataset.company || "Haka") + " - " + waSpan;
    }
  }
}

function updateCardBranding(card, newCompany) {
  if (!card || !newCompany) return;
  const compConfig = companyData[newCompany] || companyData["Haka"];
  card.dataset.company = newCompany;

  // 1. Header Image
  const headerImg = card.querySelector(".header-img");
  if (headerImg && compConfig.header) {
    headerImg.src = compConfig.header;
  }

  // 2. Seal Image
  const sealImg = card.querySelector(".seal");
  if (sealImg && compConfig.seal) {
    sealImg.src = compConfig.seal;
  }

  // 3. Signature Image
  const sigImg = card.querySelector(".signature-img");
  if (sigImg && compConfig.signature) {
    sigImg.src = compConfig.signature;
  }

  // 4. Text
  const compText = card.querySelector(".company-text b");
  if (compText && compConfig.text) {
    compText.innerText = compConfig.text;
  }
}

function toggleCardImages(id) {
  const card = document.getElementById(`billCard_${id}`);
  card
    .querySelectorAll(".header-img, .seal, .signature-img, .company-text")
    .forEach((img) => img.classList.toggle("hidden-image"));
}

function toggleCardAdjustments(id) {
  const card = document.getElementById(`billCard_${id}`);
  const sec = card.querySelector(".adjustmentsSection");
  sec.style.display = sec.style.display === "none" ? "block" : "none";
}

function addAdjRowToCard(id) {
  const card = document.getElementById(`billCard_${id}`);
  const tbody = card.querySelector(".adjBody");
  tbody.insertAdjacentHTML("beforeend", generateAdjRowHTML());
}

function getDynamicFileName(card) {
  let plates = [];
  let sites = [];
  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let p = row.querySelector(".plate").value.trim();
    let s = row.querySelector(".site").value.trim();
    if (p) plates.push(p);
    if (s) sites.push(s);
  });

  let uniquePlates = [...new Set(plates)];
  let uniqueSites = [...new Set(sites)];
  let shortDate = getShortDate().replace(/ /g, "_");

  let ownerInput = card.querySelector(".owner-input");
  let ownerName = ownerInput ? ownerInput.value.trim() : card.dataset.owner;
  if (!ownerName) ownerName = "Manual";

  let siteStr = uniqueSites.length > 0 ? uniqueSites[0] : "Site";

  let filename = "";
  if (uniquePlates.length === 1)
    filename = `${uniquePlates[0]}_${shortDate}.png`;
  else filename = `${ownerName}_${shortDate}.png`;

  return filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function convertInputsToText(card) {
  let ownerWrapper = card.querySelector(".owner-text-wrapper");
  if (ownerWrapper) {
    ownerWrapper.style.display = "none";
  }

  // 🟢 NEW: എക്സ്പോർട്ട് ചെയ്യുന്നതിന് മുൻപ് ബ്ലാങ്ക് വരികൾ ഹൈഡ് ചെയ്യുന്നു
  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let plate = row.querySelector(".plate")
      ? row.querySelector(".plate").value.trim()
      : "";
    let nhr =
      parseFloat(
        row.querySelector(".nhr") ? row.querySelector(".nhr").value : 0,
      ) || 0;
    let othr =
      parseFloat(
        row.querySelector(".othr") ? row.querySelector(".othr").value : 0,
      ) || 0;

    if (plate === "" && nhr === 0 && othr === 0) {
      row.style.display = "none";
      row.classList.add("temp-hidden-export-row");
    }
  });

  card.querySelectorAll("input").forEach((input) => {
    if (input.type !== "hidden" && !input.classList.contains("owner-input")) {
      const span = document.createElement("span");
      span.className = "temp-export-span";
      span.innerText =
        input.type === "number" ? input.value || "0" : input.value;
      span.style.cssText =
        "display:block; width:100%; text-align:center; font-size:13px; padding:4px; font-weight:normal; color:#333;";

      input.style.display = "none";
      input.parentNode.appendChild(span);
    }
  });

  card
    .querySelectorAll(".no-export, .no-export-col")
    .forEach((el) => (el.style.display = "none"));
  card
    .querySelectorAll(".rate-col")
    .forEach((el) => (el.style.display = "none"));
  card
    .querySelectorAll(".site-col")
    .forEach((el) => (el.style.display = "none"));

  let footerColspan = card.querySelector(".footer-colspan");
  if (footerColspan) footerColspan.colSpan = 5;

  let grandVat = parseFloat(card.querySelector(".grandVat")?.innerText || 0);
  if (grandVat === 0) {
    card
      .querySelectorAll(".vat-col")
      .forEach((el) => (el.style.display = "none"));
  } else {
    card.querySelectorAll(".vat-col").forEach((el) => (el.style.display = ""));
  }
}

function revertInputsFromText(card) {
  let ownerWrapper = card.querySelector(".owner-text-wrapper");
  if (ownerWrapper) {
    ownerWrapper.style.display = "";
  }

  // 🟢 NEW: എക്സ്പോർട്ട് കഴിഞ്ഞതിന് ശേഷം ബ്ലാങ്ക് വരികൾ തിരികെ കൊണ്ടുവരുന്നു
  card.querySelectorAll(".temp-hidden-export-row").forEach((row) => {
    row.style.display = "";
    row.classList.remove("temp-hidden-export-row");
  });

  card.querySelectorAll(".temp-export-span").forEach((el) => el.remove());
  card.querySelectorAll("input").forEach((input) => (input.style.display = ""));

  card
    .querySelectorAll(".no-export, .no-export-col")
    .forEach((el) => (el.style.display = ""));
  card.querySelectorAll(".rate-col").forEach((el) => (el.style.display = ""));
  card.querySelectorAll(".site-col").forEach((el) => (el.style.display = ""));

  let footerColspan = card.querySelector(".footer-colspan");
  if (footerColspan) footerColspan.colSpan = 6;

  card.querySelectorAll(".vat-col").forEach((el) => {
    el.style.display = "";
  });
}

async function exportSingleImage(id) {
  const card = document.getElementById(`billCard_${id}`);
  const printArea = document.getElementById(`printArea_${id}`);
  const filename = getDynamicFileName(card);

  convertInputsToText(printArea);
  const canvas = await html2canvas(printArea, {
    scale: 3,
    useCORS: true,
    onclone: function (clonedDoc) {
      let clonedEl = clonedDoc.getElementById(printArea.id);
      if (clonedEl) {
        clonedEl.style.width =
          "1400px"; /* സ്ക്രീൻഷോട്ട് എടുക്കുമ്പോൾ മാത്രം വീതി കൂട്ടുന്നു */
        clonedEl.style.minWidth = "1400px";
      }
    },
  });
  revertInputsFromText(printArea);

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function shareSingleWhatsApp(id) {
  const card = document.getElementById(`billCard_${id}`);
  const printArea = document.getElementById(`printArea_${id}`);
  const filename = getDynamicFileName(card);

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Generating HD Image for WhatsApp...";

  convertInputsToText(printArea);
  // High Quality (HD) ലഭിക്കാനായി scale 4 ആക്കി മാറ്റിയിരിക്കുന്നു
  const canvas = await html2canvas(printArea, { 
    scale: 4, 
    useCORS: true,
    logging: false,
    imageTimeout: 0
  });
  revertInputsFromText(printArea);

  canvas.toBlob(
    async (blob) => {
      document.getElementById("loader").style.display = "none";
      try {
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
        } else {
          showToast("Direct Share not supported on this device. Downloading instead.");
          exportSingleImage(id);
        }
      } catch (error) {
        showToast("Share cancelled.");
      }
    },
    "image/png",
    1.0
  );
}

// പുതിയതായി ചേർക്കുന്ന High Quality Copy ഫങ്ക്ഷൻ
async function copyHighQualityCard(id) {
  const card = document.getElementById(`billCard_${id}`);
  const printArea = document.getElementById(`printArea_${id}`);

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Copying Card in High Quality...";

  convertInputsToText(printArea);
  const canvas = await html2canvas(printArea, { 
    scale: 4, 
    useCORS: true,
    logging: false,
    imageTimeout: 0
  });
  revertInputsFromText(printArea);

  canvas.toBlob(
    async (blob) => {
      document.getElementById("loader").style.display = "none";
      try {
        if (navigator.clipboard && window.isSecureContext) {
          const item = new ClipboardItem({ "image/png": blob });
          await navigator.clipboard.write([item]);
          showToast("High Quality Card Copied to Clipboard!");
        } else {
          showToast("Clipboard not supported. Downloading HD instead.");
          const link = document.createElement("a");
          link.download = getDynamicFileName(card);
          link.href = URL.createObjectURL(blob);
          link.click();
        }
      } catch (err) {
        showToast("Failed to copy image. Check browser permissions.");
        console.error(err);
      }
    },
    "image/png",
    1.0
  );
}

async function downloadAllAsZip() {
  const cards = document.querySelectorAll(".bill-card");
  if (cards.length === 0) return showToast("No bills to download!");

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText =
    "Creating ZIP file... Please wait.";

  const zip = new JSZip();
  let shortDate = getShortDate().replace(/ /g, "_");

  for (let i = 0; i < cards.length; i++) {
    let card = cards[i];
    let printArea = card.querySelector(".print-area");
    let filename = getDynamicFileName(card);

    convertInputsToText(printArea);
    const canvas = await html2canvas(printArea, { scale: 3, useCORS: true });
    revertInputsFromText(printArea);

    let imgData = canvas.toDataURL("image/png").split("base64,")[1];
    zip.file(filename, imgData, { base64: true });
  }

  zip.generateAsync({ type: "blob" }).then(function (content) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `Haka_Bulk_Bills_${shortDate}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    document.getElementById("loader").style.display = "none";
    showToast("ZIP Downloaded Successfully!");
  });
}

function submitBulkData() {
  const textEl = document.getElementById("selectedMonthText");
  const fullMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  const token = localStorage.getItem("token");
  const cards = document.querySelectorAll(".bill-card");

  if (!fullMonth || cards.length === 0)
    return showToast("No generated bills to save.");

  const dataToUpdate = [];

  cards.forEach((card) => {
    let company = card.dataset.company || "Haka";
    let ownerInput = card.querySelector(".owner-input");
    let fallbackOwner = ownerInput
      ? ownerInput.value.trim()
      : card.dataset.owner;

    let adjDataArray = [];
    card.querySelectorAll(".adjBody tr").forEach((adjRow) => {
      let date = adjRow.querySelector(".adj-date").value.trim();
      let plate = adjRow.querySelector(".adj-plate").value.trim();
      let desc = adjRow.querySelector(".adj-desc").value.trim();
      let qty = adjRow.querySelector(".adj-qty").value.trim();
      let rate = adjRow.querySelector(".adj-rate").value.trim();
      let amt = parseFloat(adjRow.querySelector(".adj-amt").value) || 0;
      let type = adjRow.querySelector(".adj-type").value;

      if (date || plate || desc || amt !== 0) {
        adjDataArray.push({
          date,
          plate,
          desc,
          qty,
          rate,
          amt: Math.abs(amt),
          type,
        });
      }
    });

    card.querySelectorAll(".tableBody tr").forEach((row) => {
      let plate = row.querySelector(".plate").value.trim();
      if (plate) {
        let rentVal = parseFloat(row.querySelector(".rent").value) || 0;
        let vatAmt = parseFloat(row.querySelector(".vat")?.innerText || 0);
        
        // 🟢 FIX: സ്ക്രീനിൽ കാണുന്ന കൃത്യമായ റൗണ്ടഡ് ടോട്ടൽ തന്നെ എടുക്കുന്നു (0.01 പൈസ വ്യത്യാസം വരാതിരിക്കാൻ)
        let totalVal = parseFloat(row.querySelector(".total")?.innerText) || Number((rentVal + vatAmt).toFixed(2));

        // 🟢 BUG FIX: Match Adjustment Plate dynamically
        let rowAdjs = adjDataArray.filter((a) => {
          let adjP = a.plate.toUpperCase().replace(/\s+/g, "");
          let rowP = plate.toUpperCase().replace(/\s+/g, "");
          return adjP !== "" && (rowP.includes(adjP) || adjP.includes(rowP));
        });

        let rowAdjAmtTotal = 0;
        rowAdjs.forEach((a) => {
          if (a.type !== "none") {
            rowAdjAmtTotal +=
              a.type === "less" ? -Math.abs(a.amt) : Math.abs(a.amt);
          }
        });
        let rowAdjDescStr = rowAdjs.length > 0 ? JSON.stringify(rowAdjs) : "";

        let realOwner = fallbackOwner;
        let masterMatch = masterData.find(
          (m) =>
            (m.plate_number || m.plate || "").toUpperCase() ===
            plate.toUpperCase(),
        );

        if (
          masterMatch &&
          masterMatch.owner &&
          masterMatch.owner.trim() !== ""
        ) {
          realOwner = masterMatch.owner.trim();
        } else if (realOwner === "VARIOUS OWNERS") {
          realOwner = "COMPANY VEHICLE";
        }

        let siteVal = row.querySelector(".site").value.trim();
        let cardComp = card.dataset.company || "";
        let masterComp = masterMatch ? (masterMatch.company || "") : "";
        let rowCompany = getCompanyFromSite(siteVal, masterComp || cardComp);

        dataToUpdate.push({
          date: row.querySelector(".date-cell").innerText.trim(),
          owner: realOwner,
          company: rowCompany,
          site_name: siteVal,
          vtype: row.querySelector(".vtype").value,
          driver: row.querySelector(".driver").value,
          plate: plate,
          nhr: parseFloat(row.querySelector(".nhr").value) || 0,
          nrate: parseFloat(row.querySelector(".nrate").value) || 0,
          othr: parseFloat(row.querySelector(".othr").value) || 0,
          otrate: parseFloat(row.querySelector(".otrate").value) || 0,
          rent: rentVal,
          vat_percent: parseFloat(row.querySelector(".vat-rate")?.value || 0),
          vat_amount: vatAmt,
          total: totalVal,
          adjustment_desc: rowAdjDescStr,
          adjusted_amount: rowAdjAmtTotal,
          after_adjustment: Number((totalVal + rowAdjAmtTotal).toFixed(2)),
          driver_ot: parseFloat(row.querySelector(".driver-ot-input")?.value || row.querySelector(".driver-ot")?.innerText || 0),
          driver_amount: parseFloat(row.dataset.driverAmount) || 0,
          remark: row.querySelector(".remark") ? row.querySelector(".remark").value.trim() : "",
        });
      }
    });
  });

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Saving to ERP...";

  fetch("/billing/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ billing_period: fullMonth, items: dataToUpdate }),
  })
    .then((res) => res.json())
    .then((res) => {
      document.getElementById("loader").style.display = "none";
      if (res.success) {
        showToast("All Bulk Bills Saved to ERP!");
        fetchDataSilently();
      } else {
        showToast("Error: " + res.message);
      }
    })
    .catch((err) => {
      document.getElementById("loader").style.display = "none";
      showToast("Error saving data.");
    });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.className = "show";
  setTimeout(() => (t.className = ""), 3000);
}

document.addEventListener("keydown", function (e) {
  const target = e.target;

  if (
    !target.closest(".billTable") ||
    (target.tagName !== "INPUT" && target.tagName !== "SELECT")
  )
    return;

  if (target.classList.contains("plate")) {
    const box = target.parentElement.querySelector(".suggestion-box");
    if (
      box &&
      box.style.display === "block" &&
      (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")
    ) {
      return;
    }
  }

  const td = target.closest("td");
  const tr = target.closest("tr");
  const tbody = target.closest("tbody");
  if (!td || !tr || !tbody) return;

  const cellIndex = Array.from(tr.children).indexOf(td);
  const rowIndex = Array.from(tbody.children).indexOf(tr);

  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();

    let targetRow =
      e.key === "ArrowUp"
        ? tbody.children[rowIndex - 1]
        : tbody.children[rowIndex + 1];
    if (targetRow) {
      let targetTd = targetRow.children[cellIndex];
      if (targetTd) {
        let nextInput = targetTd.querySelector("input, select");
        if (nextInput) {
          nextInput.focus();
          if (nextInput.select) nextInput.select();
        }
      }
    }
  }

  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    let shouldMove = false;

    if (target.type === "number" || target.tagName === "SELECT") {
      shouldMove = true;
    } else if (target.type === "text") {
      if (e.key === "ArrowLeft" && target.selectionStart === 0)
        shouldMove = true;
      if (e.key === "ArrowRight" && target.selectionEnd === target.value.length)
        shouldMove = true;
    }

    if (shouldMove) {
      e.preventDefault();
      let allInputs = Array.from(
        tr.querySelectorAll('input:not([style*="display: none"]), select'),
      );
      let currentIndex = allInputs.indexOf(target);

      let nextInput =
        e.key === "ArrowLeft"
          ? allInputs[currentIndex - 1]
          : allInputs[currentIndex + 1];
      if (nextInput) {
        nextInput.focus();
        if (nextInput.select) nextInput.select();
      }
    }
  }
});

function goToDashboard() {
  window.location.href = "/billing/dashboard";
}

function fetchDataSilently() {
  const textEl = document.getElementById("selectedMonthText");
  const fullMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  const token = localStorage.getItem("token");
  if (!fullMonth || fullMonth === "Loading...") return;

  fetch("/billing/vehicles?month=" + encodeURIComponent(fullMonth), {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        masterData = data.data;
        savedBillingData = data.saved_bills || [];
      }
    })
    .catch((err) => console.log("Silent background fetch failed", err));
}

/* ==============================================
   NEW FUNCTIONS FOR SINGLE SAVE & OWNER AUTOFILL
============================================== */

function submitSingleCard(cardId) {
  const textEl = document.getElementById("selectedMonthText");
  const fullMonth = (textEl.dataset.fullMonth || textEl.innerText).trim();
  const token = localStorage.getItem("token");
  const card = document.getElementById(`billCard_${cardId}`);

  if (!fullMonth || !card) return showToast("No generated bills to save.");

  const dataToUpdate = [];
  let company = card.dataset.company || "Haka";
  let ownerInput = card.querySelector(".owner-input");
  let fallbackOwner = ownerInput ? ownerInput.value.trim() : card.dataset.owner;

  let adjDataArray = [];
  card.querySelectorAll(".adjBody tr").forEach((adjRow) => {
    let date = adjRow.querySelector(".adj-date").value.trim();
    let plate = adjRow.querySelector(".adj-plate").value.trim();
    let desc = adjRow.querySelector(".adj-desc").value.trim();
    let qty = adjRow.querySelector(".adj-qty").value.trim();
    let rate = adjRow.querySelector(".adj-rate").value.trim();
    let amt = parseFloat(adjRow.querySelector(".adj-amt").value) || 0;
    let type = adjRow.querySelector(".adj-type").value;

    if (date || plate || desc || amt !== 0) {
      adjDataArray.push({
        date,
        plate,
        desc,
        qty,
        rate,
        amt: Math.abs(amt),
        type,
      });
    }
  });

  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let plate = row.querySelector(".plate").value.trim();
    if (plate) {
      let rentVal = parseFloat(row.querySelector(".rent").value) || 0;
      let vatAmt = parseFloat(row.querySelector(".vat")?.innerText || 0);
      
      // 🟢 FIX: സ്ക്രീനിൽ കാണുന്ന കൃത്യമായ റൗണ്ടഡ് ടോട്ടൽ തന്നെ എടുക്കുന്നു (0.01 പൈസ വ്യത്യാസം വരാതിരിക്കാൻ)
      let totalVal = parseFloat(row.querySelector(".total")?.innerText) || Number((rentVal + vatAmt).toFixed(2));

      // 🟢 BUG FIX: Match Adjustment Plate dynamically for single card
      let rowAdjs = adjDataArray.filter((a) => {
        let adjP = a.plate.toUpperCase().replace(/\s+/g, "");
        let rowP = plate.toUpperCase().replace(/\s+/g, "");
        return adjP !== "" && (rowP.includes(adjP) || adjP.includes(rowP));
      });

      let rowAdjAmtTotal = 0;
      rowAdjs.forEach((a) => {
        if (a.type !== "none") {
          rowAdjAmtTotal +=
            a.type === "less" ? -Math.abs(a.amt) : Math.abs(a.amt);
        }
      });
      let rowAdjDescStr = rowAdjs.length > 0 ? JSON.stringify(rowAdjs) : "";

      let realOwner = fallbackOwner;
      let masterMatch = masterData.find(
        (m) =>
          (m.plate_number || m.plate || "").toUpperCase() ===
          plate.toUpperCase(),
      );
      if (masterMatch && masterMatch.owner && masterMatch.owner.trim() !== "") {
        realOwner = masterMatch.owner.trim();
      } else if (realOwner === "VARIOUS OWNERS") {
        realOwner = "COMPANY VEHICLE";
      }

      let siteVal = row.querySelector(".site").value.trim();
      let cardComp = card.dataset.company || "";
      let masterComp = masterMatch ? (masterMatch.company || "") : "";
      let rowCompany = getCompanyFromSite(siteVal, masterComp || cardComp);

      dataToUpdate.push({
        date: row.querySelector(".date-cell").innerText.trim(),
        owner: realOwner,
        company: rowCompany,
        site_name: siteVal,
        vtype: row.querySelector(".vtype").value,
        driver: row.querySelector(".driver").value,
        plate: plate,
        nhr: parseFloat(row.querySelector(".nhr").value) || 0,
        nrate: parseFloat(row.querySelector(".nrate").value) || 0,
        othr: parseFloat(row.querySelector(".othr").value) || 0,
        otrate: parseFloat(row.querySelector(".otrate").value) || 0,
        rent: rentVal,
        vat_percent: parseFloat(row.querySelector(".vat-rate")?.value || 0),
        vat_amount: vatAmt,
        total: totalVal,
        adjustment_desc: rowAdjDescStr,
        adjusted_amount: rowAdjAmtTotal,
        after_adjustment: Number((totalVal + rowAdjAmtTotal).toFixed(2)),
        driver_ot: parseFloat(row.querySelector(".driver-ot-input")?.value || row.querySelector(".driver-ot")?.innerText || 0),
        driver_amount: parseFloat(row.dataset.driverAmount) || 0,
        remark: row.querySelector(".remark")
          ? row.querySelector(".remark").value.trim()
          : "",
      });
    }
  });

  if (dataToUpdate.length === 0)
    return showToast("No rows to save in this table!");

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText = "Saving Single Table...";

  fetch("/billing/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ billing_period: fullMonth, items: dataToUpdate }),
  })
    .then((res) => res.json())
    .then((res) => {
      document.getElementById("loader").style.display = "none";
      if (res.success) {
        showToast("Table Saved to ERP!");
        fetchDataSilently();
      } else showToast("Error: " + res.message);
    })
    .catch((err) => {
      document.getElementById("loader").style.display = "none";
      showToast("Error saving data.");
    });
}

function showOwnerSuggestions(input, cardId) {
  const val = input.value.trim().toUpperCase();
  const box = input.parentElement.querySelector(".owner-suggestion-box");
  if (!val) {
    box.style.display = "none";
    return;
  }

  const owners = [
    ...new Set(
      masterData
        .map((r) => (r.owner || "").trim().toUpperCase())
        .filter((o) => o),
    ),
  ];
  const matches = owners.filter((o) => o.includes(val));

  if (matches.length > 0) {
    box.innerHTML = "";
    matches.forEach((match, index) => {
      let div = document.createElement("div");
      div.className = "suggestion-item";
      if (index === 0) div.classList.add("active");
      div.innerText = match;
      div.onmousedown = function (e) {
        e.preventDefault();
        input.value = match;
        box.style.display = "none";
        autoFillOwnerData(cardId, match);
      };
      box.appendChild(div);
    });
    box.style.display = "block";
  } else box.style.display = "none";
}

function handleOwnerBlur(input) {
  setTimeout(() => {
    let box = input.parentElement.querySelector(".owner-suggestion-box");
    if (box) box.style.display = "none";
  }, 200);
}

function handleOwnerKeyDown(e, input, cardId) {
  const box = input.parentElement.querySelector(".owner-suggestion-box");
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
      let selectedOwner =
        activeIndex > -1 ? items[activeIndex].innerText : items[0].innerText;
      input.value = selectedOwner;
      box.style.display = "none";
      autoFillOwnerData(cardId, selectedOwner);
      return;
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    autoFillOwnerData(cardId, input.value.trim());
  }
}

function autoFillOwnerData(cardId, ownerName) {
  const card = document.getElementById(`billCard_${cardId}`);
  if (!card) return;

  // 1. ഫിൽറ്റർ ചെയ്ത സൈറ്റ് ഡാറ്റ മാത്രം എടുക്കാൻ
  let selectedSites = getSelectedCheckboxes("siteList");
  let ownerVehicles = masterData.filter(
    (v) => (v.owner || "").trim().toUpperCase() === ownerName.toUpperCase() &&
           (selectedSites.length === 0 || selectedSites.includes(v.site || v.site_name || "N/A"))
  );
  
  if (ownerVehicles.length === 0)
    return showToast("No vehicles found for " + ownerName + " in selected sites");

  // 2. സൈറ്റിന്റെ ആദ്യത്തെ വാക്ക് (First Name) മാത്രം നോക്കി Alphabetical ആയി അറേഞ്ച് ചെയ്യുന്നു
  ownerVehicles.sort((a, b) => {
    let siteA = (a.site || a.site_name || "").toUpperCase().trim();
    let siteB = (b.site || b.site_name || "").toUpperCase().trim();
    
    // സൈറ്റിന്റെ ആദ്യത്തെ വാക്ക് മാത്രം എടുക്കുന്നു (ഉദാഹരണത്തിന് "BISHA L&T WE1" ൽ നിന്ന് "BISHA" മാത്രം)
    let firstWordA = siteA.split(" ")[0];
    let firstWordB = siteB.split(" ")[0];
    
    // ആദ്യത്തെ വാക്ക് വെച്ച് അറേഞ്ച് ചെയ്യുന്നു
    if (firstWordA !== firstWordB) {
      return firstWordA.localeCompare(firstWordB);
    }
    
    // ആദ്യത്തെ വാക്ക് തുല്യമാണെങ്കിൽ പ്ലേറ്റ് നമ്പർ വെച്ച് അറേഞ്ച് ചെയ്യുന്നു
    let plateA = (a.plate_number || a.plate || "").toUpperCase();
    let plateB = (b.plate_number || b.plate || "").toUpperCase();
    return plateA.localeCompare(plateB);
  });

  const tbody = card.querySelector(".tableBody");
  tbody.innerHTML = "";

  ownerVehicles.forEach((match) => {
    addDynamicRow(cardId);
    let newRow = tbody.lastElementChild;
    let plateInput = newRow.querySelector(".plate");
    plateInput.value = (match.plate_number || match.plate || "").toUpperCase();
    applyAutoFillData(plateInput, match, false);
  });

  updateCardTotals(card);
  showToast(`${ownerVehicles.length} vehicles auto-filled for ${ownerName}!`);

  // 🟢 ഓണറെ അടിക്കുമ്പോൾ വണ്ടികളുടെ കൂടെ അഡ്ജസ്റ്റ്മെൻ്റ് കൂടി ഫെച്ച് ചെയ്യുക
  loadSavedAdjustmentsToCard(card);
}

/* =========================================
   🟢 CONTEXT MENU (RIGHT CLICK TO HIDE)
========================================= */
let rightClickTarget = null;
let isColumn = false;

document.addEventListener("contextmenu", function (e) {
  const th = e.target.closest("th");
  const tr = e.target.closest("tr");

  // ടേബിളിനുള്ളിൽ ആണെങ്കിൽ മാത്രം മെനു കാണിക്കുക
  if (e.target.closest(".billTable") || e.target.closest(".adjTable")) {
    if (th || (tr && tr.parentNode.tagName === "TBODY")) {
      e.preventDefault();
      rightClickTarget = th || tr;
      isColumn = !!th;

      const contextMenu = document.getElementById("contextMenu");
      contextMenu.style.display = "block";
      contextMenu.style.left = e.pageX + "px";
      contextMenu.style.top = e.pageY + "px";
    }
  }
});

document.addEventListener("click", function (e) {
  const contextMenu = document.getElementById("contextMenu");
  if (contextMenu.style.display === "block") {
    contextMenu.style.display = "none";
  }
});

document.getElementById("hideAction").addEventListener("click", function () {
  if (!rightClickTarget) return;

  if (isColumn) {
    // Hide Column
    const table = rightClickTarget.closest("table");
    const index = Array.from(rightClickTarget.parentNode.children).indexOf(
      rightClickTarget,
    );

    // Hide Header
    rightClickTarget.classList.add("temp-hidden");
    rightClickTarget.style.display = "none";

    // Hide Cells in that column
    table.querySelectorAll("tr").forEach((row) => {
      if (row.children[index]) {
        row.children[index].classList.add("temp-hidden");
        row.children[index].style.display = "none";
      }
    });
  } else {
    // Hide Row
    rightClickTarget.classList.add("temp-hidden");
    rightClickTarget.style.display = "none";
  }

  rightClickTarget = null;
  showToast("Hidden temporarily! Use 'Unhide All' to restore.");
});

function unhideAll() {
  document.querySelectorAll(".temp-hidden").forEach((el) => {
    el.style.display = "";
    el.classList.remove("temp-hidden");
  });
  showToast("All hidden rows/columns restored!");
}

/* =========================================
   🟢 LOAD SAVED ADJUSTMENTS FOR MANUAL TABLES
========================================= */
function loadSavedAdjustmentsToCard(card) {
  if (!card) return;
  let existingAdjs = [];

  // നിലവിൽ ടേബിളിൽ ഉള്ള അഡ്ജസ്റ്റ്മെൻ്റുകൾ ശേഖരിക്കുക (ഡ്യൂപ്ലിക്കേറ്റ് ആവാതിരിക്കാൻ)
  card.querySelectorAll(".adjBody tr").forEach((row) => {
    let date = row.querySelector(".adj-date").value;
    let plate = row.querySelector(".adj-plate").value;
    let desc = row.querySelector(".adj-desc").value;
    let qty = row.querySelector(".adj-qty").value;
    let rate = row.querySelector(".adj-rate").value;
    let amt = parseFloat(row.querySelector(".adj-amt").value) || 0;
    let type = row.querySelector(".adj-type").value;

    if (date || plate || desc || amt !== 0) {
      existingAdjs.push({ date, plate, desc, qty, rate, amt, type });
    }
  });

  let foundNew = false;

  // ടേബിളിലുള്ള എല്ലാ വണ്ടികൾക്കും അഡ്ജസ്റ്റ്മെൻ്റ് ഉണ്ടോ എന്ന് പരിശോധിക്കുക
  card.querySelectorAll(".tableBody tr").forEach((row) => {
    let plate = row.querySelector(".plate").value.trim().toUpperCase();
    let site = row.querySelector(".site").value.trim();
    if (!plate) return;

    let cleanInputPlate = plate.replace(/[^A-Z0-9]/g, "");
    let saved = savedBillingData.find((s) => {
      let sPlateRaw = String(s.plate_no || "").toUpperCase();
      let parts = sPlateRaw.split(/➔|→|->/).map((p) => p.replace(/[^A-Z0-9]/g, "")).filter(Boolean);
      let plateMatches = parts.includes(cleanInputPlate) || sPlateRaw.replace(/[^A-Z0-9]/g, "") === cleanInputPlate;
      return plateMatches && (s.site_name || "").trim().toUpperCase() === site.toUpperCase();
    });

    if (saved && saved.adjustment_desc) {
      try {
        let parsed = JSON.parse(saved.adjustment_desc);
        parsed.forEach((p) => {
          let isDup = existingAdjs.some(
            (e) => e.desc === p.desc && parseFloat(e.amt) === parseFloat(p.amt),
          );
          if (!isDup) {
            existingAdjs.push(p);
            foundNew = true;
          }
        });
      } catch (e) {
        // പഴയ പ്ലെയിൻ ടെക്സ്റ്റ് ഫോർമാറ്റിലുള്ള അഡ്ജസ്റ്റ്മെൻ്റ് ആണെങ്കിൽ
        let isDup = existingAdjs.some(
          (e) =>
            e.desc === saved.adjustment_desc &&
            parseFloat(e.amt) === Math.abs(saved.adjusted_amount || 0),
        );
        if (!isDup) {
          existingAdjs.push({
            date: "",
            plate: "",
            desc: saved.adjustment_desc,
            qty: "",
            rate: "",
            amt: Math.abs(saved.adjusted_amount || 0),
            type: saved.adjusted_amount < 0 ? "less" : "add",
          });
          foundNew = true;
        }
      }
    }
  });

  // പുതിയതായി എന്തെങ്കിലും കണ്ടെത്തിയാൽ അത് ടേബിളിൽ കാണിക്കുക
  if (foundNew) {
    const tbody = card.querySelector(".adjBody");
    tbody.innerHTML = "";
    card.querySelector(".adjustmentsSection").style.display = "block";

    existingAdjs.forEach((adj) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        generateAdjRowHTML(
          adj.date || "",
          adj.plate || "",
          adj.desc || "",
          adj.qty || "",
          adj.rate || "",
          adj.amt || 0,
          adj.type || "less",
        ),
      );
    });

    // അവസാനം ഒരു ബ്ലാങ്ക് റോ കൂടി നൽകുക
    tbody.insertAdjacentHTML("beforeend", generateAdjRowHTML());
    updateCardTotals(card);
  }
}

/* =========================================
   🟢 COPY CARD & OPEN WHATSAPP DESKTOP
========================================= */
async function copyCardAndWhatsApp(cardId, ownerName) {
  if (ownerName === "Manual Entry" || !ownerName) {
    return showToast("Please select a valid Owner first!");
  }

  // Find mobile number from masterData (Improved matching to ignore spaces)
  let mobile = "";
  let safeOwnerName = ownerName.trim().toUpperCase();

  let match = masterData.find((v) => {
    let vOwner = (v.owner || "").trim().toUpperCase();
    return vOwner === safeOwnerName && v.owner_mobile;
  });

  if (match && match.owner_mobile) {
    mobile = String(match.owner_mobile).replace(/[^0-9+]/g, ""); // Extract only numbers
  }

  if (!mobile) {
    return showToast(`Mobile number not found for ${ownerName} in Database!`);
  }

  // Saudi Number Formatting Check (Change to 91 if it's India)
  if (mobile.startsWith("05") && mobile.length === 10) {
    mobile = "966" + mobile.substring(1);
  }

  document.getElementById("loader").style.display = "flex";
  document.getElementById("loaderText").innerText =
    "Copying Card & Opening WhatsApp...";

  const printArea = document.getElementById(`printArea_${cardId}`);
  convertInputsToText(printArea);

  try {
    const canvas = await html2canvas(printArea, { scale: 3, useCORS: true });
    revertInputsFromText(printArea);

    canvas.toBlob(
      async (blob) => {
        try {
          // Try copying to clipboard (Works perfectly if HTTPS or localhost)
          if (navigator.clipboard && window.isSecureContext) {
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            showToast("Card copied! Opening WhatsApp...");
          } else {
            // Fallback for non-HTTPS local IP - Downloads the file automatically instead
            const link = document.createElement("a");
            link.download = `${ownerName.replace(/\s+/g, "_")}_Bill.png`;
            link.href = URL.createObjectURL(blob);
            link.click();
            showToast("Image Downloaded. Opening WhatsApp...");
          }

          document.getElementById("loader").style.display = "none";

          // Get selected month text
          const currentMonth = document.getElementById("selectedMonthText")?.innerText.trim() || "";
          const msgText = encodeURIComponent(`*${currentMonth} Bill*`);

          // Open WhatsApp Desktop / Web link with prefilled month text
          setTimeout(() => {
            window.open(`whatsapp://send?phone=${mobile}&text=${msgText}`, "_self");
          }, 1000);
        } catch (err) {
          document.getElementById("loader").style.display = "none";
          showToast(
            "Clipboard write failed. Please check browser permissions.",
          );
          console.error(err);
        }
      },
      "image/png",
      1.0,
    );
  } catch (err) {
    revertInputsFromText(printArea);
    document.getElementById("loader").style.display = "none";
    showToast("Error generating image.");
  }
}