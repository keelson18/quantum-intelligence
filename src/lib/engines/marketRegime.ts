// ============================================================================
// Engine 7 — Market Regime Engine (Master Prompt §12.7, §19)
// Classifies the environment (trending / ranging / high-low volatility /
// breakout / transition / uncertain) with a confidence that must influence
// strategy selection.
// ============================================================================

import type { Candle, GranularRegime, Regime } from '../types';
import { classifyGranularRegime, granularRegimeLabel } from '../institutionalEngine';
import { adx as adxSeries, atr } from '../indicators';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[6];

export type RegimeClass = 'trending' | 'ranging' | 'high_volatility' | 'low_volatility' | 'breakout' | 'transition' | 'uncertain';

export interface RegimeResult {
  regime: Regime;
  granular: GranularRegime;
  label: string;
  regimeClass: RegimeClass;
  /** 0..1 — low stability means the regime is transitioning. */
  stability: number;
  adx: number;
  atrPct: number;
}

export function regimeEngine(
  contextId: string,
  candles: Candle[],
  baseRegime: Regime,
): EngineResult<RegimeResult> {
  return runEngine<RegimeResult>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history to classify regime'] };
    }

    const adxArr = adxSeries(candles, 14);
    const adxVal = adxArr[adxArr.length - 1] ?? 0;
    const atrArr = atr(candles, 14);
    const close = candles[candles.length - 1].close;
    const atrPct = close > 0 ? ((atrArr[atrArr.length - 1] ?? 0) / close) * 100 : 0;
    const granular = classifyGranularRegime(candles, baseRegime, adxVal);

    // Stability: how consistently the granular regime held over recent windows.
    const samples: GranularRegime[] = [];
    for (const back of [0, 10, 20, 30]) {
      const slice = candles.slice(0, candles.length - back);
      if (slice.length < 60) continue;
      const a = adxSeries(slice, 14);
      samples.push(classifyGranularRegime(slice, baseRegime, a[a.length - 1] ?? 0));
    }
    const stability = samples.length ? samples.filter((s) => s === granular).length / samples.length : 0;

    let regimeClass: RegimeClass;
    if (granular === 'breakout') regimeClass = 'breakout';
    else if (granular === 'high_volatility') regimeClass = 'high_volatility';
    else if (granular === 'low_volatility') regimeClass = 'low_volatility';
    else if (granular === 'range_bound' || granular === 'accumulation' || granular === 'distribution') regimeClass = 'ranging';
    else if (adxVal >= 20) regimeClass = 'trending';
    else regimeClass = 'uncertain';
    if (stability < 0.5 && regimeClass !== 'uncertain') regimeClass = 'transition';

    const evidence: Evidence[] = [
      { key: 'base_regime', value: baseRegime },
      { key: 'granular_regime', value: granular, note: granularRegimeLabel(granular) },
      { key: 'regime_class', value: regimeClass },
      { key: 'adx', value: Number(adxVal.toFixed(2)) },
      { key: 'atr_pct', value: Number(atrPct.toFixed(3)) },
      { key: 'stability', value: Number(stability.toFixed(2)), note: `${samples.length} historical windows sampled` },
    ];

    return {
      status: regimeClass === 'uncertain' ? 'degraded' : 'ok',
      result: { regime: baseRegime, granular, label: granularRegimeLabel(granular), regimeClass, stability, adx: adxVal, atrPct },
      confidence: Math.max(0, Math.min(1, stability * (regimeClass === 'uncertain' ? 0.4 : 1))),
      evidence,
      warnings: stability < 0.5 ? ['Regime is unstable — treat strategy selection as provisional'] : [],
    };
  });
}
