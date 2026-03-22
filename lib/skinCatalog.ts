// ---------------------------------------------------------------------------
// Skin Collection Tracker — core logic
// ---------------------------------------------------------------------------

/** How a skin can be acquired. */
export type AcquisitionMethod =
  | 'trading_post'
  | 'achievement'
  | 'direct_buy'
  | 'gem_store'
  | 'content_drop'
  | 'unknown';

/** A single unowned skin with acquisition metadata. */
export interface SkinEntry {
  skinId: number;
  name: string;
  type: string;
  rarity?: string;
  icon: string;
  method: AcquisitionMethod;
  tpPrice?: number;
  wikiUrl: string;
  notes?: string;
}

/**
 * Determine the acquisition method for a skin.
 *
 * Priority order:
 *  1. Trading Post listing
 *  2. Achievement reward
 *  3. Vendor / direct buy
 *  4. Skin-sources data (gem_store / content_drop)
 *  5. Unknown
 */
export function categorizeAcquisition(
  skinId: number,
  hasTpListing: boolean,
  achievementSkinIds: Set<number>,
  vendorSkinIds: Set<number>,
  skinSources: Map<number, { method: string; notes?: string }>
): AcquisitionMethod {
  if (hasTpListing) return 'trading_post';
  if (achievementSkinIds.has(skinId)) return 'achievement';
  if (vendorSkinIds.has(skinId)) return 'direct_buy';

  const source = skinSources.get(skinId);
  if (source) {
    if (source.method === 'gem_store') return 'gem_store';
    if (source.method === 'content_drop') return 'content_drop';
  }

  return 'unknown';
}

/** Build wiki URL from a skin name. */
function wikiUrl(name: string): string {
  return `https://wiki.guildwars2.com/wiki/${name.replace(/ /g, '_')}`;
}

/**
 * Compute the list of unowned skins with acquisition metadata.
 */
export function computeUnownedSkins(
  allSkinIds: number[],
  ownedSkinIds: number[],
  skinDetails: Map<number, { name: string; type: string; icon: string; rarity?: string }>,
  tpPrices: Map<number, number>,
  achievementSkinIds: Set<number>,
  vendorSkinIds: Set<number>,
  skinSources: Map<number, { method: string; notes?: string }>
): SkinEntry[] {
  const ownedSet = new Set(ownedSkinIds);

  const unownedIds = allSkinIds.filter((id) => !ownedSet.has(id));

  return unownedIds
    .map((skinId): SkinEntry | null => {
      const detail = skinDetails.get(skinId);
      if (!detail) return null;

      const hasTp = tpPrices.has(skinId);
      const method = categorizeAcquisition(
        skinId,
        hasTp,
        achievementSkinIds,
        vendorSkinIds,
        skinSources
      );

      const source = skinSources.get(skinId);

      return {
        skinId,
        name: detail.name,
        type: detail.type,
        rarity: detail.rarity,
        icon: detail.icon,
        method,
        tpPrice: tpPrices.get(skinId),
        wikiUrl: wikiUrl(detail.name),
        notes: source?.notes,
      };
    })
    .filter((entry): entry is SkinEntry => entry !== null);
}

/**
 * Sort skins by weighted priority rules.
 *
 * Each rule adds its weight to any skin whose `field` value matches.
 * Higher total score comes first; ties broken alphabetically by name.
 * When no rules are provided the result is sorted alphabetically.
 */
export function applyPriorityRules(
  skins: SkinEntry[],
  rules: Array<{ field: 'type' | 'rarity' | 'method'; value: string; weight: number }>
): SkinEntry[] {
  const scored = skins.map((skin) => {
    let score = 0;
    for (const rule of rules) {
      const skinValue =
        rule.field === 'type' ? skin.type : rule.field === 'rarity' ? skin.rarity : skin.method;
      if (skinValue === rule.value) {
        score += rule.weight;
      }
    }
    return { skin, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.skin.name.localeCompare(b.skin.name);
  });

  return scored.map((s) => s.skin);
}
