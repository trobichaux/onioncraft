import { NextRequest } from 'next/server';

export interface User {
  id: string;
  name: string;
}

/**
 * SWA client principal decoded from the `x-ms-client-principal` header.
 * @see https://learn.microsoft.com/en-us/azure/static-web-apps/user-information
 */
interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/**
 * Extract the authenticated user from the incoming request.
 *
 * This is the SINGLE auth seam for the entire application.
 * Every API route MUST call this function — never bypass it.
 *
 * In production (Azure SWA), reads the `x-ms-client-principal` header
 * that SWA injects after authentication. In local dev without SWA CLI,
 * falls back to a default user stub.
 */
export function getRequestUser(req: NextRequest): User {
  const header = req.headers.get('x-ms-client-principal');

  if (header) {
    try {
      const decoded = Buffer.from(header, 'base64').toString('utf-8');
      const principal: ClientPrincipal = JSON.parse(decoded);

      if (principal.userId) {
        return {
          id: principal.userId,
          name: principal.userDetails || principal.userId,
        };
      }
    } catch {
      // Malformed header — fall through to default
    }
  }

  // Local dev fallback (no SWA auth header present)
  return { id: 'default', name: 'You' };
}

/**
 * Encode a client principal for testing purposes.
 */
export function _encodeClientPrincipal(principal: ClientPrincipal): string {
  return Buffer.from(JSON.stringify(principal)).toString('base64');
}
