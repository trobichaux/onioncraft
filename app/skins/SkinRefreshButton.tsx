'use client';

import { useState } from 'react';

interface RefreshResult {
  refreshed: number;
  cachedAt: string;
}

export default function SkinRefreshButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/v1/skins/catalog/refresh', {
        method: 'POST',
      });
      const data = await res.json() as RefreshResult & { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Refresh failed');
      } else {
        setResult(data);
      }
    } catch {
      setError('Failed to refresh catalog');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleRefresh} disabled={loading}>
        {loading ? 'Refreshing... this may take a while' : 'Refresh Skin Catalog'}
      </button>

      <div aria-live="polite" role="status">
        {result && (
          <p>
            Refreshed {result.refreshed} skins at{' '}
            {new Date(result.cachedAt).toLocaleString()}.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
