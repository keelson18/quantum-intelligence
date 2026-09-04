import { describe, it, expect } from 'vitest';
import { simulateFill, simulateExitFill, realisedPnL } from './simulation';

const A = { feeRate: 0.001, slippageRate: 0.0005 };

describe('execution simulation', () => {
  it('applies adverse slippage to market entries', () => {
    const long = simulateFill({ side: 'long', quantity: 2, requestedPrice: 100, orderType: 'market' }, A);
    expect(long.fillPrice).toBeCloseTo(100.05);
    expect(long.fees).toBeCloseTo(100.05 * 2 * 0.001);

    const short = simulateFill({ side: 'short', quantity: 2, requestedPrice: 100, orderType: 'market' }, A);
    expect(short.fillPrice).toBeCloseTo(99.95);
  });

  it('fills limit orders at the stated price but still charges fees', () => {
    const fill = simulateFill({ side: 'long', quantity: 1, requestedPrice: 100, orderType: 'limit' }, A);
    expect(fill.fillPrice).toBe(100);
    expect(fill.slippage).toBe(0);
    expect(fill.fees).toBeCloseTo(0.1);
  });

  it('inverts slippage direction on exits', () => {
    const exit = simulateExitFill({ side: 'long', quantity: 1, requestedPrice: 100, orderType: 'market' }, A);
    expect(exit.fillPrice).toBeCloseTo(99.95);
  });

  it('nets fees out of realised pnl', () => {
    const r = realisedPnL({ side: 'long', quantity: 1, entryPrice: 100, exitPrice: 110, entryFees: 0.1, exitFees: 0.11 });
    expect(r.grossPnl).toBeCloseTo(10);
    expect(r.netPnl).toBeCloseTo(9.79);
    expect(r.netPnlPct).toBeCloseTo(0.0979);
  });
});
