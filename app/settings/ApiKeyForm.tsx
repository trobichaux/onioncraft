'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

const REQUIRED_PERMISSIONS = ['account', 'inventories', 'wallet', 'unlocks', 'characters'];

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  account: 'Basic account info and guild memberships',
  inventories: 'Bank, material storage, and character inventories',
  wallet: 'Currencies (gold, karma, spirit shards, etc.)',
  unlocks: 'Unlocked skins, dyes, recipes, and minis',
  characters: 'Character names, levels, and crafting disciplines',
};

interface ApiKeyStatus {
  hasKey: boolean;
  permissions?: string[];
  validatedAt?: string;
}

interface PostResult {
  success?: boolean;
  permissions?: string[];
  error?: string;
  missingPermissions?: string[];
}

export default function ApiKeyForm() {
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successPermissions, setSuccessPermissions] = useState<string[] | null>(null);
  const [initStatus, setInitStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [initResult, setInitResult] = useState<{
    knownRecipes: number;
    characters: number;
    newRecipesCached: number;
    newItemsCached: number;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/settings/api-key');
      const data: ApiKeyStatus = await res.json();
      setStatus(data);
    } catch {
      setError('Failed to load API key status');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMissingPermissions([]);
    setSuccessPermissions(null);

    try {
      const res = await fetch('/api/v1/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput }),
      });
      const data: PostResult = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Unknown error');
        if (data.missingPermissions) {
          setMissingPermissions(data.missingPermissions);
        }
      } else {
        setSuccessPermissions(data.permissions ?? []);
        setKeyInput('');
        await fetchStatus();

        // Trigger account initialization in the background
        setInitStatus('loading');
        try {
          const initRes = await fetch('/api/v1/account/initialize', { method: 'POST' });
          if (initRes.ok) {
            const initData = await initRes.json();
            setInitStatus('done');
            setInitResult(initData);
          } else {
            setInitStatus('error');
          }
        } catch {
          setInitStatus('error');
        }
      }
    } catch {
      setError('Failed to save API key');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setError(null);
    setSuccessPermissions(null);

    try {
      await fetch('/api/v1/settings/api-key', { method: 'DELETE' });
      await fetchStatus();
    } catch {
      setError('Failed to delete API key');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="api-key-section">
      <div className="permissions-info">
        <h3>Required Permissions</h3>
        <p className="permissions-help">
          Create an API key at{' '}
          <a
            href="https://account.arena.net/applications"
            target="_blank"
            rel="noopener noreferrer"
          >
            account.arena.net/applications
          </a>{' '}
          with these permissions enabled:
        </p>
        <ul className="permissions-list">
          {REQUIRED_PERMISSIONS.map((perm) => {
            const hasIt = status?.permissions?.includes(perm);
            const isMissing = missingPermissions.includes(perm);
            return (
              <li key={perm} className={isMissing ? 'perm-missing' : hasIt ? 'perm-granted' : ''}>
                <span className="perm-icon" aria-hidden="true">
                  {isMissing ? '✗' : hasIt ? '✓' : '○'}
                </span>
                <strong>{perm}</strong>
                <span className="perm-desc"> — {PERMISSION_DESCRIPTIONS[perm]}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {status?.hasKey && (
        <div className="key-status" role="status" aria-live="polite">
          <p>
            <span className="status-badge status-configured">✓ Configured</span>
          </p>
          {status.validatedAt && (
            <p className="key-meta">Validated: {new Date(status.validatedAt).toLocaleString()}</p>
          )}
          <button type="button" className="btn-danger" onClick={handleDelete} disabled={loading}>
            Remove API Key
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="key-form">
        <label htmlFor="api-key-input">
          GW2 API Key <span aria-hidden="true">*</span>
        </label>
        <div className="key-input-row">
          <input
            id="api-key-input"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            required
            aria-required="true"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX..."
            disabled={loading}
          />
          <button type="submit" disabled={loading || !keyInput}>
            {loading ? 'Validating...' : 'Save API Key'}
          </button>
        </div>
      </form>

      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          {missingPermissions.length > 0 && (
            <p>
              Missing permissions: <strong>{missingPermissions.join(', ')}</strong>
            </p>
          )}
        </div>
      )}

      {successPermissions && (
        <div className="success" role="status" aria-live="polite">
          <p>✓ API key saved and validated successfully!</p>
          {initStatus === 'loading' && (
            <p>⏳ Initializing account data (recipes, items, characters)…</p>
          )}
          {initStatus === 'done' && initResult && (
            <p>
              ✓ Cached {initResult.knownRecipes} recipes, {initResult.newItemsCached} items,{' '}
              {initResult.characters} characters. Ready for crafting!
            </p>
          )}
          {initStatus === 'error' && (
            <p>
              ⚠️ Account initialization failed. Visit the <a href="/crafting">Crafting page</a> to
              retry.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
