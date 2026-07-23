import express from "express";
import cors from "cors";
import { initDb } from "./db/connection.js";
import healthRouter from "./routes/health.js";
import providersRouter from "./routes/providers.js";
import uploadRouter, { ensureStorageDir } from "./routes/upload.js";

const API_PORT = parseInt(process.env.SERVER_PORT || "3001", 10);

async function main() {
  // Initialize the database (creates file, runs migrations)
  initDb();

  // Ensure storage directory exists for PDF reports
  ensureStorageDir();
  console.log("[server] Storage directory ready");

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Routes
  app.use("/api", healthRouter);
  app.use("/api/providers", providersRouter);
  app.use("/api/reports", uploadRouter);

  app.listen(API_PORT, () => {
    console.log(`[server] CreditBridge API running on http://localhost:${API_PORT}`);
    console.log(`[server] Health check: http://localhost:${API_PORT}/api/health`);
  });
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
