'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

export default function ExclusionListEditor() {
  const [items, setItems] = useState<number[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/settings/exclusion-list');
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError('Failed to load exclusion list');
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function saveList(updatedItems: number[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/settings/exclusion-list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItems),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
        return;
      }
      setItems(updatedItems);
    } catch {
      setError('Failed to save exclusion list');
    } finally {
      setLoading(false);
    }
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const id = parseInt(newItemId, 10);
    if (isNaN(id) || id <= 0) {
      setError('Please enter a positive integer');
      return;
    }
    if (items.includes(id)) {
      setError('Item already in list');
      return;
    }
    setNewItemId('');
    saveList([...items, id]);
  }

  function handleRemove(id: number) {
    saveList(items.filter((item) => item !== id));
  }

  return (
    <div>
      {error && (
        <div role="alert">
          <p>{error}</p>
        </div>
      )}

      <ul>
        {items.map((id) => (
          <li key={id}>
            Item {id}{' '}
            <button
              type="button"
              onClick={() => handleRemove(id)}
              aria-label={`Remove item ${id}`}
              disabled={loading}
            >
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 && <li>No excluded items</li>}
      </ul>

      <form onSubmit={handleAdd}>
        <label htmlFor="exclusion-item-input">Item ID</label>
        <input
          id="exclusion-item-input"
          type="number"
          min="1"
          step="1"
          value={newItemId}
          onChange={(e) => setNewItemId(e.target.value)}
          placeholder="Enter item ID"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !newItemId}>
          Add
        </button>
      </form>
    </div>
  );
}
