import { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequestBody } from './validation';

function makeRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

const TestSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe('validateRequestBody', () => {
  it('returns parsed data for valid input', async () => {
    const req = makeRequest(JSON.stringify({ name: 'Alice', age: 30 }));
    const result = await validateRequestBody(req, TestSchema);
    expect(result).toEqual({ data: { name: 'Alice', age: 30 } });
  });

  it('returns error for invalid JSON', async () => {
    const req = makeRequest('not json');
    const result = await validateRequestBody(req, TestSchema);
    expect(result).toEqual({ error: 'Invalid JSON', status: 400 });
  });

  it('returns descriptive error for schema violation', async () => {
    const req = makeRequest(JSON.stringify({ name: '', age: -1 }));
    const result = await validateRequestBody(req, TestSchema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns error when required fields are missing', async () => {
    const req = makeRequest(JSON.stringify({}));
    const result = await validateRequestBody(req, TestSchema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
    }
  });

  it('returns error for wrong types', async () => {
    const req = makeRequest(JSON.stringify({ name: 123, age: 'not a number' }));
    const result = await validateRequestBody(req, TestSchema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
    }
  });
});
