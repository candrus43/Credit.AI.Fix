// ──────────────────────────────────────────────
// CreditBridge — Discrepancy Detection
// ──────────────────────────────────────────────
//
// Detects meaningful differences between matched accounts across bureaus.
// Discrepancies are the core value proposition: users see when one bureau
// reports differently from another, which often indicates errors.
//
// Discrepancy types:
//   - balance_mismatch: balances differ by >10%
//   - status_mismatch: one bureau shows open, another shows closed
//   - payment_difference: payment status doesn't match (current vs late)
//   - credit_limit_difference: limits differ by >20%
//   - date_discrepancy: critical dates differ significantly
//   - missing_account: account present in one bureau, absent in another
// ──────────────────────────────────────────────

import type {
  NormalizedTradeline,
  NormalizedScore,
  CrossBureauMatch,
  MatchedAccount,
  Discrepancy,
} from "./schema.js";

// ── Tradeline Discrepancies ─────────────────────

/**
 * Detect all discrepancies within a cross-bureau match group.
 * Compares every pair of bureau accounts in the group.
 *
 * @param matchedGroup — a cross-bureau match with 2+ bureau accounts
 * @returns array of detected Discrepancy objects
 */
export function detectDiscrepancies(
  matchedGroup: CrossBureauMatch
): Discrepancy[] {
  const { accounts } = matchedGroup;
  const results: Discrepancy[] = [];

  if (accounts.length < 2) return results;

  // Compare each pair of accounts
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      results.push(
        ...detectAccountDiscrepancies(accounts[i], accounts[j])
      );
    }
  }

  return results;
}

/**
 * Detect discrepancies between two matched accounts from different bureaus.
 */
function detectAccountDiscrepancies(
  a: MatchedAccount,
  b: MatchedAccount
): Discrepancy[] {
  const results: Discrepancy[] = [];

  // Balance mismatch
  const balanceDisc = checkBalanceMismatch(a, b);
  if (balanceDisc) results.push(balanceDisc);

  // Account status mismatch
  const statusDisc = checkStatusMismatch(a, b);
  if (statusDisc) results.push(statusDisc);

  // Payment status difference
  const paymentDisc = checkPaymentStatusDifference(a, b);
  if (paymentDisc) results.push(paymentDisc);

  // Credit limit difference
  const limitDisc = checkCreditLimitDifference(a, b);
  if (limitDisc) results.push(limitDisc);

  // Date discrepancies
  results.push(...checkDateDiscrepancies(a, b));

  // Past due amount
  const pastDueDisc = checkPastDueDifference(a, b);
  if (pastDueDisc) results.push(pastDueDisc);

  return results;
}

// ── Individual Checks ───────────────────────────

function checkBalanceMismatch(a: MatchedAccount, b: MatchedAccount): Discrepancy | null {
  const balA = a.tradeline.balance.normalized;
  const balB = b.tradeline.balance.normalized;

  if (balA === null || balB === null) return null;
  if (balA === 0 && balB === 0) return null;
  if (balA === 0 || balB === 0) {
    // One shows zero balance, the other doesn't — significant difference
    return {
      field: "balance",
      bureauA: a.bureau,
      valueA: String(balA),
      bureauB: b.bureau,
      valueB: String(balB),
      severity: "high",
      description: `Balance mismatch: ${a.bureau} reports $${balA}, ${b.bureau} reports $${balB}`,
    };
  }

  const diff = Math.abs(balA - balB) / Math.max(Math.abs(balA), Math.abs(balB));
  if (diff > 0.10) {
    const severity = diff > 0.25 ? "high" : diff > 0.15 ? "medium" : "low";
    return {
      field: "balance",
      bureauA: a.bureau,
      valueA: String(balA),
      bureauB: b.bureau,
      valueB: String(balB),
      severity,
      description: `Balance differs by ${Math.round(diff * 100)}% between ${a.bureau} ($${balA}) and ${b.bureau} ($${balB})`,
    };
  }

  return null;
}

