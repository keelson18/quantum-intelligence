// ============================================================================
// Engine 3 — Market Structure Engine (Master Prompt §12.3, §15)
// Swing points, HH/HL/LH/LL labelling, break of structure, market structure
// shift and invalidation levels. Every structural event carries timestamp,
// price, timeframe, detector version, confidence and evidence.
// ============================================================================

import type { Candle, MarketStructure, SmartMoney, StructureEvent, Timeframe } from '../types';
import { analyzeMarketStructure, analyzeSmartMoney, computeFibonacci } from '../structure';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[2];

export interface StructureEventRecord extends StructureEvent {
  timeframe: Timeframe;
  detectorVersion: string;
  confidence: number;
}

export interface MarketStructureResult {
  structure: MarketStructure;
  smartMoney: SmartMoney;
  events: StructureEventRecord[];
  /** Level that invalidates the current structural read. */
  invalidationLevel: number | null;
  fib: ReturnType<typeof computeFibonacci>;
}

export function marketStructureEngine(
  contextId: string,
  candles: Candle[],
  timeframe: Timeframe,
): EngineResult<MarketStructureResult> {
  return runEngine<MarketStructureResult>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history for structure detection'] };
    }

    const structure = analyzeMarketStructure(candles);
    const smartMoney = analyzeSmartMoney(candles);
    const fib = computeFibonacci(candles);

    const events: StructureEventRecord[] = structure.events.map((e) => ({
      ...e,
      timeframe,
      detectorVersion: D.version,
      confidence: e.type === 'BOS' || e.type === 'CHoCH' ? 0.7 : 0.5,
    }));

    // Invalidation = most recent opposing swing beyond which the read fails.
    const lows = structure.swings.filter((s) => s.type === 'low');
    const highs = structure.swings.filter((s) => s.type === 'high');
    const bullish = structure.regime === 'trend_up';
    const invalidationLevel = bullish
      ? lows[lows.length - 1]?.value ?? null
      : structure.regime === 'trend_down'
        ? highs[highs.length - 1]?.value ?? null
        : null;

    const evidence: Evidence[] = [
      { key: 'regime', value: structure.regime },
      { key: 'trend_strength', value: Number(structure.trendStrength.toFixed(3)) },
      { key: 'swing_count', value: structure.swings.length },
      { key: 'structure_events', value: events.length },
      { key: 'order_blocks', value: smartMoney.orderBlocks.length },
      { key: 'fair_value_gaps', value: smartMoney.fvgs.length },
    ];
    if (invalidationLevel !== null) evidence.push({ key: 'invalidation_level', value: invalidationLevel });
    const last = events[events.length - 1];
    if (last) evidence.push({ key: 'last_event', value: `${last.type} ${last.direction}`, note: last.reason });

    return {
      status: 'ok',
      result: { structure, smartMoney, events, invalidationLevel, fib },
      confidence: Math.min(1, 0.4 + structure.trendStrength * 0.6),
      evidence,
      warnings: structure.swings.length < 4 ? ['Few confirmed swings — structural read is weak'] : [],
    };
  });
}
