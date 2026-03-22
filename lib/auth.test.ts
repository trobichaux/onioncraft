import { getRequestUser, _encodeClientPrincipal } from './auth';
import { NextRequest } from 'next/server';

describe('getRequestUser', () => {
  it('returns default user when no auth header present', () => {
    const req = new NextRequest('http://localhost:3000/api/test');
    const user = getRequestUser(req);

    expect(user).toEqual({ id: 'default', name: 'You' });
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

    expect(user.id).toBe('abc123');
    expect(user.name).toBe('testuser');
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

    expect(user.id).toBe('abc123');
    expect(user.name).toBe('abc123');
  });

  it('falls back to default on malformed header', () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-ms-client-principal': 'not-valid-base64!!!' },
    });
    const user = getRequestUser(req);

    expect(user).toEqual({ id: 'default', name: 'You' });
  });

  it('falls back to default when userId is empty in principal', () => {
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

    expect(user).toEqual({ id: 'default', name: 'You' });
  });

  it('returns consistent user across multiple calls', () => {
    const req = new NextRequest('http://localhost:3000/api/test');
    const user1 = getRequestUser(req);
    const user2 = getRequestUser(req);

    expect(user1.id).toBe(user2.id);
  });
});
