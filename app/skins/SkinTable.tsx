'use client';

import { useState } from 'react';

interface SkinEntry {
  skinId: number;
  name: string;
  type: string;
  rarity?: string;
  icon: string;
  method: string;
  vendorCost?: number;
  vendorCurrency?: string;
  vendorName?: string;
  wikiUrl: string;
  notes?: string;
}

interface SkinTableProps {
  unowned: SkinEntry[];
}

type SortField = 'name' | 'type' | 'rarity' | 'method' | 'vendorCost';
type SortDirection = 'ascending' | 'descending';

const METHOD_COLORS: Record<string, string> = {
  trading_post: '#4caf50',
  achievement: '#ff9800',
  direct_buy: '#2196f3',
  gem_store: '#9c27b0',
  content_drop: '#00bcd4',
  unknown: '#9e9e9e',
};

const METHOD_LABELS: Record<string, string> = {
  trading_post: 'Trading Post',
  achievement: 'Achievement',
  direct_buy: 'Vendor',
  gem_store: 'Gem Store',
  content_drop: 'Content Drop',
  unknown: 'Unknown',
};

function formatCost(entry: SkinEntry): string {
  if (entry.vendorCost != null && entry.vendorCurrency) {
    return `${entry.vendorCost} ${entry.vendorCurrency}`;
  }
  return '—';
}

export default function SkinTable({ unowned }: SkinTableProps) {
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('ascending');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortField(field);
      setSortDir('ascending');
    }
  }

  let filtered = unowned;

  if (typeFilter) {
    filtered = filtered.filter((s) => s.type === typeFilter);
  }
  if (methodFilter) {
    filtered = filtered.filter((s) => s.method === methodFilter);
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'ascending' ? 1 : -1;
    if (sortField === 'vendorCost') {
      const aVal = a.vendorCost ?? Infinity;
      const bVal = b.vendorCost ?? Infinity;
      return (aVal - bVal) * dir;
    }
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }
    return String(aVal).localeCompare(String(bVal)) * dir;
  });

  const types = Array.from(new Set(unowned.map((s) => s.type))).sort();
  const methods = Array.from(new Set(unowned.map((s) => s.method))).sort();

  function ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    return sortField === field ? sortDir : 'none';
  }

  return (
    <div>
      <div>
        <label htmlFor="type-filter">Type: </label>
        <select id="type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
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
              {METHOD_LABELS[m] ?? m}
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
                Source
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort('vendorCost')}>
              <button type="button" onClick={() => handleSort('vendorCost')}>
                Cost
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
                <img src={skin.icon} alt="" width={24} height={24} /> {skin.name}
              </td>
              <td>{skin.type}</td>
              <td>{skin.rarity ?? '—'}</td>
              <td
                style={{ color: METHOD_COLORS[skin.method] ?? '#9e9e9e' }}
                title={skin.vendorName ?? undefined}
              >
                {METHOD_LABELS[skin.method] ?? skin.method.replace(/_/g, ' ')}
              </td>
              <td>{formatCost(skin)}</td>
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
