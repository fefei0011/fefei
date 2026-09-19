const express = require("express");
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const pool = require("../config/db");

require("dotenv").config();

const router = express.Router();

/*
 * ============================================================
 * VENDOR CONFIGURATION
 * ============================================================
 */

const VENDORS = {
  HAKA: {
    label: "Haka Contracting Est",
    email: "hakacontractingest",
    prefix: "HAK-INV",
  },

  ALJODA: {
    label: "AL-JODA SARAA EQUIPMENT RENTAL Est",
    email: "evotech",
    prefix: "INV-25",
  },

  MASAR: {
    label: "Etijah Al Masar General Contracting Est",
    email: "masar wheels",
    prefix: "INV-MW",
  },

  WE1: {
    label: "We1 Track Company",
    email: "we1trackco",
    prefix: "INV-WE1",
  },
};

/*
 * ============================================================
 * GET VENDOR LIST
 * ============================================================
 */

router.get("/invoice-vendors", (req, res) => {
  return res.json(VENDORS);
});

/*
 * ============================================================
 * IMAP CONFIG
 * ============================================================
 */

function createImapConnection() {
  if (!process.env.EMAIL_USER) {
    throw new Error(
      "EMAIL_USER is not configured in .env"
    );
  }

  if (!process.env.EMAIL_PASS) {
    throw new Error(
      "EMAIL_PASS is not configured in .env"
    );
  }

  return new Imap({
    user: process.env.EMAIL_USER,

    password: process.env.EMAIL_PASS,

    host: "imap.gmail.com",

    port: 993,

    tls: true,

    tlsOptions: {
      servername: "imap.gmail.com",
    },

    authTimeout: 15000,

    connTimeout: 20000,

    keepalive: true,
  });
}

/*
 * ============================================================
 * DATE HELPERS
 * ============================================================
 */

/*
 * Returns today's date as YYYY-MM-DD using the server's
 * local timezone.
 */
