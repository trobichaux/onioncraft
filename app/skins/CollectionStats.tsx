'use client';

import { useState, useEffect, useCallback } from 'react';

interface CollectionData {
  total: number;
  owned: number;
}

export default function CollectionStats() {
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [needsKey, setNeedsKey] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setNeedsKey(false);
    try {
      const res = await fetch('/api/v1/skins/collection');
      const json = await res.json() as CollectionData & { error?: string };
      if (!res.ok) {
        if (json.error === 'API key required') {
          setNeedsKey(true);
        } else {
          setError(json.error ?? 'Failed to load stats');
        }
      } else {
        setData(json);
      }
    } catch {
      setError('Failed to load collection stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <p role="status">Loading collection stats…</p>;
  }

  if (needsKey) {
    return (
      <div className="info-box">
        <p>Add your GW2 API key on the <a href="/settings">Settings page</a> to see your collection progress.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert">
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const unowned = data.total - data.owned;
  const pct = data.total > 0 ? Math.round((data.owned / data.total) * 100) : 0;

  return (
    <div>
      <dl>
        <dt>Total Skins</dt>
        <dd>{data.total}</dd>
        <dt>Owned</dt>
        <dd>{data.owned}</dd>
        <dt>Unowned</dt>
        <dd>{unowned}</dd>
        <dt>Completion</dt>
        <dd>{pct}%</dd>
      </dl>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Collection progress: ${pct}%`}
        style={{
          width: '100%',
          backgroundColor: '#e0e0e0',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: 20,
            backgroundColor: '#4caf50',
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}
