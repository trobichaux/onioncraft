import { calculateProfit, computeCraftingCost, buildProfitResult } from '@/lib/profitCalc';
import type { RecipeNode } from '@/lib/recipeTree';

// ---------------------------------------------------------------------------
// calculateProfit — TP fee formula
// ---------------------------------------------------------------------------

describe('calculateProfit', () => {
  it('computes correct fees for sell price 100c', () => {
    const result = calculateProfit(100, 0);
    expect(result.listingFee).toBe(5); // ceil(100 * 0.05) = 5
    expect(result.exchangeFee).toBe(10); // ceil(100 * 0.10) = 10
    expect(result.profit).toBe(85); // 100 - 5 - 10 - 0
  });

  it('computes correct fees for sell price 1c (minimum rounding)', () => {
    const result = calculateProfit(1, 0);
    expect(result.listingFee).toBe(1); // ceil(1 * 0.05) = ceil(0.05) = 1
    expect(result.exchangeFee).toBe(1); // ceil(1 * 0.10) = ceil(0.10) = 1
    expect(result.profit).toBe(-1); // 1 - 1 - 1 - 0 = -1
  });

  it('computes correct fees for sell price 3c (ceil rounding)', () => {
    const result = calculateProfit(3, 0);
    expect(result.listingFee).toBe(1); // ceil(3 * 0.05) = ceil(0.15) = 1
    expect(result.exchangeFee).toBe(1); // ceil(3 * 0.10) = ceil(0.30) = 1
    expect(result.profit).toBe(1); // 3 - 1 - 1 - 0 = 1
  });

  it('subtracts crafting cost from profit', () => {
    const result = calculateProfit(100, 50);
    expect(result.listingFee).toBe(5);
    expect(result.exchangeFee).toBe(10);
    expect(result.profit).toBe(35); // 100 - 5 - 10 - 50 = 35
  });

  it('shows that 0.85 * sellPrice gives WRONG answer for certain values', () => {
    // For sellPrice = 1:
    // Correct: profit = 1 - ceil(0.05) - ceil(0.10) = 1 - 1 - 1 = -1
    // Wrong (0.85): floor(1 * 0.85) = 0, so profit would be 0 (WRONG)
    const correct = calculateProfit(1, 0);
    const wrongApproach = Math.floor(1 * 0.85);
    expect(correct.profit).toBe(-1);
    expect(wrongApproach).toBe(0);
    expect(correct.profit).not.toBe(wrongApproach);

    // For sellPrice = 3:
    // Correct: 3 - 1 - 1 = 1
    // Wrong (0.85): floor(3 * 0.85) = floor(2.55) = 2
    const correct3 = calculateProfit(3, 0);
    const wrongApproach3 = Math.floor(3 * 0.85);
    expect(correct3.profit).toBe(1);
    expect(wrongApproach3).toBe(2);
    expect(correct3.profit).not.toBe(wrongApproach3);
  });

  it('handles zero sell price', () => {
    const result = calculateProfit(0, 10);
    expect(result.listingFee).toBe(0);
    expect(result.exchangeFee).toBe(0);
    expect(result.profit).toBe(-10);
  });

  it('handles large sell prices', () => {
    const result = calculateProfit(100000, 50000);
    expect(result.listingFee).toBe(5000); // ceil(100000 * 0.05)
    expect(result.exchangeFee).toBe(10000); // ceil(100000 * 0.10)
    expect(result.profit).toBe(35000); // 100000 - 5000 - 10000 - 50000
  });
});

// ---------------------------------------------------------------------------
// computeCraftingCost
// ---------------------------------------------------------------------------

