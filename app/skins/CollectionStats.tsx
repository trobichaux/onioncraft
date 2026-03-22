'use client';

interface CollectionStatsProps {
  total: number;
  owned: number;
  loading: boolean;
  lastRefreshed?: string;
}

export default function CollectionStats({ total, owned, loading, lastRefreshed }: CollectionStatsProps) {
  if (loading) {
    return <p role="status">Loading collection stats…</p>;
  }

  if (total === 0) {
    return (
      <div className="info-box">
        <p>No collection data yet. Click <strong>Refresh Collection</strong> to load your skin data.</p>
      </div>
    );
  }

  const unowned = total - owned;
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

  return (
    <div>
      <dl>
        <dt>Total Skins</dt>
        <dd>{total}</dd>
        <dt>Owned</dt>
        <dd>{owned}</dd>
        <dt>Unowned</dt>
        <dd>{unowned}</dd>
        <dt>Completion</dt>
        <dd>{pct}%</dd>
        {lastRefreshed && (
          <>
            <dt>Last Refreshed</dt>
            <dd>{new Date(lastRefreshed).toLocaleString()}</dd>
          </>
        )}
      </dl>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Collection progress: ${pct}%`}
        style={{
          width: '100%',
          backgroundColor: '#e0e0e0',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: 20,
            backgroundColor: '#4caf50',
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}
