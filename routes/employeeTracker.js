const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use Memory Storage so we can process and save files dynamically using unique_id
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

// 2. Add New Employee with Custom Unique ID, Site Name & Vehicle Details
router.post('/add', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res) => {
    try {
        const { 
            name, designation, joining_date, category, site_name, vehicle_model, plate_no, mobile, alt_mobile, address, 
            passport_no, notes, emergency_name, emergency_mobile, 
            emergency_alt, emergency_relation 
        } = req.body;

        let prefix = 'EMP';
        if (category === 'Director') prefix = 'DIR';
        else if (category === 'Site Co') prefix = 'SC';
        else if (category === 'Field Co') prefix = 'FL';
        else if (category === 'Office Admin') prefix = 'OF-AD';
        else if (category === 'Office Accounts') prefix = 'OF-ACC';

        const countRes = await pool.query(
            'SELECT COUNT(*) FROM employees WHERE category = $1',
            [category]
        );
        const nextIdNum = parseInt(countRes.rows[0].count) + 1;
        const unique_id = `${prefix}-${String(nextIdNum).padStart(3, '0')}`;

        // Handle Profile Image Upload with Custom Naming
        let imagePath = null;
        if (req.files && req.files['image'] && req.files['image'][0]) {
            const imgFile = req.files['image'][0];
            const imgName = `${unique_id}_profile${path.extname(imgFile.originalname)}`;
            const imgFullPath = path.join(__dirname, '../public/uploads/employee_images/', imgName);
            fs.writeFileSync(imgFullPath, imgFile.buffer);
            imagePath = `/uploads/employee_images/${imgName}`;
        }

        const newEmp = await pool.query(
            `INSERT INTO employees (unique_id, name, designation, joining_date, category, site_name, vehicle_model, plate_no, image_path, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
            [unique_id, name, designation, joining_date, category, site_name || null, vehicle_model || null, plate_no || null, imagePath, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation]
        );

        // Handle Multiple Documents Upload with unique_id - count format
        const uploadedDocs = req.files && (req.files['documents'] || req.files['document']);
        if (uploadedDocs) {
            const docs = Array.isArray(uploadedDocs) ? uploadedDocs : [uploadedDocs];
            let docNames = req.body.doc_names || [];
            if (!Array.isArray(docNames)) docNames = [docNames];

            const targetEmpId = newEmp.rows[0].id;

// Find the highest document number already used.
// DO NOT use COUNT(*), because deleted documents create gaps.
const maxDocRes = await pool.query(
    `SELECT COALESCE(
        MAX(
            CAST(
                substring(file_path FROM '-([0-9]+)\.[^/]+$')
                AS INTEGER
            )
        ),
        0
    ) AS max_number
    FROM employee_documents
    WHERE employee_id = $1`,
    [targetEmpId]
);

let docCount = parseInt(maxDocRes.rows[0].max_number, 10) || 0;

for (let i = 0; i < docs.length; i++) {
    docCount++;

    const fileExt = path.extname(docs[i].originalname);
    const customFileName = `${unique_id}-${docCount}${fileExt}`;

    const docFullPath = path.join(
        __dirname,
        '../public/uploads/employee_docs/',
        customFileName
    );

    fs.writeFileSync(docFullPath, docs[i].buffer);

    const docPath = `/uploads/employee_docs/${customFileName}`;
    const customDocName = docNames[i] || docs[i].originalname;

    await pool.query(
        `INSERT INTO employee_documents
        (employee_id, doc_name, file_path)
        VALUES ($1, $2, $3)`,
        [targetEmpId, customDocName, docPath]
    );
}
}
        res.json({ success: true, message: "Employee added successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Edit Employee & Handle Multiple File Uploads, Site & Role Change History
router.post('/edit/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), async (req, res) => {
    try {
        const empId = req.params.id;
        const { 
            name, designation, joining_date, category, site_name, vehicle_model, plate_no, prev_end_date, new_start_date, released_date, mobile, alt_mobile, address, 
            passport_no, notes, emergency_name, emergency_mobile, 
            emergency_alt, emergency_relation, doc_action, replace_doc_id
        } = req.body;

        const oldData = await pool.query('SELECT unique_id, category, designation, site_name, joining_date FROM employees WHERE id = $1', [empId]);
        if (oldData.rows.length === 0) return res.status(404).json({ success: false, message: "Employee not found" });

        const empData = oldData.rows[0];
        const prevCat = empData.category;
        const prevDesig = empData.designation;
        const prevSite = (empData.site_name || '').trim();
        const prevJoiningDate = empData.joining_date;

        let activeJoiningDate = joining_date;

        const isCategoryChanged = prevCat !== category && prevCat !== 'Released';
        const isSiteChanged = prevSite !== (site_name || '').trim();

        // റോൾ മാറുകയോ സൈറ്റ് നെയിം മാറുകയോ ചെയ്താൽ ഹിസ്റ്ററി ലോഗിൽ ചേർക്കുന്നു
        if ((isCategoryChanged || isSiteChanged) && prevCat !== 'Released') {
            activeJoiningDate = new_start_date || activeJoiningDate; 
            await pool.query(
                `INSERT INTO employee_history (employee_id, previous_category, previous_designation, previous_site, start_date, end_date) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [empId, prevCat, prevDesig, prevSite || null, prevJoiningDate, prev_end_date]
            );
        }

        let query = `UPDATE employees SET name = $1, designation = $2, joining_date = $3, category = $4, site_name = $5, vehicle_model = $6, plate_no = $7, mobile = $8, alt_mobile = $9, address = $10, passport_no = $11, notes = $12, emergency_name = $13, emergency_mobile = $14, emergency_alt = $15, emergency_relation = $16, released_date = $17`;
        let params = [name, designation, activeJoiningDate, category, site_name || null, vehicle_model || null, plate_no || null, mobile, alt_mobile, address, passport_no, notes, emergency_name, emergency_mobile, emergency_alt, emergency_relation, released_date || null];

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

        // Handle Document Replace/Add Logic with Unique ID format
        if (doc_action === 'add_new' || doc_action === 'replace') {
            if (req.files && req.files['documents']) {
                const docs = req.files['documents'];
                let docNames = req.body.doc_names || [];
                if (!Array.isArray(docNames)) docNames = [docNames];

                if (doc_action === 'replace' && replace_doc_id) {
                    await pool.query(`DELETE FROM employee_documents WHERE id = $1`, [replace_doc_id]);
                }

                // Get the HIGHEST document number already used.
// Do NOT use COUNT(*) because deleted documents must not reuse their number.
const maxDocRes = await pool.query(
    `SELECT COALESCE(
        MAX(
            CAST(
                substring(file_path FROM '-([0-9]+)\.[^/]+$')
                AS INTEGER
            )
        ),
        0
    ) AS max_number
    FROM employee_documents
    WHERE employee_id = $1`,
    [empId]
);

let docCount = parseInt(maxDocRes.rows[0].max_number, 10) || 0;

for (let i = 0; i < docs.length; i++) {
    docCount++;

    const fileExt = path.extname(docs[i].originalname);
    const customFileName = `${empData.unique_id}-${docCount}${fileExt}`;

    const docFullPath = path.join(
        __dirname,
        '../public/uploads/employee_docs/',
        customFileName
    );

    fs.writeFileSync(docFullPath, docs[i].buffer);

    const docPath = `/uploads/employee_docs/${customFileName}`;
    const customDocName = docNames[i] || docs[i].originalname;

    await pool.query(
        `INSERT INTO employee_documents
        (employee_id, doc_name, file_path)
        VALUES ($1, $2, $3)`,
        [empId, customDocName, docPath]
    );
}

            }
        }

        res.json({ success: true, message: "Employee updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Get Employee Details, History & Documents
router.get('/details/:id', async (req, res) => {
    try {
        const empId = req.params.id;
        const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [empId]);
        const history = await pool.query('SELECT * FROM employee_history WHERE employee_id = $1 ORDER BY start_date ASC', [empId]);
        const docs = await pool.query('SELECT * FROM employee_documents WHERE employee_id = $1', [empId]);

        res.json({ success: true, employee: emp.rows[0], history: history.rows, documents: docs.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. Delete Employee with Security Key
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

// 6. Delete Specific Employee Document (Clean deletion from DB and server)
router.delete('/document/:docId', async (req, res) => {
    try {
        const { docId } = req.params;

        // Get document + employee unique_id
        const docRes = await pool.query(
            `SELECT 
                ed.id,
                ed.employee_id,
                ed.file_path,
                e.unique_id
             FROM employee_documents ed
             JOIN employees e ON e.id = ed.employee_id
             WHERE ed.id = $1`,
            [docId]
        );

        if (docRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Document not found."
            });
        }

        const deletedDoc = docRes.rows[0];

        const employeeId = deletedDoc.employee_id;
        const uniqueId = deletedDoc.unique_id;

        // Get all documents in their CURRENT numeric order
        const docsRes = await pool.query(
            `SELECT id, file_path, doc_name
             FROM employee_documents
             WHERE employee_id = $1
             ORDER BY
                CAST(
                    substring(file_path FROM '-([0-9]+)\\.[^/]+$')
                    AS INTEGER
                ) ASC`,
            [employeeId]
        );

        const docs = docsRes.rows;

        // Find deleted document's current number
        const deletedFileName = path.basename(deletedDoc.file_path || '');
        const deletedMatch = deletedFileName.match(/-(\d+)\.[^.]+$/);

        if (!deletedMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid document filename format."
            });
        }

        const deletedNumber = parseInt(deletedMatch[1], 10);

        // Delete physical file first
        const deletedPhysicalPath = path.join(
            __dirname,
            '../public',
            deletedDoc.file_path
        );

        if (fs.existsSync(deletedPhysicalPath)) {
            fs.unlinkSync(deletedPhysicalPath);
        }

        // Delete database row
        await pool.query(
            `DELETE FROM employee_documents WHERE id = $1`,
            [docId]
        );

        // Rename all documents AFTER the deleted number
        for (const doc of docs) {

            // Skip the document we just deleted
            if (doc.id === parseInt(docId, 10)) {
                continue;
            }

            const oldFileName = path.basename(doc.file_path || '');

            const match = oldFileName.match(/-(\d+)(\.[^.]+)$/);

            if (!match) {
                continue;
            }

            const currentNumber = parseInt(match[1], 10);
            const extension = match[2];

            // Only files after deleted number need renumbering
            if (currentNumber > deletedNumber) {

                const newNumber = currentNumber - 1;

                const newFileName =
                    `${uniqueId}-${newNumber}${extension}`;

                const oldPhysicalPath = path.join(
                    __dirname,
                    '../public/uploads/employee_docs/',
                    oldFileName
                );

                const newPhysicalPath = path.join(
                    __dirname,
                    '../public/uploads/employee_docs/',
                    newFileName
                );

                // Rename physical file
                if (fs.existsSync(oldPhysicalPath)) {
                    fs.renameSync(
                        oldPhysicalPath,
                        newPhysicalPath
                    );
                }

                // Update DB path
                const newFilePath =
                    `/uploads/employee_docs/${newFileName}`;

                await pool.query(
                    `UPDATE employee_documents
                     SET file_path = $1
                     WHERE id = $2`,
                    [newFilePath, doc.id]
                );
            }
        }

        res.json({
            success: true,
            message: "Document removed and remaining documents renumbered successfully!"
        });

    } catch (err) {
        console.error("Document delete/renumber error:", err);

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


// 7. Upload Additional Document for Employee
router.post('/upload-doc/:id', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
        
        const empRes = await pool.query('SELECT unique_id FROM employees WHERE id = $1', [req.params.id]);
        if (empRes.rows.length === 0) return res.status(404).json({ success: false, message: "Employee not found." });
        
        const uniqueId = empRes.rows[0].unique_id;
        // Find the highest number ever currently stored for this employee.
// COUNT(*) must NOT be used because deleted documents create gaps.
const maxDocRes = await pool.query(
    `SELECT COALESCE(
        MAX(
            CAST(
                substring(file_path FROM '-([0-9]+)\.[^/]+$')
                AS INTEGER
            )
        ),
        0
    ) AS max_number
    FROM employee_documents
    WHERE employee_id = $1`,
    [req.params.id]
);

const lastDocNumber = parseInt(maxDocRes.rows[0].max_number, 10) || 0;
const docCount = lastDocNumber + 1;

const fileExt = path.extname(req.file.originalname);
const customFileName = `${uniqueId}-${docCount}${fileExt}`;

const docFullPath = path.join(
    __dirname,
    '../public/uploads/employee_docs/',
    customFileName
);

fs.writeFileSync(docFullPath, req.file.buffer);

const docPath = `/uploads/employee_docs/${customFileName}`;
const docName = req.file.originalname;

await pool.query(
    `INSERT INTO employee_documents
    (employee_id, doc_name, file_path)
    VALUES ($1, $2, $3)`,
    [req.params.id, docName, docPath]
);

        res.json({ success: true, message: "Document uploaded successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;