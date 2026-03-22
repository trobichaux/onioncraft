import type { RecipeNode } from '@/lib/recipeTree';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfitResult {
  itemId: number;
  itemName: string;
  sellPrice: number;
  craftingCost: number;
  listingFee: number;
  exchangeFee: number;
  profit: number;
  roi: number;
}

// ---------------------------------------------------------------------------
// TP fee calculation — uses independent Math.ceil, never * 0.85
// ---------------------------------------------------------------------------

export function calculateProfit(
  sellPrice: number,
  craftingCost: number
): { listingFee: number; exchangeFee: number; profit: number } {
  const listingFee = Math.ceil(sellPrice * 0.05);
  const exchangeFee = Math.ceil(sellPrice * 0.1);
  const profit = sellPrice - listingFee - exchangeFee - craftingCost;
  return { listingFee, exchangeFee, profit };
}

// ---------------------------------------------------------------------------
// Compute crafting cost from a recipe tree + price map
// ---------------------------------------------------------------------------

export function computeCraftingCost(
  tree: RecipeNode,
  prices: Map<number, { buyPrice: number; sellPrice: number }>,
  inventory: Map<number, number>
): number {
  return computeNodeCost(tree, prices, inventory);
}

function computeNodeCost(
  node: RecipeNode,
  prices: Map<number, { buyPrice: number; sellPrice: number }>,
  inventory: Map<number, number>
): number {
  if (node.ingredients.length === 0) {
    // Leaf node — buy from TP or farm
    const inv = inventory.get(node.itemId) ?? 0;
    const needed = Math.max(0, node.count - inv);

    if (needed === 0) return 0;

    // AccountBound/SoulBound items can't be purchased — cost 0 but must farm
    if (!node.purchasable) return 0;

    const price = prices.get(node.itemId);
    const buyPrice = price?.buyPrice ?? 0;
    return buyPrice * needed;
  }

  // Crafted node — sum children costs
  let total = 0;
  for (const child of node.ingredients) {
    total += computeNodeCost(child, prices, inventory);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Build a full ProfitResult for an item
// ---------------------------------------------------------------------------

export function buildProfitResult(
  tree: RecipeNode,
  prices: Map<number, { buyPrice: number; sellPrice: number }>,
  inventory: Map<number, number>
): ProfitResult {
  const price = prices.get(tree.itemId);
  const sellPrice = price?.sellPrice ?? 0;
  const craftingCost = computeCraftingCost(tree, prices, inventory);
  const { listingFee, exchangeFee, profit } = calculateProfit(sellPrice, craftingCost);
  const roi = craftingCost > 0 ? (profit / craftingCost) * 100 : 0;

  return {
    itemId: tree.itemId,
    itemName: tree.itemName,
    sellPrice,
    craftingCost,
    listingFee,
    exchangeFee,
    profit,
    roi: Math.round(roi * 100) / 100,
  };
}
