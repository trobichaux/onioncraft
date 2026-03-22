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
  vendorCost?: number;
  vendorCurrency?: string;
  vendorName?: string;
  wikiUrl: string;
  notes?: string;
}

/** Acquisition data entry from skin-acquisition.json. */
export interface AcquisitionData {
  skinId: number;
  method: AcquisitionMethod;
  cost?: number;
  currency?: string;
  currencyLabel?: string;
  vendorName?: string;
  notes?: string;
}

/** Vendor group from skin-acquisition.json — uses name patterns to match skins. */
export interface VendorGroup {
  id: string;
  name: string;
  method: AcquisitionMethod;
  currency: string;
  currencyLabel: string;
  vendorName: string;
  namePatterns: string[];
  tokenCosts: Record<string, number>;
  notes: string;
}

/**
 * Match a skin name against vendor groups to find acquisition data.
 * Returns the matching vendor group or undefined.
 */
export function matchVendorGroup(
  skinName: string,
  vendorGroups: VendorGroup[]
): VendorGroup | undefined {
  for (const group of vendorGroups) {
    for (const pattern of group.namePatterns) {
      if (skinName.includes(pattern)) {
        return group;
      }
    }
  }
  return undefined;
}

/** Estimate token cost from skin type (Armor vs Weapon). */
function estimateTokenCost(skinType: string, tokenCosts: Record<string, number>): number {
  if (skinType === 'Weapon' || skinType === 'Back') return tokenCosts.weapon ?? 390;
  // For armor, use average since we can't determine slot from skin API
  return tokenCosts.chest ?? 330;
}

/**
 * Determine the acquisition method for a skin.
 *
 * Priority order:
 *  1. Explicit acquisition data (by skin ID)
 *  2. Vendor group name pattern match (dungeon skins, etc.)
 *  3. Skin-sources data (gem_store / content_drop — legacy)
 *  4. Unknown
 *
 * NOTE: TP price lookup was removed — skin IDs ≠ item IDs in the GW2 API,
 * so passing skin IDs to /commerce/prices returned prices for unrelated items.
 * Accurate TP pricing requires a skin→item mapping database (future work).
 */
export function categorizeAcquisition(
  skinId: number,
  acquisitionMap: Map<number, AcquisitionData>,
  skinSources: Map<number, { method: string; notes?: string }>
): AcquisitionMethod {
  const acq = acquisitionMap.get(skinId);
  if (acq) return acq.method;

  const source = skinSources.get(skinId);
  if (source) {
    if (source.method === 'gem_store') return 'gem_store';
    if (source.method === 'content_drop') return 'content_drop';
    if (source.method === 'achievement') return 'achievement';
    if (source.method === 'direct_buy') return 'direct_buy';
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
  acquisitionMap: Map<number, AcquisitionData>,
  vendorGroups: VendorGroup[],
  skinSources: Map<number, { method: string; notes?: string }>
): SkinEntry[] {
  const ownedSet = new Set(ownedSkinIds);

  const unownedIds = allSkinIds.filter((id) => !ownedSet.has(id));

  return unownedIds
    .map((skinId): SkinEntry | null => {
      const detail = skinDetails.get(skinId);
      if (!detail) return null;

      // Check explicit acquisition data first
      const acq = acquisitionMap.get(skinId);
      if (acq) {
        return {
          skinId,
          name: detail.name,
          type: detail.type,
          rarity: detail.rarity,
          icon: detail.icon,
          method: acq.method,
          vendorCost: acq.cost,
          vendorCurrency: acq.currencyLabel ?? acq.currency,
          vendorName: acq.vendorName,
          wikiUrl: wikiUrl(detail.name),
          notes: acq.notes,
        };
      }

      // Try name-based vendor group matching (dungeon skins, etc.)
      const vendorMatch = matchVendorGroup(detail.name, vendorGroups);
      if (vendorMatch) {
        return {
          skinId,
          name: detail.name,
          type: detail.type,
          rarity: detail.rarity,
          icon: detail.icon,
          method: vendorMatch.method as AcquisitionMethod,
          vendorCost: estimateTokenCost(detail.type, vendorMatch.tokenCosts),
          vendorCurrency: vendorMatch.currencyLabel,
          vendorName: vendorMatch.vendorName,
          wikiUrl: wikiUrl(detail.name),
          notes: vendorMatch.notes,
        };
      }

      // Fall back to legacy skin-sources data
      const source = skinSources.get(skinId);
      const method = categorizeAcquisition(skinId, acquisitionMap, skinSources);

      return {
        skinId,
        name: detail.name,
        type: detail.type,
        rarity: detail.rarity,
        icon: detail.icon,
        method,
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
