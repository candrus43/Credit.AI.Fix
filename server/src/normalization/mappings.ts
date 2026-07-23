// ──────────────────────────────────────────────
// CreditBridge — Provider Field Mappings
// ──────────────────────────────────────────────
//
// Each provider has a unique raw field layout in their PDF reports or
// API responses. This module maps those provider-specific fields to
// canonical CreditBridge fields. Each mapping entry specifies:
//   - canonicalField: which field in our normalized schema this maps to
//   - providerFieldNames: possible raw field names used by the provider
//   - transformFn: optional function to transform the raw value
//
// Mappings are versioned so that when a provider changes their format,
// older reports can still be re-normalized with the correct mapping.
// ──────────────────────────────────────────────

// ── Types ──────────────────────────────────────

export interface FieldMappingEntry {
  /** The canonical CreditBridge field name (snake_case, matches DB columns) */
  canonicalField: string;
  /** Possible raw field names used by this provider */
  providerFieldNames: string[];
  /** Optional transformation function (raw value → normalized value) */
  transformFn?: (value: unknown) => unknown;
}

export interface FieldMapping {
  providerName: string;
  version: string;
  lastUpdated: string;
  /** Mappings for personal info fields */
  personalInfo: FieldMappingEntry[];
  /** Mappings for score fields */
  scores: FieldMappingEntry[];
  /** Mappings for tradeline fields */
  tradelines: FieldMappingEntry[];
  /** Mappings for collection fields */
  collections: FieldMappingEntry[];
  /** Mappings for inquiry fields */
  inquiries: FieldMappingEntry[];
  /** Mappings for public record fields */
  publicRecords: FieldMappingEntry[];
}

// ── Mapping Registry ───────────────────────────

const mappingRegistry: Map<string, FieldMapping> = new Map();

function registerMapping(mapping: FieldMapping): void {
  mappingRegistry.set(mapping.providerName.toLowerCase(), mapping);
}

// ── Utility transforms ─────────────────────────

/** Parse any currency-like string into a number */
function toCurrency(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Parse a date string, preserving original format */
function toDateString(value: unknown): string | null {
  if (!value) return null;
  return String(value).trim();
}

/** Normalize account status to canonical values */
function normalizeAccountStatus(value: unknown): string {
  const v = String(value).toLowerCase().trim();
  if (v.includes("open")) return "open";
  if (v.includes("closed") && v.includes("paid")) return "paid";
  if (v.includes("closed")) return "closed";
  if (v.includes("charge") && v.includes("off")) return "charged_off";
  if (v.includes("collection")) return "collections";
  if (v.includes("transfer")) return "transferred";
  if (v.includes("deceased")) return "deceased";
  return v;
}

/** Normalize payment status to canonical values */
function normalizePaymentStatus(value: unknown): string {
  const v = String(value).toLowerCase().trim();
  if (v.includes("current") || v.includes("paid") || v.includes("ok")) return "current";
  if (v.includes("30")) return "30";
  if (v.includes("60")) return "60";
  if (v.includes("90")) return "90";
  if (v.includes("120")) return "120";
  if (v.includes("150")) return "150";
  if (v.includes("180")) return "180";
  if (v.includes("collection") || v.includes("charge")) return "collection";
  return v;
}

/** Normalize account type */
function normalizeAccountType(value: unknown): string {
  const v = String(value).toLowerCase().trim();
  if (v.includes("revolv") || v.includes("credit card")) return "revolving";
  if (v.includes("install")) return "installment";
  if (v.includes("mortgage") || v.includes("home loan")) return "mortgage";
  if (v.includes("open") && !v.includes("date")) return "open";
  if (v.includes("collect")) return "collection";
  if (v.includes("student")) return "installment";
  if (v.includes("auto")) return "installment";
  if (v.includes("heloc") || v.includes("line of credit")) return "revolving";
  return "other";
}

/** Normalize ownership */
function normalizeOwnership(value: unknown): string {
  const v = String(value).toLowerCase().trim();
  if (v.includes("joint")) return "joint";
  if (v.includes("authorized") || v.includes("auth user")) return "authorized_user";
  return "individual";
}

/** Normalize inquiry type */
function normalizeInquiryType(value: unknown): "hard" | "soft" {
  const v = String(value).toLowerCase().trim();
  if (v.includes("hard")) return "hard";
  return "soft";
}

/** Normalize public record type */
function normalizeRecordType(value: unknown): "bankruptcy" | "judgment" | "tax_lien" {
  const v = String(value).toLowerCase().trim();
  if (v.includes("bankrupt")) return "bankruptcy";
  if (v.includes("judgment")) return "judgment";
  if (v.includes("tax") || v.includes("lien")) return "tax_lien";
  return "judgment";
}

/** Split payment history string into array */
function parsePaymentHistory(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const v = String(value || "");
  return v.split(/[\s,;|]+/).filter((s) => s.length >= 2);
}

/** Parse boolean from various formats */
function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = String(value).toLowerCase().trim();
  return v === "true" || v === "yes" || v === "1" || v === "y" || v === "disputed";
}

