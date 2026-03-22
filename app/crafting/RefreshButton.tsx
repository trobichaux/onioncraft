'use client';

import { useState } from 'react';

export default function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    refreshed: number;
    knownRecipes: number;
    newRecipesCached: number;
    newItemsCached: number;
    cachedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/crafting/refresh-prices', { method: 'POST' });
      if (!res.ok) {
        setError('Failed to refresh prices');
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch {
      setError('Failed to refresh prices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleRefresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh Prices'}
      </button>

      <div aria-live="polite">
        {loading && <p>Refreshing prices from Trading Post…</p>}
        {result && (
          <p>
            Refreshed {result.refreshed} prices across {result.knownRecipes} recipes
            {(result.newRecipesCached > 0 || result.newItemsCached > 0) && (
              <> (cached {result.newRecipesCached} new recipes, {result.newItemsCached} new items)</>
            )}
            {' '}at {new Date(result.cachedAt).toLocaleTimeString()}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
