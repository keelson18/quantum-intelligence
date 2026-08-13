// ============================================================================
// Engine 19 — Research Engine (Master Prompt §12.19, §33)
// Offline research: backtests, walk-forward validation and robustness checks.
// Research NEVER drives live decisions directly; it produces validated
// evidence that must survive out-of-sample testing before it is trusted.
// ============================================================================

import type { Candle, Timeframe } from '../types';
import { runBacktest, type BacktestConfig } from '../backtest';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[18];

export interface ResearchFinding {
  strategy: string;
  inSampleWinRate: number;
  outOfSampleWinRate: number;
  degradationPct: number;
  robust: boolean;
  trades: number;
}

export interface ResearchResult {
  findings: ResearchFinding[];
  symbol: string;
  timeframe: Timeframe;
  drivesLiveDecisions: false;
}

const MIN_TRADES = 20;

export function researchEngine(
  contextId: string,
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  strategies: string[],
  config?: Partial<BacktestConfig>,
): EngineResult<ResearchResult> {
  return runEngine<ResearchResult>(D.id, D.version, contextId, () => {
    if (candles.length < 200) {
      return {
        status: 'insufficient_data',
        result: null,
        confidence: 0,
        warnings: [`Only ${candles.length} candles — research requires at least 200`],
      };
    }

    const split = Math.floor(candles.length * 0.7);
    const inSample = candles.slice(0, split);
    const outSample = candles.slice(split);

    const findings: ResearchFinding[] = [];
    for (const strategy of strategies) {
      const cfg = { symbol, timeframe, strategy, ...config } as unknown as BacktestConfig;
      const a = runBacktest(inSample, cfg);
      const b = runBacktest(outSample, cfg);
      const inRate = a?.metrics?.winRate ?? 0;
      const outRate = b?.metrics?.winRate ?? 0;
      const trades = (a?.metrics?.totalTrades ?? 0) + (b?.metrics?.totalTrades ?? 0);
      const degradation = inRate > 0 ? ((inRate - outRate) / inRate) * 100 : 0;
      findings.push({
        strategy,
        inSampleWinRate: inRate,
        outOfSampleWinRate: outRate,
        degradationPct: Number(degradation.toFixed(2)),
        robust: trades >= MIN_TRADES && degradation < 25 && outRate > 0.45,
        trades,
      });
    }

    const evidence: Evidence[] = findings.map((f) => ({
      key: f.strategy,
      value: Number(f.outOfSampleWinRate.toFixed(3)),
      note: `IS ${(f.inSampleWinRate * 100).toFixed(0)}% → OOS ${(f.outOfSampleWinRate * 100).toFixed(0)}% over ${f.trades} trades (${f.robust ? 'robust' : 'not robust'})`,
    }));

    const robustCount = findings.filter((f) => f.robust).length;

    return {
      status: findings.length === 0 ? 'insufficient_data' : 'ok',
      result: { findings, symbol, timeframe, drivesLiveDecisions: false },
      confidence: findings.length === 0 ? 0 : robustCount / findings.length,
      evidence,
      warnings: ['Research findings must not be used as live signals until validated out-of-sample'],
    };
  });
}
