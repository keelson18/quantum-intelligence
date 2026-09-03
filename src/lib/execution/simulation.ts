// ============================================================================
// Domain tier — order-fill simulation (Roadmap Phase 10).
// Pure functions: slippage assumptions, fee model and fill pricing. No I/O,
// no environment reads at module scope, no persistence.
// ============================================================================

export interface ExecutionAssumptions {
  /** Taker fee applied to notional on entry and on exit, as a fraction. */
  feeRate: number;
  /** Adverse price movement applied to market fills, as a fraction. */
  slippageRate: number;
}

export interface SimulatedFill {
  /** Price the caller asked for (reference/mark price). */
  requestedPrice: number;
  /** Price actually filled after slippage. */
  fillPrice: number;
  /** Absolute per-unit slippage cost. */
  slippage: number;
  /** Fee charged on the filled notional. */
  fees: number;
}

/**
 * Market orders cross the spread and pay slippage in the adverse direction.
 * Limit orders fill at their stated price (they are the resting side) but
 * still pay fees. Stop orders behave like market orders once triggered.
 */
export function simulateFill(
  params: {
    side: 'long' | 'short';
    quantity: number;
    requestedPrice: number;
    orderType: 'market' | 'limit' | 'stop';
    /** Entry fills pay slippage against the trader; exits do too. */
    crossesSpread?: boolean;
  },
  assumptions: ExecutionAssumptions,
): SimulatedFill {
  const { side, quantity, requestedPrice, orderType } = params;
  const crosses = params.crossesSpread ?? orderType !== 'limit';
  const dir = side === 'long' ? 1 : -1;
  const slipPerUnit = crosses ? requestedPrice * assumptions.slippageRate : 0;
  const fillPrice = requestedPrice + dir * slipPerUnit;
  const fees = Math.abs(fillPrice * quantity) * assumptions.feeRate;

  return {
    requestedPrice,
    fillPrice,
    slippage: slipPerUnit * quantity,
    fees,
  };
}

/** Exit fills move against the position, so the direction inverts. */
export function simulateExitFill(
  params: { side: 'long' | 'short'; quantity: number; requestedPrice: number; orderType: 'market' | 'limit' | 'stop' },
  assumptions: ExecutionAssumptions,
): SimulatedFill {
  const inverse = params.side === 'long' ? 'short' : 'long';
  return simulateFill({ ...params, side: inverse }, assumptions);
}

/** Realised P&L net of both legs' fees. */
export function realisedPnL(
  params: {
    side: 'long' | 'short';
    quantity: number;
    entryPrice: number;
    exitPrice: number;
    entryFees: number;
    exitFees: number;
  },
): { grossPnl: number; netPnl: number; netPnlPct: number } {
  const dir = params.side === 'long' ? 1 : -1;
  const grossPnl = (params.exitPrice - params.entryPrice) * dir * params.quantity;
  const netPnl = grossPnl - params.entryFees - params.exitFees;
  const cost = Math.abs(params.entryPrice * params.quantity);
  return { grossPnl, netPnl, netPnlPct: cost > 0 ? netPnl / cost : 0 };
}
