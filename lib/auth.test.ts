import { getRequestUser } from './auth';
import { NextRequest } from 'next/server';

describe('getRequestUser', () => {
  it('returns the default user stub', () => {
    const req = new NextRequest('http://localhost:3000/api/test');
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
