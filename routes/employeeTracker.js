const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. Get All Employees with Category Filter
router.get('/all', async (req, res) => {
    try {
        const { category } = req.query;
        let query = 'SELECT * FROM employees ORDER BY id DESC';
        let params = [];
        
        if (category && category !== 'All') {
            query = 'SELECT * FROM employees WHERE category = $1 ORDER BY unique_id ASC';
            params = [category];
        }
        const result = await pool.query(query, params);
        res.json({ success: true, employees: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Add New Employee
router.post('/add', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res) => {
    try {
        const { 
            name, designation, joining_date, category, site_name, vehicle_model, plate_no, vehicle_purchase_date, mobile, alt_mobile, address, 
            passport_no, notes, emergency_name, emergency_mobile, 
            emergency_alt, emergency_relation 
        } = req.body;

        let prefix = 'EMP';
        if (category === 'Director') prefix = 'DIR';
        else if (category === 'Site Co') prefix = 'SC';
        else if (category === 'Field Co') prefix = 'FL';
        else if (category === 'Office Staff' || category === 'Office Admin') prefix = 'OF-ST';
        else if (category === 'Office Accounts') prefix = 'OF-ACC';

        const countRes = await pool.query('SELECT COUNT(*) FROM employees WHERE category = $1', [category]);
        const nextIdNum = parseInt(countRes.rows[0].count) + 1;
        const unique_id = `${prefix}-${String(nextIdNum).padStart(3, '0')}`;

        let imagePath = null;
        if (req.files && req.files['image'] && req.files['image'][0]) {
            const imgFile = req.files['image'][0];
            const imgName = `${unique_id}_profile${path.extname(imgFile.originalname)}`;
            const imgFullPath = path.join(__dirname, '../public/uploads/employee_images/', imgName);
            fs.writeFileSync(imgFullPath, imgFile.buffer);
            imagePath = `/uploads/employee_images/${imgName}`;
        }

        const vehicle_status = (vehicle_model || plate_no) ? 'Active' : null;

        const newEmp = await pool.query(
            `INSERT INTO employees (unique_id, name, designation, joining_date, category, site_name, vehicle_model, plate_no, vehicle_purchase_date, vehicle_status, image_path, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING *`,
            [unique_id, name, designation, joining_date, category, site_name || null, vehicle_model || null, plate_no || null, vehicle_purchase_date || null, vehicle_status, imagePath, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation]
        );

        const targetEmpId = newEmp.rows[0].id;

        // Save to Vehicle History
        if (plate_no || vehicle_model) {
            await pool.query(
                `INSERT INTO employee_vehicle_history (employee_id, vehicle_model, plate_no, purchase_date, status)
                 VALUES ($1, $2, $3, $4, 'Active')`,
                [targetEmpId, vehicle_model || null, plate_no || null, vehicle_purchase_date || null]
            );
        }

        // Handle Documents
        const uploadedDocs = req.files && (req.files['documents'] || req.files['document']);
        if (uploadedDocs) {
            const docs = Array.isArray(uploadedDocs) ? uploadedDocs : [uploadedDocs];
            let docNames = req.body.doc_names || [];
            if (!Array.isArray(docNames)) docNames = [docNames];

            const maxDocRes = await pool.query(
                `SELECT COALESCE(MAX(CAST(substring(file_path FROM '-([0-9]+)\\.[^/]+$') AS INTEGER)), 0) AS max_number FROM employee_documents WHERE employee_id = $1`,
                [targetEmpId]
            );
            let docCount = parseInt(maxDocRes.rows[0].max_number, 10) || 0;

            for (let i = 0; i < docs.length; i++) {
                docCount++;
                const fileExt = path.extname(docs[i].originalname);
                const customFileName = `${unique_id}-${docCount}${fileExt}`;
                const docFullPath = path.join(__dirname, '../public/uploads/employee_docs/', customFileName);
                fs.writeFileSync(docFullPath, docs[i].buffer);
                const docPath = `/uploads/employee_docs/${customFileName}`;
                const customDocName = docNames[i] || docs[i].originalname;

                await pool.query(`INSERT INTO employee_documents (employee_id, doc_name, file_path) VALUES ($1, $2, $3)`, [targetEmpId, customDocName, docPath]);
            }
        }
        res.json({ success: true, message: "Employee added successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Edit Employee & Handle Vehicle/Role History
router.post('/edit/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res) => {
    try {
        const empId = req.params.id;
        const { 
            name, designation, joining_date, category, site_name, prev_end_date, new_start_date, released_date, mobile, alt_mobile, address, 
            passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation, doc_action, replace_doc_id,
            vehicle_action, vehicle_model, plate_no, vehicle_purchase_date, vehicle_sold_date,
            new_vehicle_model, new_plate_no, new_vehicle_purchase_date
        } = req.body;

        const oldData = await pool.query('SELECT unique_id, category, designation, site_name, vehicle_model, plate_no, vehicle_purchase_date, vehicle_status, vehicle_sold_date, joining_date FROM employees WHERE id = $1', [empId]);
        if (oldData.rows.length === 0) return res.status(404).json({ success: false, message: "Employee not found" });

        const empData = oldData.rows[0];
        const prevCat = empData.category;
        const prevDesig = empData.designation;
        const prevSite = (empData.site_name || '').trim();
        const prevJoiningDate = empData.joining_date;

        let activeJoiningDate = joining_date;
        const isCategoryChanged = prevCat !== category && prevCat !== 'Released';
        const isSiteChanged = prevSite !== (site_name || '').trim();

        if ((isCategoryChanged || isSiteChanged) && prevCat !== 'Released') {
            activeJoiningDate = new_start_date || activeJoiningDate; 
            await pool.query(
                `INSERT INTO employee_history (employee_id, previous_category, previous_designation, previous_site, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)`,
                [empId, prevCat, prevDesig, prevSite || null, prevJoiningDate, prev_end_date]
            );
        }

        // Vehicle Actions Logic
        let curVehModel = vehicle_model || empData.vehicle_model;
        let curPlateNo = plate_no || empData.plate_no;
        let curPurchDate = vehicle_purchase_date || empData.vehicle_purchase_date;
        let curVehStatus = empData.vehicle_status || 'Active';
        let curSoldDate = vehicle_sold_date || empData.vehicle_sold_date;

        if (vehicle_action === 'sold') {
            curVehStatus = 'Sold';
            curSoldDate = vehicle_sold_date;
            await pool.query(
                `UPDATE employee_vehicle_history SET status = 'Sold', sold_date = $1 WHERE employee_id = $2 AND plate_no = $3 AND status = 'Active'`,
                [vehicle_sold_date, empId, curPlateNo]
            );
        } else if (vehicle_action === 'replaced') {
            await pool.query(
                `UPDATE employee_vehicle_history SET status = 'Sold', sold_date = $1 WHERE employee_id = $2 AND plate_no = $3 AND status = 'Active'`,
                [vehicle_sold_date, empId, curPlateNo]
            );
            curVehModel = new_vehicle_model;
            curPlateNo = new_plate_no;
            curPurchDate = new_vehicle_purchase_date;
            curVehStatus = 'Active';
            curSoldDate = null;
            await pool.query(
                `INSERT INTO employee_vehicle_history (employee_id, vehicle_model, plate_no, purchase_date, status) VALUES ($1, $2, $3, $4, 'Active')`,
                [empId, curVehModel, curPlateNo, curPurchDate]
            );
        } else if (vehicle_action === 'new_purchase') {
            curVehModel = new_vehicle_model;
            curPlateNo = new_plate_no;
            curPurchDate = new_vehicle_purchase_date;
            curVehStatus = 'Active';
            curSoldDate = null;
            await pool.query(
                `INSERT INTO employee_vehicle_history (employee_id, vehicle_model, plate_no, purchase_date, status) VALUES ($1, $2, $3, $4, 'Active')`,
                [empId, curVehModel, curPlateNo, curPurchDate]
            );
        }

        let query = `UPDATE employees SET name = $1, designation = $2, joining_date = $3, category = $4, site_name = $5, vehicle_model = $6, plate_no = $7, vehicle_purchase_date = $8, vehicle_status = $9, vehicle_sold_date = $10, mobile = $11, alt_mobile = $12, address = $13, passport_no = $14, notes = $15, emergency_name = $16, emergency_mobile = $17, emergency_alt = $18, emergency_relation = $19, released_date = $20`;
        let params = [name, designation, activeJoiningDate, category, site_name || null, curVehModel || null, curPlateNo || null, curPurchDate || null, curVehStatus, curSoldDate || null, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation, released_date || null];

        if (req.files && req.files['image'] && req.files['image'][0]) {
            const imgFile = req.files['image'][0];
            const imgName = `${empData.unique_id}_profile${path.extname(imgFile.originalname)}`;
            const imgFullPath = path.join(__dirname, '../public/uploads/employee_images/', imgName);
            fs.writeFileSync(imgFullPath, imgFile.buffer);
            query += `, image_path = $${params.length + 1}`;
            params.push(`/uploads/employee_images/${imgName}`);
        }
        query += ` WHERE id = $${params.length + 1}`;
        params.push(empId);
        await pool.query(query, params);

        if (doc_action === 'add_new' || doc_action === 'replace') {
            if (req.files && req.files['documents']) {
                const docs = req.files['documents'];
                let docNames = req.body.doc_names || [];
                if (!Array.isArray(docNames)) docNames = [docNames];

                if (doc_action === 'replace' && replace_doc_id) {
                    await pool.query(`DELETE FROM employee_documents WHERE id = $1`, [replace_doc_id]);
                }

                const maxDocRes = await pool.query(
                    `SELECT COALESCE(MAX(CAST(substring(file_path FROM '-([0-9]+)\\.[^/]+$') AS INTEGER)), 0) AS max_number FROM employee_documents WHERE employee_id = $1`, [empId]
                );
                let docCount = parseInt(maxDocRes.rows[0].max_number, 10) || 0;

                for (let i = 0; i < docs.length; i++) {
                    docCount++;
                    const fileExt = path.extname(docs[i].originalname);
                    const customFileName = `${empData.unique_id}-${docCount}${fileExt}`;
                    const docFullPath = path.join(__dirname, '../public/uploads/employee_docs/', customFileName);
                    fs.writeFileSync(docFullPath, docs[i].buffer);
                    const docPath = `/uploads/employee_docs/${customFileName}`;
                    const customDocName = docNames[i] || docs[i].originalname;
                    await pool.query(`INSERT INTO employee_documents (employee_id, doc_name, file_path) VALUES ($1, $2, $3)`, [empId, customDocName, docPath]);
                }
            }
        }
        res.json({ success: true, message: "Employee updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Get Employee Details, History, Vehicle History & Documents
router.get('/details/:id', async (req, res) => {
    try {
        const empId = req.params.id;
        const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [empId]);
        const history = await pool.query('SELECT * FROM employee_history WHERE employee_id = $1 ORDER BY start_date ASC', [empId]);
        const vehHistory = await pool.query('SELECT * FROM employee_vehicle_history WHERE employee_id = $1 ORDER BY purchase_date ASC, id ASC', [empId]);
        const docs = await pool.query('SELECT * FROM employee_documents WHERE employee_id = $1', [empId]);

        res.json({ 
            success: true, 
            employee: emp.rows[0], 
            history: history.rows, 
            vehicle_history: vehHistory.rows, 
            documents: docs.rows 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const { deleteSecret } = req.body;
        if (!process.env.DELETE_SECRET || deleteSecret !== process.env.DELETE_SECRET) {
            return res.status(403).json({ success: false, message: "Access Denied: Invalid Delete Security Key." });
        }
        await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: "Staff deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/document/:docId', async (req, res) => {
    try {
        const { docId } = req.params;
        const docRes = await pool.query(`SELECT ed.id, ed.employee_id, ed.file_path, e.unique_id FROM employee_documents ed JOIN employees e ON e.id = ed.employee_id WHERE ed.id = $1`, [docId]);
        if (docRes.rows.length === 0) return res.status(404).json({ success: false, message: "Document not found." });

        const deletedDoc = docRes.rows[0];
        const employeeId = deletedDoc.employee_id;
        const uniqueId = deletedDoc.unique_id;

        const docsRes = await pool.query(
            `SELECT id, file_path, doc_name FROM employee_documents WHERE employee_id = $1 ORDER BY CAST(substring(file_path FROM '-([0-9]+)\\.[^/]+$') AS INTEGER) ASC`, [employeeId]
        );
        const docs = docsRes.rows;

        const deletedFileName = path.basename(deletedDoc.file_path || '');
        const deletedMatch = deletedFileName.match(/-(\d+)\.[^.]+$/);
        if (!deletedMatch) return res.status(400).json({ success: false, message: "Invalid document format." });

        const deletedNumber = parseInt(deletedMatch[1], 10);
        const deletedPhysicalPath = path.join(__dirname, '../public', deletedDoc.file_path);
        if (fs.existsSync(deletedPhysicalPath)) fs.unlinkSync(deletedPhysicalPath);

        await pool.query(`DELETE FROM employee_documents WHERE id = $1`, [docId]);

        for (const doc of docs) {
            if (doc.id === parseInt(docId, 10)) continue;
            const oldFileName = path.basename(doc.file_path || '');
            const match = oldFileName.match(/-(\d+)(\.[^.]+)$/);
            if (!match) continue;

            const currentNumber = parseInt(match[1], 10);
            const extension = match[2];
            if (currentNumber > deletedNumber) {
                const newNumber = currentNumber - 1;
                const newFileName = `${uniqueId}-${newNumber}${extension}`;
                const oldPhysicalPath = path.join(__dirname, '../public/uploads/employee_docs/', oldFileName);
                const newPhysicalPath = path.join(__dirname, '../public/uploads/employee_docs/', newFileName);

                if (fs.existsSync(oldPhysicalPath)) fs.renameSync(oldPhysicalPath, newPhysicalPath);
                const newFilePath = `/uploads/employee_docs/${newFileName}`;
                await pool.query(`UPDATE employee_documents SET file_path = $1 WHERE id = $2`, [newFilePath, doc.id]);
            }
        }
        res.json({ success: true, message: "Document removed and renumbered successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/upload-doc/:id', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
        const empRes = await pool.query('SELECT unique_id FROM employees WHERE id = $1', [req.params.id]);
        if (empRes.rows.length === 0) return res.status(404).json({ success: false, message: "Employee not found." });
        
        const uniqueId = empRes.rows[0].unique_id;
        const maxDocRes = await pool.query(`SELECT COALESCE(MAX(CAST(substring(file_path FROM '-([0-9]+)\\.[^/]+$') AS INTEGER)), 0) AS max_number FROM employee_documents WHERE employee_id = $1`, [req.params.id]);
        const lastDocNumber = parseInt(maxDocRes.rows[0].max_number, 10) || 0;
        const docCount = lastDocNumber + 1;

        const fileExt = path.extname(req.file.originalname);
        const customFileName = `${uniqueId}-${docCount}${fileExt}`;
        const docFullPath = path.join(__dirname, '../public/uploads/employee_docs/', customFileName);

        fs.writeFileSync(docFullPath, req.file.buffer);
        const docPath = `/uploads/employee_docs/${customFileName}`;
        const docName = req.file.originalname;

        await pool.query(`INSERT INTO employee_documents (employee_id, doc_name, file_path) VALUES ($1, $2, $3)`, [req.params.id, docName, docPath]);
        res.json({ success: true, message: "Document uploaded successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;