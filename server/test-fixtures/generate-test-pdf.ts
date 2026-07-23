// ──────────────────────────────────────────────
// Generate a minimal test PDF credit report fixture
// for testing the PDF import pipeline.
//
// Usage: bun run server/test-fixtures/generate-test-pdf.ts
// ──────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build a minimal valid PDF with embedded text content.
 * The text is what our extractors will parse.
 */
function buildPdf(text: string): Buffer {
  // Escape PDF string special characters
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "");

  // Split into lines for PDF Tj operators
  const lines = escaped.split("\n");
  const fontHeight = 12;
  const startY = 720;
  let y = startY;

  const textOps: string[] = [];
  textOps.push("BT");
  textOps.push("/F1 10 Tf");
  for (const line of lines) {
    if (y < 50) break; // don't overflow page
    textOps.push(`1 0 0 1 50 ${y} Tm (${line}) Tj`);
    y -= fontHeight;
  }
  textOps.push("ET");
  const streamContent = textOps.join("\n");

  // Build PDF objects
  const contentStream = `4 0 obj
<< /Length ${streamContent.length} >>
stream
${streamContent}
endstream
endobj`;

  const pageObj = `3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>
endobj`;

  const pagesObj = `2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj`;

  const catalogObj = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj`;

  const objects = [catalogObj, pagesObj, pageObj, contentStream].join("\n");

  // Cross-reference table
  const offsets: number[] = [];
  let offset = 0;
  const parts = [
    `%PDF-1.4\n%âãÏÓ\n`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let xrefOffset = 0;
  const xrefEntries: string[] = [];

  // Build the file incrementally to get offsets
  const header = "%PDF-1.4\n%âãÏÓ\n";
  let fileContent = header;

  for (const part of parts) {
    offsets.push(fileContent.length);
    fileContent += part;
  }

  xrefOffset = fileContent.length;
  fileContent += "xref\n";
  fileContent += `0 ${parts.length + 1}\n`;
  fileContent += "0000000000 65535 f \n";
  for (const off of offsets) {
    fileContent += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  fileContent += "trailer\n";
  fileContent += `<< /Size ${parts.length + 1} /Root 1 0 R >>\n`;
  fileContent += "startxref\n";
  fileContent += `${xrefOffset}\n`;
  fileContent += "%%EOF\n";

  return Buffer.from(fileContent, "utf-8");
}

// ── Test credit report content ─────────────────

const REPORT_CONTENT = `SmartCredit Premier Credit Report
============================================

Report Date: 01/15/2026
Generated on: 01/15/2026

Personal Information
--------------------
Name: JOHN A DOE
SSN: XXX-XX-1234
Date of Birth: 05/20/1985
Address: 1234 MAIN STREET, LOS ANGELES, CA 90001
Phone: 555-123-4567
Employer: ACME CORPORATION

============================================
SCORE SUMMARY
============================================

Equifax Score (FICO 8):           720
Experian Score (VantageScore 3.0): 685
TransUnion Score (FICO 8):        710

============================================
EQUIFAX CREDIT REPORT
============================================

Personal Information
  Name: JOHN A DOE
  SSN: XXX-XX-1234
  DOB: 05/20/1985

Accounts
--------

Account Name: CHASE VISA
Account Number: XXXX-XXXX-XXXX-1234
Account Type: Revolving
Ownership: Individual
Account Status: Open
Payment Status: Current
Balance: $1,250.00
Credit Limit: $10,000.00
Past Due: $0.00
Monthly Payment: $35.00
Date Opened: 03/15/2020
Date Reported: 01/01/2026
Payment History: OK OK OK OK OK OK OK OK OK OK OK OK
Remarks: Account in good standing
Dispute Indicator: No

Account Name: WELLS FARGO MORTGAGE
Account Number: XXXXXX7890
Account Type: Mortgage
Ownership: Joint
Account Status: Open
Payment Status: Current
Balance: $245,000.00
Credit Limit: $0.00
Past Due: $0.00
Monthly Payment: $1,800.00
Date Opened: 06/01/2018
Date Reported: 12/15/2025
Payment History: OK OK OK OK OK OK OK OK OK OK OK OK

Collections
-----------
Collection Agency: ABC COLLECTIONS
Original Creditor: MEDICAL CENTER
Amount: $500.00
Account Number: COLL-98765
Date Assigned: 08/01/2024
Status: Open

Inquiries
---------
Hard Inquiries:
  12/01/2025  CAPITAL ONE BANK
  11/15/2025  DISCOVER FINANCIAL

Soft Inquiries:
  01/01/2026  CREDIT KARMA

Public Records
--------------
None Reported

============================================
EXPERIAN CREDIT REPORT
============================================

Personal Information
  Name: JOHN A DOE
  SSN: XXX-XX-1234
  DOB: 05/20/1985

Accounts
--------

Account Name: CHASE VISA
Account Number: XXXX-XXXX-XXXX-1234
Account Type: Revolving
Ownership: Individual
Account Status: Open
Payment Status: Current
Balance: $1,250.00
Credit Limit: $10,000.00
Past Due: $0.00
Monthly Payment: $35.00
Date Opened: 03/15/2020
Date Reported: 01/01/2026
Payment History: OK OK OK OK OK OK OK OK OK OK OK OK

Account Name: AMEX GOLD
Account Number: XXXX-XXXX-5678
Account Type: Open
Account Status: Open
Payment Status: Current
Balance: $850.00
Credit Limit: $0.00
Past Due: $0.00
Date Opened: 01/10/2021
Date Reported: 01/01/2026
Remarks: Charge card

Inquiries
---------
Hard Inquiries:
  12/01/2025  CAPITAL ONE BANK

============================================
TRANSUNION CREDIT REPORT
============================================

Personal Information
  Name: JOHN A DOE
  SSN: XXX-XX-1234

Accounts
--------

Account Name: CHASE VISA
Account Number: XXXX-XXXX-XXXX-1234
Account Type: Revolving
Account Status: Open
Payment Status: Current
Balance: $1,250.00
Credit Limit: $10,000.00
Date Opened: 03/15/2020
Date Reported: 01/01/2026

Account Name: SALLIE MAE STUDENT LOAN
Account Number: XXXXXX4321
Account Type: Installment
Account Status: Open
Payment Status: Current
Balance: $15,000.00
Credit Limit: $0.00
Monthly Payment: $200.00
Date Opened: 09/01/2019
Date Reported: 12/15/2025
Remarks: Deferred payment period ended

Inquiries
---------
Hard Inquiries:
  11/15/2025  DISCOVER FINANCIAL

Soft Inquiries:
  01/01/2026  TRANSUNION CONSUMER INTERACTIVE

---- END OF REPORT ----
Generated by SmartCredit (ConsumerDirect, Inc.) | smartcredit.com
`;

// ── Generate and save ──────────────────────────

const pdfBuffer = buildPdf(REPORT_CONTENT);
const outputPath = join(__dirname, "sample-credit-report.pdf");
writeFileSync(outputPath, pdfBuffer);
console.log(`[fixtures] Test PDF written to: ${outputPath}`);
console.log(`[fixtures] Size: ${pdfBuffer.length} bytes`);
