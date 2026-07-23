export default function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <a href="/" className="header__logo">
          CreditBridge
        </a>
        <nav className="header__nav">
          <a href="/">Dashboard</a>
          <a href="/connect">Connect</a>
          <a href="/reports">Reports</a>
        </nav>
      </div>
    </header>
  );
}
