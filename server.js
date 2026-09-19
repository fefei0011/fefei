require("dotenv").config();
require("./routes/backup");
const https = require("https"); 
const fs = require("fs");
const { startEmailCron } = require('./services/autoEmailer');
const {
  verifyToken,
  verifySuperAdmin,
  verifyEditor,
} = require("./middlewares/auth");
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const excelJS = require("exceljs");
const fetch = require("node-fetch");
const compression = require("compression");
const backupRoutes = require("./routes/backup");
const we1OwnEqRoutes = require("./routes/We1OwnEq");
const { createProxyMiddleware } = require('http-proxy-middleware');



// Routes
const billingRoutes = require("./routes/billing");
const timesheetRoutes = require("./routes/Timesheet");
const paymentRoutes = require("./routes/paymentstatus");
const employeeRoutes = require("./routes/employee");
const expenseRoutes = require("./routes/expense");
const masterDatabaseRoutes = require("./routes/master_database");
const logsheetRoutes = require("./routes/logsheet_api");
const entrylogRoutes = require("./routes/entrylog");
const oeledgerRoutes = require("./routes/oeledger");
const breakRulesRoutes = require("./routes/break_rules"); 
const vatBillRoute = require('./routes/vatbill');
const lockEntryRoute = require("./routes/Lock-entry");
const ownEquipmentAuthRoutes = require("./routes/ownEquipmentAuthRoutes");
const ownEquipmentTrackerRoutes = require("./routes/ownEquipmentTrackerRoutes");
const ownEquipmentAdminRoutes = require("./routes/ownEquipmentAdminRoutes");
const employeeTrackerAuthRoutes = require('./routes/employeeTrackerAuthRoutes');
const employeeTrackerAdminRoutes = require('./routes/employeeTrackerAdminRoutes');
const employeeTrackerRoutes = require('./routes/employeeTracker');
const viewBillRoutes = require("./routes/view_bill");
const we1EqDriverPayrollRoute = require('./routes/We1_EQ_Driver_Payroll');
const staffSalaryRoute = require('./routes/StaffSalary');
const invoiceAuthRoutes = require('./routes/invoiceAuth');
const zohoInvoiceRoute = require('./routes/zoho_download_inv');
const payrollRouter = require("./routes/klm_emp_payroll");
const monthly_summary = require("./routes/monthly_list_summary");
const { checkAndSendOwnEqAlerts } = require("./services/ownEqExpiryAlert");
const nonVatRouter = require("./routes/non_vat_bill_tracker");
const driverBillingRoutes = require("./routes/driver_billing");
const logsheetToolsRoutes = require("./routes/logsheet_tools");






