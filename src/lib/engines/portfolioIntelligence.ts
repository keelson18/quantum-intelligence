// ============================================================================
// Engine 14 — Portfolio Intelligence Engine (Master Prompt §12.14, §28)
// Evaluates open positions, total exposure, correlated assets, concentration,
// portfolio volatility, drawdown and scenario impact. A good individual setup
// can be rejected when the portfolio cannot safely accept it.
// ============================================================================

import type { Candle, PortfolioIntelligence, Side } from '../types';
import { assessPortfolioIntelligence } from '../institutionalEngine';
import type { PortfolioState } from '../risk';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[13];

export interface PortfolioScenario {
  name: string;
  equityImpactPct: number;
  detail: string;
}

export interface PortfolioResult {
  intelligence: PortfolioIntelligence;
  canAccept: boolean;
  rejectionReason: string | null;
  scenarios: PortfolioScenario[];
  exposurePct: number;
  drawdownPct: number;
}

export function portfolioEngine(
  contextId: string,
  symbol: string,
  side: Side,
  confidence: number,
  portfolio: PortfolioState,
  candles: Candle[],
  correlationSeries?: { symbol: string; series: number[] }[],
): EngineResult<PortfolioResult> {
  return runEngine<PortfolioResult>(D.id, D.version, contextId, () => {
    const intelligence = assessPortfolioIntelligence(symbol, side, confidence, portfolio, correlationSeries, candles);
    const exposurePct = portfolio.currentExposurePct * 100;
    const maxExposure = portfolio.maxExposurePct * 100;
    const drawdownPct = portfolio.peakEquity > 0 ? ((portfolio.peakEquity - portfolio.equity) / portfolio.peakEquity) * 100 : 0;

    let rejectionReason: string | null = null;
    if (exposurePct >= maxExposure) rejectionReason = `Portfolio exposure ${exposurePct.toFixed(1)}% already at the ${maxExposure.toFixed(1)}% ceiling`;
    else if (intelligence.correlationRisk === 'high' && intelligence.concentrationRisk === 'high') rejectionReason = 'Correlation and concentration risk are both high';
    else if (intelligence.suggestedPositionMultiplier <= 0) rejectionReason = 'Portfolio intelligence authorises no additional size';

    const risked = portfolio.equity * 0.01 * Math.max(0, intelligence.suggestedPositionMultiplier);
    const scenarios: PortfolioScenario[] = [
      { name: 'Setup stops out', equityImpactPct: portfolio.equity > 0 ? -(risked / portfolio.equity) * 100 : 0, detail: 'Single-position stop loss at planned risk' },
      { name: 'Correlated cluster stops out', equityImpactPct: portfolio.equity > 0 ? -((risked * Math.max(1, intelligence.positionCount + 1)) / portfolio.equity) * 100 : 0, detail: 'All correlated positions fail together' },
      { name: 'Target reached', equityImpactPct: portfolio.equity > 0 ? ((risked * 2) / portfolio.equity) * 100 : 0, detail: 'Planned 2R outcome' },
    ];

    const evidence: Evidence[] = [
      { key: 'open_positions', value: intelligence.positionCount },
      { key: 'total_exposure_pct', value: Number(exposurePct.toFixed(2)) },
      { key: 'correlation_risk', value: intelligence.correlationRisk },
      { key: 'concentration_risk', value: intelligence.concentrationRisk },
      { key: 'suggested_multiplier', value: Number(intelligence.suggestedPositionMultiplier.toFixed(3)) },
      { key: 'drawdown_pct', value: Number(drawdownPct.toFixed(2)) },
      { key: 'recommendation', value: intelligence.recommendation },
      ...scenarios.map((s) => ({ key: `scenario_${s.name.replace(/\s+/g, '_').toLowerCase()}`, value: Number(s.equityImpactPct.toFixed(3)), note: s.detail })),
    ];

    return {
      status: 'ok',
      result: {
        intelligence,
        canAccept: rejectionReason === null,
        rejectionReason,
        scenarios,
        exposurePct,
        drawdownPct,
      },
      confidence: intelligence.suggestedPositionMultiplier,
      evidence,
      warnings: rejectionReason ? [rejectionReason] : [],
    };
  });
}