// ── Synthetic Provider Mapping ─────────────────
// Synthetic adapter produces clean, structured data — mapping is 1:1

const syntheticMapping: FieldMapping = {
  providerName: "Synthetic",
  version: "1.0.0",
  lastUpdated: "2026-07-23",
  personalInfo: [
    { canonicalField: "fullName", providerFieldNames: ["fullName", "name", "full_name"] },
    { canonicalField: "addressLine1", providerFieldNames: ["addressLine1", "address_line1", "address"] },
    { canonicalField: "addressLine2", providerFieldNames: ["addressLine2", "address_line2"] },
    { canonicalField: "city", providerFieldNames: ["city"] },
    { canonicalField: "state", providerFieldNames: ["state"] },
    { canonicalField: "zip", providerFieldNames: ["zip", "zipCode", "zip_code", "postalCode"] },
    { canonicalField: "ssnLast4", providerFieldNames: ["ssnLast4", "ssn_last4", "lastFourSSN"] },
    { canonicalField: "dateOfBirth", providerFieldNames: ["dateOfBirth", "dob", "birthDate"] },
    { canonicalField: "phone", providerFieldNames: ["phone", "phoneNumber", "telephone"] },
    { canonicalField: "employer", providerFieldNames: ["employer", "employerName", "employment"] },
  ],
  scores: [
    { canonicalField: "bureau", providerFieldNames: ["bureau"] },
    { canonicalField: "score", providerFieldNames: ["score"], transformFn: (v) => (typeof v === "number" ? v : parseInt(String(v), 10) || null) },
    { canonicalField: "model", providerFieldNames: ["scoreModel", "model", "scoreType"] },
    { canonicalField: "date", providerFieldNames: ["date", "scoreDate"], transformFn: toDateString },
    { canonicalField: "factors", providerFieldNames: ["factors", "scoreFactors"], transformFn: (v) => (Array.isArray(v) ? v : []) },
  ],
  tradelines: [
    { canonicalField: "creditorName", providerFieldNames: ["accountName", "creditorName", "creditor_name", "creditor"] },
    { canonicalField: "maskedAccountNumber", providerFieldNames: ["accountNumber", "maskedAccountNumber", "masked_account_number"] },
    { canonicalField: "accountType", providerFieldNames: ["accountType", "account_type"], transformFn: normalizeAccountType },
    { canonicalField: "ownership", providerFieldNames: ["ownership", "accountOwnership"], transformFn: normalizeOwnership },
    { canonicalField: "accountStatus", providerFieldNames: ["accountStatus", "status", "account_status"], transformFn: normalizeAccountStatus },
    { canonicalField: "paymentStatus", providerFieldNames: ["paymentStatus", "payStatus", "payment_status"], transformFn: normalizePaymentStatus },
    { canonicalField: "balance", providerFieldNames: ["currentBalance", "balance"], transformFn: toCurrency },
    { canonicalField: "creditLimit", providerFieldNames: ["creditLimit", "credit_limit", "limit"], transformFn: toCurrency },
    { canonicalField: "pastDueAmount", providerFieldNames: ["pastDueAmount", "pastDue", "past_due_amount"], transformFn: toCurrency },
    { canonicalField: "highBalance", providerFieldNames: ["highBalance", "high_balance", "highestBalance"], transformFn: toCurrency },
    { canonicalField: "monthlyPayment", providerFieldNames: ["monthlyPayment", "monthly_payment", "paymentAmount"], transformFn: toCurrency },
    { canonicalField: "dateOpened", providerFieldNames: ["dateOpened", "date_opened", "openDate"], transformFn: toDateString },
    { canonicalField: "dateClosed", providerFieldNames: ["dateClosed", "date_closed", "closeDate"], transformFn: toDateString },
    { canonicalField: "dateReported", providerFieldNames: ["dateReported", "date_reported", "lastReported"], transformFn: toDateString },
    { canonicalField: "dateOfLastActivity", providerFieldNames: ["dateOfLastActivity", "dla", "lastActivityDate"], transformFn: toDateString },
    { canonicalField: "firstDelinquencyDate", providerFieldNames: ["firstDelinquencyDate", "dofd", "first_delinquency_date"], transformFn: toDateString },
    { canonicalField: "paymentHistory", providerFieldNames: ["paymentHistory", "payment_history", "payHistory"], transformFn: parsePaymentHistory },
    { canonicalField: "remarks", providerFieldNames: ["remarks", "comments", "notes"] },
    { canonicalField: "disputeIndicator", providerFieldNames: ["isDisputed", "disputeIndicator", "disputed", "dispute_indicator"], transformFn: parseBoolean },
    { canonicalField: "providerSpecificId", providerFieldNames: ["id", "providerId", "provider_specific_id", "accountId"] },
  ],
  collections: [
    { canonicalField: "collectionAgency", providerFieldNames: ["collectionAgency", "agency", "collector"] },
    { canonicalField: "originalCreditor", providerFieldNames: ["originalCreditor", "original_creditor", "originalLender"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "balance", "originalAmount"], transformFn: toCurrency },
    { canonicalField: "accountNumber", providerFieldNames: ["accountNumber", "account_number", "accountNum"] },
    { canonicalField: "dateAssigned", providerFieldNames: ["dateAssigned", "date_assigned", "assignedDate"], transformFn: toDateString },
    { canonicalField: "status", providerFieldNames: ["status", "collectionStatus"] },
  ],
  inquiries: [
    { canonicalField: "inquiryDate", providerFieldNames: ["inquiryDate", "date", "inquiry_date"], transformFn: toDateString },
    { canonicalField: "companyName", providerFieldNames: ["inquiringCompany", "companyName", "company_name", "company"] },
    { canonicalField: "inquiryType", providerFieldNames: ["inquiryType", "type", "inquiry_type"], transformFn: normalizeInquiryType },
  ],
  publicRecords: [
    { canonicalField: "recordType", providerFieldNames: ["recordType", "type", "record_type"], transformFn: normalizeRecordType },
    { canonicalField: "recordDate", providerFieldNames: ["recordDate", "date", "dateFiled", "filingDate"], transformFn: toDateString },
    { canonicalField: "court", providerFieldNames: ["court", "courtName", "jurisdiction"] },
    { canonicalField: "referenceNumber", providerFieldNames: ["referenceNumber", "reference_number", "caseNumber", "docketNumber"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "liability", "claimAmount"], transformFn: toCurrency },
    { canonicalField: "status", providerFieldNames: ["status", "disposition"] },
  ],
};

