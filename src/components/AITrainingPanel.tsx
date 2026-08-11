import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Brain, Play, Square, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Loader2, Layers, Cpu, Database,
} from 'lucide-react';
import type {
  AIModelMeta, Architecture, Hyperparams, EpochMetrics, InferenceResult,
} from '../ai/types';
import { DEFAULT_HYPERPARAMS } from '../ai/types';
import { prepareDataset } from '../ai/dataLoader';
import { trainWithWorker, trainOnMainThread } from '../ai/trainer';
import { fetchModelMetas, deleteModel } from '../ai/modelStorage';
import { predictFromCandles, clearModelCache } from '../ai/inference';
import { saveTrainingSamples } from '../ai/dataLoader';
import type { Candle, Timeframe } from '../lib/types';
import ModelMetrics from './ModelMetrics';
import PredictionDisplay from './PredictionDisplay';

interface Props {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
}

type TrainStatus = 'idle' | 'preparing' | 'training' | 'saving' | 'done' | 'error' | 'cancelled';

// AITrainingPanel — full training control UI.
// Lets the user configure hyperparameters, pick an architecture, train a model
// in a Web Worker, view live loss/accuracy curves, and run inference.
export default function AITrainingPanel({ symbol, timeframe, candles }: Props) {
  const [models, setModels] = useState<AIModelMeta[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [hp, setHp] = useState<Hyperparams>(DEFAULT_HYPERPARAMS);
  const [arch, setArch] = useState<Architecture>('dense');
  const [modelName, setModelName] = useState(`${symbol}-model`);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [epochs, setEpochs] = useState<EpochMetrics[]>([]);
  const [status, setStatus] = useState<TrainStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dataCount, setDataCount] = useState<number | null>(null);
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Load model list on mount + when symbol changes.
  const loadModels = useCallback(async () => {
    const metas = await fetchModelMetas();
    setModels(metas);
    if (metas.length > 0 && !selectedModelId) setSelectedModelId(metas[0].id);
  }, [selectedModelId]);

  useEffect(() => { loadModels(); }, [loadModels]);
  useEffect(() => { setModelName(`${symbol}-model`); }, [symbol]);

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;

  // Update model name when symbol changes.
  useEffect(() => {
    setModelName(`${symbol}-${arch}`);
  }, [symbol, arch]);

  const handleTrain = async () => {
    setStatus('preparing');
    setEpochs([]);
    setErrorMsg(null);
    setInference(null);

    try {
      // Step 1: prepare the dataset (multi-source fusion).
      const dataset = await prepareDataset(symbol, timeframe, hp);
      setDataCount(dataset.xTrain.length + dataset.xVal.length);

      // Save the generated samples to Supabase for future online learning.
      await saveTrainingSamples(symbol, dataset.xTrain.map((features, i) => ({
        features, label: dataset.yTrain[i],
      })));

      setStatus('training');

      // Step 2: train in a Web Worker (falls back to main thread if needed).
      const callbacks = {
        onEpoch: (m: EpochMetrics) => setEpochs((prev) => [...prev, m]),
        onStatus: (s: string) => setStatus(s as TrainStatus),
        onError: (msg: string) => { setErrorMsg(msg); setStatus('error'); },
      };

      try {
        const { result, modelId, cancel } = await trainWithWorker(dataset, arch, hp, modelName, callbacks);
        cancelRef.current = cancel;
        void result; void modelId;
      } catch {
        // Fallback to main-thread training if the worker fails.
        setStatus('training');
        await trainOnMainThread(dataset, arch, hp, modelName, callbacks);
      }

      setStatus('done');
      await loadModels();
      // Auto-run inference with the freshly trained model so predictions show immediately.
      // The model list reload picks up the new model; we trigger inference on next render.
      setTimeout(() => autoInfer(), 100);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const handleCancel = () => {
    cancelRef.current?.();
    setStatus('cancelled');
  };

  const handleDelete = async (modelId: string) => {
    await deleteModel(modelId);
    clearModelCache(modelId);
    if (selectedModelId === modelId) setSelectedModelId(null);
    await loadModels();
  };

  const handleInfer = async () => {
    if (!selectedModel || candles.length < 220) return;
    setInferLoading(true);
    setInferError(null);
    try {
      // Use the normalization stats stored during training (in metrics.mean/std).
      const mean = selectedModel.metrics?.mean ?? [];
      const std = selectedModel.metrics?.std ?? [];
      const result = await predictFromCandles(
        selectedModel.id,
        candles,
        mean,
        std,
        selectedModel.hyperparams ?? DEFAULT_HYPERPARAMS,
        selectedModel.architecture,
      );
      if (!result) {
        setInferError('Model not ready or insufficient data. Try retraining.');
      } else {
        setInference(result);
        setInferError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AI inference error]', msg);
      setInferError(msg);
    } finally {
      setInferLoading(false);
    }
  };

  // Auto-infer: finds the most recently trained model and runs prediction.
  const autoInfer = async () => {
    const metas = await fetchModelMetas();
    const trained = metas.find((m) => m.status === 'trained');
    if (!trained || candles.length < 220) return;
    setSelectedModelId(trained.id);
    setInferLoading(true);
    setInferError(null);
    try {
      const mean = trained.metrics?.mean ?? [];
      const std = trained.metrics?.std ?? [];
      const result = await predictFromCandles(
        trained.id, candles, mean, std,
        trained.hyperparams ?? DEFAULT_HYPERPARAMS,
        trained.architecture,
      );
      if (result) setInference(result);
    } catch (err) {
      console.error('[AI auto-inference error]', err);
    } finally {
      setInferLoading(false);
    }
  };

  const isTraining = status === 'preparing' || status === 'training' || status === 'saving';

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" /> In-Browser AI Engine
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Cpu className="w-3 h-3" /> TensorFlow.js
        </div>
      </div>

      {/* Architecture + model name */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-muted mb-1">Architecture</label>
          <select
            value={arch}
            onChange={(e) => setArch(e.target.value as Architecture)}
            disabled={isTraining}
            className="w-full px-2.5 py-2 rounded-lg bg-bg border border-border text-text focus:outline-none focus:border-primary text-sm"
          >
            <option value="dense">Dense Network</option>
            <option value="lstm">LSTM (Sequential)</option>
            <option value="transformer">Transformer (Attention)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Model Name</label>
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            disabled={isTraining}
            className="w-full px-2.5 py-2 rounded-lg bg-bg border border-border text-text focus:outline-none focus:border-primary text-sm"
          />
        </div>
      </div>

      {/* Basic hyperparameters */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <HyperInput label="Epochs" value={hp.epochs} min={5} max={200} step={5}
          onChange={(v) => setHp({ ...hp, epochs: v })} disabled={isTraining} />
        <HyperInput label="Batch Size" value={hp.batchSize} min={8} max={128} step={8}
          onChange={(v) => setHp({ ...hp, batchSize: v })} disabled={isTraining} />
        <HyperInput label="Learning Rate" value={hp.learningRate} min={0.0001} max={0.1} step={0.0001} decimals={4}
          onChange={(v) => setHp({ ...hp, learningRate: v })} disabled={isTraining} />
      </div>

      {/* Advanced settings */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors mb-2"
      >
        {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Advanced
      </button>
      {showAdvanced && (
        <div className="grid grid-cols-3 gap-3 mb-3 animate-fade-in">
          <HyperInput label="Validation Split" value={hp.validationSplit} min={0.1} max={0.5} step={0.05} decimals={2}
            onChange={(v) => setHp({ ...hp, validationSplit: v })} disabled={isTraining} />
          <HyperInput label="Dropout" value={hp.dropout} min={0} max={0.5} step={0.05} decimals={2}
            onChange={(v) => setHp({ ...hp, dropout: v })} disabled={isTraining} />
          <HyperInput label="Seq Length" value={hp.sequenceLength} min={5} max={60} step={5}
            onChange={(v) => setHp({ ...hp, sequenceLength: v })} disabled={isTraining} />
          <div className="col-span-3">
            <label className="block text-xs text-muted mb-1">Hidden Layers (comma-separated units)</label>
            <input
              value={hp.hiddenUnits.join(', ')}
              onChange={(e) => setHp({ ...hp, hiddenUnits: e.target.value.split(',').map((s) => parseInt(s.trim()) || 32) })}
              disabled={isTraining}
              className="w-full px-2.5 py-2 rounded-lg bg-bg border border-border text-text focus:outline-none focus:border-primary text-sm"
            />
          </div>
        </div>
      )}

      {/* Data source info */}
      <div className="flex items-center gap-2 text-xs text-muted mb-3 bg-bg/50 rounded-lg px-3 py-2 border border-border/50">
        <Database className="w-3 h-3" />
        <span>Multi-source fusion: Binance candles → 20 indicators → market structure → SMC</span>
      </div>

      {/* Train button + status */}
      <div className="flex items-center gap-2 mb-3">
        {!isTraining ? (
          <button
            onClick={handleTrain}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-black font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <Play className="w-3.5 h-3.5" /> Train Model
          </button>
        ) : (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <Square className="w-3.5 h-3.5" /> Cancel
          </button>
        )}

        {/* Status indicator */}
        {status === 'preparing' && <StatusBadge icon={Loader2} text="Preparing data…" spin />}
        {status === 'training' && <StatusBadge icon={Loader2} text={`Training (epoch ${epochs.length}/${hp.epochs})`} spin />}
        {status === 'saving' && <StatusBadge icon={Loader2} text="Saving model…" spin />}
        {status === 'done' && <StatusBadge icon={CheckCircle2} text="Training complete" color="text-success" />}
        {status === 'error' && <StatusBadge icon={XCircle} text="Failed" color="text-danger" />}
        {status === 'cancelled' && <StatusBadge icon={Square} text="Cancelled" color="text-muted" />}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 mb-3">
          {errorMsg}
        </div>
      )}

      {/* Data count */}
      {dataCount !== null && (
        <div className="text-xs text-muted mb-3">
          {dataCount} training samples prepared · {symbol} {timeframe}
        </div>
      )}

      {/* Training metrics charts */}
      {epochs.length > 0 && (
        <div className="mb-4 pt-3 border-t border-border/50">
          <ModelMetrics metrics={epochs} />
          {status === 'done' && epochs.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              <MetricBox label="Final Loss" value={epochs[epochs.length - 1].loss.toFixed(4)} />
              <MetricBox label="Val Loss" value={epochs[epochs.length - 1].valLoss.toFixed(4)} />
              <MetricBox label="Accuracy" value={`${((epochs[epochs.length - 1].accuracy ?? 0) * 100).toFixed(1)}%`} />
              <MetricBox label="Val Acc" value={`${((epochs[epochs.length - 1].valAccuracy ?? 0) * 100).toFixed(1)}%`} />
            </div>
          )}
        </div>
      )}

      {/* Saved models list */}
      {models.length > 0 && (
        <div className="pt-3 border-t border-border/50 mb-4">
          <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Saved Models ({models.length})
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {models.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                  selectedModelId === m.id ? 'bg-primary/10 border border-primary/30' : 'bg-bg/50 border border-border/50 hover:border-border'
                }`}
                onClick={() => setSelectedModelId(m.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-muted">
                    {m.architecture} · {m.status}
                    {m.metrics?.finalMetrics && ` · acc=${((m.metrics.finalMetrics.accuracy ?? 0) * 100).toFixed(0)}%`}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                  className="p-1 rounded hover:bg-danger/15 text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inference section */}
      {selectedModel && selectedModel.status === 'trained' && (
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium">Run Inference</div>
            <button
              onClick={handleInfer}
              disabled={inferLoading || candles.length < 220}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 disabled:opacity-40 transition-colors"
            >
              {inferLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Predict
            </button>
          </div>
          {inferError && (
            <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 mb-3">
              {inferError}
            </div>
          )}
          <PredictionDisplay result={inference} loading={inferLoading} modelName={selectedModel.name} />
        </div>
      )}
    </div>
  );
}

function HyperInput({
  label, value, min, max, step, decimals = 0, onChange, disabled,
}: {
  label: string; value: number; min: number; max: number; step: number; decimals?: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || min)}
        className="w-full px-2.5 py-2 rounded-lg bg-bg border border-border text-text focus:outline-none focus:border-primary text-sm tabular-nums"
      />
      {decimals > 0 && <div className="text-xs text-muted mt-0.5 tabular-nums">{value.toFixed(decimals)}</div>}
    </div>
  );
}

function StatusBadge({ icon: Icon, text, color = 'text-muted', spin }: { icon: typeof Loader2; text: string; color?: string; spin?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <Icon className={`w-3.5 h-3.5 ${spin ? 'animate-spin' : ''}`} /> {text}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
      <div className="text-xs text-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
