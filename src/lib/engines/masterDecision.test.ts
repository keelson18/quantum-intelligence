import { expect, test } from 'vitest';
import { runMasterDecision } from '@/lib/engines/masterDecision';
import type { Candle } from '@/lib/types';

function gen(n: number, now: number): Candle[] {
  const out: Candle[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p *= 1 + (Math.sin(i / 7) * 0.004) + 0.0008;
    const time = now - (n - 1 - i) * 3600_000;
    out.push({ time, open: p * 0.999, high: p * 1.004, low: p * 0.996, close: p, volume: 1000 + (i % 17) * 30 });
  }
  return out;
}

test('healthy data yields a valid decision', () => {
  const now = Date.now();
  const md = runMasterDecision({ candles: gen(400, now), symbol: 'BTCUSDT', timeframe: '1h', now });
  expect(['BUY','SELL','HOLD','WATCH','NO_TRADE']).toContain(md.action);
  expect(md.engines.dataQuality.result!.score).toBeGreaterThan(50);
  expect(md.confidence).toBeGreaterThanOrEqual(0);
  expect(md.engines.riskGate).not.toBeNull();
});

test('stale/empty data is NO_TRADE, never a fabricated signal', () => {
  const md = runMasterDecision({ candles: [], symbol: 'BTCUSDT', timeframe: '1h' });
  expect(md.action).toBe('NO_TRADE');
  expect(md.positionMultiplier).toBe(0);
  const stale = runMasterDecision({ candles: gen(400, Date.now() - 30 * 24 * 3600_000), symbol: 'BTCUSDT', timeframe: '1h' });
  expect(['NO_TRADE','WATCH','HOLD']).toContain(stale.action);
});