function checkStatusMismatch(a: MatchedAccount, b: MatchedAccount): Discrepancy | null {
  const statusA = a.tradeline.accountStatus.normalized;
  const statusB = b.tradeline.accountStatus.normalized;

  if (statusA === statusB) return null;

  // Determine severity based on the type of mismatch
  let severity: "low" | "medium" | "high" = "medium";

  // Open vs closed is a high-severity mismatch
  if (
    (statusA === "open" && statusB === "closed") ||
    (statusA === "closed" && statusB === "open")
  ) {
    severity = "high";
  }

  // Charged off vs anything else is high severity
  if (statusA === "charged_off" || statusB === "charged_off") {
    severity = "high";
  }

  return {
    field: "accountStatus",
    bureauA: a.bureau,
    valueA: statusA,
    bureauB: b.bureau,
    valueB: statusB,
    severity,
    description: `Account status mismatch: ${a.bureau} reports "${statusA}", ${b.bureau} reports "${statusB}"`,
  };
}

function checkPaymentStatusDifference(a: MatchedAccount, b: MatchedAccount): Discrepancy | null {
  const psA = a.tradeline.paymentStatus.normalized;
  const psB = b.tradeline.paymentStatus.normalized;

  if (!psA || !psB) return null;
  if (psA === psB) return null;

  // Current vs late is high severity
  const isCurrentA = psA === "current" || psA === "ok" || psA === "OK";
  const isCurrentB = psB === "current" || psB === "ok" || psB === "OK";

  let severity: "low" | "medium" | "high";
  if (isCurrentA !== isCurrentB) {
    severity = "high";
  } else {
    severity = "medium";
  }

  return {
    field: "paymentStatus",
    bureauA: a.bureau,
    valueA: psA,
    bureauB: b.bureau,
    valueB: psB,
    severity,
    description: `Payment status differs: ${a.bureau} reports "${psA}", ${b.bureau} reports "${psB}"`,
  };
}

function checkCreditLimitDifference(a: MatchedAccount, b: MatchedAccount): Discrepancy | null {
  const limA = a.tradeline.creditLimit.normalized;
  const limB = b.tradeline.creditLimit.normalized;

  if (limA === null || limB === null) return null;
  if (limA === 0 || limB === 0) return null;

  const diff = Math.abs(limA - limB) / Math.max(limA, limB);
  if (diff > 0.20) {
    const severity = diff > 0.50 ? "high" : "medium";
    return {
      field: "creditLimit",
      bureauA: a.bureau,
      valueA: String(limA),
      bureauB: b.bureau,
      valueB: String(limB),
      severity,
      description: `Credit limit differs by ${Math.round(diff * 100)}%: ${a.bureau}=$${limA}, ${b.bureau}=$${limB}`,
    };
  }

  return null;
}

function checkDateDiscrepancies(a: MatchedAccount, b: MatchedAccount): Discrepancy[] {
  const results: Discrepancy[] = [];
  const dateFields: Array<{ field: string; getter: (tl: NormalizedTradeline) => string }> = [
    { field: "dateOpened", getter: (tl) => tl.dateOpened?.normalized ?? "" },
    { field: "dateClosed", getter: (tl) => tl.dateClosed?.normalized ?? "" },
    { field: "dateReported", getter: (tl) => tl.dateReported?.normalized ?? "" },
    { field: "dateOfLastActivity", getter: (tl) => tl.dateOfLastActivity?.normalized ?? "" },
    { field: "firstDelinquencyDate", getter: (tl) => tl.firstDelinquencyDate?.normalized ?? "" },
  ];

  for (const { field, getter } of dateFields) {
    const dateA = getter(a.tradeline);
    const dateB = getter(b.tradeline);

    if (!dateA || !dateB) continue;

    const parsedA = new Date(dateA);
    const parsedB = new Date(dateB);

    if (isNaN(parsedA.getTime()) || isNaN(parsedB.getTime())) continue;

    const diffMs = Math.abs(parsedA.getTime() - parsedB.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays > 30) {
      const severity = diffDays > 365 ? "high" : diffDays > 90 ? "medium" : "low";
      results.push({
        field,
        bureauA: a.bureau,
        valueA: dateA,
        bureauB: b.bureau,
        valueB: dateB,
        severity,
        description: `${fieldLabel(field)} differs by ${Math.round(diffDays)} days: ${a.bureau}=${dateA}, ${b.bureau}=${dateB}`,
      });
    }
  }

  return results;
}

