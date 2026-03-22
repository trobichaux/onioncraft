import mysticForgeData from '@/data/mystic-forge-recipes.json';
import craftLimitsData from '@/data/craft-limits.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  itemId: number;
  count: number;
}

export interface Recipe {
  outputItemId: number;
  outputItemCount: number;
  disciplines?: string[];
  minRating?: number;
  ingredients: RecipeIngredient[];
}

export interface Item {
  id: number;
  name: string;
  type?: string;
  rarity?: string;
  flags: string[];
}

export interface RecipeNode {
  itemId: number;
  itemName: string;
  count: number;
  craftable: boolean;
  purchasable: boolean;
  disciplineRequired?: string;
  levelRequired?: number;
  dailyCap?: number;
  ingredients: RecipeNode[];
}

interface MysticForgeRecipe {
  outputItemId: number;
  outputItemCount: number;
  ingredients: RecipeIngredient[];
}

interface CraftLimit {
  itemId: number;
  itemName: string;
  dailyCap: number;
  resetType: string;
}

// ---------------------------------------------------------------------------
// Static data loaders
// ---------------------------------------------------------------------------

function getMysticForgeRecipes(): Map<number, Recipe> {
  const map = new Map<number, Recipe>();
  const recipes = (mysticForgeData as { recipes: MysticForgeRecipe[] }).recipes;
  for (const r of recipes) {
    map.set(r.outputItemId, {
      outputItemId: r.outputItemId,
      outputItemCount: r.outputItemCount,
      ingredients: r.ingredients,
    });
  }
  return map;
}

function getCraftLimits(): Map<number, CraftLimit> {
  const map = new Map<number, CraftLimit>();
  const limits = (craftLimitsData as { limits: CraftLimit[] }).limits;
  for (const l of limits) {
    map.set(l.itemId, l);
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildRecipeTree — pure function
// ---------------------------------------------------------------------------

export function buildRecipeTree(
  goalItemId: number,
  recipes: Map<number, Recipe>,
  items: Map<number, Item>,
  count: number = 1
): RecipeNode {
  const mysticRecipes = getMysticForgeRecipes();
  const craftLimits = getCraftLimits();

  return buildNode(goalItemId, count, recipes, mysticRecipes, items, craftLimits, new Set());
}

function buildNode(
  itemId: number,
  count: number,
  recipes: Map<number, Recipe>,
  mysticRecipes: Map<number, Recipe>,
  items: Map<number, Item>,
  craftLimits: Map<number, CraftLimit>,
  visited: Set<number>
): RecipeNode {
  const item = items.get(itemId);
  const itemName = item?.name ?? `Item ${itemId}`;
  const flags = item?.flags ?? [];
  const purchasable = !flags.includes('AccountBound') && !flags.includes('SoulBound');

  const limit = craftLimits.get(itemId);
  const dailyCap = limit?.dailyCap;

  // Prevent infinite recursion on cyclic recipes
  if (visited.has(itemId)) {
    return { itemId, itemName, count, craftable: false, purchasable, dailyCap, ingredients: [] };
  }

  // Look up recipe: prefer standard recipes, fall back to mystic forge
  const recipe = recipes.get(itemId) ?? mysticRecipes.get(itemId);

  if (!recipe) {
    // Leaf node — raw material
    return { itemId, itemName, count, craftable: false, purchasable, dailyCap, ingredients: [] };
  }

  const newVisited = new Set(visited);
  newVisited.add(itemId);

  const discipline = recipe.disciplines?.[0];
  const level = recipe.minRating;

  // Scale ingredient counts by how many of this item we need,
  // accounting for outputItemCount (recipe may produce multiple)
  const batches = Math.ceil(count / recipe.outputItemCount);

  const children = recipe.ingredients.map((ing) =>
    buildNode(
      ing.itemId,
      ing.count * batches,
      recipes,
      mysticRecipes,
      items,
      craftLimits,
      newVisited
    )
  );

  return {
    itemId,
    itemName,
    count,
    craftable: true,
    purchasable,
    disciplineRequired: discipline,
    levelRequired: level,
    dailyCap,
    ingredients: children,
  };
}

// ---------------------------------------------------------------------------
// calculateOverages — pure function, operates on ALL active goals
// ---------------------------------------------------------------------------

export function calculateOverages(
  trees: RecipeNode[],
  inventory: Map<number, number>
): Map<number, number> {
  // Flatten all trees and sum total required per leaf item
  const totalRequired = new Map<number, number>();
  for (const tree of trees) {
    flattenLeafRequirements(tree, totalRequired);
  }

  // Compute overages: overage = inventory - required
  const overages = new Map<number, number>();
  const allItemIds = new Set([...totalRequired.keys(), ...inventory.keys()]);

  for (const itemId of allItemIds) {
    const inv = inventory.get(itemId) ?? 0;
    const req = totalRequired.get(itemId) ?? 0;
    overages.set(itemId, inv - req);
  }

  return overages;
}

function flattenLeafRequirements(node: RecipeNode, totals: Map<number, number>): void {
  if (node.ingredients.length === 0) {
    // Leaf node — accumulate requirement
    const current = totals.get(node.itemId) ?? 0;
    totals.set(node.itemId, current + node.count);
  } else {
    // Recurse into children
    for (const child of node.ingredients) {
      flattenLeafRequirements(child, totals);
    }
  }
}

// ---------------------------------------------------------------------------
// maxCraftableFromInventory — how many of this item can be crafted?
// ---------------------------------------------------------------------------

/**
 * Given a recipe tree built for count=1 and a map of available materials,
 * return the maximum number of times this recipe can be crafted.
 * The bottleneck is the scarcest leaf ingredient.
 */
export function maxCraftableFromInventory(
  tree: RecipeNode,
  available: Map<number, number>
): number {
  if (!tree.craftable) return 0;

  const leafReqs = new Map<number, number>();
  flattenLeafRequirements(tree, leafReqs);

  if (leafReqs.size === 0) return 0;

  let minCraftable = Infinity;
  for (const [itemId, requiredPerCraft] of leafReqs) {
    if (requiredPerCraft <= 0) continue;
    const avail = available.get(itemId) ?? 0;
    const craftable = Math.floor(avail / requiredPerCraft);
    minCraftable = Math.min(minCraftable, craftable);
  }

  return minCraftable === Infinity ? 0 : minCraftable;
}
