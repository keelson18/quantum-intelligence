// ============================================================================
// Application tier — Paper Trading Engine (Roadmap Phase 10 / 11).
// Orchestrates the pure execution simulation (domain) and the paper repository
// (data access). No direct database calls and no real-money execution ever.
// ============================================================================

import { APP_CONFIG } from '../config/env';
import {
  simulateFill,
  simulateExitFill,
  realisedPnL,
  type ExecutionAssumptions,
} from './execution/simulation';
import * as repo from './data/paper.repo';
import { tradeReviewEngine, type ClosedTradeInput } from './engines/tradeReview';
import { ENGINE_REGISTRY } from './engines/registry';

export type OrderType = 'market' | 'limit' | 'stop';
export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'pending';
export type ExitReason = 'manual' | 'stop_loss' | 'take_profit' | 'trailing';

export interface PaperPosition {
  id: string;
  symbol: string;
  label: string;
  side: PositionSide;
  quantity: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  trailing_stop_pct: number | null;
  status: PositionStatus;
  order_type: OrderType;
  limit_price: number | null;
  strategy: string | null;
  ai_confidence: number | null;
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  notes: string | null;
  fees?: number;
  slippage?: number;
  requested_price?: number | null;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  label: string;
  side: PositionSide;
  quantity: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  strategy: string | null;
  ai_confidence: number | null;
  entry_time: string;
  exit_time: string;
  hold_duration_hours: number;
  exit_reason: ExitReason;
  fees?: number;
  slippage?: number;
  gross_pnl?: number | null;
}

export interface OpenOrderInput {
  symbol: string;
  label: string;
  side: PositionSide;
  quantity: number;
  order_type: OrderType;
  limit_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  trailing_stop_pct?: number | null;
  strategy?: string | null;
  ai_confidence?: number | null;
  notes?: string | null;
}

/** Execution assumptions come from configuration, never from literals. */
export function executionAssumptions(): ExecutionAssumptions {
  return {
    feeRate: APP_CONFIG.paperTrading.feeRate,
    slippageRate: APP_CONFIG.paperTrading.slippageRate,
  };
}

// ---- Position P&L calculation (unrealised, gross of exit fees) ----
export function computeUnrealizedPnL(
  pos: Pick<PaperPosition, 'side' | 'quantity' | 'entry_price'>,
  currentPrice: number,
): { pnl: number; pnlPct: number } {
  const dir = pos.side === 'long' ? 1 : -1;
  const pnl = (currentPrice - pos.entry_price) * dir * pos.quantity;
  const cost = pos.entry_price * pos.quantity;
  return { pnl, pnlPct: cost > 0 ? pnl / cost : 0 };
}

// ---- Open a new paper position ----
export async function openPosition(input: OpenOrderInput, currentPrice: number): Promise<PaperPosition | null> {
  const isMarket = input.order_type === 'market';
  const requested = isMarket ? currentPrice : (input.limit_price ?? currentPrice);
  const status: PositionStatus = isMarket ? 'open' : 'pending';

  const fill = simulateFill(
    {
      side: input.side,
      quantity: input.quantity,
      requestedPrice: requested,
      orderType: input.order_type,
    },
    executionAssumptions(),
  );

  const entryPrice = isMarket ? fill.fillPrice : requested;

  const position = await repo.insertPosition<PaperPosition>({
    symbol: input.symbol,
    label: input.label,
    side: input.side,
    quantity: input.quantity,
    entry_price: entryPrice,
    requested_price: requested,
    fees: isMarket ? fill.fees : 0,
    slippage: isMarket ? Math.abs(fill.slippage) : 0,
    stop_loss: input.stop_loss ?? null,
    take_profit: input.take_profit ?? null,
    trailing_stop_pct: input.trailing_stop_pct ?? null,
    status,
    order_type: input.order_type,
    limit_price: input.limit_price ?? null,
    strategy: input.strategy ?? null,
    ai_confidence: input.ai_confidence ?? null,
    notes: input.notes ?? null,
  });

  if (!position) return null;

  await repo.recordExecutionEvent({
    position_id: position.id,
    event_type: isMarket ? 'order_filled' : 'order_submitted',
    symbol: input.symbol,
    side: input.side,
    quantity: input.quantity,
    requested_price: requested,
    fill_price: isMarket ? entryPrice : null,
    fees: isMarket ? fill.fees : 0,
    slippage: isMarket ? Math.abs(fill.slippage) : 0,
    reason: input.order_type,
    metadata: { strategy: input.strategy ?? null, ai_confidence: input.ai_confidence ?? null },
  });

  return position;
}

