// ──────────────────────────────────────────────
// CreditBridge — Cross-Bureau Account Matcher
// ──────────────────────────────────────────────
//
// Matches the same credit account (tradeline) across Equifax, Experian,
// and TransUnion reports. Since each bureau may mask the account number
// differently, we use a multi-signal approach:
//
//   1. Masked account number (strongest — same last-4 digits)
//   2. Creditor name similarity + account type match
//   3. Balance proximity + credit limit proximity
//
// Returns match groups with confidence levels and detected discrepancies.
// ──────────────────────────────────────────────

import type {
  NormalizedTradeline,
  MatchedAccount,
  CrossBureauMatch,
  Discrepancy,
  MatchConfidence,
} from "./schema.js";

// ── Helpers ─────────────────────────────────────

/**
 * Extract the last 4 digits from a masked account string.
 * e.g. "****1234" → "1234", "XXXX-XXXX-1234" → "1234"
 */
function extractLast4(masked: string): string {
  const digits = masked.replace(/\D/g, "");
  return digits.slice(-4);
}

/**
 * Compute the similarity between two creditor name strings.
 * Returns 0.0–1.0. Uses a simple Jaccard-like word overlap.
 */
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/[\s,.-]+/).filter((w) => w.length > 1));
  const wordsB = new Set(b.toLowerCase().split(/[\s,.-]+/).filter((w) => w.length > 1));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}

/**
 * Check if two floating point numbers are within a given percent difference.
 */
function withinPercent(a: number | null, b: number | null, pct: number): boolean {
  if (a === null || b === null) return false;
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;
  const diff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  return diff <= pct;
}

// ── Main Matcher ────────────────────────────────

/**
 * Match tradelines across multiple bureaus.
 *
 * Groups accounts that represent the same real-world credit account
 * appearing on different bureau reports. Uses multi-signal matching
 * with tiered confidence levels.
 *
 * @param tradelines — all tradelines from all bureaus, each with a bureau property
 * @returns array of CrossBureauMatch groups
 */
export function matchAccountsAcrossBureaus(
  tradelines: NormalizedTradeline[]
): CrossBureauMatch[] {
  // Each tradeline is expected to carry its bureau through its section context.
  // We need to find the bureau. Since NormalizedTradeline doesn't have a bureau
  // field directly, we look at the extraction raw for bureau info.
  // For this implementation, we group by the implicit bureau from the input.
  //
  // Strategy: Accept tradelines with bureau passed alongside. We'll check
  // for a bureau override in the raw data.

  // Since NormalizedTradeline doesn't carry bureau directly, we expect the
  // caller to have assigned bureau context before passing in. The engine
  // creates BureauReport sections which inherently group by bureau.
  //
  // For the matching function, we'll work with an augmented type that includes bureau.

  // For practical usage, tradelines arrive grouped by bureau and we flatten
  // them with bureau tagging. We'll use a simple approach: tag each tradeline
  // with its bureau via extraction_raw.

  // Actually, let's pivot: the normalizer will have per-bureau sections already.
  // The matcher should accept a flattened list with explicit bureau tagging.
  // We'll derive bureau from the extractionRaw if present, otherwise treat
  // the tradeline's "bureau" marker.

  // Simplest approach: tag tradelines with bureau before calling this function.
  // But since this function signature matches the task spec, let me adjust.

  return matchTaggedTradelines(tradelines as TaggedNormalizedTradeline[]);
}

/**
 * Internal: a tradeline with an explicit bureau tag for matching.
 */
interface TaggedNormalizedTradeline extends NormalizedTradeline {
  _bureau?: string;
}

function matchTaggedTradelines(
  tradelines: TaggedNormalizedTradeline[]
): CrossBureauMatch[] {
  if (tradelines.length < 2) return [];

  const matches: CrossBureauMatch[] = [];
  const used = new Set<number>();

  for (let i = 0; i < tradelines.length; i++) {
    if (used.has(i)) continue;

    const a = tradelines[i];
    const bureauA = a._bureau ?? "unknown";
    const group: MatchedAccount[] = [{ bureau: bureauA, tradeline: a }];
    used.add(i);

    // Try to find matching accounts in other bureaus
    for (let j = i + 1; j < tradelines.length; j++) {
      if (used.has(j)) continue;

      const b = tradelines[j];
      const bureauB = b._bureau ?? "unknown";

      // Skip same bureau (same account can't appear twice in same bureau)
      if (bureauA === bureauB && bureauA !== "unknown") continue;

      const confidence = computeMatchConfidence(a, b);
      if (confidence !== null) {
        group.push({ bureau: bureauB, tradeline: b });
        used.add(j);
      }
    }

    // Only create a cross-bureau match if we found accounts in multiple bureaus
    if (group.length >= 2) {
      const matchConfidence = computeGroupConfidence(group);
      const discrepancies = detectGroupDiscrepancies(group);

      matches.push({
        matchConfidence,
        accounts: group,
        discrepancies,
      });
    }
  }

  return matches;
}

