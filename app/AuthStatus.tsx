'use client';

import { useEffect, useState } from 'react';

interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export default function AuthStatus() {
  const [user, setUser] = useState<ClientPrincipal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/.auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.clientPrincipal) {
          setUser(data.clientPrincipal);
        }
      })
      .catch(() => {
        // Not running behind SWA — local dev without auth
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <a href="/.auth/login/github" className="auth-link">
        Sign in with GitHub
      </a>
    );
  }

  return (
    <span className="auth-status">
      <span className="auth-user">{user.userDetails}</span>
      <a href="/.auth/logout" className="auth-link">
        Sign out
      </a>
    </span>
  );
}
