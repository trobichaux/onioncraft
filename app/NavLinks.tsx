'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const links = [
  { href: '/crafting', label: 'Crafting' },
  { href: '/skins', label: 'Skins' },
  { href: '/settings', label: 'Settings' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="nav-links" role="list">
      {links.map(({ href, label }) => (
        <li key={href}>
          <Link
            href={href}
            className={`nav-link ${pathname === href ? 'nav-link--active' : ''}`}
            aria-current={pathname === href ? 'page' : undefined}
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
