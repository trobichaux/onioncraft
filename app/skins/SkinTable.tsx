'use client';

import { useState } from 'react';
import { formatCoins, formatCoinsText } from '@/lib/formatCurrency';

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

interface SkinTableProps {
  unowned: SkinEntry[];
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

export default function SkinTable({ unowned }: SkinTableProps) {
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [priceRangeInit, setPriceRangeInit] = useState(false);
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

  const tpSkins = unowned.filter((s) => s.tpPrice != null && s.tpPrice > 0);
  const maxTpPrice = tpSkins.length > 0 ? Math.max(...tpSkins.map((s) => s.tpPrice!)) : 0;

  // Initialize price range on first data load
  if (!priceRangeInit && maxTpPrice > 0) {
    setPriceMin(1);
    setPriceMax(maxTpPrice);
    setPriceRangeInit(true);
  }

  let filtered = unowned;

  if (typeFilter) {
    filtered = filtered.filter((s) => s.type === typeFilter);
  }
  if (methodFilter) {
    filtered = filtered.filter((s) => s.method === methodFilter);
  }
  if (priceRangeInit && maxTpPrice > 0) {
    filtered = filtered.filter((s) => {
      if (s.tpPrice == null) return true; // show non-TP skins regardless
      return s.tpPrice >= priceMin && s.tpPrice <= priceMax;
    });
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
              {m}
            </option>
          ))}
        </select>
      </div>

      {maxTpPrice > 0 && (
        <div className="price-range-filter">
          <label>TP Price Range:</label>
          <div className="price-range-display">
            <span className="price-range-value">{formatCoins(priceMin)}</span>
            <span className="price-range-separator">to</span>
            <span className="price-range-value">{formatCoins(priceMax)}</span>
          </div>
          <div className="price-range-sliders">
            <div className="range-slider-group">
              <label htmlFor="price-min">Min</label>
              <input
                type="range"
                id="price-min"
                min={1}
                max={maxTpPrice}
                value={priceMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPriceMin(Math.min(v, priceMax));
                }}
                aria-label={`Minimum price: ${formatCoinsText(priceMin)}`}
              />
            </div>
            <div className="range-slider-group">
              <label htmlFor="price-max">Max</label>
              <input
                type="range"
                id="price-max"
                min={1}
                max={maxTpPrice}
                value={priceMax}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPriceMax(Math.max(v, priceMin));
                }}
                aria-label={`Maximum price: ${formatCoinsText(priceMax)}`}
              />
            </div>
          </div>
        </div>
      )}

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
                <img src={skin.icon} alt="" width={24} height={24} /> {skin.name}
              </td>
              <td>{skin.type}</td>
              <td>{skin.rarity ?? '—'}</td>
              <td style={{ color: METHOD_COLORS[skin.method] ?? '#9e9e9e' }}>
                {skin.method.replace(/_/g, ' ')}
              </td>
              <td>{skin.tpPrice != null ? formatCoins(skin.tpPrice) : '—'}</td>
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
