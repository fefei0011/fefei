const token = localStorage.getItem("timesheetToken");
if (!token) {
  const currentPage = encodeURIComponent(
    window.location.pathname.split("/").pop() + window.location.search,
  );
  window.location.href = "index.html?redirect=" + currentPage;
}

let userRole = "";
const userStr = localStorage.getItem("timesheetUser");
if (userStr) {
  const u = JSON.parse(userStr);
  userRole = u.role;
  document.getElementById("userInfo").innerHTML =
    `<span class="user-icon">👤</span><span class="user-text">${u.username} (${u.role})</span>`;
  const addBtn = document.getElementById("adminAddVehicleBtn");
  if (addBtn && (userRole === "Super Admin" || userRole === "Editor")) {
    addBtn.style.display = "inline-flex";
  }
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );
}

let dynamicCols = [];
let tableData = [];
let activeFilters = {};
let hiddenColumns = JSON.parse(localStorage.getItem("dbHiddenCols")) || [];
let customColOrder = [];

const colLabels = {
  vehicle_type: "Vehicle Type",
  site_rate: "Rate",
  plate_no: "Plate No (Key)",
  site_start_date: "Site Start Date",
  site_name: "Site Name",
  site_end_date: "Site End Date",
  site_old_veh: "Old Vehicle No",
  site_new_veh: "New Vehicle No",
  driver_name: "Driver Name",
  driver_end_date: "Last Day",
  vat: "VAT (Yes/No)",
  vat_no: "VAT NO",
  field_co: "Field CO",
  site_co: "Site CO",
  owner_name: "Owner Name",
  owner_mobile: "Owner Mobile",
  company_display_name_: "Company Display Name",
  company_display_name: "Company Display Name",
};

let alertResolver, promptResolver, confirmResolver;
function customAlert(message, title = "Notice") {
  return new Promise((res) => {
    alertResolver = res;
    document.getElementById("alertTitle").innerText = title;
    document.getElementById("alertMessage").innerText = message;
    document.getElementById("alertTitle").style.color =
      title === "Error"
        ? "#dc3545"
        : title === "Warning"
          ? "#f59e0b"
          : title === "Success"
            ? "#198754"
            : "#0f2027";
    document.getElementById("customAlertModal").style.display = "flex";
  });
}
function resolveAlert() {
  document.getElementById("customAlertModal").style.display = "none";
  if (alertResolver) alertResolver();
}
function customPrompt(message, title = "Input Required") {
  return new Promise((res) => {
    promptResolver = res;
    document.getElementById("promptTitle").innerText = title;
    document.getElementById("promptMessage").innerText = message;
    document.getElementById("promptInput").value = "";
    document.getElementById("customPromptModal").style.display = "flex";
    setTimeout(() => document.getElementById("promptInput").focus(), 100);
  });
}
function resolvePrompt(val) {
  document.getElementById("customPromptModal").style.display = "none";
  if (promptResolver) promptResolver(val);
}
function customConfirm(msg) {
  return new Promise((res) => {
    confirmResolver = res;
    document.getElementById("confirmMessage").innerText = msg;
    document.getElementById("customConfirmModal").style.display = "flex";
  });
}
function resolveConfirm(val) {
  document.getElementById("customConfirmModal").style.display = "none";
  if (confirmResolver) confirmResolver(val);
}
function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById("userDropdownMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

function executeLogout() {
  localStorage.removeItem("timesheetToken");
  window.location.reload();
}

async function openAuditLogModal() {
  document.getElementById("userDropdownMenu").style.display = "none";
  document.getElementById("auditLogModal").style.display = "flex";
  document.getElementById("auditLogBody").innerHTML =
    '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';

  try {
    const res = await safeFetch("/timesheet/api/audit-logs", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.success) {
      let html = "";
      res.logs.forEach((l) => {
        let d = new Date(l.timestamp).toLocaleString();
        html += `<tr>
                  <td>${d}</td>
                  <td style="font-weight:600; color:#0d6efd;">${escapeHTML(l.user_info)}</td>
                  <td><span class="status-badge" style="background:#e2e8f0; color:#333;">${escapeHTML(l.action_type)}</span></td>
                  <td>${escapeHTML(l.details)}</td>
                </tr>`;
      });
      document.getElementById("auditLogBody").innerHTML =
        html || '<tr><td colspan="4" style="text-align:center;">No logs found.</td></tr>';
    } else {
      document.getElementById("auditLogBody").innerHTML =
        `<tr><td colspan="4" style="text-align:center; color:red;">${res.message}</td></tr>`;
    }
  } catch (e) {
    document.getElementById("auditLogBody").innerHTML =
      `<tr><td colspan="4" style="text-align:center; color:red;">Failed to fetch logs.</td></tr>`;
  }
}

document.addEventListener("click", function (e) {
  if (
    !e.target.closest("#headerContextMenu") &&
    !e.target.closest("#filterPopup") &&
    !e.target.closest("th")
  ) {
    document.getElementById("headerContextMenu").style.display = "none";
    document.getElementById("filterPopup").style.display = "none";
  }
  if (
    !e.target.closest("#rowContextMenu") &&
    !e.target.closest(".primary-col")
  ) {
    document.getElementById("rowContextMenu").style.display = "none";
  }
  if (
    !e.target.closest(".user-profile-container") &&
    !e.target.closest("#auditLogModal")
  ) {
    document.getElementById("userDropdownMenu").style.display = "none";
  }
});

// Arrow Key Navigation
document.addEventListener("keydown", function (e) {
  const target = e.target;
  if (!target.closest("#dbBody")) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
    let dx = 0,
      dy = 0;
    if (e.key === "ArrowUp") dy = -1;
    else if (e.key === "ArrowDown") dy = 1;
    else if (e.key === "ArrowLeft") dx = -1;
    else if (e.key === "ArrowRight") dx = 1;
    else return;

    if (dy !== 0) {
      e.preventDefault();
    } else if (dx !== 0) {
      if (
        target.tagName === "INPUT" &&
        (target.type === "text" || target.type === "number")
      ) {
        if (dx === -1 && target.selectionStart > 0) return;
        if (dx === 1 && target.selectionEnd < target.value.length) return;
      }
    }
    const currentTd = target.closest("td");
    if (!currentTd) return;
    const currentTr = currentTd.closest("tr");
    const allTrs = Array.from(document.querySelectorAll("#dbBody tr")).filter(
      (tr) => tr.style.display !== "none",
    );
    const currentTrIndex = allTrs.indexOf(currentTr);
    const allTds = Array.from(currentTr.children);
    const currentTdIndex = allTds.indexOf(currentTd);

    let nextTrIndex = currentTrIndex + dy;
    let nextTdIndex = currentTdIndex + dx;

    if (
      nextTrIndex >= 0 &&
      nextTrIndex < allTrs.length &&
      nextTdIndex >= 0 &&
      nextTdIndex < allTds.length
    ) {
      let nextTd = allTrs[nextTrIndex].children[nextTdIndex];
      let nextInput = nextTd.querySelector(
        "input:not([readonly]), select, textarea:not([readonly])",
      );
      while (!nextInput && dx !== 0) {
        nextTdIndex += dx;
        if (nextTdIndex < 0 || nextTdIndex >= allTds.length) break;
        nextTd = allTrs[nextTrIndex].children[nextTdIndex];
        nextInput = nextTd.querySelector(
          "input:not([readonly]), select, textarea:not([readonly])",
        );
      }
      if (nextInput) {
        e.preventDefault();
        nextInput.focus();
        if (
          nextInput.tagName === "INPUT" &&
          (nextInput.type === "text" || nextInput.type === "number")
        )
          nextInput.select();
      }
    }
  }
});

let activeHeaderCol = "";
let activeRowPlate = "";

function openHeaderMenu(e, col) {
  e.preventDefault();
  activeHeaderCol = col;
  document.getElementById("filterPopup").style.display = "none";
  const menu = document.getElementById("headerContextMenu");
  menu.style.display = "flex";
  menu.style.left = e.pageX + "px";
  menu.style.top = e.pageY + "px";

  const unDeletable = [
    "plate_no",
    "site_start_date",
    "site_end_date",
    "driver_end_date",
    "site_rate",
    "site_old_veh",
    "site_new_veh",
    "field_co",
    "site_co",
    "owner_name",
    "owner_mobile",
    "vat_no",
    "company_display_name_",
    "company_display_name",
  ];
  if (userRole !== "Super Admin" || unDeletable.includes(col)) {
    document.getElementById("hcm-delete").style.display = "none";
    document.getElementById("hcm-add-r").style.display = "none";
    document.getElementById("hcm-add-l").style.display = "none";
    if (col === "plate_no" && userRole === "Super Admin")
      document.getElementById("hcm-add-r").style.display = "block";
  } else {
    document.getElementById("hcm-delete").style.display = "block";
    document.getElementById("hcm-add-r").style.display = "block";
    document.getElementById("hcm-add-l").style.display = "block";
  }
}

function openRowMenu(e, plate) {
  e.preventDefault();
  activeRowPlate = plate;
  const menu = document.getElementById("rowContextMenu");
  menu.style.display = "flex";
  menu.style.left = e.pageX + "px";
  menu.style.top = e.pageY + "px";
  document.getElementById("rcm-delete").style.display =
    userRole === "Super Admin" || userRole === "Editor" ? "block" : "none";
}

function syncColumnOrder() {
  let defaultCols = [
    "site_rate",
    "plate_no",
    "site_start_date",
    "site_name",
    "site_end_date",
    "site_old_veh",
    "site_new_veh",
    "field_co",
    "site_co",
    "driver_name",
    "driver_end_date",
  ];
  if (dynamicCols.includes("vehicle_type")) defaultCols.unshift("vehicle_type");
  if (dynamicCols.includes("owner_name")) defaultCols.push("owner_name");
  if (dynamicCols.includes("vat")) defaultCols.push("vat");

  dynamicCols.forEach((c) => {
    if (
      ![
        "vehicle_type",
        "site_name",
        "driver_name",
        "rate",
        "vat",
        "field_co",
        "site_co",
        "owner_name",
      ].includes(c)
    ) {
      defaultCols.push(c);
    }
  });

  let savedOrder = JSON.parse(localStorage.getItem("dbColOrderPref")) || [];
  savedOrder = savedOrder.filter((c) => defaultCols.includes(c));
  defaultCols.forEach((c) => {
    if (!savedOrder.includes(c)) savedOrder.push(c);
  });

  customColOrder = savedOrder;
  localStorage.setItem("dbColOrderPref", JSON.stringify(customColOrder));
}

function hideCurrentColumn() {
  if (activeHeaderCol === "plate_no")
    return customAlert("Warning", "Cannot hide the Plate No column.");
  if (!hiddenColumns.includes(activeHeaderCol)) {
    hiddenColumns.push(activeHeaderCol);
    saveAndApplyHidden();
  }
  document.getElementById("headerContextMenu").style.display = "none";
}
function saveAndApplyHidden() {
  localStorage.setItem("dbHiddenCols", JSON.stringify(hiddenColumns));
  renderTable();
}

function copyColumnData() {
  if (!activeHeaderCol) return;
  const trs = document.getElementById("dbBody").getElementsByTagName("tr");
  let copyString = "";
  tableData.forEach((row, index) => {
    if (trs[index] && trs[index].style.display !== "none") {
      let val = row[activeHeaderCol];
      if (val === null || val === undefined) val = "";
      else val = String(val).replace(/\n/g, " ");
      copyString += val + "\n";
    }
  });
  navigator.clipboard
    .writeText(copyString)
    .then(() => {
      showStatus("✓ Column Copied", "saved");
      document.getElementById("headerContextMenu").style.display = "none";
    })
    .catch(() => customAlert("Error", "Failed to copy data"));
}

function copyTableData() {
  const trs = document.getElementById("dbBody").getElementsByTagName("tr");
  let copyString = "";
  let headerRow = [];
  customColOrder.forEach((colId) => {
    if (!hiddenColumns.includes(colId)) {
      headerRow.push(
        colLabels[colId] || colId.replace(/_/g, " ").toUpperCase(),
      );
    }
  });
  copyString += headerRow.join("\t") + "\n";
  tableData.forEach((row, index) => {
    if (trs[index] && trs[index].style.display !== "none") {
      let rowValues = [];
      customColOrder.forEach((colId) => {
        if (!hiddenColumns.includes(colId)) {
          let val = row[colId];
          if (colId === "vat") {
            let v = String(val || "")
              .trim()
              .toLowerCase();
            val = v === "yes" || v === "true" || v === "15" ? "Yes" : "No";
          } else {
            if (val === null || val === undefined) val = "";
            else val = String(val).replace(/\n/g, " ");
          }
          rowValues.push(val);
        }
      });
      copyString += rowValues.join("\t") + "\n";
    }
  });
  navigator.clipboard
    .writeText(copyString)
    .then(() => {
      showStatus("✓ Table Copied", "saved");
      document.getElementById("headerContextMenu").style.display = "none";
    })
    .catch(() => customAlert("Error", "Failed to copy data"));
}