// ── SmartCredit Mapping (PDF upload pattern) ───
// SmartCredit PDFs use specific labels in their text extraction

const smartCreditMapping: FieldMapping = {
  providerName: "SmartCredit",
  version: "1.0.0",
  lastUpdated: "2026-07-23",
  personalInfo: [
    { canonicalField: "fullName", providerFieldNames: ["fullName", "Name", "Consumer Name", "Report for"] },
    { canonicalField: "addressLine1", providerFieldNames: ["addressLine1", "Address", "Current Address", "street"] },
    { canonicalField: "addressLine2", providerFieldNames: ["addressLine2", "Address Line 2"] },
    { canonicalField: "city", providerFieldNames: ["city", "City"] },
    { canonicalField: "state", providerFieldNames: ["state", "State"] },
    { canonicalField: "zip", providerFieldNames: ["zip", "Zip", "Zip Code", "postalCode"] },
    { canonicalField: "ssnLast4", providerFieldNames: ["ssnLast4", "SSN", "Social Security"] },
    { canonicalField: "dateOfBirth", providerFieldNames: ["dateOfBirth", "DOB", "Date of Birth", "Birth Date"] },
    { canonicalField: "phone", providerFieldNames: ["phone", "Phone", "Telephone", "Tel"] },
    { canonicalField: "employer", providerFieldNames: ["employer", "Employer", "Employment"] },
  ],
  scores: [
    { canonicalField: "bureau", providerFieldNames: ["bureau"] },
    { canonicalField: "score", providerFieldNames: ["score"], transformFn: (v) => (typeof v === "number" ? v : parseInt(String(v), 10) || null) },
    { canonicalField: "model", providerFieldNames: ["model", "scoreModel", "Model"] },
    { canonicalField: "date", providerFieldNames: ["date", "scoreDate", "As of"], transformFn: toDateString },
    { canonicalField: "factors", providerFieldNames: ["factors"], transformFn: (v) => (Array.isArray(v) ? v : []) },
  ],
  tradelines: [
    { canonicalField: "creditorName", providerFieldNames: ["creditorName", "Creditor", "Account Name", "Company"] },
    { canonicalField: "originalCreditorName", providerFieldNames: ["originalCreditorName", "Original Creditor"] },
    { canonicalField: "maskedAccountNumber", providerFieldNames: ["maskedAccountNumber", "Account Number", "Account #", "Acct #"] },
    { canonicalField: "accountType", providerFieldNames: ["accountType", "Account Type", "Type"], transformFn: normalizeAccountType },
    { canonicalField: "ownership", providerFieldNames: ["ownership", "Ownership", "Responsibility"], transformFn: normalizeOwnership },
    { canonicalField: "accountStatus", providerFieldNames: ["accountStatus", "Status", "Account Status"], transformFn: normalizeAccountStatus },
    { canonicalField: "paymentStatus", providerFieldNames: ["paymentStatus", "Payment Status", "Pay Status"], transformFn: normalizePaymentStatus },
    { canonicalField: "balance", providerFieldNames: ["balance", "Balance", "Current Balance"], transformFn: toCurrency },
    { canonicalField: "creditLimit", providerFieldNames: ["creditLimit", "Credit Limit", "Limit", "High Credit"], transformFn: toCurrency },
    { canonicalField: "pastDueAmount", providerFieldNames: ["pastDueAmount", "Past Due", "Amount Past Due"], transformFn: toCurrency },
    { canonicalField: "highBalance", providerFieldNames: ["highBalance", "High Balance", "Highest Balance"], transformFn: toCurrency },
    { canonicalField: "monthlyPayment", providerFieldNames: ["monthlyPayment", "Monthly Payment", "Payment Amount"], transformFn: toCurrency },
    { canonicalField: "dateOpened", providerFieldNames: ["dateOpened", "Date Opened", "Opened", "Open Date"], transformFn: toDateString },
    { canonicalField: "dateClosed", providerFieldNames: ["dateClosed", "Date Closed", "Closed"], transformFn: toDateString },
    { canonicalField: "dateReported", providerFieldNames: ["dateReported", "Date Reported", "Reported", "Last Reported"], transformFn: toDateString },
    { canonicalField: "dateOfLastActivity", providerFieldNames: ["dateOfLastActivity", "Last Activity", "DLA"], transformFn: toDateString },
    { canonicalField: "firstDelinquencyDate", providerFieldNames: ["firstDelinquencyDate", "First Delinquency", "DOFD"], transformFn: toDateString },
    { canonicalField: "paymentHistory", providerFieldNames: ["paymentHistory", "Payment History", "Pay History"], transformFn: parsePaymentHistory },
    { canonicalField: "remarks", providerFieldNames: ["remarks", "Remarks", "Comments", "Notes"] },
    { canonicalField: "disputeIndicator", providerFieldNames: ["disputeIndicator", "Dispute", "Disputed", "isDisputed"], transformFn: parseBoolean },
    { canonicalField: "providerSpecificId", providerFieldNames: ["providerSpecificId", "id", "Account ID"] },
  ],
  collections: [
    { canonicalField: "collectionAgency", providerFieldNames: ["collectionAgency", "Collection Agency", "Agency", "Collector"] },
    { canonicalField: "originalCreditor", providerFieldNames: ["originalCreditor", "Original Creditor", "Original Lender"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Balance"], transformFn: toCurrency },
    { canonicalField: "accountNumber", providerFieldNames: ["accountNumber", "Account Number", "Account #"] },
    { canonicalField: "dateAssigned", providerFieldNames: ["dateAssigned", "Date Assigned", "Assigned"], transformFn: toDateString },
    { canonicalField: "status", providerFieldNames: ["status", "Status", "Collection Status"] },
  ],
  inquiries: [
    { canonicalField: "inquiryDate", providerFieldNames: ["inquiryDate", "Date", "Inquiry Date"], transformFn: toDateString },
    { canonicalField: "companyName", providerFieldNames: ["companyName", "Company", "Inquiring Company", "Name"] },
    { canonicalField: "inquiryType", providerFieldNames: ["inquiryType", "Type", "Inquiry Type"], transformFn: normalizeInquiryType },
  ],
  publicRecords: [
    { canonicalField: "recordType", providerFieldNames: ["recordType", "Type", "Record Type"], transformFn: normalizeRecordType },
    { canonicalField: "recordDate", providerFieldNames: ["recordDate", "Date Filed", "Filing Date", "Date"], transformFn: toDateString },
    { canonicalField: "court", providerFieldNames: ["court", "Court", "Court Name", "Jurisdiction"] },
    { canonicalField: "referenceNumber", providerFieldNames: ["referenceNumber", "Reference #", "Case #", "Docket #"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Liability"], transformFn: toCurrency },
    { canonicalField: "status", providerFieldNames: ["status", "Status", "Disposition"] },
  ],
};

// ── MyScoreIQ Mapping (PDF pattern) ────────────

const myScoreIqMapping: FieldMapping = {
  providerName: "MyScoreIQ",
  version: "1.0.0",
  lastUpdated: "2026-07-23",
  personalInfo: [
    { canonicalField: "fullName", providerFieldNames: ["fullName", "Name", "Your Name", "Member Name"] },
    { canonicalField: "addressLine1", providerFieldNames: ["addressLine1", "Address", "Street Address"] },
    { canonicalField: "addressLine2", providerFieldNames: ["addressLine2", "Apt", "Unit", "Address 2"] },
    { canonicalField: "city", providerFieldNames: ["city", "City"] },
    { canonicalField: "state", providerFieldNames: ["state", "State"] },
    { canonicalField: "zip", providerFieldNames: ["zip", "Zip Code", "ZIP"] },
    { canonicalField: "ssnLast4", providerFieldNames: ["ssnLast4", "Last 4 SSN", "SSN (last 4)"] },
    { canonicalField: "dateOfBirth", providerFieldNames: ["dateOfBirth", "Date of Birth", "DOB"] },
    { canonicalField: "phone", providerFieldNames: ["phone", "Phone Number", "Phone"] },
    { canonicalField: "employer", providerFieldNames: ["employer", "Employer", "Current Employer"] },
  ],
  scores: [
    { canonicalField: "bureau", providerFieldNames: ["bureau", "Bureau"] },
    { canonicalField: "score", providerFieldNames: ["score", "Score"], transformFn: (v) => (typeof v === "number" ? v : parseInt(String(v), 10) || null) },
    { canonicalField: "model", providerFieldNames: ["model", "Score Model", "Score Type"] },
    { canonicalField: "date", providerFieldNames: ["date", "Score Date", "As Of"], transformFn: toDateString },
    { canonicalField: "factors", providerFieldNames: ["factors"], transformFn: (v) => (Array.isArray(v) ? v : []) },
  ],
  tradelines: [
    { canonicalField: "creditorName", providerFieldNames: ["creditorName", "Creditor", "Account", "Account Name", "Lender"] },
    { canonicalField: "originalCreditorName", providerFieldNames: ["originalCreditorName", "Original Creditor"] },
    { canonicalField: "maskedAccountNumber", providerFieldNames: ["maskedAccountNumber", "Account Number", "Account #"] },
    { canonicalField: "accountType", providerFieldNames: ["accountType", "Account Type", "Type"], transformFn: normalizeAccountType },
    { canonicalField: "ownership", providerFieldNames: ["ownership", "Ownership", "Account Ownership"], transformFn: normalizeOwnership },
    { canonicalField: "accountStatus", providerFieldNames: ["accountStatus", "Status", "Account Status"], transformFn: normalizeAccountStatus },
    { canonicalField: "paymentStatus", providerFieldNames: ["paymentStatus", "Payment Status", "Pay Status"], transformFn: normalizePaymentStatus },
    { canonicalField: "balance", providerFieldNames: ["balance", "Balance", "Current Balance"], transformFn: toCurrency },
    { canonicalField: "creditLimit", providerFieldNames: ["creditLimit", "Credit Limit", "Limit"], transformFn: toCurrency },
    { canonicalField: "pastDueAmount", providerFieldNames: ["pastDueAmount", "Past Due", "Past Due Amount"], transformFn: toCurrency },
    { canonicalField: "highBalance", providerFieldNames: ["highBalance", "High Balance", "Highest Balance"], transformFn: toCurrency },
    { canonicalField: "monthlyPayment", providerFieldNames: ["monthlyPayment", "Monthly Payment", "Payment"], transformFn: toCurrency },
    { canonicalField: "dateOpened", providerFieldNames: ["dateOpened", "Date Opened", "Opened"], transformFn: toDateString },
    { canonicalField: "dateClosed", providerFieldNames: ["dateClosed", "Date Closed", "Closed"], transformFn: toDateString },
    { canonicalField: "dateReported", providerFieldNames: ["dateReported", "Date Reported", "Reported", "Last Updated"], transformFn: toDateString },
    { canonicalField: "dateOfLastActivity", providerFieldNames: ["dateOfLastActivity", "Last Activity", "DLA"], transformFn: toDateString },
    { canonicalField: "firstDelinquencyDate", providerFieldNames: ["firstDelinquencyDate", "First Delinquency", "DOFD"], transformFn: toDateString },
    { canonicalField: "paymentHistory", providerFieldNames: ["paymentHistory", "Payment History", "History"], transformFn: parsePaymentHistory },
    { canonicalField: "remarks", providerFieldNames: ["remarks", "Remarks", "Comments"] },
    { canonicalField: "disputeIndicator", providerFieldNames: ["disputeIndicator", "Dispute", "Disputed"], transformFn: parseBoolean },
    { canonicalField: "providerSpecificId", providerFieldNames: ["providerSpecificId", "id", "Account ID"] },
  ],
  collections: [
    { canonicalField: "collectionAgency", providerFieldNames: ["collectionAgency", "Collection Agency", "Agency"] },
    { canonicalField: "originalCreditor", providerFieldNames: ["originalCreditor", "Original Creditor"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Balance Owed"], transformFn: toCurrency },
    { canonicalField: "accountNumber", providerFieldNames: ["accountNumber", "Account Number", "Account #"] },
    { canonicalField: "dateAssigned", providerFieldNames: ["dateAssigned", "Date Assigned", "Opened"], transformFn: toDateString },
    { canonicalField: "status", providerFieldNames: ["status", "Status", "Collection Status"] },
  ],
  inquiries: [
    { canonicalField: "inquiryDate", providerFieldNames: ["inquiryDate", "Date", "Request Date"], transformFn: toDateString },
    { canonicalField: "companyName", providerFieldNames: ["companyName", "Company", "Requested By"] },
    { canonicalField: "inquiryType", providerFieldNames: ["inquiryType", "Type", "Inquiry Type"], transformFn: normalizeInquiryType },
  ],
  publicRecords: [
    { canonicalField: "recordType", providerFieldNames: ["recordType", "Type", "Record Type"], transformFn: normalizeRecordType },
    { canonicalField: "recordDate", providerFieldNames: ["recordDate", "Date Filed", "Date"], transformFn: toDateString },
    { canonicalField: "court", providerFieldNames: ["court", "Court", "Filed With"] },
    { canonicalField: "referenceNumber", providerFieldNames: ["referenceNumber", "Case Number", "Reference #"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Judgment Amount"], transformFn: toCurrency },
    { canonicalField: "status", providerFieldNames: ["status", "Status", "Disposition"] },
  ],
};

// ── IdentityIQ Mapping (PDF pattern) ────────────

const identityIqMapping: FieldMapping = {
  providerName: "IdentityIQ",
  version: "1.0.0",
  lastUpdated: "2026-07-23",
  personalInfo: [
    { canonicalField: "fullName", providerFieldNames: ["fullName", "Name", "Member", "Account Holder"] },
    { canonicalField: "addressLine1", providerFieldNames: ["addressLine1", "Address", "Mailing Address", "Residence"] },
    { canonicalField: "addressLine2", providerFieldNames: ["addressLine2", "Address 2", "Apt", "Suite"] },
    { canonicalField: "city", providerFieldNames: ["city", "City"] },
    { canonicalField: "state", providerFieldNames: ["state", "State"] },
    { canonicalField: "zip", providerFieldNames: ["zip", "Zip", "ZIP Code"] },
    { canonicalField: "ssnLast4", providerFieldNames: ["ssnLast4", "SSN", "Social Security Number"] },
    { canonicalField: "dateOfBirth", providerFieldNames: ["dateOfBirth", "Date of Birth", "DOB"] },
    { canonicalField: "phone", providerFieldNames: ["phone", "Phone", "Phone Number", "Contact #"] },
    { canonicalField: "employer", providerFieldNames: ["employer", "Employer", "Employment"] },
  ],
  scores: [
    { canonicalField: "bureau", providerFieldNames: ["bureau", "Bureau"] },
    { canonicalField: "score", providerFieldNames: ["score", "Credit Score"], transformFn: (v) => (typeof v === "number" ? v : parseInt(String(v), 10) || null) },
    { canonicalField: "model", providerFieldNames: ["model", "Score Model", "Model"] },
    { canonicalField: "date", providerFieldNames: ["date", "Score Date", "As Of"], transformFn: toDateString },
    { canonicalField: "factors", providerFieldNames: ["factors"], transformFn: (v) => (Array.isArray(v) ? v : []) },
  ],
  tradelines: [
    { canonicalField: "creditorName", providerFieldNames: ["creditorName", "Creditor Name", "Account Name", "Company Name"] },
    { canonicalField: "originalCreditorName", providerFieldNames: ["originalCreditorName", "Original Creditor"] },
    { canonicalField: "maskedAccountNumber", providerFieldNames: ["maskedAccountNumber", "Account #", "Account Number", "Number"] },
    { canonicalField: "accountType", providerFieldNames: ["accountType", "Account Type", "Type"], transformFn: normalizeAccountType },
    { canonicalField: "ownership", providerFieldNames: ["ownership", "Ownership", "Responsibility"], transformFn: normalizeOwnership },
    { canonicalField: "accountStatus", providerFieldNames: ["accountStatus", "Status", "Account Status"], transformFn: normalizeAccountStatus },
    { canonicalField: "paymentStatus", providerFieldNames: ["paymentStatus", "Payment Status", "Pay Status"], transformFn: normalizePaymentStatus },
    { canonicalField: "balance", providerFieldNames: ["balance", "Balance", "Current Balance"], transformFn: toCurrency },
    { canonicalField: "creditLimit", providerFieldNames: ["creditLimit", "Credit Limit", "Limit"], transformFn: toCurrency },
    { canonicalField: "pastDueAmount", providerFieldNames: ["pastDueAmount", "Past Due", "Amount Past Due"], transformFn: toCurrency },
    { canonicalField: "highBalance", providerFieldNames: ["highBalance", "High Balance", "Highest Balance"], transformFn: toCurrency },
    { canonicalField: "monthlyPayment", providerFieldNames: ["monthlyPayment", "Monthly Payment", "Payment"], transformFn: toCurrency },
    { canonicalField: "dateOpened", providerFieldNames: ["dateOpened", "Date Opened", "Opened"], transformFn: toDateString },
    { canonicalField: "dateClosed", providerFieldNames: ["dateClosed", "Date Closed", "Closed"], transformFn: toDateString },
    { canonicalField: "dateReported", providerFieldNames: ["dateReported", "Date Reported", "Reported", "Last Updated"], transformFn: toDateString },
    { canonicalField: "dateOfLastActivity", providerFieldNames: ["dateOfLastActivity", "Date of Last Activity", "Last Activity"], transformFn: toDateString },
    { canonicalField: "firstDelinquencyDate", providerFieldNames: ["firstDelinquencyDate", "First Delinquency", "DOFD"], transformFn: toDateString },
    { canonicalField: "paymentHistory", providerFieldNames: ["paymentHistory", "Payment History", "Pay History"], transformFn: parsePaymentHistory },
    { canonicalField: "remarks", providerFieldNames: ["remarks", "Remarks", "Comments", "Adverse Accounts"] },
    { canonicalField: "disputeIndicator", providerFieldNames: ["disputeIndicator", "Dispute", "Disputed"], transformFn: parseBoolean },
    { canonicalField: "providerSpecificId", providerFieldNames: ["providerSpecificId", "id", "Record ID"] },
  ],
  collections: [
    { canonicalField: "collectionAgency", providerFieldNames: ["collectionAgency", "Collection Agency", "Agency Name"] },
    { canonicalField: "originalCreditor", providerFieldNames: ["originalCreditor", "Original Creditor", "Placed By"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Balance"], transformFn: toCurrency },
    { canonicalField: "accountNumber", providerFieldNames: ["accountNumber", "Account Number", "Account #"] },
    { canonicalField: "dateAssigned", providerFieldNames: ["dateAssigned", "Date Assigned", "Date Opened"], transformFn: toDateString },
    { canonicalField: "status", providerFieldNames: ["status", "Status"] },
  ],
  inquiries: [
    { canonicalField: "inquiryDate", providerFieldNames: ["inquiryDate", "Date", "Inquiry Date"], transformFn: toDateString },
    { canonicalField: "companyName", providerFieldNames: ["companyName", "Company", "Inquired By", "Name"] },
    { canonicalField: "inquiryType", providerFieldNames: ["inquiryType", "Type", "Inquiry Type"], transformFn: normalizeInquiryType },
  ],
  publicRecords: [
    { canonicalField: "recordType", providerFieldNames: ["recordType", "Type", "Record Type"], transformFn: normalizeRecordType },
    { canonicalField: "recordDate", providerFieldNames: ["recordDate", "Date Filed", "Filing Date"], transformFn: toDateString },
    { canonicalField: "court", providerFieldNames: ["court", "Court", "Court Name"] },
    { canonicalField: "referenceNumber", providerFieldNames: ["referenceNumber", "Case #", "Reference #", "File #"] },
    { canonicalField: "amount", providerFieldNames: ["amount", "Amount", "Filing Amount"], transformFn: toCurrency },
    { canonicalField: "status", providerFieldNames: ["status", "Status"] },
  ],
};

// ── Register all mappings ───────────────────────

registerMapping(syntheticMapping);
registerMapping(smartCreditMapping);
registerMapping(myScoreIqMapping);
registerMapping(identityIqMapping);

// ── Public API ──────────────────────────────────

/**
 * Get the field mapping configuration for a given provider.
 *
 * @param providerName — canonical provider name (case-insensitive)
 * @returns the FieldMapping for that provider
 * @throws if no mapping is registered for the provider
 */
export function getMapping(providerName: string): FieldMapping {
  const key = providerName.toLowerCase();
  const mapping = mappingRegistry.get(key);
  if (!mapping) {
    throw new Error(
      `No field mapping registered for provider "${providerName}". ` +
      `Available mappings: ${Array.from(mappingRegistry.keys()).join(", ")}. ` +
      `Add a mapping via registerMapping() or extend the mappings.ts registry.`
    );
  }
  return mapping;
}

/**
 * Check whether a mapping exists for a given provider.
 */
export function hasMapping(providerName: string): boolean {
  return mappingRegistry.has(providerName.toLowerCase());
}

/**
 * List all registered provider mapping names.
 */
export function listMappings(): string[] {
  return Array.from(mappingRegistry.keys());
}

/**
 * Apply a single field mapping entry to extract and transform a value
 * from a raw data record.
 *
 * @param record — the raw provider data record (object)
 * @param entry — the mapping entry to apply
 * @returns the transformed (normalized) value, or null if not found
 */
export function applyMappingEntry(
  record: Record<string, unknown>,
  entry: FieldMappingEntry
): unknown {
  // Try each known provider field name
  for (const fieldName of entry.providerFieldNames) {
    if (fieldName in record && record[fieldName] !== undefined) {
      const rawValue = record[fieldName];
      // If there's a transform, apply it; otherwise return raw
      if (entry.transformFn) {
        return entry.transformFn(rawValue);
      }
      return rawValue;
    }
  }
  return null;
}

/**
 * Apply a set of mapping entries to a raw record and return the canonical
 * result object. Also returns a record of original values.
 *
 * @param record — the raw provider data record
 * @param entries — the mapping entries for this record type
 * @returns [canonicalValues, originalValues]
 */
export function applyMappings(
  record: Record<string, unknown>,
  entries: FieldMappingEntry[]
): [Record<string, unknown>, Record<string, string | null>] {
  const canonical: Record<string, unknown> = {};
  const originals: Record<string, string | null> = {};

  for (const entry of entries) {
    let found = false;
    for (const fieldName of entry.providerFieldNames) {
      if (fieldName in record && record[fieldName] !== undefined) {
        const rawValue = record[fieldName];
        const originalStr =
          rawValue === null || rawValue === undefined
            ? null
            : typeof rawValue === "string"
              ? rawValue
              : JSON.stringify(rawValue);

        originals[entry.canonicalField] = originalStr;

        if (entry.transformFn) {
          canonical[entry.canonicalField] = entry.transformFn(rawValue);
        } else {
          canonical[entry.canonicalField] = rawValue;
        }
        found = true;
        break;
      }
    }
    if (!found) {
      originals[entry.canonicalField] = null;
      canonical[entry.canonicalField] = null;
    }
  }

  return [canonical, originals];
}
