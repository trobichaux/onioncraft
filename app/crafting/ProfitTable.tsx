'use client';

import { useState, useEffect, useCallback } from 'react';

interface ProfitItem {
  itemId: number;
  itemName: string;
  sellPrice: number;
  craftingCost: number;
  listingFee: number;
  exchangeFee: number;
  profit: number;
  roi: number;
  dailyCap?: number;
}

type SortKey = keyof Pick<
  ProfitItem,
  'itemName' | 'sellPrice' | 'craftingCost' | 'listingFee' | 'exchangeFee' | 'profit' | 'roi'
>;

export default function ProfitTable() {
  const [items, setItems] = useState<ProfitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('profit');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchProfitData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/crafting/profit');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError('Failed to load profit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfitData();
  }, [fetchProfitData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'itemName');
    }
  };

  const sorted = [...items].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const diff = (aVal as number) - (bVal as number);
    return sortAsc ? diff : -diff;
  });

  const getSortDirection = (key: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== key) return 'none';
    return sortAsc ? 'ascending' : 'descending';
  };

  if (loading) return <p>Loading profit data…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (items.length === 0) return <p>No profit data available. Add goals and refresh prices.</p>;

  const columns: { key: SortKey; label: string }[] = [
    { key: 'itemName', label: 'Item Name' },
    { key: 'sellPrice', label: 'Sell Price' },
    { key: 'craftingCost', label: 'Craft Cost' },
    { key: 'listingFee', label: 'Listing Fee' },
    { key: 'exchangeFee', label: 'Exchange Fee' },
    { key: 'profit', label: 'Profit' },
    { key: 'roi', label: 'ROI%' },
  ];

  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              aria-sort={getSortDirection(col.key)}
              onClick={() => handleSort(col.key)}
              style={{ cursor: 'pointer' }}
            >
              {col.label}
              {sortKey === col.key && (sortAsc ? ' ▲' : ' ▼')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((item) => (
          <tr key={item.itemId}>
            <td>
              {item.itemName}
              {item.dailyCap !== undefined && (
                <span aria-label="Daily crafting limit" title={`Daily cap: ${item.dailyCap}`}>
                  {' '}
                  🔒
                </span>
              )}
            </td>
            <td>{item.sellPrice}</td>
            <td>{item.craftingCost}</td>
            <td>{item.listingFee}</td>
            <td>{item.exchangeFee}</td>
            <td style={{ color: item.profit >= 0 ? 'green' : 'red' }}>{item.profit}</td>
            <td style={{ color: item.roi >= 0 ? 'green' : 'red' }}>{item.roi}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
