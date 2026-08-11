import { TrendingUp, TrendingDown, Minus, Gauge } from 'lucide-react';
import type { InferenceResult } from '../ai/types';

interface Props {
  result: InferenceResult | null;
  loading: boolean;
  modelName: string;
}

// PredictionDisplay — shows the latest inference result from the in-browser model.
export default function PredictionDisplay({ result, loading, modelName }: Props) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Gauge className="w-4 h-4 animate-pulse" /> Running inference…
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-primary" /> In-Browser Prediction
        </h3>
        <div className="text-xs text-muted">Train a model first, then run inference to see predictions here.</div>
      </div>
    );
  }

  const label = result.label ?? `class_${result.prediction}`;
  const isUp = label === 'up' || result.prediction === 2;
  const isDown = label === 'down' || result.prediction === 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? 'text-success' : isDown ? 'text-danger' : 'text-muted';
  const bgColor = isUp ? 'bg-success/15' : isDown ? 'bg-danger/15' : 'bg-muted/15';

  return (
    <div className="bg-surface border border-border rounded-xl p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" /> In-Browser Prediction
        </h3>
        <span className="text-xs text-muted truncate max-w-[120px]">{modelName}</span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div>
          <div className={`text-lg font-semibold capitalize ${color}`}>{label}</div>
          <div className="text-xs text-muted">Predicted direction</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-lg font-semibold tabular-nums">{(result.confidence * 100).toFixed(1)}%</div>
          <div className="text-xs text-muted">Confidence</div>
        </div>
      </div>

      {/* Probability distribution */}
      {result.outputs.length > 1 && (
        <div className="space-y-1.5 mb-2">
          <div className="text-xs text-muted">Class probabilities</div>
          {['down', 'flat', 'up'].map((cls, i) => {
            const prob = result.outputs[i] ?? 0;
            return (
              <div key={cls} className="flex items-center gap-2">
                <span className="text-xs w-10 capitalize">{cls}</span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cls === 'up' ? 'bg-success' : cls === 'down' ? 'bg-danger' : 'bg-muted'}`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted w-10 text-right">{(prob * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs text-muted pt-2 border-t border-border/50">
        {result.rawInput.length} features · computed entirely in your browser
      </div>
    </div>
  );
}
