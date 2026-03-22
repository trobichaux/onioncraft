'use client';

interface SkinRefreshButtonProps {
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  lastRefreshed?: string;
}

export default function SkinRefreshButton({
  onRefresh,
  refreshing,
  lastRefreshed,
}: SkinRefreshButtonProps) {
  return (
    <div>
      <button type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing… this may take a while' : 'Refresh Collection'}
      </button>

      <div aria-live="polite" role="status">
        {lastRefreshed && !refreshing && (
          <p>
            Last refreshed: {new Date(lastRefreshed).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
