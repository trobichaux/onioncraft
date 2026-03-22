import {
  buildRecipeTree,
  calculateOverages,
  maxCraftableFromInventory,
} from '@/lib/recipeTree';
import type { Recipe, Item } from '@/lib/recipeTree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipes(list: Recipe[]): Map<number, Recipe> {
  const map = new Map<number, Recipe>();
  for (const r of list) {
    map.set(r.outputItemId, r);
  }
  return map;
}

function makeItems(list: Item[]): Map<number, Item> {
  const map = new Map<number, Item>();
  for (const i of list) {
    map.set(i.id, i);
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildRecipeTree
// ---------------------------------------------------------------------------

describe('buildRecipeTree', () => {
  it('builds a simple 1-level recipe tree', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 100,
        outputItemCount: 1,
        disciplines: ['Weaponsmith'],
        minRating: 400,
        ingredients: [
          { itemId: 1, count: 5 },
          { itemId: 2, count: 3 },
        ],
      },
    ]);
    const items = makeItems([
      { id: 100, name: 'Sword', flags: [] },
      { id: 1, name: 'Iron Ore', flags: [] },
      { id: 2, name: 'Wood Log', flags: [] },
    ]);

    const tree = buildRecipeTree(100, recipes, items);

    expect(tree.itemId).toBe(100);
    expect(tree.itemName).toBe('Sword');
    expect(tree.craftable).toBe(true);
    expect(tree.disciplineRequired).toBe('Weaponsmith');
    expect(tree.levelRequired).toBe(400);
    expect(tree.ingredients).toHaveLength(2);
    expect(tree.ingredients[0].itemId).toBe(1);
    expect(tree.ingredients[0].count).toBe(5);
    expect(tree.ingredients[0].craftable).toBe(false);
    expect(tree.ingredients[1].itemId).toBe(2);
    expect(tree.ingredients[1].count).toBe(3);
    expect(tree.ingredients[1].craftable).toBe(false);
  });

  it('builds a nested 3-level recipe tree', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 300,
        outputItemCount: 1,
        ingredients: [{ itemId: 200, count: 2 }],
      },
      {
        outputItemId: 200,
        outputItemCount: 1,
        ingredients: [{ itemId: 100, count: 3 }],
      },
      {
        outputItemId: 100,
        outputItemCount: 1,
        ingredients: [{ itemId: 10, count: 4 }],
      },
    ]);
    const items = makeItems([
      { id: 300, name: 'Final', flags: [] },
      { id: 200, name: 'Mid', flags: [] },
      { id: 100, name: 'Sub', flags: [] },
      { id: 10, name: 'Raw', flags: [] },
    ]);

    const tree = buildRecipeTree(300, recipes, items);

    expect(tree.craftable).toBe(true);
    expect(tree.ingredients).toHaveLength(1);

    const mid = tree.ingredients[0];
    expect(mid.itemId).toBe(200);
    expect(mid.count).toBe(2);
    expect(mid.craftable).toBe(true);
    expect(mid.ingredients).toHaveLength(1);

    const sub = mid.ingredients[0];
    expect(sub.itemId).toBe(100);
    // 2 batches of Mid × 3 count per batch
    expect(sub.count).toBe(6);
    expect(sub.craftable).toBe(true);

    const raw = sub.ingredients[0];
    expect(raw.itemId).toBe(10);
    // 6 batches of Sub × 4 count per batch
    expect(raw.count).toBe(24);
    expect(raw.craftable).toBe(false);
  });

  it('treats items with no recipe as leaf nodes', () => {
    const recipes = makeRecipes([]);
    const items = makeItems([
      { id: 42, name: 'Raw Material', flags: [] },
    ]);

    const tree = buildRecipeTree(42, recipes, items);

    expect(tree.itemId).toBe(42);
    expect(tree.craftable).toBe(false);
    expect(tree.purchasable).toBe(true);
    expect(tree.ingredients).toHaveLength(0);
  });

  it('marks AccountBound items as non-purchasable', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 50,
        outputItemCount: 1,
        ingredients: [{ itemId: 51, count: 1 }],
      },
    ]);
    const items = makeItems([
      { id: 50, name: 'Crafted Item', flags: [] },
      { id: 51, name: 'Bound Material', flags: ['AccountBound'] },
    ]);

    const tree = buildRecipeTree(50, recipes, items);

    expect(tree.purchasable).toBe(true);
    expect(tree.ingredients[0].purchasable).toBe(false);
  });

  it('marks SoulBound items as non-purchasable', () => {
    const recipes = makeRecipes([]);
    const items = makeItems([
      { id: 99, name: 'Soulbound Gear', flags: ['SoulBound'] },
    ]);

    const tree = buildRecipeTree(99, recipes, items);
    expect(tree.purchasable).toBe(false);
  });

  it('handles unknown items gracefully', () => {
    const recipes = makeRecipes([]);
    const items = makeItems([]);

    const tree = buildRecipeTree(999, recipes, items);

    expect(tree.itemName).toBe('Item 999');
    expect(tree.craftable).toBe(false);
  });

  it('handles recipe with outputItemCount > 1', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 70,
        outputItemCount: 5,
        ingredients: [{ itemId: 71, count: 10 }],
      },
    ]);
    const items = makeItems([
      { id: 70, name: 'Bulk Item', flags: [] },
      { id: 71, name: 'Ingredient', flags: [] },
    ]);

    // Need 3 items → ceil(3/5)=1 batch → 10 ingredients
    const tree = buildRecipeTree(70, recipes, items, 3);
    expect(tree.ingredients[0].count).toBe(10);

    // Need 6 items → ceil(6/5)=2 batches → 20 ingredients
    const tree2 = buildRecipeTree(70, recipes, items, 6);
    expect(tree2.ingredients[0].count).toBe(20);
  });

  it('loads daily cap from craft-limits.json', () => {
    const recipes = makeRecipes([]);
    const items = makeItems([
      { id: 46742, name: 'Spool of Silk Weaving Thread', flags: [] },
    ]);

    const tree = buildRecipeTree(46742, recipes, items);
    expect(tree.dailyCap).toBe(1);
  });

  it('resolves Mystic Forge recipes from data file', () => {
    // Item 19628 (Gift of Might) has a mystic forge recipe in the data file
    const recipes = makeRecipes([]); // no standard recipes
    const items = makeItems([
      { id: 19628, name: 'Gift of Might', flags: [] },
      { id: 24294, name: 'Vicious Fang', flags: [] },
      { id: 24341, name: 'Armored Scale', flags: [] },
      { id: 24350, name: 'Ancient Bone', flags: [] },
      { id: 24356, name: 'Vicious Claw', flags: [] },
    ]);

    const tree = buildRecipeTree(19628, recipes, items);

    expect(tree.craftable).toBe(true);
    expect(tree.ingredients).toHaveLength(4);
    expect(tree.ingredients[0].itemId).toBe(24294);
    expect(tree.ingredients[0].count).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// calculateOverages
// ---------------------------------------------------------------------------

describe('calculateOverages', () => {
  it('computes overage for a single goal', () => {
    const tree = buildRecipeTree(
      100,
      makeRecipes([
        {
          outputItemId: 100,
          outputItemCount: 1,
          ingredients: [
            { itemId: 1, count: 10 },
            { itemId: 2, count: 5 },
          ],
        },
      ]),
      makeItems([
        { id: 100, name: 'Product', flags: [] },
        { id: 1, name: 'Mat A', flags: [] },
        { id: 2, name: 'Mat B', flags: [] },
      ]),
    );

    const inventory = new Map<number, number>([
      [1, 15],
      [2, 3],
    ]);

    const overages = calculateOverages([tree], inventory);

    expect(overages.get(1)).toBe(5);   // 15 - 10 = surplus of 5
    expect(overages.get(2)).toBe(-2);  // 3 - 5 = need 2 more
  });

  it('computes overages across MULTIPLE goals', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 100,
        outputItemCount: 1,
        ingredients: [
          { itemId: 1, count: 10 },
          { itemId: 2, count: 5 },
        ],
      },
      {
        outputItemId: 200,
        outputItemCount: 1,
        ingredients: [
          { itemId: 1, count: 7 },
          { itemId: 3, count: 3 },
        ],
      },
    ]);
    const items = makeItems([
      { id: 100, name: 'Product A', flags: [] },
      { id: 200, name: 'Product B', flags: [] },
      { id: 1, name: 'Shared Mat', flags: [] },
      { id: 2, name: 'Mat B', flags: [] },
      { id: 3, name: 'Mat C', flags: [] },
    ]);

    const tree1 = buildRecipeTree(100, recipes, items);
    const tree2 = buildRecipeTree(200, recipes, items);

    const inventory = new Map<number, number>([
      [1, 20],
      [2, 5],
      [3, 1],
    ]);

    const overages = calculateOverages([tree1, tree2], inventory);

    // Shared Mat: need 10 + 7 = 17, have 20 → surplus 3
    expect(overages.get(1)).toBe(3);
    // Mat B: need 5, have 5 → 0
    expect(overages.get(2)).toBe(0);
    // Mat C: need 3, have 1 → -2
    expect(overages.get(3)).toBe(-2);
  });

  it('handles empty inventory', () => {
    const tree = buildRecipeTree(
      100,
      makeRecipes([
        {
          outputItemId: 100,
          outputItemCount: 1,
          ingredients: [{ itemId: 1, count: 10 }],
        },
      ]),
      makeItems([
        { id: 100, name: 'Product', flags: [] },
        { id: 1, name: 'Mat', flags: [] },
      ]),
    );

    const inventory = new Map<number, number>();
    const overages = calculateOverages([tree], inventory);

    expect(overages.get(1)).toBe(-10);
  });

  it('handles item appearing in multiple goal trees', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 100,
        outputItemCount: 1,
        ingredients: [{ itemId: 1, count: 5 }],
      },
      {
        outputItemId: 200,
        outputItemCount: 1,
        ingredients: [{ itemId: 1, count: 8 }],
      },
      {
        outputItemId: 300,
        outputItemCount: 1,
        ingredients: [{ itemId: 1, count: 12 }],
      },
    ]);
    const items = makeItems([
      { id: 100, name: 'A', flags: [] },
      { id: 200, name: 'B', flags: [] },
      { id: 300, name: 'C', flags: [] },
      { id: 1, name: 'Common Mat', flags: [] },
    ]);

    const tree1 = buildRecipeTree(100, recipes, items);
    const tree2 = buildRecipeTree(200, recipes, items);
    const tree3 = buildRecipeTree(300, recipes, items);

    const inventory = new Map<number, number>([[1, 20]]);
    const overages = calculateOverages([tree1, tree2, tree3], inventory);

    // Total required: 5+8+12 = 25, have 20 → -5
    expect(overages.get(1)).toBe(-5);
  });

  it('includes inventory items not in any tree', () => {
    const tree = buildRecipeTree(
      100,
      makeRecipes([
        {
          outputItemId: 100,
          outputItemCount: 1,
          ingredients: [{ itemId: 1, count: 5 }],
        },
      ]),
      makeItems([
        { id: 100, name: 'Product', flags: [] },
        { id: 1, name: 'Mat', flags: [] },
      ]),
    );

    const inventory = new Map<number, number>([
      [1, 10],
      [99, 50],
    ]);
    const overages = calculateOverages([tree], inventory);

    expect(overages.get(99)).toBe(50); // not needed, pure surplus
    expect(overages.get(1)).toBe(5);
  });

  it('handles empty trees array', () => {
    const inventory = new Map<number, number>([[1, 10]]);
    const overages = calculateOverages([], inventory);

    expect(overages.get(1)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// maxCraftableFromInventory
// ---------------------------------------------------------------------------

describe('maxCraftableFromInventory', () => {
  it('returns 0 for non-craftable items', () => {
    const tree = buildRecipeTree(42, makeRecipes([]), makeItems([
      { id: 42, name: 'Raw Material', flags: [] },
    ]));

    const available = new Map<number, number>([[42, 100]]);
    expect(maxCraftableFromInventory(tree, available)).toBe(0);
  });

  it('computes quantity limited by scarcest ingredient', () => {
    const recipes = makeRecipes([{
      outputItemId: 100,
      outputItemCount: 1,
      ingredients: [
        { itemId: 1, count: 10 },
        { itemId: 2, count: 5 },
      ],
    }]);
    const items = makeItems([
      { id: 100, name: 'Product', flags: [] },
      { id: 1, name: 'Mat A', flags: [] },
      { id: 2, name: 'Mat B', flags: [] },
    ]);

    const tree = buildRecipeTree(100, recipes, items);
    const available = new Map<number, number>([
      [1, 30],  // enough for 3 crafts
      [2, 10],  // enough for 2 crafts → bottleneck
    ]);

    expect(maxCraftableFromInventory(tree, available)).toBe(2);
  });

  it('returns 0 when missing an ingredient', () => {
    const recipes = makeRecipes([{
      outputItemId: 100,
      outputItemCount: 1,
      ingredients: [
        { itemId: 1, count: 10 },
        { itemId: 2, count: 5 },
      ],
    }]);
    const items = makeItems([
      { id: 100, name: 'Product', flags: [] },
      { id: 1, name: 'Mat A', flags: [] },
      { id: 2, name: 'Mat B', flags: [] },
    ]);

    const tree = buildRecipeTree(100, recipes, items);
    const available = new Map<number, number>([
      [1, 30],
      // Mat B missing from inventory → 0 available
    ]);

    expect(maxCraftableFromInventory(tree, available)).toBe(0);
  });

  it('handles multi-level recipes', () => {
    const recipes = makeRecipes([
      {
        outputItemId: 300,
        outputItemCount: 1,
        ingredients: [{ itemId: 200, count: 2 }],
      },
      {
        outputItemId: 200,
        outputItemCount: 1,
        ingredients: [{ itemId: 10, count: 4 }],
      },
    ]);
    const items = makeItems([
      { id: 300, name: 'Final', flags: [] },
      { id: 200, name: 'Mid', flags: [] },
      { id: 10, name: 'Raw', flags: [] },
    ]);

    const tree = buildRecipeTree(300, recipes, items);
    // Leaf: need 8 Raw per craft (2 Mid × 4 Raw each)
    const available = new Map<number, number>([[10, 24]]);

    expect(maxCraftableFromInventory(tree, available)).toBe(3); // 24 / 8 = 3
  });
});
