import {
  ExclusionListSchema,
  PriorityRulesSchema,
  ApiKeySchema,
  CharacterFilterSchema,
  PriceCacheEntitySchema,
  SkinCacheEntitySchema,
  GoalProgressSchema,
} from './schemas';
import type {
  ExclusionList,
  PriorityRules,
  ApiKey,
  CharacterFilter,
  PriceCacheEntity,
  SkinCacheEntity,
  GoalProgress,
} from './schemas';

// ---------------------------------------------------------------------------
// ExclusionListSchema
// ---------------------------------------------------------------------------
describe('ExclusionListSchema', () => {
  it('accepts a valid array of positive integers', () => {
    const data: ExclusionList = [1, 42, 9999];
    expect(ExclusionListSchema.parse(data)).toEqual(data);
  });

  it('accepts an empty array', () => {
    expect(ExclusionListSchema.parse([])).toEqual([]);
  });

  it('rejects non-integer numbers', () => {
    expect(() => ExclusionListSchema.parse([1.5])).toThrow();
  });

  it('rejects zero', () => {
    expect(() => ExclusionListSchema.parse([0])).toThrow();
  });

  it('rejects negative numbers', () => {
    expect(() => ExclusionListSchema.parse([-1])).toThrow();
  });

  it('rejects strings in the array', () => {
    expect(() => ExclusionListSchema.parse(['abc'])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PriorityRulesSchema
// ---------------------------------------------------------------------------
describe('PriorityRulesSchema', () => {
  it('accepts valid priority rules', () => {
    const data: PriorityRules = [
      { field: 'type', value: 'Weapon', weight: 50 },
      { field: 'rarity', value: 'Exotic', weight: 80 },
    ];
    expect(PriorityRulesSchema.parse(data)).toEqual(data);
  });

  it('accepts an empty array', () => {
    expect(PriorityRulesSchema.parse([])).toEqual([]);
  });

  it('rejects invalid field enum', () => {
    expect(() =>
      PriorityRulesSchema.parse([{ field: 'invalid', value: 'x', weight: 10 }])
    ).toThrow();
  });

  it('rejects weight above 100', () => {
    expect(() => PriorityRulesSchema.parse([{ field: 'type', value: 'x', weight: 101 }])).toThrow();
  });

  it('rejects weight below 0', () => {
    expect(() => PriorityRulesSchema.parse([{ field: 'type', value: 'x', weight: -1 }])).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => PriorityRulesSchema.parse([{ field: 'type' }])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ApiKeySchema
// ---------------------------------------------------------------------------
describe('ApiKeySchema', () => {
  it('accepts a valid API key object', () => {
    const data: ApiKey = {
      key: 'ABCD-1234',
      permissions: ['account', 'inventories'],
      validatedAt: '2024-01-01T00:00:00Z',
    };
    expect(ApiKeySchema.parse(data)).toEqual(data);
  });

  it('rejects empty key', () => {
    expect(() =>
      ApiKeySchema.parse({
        key: '',
        permissions: [],
        validatedAt: '2024-01-01T00:00:00Z',
      })
    ).toThrow();
  });

  it('rejects invalid datetime', () => {
    expect(() =>
      ApiKeySchema.parse({
        key: 'k',
        permissions: [],
        validatedAt: 'not-a-date',
      })
    ).toThrow();
  });

  it('rejects missing permissions', () => {
    expect(() => ApiKeySchema.parse({ key: 'k', validatedAt: '2024-01-01T00:00:00Z' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CharacterFilterSchema
// ---------------------------------------------------------------------------
describe('CharacterFilterSchema', () => {
  it('accepts valid character filter', () => {
    const data: CharacterFilter = {
      enabled: true,
      characters: ['Warrior', 'Mesmer'],
    };
    expect(CharacterFilterSchema.parse(data)).toEqual(data);
  });

  it('rejects missing enabled field', () => {
    expect(() => CharacterFilterSchema.parse({ characters: [] })).toThrow();
  });

  it('rejects non-boolean enabled', () => {
    expect(() => CharacterFilterSchema.parse({ enabled: 'yes', characters: [] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PriceCacheEntitySchema
// ---------------------------------------------------------------------------
describe('PriceCacheEntitySchema', () => {
  it('accepts valid price cache entity', () => {
    const data: PriceCacheEntity = {
      buyPrice: 100,
      sellPrice: 200,
      cachedAt: '2024-06-15T12:00:00Z',
    };
    expect(PriceCacheEntitySchema.parse(data)).toEqual(data);
  });

  it('accepts zero prices', () => {
    const data: PriceCacheEntity = {
      buyPrice: 0,
      sellPrice: 0,
      cachedAt: '2024-06-15T12:00:00Z',
    };
    expect(PriceCacheEntitySchema.parse(data)).toEqual(data);
  });

  it('rejects negative prices', () => {
    expect(() =>
      PriceCacheEntitySchema.parse({
        buyPrice: -1,
        sellPrice: 0,
        cachedAt: '2024-06-15T12:00:00Z',
      })
    ).toThrow();
  });

  it('rejects non-integer prices', () => {
    expect(() =>
      PriceCacheEntitySchema.parse({
        buyPrice: 1.5,
        sellPrice: 0,
        cachedAt: '2024-06-15T12:00:00Z',
      })
    ).toThrow();
  });

  it('rejects invalid cachedAt', () => {
    expect(() =>
      PriceCacheEntitySchema.parse({
        buyPrice: 0,
        sellPrice: 0,
        cachedAt: 'yesterday',
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SkinCacheEntitySchema
// ---------------------------------------------------------------------------
describe('SkinCacheEntitySchema', () => {
  it('accepts valid skin cache entity', () => {
    const data: SkinCacheEntity = {
      name: 'Sunrise',
      type: 'Weapon',
      icon: 'https://render.guildwars2.com/icon.png',
      cachedAt: '2024-06-15T12:00:00Z',
    };
    expect(SkinCacheEntitySchema.parse(data)).toEqual(data);
  });

  it('rejects invalid icon URL', () => {
    expect(() =>
      SkinCacheEntitySchema.parse({
        name: 'Sunrise',
        type: 'Weapon',
        icon: 'not-a-url',
        cachedAt: '2024-06-15T12:00:00Z',
      })
    ).toThrow();
  });

  it('rejects missing name', () => {
    expect(() =>
      SkinCacheEntitySchema.parse({
        type: 'Weapon',
        icon: 'https://example.com/icon.png',
        cachedAt: '2024-06-15T12:00:00Z',
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GoalProgressSchema
// ---------------------------------------------------------------------------
describe('GoalProgressSchema', () => {
  it('accepts valid goal progress', () => {
    const data: GoalProgress = {
      itemId: 12345,
      itemName: 'Sunrise',
      resolvedAt: '2024-06-15T12:00:00Z',
    };
    expect(GoalProgressSchema.parse(data)).toEqual(data);
  });

  it('accepts goal without optional fields', () => {
    const data: GoalProgress = {
      itemId: 1,
      itemName: 'Test',
    };
    expect(GoalProgressSchema.parse(data)).toEqual(data);
  });

  it('accepts goal with resolvedTree', () => {
    const data: GoalProgress = {
      itemId: 1,
      itemName: 'Test',
      resolvedTree: { children: [] },
    };
    expect(GoalProgressSchema.parse(data)).toEqual(data);
  });

  it('rejects non-positive itemId', () => {
    expect(() => GoalProgressSchema.parse({ itemId: 0, itemName: 'Test' })).toThrow();
  });

  it('rejects non-integer itemId', () => {
    expect(() => GoalProgressSchema.parse({ itemId: 1.5, itemName: 'Test' })).toThrow();
  });

  it('rejects missing itemName', () => {
    expect(() => GoalProgressSchema.parse({ itemId: 1 })).toThrow();
  });
});
