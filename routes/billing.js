const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const ExcelJS = require("exceljs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET;

function getCompanyFromSite(siteName, fallback = "Haka") {
  if (!siteName) return fallback;
  let s = siteName.toUpperCase().replace(/[\s\-_]/g, "");
  if (s.includes("ALJODA")) return "Aljoda";
  if (s.includes("MASARWHEELS") || s.includes("MASAR")) return "Masar Wheels";
  if (s.includes("WE1TRACK") || s.includes("WE1") || s.includes("WETRACK")) return "We1 Track";
  if (s.includes("HAKA")) return "Haka";
  return fallback;
}

function calculateLogHours(records, monthIndex, year, siteName, specialRules) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const normalizedSite = String(siteName || "").split("&")[0].trim().toUpperCase();
  let nhr = 0;
  let othr = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const record = records.find((item) => parseInt(item.record_date, 10) === day);
    const workHours = record ? parseFloat(record.calc_time) || 0 : 0;
    let status = record ? String(record.bd || "").trim().toUpperCase() : "";
    const formattedDate = new Date(year, monthIndex, day)
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const specialRule = specialRules.find(
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

const verifyBillingEditor = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "No token provided. Access Denied." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const allowedRoles = ["Super Admin", "Admin", "User"];

    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Viewers cannot access billing.",
      });
    }
    req.user = decoded;
    next();
  } catch (e) {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired session" });
  }
};

router.get("/dashboard", (req, res) => {
  res.sendFile("Billing/Vendor_bill_summary_Dashboard.html", {
    root: "./public",
  });
});

router.use(verifyBillingEditor);

router.get("/verify-session", (req, res) => {
  res.status(200).json({ success: true, message: "Session is valid" });
});

