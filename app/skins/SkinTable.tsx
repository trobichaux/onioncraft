'use client';

import { useState, useEffect, useCallback } from 'react';

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

interface CollectionResponse {
  total: number;
  owned: number;
  unowned: SkinEntry[];
  lastUpdated: string;
  error?: string;
}

type SortField = 'name' | 'type' | 'rarity' | 'method' | 'tpPrice';
type SortDirection = 'ascending' | 'descending';

const METHOD_COLORS: Record<string, string> = {
  trading_post: '#4caf50',
  achievement: '#ff9800',
  direct_buy: '#2196f3',
  gem_store: '#9c27b0',
  content_drop: '#00bcd4',
  unknown: '#9e9e9e',
};

export default function SkinTable() {
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('ascending');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsKey(false);
    try {
      const res = await fetch('/api/v1/skins/collection');
      const json: CollectionResponse = await res.json();
      if (!res.ok) {
        if (json.error === 'API key required') {
          setNeedsKey(true);
        } else {
          setError(json.error ?? 'Failed to load collection');
        }
      } else {
        setData(json);
      }
    } catch {
      setError('Failed to load collection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortField(field);
      setSortDir('ascending');
    }
  }

  if (loading) {
    return <p role="status">Loading skin collection…</p>;
  }

  if (needsKey) {
    return (
      <div className="info-box">
        <p>Add your GW2 API key on the <a href="/settings">Settings page</a> to see your unowned skins.</p>
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

  let filtered = data.unowned;

  if (typeFilter) {
    filtered = filtered.filter((s) => s.type === typeFilter);
  }
  if (methodFilter) {
    filtered = filtered.filter((s) => s.method === methodFilter);
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'ascending' ? 1 : -1;
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }
    return String(aVal).localeCompare(String(bVal)) * dir;
  });

  const types = Array.from(new Set(data.unowned.map((s) => s.type))).sort();
  const methods = Array.from(new Set(data.unowned.map((s) => s.method))).sort();

  function ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    return sortField === field ? sortDir : 'none';
  }

  return (
    <div>
      <div>
        <label htmlFor="type-filter">Type: </label>
        <select
          id="type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label htmlFor="method-filter"> Method: </label>
        <select
          id="method-filter"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
        >
          <option value="">All</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSort('name')}>
              <button type="button" onClick={() => handleSort('name')}>
                Name
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('type')}>
              <button type="button" onClick={() => handleSort('type')}>
                Type
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('rarity')}>
              <button type="button" onClick={() => handleSort('rarity')}>
                Rarity
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('method')}>
              <button type="button" onClick={() => handleSort('method')}>
                Acquisition Method
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('tpPrice')}>
              <button type="button" onClick={() => handleSort('tpPrice')}>
                TP Price
              </button>
            </th>
            <th scope="col">Wiki</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((skin) => (
            <tr key={skin.skinId}>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={skin.icon} alt="" width={24} height={24} />
                {' '}{skin.name}
              </td>
              <td>{skin.type}</td>
              <td>{skin.rarity ?? '—'}</td>
              <td style={{ color: METHOD_COLORS[skin.method] ?? '#9e9e9e' }}>
                {skin.method.replace(/_/g, ' ')}
              </td>
              <td>{skin.tpPrice != null ? `${skin.tpPrice} c` : '—'}</td>
              <td>
                <a href={skin.wikiUrl} target="_blank" rel="noopener noreferrer">
                  Wiki
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && <p>No skins match the current filters.</p>}
    </div>
  );
}
