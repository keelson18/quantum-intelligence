// Data-access tier: persisted risk state.
import { supabase } from '../supabase';

export interface RiskStateRecord {
  equity: number;
  starting_equity: number;
  daily_loss_used: number | null;
  max_daily_loss_pct: number | null;
  max_drawdown_pct: number | null;
  peak_equity: number;
  current_exposure_pct: number | null;
  max_exposure_pct: number | null;
}

export async function getRiskState(userId: string): Promise<RiskStateRecord | null> {
  const { data } = await supabase.from('risk_state').select('*').eq('user_id', userId).maybeSingle();
  return (data ?? null) as RiskStateRecord | null;
}

export async function saveRiskState(userId: string, state: {
  equity: number;
  startingEquity: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxExposurePct: number;
  peakEquity: number;
}): Promise<void> {
  await supabase.from('risk_state').upsert({
    user_id: userId,
    equity: state.equity,
    starting_equity: state.startingEquity,
    max_daily_loss_pct: state.maxDailyLossPct,
    max_drawdown_pct: state.maxDrawdownPct,
    max_exposure_pct: state.maxExposurePct,
    peak_equity: state.peakEquity,
    updated_at: new Date().toISOString(),
  });
}
