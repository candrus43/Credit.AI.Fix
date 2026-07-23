// ──────────────────────────────────────────────
// CreditBridge — PDF Field Extractor
// ──────────────────────────────────────────────
//
// Parses extracted PDF text into structured credit-report data.
// Each extraction function returns its data along with per-field
// confidence scores (0.0–1.0) indicating how reliably each field
// was identified.
//
// Confidence scale:
//   1.0 = exact match pattern found
//   0.7–0.9 = likely match with some ambiguity
//   0.3–0.6 = heuristic guess
//   0.0 = not found / no data
// ──────────────────────────────────────────────

// ── Types ──────────────────────────────────────

export interface PersonalInfo {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  ssnLast4: string;
  dateOfBirth: string;
  phone: string;
  employer: string;
}

export interface PersonalInfoConfidence {
  fullName: number;
  addressLine1: number;
  addressLine2: number;
  city: number;
  state: number;
  zip: number;
  ssnLast4: number;
  dateOfBirth: number;
  phone: number;
  employer: number;
}

export interface ExtractedPersonalInfo {
  data: Partial<PersonalInfo>;
  confidence: PersonalInfoConfidence;
}

export interface ExtractedScore {
  bureau: string;
  score: number;
  model: string;
  date?: string;
  confidence: number;
}

export interface Tradeline {
  creditorName: string;
  originalCreditorName?: string;
  maskedAccountNumber: string;
  accountType: string;
  ownership?: string;
  accountStatus: string;
  paymentStatus: string;
  balance?: number;
  creditLimit?: number;
  pastDueAmount?: number;
  highBalance?: number;
  monthlyPayment?: number;
  dateOpened?: string;
  dateClosed?: string;
  dateReported?: string;
  dateOfLastActivity?: string;
  firstDelinquencyDate?: string;
  paymentHistory: string[];
  remarks: string;
  disputeIndicator: boolean;
  confidence: number;
}

export interface Collection {
  collectionAgency: string;
  originalCreditor: string;
  amount: number;
  accountNumber: string;
  dateAssigned: string;
  status: string;
  confidence: number;
}

export interface Inquiry {
  inquiryDate: string;
  companyName: string;
  inquiryType: "hard" | "soft";
  confidence: number;
}

export interface PublicRecord {
  recordType: string;
  recordDate: string;
  court: string;
  referenceNumber: string;
  amount?: number;
  status: string;
  confidence: number;
}

// ── Internal helpers ───────────────────────────

/**
 * Assign confidence based on whether a regex matched.
 * 1.0 for exact match, 0.7 for match with caveats, 0 otherwise.
 */
function matchConfidence(match: RegExpMatchArray | null, groups: number): number {
  if (!match) return 0;
  // If all expected groups are populated, high confidence
  const filled = match.slice(1).filter((g) => g && g.trim().length > 0).length;
  if (filled >= groups) return 1.0;
  if (filled > 0) return 0.7;
  return 0.5;
}

/**
 * Strip common noise characters from a field value.
 */
