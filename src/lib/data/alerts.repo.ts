// Data-access tier: alert rules. UI never talks to the database directly.
import { supabase } from '../supabase';

export interface AlertRuleRecord {
  id: string;
  type: string;
  symbol: string;
  threshold: number | null;
  severity: string;
  message: string;
  enabled: boolean;
}

export async function listAlertRules(userId: string): Promise<AlertRuleRecord[]> {
  const { data } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as AlertRuleRecord[];
}

export async function createAlertRule(userId: string, rule: {
  type: string; symbol: string; threshold: number | null; severity: string; message: string;
}): Promise<void> {
  await supabase.from('alert_rules').insert({ user_id: userId, ...rule });
}

export async function setAlertRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await supabase.from('alert_rules').update({ enabled }).eq('id', id);
}

export async function deleteAlertRule(id: string): Promise<void> {
  await supabase.from('alert_rules').delete().eq('id', id);
}
