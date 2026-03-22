import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetGoals = jest.fn();
const mockPutGoal = jest.fn();
const mockDeleteGoal = jest.fn();

jest.mock('@/lib/tableStorage', () => ({
  getGoals: (...args: unknown[]) => mockGetGoals(...args),
  putGoal: (...args: unknown[]) => mockPutGoal(...args),
  deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
}));

jest.mock('@/lib/auth', () => ({
  requireUser: () => ({ id: 'default', name: 'You' }),
  isUser: () => true,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest('http://localhost:3000/api/v1/crafting/goals', init);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/crafting/goals', () => {
  it('returns empty goals array when none exist', async () => {
    mockGetGoals.mockResolvedValue([]);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ goals: [] });
  });

  it('returns parsed goals', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-123',
        value: JSON.stringify({ itemId: 123, itemName: 'Test Item' }),
      },
    ]);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goals).toHaveLength(1);
    expect(json.goals[0].goalId).toBe('goal-123');
    expect(json.goals[0].itemId).toBe(123);
    expect(json.goals[0].itemName).toBe('Test Item');
  });

  it('handles malformed goal values gracefully', async () => {
    mockGetGoals.mockResolvedValue([
      {
        goalId: 'goal-bad',
        value: JSON.stringify({ itemId: 456, itemName: 'Good Item' }),
      },
    ]);

    const res = await GET(makeRequest('GET'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.goals).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/v1/crafting/goals', () => {
  it('creates a new goal', async () => {
    mockPutGoal.mockResolvedValue(undefined);

    const res = await POST(makeRequest('POST', { itemId: 123, itemName: 'Sword' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.goalId).toBe('goal-123');
    expect(mockPutGoal).toHaveBeenCalledWith(
      'default',
      'goal-123',
      JSON.stringify({ itemId: 123, itemName: 'Sword' })
    );
  });

  it('rejects missing itemId', async () => {
    const res = await POST(makeRequest('POST', { itemName: 'Sword' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects missing itemName', async () => {
    const res = await POST(makeRequest('POST', { itemId: 123 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects negative itemId', async () => {
    const res = await POST(makeRequest('POST', { itemId: -1, itemName: 'Bad' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects empty itemName', async () => {
    const res = await POST(makeRequest('POST', { itemId: 1, itemName: '' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects invalid JSON body', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/crafting/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/crafting/goals', () => {
  it('deletes a goal', async () => {
    mockDeleteGoal.mockResolvedValue(undefined);

    const res = await DELETE(makeRequest('DELETE', { goalId: 'goal-123' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockDeleteGoal).toHaveBeenCalledWith('default', 'goal-123');
  });

  it('rejects missing goalId', async () => {
    const res = await DELETE(makeRequest('DELETE', {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects empty goalId', async () => {
    const res = await DELETE(makeRequest('DELETE', { goalId: '' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});
