// ============================================================================
// AI module type definitions
// All data shapes, model inputs/outputs, and training configs are typed here.
// ============================================================================

export type Architecture = 'dense' | 'lstm' | 'transformer';
export type TaskType = 'classification' | 'regression';
export type ModelStatus = 'untrained' | 'training' | 'trained' | 'failed';

export interface Hyperparams {
  learningRate: number;
  epochs: number;
  batchSize: number;
  validationSplit: number; // 0..1
  hiddenUnits: number[];
  dropout: number;
  sequenceLength: number; // for LSTM/transformer
  taskType: TaskType;
  numClasses: number; // for classification
}

export const DEFAULT_HYPERPARAMS: Hyperparams = {
  learningRate: 0.001,
  epochs: 50,
  batchSize: 32,
  validationSplit: 0.2,
  hiddenUnits: [64, 32],
  dropout: 0.1,
  sequenceLength: 20,
  taskType: 'classification',
  numClasses: 3, // up / flat / down
};

export interface TrainingSample {
  features: number[];
  label: number;
}

export interface PreparedDataset {
  xTrain: number[][];       // [samples][features]
  yTrain: number[];         // labels (class index or regression value)
  xVal: number[][];
  yVal: number[];
  featureNames: string[];
  numFeatures: number;
  // Normalization stats for reuse at inference.
  mean: number[];
  std: number[];
  // For sequence models: reshaped tensors [samples][time][features].
  sequences?: number[][][];
  sequenceLabels?: number[];
}

export interface EpochMetrics {
  epoch: number;
  loss: number;
  accuracy?: number;
  valLoss: number;
  valAccuracy?: number;
}

export interface TrainingResult {
  metrics: EpochMetrics[];
  finalMetrics: {
    loss: number;
    accuracy: number;
    valLoss: number;
    valAccuracy: number;
  };
  trainedAt: string;
  // Normalization stats computed during training; required at inference time.
  mean: number[];
  std: number[];
}

export interface AIModelMeta {
  id: string;
  name: string;
  architecture: Architecture;
  hyperparams: Hyperparams;
  metrics: TrainingResult | null;
  status: ModelStatus;
  inputFeatures: string[];
  outputClasses: string[];
  trainedAt: string | null;
  createdAt: string;
}

export interface InferenceResult {
  prediction: number;
  confidence: number;
  outputs: number[];
  label?: string;
  rawInput: number[];
}

// Messages exchanged between main thread and the training Web Worker.
export type WorkerRequest =
  | { type: 'train'; dataset: PreparedDataset; architecture: Architecture; hyperparams: Hyperparams; modelId: string }
  | { type: 'cancel' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'epoch'; metrics: EpochMetrics }
  | { type: 'done'; result: TrainingResult; topology?: object }
  | { type: 'weights'; weights: ArrayBuffer[] }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

// Database row shapes.
export interface AIModelRow {
  id: string;
  user_id: string;
  name: string;
  architecture: Architecture;
  hyperparams: Hyperparams;
  metrics: TrainingResult | null;
  status: ModelStatus;
  input_features: string[];
  output_classes: string[];
  trained_at: string | null;
  created_at: string;
}

export interface AIPredictionRow {
  id: string;
  model_id: string;
  symbol: string;
  input: Record<string, number>;
  output: Record<string, number>;
  confidence: number;
  created_at: string;
}

export interface AITrainingDataRow {
  id: string;
  user_id: string;
  source: string;
  symbol: string;
  features: Record<string, number>;
  label: number;
  label_type: TaskType;
  created_at: string;
}