function openColumnAlter() {
  const list = document.getElementById("columnChecklist");
  list.innerHTML = "";
  customColOrder.forEach((colId) => {
    const isChecked = !hiddenColumns.includes(colId);
    const randId = "alter_" + colId;
    const labelText =
      colLabels[colId] || colId.replace(/_/g, " ").toUpperCase();
    list.insertAdjacentHTML(
      "beforeend",
      `
        <div class="column-item" draggable="true" data-id="${colId}">
          <span class="drag-handle" title="Drag to reorder">☰</span>
          <input type="checkbox" id="${randId}" value="${colId}" ${isChecked ? "checked" : ""} onchange="toggleSingleCol('${colId}', this.checked)">
          <label for="${randId}" style="flex:1;">${escapeHTML(labelText)}</label>
        </div>
      `,
    );
  });
  document.getElementById("columnAlterModal").style.display = "flex";
  setupDragAndDrop();
}

function toggleSingleCol(colId, isVisible) {
  if (isVisible) hiddenColumns = hiddenColumns.filter((c) => c !== colId);
  else {
    if (colId === "plate_no") {
      document.getElementById("alter_plate_no").checked = true;
      return customAlert("Warning", "Cannot hide Plate No.");
    }
    if (!hiddenColumns.includes(colId)) hiddenColumns.push(colId);
  }
  saveAndApplyHidden();
}

function bulkToggleColumns(showAll) {
  if (showAll) hiddenColumns = [];
  else {
    const checkboxes = document.querySelectorAll("#columnChecklist input");
    hiddenColumns = Array.from(checkboxes)
      .map((cb) => cb.value)
      .filter((v) => v !== "plate_no");
  }
  saveAndApplyHidden();
  openColumnAlter();
}

function setupDragAndDrop() {
  const list = document.getElementById("columnChecklist");
  let draggedItem = null;
  list.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("column-item")) {
      draggedItem = e.target;
      setTimeout(() => draggedItem.classList.add("dragging"), 0);
    }
  });
  list.addEventListener("dragend", () => {
    if (draggedItem) {
      draggedItem.classList.remove("dragging");
      draggedItem = null;
      saveColumnOrderFromUI();
    }
  });
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(list, e.clientY);
    const currentObj = document.querySelector(".dragging");
    if (currentObj) {
      if (afterElement == null) list.appendChild(currentObj);
      else list.insertBefore(currentObj, afterElement);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".column-item:not(.dragging)"),
  ];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset)
        return { offset: offset, element: child };
      else return closest;
    },
    { offset: Number.NEGATIVE_INFINITY },
  ).element;
}

function saveColumnOrderFromUI() {
  const items = document.querySelectorAll("#columnChecklist .column-item");
  let newOrder = [];
  items.forEach((item) => {
    newOrder.push(item.getAttribute("data-id"));
  });
  localStorage.setItem("dbColOrderPref", JSON.stringify(newOrder));
  customColOrder = newOrder;
  renderTable();
}

function openAdvancedFilter(e) {
  e.stopPropagation();
  document.getElementById("headerContextMenu").style.display = "none";
  const popup = document.getElementById("filterPopup");
  popup.style.display = "flex";
  let left = e.pageX;
  let top = e.pageY;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
  popup.style.left = left + "px";
  popup.style.top = top + "px";
  document.getElementById("filterSearchInput").value = "";

  const globalSearch = document
    .getElementById("searchInput")
    .value.toUpperCase();

  const uniqueValues = new Set();
  tableData.forEach((row) => {
    let passesOtherFilters = true;

    for (const colName in activeFilters) {
      if (colName === activeHeaderCol) continue;
      const selectedVals = activeFilters[colName];
      let cellVal = row[colName] ? String(row[colName]).trim() : "";
      if (cellVal === "") cellVal = "(Blanks)";
      if (!selectedVals.includes(cellVal)) {
        passesOtherFilters = false;
        break;
      }
    }

    const searchType = document.getElementById("searchType").value;
    if (passesOtherFilters && globalSearch !== "") {
      if (searchType === "plate") {
        const p1 = (row.plate_no || "").toUpperCase();
        const p2 = (row.site_old_veh || "").toUpperCase();
        const p3 = (row.site_new_veh || "").toUpperCase();
        if (
          !p1.includes(globalSearch) &&
          !p2.includes(globalSearch) &&
          !p3.includes(globalSearch)
        ) {
          passesOtherFilters = false;
        }
      } else {
        let rowText = Object.values(row)
          .map((v) => (v ? String(v).toUpperCase() : ""))
          .join(" ");
        if (!rowText.includes(globalSearch)) {
          passesOtherFilters = false;
        }
      }
    }

    if (passesOtherFilters) {
      let val = row[activeHeaderCol];
      if (val === null || val === undefined || String(val).trim() === "")
        uniqueValues.add("(Blanks)");
      else uniqueValues.add(String(val).trim());
    }
  });

  const sortedValues = Array.from(uniqueValues).sort((a, b) => {
    if (a === "(Blanks)") return -1;
    if (b === "(Blanks)") return 1;
    return a.localeCompare(b);
  });
  const listContainer = document.getElementById("filterList");
  listContainer.innerHTML = "";
  let isAllSelected =
    !activeFilters[activeHeaderCol] ||
    activeFilters[activeHeaderCol].length === sortedValues.length;

  listContainer.innerHTML += `<div class="filter-item" style="font-weight:bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;"><input type="checkbox" id="filterSelectAll" onchange="toggleAllFilters(this)" ${isAllSelected ? "checked" : ""}><label for="filterSelectAll" style="font-size: 13px;">(Select All Visible)</label></div>`;
  sortedValues.forEach((val) => {
    let isChecked =
      isAllSelected ||
      (activeFilters[activeHeaderCol] &&
        activeFilters[activeHeaderCol].includes(val));
    let safeVal = escapeHTML(val);
    let randId = "flt_" + Math.random().toString(36).substr(2, 9);
    listContainer.innerHTML += `<div class="filter-item data-item"><input type="checkbox" id="${randId}" class="filter-checkbox" value="${safeVal}" ${isChecked ? "checked" : ""} onchange="checkSelectAll()"><label for="${randId}" title="${safeVal}">${safeVal}</label></div>`;
  });
}

function searchFilterList() {
  const term = document.getElementById("filterSearchInput").value.toLowerCase();
  const items = document.querySelectorAll("#filterList .data-item");
  items.forEach((item) => {
    const label = item.querySelector("label").innerText.toLowerCase();
    item.style.display = label.includes(term) ? "flex" : "none";
  });
}

function toggleAllFilters(source) {
  const checkboxes = document.querySelectorAll("#filterList .filter-checkbox");
  checkboxes.forEach((cb) => {
    if (cb.parentElement.style.display !== "none") cb.checked = source.checked;
  });
}
function checkSelectAll() {
  const total = document.querySelectorAll(
    '#filterList .filter-checkbox:not([style*="display: none"])',
  ).length;
  const checked = document.querySelectorAll(
    "#filterList .filter-checkbox:checked",
  ).length;
  document.getElementById("filterSelectAll").checked =
    total === checked && total > 0;
}
function applyAdvancedFilter() {
  const checkboxes = document.querySelectorAll("#filterList .filter-checkbox");
  const selectedValues = [];
  let allSelected = true;
  checkboxes.forEach((cb) => {
    if (cb.checked) selectedValues.push(cb.value);
    else allSelected = false;
  });
  if (allSelected) delete activeFilters[activeHeaderCol];
  else activeFilters[activeHeaderCol] = selectedValues;
  document.getElementById("filterPopup").style.display = "none";
  renderTable();
}
function clearFilter() {
  delete activeFilters[activeHeaderCol];
  document.getElementById("filterPopup").style.display = "none";
  renderTable();
}

function applyGridFilters() {
  const globalSearch = document
    .getElementById("searchInput")
    .value.toUpperCase();
  const trs = document.getElementById("dbBody").getElementsByTagName("tr");
  if (trs.length === 1 && trs[0].cells.length === 1) return;

  tableData.forEach((row, index) => {
    let showRow = true;
    for (const colName in activeFilters) {
      const selectedVals = activeFilters[colName];
      if (selectedVals.length === 0) continue;
      let cellVal = row[colName] ? String(row[colName]).trim() : "";
      if (cellVal === "") cellVal = "(Blanks)";
      if (!selectedVals.includes(cellVal)) {
        showRow = false;
        break;
      }
    }
    const searchType = document.getElementById("searchType").value;
    if (showRow && globalSearch !== "") {
      if (searchType === "plate") {
        const p1 = (row.plate_no || "").toUpperCase();
        const p2 = (row.site_old_veh || "").toUpperCase();
        const p3 = (row.site_new_veh || "").toUpperCase();
        if (
          !p1.includes(globalSearch) &&
          !p2.includes(globalSearch) &&
          !p3.includes(globalSearch)
        ) {
          showRow = false;
        }
      } else {
        let rowText = Object.values(row)
          .map((v) => (v ? String(v).toUpperCase() : ""))
          .join(" ");
        if (!rowText.includes(globalSearch)) {
          showRow = false;
        }
      }
    }
    if (trs[index]) {
      trs[index].style.display = showRow ? "" : "none";
    }
  });
}

async function addColumnRelative(position) {
  const colName = await customPrompt(
    `Add Column ${position.toUpperCase()}`,
    "Enter new column name:",
  );
  if (!colName) return;
  const cleanCol = colName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const data = await safeFetch("/timesheet/api/db/add-column", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ col_name: colName }),
  });
  if (data.success) {
    dynamicCols.push(cleanCol);
    const relativeIdx = customColOrder.indexOf(activeHeaderCol);
    if (relativeIdx !== -1) {
      if (position === "left") customColOrder.splice(relativeIdx, 0, cleanCol);
      else customColOrder.splice(relativeIdx + 1, 0, cleanCol);
    } else customColOrder.push(cleanCol);
    localStorage.setItem("dbColOrderPref", JSON.stringify(customColOrder));
    initDB();
  } else {
    customAlert("Error", data.message);
  }
}

function headerDelete() {
  manageColumn(activeHeaderCol);
}
function rowDelete() {
  deleteRow(activeRowPlate);
}