function checkPastDueDifference(a: MatchedAccount, b: MatchedAccount): Discrepancy | null {
  const pdA = a.tradeline.pastDueAmount.normalized;
  const pdB = b.tradeline.pastDueAmount.normalized;

  if (pdA === null || pdB === null) return null;
  if (pdA === 0 && pdB === 0) return null;
  if (pdA === pdB) return null;

  return {
    field: "pastDueAmount",
    bureauA: a.bureau,
    valueA: String(pdA),
    bureauB: b.bureau,
    valueB: String(pdB),
    severity: "high",
    description: `Past due amount differs: ${a.bureau}=$${pdA}, ${b.bureau}=$${pdB}`,
  };
}

// ── Missing Account Detection ───────────────────

/**
 * Detect accounts present in one bureau's report but absent from another.
 *
 * @param bureauTradelines — tradelines grouped by bureau
 * @returns discrepancies for accounts missing from a bureau
 */
export function detectMissingAccounts(
  bureauTradelines: Record<string, NormalizedTradeline[]>,
  crossBureauMatches: CrossBureauMatch[]
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const bureaus = Object.keys(bureauTradelines);

  if (bureaus.length < 2) return results;

  // For each matched group, check which bureaus are NOT represented
  for (const match of crossBureauMatches) {
    const matchedBureaus = new Set(match.accounts.map((a) => a.bureau));
    const representativeAccount = match.accounts[0];
    const accountLabel =
      representativeAccount.tradeline.creditorName.normalized ||
      representativeAccount.tradeline.maskedAccountNumber.normalized ||
      "Unknown account";

    for (const bureau of bureaus) {
      if (!matchedBureaus.has(bureau)) {
        // Check if this account actually exists in other bureaus
        const presentBureaus = match.accounts.map((a) => a.bureau).join(", ");
        results.push({
          field: "missing_account",
          bureauA: bureau,
          valueA: "not reported",
          bureauB: presentBureaus,
          valueB: accountLabel,
          severity: "high",
          description: `Account "${accountLabel}" is reported on ${presentBureaus} but missing from ${bureau}`,
        });
      }
    }
  }

  return results;
}

// ── Score Discrepancy Detection ─────────────────

/**
 * Detect score discrepancies across bureaus.
 * Flags when scores for the same model differ significantly.
 *
 * @param bureauScores — scores grouped by bureau
 * @returns score-related discrepancies
 */
export function detectScoreDiscrepancies(
  bureauScores: Record<string, NormalizedScore[]>
): Discrepancy[] {
  const results: Discrepancy[] = [];
  const bureaus = Object.keys(bureauScores);

  if (bureaus.length < 2) return results;

  // Find matching score models across bureaus
  const modelScores: Record<string, Record<string, number>> = {};

  for (const [bureau, scores] of Object.entries(bureauScores)) {
    for (const score of scores) {
      const model = score.model.normalized;
      if (!model) continue;
      if (!modelScores[model]) modelScores[model] = {};
      if (score.score.normalized !== null) {
        modelScores[model][bureau] = score.score.normalized;
      }
    }
  }

  // Compare scores for matching models
  for (const [model, bureauMap] of Object.entries(modelScores)) {
    const entries = Object.entries(bureauMap);
    if (entries.length < 2) continue;

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [bureauA, scoreA] = entries[i];
        const [bureauB, scoreB] = entries[j];
        const diff = Math.abs(scoreA - scoreB);

        if (diff >= 20) {
          const severity = diff >= 50 ? "high" : diff >= 30 ? "medium" : "low";
          results.push({
            field: "creditScore",
            bureauA,
            valueA: String(scoreA),
            bureauB,
            valueB: String(scoreB),
            severity,
            description: `${model} score differs by ${diff} points: ${bureauA}=${scoreA}, ${bureauB}=${scoreB}`,
          });
        }
      }
    }
  }

  return results;
}

// ── Helpers ─────────────────────────────────────

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    dateOpened: "Date opened",
    dateClosed: "Date closed",
    dateReported: "Date reported",
    dateOfLastActivity: "Date of last activity",
    firstDelinquencyDate: "First delinquency date",
  };
  return labels[field] ?? field;
}
