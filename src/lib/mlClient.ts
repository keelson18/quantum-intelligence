import type { MLPrediction, Timeframe } from './types';
import { supabase } from './supabase';
import { predictML, askCoachFn } from './ai.functions';

// Ask the server to run a fresh ML prediction. Falls back gracefully on error.
export async function fetchMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  try {
    const res = await predictML({ data: { pair: symbol, timeframe } });
    if ('error' in res || !res.prediction) return null;
    const data = res.prediction;
    return {
      pair: data.pair,
      timeframe: data.timeframe as Timeframe,
      prediction: data.prediction,
      probability: data.probability,
      expected_move_pct: data.expected_move_pct,
      model_version: data.model_version,
      confidence: data.confidence,
    };
  } catch (e) {
    console.warn('ML predict error', e);
    return null;
  }
}

// Fetch the most recent cached ML prediction from the database (for instant UI load).
export async function fetchCachedMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  const { data } = await supabase
    .from('ml_predictions')
    .select('*')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .maybeSingle();
  if (!data) return null;
  return {
    pair: data.symbol,
    timeframe: data.timeframe,
    prediction: data.prediction,
    probability: Number(data.probability),
    expected_move_pct: Number(data.expected_move_pct),
    model_version: data.model_version,
    confidence: data.confidence,
  };
}

export interface CoachMessage { role: 'user' | 'assistant'; content: string }

export async function askCoach(messages: CoachMessage[]): Promise<string> {
  const res = await askCoachFn({ data: { messages } });
  if ('error' in res && res.error) throw new Error(res.error);
  return ('reply' in res ? res.reply : null) ?? 'No response.';
}