// 1. Fetch Vehicle Data (100% FIXED: RELEASED VEHICLES, MULTIPLE SITES, MONTH-WISE RATE & OWNER LOGS + PLATE CHANGE LOGS)
router.get("/vehicles", async (req, res) => {
  try {
    const { month } = req.query;

    // Fetch Timesheet DB & All Logs
    const tsVehiclesResult = await pool.query(
      "SELECT * FROM timesheet_vehicles",
    );
    const driverLogs = await pool.query(
      "SELECT plate_no, driver_name, work_start_date, work_end_date FROM vehicle_driver_log",
    );
    const siteLogs = await pool.query(
      "SELECT plate_no, site_name, rate, work_start_date, work_end_date, vehicle_type FROM vehicle_site_log",
    );
    const rateLogs = await pool.query(
      "SELECT plate_no, site_name, rate, work_start_date, work_end_date FROM vehicle_rate_log",
    );
    const ownerLogs = await pool.query(
      "SELECT plate_no, owner_name, owner_mobile, vat, work_start_date, work_end_date FROM vehicle_owner_log",
    );
    const plateLogs = await pool.query(
      "SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC",
    );

    let savedResult = { rows: [] };
    let timesheetRows = [];
    let invoiceRows = [];
    let specialRules = [];
    let targetStart, targetEnd;
    let targetMonthIdx = -1, targetYearNum = 0;

    if (month && month !== "All") {
      const savedQuery = `SELECT * FROM billing_records WHERE billing_month = $1`;
      savedResult = await pool.query(savedQuery, [month]);

      const [mName, yStr] = month.trim().split(" ");
      const monthNames = [
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
      const mIdx = monthNames.indexOf(mName);

      if (mIdx !== -1 && yStr) {
        targetYearNum = parseInt(yStr);
        targetMonthIdx = mIdx;
        targetStart = new Date(targetYearNum, mIdx, 1);
        targetEnd = new Date(targetYearNum, mIdx + 1, 0);

        const [timesheetsResult, invoicesResult, specialRulesResult] = await Promise.all([
          pool.query(
            "SELECT plate_no, record_date, calc_time, bd FROM timesheet_daily_records WHERE month = $1 AND year = $2",
            [mName, yStr],
          ),
          pool.query(
            "SELECT plate_no, site_name, bill_nr, bill_ot FROM invoice_records WHERE month = $1",
            [month],
          ),
          pool.query(
            "SELECT sites, dates, rule_type FROM special_days_rules WHERE is_active = true",
          ),
        ]);
        timesheetRows = timesheetsResult.rows;
        invoiceRows = invoicesResult.rows;
        specialRules = specialRulesResult.rows;
      }
    }

    let validVehicles = [];
    let processedPlates = new Set();

    tsVehiclesResult.rows.forEach((tsItem) => {
      let masterPlate = (tsItem.plate_no || "").toUpperCase().trim();
      if (!masterPlate || processedPlates.has(masterPlate)) return;
      processedPlates.add(masterPlate);

      // 🟢 ആ മാസത്തിൽ വാഹനം ഉപയോഗിച്ച യഥാർത്ഥ പ്ലേറ്റ് നമ്പർ നിർണ്ണയിക്കുന്നു
      let effectivePlate = masterPlate;
      let relatedPlates = [masterPlate];

      let vPlateChanges = plateLogs.rows.filter(
        (pl) =>
          (pl.old_plate_no || "").trim().toUpperCase() === masterPlate ||
          (pl.new_plate_no || "").trim().toUpperCase() === masterPlate
      );

      vPlateChanges.forEach((pl) => {
        let op = (pl.old_plate_no || "").trim().toUpperCase();
        let np = (pl.new_plate_no || "").trim().toUpperCase();
        if (op && !relatedPlates.includes(op)) relatedPlates.push(op);
        if (np && !relatedPlates.includes(np)) relatedPlates.push(np);
      });

      if (targetStart && targetEnd && vPlateChanges.length > 0) {
        for (let pl of vPlateChanges) {
          if (!pl.change_date) continue;
          let [cYear, cMonth, cDay] = pl.change_date.split("-").map(Number);
          let cDate = new Date(cYear, cMonth - 1, cDay);

          if (cYear === targetYearNum && (cMonth - 1) === targetMonthIdx) {
            effectivePlate = `${pl.old_plate_no.trim().toUpperCase()} ➔ ${pl.new_plate_no.trim().toUpperCase()}`;
          } else if (targetEnd < cDate) {
            effectivePlate = pl.old_plate_no.trim().toUpperCase();
          } else if (targetStart >= cDate) {
            effectivePlate = pl.new_plate_no.trim().toUpperCase();
          }
        }
      }

      let plate = masterPlate;

      let correctDriver = (tsItem.driver_name || "").trim();
      let correctOwner = (tsItem.owner_name || tsItem.owner || "").trim();
      let correctOwnerMobile = (tsItem.owner_mobile || "").trim();
      let correctVat = String(tsItem.vat || tsItem.vat_bill || tsItem["vat (yes/no)"] || "No").trim();

      if (targetStart && targetEnd) {
        // --- DRIVER LOGIC (Related plates ഉൾപ്പെടെ പരിശോധിക്കുന്നു) ---
        let dLogs = driverLogs.rows.filter(
          (l) => relatedPlates.includes((l.plate_no || "").trim().toUpperCase()),
        );
        let validDLogs = dLogs.filter((l) => {
          let st = l.work_start_date
            ? new Date(l.work_start_date)
            : new Date("2000-01-01");
          let ed = l.work_end_date
            ? new Date(l.work_end_date)
            : new Date("2099-01-01");
          return st <= targetEnd && ed >= targetStart;
        });

        if (validDLogs.length > 0) {
          validDLogs.sort(
            (a, b) =>
              new Date(a.work_start_date || "2000-01-01") -
              new Date(b.work_start_date || "2000-01-01"),
          );
          let driverNames = validDLogs
            .map((l) => l.driver_name)
            .filter(Boolean);
          correctDriver = [...new Set(driverNames)].join(" / ");
        } else if (!correctDriver) {
          correctDriver = (tsItem.driver_name || tsItem.driver || "N/A").trim();
        }

        // --- OWNER LOGIC (Month-wise lookup from vehicle_owner_log) ---
        let oLogs = ownerLogs.rows.filter(
          (l) => (l.plate_no || "").toUpperCase() === plate,
        );
        let validOLogs = oLogs.filter((l) => {
          let st = l.work_start_date
            ? new Date(l.work_start_date)
            : new Date("2000-01-01");
          let ed = l.work_end_date
            ? new Date(l.work_end_date)
            : new Date("2099-01-01");
          return st <= targetEnd && ed >= targetStart;
        });

        if (validOLogs.length > 0) {
          validOLogs.sort(
            (a, b) =>
              new Date(b.work_start_date || "2000-01-01") -
              new Date(a.work_start_date || "2000-01-01"),
          );
          let activeOwnerLog = validOLogs[0];
          if (activeOwnerLog.owner_name) correctOwner = activeOwnerLog.owner_name.trim();
          if (activeOwnerLog.owner_mobile) correctOwnerMobile = activeOwnerLog.owner_mobile.trim();
          if (activeOwnerLog.vat) correctVat = String(activeOwnerLog.vat).trim();
        }

        // --- SITE LOGIC ---
        let sLogs = siteLogs.rows.filter(
          (l) => (l.plate_no || "").toUpperCase() === plate,
        );
        let validSLogs = sLogs.filter((l) => {
          let st = l.work_start_date
            ? new Date(l.work_start_date)
            : new Date("2000-01-01");
          let ed = l.work_end_date
            ? new Date(l.work_end_date)
            : new Date("2099-01-01");
          return st <= targetEnd && ed >= targetStart;
        });

        // ആ മാസം വണ്ടിക്ക് ആക്ടീവ് സൈറ്റ് ലോഗ് ഇല്ലെങ്കിൽ ഒഴിവാക്കുക
        if (validSLogs.length === 0) return;

        // --- RATE LOGS FILTERING FOR TARGET MONTH ---
        let rLogs = rateLogs.rows.filter(
          (l) => (l.plate_no || "").toUpperCase() === plate,
        );

        let uniqueSitesMap = new Map();
        validSLogs.forEach((s) => {
          if (s.site_name) uniqueSitesMap.set(s.site_name, { rate: s.rate, vehicle_type: s.vehicle_type });
        });

        uniqueSitesMap.forEach((sLogData, siteName) => {
          let sLogRate = sLogData.rate;
          let sLogVType = sLogData.vehicle_type;
          let validRLogs = rLogs.filter((r) => {
            let matchesSite = !r.site_name || r.site_name.trim() === "" || r.site_name.trim().toUpperCase() === siteName.trim().toUpperCase();
            let st = r.work_start_date ? new Date(r.work_start_date) : new Date("2000-01-01");
            let ed = r.work_end_date ? new Date(r.work_end_date) : new Date("2099-01-01");
            return matchesSite && st <= targetEnd && ed >= targetStart;
          });

          let finalRateVal = 0;
          if (validRLogs.length > 0) {
            validRLogs.sort((a, b) => new Date(b.work_start_date || "2000-01-01") - new Date(a.work_start_date || "2000-01-01"));
            finalRateVal = parseFloat(validRLogs[0].rate) || 0;
          }

          if (!finalRateVal) {
            finalRateVal = parseFloat(sLogRate) || parseFloat(tsItem.rate) || 0;
          }

          pushVehicle(plate, tsItem, correctDriver, siteName, finalRateVal, correctOwner, correctOwnerMobile, correctVat, sLogVType);
        });
      } else {
        // All മോഡ്
        let defaultSite = (tsItem.site_name || "N/A").trim();
        let defaultRate = parseFloat(tsItem.rate) || 0;
        pushVehicle(plate, tsItem, correctDriver, defaultSite, defaultRate, correctOwner, correctOwnerMobile, correctVat, null);
      }

      function pushVehicle(pPlate, pItem, pDriver, pSite, pRate, pOwner, pOwnerMobile, pVat, pVType = null) {
        let vtype = (pVType && pVType.trim() !== "" && pVType !== "N/A")
          ? pVType.trim()
          : (pItem.vehicle_type || pItem.vtype || pItem["vehicle type"] || pItem.vehicleType || "N/A");
        
        // ഡ്രൈവർ പേര് എംപ്റ്റി ആണെങ്കിൽ മാസ്റ്റർ ടേബിളിൽ ഉള്ളത് എടുക്കുന്നു
        let finalDriver = pDriver || pItem.driver_name || pItem.driver || "N/A";

        let vatRaw = String(pVat || "No").trim().toLowerCase();
        let isVatBill =
          vatRaw === "yes" ||
          vatRaw === "true" ||
          vatRaw === "15" ||
          vatRaw === "15%"
            ? "Yes"
            : "No";
        function isPlateMatchingSet(candidate) {
          if (!candidate) return false;
          let raw = String(candidate).trim().toUpperCase();
          let cleanCandidate = raw.replace(/[^A-Z0-9]/g, "");
          let parts = raw.split(/➔|→|->/).map(p => p.trim().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
          return relatedPlates.some(rp => {
            let cleanRp = String(rp).replace(/[^A-Z0-9]/g, "");
            return cleanRp === cleanCandidate || parts.includes(cleanRp);
          });
        }

        const vehicleTimesheets = timesheetRows.filter((timesheet) =>
          isPlateMatchingSet(timesheet.plate_no)
        );
        const logHours = targetMonthIdx >= 0
          ? calculateLogHours(vehicleTimesheets, targetMonthIdx, targetYearNum, pSite, specialRules)
          : { nhr: 0, othr: 0 };
        const matchingInvoices = invoiceRows.filter((invoice) =>
          isPlateMatchingSet(invoice.plate_no)
        );
        const invoice = matchingInvoices.find(
          (item) => String(item.site_name || "").trim().toUpperCase() === String(pSite || "").trim().toUpperCase(),
        ) || matchingInvoices[0];

        validVehicles.push({
          plate_number: effectivePlate,
          master_plate: masterPlate,
          related_plates: relatedPlates,
          vehicle_type: vtype,
          rate: pRate,
          nrate: pRate / 260,
          otrate: (pRate / 260) * 0.7,
          owner: pOwner,
          owner_mobile: pOwnerMobile,
          site: pSite,
          driver_name: finalDriver, // 🟢 ഡ്രൈവർ പേര് ഉറപ്പാക്കുന്നു
          vat_bill: isVatBill,
          log_nhr: logHours.nhr,
          log_othr: logHours.othr,
          bill_nhr: parseFloat(invoice?.bill_nr) || 0,
          bill_othr: parseFloat(invoice?.bill_ot) || 0,
        });
      }
    });

    res.status(200).json({
      success: true,
      data: validVehicles,
      saved_bills: savedResult.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Save Billing Data (WITH ZERO-ROW PROTECTION & RELATED PLATES CLEANUP)
router.post("/save", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { billing_period, items } = req.body;

    for (let row of items) {
      const plateNo = (row.plate || "").trim();
      const siteName = (row.site_name || "").trim();

      if (!plateNo || !siteName) continue;

      // Find all related plates (old & new) for clean deletion
      let rawSplitPlates = plateNo.split(/➔|→|->/).map(p => p.trim().toUpperCase()).filter(Boolean);
      let cleanupPlates = [...new Set([plateNo.toUpperCase(), ...rawSplitPlates])];

      const pCheck = await client.query(
        `SELECT old_plate_no, new_plate_no FROM vehicle_plate_log 
         WHERE UPPER(TRIM(old_plate_no)) = ANY($1::text[]) OR UPPER(TRIM(new_plate_no)) = ANY($1::text[])`,
        [cleanupPlates]
      );
      pCheck.rows.forEach(pl => {
        let op = (pl.old_plate_no || "").trim().toUpperCase();
        let np = (pl.new_plate_no || "").trim().toUpperCase();
        if (op && !cleanupPlates.includes(op)) cleanupPlates.push(op);
        if (np && !cleanupPlates.includes(np)) cleanupPlates.push(np);
      });

      await client.query(
        `DELETE FROM billing_records 
         WHERE billing_month = $1 
           AND UPPER(TRIM(plate_no)) = ANY($2::text[])
           AND LOWER(TRIM(site_name)) = LOWER(TRIM($3))`,
        [billing_period, cleanupPlates, siteName],
      );

      // 🟢 ZERO ROW PROTECTION (Updated to allow remarks)
      const nhr = parseFloat(row.nhr) || 0;
      const othr = parseFloat(row.othr) || 0;
      const rent = parseFloat(row.rent) || 0;
      const adjAmt = parseFloat(row.adjusted_amount) || 0;
      const driverOt = parseFloat(row.driver_ot) || 0;
      const driverAmount = parseFloat(row.driver_amount) || 0;
      const remark = (row.remark || "").trim();

      if (
        nhr === 0 &&
        othr === 0 &&
        rent === 0 &&
        adjAmt === 0 &&
        driverOt === 0 &&
        driverAmount === 0 &&
        remark === ""
      ) {
        continue;
      }

      const query = `INSERT INTO billing_records 
               (billing_month, date, company, owner, site_name, db_rate, vtype, driver, plate_no, nhr, nrate, othr, otrate, rent, vat_percent, vat_amount, total, adjustment_desc, adjusted_amount, after_adjustment, remark, driver_ot, driver_amount)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`;

      await client.query(query, [
        billing_period,
        row.date,
        row.company,
        row.owner,
        row.site_name,
        row.db_rate,
        row.vtype,
        row.driver,
        row.plate,
        nhr,
        row.nrate,
        othr,
        row.otrate,
        rent,
        row.vat_percent,
        row.vat_amount,
        row.total,
        row.adjustment_desc,
        adjAmt,
        row.after_adjustment,
      row.remark,
        driverOt,
        driverAmount,
      ]);
    }
    await client.query("COMMIT");
    res.status(200).json({ success: true, message: "Saved successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 3. Fetch Dashboard Data (FILTER OUT ZERO ROWS BUT KEEP REMARKS)
router.get("/dashboard-data", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM billing_records WHERE rent > 0 OR nhr > 0 OR othr > 0 OR adjusted_amount != 0 OR driver_ot != 0 OR driver_amount != 0 OR (remark IS NOT NULL AND remark != '') ORDER BY TO_DATE(billing_month, 'Month YYYY') DESC, id ASC`,
    );

    const tsRes = await pool.query(
      "SELECT plate_no, site_name, owner_name FROM timesheet_vehicles",
    );
    let tsMap = {};
    tsRes.rows.forEach((r) => {
      if (r.plate_no) tsMap[r.plate_no.toUpperCase()] = r;
    });

    result.rows.forEach((row) => {
      let pNo = (row.plate_no || "").toUpperCase();
      if (tsMap[pNo]) {
        if (!row.site_name || row.site_name === "-" || row.site_name === "N/A")
          row.site_name = tsMap[pNo].site_name;
        if (!row.owner || row.owner === "-" || row.owner === "")
          row.owner = tsMap[pNo].owner_name;
      }
    });

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Export Excel (FILTER OUT ZERO ROWS BUT KEEP REMARKS)
router.get("/export-excel", async (req, res) => {
  try {
    const { month } = req.query;
    let query = `SELECT * FROM billing_records WHERE rent > 0 OR nhr > 0 OR othr > 0 OR adjusted_amount != 0 OR (remark IS NOT NULL AND remark != '') ORDER BY TO_DATE(billing_month, 'Month YYYY') DESC, id ASC`;
    let params = [];

    if (month && month !== "All") {
      query = `SELECT * FROM billing_records WHERE billing_month = $1 AND (rent > 0 OR nhr > 0 OR othr > 0 OR adjusted_amount != 0 OR (remark IS NOT NULL AND remark != '')) ORDER BY id ASC`;
      params = [month];
    }

    const result = await pool.query(query, params);

    const tsRes = await pool.query(
      "SELECT plate_no, site_name, owner_name FROM timesheet_vehicles",
    );
    let tsMap = {};
    tsRes.rows.forEach((r) => {
      if (r.plate_no) tsMap[r.plate_no.toUpperCase()] = r;
    });

    result.rows.forEach((row) => {
      let pNo = (row.plate_no || "").toUpperCase();
      let tSite = tsMap[pNo];
      if (tSite) {
        if (!row.site_name || row.site_name === "-" || row.site_name === "N/A")
          row.site_name = tSite.site_name;
        if (!row.owner || row.owner === "-" || row.owner === "")
          row.owner = tSite.owner_name;
      }
    });

    const workbook = new ExcelJS.Workbook();
    let sheetName = month === "All" || !month ? "All_Months" : month;
    sheetName = sheetName.substring(0, 31);
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: "Month", key: "billing_month", width: 15 },
      { header: "Date", key: "date", width: 15 },
      { header: "Owner", key: "owner", width: 25 },
      { header: "Site", key: "site_name", width: 25 },
      { header: "Vehicle Type", key: "vtype", width: 20 },
      { header: "Driver", key: "driver", width: 20 },
      { header: "Plate No", key: "plate_no", width: 15 },
      { header: "N.Hr", key: "nhr", width: 10 },
      { header: "N.Rate", key: "nrate", width: 10 },
      { header: "OT Hr", key: "othr", width: 10 },
      { header: "OT Rate", key: "otrate", width: 10 },
      { header: "Rent", key: "rent", width: 15 },
      { header: "VAT %", key: "vat_percent", width: 10 },
      { header: "VAT Amt", key: "vat_amount", width: 15 },
      { header: "Adjustment", key: "adjustment_desc", width: 25 },
      { header: "Adj. Amt", key: "adjusted_amount", width: 15 },
      { header: "Grand Total", key: "after_adjustment", width: 15 },
      { header: "Remark", key: "remark", width: 25 },
    ];

    result.rows.forEach((row) => {
      worksheet.addRow(row);
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Billing_${sheetName.replace(/ /g, "_")}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).send("Error generating Excel: " + error.message);
  }
});

// 🟢 5. Combined Multi-Month Bill Generator API for a Specific Vehicle (WITH RATE LOG & SITE LOG HISTORICAL CHECK)
router.get("/combined-bill", async (req, res) => {
  try {
    const { plate_no, from_month, from_year, to_month, to_year } = req.query;

    if (!plate_no || !from_month || !from_year || !to_month || !to_year) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: plate_no, from_month, from_year, to_month, to_year",
      });
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const fromMIdx = monthNames.indexOf(from_month.trim());
    const toMIdx = monthNames.indexOf(to_month.trim());
    const startYr = parseInt(from_year, 10);
    const endYr = parseInt(to_year, 10);

    if (fromMIdx === -1 || toMIdx === -1 || isNaN(startYr) || isNaN(endYr)) {
      return res.status(400).json({ success: false, message: "Invalid month or year selection." });
    }

    // Build ordered list of target months
    let targetMonths = [];
    let curDate = new Date(startYr, fromMIdx, 1);
    let endDate = new Date(endYr, toMIdx, 1);

    while (curDate <= endDate) {
      let mName = monthNames[curDate.getMonth()];
      let yNum = curDate.getFullYear();
      targetMonths.push(`${mName} ${yNum}`);
      curDate.setMonth(curDate.getMonth() + 1);
    }

    const cleanPlate = plate_no.trim().toUpperCase();

    // 🟢 ഈ വണ്ടിയുടെ എല്ലാ അനുബന്ധ പ്ലേറ്റ് നമ്പറുകളും (പഴയതും പുതിയതും) കണ്ടെത്തുന്നു
    let rawPlates = cleanPlate.split(/➔|→|->/).map(p => p.trim().toUpperCase()).filter(Boolean);
    let relatedPlates = [...new Set([cleanPlate, ...rawPlates])];

    const plateChangesQuery = await pool.query(
      `SELECT old_plate_no, new_plate_no FROM vehicle_plate_log 
       WHERE UPPER(TRIM(old_plate_no)) = ANY($1::text[]) OR UPPER(TRIM(new_plate_no)) = ANY($1::text[])`,
      [relatedPlates]
    );

    plateChangesQuery.rows.forEach(pl => {
      let op = (pl.old_plate_no || "").trim().toUpperCase();
      let np = (pl.new_plate_no || "").trim().toUpperCase();
      if (op && !relatedPlates.includes(op)) relatedPlates.push(op);
      if (np && !relatedPlates.includes(np)) relatedPlates.push(np);
    });

    // Query saved billing records across all related plates or arrow combination
    const savedResult = await pool.query(
      `SELECT * FROM billing_records 
       WHERE (
         UPPER(TRIM(plate_no)) = ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM unnest($1::text[]) AS rp 
           WHERE UPPER(TRIM(billing_records.plate_no)) LIKE '%' || rp || '%'
         )
       )
       AND billing_month = ANY($2::text[])
       ORDER BY TO_DATE(billing_month, 'Month YYYY') ASC, id DESC`,
      [relatedPlates, targetMonths]
    );

    // 🟢 എല്ലാ അനുബന്ധ പ്ലേറ്റുകളും (പഴയതും പുതിയതും) ഉപയോഗിച്ച് മാസ്റ്റർ വിവരങ്ങളും ലോഗുകളും ഫെച്ച് ചെയ്യുന്നു
    const [tsVehicleRes, rateLogRes, siteLogRes, ownerLogRes, plateLogRes] = await Promise.all([
      pool.query(`SELECT * FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) LIMIT 1`, [relatedPlates]),
      pool.query(`SELECT * FROM vehicle_rate_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [relatedPlates]),
      pool.query(`SELECT id, plate_no, site_name, rate, work_start_date, work_end_date, vehicle_type FROM vehicle_site_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [relatedPlates]),
      pool.query(`SELECT * FROM vehicle_owner_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [relatedPlates]),
      pool.query(`SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log WHERE UPPER(TRIM(old_plate_no)) = ANY($1::text[]) OR UPPER(TRIM(new_plate_no)) = ANY($1::text[]) ORDER BY change_date ASC`, [relatedPlates])
    ]);

    const vehicleInfo = tsVehicleRes.rows[0] || {};
    const rateLogs = rateLogRes.rows || [];
    const siteLogs = siteLogRes.rows || [];
    const ownerLogs = ownerLogRes.rows || [];
    const plateLogs = plateLogRes.rows || [];

    let combinedRows = [];
    let totals = { nhr: 0, othr: 0, rent: 0, vat_amount: 0, total: 0, adjusted_amount: 0, after_adjustment: 0 };

    function plateMatchesRelated(targetPlate) {
      if (!targetPlate) return false;
      let raw = String(targetPlate).trim().toUpperCase();
      let parts = raw.split(/➔|→|->/).map(p => p.trim().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
      let cleanRelated = relatedPlates.map(p => p.replace(/[^A-Z0-9]/g, ""));
      return parts.some(p => cleanRelated.includes(p)) || cleanRelated.includes(raw.replace(/[^A-Z0-9]/g, ""));
    }

    targetMonths.forEach((mStr) => {
      let savedRow = savedResult.rows.find((r) => {
        let bMonthMatch = r.billing_month === mStr;
        return bMonthMatch && plateMatchesRelated(r.plate_no);
      });

      const [mName, yStr] = mStr.split(" ");
      const shortDate = mName.substring(0, 3) + " " + (yStr ? yStr.substring(2, 4) : "");

      const mIdxCur = monthNames.indexOf(mName);
      const curYearInt = parseInt(yStr);
      const mStart = new Date(curYearInt, mIdxCur, 1);
      const mEnd = new Date(curYearInt, mIdxCur + 1, 0);

      // 🟢 ആ മാസത്തെ കൃത്യമായ പ്ലേറ്റ് നമ്പർ നിർണ്ണയിക്കുന്നു
      let rowPlateNumber = cleanPlate;
      if (plateLogs.length > 0) {
        for (let pl of plateLogs) {
          if (!pl.change_date) continue;
          let [cYear, cMonth, cDay] = pl.change_date.split("-").map(Number);
          let cDate = new Date(cYear, cMonth - 1, cDay);

          if (cYear === curYearInt && (cMonth - 1) === mIdxCur) {
            rowPlateNumber = `${pl.old_plate_no.trim().toUpperCase()} ➔ ${pl.new_plate_no.trim().toUpperCase()}`;
          } else if (mEnd < cDate) {
            rowPlateNumber = pl.old_plate_no.trim().toUpperCase();
          } else if (mStart >= cDate) {
            rowPlateNumber = pl.new_plate_no.trim().toUpperCase();
          }
        }
      }

      // Find historical rate from vehicle_rate_log for this specific month
      let matchedRateLog = rateLogs.find((r) => {
        let st = r.work_start_date ? new Date(r.work_start_date) : new Date("2000-01-01");
        let ed = r.work_end_date ? new Date(r.work_end_date) : new Date("2099-01-01");
        return st <= mEnd && ed >= mStart;
      });

      let historicalBaseRate = matchedRateLog ? parseFloat(matchedRateLog.rate) : 0;
      
      if (!historicalBaseRate) {
        let matchedSiteLog = siteLogs.find((s) => {
          let st = s.work_start_date ? new Date(s.work_start_date) : new Date("2000-01-01");
          let ed = s.work_end_date ? new Date(s.work_end_date) : new Date("2099-01-01");
          return st <= mEnd && ed >= mStart;
        });
        historicalBaseRate = matchedSiteLog ? parseFloat(matchedSiteLog.rate) : (parseFloat(vehicleInfo.rate) || 0);
      }

      let fallbackNRate = historicalBaseRate ? (historicalBaseRate / 260) : 0;
      let fallbackOTRate = historicalBaseRate ? ((historicalBaseRate / 260) * 0.7) : 0;

      // Find historical owner from vehicle_owner_log for this specific month
      let matchedOwnerLog = ownerLogs.find((o) => {
        let st = o.work_start_date ? new Date(o.work_start_date) : new Date("2000-01-01");
        let ed = o.work_end_date ? new Date(o.work_end_date) : new Date("2099-01-01");
        return st <= mEnd && ed >= mStart;
      });
      let fallbackOwnerName = matchedOwnerLog?.owner_name || vehicleInfo.owner_name || "COMPANY VEHICLE";

      if (savedRow) {
        let nhr = parseFloat(savedRow.nhr) || 0;
        let othr = parseFloat(savedRow.othr) || 0;
        let rent = parseFloat(savedRow.rent) || 0;
        let vatAmt = parseFloat(savedRow.vat_amount) || 0;
        let total = parseFloat(savedRow.total) || (rent + vatAmt);
        let adjAmt = parseFloat(savedRow.adjusted_amount) || 0;
        let afterAdj = parseFloat(savedRow.after_adjustment) || (total + adjAmt);

        totals.nhr += nhr;
        totals.othr += othr;
        totals.rent += rent;
        totals.vat_amount += vatAmt;
        totals.total += total;
        totals.adjusted_amount += adjAmt;
        totals.after_adjustment += afterAdj;

        let rowNRate = (savedRow.nrate !== null && parseFloat(savedRow.nrate) > 0) ? parseFloat(savedRow.nrate) : fallbackNRate;
        let rowOTRate = (savedRow.otrate !== null && parseFloat(savedRow.otrate) > 0) ? parseFloat(savedRow.otrate) : fallbackOTRate;

        let targetSite = savedRow.site_name || vehicleInfo.site_name || "N/A";
        let resolvedCompany = savedRow.company || getCompanyFromSite(targetSite, vehicleInfo.company);

        // ആ മാസത്തെ സൈറ്റ് ലോഗിൽ പ്രത്യേക vehicle_type ഉണ്ടോ എന്ന് നോക്കുന്നു
        let matchedMonthSiteLog = siteLogs.find((s) => {
          let st = s.work_start_date ? new Date(s.work_start_date) : new Date("2000-01-01");
          let ed = s.work_end_date ? new Date(s.work_end_date) : new Date("2099-01-01");
          return st <= mEnd && ed >= mStart;
        });
        let fallbackSiteVType = (matchedMonthSiteLog?.vehicle_type && matchedMonthSiteLog.vehicle_type.trim() !== "" && matchedMonthSiteLog.vehicle_type !== "N/A")
          ? matchedMonthSiteLog.vehicle_type.trim()
          : (vehicleInfo.vehicle_type || "N/A");

        // 🟢 savedRow-ൽ vtype അല്ലെങ്കിൽ driver ഇല്ലെങ്കിൽ സൈറ്റ് ലോഗിൽ നിന്നോ vehicleInfo-ൽ നിന്നോ നൽകുന്നു
        let rowVType = savedRow.vtype && savedRow.vtype !== "N/A" ? savedRow.vtype : fallbackSiteVType;
        let rowDriver = savedRow.driver && savedRow.driver !== "N/A" ? savedRow.driver : (vehicleInfo.driver_name || "N/A");

        combinedRows.push({
          billing_month: mStr,
          date: savedRow.date || shortDate,
          company: resolvedCompany,
          owner: savedRow.owner || fallbackOwnerName,
          site_name: targetSite,
          vtype: rowVType,
          driver: rowDriver,
          plate_no: rowPlateNumber,
          nhr: nhr,
          nrate: rowNRate,
          othr: othr,
          otrate: rowOTRate,
          rent: rent,
          vat_percent: parseFloat(savedRow.vat_percent) || 0,
          vat_amount: vatAmt,
          total: total,
          adjustment_desc: savedRow.adjustment_desc || "",
          adjusted_amount: adjAmt,
          after_adjustment: afterAdj,
          remark: savedRow.remark || ""
        });
      } else {
        let targetSite = vehicleInfo.site_name || "N/A";
        let resolvedCompany = getCompanyFromSite(targetSite, vehicleInfo.company);

        combinedRows.push({
          billing_month: mStr,
          date: shortDate,
          company: resolvedCompany,
          owner: fallbackOwnerName,
          site_name: targetSite,
          vtype: vehicleInfo.vehicle_type || "N/A",
          driver: vehicleInfo.driver_name || "N/A",
          plate_no: rowPlateNumber,
          nhr: 0,
          nrate: fallbackNRate,
          othr: 0,
          otrate: fallbackOTRate,
          rent: 0,
          vat_percent: 0,
          vat_amount: 0,
          total: 0,
          adjustment_desc: "",
          adjusted_amount: 0,
          after_adjustment: 0,
          remark: ""
        });
      }
    });

    res.status(200).json({
      success: true,
      plate_no: cleanPlate,
      vehicle_info: vehicleInfo,
      rows: combinedRows,
      totals: totals
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🟢 6. Security Code Verification for Combined Bill Generator Images
router.post("/verify-combined-security", (req, res) => {
  try {
    const { code } = req.body;
    const validCode = process.env.COMBINED_GENERATOR_CODE || "12345";

    if (code === validCode) {
      res.json({ success: true, message: "Security Code Verified!" });
    } else {
      res.json({ success: false, message: "Invalid Security Code!" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;