async function rowAbout() {
  const plate = activeRowPlate;
  document.getElementById("abtPlateNo").innerText = plate;
  let vObj = tableData.find((x) => x.plate_no === plate);
  let infoHtml = "";
  if (vObj) {
    dynamicCols.forEach((k) => {
      if (vObj[k] && vObj[k] !== "null") {
        let dK = k.replace(/_/g, " ").toUpperCase();
        infoHtml += `<div style="display:flex; border-bottom: 1px solid #f1f5f9; padding: 5px 0;"><span style="color:#64748b; font-weight:600; width:130px; flex-shrink:0;">${escapeHTML(dK)}</span><span style="color:#0f2027; font-weight:600; flex:1; word-break: break-word;">: &nbsp;${escapeHTML(vObj[k])}</span></div>`;
      }
    });
  }
  document.getElementById("abtDetails").innerHTML =
    infoHtml || '<div style="color:#888;">No details available.</div>';
  document.getElementById("abtDriverLogs").innerHTML =
    "<tr><td>Loading...</td></tr>";
  document.getElementById("abtSiteLogs").innerHTML =
    "<tr><td>Loading...</td></tr>";
  document.getElementById("abtRateLogs").innerHTML =
    "<tr><td>Loading...</td></tr>";
  document.getElementById("abtOwnerLogs").innerHTML =
    "<tr><td>Loading...</td></tr>";
  document.getElementById("abtPlateLogs").innerHTML =
    "<tr><td>Loading...</td></tr>";
  document.getElementById("aboutModal").style.display = "flex";

  const res = await safeFetch(`/timesheet/api/vehicle-logs?plate=${plate}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.success) {
    // 1. Driver Logs
    let dlHtml = "";
    (res.drivers || []).forEach((d) => {
      let badge =
        d.status === "Running"
          ? '<span class="status-badge bg-run">RUN</span>'
          : '<span class="status-badge bg-rel">REL</span>';
      let start = d.work_start_date ? d.work_start_date.split("T")[0] : "-";
      let end = d.work_end_date ? d.work_end_date.split("T")[0] : "-";
      dlHtml += `<tr><td><b>${escapeHTML(d.driver_name)}</b><br><span style="font-size:10px;">${escapeHTML(d.driver_mobile || "")}</span></td><td>${start}</td><td>${end}</td><td>${badge}</td></tr>`;

      if (d.reason && d.reason.trim() !== "") {
        dlHtml += `<tr><td colspan="4" style="padding-top:0; border-top:none; font-size:11px; color:#64748b; font-style:italic;">Reason: ${escapeHTML(d.reason)}</td></tr>`;
      }
    });
    document.getElementById("abtDriverLogs").innerHTML =
      (res.drivers && res.drivers.length > 0)
        ? dlHtml
        : '<tr><td colspan="4" style="color:#888;">No logs found.</td></tr>';

    // 2. Site Logs
    let slHtml = "";
    (res.sites || []).forEach((s) => {
      let badge =
        s.status === "Running"
          ? '<span class="status-badge bg-run">RUN</span>'
          : s.status === "Replaced"
            ? '<span class="status-badge bg-rep">REP</span>'
            : '<span class="status-badge bg-rel">REL</span>';
      let start = s.work_start_date ? s.work_start_date.split("T")[0] : "-";
      let end = s.work_end_date ? s.work_end_date.split("T")[0] : "-";
      slHtml += `<tr><td><b>${escapeHTML(s.site_name)}</b><br><span style="font-size:10px; color:#000;">Rate: ${escapeHTML(s.rate || "-")}</span></td><td>${start}</td><td>${end}</td><td>${badge}</td></tr>`;

      if (s.reason && s.reason.trim() !== "") {
        slHtml += `<tr><td colspan="4" style="padding-top:0; border-top:none; font-size:11px; color:#64748b; font-style:italic;">Reason: ${escapeHTML(s.reason)}</td></tr>`;
      }
    });
    document.getElementById("abtSiteLogs").innerHTML =
      (res.sites && res.sites.length > 0)
        ? slHtml
        : '<tr><td colspan="4" style="color:#888;">No logs found.</td></tr>';

    // 3. Rate Variation Logs
    let rlHtml = "";
    (res.rates || []).forEach((r) => {
      let badge =
        r.status === "Running"
          ? '<span class="status-badge bg-run">RUN</span>'
          : '<span class="status-badge bg-rel">REL</span>';
      let start = r.work_start_date ? r.work_start_date.split("T")[0] : "-";
      let end = r.work_end_date ? r.work_end_date.split("T")[0] : "-";
      rlHtml += `<tr><td><b>${escapeHTML(r.site_name || "-")}</b></td><td><b style="color:#10b981;">${escapeHTML(r.rate || "-")}</b></td><td>${start}</td><td>${end}</td><td>${badge}</td></tr>`;
      if (r.reason && r.reason.trim() !== "") {
        rlHtml += `<tr><td colspan="5" style="padding-top:0; border-top:none; font-size:11px; color:#64748b; font-style:italic;">Note: ${escapeHTML(r.reason)}</td></tr>`;
      }
    });
    document.getElementById("abtRateLogs").innerHTML =
      (res.rates && res.rates.length > 0)
        ? rlHtml
        : '<tr><td colspan="5" style="color:#888;">No rate variation logs.</td></tr>';

    // 4. Owner Logs
    let olHtml = "";
    (res.owners || []).forEach((o) => {
      let badge =
        o.status === "Running"
          ? '<span class="status-badge bg-run">RUN</span>'
          : '<span class="status-badge bg-rel">REL</span>';
      let start = o.work_start_date ? o.work_start_date.split("T")[0] : "-";
      let end = o.work_end_date ? o.work_end_date.split("T")[0] : "-";
      olHtml += `<tr><td><b>${escapeHTML(o.owner_name || "-")}</b><br><span style="font-size:10px;">${escapeHTML(o.owner_mobile || "")}</span></td><td>${escapeHTML(o.vat_no || "-")}</td><td>${escapeHTML(o.company_display_name || "-")}</td><td>${start}</td><td>${end}</td><td>${badge}</td></tr>`;
      if (o.reason && o.reason.trim() !== "") {
        olHtml += `<tr><td colspan="6" style="padding-top:0; border-top:none; font-size:11px; color:#64748b; font-style:italic;">Reason: ${escapeHTML(o.reason)}</td></tr>`;
      }
    });
    document.getElementById("abtOwnerLogs").innerHTML =
      (res.owners && res.owners.length > 0)
        ? olHtml
        : '<tr><td colspan="6" style="color:#888;">No owner logs found.</td></tr>';

    // 5. Plate Change Logs
    let plHtml = "";
    (res.plateChanges || []).forEach((p) => {
      let cDate = p.change_date ? p.change_date.split("T")[0] : "-";
      plHtml += `<tr>
        <td><b>${escapeHTML(p.old_plate_no)} ➔ ${escapeHTML(p.new_plate_no)}</b></td>
        <td>${cDate}</td>
        <td><span style="font-size:11px; color:#64748b;">${escapeHTML(p.reason || "-")}</span></td>
      </tr>`;
    });
    document.getElementById("abtPlateLogs").innerHTML =
      (res.plateChanges && res.plateChanges.length > 0)
        ? plHtml
        : '<tr><td colspan="3" style="color:#888;">No plate change logs recorded.</td></tr>';
  }
}

async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("timesheetToken");
      localStorage.removeItem("timesheetUser");
      const currentPage = encodeURIComponent(
        window.location.pathname.split("/").pop() + window.location.search,
      );
      window.location.href = "index.html?redirect=" + currentPage;
      return { success: false, message: "Session expired. Redirecting..." };
    }
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.json();
  } catch (e) {
    throw new Error(e.message);
  }
}

async function initDB() {
  try {
    document.getElementById("errorBanner").style.display = "none";
    const colData = await safeFetch("/timesheet/api/db/columns", {
      headers: { Authorization: "Bearer " + token },
    });
    if (colData.success) {
      dynamicCols = colData.columns;
      syncColumnOrder();
    }

    const [dataJson, logData] = await Promise.all([
      safeFetch("/timesheet/api/db/data", {
        headers: { Authorization: "Bearer " + token },
      }),
      safeFetch("/timesheet/api/all-logs", {
        headers: { Authorization: "Bearer " + token },
      }),
    ]);

    if (dataJson.success) {
      let drivers = logData.success ? logData.drivers : [];
      let sites = logData.success ? logData.sites : [];
      let owners = logData.success ? (logData.owners || []) : [];
      let rates = logData.success ? (logData.rates || []) : [];

      tableData = dataJson.data.map((row) => {
        let dLog = drivers.find((d) => d.plate_no === row.plate_no);
        row.current_driver_status = dLog ? dLog.status : "N/A";
        row.latest_driver_log_id = dLog ? dLog.id : null;
        row.driver_start_date =
          dLog && dLog.start_date !== "-" ? dLog.start_date : "";
        row.driver_end_date =
          dLog && dLog.end_date !== "-" ? dLog.end_date : "";

        let sLog = sites.find((s) => s.plate_no === row.plate_no);
        row.current_site_status = sLog ? sLog.status : "N/A";
        row.latest_site_log_id = sLog ? sLog.id : null;
        row.site_start_date =
          sLog && sLog.start_date !== "-" ? sLog.start_date : "";
        row.site_end_date = sLog && sLog.end_date !== "-" ? sLog.end_date : "";

        // 🟢 ലേറ്റസ്റ്റ് റേറ്റ് കണ്ടെത്തുന്നു: ആദ്യം ആക്ടീവ് Rate Log നോക്കും, ഇല്ലെങ്കിൽ Site Log അല്ലെങ്കിൽ Master
        let curSiteName = (sLog && sLog.site_name) ? sLog.site_name.trim().toUpperCase() : "";
        let rLog = rates.find((r) => {
          let pMatch = (r.plate_no || "").trim().toUpperCase() === (row.plate_no || "").trim().toUpperCase();
          let sMatch = !r.site_name || r.site_name.trim() === "" || r.site_name.trim().toUpperCase() === curSiteName;
          return pMatch && sMatch && r.status === "Running";
        });
        if (!rLog) {
          rLog = rates.find((r) => (r.plate_no || "").trim().toUpperCase() === (row.plate_no || "").trim().toUpperCase() && r.status === "Running");
        }

        function formatCleanRate(val) {
          if (val === null || val === undefined || val === "" || val === "null") return "";
          let num = parseFloat(val);
          if (isNaN(num)) return val;
          return num % 1 !== 0 ? num.toFixed(2) : num.toString();
        }

        if (rLog && rLog.rate) {
          row.site_rate = formatCleanRate(rLog.rate);
        } else {
          row.site_rate = formatCleanRate(sLog && sLog.rate ? sLog.rate : row.rate || "");
        }
        row.site_old_veh =
          sLog && sLog.old_vehicle_no ? sLog.old_vehicle_no : "";
        row.site_new_veh =
          sLog && sLog.new_vehicle_no ? sLog.new_vehicle_no : "";
        row.field_co =
          sLog && sLog.field_co ? sLog.field_co : row.field_co || "";
        row.site_co = sLog && sLog.site_co ? sLog.site_co : row.site_co || "";

        // 🟢 Active Owner Log Mapping
        let oLog = owners.find((o) => o.plate_no === row.plate_no && o.status === "Running");
        if (oLog) {
          row.owner_name = oLog.owner_name || row.owner_name || "";
          row.owner_mobile = oLog.owner_mobile || row.owner_mobile || "";
          row.vat = oLog.vat || row.vat || "No";
          row.vat_no = oLog.vat_no || row.vat_no || "";
          row.company_display_name_ = oLog.company_display_name || row.company_display_name_ || row.company_display_name || "";
          row.company_display_name = row.company_display_name_;
        }

        return row;
      });

      tableData.sort((a, b) => {
        let siteA = (a.site_name || "").toUpperCase();
        let siteB = (b.site_name || "").toUpperCase();
        if (siteA < siteB) return -1;
        if (siteA > siteB) return 1;
        let plateA = (a.plate_no || "").toUpperCase();
        let plateB = (b.plate_no || "").toUpperCase();
        if (plateA < plateB) return -1;
        if (plateA > plateB) return 1;
        return 0;
      });
      renderTable();
      updateGlobalDatalists();
    }
  } catch (err) {
    document.getElementById("errorBanner").style.display = "block";
    document.getElementById("errorBanner").innerText =
      "Notice: Database sync failed (" + (err.message || "Network Error") + "). Please refresh.";
    const dbBody = document.getElementById("dbBody");
    if (dbBody) {
      dbBody.innerHTML = `<tr><td colspan="30" style="padding: 20px; text-align: center; color: #ef4444;">Failed to load database. <a href="javascript:location.reload()" style="color:#2563eb; text-decoration:underline;">Click to Retry</a></td></tr>`;
    }
  }
}

function updateGlobalDatalists() {
  const uniqueSites = [
    ...new Set(tableData.map((r) => r.site_name).filter(Boolean)),
  ].sort();
  const uniqueFieldCos = [
    ...new Set(tableData.map((r) => r.field_co).filter(Boolean)),
  ].sort();
  const uniqueSiteCos = [
    ...new Set(tableData.map((r) => r.site_co).filter(Boolean)),
  ].sort();

  let datalistContainer = document.getElementById("globalDatalists");
  if (!datalistContainer) {
    datalistContainer = document.createElement("div");
    datalistContainer.id = "globalDatalists";
    document.body.appendChild(datalistContainer);
  }

  datalistContainer.innerHTML = `
    <datalist id="globalSiteNameList">${uniqueSites.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="globalFieldCoList">${uniqueFieldCos.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="globalSiteCoList">${uniqueSiteCos.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
  `;
}

async function fastUpdateLog(plate_no, type, field, value, logId) {
  if (!logId) {
    customAlert(
      "Warning",
      "No active log found to update! Please open the log (📝) and create one first.",
    );
    initDB();
    return;
  }
  showStatus("Updating...", "saving");
  try {
    const res = await safeFetch("/timesheet/api/fast-update-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ type, id: logId, plate_no, field, value }),
    });
    if (res.success) {
      showStatus("✓ Saved", "saved");
      initDB();
    } else {
      customAlert("Error", res.message);
      showStatus("Error", "error");
    }
  } catch (e) {
    customAlert("Error", "Network failed");
    showStatus("Error", "error");
  }
}

function renderTable() {
  const thead = document.getElementById("dbHead");
  const tbody = document.getElementById("dbBody");
  const colgroup = document.getElementById("dbColGroup");
  let colgroupHtml = `<col style="width: 50px;">`;
  let headHtml = `<tr><th><div class="col-header" style="justify-content:center; padding-right:10px;"><span>SL</span></div></th>`;

  const addCol = (colId, label, colorStyle = "") => {
    if (hiddenColumns.includes(colId)) return;
    let w = localStorage.getItem(`dbWidth_${colId}`) || "140px";
    colgroupHtml += `<col style="width: ${w};">`;
    let filterIcon = activeFilters[colId]
      ? " <span style='color:#ffc107; font-size:14px;'>⚡</span>"
      : "";
    headHtml += `<th data-col="${colId}" oncontextmenu="openHeaderMenu(event, '${colId}')"><div class="col-header" style="${colorStyle}"><span>${label}${filterIcon}</span></div><div class="resizer"></div></th>`;
  };

  customColOrder.forEach((colId) => {
    if (colId === "vehicle_type") addCol(colId, "VEHICLE TYPE");
    else if (colId === "site_rate")
      addCol(colId, "RATE", "justify-content:center; color:#ffffff;");
    else if (colId === "plate_no") addCol(colId, "PLATE NO (Key)");
    else if (colId === "site_start_date")
      addCol(colId, "SITE START", "justify-content:center; color:#ffffff;");
    else if (colId === "site_name") addCol(colId, "SITE NAME");
    else if (colId === "site_end_date")
      addCol(colId, "SITE END", "justify-content:center; color:#ffffff;");
    else if (colId === "site_old_veh")
      addCol(colId, "OLD", "justify-content:center; color:#f59e0b;");
    else if (colId === "site_new_veh")
      addCol(colId, "NEW", "justify-content:center; color:#3b82f6;");
    else if (colId === "driver_name") addCol(colId, "DRIVER NAME");
    else if (colId === "driver_end_date")
      addCol(colId, "LAST DAY", "justify-content:center; color:#ffffff;");
    else if (colId === "vat")
      addCol(colId, "VAT", "justify-content:center; color:#ffffff;");
    else if (colId === "field_co")
      addCol(colId, "FIELD CO", "justify-content:center; color:#c4b5fd;");
    else if (colId === "site_co")
      addCol(colId, "SITE CO", "justify-content:center; color:#c4b5fd;");
    else if (colId === "owner_name")
      addCol(colId, "OWNER NAME");
    else addCol(colId, colId.replace(/_/g, " ").toUpperCase());
  });
  headHtml += `</tr>`;
  colgroup.innerHTML = colgroupHtml;
  thead.innerHTML = headHtml;
  tbody.innerHTML = "";
  if (tableData.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="30" style="padding: 20px; text-align:center;">No vehicles found.</td></tr>';
    return;
  }

  tableData.forEach((row, index) => {
    let tr = document.createElement("tr");
    let rowHtml = `<td><div style="text-align:center; font-weight:bold; color:#64748b;">${index + 1}</div></td>`;
    const vDStyle =
      "border:none; padding:4px 8px; font-family:Inter; font-size:12px; width:100%; text-align:center; box-sizing:border-box; background:transparent; color: var(--text-main); cursor:pointer;";
    const vTStyle =
      "border:none; padding:5px 10px; font-family:Inter; font-size:13px; width:100%; text-align:center; box-sizing:border-box; background:transparent; color: var(--text-main);";

    const addCell = (colId, htmlContent) => {
      if (hiddenColumns.includes(colId)) return;
      rowHtml += `<td>${htmlContent}</td>`;
    };

    customColOrder.forEach((colId) => {
      if (colId === "vehicle_type") {
        addCell(
          colId,
          `<input type="text" style="${vTStyle}" data-plate="${row.plate_no}" data-col="vehicle_type" value="${escapeHTML(row.vehicle_type)}" onblur="updateCell(this)">`,
        );
      } else if (colId === "site_rate") {
        addCell(
          colId,
          `<input type="number" step="0.01" style="${vTStyle} font-weight:bold;" value="${row.site_rate === "null" || !row.site_rate ? "" : escapeHTML(row.site_rate)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'rate', this.value, ${row.latest_site_log_id})">`,
        );
      } else if (colId === "plate_no") {
        addCell(
          colId,
          `<input type="text" class="primary-col" style="${vTStyle}" value="${escapeHTML(row.plate_no)}" oncontextmenu="openRowMenu(event, '${row.plate_no}')" readonly>`,
        );
      } else if (colId === "site_start_date") {
        let sStartType = row.site_start_date ? "date" : "text";
        addCell(
          colId,
          `<input type="${sStartType}" style="${vDStyle}" value="${escapeHTML(row.site_start_date)}" onfocus="this.type='date'" onblur="if(!this.value) this.type='text'" onchange="fastUpdateLog('${row.plate_no}', 'site', 'start', this.value, ${row.latest_site_log_id})">`,
        );
      } else if (colId === "site_name") {
        addCell(
          colId,
          `<div class="cell-log-wrapper"><input type="text" value="${escapeHTML(row.site_name)}" readonly><button type="button" class="cell-log-btn" onclick="openSiteLog(event, '${row.plate_no}')" title="Site Log" style="border:none; outline:none; background:transparent;">&#x1F4DD;</button></div>`,
        );
      } else if (colId === "site_end_date") {
        if (!row.site_end_date || row.site_end_date === "") {
          addCell(
            colId,
            `<div style="text-align:center; width:100%; padding-top:4px;"><span class="inline-badge" onclick="this.parentElement.innerHTML='<input type=\\'date\\' style=\\'${vDStyle}\\' onblur=\\'fastUpdateLog(&quot;${row.plate_no}&quot;, &quot;site&quot;, &quot;end&quot;, this.value, ${row.latest_site_log_id})\\'>';">RUNNING</span></div>`,
          );
        } else {
          let badgeClass =
            row.current_site_status === "Replaced" ? "bg-rep" : "";
          addCell(
            colId,
            `<div class="date-with-tooltip"><input type="date" style="${vDStyle}" value="${escapeHTML(row.site_end_date)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'end', this.value, ${row.latest_site_log_id})"><span class="tooltip-text ${badgeClass}">${escapeHTML(row.current_site_status).toUpperCase()}</span></div>`,
          );
        }
      } else if (colId === "driver_name") {
        addCell(
          colId,
          `<div class="cell-log-wrapper"><input type="text" value="${escapeHTML(row.driver_name)}" readonly><button type="button" class="cell-log-btn" onclick="openDriverLog(event, '${row.plate_no}')" title="Driver Log" style="border:none; outline:none; background:transparent;">&#x1F4DD;</button></div>`,
        );
      } else if (colId === "driver_end_date") {
        if (!row.driver_end_date || row.driver_end_date === "") {
          addCell(
            colId,
            `<div style="text-align:center; width:100%; padding-top:4px;"><span class="inline-badge" onclick="this.parentElement.innerHTML='<input type=\\'date\\' style=\\'${vDStyle}\\' onblur=\\'fastUpdateLog(&quot;${row.plate_no}&quot;, &quot;driver&quot;, &quot;end&quot;, this.value, ${row.latest_driver_log_id})\\'>';">RUNNING</span></div>`,
          );
        } else {
          addCell(
            colId,
            `<div class="date-with-tooltip"><input type="date" style="${vDStyle}" value="${escapeHTML(row.driver_end_date)}" onchange="fastUpdateLog('${row.plate_no}', 'driver', 'end', this.value, ${row.latest_driver_log_id})"><span class="tooltip-text">${escapeHTML(row.current_driver_status).toUpperCase()}</span></div>`,
          );
        }
      } else if (colId === "owner_name") {
        addCell(
          colId,
          `<div class="cell-log-wrapper"><input type="text" value="${escapeHTML(row.owner_name || "")}" readonly><button type="button" class="cell-log-btn" onclick="openOwnerLog(event, '${row.plate_no}')" title="Owner Log" style="border:none; outline:none; background:transparent;">&#x1F4DD;</button></div>`,
        );
      } else if (colId === "site_old_veh") {
        addCell(
          colId,
          `<input type="text" style="${vTStyle} text-transform:uppercase;" value="${row.site_old_veh === "null" || !row.site_old_veh ? "" : escapeHTML(row.site_old_veh)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'old_veh', this.value, ${row.latest_site_log_id})">`,
        );
      } else if (colId === "site_new_veh") {
        addCell(
          colId,
          `<input type="text" style="${vTStyle} text-transform:uppercase;" value="${row.site_new_veh === "null" || !row.site_new_veh ? "" : escapeHTML(row.site_new_veh)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'new_veh', this.value, ${row.latest_site_log_id})">`,
        );
      } else if (colId === "field_co") {
        addCell(
          colId,
          `<input type="text" style="${vTStyle} text-transform:capitalize;" value="${row.field_co === "null" || !row.field_co ? "" : escapeHTML(row.field_co)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'field_co', toTitleCase(this.value), ${row.latest_site_log_id})">`,
        );
      } else if (colId === "site_co") {
        addCell(
          colId,
          `<input type="text" style="${vTStyle} text-transform:capitalize;" value="${row.site_co === "null" || !row.site_co ? "" : escapeHTML(row.site_co)}" onchange="fastUpdateLog('${row.plate_no}', 'site', 'site_co', toTitleCase(this.value), ${row.latest_site_log_id})">`,
        );
      } else if (colId === "vat") {
        let isVatYes =
          String(row.vat || "")
            .trim()
            .toLowerCase() === "yes" ||
          String(row.vat || "")
            .trim()
            .toLowerCase() === "true" ||
          String(row.vat || "").trim() === "15";
        addCell(
          colId,
          `<select data-plate="${row.plate_no}" data-col="vat" onchange="updateCell(this)" style="${vTStyle} cursor:pointer; color:#0d6efd; font-weight:bold;"><option value="No" ${!isVatYes ? "selected" : ""}>No</option><option value="Yes" ${isVatYes ? "selected" : ""}>Yes</option></select>`,
        );
      } else {
        let val = escapeHTML(row[colId] || "");
        if (
          colId.toLowerCase().includes("invoice_info") ||
          colId.toLowerCase() === "invoice info"
        )
          addCell(
            colId,
            `<textarea data-plate="${row.plate_no}" data-col="${colId}" onblur="updateCell(this)" placeholder="..."> ${val} </textarea>`,
          );
        else
          addCell(
            colId,
            `<input type="text" style="${vTStyle}" data-plate="${row.plate_no}" data-col="${colId}" value="${val}" onblur="updateCell(this)">`,
          );
      }
    });
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
  initColumnResizer();
  applyGridFilters();
}

