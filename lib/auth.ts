import { NextRequest, NextResponse } from 'next/server';

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
 * that SWA injects after authentication. Returns null when no valid
 * auth is present — callers MUST check and return 401.
 */
export function getRequestUser(req: NextRequest): User | null {
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
      // Malformed header — reject
    }
  }

  return null;
}

/**
 * Require an authenticated user or return a 401 response.
 * Use in route handlers:
 *   const user = requireUser(req);
 *   if (user instanceof NextResponse) return user;
 */
export function requireUser(req: NextRequest): User | NextResponse {
  const user = getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

/**
 * Type guard: true when requireUser returned a real User (not a 401 response).
 */
export function isUser(result: User | NextResponse): result is User {
  return !(result instanceof NextResponse);
}

/**
 * Encode a client principal for testing purposes.
 */
export function _encodeClientPrincipal(principal: ClientPrincipal): string {
  return Buffer.from(JSON.stringify(principal)).toString('base64');
}
