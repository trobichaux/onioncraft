'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCoins } from '@/lib/formatCurrency';

interface ShoppingItem {
  itemId: number;
  itemName: string;
  quantity: number;
  action: 'craft' | 'buy' | 'farm';
  unitProfit: number;
  totalProfit: number;
  completed: boolean;
  addedAt: string;
}

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/shopping-list');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load shopping list');
      } else {
        setItems(json.items ?? []);
      }
    } catch {
      setError('Failed to load shopping list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleToggle = async (itemId: number, completed: boolean) => {
    try {
      await fetch('/api/v1/shopping-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, completed }),
      });
      setItems((prev) =>
        prev.map((i) => (i.itemId === itemId ? { ...i, completed } : i)),
      );
    } catch {
      // Silently fail — will reload on next fetch
    }
  };

  const handleRemove = async (itemId: number) => {
    try {
      await fetch('/api/v1/shopping-list', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      setItems((prev) => prev.filter((i) => i.itemId !== itemId));
    } catch {
      // Silently fail
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch('/api/v1/shopping-list', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      setItems([]);
    } catch {
      setError('Failed to clear list');
    }
  };

  const handleClearCompleted = async () => {
    const completed = items.filter((i) => i.completed);
    for (const item of completed) {
      await fetch('/api/v1/shopping-list', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.itemId }),
      });
    }
    setItems((prev) => prev.filter((i) => !i.completed));
  };

  if (loading) return <p>Loading shopping list…</p>;
  if (error) return <p role="alert">{error}</p>;

  if (items.length === 0) {
    return (
      <div className="info-box">
        <p>Your shopping list is empty. Calculate profits above and click <strong>Save to Shopping List</strong>.</p>
      </div>
    );
  }

  const completedCount = items.filter((i) => i.completed).length;
  const totalProfit = items
    .filter((i) => !i.completed)
    .reduce((sum, i) => sum + i.totalProfit, 0);

  const ACTION_LABELS: Record<string, string> = {
    craft: '🔨 Craft',
    buy: '🛒 Buy',
    farm: '⛏️ Farm',
  };

  return (
    <div>
      <div className="shopping-meta">
        <span>{items.length} items · {completedCount} done</span>
        <span>Potential profit: {formatCoins(totalProfit)}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th scope="col">✓</th>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Action</th>
            <th scope="col">Profit</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId} className={item.completed ? 'row-completed' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(e) => handleToggle(item.itemId, e.target.checked)}
                  aria-label={`Mark ${item.itemName} as ${item.completed ? 'incomplete' : 'complete'}`}
                />
              </td>
              <td className={item.completed ? 'text-muted line-through' : ''}>
                {item.itemName}
              </td>
              <td>{item.quantity}</td>
              <td>{ACTION_LABELS[item.action] ?? item.action}</td>
              <td className="text-profit">{formatCoins(item.totalProfit)}</td>
              <td>
                <button
                  type="button"
                  onClick={() => handleRemove(item.itemId)}
                  className="btn-small btn-danger"
                  aria-label={`Remove ${item.itemName}`}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="shopping-actions">
        {completedCount > 0 && (
          <button type="button" onClick={handleClearCompleted} className="btn-secondary">
            Clear Completed ({completedCount})
          </button>
        )}
        <button type="button" onClick={handleClearAll} className="btn-danger">
          Clear All
        </button>
      </div>
    </div>
  );
}