/**
 * Compute the match confidence between two tradelines.
 * Returns null if they shouldn't be matched.
 */
function computeMatchConfidence(
  a: NormalizedTradeline,
  b: NormalizedTradeline
): MatchConfidence | null {
  const last4a = extractLast4(a.maskedAccountNumber.normalized);
  const last4b = extractLast4(b.maskedAccountNumber.normalized);

  // Exact match on last 4 of account number — STRONGEST signal
  if (last4a.length >= 4 && last4b.length >= 4 && last4a === last4b) {
    return "EXACT";
  }

  const nameSim = nameSimilarity(
    a.creditorName.normalized,
    b.creditorName.normalized
  );

  // Same creditor name + same account type → HIGH
  if (nameSim >= 0.7 && a.accountType.normalized === b.accountType.normalized) {
    // Check if balances are close
    const balanceClose = withinPercent(a.balance.normalized, b.balance.normalized, 0.15);
    const limitClose = withinPercent(a.creditLimit.normalized, b.creditLimit.normalized, 0.15);

    if (balanceClose || limitClose) {
      return "HIGH";
    }
    return "MEDIUM";
  }

  // Same creditor name but different type → MEDIUM
  if (nameSim >= 0.5 && a.accountType.normalized === b.accountType.normalized) {
    return "MEDIUM";
  }

  // Heuristic: similar names + some shared characteristics
  if (nameSim >= 0.4) {
    const sharedChars =
      (a.accountType.normalized === b.accountType.normalized ? 1 : 0) +
      (withinPercent(a.balance.normalized, b.balance.normalized, 0.25) ? 1 : 0) +
      (withinPercent(a.creditLimit.normalized, b.creditLimit.normalized, 0.25) ? 1 : 0);

    if (sharedChars >= 2) return "LOW";
  }

  return null;
}

/**
 * Compute the overall group match confidence.
 * If any pair is EXACT, the group is EXACT (with caveat).
 * Otherwise, uses the lowest pairwise confidence.
 */
function computeGroupConfidence(group: MatchedAccount[]): MatchConfidence {
  if (group.length <= 1) return "LOW";

  let hasExact = false;
  let hasHigh = false;
  let hasMedium = false;

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const conf = computeMatchConfidence(group[i].tradeline, group[j].tradeline);
      if (conf === "EXACT") hasExact = true;
      if (conf === "HIGH") hasHigh = true;
      if (conf === "MEDIUM") hasMedium = true;
    }
  }

  if (hasExact) return "EXACT";
  if (hasHigh) return "HIGH";
  if (hasMedium) return "MEDIUM";
  return "LOW";
}

/**
 * Detect discrepancies within a matched group of accounts across bureaus.
 */
function detectGroupDiscrepancies(group: MatchedAccount[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  if (group.length < 2) return discrepancies;

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const detected = detectPairDiscrepancies(a, b);
      discrepancies.push(...detected);
    }
  }

  return discrepancies;
}

