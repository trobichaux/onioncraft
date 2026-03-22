import {
  categorizeAcquisition,
  computeUnownedSkins,
  applyPriorityRules,
  matchVendorGroup,
} from './skinCatalog';
import type { SkinEntry, AcquisitionData, VendorGroup } from './skinCatalog';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const emptyAcqMap = new Map<number, AcquisitionData>();
const emptyVendorGroups: VendorGroup[] = [];
const emptySourceMap = new Map<number, { method: string; notes?: string }>();

const dungeonVendorGroups: VendorGroup[] = [
  {
    id: 'ac',
    name: 'Ascalonian Catacombs',
    method: 'direct_buy',
    currency: 'ac_token',
    currencyLabel: 'Tears of Ascalon',
    vendorName: 'Dungeon Merchant',
    namePatterns: ['Ascalonian Performer', 'Ascalonian Sentry', 'Royal Ascalonian'],
    tokenCosts: {
      head: 180,
      shoulders: 120,
      chest: 330,
      gloves: 180,
      legs: 270,
      boots: 180,
      weapon: 390,
    },
    notes: 'AC dungeon tokens',
  },
];

// ---------------------------------------------------------------------------
// matchVendorGroup
// ---------------------------------------------------------------------------

describe('matchVendorGroup', () => {
  it('matches skin names that contain a vendor group pattern', () => {
    const result = matchVendorGroup('Ascalonian Performer Gloves', dungeonVendorGroups);
    expect(result).toBeDefined();
    expect(result!.id).toBe('ac');
  });

  it('returns undefined when no pattern matches', () => {
    const result = matchVendorGroup('Random Exotic Sword', dungeonVendorGroups);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// categorizeAcquisition
// ---------------------------------------------------------------------------

describe('categorizeAcquisition', () => {
  it('returns method from acquisitionMap when skin ID is present', () => {
    const acqMap = new Map<number, AcquisitionData>([[42, { skinId: 42, method: 'achievement' }]]);
    expect(categorizeAcquisition(42, acqMap, emptySourceMap)).toBe('achievement');
  });

  it('returns gem_store when skin source method is gem_store', () => {
    const sources = new Map([[10, { method: 'gem_store', notes: 'Exclusive' }]]);
    expect(categorizeAcquisition(10, emptyAcqMap, sources)).toBe('gem_store');
  });

  it('returns content_drop when skin source method is content_drop', () => {
    const sources = new Map([[20, { method: 'content_drop' }]]);
    expect(categorizeAcquisition(20, emptyAcqMap, sources)).toBe('content_drop');
  });

  it('returns direct_buy when skin source method is direct_buy', () => {
    const sources = new Map([[30, { method: 'direct_buy' }]]);
    expect(categorizeAcquisition(30, emptyAcqMap, sources)).toBe('direct_buy');
  });

  it('returns unknown when no match is found', () => {
    expect(categorizeAcquisition(999, emptyAcqMap, emptySourceMap)).toBe('unknown');
  });

  it('prioritizes acquisitionMap over skinSources', () => {
    const acqMap = new Map<number, AcquisitionData>([[5, { skinId: 5, method: 'direct_buy' }]]);
    const sources = new Map([[5, { method: 'gem_store' }]]);
    expect(categorizeAcquisition(5, acqMap, sources)).toBe('direct_buy');
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

  it('filters out owned skins', () => {
    const result = computeUnownedSkins(
      [1, 2, 3],
      [1],
      details,
      emptyAcqMap,
      emptyVendorGroups,
      emptySourceMap
    );
    expect(result.map((s) => s.skinId)).toEqual([2, 3]);
  });

  it('generates wiki URLs from skin name', () => {
    const result = computeUnownedSkins(
      [1, 2],
      [],
      details,
      emptyAcqMap,
      emptyVendorGroups,
      emptySourceMap
    );
    expect(result[0].wikiUrl).toBe('https://wiki.guildwars2.com/wiki/Alpha_Skin');
    expect(result[1].wikiUrl).toBe('https://wiki.guildwars2.com/wiki/Beta_Skin');
  });

  it('populates vendor cost and currency from acquisition data', () => {
    const acqMap = new Map<number, AcquisitionData>([
      [
        2,
        {
          skinId: 2,
          method: 'direct_buy',
          cost: 390,
          currency: 'ac_token',
          currencyLabel: 'Tears of Ascalon',
          vendorName: 'Dungeon Merchant',
        },
      ],
    ]);
    const result = computeUnownedSkins([2], [], details, acqMap, emptyVendorGroups, emptySourceMap);
    expect(result[0].vendorCost).toBe(390);
    expect(result[0].vendorCurrency).toBe('Tears of Ascalon');
    expect(result[0].vendorName).toBe('Dungeon Merchant');
    expect(result[0].method).toBe('direct_buy');
  });

  it('matches dungeon skins by name pattern and assigns vendor cost', () => {
    const dungeonDetails = new Map([
      [
        10,
        {
          name: 'Ascalonian Performer Coat',
          type: 'Armor',
          icon: 'https://img/10.png',
          rarity: 'Exotic',
        },
      ],
    ]);
    const result = computeUnownedSkins(
      [10],
      [],
      dungeonDetails,
      emptyAcqMap,
      dungeonVendorGroups,
      emptySourceMap
    );
    expect(result[0].method).toBe('direct_buy');
    expect(result[0].vendorCost).toBe(330); // chest cost estimate for armor
    expect(result[0].vendorCurrency).toBe('Tears of Ascalon');
    expect(result[0].vendorName).toBe('Dungeon Merchant');
  });

  it('matches weapon skins by name pattern with weapon token cost', () => {
    const weaponDetails = new Map([
      [
        11,
        {
          name: 'Royal Ascalonian Greatsword',
          type: 'Weapon',
          icon: 'https://img/11.png',
          rarity: 'Exotic',
        },
      ],
    ]);
    const result = computeUnownedSkins(
      [11],
      [],
      weaponDetails,
      emptyAcqMap,
      dungeonVendorGroups,
      emptySourceMap
    );
    expect(result[0].vendorCost).toBe(390); // weapon cost
    expect(result[0].vendorCurrency).toBe('Tears of Ascalon');
  });

  it('skips skins with no cached details', () => {
    const result = computeUnownedSkins(
      [1, 999],
      [],
      details,
      emptyAcqMap,
      emptyVendorGroups,
      emptySourceMap
    );
    expect(result).toHaveLength(1);
    expect(result[0].skinId).toBe(1);
  });

  it('includes notes from skin sources', () => {
    const sources = new Map([[1, { method: 'gem_store', notes: 'Outfit only' }]]);
    const result = computeUnownedSkins([1], [], details, emptyAcqMap, emptyVendorGroups, sources);
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
