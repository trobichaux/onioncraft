import { z } from 'zod';

// ---------------------------------------------------------------------------
// Settings subtypes – stored as JSON strings in the Settings table `value` field
// ---------------------------------------------------------------------------

export const ExclusionListSchema = z.array(z.number().int().positive());
export type ExclusionList = z.infer<typeof ExclusionListSchema>;

export const PriorityRulesSchema = z.array(
  z.object({
    field: z.enum(['type', 'rarity', 'method']),
    value: z.string(),
    weight: z.number().min(0).max(100),
  })
);
export type PriorityRules = z.infer<typeof PriorityRulesSchema>;

export const ApiKeySchema = z.object({
  key: z.string().min(1),
  permissions: z.array(z.string()),
  validatedAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const CharacterFilterSchema = z.object({
  enabled: z.boolean(),
  characters: z.array(z.string()),
});
export type CharacterFilter = z.infer<typeof CharacterFilterSchema>;

// ---------------------------------------------------------------------------
// Cache entities
// ---------------------------------------------------------------------------

export const PriceCacheEntitySchema = z.object({
  buyPrice: z.number().int().nonnegative(),
  sellPrice: z.number().int().nonnegative(),
  cachedAt: z.string().datetime(),
});
export type PriceCacheEntity = z.infer<typeof PriceCacheEntitySchema>;

export const SkinCacheEntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  icon: z.string().url(),
  cachedAt: z.string().datetime(),
});
export type SkinCacheEntity = z.infer<typeof SkinCacheEntitySchema>;

// ---------------------------------------------------------------------------
// Recipe + Item cache entities (shared, populated during account init)
// ---------------------------------------------------------------------------

export const RecipeCacheEntitySchema = z.object({
  outputItemId: z.number().int().positive(),
  outputItemCount: z.number().int().positive(),
  minRating: z.number().int().nonnegative(),
  disciplines: z.string(), // JSON array
  ingredients: z.string(), // JSON array of {itemId, count}
  cachedAt: z.string().datetime(),
});
export type RecipeCacheEntity = z.infer<typeof RecipeCacheEntitySchema>;

export const ItemCacheEntitySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  flags: z.string(), // JSON array
  cachedAt: z.string().datetime(),
});
export type ItemCacheEntity = z.infer<typeof ItemCacheEntitySchema>;

// ---------------------------------------------------------------------------
// Per-user account data cache (populated during account init)
// ---------------------------------------------------------------------------

export const AccountDataSchema = z.object({
  knownRecipeIds: z.array(z.number().int()),
  characters: z.array(
    z.object({
      name: z.string(),
      disciplines: z.array(
        z.object({
          discipline: z.string(),
          rating: z.number().int().nonnegative(),
        })
      ),
    })
  ),
  cachedAt: z.string().datetime(),
});
export type AccountData = z.infer<typeof AccountDataSchema>;

// ---------------------------------------------------------------------------
// Goal progress
// ---------------------------------------------------------------------------

export const GoalProgressSchema = z.object({
  itemId: z.number().int().positive(),
  itemName: z.string(),
  resolvedTree: z.unknown().optional(),
  resolvedAt: z.string().datetime().optional(),
});
export type GoalProgress = z.infer<typeof GoalProgressSchema>;

// ---------------------------------------------------------------------------
// Skin collection metadata (persisted server-side for cross-session state)
// ---------------------------------------------------------------------------

export const CollectionMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  ownedCount: z.number().int().nonnegative(),
  lastRefreshed: z.string().datetime(),
});
