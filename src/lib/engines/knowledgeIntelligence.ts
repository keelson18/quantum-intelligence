// ============================================================================
// Engine 10 — Knowledge Intelligence Engine (Master Prompt §12.10, §22)
// Institutional memory: validated observations, reaction levels, failed
// breakouts and lessons. Every knowledge item is versioned, traceable,
// validated, retrievable and auditable.
// ============================================================================

import type { Candle, MarketMemory } from '../types';
import { analyzeMarketMemory } from '../institutionalEngine';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import type { SimilarityResult } from './historicalSimilarity';

const D = ENGINE_REGISTRY[9];

export type KnowledgeKind = 'pattern' | 'regime' | 'strategy' | 'behaviour' | 'lesson' | 'hypothesis' | 'validated_observation';

export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  statement: string;
  /** Where the claim came from — traceability requirement of §22. */
  source: string;
  version: string;
  validated: boolean;
  supportCount: number;
}

export interface KnowledgeResult {
  memory: MarketMemory;
  items: KnowledgeItem[];
  validatedCount: number;
}

export function knowledgeEngine(
  contextId: string,
  candles: Candle[],
  similarity: SimilarityResult | null,
): EngineResult<KnowledgeResult> {
  return runEngine<KnowledgeResult>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history to derive institutional memory'] };
    }

    const memory = analyzeMarketMemory(candles, 120);
    const items: KnowledgeItem[] = [];
    let n = 0;
    const add = (kind: KnowledgeKind, statement: string, source: string, validated: boolean, supportCount: number) => {
      items.push({ id: `${contextId}#k${++n}`, kind, statement, source, version: D.version, validated, supportCount });
    };

    for (const r of memory.rejections.slice(0, 4)) {
      add('validated_observation', `Price has rejected ${r.level.toFixed(2)} ${r.count} time(s)`, 'market_memory.rejections', r.count >= 2, r.count);
    }
    for (const f of memory.failedBreakouts.slice(0, 3)) {
      add('behaviour', `Failed ${f.direction === 'up' ? 'upside' : 'downside'} breakout at ${f.level.toFixed(2)} (${f.count}x)`, 'market_memory.failedBreakouts', f.count >= 2, f.count);
    }
    if (memory.historicalSupport.length) {
      add('validated_observation', `Historical support cluster: ${memory.historicalSupport.slice(0, 3).map((v) => v.toFixed(2)).join(', ')}`, 'market_memory.historicalSupport', true, memory.historicalSupport.length);
    }
    if (memory.historicalResistance.length) {
      add('validated_observation', `Historical resistance cluster: ${memory.historicalResistance.slice(0, 3).map((v) => v.toFixed(2)).join(', ')}`, 'market_memory.historicalResistance', true, memory.historicalResistance.length);
    }
    if (similarity && similarity.sampleSize > 0) {
      const validated = similarity.sampleQuality === 'strong' || similarity.sampleQuality === 'moderate';
      add(
        validated ? 'validated_observation' : 'hypothesis',
        `Analogous contexts resolved ${(similarity.upRate * 100).toFixed(0)}% up / ${(similarity.downRate * 100).toFixed(0)}% down over ${similarity.sampleSize} cases`,
        'historical_similarity',
        validated,
        similarity.sampleSize,
      );
    }
    if (memory.reactionScore > 0.6) {
      add('lesson', 'Current levels have produced strong reactions — expect responsive rather than trending behaviour', 'market_memory.reactionScore', true, 1);
    }

    const validatedCount = items.filter((i) => i.validated).length;
    const evidence: Evidence[] = [
      { key: 'reaction_score', value: Number(memory.reactionScore.toFixed(3)) },
      { key: 'knowledge_items', value: items.length },
      { key: 'validated_items', value: validatedCount },
      ...items.slice(0, 6).map((i) => ({ key: i.kind, value: i.statement, note: `${i.source} (${i.validated ? 'validated' : 'unvalidated'})` })),
    ];

    return {
      status: items.length === 0 ? 'degraded' : 'ok',
      result: { memory, items, validatedCount },
      confidence: items.length === 0 ? 0 : Math.min(1, validatedCount / Math.max(3, items.length)) * memory.reactionScore,
      evidence,
      warnings: items.length === 0 ? ['No institutional memory available for this context'] : [],
    };
  });
}