function getTodayDateString() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateToLocalDateString(date) {
  if (!(date instanceof Date)) {
    return "";
  }

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/*
 * ============================================================
 * FILENAME HELPERS
 * ============================================================
 */

function sanitizeFilename(filename) {
  return String(filename)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .substring(0, 180);
}

/*
 * ============================================================
 * DATABASE LOOKUP
 * ============================================================
 */

async function getBillNumber(invoiceNo) {
  try {
    const result =
      await pool.query(
        `
          SELECT bill_no
          FROM invoice_records
          WHERE invoice_no ILIKE $1
          LIMIT 1
        `,
        [`%${invoiceNo}%`]
      );

    if (
      result.rows.length === 0
    ) {
      return null;
    }

    const billNo =
      result.rows[0].bill_no;

    if (
      billNo === null ||
      billNo === undefined
    ) {
      return null;
    }

    const cleaned =
      String(billNo)
        .replace(/[\/\\]/g, "")
        .trim();

    return cleaned || null;

  } catch (error) {

    console.error(
      "Database lookup error:",
      error
    );

    return null;
  }
}

/*
 * ============================================================
 * CHECK WHETHER ATTACHMENT MATCHES VENDOR
 * ============================================================
 */

function isMatchingInvoice(
  attachment,
  vendor
) {

  if (!attachment) {
    return false;
  }

  const filename =
    attachment.filename;

  if (!filename) {
    return false;
  }

  const upperFilename =
    filename.toUpperCase();

  const upperPrefix =
    vendor.prefix.toUpperCase();

  return (
    upperFilename.startsWith(
      upperPrefix
    ) &&
    filename
      .toLowerCase()
      .endsWith(".pdf")
  );
}

/*
 * ============================================================
 * PROCESS ONE EMAIL
 * ============================================================
 */

async function processEmail(
  stream,
  vendor,
  useBillNumber
) {

  const parsed =
    await simpleParser(stream);

  if (!parsed) {
    return [];
  }

  /*
   * Make sure the email has a valid date.
   */
  if (!parsed.date) {
    return [];
  }

  const emailDate =
    new Date(parsed.date);

  const emailDateString =
    dateToLocalDateString(
      emailDate
    );

  const todayString =
    getTodayDateString();

  /*
   * Only process today's emails.
   */
  if (
    emailDateString !==
    todayString
  ) {
    return [];
  }

  if (
    !Array.isArray(
      parsed.attachments
    )
  ) {
    return [];
  }

  const files = [];

  for (
    const attachment
    of parsed.attachments
  ) {

    if (
      !isMatchingInvoice(
        attachment,
        vendor
      )
    ) {
      continue;
    }

    const originalFilename =
      attachment.filename;

    const invoiceNo =
      originalFilename.substring(
        0,
        originalFilename.lastIndexOf(".")
      ) ||
      originalFilename;

    let finalFilename =
      sanitizeFilename(
        originalFilename
      );

    /*
     * Bill process:
     *
     * Find the invoice number in PostgreSQL and use the
     * bill_no as the downloaded filename.
     */
    if (useBillNumber) {

      const billNumber =
        await getBillNumber(
          invoiceNo
        );

      if (billNumber) {

        finalFilename =
          `${sanitizeFilename(
            billNumber
          )}.pdf`;
      }
    }

    /*
     * Ensure the attachment is actually a PDF.
     */
    const mimeType =
      attachment.contentType ||
      "application/pdf";

    files.push({
      name: finalFilename,

      mimeType,

      data:
        attachment.content.toString(
          "base64"
        ),
    });
  }

  return files;
}

/*
 * ============================================================
 * FETCH INVOICES FROM IMAP
 * ============================================================
 */

function fetchInvoicesFromMailbox(
  vendor,
  useBillNumber = false
) {

  return new Promise(
    (resolve, reject) => {

      let settled = false;

      const finish = (
        error,
        files = []
      ) => {

        if (settled) {
          return;
        }

        settled = true;

        if (error) {
          reject(error);
        } else {
          resolve(files);
        }
      };

      let imap;

      try {
        imap =
          createImapConnection();
      } catch (error) {
        finish(error);
        return;
      }

      /*
       * --------------------------------------------------------
       * IMAP ERROR
       * --------------------------------------------------------
       */

      imap.once(
        "error",
        (error) => {

          console.error(
            "IMAP error:",
            error
          );

          finish(error);
        }
      );

      /*
       * --------------------------------------------------------
       * IMAP READY
       * --------------------------------------------------------
       */

      imap.once(
        "ready",
        () => {

          imap.openBox(
            "INBOX",
            true,
            (openError) => {

              if (openError) {

                try {
                  imap.end();
                } catch (_) {}

                finish(
                  openError
                );

                return;
              }

              /*
               * Gmail's SINCE search is inclusive.
               *
               * We deliberately search from today and then
               * perform an exact date check after parsing.
               */
              const today =
                new Date();

              today.setHours(
                0,
                0,
                0,
                0
              );

              imap.search(
                [
                  [
                    "SINCE",
                    today,
                  ],

                  [
                    "FROM",
                    vendor.email,
                  ],
                ],

                (searchError, results) => {

                  if (searchError) {

                    try {
                      imap.end();
                    } catch (_) {}

                    finish(
                      searchError
                    );

                    return;
                  }

                  if (
                    !results ||
                    results.length === 0
                  ) {

                    try {
                      imap.end();
                    } catch (_) {}

                    finish(
                      null,
                      []
                    );

                    return;
                  }

                  /*
                   * ------------------------------------------------
                   * FETCH FULL EMAILS
                   * ------------------------------------------------
                   */

                  const fetch =
                    imap.fetch(
                      results,
                      {
                        bodies: "",
                      }
                    );

                  const allFiles = [];

                  const messagePromises = [];

                  fetch.on(
                    "message",
                    (message) => {

                      const messagePromise =
                        new Promise(
                          (resolveMessage) => {

                            let bodyFound =
                              false;

                            message.on(
                              "body",
                              (stream) => {

                                bodyFound =
                                  true;

                                processEmail(
                                  stream,
                                  vendor,
                                  useBillNumber
                                )
                                  .then(
                                    (files) => {

                                      if (
                                        files &&
                                        files.length
                                      ) {
                                        allFiles.push(
                                          ...files
                                        );
                                      }

                                      resolveMessage();
                                    }
                                  )
                                  .catch(
                                    (error) => {

                                      console.error(
                                        "Email processing error:",
                                        error
                                      );

                                      /*
                                       * Don't let one malformed
                                       * email stop the whole batch.
                                       */
                                      resolveMessage();
                                    }
                                  );
                              }
                            );

                            message.once(
                              "end",
                              () => {

                                /*
                                 * If no body event was received,
                                 * don't leave the Promise hanging.
                                 */
                                if (
                                  !bodyFound
                                ) {
                                  resolveMessage();
                                }
                              }
                            );

                            message.once(
                              "error",
                              (error) => {

                                console.error(
                                  "Message error:",
                                  error
                                );

                                resolveMessage();
                              }
                            );
                          }
                        );

                      messagePromises.push(
                        messagePromise
                      );
                    }
                  );

                  fetch.once(
                    "error",
                    (fetchError) => {

                      try {
                        imap.end();
                      } catch (_) {}

                      finish(
                        fetchError
                      );
                    }
                  );

                  fetch.once(
                    "end",
                    async () => {

                      try {

                        await Promise.all(
                          messagePromises
                        );

                        /*
                         * Remove duplicates.
                         *
                         * For Bill downloads, duplicate invoice
                         * emails should not create duplicate files.
                         */
                        const uniqueFiles =
                          [];

                        const seen =
                          new Set();

                        for (
                          const file
                          of allFiles
                        ) {

                          const key =
                            file.name;

                          if (
                            seen.has(key)
                          ) {
                            continue;
                          }

                          seen.add(key);

                          uniqueFiles.push(
                            file
                          );
                        }

                        try {
                          imap.end();
                        } catch (_) {}

                        finish(
                          null,
                          uniqueFiles
                        );

                      } catch (error) {

                        try {
                          imap.end();
                        } catch (_) {}

                        finish(
                          error
                        );
                      }
                    }
                  );
                }
              );
            }
          );
        });

      /*
       * ----------------------------------------------------------
       * CONNECT
       * ----------------------------------------------------------
       */

      try {
        imap.connect();
      } catch (error) {
        finish(error);
      }
    }
  );
}

/*
 * ============================================================
 * VALIDATE VENDOR
 * ============================================================
 */

function getVendor(
  req,
  res
) {

  const {
    vendorKey
  } = req.body || {};

  if (!vendorKey) {

    res.status(400).json({
      error:
        "Vendor key is required.",
    });

    return null;
  }

  const vendor =
    VENDORS[vendorKey];

  if (!vendor) {

    res.status(400).json({
      error:
        "Invalid Vendor Selected.",
    });

    return null;
  }

  return vendor;
}

/*
 * ============================================================
 * NORMAL INVOICE DOWNLOAD
 * ============================================================
 */

router.post(
  "/invoice-download",
  async (req, res) => {

    try {

      const vendor =
        getVendor(
          req,
          res
        );

      if (!vendor) {
        return;
      }

      console.log(
        `[Invoice] Searching today's invoices for ${vendor.label}`
      );

      const files =
        await fetchInvoicesFromMailbox(
          vendor,
          false
        );

      console.log(
        `[Invoice] Found ${files.length} invoice file(s)`
      );

      return res.json({
        count: files.length,
        files,
      });

    } catch (error) {

      console.error(
        "Invoice download route error:",
        error
      );

      if (!res.headersSent) {

        return res.status(500).json({
          error:
            error.message ||
            "Failed to download invoices.",
        });
      }
    }
  }
);

/*
 * ============================================================
 * BILL DOWNLOAD
 * ============================================================
 */

router.post(
  "/invoice-bill-download",
  async (req, res) => {

    try {

      const vendor =
        getVendor(
          req,
          res
        );

      if (!vendor) {
        return;
      }

      console.log(
        `[Bill] Searching today's bills for ${vendor.label}`
      );

      const files =
        await fetchInvoicesFromMailbox(
          vendor,
          true
        );

      console.log(
        `[Bill] Found ${files.length} bill file(s)`
      );

      return res.json({
        count: files.length,
        files,
      });

    } catch (error) {

      console.error(
        "Bill download route error:",
        error
      );

      if (!res.headersSent) {

        return res.status(500).json({
          error:
            error.message ||
            "Failed to download bills.",
        });
      }
    }
  }
);

/*
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = router;
