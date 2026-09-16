const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// 🟢 Get existing invoice data
router.get("/get-invoice", async (req, res) => {
  try {
    const { plate_no, month } = req.query;
    const result = await pool.query(
      "SELECT * FROM invoice_records WHERE plate_no = $1 AND month = $2",
      [plate_no, month],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 🟢 Save or Update Invoice Data (Single Entry)
router.post("/save-invoice", async (req, res) => {
  try {
    const {
      plate_no,
      month,
      site_name,
      invoice_no,
      bill_no,
      bill_nr,
      bill_ot,
      invoice_amount,
    } = req.body;

    const check = await pool.query(
      "SELECT id FROM invoice_records WHERE plate_no = $1 AND month = $2 AND site_name = $3",
      [plate_no, month, site_name],
    );

    if (check.rows.length > 0) {
      await pool.query(
        "UPDATE invoice_records SET invoice_no=$1, bill_no=$2, bill_nr=$3, bill_ot=$4, invoice_amount=$5, updated_at=CURRENT_TIMESTAMP WHERE plate_no=$6 AND month=$7 AND site_name=$8",
        [
          invoice_no,
          bill_no,
          bill_nr,
          bill_ot,
          invoice_amount,
          plate_no,
          month,
          site_name,
        ],
      );
    } else {
      await pool.query(
        "INSERT INTO invoice_records (plate_no, month, site_name, invoice_no, bill_no, bill_nr, bill_ot, invoice_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          plate_no,
          month,
          site_name,
          invoice_no,
          bill_no,
          bill_nr,
          bill_ot,
          invoice_amount,
        ],
      );
    }
    res.json({ success: true, message: "Invoice Info Saved Successfully!" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 🟢 Verify Security Code for Edit Mode
router.post("/verify-security", (req, res) => {
  const { code } = req.body;
  // Set this code in your .env file, e.g., EDIT_SECURITY_CODE=7890
  const validCode = process.env.EDIT_SECURITY_CODE || "12345";

  if (code === validCode) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Invalid Security Code!" });
  }
});

// 🟢 Verify Security Code for Special Edit Mode (Clear & V.Bill)
router.post("/verify-special-security", (req, res) => {
  const { code } = req.body;
  // നിങ്ങളുടെ .env ഫയലിൽ SPECIAL_EDIT_CODE=1234 (ഏതെങ്കിലും നമ്പർ) എന്ന് ആഡ് ചെയ്യുക.
  const validCode = process.env.SPECIAL_EDIT_CODE || "9999";

  if (code === validCode) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Invalid Security Code!" });
  }
});

// 🟢 Save Inline Edited Bulk Data from Table
router.post("/save-inline-edits", async (req, res) => {
  let client;
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.json({
        success: false,
        message: "Invalid data format received.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    for (let row of records) {
      const {
        month,
        plate,
        site,
        inv_nr,
        inv_ot,
        inv_no,
        inv_amount,
        bill_no,
      } = row;
      if (!month || !plate) continue;

      const checkInv = await client.query(
        "SELECT id FROM invoice_records WHERE plate_no = $1 AND month = $2 AND site_name = $3",
        [plate, month, site],
      );

      if (checkInv.rows.length > 0) {

        await client.query(
  "UPDATE invoice_records SET invoice_no=$1, bill_no=$2, bill_nr=$3, bill_ot=$4, invoice_amount=$5, updated_at=CURRENT_TIMESTAMP WHERE plate_no=$6 AND month=$7 AND site_name=$8",
  [inv_no, bill_no, inv_nr ?? null, inv_ot ?? null, inv_amount ?? null, plate, month, site],
);
      } else {
        if (inv_no !== "" || bill_no !== "" || inv_nr !== null || inv_ot !== null || inv_amount !== null) {
          await client.query(
            "INSERT INTO invoice_records (plate_no, month, site_name, invoice_no, bill_no, bill_nr, bill_ot, invoice_amount, zoho) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [plate, month, site, inv_no, bill_no, inv_nr, inv_ot, inv_amount, 'No'],
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Edits saved successfully!" });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("Bulk Edit Error:", err);
    res.json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
});
 
// 🟢 Fetch Master Report Data (With Owner, Rate & Plate Change Logs)
router.get("/master-report-data", async (req, res) => {
  try {
    const { month, year } = req.query;
    const fullMonth = `${month} ${year}`;

    const [vehicles, sites, drivers, timesheets, invoices, billing, owners, rates, plateChanges] = await Promise.all([
      pool.query("SELECT plate_no, owner_name, site_name, vehicle_type, vat FROM timesheet_vehicles"),
      pool.query("SELECT plate_no, site_name, work_start_date, work_end_date, rate, field_co, site_co, vehicle_type FROM vehicle_site_log"),
      pool.query("SELECT plate_no, driver_name, work_start_date, work_end_date FROM vehicle_driver_log"),
      pool.query("SELECT plate_no, record_date, calc_time, bd FROM timesheet_daily_records WHERE month=$1 AND year=$2", [month, year]),
      pool.query("SELECT * FROM invoice_records WHERE month=$1", [fullMonth]),
      pool.query("SELECT * FROM billing_records WHERE billing_month=$1", [fullMonth]),
      pool.query("SELECT plate_no, owner_name, vat, work_start_date, work_end_date, status FROM vehicle_owner_log"),
      pool.query("SELECT plate_no, site_name, rate, work_start_date, work_end_date, status FROM vehicle_rate_log"),
      pool.query("SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC")
    ]);

    res.json({
      success: true,
      vehicles: vehicles.rows,
      sites: sites.rows,
      drivers: drivers.rows,
      timesheets: timesheets.rows,
      invoices: invoices.rows,
      billing: billing.rows,
      owners: owners.rows,
      rates: rates.rows,
      plateChanges: plateChanges.rows
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Fetch several report months in one request. The vehicle and history tables are
// shared by every month, so reading and transferring them once avoids flooding
// the database pool when the batch report screen is opened.
router.post("/master-report-data-batch", async (req, res) => {
  try {
    const validMonths = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const requestedMonths = Array.isArray(req.body?.months)
      ? req.body.months
      : [];

    if (requestedMonths.length === 0 || requestedMonths.length > 24) {
      return res.status(400).json({
        success: false,
        message: "Select between 1 and 24 months.",
      });
    }

    const normalizedMonths = requestedMonths.map((item) => ({
      month: String(item.month || "").trim(),
      year: Number(item.year),
    }));
    const hasInvalidMonth = normalizedMonths.some(
      (item) =>
        !validMonths.includes(item.month) ||
        !Number.isInteger(item.year) ||
        item.year < 2000 ||
        item.year > 2100,
    );

    if (hasInvalidMonth) {
      return res.status(400).json({
        success: false,
        message: "Invalid month or year in batch request.",
      });
    }

    const uniqueMonths = Array.from(
      new Map(
        normalizedMonths.map((item) => [`${item.month} ${item.year}`, item]),
      ).values(),
    );
    const timesheetParams = [];
    const timesheetConditions = uniqueMonths.map((item, index) => {
      timesheetParams.push(item.month, item.year);
      return `(month=$${index * 2 + 1} AND year=$${index * 2 + 2})`;
    });
    const fullMonths = uniqueMonths.map(
      (item) => `${item.month} ${item.year}`,
    );

    const [vehicles, sites, drivers, timesheets, invoices, billing, owners, rates, plateChanges] = await Promise.all([
      pool.query("SELECT plate_no, owner_name, site_name, vehicle_type, vat FROM timesheet_vehicles"),
      pool.query("SELECT plate_no, site_name, work_start_date, work_end_date, rate, field_co, site_co, vehicle_type FROM vehicle_site_log"),
      pool.query("SELECT plate_no, driver_name, work_start_date, work_end_date FROM vehicle_driver_log"),
      pool.query(
        `SELECT plate_no, record_date, calc_time, bd, month, year
         FROM timesheet_daily_records
         WHERE ${timesheetConditions.join(" OR ")}`,
        timesheetParams,
      ),
      pool.query("SELECT * FROM invoice_records WHERE month = ANY($1::text[])", [fullMonths]),
      pool.query("SELECT * FROM billing_records WHERE billing_month = ANY($1::text[])", [fullMonths]),
      pool.query("SELECT plate_no, owner_name, vat, work_start_date, work_end_date, status FROM vehicle_owner_log"),
      pool.query("SELECT plate_no, site_name, rate, work_start_date, work_end_date, status FROM vehicle_rate_log"),
      pool.query("SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC"),
    ]);

    res.json({
      success: true,
      vehicles: vehicles.rows,
      sites: sites.rows,
      drivers: drivers.rows,
      timesheets: timesheets.rows,
      invoices: invoices.rows,
      billing: billing.rows,
      owners: owners.rows,
      rates: rates.rows,
      plateChanges: plateChanges.rows,
    });
  } catch (err) {
    console.error("Batch master report error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 Save Accounts Note via Double Click
router.post("/save-accounts-note", async (req, res) => {
  try {
    const { plate_no, month, site_name, accounts_note } = req.body;
    const check = await pool.query(
      "SELECT id FROM invoice_records WHERE plate_no = $1 AND month = $2 AND site_name = $3",
      [plate_no, month, site_name],
    );

    if (check.rows.length > 0) {
      await pool.query(
        "UPDATE invoice_records SET accounts_note=$1, updated_at=CURRENT_TIMESTAMP WHERE plate_no=$2 AND month=$3 AND site_name=$4",
        [accounts_note, plate_no, month, site_name],
      );
    } else {
      await pool.query(
        "INSERT INTO invoice_records (plate_no, month, site_name, invoice_no, bill_nr, accounts_note) VALUES ($1, $2, $3, $4, $5, $6)",
        [plate_no, month, site_name, "", 0, accounts_note],
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 🟢 Save Bulk Special Edits (V.Bill Notes, Supplier and Driver values)
router.post("/save-bulk-vbill-notes", async (req, res) => {
  let client;
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.json({ success: false, message: "Invalid data format." });
    }
    client = await pool.connect();
    await client.query("BEGIN");

    for (let row of records) {
      const checkBill = await client.query(
        "SELECT id FROM billing_records WHERE plate_no=$1 AND billing_month=$2 AND site_name=$3",
        [row.plate_no, row.month, row.site_name]
      );

      if (checkBill.rows.length > 0) {
        await client.query(
         `UPDATE billing_records
           SET remark=$1, nhr=$5, othr=$6, driver_ot=$7, driver_amount=$8
           WHERE plate_no=$2 AND billing_month=$3 AND site_name=$4`,
          [
            row.remark,
            row.plate_no,
            row.month,
            row.site_name,
            row.bill_nr,
            row.bill_ot,
            row.driver_ot,
            row.driver_amount,
          ]
        );
      } else {
        await client.query(
           `INSERT INTO billing_records
           (plate_no, billing_month, site_name, remark, nhr, othr, driver_ot, driver_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.plate_no,
            row.month,
            row.site_name,
            row.remark,
            row.bill_nr,
            row.bill_ot,
            row.driver_ot,
            row.driver_amount,
          ]
        );
      }
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    res.json({ success: false, message: err.message });
  } finally {
    if (client) client.release();
  }
});

// 🟢 Save Generic Text Notes (PWAS, ERP, Payment Status, Accounts Note, diff_clear) via Double Click / Checkbox
router.post("/save-text-note", async (req, res) => {
  try {
    const { plate_no, month, site_name, field, value } = req.body;
    
    const allowedFields = ["accounts_note", "pwas", "erp", "payment_status", "zoho", "diff_clear"];
    if (!allowedFields.includes(field)) {
      return res.json({ success: false, message: "Invalid field name: " + field });
    }

    // 🟢 ഡാറ്റ കൃത്യമായി ഉണ്ടോ എന്ന് നോക്കി Update അല്ലെങ്കിൽ Insert ചെയ്യുന്നു
    const check = await pool.query(
      "SELECT id FROM invoice_records WHERE plate_no = $1 AND month = $2 AND site_name = $3",
      [plate_no, month, site_name]
    );

    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE invoice_records SET ${field} = $1, updated_at = CURRENT_TIMESTAMP WHERE plate_no = $2 AND month = $3 AND site_name = $4`,
        [value, plate_no, month, site_name]
      );
    } else {
      await pool.query(
        `INSERT INTO invoice_records (plate_no, month, site_name, ${field}, invoice_no, bill_nr, bill_ot) 
         VALUES ($1, $2, $3, $4, '', 0, 0)`,
        [plate_no, month, site_name, value]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(`Error saving text note (${field}):`, err.message); 
    res.json({ success: false, message: err.message });
  }
});

module.exports = router; 