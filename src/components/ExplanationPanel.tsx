import type { TradeExplanation } from '../lib/types';
import { Lightbulb, Shield, Target, AlertCircle, ListChecks } from 'lucide-react';

// Explainable AI panel — shows the full reasoning behind a trade recommendation.
export default function ExplanationPanel({ explanation }: { explanation: TradeExplanation | null }) {
  if (!explanation) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 animate-fade-in">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-primary" /> Explainable AI
      </h3>

      <div className="space-y-3 text-xs leading-relaxed">
        {/* Why */}
        <Section title="Why This Trade" icon={Lightbulb}>
          {explanation.why}
        </Section>

        {/* Indicators */}
        <div>
          <div className="flex items-center gap-1.5 text-muted mb-1">
            <ListChecks className="w-3 h-3" /> Indicators Involved
          </div>
          <div className="flex flex-wrap gap-1.5">
            {explanation.indicators.map((ind, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-bg/60 border border-border/50 text-muted tabular-nums">
                {ind}
              </span>
            ))}
          </div>
        </div>

        {/* Patterns */}
        <div>
          <div className="text-muted mb-1">Patterns Detected</div>
          <div className="flex flex-wrap gap-1.5">
            {explanation.patterns.map((p, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-bg/60 border border-border/50 text-muted">
                {p}
              </span>
            ))}
          </div>
        </div>

        {/* Confidence */}
        <Section title="Confidence Score">
          <span className="font-medium tabular-nums">{(explanation.confidence * 100).toFixed(0)}%</span> — blended from all contributing signals weighted by their individual confidence.
        </Section>

        {/* Risk */}
        <Section title="Risk Assessment" icon={Shield}>
          {explanation.riskAssessment}
        </Section>

        {/* Stop loss */}
        <Section title="Stop Loss Reasoning" icon={AlertCircle}>
          {explanation.stopLossReason}
        </Section>

        {/* Take profit */}
        <Section title="Take Profit Reasoning" icon={Target}>
          {explanation.takeProfitReason}
        </Section>

        {/* Alternatives */}
        <div>
          <div className="text-muted mb-1">Alternative Scenarios</div>
          <ul className="space-y-1">
            {explanation.alternatives.map((alt, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-muted shrink-0">•</span>
                <span>{alt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof Shield; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted mb-1">
        {Icon && <Icon className="w-3 h-3" />} {title}
      </div>
      <div className="text-text">{children}</div>
    </div>
  );
}
