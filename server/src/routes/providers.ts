// ──────────────────────────────────────────────
// CreditBridge — Provider API Routes
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { CapabilityRegistry } from "../adapters/registry.js";

const router = Router();

/**
 * Lazy-initialized CapabilityRegistry singleton.
 * Created on first request so DB is ready.
 */
let registry: CapabilityRegistry | null = null;

function getRegistry(): CapabilityRegistry {
  if (!registry) {
    const db = getDb();
    registry = new CapabilityRegistry(db);
    registry.refreshRegistry();
  }
  return registry;
}

/**
 * GET /api/providers
 * Returns all registered providers with their capabilities.
 */
router.get("/", (_req: Request, res: Response) => {
  const reg = getRegistry();
  const providers = reg.getAllProviders(true);
  res.json(providers);
});

/**
 * GET /api/providers/:name
 * Returns a single provider's capabilities by name.
 */
router.get("/:name", (req: Request, res: Response) => {
  const reg = getRegistry();
  const name = req.params.name as string;
  const caps = reg.getProviderCapabilities(name);
  if (!caps) {
    res.status(404).json({ error: `Provider "${name}" not found` });
    return;
  }
  res.json(caps);
});

export default router;
