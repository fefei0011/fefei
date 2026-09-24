const express = require("express");
const pool = require("../config/db");
const router = express.Router();

const verifyAccessCode = (req, res, next) => {
  const clientCode = req.headers["x-vat-code"];
  const serverCode = process.env.VAT_TRACKER_CODE;

  if (!serverCode) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error: VAT_TRACKER_CODE not set",
    });
  }

  if (clientCode === serverCode) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Invalid Access Code" });
  }
};

const KNOWN_SITES = ["afif", "bisha", "humaij", "khushaibi", "taif"];

function getSiteFirstName(siteName) {
  if (!siteName) return "";
  const clean = siteName.trim().toLowerCase();
  for (const site of KNOWN_SITES) {
    if (clean.includes(site)) return site;
  }
  let noZ = clean.replace(/^z[\s\-_]+/i, "").trim();
  let firstWord = noZ.split(/\s+/)[0] || "";
  return firstWord.replace(/[^a-zA-Z0-9]/g, "");
}

function isZSite(siteName) {
  if (!siteName) return true;
  const clean = siteName.trim().toLowerCase();
  for (const site of KNOWN_SITES) {
    if (clean.includes(site)) return false;
  }
  return /^z(\s*[-_]?\s*(site|dummy|closed|na|none|$))/i.test(clean);
}

