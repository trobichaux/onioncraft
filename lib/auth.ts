import { NextRequest } from 'next/server';

export interface User {
  id: string;
  name: string;
}

/**
 * Extract the authenticated user from the incoming request.
 *
 * This is the SINGLE auth seam for the entire application.
 * Every API route MUST call this function — never bypass it.
 * Multi-user support = swap this one function's implementation.
 *
 * Future: integrate Azure AD B2C, NextAuth, or SWA built-in auth.
 * The SWA `/.auth/me` endpoint provides `clientPrincipal` which
 * can be used here once authentication is configured.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRequestUser(req: NextRequest): User {
  // TODO: Replace with real auth (Azure AD B2C, NextAuth, SWA built-in auth)
  return { id: 'default', name: 'You' };
}
