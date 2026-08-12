// ============================================================================
// Data Quality Engine — AI Engine Spec v1.1 §3 "Data Quality"
// Detects stale, missing, malformed, duplicate, timestamp-invalid and
// inconsistent candle data. Downstream decisions are blocked or downgraded
// when critical quality failures are present.
// ============================================================================

import type { Candle, Timeframe } from '../types';
import { runEngine, type EngineResult, type Evidence } from './contract';

export const DATA_QUALITY_VERSION = '1.0.0';

export type QualitySeverity = 'info' | 'warning' | 'critical';

export interface QualityIssue {
  code:
    | 'insufficient_history'
    | 'stale_feed'
    | 'missing_candles'
    | 'timestamp_discontinuity'
    | 'timestamp_non_monotonic'
    | 'duplicate_records'
    | 'invalid_ohlc'
    | 'negative_volume'
    | 'zero_volume_run';
  severity: QualitySeverity;
  count: number;
  detail: string;
}

export interface DataQualityReport {
  score: number; // 0..100
  fresh: boolean;
  usable: boolean; // false => pipeline must produce NO_TRADE
  bars: number;
  issues: QualityIssue[];
  lastBarAgeMs: number | null;
}

const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000,
  '1M': 2_592_000_000,
};

const SEVERITY_PENALTY: Record<QualitySeverity, number> = { info: 2, warning: 8, critical: 30 };

export function assessDataQuality(
  candles: Candle[],
  timeframe: Timeframe,
  now = Date.now(),
  minBars = 60,
): DataQualityReport {
  const issues: QualityIssue[] = [];
  const step = TF_MS[timeframe];

  if (candles.length < minBars) {
    issues.push({
      code: 'insufficient_history',
      severity: 'critical',
      count: minBars - candles.length,
      detail: `Only ${candles.length} bars available, ${minBars} required`,
    });
  }

  let invalidOhlc = 0;
  let negativeVolume = 0;
  let duplicates = 0;
  let nonMonotonic = 0;
  let gaps = 0;
  let zeroVolumeRun = 0;
  let currentZeroRun = 0;
  const seen = new Set<number>();

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const values = [c.open, c.high, c.low, c.close];
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) invalidOhlc++;
    else if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low) invalidOhlc++;

    if (!Number.isFinite(c.volume) || c.volume < 0) negativeVolume++;
    if (c.volume === 0) { currentZeroRun++; zeroVolumeRun = Math.max(zeroVolumeRun, currentZeroRun); }
    else currentZeroRun = 0;

    if (seen.has(c.time)) duplicates++;
    seen.add(c.time);

    if (i > 0) {
      const delta = c.time - candles[i - 1].time;
      if (delta <= 0) nonMonotonic++;
      else if (delta > step * 1.5) gaps += Math.max(1, Math.round(delta / step) - 1);
    }
  }

  if (invalidOhlc) issues.push({ code: 'invalid_ohlc', severity: 'critical', count: invalidOhlc, detail: `${invalidOhlc} bars violate OHLC relationships` });
  if (negativeVolume) issues.push({ code: 'negative_volume', severity: 'critical', count: negativeVolume, detail: `${negativeVolume} bars have invalid volume` });
  if (duplicates) issues.push({ code: 'duplicate_records', severity: 'warning', count: duplicates, detail: `${duplicates} duplicate timestamps` });
  if (nonMonotonic) issues.push({ code: 'timestamp_non_monotonic', severity: 'critical', count: nonMonotonic, detail: `${nonMonotonic} out-of-order timestamps` });
  if (gaps) {
    issues.push({
      code: gaps > candles.length * 0.05 ? 'missing_candles' : 'timestamp_discontinuity',
      severity: gaps > candles.length * 0.05 ? 'critical' : 'warning',
      count: gaps,
      detail: `${gaps} missing bars inferred from timestamp spacing`,
    });
  }
  if (zeroVolumeRun >= 5) issues.push({ code: 'zero_volume_run', severity: 'warning', count: zeroVolumeRun, detail: `${zeroVolumeRun} consecutive zero-volume bars` });

  const lastBar = candles[candles.length - 1];
  const lastBarAgeMs = lastBar ? now - lastBar.time : null;
  // Allow 3 bar periods of lag before the feed is considered stale.
  const fresh = lastBarAgeMs === null ? false : lastBarAgeMs <= step * 3;
  if (!fresh && lastBarAgeMs !== null) {
    issues.push({
      code: 'stale_feed',
      severity: lastBarAgeMs > step * 10 ? 'critical' : 'warning',
      count: Math.round(lastBarAgeMs / step),
      detail: `Last bar is ${Math.round(lastBarAgeMs / step)} periods old`,
    });
  }

  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const usable = !issues.some((i) => i.severity === 'critical') && score >= 50;

  return { score, fresh, usable, bars: candles.length, issues, lastBarAgeMs };
}

export function dataQualityEngine(
  contextId: string,
  candles: Candle[],
  timeframe: Timeframe,
  now = Date.now(),
): EngineResult<DataQualityReport> {
  return runEngine('data_quality', DATA_QUALITY_VERSION, contextId, () => {
    const report = assessDataQuality(candles, timeframe, now);
    const evidence: Evidence[] = [
      { key: 'quality_score', value: report.score },
      { key: 'bars', value: report.bars },
      { key: 'fresh', value: report.fresh },
      ...report.issues.map((i) => ({ key: i.code, value: i.count, note: i.detail })),
    ];
    const status = report.bars === 0
      ? 'insufficient_data'
      : report.usable ? 'ok' : 'degraded';
    return {
      status,
      result: report,
      confidence: report.score / 100,
      evidence,
      warnings: report.issues.filter((i) => i.severity !== 'info').map((i) => i.detail),
    };
  });
}
