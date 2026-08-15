// Data-access tier: AI model registry and stored predictions.
import { supabase } from '../supabase';

export async function listAiModels<T>(limit = 20): Promise<T[]> {
  const { data } = await supabase
    .from('ai_models')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as T[];
}

export async function listAiPredictions<T>(limit = 50): Promise<T[]> {
  const { data } = await supabase
    .from('ai_predictions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as T[];
}