function initColumnResizer() {
  const cols = document.querySelectorAll("th");
  const colGroup = document
    .getElementById("dbColGroup")
    .querySelectorAll("col");
  cols.forEach((th, index) => {
    const resizer = th.querySelector(".resizer");
    if (!resizer) return;
    let x = 0;
    let w = 0;
    const mouseDownHandler = function (e) {
      x = e.clientX;
      w = parseInt(window.getComputedStyle(colGroup[index]).width, 10);
      document.addEventListener("mousemove", mouseMoveHandler);
      document.addEventListener("mouseup", mouseUpHandler);
      resizer.classList.add("resizing");
    };
    const mouseMoveHandler = function (e) {
      let dx = e.clientX - x;
      let newWidth = Math.max(50, Math.min(500, w + dx));
      colGroup[index].style.width = `${newWidth}px`;
    };
    const mouseUpHandler = function () {
      resizer.classList.remove("resizing");
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
      let colName = th.getAttribute("data-col");
      if (colName)
        localStorage.setItem(`dbWidth_${colName}`, colGroup[index].style.width);
    };
    resizer.addEventListener("mousedown", mouseDownHandler);
  });
}

let toastTimer = null;
function showStatus(msg, type) {
  // 1. Update top bar indicator
  const s = document.getElementById("saveStatus");
  if (s) {
    s.innerText = msg;
    s.className = `save-indicator status-${type}`;
    if (type === "saved" || type === "error") {
      setTimeout(() => {
        s.className = "save-indicator";
      }, 3000);
    }
  }

  // 2. Trigger Bottom-Right Floating Toast
  const t = document.getElementById("toast");
  if (t) {
    if (toastTimer) clearTimeout(toastTimer);
    
    t.innerText = msg;
    let toastTypeClass = type === "saved" ? "toast-success" : (type === "error" ? "toast-error" : "toast-saving");
    t.className = `bottom-toast show ${toastTypeClass}`;
    
    toastTimer = setTimeout(() => {
      t.className = "bottom-toast";
    }, 3000);
  }
}

async function updateCell(inputEl) {
  const plate = inputEl.getAttribute("data-plate");
  const col = inputEl.getAttribute("data-col");
  const val = inputEl.value;
  showStatus("Saving...", "saving");
  try {
    const data = await safeFetch("/timesheet/api/db/update-cell", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ plate_no: plate, col_name: col, value: val }),
    });
    if (data.success) {
      let r = tableData.find((x) => x.plate_no === plate);
      if (r) {
        r[col] = val;
        if (col === "company_display_name_") r.company_display_name = val;
        if (col === "company_display_name") r.company_display_name_ = val;
      }
      showStatus("✓ Saved", "saved");
    } else {
      showStatus("Error", "error");
    }
  } catch (e) {
    showStatus("Error", "error");
  }
}

function deleteRow(plate) {
  customConfirm(`⚠️ WARNING: Permanently delete vehicle ${plate} ?`).then(
    async (sure) => {
      if (!sure) return;
      const data = await safeFetch("/timesheet/api/db/delete-row", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ plate_no: plate }),
      });
      if (data.success) initDB();
    },
  );
}
function manageColumn(colName) {
  customConfirm(
    `Do you want to permanently DELETE column "${colName.toUpperCase()}"? This action cannot be undone.`,
  ).then(async (res) => {
    if (res) {
      const data = await safeFetch("/timesheet/api/db/delete-column", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ col_name: colName }),
      });
      if (data.success) {
        dynamicCols = dynamicCols.filter((c) => c !== colName);
        localStorage.setItem("dbColumnOrder", JSON.stringify(dynamicCols));
        initDB();
      }
    }
  });
}