// Diff Tracker Data API
router.get("/data", verifyAccessCode, async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) throw new Error("Year is required");
    const currentYear = parseInt(year);

    const vehicleResult = await pool.query(`
      SELECT plate_no, owner_name, vat 
      FROM timesheet_vehicles
    `);
    if (vehicleResult.rows.length === 0) return res.json({ success: true, data: [] });

    const vehicles = vehicleResult.rows;
    const plates = vehicles.map((v) => v.plate_no);

    let ownerLogs = [];
    try {
      const ownerLogRes = await pool.query(
        `
        SELECT plate_no, owner_name, vat, work_start_date, work_end_date 
        FROM vehicle_owner_log 
        WHERE plate_no = ANY($1) 
        ORDER BY COALESCE(work_start_date, '2000-01-01') ASC
      `,
        [plates]
      );
      ownerLogs = ownerLogRes.rows;
    } catch (e) {
      console.warn("vehicle_owner_log warning:", e.message);
    }

    const getMonthOwnerInfo = (plateNo, mIdx, fallbackOwner, fallbackVat) => {
      const mStart = new Date(currentYear, mIdx, 1);
      const mEnd = new Date(currentYear, mIdx + 1, 0);

      const matchedLogs = ownerLogs.filter((l) => {
        if ((l.plate_no || "").trim().toUpperCase() !== plateNo.trim().toUpperCase()) return false;
        const sDate = l.work_start_date ? new Date(l.work_start_date) : new Date(2000, 0, 1);
        const eDate = l.work_end_date ? new Date(l.work_end_date) : new Date(2099, 11, 31);
        return sDate <= mEnd && eDate >= mStart;
      });

      if (matchedLogs.length > 0) {
        const active = matchedLogs[matchedLogs.length - 1];
        return {
          owner: active.owner_name && active.owner_name.trim() ? active.owner_name.trim() : fallbackOwner,
          vat: String(active.vat || "").trim().toLowerCase(),
        };
      }

      return {
        owner: fallbackOwner,
        vat: String(fallbackVat || "").trim().toLowerCase(),
      };
    };

    const siteLogResult = await pool.query(
      `
      SELECT plate_no, site_name, work_start_date, work_end_date, status 
      FROM vehicle_site_log 
      WHERE plate_no = ANY($1) AND site_name IS NOT NULL AND TRIM(site_name) != ''
    `,
      [plates]
    );

    const billingResult = await pool.query(
      `
      SELECT supplier, site_name, month_index, quick_dice 
      FROM vat_billing_records 
      WHERE year = $1 AND company = 'NON_VAT'
    `,
      [currentYear]
    );
    const billingData = billingResult.rows;

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const shortYear = currentYear.toString().slice(-2);

    const erpResult = await pool.query(
      `
      SELECT 
        COALESCE(NULLIF(TRIM(plate_no), ''), '') as plate_no,
        LOWER(REGEXP_REPLACE(TRIM(COALESCE(owner, '')), '[^a-zA-Z0-9]', '', 'g')) as clean_owner,
        LOWER(TRIM(COALESCE(owner, ''))) as norm_owner,
        LOWER(TRIM(COALESCE(site_name, ''))) as clean_site_name,
        LOWER(TRIM(COALESCE(billing_month, ''))) as raw_billing_month,
        ROUND(COALESCE(
          NULLIF(after_adjustment::numeric, 0), 
          NULLIF(rent::numeric, 0), 
          NULLIF(total::numeric, 0), 
          0
        ), 2) as row_total
      FROM billing_records
      WHERE billing_month ILIKE $1 OR billing_month ILIKE $2
      ORDER BY id DESC
    `,
      [`%${currentYear}%`, `%${shortYear}%`]
    );
    const erpData = erpResult.rows;

    const suppliersMap = {};

    siteLogResult.rows.forEach((log) => {
      if (isZSite(log.site_name)) return;

      const vehicle = vehicles.find(
        (v) => (v.plate_no || "").trim().toUpperCase() === (log.plate_no || "").trim().toUpperCase()
      );
      if (!vehicle) return;

      const defaultOwner = (vehicle.owner_name || "").trim();
      const defaultVat = vehicle.vat;

      let sd = log.work_start_date ? new Date(log.work_start_date) : new Date(2000, 0, 1);
      let ed = log.work_end_date
        ? new Date(log.work_end_date)
        : log.status === "Running"
        ? new Date(2099, 11, 31)
        : new Date(sd);

      for (let m = 0; m < 12; m++) {
        let mStart = new Date(currentYear, m, 1);
        let mEnd = new Date(currentYear, m + 1, 0);

        if (sd <= mEnd && ed >= mStart) {
          const ownerInfo = getMonthOwnerInfo(log.plate_no, m, defaultOwner, defaultVat);
          const isVat = ["yes", "true", "15"].includes(ownerInfo.vat);
          if (isVat) continue;

          const supName = ownerInfo.owner;
          if (!supName || supName === "Unknown" || supName === "COMPANY VEHICLE") continue;

          const siteFirst = getSiteFirstName(log.site_name);
          if (!siteFirst) continue;

          if (!suppliersMap[supName]) {
            suppliersMap[supName] = { supplier: supName, sites: {} };
          }

          if (!suppliersMap[supName].sites[siteFirst]) {
            suppliersMap[supName].sites[siteFirst] = {
              site_first_name: siteFirst,
              active_months: Array(12).fill(false),
              billing: {},
            };
            for (let i = 0; i < 12; i++) {
              suppliersMap[supName].sites[siteFirst].billing[i] = {
                vendor_ts: 0,
                quick_dice: "",
              };
            }
          }

          suppliersMap[supName].sites[siteFirst].active_months[m] = true;
        }
      }
    });

    Object.values(suppliersMap).forEach((sup) => {
      const normSup = sup.supplier.toLowerCase().trim();
      const cleanSup = normSup.replace(/[^a-zA-Z0-9]/g, "");

      Object.values(sup.sites).forEach((siteObj) => {
        const sFirst = siteObj.site_first_name.toLowerCase();

        for (let m = 0; m < 12; m++) {
          const shortM = monthNames[m].substring(0, 3).toLowerCase();
          const fullM = monthNames[m].toLowerCase();

          let monthTsTotal = 0;
          const processedPlates = new Set();

          erpData.forEach((e) => {
            const bMonth = (e.raw_billing_month || "").trim().toLowerCase();
            const isMonthMatch = bMonth.includes(shortM) || bMonth.includes(fullM);
            const eSiteFirst = getSiteFirstName(e.clean_site_name);
            const isSiteMatch = eSiteFirst === sFirst || e.clean_site_name.includes(sFirst);

            if (isMonthMatch && isSiteMatch && !isZSite(e.clean_site_name)) {
              const isOwnerMatch = e.norm_owner === normSup || e.clean_owner === cleanSup;
              if (isOwnerMatch) {
                const pKey = (e.plate_no || "").trim().toUpperCase();
                let isVatVeh = false;
                if (pKey) {
                  const rowVeh = vehicles.find(
                    (v) => (v.plate_no || "").trim().toUpperCase() === pKey
                  );
                  const ownerInfo = getMonthOwnerInfo(
                    pKey,
                    m,
                    rowVeh ? rowVeh.owner_name : "",
                    rowVeh ? rowVeh.vat : ""
                  );
                  isVatVeh = ["yes", "true", "15"].includes(ownerInfo.vat);
                }

                if (!isVatVeh) {
                  const uniqueRowKey = `${pKey}_${e.clean_site_name}`;
                  if (!processedPlates.has(uniqueRowKey)) {
                    processedPlates.add(uniqueRowKey);
                    monthTsTotal += parseFloat(e.row_total || 0);
                  }
                }
              }
            }
          });

          const savedBill = billingData.find(
            (b) =>
              b.supplier.toLowerCase().trim() === normSup &&
              (b.site_name || "").toLowerCase().trim() === sFirst &&
              b.month_index === m
          );

          siteObj.billing[m] = {
            vendor_ts: Number(monthTsTotal.toFixed(2)),
            quick_dice: savedBill ? savedBill.quick_dice || "" : "",
          };

          if (monthTsTotal > 0) siteObj.active_months[m] = true;
        }
      });

      sup.sites = Object.values(sup.sites).filter((s) => s.active_months.includes(true));
    });

    const finalArray = Object.values(suppliersMap)
      .filter((s) => s.sites.length > 0)
      .sort((a, b) => a.supplier.localeCompare(b.supplier));

    res.json({ success: true, data: finalArray });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;