const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static("public"));
startEmailCron();
app.use("/billing", billingRoutes);
app.use("/timesheet", timesheetRoutes);
app.use("/payment", paymentRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/expenses", expenseRoutes);
app.use("/timesheet/api/logsheets", logsheetRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/entrylog", entrylogRoutes);
app.use("/api/oeledger", oeledgerRoutes);
app.use("/timesheet", breakRulesRoutes);
app.use('/timesheet/api/vat-tracking', vatBillRoute);
app.use("/api/lock", lockEntryRoute);
app.use("/api/own-equipment/auth", ownEquipmentAuthRoutes);
app.use("/api/own-equipment/tracker", ownEquipmentTrackerRoutes);
app.use("/api/own-equipment/admin", ownEquipmentAdminRoutes);
app.use('/api/employee-tracker/auth', employeeTrackerAuthRoutes);
app.use('/api/employee-tracker/admin', employeeTrackerAdminRoutes);
app.use('/api/employee-tracker', employeeTrackerRoutes);
app.use("/api/view-bill", viewBillRoutes);
app.use("/api/we1-own-eq", we1OwnEqRoutes);
app.use('/api/we1-eq-driver-payroll', we1EqDriverPayrollRoute);
app.use('/api/staff-salary', staffSalaryRoute);
app.use('/api/invoice-auth', invoiceAuthRoutes);
app.use('/api', require('./routes/zoho_download_inv'));
app.use("/api/payroll", payrollRouter);
app.use("/api/monthly-summary", monthly_summary);
app.use("/timesheet/api/non-vat-tracking", nonVatRouter);
app.use("/driver-billing", driverBillingRoutes);
app.use("/timesheet/api/logsheets", logsheetToolsRoutes);




// ==========================================
// 🔄 REVERSE PROXY FOR PYTHON API (Port 8001)
// ==========================================
app.use('/api/python', createProxyMiddleware({
    target: 'http://127.0.0.1:8001',
    changeOrigin: true,
}));

app.use("/billing", billingRoutes);
app.use("/timesheet", timesheetRoutes);


// ==========================================
// 🐍 PYTHON ENGINE PROXY (Port 8001 Forwarder)
// ==========================================
app.use("/py", async (req, res) => {
  try {
    const url = `http://127.0.0.1:8001/py${req.url}`;
    const options = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (["POST", "PUT", "PATCH"].includes(req.method) && Object.keys(req.body || {}).length > 0) {
      options.body = JSON.stringify(req.body);
    }
    const pyRes = await fetch(url, options);
    const contentType = pyRes.headers.get("content-type") || "";

    // 🟢 തിരികെ വരുന്നത് JSON ഡാറ്റ ആണെങ്കിൽ
    if (contentType.includes("application/json")) {
      const data = await pyRes.json();
      return res.status(pyRes.status).json(data);
    }

    // 🟢 തിരികെ വരുന്നത് Excel (.xlsx) ഫയൽ പോലുള്ള Binary Data ആണെങ്കിൽ
    const buffer = await pyRes.buffer();
    res.setHeader("Content-Type", contentType);
    const disposition = pyRes.headers.get("content-disposition");
    if (disposition) {
      res.setHeader("Content-Disposition", disposition);
    }
    return res.status(pyRes.status).send(buffer);
  } catch (err) {
    console.error("Python Server Proxy Error:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Python Server Offline or Unreachable on Port 8001. Please check if main.py is running." 
    });
  }
});

const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_LOG_CHAT_ID =
  process.env.TELEGRAM_LOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;


// ==========================================
// 🤖 SHARED HELPERS (Telegram & Backup)
// ==========================================
async function sendActivityTelegramMessage(text) {
  if (!text || text.trim() === "" || !TELEGRAM_LOG_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_LOG_CHAT_ID,
          text: text,
          parse_mode: "HTML",
        }),
      },
    );
  } catch (err) {
    console.error("Telegram Log API Error:", err.message);
  }
}