function detectPairDiscrepancies(
  a: MatchedAccount,
  b: MatchedAccount
): Discrepancy[] {
  const d: Discrepancy[] = [];

  // Balance mismatch (>10% difference)
  if (
    a.tradeline.balance.normalized !== null &&
    b.tradeline.balance.normalized !== null &&
    a.tradeline.balance.normalized !== 0 &&
    b.tradeline.balance.normalized !== 0
  ) {
    const diff = Math.abs(a.tradeline.balance.normalized - b.tradeline.balance.normalized) /
      Math.max(a.tradeline.balance.normalized, b.tradeline.balance.normalized);
    if (diff > 0.10) {
      d.push({
        field: "balance",
        bureauA: a.bureau,
        valueA: String(a.tradeline.balance.normalized),
        bureauB: b.bureau,
        valueB: String(b.tradeline.balance.normalized),
        severity: diff > 0.25 ? "high" : "medium",
        description: `Balance differs by ${Math.round(diff * 100)}% between ${a.bureau} and ${b.bureau}`,
      });
    }
  }

  // Status mismatch (open vs closed)
  if (a.tradeline.accountStatus.normalized !== b.tradeline.accountStatus.normalized) {
    const aStatus = a.tradeline.accountStatus.normalized;
    const bStatus = b.tradeline.accountStatus.normalized;
    d.push({
      field: "accountStatus",
      bureauA: a.bureau,
      valueA: aStatus,
      bureauB: b.bureau,
      valueB: bStatus,
      severity: "high",
      description: `Account status mismatch: ${a.bureau} reports "${aStatus}", ${b.bureau} reports "${bStatus}"`,
    });
  }

  // Payment status differences (current vs late)
  if (a.tradeline.paymentStatus.normalized !== b.tradeline.paymentStatus.normalized) {
    const aPS = a.tradeline.paymentStatus.normalized;
    const bPS = b.tradeline.paymentStatus.normalized;
    const severity =
      (aPS === "current" && bPS !== "current") || (aPS !== "current" && bPS === "current")
        ? "high"
        : "medium";
    d.push({
      field: "paymentStatus",
      bureauA: a.bureau,
      valueA: aPS,
      bureauB: b.bureau,
      valueB: bPS,
      severity,
      description: `Payment status differs: ${a.bureau} reports "${aPS}", ${b.bureau} reports "${bPS}"`,
    });
  }

  // Credit limit differences (>20%)
  if (
    a.tradeline.creditLimit.normalized !== null &&
    b.tradeline.creditLimit.normalized !== null &&
    a.tradeline.creditLimit.normalized !== 0 &&
    b.tradeline.creditLimit.normalized !== 0
  ) {
    const diff = Math.abs(a.tradeline.creditLimit.normalized - b.tradeline.creditLimit.normalized) /
      Math.max(a.tradeline.creditLimit.normalized, b.tradeline.creditLimit.normalized);
    if (diff > 0.20) {
      d.push({
        field: "creditLimit",
        bureauA: a.bureau,
        valueA: String(a.tradeline.creditLimit.normalized),
        bureauB: b.bureau,
        valueB: String(b.tradeline.creditLimit.normalized),
        severity: diff > 0.50 ? "high" : "medium",
        description: `Credit limit differs by ${Math.round(diff * 100)}% between ${a.bureau} and ${b.bureau}`,
      });
    }
  }

  // Date discrepancies (opened dates > 90 days apart)
  if (a.tradeline.dateOpened.normalized && b.tradeline.dateOpened.normalized) {
    const dateA = new Date(a.tradeline.dateOpened.normalized);
    const dateB = new Date(b.tradeline.dateOpened.normalized);
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        d.push({
          field: "dateOpened",
          bureauA: a.bureau,
          valueA: a.tradeline.dateOpened.normalized,
          bureauB: b.bureau,
          valueB: b.tradeline.dateOpened.normalized,
          severity: diffDays > 365 ? "high" : "medium",
          description: `Date opened differs by ${Math.round(diffDays)} days between ${a.bureau} and ${b.bureau}`,
        });
      }
    }
  }

  // Past due amount differences
  if (
    a.tradeline.pastDueAmount.normalized !== null &&
    b.tradeline.pastDueAmount.normalized !== null &&
    (a.tradeline.pastDueAmount.normalized > 0 || b.tradeline.pastDueAmount.normalized > 0) &&
    a.tradeline.pastDueAmount.normalized !== b.tradeline.pastDueAmount.normalized
  ) {
    d.push({
      field: "pastDueAmount",
      bureauA: a.bureau,
      valueA: String(a.tradeline.pastDueAmount.normalized),
      bureauB: b.bureau,
      valueB: String(b.tradeline.pastDueAmount.normalized),
      severity: "high",
      description: `Past due amount differs: ${a.bureau}=${a.tradeline.pastDueAmount.normalized}, ${b.bureau}=${b.tradeline.pastDueAmount.normalized}`,
    });
  }

  return d;
}

/**
 * Convenience: match accounts from per-bureau tradeline arrays.
 * Tags each tradeline with its bureau and runs cross-bureau matching.
 */
export function matchAccountsByBureau(
  bureauTradelines: Record<string, NormalizedTradeline[]>
): CrossBureauMatch[] {
  const tagged: TaggedNormalizedTradeline[] = [];

  for (const [bureau, tradelines] of Object.entries(bureauTradelines)) {
    for (const tl of tradelines) {
      tagged.push({ ...tl, _bureau: bureau });
    }
  }

  return matchTaggedTradelines(tagged);
}
