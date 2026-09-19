let currentZoom = 1;
let currentRotation = 0;
let posX = 0,
  posY = 0; // 🟢 New variables for tracking movement
let logsheetFiles = [];
let currentFileIndex = -1;
let currentToken = "";

let isDragging = false;
let startX, startY;

// 1. Open Viewer & Fetch Files
async function openLogsheetViewer(passedPlate = "") {
  let plate = passedPlate;
  const selPlateEl = document.getElementById("selPlate");
  if (!plate && selPlateEl) {
    plate = selPlateEl.value.trim().toUpperCase();
  }

  const month = document.getElementById("selMonth").value;
  const year = document.getElementById("selYear").value;

  if (!plate) {
    customAlert(
      "Please select a Plate Number first to view logsheets.",
      "Notice",
    );
    return;
  }

  // 🟢 3 possible candidate formats check (Old plate, New plate, Arrow format)
  let plateCandidates = [plate];
  let cleanP = plate;
  if (cleanP.includes("➔")) cleanP = cleanP.split("➔").pop().trim();
  else if (cleanP.includes("->")) cleanP = cleanP.split("->").pop().trim();

  try {
    currentToken = localStorage.getItem("timesheetToken");
    const logRes = await fetch(`/timesheet/api/vehicle-logs?plate=${encodeURIComponent(cleanP)}`, {
      headers: { Authorization: "Bearer " + currentToken }
    });
    const logData = await logRes.json();
    if (logData.success && logData.plateChanges && logData.plateChanges.length > 0) {
      logData.plateChanges.forEach(pl => {
        let oP = (pl.old_plate_no || "").trim().toUpperCase();
        let nP = (pl.new_plate_no || "").trim().toUpperCase();
        if (oP && !plateCandidates.includes(oP)) plateCandidates.push(oP);
        if (nP && !plateCandidates.includes(nP)) plateCandidates.push(nP);
        let arrowFormat1 = `${oP} ➔ ${nP}`;
        let arrowFormat2 = `${oP} -> ${nP}`;
        if (!plateCandidates.includes(arrowFormat1)) plateCandidates.push(arrowFormat1);
        if (!plateCandidates.includes(arrowFormat2)) plateCandidates.push(arrowFormat2);
      });
    }
  } catch (e) {
    console.warn("Could not fetch plate logs for folder resolution", e);
  }
  if (!plateCandidates.includes(cleanP)) plateCandidates.push(cleanP);

  const inlineLogsheet = document.getElementById("inlineLogsheet");
  const title = document.getElementById("logsheetTitle");
  const sidebar = document.getElementById("logsheetFileList");
  const viewer = document.getElementById("logsheetViewerContainer");

  title.innerText = `Logsheets - ${plate} (${month} ${year})`;
  sidebar.innerHTML =
    '<div style="text-align:center; padding:20px;">Loading...</div>';
  viewer.innerHTML =
    '<div style="text-align:center; padding: 50px; color:#64748b;">Select a file from the list to view</div>';
  inlineLogsheet.style.display = "flex";

  // 🟢 Enable 3-Column Layout dynamically
  document.body.classList.add("logsheet-open");

  // No need for padding hack anymore since it's inline
  const container = document.querySelector(".container");
  if (container) container.style.paddingRight = "15px";
  if (container) container.style.maxWidth = "100%";

  // initResizers(); // Removed modal left resizer since it's inline now

  // 🟢 Initialize Sidebar and Main Logsheet Resizers
  const sidebarResizer = document.getElementById("sidebarResizer");
  const mainResizer = document.getElementById("logsheetMainResizer");

  let isResizingSidebar = false;
  let isResizingMain = false;

  if (sidebarResizer) {
    sidebarResizer.onmousedown = () => {
      isResizingSidebar = true;
      sidebarResizer.classList.add("active");
    };
  }

  if (mainResizer) {
    mainResizer.onmousedown = (e) => {
      e.preventDefault();
      isResizingMain = true;
      mainResizer.classList.add("active");
      document.body.style.userSelect = "none"; // Prevent text selection while dragging
    };
  }

  document.onmousemove = (e) => {
    if (isResizingSidebar) {
      let inlineRect = inlineLogsheet.getBoundingClientRect();
      let newWidth = e.clientX - inlineRect.left;
      if (newWidth > 150 && newWidth < 400) {
        sidebar.style.width = newWidth + "px";
        sidebar.style.flex = "none";
      }
    }
    if (isResizingMain) {
      // Calculate new width from the right side of the screen
      let newWidth = window.innerWidth - e.clientX - 15; // 15px is the container right padding
      if (newWidth > 350 && newWidth < window.innerWidth - 300) {
        inlineLogsheet.style.width = newWidth + "px";
        inlineLogsheet.style.flex = "none"; // Disable flex-grow so fixed width works
      }
    }
  };

  document.onmouseup = () => {
    if (isResizingSidebar) {
      isResizingSidebar = false;
      if (sidebarResizer) sidebarResizer.classList.remove("active");
    }
    if (isResizingMain) {
      isResizingMain = false;
      if (mainResizer) mainResizer.classList.remove("active");
      document.body.style.userSelect = "auto";
    }
  };

  try {
    currentToken = localStorage.getItem("timesheetToken");
    const reqHeaders = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + currentToken,
    };

    let foundData = null;
    for (let cand of plateCandidates) {
      try {
        const response = await fetch("/timesheet/api/logsheets/list", {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({ month, year, plate_no: cand }),
        });
        const data = await response.json();
        if (data.success && data.files && data.files.length > 0) {
          foundData = data;
          break;
        } else if (data.success && !foundData) {
          foundData = data;
        }
      } catch (err) {}
    }

    const data = foundData || { success: false, message: "No files found." };

    if (!data.success) {
      sidebar.innerHTML = `<div style="color:#ef4444; font-weight:bold; padding:10px;">${data.message}</div>`;
      return;
    }

    if (data.files.length === 0) {
      sidebar.innerHTML = `<div style="padding:10px; color:#64748b; text-align:center;">No files found.</div>`;
      logsheetFiles = [];
      return;
    }

    // Sort files numerically (1, 2, 3...)
    logsheetFiles = data.files.sort((a, b) =>
      a.basename.localeCompare(b.basename, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    // --- NEW ADDITION: Update Title with Count & Empty Files Info ---
    const totalCount = logsheetFiles.length;
    const emptyFiles = logsheetFiles.filter((f) => f.size === 0);
    const emptyCount = emptyFiles.length;

    let updatedTitle = `Logsheets - ${plate} (${month} ${year}) <span style="font-size: 14px; margin-left: 10px; color: #475569;">| Count :: <span style="color: #0ea5e9; font-weight: bold;">${totalCount}</span></span>`;

    if (emptyCount > 0) {
      const emptyNames = emptyFiles.map((f) => f.basename).join("\n");
      updatedTitle += ` <span style="font-size: 14px; color: #475569;">| </span><span style="color: #ef4444; cursor: help; font-weight: bold; font-size: 14px;" title="Empty Files (0B):\n${emptyNames}">E :: ${emptyCount}</span>`;
    }

    title.innerHTML = updatedTitle;
    // ----------------------------------------------------------------

    renderFileList();

    // Auto-load first file
    if (logsheetFiles.length > 0) {
      selectFileIndex(0);
    }
  } catch (error) {
    sidebar.innerHTML = `<div style="color:#ef4444; font-weight:bold; padding:10px;">Connection failed.</div>`;
  }
}

// 2. Render Sidebar List (Updated with Checkboxes, File Size & 0B check, with Select All)
function renderFileList() {
  const sidebar = document.getElementById("logsheetFileList");
  sidebar.innerHTML = "";

  // 🟢 Select All Header ചേർക്കുന്നു
  if (logsheetFiles.length > 0) {
    const selectAllDiv = document.createElement("div");
    selectAllDiv.style.cssText = "padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold; color: #334155; position: sticky; top: 0; z-index: 5;";
    selectAllDiv.innerHTML = `
      <input type="checkbox" id="selectAllLogsheets" style="cursor: pointer; width: 15px; height: 15px;" onchange="toggleSelectAllLogsheets(this.checked)" />
      <label for="selectAllLogsheets" style="cursor: pointer; margin: 0; user-select: none;">Select All</label>
    `;
    sidebar.appendChild(selectAllDiv);
  }

  logsheetFiles.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "logsheet-file-item";
    div.id = `ls-file-${index}`;

    // 0B check
    if (file.size === 0) div.classList.add("empty-file");

    // Added inline styles to prevent word breaking and keep it in a single line
    div.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; overflow:hidden; width:100%;">
        <input type="checkbox" class="ls-checkbox" id="ls-check-${index}" onclick="event.stopPropagation(); updateSelectAllCheckboxState();" style="flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; margin: 0;" />
        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;" title="${file.basename}">${file.basename}</span>
      </div>
    `;

    div.onclick = () => selectFileIndex(index);
    sidebar.appendChild(div);
  });
}

// 🟢 NEW: Select All ഫംഗ്ഷൻ
function toggleSelectAllLogsheets(isChecked) {
  const checkboxes = document.querySelectorAll(".ls-checkbox");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
  });
}

// 🟢 NEW: വ്യക്തിഗത ചെക്ക്ബോക്സുകൾ മാറുമ്പോൾ Select All ചെക്ക്ബോക്സ് സിങ്ക് ചെയ്യുന്നു
function updateSelectAllCheckboxState() {
  const selectAll = document.getElementById("selectAllLogsheets");
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll(".ls-checkbox");
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  selectAll.checked = allChecked;
}

// 🟢 Helper to format file size
function formatBytes(bytes, decimals = 1) {
  if (!+bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function selectFileIndex(index) {
  if (index < 0 || index >= logsheetFiles.length) return;
  currentFileIndex = index;

  // Highlight active
  document
    .querySelectorAll(".logsheet-file-item")
    .forEach((el) => el.classList.remove("active"));
  const activeEl = document.getElementById(`ls-file-${index}`);
  if (activeEl) {
    activeEl.classList.add("active");
    activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const file = logsheetFiles[index];
  loadViewerContent(file.filename, file.mime, currentToken);
}

function closeLogsheetViewer() {
  const inlineLogsheet = document.getElementById("inlineLogsheet");
  inlineLogsheet.style.display = "none";
  inlineLogsheet.style.width = ""; // 🟢 Reset width
  inlineLogsheet.style.flex = "1"; // 🟢 Reset flex
  document.getElementById("logsheetViewerContainer").innerHTML = "";
  logsheetFiles = [];
  currentFileIndex = -1;

  // 🟢 Revert to Default 2-Column Layout
  document.body.classList.remove("logsheet-open");
  const container = document.querySelector(".container");
  if (container) container.style.maxWidth = "1620px";
}

// 🟢 3. Load Viewer Content (With rotation support)
function loadViewerContent(filePath, mimeType, token) {
  const viewer = document.getElementById("logsheetViewerContainer");
  viewer.innerHTML =
    '<div style="text-align:center; padding:20px; font-weight:bold; color:#8b5cf6;">Loading File...</div>';

  currentZoom = 1;
  currentRotation = 0;
  posX = 0;
  posY = 0;

  const activeToken = localStorage.getItem("timesheetToken");
  const reqHeaders = { Authorization: "Bearer " + activeToken };

  fetch(`/timesheet/api/logsheets/file?path=${encodeURIComponent(filePath)}`, {
    headers: reqHeaders,
  })
    .then((res) => {
      if (!res.ok) throw new Error("File fetch failed");
      return res.blob();
    })
    .then(async (blob) => {
      if (mimeType.includes("pdf")) {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

          viewer.innerHTML = `
            <div class="image-zoom-wrapper" id="imgWrapper" style="overflow: hidden;">
              <div id="zoomContent" style="display: flex; flex-direction: column; gap: 20px; align-items: center; transition: transform 0.1s ease-out; padding: 20px;">
              </div>
            </div>
            <div class="zoom-controls">
              <button class="zoom-btn" onclick="adjustZoom(-0.2)" title="Zoom Out">➖</button>
              <button class="zoom-btn" onclick="resetZoomRotate()" title="Reset">🔄</button>
              <button class="zoom-btn" onclick="adjustZoom(0.2)" title="Zoom In">➕</button>
              <button class="zoom-btn" onclick="rotateImage()" title="Rotate" style="color:#f59e0b;">⟳</button>
            </div>
          `;

          const zoomContent = document.getElementById("zoomContent");

          // Loop through all pages in the PDF
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.maxWidth = "100%";
            canvas.style.height = "auto";
            canvas.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)"; // Page separation shadow
            canvas.style.backgroundColor = "#fff";

            const ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport: viewport })
              .promise;

            zoomContent.appendChild(canvas);
          }

          applyTransform();
          attachMouseEvents();
        } catch (pdfErr) {
          viewer.innerHTML = `<div style="color:#ef4444; font-weight:bold; padding:20px; text-align:center;">Failed to render PDF preview.</div>`;
        }
      } else {
        const fileURL = URL.createObjectURL(blob);
        viewer.innerHTML = `
          <div class="image-zoom-wrapper" id="imgWrapper" style="overflow: hidden;">
            <div id="zoomContent" style="display: flex; justify-content: center; align-items: center; transition: transform 0.1s ease-out;">
              <!-- 🟢 decoding="async" UI ബ്ലോക്ക് ആകാതെ ഇമേജ് വേഗത്തിൽ ലോഡ് ചെയ്യാൻ സഹായിക്കുന്നു. image-rendering ഒറിജിനൽ കോൺട്രാസ്റ്റ് നിലനിർത്തുന്നു -->
              <img src="${fileURL}" decoding="async" draggable="false" style="max-width: 100%; max-height: 100%; object-fit: contain; transition: transform 0.2s ease-out; image-rendering: -webkit-optimize-contrast;" alt="Logsheet" />
            </div>
          </div>
          <div class="zoom-controls">
            <button class="zoom-btn" onclick="adjustZoom(-0.2)" title="Zoom Out">➖</button>
            <button class="zoom-btn" onclick="resetZoomRotate()" title="Reset">🔄</button>
            <button class="zoom-btn" onclick="adjustZoom(0.2)" title="Zoom In">➕</button>
            <button class="zoom-btn" onclick="rotateImage()" title="Rotate" style="color:#f59e0b;">⟳</button>
          </div>
        `;
        applyTransform();
        attachMouseEvents();
      }
    })
    .catch((err) => {
      viewer.innerHTML = `<div style="color:#ef4444; font-weight:bold; padding:20px; text-align:center;">Failed to load file.</div>`;
    });
}

// 🟢 4. Zoom & Rotation Logic
function adjustZoom(amount) {
  currentZoom += amount;
  if (currentZoom < 0.2) currentZoom = 0.2; // Min zoom
  if (currentZoom > 10) currentZoom = 10; // Max zoom
  applyTransform();
}

function rotateImage() {
  currentRotation += 90;
  if (currentRotation >= 360) currentRotation = 0;
  applyTransform();
}

function resetZoomRotate() {
  currentZoom = 1;
  currentRotation = 0;
  posX = 0; // 🟢 Reset position X
  posY = 0; // 🟢 Reset position Y
  applyTransform();
}

function applyTransform() {
  const content = document.getElementById("zoomContent");
  if (!content) return;

  // 1. Zoom (Scale) & Pan (Translate) കണ്ടെയ്നറിന് കൊടുക്കുന്നു
  content.style.transform = `translate(${posX}px, ${posY}px) scale(${currentZoom})`;

  // 2. Rotation ഓരോ പേജുകൾക്കും (Children) പ്രത്യേകം കൊടുക്കുന്നു
  const children = content.children;
  for (let i = 0; i < children.length; i++) {
    children[i].style.transform = `rotate(${currentRotation}deg)`;
    children[i].style.transition = "transform 0.2s ease-out";

    // 90 ദിവ്രിയോ 270 ഡിഗ്രിയോ റൊട്ടേറ്റ് ചെയ്യുമ്പോൾ പേജുകൾ തമ്മിൽ കൂട്ടിമുട്ടാതിരിക്കാൻ ചെറിയ ഗ്യാപ്പ് കൊടുക്കുന്നു
    if (currentRotation % 180 !== 0) {
      children[i].style.margin = "10% 0";
    } else {
      children[i].style.margin = "0";
    }
  }
}
// 🟢 5. Mouse Wheel & Drag-to-Pan Events
function attachMouseEvents() {
  const wrapper = document.getElementById("imgWrapper");
  if (!wrapper) return;

  // Mouse Wheel to Zoom
  wrapper.onwheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      adjustZoom(0.2); // Scroll Up = Zoom In
    } else {
      adjustZoom(-0.2); // Scroll Down = Zoom Out
    }
  };

  // Drag to Pan using Translate X/Y
  wrapper.onmousedown = (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX - posX;
    startY = e.clientY - posY;
    wrapper.style.cursor = "grabbing";
  };

  wrapper.onmouseleave = () => {
    isDragging = false;
    wrapper.style.cursor = "grab";
  };

  wrapper.onmouseup = () => {
    isDragging = false;
    wrapper.style.cursor = "grab";
  };

  wrapper.onmousemove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    posX = e.clientX - startX;
    posY = e.clientY - startY;
    applyTransform();
  };
}

// 🟢 6. Keyboard Navigation (Left/Right Arrows)
document.addEventListener("keydown", (e) => {
  const inlineLogsheet = document.getElementById("inlineLogsheet");
  if (!inlineLogsheet || inlineLogsheet.style.display === "none") return;

  // Ignore if typing in input/textarea on the grid
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    selectFileIndex(currentFileIndex + 1);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    selectFileIndex(currentFileIndex - 1);
  }
});

async function generatePdfFromFiles(
  filesArray,
  pdfFilename,
  btnElement,
  originalBtnText,
) {
  if (!filesArray.length) {
    customAlert("No valid files selected for PDF.", "Notice");
    return;
  }

  btnElement.disabled = true;
  btnElement.innerHTML = `Processing...`;

  try {
    const pdfLibObj = window.PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);
    if (!pdfLibObj || !pdfLibObj.PDFDocument) {
      throw new Error("PDF-Lib library not loaded. Please verify /node_xlsx_scripts/pdf-lib.min.js");
    }

    const { PDFDocument } = pdfLibObj;
    const jsPdfLib = window.jspdf ? (window.jspdf.jsPDF || window.jspdf) : (typeof jsPDF !== "undefined" ? jsPDF : null);
    if (!jsPdfLib) {
      throw new Error("jsPDF library not loaded. Please verify /node_xlsx_scripts/jspdf.umd.min.js");
    }
    const jsPDF = jsPdfLib;

    // ഇമേജുകൾ ചേർക്കാൻ ഒരു താൽക്കാലിക മാസ്റ്റർ PDF ഉണ്ടാക്കുന്നു
    const mergedPdf = await PDFDocument.create();
    const activeToken = localStorage.getItem("timesheetToken");
    const reqHeaders = { Authorization: "Bearer " + activeToken };

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const res = await fetch(
        `/timesheet/api/logsheets/file?path=${encodeURIComponent(file.filename)}`,
        { headers: reqHeaders },
      );
      if (!res.ok) continue;

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      if (file.mime && file.mime.includes("pdf")) {
        // ഇതോരു PDF ആണെങ്കിൽ, നേരിട്ട് പേജുകൾ കോപ്പി ചെയ്ത് ലയിപ്പിക്കുന്നു
        const existingPdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(
          existingPdf,
          existingPdf.getPageIndices(),
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else {
        // ഇമേജ് ആണെങ്കിൽ അതിനെ ക്യാൻവാസ് വഴി റീഡ് ചെയ്ത് PDF പേജാക്കി മാറ്റുന്നു
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const singleImgPdf = new jsPDF({
          orientation: bitmap.width > bitmap.height ? "l" : "p",
          unit: "mm",
          format: [bitmap.width * 0.264583, bitmap.height * 0.264583],
        });
        singleImgPdf.addImage(
          imgData,
          "JPEG",
          0,
          0,
          bitmap.width * 0.264583,
          bitmap.height * 0.264583,
          undefined,
          "FAST",
        );

        const singlePdfBytes = singleImgPdf.output("arraybuffer");
        const tempPdf = await PDFDocument.load(singlePdfBytes);
        const [copiedPage] = await mergedPdf.copyPages(tempPdf, [0]);
        mergedPdf.addPage(copiedPage);
      }
    }

    const pdfBytes = await mergedPdf.save();
    const blobOutput = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blobOutput);
    link.download = pdfFilename;
    link.click();
  } catch (e) {
    console.error("PDF Merge Error:", e);
    customAlert("Failed to generate combined PDF.", "Error");
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalBtnText;
  }
}

// ✅ 1. Download ALL as PDF
async function downloadAllAsPdf() {
  const btn = document.getElementById("btnDownloadPdf");
  const imageFiles = logsheetFiles.filter(
    (f) =>
      f.mime &&
      (f.mime.includes("image") || f.mime.includes("pdf")) &&
      f.size > 0,
  );

  const plate = document
    .getElementById("logsheetTitle")
    .innerText.split("|")[0]
    .replace("Logsheets - ", "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  await generatePdfFromFiles(imageFiles, `${plate}.pdf`, btn, "PDF");
}

// ✅ 2. Download SELECTED as PDF
async function downloadSelectedAsPdf() {
  const btn = document.getElementById("btnDownloadSelected");
  const checkboxes = document.querySelectorAll(".ls-checkbox");
  const selectedFiles = [];

  checkboxes.forEach((cb, index) => {
    if (
      cb.checked &&
      logsheetFiles[index].mime &&
      (logsheetFiles[index].mime.includes("image") ||
        logsheetFiles[index].mime.includes("pdf")) &&
      logsheetFiles[index].size > 0
    ) {
      selectedFiles.push(logsheetFiles[index]);
    }
  });

  if (selectedFiles.length === 0) {
    customAlert("Please select at least one valid image file first.", "Notice");
    return;
  }

  const plate = document
    .getElementById("logsheetTitle")
    .innerText.split("|")[0]
    .replace("Logsheets - ", "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  await generatePdfFromFiles(
    selectedFiles,
    `${plate}.pdf`,
    btn,
    "📑 Selected",
  );
}

// ✅ 3. Download CURRENT Image directly
async function downloadCurrentImage() {
  if (currentFileIndex === -1 || !logsheetFiles[currentFileIndex]) {
    customAlert("No image is currently being viewed.", "Notice");
    return;
  }

  const file = logsheetFiles[currentFileIndex];
  const btn = document.getElementById("btnDownloadCurrent");
  btn.disabled = true;
  btn.innerText = "Wait...";

  try {
    const activeToken = localStorage.getItem("timesheetToken");
    const reqHeaders = {
      Authorization: "Bearer " + activeToken,
    };

    const res = await fetch(
      `/timesheet/api/logsheets/file?path=${encodeURIComponent(file.filename)}`,
      { headers: reqHeaders },
    );

    if (!res.ok) throw new Error("Fetch failed");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = file.basename;
    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (error) {
    console.error("Download Error:", error);
    customAlert("Failed to download current image.", "Error");
  } finally {
    btn.disabled = false;
    btn.innerText = "⬇ Current";
  }
}
