'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCoins } from '@/lib/formatCurrency';

interface ProfitItem {
  itemId: number;
  itemName: string;
  sellPrice: number;
  craftingCost: number;
  listingFee: number;
  exchangeFee: number;
  profitPerUnit: number;
  quantity: number;
  totalProfit: number;
  roi: number;
  dailyCap?: number;
  category?: string;
}

interface ProfitResponse {
  items: ProfitItem[];
  inventorySize: number;
  goalsCount: number;
  lastUpdated: string;
  error?: string;
}

type SortKey = keyof Pick<
  ProfitItem,
  'itemName' | 'sellPrice' | 'craftingCost' | 'profitPerUnit' | 'quantity' | 'totalProfit' | 'roi'
>;

export default function ProfitTable() {
  const [data, setData] = useState<ProfitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('totalProfit');
  const [sortAsc, setSortAsc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const fetchProfitData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsKey(false);
    try {
      const res = await fetch('/api/v1/crafting/profit');
      const json: ProfitResponse = await res.json();
      if (!res.ok) {
        if (json.error?.includes('API key')) {
          setNeedsKey(true);
        } else {
          setError(json.error ?? 'Failed to load profit data');
        }
      } else {
        setData(json);
      }
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

  const getSortDirection = (key: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== key) return 'none';
    return sortAsc ? 'ascending' : 'descending';
  };

  const handleSaveToShoppingList = async () => {
    if (!data || data.items.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/v1/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: data.items.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity,
            action: 'craft',
            unitProfit: item.profitPerUnit,
            totalProfit: item.totalProfit,
          })),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSaveMsg(`Saved ${json.saved} items to Shopping List`);
      } else {
        setSaveMsg('Failed to save');
      }
    } catch {
      setSaveMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading profit data…</p>;

  if (needsKey) {
    return (
      <div className="info-box">
        <p>
          Add your GW2 API key on the <a href="/settings">Settings page</a> to see crafting profits.
          The API key is needed to read your inventory.
        </p>
      </div>
    );
  }

  if (error) return <p role="alert">{error}</p>;
  if (!data) return null;

  const items = data.items;

  if (items.length === 0) {
    return (
      <div className="info-box">
        <p>
          No profitable crafts found. Make sure to <strong>Refresh Prices</strong> first, and check
          that you have materials in your bank or material storage.
        </p>
        {data.goalsCount > 0 && (
          <p>
            You have {data.goalsCount} goal{data.goalsCount > 1 ? 's' : ''} reserving materials.
            Materials needed for goals are excluded from profit calculations.
          </p>
        )}
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const diff = (aVal as number) - (bVal as number);
    return sortAsc ? diff : -diff;
  });

  const columns: { key: SortKey; label: string }[] = [
    { key: 'itemName', label: 'Item' },
    { key: 'quantity', label: 'Qty' },
    { key: 'sellPrice', label: 'Sell Price' },
    { key: 'craftingCost', label: 'Mat. Cost' },
    { key: 'profitPerUnit', label: 'Profit/ea' },
    { key: 'totalProfit', label: 'Total Profit' },
    { key: 'roi', label: 'ROI%' },
  ];

  return (
    <div>
      <p className="profit-meta">
        Inventory: {data.inventorySize} item types
        {data.goalsCount > 0 && (
          <>
            {' '}
            · {data.goalsCount} goal{data.goalsCount > 1 ? 's' : ''} reserving materials
          </>
        )}
      </p>
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
                {item.dailyCap != null && (
                  <span
                    className="daily-cap-badge"
                    aria-label={`Daily limit: ${item.dailyCap}`}
                    title={`Daily cap: ${item.dailyCap}`}
                  >
                    {' '}
                    🔒{item.dailyCap}/day
                  </span>
                )}
              </td>
              <td>{item.quantity}</td>
              <td>{formatCoins(item.sellPrice)}</td>
              <td>{formatCoins(item.craftingCost)}</td>
              <td className={item.profitPerUnit >= 0 ? 'text-profit' : 'text-loss'}>
                {formatCoins(item.profitPerUnit)}
              </td>
              <td className={item.totalProfit >= 0 ? 'text-profit' : 'text-loss'}>
                {formatCoins(item.totalProfit)}
              </td>
              <td className={item.roi >= 0 ? 'text-profit' : 'text-loss'}>
                {item.roi.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="profit-actions">
        <button
          type="button"
          onClick={handleSaveToShoppingList}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : '📋 Save to Shopping List'}
        </button>
        {saveMsg && <span className="save-msg">{saveMsg}</span>}
      </div>
    </div>
  );
}
