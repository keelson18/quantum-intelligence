import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAlertStore } from '../store/alertStore';
import type { AlertRow, Candle } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useSettingsStore } from '../store/settingsStore';
import { computeIndicators } from '../lib/indicators';
import { detectAllPatterns } from '../lib/patterns';
import { analyzeMarketStructure } from '../lib/structure';
import { makeDecision } from '../lib/decision';
import { DEFAULT_PORTFOLIO } from '../lib/risk';

export interface AlertRule {
  id: string;
  type: AlertRuleType;
  symbol: string;
  threshold: number | null;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  message: string;
}

export type AlertRuleType =
  | 'price_above' | 'price_below' | 'pct_move'
  | 'rsi_above' | 'rsi_below' | 'macd_cross' | 'ema_cross'
  | 'pattern' | 'structure_bos' | 'structure_choch'
  | 'ai_buy' | 'ai_sell' | 'ai_confidence'
  | 'risk_exposure' | 'risk_drawdown';

interface PricePoint { price: number; time: number; }

const PRICE_ALERT_THRESHOLD = 3;

export function useAlertEngine() {
  const { user } = useAuth();
  const addAlert = useAlertStore((s) => s.addAlert);
  const markRead = useAlertStore((s) => s.markRead);
  const markAllRead = useAlertStore((s) => s.markAllRead);
  const setAlerts = useAlertStore((s) => s.setAlerts);
  const settings = useSettingsStore();
  const priceHistoryRef = useRef<Map<string, PricePoint[]>>(new Map());
  const lastAlertTimeRef = useRef<Map<string, number>>(new Map());
  const rulesRef = useRef<AlertRule[]>([]);

  // Load existing alerts + subscribe to new ones
  useEffect(() => {
    if (!user) return;

    const loadAlerts = async () => {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setAlerts(data as AlertRow[]);
    };
    loadAlerts();

    const channel = supabase
      .channel(`alerts:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `user_id=eq.${user.id}` },
        (payload) => addAlert(payload.new as AlertRow),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, addAlert, setAlerts]);

  // Load alert rules
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('alert_rules')
        .select('*')
        .eq('user_id', user.id)
        .eq('enabled', true);
      rulesRef.current = (data ?? []) as AlertRule[];
    })();
  }, [user]);

  const createAlert = useCallback(async (
    type: AlertRow['type'],
    symbol: string,
    message: string,
    severity: AlertRow['severity'] = 'info',
    metadata: Record<string, unknown> = {},
  ) => {
    if (!user) return;
    const key = `${type}_${symbol}_${message.slice(0, 30)}`;
    const now = Date.now();
    const last = lastAlertTimeRef.current.get(key) ?? 0;
    if (now - last < 60_000) return; // dedupe: max 1 alert per type+symbol per minute
    lastAlertTimeRef.current.set(key, now);

    const { data } = await supabase
      .from('alerts')
      .insert({ user_id: user.id, type, symbol, message, severity, metadata })
      .select()
      .single();
    if (data) addAlert(data as AlertRow);
  }, [user, addAlert]);

  // Price alert: significant move in short window
  const checkPriceAlert = useCallback((symbol: string, price: number) => {
    if (!settings.notifPriceAlerts || !user) return;
    const history = priceHistoryRef.current.get(symbol) ?? [];
    const now = Date.now();
    history.push({ price, time: now });
    const cutoff = now - 5 * 60 * 1000;
    const recent = history.filter((p) => p.time > cutoff);
    priceHistoryRef.current.set(symbol, recent);

    if (recent.length > 1) {
      const oldest = recent[0];
      const changePct = ((price - oldest.price) / oldest.price) * 100;
      if (Math.abs(changePct) > PRICE_ALERT_THRESHOLD) {
        const direction = changePct > 0 ? 'surge' : 'drop';
        createAlert('price', symbol, `${symbol} ${direction}d ${Math.abs(changePct).toFixed(2)}% in 5 min`, 'warning', { changePct, currentPrice: price });
        priceHistoryRef.current.set(symbol, [{ price, time: now }]);
      }
    }

    // Check user-defined price rules
    for (const rule of rulesRef.current) {
      if (rule.symbol !== symbol) continue;
      if (rule.type === 'price_above' && rule.threshold && price >= rule.threshold) {
        createAlert('price', symbol, rule.message || `${symbol} above ${rule.threshold}`, rule.severity, { price, threshold: rule.threshold });
      }
      if (rule.type === 'price_below' && rule.threshold && price <= rule.threshold) {
        createAlert('price', symbol, rule.message || `${symbol} below ${rule.threshold}`, rule.severity, { price, threshold: rule.threshold });
      }
    }
  }, [settings.notifPriceAlerts, user, createAlert]);

  // Technical alert: RSI, MACD, EMA based on candles
  const checkTechnicalAlert = useCallback((symbol: string, candles: Candle[]) => {
    if (candles.length < 60) return;
    const ind = computeIndicators(candles);
    const i = candles.length - 1;
    const rsi = ind.rsi[i] ?? 0;
    const macdHist = ind.macd.hist[i] ?? 0;
    const macdHistPrev = ind.macd.hist[i - 1] ?? 0;
    const ema20 = ind.ema[20][i] ?? 0;
    const ema50 = ind.ema[50][i] ?? 0;
    const ema20Prev = ind.ema[20][i - 1] ?? 0;
    const ema50Prev = ind.ema[50][i - 1] ?? 0;

    for (const rule of rulesRef.current) {
      if (rule.symbol !== symbol) continue;
      if (rule.type === 'rsi_above' && rule.threshold && rsi >= rule.threshold) {
        createAlert('strategy', symbol, rule.message || `${symbol} RSI ${rsi.toFixed(0)} above ${rule.threshold}`, rule.severity, { rsi });
      }
      if (rule.type === 'rsi_below' && rule.threshold && rsi <= rule.threshold) {
        createAlert('strategy', symbol, rule.message || `${symbol} RSI ${rsi.toFixed(0)} below ${rule.threshold}`, rule.severity, { rsi });
      }
    }

    // MACD crossover detection
    if (macdHistPrev <= 0 && macdHist > 0) {
      createAlert('strategy', symbol, `${symbol} MACD bullish crossover`, 'info', { macdHist });
    } else if (macdHistPrev >= 0 && macdHist < 0) {
      createAlert('strategy', symbol, `${symbol} MACD bearish crossover`, 'info', { macdHist });
    }

    // EMA crossover detection
    if (ema20Prev <= ema50Prev && ema20 > ema50) {
      createAlert('strategy', symbol, `${symbol} EMA20 crossed above EMA50 (bullish)`, 'info', { ema20, ema50 });
    } else if (ema20Prev >= ema50Prev && ema20 < ema50) {
      createAlert('strategy', symbol, `${symbol} EMA20 crossed below EMA50 (bearish)`, 'info', { ema20, ema50 });
    }
  }, [createAlert]);

  // Pattern alert: detect chart/candlestick patterns
  const checkPatternAlert = useCallback((symbol: string, candles: Candle[]) => {
    if (candles.length < 30) return;
    const patterns = detectAllPatterns(candles);
    const recentPatterns = patterns.filter((p) => p.index >= candles.length - 3);
    for (const p of recentPatterns) {
      if (p.side === 'neutral') continue;
      createAlert('strategy', symbol, `${symbol} pattern detected: ${p.name} (${p.side})`, 'info', { pattern: p.name, side: p.side });
    }
  }, [createAlert]);

  // Market structure alert: BOS / CHoCH
  const checkStructureAlert = useCallback((symbol: string, candles: Candle[]) => {
    if (candles.length < 60) return;
    const structure = analyzeMarketStructure(candles);
    const recentEvents = structure.events.filter((e) => e.index >= candles.length - 5);
    for (const e of recentEvents) {
      if (e.type === 'BOS') {
        createAlert('strategy', symbol, `${symbol} Break of Structure (${e.direction})`, 'warning', { type: 'BOS', direction: e.direction });
      } else if (e.type === 'CHoCH') {
        createAlert('strategy', symbol, `${symbol} Change of Character (${e.direction})`, 'warning', { type: 'CHoCH', direction: e.direction });
      }
    }
  }, [createAlert]);

  // AI alert: BUY/SELL signals with confidence threshold
  const checkAIAlert = useCallback((symbol: string, candles: Candle[]) => {
    if (candles.length < 60) return;
    const decision = makeDecision(candles, null, symbol, '1h');
    if (!decision || decision.recommendation.side === 'neutral') return;
    const side = decision.recommendation.side;
    const confidence = Math.abs(decision.recommendation.score);

    for (const rule of rulesRef.current) {
      if (rule.symbol !== symbol) continue;
      if (rule.type === 'ai_buy' && side === 'buy') {
        createAlert('ai_signal', symbol, rule.message || `${symbol} AI BUY signal (${(confidence * 100).toFixed(0)}% confidence)`, 'info', { side, confidence });
      }
      if (rule.type === 'ai_sell' && side === 'sell') {
        createAlert('ai_signal', symbol, rule.message || `${symbol} AI SELL signal (${(confidence * 100).toFixed(0)}% confidence)`, 'info', { side, confidence });
      }
      if (rule.type === 'ai_confidence' && rule.threshold && confidence * 100 >= rule.threshold) {
        createAlert('ai_signal', symbol, rule.message || `${symbol} AI confidence ${(confidence * 100).toFixed(0)}% >= ${rule.threshold}%`, rule.severity, { confidence });
      }
    }
  }, [createAlert]);

  // Risk alert: exposure and drawdown
  const checkRiskAlert = useCallback((symbol: string, candles: Candle[]) => {
    if (candles.length < 60) return;
    const decision = makeDecision(candles, null, symbol, '1h');
    if (!decision || !decision.recommendation.risk) return;
    const risk = decision.recommendation.risk;

    if (risk.portfolioExposure > DEFAULT_PORTFOLIO.maxExposurePct) {
      createAlert('risk', symbol, `Excessive exposure: ${(risk.portfolioExposure * 100).toFixed(1)}% exceeds ${(DEFAULT_PORTFOLIO.maxExposurePct * 100).toFixed(0)}% limit`, 'critical', { exposure: risk.portfolioExposure });
    }
    const drawdown = (DEFAULT_PORTFOLIO.peakEquity - DEFAULT_PORTFOLIO.equity) / DEFAULT_PORTFOLIO.peakEquity;
    if (drawdown > DEFAULT_PORTFOLIO.maxDrawdownPct * 0.8) {
      createAlert('risk', symbol, `Drawdown warning: ${(drawdown * 100).toFixed(1)}% approaching ${(DEFAULT_PORTFOLIO.maxDrawdownPct * 100).toFixed(0)}% limit`, 'critical', { drawdown });
    }
  }, [createAlert]);

  return { createAlert, checkPriceAlert, checkTechnicalAlert, checkPatternAlert, checkStructureAlert, checkAIAlert, checkRiskAlert, markRead, markAllRead };
}
