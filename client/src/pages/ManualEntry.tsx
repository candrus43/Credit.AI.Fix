import { useNavigate } from "react-router-dom";

export default function ManualEntry() {
  const navigate = useNavigate();

  return (
    <div className="connect-page">
      <header className="connect-page__header">
        <h1>Manual Entry</h1>
        <p className="connect-page__subtitle">
          Enter your credit account information by hand.
        </p>
      </header>

      <div className="connect-card" style={{ maxWidth: 600, margin: "0 auto" }}>
        <div className="connect-card__icon" style={{ fontSize: "2rem" }}>✏️</div>
        <h2>Coming Soon</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
          The manual entry form is under development. You'll be able to enter
          accounts, balances, payment statuses, and other credit report details
          field by field.
        </p>
        <button className="btn btn--primary" onClick={() => navigate("/connect")}>
          Back to Connect
        </button>
      </div>
    </div>
  );
}
