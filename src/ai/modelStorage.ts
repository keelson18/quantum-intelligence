// ============================================================================
// modelStorage.ts — save/load model weights via IndexedDB + Supabase metadata
// Weights are persisted in IndexedDB (browser-side, survives reloads) and
// model metadata (topology, metrics, hyperparams) is synced to Supabase.
// ============================================================================

import * as tf from '@tensorflow/tfjs';
import { supabase } from '../lib/supabase';
import type { AIModelMeta, Architecture, Hyperparams, TrainingResult } from './types';

const INDEXED_DB_SCHEME = 'indexeddb://qi-model-';

// Save model weights to IndexedDB. Returns a handle key for later retrieval.
export async function saveModelWeights(model: tf.LayersModel, modelId: string): Promise<string> {
  const key = INDEXED_DB_SCHEME + modelId;
  await model.save(key);
  return key;
}

// Load model weights from IndexedDB by model ID.
export async function loadModelWeights(modelId: string): Promise<tf.LayersModel | null> {
  const key = INDEXED_DB_SCHEME + modelId;
  try {
    const models = await tf.io.listModels();
    if (!models[key]) return null;
    const model = await tf.loadLayersModel(key);
    return model;
  } catch (err) {
    console.error('Failed to load model weights:', err);
    return null;
  }
}

// Delete model weights from IndexedDB.
export async function deleteModelWeights(modelId: string): Promise<void> {
  const key = INDEXED_DB_SCHEME + modelId;
  try {
    await tf.io.removeModel(key);
  } catch {
    // model may not exist — ignore
  }
}

// List all locally stored model IDs from IndexedDB.
export async function listLocalModels(): Promise<string[]> {
  const models = await tf.io.listModels();
  return Object.keys(models)
    .filter((k) => k.startsWith(INDEXED_DB_SCHEME))
    .map((k) => k.replace(INDEXED_DB_SCHEME, ''));
}

// ---- Supabase metadata sync ----

// Create a model metadata row in Supabase. Returns the row ID.
export async function createModelMeta(
  name: string,
  architecture: Architecture,
  hp: Hyperparams,
  featureNames: string[],
  outputClasses: string[],
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_models')
    .insert({
      name,
      architecture,
      hyperparams: hp as unknown as Record<string, unknown>,
      input_features: featureNames,
      output_classes: outputClasses,
      status: 'untrained',
    })
    .select('id')
    .single();
  if (error) {
    console.error('Failed to create model meta:', error);
    return null;
  }
  return data.id;
}

// Update model metadata after training completes.
export async function updateModelMeta(
  modelId: string,
  status: 'trained' | 'training' | 'failed',
  metrics: TrainingResult | null,
): Promise<void> {
  const { error } = await supabase
    .from('ai_models')
    .update({
      status,
      metrics: metrics as unknown as Record<string, unknown>,
      trained_at: new Date().toISOString(),
    })
    .eq('id', modelId);
  if (error) console.error('Failed to update model meta:', error);
}

// Fetch all model metadata for the current user from Supabase.
export async function fetchModelMetas(): Promise<AIModelMeta[]> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(rowToMeta);
}

// Fetch a single model's metadata.
export async function fetchModelMeta(modelId: string): Promise<AIModelMeta | null> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('id', modelId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToMeta(data);
}

// Delete a model: remove weights from IndexedDB + metadata from Supabase.
export async function deleteModel(modelId: string): Promise<void> {
  await deleteModelWeights(modelId);
  await supabase.from('ai_models').delete().eq('id', modelId);
  await supabase.from('ai_predictions').delete().eq('model_id', modelId);
}

function rowToMeta(row: Record<string, unknown>): AIModelMeta {
  return {
    id: row.id as string,
    name: row.name as string,
    architecture: row.architecture as Architecture,
    hyperparams: row.hyperparams as unknown as Hyperparams,
    metrics: (row.metrics as unknown as TrainingResult) ?? null,
    status: (row.status as AIModelMeta['status']) ?? 'untrained',
    inputFeatures: (row.input_features as string[]) ?? [],
    outputClasses: (row.output_classes as string[]) ?? [],
    trainedAt: (row.trained_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}
