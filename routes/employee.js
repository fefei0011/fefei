const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { verifyToken } = require("../middlewares/auth");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key_change_this";

// 🟢 Secure PIN Verification (Generates JWT Token)
router.post("/verify-pin", (req, res) => {
  const { pin } = req.body;
  const validPin = process.env.EMP_PIN;

  if (pin === validPin) {
    const token = jwt.sign({ role: "admin_access" }, JWT_SECRET, {
      expiresIn: "12h",
    });
    res.json({ success: true, token }); 
  } else {
    res.status(401).json({ success: false, message: "Invalid PIN" });
  }
});

// Apply JWT verification middleware to ALL routes below this line
router.use(verifyToken);

// 1. Get all employees
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM employee_data ORDER BY id DESC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 2. Add a new employee (Modified for Accounting Sync)
router.post("/new", async (req, res) => {
  try {
    // Added mobile_allowance here
    const { name, mobile, base_salary, shift_hours, mobile_allowance, start, end } = req.body;

    // Insert Employee
    const newEmployee = await pool.query(
      "INSERT INTO employee_data (name, mobile, base_salary, shift_hours, mobile_allowance, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        name,
        mobile,
        base_salary || 0,
        shift_hours || 10,
        mobile_allowance || 0, // Added to position $5
        start || null,         // Moved to position $6
        end || null,           // Moved to position $7
      ]
    );

    const empId = newEmployee.rows[0].id;

    // Auto-create Ledger in Accounting System
    await pool.query(
      "INSERT INTO oe_accounts (ledger_name, main_group, sub_group, is_employee, emp_id) VALUES ($1, 'Liabilities', 'Current Liabilities', TRUE, $2)",
      [`${name} - Payable`, empId],
    );

    res.status(201).json(newEmployee.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 3. Update an existing employee
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Added mobile_allowance here
    const { name, mobile, base_salary, shift_hours, mobile_allowance, start, end } = req.body;
    const updateEmployee = await pool.query(
      "UPDATE employee_data SET name = $1, mobile = $2, base_salary = $3, shift_hours = $4, mobile_allowance = $5, start_date = $6, end_date = $7 WHERE id = $8",
      [
        name,
        mobile,
        base_salary || 0,
        shift_hours || 10,
        mobile_allowance || 0, // Added to position $5
        start || null,         // Moved to position $6
        end || null,           // Moved to position $7
        id                     // Moved to position $8
      ]
    );
    res.json(updateEmployee.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 4. Get attendance logs
router.get("/logs", async (req, res) => {
  try {
    const { empId, from, to } = req.query;
    const result = await pool.query(
      `SELECT * FROM attendance_logs 
             WHERE emp_id = $1 AND log_date >= $2 AND log_date <= $3 
             ORDER BY log_date ASC`,
      [empId, from, to],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 5. Save or Update Daily Log (Fixed Race Condition with UPSERT)
router.post("/logs/save", async (req, res) => {
  try {
    const {
      emp_id,
      log_date,
      day_name,
      shift_start,
      shift_end,
      absent,
      break_start,
      break_end,
      remarks,
      break_hr,
      shift_hr,
      worked_hr,
      normal_hr,
      ot_hr,
    } = req.body;

    const query = `
            INSERT INTO attendance_logs (emp_id, log_date, day_name, shift_start, shift_end, absent, break_start, break_end, remarks, break_hr, shift_hr, worked_hr, normal_hr, ot_hr) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (emp_id, log_date) 
            DO UPDATE SET 
                shift_start = EXCLUDED.shift_start, 
                shift_end = EXCLUDED.shift_end, 
                absent = EXCLUDED.absent, 
                break_start = EXCLUDED.break_start, 
                break_end = EXCLUDED.break_end, 
                remarks = EXCLUDED.remarks, 
                break_hr = EXCLUDED.break_hr, 
                shift_hr = EXCLUDED.shift_hr, 
                worked_hr = EXCLUDED.worked_hr, 
                normal_hr = EXCLUDED.normal_hr, 
                ot_hr = EXCLUDED.ot_hr
        `;

    await pool.query(query, [
      emp_id,
      log_date,
      day_name,
      shift_start,
      shift_end,
      absent,
      break_start,
      break_end,
      remarks,
      break_hr,
      shift_hr,
      worked_hr,
      normal_hr,
      ot_hr,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// ================= EXPENSES APIs ================= //

// 6. Get expenses for an employee within date range
router.get("/expenses", async (req, res) => {
  try {
    const { empId, from, to } = req.query;
    const result = await pool.query(
      `SELECT * FROM employee_expenses 
             WHERE emp_id = $1 AND exp_date >= $2 AND exp_date <= $3 
             ORDER BY exp_date ASC`,
      [empId, from, to],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 7. Save a new expense
router.post("/expenses/save", async (req, res) => {
  try {
    const { emp_id, exp_date, description, amount } = req.body;
    const newExp = await pool.query(
      `INSERT INTO employee_expenses (emp_id, exp_date, description, amount) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
      [emp_id, exp_date, description, amount],
    );
    res.json({ success: true, expense: newExp.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 8. Delete an expense
router.delete("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM employee_expenses WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 9. Update an expense (NEWLY ADDED)
router.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount } = req.body;
    await pool.query(
      "UPDATE employee_expenses SET description = $1, amount = $2 WHERE id = $3",
      [description, amount, id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
