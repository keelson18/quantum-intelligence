import { supabase } from './supabase';

// ============================================================================
// Paper Trading Engine
// Simulated order execution, position management, SL/TP/trailing stop.
// No real money is ever at risk — this is a training/intelligence tool only.
// ============================================================================

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

// ---- Position P&L calculation ----
export function computeUnrealizedPnL(
  pos: Pick<PaperPosition, 'side' | 'quantity' | 'entry_price'>,
  currentPrice: number,
): { pnl: number; pnlPct: number } {
  const dir = pos.side === 'long' ? 1 : -1;
  const pnl = (currentPrice - pos.entry_price) * dir * pos.quantity;
  const cost = pos.entry_price * pos.quantity;
  const pnlPct = cost > 0 ? pnl / cost : 0;
  return { pnl, pnlPct };
}

// ---- Open a new paper position ----
export async function openPosition(input: OpenOrderInput, currentPrice: number): Promise<PaperPosition | null> {
  const entryPrice = input.order_type === 'market' ? currentPrice : (input.limit_price ?? currentPrice);
  const status: PositionStatus = input.order_type === 'market' ? 'open' : 'pending';

  const row = {
    symbol: input.symbol,
    label: input.label,
    side: input.side,
    quantity: input.quantity,
    entry_price: entryPrice,
    stop_loss: input.stop_loss ?? null,
    take_profit: input.take_profit ?? null,
    trailing_stop_pct: input.trailing_stop_pct ?? null,
    status,
    order_type: input.order_type,
    limit_price: input.limit_price ?? null,
    strategy: input.strategy ?? null,
    ai_confidence: input.ai_confidence ?? null,
    notes: input.notes ?? null,
  };

  const { data, error } = await supabase
    .from('paper_positions')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('Failed to open paper position:', error.message);
    return null;
  }
  return data as PaperPosition;
}

// ---- Close a position at the current market price ----
export async function closePosition(
  positionId: string,
  currentPrice: number,
  exitReason: ExitReason = 'manual',
): Promise<PaperTrade | null> {
  const { data: pos, error: fetchErr } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('id', positionId)
    .single();

  if (fetchErr || !pos) {
    console.error('Position not found:', fetchErr?.message);
    return null;
  }

  const { pnl, pnlPct } = computeUnrealizedPnL(pos as PaperPosition, currentPrice);
  const exitTime = new Date().toISOString();
  const entryTime = new Date(pos.opened_at).getTime();
  const holdHours = (Date.now() - entryTime) / 3_600_000;

  const tradeRow = {
    symbol: pos.symbol,
    label: pos.label,
    side: pos.side,
    quantity: pos.quantity,
    entry_price: pos.entry_price,
    exit_price: currentPrice,
    pnl,
    pnl_pct: pnlPct,
    strategy: pos.strategy,
    ai_confidence: pos.ai_confidence,
    entry_time: pos.opened_at,
    exit_time: exitTime,
    hold_duration_hours: holdHours,
    exit_reason: exitReason,
  };

  const { data: trade, error: tradeErr } = await supabase
    .from('paper_trades')
    .insert(tradeRow)
    .select()
    .single();

  if (tradeErr) {
    console.error('Failed to record paper trade:', tradeErr.message);
    return null;
  }

  await supabase
    .from('paper_positions')
    .update({ status: 'closed', close_price: currentPrice, closed_at: exitTime, pnl, pnl_pct: pnlPct })
    .eq('id', positionId);

  return trade as PaperTrade;
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

  const { error } = await supabase
    .from('paper_positions')
    .update({ stop_loss: newStop })
    .eq('id', positionId)
    .eq('status', 'open');

  return !error;
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
  const { error } = await supabase
    .from('paper_positions')
    .update({ status: 'open', entry_price: fillPrice, opened_at: new Date().toISOString() })
    .eq('id', positionId)
    .eq('status', 'pending');
  return !error;
}

// ---- Cancel a pending order ----
export async function cancelPendingOrder(positionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('paper_positions')
    .delete()
    .eq('id', positionId)
    .eq('status', 'pending');
  return !error;
}

// ---- Fetch all open positions ----
export async function fetchOpenPositions(): Promise<PaperPosition[]> {
  const { data, error } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as PaperPosition[];
}

// ---- Fetch all pending orders ----
export async function fetchPendingOrders(): Promise<PaperPosition[]> {
  const { data, error } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as PaperPosition[];
}

// ---- Fetch closed trade history ----
export async function fetchTradeHistory(limit = 100): Promise<PaperTrade[]> {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .order('exit_time', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as PaperTrade[];
}
