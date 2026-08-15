// Data-access tier: cached backtest runs.
import { supabase } from '../supabase';
import type { BacktestMetrics } from '../types';

export interface SavedBacktestRun {
  id: string;
  symbol: string;
  timeframe: string;
  created_at: string;
  metrics: BacktestMetrics;
}

export async function listBacktestRuns(userId: string, limit = 5): Promise<SavedBacktestRun[]> {
  const { data } = await supabase
    .from('backtest_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    symbol: r.symbol as string,
    timeframe: r.timeframe as string,
    created_at: r.created_at as string,
    metrics: r.metrics as BacktestMetrics,
  }));
}

export async function saveBacktestRun(userId: string, run: {
  symbol: string;
  timeframe: string;
  strategy: string;
  metrics: unknown;
  walkForward: unknown;
  monteCarlo: unknown;
}): Promise<void> {
  await supabase.from('backtest_results').upsert({
    user_id: userId,
    symbol: run.symbol,
    timeframe: run.timeframe,
    strategy: run.strategy,
    metrics: run.metrics as Record<string, unknown>,
    walk_forward: run.walkForward as Record<string, unknown>,
    monte_carlo: run.monteCarlo as Record<string, unknown>,
    last_run: new Date().toISOString(),
  });
}