describe('computeCraftingCost', () => {
  it('computes cost from leaf node buy prices', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Product',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 1,
          itemName: 'Mat A',
          count: 10,
          craftable: false,
          purchasable: true,
          ingredients: [],
        },
        {
          itemId: 2,
          itemName: 'Mat B',
          count: 5,
          craftable: false,
          purchasable: true,
          ingredients: [],
        },
      ],
    };
    const prices = new Map<number, { buyPrice: number; sellPrice: number }>([
      [1, { buyPrice: 100, sellPrice: 120 }],
      [2, { buyPrice: 200, sellPrice: 250 }],
    ]);
    const inventory = new Map<number, number>();

    const cost = computeCraftingCost(tree, prices, inventory);
    // 10 * 100 + 5 * 200 = 1000 + 1000 = 2000
    expect(cost).toBe(2000);
  });

  it('subtracts inventory from needed quantity', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Product',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 1,
          itemName: 'Mat A',
          count: 10,
          craftable: false,
          purchasable: true,
          ingredients: [],
        },
      ],
    };
    const prices = new Map([[1, { buyPrice: 100, sellPrice: 120 }]]);
    const inventory = new Map([[1, 3]]);

    const cost = computeCraftingCost(tree, prices, inventory);
    // need 10, have 3, buy 7 × 100 = 700
    expect(cost).toBe(700);
  });

  it('returns 0 cost for AccountBound leaf even without price', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Product',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 51,
          itemName: 'Bound Mat',
          count: 5,
          craftable: false,
          purchasable: false, // AccountBound
          ingredients: [],
        },
      ],
    };
    const prices = new Map<number, { buyPrice: number; sellPrice: number }>();
    const inventory = new Map<number, number>();

    const cost = computeCraftingCost(tree, prices, inventory);
    expect(cost).toBe(0);
  });

  it('computes cost recursively for nested trees', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Final',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 50,
          itemName: 'Intermediate',
          count: 2,
          craftable: true,
          purchasable: true,
          ingredients: [
            {
              itemId: 1,
              itemName: 'Raw',
              count: 10,
              craftable: false,
              purchasable: true,
              ingredients: [],
            },
          ],
        },
      ],
    };
    const prices = new Map([[1, { buyPrice: 5, sellPrice: 10 }]]);
    const inventory = new Map<number, number>();

    const cost = computeCraftingCost(tree, prices, inventory);
    expect(cost).toBe(50); // 10 × 5
  });

  it('does not exceed inventory (never negative needed)', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Product',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 1,
          itemName: 'Mat',
          count: 5,
          craftable: false,
          purchasable: true,
          ingredients: [],
        },
      ],
    };
    const prices = new Map([[1, { buyPrice: 100, sellPrice: 120 }]]);
    const inventory = new Map([[1, 999]]);

    const cost = computeCraftingCost(tree, prices, inventory);
    expect(cost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildProfitResult
// ---------------------------------------------------------------------------

describe('buildProfitResult', () => {
  it('builds a complete profit result', () => {
    const tree: RecipeNode = {
      itemId: 100,
      itemName: 'Product',
      count: 1,
      craftable: true,
      purchasable: true,
      ingredients: [
        {
          itemId: 1,
          itemName: 'Mat',
          count: 10,
          craftable: false,
          purchasable: true,
          ingredients: [],
        },
      ],
    };
    const prices = new Map([
      [100, { buyPrice: 0, sellPrice: 1000 }],
      [1, { buyPrice: 50, sellPrice: 60 }],
    ]);
    const inventory = new Map<number, number>();

    const result = buildProfitResult(tree, prices, inventory);

    expect(result.itemId).toBe(100);
    expect(result.itemName).toBe('Product');
    expect(result.sellPrice).toBe(1000);
    expect(result.craftingCost).toBe(500); // 10 * 50
    expect(result.listingFee).toBe(50); // ceil(1000 * 0.05)
    expect(result.exchangeFee).toBe(100); // ceil(1000 * 0.10)
    expect(result.profit).toBe(350); // 1000 - 50 - 100 - 500
    expect(result.roi).toBe(70); // (350/500) * 100
  });
});
