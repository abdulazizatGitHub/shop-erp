import { useEffect, useState } from 'react';
import { ipc } from '../../lib/ipc.js';

export interface UseActiveBrandsResult {
  /** [] while loading or on error — "Other" is always available regardless, so intake is never blocked. */
  readonly brands: readonly string[];
  readonly error: string | null;
}

/**
 * P16-2 — replaces the old hardcoded BRAND_OPTIONS constant with a live
 * `brand:list` read (active, non-deleted brands only). If the read fails,
 * `brands` stays [] and `error` is set — callers must still render their
 * brand picker with "Other" available, never block the form on this.
 */
export function useActiveBrands(): UseActiveBrandsResult {
  const [brands, setBrands] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.brand
      .list()
      .then((options) => {
        setBrands(options.map((o) => o.name));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load brands');
      });
  }, []);

  return { brands, error };
}
