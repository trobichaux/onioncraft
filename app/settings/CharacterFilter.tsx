'use client';

import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';

interface FilterState {
  enabled: boolean;
  characters: string[];
}

export default function CharacterFilter() {
  const [filter, setFilter] = useState<FilterState>({ enabled: false, characters: [] });
  const [newCharacter, setNewCharacter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchFilter = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/settings/character-filter');
      const data = await res.json();
      setFilter({ enabled: data.enabled ?? false, characters: data.characters ?? [] });
    } catch {
      setError('Failed to load character filter');
    }
  }, []);

  useEffect(() => {
    fetchFilter();
  }, [fetchFilter]);

  async function saveFilter(updated: FilterState) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/settings/character-filter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
        return;
      }
      setFilter(updated);
    } catch {
      setError('Failed to save character filter');
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(e: ChangeEvent<HTMLInputElement>) {
    saveFilter({ ...filter, enabled: e.target.checked });
  }

  function handleAddCharacter(e: FormEvent) {
    e.preventDefault();
    const name = newCharacter.trim();
    if (!name) return;
    if (filter.characters.includes(name)) {
      setError('Character already in list');
      return;
    }
    setNewCharacter('');
    saveFilter({ ...filter, characters: [...filter.characters, name] });
  }

  function handleRemoveCharacter(name: string) {
    saveFilter({
      ...filter,
      characters: filter.characters.filter((c) => c !== name),
    });
  }

  return (
    <div>
      {error && (
        <div role="alert">
          <p>{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="character-filter-toggle">
          <input
            id="character-filter-toggle"
            type="checkbox"
            checked={filter.enabled}
            onChange={handleToggle}
            disabled={loading}
          />{' '}
          Enable character filtering
        </label>
      </div>

      {filter.enabled && (
        <>
          <ul>
            {filter.characters.map((name) => (
              <li key={name}>
                {name}{' '}
                <button
                  type="button"
                  onClick={() => handleRemoveCharacter(name)}
                  aria-label={`Remove character ${name}`}
                  disabled={loading}
                >
                  Remove
                </button>
              </li>
            ))}
            {filter.characters.length === 0 && <li>No characters added</li>}
          </ul>

          <form onSubmit={handleAddCharacter}>
            <label htmlFor="character-name-input">Character name</label>
            <input
              id="character-name-input"
              type="text"
              value={newCharacter}
              onChange={(e) => setNewCharacter(e.target.value)}
              placeholder="Enter character name"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !newCharacter.trim()}>
              Add Character
            </button>
          </form>
        </>
      )}
    </div>
  );
}
