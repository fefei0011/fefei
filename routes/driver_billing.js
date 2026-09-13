const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const verifyBillingEditor = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, message: "No token provided. Access Denied." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const allowedRoles = ["Super Admin", "Admin", "User"];

    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Viewers cannot edit driver billing.",
      });
    }
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid or expired session" });
  }
};

router.use(verifyBillingEditor);

// 🟢 1. Fetch Drivers & Vehicle Logs for Driver OT Billing
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

router.get("/vehicles", async (req, res) => {
  try {
    const { month } = req.query;

    const [tsVehicles, driverLogs, siteLogs, plateLogs, specialRulesRes] = await Promise.all([
      pool.query("SELECT * FROM timesheet_vehicles"),
      pool.query("SELECT plate_no, driver_name, work_start_date, work_end_date FROM vehicle_driver_log"),
      pool.query("SELECT plate_no, site_name, rate, work_start_date, work_end_date FROM vehicle_site_log"),
      pool.query("SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC"),
      pool.query("SELECT sites, dates, rule_type FROM special_days_rules WHERE is_active = true"),
    ]);

    let savedBills = [];
    let timesheetRows = [];
    let invoiceRows = [];
    let specialRules = specialRulesRes.rows || [];
    let targetMonthIdx = -1, targetYearNum = 0;

    if (month && month !== "All") {
      const savedQuery = `SELECT * FROM billing_records WHERE billing_month = $1`;
      const savedRes = await pool.query(savedQuery, [month]);
      savedBills = savedRes.rows;

      const [mName, yStr] = month.trim().split(" ");
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const mIdx = monthNames.indexOf(mName);

      if (mIdx !== -1 && yStr) {
        targetYearNum = parseInt(yStr, 10);
        targetMonthIdx = mIdx;
        const [timesheetsResult, invoicesResult] = await Promise.all([
          pool.query(
            "SELECT plate_no, record_date, calc_time, bd FROM timesheet_daily_records WHERE month = $1 AND year = $2",
            [mName, yStr]
          ),
          pool.query(
            "SELECT plate_no, site_name, bill_nr, bill_ot FROM invoice_records WHERE month = $1",
            [month]
          ),
        ]);
        timesheetRows = timesheetsResult.rows;
        invoiceRows = invoicesResult.rows;
      }
    }

    res.json({
      success: true,
      vehicles: tsVehicles.rows,
      driver_logs: driverLogs.rows,
      site_logs: siteLogs.rows,
      plate_logs: plateLogs.rows,
      timesheets: timesheetRows,
      invoices: invoiceRows,
      saved_bills: savedBills,
      target_month_idx: targetMonthIdx,
      target_year_num: targetYearNum,
      special_rules: specialRules,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 2. Save Driver OT & Driver Amount to billing_records (Conflict-free multi-month save)
router.post("/save", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "No driver items to save" });
    }

    for (let row of items) {
      const plate = (row.plate || "").trim();
      const billingMonth = (row.billing_month || "").trim();
      const site = (row.site_name || "").trim();
      const driverName = (row.driver || "").trim();
      const driverOt = parseFloat(row.driver_ot) || 0;
      const driverAmount = parseFloat(row.driver_amount) || 0;

      if (!plate || !billingMonth) continue;

      // Check if billing record already exists for this exact plate, site, and month
      const checkRes = await client.query(
        `SELECT id FROM billing_records 
         WHERE billing_month = $1 
           AND UPPER(TRIM(plate_no)) = UPPER(TRIM($2)) 
           AND LOWER(TRIM(COALESCE(site_name, ''))) = LOWER(TRIM($3))`,
        [billingMonth, plate, site]
      );

      if (checkRes.rows.length > 0) {
        // Update existing record
        await client.query(
          `UPDATE billing_records 
           SET driver_ot = $1, driver_amount = $2, driver = COALESCE(NULLIF($3, ''), driver)
           WHERE id = $4`,
          [driverOt, driverAmount, driverName, checkRes.rows[0].id]
        );
      } else {
        // Insert new record if not present
        await client.query(
          `INSERT INTO billing_records 
           (billing_month, plate_no, site_name, driver, driver_ot, driver_amount, nhr, nrate, othr, otrate, rent, total, after_adjustment)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 0, 0, 0)`,
          [billingMonth, plate, site, driverName, driverOt, driverAmount]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Driver OT billing saved successfully!" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Driver save error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// 🟢 3. Combined Multi-Month Driver OT Statement API
router.get("/combined-driver-bill", async (req, res) => {
  try {
    const { driver_name, plate_no, from_month, from_year, to_month, to_year } = req.query;

    if (!from_month || !from_year || !to_month || !to_year || (!driver_name && !plate_no)) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: (driver_name or plate_no), from_month, from_year, to_month, to_year",
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

    let targetMonths = [];
    let curDate = new Date(startYr, fromMIdx, 1);
    let endDate = new Date(endYr, toMIdx, 1);

    while (curDate <= endDate) {
      let mName = monthNames[curDate.getMonth()];
      let yNum = curDate.getFullYear();
      targetMonths.push(`${mName} ${yNum}`);
      curDate.setMonth(curDate.getMonth() + 1);
    }

    let queryConditions = ["billing_month = ANY($1::text[])"];
    let queryParams = [targetMonths];

    if (driver_name && driver_name.trim() !== "") {
      queryParams.push(`%${driver_name.trim()}%`);
      queryConditions.push(`driver ILIKE $${queryParams.length}`);
    } else if (plate_no && plate_no.trim() !== "") {
      const cleanPlate = plate_no.trim().toUpperCase();
      queryParams.push(cleanPlate);
      queryConditions.push(`(
        UPPER(TRIM(plate_no)) = $${queryParams.length}
        OR UPPER(TRIM(plate_no)) LIKE '%' || $${queryParams.length} || '%'
      )`);
    }

    const savedResult = await pool.query(
      `SELECT * FROM billing_records 
       WHERE ${queryConditions.join(" AND ")}
       ORDER BY TO_DATE(billing_month, 'Month YYYY') ASC, id DESC`,
      queryParams
    );

    let combinedRows = [];
    let totalHr = 0;
    let totalAmt = 0;

    targetMonths.forEach((mStr) => {
      let savedRow = savedResult.rows.find((r) => r.billing_month === mStr);
      const [mName, yStr] = mStr.split(" ");
      const shortDate = mName.substring(0, 3) + " " + (yStr ? yStr.substring(2, 4) : "");

      if (savedRow) {
        let ot = parseFloat(savedRow.driver_ot) || 0;
        let amt = parseFloat(savedRow.driver_amount) || 0;
        let rate = ot > 0 && amt > 0 ? Number((amt / ot).toFixed(2)) : 15;

        totalHr += ot;
        totalAmt += amt;

        combinedRows.push({
          billing_month: mStr,
          date: savedRow.date || shortDate,
          vehicle_type: savedRow.vtype || "-",
          driver: savedRow.driver || driver_name || "-",
          site_name: savedRow.site_name || "-",
          plate_no: savedRow.plate_no || "-",
          driver_ot: ot,
          rate: rate,
          driver_amount: amt,
        });
      } else {
        combinedRows.push({
          billing_month: mStr,
          date: shortDate,
          vehicle_type: "-",
          driver: driver_name || "-",
          site_name: "-",
          plate_no: plate_no || "-",
          driver_ot: 0,
          rate: 15,
          driver_amount: 0,
        });
      }
    });

    res.status(200).json({
      success: true,
      driver_name: driver_name || "",
      plate_no: plate_no || "",
      rows: combinedRows,
      totals: {
        total_ot: totalHr,
        total_amount: Number(totalAmt.toFixed(2)),
      }
    });
  } catch (error) {
    console.error("Combined driver bill error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;