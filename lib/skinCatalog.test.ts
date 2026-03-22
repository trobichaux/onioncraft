import { categorizeAcquisition, computeUnownedSkins, applyPriorityRules } from './skinCatalog';
import type { SkinEntry } from './skinCatalog';

// ---------------------------------------------------------------------------
// categorizeAcquisition
// ---------------------------------------------------------------------------

describe('categorizeAcquisition', () => {
  const empty = new Set<number>();
  const emptyMap = new Map<number, { method: string; notes?: string }>();

  it('returns trading_post when skin has a TP listing', () => {
    expect(categorizeAcquisition(1, true, empty, empty, emptyMap)).toBe('trading_post');
  });

  it('returns achievement when skin is an achievement reward', () => {
    const achievements = new Set([42]);
    expect(categorizeAcquisition(42, false, achievements, empty, emptyMap)).toBe('achievement');
  });

  it('returns direct_buy when skin is sold by a vendor', () => {
    const vendors = new Set([99]);
    expect(categorizeAcquisition(99, false, empty, vendors, emptyMap)).toBe('direct_buy');
  });

  it('returns gem_store when skin source method is gem_store', () => {
    const sources = new Map([[10, { method: 'gem_store', notes: 'Exclusive' }]]);
    expect(categorizeAcquisition(10, false, empty, empty, sources)).toBe('gem_store');
  });

  it('returns content_drop when skin source method is content_drop', () => {
    const sources = new Map([[20, { method: 'content_drop' }]]);
    expect(categorizeAcquisition(20, false, empty, empty, sources)).toBe('content_drop');
  });

  it('returns unknown when no match is found', () => {
    expect(categorizeAcquisition(999, false, empty, empty, emptyMap)).toBe('unknown');
  });

  it('prioritizes trading_post over achievement', () => {
    const achievements = new Set([5]);
    expect(categorizeAcquisition(5, true, achievements, empty, emptyMap)).toBe('trading_post');
  });
});

// ---------------------------------------------------------------------------
// computeUnownedSkins
// ---------------------------------------------------------------------------

describe('computeUnownedSkins', () => {
  const details = new Map([
    [1, { name: 'Alpha Skin', type: 'Armor', icon: 'https://img/1.png', rarity: 'Rare' }],
    [2, { name: 'Beta Skin', type: 'Weapon', icon: 'https://img/2.png', rarity: 'Exotic' }],
    [3, { name: 'Gamma Skin', type: 'Back', icon: 'https://img/3.png' }],
  ]);

  const empty = new Set<number>();
  const emptyMap = new Map<number, { method: string; notes?: string }>();
  const emptyPrices = new Map<number, number>();

  it('filters out owned skins', () => {
    const result = computeUnownedSkins(
      [1, 2, 3],
      [1],
      details,
      emptyPrices,
      empty,
      empty,
      emptyMap
    );
    expect(result.map((s) => s.skinId)).toEqual([2, 3]);
  });

  it('generates wiki URLs from skin name', () => {
    const result = computeUnownedSkins([1, 2], [], details, emptyPrices, empty, empty, emptyMap);
    expect(result[0].wikiUrl).toBe('https://wiki.guildwars2.com/wiki/Alpha_Skin');
    expect(result[1].wikiUrl).toBe('https://wiki.guildwars2.com/wiki/Beta_Skin');
  });

  it('includes TP price when available', () => {
    const prices = new Map([[2, 12345]]);
    const result = computeUnownedSkins([2], [], details, prices, empty, empty, emptyMap);
    expect(result[0].tpPrice).toBe(12345);
    expect(result[0].method).toBe('trading_post');
  });

  it('skips skins with no cached details', () => {
    const result = computeUnownedSkins([1, 999], [], details, emptyPrices, empty, empty, emptyMap);
    expect(result).toHaveLength(1);
    expect(result[0].skinId).toBe(1);
  });

  it('includes notes from skin sources', () => {
    const sources = new Map([[1, { method: 'gem_store', notes: 'Outfit only' }]]);
    const result = computeUnownedSkins([1], [], details, emptyPrices, empty, empty, sources);
    expect(result[0].notes).toBe('Outfit only');
  });
});

// ---------------------------------------------------------------------------
// applyPriorityRules
// ---------------------------------------------------------------------------

describe('applyPriorityRules', () => {
  const skins: SkinEntry[] = [
    {
      skinId: 1,
      name: 'Charlie',
      type: 'Armor',
      icon: 'https://img/1.png',
      method: 'trading_post',
      wikiUrl: 'https://wiki.guildwars2.com/wiki/Charlie',
    },
    {
      skinId: 2,
      name: 'Alpha',
      type: 'Weapon',
      icon: 'https://img/2.png',
      method: 'unknown',
      wikiUrl: 'https://wiki.guildwars2.com/wiki/Alpha',
    },
    {
      skinId: 3,
      name: 'Bravo',
      type: 'Armor',
      rarity: 'Legendary',
      icon: 'https://img/3.png',
      method: 'achievement',
      wikiUrl: 'https://wiki.guildwars2.com/wiki/Bravo',
    },
  ];

  it('sorts by weighted score descending', () => {
    const rules = [{ field: 'method' as const, value: 'trading_post', weight: 80 }];
    const result = applyPriorityRules(skins, rules);
    expect(result[0].name).toBe('Charlie'); // score 80
  });

  it('uses name as tiebreaker when scores are equal', () => {
    const rules = [{ field: 'type' as const, value: 'Armor', weight: 50 }];
    const result = applyPriorityRules(skins, rules);
    // Bravo (50, Armor) and Charlie (50, Armor) tie → Bravo first alphabetically
    expect(result[0].name).toBe('Bravo');
    expect(result[1].name).toBe('Charlie');
    // Alpha (0) last
    expect(result[2].name).toBe('Alpha');
  });

  it('returns alphabetical order when no rules are provided', () => {
    const result = applyPriorityRules(skins, []);
    expect(result.map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('accumulates scores from multiple matching rules', () => {
    const rules = [
      { field: 'type' as const, value: 'Armor', weight: 30 },
      { field: 'method' as const, value: 'achievement', weight: 50 },
    ];
    const result = applyPriorityRules(skins, rules);
    // Bravo: Armor(30) + achievement(50) = 80
    // Charlie: Armor(30) + trading_post(0) = 30
    // Alpha: Weapon(0) + unknown(0) = 0
    expect(result[0].name).toBe('Bravo');
    expect(result[1].name).toBe('Charlie');
    expect(result[2].name).toBe('Alpha');
  });

  it('does not mutate the original array', () => {
    const original = [...skins];
    applyPriorityRules(skins, [{ field: 'type' as const, value: 'Armor', weight: 50 }]);
    expect(skins).toEqual(original);
  });
});
