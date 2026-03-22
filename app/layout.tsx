import type { Metadata } from 'next';
import AuthStatus from './AuthStatus';
import './globals.css';

export const metadata: Metadata = {
  title: 'OnionCraft — GW2 Crafting Profit Calculator',
  description:
    'Guild Wars 2 crafting profit calculator and skin collection tracker. ' +
    'Find profitable crafts, track legendary progress, and rank unowned skins.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header role="banner">
          <nav aria-label="Main navigation">
            <a href="/" className="site-title">
              OnionCraft
            </a>
            <AuthStatus />
          </nav>
        </header>

        <main id="main-content" role="main" tabIndex={-1}>
          {children}
        </main>

        <footer role="contentinfo">
          <p className="legal-disclaimer">
            OnionCraft is an unofficial fan project. Not affiliated with or endorsed by ArenaNet or
            NCSOFT. &copy;2010&ndash;{new Date().getFullYear()} ArenaNet, LLC. Guild Wars 2 and all
            related marks are trademarks of NCSOFT Corporation.
          </p>
        </footer>
      </body>
    </html>
  );
}
