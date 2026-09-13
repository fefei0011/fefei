const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET;

// Helper function
function cleanPlate(p) {
  return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// 🟢 Middlewares (Fixed Token Splitting .split(" ")[1])
const verifyViewBillUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, message: "No token provided. Access Denied." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbRes = await pool.query(
      "SELECT id, username, display_name, role, status, assigned_sites FROM view_bill_users WHERE id = $1",
      [decoded.id]
    );

    if (dbRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    const user = dbRes.rows[0];
    if (user.status !== "approved" && user.status !== "Active") {
      return res.status(403).json({ success: false, message: "Account pending admin approval." });
    }

    let sites = user.assigned_sites || [];
    if (typeof sites === "string") {
      try { sites = JSON.parse(sites); } catch (e) { sites = []; }
    }

    req.viewUser = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      assigned_sites: sites,
    };
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid or expired session." });
  }
};

const verifyViewBillSuperAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, message: "No token provided. Access Denied." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbRes = await pool.query(
      "SELECT id, username, display_name, role, status FROM view_bill_users WHERE id = $1",
      [decoded.id]
    );

    if (dbRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    const user = dbRes.rows[0];
    if (user.role !== "Super Admin") {
      return res.status(403).json({ success: false, message: "Access Denied: Super Admin only." });
    }

    req.viewUser = user;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid or expired session." });
  }
};

// 1. User Signup
router.post("/signup", async (req, res) => {
  try {
    const { displayName, username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const cleanUsername = username.trim();
    const userCheck = await pool.query(
      "SELECT id FROM view_bill_users WHERE username = $1",
      [cleanUsername]
    );
    if (userCheck.rows.length > 0) {
      return res.json({ success: false, message: "Username already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = cleanUsername.toLowerCase() === "fefei" ? "Super Admin" : "Site Co";
    const userStatus = cleanUsername.toLowerCase() === "fefei" ? "approved" : "pending";

    await pool.query(
      "INSERT INTO view_bill_users (display_name, username, password_hash, role, status, assigned_sites) VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)",
      [displayName || cleanUsername, cleanUsername, hashedPassword, userRole, userStatus]
    );

    const msg = userStatus === "approved" 
      ? "Registration successful! You can login now." 
      : "Registration successful! Awaiting Admin Approval.";

    res.json({ success: true, message: msg });
    } catch (error) {
    console.error("VIEW BILL /data ERROR:", error);
    res.status(500).json({ success: false, message: error.message, stack: error.stack });
  }
});

// 2. User Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const result = await pool.query(
      "SELECT * FROM view_bill_users WHERE username = $1",
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "User not found." });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.json({ success: false, message: "Invalid password." });
    }

    if (user.status !== "approved" && user.status !== "Active") {
      return res.json({ success: false, message: "Account pending admin approval." });
    }

    let sites = user.assigned_sites || [];
    if (typeof sites === "string") {
      try { sites = JSON.parse(sites); } catch (e) { sites = []; }
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
        assigned_sites: sites,
        type: "view_bill",
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        assigned_sites: sites,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Verify Session
router.get("/verify-session", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return res.status(401).json({ success: false, message: "No token provided." });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbUser = await pool.query(
      "SELECT id, username, display_name, role, status, assigned_sites FROM view_bill_users WHERE id = $1",
      [decoded.id]
    );

    if (dbUser.rows.length === 0) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    const user = dbUser.rows[0];
    if (user.status !== "approved" && user.status !== "Active") {
      return res.status(403).json({ success: false, message: "Account is not active." });
    }

    let sites = user.assigned_sites || [];
    if (typeof sites === "string") {
      try { sites = JSON.parse(sites); } catch (e) { sites = []; }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        assigned_sites: sites,
      },
    });
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid or expired session." });
  }
});