async function generateAndSendBackup(customEmail = null) {
  let recipientEmails = customEmail;
  if (!recipientEmails) {
    const setCheck = await pool.query(
      "SELECT backup_emails FROM system_settings LIMIT 1",
    );
    recipientEmails = setCheck.rows[0].backup_emails;
  }
  if (!recipientEmails) throw new Error("No email configured.");

  const workbook = new excelJS.Workbook();

  // 1. Master Data Sheet
  const sheet1 = workbook.addWorksheet("Master Data");
  const headerRes = await pool.query(
    "SELECT header_name FROM erp_headers ORDER BY col_order ASC",
  );
  let headers = headerRes.rows.map((h) => h.header_name);
  sheet1.addRow(headers);
  const dataRes = await pool.query(
    "SELECT record_data FROM erp_records ORDER BY sn ASC",
  );
  dataRes.rows.forEach((dbRow) => {
    let rowArray = [];
    headers.forEach((h) => rowArray.push(dbRow.record_data[h] || ""));
    sheet1.addRow(rowArray);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"ERP Backup" <${process.env.EMAIL_USER}>`,
    to: recipientEmails,
    subject: `ERP Full Backup - ${new Date().toISOString().split("T")[0]}`,
    text: `Full Backup attached including Master Data and Driver Logs.`,
    attachments: [{ filename: `ERP_Backup.xlsx`, content: buffer }],
  });
}

// 🟢 REGISTER MASTER DATABASE ROUTER
const middlewares = { verifyToken, verifySuperAdmin, verifyEditor };
const helpers = { sendActivityTelegramMessage, generateAndSendBackup };
app.use("/api", masterDatabaseRoutes(pool, middlewares, helpers));

// ==========================================
// 🚀 AUTH & OTP API
// ==========================================
app.post("/api/register", async (req, res) => {
  try {
    const { displayName, username, password, email } = req.body;
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
    );
    if (userCheck.rows.length > 0)
      return res.json({ success: false, message: "Username exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (display_name, username, password_hash, main_id) VALUES ($1, $2, $3, $4)",
      [displayName, username, hashedPassword, email],
    );
    res.json({
      success: true,
      message: "Registration successful! Awaiting Admin Approval.",
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rows.length === 0)
      return res.json({ success: false, message: "User not found." });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid)
      return res.json({ success: false, message: "Invalid password." });
    if (user.status !== "Active")
      return res.json({ success: false, message: "Pending approval." });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        site: user.site_access,
      },
      JWT_SECRET,
      { expiresIn: "365d" },
    );
    await pool.query(
      "INSERT INTO activity_logs (username, action, details) VALUES ($1, 'LOGIN', '{}')",
      [user.username],
    );
    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        site: user.site_access,
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post("/api/admin-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND role = 'Super Admin' AND status = 'Active'",
      [username],
    );
    if (result.rows.length === 0)
      return res.json({ success: false, message: "Access Denied." });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.json({ success: false, message: "Invalid." });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
    await pool.query(
      "INSERT INTO activity_logs (username, action, details) VALUES ($1, 'ADMIN_LOGIN', '{}')",
      [user.username],
    );
    res.json({
      success: true,
      token,
      user: { username: user.username, role: user.role },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post("/api/forgot-password/request", async (req, res) => {
  try {
    const { username } = req.body;
    const userRes = await pool.query(
      "SELECT main_id FROM users WHERE username = $1",
      [username],
    );
    if (userRes.rows.length === 0)
      return res.json({
        success: false,
        message: "Username not found in system.",
      });

    const email = userRes.rows[0].main_id;
    if (!email || !email.includes("@"))
      return res.json({
        success: false,
        message: "No valid email associated. Contact Admin.",
      });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      "UPDATE users SET reset_otp = $1, otp_expiry = $2 WHERE username = $3",
      [otp, expiry, username],
    );

    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"Haka ERP Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Password Reset OTP - Haka ERP`,
      html: `<div style="font-family:sans-serif; padding:20px;">
                    <h2>Password Reset Request</h2>
                    <p>Hello ${username},</p>
                    <p>Your OTP for password recovery is: <b style="font-size:24px; color:#0d6efd;">${otp}</b></p>
                    <p>This OTP will expire in 10 minutes.</p>
                   </div>`,
    });

    res.json({
      success: true,
      message: `OTP sent successfully to your registered email.`,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post("/api/forgot-password/reset", async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;

    const userRes = await pool.query(
      "SELECT reset_otp, otp_expiry FROM users WHERE username = $1",
      [username],
    );
    if (userRes.rows.length === 0)
      return res.json({
        success: false,
        message: "No active OTP request found. Try again.",
      });

    const storedData = userRes.rows[0];

    if (!storedData.reset_otp)
      return res.json({
        success: false,
        message: "No active OTP request found. Try again.",
      });
    if (new Date() > new Date(storedData.otp_expiry)) {
      await pool.query(
        "UPDATE users SET reset_otp = NULL, otp_expiry = NULL WHERE username = $1",
        [username],
      );
      return res.json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }
    if (storedData.reset_otp !== otp)
      return res.json({ success: false, message: "Incorrect OTP entered." });

    const hashedNew = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, reset_otp = NULL, otp_expiry = NULL WHERE username = $2",
      [hashedNew, username],
    );

    await pool.query(
      "INSERT INTO activity_logs (username, action, details) VALUES ($1, 'RESET_PASSWORD', $2)",
      ["System", JSON.stringify({ target_user: username })],
    );

    res.json({
      success: true,
      message: "Password reset successful! You can now login.",
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==========================================
// 🛡️ SUPER ADMIN MANAGEMENT API
// ==========================================
app.get("/api/admin/users", verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, display_name, username, main_id, role, site_access, status FROM users ORDER BY created_at DESC",
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    res.json({ success: false });
  }
});

app.post("/api/admin/update-user", verifySuperAdmin, async (req, res) => {
  try {
    const { userId, role, site, status } = req.body;
    if (req.user.id === userId)
      return res.json({ success: false, message: "Cannot edit own account." });
    await pool.query(
      "UPDATE users SET role = $1, site_access = $2, status = $3 WHERE id = $4",
      [role, site, status, userId],
    );
    res.json({ success: true, message: "User updated successfully!" });
  } catch (error) {
    res.json({ success: false });
  }
});

app.post(
  "/api/admin/reset-user-password",
  verifySuperAdmin,
  async (req, res) => {
    try {
      const { userId, newPassword } = req.body;
      if (req.user.id === userId)
        return res.json({
          success: false,
          message:
            "Use the 'Root Password' section to change your own password.",
        });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        hashedPassword,
        userId,
      ]);

      const targetUser = await pool.query(
        "SELECT username FROM users WHERE id = $1",
        [userId],
      );
      await pool.query(
        "INSERT INTO activity_logs (username, action, details) VALUES ($1, 'RESET_PASSWORD', $2)",
        [
          req.user.username,
          JSON.stringify({ target_user: targetUser.rows[0]?.username }),
        ],
      );

      res.json({ success: true, message: "Password reset successfully!" });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  },
);

app.post("/api/admin/delete-user", verifySuperAdmin, async (req, res) => {
  try {
    const { userId, adminPassword } = req.body;
    if (req.user.id === userId)
      return res.json({
        success: false,
        message: "Cannot delete your own admin account!",
      });

    const admin = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id],
    );
    const isValid = await bcrypt.compare(
      adminPassword,
      admin.rows[0].password_hash,
    );
    if (!isValid)
      return res.json({
        success: false,
        message: "Incorrect Super Admin Password. Action Denied.",
      });

    const targetUser = await pool.query(
      "SELECT username FROM users WHERE id = $1",
      [userId],
    );
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    await pool.query(
      "INSERT INTO activity_logs (username, action, details) VALUES ($1, 'DELETE_USER', $2)",
      [
        req.user.username,
        JSON.stringify({ target_user: targetUser.rows[0]?.username }),
      ],
    );

    res.json({ success: true, message: "User permanently deleted!" });
  } catch (error) {
    res.json({ success: false });
  }
});