function openAddVehicleModal() {
  const form = document.getElementById("addVehicleForm");
  form.style.display = "grid";
  form.style.gridTemplateColumns = "repeat(3, 1fr)";
  form.style.gap = "15px";
  form.style.width = "100%";

  const uniqueSites = [
    ...new Set(tableData.map((r) => r.site_name).filter(Boolean)),
  ].sort();
  const uniqueFieldCos = [
    ...new Set(tableData.map((r) => r.field_co).filter(Boolean)),
  ].sort();
  const uniqueSiteCos = [
    ...new Set(tableData.map((r) => r.site_co).filter(Boolean)),
  ].sort();
  const uniqueVehicleTypes = [
    ...new Set(tableData.map((r) => r.vehicle_type).filter(Boolean)),
  ].sort();
  const uniqueOwnerNames = [
    ...new Set(tableData.map((r) => r.owner_name).filter(Boolean)),
  ].sort();

  const wrkOrderCol =
    dynamicCols.find(
      (c) =>
        c.toLowerCase() === "wrk_order_no" ||
        c.toLowerCase() === "work_order_no",
    ) || "wrk_order_no";
  const invoiceCol =
    dynamicCols.find(
      (c) =>
        c.toLowerCase().includes("invoice_info") ||
        c.toLowerCase() === "invoice info",
    ) || "invoice_info";

  let html = `
    <datalist id="siteNameList">${uniqueSites.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="fieldCoList">${uniqueFieldCos.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="siteCoList">${uniqueSiteCos.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="vehicleTypeList">${uniqueVehicleTypes.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    <datalist id="ownerNameList">${uniqueOwnerNames.map((v) => `<option value="${escapeHTML(v)}">`).join("")}</datalist>
    
    <div class="form-group">
        <label style="color:#0f2027;">Plate No (Required)</label>
        <input type="text" id="new_plate_no" class="modal-input uppercase-input" style="border-color: #0d6efd; font-weight:bold; margin-bottom:0;">
    </div>
  `;

  let hasDriver = dynamicCols.includes("driver_name");
  let hasSite = dynamicCols.includes("site_name");

  if (hasSite) {
    html += `
      <div style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 6px; grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; background: #f8fafc;">
        <div class="form-group"><label style="color:#000000;">Site Name</label><input type="text" id="new_site_name" list="siteNameList" class="modal-input" style="margin-bottom:0;"></div>
        <div class="form-group"><label style="color:#000000;">Rate</label><input type="number" step="0.01" id="new_site_rate" class="modal-input" style="margin-bottom:0;"></div>
        <div class="form-group"><label style="color:#000000;">Site Start Date</label><input type="date" id="new_site_start" class="modal-input" style="margin-bottom:0;"></div>
      </div>
    `;
  }

  if (hasDriver) {
    html += `
      <div style="border: 1px dashed #cbd5e1; padding: 12px; border-radius: 6px; grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; background: #f8fafc;">
        <div class="form-group"><label style="color:#2563eb;">Driver Name</label><input type="text" id="new_driver_name" class="modal-input" style="margin-bottom:0;"></div>
        <div class="form-group"><label style="color:#2563eb;">Driver Mobile</label><input type="text" id="new_driver_mobile" class="modal-input" style="margin-bottom:0;"></div>
        <div class="form-group"><label style="color:#2563eb;">Driver Start Date</label><input type="date" id="new_driver_start" class="modal-input" style="margin-bottom:0;"></div>
      </div>
    `;
  }

  // Row: Owner Details
  html += `
    <div class="form-group"><label>Owner Name</label><input type="text" id="new_owner_name" list="ownerNameList" class="modal-input" style="margin-bottom:0;"></div>
    <div class="form-group"><label>Owner Mobile</label><input type="text" id="new_owner_mobile" class="modal-input" style="margin-bottom:0;"></div>
    <div class="form-group"><label>Vehicle Type</label><input type="text" id="new_vehicle_type" list="vehicleTypeList" class="modal-input" style="margin-bottom:0;"></div>
  `;

  // Row: Asset Code | Wrk Order No | VAT
  html += `
    <div class="form-group"><label>Asset Code</label><input type="text" id="new_asset_code" class="modal-input" style="margin-bottom:0;"></div>
    <div class="form-group"><label>Wrk Order No</label><input type="text" id="new_${wrkOrderCol}" class="modal-input" style="margin-bottom:0;"></div>
    <div class="form-group"><label>VAT</label><select id="new_vat" class="modal-input" style="font-weight:bold; color:#0d6efd; cursor:pointer; margin-bottom:0;"><option value="No">No</option><option value="Yes">Yes</option></select></div>
  `;

  // Row: Field CO | Site CO
  html += `
    <div class="form-group"><label style="color:#8b5cf6;">Field CO</label><input type="text" id="new_field_co" list="fieldCoList" class="modal-input titlecase-input" style="margin-bottom:0;"></div>
    <div class="form-group"><label style="color:#8b5cf6;">Site CO</label><input type="text" id="new_site_co" list="siteCoList" class="modal-input titlecase-input" style="margin-bottom:0;"></div>
    <div class="form-group"></div>
  `;

  // Row: Invoice Info
  html += `
    <div class="form-group" style="grid-column: 1 / -1;"><label>Invoice Info</label><textarea id="new_${invoiceCol}" class="modal-input" style="height: 60px; margin-bottom:0;"></textarea></div>
  `;

  dynamicCols.forEach((col) => {
    let safeColName = col.toLowerCase();
    if (
      [
        "driver_name",
        "driver_mobile",
        "site_name",
        "site_rate",
        "rate",
        "field_co",
        "site_co",
        "owner_name",
        "owner_mobile",
        "vehicle_type",
        "asset_code",
        "work_order_no",
        "wrk_order_no",
        "vat",
        "vat_no",
        "company_display_name_",
        "company_display_name",
        "invoice_info",
        "invoice info",
      ].includes(safeColName)
    )
      return;

    let dCol = col.replace(/_/g, " ").toUpperCase();
    html += `<div class="form-group"><label>${escapeHTML(dCol)}</label><input type="text" id="new_${col}" class="modal-input" style="margin-bottom:0;"></div>`;
  });

  form.innerHTML = html;
  document.getElementById("addVehicleModal").style.display = "flex";
  setTimeout(() => document.getElementById("new_plate_no").focus(), 100);
}

async function submitNewVehicle() {
  const plate = document
    .getElementById("new_plate_no")
    .value.trim()
    .toUpperCase();
  if (!plate) return customAlert("Warning", "Plate No is required!");
  const btn = document.getElementById("saveNewVehicleBtn");
  btn.disabled = true;
  btn.innerText = "Saving Vehicle...";

  try {
    const addRes = await safeFetch("/timesheet/api/db/add-row", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ plate_no: plate }),
    });
    if (!addRes.success)
      throw new Error(addRes.message || "Failed to create vehicle row.");

    for (let col of dynamicCols) {
      if (
        [
          "driver_name",
          "driver_mobile",
          "site_name",
          "site_rate",
          "rate",
        ].includes(col.toLowerCase())
      )
        continue;
      let el = document.getElementById(`new_${col}`);
      if (el && el.value.trim() !== "") {
        await safeFetch("/timesheet/api/db/update-cell", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            plate_no: plate,
            col_name: col,
            value: el.value.trim(),
          }),
        });
      }
    }

    // Site & Rate Sync
    if (dynamicCols.includes("site_name")) {
      let sName = document.getElementById("new_site_name").value.trim();
      let sRate = document.getElementById("new_site_rate").value.trim();
      let sStart = document.getElementById("new_site_start").value;
      let fCo = document.getElementById("new_field_co")
        ? document.getElementById("new_field_co").value
        : null;
      let sCo = document.getElementById("new_site_co")
        ? document.getElementById("new_site_co").value
        : null;

      if (sName) {
        await safeFetch("/timesheet/api/update-site-log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            plate_no: plate,
            site_name: sName,
            work_start_date: sStart || null,
            work_end_date: null,
            status: "Running",
            rate: sRate || null,
            old_vehicle_no: null,
            new_vehicle_no: null,
            field_co: fCo,
            site_co: sCo,
          }),
        });

        if (sRate) {
          await safeFetch("/timesheet/api/update-rate-log", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              plate_no: plate,
              site_name: sName,
              rate: sRate,
              work_start_date: sStart || null,
              work_end_date: null,
              status: "Running",
            }),
          });
        }
      }
    }

    // Driver Sync
    if (dynamicCols.includes("driver_name")) {
      let dName = document.getElementById("new_driver_name").value.trim();
      let dMobEl = document.getElementById("new_driver_mobile");
      let dMob = dMobEl ? dMobEl.value.trim() : "";
      let dStart = document.getElementById("new_driver_start").value;
      if (dName || dMob) {
        await safeFetch("/timesheet/api/update-driver-log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            plate_no: plate,
            driver_name: dName,
            driver_mobile: dMob,
            work_start_date: dStart || null,
            work_end_date: null,
          }),
        });
      }
    }

    // Owner Sync
    let oNameEl = document.getElementById("new_owner_name");
    let oMobEl = document.getElementById("new_owner_mobile");
    let oVatEl = document.getElementById("new_vat");
    if (oNameEl && oNameEl.value.trim()) {
      await safeFetch("/timesheet/api/update-owner-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          plate_no: plate,
          owner_name: oNameEl.value.trim(),
          owner_mobile: oMobEl ? oMobEl.value.trim() : "",
          vat: oVatEl ? oVatEl.value : "No",
          vat_no: "",
          company_display_name: "",
          work_start_date: null, // Will automatically fetch earliest site date in backend
          status: "Running",
        }),
      });
    }

    closeModal("addVehicleModal");
    customAlert("Success", "Vehicle and initial logs created successfully!");
    initDB();
  } catch (e) {
    customAlert("Error", e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Save Vehicle";
  }
}

function toggleDlEnd() {
  const val = document.getElementById("dlEnd").value;
  document.getElementById("dlReasonGroup").style.display = val
    ? "block"
    : "none";
}
function toggleSlEnd() {
  const val = document.getElementById("slStatus").value;
  document.getElementById("slEndGroup").style.display =
    val === "Released" || val === "Replaced" ? "block" : "none";
  document.getElementById("slReasonGroup").style.display =
    val === "Released" || val === "Replaced" ? "block" : "none";
}
function toggleOlEnd() {
  const val = document.getElementById("olEnd").value;
  document.getElementById("olReasonGroup").style.display = val ? "block" : "none";
}

function closeLogModals() {
  document.getElementById("driverLogModal").style.display = "none";
  document.getElementById("siteLogModal").style.display = "none";
  document.getElementById("ownerLogModal").style.display = "none";
  document.getElementById("rateLogModal").style.display = "none";
  const pModal = document.getElementById("plateLogModal");
  if (pModal) pModal.style.display = "none";
}

async function openPlateLogModal(e, plate) {
  if (e) e.preventDefault();
  const menu = document.getElementById("rowContextMenu");
  if (menu) menu.style.display = "none";

  const targetPlate = plate || activeRowPlate;
  if (!targetPlate) return;

  document.getElementById("plPlateCurrent").innerText = targetPlate;
  document.getElementById("plOldInput").value = targetPlate;
  document.getElementById("plNewInput").value = "";
  document.getElementById("plDateInput").value = new Date().toISOString().split("T")[0];
  document.getElementById("plReasonInput").value = "";
  document.getElementById("plHistoryBody").innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading logs...</td></tr>';
  document.getElementById("plateLogModal").style.display = "flex";

  try {
    const res = await safeFetch(`/timesheet/api/vehicle-logs?plate=${encodeURIComponent(targetPlate)}`, {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.success && res.plateChanges) {
      let html = "";
      res.plateChanges.forEach((p) => {
        let cDate = p.change_date ? p.change_date.split("T")[0] : "-";
        html += `<tr>
          <td><b>${escapeHTML(p.old_plate_no)} ➔ ${escapeHTML(p.new_plate_no)}</b></td>
          <td>${cDate}</td>
          <td><span style="font-size:11px; color:#475569;">${escapeHTML(p.reason || "-")}</span></td>
          <td><span style="font-size:11px; color:#64748b;">${escapeHTML(p.changed_by || "-")}</span></td>
        </tr>`;
      });
      document.getElementById("plHistoryBody").innerHTML = html || '<tr><td colspan="4" style="color:#888; text-align:center;">No plate changes recorded.</td></tr>';
    }
  } catch (err) {
    document.getElementById("plHistoryBody").innerHTML = '<tr><td colspan="4" style="color:#ef4444; text-align:center;">Failed to load logs.</td></tr>';
  }
}

async function submitPlateChangeFromModal() {
  const oldPlate = document.getElementById("plOldInput").value.trim().toUpperCase();
  const newPlate = document.getElementById("plNewInput").value.trim().toUpperCase();
  const changeDate = document.getElementById("plDateInput").value || new Date().toISOString().split("T")[0];
  const reason = document.getElementById("plReasonInput").value.trim();

  if (!newPlate) {
    return customAlert("Warning", "Please enter a valid new Plate Number.");
  }
  if (oldPlate === newPlate) {
    return customAlert("Warning", "New Plate No cannot be the same as current Plate No.");
  }

  const btn = document.getElementById("plSaveBtn");
  btn.disabled = true;
  btn.innerText = "Applying...";

  showStatus("Updating Plate Across System...", "saving");

  try {
    const res = await safeFetch("/timesheet/api/db/update-plate-no", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        old_plate_no: oldPlate,
        new_plate_no: newPlate,
        change_date: changeDate,
        reason: reason,
      }),
    });

    if (res.success) {
      showStatus("✓ Saved", "saved");
      closeModal("plateLogModal");
      await initDB();
      customAlert("Success", `Plate No successfully updated to ${newPlate} and synced across all tables.`);
    } else {
      showStatus("Error", "error");
      customAlert("Error", res.message || "Failed to update plate number.");
    }
  } catch (e) {
    showStatus("Error", "error");
    customAlert("Error", "Network error occurred.");
  } finally {
    btn.disabled = false;
    btn.innerText = "Apply Plate Change";
  }
}