function cleanField(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Parse a currency string like "$1,234.56" or "1,234.56" into a number.
 */
function parseCurrency(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

/**
 * Determine if text predominantly belongs to a specific bureau section.
 */
function bureauFromSection(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("equifax")) return "Equifax";
  if (t.includes("experian")) return "Experian";
  if (t.includes("transunion") || t.includes("trans union")) return "TransUnion";
  return "unknown";
}

// ── Report Date Extraction ─────────────────────
//
// Report dates appear in various formats. Common patterns:
//   "Report Date: MM/DD/YYYY"
//   "Date of Report: Month DD, YYYY"
//   "Generated on: YYYY-MM-DD"
//   "Report generated: MM/DD/YYYY"

const REPORT_DATE_PATTERNS: RegExp[] = [
  /Report\s*Date[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /Date\s*of\s*Report[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /Generated\s*on[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /Report\s*Generated[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /Report\s*Date[:\s]*(\w+ \d{1,2},?\s*\d{4})/i,
  /Date[:\s]*(\d{4}-\d{2}-\d{2})/i,
  /(?:Printed|Created)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
];

/**
 * Extract the report date from the PDF text.
 * Returns null if no date pattern matches.
 */
export function extractReportDate(pdfText: string): string | null {
  for (const pattern of REPORT_DATE_PATTERNS) {
    const match = pdfText.match(pattern);
    if (match && match[1]) {
      const date = cleanField(match[1]);
      if (date.length >= 8) return date;
    }
  }
  return null;
}

// ── Bureau Section Splitting ───────────────────
//
// Tri-merge reports contain three bureau sections. Common section headers:
//   "EQUIFAX CREDIT REPORT"
//   "EXPERIAN CREDIT REPORT"
//   "TRANSUNION CREDIT REPORT"
// Sometimes abbreviated or styled differently.
//
// Strategy: look for bureau name headers and split the text on those boundaries.

const BUREAU_HEADER_PATTERNS: { bureau: string; pattern: RegExp }[] = [
  {
    bureau: "Equifax",
    pattern: /={2,}\s*\n?\s*EQUIFAX\s*(?:CREDIT\s*REPORT)?\s*\n?\s*={2,}|EQUIFAX\s*(?:CREDIT\s*REPORT|SECTION)/i,
  },
  {
    bureau: "Experian",
    pattern: /={2,}\s*\n?\s*EXPERIAN\s*(?:CREDIT\s*REPORT)?\s*\n?\s*={2,}|EXPERIAN\s*(?:CREDIT\s*REPORT|SECTION)/i,
  },
  {
    bureau: "TransUnion",
    pattern: /={2,}\s*\n?\s*TRANS\s*UNION\s*(?:CREDIT\s*REPORT)?\s*\n?\s*={2,}|TRANS\s*UNION\s*(?:CREDIT\s*REPORT|SECTION)/i,
  },
];

export interface BureauSection {
  bureau: string;
  text: string;
}

/**
 * Split the full PDF text into per-bureau sections.
 * If the text has clear bureau headers, split on them.
 * Otherwise return the entire text as sections with bureau guessed from content.
 */
export function extractBureauSections(pdfText: string): BureauSection[] {
  const sections: BureauSection[] = [];

  // Find all bureau header matches with positions
  interface HeaderMatch {
    bureau: string;
    index: number;
    length: number;
  }

  const matches: HeaderMatch[] = [];
  for (const { bureau, pattern } of BUREAU_HEADER_PATTERNS) {
    const match = pattern.exec(pdfText);
    if (match) {
      matches.push({ bureau, index: match.index, length: match[0].length });
    }
  }

  // Also look for simpler markers like section dividers with bureau names
  const simpleHeaders = [
    { bureau: "Equifax", pattern: /Equifax/i },
    { bureau: "Experian", pattern: /Experian/i },
    { bureau: "TransUnion", pattern: /Trans\s*Union/i },
  ];

  // If we found structured headers, use them for clean splits
  if (matches.length >= 2) {
    matches.sort((a, b) => a.index - b.index);

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : pdfText.length;
      sections.push({
        bureau: matches[i].bureau,
        text: pdfText.slice(start, end).trim(),
      });
    }
  } else {
    // Fallback: look for bureau name occurrences and try to split text
    // Find all positions where bureau names appear as standalone/section markers
    const positions: { bureau: string; pos: number }[] = [];

    for (const { bureau, pattern } of simpleHeaders) {
      // Reset lastIndex since we're reusing regexes
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(pdfText)) !== null) {
        // Check if this looks like a section header (preceded by newline/whitespace, followed by content)
        const contextBefore = pdfText.slice(Math.max(0, m.index - 20), m.index);
        if (/\n\s*$|^/.test(contextBefore)) {
          positions.push({ bureau, pos: m.index });
          break; // take first occurrence of each bureau
        }
      }
    }

    positions.sort((a, b) => a.pos - b.pos);

    if (positions.length >= 2) {
      for (let i = 0; i < positions.length; i++) {
        const start = positions[i].pos;
        const end = i < positions.length - 1 ? positions[i + 1].pos : pdfText.length;
        sections.push({
          bureau: positions[i].bureau,
          text: pdfText.slice(start, end).trim(),
        });
      }
    }
  }

  // If no sections found, create a single section with best-guess bureau
  if (sections.length === 0) {
    const guessed = bureauFromSection(pdfText);
    sections.push({ bureau: guessed, text: pdfText });
  }

  return sections;
}

// ── Personal Info Extraction ───────────────────
//
// Credit reports include a "Personal Information" section with:
//   Name, Address(es), SSN (masked or last 4), DOB, Phone, Employer
//
// Patterns vary by provider but common formats include:
//   "Name: JOHN DOE"
//   "SSN: XXX-XX-1234"
//   "Date of Birth: 01/15/1985"

const NAME_PATTERNS = [
  // Match "Name: JOHN DOE" — stop at common field labels
  /Name[:\s]+([A-Z][A-Z\s.'-]{2,40}?)(?=\s*(?:SSN|Address|Date|DOB|Phone|Current|Former|Employer|Accounts|Account|$))/i,
  /Consumer[:\s]+([A-Z][A-Z\s.'-]{2,40}?)(?=\s*(?:SSN|Address|Date|$))/i,
  /(?:Report\s+for|Prepared\s+for)[:\s]+([A-Z][A-Z\s.'-]{2,40}?)(?=\s*(?:SSN|Date|$))/i,
];

const SSN_PATTERNS = [
  /SSN[:\s]+(?:XXX-XX-|xxx-xx-|\*{3}-\*{2}-)?(\d{4})/i,
  /Social\s*Security[:\s]+(?:XXX-XX-|xxx-xx-|\*{3}-\*{2}-)?(\d{4})/i,
  /SSN[:\s]+[X*]{3}-[X*]{2}-(\d{4})/i,
];

const DOB_PATTERNS = [
  /(?:Date\s*of\s*Birth|DOB|Birth\s*Date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /(?:Date\s*of\s*Birth|DOB)[:\s]+(\w+ \d{1,2},?\s*\d{4})/i,
];

const ADDRESS_PATTERNS = [
  /(?:Address|Current\s*Address|Residence)[:\s]+([\d]+\s+[A-Za-z0-9\s.,'#-]{5,80})/i,
  /(?:Address|Current\s*Address)[:\s]+\n?\s*([\d]+\s+[A-Za-z0-9\s.,'#-]{5,80})/im,
];

const CITY_STATE_ZIP_PATTERN = /([A-Za-z\s.]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/;

const PHONE_PATTERNS = [
  /(?:Phone|Telephone|Tel)[:\s]+(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i,
  /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\s*(?:\(?(?:home|mobile|cell|primary)\)?)/i,
];

const EMPLOYER_PATTERNS = [
  /(?:Employer|Employment|Employed\s*by)[:\s]+([A-Za-z0-9\s.,&'#-]{2,60})/i,
  /(?:Employer|Employment)[:\s]+\n?\s*([A-Za-z0-9\s.,&'#-]{2,60})/im,
];

/**
 * Extract personal information from the PDF text.
 */
export function extractPersonalInfo(text: string): ExtractedPersonalInfo {
  const result: Partial<PersonalInfo> = {};
  const confidence: PersonalInfoConfidence = {
    fullName: 0,
    addressLine1: 0,
    addressLine2: 0,
    city: 0,
    state: 0,
    zip: 0,
    ssnLast4: 0,
    dateOfBirth: 0,
    phone: 0,
    employer: 0,
  };

  // Name
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.fullName = cleanField(match[1]);
      confidence.fullName = 0.85;
      break;
    }
  }
  // Heuristic: look for all-caps name near top of text
  if (!result.fullName) {
    const firstLines = text.slice(0, 500);
    const nameMatch = firstLines.match(/^([A-Z][A-Z\s.'-]{5,35})$/m);
    if (nameMatch) {
      result.fullName = cleanField(nameMatch[1]);
      confidence.fullName = 0.4;
    }
  }

  // SSN last 4
  for (const pattern of SSN_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.ssnLast4 = match[1];
      confidence.ssnLast4 = 0.9;
      break;
    }
  }

  // Date of birth
  for (const pattern of DOB_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.dateOfBirth = cleanField(match[1]);
      confidence.dateOfBirth = 0.85;
      break;
    }
  }

  // Address — look for street address line
  for (const pattern of ADDRESS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const rawAddr = cleanField(match[1]);
      // Try to separate city/state/zip
      const csMatch = rawAddr.match(CITY_STATE_ZIP_PATTERN);
      if (csMatch) {
        result.addressLine1 = rawAddr.slice(0, rawAddr.indexOf(csMatch[0])).replace(/,\s*$/, "").trim();
        result.city = csMatch[1].trim();
        result.state = csMatch[2].trim();
        result.zip = csMatch[3].trim();
        confidence.addressLine1 = 0.85;
        confidence.city = 0.85;
        confidence.state = 0.9;
        confidence.zip = 0.9;
      } else {
        result.addressLine1 = rawAddr;
        confidence.addressLine1 = 0.6;
      }
      break;
    }
  }

  // Phone
  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.phone = cleanField(match[1]);
      confidence.phone = 0.8;
      break;
    }
  }

  // Employer
  for (const pattern of EMPLOYER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.employer = cleanField(match[1]);
      confidence.employer = 0.75;
      break;
    }
  }

  return { data: result, confidence };
}

// ── Score Extraction ───────────────────────────
//
// Credit scores appear with model names. Common patterns:
//   "FICO Score 8: 720"
//   "VantageScore 3.0: 685"
//   "Equifax Score: 700"
// Bureau association can come from surrounding text or explicit labeling.

const SCORE_BLOCK_PATTERN =
  /(?:FICO|VantageScore|Vantage|Plus\s*Score|Credit\s*Score|Score)\s*(?:Score\s*)?(\d[\d.]*)?[:\s]*(\d{3})\b/gi;

const SCORE_MODEL_PATTERNS: { model: string; pattern: RegExp }[] = [
  { model: "FICO 8", pattern: /FICO\s*(?:Score)?\s*8/i },
  { model: "FICO 9", pattern: /FICO\s*(?:Score)?\s*9/i },
  { model: "FICO 10", pattern: /FICO\s*(?:Score)?\s*10/i },
  { model: "VantageScore 3.0", pattern: /VantageScore\s*3\.?0/i },
  { model: "VantageScore 4.0", pattern: /VantageScore\s*4\.?0/i },
  { model: "VantageScore", pattern: /VantageScore/i },
  { model: "FICO", pattern: /FICO/i },
  { model: "Plus Score", pattern: /Plus\s*Score/i },
];

/**
 * Extract credit scores from text, identifying the score model and bureau.
 */
export function extractScores(text: string): ExtractedScore[] {
  const scores: ExtractedScore[] = [];

  // Split text into reasonable chunks (each ~500 chars with overlap) to
  // identify bureau context for each score
  const lines = text.split(/\n/);

  // Find score lines and their surrounding context
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only consider lines that mention a score-related keyword.
    // This prevents phone numbers and other 3-digit numbers from being treated as scores.
    const isScoreContext =
      /score|FICO|vantage|credit\s*rating|risk\s*score/i.test(line);

    // Look for score patterns: "720", "Score: 720", etc.
    const scoreMatch = line.match(/(\d{3})\s*(?:\(?(?:GOOD|FAIR|POOR|EXCELLENT|BAD)\)?)?/);
    if (!scoreMatch) continue;

    const scoreValue = parseInt(scoreMatch[1], 10);
    if (scoreValue < 300 || scoreValue > 850) continue;

    // Only accept if in score context OR preceded by score keywords
    if (!isScoreContext) continue;

    // Get surrounding context (±3 lines) for bureau and model detection
    const contextStart = Math.max(0, i - 3);
    const contextEnd = Math.min(lines.length, i + 4);
    const context = lines.slice(contextStart, contextEnd).join(" ");

    // Determine model
    let model = "Unknown";
    for (const { model: m, pattern } of SCORE_MODEL_PATTERNS) {
      if (pattern.test(context)) {
        model = m;
        break;
      }
    }

    // Determine bureau from context
    let bureau = bureauFromSection(context);
    if (bureau === "unknown") {
      // Try to find bureau name near the score
      if (/equifax/i.test(context)) bureau = "Equifax";
      else if (/experian/i.test(context)) bureau = "Experian";
      else if (/trans\s*union/i.test(context)) bureau = "TransUnion";
    }

    // Date — look for date near score
    let date: string | undefined;
    const dateMatch = context.match(/(?:as of|dated|date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch) date = cleanField(dateMatch[1]);

    // Avoid duplicates (same score + bureau + model)
    const isDuplicate = scores.some(
      (s) => s.score === scoreValue && s.bureau === bureau && s.model === model
    );
    if (isDuplicate) continue;

    scores.push({
      bureau,
      score: scoreValue,
      model,
      date,
      confidence: bureau !== "unknown" ? 0.8 : 0.5,
    });
  }

  return scores;
}

// ── Tradeline Extraction ───────────────────────
//
// Tradelines (credit accounts) are the most complex section. Each account
// typically spans multiple lines with labeled fields.
//
// Account section markers:
//   - Account name (usually all caps or title case)
//   - Account number (masked: ****1234 or XXXX-XXXX-1234)
//   - Account type: Revolving, Installment, Mortgage, etc.
//   - Status: Open, Closed, Paid, Charged Off, Collections
//   - Balance, Credit Limit, Past Due amounts
//
// Strategy: identify account blocks by looking for account-name + account-number pairs,
// then extract fields from the surrounding lines.

const ACCOUNT_NAME_PATTERNS = [
  /(?:Account|Creditor|Company|Lender)[:\s]+([A-Z0-9][A-Za-z0-9\s.,&'#()-]{3,60})/i,
  /^([A-Z]{2,}[A-Z\s.,&'#()-]{3,50})$/m,
];

const ACCOUNT_NUMBER_PATTERN = /(?:Account\s*(?:Number|#)|Acct[:\s#]+)[:\s]*[X*]+\s*-?\s*(\d{3,6})/i;

const ACCOUNT_TYPE_PATTERNS = [
  { type: "revolving", pattern: /Revolving/i },
  { type: "installment", pattern: /Installment/i },
  { type: "mortgage", pattern: /Mortgage/i },
  { type: "open", pattern: /\bOpen\b(?!.*Date)/i },
  { type: "collection", pattern: /Collection/i },
  { type: "other", pattern: /(?:Line of Credit|LOC|Student Loan|Auto)/i },
];

const BALANCE_PATTERN = /(?:Balance|Current\s*Balance)[:\s]*\$?([\d,]+\.?\d*)/i;
const CREDIT_LIMIT_PATTERN = /(?:Credit\s*Limit|Limit|High\s*Credit)[:\s]*\$?([\d,]+\.?\d*)/i;
const PAST_DUE_PATTERN = /(?:Past\s*Due|Amount\s*Past\s*Due)[:\s]*\$?([\d,]+\.?\d*)/i;
const DATE_OPENED_PATTERN = /(?:Date\s*Opened|Open\s*Date|Opened)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i;
const DATE_REPORTED_PATTERN = /(?:Date\s*Reported|Reported|Last\s*Reported|Last\s*Updated)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i;
const PAYMENT_STATUS_PATTERN = /(?:Payment\s*Status|Status|Pay\s*Status)[:\s]*([A-Za-z0-9\s-]{3,30})/i;
const MONTHLY_PAYMENT_PATTERN = /(?:Monthly\s*Payment|Payment\s*Amount)[:\s]*\$?([\d,]+\.?\d*)/i;
const REMARKS_PATTERN = /(?:Remarks?|Comment|Note)[:\s]*([^\n]{3,200})/i;
const PAYMENT_HISTORY_PATTERN = /(?:Payment\s*History|Pay\s*History)[:\s]*([^\n]{5,200})/i;
const DISPUTE_PATTERN = /(?:Dispute|Consumer\s*Disputes|Account\s*Disputed)/i;
const OWNERSHIP_PATTERNS = [
  { type: "individual", pattern: /Individual/i },
  { type: "joint", pattern: /Joint/i },
  { type: "authorized_user", pattern: /Authorized\s*User/i },
];

/**
 * Extract tradelines from bureau-specific text.
 * Splits text into account blocks and extracts fields from each.
 */
export function extractTradelines(bureauText: string): Tradeline[] {
  const tradelines: Tradeline[] = [];

  // Strategy: Find account boundaries. Accounts typically start with
  // "Account Name:" or similar labeled lines. Split on those boundaries.

  // Find all "Account Name:" positions as primary anchors
  const accountAnchors: number[] = [];
  const anchorPattern = /Account\s*Name[:\s]+/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorPattern.exec(bureauText)) !== null) {
    accountAnchors.push(m.index);
  }

  // Fallback: find account number patterns as secondary anchors
  if (accountAnchors.length === 0) {
    const acctNumRegex = new RegExp(ACCOUNT_NUMBER_PATTERN.source, "gi");
    while ((m = acctNumRegex.exec(bureauText)) !== null) {
      accountAnchors.push(m.index);
    }
  }

  if (accountAnchors.length === 0) {
    return tradelines; // no accounts found
  }

  // For each anchor, grab a block from ~200 chars before to the next anchor (or end)
  for (let i = 0; i < accountAnchors.length; i++) {
    const start = Math.max(0, accountAnchors[i] - 150);
    const end = i < accountAnchors.length - 1
      ? Math.max(accountAnchors[i + 1] - 50, accountAnchors[i] + 1500)
      : Math.min(bureauText.length, accountAnchors[i] + 2000);
    const block = bureauText.slice(start, end);

    const tl = parseTradelineBlock(block);
    if (tl && tl.creditorName && tl.creditorName.length > 0) {
      tradelines.push(tl);
    }
  }

  return tradelines;
}

/**
 * Parse a single tradeline from a block of text around an account number.
 */
function parseTradelineBlock(block: string): Tradeline | null {
  // Account number — masked
  const acctMatch = block.match(ACCOUNT_NUMBER_PATTERN);
  const maskedAccountNumber = acctMatch ? cleanField(acctMatch[0].replace(/Account\s*(?:Number|#)?[:\s#]*/i, "").trim()) : "";

  // Creditor name — look for the most prominent name near top of block
  let creditorName = "";
  // First try the explicit "Account Name:" label
  const nameMatch = block.match(/Account\s*Name[:\s]+([A-Za-z0-9\s.,&'#()-]{2,60})/i);
  if (nameMatch) {
    creditorName = cleanField(nameMatch[1]);
  } else {
    // Fallback to other patterns
    for (const pattern of ACCOUNT_NAME_PATTERNS) {
      const match = block.match(pattern);
      if (match) {
        creditorName = cleanField(match[1]);
        break;
      }
    }
  }

  // Account type
  let accountType = "other";
  for (const { type, pattern } of ACCOUNT_TYPE_PATTERNS) {
    if (pattern.test(block)) {
      accountType = type;
      break;
    }
  }

  // Ownership
  let ownership: string | undefined;
  for (const { type, pattern } of OWNERSHIP_PATTERNS) {
    if (pattern.test(block)) {
      ownership = type;
      break;
    }
  }

  // Balance
  const balMatch = block.match(BALANCE_PATTERN);
  const balance = balMatch ? parseCurrency(balMatch[1]) : undefined;

  // Credit limit
  const limitMatch = block.match(CREDIT_LIMIT_PATTERN);
  const creditLimit = limitMatch ? parseCurrency(limitMatch[1]) : undefined;

  // Past due
  const pdMatch = block.match(PAST_DUE_PATTERN);
  const pastDueAmount = pdMatch ? parseCurrency(pdMatch[1]) : undefined;

  // High balance
  const hbMatch = block.match(/(?:High\s*Balance|Highest\s*Balance)[:\s]*\$?([\d,]+\.?\d*)/i);
  const highBalance = hbMatch ? parseCurrency(hbMatch[1]) : undefined;

  // Monthly payment
  const mpMatch = block.match(MONTHLY_PAYMENT_PATTERN);
  const monthlyPayment = mpMatch ? parseCurrency(mpMatch[1]) : undefined;

  // Dates
  const doMatch = block.match(DATE_OPENED_PATTERN);
  const dateOpened = doMatch ? cleanField(doMatch[1]) : undefined;

  const dcMatch = block.match(/(?:Date\s*Closed|Closed|Date\s*of\s*Closure)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const dateClosed = dcMatch ? cleanField(dcMatch[1]) : undefined;

  const drMatch = block.match(DATE_REPORTED_PATTERN);
  const dateReported = drMatch ? cleanField(drMatch[1]) : undefined;

  const dlaMatch = block.match(/(?:Last\s*Activity|Date\s*of\s*Last\s*Activity|DLA)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const dateOfLastActivity = dlaMatch ? cleanField(dlaMatch[1]) : undefined;

  const fddMatch = block.match(/(?:First\s*Delinquency|Date\s*of\s*First\s*Delinquency|DOFD)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const firstDelinquencyDate = fddMatch ? cleanField(fddMatch[1]) : undefined;

  // Payment status
  const psMatch = block.match(PAYMENT_STATUS_PATTERN);
  let paymentStatus = psMatch ? cleanField(psMatch[1]) : "";
  // Also try status line
  if (!paymentStatus) {
    const sMatch = block.match(/(?:Account\s*Status|Status)[:\s]*(\w[\w\s]{2,25})/i);
    paymentStatus = sMatch ? cleanField(sMatch[1]) : "";
  }

  // Account status
  let accountStatus = "unknown";
  if (/closed/i.test(block)) accountStatus = "closed";
  else if (/open/i.test(block)) accountStatus = "open";
  else if (/paid/i.test(block) && /closed/i.test(block)) accountStatus = "paid";
  else if (/charged?\s*off/i.test(block)) accountStatus = "charged_off";
  else if (/collection/i.test(block)) accountStatus = "collections";
  else if (/transferred/i.test(block)) accountStatus = "transferred";

  // Payment history — try to parse as array of monthly statuses
  let paymentHistory: string[] = [];
  const phMatch = block.match(PAYMENT_HISTORY_PATTERN);
  if (phMatch) {
    const raw = cleanField(phMatch[1]);
    // Payment history is often a string of codes: "OK OK 30 OK OK 60 OK"
    // or a JSON-like notation
    paymentHistory = raw.split(/[\s,;|]+/).filter((s) => s.length >= 2);
  }

  // Remarks
  const remMatch = block.match(REMARKS_PATTERN);
  const remarks = remMatch ? cleanField(remMatch[1]) : "";

  // Dispute indicator
  const disputeIndicator = DISPUTE_PATTERN.test(block);

  // Confidence: higher when we found more fields
  let fieldCount = 0;
  if (creditorName) fieldCount++;
  if (maskedAccountNumber) fieldCount++;
  if (balance !== undefined) fieldCount++;
  if (dateOpened) fieldCount++;
  if (dateReported) fieldCount++;
  if (paymentStatus) fieldCount++;
  const confidence = Math.min(1.0, fieldCount * 0.2);

  // Only return if we have at least a creditor name or account number
  if (!creditorName && !maskedAccountNumber) return null;

  return {
    creditorName,
    maskedAccountNumber,
    accountType,
    ownership,
    accountStatus,
    paymentStatus,
    balance,
    creditLimit,
    pastDueAmount,
    highBalance,
    monthlyPayment,
    dateOpened,
    dateClosed,
    dateReported,
    dateOfLastActivity,
    firstDelinquencyDate,
    paymentHistory,
    remarks,
    disputeIndicator,
    confidence,
  };
}

// ── Collections Extraction ─────────────────────
//
// Collection accounts appear in a dedicated section or mixed with tradelines.
// Key identifiers: "Collection Agency", "Original Creditor", "Collection Account"

const COLLECTION_BLOCK_PATTERN =
  /(?:Collection|Collections|COLLECTION\s*ACCOUNTS?)[:\-\s]*\n?((?:.+\n?){1,20})/gi;

/**
 * Extract collection accounts from bureau-specific text.
 */
export function extractCollections(bureauText: string): Collection[] {
  const collections: Collection[] = [];

  // Look for collection section markers
  let collectionSection = bureauText;
  const sectionMatch = bureauText.match(
    /(?:COLLECTIONS?|COLLECTION\s*ACCOUNTS?|COLLECTION\s*ITEMS?)[\s\S]{0,3000}/i
  );
  if (sectionMatch) {
    collectionSection = sectionMatch[0];
  }

  // Find individual collection entries
  // Collection entries typically have: agency name, original creditor, amount, date assigned
  const entries = collectionSection.split(/(?:\n\s*\n|\n\s*={3,})/);

  for (const entry of entries) {
    if (entry.trim().length < 20) continue;

    // Skip entries that don't look like collections
    if (!/collection|agency|assigned|original\s*creditor/i.test(entry)) continue;

    const agencyMatch = entry.match(
      /(?:Collection\s*Agency|Agency|Collector)[:\s]+([A-Za-z0-9\s.,&'#()-]{3,60})/i
    );
    const ocMatch = entry.match(
      /(?:Original\s*Creditor|Original\s*Lender|Placed\s*by)[:\s]+([A-Za-z0-9\s.,&'#()-]{3,60})/i
    );
    const amtMatch = entry.match(
      /(?:Amount|Balance|Original\s*Amount)[:\s]*\$?([\d,]+\.?\d*)/i
    );
    const acctMatch = entry.match(
      /(?:Account\s*(?:Number|#))[:\s]*([X*\d\s-]{4,20})/i
    );
    const dateMatch = entry.match(
      /(?:Date\s*Assigned|Assigned|Date\s*Reported|Date\s*Opened)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i
    );
    const statusMatch = entry.match(
      /(?:Status|Collection\s*Status)[:\s]*([A-Za-z\s]{3,30})/i
    );

    const collection: Collection = {
      collectionAgency: agencyMatch ? cleanField(agencyMatch[1]) : "",
      originalCreditor: ocMatch ? cleanField(ocMatch[1]) : "",
      amount: amtMatch ? parseCurrency(amtMatch[1]) ?? 0 : 0,
      accountNumber: acctMatch ? cleanField(acctMatch[1]) : "",
      dateAssigned: dateMatch ? cleanField(dateMatch[1]) : "",
      status: statusMatch ? cleanField(statusMatch[1]) : "",
      confidence: 0,
    };

    // Confidence based on how many fields found
    let fieldsFound = 0;
    if (collection.collectionAgency) fieldsFound++;
    if (collection.originalCreditor) fieldsFound++;
    if (collection.amount > 0) fieldsFound++;
    if (collection.dateAssigned) fieldsFound++;
    collection.confidence = Math.min(1.0, fieldsFound * 0.25);

    if (fieldsFound >= 2) {
      collections.push(collection);
    }
  }

  return collections;
}

// ── Inquiries Extraction ───────────────────────
//
// Inquiries sections list hard and soft credit pulls.
// Common format: "DATE | COMPANY NAME | TYPE"
// or: "MM/DD/YYYY  Company Name  (Hard/Soft)"

const INQUIRY_LINE_PATTERN =
  /(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2},?\s*\d{4})\s+([A-Za-z0-9\s.,&'#()-]{3,60})/g;
const HARD_INQUIRY_PATTERN = /Hard\s*(?:Inquiry|Pull|Credit\s*Check)/i;
const SOFT_INQUIRY_PATTERN = /Soft\s*(?:Inquiry|Pull)/i;

/**
 * Extract credit inquiries from bureau-specific text.
 */
export function extractInquiries(bureauText: string): Inquiry[] {
  const inquiries: Inquiry[] = [];

  // Find inquiries section
  let inquirySection = bureauText;
  const sectionMatch = bureauText.match(
    /(?:INQUIRIES?|CREDIT\s*INQUIRIES?|INQUIRY\s*INFORMATION)[\s\S]{0,4000}/i
  );
  if (sectionMatch) {
    inquirySection = sectionMatch[0];
  }

  // Parse inquiry lines: date + company name
  const pattern = new RegExp(INQUIRY_LINE_PATTERN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(inquirySection)) !== null) {
    const inquiryDate = cleanField(m[1]);
    const companyName = cleanField(m[2]);

    // Skip lines that aren't inquiries (e.g., section headers)
    if (
      /inquiry|request|customer|consumer|report|bureau|equifax|experian|transunion/i.test(
        companyName
      ) &&
      companyName.length < 15
    ) {
      continue;
    }

    // Determine inquiry type from context around this line
    const lineStart = Math.max(0, m.index - 10);
    const lineEnd = Math.min(inquirySection.length, m.index + m[0].length + 50);
    const context = inquirySection.slice(lineStart, lineEnd);

    let inquiryType: "hard" | "soft" = "soft";
    if (HARD_INQUIRY_PATTERN.test(context)) {
      inquiryType = "hard";
    }

    // Heuristic: if the section is labeled "Hard Inquiries", all entries are hard
    if (
      /hard\s*inquiries/i.test(inquirySection.slice(0, Math.min(200, inquirySection.length)))
    ) {
      inquiryType = "hard";
    }

    // Skip duplicates
    if (
      inquiries.some(
        (inq) => inq.inquiryDate === inquiryDate && inq.companyName === companyName
      )
    ) {
      continue;
    }

    inquiries.push({
      inquiryDate,
      companyName,
      inquiryType,
      confidence: 0.8, // date + company parsed = high confidence
    });
  }

  return inquiries;
}

// ── Public Records Extraction ──────────────────
//
// Public records: bankruptcies, judgments, tax liens.
// Key fields: type, date filed, court, reference number, amount, status.

const PUBLIC_RECORD_SECTION_PATTERN =
  /(?:PUBLIC\s*RECORDS?|PUBLIC\s*INFORMATION|LEGAL\s*ITEMS?)[\s\S]{0,3000}/i;

const BANKRUPTCY_PATTERN = /(?:Chapter\s*(?:7|11|13)|Bankruptcy|BANKRUPTCY)/i;
const JUDGMENT_PATTERN = /(?:Judgment|Civil\s*Judgment|JUDGMENT)/i;
const TAX_LIEN_PATTERN = /(?:Tax\s*Lien|TAX\s*LIEN|State\s*Tax\s*Lien|Federal\s*Tax\s*Lien)/i;

/**
 * Extract public records from bureau-specific text.
 */
export function extractPublicRecords(bureauText: string): PublicRecord[] {
  const records: PublicRecord[] = [];

  // Find public records section
  let section = bureauText;
  const sectionMatch = bureauText.match(PUBLIC_RECORD_SECTION_PATTERN);
  if (sectionMatch) {
    section = sectionMatch[0];
  }

  // Determine record type
  let recordType = "";
  if (BANKRUPTCY_PATTERN.test(section)) recordType = "bankruptcy";
  else if (TAX_LIEN_PATTERN.test(section)) recordType = "tax_lien";
  else if (JUDGMENT_PATTERN.test(section)) recordType = "judgment";
  else return records; // no public records detected

  // Extract fields
  const courtMatch = section.match(/(?:Court|Filed\s*at|Jurisdiction)[:\s]+([A-Za-z0-9\s.,'#()-]{3,60})/i);
  const dateMatch = section.match(/(?:Date\s*Filed|Filed|Filing\s*Date|Date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const refMatch = section.match(/(?:Reference|Case\s*(?:Number|#)|Docket|File\s*#)[:\s]*([A-Za-z0-9\s-]{3,40})/i);
  const amtMatch = section.match(/(?:Amount|Liability|Claim\s*Amount)[:\s]*\$?([\d,]+\.?\d*)/i);
  const statusMatch = section.match(/(?:Status|Disposition|Outcome)[:\s]*([A-Za-z\s]{3,40})/i);

  records.push({
    recordType,
    recordDate: dateMatch ? cleanField(dateMatch[1]) : "",
    court: courtMatch ? cleanField(courtMatch[1]) : "",
    referenceNumber: refMatch ? cleanField(refMatch[1]) : "",
    amount: amtMatch ? parseCurrency(amtMatch[1]) : undefined,
    status: statusMatch ? cleanField(statusMatch[1]) : "",
    confidence: dateMatch ? 0.8 : 0.5,
  });

  return records;
}

// ── Remarks Extraction ─────────────────────────
//
// Remarks appear as free-text notes on tradelines or as a dedicated section.
// Common labels: "Remarks:", "Comments:", "Consumer Statement:", "Account Remarks:"

const REMARKS_LINE_PATTERN = /(?:Remarks?|Comments?|Notes?|Consumer\s*Statement)[:\s]+(.+)/gi;

/**
 * Extract remarks/adverse notes from bureau-specific text.
 */
export function extractRemarks(bureauText: string): string[] {
  const remarks: string[] = [];
  const seen = new Set<string>();

  const pattern = new RegExp(REMARKS_LINE_PATTERN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(bureauText)) !== null) {
    const remark = cleanField(m[1]);
    if (remark.length > 5 && !seen.has(remark.toLowerCase())) {
      seen.add(remark.toLowerCase());
      remarks.push(remark);
    }
  }

  return remarks;
}
