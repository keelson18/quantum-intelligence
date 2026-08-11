import { Layers, TrendingUp, TrendingDown, Minus, Droplet, Award, Brain, AlertTriangle, Gauge, Activity, Target } from 'lucide-react';
import type { InstitutionalAnalysis, Timeframe } from '../lib/types';
import { granularRegimeLabel } from '../lib/institutionalEngine';

const MTF_LABELS: Record<Timeframe, string> = {
  '1m': '1Min', '3m': '3Min', '5m': '5Min', '15m': '15Min', '30m': '30Min',
  '1h': '1H', '4h': '4H', '1d': 'Daily', '1w': 'Weekly', '1M': 'Monthly',
};

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-success bg-success/15', 'A': 'text-success bg-success/10',
  'B': 'text-primary bg-primary/10', 'C': 'text-warning bg-warning/10', 'D': 'text-danger bg-danger/10',
};

const RISK_COLORS: Record<string, string> = {
  Low: 'text-success', Medium: 'text-warning', High: 'text-danger',
};

export function InstitutionalPanel({ analysis }: { analysis: InstitutionalAnalysis | null }) {
  if (!analysis) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold">Institutional Analysis</h3>
        </div>
        <div className="py-6 text-center text-muted text-xs">Insufficient data for institutional analysis</div>
      </div>
    );
  }

  const { multiTimeframe, liquidity, confluence, marketMemory, portfolioIntelligence, marketContext, finalConfidence, tradeGrade, riskRating, evidence } = analysis;

  return (
    <div className="space-y-3">
      {/* Header: Grade + Confidence + Risk */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold">Institutional Decision Engine</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-[10px] text-muted mb-1">Trade Grade</div>
            <div className={`text-2xl font-bold rounded-lg py-1 ${GRADE_COLORS[tradeGrade] ?? GRADE_COLORS['C']}`}>{tradeGrade}</div>
            <div className="text-[10px] text-muted mt-0.5">{confluence.tradeQuality}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted mb-1">Confidence</div>
            <div className="text-2xl font-bold text-primary tabular-nums">{(finalConfidence * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-muted mt-0.5">Adjusted</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted mb-1">Risk Rating</div>
            <div className={`text-2xl font-bold ${RISK_COLORS[riskRating]}`}>{riskRating}</div>
            <div className="text-[10px] text-muted mt-0.5">{confluence.total}/100 confluence</div>
          </div>
        </div>
      </div>

      {/* Multi-Timeframe Analysis */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" /> Multi-Timeframe Analysis
        </h4>
        {multiTimeframe.timeframes.length > 0 ? (
          <>
            <div className="flex gap-1 mb-3 flex-wrap">
              {multiTimeframe.timeframes.map((tf) => (
                <div key={tf.timeframe} className="flex-1 min-w-[100px] bg-bg/50 rounded-lg p-2 border border-border/50">
                  <div className="text-[10px] text-muted font-medium">{MTF_LABELS[tf.timeframe]}</div>
                  <div className={`text-xs font-semibold flex items-center gap-0.5 ${tf.trend === 'bullish' ? 'text-success' : tf.trend === 'bearish' ? 'text-danger' : 'text-muted'}`}>
                    {tf.trend === 'bullish' ? <TrendingUp className="w-3 h-3" /> : tf.trend === 'bearish' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {tf.trend === 'bullish' ? 'Bull' : tf.trend === 'bearish' ? 'Bear' : 'Neutral'}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{granularRegimeLabel(tf.granularRegime)}</div>
                  <div className="flex justify-between text-[10px] text-muted mt-1 tabular-nums">
                    <span>RSI {tf.rsi.toFixed(0)}</span>
                    <span>ADX {tf.adx.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">Alignment:</span>
              <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                <div className={`h-full rounded-full ${multiTimeframe.alignedDirection === 'buy' ? 'bg-success' : multiTimeframe.alignedDirection === 'sell' ? 'bg-danger' : 'bg-muted'}`}
                  style={{ width: `${multiTimeframe.alignmentScore * 100}%` }} />
              </div>
              <span className="tabular-nums font-medium">{(multiTimeframe.alignmentScore * 100).toFixed(0)}%</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted">No multi-timeframe data available</div>
        )}
      </div>

      {/* Confluence Breakdown */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-primary" /> Confluence Engine
        </h4>
        <div className="space-y-1.5">
          <ConfluenceBar label="Trend" value={confluence.trend} max={20} />
          <ConfluenceBar label="Structure" value={confluence.structure} max={15} />
          <ConfluenceBar label="Liquidity" value={confluence.liquidity} max={20} />
          <ConfluenceBar label="Patterns" value={confluence.patterns} max={15} />
          <ConfluenceBar label="Volume" value={confluence.volume} max={10} />
          <ConfluenceBar label="Indicators" value={confluence.indicators} max={10} />
          <ConfluenceBar label="S/R" value={confluence.supportResistance} max={10} />
          <ConfluenceBar label="MTF Alignment" value={confluence.timeframeAlignment} max={10} />
          <ConfluenceBar label="Risk" value={confluence.risk} max={10} />
        </div>
        <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted">Total Confluence</span>
          <span className={`font-bold text-sm ${confluence.total >= 80 ? 'text-success' : confluence.total >= 65 ? 'text-primary' : confluence.total >= 50 ? 'text-warning' : 'text-danger'}`}>
            {confluence.total}/100
          </span>
        </div>
      </div>

      {/* Liquidity Analysis */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
          <Droplet className="w-3.5 h-3.5 text-primary" /> Liquidity Analysis
        </h4>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <div className="text-[10px] text-muted mb-1">Buy-side Liquidity</div>
            <div className="space-y-0.5">
              {liquidity.buySideLiquidity.slice(0, 3).map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="tabular-nums">${l.level.toFixed(2)}</span>
                  <span className={`text-[10px] ${l.strength === 'high' ? 'text-success' : l.strength === 'medium' ? 'text-warning' : 'text-muted'}`}>{l.strength}</span>
                </div>
              ))}
              {liquidity.buySideLiquidity.length === 0 && <div className="text-xs text-muted">None detected</div>}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted mb-1">Sell-side Liquidity</div>
            <div className="space-y-0.5">
              {liquidity.sellSideLiquidity.slice(0, 3).map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="tabular-nums">${l.level.toFixed(2)}</span>
                  <span className={`text-[10px] ${l.strength === 'high' ? 'text-danger' : l.strength === 'medium' ? 'text-warning' : 'text-muted'}`}>{l.strength}</span>
                </div>
              ))}
              {liquidity.sellSideLiquidity.length === 0 && <div className="text-xs text-muted">None detected</div>}
            </div>
          </div>
        </div>
        {liquidity.sweepDetected && (
          <div className={`text-xs px-2 py-1.5 rounded-lg ${liquidity.sweepDirection === 'buy_side' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            {liquidity.sweepDirection === 'buy_side' ? 'Buy-side' : 'Sell-side'} sweep detected ({(liquidity.sweepProbability * 100).toFixed(0)}% probability)
          </div>
        )}
        <div className="text-[10px] text-muted mt-2">{liquidity.summary}</div>
      </div>

      {/* Market Memory + Context */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-primary" /> Market Memory
          </h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted">Rejections tracked</span><span className="tabular-nums">{marketMemory.rejections.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Failed breakouts</span><span className="tabular-nums">{marketMemory.failedBreakouts.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Hist. support levels</span><span className="tabular-nums">{marketMemory.historicalSupport.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Hist. resistance levels</span><span className="tabular-nums">{marketMemory.historicalResistance.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Reaction score</span><span className={`tabular-nums font-medium ${marketMemory.reactionScore > 0.5 ? 'text-success' : marketMemory.reactionScore > 0.2 ? 'text-warning' : 'text-muted'}`}>{(marketMemory.reactionScore * 100).toFixed(0)}%</span></div>
          </div>
          <div className="text-[10px] text-muted mt-2">{marketMemory.summary}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-primary" /> Market Context
          </h4>
          <div className="space-y-1 text-xs">
            {marketContext.nearestResistance && (
              <div className="flex justify-between"><span className="text-muted">Nearest resistance</span><span className="tabular-nums text-danger">{marketContext.nearestResistance.distancePct.toFixed(1)}%</span></div>
            )}
            {marketContext.nearestSupport && (
              <div className="flex justify-between"><span className="text-muted">Nearest support</span><span className="tabular-nums text-success">{marketContext.nearestSupport.distancePct.toFixed(1)}%</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted">Volatility</span><span className={marketContext.volatilityCondition === 'high' ? 'text-danger' : marketContext.volatilityCondition === 'low' ? 'text-muted' : 'text-warning'}>{marketContext.volatilityCondition}</span></div>
            <div className="flex justify-between"><span className="text-muted">Liquidity</span><span className={marketContext.liquidityCondition === 'high' ? 'text-success' : marketContext.liquidityCondition === 'low' ? 'text-muted' : 'text-warning'}>{marketContext.liquidityCondition}</span></div>
            <div className="flex justify-between"><span className="text-muted">Trend strength</span><span className="tabular-nums">{(marketContext.trendStrength * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-muted">Context penalty</span><span className="tabular-nums text-warning">-{(marketContext.contextPenalty * 100).toFixed(0)}%</span></div>
          </div>
          <div className="text-[10px] text-muted mt-2">{marketContext.summary}</div>
        </div>
      </div>

      {/* Portfolio Intelligence */}
      {portfolioIntelligence && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-primary" /> Portfolio Intelligence
          </h4>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="bg-bg/50 rounded p-2">
              <div className="text-[10px] text-muted">Exposure</div>
              <div className="text-xs font-medium tabular-nums">{(portfolioIntelligence.totalExposure * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-bg/50 rounded p-2">
              <div className="text-[10px] text-muted">Correlation</div>
              <div className={`text-xs font-medium ${portfolioIntelligence.correlationRisk === 'high' ? 'text-danger' : portfolioIntelligence.correlationRisk === 'medium' ? 'text-warning' : 'text-success'}`}>{portfolioIntelligence.correlationRisk}</div>
            </div>
            <div className="bg-bg/50 rounded p-2">
              <div className="text-[10px] text-muted">Concentration</div>
              <div className={`text-xs font-medium ${portfolioIntelligence.concentrationRisk === 'high' ? 'text-danger' : portfolioIntelligence.concentrationRisk === 'medium' ? 'text-warning' : 'text-success'}`}>{portfolioIntelligence.concentrationRisk}</div>
            </div>
          </div>
          <div className="text-xs text-muted">{portfolioIntelligence.recommendation}</div>
          <div className="text-[10px] text-muted mt-1">Position multiplier: {(portfolioIntelligence.suggestedPositionMultiplier * 100).toFixed(0)}%</div>
        </div>
      )}

      {/* Evidence */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-2">Supporting Evidence</h4>
        <div className="space-y-1">
          {evidence.map((e, i) => (
            <div key={i} className="text-xs text-muted flex items-start gap-1.5">
              <span className="text-primary shrink-0 mt-0.5">•</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfluenceBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 75 ? 'bg-success' : pct >= 50 ? 'bg-primary' : pct >= 25 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-muted shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-bg overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums font-medium">{value}/{max}</span>
    </div>
  );
}
