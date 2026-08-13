// ============================================================================
// Engine 2 — Market Context Engine (Master Prompt §12.2, §14)
// Builds the multi-timeframe context envelope: nearest structural levels,
// volatility/liquidity conditions and the context penalty applied to
// confidence. A lower timeframe never overrides higher-timeframe bias.
// ============================================================================

import type { Candle, LiquidityAnalysis, MarketContext, MultiTimeframeAnalysis, Side, Timeframe } from '../types';
import { analyzeMarketContext, analyzeMultiTimeframe, classifyGranularRegime } from '../institutionalEngine';
import { adx as adxSeries } from '../indicators';
import { analyzeMarketStructure } from '../structure';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[1];

export interface MarketContextResult {
  context: MarketContext;
  multiTimeframe: MultiTimeframeAnalysis;
  /** Higher-timeframe bias that lower timeframes must respect. */
  higherTimeframeBias: 'bullish' | 'bearish' | 'neutral';
  executionTimeframe: Timeframe;
}

export function marketContextEngine(
  contextId: string,
  candles: Candle[],
  timeframe: Timeframe,
  liquidity: LiquidityAnalysis,
  side: Side,
  candleMap?: Partial<Record<Timeframe, Candle[]>>,
): EngineResult<MarketContextResult> {
  return runEngine<MarketContextResult>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Fewer than 60 bars — context not constructed'] };
    }

    const structure = analyzeMarketStructure(candles);
    const adxArr = adxSeries(candles, 14);
    const adxVal = adxArr[adxArr.length - 1] ?? 0;
    const granular = classifyGranularRegime(candles, structure.regime, adxVal);
    const context = analyzeMarketContext(candles, liquidity, granular, side);
    const mtf = analyzeMultiTimeframe(candleMap ?? { [timeframe]: candles });

    const higherTimeframeBias =
      mtf.alignedDirection === 'buy' ? 'bullish' : mtf.alignedDirection === 'sell' ? 'bearish' : 'neutral';

    const evidence: Evidence[] = [
      { key: 'regime', value: context.regime },
      { key: 'volatility_condition', value: context.volatilityCondition },
      { key: 'liquidity_condition', value: context.liquidityCondition },
      { key: 'trend_strength', value: Number(context.trendStrength.toFixed(3)) },
      { key: 'context_penalty', value: Number(context.contextPenalty.toFixed(3)) },
      { key: 'htf_bias', value: higherTimeframeBias, note: `alignment ${(mtf.alignmentScore * 100).toFixed(0)}%` },
    ];
    if (context.nearestResistance) evidence.push({ key: 'nearest_resistance', value: context.nearestResistance.level, note: `${context.nearestResistance.distancePct.toFixed(2)}% away` });
    if (context.nearestSupport) evidence.push({ key: 'nearest_support', value: context.nearestSupport.level, note: `${context.nearestSupport.distancePct.toFixed(2)}% away` });

    const warnings: string[] = [];
    if (mtf.timeframes.length < 2) warnings.push('Single timeframe available — multi-timeframe context is incomplete');

    return {
      status: mtf.timeframes.length < 2 ? 'degraded' : 'ok',
      result: { context, multiTimeframe: mtf, higherTimeframeBias, executionTimeframe: timeframe },
      confidence: Math.max(0, 1 - context.contextPenalty),
      evidence,
      warnings,
    };
  });
}
