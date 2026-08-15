// Data-access tier: per-user application settings.
import { supabase } from '../supabase';

export interface UserSettingsRecord {
  default_timeframe: string;
  risk_tolerance: string;
  notif_price_alerts: boolean;
  notif_ai_signals: boolean;
  notif_risk_warnings: boolean;
  notif_strategy_triggers: boolean;
}

export async function getUserSettings(userId: string): Promise<UserSettingsRecord | null> {
  const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  return (data ?? null) as UserSettingsRecord | null;
}

export async function saveUserSettings(userId: string, settings: {
  defaultTimeframe: string;
  riskTolerance: string;
  theme: string;
  notifPriceAlerts: boolean;
  notifAISignals: boolean;
  notifRiskWarnings: boolean;
  notifStrategyTriggers: boolean;
}): Promise<void> {
  await supabase.from('user_settings').upsert({
    user_id: userId,
    default_timeframe: settings.defaultTimeframe,
    risk_tolerance: settings.riskTolerance,
    theme: settings.theme,
    notif_price_alerts: settings.notifPriceAlerts,
    notif_ai_signals: settings.notifAISignals,
    notif_risk_warnings: settings.notifRiskWarnings,
    notif_strategy_triggers: settings.notifStrategyTriggers,
    updated_at: new Date().toISOString(),
  });
}
