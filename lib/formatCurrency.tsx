import React from 'react';

/**
 * Format a copper value into GW2 gold/silver/copper display.
 * Returns a React element with colored coin icons matching GW2 convention.
 *
 * Examples:
 *   12345 → 1g 23s 45c
 *   99     → 99c
 *   -5432  → −54s 32c
 */
export function formatCoins(copper: number): React.ReactElement {
  const negative = copper < 0;
  const abs = Math.abs(copper);

  const gold = Math.floor(abs / 10000);
  const silver = Math.floor((abs % 10000) / 100);
  const cop = abs % 100;

  const parts: React.ReactElement[] = [];

  if (negative) {
    parts.push(
      <span key="neg" className="coin-negative">
        −
      </span>
    );
  }

  if (gold > 0) {
    parts.push(
      <span key="g" className="coin coin-gold">
        {gold}
        <span className="coin-icon">g</span>
      </span>
    );
  }

  if (silver > 0 || gold > 0) {
    parts.push(
      <span key="s" className="coin coin-silver">
        {gold > 0 ? String(silver).padStart(2, '0') : silver}
        <span className="coin-icon">s</span>
      </span>
    );
  }

  parts.push(
    <span key="c" className="coin coin-copper">
      {gold > 0 || silver > 0 ? String(cop).padStart(2, '0') : cop}
      <span className="coin-icon">c</span>
    </span>
  );

  return <span className="coins">{parts}</span>;
}

/**
 * Plain text version for contexts where React elements aren't usable (e.g., titles).
 */
export function formatCoinsText(copper: number): string {
  const negative = copper < 0;
  const abs = Math.abs(copper);

  const gold = Math.floor(abs / 10000);
  const silver = Math.floor((abs % 10000) / 100);
  const cop = abs % 100;

  const prefix = negative ? '−' : '';
  const parts: string[] = [];

  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) {
    parts.push(`${gold > 0 ? String(silver).padStart(2, '0') : silver}s`);
  }
  parts.push(`${gold > 0 || silver > 0 ? String(cop).padStart(2, '0') : cop}c`);

  return prefix + parts.join(' ');
}
