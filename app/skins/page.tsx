'use client';

import { useState, useEffect, useCallback } from 'react';
import SkinTable from './SkinTable';
import SkinRefreshButton from './SkinRefreshButton';
import CollectionStats from './CollectionStats';

interface SkinEntry {
  skinId: number;
  name: string;
  type: string;
  rarity?: string;
  icon: string;
  method: string;
  tpPrice?: number;
  wikiUrl: string;
  notes?: string;
}

interface CollectionData {
  total: number;
  owned: number;
  unowned: SkinEntry[];
  lastRefreshed: string;
}

interface ServerMeta {
  total: number;
  owned: number;
  lastRefreshed: string;
  needsRefresh: boolean;
}

const STORAGE_KEY = 'onioncraft:skinCollection';

function loadFromStorage(): CollectionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CollectionData;
  } catch {
    return null;
  }
}

function saveToStorage(data: CollectionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

export default function SkinsPage() {
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [changesDetected, setChangesDetected] = useState(false);

  // 1. On mount: load from localStorage, then check server for changes
  useEffect(() => {
    const cached = loadFromStorage();
    if (cached) {
      setData(cached);
      setLoading(false);
    }

    // Fetch server-side metadata (fast — no GW2 API calls)
    (async () => {
      try {
        const res = await fetch('/api/v1/skins/collection');
        const meta: ServerMeta & { error?: string } = await res.json();

        if (!res.ok) {
          if (meta.error === 'API key required') {
            setNeedsKey(true);
          } else {
            setError(meta.error ?? 'Failed to load collection');
          }
          setLoading(false);
          return;
        }

        if (meta.needsRefresh && !cached) {
          // No data anywhere — user needs to do initial refresh
          setLoading(false);
          return;
        }

        // Check for changes in background
        checkForChanges();
      } catch {
        if (!cached) {
          setError('Failed to connect to server');
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForChanges = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/skins/collection/check', {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        if (result.changed) {
          setChangesDetected(true);
        }
      }
    } catch {
      // Non-fatal — just can't check for changes right now
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    setChangesDetected(false);

    try {
      const res = await fetch('/api/v1/skins/collection/refresh', {
        method: 'POST',
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Refresh failed');
        return;
      }

      const newData: CollectionData = {
        total: json.total,
        owned: json.owned,
        unowned: json.unowned,
        lastRefreshed: json.lastRefreshed,
      };
      setData(newData);
      saveToStorage(newData);
    } catch {
      setError('Failed to refresh collection');
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (needsKey) {
    return (
      <div>
        <h1>Skin Collection Tracker</h1>
        <div className="info-box">
          <p>Add your GW2 API key on the <a href="/settings">Settings page</a> to use the skin tracker.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Skin Collection Tracker</h1>

      {changesDetected && (
        <div role="status" className="info-box" style={{ backgroundColor: '#fff3cd', padding: '0.75rem', borderRadius: 4, marginBottom: '1rem' }}>
          <p>
            🔔 Your skin collection has changed since the last refresh.{' '}
            <button type="button" onClick={handleRefresh} disabled={refreshing}>
              Refresh now
            </button>
          </p>
        </div>
      )}

      {error && (
        <div role="alert" style={{ color: '#d32f2f', marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading">Collection Progress</h2>
        <CollectionStats
          total={data?.total ?? 0}
          owned={data?.owned ?? 0}
          loading={loading}
          lastRefreshed={data?.lastRefreshed}
        />
      </section>

      <section aria-labelledby="refresh-heading">
        <h2 id="refresh-heading">Catalog Management</h2>
        <SkinRefreshButton
          onRefresh={handleRefresh}
          refreshing={refreshing}
          lastRefreshed={data?.lastRefreshed}
        />
      </section>

      <section aria-labelledby="table-heading">
        <h2 id="table-heading">Unowned Skins</h2>
        {loading ? (
          <p role="status">Loading skin collection…</p>
        ) : !data ? (
          <div className="info-box">
            <p>Click <strong>Refresh Collection</strong> above to load your skin data for the first time.</p>
          </div>
        ) : (
          <SkinTable unowned={data.unowned} />
        )}
      </section>
    </div>
  );
}
