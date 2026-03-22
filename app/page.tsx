import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="home" aria-labelledby="page-heading">
      <div className="hero">
        <h1 id="page-heading">OnionCraft</h1>
        <p className="hero-subtitle">
          Guild Wars 2 crafting profit calculator and skin collection tracker.
        </p>
      </div>

      <div className="feature-cards">
        <Link href="/crafting" className="feature-card">
          <div className="feature-icon" aria-hidden="true">
            ⚒️
          </div>
          <h2>Crafting Profits</h2>
          <p>
            Find the most profitable items to craft. Accounts for trading post fees, multi-goal
            material reservations, and daily craft limits.
          </p>
          <span className="feature-cta">Open Calculator →</span>
        </Link>

        <Link href="/skins" className="feature-card">
          <div className="feature-icon" aria-hidden="true">
            🎨
          </div>
          <h2>Skin Tracker</h2>
          <p>
            Track your unowned skins and rank them by acquisition method. Filter by type, sort by
            trading post price, and plan your collection.
          </p>
          <span className="feature-cta">View Collection →</span>
        </Link>

        <Link href="/settings" className="feature-card">
          <div className="feature-icon" aria-hidden="true">
            ⚙️
          </div>
          <h2>Settings</h2>
          <p>
            Configure your GW2 API key, set crafting exclusions, filter by character, and customize
            priority rules.
          </p>
          <span className="feature-cta">Configure →</span>
        </Link>
      </div>

      <div className="getting-started">
        <h2>Getting Started</h2>
        <ol>
          <li>
            <strong>Sign in</strong> with your GitHub account
          </li>
          <li>
            Go to <Link href="/settings">Settings</Link> and enter your <strong>GW2 API key</strong>
          </li>
          <li>
            Open the <Link href="/crafting">Crafting Calculator</Link> to find profitable crafts
          </li>
        </ol>
      </div>
    </section>
  );
}