// ---- Close a position at the current market price ----
export async function closePosition(
  positionId: string,
  currentPrice: number,
  exitReason: ExitReason = 'manual',
): Promise<PaperTrade | null> {
  const pos = await repo.getPosition<PaperPosition>(positionId);
  if (!pos) return null;

  const assumptions = executionAssumptions();
  const exitFill = simulateExitFill(
    { side: pos.side, quantity: pos.quantity, requestedPrice: currentPrice, orderType: 'market' },
    assumptions,
  );

  const entryFees = pos.fees ?? 0;
  const { grossPnl, netPnl, netPnlPct } = realisedPnL({
    side: pos.side,
    quantity: pos.quantity,
    entryPrice: pos.entry_price,
    exitPrice: exitFill.fillPrice,
    entryFees,
    exitFees: exitFill.fees,
  });

  const exitTime = new Date().toISOString();
  const holdHours = (Date.now() - new Date(pos.opened_at).getTime()) / 3_600_000;

  const trade = await repo.insertTrade<PaperTrade>({
    symbol: pos.symbol,
    label: pos.label,
    side: pos.side,
    quantity: pos.quantity,
    entry_price: pos.entry_price,
    exit_price: exitFill.fillPrice,
    pnl: netPnl,
    pnl_pct: netPnlPct,
    gross_pnl: grossPnl,
    fees: entryFees + exitFill.fees,
    slippage: (pos.slippage ?? 0) + Math.abs(exitFill.slippage),
    strategy: pos.strategy,
    ai_confidence: pos.ai_confidence,
    entry_time: pos.opened_at,
    exit_time: exitTime,
    hold_duration_hours: holdHours,
    exit_reason: exitReason,
  });

  if (!trade) return null;

  await repo.updatePosition(positionId, {
    status: 'closed',
    close_price: exitFill.fillPrice,
    closed_at: exitTime,
    pnl: netPnl,
    pnl_pct: netPnlPct,
    fees: entryFees + exitFill.fees,
  });

  await repo.recordExecutionEvent({
    position_id: positionId,
    trade_id: trade.id,
    event_type: 'position_closed',
    symbol: pos.symbol,
    side: pos.side,
    quantity: pos.quantity,
    requested_price: currentPrice,
    fill_price: exitFill.fillPrice,
    fees: exitFill.fees,
    slippage: Math.abs(exitFill.slippage),
    reason: exitReason,
    metadata: { gross_pnl: grossPnl, net_pnl: netPnl },
  });

  // Phase 11 — every closed paper trade produces a structured review.
  await reviewClosedTrade(trade, pos);

  return trade;
}

/** Runs Engine 17 on a single closed trade and persists the structured review. */
export async function reviewClosedTrade(trade: PaperTrade, pos?: PaperPosition | null): Promise<void> {
  const input: ClosedTradeInput = {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    entry: trade.entry_price,
    exit: trade.exit_price,
    stopLoss: pos?.stop_loss ?? null,
    takeProfit: pos?.take_profit ?? null,
    pnl: trade.pnl,
    pnlPct: trade.pnl_pct,
    exitReason: trade.exit_reason,
    strategy: trade.strategy,
    aiConfidence: trade.ai_confidence,
    holdHours: trade.hold_duration_hours,
  };

  const result = tradeReviewEngine(`trade:${trade.id}`, [input]);
  const review = result.result?.reviews[0];
  if (!review) return;

  await repo.upsertTradeReview({
    trade_id: trade.id,
    symbol: trade.symbol,
    outcome: review.outcome,
    failure_class: review.failureClass,
    thesis_assessment: review.thesisAssessment,
    execution_assessment: review.executionAssessment,
    risk_assessment: review.riskAssessment,
    lessons: review.lessons,
    r_multiple: review.rMultiple,
    engine_version: ENGINE_REGISTRY[16].version,
  });
}

// ---- Update trailing stop for a position ----
export async function updateTrailingStop(
  positionId: string,
  currentPrice: number,
  trailingPct: number,
  side: PositionSide,
): Promise<boolean> {
  const newStop = side === 'long'
    ? currentPrice * (1 - trailingPct / 100)
    : currentPrice * (1 + trailingPct / 100);

  const ok = await repo.updatePosition(positionId, { stop_loss: newStop }, 'open');
  if (ok) {
    await repo.recordExecutionEvent({
      position_id: positionId,
      event_type: 'stop_updated',
      symbol: '',
      side,
      requested_price: currentPrice,
      reason: 'trailing',
      metadata: { new_stop: newStop, trailing_pct: trailingPct },
    });
  }
  return ok;
}

