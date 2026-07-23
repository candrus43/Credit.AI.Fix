import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  const database = getDb();
  const dbStatus = database ? "connected" : "disconnected";

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

export default router;
