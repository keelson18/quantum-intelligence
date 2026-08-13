// ============================================================================
// Engine 11 — ML Intelligence Engine (Master Prompt §12.11, §23)
// Wraps model output with version, features, timestamp, probability and
// evaluation lineage. A prediction is NEVER presented as certainty.
// ============================================================================

import type { MLPrediction, Side, Timeframe } from '../types';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[10];

export interface MLResult {
  prediction: MLPrediction;
  implied: Side;
  modelVersion: string;
  /** Calibration bucket derived from reported confidence, not assumed truth. */
  calibration: 'high' | 'medium' | 'low';
  agreesWith: Side | null;
  isCertainty: false;
}

export function mlEngine(
  contextId: string,
  ml: MLPrediction | null,
  proposedSide: Side,
  symbol: string,
  timeframe: Timeframe,
): EngineResult<MLResult> {
  return runEngine<MLResult>(D.id, D.version, contextId, () => {
    if (!ml) {
      return {
        status: 'insufficient_data',
        result: null,
        confidence: 0,
        evidence: [{ key: 'model_available', value: false, note: `${symbol} ${timeframe}` }],
        warnings: ['No model prediction available — decision proceeds on deterministic evidence only'],
      };
    }

    const implied: Side = ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral';
    const evidence: Evidence[] = [
      { key: 'model_version', value: ml.model_version },
      { key: 'prediction', value: ml.prediction },
      { key: 'probability', value: Number(ml.probability.toFixed(4)) },
      { key: 'expected_move_pct', value: Number(ml.expected_move_pct.toFixed(3)) },
      { key: 'reported_confidence', value: ml.confidence },
      { key: 'pair', value: ml.pair },
      { key: 'timeframe', value: ml.timeframe },
    ];

    const agrees = proposedSide === 'neutral' ? null : implied === proposedSide ? proposedSide : null;
    const warnings = ['Model output is probabilistic evidence, not certainty'];
    if (proposedSide !== 'neutral' && implied !== 'neutral' && implied !== proposedSide) {
      warnings.push(`Model disagrees with the proposed ${proposedSide.toUpperCase()} setup`);
    }

    return {
      status: ml.confidence === 'low' ? 'degraded' : 'ok',
      result: { prediction: ml, implied, modelVersion: ml.model_version, calibration: ml.confidence, agreesWith: agrees, isCertainty: false },
      confidence: Math.abs(ml.probability - 0.5) * 2,
      evidence,
      warnings,
    };
  });
}
