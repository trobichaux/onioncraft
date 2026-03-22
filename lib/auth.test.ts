import { getRequestUser, _encodeClientPrincipal } from './auth';
import { NextRequest } from 'next/server';

describe('getRequestUser', () => {
  it('returns null when no auth header present', () => {
    const req = new NextRequest('http://localhost:3000/api/test');
    const user = getRequestUser(req);

    expect(user).toBeNull();
  });

  it('extracts user from SWA client principal header', () => {
    const header = _encodeClientPrincipal({
      identityProvider: 'github',
      userId: 'abc123',
      userDetails: 'testuser',
      userRoles: ['authenticated', 'anonymous'],
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-ms-client-principal': header },
    });
    const user = getRequestUser(req);

    expect(user).not.toBeNull();
    expect(user!.id).toBe('abc123');
    expect(user!.name).toBe('testuser');
  });

  it('uses userId as name when userDetails is empty', () => {
    const header = _encodeClientPrincipal({
      identityProvider: 'github',
      userId: 'abc123',
      userDetails: '',
      userRoles: ['authenticated'],
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-ms-client-principal': header },
    });
    const user = getRequestUser(req);

    expect(user).not.toBeNull();
    expect(user!.id).toBe('abc123');
    expect(user!.name).toBe('abc123');
  });

  it('returns null on malformed header', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-ms-client-principal': 'not-valid-base64!!!' },
    });
    const user = getRequestUser(req);

    expect(user).toBeNull();
  });

  it('returns null when userId is empty in principal', () => {
    const header = _encodeClientPrincipal({
      identityProvider: 'github',
      userId: '',
      userDetails: 'testuser',
      userRoles: ['anonymous'],
    });

    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-ms-client-principal': header },
    });
    const user = getRequestUser(req);

    expect(user).toBeNull();
  });
});
