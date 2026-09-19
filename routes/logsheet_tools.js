process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const { createClient } = require("webdav");
const sharp = require("sharp");

let pdfLib;
try {
  pdfLib = require("pdf-lib");
} catch (e) {
  console.warn("pdf-lib not loaded:", e.message);
}

const { verifyEditor } = require("../middlewares/auth");

const router = express.Router();

const ncUrl = process.env.NEXTCLOUD_URL;
const ncUser = process.env.NEXTCLOUD_USER;
const ncPass = process.env.NEXTCLOUD_PASS;

const client = createClient(ncUrl, {
  username: ncUser,
  password: ncPass,
});

// 🟢 1. ROTATE & SAVE DIRECTLY TO NEXTCLOUD
router.post("/rotate-file", verifyEditor, async (req, res) => {
  try {
    const { filePath, rotation } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: "No path provided" });
    }

    const exists = await client.exists(filePath);
    if (!exists) {
      return res.status(404).json({ success: false, message: "File not found in Nextcloud" });
    }

    const ext = path.extname(filePath).toLowerCase();
    const rotDeg = parseInt(rotation, 10) || 0;

    if (rotDeg === 0 || rotDeg % 90 !== 0) {
      return res.json({ success: true, message: "No rotation needed" });
    }

    // Download file buffer from Nextcloud
    const fileBuffer = await client.getFileContents(filePath);

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const rotatedBuffer = await sharp(Buffer.from(fileBuffer))
        .rotate(rotDeg)
        .withMetadata()
        .toBuffer();

      // Put rotated file back to Nextcloud (Overwrite)
      await client.putFileContents(filePath, rotatedBuffer, { overwrite: true });
      return res.json({ success: true, message: "Image rotated and saved successfully" });
    } else if (ext === ".pdf") {
      if (!pdfLib || !pdfLib.PDFDocument) {
        return res.status(500).json({ success: false, message: "pdf-lib library not installed" });
      }

      const pdfDoc = await pdfLib.PDFDocument.load(Buffer.from(fileBuffer));
      const pages = pdfDoc.getPages();
      pages.forEach((page) => {
        const currentRot = page.getRotation().angle;
        page.setRotation(pdfLib.degrees((currentRot + rotDeg) % 360));
      });

      const savedBytes = await pdfDoc.save();
      await client.putFileContents(filePath, Buffer.from(savedBytes), { overwrite: true });
      return res.json({ success: true, message: "PDF rotated and saved successfully" });
    } else {
      return res.status(400).json({ success: false, message: "Unsupported file type for rotation" });
    }
  } catch (err) {
    console.error("WebDAV Rotate Save Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 2. RENAME FILE ON NEXTCLOUD
router.post("/rename-file", verifyEditor, async (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    if (!oldPath) {
      return res.status(400).json({ success: false, message: "Old path missing" });
    }

    const exists = await client.exists(oldPath);
    if (!exists) {
      return res.status(404).json({ success: false, message: "Original file not found in Nextcloud" });
    }

    const dir = path.posix.dirname(oldPath);
    const ext = path.extname(oldPath);
    let cleanBaseName = path.basename(newName, ext).trim();

    cleanBaseName = cleanBaseName.replace(/[/\\?%*:|"<>]/g, "-");
    if (!cleanBaseName) {
      return res.status(400).json({ success: false, message: "Invalid file name" });
    }

    const targetPath = path.posix.join(dir, cleanBaseName + ext);
    if (oldPath !== targetPath && (await client.exists(targetPath))) {
      return res.status(400).json({ success: false, message: "A file with this name already exists" });
    }

    // Nextcloud moveFile performs rename
    await client.moveFile(oldPath, targetPath);
    res.json({ success: true, newPath: targetPath, newBaseName: cleanBaseName + ext });
  } catch (err) {
    console.error("WebDAV Rename Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 3. EXTRACT PDF TO IMAGES & MOVE PDF TO TEMP IN NEXTCLOUD
router.post("/extract-pdf", verifyEditor, async (req, res) => {
  const tempLocalDir = path.join(os.tmpdir(), `extract_${Date.now()}`);
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: "PDF path missing" });
    }

    const exists = await client.exists(filePath);
    if (!exists) {
      return res.status(404).json({ success: false, message: "PDF not found in Nextcloud" });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pdf") {
      return res.status(400).json({ success: false, message: "File is not a PDF" });
    }

    // Create a temporary directory locally on the Linux server
    await fs.promises.mkdir(tempLocalDir, { recursive: true });
    const localPdfPath = path.join(tempLocalDir, "source.pdf");

    // Download PDF from Nextcloud to local temp
    const pdfBuffer = await client.getFileContents(filePath);
    await fs.promises.writeFile(localPdfPath, Buffer.from(pdfBuffer));

    const pdfBaseName = path.basename(filePath, ext);
    const outputPrefix = path.join(tempLocalDir, `${pdfBaseName}_img`);

    // Run poppler-utils pdfimages
    const cmd = `pdfimages -png "${localPdfPath}" "${outputPrefix}"`;

    exec(cmd, async (error, stdout, stderr) => {
      if (error) {
        console.error("pdfimages exec error:", error, stderr);
        await fs.promises.rm(tempLocalDir, { recursive: true, force: true }).catch(() => {});
        return res.status(500).json({ success: false, message: "Failed to extract images from PDF" });
      }

      try {
        const nextcloudFolder = path.posix.dirname(filePath);

        // Upload all extracted images to Nextcloud folder
        const localFiles = await fs.promises.readdir(tempLocalDir);
        for (const f of localFiles) {
          if (f.endsWith(".png") || f.endsWith(".jpg")) {
            const localImgPath = path.join(tempLocalDir, f);
            const imgData = await fs.promises.readFile(localImgPath);
            const targetNcPath = path.posix.join(nextcloudFolder, f);
            await client.putFileContents(targetNcPath, imgData, { overwrite: true });
          }
        }

        // Create Temp folder in Nextcloud if not exists
        const ncTempFolder = path.posix.join(nextcloudFolder, "Temp");
        if (!(await client.exists(ncTempFolder))) {
          await client.createDirectory(ncTempFolder);
        }

        // Move original PDF to Nextcloud Temp folder
        const targetTempPath = path.posix.join(ncTempFolder, path.basename(filePath));
        await client.moveFile(filePath, targetTempPath);

        // Clean up server local temp files
        await fs.promises.rm(tempLocalDir, { recursive: true, force: true }).catch(() => {});

        res.json({
          success: true,
          message: "Images extracted in original quality. PDF moved to Temp.",
        });
      } catch (ncErr) {
        console.error("Nextcloud sync error:", ncErr);
        await fs.promises.rm(tempLocalDir, { recursive: true, force: true }).catch(() => {});
        res.status(500).json({ success: false, message: ncErr.message });
      }
    });
  } catch (err) {
    console.error("Extract PDF WebDAV Error:", err);
    await fs.promises.rm(tempLocalDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;