app.get("/api/admin/logs", verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 2000",
    );
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.get("/api/admin/settings", verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT backup_emails, backup_time, timezone FROM system_settings LIMIT 1",
    );
    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    res.json({ success: false });
  }
});

app.post("/api/admin/update-settings", verifySuperAdmin, async (req, res) => {
  try {
    const { backup_emails, backup_time, timezone } = req.body;
    await pool.query(
      "UPDATE system_settings SET backup_emails = $1, backup_time = $2, timezone = $3",
      [backup_emails, backup_time, timezone],
    );
    res.json({
      success: true,
      message: "Backup configuration updated successfully!",
    });
  } catch (error) {
    res.json({ success: false, message: "Failed to update settings." });
  }
});

app.post("/api/admin/change-password", verifySuperAdmin, async (req, res) => {
  try {
    const { newPass } = req.body;
    const hashedNew = await bcrypt.hash(newPass, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashedNew,
      req.user.id,
    ]);
    res.json({ success: true, message: "Root Password updated successfully!" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==========================================
// 📊 DASHBOARD SUMMARY API
// ==========================================
app.get("/api/dashboard-summary", verifyToken, async (req, res) => {
  try {
    const { role, site } = req.user;
    let scopeCondition = "TRUE";
    let params = [];

    if (role !== "Admin" && role !== "Super Admin" && role !== "Viewer") {
      scopeCondition = "TRIM(LOWER(COALESCE(record_data->>'Site', site, ''))) = TRIM(LOWER($1))";
      params = [site];
    }

    const overallRes = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Running') as running, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Released') as released, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Replaced') as replaced FROM erp_records WHERE ${scopeCondition}`,
      params,
    );
    const siteRes = await pool.query(
      `SELECT site, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Running') as running, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Released') as released, COUNT(*) FILTER (WHERE record_data->>'Status' ILIKE 'Replaced') as replaced FROM erp_records WHERE ${scopeCondition} AND site IS NOT NULL AND site != '' GROUP BY site ORDER BY running DESC`,
      params,
    );
    const companyRes = await pool.query(
      `SELECT record_data->>'Company' as company, COUNT(*) as count FROM erp_records WHERE ${scopeCondition} AND record_data->>'Status' ILIKE 'Running' AND record_data->>'Company' IS NOT NULL GROUP BY company ORDER BY count DESC`,
      params,
    );
    const siteCompanyRes = await pool.query(
      `SELECT site, record_data->>'Company' as company, COUNT(*) as count FROM erp_records WHERE ${scopeCondition} AND record_data->>'Status' ILIKE 'Running' AND site IS NOT NULL AND site != '' AND record_data->>'Company' IS NOT NULL AND record_data->>'Company' != '' GROUP BY site, company ORDER BY site ASC, count DESC`,
      params,
    );

    const vehicleDetailsRes = await pool.query(
  `
        SELECT 
            COALESCE(
                NULLIF(TRIM(plate_number), ''),
                NULLIF(TRIM(record_data->>'PLATE NUMBER'), ''),
                NULLIF(TRIM(record_data->>'Plate Number'), ''),
                NULLIF(TRIM(record_data->>'Plate No'), '')
            ) as plate_number,
            COALESCE(
                NULLIF(TRIM(site), ''),
                NULLIF(TRIM(record_data->>'Site'), ''),
                NULLIF(TRIM(record_data->>'SITE'), '')
            ) as site,
            COALESCE(
                NULLIF(TRIM(record_data->>'Company'), ''),
                NULLIF(TRIM(record_data->>'COMPANY'), '')
            ) as company,
            COALESCE(
                NULLIF(TRIM(record_data->>'Status'), ''),
                NULLIF(TRIM(record_data->>'STATUS'), '')
            ) as status,
            COALESCE(
                NULLIF(TRIM(record_data->>'Owner'), ''),
                NULLIF(TRIM(record_data->>'OWNER'), '')
            ) as owner
        FROM erp_records 
        WHERE ${scopeCondition} 
        ORDER BY plate_number ASC
    `,
  params,
);

    res.json({
      success: true,
      overall: overallRes.rows[0],
      sites: siteRes.rows,
      companies: companyRes.rows,
      siteCompany: siteCompanyRes.rows,
      vehicleDetails: vehicleDetailsRes.rows,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==========================================
// 🤖 TELEGRAM EXPIRY ALERT SYSTEM
// ==========================================
async function sendTelegramMessage(text) {
  if (!text || text.trim() === "") return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: "HTML",
        }),
      },
    );
    await new Promise((res) => setTimeout(res, 1000));
  } catch (err) {
    console.error("Telegram API Error:", err.message);
  }
}

async function checkExpiriesAndSendAlerts() {
  try {
    console.log("Checking Expiries for Telegram Alerts...");
    const res = await pool.query(
      `SELECT record_data FROM erp_records WHERE record_data->>'Status' ILIKE 'Running'`,
    );
    if (res.rows.length === 0)
      return { success: true, message: "No Running vehicles found." };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysWarning = 30;
    let processedData = [];

    res.rows.forEach((row) => {
      const data = row.record_data;
      const getVal = (k) => {
        const fk = Object.keys(data).find((key) =>
          key
            .replace(/\s+/g, "")
            .toLowerCase()
            .includes(k.replace(/\s+/g, "").toLowerCase()),
        );
        return fk ? data[fk] : null;
      };

      const plate = getVal("Plate Number") || getVal("Plate No");
      if (!plate || String(plate).trim() === "") return;

      let isExpiring = false,
        isExpired = false;
      let main3ExpiredCount = 0,
        main3ExpiringCount = 0;
      let alertItems = [];

      const checkExpiry = (dateStr, itemName, isMain) => {
        if (!dateStr || String(dateStr).trim() === "") return;
        let exp = new Date(dateStr);
        if (isNaN(exp.getTime())) {
          let p = String(dateStr)
            .trim()
            .split(/[\/\- \.]/);
          if (p.length === 3) {
            const m = {
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
            exp = new Date(
              `${p[2].length == 2 ? "20" + p[2] : p[2]}-${m[p[1].substring(0, 3)] || p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}T00:00:00`,
            );
          }
        }
        if (isNaN(exp.getTime())) return;
        exp.setHours(0, 0, 0, 0);
        const diffTime = exp.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const formattedDate = exp
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(/ /g, "-");

        if (diffDays <= daysWarning && diffDays >= 0) {
          isExpiring = true;
          if (isMain) main3ExpiringCount++;
          alertItems.push({ name: itemName, dateStr: formattedDate });
        } else if (diffDays < 0) {
          isExpired = true;
          if (isMain) main3ExpiredCount++;
          alertItems.push({ name: itemName, dateStr: formattedDate });
        }
      };

      checkExpiry(getVal("Iqama Expire"), "Iqama", true);
      checkExpiry(
        getVal("License Expire") || getVal("Licence Expire"),
        "License",
        true,
      );
      checkExpiry(getVal("EQ Insuran"), "EQ Insurance", true);
      checkExpiry(getVal("FAHS MVPI"), "FAHS MVPI", false);

      let finalStatus = null;
      if (main3ExpiredCount === 3 && main3ExpiringCount === 0)
        finalStatus = "Already Expired";
      else if (isExpiring) finalStatus = "Going to Expire";
      else if (isExpired) finalStatus = "Already Expired";

      if (finalStatus && alertItems.length > 0) {
        processedData.push({
          status: finalStatus,
          site: getVal("Site") || "N/A",
          ifSub: getVal("If Sub") || "N/A",
          company: getVal("Company") || "N/A",
          customer: getVal("Customer") || "N/A",
          owner: getVal("Owner") || "N/A",
          plate: plate,
          driver: getVal("Driver Name") || "N/A",
          driverMob: getVal("Mobile") || "N/A",
          ownerMob: getVal("Owner Number") || "N/A",
          fieldCo: getVal("Field Coordinator") || "N/A",
          siteCo: getVal("Site Coordinator") || "N/A",
          iqamaNo: getVal("Iqama Number") || "N/A",
          alerts: alertItems,
        });
      }
    });

    if (processedData.length === 0)
      return {
        success: true,
        message: "All Running vehicles are safe. No alerts.",
      };

    processedData.sort((a, b) => {
      if (a.status !== b.status) return b.status.localeCompare(a.status);
      if (a.site !== b.site) return a.site.localeCompare(b.site);
      if (a.company !== b.company) return a.company.localeCompare(b.company);
      if (a.customer !== b.customer)
        return a.customer.localeCompare(b.customer);
      return a.owner.localeCompare(b.owner);
    });

    let groups = {};
    processedData.forEach((item) => {
      const groupKey = `${item.status}|${item.site}|${item.company}|${item.customer}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          status: item.status,
          site: item.site,
          ifSub: item.ifSub,
          company: item.company,
          customer: item.customer,
          vehicles: [],
        };
      }
      groups[groupKey].vehicles.push(item);
    });

    const MESSAGE_LIMIT = 3800;

    for (const key in groups) {
      const group = groups[key];
      let headerElements = [];
      if (group.site && group.site !== "N/A") headerElements.push(group.site);
      if (group.ifSub && group.ifSub !== "N/A")
        headerElements.push(group.ifSub);
      if (group.company && group.company !== "N/A")
        headerElements.push(group.company);
      if (group.customer && group.customer !== "N/A")
        headerElements.push(group.customer);

      const headerString = headerElements.join(" ");
      const headerTitle = `<b>${headerString}</b> (${group.vehicles.length} Items ${group.status})\n\n`;
      let currentMessage = headerTitle;

      group.vehicles.forEach((v) => {
        let vBlock = `Plate No :: <b>${v.plate}</b>\n`;

        v.alerts.forEach((alert) => {
          vBlock += `🔸 ${alert.name} (${alert.dateStr})\n`;
          if (
            alert.name === "Iqama" &&
            v.iqamaNo !== "N/A" &&
            v.iqamaNo !== ""
          ) {
            vBlock += `      Iqama No: ${v.iqamaNo}\n`;
          }
        });

        vBlock += `\nDriver :: ${v.driver}\n`;
        vBlock += `Mob :: ${v.driverMob}\n\n`;
        vBlock += `Owner :: ${v.owner}\n`;
        vBlock += `Mob :: ${v.ownerMob}\n\n`;
        vBlock += `Field Co :: ${v.fieldCo}\n`;
        vBlock += `Site Co :: ${v.siteCo}\n`;
        vBlock += `-----------------------------------\n\n`;

        if (currentMessage.length + vBlock.length > MESSAGE_LIMIT) {
          sendTelegramMessage(currentMessage);
          currentMessage = headerTitle + `<i>(Continued...)</i>\n\n` + vBlock;
        } else {
          currentMessage += vBlock;
        }
      });

      if (currentMessage.trim() !== headerTitle.trim()) {
        await sendTelegramMessage(currentMessage);
      }
    }

    return { success: true, message: "Alerts sent successfully to Telegram!" };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

cron.schedule(
  "0 8 * * *",
  async () => {
    console.log(
      "Auto Trigger: Sending Daily Telegram Alerts (IST 08:00 AM)...",
    );
    await checkExpiriesAndSendAlerts();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  },
);

// 🟢 Own Equipment Expiry Alert (Daily at 6:00 AM IST)
cron.schedule(
  "0 6 * * *",
  async () => {
    console.log(
      "Auto Trigger: Sending Daily Own Equipment Expiry Alerts (IST 06:00 AM)...",
    );
    await checkAndSendOwnEqAlerts();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  },
);

app.post("/api/admin/trigger-alerts", verifySuperAdmin, async (req, res) => {
  const result = await checkExpiriesAndSendAlerts();
  res.json(result);
});

app.post("/api/admin/trigger-own-eq-alerts", verifySuperAdmin, async (req, res) => {
  await checkAndSendOwnEqAlerts();
  res.json({ success: true, message: "Own Equipment Expiry Alert triggered." });
});

// ==========================================
// ⏰ BACKUP & EXCEL SYSTEM ROUTES (Remaining)
// ==========================================
app.post("/api/admin/force-backup", verifySuperAdmin, async (req, res) => {
  try {
    await generateAndSendBackup();
    res.json({ success: true, message: "Backup Sent!" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.post("/api/custom-backup", verifyToken, async (req, res) => {
  try {
    if (req.user.role === "Viewer") throw new Error("Denied");
    await generateAndSendBackup(req.body.targetEmail);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

cron.schedule("* * * * *", async () => {
  try {
    const setCheck = await pool.query(
      "SELECT backup_time FROM system_settings LIMIT 1",
    );
    let currentHM = new Date().toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    if (currentHM === setCheck.rows[0].backup_time)
      await generateAndSendBackup();
  } catch (err) {
    console.error(err);
  }
});

// ==========================================
// 🚀 SERVER INITIALIZATION (HTTP & HTTPS on Same Port)
// ==========================================
const httpolyglot = require("httpolyglot");

const PORT = process.env.PORT || 5000;

const sslOptions = {
  key: fs.readFileSync('./fefei.tail129892.ts.net.key'), 
  cert: fs.readFileSync('./fefei.tail129892.ts.net.crt')
};

// Handles HTTP (Tailscale proxy & local HTTP) and HTTPS (Local secure access)
const server = httpolyglot.createServer(sslOptions, app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ERP Server running on Port ${PORT} (HTTP for Tailscale & Local HTTPS)`);
});