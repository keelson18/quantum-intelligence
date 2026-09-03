// ============================================================================
// Data-access tier — paper trading persistence (positions, trades, execution
// audit, trade reviews). No domain rules live here: callers own the maths.
// ============================================================================
import { supabase } from '../supabase';

export interface ExecutionEventRow {
  position_id?: string | null;
  trade_id?: string | null;
  event_type: 'order_submitted' | 'order_filled' | 'order_cancelled' | 'stop_updated' | 'position_closed';
  symbol: string;
  side?: 'long' | 'short' | null;
  quantity?: number | null;
  requested_price?: number | null;
  fill_price?: number | null;
  fees?: number;
  slippage?: number;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TradeReviewRow {
  id: string;
  trade_id: string;
  symbol: string;
  outcome: 'win' | 'loss' | 'scratch';
  failure_class: string;
  thesis_assessment: string;
  execution_assessment: string;
  risk_assessment: string;
  lessons: string[];
  r_multiple: number | null;
  engine_version: string;
  created_at: string;
}

// ---- Positions ----
export async function insertPosition<T>(row: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.from('paper_positions').insert(row).select().single();
  if (error) {
    console.error('paper.repo insertPosition:', error.message);
    return null;
  }
  return data as T;
}

export async function getPosition<T>(id: string): Promise<T | null> {
  const { data, error } = await supabase.from('paper_positions').select('*').eq('id', id).single();
  if (error) return null;
  return data as T;
}

export async function updatePosition(id: string, patch: Record<string, unknown>, status?: string): Promise<boolean> {
  let q = supabase.from('paper_positions').update(patch).eq('id', id);
  if (status) q = q.eq('status', status);
  const { error } = await q;
  return !error;
}

export async function deletePendingPosition(id: string): Promise<boolean> {
  const { error } = await supabase.from('paper_positions').delete().eq('id', id).eq('status', 'pending');
  return !error;
}

export async function listPositionsByStatus<T>(status: string, orderColumn: string): Promise<T[]> {
  const { data, error } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('status', status)
    .order(orderColumn, { ascending: false });
  if (error) return [];
  return (data ?? []) as T[];
}

// ---- Trades ----
export async function insertTrade<T>(row: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.from('paper_trades').insert(row).select().single();
  if (error) {
    console.error('paper.repo insertTrade:', error.message);
    return null;
  }
  return data as T;
}

export async function listTrades<T>(limit = 100): Promise<T[]> {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .order('exit_time', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as T[];
}

// ---- Execution audit ----
export async function recordExecutionEvent(row: ExecutionEventRow): Promise<void> {
  const { error } = await supabase.from('execution_events').insert(row);
  if (error) console.error('paper.repo recordExecutionEvent:', error.message);
}

export async function listExecutionEvents<T>(limit = 200): Promise<T[]> {
  const { data, error } = await supabase
    .from('execution_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as T[];
}

// ---- Trade reviews ----
export async function upsertTradeReview(row: Omit<TradeReviewRow, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('trade_reviews').insert(row);
  if (error && !/duplicate key/i.test(error.message)) {
    console.error('paper.repo upsertTradeReview:', error.message);
  }
}

export async function listTradeReviews(limit = 100): Promise<TradeReviewRow[]> {
  const { data, error } = await supabase
    .from('trade_reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as TradeReviewRow[];
}
