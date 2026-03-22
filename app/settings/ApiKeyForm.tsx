'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

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
    <div>
      {status?.hasKey && (
        <div role="status" aria-live="polite">
          <p><strong>API Key:</strong> Configured ✓</p>
          <p>Permissions: {status.permissions?.join(', ')}</p>
          {status.validatedAt && (
            <p>Validated: {new Date(status.validatedAt).toLocaleString()}</p>
          )}
          <button type="button" onClick={handleDelete} disabled={loading}>
            Remove API Key
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label htmlFor="api-key-input">
          GW2 API Key <span aria-hidden="true">*</span>
        </label>
        <input
          id="api-key-input"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          required
          aria-required="true"
          placeholder="Enter your GW2 API key"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !keyInput}>
          {loading ? 'Validating...' : 'Save API Key'}
        </button>
      </form>

      {error && (
        <div role="alert">
          <p>{error}</p>
          {missingPermissions.length > 0 && (
            <p>Missing: {missingPermissions.join(', ')}</p>
          )}
        </div>
      )}

      {successPermissions && (
        <div role="status" aria-live="polite">
          <p>API key saved successfully!</p>
          <p>Permissions: {successPermissions.join(', ')}</p>
        </div>
      )}
    </div>
  );
}