// 4. Admin Users List
router.get("/admin/users", verifyViewBillSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, display_name, username, role, status, assigned_sites, created_at FROM view_bill_users ORDER BY id ASC"
    );
    res.json({ success: true, users: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Admin Update User
router.post("/admin/update-user", verifyViewBillSuperAdmin, async (req, res) => {
  try {
    const { userId, role, status, assigned_sites } = req.body;
    await pool.query(
      "UPDATE view_bill_users SET role = $1, status = $2, assigned_sites = $3::jsonb WHERE id = $4",
      [role, status, JSON.stringify(assigned_sites || []), userId]
    );
    res.json({ success: true, message: "User updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Admin Delete User
router.delete("/admin/delete-user/:id", verifyViewBillSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM view_bill_users WHERE id = $1", [id]);
    res.json({ success: true, message: "User deleted successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Admin Sites List
router.get("/admin/sites-list", verifyViewBillSuperAdmin, async (req, res) => {
  try {
    const vSites = await pool.query("SELECT DISTINCT site_name FROM timesheet_vehicles WHERE site_name IS NOT NULL AND TRIM(site_name) != ''");
    const lSites = await pool.query("SELECT DISTINCT site_name FROM vehicle_site_log WHERE site_name IS NOT NULL AND TRIM(site_name) != ''");

    let allSites = new Set();
    vSites.rows.forEach((r) => allSites.add(r.site_name.trim()));
    lSites.rows.forEach((r) => allSites.add(r.site_name.trim()));

    res.json({ success: true, sites: Array.from(allSites).sort() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. Suggestions API
router.get("/suggestions", verifyViewBillUser, async (req, res) => {
  try {
    const user = req.viewUser;
    let siteFilterCondition = "TRUE";
    let params = [];

    if (user.role === "Site Co") {
      const assigned = user.assigned_sites || [];
      if (assigned.length === 0) {
        return res.json({ success: true, plates: [], owners: [], sites: [] });
      }
      siteFilterCondition = "TRIM(LOWER(site_name)) = ANY($1::text[])";
      params = [assigned.map((s) => String(s).trim().toLowerCase())];
    }

    const vehiclesRes = await pool.query(
      `SELECT DISTINCT plate_no, owner_name, site_name FROM timesheet_vehicles WHERE ${siteFilterCondition} ORDER BY plate_no ASC`,
      params
    );

    const siteLogRes = await pool.query(
      `SELECT DISTINCT plate_no, site_name FROM vehicle_site_log WHERE ${siteFilterCondition}`,
      params
    );

    const plateLogRes = await pool.query(
      `SELECT DISTINCT old_plate_no, new_plate_no FROM vehicle_plate_log`
    );

    let allowedPlates = new Set();
    let allowedOwners = new Set();
    let allowedSites = new Set();

    vehiclesRes.rows.forEach((r) => {
      if (r.plate_no) allowedPlates.add(r.plate_no.trim().toUpperCase());
      if (r.owner_name) allowedOwners.add(r.owner_name.trim().toUpperCase());
      if (r.site_name) allowedSites.add(r.site_name.trim());
    });

    plateLogRes.rows.forEach((pl) => {
      if (pl.old_plate_no) allowedPlates.add(pl.old_plate_no.trim().toUpperCase());
      if (pl.new_plate_no) allowedPlates.add(pl.new_plate_no.trim().toUpperCase());
    });

    siteLogRes.rows.forEach((r) => {
      if (r.plate_no) allowedPlates.add(r.plate_no.trim().toUpperCase());
      if (r.site_name) allowedSites.add(r.site_name.trim());
    });

    siteLogRes.rows.forEach((r) => {
      if (r.plate_no) allowedPlates.add(r.plate_no.trim().toUpperCase());
      if (r.site_name) allowedSites.add(r.site_name.trim());
    });

    res.json({
      success: true,
      plates: Array.from(allowedPlates).sort(),
      owners: Array.from(allowedOwners).sort(),
      sites: Array.from(allowedSites).sort(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 9. View Bill Data API (Fixed with exact month-wise vehicle_site_log mapping and Site Co permission check)
router.get("/data", verifyViewBillUser, async (req, res) => {
  try {
    const { month, year, search_type, search_value } = req.query;
    const user = req.viewUser;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: "Month and Year are required." });
    }

    const monthStr = month.trim();
    const yearStr = year.trim();
    const fullMonth = `${monthStr} ${yearStr}`;

    const [vehiclesRes, sitesRes, driversRes, timesheetsRes, invoicesRes, billingRes, specialRulesRes, ratesRes, ownersRes, plateLogsRes] = await Promise.all([
      pool.query("SELECT plate_no, owner_name, owner_mobile, site_name, vehicle_type, vat, driver_name, driver_mobile, field_co, site_co, rate FROM timesheet_vehicles"),
      pool.query("SELECT plate_no, site_name, work_start_date, work_end_date, rate, field_co, site_co, status FROM vehicle_site_log"),
      pool.query("SELECT plate_no, driver_name, driver_mobile, work_start_date, work_end_date, status FROM vehicle_driver_log"),
      pool.query("SELECT plate_no, record_date, calc_time, calc_distance, bd, remark, wrk_start, hmr_start FROM timesheet_daily_records WHERE month=$1 AND year=$2", [monthStr, yearStr]),
      pool.query("SELECT * FROM invoice_records WHERE month=$1", [fullMonth]),
      pool.query("SELECT * FROM billing_records WHERE billing_month=$1", [fullMonth]),
      pool.query("SELECT * FROM special_days_rules WHERE is_active = true"),
      pool.query("SELECT plate_no, site_name, rate, work_start_date, work_end_date FROM vehicle_rate_log"),
      pool.query("SELECT plate_no, owner_name, owner_mobile, vat, work_start_date, work_end_date FROM vehicle_owner_log"),
      pool.query("SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date FROM vehicle_plate_log ORDER BY change_date ASC")
    ]);

    let vehicles = vehiclesRes.rows;
    let siteLogs = sitesRes.rows;
    let rateLogs = ratesRes.rows;
    let ownerLogs = ownersRes.rows;
    let timesheets = timesheetsRes.rows;
    let invoices = invoicesRes.rows;
    let billing = billingRes.rows;
    let plateLogs = plateLogsRes.rows;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const mIdx = monthNames.indexOf(monthStr);
    const monthStart = new Date(parseInt(yearStr), mIdx, 1);
    const monthEnd = new Date(parseInt(yearStr), mIdx + 1, 0, 23, 59, 59, 999);
    const daysInMonth = monthEnd.getDate();

    // 🟢 Site Co യുടെ അസൈൻഡ് സൈറ്റുകൾ
    const userAssignedSites = user.role === "Site Co" 
      ? (user.assigned_sites || []).map((s) => String(s).trim().toLowerCase()) 
      : [];

    if (user.role === "Site Co" && userAssignedSites.length === 0) {
      return res.json({ success: true, rows: [], reportData: [] });
    }

    let resultRows = [];
    let reportData = [];

    vehicles.forEach((v) => {
      let masterPlate = (v.plate_no || "").trim().toUpperCase();
      let normPlate = cleanPlate(v.plate_no);
      if (!normPlate) return;

      // 🟢 billing.js-ലെ മാതൃകയിൽ എല്ലാ അനുബന്ധ പ്ലേറ്റുകളും (പഴയതും പുതിയതും) കൃത്യമായി കണ്ടെത്തുന്നു
      let effectivePlate = masterPlate;
      let relatedPlates = [masterPlate];
      let allRelatedNorms = [normPlate];

      let vPlateChanges = plateLogs.filter(
        (pl) =>
          cleanPlate(pl.old_plate_no) === normPlate ||
          cleanPlate(pl.new_plate_no) === normPlate
      );

      vPlateChanges.forEach((pl) => {
        let op = (pl.old_plate_no || "").trim().toUpperCase();
        let np = (pl.new_plate_no || "").trim().toUpperCase();
        let oNorm = cleanPlate(op);
        let nNorm = cleanPlate(np);

        if (op && !relatedPlates.includes(op)) relatedPlates.push(op);
        if (np && !relatedPlates.includes(np)) relatedPlates.push(np);
        if (oNorm && !allRelatedNorms.includes(oNorm)) allRelatedNorms.push(oNorm);
        if (nNorm && !allRelatedNorms.includes(nNorm)) allRelatedNorms.push(nNorm);
      });

      if (monthStart && monthEnd && vPlateChanges.length > 0) {
        for (let pl of vPlateChanges) {
          if (!pl.change_date) continue;
          let [cYear, cMonth, cDay] = pl.change_date.split("-").map(Number);
          let cDate = new Date(cYear, cMonth - 1, cDay);

          if (cYear === parseInt(yearStr) && (cMonth - 1) === mIdx) {
            effectivePlate = `${pl.old_plate_no.trim().toUpperCase()} ➔ ${pl.new_plate_no.trim().toUpperCase()}`;
          } else if (monthEnd < cDate) {
            effectivePlate = pl.old_plate_no.trim().toUpperCase();
          } else if (monthStart >= cDate) {
            effectivePlate = pl.new_plate_no.trim().toUpperCase();
          }
        }
      }

      let displayPlate = effectivePlate;

      // 🟢 ഈ മാസത്തിൽ ഈ വണ്ടിക്ക് ബാധകമായ സൈറ്റ് ലോഗ് (vehicle_site_log) മാത്രം കണ്ടുപിടിക്കുന്നു
      let vSiteLogs = siteLogs.filter((s) => allRelatedNorms.includes(cleanPlate(s.plate_no)));
      let activeSiteLog = vSiteLogs.find((s) => {
        let st = s.work_start_date ? new Date(s.work_start_date) : new Date(2000, 0, 1);
        let ed = s.work_end_date ? new Date(s.work_end_date) : new Date(2100, 11, 31);
        if (s.status === "Running" && !s.work_end_date) ed = new Date(2100, 11, 31);
        return st <= monthEnd && ed >= monthStart;
      });

      let currentSiteName = "";
      if (activeSiteLog && activeSiteLog.site_name) {
        currentSiteName = activeSiteLog.site_name.trim();
      } else if (v.site_name) {
        currentSiteName = v.site_name.trim();
      } else {
        let savedCheck = billing.find((b) => relatedPlates.includes((b.plate_no || "").trim().toUpperCase()));
        if (savedCheck && savedCheck.site_name) {
          currentSiteName = savedCheck.site_name.trim();
        } else {
          currentSiteName = "N/A";
        }
      }

      if (!currentSiteName || currentSiteName === "N/A") {
        let hasTsOrBilling = timesheets.some(t => allRelatedNorms.includes(cleanPlate(t.plate_no))) || billing.some(b => relatedPlates.includes((b.plate_no || "").trim().toUpperCase()));
        if (!hasTsOrBilling) return;
        currentSiteName = v.site_name || "N/A";
      }

      // 🟢 Site Co പെർമിഷൻ പരിശോധന (ലോഗ് ലുള്ള സൈറ്റ് യൂസർക്ക് ആക്സസ് ഉണ്ടോ എന്ന് നോക്കുന്നു)
      if (user.role === "Site Co") {
        if (!userAssignedSites.includes(currentSiteName.toLowerCase())) {
          return; // ആക്സസ് ഇല്ലെങ്കിൽ ഈ വണ്ടി ഒഴിവാക്കും
        }
      }

      // 🟢 സർച്ച് ഫിൽട്ടർ പരിശോധന (പഴയ പ്ലേറ്റ് അടിച്ചു സെർച്ച് ചെയ്താലും വണ്ടി കൃത്യമായി കിട്ടാൻ)
      let resolvedSearchMatch = true;
if (search_value && search_value.trim() !== "") {
  const cleanVal = search_value.trim().toUpperCase();
  const cleanValNorm = cleanPlate(search_value);
  let match = false;

  // 🟢 Old plate / new plate / master plate ഏതുകൊടുത്താലും match ആകും
  let plateMatchesSearch = 
    allRelatedNorms.some(rn => rn.includes(cleanValNorm)) ||
    relatedPlates.some(rp => rp.replace(/[^A-Z0-9]/g, "").includes(cleanValNorm)) ||
    displayPlate.toUpperCase().replace(/[^A-Z0-9➔ ]/g, "").includes(cleanVal);

  if (search_type === "plate") {
    match = plateMatchesSearch;
  } else if (search_type === "owner") {
    match = (v.owner_name || "").trim().toUpperCase().includes(cleanVal);
  } else {
    match = plateMatchesSearch || (v.owner_name || "").trim().toUpperCase().includes(cleanVal);
  }
  resolvedSearchMatch = match;
}

if (!resolvedSearchMatch) return;

      function matchesRelatedPlates(bPlate) {
        if (!bPlate) return false;
        let raw = String(bPlate).trim().toUpperCase();
        let parts = raw.split(/➔|→|->/).map((p) => cleanPlate(p)).filter(Boolean);
        return parts.some((p) => allRelatedNorms.includes(p)) || allRelatedNorms.includes(cleanPlate(raw));
      }

      let saved = billing.find((b) => matchesRelatedPlates(b.plate_no) && (b.site_name || "").trim().toLowerCase() === currentSiteName.toLowerCase());
      let vInvs = invoices.filter((i) => matchesRelatedPlates(i.plate_no));
      let invData = vInvs[0] || {};

      // 🟢 Driver Log Lookup for specific month
      let vDriverLogs = driversRes.rows.filter((d) => allRelatedNorms.includes(cleanPlate(d.plate_no)));
      let validDLogs = vDriverLogs.filter((d) => {
        let st = d.work_start_date ? new Date(d.work_start_date) : new Date(2000, 0, 1);
        let ed = d.work_end_date ? new Date(d.work_end_date) : new Date(2100, 11, 31);
        return st <= monthEnd && ed >= monthStart;
      });

      let effectiveDriver = (v.driver_name || "N/A").trim();
      if (validDLogs.length > 0) {
        validDLogs.sort((a, b) => new Date(a.work_start_date || "2000-01-01") - new Date(b.work_start_date || "2000-01-01"));
        let driverNames = validDLogs.map((d) => d.driver_name).filter(Boolean);
        if (driverNames.length > 0) {
          effectiveDriver = [...new Set(driverNames)].join(" / ");
        }
      }

      // 🟢 Rate Log Lookup for specific month
      let vRateLogs = rateLogs.filter((r) => allRelatedNorms.includes(cleanPlate(r.plate_no)));
      let activeRateLog = vRateLogs.find((r) => {
        let matchesSite = !r.site_name || r.site_name.trim() === "" || r.site_name.trim().toLowerCase() === currentSiteName.toLowerCase();
        let st = r.work_start_date ? new Date(r.work_start_date) : new Date(2000, 0, 1);
        let ed = r.work_end_date ? new Date(r.work_end_date) : new Date(2100, 11, 31);
        return matchesSite && st <= monthEnd && ed >= monthStart;
      });

      let baseRate = 0;
      if (activeRateLog && parseFloat(activeRateLog.rate) > 0) {
        baseRate = parseFloat(activeRateLog.rate);
      } else if (activeSiteLog && activeSiteLog.rate) {
        baseRate = parseFloat(activeSiteLog.rate);
      } else {
        baseRate = parseFloat(v.rate) || 0;
      }

      // 🟢 Owner Log Lookup for specific month
      let vOwnerLogs = ownerLogs.filter((o) => allRelatedNorms.includes(cleanPlate(o.plate_no)));
      let validOLogs = vOwnerLogs.filter((o) => {
        let st = o.work_start_date ? new Date(o.work_start_date) : new Date(2000, 0, 1);
        let ed = o.work_end_date ? new Date(o.work_end_date) : new Date(2100, 11, 31);
        return st <= monthEnd && ed >= monthStart;
      });

      let effectiveOwner = (v.owner_name || "COMPANY VEHICLE").trim();
      let effectiveVat = (v.vat || "No").trim();

      if (validOLogs.length > 0) {
        validOLogs.sort((a, b) => new Date(b.work_start_date || "2000-01-01") - new Date(a.work_start_date || "2000-01-01"));
        let activeOwnerLog = validOLogs[0];
        if (activeOwnerLog.owner_name) effectiveOwner = activeOwnerLog.owner_name.trim();
        if (activeOwnerLog.vat) effectiveVat = String(activeOwnerLog.vat).trim();
      }

      const normalizedVat = effectiveVat.toLowerCase().replace(/\s+/g, "");
      let isEffectiveVatYes = normalizedVat.includes("yes") || ["true", "15", "15%"].includes(normalizedVat)
        ? "Yes"
        : "No";

      let calculatedNRate = baseRate ? (baseRate / 260) : 0;
      let calculatedOTRate = baseRate ? ((baseRate / 260) * 0.7) : 0;

      let nhr = saved ? parseFloat(saved.nhr) || 0 : 0;
      let othr = saved ? parseFloat(saved.othr) || 0 : 0;
      
      let nrate = (saved && parseFloat(saved.nrate) > 0) ? parseFloat(saved.nrate) : calculatedNRate;
      let otrate = (saved && parseFloat(saved.otrate) > 0) ? parseFloat(saved.otrate) : calculatedOTRate;

      let rent = (saved && parseFloat(saved.rent) > 0) ? parseFloat(saved.rent) : ((nhr * nrate) + (othr * otrate));
      let vatAmt = saved ? parseFloat(saved.vat_amount) || 0 : (isEffectiveVatYes === "Yes" ? rent * 0.15 : 0);
      let total = (saved && parseFloat(saved.total) > 0) ? parseFloat(saved.total) : (rent + vatAmt);

      resultRows.push({
        date: monthStr.substring(0, 3) + " " + yearStr.substring(2, 4),
        vtype: (saved && saved.vtype) ? saved.vtype : (v.vehicle_type || "N/A"),
        driver: (saved && saved.driver) ? saved.driver : effectiveDriver,
        site: currentSiteName,
        plate_no: displayPlate,
        master_plate: masterPlate,
        plate_logs: vPlateChanges,
        owner: effectiveOwner,
        nhr,
        othr,
        nrate: nrate,
        otrate: otrate,
        rent,
        vat_amount: vatAmt,
        vat_percent: saved ? parseFloat(saved.vat_percent) || 0 : (isEffectiveVatYes === "Yes" ? 15 : 0),
        total,
        invoice_no: invData.invoice_no || "",
        bill_no: invData.bill_no || "",
        remark: saved ? (saved.remark || "") : ""
      });

      // 🟢 Logsheet calculations
      let ts_nr = 0, ts_ot = 0;
      let vTs = timesheets.filter((t) => allRelatedNorms.includes(cleanPlate(t.plate_no)));

      for (let i = 1; i <= daysInMonth; i++) {
        let checkDate = new Date(parseInt(yearStr), mIdx, i);
        let formattedDate = checkDate.toLocaleDateString("en-GB", {
          day: "2-digit", month: "short", year: "numeric"
        }).replace(/ /g, " ");

        let dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][checkDate.getDay()];
        let siteForRule = currentSiteName.split("&")[0].trim().toUpperCase();
        
        let specialRule = specialRulesRes.rows.find(
          (r) => r.is_active && (r.sites.includes("ALL") || r.sites.includes(siteForRule)) && r.dates.includes(formattedDate)
        );

        let ts = vTs.find((r) => parseInt(r.record_date) === i);
        let tm = ts ? parseFloat(ts.calc_time) || 0 : 0;
        let bd = ts ? String(ts.bd || "").trim().toUpperCase() : "";
        let hasData = tm > 0 || bd !== "" || (ts && (ts.wrk_start || ts.hmr_start));

        if (!hasData && specialRule && specialRule.rule_type !== "FULL_OT") {
          bd = specialRule.rule_type;
          hasData = true;
        }

        if (!hasData) continue;

        let isFullOT = (dayName === "Fri" || i === 31);
        if (specialRule && specialRule.rule_type === "FULL_OT") isFullOT = true;

        let nHr = 0, otHr = 0;
        if (bd === "ID" || bd === "NP" || bd === "W" || bd === "P") {
          if (isFullOT) otHr = 10;
          else nHr = 10;
        } else if (bd === "B" || bd === "H" || bd === "A" || bd === "L" || bd === "S") {
          nHr = 0; otHr = 0;
        } else if (tm > 0) {
          if (isFullOT) otHr = tm;
          else {
            if (tm > 10) { nHr = 10; otHr = tm - 10; }
            else { nHr = tm; otHr = 0; }
          }
        }

        ts_nr += nHr;
        ts_ot += otHr;
      }

      let inv_nr = parseFloat(invData.bill_nr) || 0;
      let inv_ot = parseFloat(invData.bill_ot) || 0;
      let bill_sup_nr = parseFloat(saved?.nhr) || 0;
      let bill_sup_ot = parseFloat(saved?.othr) || 0;

      let isDiffCleared = invData.diff_clear && !["no", "false", "0", "", "null", "undefined"].includes(String(invData.diff_clear).trim().toLowerCase());

      let diff_nr = "";
      let diff_ot = "";
      let diff_st = "";

      if (!isDiffCleared) {
        if (ts_nr > inv_nr) diff_nr = parseFloat((ts_nr - inv_nr).toFixed(2));
        if (ts_ot > inv_ot) diff_ot = parseFloat((ts_ot - inv_ot).toFixed(2));

        if (diff_nr !== "" && diff_ot !== "") diff_st = "NR & OT";
        else if (diff_nr !== "") diff_st = "NR";
        else if (diff_ot !== "") diff_st = "OT";
      }

      reportData.push({
        report_date: monthStr.substring(0, 3) + " " + yearStr.substring(2, 4),
        rate: baseRate || saved?.nrate || "-",
        vat: isEffectiveVatYes,
        site: currentSiteName,
        owner: effectiveOwner,
        driver_name: effectiveDriver,
        plate: displayPlate,
        plate_logs: vPlateChanges,
        ts_nr: ts_nr > 0 ? ts_nr : "",
        ts_ot: ts_ot > 0 ? ts_ot : "",
        inv_nr: inv_nr > 0 ? inv_nr : "",
        inv_ot: inv_ot > 0 ? inv_ot : "",
        bill_db_nr: bill_sup_nr > 0 ? bill_sup_nr : "",
        bill_db_ot: bill_sup_ot > 0 ? bill_sup_ot : "",
        diff_nr,
        diff_ot,
        diff_st,
      });
    });

    res.json({
      success: true,
      rows: resultRows,
      reportData,
      role: user.role,
      assigned_sites: user.assigned_sites || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/combined-bill", verifyViewBillUser, async (req, res) => {
  try {
    const { plate_no, from_month, from_year, to_month, to_year } = req.query;
    const user = req.viewUser;

    if (!plate_no || !from_month || !from_year || !to_month || !to_year) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: plate_no, from_month, from_year, to_month, to_year",
      });
    }

    const cleanPlate = plate_no.trim().toUpperCase();

    // Site Co പെർമിഷൻ ചെക്ക്
    if (user.role === "Site Co") {
      const assigned = (user.assigned_sites || []).map((s) => String(s).trim().toLowerCase());
      
      const vehicleCheck = await pool.query(
        `SELECT site_name FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = $1`,
        [cleanPlate]
      );
      const siteLogCheck = await pool.query(
        `SELECT site_name FROM vehicle_site_log WHERE UPPER(TRIM(plate_no)) = $1`,
        [cleanPlate]
      );

      let vSites = new Set();
      if (vehicleCheck.rows[0]?.site_name) vSites.add(vehicleCheck.rows[0].site_name.trim().toLowerCase());
      siteLogCheck.rows.forEach(r => { if (r.site_name) vSites.add(r.site_name.trim().toLowerCase()); });

      let hasAccess = Array.from(vSites).some(site => assigned.includes(site));
      if (!hasAccess && assigned.length > 0) {
        // Status 403 മാറ്റി 200/400 നൽകുന്നു (ലോഗൗട്ട് ആകാതിരിക്കാൻ)
        return res.json({ 
          success: false, 
          message: "Plate no not exist or no permission! Contact Administrator." 
        });
      }
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

    // 🟢 പ്ലേറ്റ് നമ്പർ പഴയതോ പുതിയതോ ഏത് കൊടുത്താലും മാസ്റ്റർ റെക്കോർഡും ബില്ലിംഗ് ഹിസ്റ്ററിയും കണ്ടെത്താൻ
    const masterPlateQuery = await pool.query(
      `SELECT plate_no FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = UPPER(TRIM($1)) 
       UNION 
       SELECT (SELECT plate_no FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = UPPER(TRIM(new_plate_no))) FROM vehicle_plate_log WHERE UPPER(TRIM(old_plate_no)) = UPPER(TRIM($1))
       UNION 
       SELECT (SELECT plate_no FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = UPPER(TRIM(old_plate_no))) FROM vehicle_plate_log WHERE UPPER(TRIM(new_plate_no)) = UPPER(TRIM($1))
       LIMIT 1`,
      [cleanPlate]
    );

    const actualMasterPlate = masterPlateQuery.rows[0]?.plate_no ? masterPlateQuery.rows[0].plate_no.trim().toUpperCase() : cleanPlate;

    // 🟢 FIX: എല്ലാ related plates-ഉം (old + new) കൃത്യമായി collect ചെയ്ത് billing records fetch ചെയ്യുന്നു
const plateLogForRelated = await pool.query(
  `SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date 
   FROM vehicle_plate_log 
   WHERE UPPER(TRIM(old_plate_no)) = UPPER(TRIM($1)) 
      OR UPPER(TRIM(new_plate_no)) = UPPER(TRIM($1))
      OR UPPER(TRIM(old_plate_no)) = UPPER(TRIM($2))
      OR UPPER(TRIM(new_plate_no)) = UPPER(TRIM($2))
   ORDER BY change_date ASC`,
  [cleanPlate, actualMasterPlate]
);

let allRelatedPlates = [cleanPlate];
if (actualMasterPlate && actualMasterPlate !== cleanPlate) {
  allRelatedPlates.push(actualMasterPlate);
}
plateLogForRelated.rows.forEach(pl => {
  let op = (pl.old_plate_no || "").trim().toUpperCase();
  let np = (pl.new_plate_no || "").trim().toUpperCase();
  if (op && !allRelatedPlates.includes(op)) allRelatedPlates.push(op);
  if (np && !allRelatedPlates.includes(np)) allRelatedPlates.push(np);
});

const [savedResult, tsVehicleRes, rateLogRes, siteLogRes, ownerLogRes, plateLogRes] = await Promise.all([
  pool.query(
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
    [allRelatedPlates, targetMonths]
  ),
  pool.query(`SELECT * FROM timesheet_vehicles WHERE UPPER(TRIM(plate_no)) = UPPER(TRIM($1)) LIMIT 1`, [actualMasterPlate]),
  pool.query(`SELECT * FROM vehicle_rate_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [allRelatedPlates]),
  pool.query(`SELECT * FROM vehicle_site_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [allRelatedPlates]),
  pool.query(`SELECT * FROM vehicle_owner_log WHERE UPPER(TRIM(plate_no)) = ANY($1::text[]) ORDER BY id DESC`, [allRelatedPlates]),
  pool.query(
    `SELECT old_plate_no, new_plate_no, TO_CHAR(change_date, 'YYYY-MM-DD') as change_date 
     FROM vehicle_plate_log 
     WHERE UPPER(TRIM(old_plate_no)) = ANY($1::text[]) 
        OR UPPER(TRIM(new_plate_no)) = ANY($1::text[]) 
     ORDER BY change_date ASC`,
    [allRelatedPlates]
  )
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
      let cleanRelated = allRelatedPlates.map(p => p.replace(/[^A-Z0-9]/g, ""));
      return parts.some(p => cleanRelated.includes(p)) || cleanRelated.includes(raw.replace(/[^A-Z0-9]/g, ""));
    }

    targetMonths.forEach((mStr) => {
      let savedRow = savedResult.rows.find((r) => r.billing_month === mStr && plateMatchesRelated(r.plate_no));

      const [mName, yStr] = mStr.split(" ");
      const shortDate = mName.substring(0, 3) + " " + (yStr ? yStr.substring(2, 4) : "");

      const mIdxCur = monthNames.indexOf(mName);
      const curYearInt = parseInt(yStr);
      const mStart = new Date(curYearInt, mIdxCur, 1);
      const mEnd = new Date(curYearInt, mIdxCur + 1, 0);

      // 🟢 ആ മാസത്തെ ശരിയായ പ്ലേറ്റ് നമ്പർ കണ്ടെത്തുന്നു
      let rowPlateNo = cleanPlate;
      if (plateLogs.length > 0) {
        for (let pl of plateLogs) {
          if (!pl.change_date) continue;
          let [cYear, cMonth, cDay] = pl.change_date.split("-").map(Number);
          let cDate = new Date(cYear, cMonth - 1, cDay);

          if (cYear === curYearInt && (cMonth - 1) === mIdxCur) {
            rowPlateNo = `${pl.old_plate_no.trim().toUpperCase()} ➔ ${pl.new_plate_no.trim().toUpperCase()}`;
          } else if (mEnd < cDate) {
            rowPlateNo = pl.old_plate_no.trim().toUpperCase();
          } else if (mStart >= cDate) {
            rowPlateNo = pl.new_plate_no.trim().toUpperCase();
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

        let rowSite = savedRow.site_name || vehicleInfo.site_name || "N/A";
        let autoCompany = "Haka";
        let sUpper = rowSite.toUpperCase();
        if (sUpper.includes("ALJODA") || sUpper.includes("AL JODA")) autoCompany = "Aljoda";
        else if (sUpper.includes("MASAR")) autoCompany = "Masar Wheels";
        else if (sUpper.includes("WE1") || sUpper.includes("WE 1")) autoCompany = "We1 Track";

        let rowNRate = (savedRow.nrate !== null && parseFloat(savedRow.nrate) > 0) ? parseFloat(savedRow.nrate) : fallbackNRate;
        let rowOTRate = (savedRow.otrate !== null && parseFloat(savedRow.otrate) > 0) ? parseFloat(savedRow.otrate) : fallbackOTRate;

        combinedRows.push({
          billing_month: mStr,
          date: savedRow.date || shortDate,
          company: autoCompany,
          owner: savedRow.owner || fallbackOwnerName,
          site_name: rowSite,
          vtype: savedRow.vtype || vehicleInfo.vehicle_type || "N/A",
          driver: savedRow.driver || vehicleInfo.driver_name || "N/A",
          plate_no: rowPlateNo, // 🟢 മാസത്തിനനുസരിച്ചുള്ള യഥാർത്ഥ പ്ലേറ്റ് നൽകുന്നു
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
        let activeSite = vehicleInfo.site_name || "N/A";
        let autoCompany = "Haka";
        let sUpper = activeSite.toUpperCase();
        if (sUpper.includes("ALJODA") || sUpper.includes("AL JODA")) autoCompany = "Aljoda";
        else if (sUpper.includes("MASAR")) autoCompany = "Masar Wheels";
        else if (sUpper.includes("WE1") || sUpper.includes("WE 1")) autoCompany = "We1 Track";

        combinedRows.push({
          billing_month: mStr,
          date: shortDate,
          company: autoCompany,
          owner: fallbackOwnerName,
          site_name: activeSite,
          vtype: vehicleInfo.vehicle_type || "N/A",
          driver: vehicleInfo.driver_name || "N/A",
          plate_no: rowPlateNo, // 🟢 മാസത്തിനനുസരിച്ചുള്ള യഥാർത്ഥ പ്ലേറ്റ് നൽകുന്നു
          nhr: 0,
          nrate: fallbackNRate,
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


// 🟢 Security Code Verification for Combined Bill Generator Images in View Bill
router.post("/verify-combined-security", verifyViewBillUser, (req, res) => {
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

// 🟢 1. Single Remark Auto-Save Endpoint
router.post("/save-remark", verifyViewBillUser, async (req, res) => {
  try {
    const { plate_no, month, site_name, remark } = req.body;
    const cleanPlate = (plate_no || "").trim().toUpperCase();

    // 🟢 500 Error Fix: Removed site_name from the condition to avoid matching issues
    const check = await pool.query(
      `SELECT id FROM billing_records WHERE UPPER(TRIM(plate_no)) = $1 AND billing_month = $2`,
      [cleanPlate, month]
    );

    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE billing_records SET remark = $1 WHERE id = $2`,
        [remark || "", check.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO billing_records (plate_no, billing_month, site_name, remark, nhr, othr, rent, total) 
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0)`,
        [cleanPlate, month, site_name || "N/A", remark || ""]
      );
    }

    res.json({ success: true, message: "Remark saved successfully!" });
  } catch (error) {
    console.error("Save Remark Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🟢 2. Save Active Calculated Screen Data (Triggered on Copy/Download)
router.post("/save-active-bill", verifyViewBillUser, async (req, res) => {
  const client = await pool.connect();
  try {
    const { month, items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "No items provided." });
    }

    await client.query("BEGIN");

    for (let row of items) {
      const cleanPlate = (row.plate_no || "").trim().toUpperCase();
      const nhr = parseFloat(row.nhr) || 0;
      const othr = parseFloat(row.othr) || 0;
      const nrate = parseFloat(row.nrate) || 0;
      const otrate = parseFloat(row.otrate) || 0;
      const remark = (row.remark || "").trim();
       const parsedVatPercent = parseFloat(row.vat_percent);
      const vatPercent = Number.isFinite(parsedVatPercent) ? parsedVatPercent : 15;

      const rent = parseFloat(row.rent) || 0;

      // 🟢 കൃത്യമായ റൗണ്ടിംഗ്
      const exactRent = (nhr * nrate) + (othr * otrate);
      const calculatedRent = exactRent > 0 ? Number(exactRent.toFixed(2)) : rent;
      const total = Number((exactRent * (1 + (vatPercent / 100))).toFixed(2));
      const vatAmt = Number((total - calculatedRent).toFixed(2));

      const check = await client.query(
        `SELECT id FROM billing_records WHERE UPPER(TRIM(plate_no)) = $1 AND billing_month = $2 AND site_name = $3`,
        [cleanPlate, month, row.site]
      );

      if (check.rows.length > 0) {
        await client.query(
          `UPDATE billing_records SET 
            nrate = COALESCE(NULLIF($1, 0), nrate),
            otrate = COALESCE(NULLIF($2, 0), otrate),
            rent = COALESCE(NULLIF($3, 0), rent),
            vat_amount = $4,
            total = COALESCE(NULLIF($5, 0), total),
            remark = $6
           WHERE id = $7`,
          [nrate, otrate, rent, vatAmt, total, remark, check.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO billing_records 
            (billing_month, date, owner, site_name, vtype, driver, plate_no, nhr, nrate, othr, otrate, rent, vat_amount, total, remark) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            month, row.date, row.owner, row.site, row.vtype, row.driver,
            cleanPlate, nhr, nrate, othr, otrate, rent, vatAmt, total, remark
          ]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Active bill data auto-saved!" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 🟢 Save Edited Bill from View Bill Screen (For Site Co & View Bill Users)
router.post("/save-bill", verifyViewBillUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { billing_period, items } = req.body;

    for (let row of items) {
      const cleanPlate = (row.plate || row.plate_no || "").trim().toUpperCase();
      const nhr = parseFloat(row.nhr) || 0;
      const nrate = parseFloat(row.nrate) || 0;
      const othr = parseFloat(row.othr) || 0;
      const otrate = parseFloat(row.otrate) || 0;
      const adjAmt = parseFloat(row.adjusted_amount) || 0;
      const remark = (row.remark || "").trim();
     const parsedVatPercent = parseFloat(row.vat_percent);
      const vatPercent = Number.isFinite(parsedVatPercent) ? parsedVatPercent : 15;

      const rent = parseFloat(row.rent) || 0;

      if (nhr === 0 && othr === 0 && rent === 0 && adjAmt === 0 && remark === "") {
        continue;
      }

      // 🟢 ഫുൾ പ്രിസിഷൻ കാൽക്കുലേഷൻ & കൃത്യമായ റൗണ്ടിംഗ്
      const exactRent = (nhr * nrate) + (othr * otrate);
      const calculatedRent = exactRent > 0 ? Number(exactRent.toFixed(2)) : rent;
      
      const total = Number((exactRent * (1 + (vatPercent / 100))).toFixed(2));
      const vat_amount = Number((total - calculatedRent).toFixed(2));
      const after_adjustment = Number((total + adjAmt).toFixed(2));

      let rawSplitPlates = cleanPlate.split(/➔|→|->/).map(p => p.trim().toUpperCase()).filter(Boolean);
      let cleanupPlates = [...new Set([cleanPlate, ...rawSplitPlates])];

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
        `DELETE FROM billing_records WHERE billing_month = $1 AND UPPER(TRIM(plate_no)) = ANY($2::text[]) AND site_name = $3`,
        [billing_period, cleanupPlates, row.site_name]
      );

      const query = `INSERT INTO billing_records 
                (billing_month, date, company, owner, site_name, vtype, driver, plate_no, nhr, nrate, othr, otrate, rent, vat_percent, vat_amount, total, adjustment_desc, adjusted_amount, after_adjustment, remark) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`;

      await client.query(query, [
        billing_period, row.date, row.company, row.owner, row.site_name, row.vtype, row.driver, cleanPlate,
        nhr, row.nrate, othr, row.otrate, calculatedRent, vatPercent, vat_amount, total,
        row.adjustment_desc || "", adjAmt, after_adjustment, remark
      ]);
    }
    await client.query("COMMIT");
    res.json({ success: true, message: "Saved successfully to ERP!" });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});


module.exports = router;