function clearDriverForm() {
  document.getElementById("dlId").value = "";
  document.getElementById("dlName").value = "";
  document.getElementById("dlMob").value = "";
  document.getElementById("dlStart").value = "";
  document.getElementById("dlEnd").value = "";
  if (document.getElementById("dlReason"))
    document.getElementById("dlReason").value = "";
  document.getElementById("dlSaveBtn").innerText = "Save New Log";
  document.getElementById("dlSaveBtn").className = "btn btn-success";
  toggleDlEnd();
  document.getElementById("dlName").focus();
}
function clearSiteForm() {
  document.getElementById("slId").value = "";
  document.getElementById("slName").value = "";
  document.getElementById("slRate").value = "";
  if (document.getElementById("slVehicleType")) document.getElementById("slVehicleType").value = "";
  document.getElementById("slFieldCo").value = "";
  document.getElementById("slSiteCo").value = "";
  document.getElementById("slOldVehicle").value = "";
  document.getElementById("slNewVehicle").value = "";
  document.getElementById("slAsset").value = "";
  document.getElementById("slWorkOrder").value = "";
  document.getElementById("slStart").value = "";
  document.getElementById("slEnd").value = "";
  document.getElementById("slStatus").value = "Running";
  if (document.getElementById("slReason"))
    document.getElementById("slReason").value = "";
  document.getElementById("slSaveBtn").innerText = "Save New Log";
  document.getElementById("slSaveBtn").className = "btn btn-success";
  toggleSlEnd();
  document.getElementById("slName").focus();
}
function clearOwnerForm() {
  document.getElementById("olId").value = "";
  document.getElementById("olName").value = "";
  document.getElementById("olMob").value = "";
  document.getElementById("olVat").value = "No";
  document.getElementById("olVatNo").value = "";
  document.getElementById("olCompany").value = "";
  document.getElementById("olStart").value = "";
  document.getElementById("olEnd").value = "";
  if (document.getElementById("olReason"))
    document.getElementById("olReason").value = "";
  document.getElementById("olSaveBtn").innerText = "Save New Log";
  document.getElementById("olSaveBtn").className = "btn btn-success";
  toggleOlEnd();
  document.getElementById("olName").focus();
}
function clearRateForm() {
  document.getElementById("rlId").value = "";
  document.getElementById("rlRate").value = "";
  document.getElementById("rlStart").value = "";
  document.getElementById("rlEnd").value = "";
  if (document.getElementById("rlReason"))
    document.getElementById("rlReason").value = "";
  document.getElementById("rlSaveBtn").innerText = "Save New Rate";
  document.getElementById("rlSaveBtn").className = "btn btn-success";
  document.getElementById("rlRate").focus();
}

async function openDriverLog(e, plate) {
  if (!plate) return;
  document.getElementById("dlPlate").innerText = plate;
  clearDriverForm();
  document.getElementById("driverLogModal").style.display = "flex";
  await fetchLogs(plate, "driver");
}
async function openSiteLog(e, plate) {
  if (!plate) return;
  document.getElementById("slPlate").innerText = plate;
  clearSiteForm();
  document.getElementById("siteLogModal").style.display = "flex";
  await fetchLogs(plate, "site");
}
async function openOwnerLog(e, plate) {
  if (!plate) return;
  document.getElementById("olPlate").innerText = plate;
  clearOwnerForm();
  document.getElementById("ownerLogModal").style.display = "flex";
  await fetchLogs(plate, "owner");
}
function openRateLogModal(plate, siteName) {
  if (!plate) return;
  document.getElementById("rlPlate").innerText = plate;
  document.getElementById("rlSite").value = siteName || "";
  clearRateForm();
  document.getElementById("rateLogModal").style.display = "flex";
  fetchLogs(plate, "rate");
}

async function fetchLogs(plate, type) {
  const res = await safeFetch(`/timesheet/api/vehicle-logs?plate=${plate}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.success) {
    if (type === "driver") {
      let dlHtml =
        '<tr><th style="min-width: 120px;">Driver Name</th><th>Mobile No</th><th>Start Date</th><th>End Date</th><th>Status</th><th style="width: 30px;"></th></tr>';
      (res.drivers || []).forEach((d) => {
        let badge =
          d.status === "Running"
            ? '<span class="status-badge bg-run">RUN</span>'
            : '<span class="status-badge bg-rel">REL</span>';
        let start = d.work_start_date ? d.work_start_date.split("T")[0] : "-";
        let end = d.work_end_date ? d.work_end_date.split("T")[0] : "-";
        let delBtnHtml =
          userRole === "Super Admin" || userRole === "Editor"
            ? `<button class="btn-delete-icon" onclick="deleteLogEntry(event, 'driver', ${d.id}, '${plate}')" title="Delete Log">&#x1F5D1;&#xFE0F;</button>`
            : "";
        let escapedReasonD = escapeHTML(d.reason || "").replace(/'/g, "\\'");
        dlHtml += `<tr style="cursor:pointer;" onclick="editDriverLog(${d.id}, '${escapeHTML(d.driver_name)}', '${escapeHTML(d.driver_mobile)}', '${start}', '${end}', '${escapedReasonD}')">
                <td><span style="font-weight:600; color:#0d6efd;">${escapeHTML(d.driver_name)}</span><br><span style="font-size:10px; color:#888;">Tap to edit &#x270E;</span></td>
                <td><span style="font-weight:bold; color:#475569;">${escapeHTML(d.driver_mobile || "-")}</span></td><td>${start}</td><td>${end}</td><td>${badge}</td>
                <td class="action-cell" onclick="event.stopPropagation()">${delBtnHtml}</td></tr>`;
      });
      document.getElementById("dlHistory").innerHTML =
        (res.drivers && res.drivers.length > 0)
          ? dlHtml
          : '<tr><td colspan="6" style="color:#888;">No driver logs found.</td></tr>';

      let masterRow = tableData.find((x) => x.plate_no === plate);
      let activeD = (res.drivers || []).find((d) => d.status === "Running");
      if (activeD)
        editDriverLog(
          activeD.id,
          activeD.driver_name,
          activeD.driver_mobile,
          activeD.work_start_date ? activeD.work_start_date.split("T")[0] : "",
          activeD.work_end_date ? activeD.work_end_date.split("T")[0] : "",
          activeD.reason,
        );
      else if (masterRow && masterRow.driver_name) {
        document.getElementById("dlName").value = masterRow.driver_name;
        document.getElementById("dlMob").value = masterRow.driver_mobile || "";
      }
    }

    if (type === "site") {
      let slHtml =
        '<tr><th style="min-width: 120px;">Site Name</th><th>Rate</th><th>WO No</th><th>Start</th><th>End</th><th>Status</th><th style="width: 30px;"></th></tr>';
      (res.sites || []).forEach((s) => {
        let badge =
          s.status === "Running"
            ? '<span class="status-badge bg-run">RUN</span>'
            : s.status === "Replaced"
              ? '<span class="status-badge bg-rep">REP</span>'
              : '<span class="status-badge bg-rel">REL</span>';
        let start = s.work_start_date ? s.work_start_date.split("T")[0] : "-";
        let end = s.work_end_date ? s.work_end_date.split("T")[0] : "-";
        let delBtnHtml =
          userRole === "Super Admin" || userRole === "Editor"
            ? `<button class="btn-delete-icon" onclick="deleteLogEntry(event, 'site', ${s.id}, '${plate}')" title="Delete Log">&#x1F5D1;&#xFE0F;</button>`
            : "";
        let escapedReasonS = escapeHTML(s.reason || "").replace(/'/g, "\\'");
        slHtml += `<tr style="cursor:pointer;" onclick="editSiteLog(${s.id}, '${escapeHTML(s.site_name)}', '${start}', '${end}', '${s.status}', '${escapeHTML(s.old_vehicle_no)}', '${escapeHTML(s.new_vehicle_no)}', '${escapeHTML(s.asset_code)}', '${escapeHTML(s.work_order_no)}', '${escapeHTML(s.rate)}', '${escapeHTML(s.field_co)}', '${escapeHTML(s.site_co)}', '${escapedReasonS}', '${escapeHTML(s.vehicle_type || "")}')">
                <td><span style="font-weight:600; color:#0d6efd;">${escapeHTML(s.site_name)}</span><br><span style="font-size:10px; color:#888;">Tap to edit &#x270E;</span></td>
                <td><span style="font-weight:bold; color:#000000;">${escapeHTML(s.rate || "-")}</span></td>
                <td><span style="font-weight:bold; color:#475569;">${escapeHTML(s.work_order_no || "-")}</span></td><td>${start}</td><td>${end}</td><td>${badge}</td>
                <td class="action-cell" onclick="event.stopPropagation()">${delBtnHtml}</td></tr>`;
      });
      document.getElementById("slHistory").innerHTML =
        (res.sites && res.sites.length > 0)
          ? slHtml
          : '<tr><td colspan="7" style="color:#888;">No site logs found.</td></tr>';

      let masterRow = tableData.find((x) => x.plate_no === plate);
      let activeS = (res.sites || []).find((s) => s.status === "Running");
      if (!activeS && (res.sites || []).length > 0) {
        activeS = res.sites[0]; // റണ്ണിംഗ് ഇല്ലെങ്കിൽ ഏറ്റവും അവസാനത്തെ ലോഗ് എടുക്കും
      }

      if (activeS) {
        let activeRate = activeS.rate;
        let matchedRate = (res.rates || []).find(r => 
          r.status === 'Running' && 
          (!r.site_name || r.site_name.trim() === '' || r.site_name.trim().toUpperCase() === (activeS.site_name || '').trim().toUpperCase())
        );
        if (matchedRate && matchedRate.rate) {
          activeRate = matchedRate.rate;
        }

        editSiteLog(
          activeS.id,
          activeS.site_name,
          activeS.work_start_date ? activeS.work_start_date.split("T")[0] : "",
          activeS.work_end_date ? activeS.work_end_date.split("T")[0] : "",
          activeS.status,
          activeS.old_vehicle_no,
          activeS.new_vehicle_no,
          activeS.asset_code,
          activeS.work_order_no,
          activeRate,
          activeS.field_co,
          activeS.site_co,
          activeS.reason,
          activeS.vehicle_type,
        );
      }
      else if (masterRow && masterRow.site_name) {
        document.getElementById("slName").value = masterRow.site_name;
      }
    }

    if (type === "owner") {
      let olHtml = `
        <thead>
          <tr>
            <th>Owner Name</th>
            <th>Mobile</th>
            <th style="text-align:center;">VAT</th>
            <th>VAT NO</th>
            <th>Company Name</th>
            <th style="text-align:center;">Start</th>
            <th style="text-align:center;">End</th>
            <th style="text-align:center;">Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
      `;
      (res.owners || []).forEach((o) => {
        let badge =
          o.status === "Running"
            ? '<span class="status-badge bg-run">RUN</span>'
            : '<span class="status-badge bg-rel">REL</span>';
        let start = o.work_start_date ? o.work_start_date.split("T")[0] : "-";
        let end = o.work_end_date ? o.work_end_date.split("T")[0] : "-";
        let delBtnHtml =
          userRole === "Super Admin" || userRole === "Editor"
            ? `<button type="button" class="btn-delete-icon" onclick="deleteLogEntry(event, 'owner', ${o.id}, '${plate}')" title="Delete Log">&#x1F5D1;&#xFE0F;</button>`
            : "";
        let escapedReasonO = escapeHTML(o.reason || "").replace(/'/g, "\\'");
        
        olHtml += `
          <tr style="cursor:pointer;" onclick="editOwnerLog(${o.id}, '${escapeHTML(o.owner_name)}', '${escapeHTML(o.owner_mobile)}', '${escapeHTML(o.vat)}', '${escapeHTML(o.vat_no)}', '${escapeHTML(o.company_display_name)}', '${start}', '${end}', '${escapedReasonO}')">
            <td>
              <span style="font-weight:600; color:#0d6efd;">${escapeHTML(o.owner_name || "-")}</span><br>
              <span style="font-size:10px; color:#888;">Tap to edit &#x270E;</span>
            </td>
            <td style="white-space:nowrap;">${escapeHTML(o.owner_mobile || "-")}</td>
            <td style="text-align:center; font-weight:600;">${escapeHTML(o.vat || "-")}</td>
            <td style="font-weight:600; color:#0f172a; word-break:break-all;">${escapeHTML(o.vat_no || "-")}</td>
            <td style="font-size:11px; line-height:1.3;">${escapeHTML(o.company_display_name || "-")}</td>
            <td style="text-align:center; white-space:nowrap;">${start}</td>
            <td style="text-align:center; white-space:nowrap;">${end}</td>
            <td style="text-align:center;">${badge}</td>
            <td class="action-cell" onclick="event.stopPropagation()">${delBtnHtml}</td>
          </tr>
        `;
      });
      olHtml += `</tbody>`;

      document.getElementById("olHistory").innerHTML =
        (res.owners && res.owners.length > 0)
          ? olHtml
          : '<tr><td colspan="9" style="color:#888; text-align:center; padding:20px;">No owner logs found.</td></tr>';

      let masterRow = tableData.find((x) => x.plate_no === plate);
      let activeO = (res.owners || []).find((o) => o.status === "Running");
      if (activeO) {
        editOwnerLog(
          activeO.id,
          activeO.owner_name,
          activeO.owner_mobile,
          activeO.vat,
          activeO.vat_no,
          activeO.company_display_name,
          activeO.work_start_date ? activeO.work_start_date.split("T")[0] : "",
          activeO.work_end_date ? activeO.work_end_date.split("T")[0] : "",
          activeO.reason,
        );
      } else if (masterRow && masterRow.owner_name) {
        document.getElementById("olName").value = masterRow.owner_name || "";
        document.getElementById("olMob").value = masterRow.owner_mobile || "";
        document.getElementById("olVat").value = (masterRow.vat === "Yes" || masterRow.vat === "true" || masterRow.vat === "15") ? "Yes" : "No";
        document.getElementById("olVatNo").value = masterRow.vat_no || "";
        document.getElementById("olCompany").value = masterRow.company_display_name_ || masterRow.company_display_name || "";
      }
    }

    if (type === "rate") {
      let rlHtml =
        '<tr><th>Site Name</th><th>Rate</th><th>Start Date</th><th>End Date</th><th>Status</th><th style="width: 30px;"></th></tr>';
      (res.rates || []).forEach((r) => {
        let badge =
          r.status === "Running"
            ? '<span class="status-badge bg-run">RUN</span>'
            : '<span class="status-badge bg-rel">REL</span>';
        let start = r.work_start_date ? r.work_start_date.split("T")[0] : "-";
        let end = r.work_end_date ? r.work_end_date.split("T")[0] : "-";
        let delBtnHtml =
          userRole === "Super Admin" || userRole === "Editor"
            ? `<button class="btn-delete-icon" onclick="deleteLogEntry(event, 'rate', ${r.id}, '${plate}')" title="Delete Log">&#x1F5D1;&#xFE0F;</button>`
            : "";
        let escapedReasonR = escapeHTML(r.reason || "").replace(/'/g, "\\'");
        rlHtml += `<tr style="cursor:pointer;" onclick="editRateLog(${r.id}, '${escapeHTML(r.site_name)}', '${r.rate}', '${start}', '${end}', '${escapedReasonR}')">
                <td><b>${escapeHTML(r.site_name)}</b></td>
                <td><b style="color:#10b981;">${escapeHTML(r.rate || "-")}</b></td>
                <td>${start}</td><td>${end}</td><td>${badge}</td>
                <td class="action-cell" onclick="event.stopPropagation()">${delBtnHtml}</td></tr>`;
      });
      document.getElementById("rlHistory").innerHTML =
        (res.rates && res.rates.length > 0)
          ? rlHtml
          : '<tr><td colspan="6" style="color:#888;">No rate logs found.</td></tr>';
    }
  }
}

async function deleteLogEntry(event, type, id, plate) {
  event.stopPropagation();
  const isSure = await customConfirm(
    "Are you sure you want to delete this log entry? This action cannot be undone.",
  );
  if (!isSure) return;
  try {
    const res = await safeFetch("/timesheet/api/delete-log-entry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ type: type, id: id }),
    });
    if (res.success) {
      showStatus("✓ Log Deleted", "saved");
      await initDB();
      if (type === "driver") {
        clearDriverForm();
        await fetchLogs(plate, "driver");
      } else if (type === "site") {
        clearSiteForm();
        await fetchLogs(plate, "site");
      } else if (type === "owner") {
        clearOwnerForm();
        await fetchLogs(plate, "owner");
      } else if (type === "rate") {
        clearRateForm();
        await fetchLogs(plate, "rate");
      }
    } else {
      customAlert(res.message, "Error");
    }
  } catch (e) {
    customAlert("Failed to delete log.", "Error");
  }
}

