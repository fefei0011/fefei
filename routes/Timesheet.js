const express = require("express");
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { randomUUID } = require("crypto");
const {
  verifyToken,
  verifySuperAdmin,
  verifyEditor,
} = require("../middlewares/auth");
const router = express.Router();
 
const JWT_SECRET = process.env.JWT_SECRET;
 
// Helper function for Audit Logging
async function logAudit(user, action, details) {
  try {
    const userInfo = user ? user.username || user.email || "Admin" : "System";
    await pool.query(
      `INSERT INTO audit_logs (user_info, action_type, details) VALUES ($1, $2, $3)`,
      [userInfo, action, details],
    );
  } catch (e) {
    console.error("Audit Log Failed:", e.message);
  }
}
 
// ==========================================
// AUDIT LOGS API
// ==========================================
router.get("/api/audit-logs", verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500",
    );
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// AUTH & ADMIN
// ==========================================
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const userCheck = await pool.query(
      "SELECT * FROM timesheet_users WHERE username = $1 OR email = $2",
      [username, email],
    );
    if (userCheck.rows.length > 0)
      return res.json({ success: false, message: "Username or Email exists." });
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO timesheet_users (username, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5)",
      [username, email, hashedPassword, "Viewer", "Pending"],
    );
    await logAudit(
      { username },
      "REGISTER",
      `New user registration request for ${username}`,
    );
    res.json({ success: true, message: "Registration successful!" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM timesheet_users WHERE username = $1",
      [username],
    );
    if (result.rows.length === 0)
      return res.json({ success: false, message: "User not found." });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid)
      return res.json({ success: false, message: "Invalid password." });
    if (user.status !== "Active")
      return res.json({ success: false, message: "Account Pending." });
 
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "365d" },
    );
    await logAudit(user, "LOGIN", `User logged in successfully`);
    res.json({
      success: true,
      token,
      user: { username: user.username, role: user.role, email: user.email },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/forgot-password/request", async (req, res) => {
  try {
    const { email } = req.body;
    const userRes = await pool.query(
      "SELECT username FROM timesheet_users WHERE email = $1",
      [email],
    );
    if (userRes.rows.length === 0)
      return res.json({ success: false, message: "Email not found." });
 
    const username = userRes.rows[0].username;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
 
    await pool.query(
      "UPDATE timesheet_users SET reset_otp = $1, otp_expiry = $2 WHERE email = $3",
      [otp, expiry, email],
    );
 
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"Timesheet System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Password Reset OTP`,
      html: `<div style="padding:20px;"><h2>Password Reset Request</h2><p>Hello ${username},</p><p>Your OTP is: <b style="font-size:24px; color:#0d6efd;">${otp}</b></p></div>`,
    });
 
    await logAudit(
      { username: email },
      "OTP_REQUEST",
      `Password reset OTP generated`,
    );
    res.json({ success: true, message: `OTP sent successfully.` });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const userRes = await pool.query(
      "SELECT username, reset_otp, otp_expiry FROM timesheet_users WHERE email = $1",
      [email],
    );
    if (userRes.rows.length === 0)
      return res.json({
        success: false,
        message: "No active OTP request found.",
      });
 
    const storedData = userRes.rows[0];
    if (!storedData.reset_otp)
      return res.json({
        success: false,
        message: "No active OTP request found.",
      });
 
    if (new Date() > new Date(storedData.otp_expiry)) {
      await pool.query(
        "UPDATE timesheet_users SET reset_otp = NULL, otp_expiry = NULL WHERE email = $1",
        [email],
      );
      return res.json({ success: false, message: "OTP expired." });
    }
 
    if (storedData.reset_otp !== otp)
      return res.json({ success: false, message: "Incorrect OTP." });
 
    const hashedNew = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE timesheet_users SET password_hash = $1, reset_otp = NULL, otp_expiry = NULL WHERE email = $2",
      [hashedNew, email],
    );
 
    await logAudit(
      { username: storedData.username },
      "PASSWORD_RESET",
      `Password successfully reset via OTP`,
    );
    res.json({ success: true, message: "Password reset successful!" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.get("/admin/users", verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, status, created_at FROM timesheet_users ORDER BY created_at DESC",
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/admin/update-user", verifySuperAdmin, async (req, res) => {
  try {
    const { userId, role, status } = req.body;
    await pool.query(
      "UPDATE timesheet_users SET role = $1, status = $2 WHERE id = $3",
      [role, status, userId],
    );
    await logAudit(
      req.user,
      "USER_UPDATE",
      `Updated user ID ${userId} to Role: ${role}, Status: ${status}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.get("/read-erp-data", verifyToken, async (req, res) => {
  try {
    const headerResult = await pool.query(
      "SELECT header_name FROM erp_headers ORDER BY col_order ASC",
    );
    let headers = headerResult.rows.map((h) => h.header_name);
    const dataResult = await pool.query(
      "SELECT sn, plate_number, site, record_data FROM erp_records ORDER BY sn ASC",
    );
    res.json({ success: true, headers: headers, records: dataResult.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// RULES
// ==========================================
router.get("/api/rules", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM timesheet_rules ORDER BY id ASC",
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/update-rule", verifySuperAdmin, async (req, res) => {
  try {
    const {
      id,
      site_keyword,
      deduct_under_11,
      deduct_over_12,
      default_deduct,
    } = req.body;
    await pool.query(
      "UPDATE timesheet_rules SET site_keyword=$1, deduct_under_11=$2, deduct_over_12=$3, default_deduct=$4 WHERE id=$5",
      [site_keyword, deduct_under_11, deduct_over_12, default_deduct, id],
    );
    await logAudit(req.user, "RULE_UPDATE", `Updated timesheet rule ID ${id}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/add-rule", verifySuperAdmin, async (req, res) => {
  try {
    const { site_keyword, deduct_under_11, deduct_over_12, default_deduct } =
      req.body;
    await pool.query(
      "INSERT INTO timesheet_rules (site_keyword, deduct_under_11, deduct_over_12, default_deduct) VALUES ($1, $2, $3, $4)",
      [site_keyword, deduct_under_11, deduct_over_12, default_deduct],
    );
    await logAudit(
      req.user,
      "RULE_ADD",
      `Added new timesheet rule for site ${site_keyword}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// SPECIAL DAYS & EXCEPTION RULES API
// ==========================================
 
// Fetch all special rules
router.get("/api/special-rules", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM special_days_rules ORDER BY created_at DESC",
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// Add a new special rule
router.post("/api/add-special-rule", verifySuperAdmin, async (req, res) => {
  try {
    const { sites, dates, rule_type, reason, is_active } = req.body;
    await pool.query(
      "INSERT INTO special_days_rules (sites, dates, rule_type, reason, is_active) VALUES ($1, $2, $3, $4, $5)",
      [
        JSON.stringify(sites),
        JSON.stringify(dates),
        rule_type,
        reason,
        is_active !== undefined ? is_active : true,
      ],
    );
    await logAudit(
      req.user,
      "SPECIAL_RULE_ADD",
      `Added new special rule: ${rule_type}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// Update an existing special rule
router.post("/api/update-special-rule", verifySuperAdmin, async (req, res) => {
  try {
    const { id, sites, dates, rule_type, reason, is_active } = req.body;
    await pool.query(
      "UPDATE special_days_rules SET sites=$1, dates=$2, rule_type=$3, reason=$4, is_active=$5 WHERE id=$6",
      [
        JSON.stringify(sites),
        JSON.stringify(dates),
        rule_type,
        reason,
        is_active,
        id,
      ],
    );
    await logAudit(
      req.user,
      "SPECIAL_RULE_UPDATE",
      `Updated special rule ID ${id}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// Delete a special rule
router.post("/api/delete-special-rule", verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("DELETE FROM special_days_rules WHERE id=$1", [id]);
    await logAudit(
      req.user,
      "SPECIAL_RULE_DELETE",
      `Deleted special rule ID ${id}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// VEHICLE DRIVER & SITE LOGS
// ==========================================
router.get("/api/vehicle-info", async (req, res) => {
  try {
    const { plate } = req.query;
    let query = "SELECT * FROM timesheet_vehicles";
    let params = [];
    if (plate) {
      query += " WHERE plate_no ILIKE $1 LIMIT 1";
      params = [`%${plate}%`];
    }
    const result = await pool.query(query, params);
 
    // 🟢 എല്ലാ പ്ലേറ്റ് മാറ്റങ്ങളുടെയും ലോഗുകൾ എടുത്ത് അയക്കുന്നു
    const plateLogsRes = await pool.query(
      "SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC"
    );
    const plateLogs = plateLogsRes.rows;
 
    let vehicles = result.rows.map((v) => {
      let vPlate = (v.plate_no || "").trim().toUpperCase();
      let matchedLogs = plateLogs.filter(
        (pl) =>
          (pl.new_plate_no || "").trim().toUpperCase() === vPlate ||
          (pl.old_plate_no || "").trim().toUpperCase() === vPlate
      );
      return {
        ...v,
        plate_logs: matchedLogs,
      };
    });
 
    res.json({ success: true, data: plate ? vehicles[0] : vehicles });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// VEHICLE LOGS (Driver, Site, Owner, Rate)
// ==========================================
router.get("/api/vehicle-logs", verifyToken, async (req, res) => {
  try {
    const { plate } = req.query;
    const [driverLogs, siteLogs, ownerLogs, rateLogs, plateLogs] = await Promise.all([
      pool.query(`SELECT * FROM vehicle_driver_log WHERE plate_no=$1 ORDER BY CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC, COALESCE(work_start_date, work_end_date, '1970-01-01') DESC, id DESC`, [plate]),
      pool.query(`SELECT * FROM vehicle_site_log WHERE plate_no=$1 ORDER BY CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC, COALESCE(work_start_date, work_end_date, '1970-01-01') DESC, id DESC`, [plate]),
      pool.query(`SELECT * FROM vehicle_owner_log WHERE plate_no=$1 ORDER BY CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC, COALESCE(work_start_date, work_end_date, '1970-01-01') DESC, id DESC`, [plate]),
      pool.query(`SELECT * FROM vehicle_rate_log WHERE plate_no=$1 ORDER BY CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC, COALESCE(work_start_date, work_end_date, '1970-01-01') DESC, id DESC`, [plate]),
      pool.query(`SELECT * FROM vehicle_plate_log WHERE UPPER(new_plate_no)=UPPER($1) OR UPPER(old_plate_no)=UPPER($1) ORDER BY change_date DESC, id DESC`, [plate])
    ]);
 
    res.json({
      success: true,
      drivers: driverLogs.rows,
      sites: siteLogs.rows,
      owners: ownerLogs.rows,
      rates: rateLogs.rows,
      plateChanges: plateLogs.rows
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// Update Owner Log
router.post("/api/update-owner-log", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { id, plate_no, owner_name, owner_mobile, vat, vat_no, company_display_name, work_start_date, work_end_date, status, reason } = req.body;
    const calculatedStatus = work_end_date ? "Released" : (status || "Running");
 
    let finalStartDate = work_start_date || null;
    if (!finalStartDate && !id) {
      const minSiteRes = await client.query(
        `SELECT MIN(work_start_date) as first_start FROM vehicle_site_log WHERE UPPER(plate_no) = UPPER($1) AND work_start_date IS NOT NULL`,
        [plate_no]
      );
      finalStartDate = minSiteRes.rows[0]?.first_start || null;
    }
 
    if (id) {
      await client.query(
        `UPDATE vehicle_owner_log SET owner_name=$1, owner_mobile=$2, vat=$3, vat_no=$4, company_display_name=$5, work_start_date=$6, work_end_date=$7, status=$8, reason=$9 WHERE id=$10`,
        [owner_name, owner_mobile, vat, vat_no || null, company_display_name, finalStartDate, work_end_date || null, calculatedStatus, reason || null, id]
      );
    } else {
      await client.query(
        `INSERT INTO vehicle_owner_log (plate_no, owner_name, owner_mobile, vat, vat_no, company_display_name, work_start_date, work_end_date, status, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [plate_no, owner_name, owner_mobile, vat, vat_no || null, company_display_name, finalStartDate, work_end_date || null, calculatedStatus, reason || null]
      );
    }
 
    if (calculatedStatus === "Running") {
      await client.query(
        `UPDATE timesheet_vehicles SET owner_name=$1, owner_mobile=$2, vat=$3, vat_no=$4, company_display_name_=$5 WHERE UPPER(plate_no)=UPPER($6)`,
        [owner_name, owner_mobile, vat, vat_no || null, company_display_name, plate_no]
      );
    }
 
    await logAudit(req.user, "OWNER_LOG_UPDATE", `Updated owner log for ${plate_no}`);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
 
// Update Rate Log
router.post("/api/update-rate-log", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { id, plate_no, site_name, rate, work_start_date, work_end_date, status, reason } = req.body;
    const calculatedStatus = work_end_date ? "Released" : (status || "Running");
 
    if (id) {
      await client.query(
        `UPDATE vehicle_rate_log SET site_name=$1, rate=$2, work_start_date=$3, work_end_date=$4, status=$5, reason=$6 WHERE id=$7`,
        [site_name, rate || null, work_start_date || null, work_end_date || null, calculatedStatus, reason || null, id]
      );
    } else {
      await client.query(
        `INSERT INTO vehicle_rate_log (plate_no, site_name, rate, work_start_date, work_end_date, status, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [plate_no, site_name, rate || null, work_start_date || null, work_end_date || null, calculatedStatus, reason || null]
      );
    }
 
    if (calculatedStatus === "Running") {
      let siteCondition = site_name && site_name.trim() !== "" ? "AND UPPER(site_name)=UPPER($3)" : "";
      let siteParams = [rate || null, plate_no];
      if (siteCondition) siteParams.push(site_name);
 
      await client.query(
        `UPDATE vehicle_site_log SET rate=$1 WHERE UPPER(plate_no)=UPPER($2) ${siteCondition}`,
        siteParams
      );
      await client.query(
        `UPDATE timesheet_vehicles SET rate=$1 WHERE UPPER(plate_no)=UPPER($2)`,
        [rate || null, plate_no]
      );
    }
 
    await logAudit(req.user, "RATE_LOG_UPDATE", `Updated rate log for ${plate_no}`);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
 
// Delete Log Entry support for Owner & Rate
router.post("/api/delete-log-entry", verifyEditor, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!id) throw new Error("Log ID missing");
 
    if (type === "driver") {
      await pool.query("DELETE FROM vehicle_driver_log WHERE id=$1", [id]);
    } else if (type === "site") {
      await pool.query("DELETE FROM vehicle_site_log WHERE id=$1", [id]);
    } else if (type === "owner") {
      await pool.query("DELETE FROM vehicle_owner_log WHERE id=$1", [id]);
    } else if (type === "rate") {
      await pool.query("DELETE FROM vehicle_rate_log WHERE id=$1", [id]);
    } else {
      throw new Error("Invalid log type");
    }
    await logAudit(req.user, "LOG_DELETE", `Deleted ${type} log ID ${id}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.get("/api/all-logs", verifyToken, async (req, res) => {
  try {
    const driverLogs = await pool.query(`
            SELECT id, plate_no, driver_name, driver_mobile, reason,
            TO_CHAR(work_start_date, 'YYYY-MM-DD') as start_date, 
            TO_CHAR(work_end_date, 'YYYY-MM-DD') as end_date, status
            FROM vehicle_driver_log 
            ORDER BY plate_no ASC,
            CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC,
            COALESCE(work_start_date, work_end_date, '1970-01-01') DESC
        `);
 
    const siteColCheck = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='vehicle_site_log' AND column_name='asset_code'",
    );
 
    let selectCols =
      "id, plate_no, site_name, rate, old_vehicle_no, new_vehicle_no, field_co, site_co, reason, TO_CHAR(work_start_date, 'YYYY-MM-DD') as start_date, TO_CHAR(work_end_date, 'YYYY-MM-DD') as end_date, status, replaced_by, vehicle_type";
    if (siteColCheck.rows.length > 0) {
      selectCols += ", asset_code, work_order_no";
    }
 
    const siteLogs = await pool.query(`
            SELECT ${selectCols}
            FROM vehicle_site_log 
            ORDER BY plate_no ASC,
            CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC,
            COALESCE(work_start_date, work_end_date, '1970-01-01') DESC
        `);
 
    const ownerLogs = await pool.query(`
            SELECT id, plate_no, owner_name, owner_mobile, vat, vat_no, company_display_name, reason,
            TO_CHAR(work_start_date, 'YYYY-MM-DD') as start_date,
            TO_CHAR(work_end_date, 'YYYY-MM-DD') as end_date, status
            FROM vehicle_owner_log
            ORDER BY plate_no ASC,
            CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC,
            COALESCE(work_start_date, work_end_date, '1970-01-01') DESC
        `);
  
    const rateLogs = await pool.query(`
            SELECT id, plate_no, site_name, rate, reason,
            TO_CHAR(work_start_date, 'YYYY-MM-DD') as start_date,
            TO_CHAR(work_end_date, 'YYYY-MM-DD') as end_date, status
            FROM vehicle_rate_log
            ORDER BY plate_no ASC,
            CASE WHEN status = 'Running' THEN 1 ELSE 2 END ASC,
            COALESCE(work_start_date, work_end_date, '1970-01-01') DESC
        `);
 
    res.json({
      success: true,
      drivers: driverLogs.rows,
      sites: siteLogs.rows,
      owners: ownerLogs.rows,
      rates: rateLogs.rows,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// 🟢 Fast inline update for Driver & Site Logs from Main Table (Optimized with Transactions)
router.post("/api/fast-update-log", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { type, id, plate_no, field, value } = req.body;
    if (!id) throw new Error("Log ID missing. Please create a log first.");
 
    let dateVal = value || null;
 
    if (type === "driver") {
      if (field === "end") {
        let status = dateVal ? "Released" : "Running";
        await client.query(
          "UPDATE vehicle_driver_log SET work_end_date=$1, status=$2 WHERE id=$3",
          [dateVal, status, id],
        );
        if (status === "Running") {
          const dLog = await client.query(
            "SELECT driver_name, driver_mobile FROM vehicle_driver_log WHERE id=$1",
            [id],
          );
          if (dLog.rows.length > 0) {
            await client.query(
              `UPDATE timesheet_vehicles SET driver_name=$1, driver_mobile=$2 WHERE UPPER(plate_no)=UPPER($3)`,
              [dLog.rows[0].driver_name, dLog.rows[0].driver_mobile, plate_no],
            );
          }
        }
      } else if (field === "start") {
        await client.query(
          "UPDATE vehicle_driver_log SET work_start_date=$1 WHERE id=$2",
          [dateVal, id],
        );
      }
    } else if (type === "site") {
      if (field === "end") {
        let status = dateVal ? "Released" : "Running";
        await client.query(
          "UPDATE vehicle_site_log SET work_end_date=$1, status=$2 WHERE id=$3",
          [dateVal, status, id],
        );
        if (status === "Running") {
          const sLog = await client.query(
            "SELECT site_name FROM vehicle_site_log WHERE id=$1",
            [id],
          );
          if (sLog.rows.length > 0) {
            await client.query(
              `UPDATE timesheet_vehicles SET site_name=$1 WHERE UPPER(plate_no)=UPPER($2)`,
              [sLog.rows[0].site_name, plate_no],
            );
          }
        }
      } else if (field === "start") {
        await client.query(
          "UPDATE vehicle_site_log SET work_start_date=$1 WHERE id=$2",
          [dateVal, id],
        );
      } else if (field === "rate") {
        await client.query("UPDATE vehicle_site_log SET rate=$1 WHERE id=$2", [
          dateVal,
          id,
        ]);
        let sLog = await client.query(
          "SELECT status FROM vehicle_site_log WHERE id=$1",
          [id],
        );
        if (sLog.rows[0].status === "Running")
          await client.query(
            "UPDATE timesheet_vehicles SET rate=$1 WHERE UPPER(plate_no)=UPPER($2)",
            [dateVal, plate_no],
          );
      } else if (field === "old_veh") {
        await client.query(
          "UPDATE vehicle_site_log SET old_vehicle_no=$1 WHERE id=$2",
          [dateVal, id],
        );
      } else if (field === "new_veh") {
        await client.query(
          "UPDATE vehicle_site_log SET new_vehicle_no=$1 WHERE id=$2",
          [dateVal, id],
        );
      } else if (field === "field_co" || field === "site_co") {
        await client.query(
          `UPDATE vehicle_site_log SET ${field}=$1 WHERE id=$2`,
          [dateVal, id],
        );
        let sLog = await client.query(
          "SELECT status FROM vehicle_site_log WHERE id=$1",
          [id],
        );
        if (sLog.rows[0].status === "Running")
          await client.query(
            `UPDATE timesheet_vehicles SET ${field}=$1 WHERE UPPER(plate_no)=UPPER($2)`,
            [dateVal, plate_no],
          );
      }
    }
 
    await logAudit(
      req.user,
      "FAST_UPDATE",
      `Updated ${type} log for vehicle ${plate_no}. Field: ${field}`,
    );
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: e.message });
  } finally {
    client.release();
  }
});
 
// 🟢 Reverse Sync for Driver Updates (Optimized with Transactions)
router.post("/api/update-driver-log", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      id,
      plate_no,
      driver_name,
      driver_mobile,
      work_start_date,
      work_end_date,
      reason,
    } = req.body;
    const status = work_end_date ? "Released" : "Running";
 
    if (id) {
      await client.query(
        "UPDATE vehicle_driver_log SET driver_name=$1, driver_mobile=$2, work_start_date=$3, work_end_date=$4, status=$5, reason=$6 WHERE id=$7",
        [
          driver_name,
          driver_mobile,
          work_start_date || null,
          work_end_date || null,
          status,
          reason || null,
          id,
        ],
      );
    } else {
      await client.query(
        "INSERT INTO vehicle_driver_log (plate_no, driver_name, driver_mobile, work_start_date, work_end_date, status, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          plate_no,
          driver_name,
          driver_mobile,
          work_start_date || null,
          work_end_date || null,
          status,
          reason || null,
        ],
      );
    }
 
    if (status === "Running") {
      await client.query(
        `UPDATE timesheet_vehicles SET driver_name=$1, driver_mobile=$2 WHERE UPPER(plate_no)=UPPER($3)`,
        [driver_name, driver_mobile, plate_no],
      );
    }
 
    await logAudit(
      req.user,
      "DRIVER_LOG_UPDATE",
      `Updated driver log for ${plate_no}`,
    );
    await client.query("COMMIT");
    res.json({ success: true, calculated_status: status });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
  
// 🟢 Reverse Sync for Site Updates (Optimized with Transactions & Field/Site CO)
router.post("/api/update-site-log", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      id,
      plate_no,
      site_name,
      work_start_date,
      work_end_date,
      status,
      replaced_by,
      asset_code,
      work_order_no,
      rate,
      old_vehicle_no,
      new_vehicle_no,
      field_co,
      site_co,
      reason,
      vehicle_type,
    } = req.body;
 
    let updateCols = [
      "site_name=$1",
      "work_start_date=$2",
      "work_end_date=$3",
      "status=$4",
      "replaced_by=$5",
      "rate=$6",
      "old_vehicle_no=$7",
      "new_vehicle_no=$8",
      "field_co=$9",
      "site_co=$10",
      "reason=$11",
      "vehicle_type=$12",
    ];
    let updateVals = [
      site_name,
      work_start_date || null,
      work_end_date || null,
      status,
      replaced_by || null,
      rate || null,
      old_vehicle_no || null,
      new_vehicle_no || null,
      field_co || null,
      site_co || null,
      reason || null,
      vehicle_type || null,
    ];
 
    let insertCols = [
      "plate_no",
      "site_name",
      "work_start_date",
      "work_end_date",
      "status",
      "replaced_by",
      "rate",
      "old_vehicle_no",
      "new_vehicle_no",
      "field_co",
      "site_co",
      "reason",
      "vehicle_type",
    ];
    let insertVals = [
      plate_no,
      site_name,
      work_start_date || null,
      work_end_date || null,
      status,
      replaced_by || null,
      rate || null,
      old_vehicle_no || null,
      new_vehicle_no || null,
      field_co || null,
      site_co || null,
      reason || null,
      vehicle_type || null,
    ];
 
    if (asset_code !== undefined) {
      updateCols.push(`asset_code=$${updateVals.length + 1}`);
      updateVals.push(asset_code || null);
      insertCols.push("asset_code");
      insertVals.push(asset_code || null);
    }
    if (work_order_no !== undefined) {
      updateCols.push(`work_order_no=$${updateVals.length + 1}`);
      updateVals.push(work_order_no || null);
      insertCols.push("work_order_no");
      insertVals.push(work_order_no || null);
    }
 
    if (id) {
      updateVals.push(id);
      await client.query(
        `UPDATE vehicle_site_log SET ${updateCols.join(", ")} WHERE id=$${updateVals.length}`,
        updateVals,
      );
    } else {
      let placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `INSERT INTO vehicle_site_log (${insertCols.join(", ")}) VALUES (${placeholders})`,
        insertVals,
      );
    }
 
    if (status === "Running") {
      let tsUpdates = ["site_name=$1", "rate=$2", "field_co=$3", "site_co=$4", "vehicle_type=$5"];
      let tsVals = [site_name, rate || null, field_co || null, site_co || null, vehicle_type || null];
 
      if (asset_code !== undefined) {
        tsUpdates.push(`asset_code=$${tsVals.length + 1}`);
        tsVals.push(asset_code || null);
      }
      if (work_order_no !== undefined) {
        tsUpdates.push(`wrk_order_no=$${tsVals.length + 1}`);
        tsVals.push(work_order_no || null);
      }
      tsVals.push(plate_no);
      await client.query(
        `UPDATE timesheet_vehicles SET ${tsUpdates.join(", ")} WHERE UPPER(plate_no)=UPPER($${tsVals.length})`,
        tsVals,
      );
    }
 
    await logAudit(
      req.user,
      "SITE_LOG_UPDATE",
      `Updated site log for ${plate_no}`,
    );
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
 
router.post("/api/delete-log-entry", verifyEditor, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!id) throw new Error("Log ID missing");
 
    if (type === "driver") {
      await pool.query("DELETE FROM vehicle_driver_log WHERE id=$1", [id]);
    } else if (type === "site") {
      await pool.query("DELETE FROM vehicle_site_log WHERE id=$1", [id]);
    } else {
      throw new Error("Invalid log type");
    }
    await logAudit(req.user, "LOG_DELETE", `Deleted ${type} log ID ${id}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// ==========================================
// RECORD LOCKING (CONCURRENCY CONTROL & LIVE TRANSFER)
// ==========================================
const activeRecordLocks = new Map();
const recordLockTimeout = 10 * 60 * 1000;
const transferRequestTimeout = 15 * 1000;
 
function recordLockKey({ plate, month, year }) {
  if (!plate || !month || !year) return null;
  return `${String(plate).replace(/\s+/g, "").toUpperCase()}_${month}_${year}`;
}
 
function sameLockUser(first, second) {
  return String(first).trim().toLowerCase() === String(second).trim().toLowerCase();
}
 
function getActiveRecordLock(key) {
  const lock = activeRecordLocks.get(key);
  if (lock && Date.now() - lock.timestamp >= recordLockTimeout) {
    activeRecordLocks.delete(key);
    return null;
  }
  if (lock && lock.requestedBy && lock.requestedBy !== "REJECTED" &&
      Date.now() - lock.requesterSeenAt >= transferRequestTimeout) {
    lock.requestedBy = null;
    lock.requestTime = null;
    lock.requesterSeenAt = null;
  }
  return lock;
}
 
// 🟢 ROBUST MULTI-USER CONCURRENCY CONTROL
router.post("/api/record-lock/request", verifyToken, (req, res) => {
  const lockKey = recordLockKey(req.body);
  if (!lockKey) {
    return res.json({ success: false, message: "Missing lock parameters" });
  }
 
  const currentUsername = String(req.user.username).trim();
  const now = Date.now();
 
  const existingLock = getActiveRecordLock(lockKey);
 
  if (existingLock) {
    const lockOwner = String(existingLock.username).trim();
 
    // 🟢 1. സ്വന്തം ലോക്ക് ആണെങ്കിൽ എപ്പോഴും ആക്സസ് നൽകുക (Never block the owner)
    if (sameLockUser(lockOwner, currentUsername)) {
      existingLock.timestamp = now; // Refresh activity timestamp
      existingLock.leaseId = randomUUID();
      return res.json({ success: true, owner: lockOwner, leaseId: existingLock.leaseId });
    }
 
    return res.json({ success: false, lockedBy: existingLock.username });
  }
 
  // പുതിയ ലോക്ക് ഓണർഷിപ്പ് നൽകുന്നു
  const leaseId = randomUUID();
  activeRecordLocks.set(lockKey, {
    username: currentUsername,
    timestamp: now,
     leaseId,
    requestedBy: null,
    requestTime: null,
    requesterSeenAt: null,
  });
  res.json({ success: true, owner: currentUsername, leaseId });
});
 
// 🟢 INSTANT RELEASE: ടാബ് മാറുമ്പോഴോ ക്ലോസ് ചെയ്യുമ്പോഴോ ഉടനടി റിലീസ് ചെയ്യുന്നു
router.post("/api/record-lock/release", verifyToken, (req, res) => {
  const lockKey = recordLockKey(req.body);
  if (!lockKey) return res.json({ success: true });
 
  const existingLock = getActiveRecordLock(lockKey);
  if (existingLock) {
    // ആ വ്യക്തി തന്നെയാണ് റിലീസ് ചെയ്യുന്നതെങ്കിൽ ഉടൻ മായ്ക്കുന്നു
     if (req.body.leaseId && sameLockUser(existingLock.username, req.user.username) &&
        existingLock.leaseId === req.body.leaseId) {
      activeRecordLocks.delete(lockKey);
    }
  }
  res.json({ success: true });
});
 
// 🟢 RESOLVE TRANSFER: യൂസർ 2-ന് ഓണർഷിപ്പ് പെർമനന്റായി കൈമാറുന്നു
router.post("/api/record-lock/resolve-transfer", verifyToken, (req, res) => {
  const { action } = req.body;
  const lockKey = recordLockKey(req.body);
  if (!lockKey) return res.json({ success: false, message: "Missing lock parameters" });
  const lock = getActiveRecordLock(lockKey);
 
  if (!lock) return res.json({ success: false, message: "No active lock" });
 
  const requester = lock.requestedBy;
 
  if (action === "force" && requester && requester !== "REJECTED" &&
      !sameLockUser(lock.username, requester) && sameLockUser(requester, req.user.username) &&
      lock.requestTime && Date.now() - lock.requestTime >= 30000) {
    lock.username = req.user.username; // User 2 becomes owner
    lock.timestamp = Date.now();
    lock.leaseId = null;
    lock.requestedBy = null;
    lock.requestTime = null;
    lock.requesterSeenAt = null;
    return res.json({ success: true, newOwner: lock.username });
  } else if (sameLockUser(lock.username, req.user.username)) {
    if (action === "approve" && requester && requester !== "REJECTED" && !sameLockUser(lock.username, requester)) {
      lock.username = requester; // Hand over to User 2
      lock.timestamp = Date.now();
      lock.leaseId = null;
      lock.requestedBy = null;
      lock.requestTime = null;
      lock.requesterSeenAt = null;
      return res.json({ success: true, newOwner: lock.username });
    } else if (action === "reject" && requester && requester !== "REJECTED") {
      lock.requestedBy = "REJECTED";
      lock.requestTime = null;
      lock.requesterSeenAt = null;
      return res.json({ success: true });
    }
  }
 
  res.json({ success: false });
});
 
// 🟢 POLL CHECK: തത്സമയം നിലവിലെ സ്റ്റാറ്റസ് ഉറപ്പുവരുത്തുന്നു
router.get("/api/record-lock/poll", verifyToken, (req, res) => {
  const { plate, month, year } = req.query;
  const lockKey = recordLockKey({ plate, month, year });
  if (!lockKey) return res.json({ locked: false });
  const lock = getActiveRecordLock(lockKey);
 
  if (!lock) {
    return res.json({ locked: false });
  }
 
  const isOwner = sameLockUser(lock.username, req.user.username);
  if (isOwner) lock.timestamp = Date.now();
  if (lock.requestedBy && lock.requestedBy !== "REJECTED" && sameLockUser(lock.requestedBy, req.user.username)) {
    lock.requesterSeenAt = Date.now();
  }
  res.json({
    locked: true,
    owner: lock.username,
    isOwner,
    requestedBy: lock.requestedBy,
    requestedByMe: lock.requestedBy !== "REJECTED" && !!lock.requestedBy && sameLockUser(lock.requestedBy, req.user.username),
    requestTime: lock.requestTime,
  });
});
 
// 🟢 NEW: API for User B to request edit access
router.post("/api/record-lock/request-transfer", verifyToken, (req, res) => {
  const lockKey = recordLockKey(req.body);
  if (!lockKey) return res.json({ success: false, message: "Missing lock parameters" });
  const lock = getActiveRecordLock(lockKey);
  if (!lock) return res.json({ success: false, message: "Record is not currently locked." });
  if (sameLockUser(lock.username, req.user.username)) {
    return res.json({ success: false, message: "You already have edit access." });
  }
  if (lock.requestedBy && lock.requestedBy !== "REJECTED" && !sameLockUser(lock.requestedBy, req.user.username)) {
    return res.json({ success: false, message: "Another request is pending." });
  }
  lock.requestedBy = req.user.username;
  lock.requestTime = Date.now();
  lock.requesterSeenAt = lock.requestTime;
  res.json({ success: true });
});
 
// 🟢 NEW: Clear Rejection Status
router.post("/api/record-lock/clear-rejection", verifyToken, (req, res) => {
  const lockKey = recordLockKey(req.body);
  if (!lockKey) return res.json({ success: false, message: "Missing lock parameters" });
  const lock = getActiveRecordLock(lockKey);
  
  if (lock && lock.requestedBy === "REJECTED" && !sameLockUser(lock.username, req.user.username)) {
      lock.requestedBy = null;
      lock.requesterSeenAt = null;
  }
  res.json({ success: true });
});
 
// ==========================================
// GRID DATA ENTRY & BULK IMPORT
// ==========================================
router.get("/api/grid-data", verifyToken, async (req, res) => {
  try {
    const { month, year, plate } = req.query;
    let query =
      "SELECT * FROM timesheet_daily_records WHERE month=$1 AND year=$2";
    let params = [month, year];
    let allRelatedPlates = [];
    let plateLogs = [];
 
    if (plate) {
      const cleanPlate = plate.trim().toUpperCase();
      allRelatedPlates.push(cleanPlate);
 
      // Fetch all plate change history where this plate is involved as old or new
      const pLogs = await pool.query(
        `SELECT * FROM vehicle_plate_log 
         WHERE UPPER(TRIM(old_plate_no)) = $1 OR UPPER(TRIM(new_plate_no)) = $1
         ORDER BY change_date ASC, id ASC`,
        [cleanPlate]
      );
      plateLogs = pLogs.rows;
 
      plateLogs.forEach((pl) => {
        const oP = (pl.old_plate_no || "").trim().toUpperCase();
        const nP = (pl.new_plate_no || "").trim().toUpperCase();
        if (oP && !allRelatedPlates.includes(oP)) allRelatedPlates.push(oP);
        if (nP && !allRelatedPlates.includes(nP)) allRelatedPlates.push(nP);
      });
 
      // Also check if master vehicle table references this
      const masterCheck = await pool.query(
        `SELECT plate_no FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = $1`,
        [cleanPlate]
      );
      if (masterCheck.rows.length > 0 && !allRelatedPlates.includes(cleanPlate)) {
        allRelatedPlates.push(cleanPlate);
      }
 
      query += " AND UPPER(TRIM(plate_no)) = ANY($3::text[])";
      params.push(allRelatedPlates);
    }
 
    const result = await pool.query(query, params);
    let sortedData = result.rows.sort((a, b) => {
      return parseInt(a.record_date || 0) - parseInt(b.record_date || 0);
    });
 
    res.json({ 
      success: true, 
      data: sortedData, 
      plateLogs: plateLogs, 
      relatedPlates: allRelatedPlates 
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/upsert-grid-cell", verifyEditor, async (req, res) => {
  try {
    const {
      month,
      year,
      plate_no,
      record_date,
      col_name,
      col_value,
      calc_distance,
      calc_time,
    } = req.body;
    const allowedCols = [
      "wrk_start",
      "wrk_end",
      "hmr_start",
      "hmr_end",
      "fuel",
      "bd",
      "remark",
      "nl_checked",
    ];
    if (!allowedCols.includes(col_name))
      return res.json({ success: false, message: "Invalid column parameter" });
 
    const username = req.user.username; // Extracting user from token via verifyEditor
    const lock = getActiveRecordLock(recordLockKey({ plate: plate_no, month, year }));
    if (lock && !sameLockUser(lock.username, username)) {
      return res.json({ success: false, message: `Record is locked by ${lock.username}` });
    }
 
const query = `
            INSERT INTO timesheet_daily_records (month, year, plate_no, record_date, "${col_name}", calc_distance, calc_time, modified_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            ON CONFLICT (month, year, plate_no, record_date) 
            DO UPDATE SET 
                "${col_name}" = EXCLUDED."${col_name}", 
                calc_distance = EXCLUDED.calc_distance, 
                calc_time = EXCLUDED.calc_time, 
                modified_by = EXCLUDED.modified_by,
                updated_at = CURRENT_TIMESTAMP
        `;
    await pool.query(query, [
      month,
      year,
      plate_no,
      record_date,
      col_value,
      calc_distance,
      calc_time,
      username
    ]);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// 🟢 Bulk Import Optimization (Batched Transactions for Performance)
router.post("/api/bulk-import", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.json({
        success: false,
        message: "Invalid data format received.",
      });
    }
 
    await client.query("BEGIN");
    
    const username = req.user.username; // Extracting user from token via verifyEditor
 
    // Batch Processing Logic to speed up large imports (reduces overhead)
    for (let i = 0; i < records.length; i += 1000) {
      const batch = records.slice(i, i + 1000);
      for (let row of batch) {
        await client.query(
          `
                    INSERT INTO timesheet_daily_records 
                    (month, year, plate_no, record_date, wrk_start, wrk_end, hmr_start, hmr_end, fuel, bd, remark, nl_checked, calc_distance, calc_time, modified_by) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
                    ON CONFLICT (month, year, plate_no, record_date) 
                    DO UPDATE SET 
                        wrk_start = EXCLUDED.wrk_start, 
                        wrk_end = EXCLUDED.wrk_end, 
                        hmr_start = EXCLUDED.hmr_start, 
                        hmr_end = EXCLUDED.hmr_end, 
                        fuel = EXCLUDED.fuel, 
                        bd = EXCLUDED.bd, 
                        remark = EXCLUDED.remark, 
                        nl_checked = EXCLUDED.nl_checked, 
                        calc_distance = EXCLUDED.calc_distance, 
                        calc_time = EXCLUDED.calc_time, 
                        modified_by = EXCLUDED.modified_by,
                        updated_at = CURRENT_TIMESTAMP
                `,
          [
            row.month,
            row.year,
            row.plate_no,
            row.record_date,
            row.wrk_start,
            row.wrk_end,
            row.hmr_start,
            row.hmr_end,
            row.fuel,
            row.bd,
            row.remark,
            row.nl_checked,
            row.calc_distance,
            row.calc_time,
            username
          ],
        );
      }
    }
 
    await logAudit(
      req.user,
      "BULK_IMPORT_GRID",
      `Imported ${records.length} timesheet records`,
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      message: `Successfully imported ${records.length} records.`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
 
// ==========================================
// MASTER DATABASE MANAGEMENT
// ==========================================
router.get("/api/db/columns", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'timesheet_vehicles' AND column_name != 'plate_no' ORDER BY ordinal_position`,
    );
    res.json({ success: true, columns: result.rows.map((r) => r.column_name) });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.get("/api/db/data", verifyToken, async (req, res) => {
  try {
    // Auto-heal logic moved to Initialization block to improve DB read speed.
    const result = await pool.query(
      "SELECT * FROM timesheet_vehicles ORDER BY plate_no ASC",
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/update-cell", verifyEditor, async (req, res) => {
  try {
    const { plate_no, col_name, value } = req.body;
    const cleanCol = col_name.replace(/[^a-zA-Z0-9_]/g, "");
    
    // 1. Update the Main Master Table
    await pool.query(
      `UPDATE timesheet_vehicles SET "${cleanCol}" = $1 WHERE plate_no = $2`,
      [value, plate_no],
    );
 
    // 2. Auto-Sync to Active Driver Log (if applicable)
    if (["driver_name", "driver_mobile"].includes(cleanCol)) {
      await pool.query(
        `UPDATE vehicle_driver_log SET ${cleanCol} = $1 WHERE UPPER(plate_no) = UPPER($2) AND status = 'Running'`,
        [value, plate_no]
      );
    }
 
    // 3. Auto-Sync to Active Site Log (if applicable)
    if (["site_name", "rate", "field_co", "site_co", "asset_code", "work_order_no", "old_vehicle_no", "new_vehicle_no"].includes(cleanCol)) {
      await pool.query(
        `UPDATE vehicle_site_log SET ${cleanCol} = $1 WHERE UPPER(plate_no) = UPPER($2) AND status = 'Running'`,
        [value, plate_no]
      );
    }
 
    // 4. Auto-Sync to Active Owner Log & Billing Records
    if (["owner_name", "owner_mobile", "vat", "vat_no", "company_display_name", "company_display_name_"].includes(cleanCol)) {
      let targetCol = cleanCol === "company_display_name_" ? "company_display_name" : cleanCol;
      
      // Check if an active running owner log exists
      const checkActive = await pool.query(
        `SELECT id FROM vehicle_owner_log WHERE UPPER(TRIM(plate_no)) = UPPER(TRIM($1)) AND status = 'Running' ORDER BY id DESC LIMIT 1`,
        [plate_no]
      );
 
      if (checkActive.rows.length > 0) {
        await pool.query(
          `UPDATE vehicle_owner_log SET "${targetCol}" = $1 WHERE id = $2`,
          [value, checkActive.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO vehicle_owner_log (plate_no, "${targetCol}", status) VALUES ($1, $2, 'Running')`,
          [plate_no.trim().toUpperCase(), value]
        );
      }
 
      // 🟢 Modify billing_records and vat_billing_records directly if owner_name is corrected
      if (cleanCol === "owner_name" && value && value.trim()) {
        const cleanPlate = plate_no.trim().toUpperCase();
        const newOwner = value.trim();
 
        // 1. Update billing_records for this vehicle
        await pool.query(
          `UPDATE billing_records SET owner = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
          [newOwner, cleanPlate]
        );
 
        // 2. Find which site this vehicle is currently allocated to
        const vehicleSiteRes = await pool.query(
          `SELECT site_name FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = $1`,
          [cleanPlate]
        );
        const currentSite = vehicleSiteRes.rows[0]?.site_name;
 
        // 3. Sync vat_billing_records: move the billing for this site to the new supplier
        if (currentSite && currentSite.trim()) {
          await pool.query(
            `UPDATE vat_billing_records 
             SET supplier = $1 
             WHERE LOWER(TRIM(site_name)) = LOWER(TRIM($2))`,
            [newOwner, currentSite.trim()]
          );
        }
      }
    }
 
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/delete-row", verifyEditor, async (req, res) => {
  try {
    const { plate_no } = req.body;
    await pool.query(`DELETE FROM timesheet_vehicles WHERE plate_no = $1`, [
      plate_no,
    ]);
    await logAudit(req.user, "VEHICLE_DELETE", `Deleted vehicle ${plate_no}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/add-row", verifyEditor, async (req, res) => {
  try {
    let { plate_no } = req.body;
    plate_no = plate_no.trim().toUpperCase();
    await pool.query(
      `INSERT INTO timesheet_vehicles (plate_no) VALUES ($1) ON CONFLICT DO NOTHING`,
      [plate_no],
    );
    await logAudit(req.user, "VEHICLE_ADD", `Added new vehicle ${plate_no}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/add-column", verifySuperAdmin, async (req, res) => {
  try {
    const { col_name } = req.body;
    const cleanCol = col_name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    await pool.query(
      `ALTER TABLE timesheet_vehicles ADD COLUMN "${cleanCol}" VARCHAR(255)`,
    );
    await logAudit(
      req.user,
      "COLUMN_ADD",
      `Added column ${cleanCol} to timesheet_vehicles`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/rename-column", verifySuperAdmin, async (req, res) => {
  try {
    const { old_name, new_name } = req.body;
    const cleanOld = old_name.replace(/[^a-zA-Z0-9_]/g, "");
    const cleanNew = new_name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    await pool.query(
      `ALTER TABLE timesheet_vehicles RENAME COLUMN "${cleanOld}" TO "${cleanNew}"`,
    );
    await logAudit(
      req.user,
      "COLUMN_RENAME",
      `Renamed column ${cleanOld} to ${cleanNew}`,
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/db/delete-column", verifySuperAdmin, async (req, res) => {
  try {
    const { col_name } = req.body;
    const cleanCol = col_name.replace(/[^a-zA-Z0-9_]/g, "");
    await pool.query(
      `ALTER TABLE timesheet_vehicles DROP COLUMN "${cleanCol}"`,
    );
    await logAudit(req.user, "COLUMN_DELETE", `Deleted column ${cleanCol}`);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// 🟢 BULK IMPORT FIX: Optimized with Batch Processing & Safety Checks
router.post("/api/db/bulk-import", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { records, driverLogs, siteLogs } = req.body;
 
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.json({
        success: false,
        message: "Invalid or empty data format received.",
      });
    }
 
    await client.query("BEGIN");
    const colRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'timesheet_vehicles'`,
    );
    const validCols = colRes.rows.map((r) => r.column_name);
 
    let excelPlates = [];
    for (let row of records) {
      let pNo =
        row["PLATE NO (Key)"] ||
        row["Plate No (Key)"] ||
        row["plate_no"] ||
        row["Plate No"] ||
        row["PLATE NO"];
      if (pNo) excelPlates.push(String(pNo).trim().toUpperCase());
    }
 
    if (excelPlates.length === 0) {
      throw new Error(
        "Could not find Plate No column. Import aborted to prevent data loss.",
      );
    }
 
    // Clean slate for imported plates
    await client.query(
      `DELETE FROM vehicle_driver_log WHERE NOT (UPPER(plate_no) = ANY($1))`,
      [excelPlates],
    );
    await client.query(
      `DELETE FROM vehicle_site_log WHERE NOT (UPPER(plate_no) = ANY($1))`,
      [excelPlates],
    );
    await client.query(
      `DELETE FROM timesheet_vehicles WHERE NOT (UPPER(plate_no) = ANY($1))`,
      [excelPlates],
    );
 
    // Batch inserting master DB records
    for (let row of records) {
      let pNo =
        row["PLATE NO (Key)"] ||
        row["Plate No (Key)"] ||
        row["plate_no"] ||
        row["Plate No"] ||
        row["PLATE NO"];
      if (!pNo) continue;
 
      if (row.wrk_start && row.wrk_end && isNaN(parseFloat(row.bd))) {
        row.bd = null;
      }
 
      pNo = String(pNo).trim().toUpperCase();
      let keys = ["plate_no"];
      let vals = [pNo];
      let updates = [];
 
      for (let key of Object.keys(row)) {
        let cleanKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
 
        if (key.toUpperCase() === "VAT (YES/NO)" || key.toUpperCase() === "VAT")
          cleanKey = "vat";
        if (key.toUpperCase() === "VEHICLE TYPE") cleanKey = "vehicle_type";
        if (key.toUpperCase() === "RATE") cleanKey = "rate";
        if (key.toUpperCase() === "FIELD CO") cleanKey = "field_co";
        if (key.toUpperCase() === "SITE CO") cleanKey = "site_co";
 
        if (cleanKey !== "plate_no" && validCols.includes(cleanKey)) {
          keys.push(`"${cleanKey}"`);
          vals.push(row[key]);
          updates.push(`"${cleanKey}" = EXCLUDED."${cleanKey}"`);
        }
      }
      let placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
      let updateQuery =
        updates.length > 0
          ? `ON CONFLICT (plate_no) DO UPDATE SET ${updates.join(", ")}`
          : `ON CONFLICT (plate_no) DO NOTHING`;
      await client.query(
        `INSERT INTO timesheet_vehicles (${keys.join(", ")}) VALUES (${placeholders}) ${updateQuery}`,
        vals,
      );
    }
 
    if (driverLogs !== undefined) {
      if (excelPlates.length > 0) {
        await client.query(
          `DELETE FROM vehicle_driver_log WHERE UPPER(plate_no) = ANY($1)`,
          [excelPlates],
        );
      }
      for (let row of driverLogs) {
        let pNo = row["Plate No"] || row["plate_no"];
        if (!pNo) continue;
        let dName = row["Driver Name"] || row["driver_name"];
        let dMob = row["Mobile No"] || row["mobile"] || row["driver_mobile"];
        let st = row["Start Date"] || row["start_date"];
        let ed = row["End Date"] || row["end_date"];
        let status = row["Status"] || row["status"] || "Running";
 
        st = st && st !== "-" && String(st).trim() !== "" ? st : null;
        ed = ed && ed !== "-" && String(ed).trim() !== "" ? ed : null;
 
        await client.query(
          `INSERT INTO vehicle_driver_log (plate_no, driver_name, driver_mobile, work_start_date, work_end_date, status) VALUES ($1, $2, $3, $4, $5, $6)`,
          [String(pNo).trim().toUpperCase(), dName, dMob, st, ed, status],
        );
      }
    }
 
    if (siteLogs !== undefined) {
      if (excelPlates.length > 0) {
        await client.query(
          `DELETE FROM vehicle_site_log WHERE UPPER(plate_no) = ANY($1)`,
          [excelPlates],
        );
      }
      for (let row of siteLogs) {
        let pNo = row["Plate No"] || row["plate_no"];
        if (!pNo) continue;
        let sName = row["Site Name"] || row["site_name"];
        let st = row["Start Date"] || row["start_date"];
        let ed = row["End Date"] || row["end_date"];
        let status = row["Status"] || row["status"] || "Running";
        let oldV = row["Old Vehicle No"] || row["old_vehicle_no"];
        let newV = row["New Vehicle No"] || row["new_vehicle_no"];
        let assetCode = row["Asset Code"] || row["asset_code"];
        let workOrder =
          row["WO No"] || row["Work Order No"] || row["work_order_no"];
        let rate = row["Rate"] || row["rate"];
        let fCo = row["Field CO"] || row["field_co"];
        let sCo = row["Site CO"] || row["site_co"];
 
        st = st && st !== "-" && String(st).trim() !== "" ? st : null;
        ed = ed && ed !== "-" && String(ed).trim() !== "" ? ed : null;
 
        await client.query(
          `INSERT INTO vehicle_site_log (plate_no, site_name, work_start_date, work_end_date, status, old_vehicle_no, new_vehicle_no, asset_code, work_order_no, rate, field_co, site_co) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            String(pNo).trim().toUpperCase(),
            sName,
            st,
            ed,
            status,
            oldV || null,
            newV || null,
            assetCode || null,
            workOrder || null,
            rate || null,
            fCo || null,
            sCo || null,
          ],
        );
      }
    }
 
    await logAudit(
      req.user,
      "BULK_IMPORT_MASTER",
      `Master Database bulk imported`,
    );
    await client.query(`
        UPDATE vehicle_site_log vsl
        SET rate = tv.rate
        FROM timesheet_vehicles tv
        WHERE UPPER(vsl.plate_no) = UPPER(tv.plate_no)
        AND vsl.status = 'Running'
        AND tv.rate IS NOT NULL
        AND tv.rate != ''
    `);
 
    await logAudit(
      req.user,
      "BULK_IMPORT_MASTER",
      `Master Database bulk imported`,
    );
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    res.json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
 
// ==========================================
// PUBLIC REPORT VIEW
// ==========================================
 
// ==========================================
// PUBLIC VEHICLE DATA FOR SUGGESTIONS (WITH PLATE LOGS)
// ==========================================
router.get("/api/public/vehicles", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT plate_no, owner_name, asset_code, site_name FROM timesheet_vehicles ORDER BY plate_no ASC",
    );
    const plateLogsRes = await pool.query(
      "SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC"
    );
    res.json({ 
      success: true, 
      data: result.rows,
      plateLogs: plateLogsRes.rows 
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
router.post("/api/public/view-report", async (req, res) => {
  try {
    const { month, year, filterType, filterValue } = req.body;
 
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
    const mIdx = monthNames.indexOf(month);
    if (mIdx === -1) throw new Error("Invalid Month Selection");
 
    const padMonth = String(mIdx + 1).padStart(2, "0");
    const lastDay = new Date(year, mIdx + 1, 0).getDate();
    const targetStartStr = `${year}-${padMonth}-01`;
    const targetEndStr = `${year}-${padMonth}-${lastDay}`;
 
    let vQuery = `
            SELECT tv.* FROM timesheet_vehicles tv
            WHERE EXISTS (
                SELECT 1 FROM vehicle_site_log vsl
                WHERE vsl.plate_no = tv.plate_no
                AND (vsl.work_start_date IS NULL OR vsl.work_start_date <= $1)
                AND (vsl.work_end_date IS NULL OR vsl.work_end_date >= $2)
        `;
 
    let vParams = [targetEndStr, targetStartStr];
    let paramCount = 2;
 
    if (filterValue) {
      if (filterType === "Plate No") {
        paramCount++;
        vQuery += ` AND (
          tv.plate_no ILIKE $${paramCount}
          OR EXISTS (
            SELECT 1 FROM vehicle_plate_log vpl 
            WHERE (UPPER(vpl.old_plate_no) = UPPER(tv.plate_no) OR UPPER(vpl.new_plate_no) = UPPER(tv.plate_no))
              AND (vpl.old_plate_no ILIKE $${paramCount} OR vpl.new_plate_no ILIKE $${paramCount})
          )
        )`;
        vParams.push(`%${filterValue}%`);
      } else if (filterType === "Owner Name") {
        paramCount++;
        vQuery += ` AND tv.owner_name ILIKE $${paramCount}`;
        vParams.push(`%${filterValue}%`);
      } else if (filterType === "Asset Code") {
        const colCheck = await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name='timesheet_vehicles' AND column_name='asset_code'",
        );
        if (colCheck.rows.length > 0) {
          paramCount++;
          vQuery += ` AND tv.asset_code ILIKE $${paramCount}`;
          vParams.push(`%${filterValue}%`);
        }
      } else if (filterType === "Site Name") {
        const sites = filterValue
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        paramCount++;
        vQuery += ` AND vsl.site_name = ANY($${paramCount})`;
        vParams.push(sites);
      } else if (filterType === "Bulk Mode") {
        const plates = filterValue
          .split(/[\n,]+/)
          .map((p) => p.trim().toUpperCase())
          .filter((p) => p);
        paramCount++;
        vQuery += ` AND UPPER(tv.plate_no) = ANY($${paramCount})`;
        vParams.push(plates);
      }
    }
 
    vQuery += ` ) ORDER BY tv.plate_no ASC`;
 
    const vehiclesResult = await pool.query(vQuery, vParams);
    let vehicles = vehiclesResult.rows;
 
    if (vehicles.length === 0) {
      return res.json({
        success: true,
        vehicles: [],
        records: [],
        logs: { drivers: [], sites: [] },
      });
    }
 
    const plates = vehicles.map((v) => v.plate_no);
 
    const recordsResult = await pool.query(
      "SELECT * FROM timesheet_daily_records WHERE month=$1 AND year=$2 AND plate_no = ANY($3)",
      [month, year, plates],
    );
    const driverLogs = await pool.query(
      "SELECT * FROM vehicle_driver_log WHERE plate_no = ANY($1)",
      [plates],
    );
    const siteLogs = await pool.query(
      "SELECT * FROM vehicle_site_log WHERE plate_no = ANY($1)",
      [plates],
    );
    const ownerLogs = await pool.query(
      "SELECT * FROM vehicle_owner_log WHERE plate_no = ANY($1)",
      [plates],
    );
    const rateLogs = await pool.query(
      "SELECT * FROM vehicle_rate_log WHERE plate_no = ANY($1)",
      [plates],
    );
    const plateLogs = await pool.query(
      "SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC"
    );
 
    res.json({
      success: true,
      vehicles: vehicles,
      records: recordsResult.rows,
      logs: { 
        drivers: driverLogs.rows, 
        sites: siteLogs.rows, 
        owners: ownerLogs.rows, 
        rates: rateLogs.rows,
        plates: plateLogs.rows
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
 
// Add this route anywhere before module.exports = router;
 
router.post("/api/db/update-plate-no", verifyEditor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { old_plate_no, new_plate_no, change_date, reason } = req.body;
    if (!old_plate_no || !new_plate_no)
      throw new Error("Missing plate numbers");
 
    const oldPlate = old_plate_no.replace(/\s+/g, ' ').trim().toUpperCase();
    const newPlate = new_plate_no.replace(/\s+/g, ' ').trim().toUpperCase();
    const effectiveDate = change_date ? change_date : new Date().toISOString().split('T')[0];
    const username = req.user ? req.user.username : 'Editor';
 
    if (oldPlate === newPlate)
      return res.json({ success: true, new_plate_no: newPlate });
 
    await client.query("BEGIN");
 
    // 1. Insert into Plate Change Log Table
    await client.query(
      `INSERT INTO vehicle_plate_log (old_plate_no, new_plate_no, change_date, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [oldPlate, newPlate, effectiveDate, reason || null, username]
    );
 
    // 2. Update Master Vehicles Table
    await client.query(
      `UPDATE timesheet_vehicles SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 3. Update Driver Logs
    await client.query(
      `UPDATE vehicle_driver_log SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 4. Update Site Logs
    await client.query(
      `UPDATE vehicle_site_log SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 5. Update Grid/Daily Records
    await client.query(
      `UPDATE timesheet_daily_records SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 6. Update Owner Logs
    await client.query(
      `UPDATE vehicle_owner_log SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 7. Update Rate Logs
    await client.query(
      `UPDATE vehicle_rate_log SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 8. Update Billing Records
    await client.query(
      `UPDATE billing_records SET plate_no = $1 WHERE UPPER(TRIM(plate_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    // 9. Update Replacement fields in site logs if referenced
    await client.query(
      `UPDATE vehicle_site_log SET old_vehicle_no = $1 WHERE UPPER(TRIM(old_vehicle_no)) = $2`,
      [newPlate, oldPlate],
    );
    await client.query(
      `UPDATE vehicle_site_log SET new_vehicle_no = $1 WHERE UPPER(TRIM(new_vehicle_no)) = $2`,
      [newPlate, oldPlate],
    );
 
    await logAudit(
      req.user,
      "PLATE_NO_UPDATE",
      `Changed plate no from ${oldPlate} to ${newPlate} (Date: ${effectiveDate}, Reason: ${reason || "N/A"})`,
    );
    await client.query("COMMIT");
 
    res.json({ success: true, new_plate_no: newPlate });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      res.json({
        success: false,
        message: "New Plate No already exists in the database. Merge or use a unique plate.",
      });
    } else {
      res.json({ success: false, message: error.message });
    }
  } finally {
    client.release();
  }
});

// KLM Security Check Route
router.post("/api/verify-klm", (req, res) => {
  try {
    const { code } = req.body;
 
    // Fetch the security code from the .env file
    const validCode = process.env.KLM_SECURITY_CODE;
 
    if (code === validCode) {
      res.json({ success: true, message: "Access Granted" });
    } else {
      res.json({ success: false, message: "Invalid Code" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});
 
// ==========================================
// AUTO CLEANUP & AUTO LOCK PROCESSES
// ==========================================
 
// 1. Auto Cleanup (Runs every 24 hours)
setInterval(async () => {
  try {
    const cleanupQuery = `
          DELETE FROM timesheet_entry_logs 
          WHERE created_at < NOW() - INTERVAL '100 days'
      `;
    const result = await pool.query(cleanupQuery);
    if (result.rowCount > 0) {
      console.log(`Auto Cleanup: Successfully deleted ${result.rowCount} old entry logs.`);
    }
  } catch (error) {
    console.error("Auto Cleanup Error:", error.message);
  }
}, 24 * 60 * 60 * 1000);
 
// 2. Auto Lock Process (2 Months Gap)
async function runAutoLock() {
  try {
    const now = new Date();
 
    const lockTargetDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
 
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const targetMonthStr = monthNames[lockTargetDate.getMonth()];
    const targetYear = lockTargetDate.getFullYear();
 
    const res = await pool.query("SELECT lock_month, lock_year FROM timesheet_lock_period WHERE id = 1");
 
    if (res.rows.length > 0) {
        const current = res.rows[0];
        let currentLockDate = new Date(1970, 0, 1); 
 
        if (current.lock_month && current.lock_year) {
            currentLockDate = new Date(current.lock_year, monthNames.indexOf(current.lock_month), 1);
        }
 
        if (lockTargetDate > currentLockDate) {
            await pool.query(
                "UPDATE timesheet_lock_period SET lock_month = $1, lock_year = $2 WHERE id = 1",
                [targetMonthStr, targetYear]
            );
            console.log(`Auto-Lock Applied: System automatically locked up to ${targetMonthStr} ${targetYear}`);
        }
    }
  } catch (error) {
    console.error("Auto Lock Error:", error.message);
  }
}
 
runAutoLock();
 
setInterval(runAutoLock, 12 * 60 * 60 * 1000);
 
module.exports = router;