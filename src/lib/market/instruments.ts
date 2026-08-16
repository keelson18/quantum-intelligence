// ============================================================================
// Canonical instrument identity (GreenHill Foundation Plan §11).
//
// Provider symbols ("BTCUSDT") are NEVER the canonical identity. The canonical
// id is `BASE/QUOTE`. Adapters map canonical -> provider symbol.
// ============================================================================

import { ALL_INSTRUMENTS } from '../types';
import type { Instrument } from '../types';

/** Canonical id for an instrument, e.g. "BTC/USDT". */
export function canonicalId(instrument: Instrument): string {
  return `${instrument.base}/${instrument.quote}`;
}

/** Accepts a canonical id or a legacy provider symbol and returns the instrument. */
export function resolveInstrument(idOrSymbol: string): Instrument | undefined {
  const wanted = idOrSymbol.toUpperCase();
  return ALL_INSTRUMENTS.find(
    (i) => canonicalId(i) === wanted || i.symbol.toUpperCase() === wanted,
  );
}

/** Canonical id for any accepted input; falls back to the raw input. */
export function toCanonical(idOrSymbol: string): string {
  const instrument = resolveInstrument(idOrSymbol);
  return instrument ? canonicalId(instrument) : idOrSymbol.toUpperCase();
}

/** Split a canonical id into base/quote without a registry lookup. */
export function splitCanonical(canonical: string): { base: string; quote: string } {
  const [base = canonical, quote = ''] = canonical.toUpperCase().split('/');
  return { base, quote };
}