function editDriverLog(id, name, mob, start, end, reason) {
  document.getElementById("dlId").value = id;
  document.getElementById("dlName").value = name;
  document.getElementById("dlMob").value =
    mob !== "null" && mob !== "undefined" ? mob : "";
  document.getElementById("dlStart").value = start !== "-" ? start : "";
  document.getElementById("dlEnd").value = end !== "-" ? end : "";
  if (document.getElementById("dlReason"))
    document.getElementById("dlReason").value =
      reason !== "null" && reason !== "undefined" ? reason : "";
  toggleDlEnd();
  document.getElementById("dlSaveBtn").innerText = "Update Log";
  document.getElementById("dlSaveBtn").className = "btn btn-primary";
}

async function saveDriverLog() {
  const payload = {
    id: document.getElementById("dlId").value,
    plate_no: document.getElementById("dlPlate").innerText,
    driver_name: document.getElementById("dlName").value,
    driver_mobile: document.getElementById("dlMob").value,
    work_start_date: document.getElementById("dlStart").value,
    work_end_date: document.getElementById("dlEnd").value,
    reason: document.getElementById("dlReason")
      ? document.getElementById("dlReason").value
      : "",
  };

  showStatus("Saving...", "saving");
  try {
    const res = await safeFetch("/timesheet/api/update-driver-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    });

    if (res.success) {
      showStatus("✓ Driver Log Saved", "saved");
      await initDB();
      fetchLogs(payload.plate_no, "driver");
      clearDriverForm();
    } else {
      showStatus("Error", "error");
      customAlert(res.message || "Failed to save driver log.", "Error");
    }
  } catch (e) {
    showStatus("Error", "error");
    customAlert("Network error occurred.", "Error");
  }
}

function editSiteLog(
  id,
  name,
  start,
  end,
  status,
  oldVehicle,
  newVehicle,
  assetCode,
  workOrder,
  rate,
  fieldCo,
  siteCo,
  reason,
  vehicleType,
) {
  document.getElementById("slId").value = id;
  if (document.getElementById("slVehicleType"))
    document.getElementById("slVehicleType").value = vehicleType && vehicleType !== "null" ? vehicleType : "";
  document.getElementById("slName").value = name;
  document.getElementById("slRate").value = rate && rate !== "null" ? rate : "";
  document.getElementById("slFieldCo").value =
    fieldCo && fieldCo !== "null" ? fieldCo : "";
  document.getElementById("slSiteCo").value =
    siteCo && siteCo !== "null" ? siteCo : "";
  document.getElementById("slAsset").value =
    assetCode && assetCode !== "null" ? assetCode : "";
  document.getElementById("slWorkOrder").value =
    workOrder && workOrder !== "null" ? workOrder : "";
  document.getElementById("slStart").value = start !== "-" ? start : "";
  document.getElementById("slEnd").value = end !== "-" ? end : "";
  document.getElementById("slStatus").value = status;
  document.getElementById("slOldVehicle").value =
    oldVehicle && oldVehicle !== "null" ? oldVehicle : "";
  document.getElementById("slNewVehicle").value =
    newVehicle && newVehicle !== "null" ? newVehicle : "";
  if (document.getElementById("slReason"))
    document.getElementById("slReason").value =
      reason && reason !== "null" && reason !== "undefined" ? reason : "";
  toggleSlEnd();
  document.getElementById("slSaveBtn").innerText = "Update Log";
  document.getElementById("slSaveBtn").className = "btn btn-primary";
}

function toTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function saveSiteLog() {
  const payload = {
    id: document.getElementById("slId").value,
    plate_no: document.getElementById("slPlate").innerText,
    site_name: document.getElementById("slName").value,
    rate: document.getElementById("slRate").value,
    field_co: toTitleCase(document.getElementById("slFieldCo").value),
    site_co: toTitleCase(document.getElementById("slSiteCo").value),
    asset_code: document.getElementById("slAsset").value,
    work_order_no: document.getElementById("slWorkOrder").value,
    work_start_date: document.getElementById("slStart").value,
    work_end_date: document.getElementById("slEnd").value,
    status: document.getElementById("slStatus").value,
    old_vehicle_no: document.getElementById("slOldVehicle").value.toUpperCase(),
    new_vehicle_no: document.getElementById("slNewVehicle").value.toUpperCase(),
    reason: document.getElementById("slReason")
      ? document.getElementById("slReason").value
      : "",
    vehicle_type: document.getElementById("slVehicleType")
      ? document.getElementById("slVehicleType").value.trim()
      : "",
  };

  showStatus("Saving...", "saving");
  try {
    const res = await safeFetch("/timesheet/api/update-site-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    });

    if (res.success) {
      showStatus("✓ Site Log Saved", "saved");
      await initDB();
      fetchLogs(payload.plate_no, "site");
      clearSiteForm();
    } else {
      showStatus("Error", "error");
      customAlert(res.message || "Failed to save site log.", "Error");
    }
  } catch (e) {
    showStatus("Error", "error");
    customAlert("Network error occurred.", "Error");
  }
}

// 🟢 Owner Log Functions
function editOwnerLog(id, name, mob, vat, vat_no, comp, start, end, reason) {
  document.getElementById("olId").value = id;
  document.getElementById("olName").value = name !== "null" && name ? name : "";
  document.getElementById("olMob").value = mob !== "null" && mob ? mob : "";
  document.getElementById("olVat").value = (vat === "Yes" || vat === "true" || vat === "15") ? "Yes" : "No";
  document.getElementById("olVatNo").value = vat_no !== "null" && vat_no ? vat_no : "";
  document.getElementById("olCompany").value = comp !== "null" && comp ? comp : "";
  document.getElementById("olStart").value = start !== "-" ? start : "";
  document.getElementById("olEnd").value = end !== "-" ? end : "";
  if (document.getElementById("olReason"))
    document.getElementById("olReason").value = reason !== "null" && reason ? reason : "";
  toggleOlEnd();
  document.getElementById("olSaveBtn").innerText = "Update Log";
  document.getElementById("olSaveBtn").className = "btn btn-primary";
}

async function saveOwnerLog() {
  const payload = {
    id: document.getElementById("olId").value,
    plate_no: document.getElementById("olPlate").innerText,
    owner_name: document.getElementById("olName").value,
    owner_mobile: document.getElementById("olMob").value,
    vat: document.getElementById("olVat").value,
    vat_no: document.getElementById("olVatNo").value,
    company_display_name: document.getElementById("olCompany").value,
    work_start_date: document.getElementById("olStart").value,
    work_end_date: document.getElementById("olEnd").value,
    reason: document.getElementById("olReason")
      ? document.getElementById("olReason").value
      : "",
  };

  showStatus("Saving...", "saving");
  try {
    const res = await safeFetch("/timesheet/api/update-owner-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    });

    if (res.success) {
      showStatus("✓ Owner Log Saved", "saved");
      await initDB();
      fetchLogs(payload.plate_no, "owner");
      clearOwnerForm();
    } else {
      showStatus("Error", "error");
      customAlert(res.message || "Failed to save owner log.", "Error");
    }
  } catch (e) {
    showStatus("Error", "error");
    customAlert("Network error occurred.", "Error");
  }
}

// 🟢 Rate Log Functions
function editRateLog(id, site, rate, start, end, reason) {
  document.getElementById("rlId").value = id;
  document.getElementById("rlSite").value = site;
  document.getElementById("rlRate").value = rate && rate !== "null" ? rate : "";
  document.getElementById("rlStart").value = start !== "-" ? start : "";
  document.getElementById("rlEnd").value = end !== "-" ? end : "";
  if (document.getElementById("rlReason"))
    document.getElementById("rlReason").value = reason !== "null" && reason ? reason : "";
  document.getElementById("rlSaveBtn").innerText = "Update Rate";
  document.getElementById("rlSaveBtn").className = "btn btn-primary";
}

async function saveRateLog() {
  const payload = {
    id: document.getElementById("rlId").value,
    plate_no: document.getElementById("rlPlate").innerText,
    site_name: document.getElementById("rlSite").value,
    rate: document.getElementById("rlRate").value,
    work_start_date: document.getElementById("rlStart").value,
    work_end_date: document.getElementById("rlEnd").value,
    reason: document.getElementById("rlReason")
      ? document.getElementById("rlReason").value
      : "",
  };

  showStatus("Saving...", "saving");
  try {
    const res = await safeFetch("/timesheet/api/update-rate-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    });

    if (res.success) {
      showStatus("✓ Rate Log Saved", "saved");
      await initDB();
      fetchLogs(payload.plate_no, "rate");
      clearRateForm();
    } else {
      showStatus("Error", "error");
      customAlert(res.message || "Failed to save rate log.", "Error");
    }
  } catch (e) {
    showStatus("Error", "error");
    customAlert("Network error occurred.", "Error");
  }
}

function s2ab(s) {
  var buf = new ArrayBuffer(s.length);
  var view = new Uint8Array(buf);
  for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
  return buf;
}

async function exportExcel() {
  var wb = XLSX.utils.book_new();

  // Common UI Styles for Excel
  const headerStyle = {
    fill: { fgColor: { rgb: "1E293B" } },
    font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "medium", color: { rgb: "0F172A" } },
      left: { style: "thin", color: { rgb: "CBD5E1" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } },
    },
  };

  const cellStyleCenter = {
    font: { name: "Calibri", sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E2E8F0" } },
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } },
    },
  };

  const cellStyleLeft = {
    font: { name: "Calibri", sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "E2E8F0" } },
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } },
    },
  };

  // 1. Master DB Sheet
  let ws_data = [];
  let headers = ["Sl No"];
  customColOrder.forEach((colId) => {
    if (hiddenColumns.includes(colId)) return;
    headers.push(colLabels[colId] || colId.replace(/_/g, " ").toUpperCase());
  });
  ws_data.push(headers);

  tableData.forEach((row, idx) => {
    let rowData = [idx + 1];
    customColOrder.forEach((colId) => {
      if (hiddenColumns.includes(colId)) return;
      if (colId === "vat") {
        let v = String(row.vat || "").trim().toLowerCase();
        rowData.push(v === "yes" || v === "true" || v === "15" ? "Yes" : "No");
      } else {
        rowData.push(row[colId] || "");
      }
    });
    ws_data.push(rowData);
  });

  let ws_master = XLSX.utils.aoa_to_sheet(ws_data);
  applySheetDesign(ws_master, headerStyle, cellStyleLeft, cellStyleCenter);
  XLSX.utils.book_append_sheet(wb, ws_master, "Master DB");

  // Fetch all logs from backend
  const logRes = await safeFetch("/timesheet/api/all-logs", {
    headers: { Authorization: "Bearer " + token },
  });

  if (logRes.success) {
    // 2. Driver Logs Sheet
    let dData = [
      ["Plate No", "Driver Name", "Mobile No", "Start Date", "End Date", "Status", "Reason"],
    ];
    (logRes.drivers || []).forEach((d) =>
      dData.push([
        d.plate_no || "",
        d.driver_name || "",
        d.driver_mobile || "",
        d.start_date || "-",
        d.end_date || "-",
        d.status || "",
        d.reason || "",
      ]),
    );
    let ws_driver = XLSX.utils.aoa_to_sheet(dData);
    applySheetDesign(ws_driver, headerStyle, cellStyleLeft, cellStyleCenter);
    XLSX.utils.book_append_sheet(wb, ws_driver, "Driver Logs");

    // 3. Site Logs Sheet
    let sData = [
      [
        "Plate No",
        "Site Name",
        "Rate",
        "Field CO",
        "Site CO",
        "Start Date",
        "End Date",
        "Status",
        "Old Vehicle No",
        "New Vehicle No",
        "Asset Code",
        "Work Order No",
        "Reason",
      ],
    ];
    (logRes.sites || []).forEach((s) =>
      sData.push([
        s.plate_no || "",
        s.site_name || "",
        s.rate || "",
        s.field_co || "",
        s.site_co || "",
        s.start_date || "-",
        s.end_date || "-",
        s.status || "",
        s.old_vehicle_no || "",
        s.new_vehicle_no || "",
        s.asset_code || "",
        s.work_order_no || "",
        s.reason || "",
      ]),
    );
    let ws_site = XLSX.utils.aoa_to_sheet(sData);
    applySheetDesign(ws_site, headerStyle, cellStyleLeft, cellStyleCenter);
    XLSX.utils.book_append_sheet(wb, ws_site, "Site Logs");

    // 4. Rate Logs Sheet (NEW)
    let rData = [
      ["Plate No", "Site Name", "Rate", "Start Date", "End Date", "Status", "Reason / Note"],
    ];
    (logRes.rates || []).forEach((r) =>
      rData.push([
        r.plate_no || "",
        r.site_name || "",
        r.rate || "",
        r.start_date || "-",
        r.end_date || "-",
        r.status || "",
        r.reason || "",
      ]),
    );
    let ws_rate = XLSX.utils.aoa_to_sheet(rData);
    applySheetDesign(ws_rate, headerStyle, cellStyleLeft, cellStyleCenter);
    XLSX.utils.book_append_sheet(wb, ws_rate, "Rate Logs");

    // 5. Owner Logs Sheet (NEW)
    let oData = [
      [
        "Plate No",
        "Owner Name",
        "Owner Mobile",
        "VAT (Yes/No)",
        "VAT NO",
        "Company Display Name",
        "Start Date",
        "End Date",
        "Status",
        "Reason / Note",
      ],
    ];
    (logRes.owners || []).forEach((o) =>
      oData.push([
        o.plate_no || "",
        o.owner_name || "",
        o.owner_mobile || "",
        o.vat || "No",
        o.vat_no || "",
        o.company_display_name || "",
        o.start_date || "-",
        o.end_date || "-",
        o.status || "",
        o.reason || "",
      ]),
    );
    let ws_owner = XLSX.utils.aoa_to_sheet(oData);
    applySheetDesign(ws_owner, headerStyle, cellStyleLeft, cellStyleCenter);
    XLSX.utils.book_append_sheet(wb, ws_owner, "Owner Logs");
  }

  // Generate and download Excel
  var wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
  let blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
  let url = window.URL.createObjectURL(blob);
  let a = document.createElement("a");
  document.body.appendChild(a);
  a.href = url;
  a.download = `Master_Vehicles_DB_Logs.xlsx`;
  a.click();
  document.body.removeChild(a);
}