// ---- Check open positions against current price for SL/TP/trailing exits ----
export function checkStopConditions(
  pos: PaperPosition,
  currentPrice: number,
): { shouldClose: boolean; reason: ExitReason } {
  if (pos.status !== 'open') return { shouldClose: false, reason: 'manual' };

  if (pos.side === 'long') {
    if (pos.stop_loss && currentPrice <= pos.stop_loss) return { shouldClose: true, reason: 'stop_loss' };
    if (pos.take_profit && currentPrice >= pos.take_profit) return { shouldClose: true, reason: 'take_profit' };
  } else {
    if (pos.stop_loss && currentPrice >= pos.stop_loss) return { shouldClose: true, reason: 'stop_loss' };
    if (pos.take_profit && currentPrice <= pos.take_profit) return { shouldClose: true, reason: 'take_profit' };
  }
  return { shouldClose: false, reason: 'manual' };
}

// ---- Check pending limit/stop orders for fill conditions ----
export function checkPendingOrder(
  pos: PaperPosition,
  currentPrice: number,
): { shouldFill: boolean; fillPrice: number } {
  if (pos.status !== 'pending' || !pos.limit_price) return { shouldFill: false, fillPrice: 0 };

  if (pos.order_type === 'limit') {
    if (pos.side === 'long' && currentPrice <= pos.limit_price) return { shouldFill: true, fillPrice: pos.limit_price };
    if (pos.side === 'short' && currentPrice >= pos.limit_price) return { shouldFill: true, fillPrice: pos.limit_price };
  } else if (pos.order_type === 'stop') {
    if (pos.side === 'long' && currentPrice >= pos.limit_price) return { shouldFill: true, fillPrice: currentPrice };
    if (pos.side === 'short' && currentPrice <= pos.limit_price) return { shouldFill: true, fillPrice: currentPrice };
  }
  return { shouldFill: false, fillPrice: 0 };
}

// ---- Fill a pending order ----
export async function fillPendingOrder(positionId: string, fillPrice: number): Promise<boolean> {
  const pos = await repo.getPosition<PaperPosition>(positionId);
  if (!pos) return false;

  const fill = simulateFill(
    {
      side: pos.side,
      quantity: pos.quantity,
      requestedPrice: fillPrice,
      orderType: pos.order_type,
    },
    executionAssumptions(),
  );

  const ok = await repo.updatePosition(
    positionId,
    {
      status: 'open',
      entry_price: fill.fillPrice,
      requested_price: fillPrice,
      fees: fill.fees,
      slippage: Math.abs(fill.slippage),
      opened_at: new Date().toISOString(),
    },
    'pending',
  );

  if (ok) {
    await repo.recordExecutionEvent({
      position_id: positionId,
      event_type: 'order_filled',
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
      requested_price: fillPrice,
      fill_price: fill.fillPrice,
      fees: fill.fees,
      slippage: Math.abs(fill.slippage),
      reason: pos.order_type,
    });
  }
  return ok;
}

// ---- Cancel a pending order ----
export async function cancelPendingOrder(positionId: string): Promise<boolean> {
  const pos = await repo.getPosition<PaperPosition>(positionId);
  const ok = await repo.deletePendingPosition(positionId);
  if (ok && pos) {
    await repo.recordExecutionEvent({
      position_id: positionId,
      event_type: 'order_cancelled',
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
      requested_price: pos.limit_price,
      reason: 'cancelled_by_user',
    });
  }
  return ok;
}

// ---- Reads ----
export function fetchOpenPositions(): Promise<PaperPosition[]> {
  return repo.listPositionsByStatus<PaperPosition>('open', 'opened_at');
}

export function fetchPendingOrders(): Promise<PaperPosition[]> {
  return repo.listPositionsByStatus<PaperPosition>('pending', 'created_at');
}

export function fetchTradeHistory(limit = 100): Promise<PaperTrade[]> {
  return repo.listTrades<PaperTrade>(limit);
}

export function fetchExecutionAudit(limit = 200) {
  return repo.listExecutionEvents<Record<string, unknown>>(limit);
}

export function fetchTradeReviews(limit = 100) {
  return repo.listTradeReviews(limit);
}
