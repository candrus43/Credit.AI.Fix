# CreditBridge

**Your Credit, Unified.** A provider-neutral platform where consumers connect, import, and normalize their three-bureau credit reports — regardless of which credit-monitoring service they use.

## Project Structure

```
creditbridge/
├── client/          # Vite + React + TypeScript frontend (port 5173)
├── server/          # Express + TypeScript API backend (port 3001)
├── shared/          # Shared TypeScript types and constants
├── package.json     # Bun workspace root
└── README.md
```

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.2.0
- Node.js ≥ 20 (for compatibility)

## Getting Started

```bash
# Clone the repository
git clone <repo-url> && cd creditbridge

# Install all dependencies
bun install

# Start both client and server in development mode
bun run dev
```

The client runs at **http://localhost:5173** and proxies `/api` requests to the server at **http://localhost:3001**.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start client + server concurrently |
| `bun run dev:server` | Start server only (port 3001) |
| `bun run dev:client` | Start client only (port 5173) |
| `bun run build` | Build all packages for production |
| `bun run typecheck` | Type-check all packages |

## API

### Health Check

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-07-23T00:00:00.000Z",
  "database": "connected"
}
```

## Tech Stack

- **Frontend:** Vite, React 18, TypeScript, React Router
- **Backend:** Express, TypeScript
- **Database:** SQLite (via better-sqlite3)
- **Package Manager:** Bun (workspaces)

## Architecture

- **Adapters** (`server/src/adapters/`) — Provider adapter framework for connecting to third-party credit-monitoring services
- **Normalization** (`server/src/normalization/`) — Canonical credit-report schema and cross-bureau field mapping
- **PDF** (`server/src/pdf/`) — PDF credit-report parsing pipeline
- **Auth** (`server/src/auth/`) — OAuth flows and token management

## Shared Types

The `@creditbridge/shared` package provides types used by both client and server:

- `ProviderCapability` — Enum of adapter capabilities
- `ProviderStatus` — Enum of connection states
- `ReportSource` — Enum of report import sources
- `Bureau` — Enum of major credit bureaus
- `ProviderInfo` — Interface for adapter metadata
- `ReportSummary` — Interface for imported report summaries

## License

Proprietary — all rights reserved.
