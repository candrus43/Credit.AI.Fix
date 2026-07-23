// ──────────────────────────────────────────────
// CreditBridge — Testing Routes
// ──────────────────────────────────────────────
//
// Endpoints for activating test scenarios and inspecting
// mock adapter state during development and testing.
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { getAdapter, listAdapters } from "../adapters/factory.js";
import { MockAdapterBase } from "../adapters/testing/mock-base.js";
import { TEST_SCENARIOS, listScenarioNames } from "../adapters/testing/scenarios.js";

const router = Router();

/**
 * Check whether an adapter instance is a MockAdapterBase.
 */
function isMockAdapter(adapter: unknown): adapter is MockAdapterBase {
  return adapter instanceof MockAdapterBase;
}

/**
 * GET /api/testing/scenarios
 *
 * Lists all available test scenarios with their descriptions,
 * affected methods, and which mock providers support them.
 */
router.get("/scenarios", (_req: Request, res: Response) => {
  const db = getDb();
  const providers = listAdapters();

  // Find which adapters are mock adapters
  const mockProviders: string[] = [];
  for (const name of providers) {
    try {
      const adapter = getAdapter(name, db);
      if (isMockAdapter(adapter)) {
        mockProviders.push(name);
      }
    } catch {
      // Skip adapters that fail to instantiate
    }
  }

  res.json({
    test_mode: true,
    total_scenarios: TEST_SCENARIOS.length,
    mock_providers: mockProviders,
    scenarios: TEST_SCENARIOS.map((s) => ({
      name: s.name,
      description: s.description,
      affectedMethods: s.affectedMethods,
    })),
  });
});

/**
 * POST /api/testing/scenarios/:providerName/:scenarioName
 *
 * Activates a named test scenario on a specific mock provider adapter.
 * Returns the adapter's current state after activation.
 */
router.post("/scenarios/:providerName/:scenarioName", (req: Request, res: Response) => {
  const { providerName, scenarioName } = req.params;
  const db = getDb();

  // Validate scenario exists
  const validScenarios = listScenarioNames();
  if (!validScenarios.includes(scenarioName)) {
    res.status(404).json({
      test_mode: true,
      error: `Unknown scenario "${scenarioName}".`,
      available_scenarios: validScenarios,
    });
    return;
  }

  // Get the adapter
  let adapter;
  try {
    adapter = getAdapter(providerName, db);
  } catch (err: any) {
    res.status(404).json({
      test_mode: true,
      error: `No adapter registered for "${providerName}".`,
      available_providers: listAdapters(),
    });
    return;
  }

  // Verify it's a mock adapter
  if (!isMockAdapter(adapter)) {
    res.status(400).json({
      test_mode: true,
      error: `"${providerName}" is not a mock adapter — scenarios can only be activated on mock adapters.`,
      adapter_type: adapter.constructor.name,
    });
    return;
  }

  // Activate the scenario
  try {
    adapter.setScenario(scenarioName);
  } catch (err: any) {
    res.status(400).json({
      test_mode: true,
      error: err.message,
    });
    return;
  }

  res.json({
    test_mode: true,
    message: `[TEST] Scenario "${scenarioName}" activated on "${providerName}".`,
    provider: providerName,
    active_scenario: adapter.getScenario(),
    call_history_length: adapter.callHistory.length,
  });
});

/**
 * POST /api/testing/reset/:providerName
 *
 * Resets a mock adapter's call history and clears its active scenario.
 */
router.post("/reset/:providerName", (req: Request, res: Response) => {
  const { providerName } = req.params;
  const db = getDb();

  let adapter;
  try {
    adapter = getAdapter(providerName, db);
  } catch (err: any) {
    res.status(404).json({
      test_mode: true,
      error: `No adapter registered for "${providerName}".`,
      available_providers: listAdapters(),
    });
    return;
  }

  if (!isMockAdapter(adapter)) {
    res.status(400).json({
      test_mode: true,
      error: `"${providerName}" is not a mock adapter — only mock adapters support reset.`,
      adapter_type: adapter.constructor.name,
    });
    return;
  }

  const callCount = adapter.callHistory.length;
  adapter.reset();

  res.json({
    test_mode: true,
    message: `[TEST] Reset "${providerName}" — cleared ${callCount} call history entries and any active scenario.`,
    provider: providerName,
    active_scenario: adapter.getScenario(),
    call_history_length: adapter.callHistory.length,
  });
});

/**
 * GET /api/testing/state/:providerName
 *
 * Returns the current test state of a mock adapter — scenario, call history, etc.
 */
router.get("/state/:providerName", (req: Request, res: Response) => {
  const { providerName } = req.params;
  const db = getDb();

  let adapter;
  try {
    adapter = getAdapter(providerName, db);
  } catch (err: any) {
    res.status(404).json({
      test_mode: true,
      error: `No adapter registered for "${providerName}".`,
      available_providers: listAdapters(),
    });
    return;
  }

  if (!isMockAdapter(adapter)) {
    res.status(200).json({
      test_mode: true,
      provider: providerName,
      is_mock: false,
      adapter_type: adapter.constructor.name,
      message: "This adapter is not a mock adapter and does not support scenario testing.",
    });
    return;
  }

  res.json({
    test_mode: true,
    provider: providerName,
    is_mock: true,
    active_scenario: adapter.getScenario() || "(none)",
    call_history_length: adapter.callHistory.length,
    recent_calls: adapter.callHistory.slice(-20),
  });
});

export default router;
