import { useState, useEffect } from "react";

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="home">
      <h1>Welcome to CreditBridge</h1>
      <p className="tagline">
        Your credit, unified. Connect, import, and normalize your three-bureau
        credit reports — all in one place.
      </p>

      <section className="status-card">
        <h2>System Status</h2>
        {error ? (
          <p className="status-error">API unreachable: {error}</p>
        ) : health ? (
          <div className="status-details">
            <span className={`status-badge ${health.status === "ok" ? "ok" : "error"}`}>
              API: {health.status}
            </span>
            <span className={`status-badge ${health.database === "connected" ? "ok" : "error"}`}>
              Database: {health.database}
            </span>
          </div>
        ) : (
          <p>Checking API status...</p>
        )}
      </section>
    </div>
  );
}