// Helper Function: Apply First Row Freeze, AutoFilter & UI Styling
function applySheetDesign(ws, headerStyle, cellStyleLeft, cellStyleCenter) {
  if (!ws || !ws["!ref"]) return;

  // 1. AutoFilter for the first row
  ws["!autofilter"] = { ref: ws["!ref"] };

  // 2. Freeze the first row (Header)
  ws["!views"] = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
    },
  ];
  ws["!freeze"] = {
    xSplit: "0",
    ySplit: "1",
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  // 3. Styling Cells & Auto Column Widths
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let colWidths = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxWidth = 12;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell_address = XLSX.utils.encode_cell({ c: C, r: R });
      const cell = ws[cell_address];
      if (!cell) continue;

      let valStr = String(cell.v || "");
      if (valStr.length > maxWidth) maxWidth = Math.min(valStr.length + 3, 35);

      if (R === 0) {
        cell.s = headerStyle;
      } else {
        const isCenterCol = [
          "SL NO", "START DATE", "END DATE", "STATUS", "VAT", "RATE", "LAST DAY", "OLD", "NEW"
        ].some((h) => String(ws[XLSX.utils.encode_cell({ c: C, r: 0 })]?.v || "").toUpperCase().includes(h));

        cell.s = (C === 0 || isCenterCol) ? cellStyleCenter : cellStyleLeft;
      }
    }
    colWidths.push({ wch: Math.max(maxWidth, 12) });
  }

  ws["!cols"] = colWidths;
}

// Helper Function to apply styled borders and headers to any sheet
function applySheetDesign(ws, headerStyle, cellStyleLeft, cellStyleCenter) {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_address = XLSX.utils.encode_cell({ c: C, r: R });
      if (!ws[cell_address]) continue;
      if (R === 0) {
        ws[cell_address].s = headerStyle;
      } else {
        ws[cell_address].s = C === 0 ? cellStyleCenter : cellStyleLeft;
      }
    }
  }
}

async function importExcel() {
  const file = document.getElementById("excelFile").files[0];
  if (!file) return customAlert("Warning", "Please select an Excel file.");
  customConfirm(
    "⚠️ WARNING: This will SYNC your Master DB AND Logs with the Excel file. Any data not in this file will be deleted. Do you want to proceed?",
  ).then((sure) => {
    if (!sure) return;
    showStatus("Uploading...", "saving");
    const reader = new FileReader();
    reader.onload = async function (e) {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      let masterSheetName = workbook.SheetNames.includes("Master DB")
        ? "Master DB"
        : workbook.SheetNames[0];
      const masterRecords = XLSX.utils.sheet_to_json(
        workbook.Sheets[masterSheetName],
        { raw: false },
      );
      let payload = { records: masterRecords };
      if (workbook.SheetNames.includes("Driver Logs"))
        payload.driverLogs = XLSX.utils.sheet_to_json(
          workbook.Sheets["Driver Logs"],
          { raw: false, defval: "" },
        );
      if (workbook.SheetNames.includes("Site Logs"))
        payload.siteLogs = XLSX.utils.sheet_to_json(
          workbook.Sheets["Site Logs"],
          { raw: false, defval: "" },
        );
      try {
        const resData = await safeFetch("/timesheet/api/db/bulk-import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(payload),
        });
        if (resData.success) {
          showStatus("✓ Success", "saved");
          document.getElementById("excelFile").value = "";
          initDB();
        } else {
          customAlert("Error", "Import Failed: " + resData.message);
          showStatus("Error", "error");
        }
      } catch (err) {
        customAlert("Error", "Network Error: " + err.message);
        showStatus("Error", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

initDB();

async function editPlateNo() {
  const oldPlate = activeRowPlate;
  document.getElementById("rowContextMenu").style.display = "none";

  const newPlate = await customPrompt(
    "Edit Plate No",
    `Enter new Plate No for ${oldPlate}:`,
  );

  if (
    !newPlate ||
    newPlate.trim() === "" ||
    newPlate.trim().toUpperCase() === oldPlate.toUpperCase()
  ) {
    return;
  }

  const changeReason = await customPrompt(
    "Reason for Change",
    "Enter reason (e.g., Istimara renewal, Plate replacement):",
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const changeDate = await customPrompt(
    "Effective Change Date (YYYY-MM-DD)",
    `Effective date:`,
  ) || todayStr;

  showStatus("Updating...", "saving");

  try {
    const res = await safeFetch("/timesheet/api/db/update-plate-no", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        old_plate_no: oldPlate,
        new_plate_no: newPlate,
        change_date: changeDate,
        reason: changeReason || ""
      }),
    });

    if (res.success) {
      const finalNewPlate = res.new_plate_no;
      let rowData = tableData.find((x) => x.plate_no === oldPlate);
      if (rowData) {
        rowData.plate_no = finalNewPlate;
      }

      const plateInput = document.querySelector(
        `input.primary-col[value="${oldPlate}"]`,
      );
      if (plateInput) {
        plateInput.value = finalNewPlate;
        plateInput.setAttribute("value", finalNewPlate);
        plateInput.setAttribute(
          "oncontextmenu",
          `openRowMenu(event, '${finalNewPlate}')`,
        );

        const tr = plateInput.closest("tr");
        const elementsWithDataPlate = tr.querySelectorAll("[data-plate]");
        elementsWithDataPlate.forEach((el) => {
          el.setAttribute("data-plate", finalNewPlate);
        });

        const logButtons = tr.querySelectorAll(".cell-log-btn");
        logButtons.forEach((btn) => {
          const currentOnclick = btn.getAttribute("onclick");
          if (currentOnclick) {
            const newOnclick = currentOnclick.replace(
              `'${oldPlate}'`,
              `'${finalNewPlate}'`,
            );
            btn.setAttribute("onclick", newOnclick);
          }
        });

        const inputsWithOnchange = tr.querySelectorAll(
          '[onchange*="fastUpdateLog"]',
        );
        inputsWithOnchange.forEach((input) => {
          const currentOnchange = input.getAttribute("onchange");
          if (currentOnchange) {
            const newOnchange = currentOnchange.replace(
              `'${oldPlate}'`,
              `'${finalNewPlate}'`,
            );
            input.setAttribute("onchange", newOnchange);
          }
        });
      }

      showStatus("✓ Saved", "saved");
      customAlert(
        "Success",
        `Plate No successfully updated from ${oldPlate} to ${finalNewPlate} across all history logs.`,
      );
    } else {
      customAlert("Error", res.message);
      showStatus("Error", "error");
    }
  } catch (e) {
    customAlert("Error", "Failed to update Plate No.");
    showStatus("Error", "error");
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("timesheetTheme", isDark ? "dark" : "light");
  document.getElementById("userDropdownMenu").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("timesheetTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
});