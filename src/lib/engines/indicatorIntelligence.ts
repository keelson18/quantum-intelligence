// ============================================================================
// Engine 6 — Indicator Intelligence Engine (Master Prompt §12.6, §18)
// Trend, momentum, volatility and volume indicators are EVIDENCE, never
// independent authorities. Readings are interpreted through the active regime
// (institutional interpretIndicatorByRegime).
// ============================================================================

import type { Candle, GranularRegime, IndicatorSet } from '../types';
import { computeIndicators } from '../indicators';
import { interpretIndicatorByRegime } from '../institutionalEngine';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[5];

export interface IndicatorReading {
  name: string;
  value: number;
  group: 'trend' | 'momentum' | 'volatility' | 'volume';
  bias: 'bullish' | 'bearish' | 'neutral';
  note: string;
}

export interface IndicatorResult {
  indicators: IndicatorSet;
  readings: IndicatorReading[];
  bullishWeight: number;
  bearishWeight: number;
  regimeInterpretations: string[];
}

export function indicatorEngine(
  contextId: string,
  candles: Candle[],
  regime: GranularRegime | null,
): EngineResult<IndicatorResult> {
  return runEngine<IndicatorResult>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history for indicator computation'] };
    }

    const ind = computeIndicators(candles);
    const i = candles.length - 1;
    const close = candles[i].close;
    const readings: IndicatorReading[] = [];

    const push = (name: string, value: number, group: IndicatorReading['group'], bias: IndicatorReading['bias'], note: string) => {
      if (Number.isFinite(value)) readings.push({ name, value: Number(value.toFixed(4)), group, bias, note });
    };

    const rsi = ind.rsi[i];
    push('RSI(14)', rsi, 'momentum', rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral', rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral zone');
    const hist = ind.macd.hist[i];
    push('MACD hist', hist, 'momentum', hist > 0 ? 'bullish' : hist < 0 ? 'bearish' : 'neutral', 'Momentum sign');
    const adxVal = ind.adx[i];
    push('ADX(14)', adxVal, 'trend', 'neutral', adxVal > 25 ? 'Trending market' : 'Weak/absent trend');
    push('ATR(14)', ind.atr[i], 'volatility', 'neutral', 'Volatility unit used for stops and sizing');
    const ema20 = ind.ema[20]?.[i];
    const ema50 = ind.ema[50]?.[i];
    push('EMA20', ema20, 'trend', close > ema20 ? 'bullish' : 'bearish', 'Price vs fast trend');
    push('EMA50', ema50, 'trend', close > ema50 ? 'bullish' : 'bearish', 'Price vs intermediate trend');
    push('BB width', ind.bollinger.width[i], 'volatility', 'neutral', 'Band expansion / compression');
    push('OBV', ind.obv[i], 'volume', ind.obv[i] > (ind.obv[i - 5] ?? ind.obv[i]) ? 'bullish' : 'bearish', 'Cumulative volume flow');
    push('MFI(14)', ind.mfi[i], 'volume', ind.mfi[i] > 50 ? 'bullish' : 'bearish', 'Money flow');

    const regimeInterpretations: string[] = [];
    if (regime) {
      if (rsi > 70) regimeInterpretations.push(interpretIndicatorByRegime('rsi_overbought', regime).reason);
      if (rsi < 30) regimeInterpretations.push(interpretIndicatorByRegime('rsi_oversold', regime).reason);
      if (hist > 0) regimeInterpretations.push(interpretIndicatorByRegime('macd_bullish', regime).reason);
      if (hist < 0) regimeInterpretations.push(interpretIndicatorByRegime('macd_bearish', regime).reason);
    }

    const bullishWeight = readings.filter((r) => r.bias === 'bullish').length;
    const bearishWeight = readings.filter((r) => r.bias === 'bearish').length;
    const directional = bullishWeight + bearishWeight;

    const evidence: Evidence[] = readings.map((r) => ({ key: r.name, value: r.value, weight: 1 / Math.max(1, readings.length), note: `${r.bias} — ${r.note}` }));

    return {
      status: 'ok',
      result: { indicators: ind, readings, bullishWeight, bearishWeight, regimeInterpretations },
      confidence: directional === 0 ? 0 : Math.abs(bullishWeight - bearishWeight) / directional,
      evidence,
      warnings: ['Indicators are evidence only and never authorise a trade on their own'],
    };
  });
}
