'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

interface Goal {
  goalId: string;
  itemId: number;
  itemName: string;
}

export default function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [itemId, setItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/crafting/goals');
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch {
      setError('Failed to load goals');
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const id = parseInt(itemId, 10);
    if (isNaN(id) || id <= 0) {
      setError('Please enter a valid item ID');
      return;
    }
    if (!itemName.trim()) {
      setError('Please enter an item name');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/crafting/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: id, itemName: itemName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to add goal');
        return;
      }

      setItemId('');
      setItemName('');
      await fetchGoals();
    } catch {
      setError('Failed to add goal');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (goalId: string) => {
    setError(null);
    try {
      const res = await fetch('/api/v1/crafting/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to remove goal');
        return;
      }

      await fetchGoals();
    } catch {
      setError('Failed to remove goal');
    }
  };

  return (
    <div>
      <form onSubmit={handleAdd}>
        <label htmlFor="goal-item-id">Item ID</label>
        <input
          id="goal-item-id"
          type="number"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="e.g. 19976"
          min="1"
        />

        <label htmlFor="goal-item-name">Item Name</label>
        <input
          id="goal-item-name"
          type="text"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="e.g. Mystic Coin"
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Adding…' : 'Add Goal'}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}

      {goals.length === 0 ? (
        <p>No crafting goals yet. Add one above.</p>
      ) : (
        <ul>
          {goals.map((goal) => (
            <li key={goal.goalId}>
              <span>
                {goal.itemName} (ID: {goal.itemId})
              </span>
              <button
                aria-label={`Remove ${goal.itemName}`}
                onClick={() => handleRemove(goal.goalId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
