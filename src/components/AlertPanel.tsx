import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, X, Check, Trash2, Plus, Zap } from 'lucide-react';
import { useAlertStore } from '../store/alertStore';
import { useAuth } from '../context/AuthContext';
import { listAlertRules, createAlertRule, setAlertRuleEnabled, deleteAlertRule } from '../lib/data/alerts.repo';

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-primary bg-primary/10',
  warning: 'text-warning bg-warning/10',
  critical: 'text-danger bg-danger/10',
};

const TYPE_ICONS: Record<string, string> = {
  price: 'PRICE', ai_signal: 'AI', risk: 'RISK', strategy: 'TECH',
};

export function AlertBell() {
  const { unreadCount, alerts, markRead, markAllRead } = useAlertStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative w-8 h-8 rounded-lg hover:bg-bg flex items-center justify-center transition-colors">
        {unreadCount > 0 ? <BellRing className="w-4 h-4 text-primary" /> : <Bell className="w-4 h-4 text-muted" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-surface border border-border rounded-xl shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <h3 className="text-xs font-semibold">Notifications</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-primary hover:underline">Mark all read</button>
                )}
                <button onClick={() => setOpen(false)} className="text-muted hover:text-text"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="py-8 text-center text-muted text-xs">No notifications yet</div>
              ) : (
                alerts.slice(0, 30).map((a) => (
                  <div key={a.id} className={`px-3 py-2.5 border-b border-border/50 hover:bg-bg/50 transition-colors ${!a.read ? 'bg-primary/5' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.info}`}>
                        {TYPE_ICONS[a.type] ?? a.type.toUpperCase().slice(0, 4)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium leading-tight">{a.message}</div>
                        <div className="text-[10px] text-muted mt-0.5">{new Date(a.created_at).toLocaleTimeString()}</div>
                      </div>
                      {!a.read && (
                        <button onClick={() => markRead(a.id)} className="text-muted hover:text-primary shrink-0">
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AlertRuleRow {
  id: string;
  type: string;
  symbol: string;
  threshold: number | null;
  severity: string;
  enabled: boolean;
  message: string;
}

export function AlertManager() {
  const { user } = useAuth();
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('price_above');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [threshold, setThreshold] = useState('');
  const [severity, setSeverity] = useState('info');

  const loadRules = useCallback(async () => {
    if (!user) return;
    setRules((await listAlertRules(user.id)) as AlertRuleRow[]);
  }, [user]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = async () => {
    if (!user) return;
    const messages: Record<string, string> = {
      price_above: `${symbol} price above ${threshold}`,
      price_below: `${symbol} price below ${threshold}`,
      rsi_above: `${symbol} RSI above ${threshold}`,
      rsi_below: `${symbol} RSI below ${threshold}`,
      macd_cross: `${symbol} MACD crossover`,
      ema_cross: `${symbol} EMA20/50 crossover`,
      pattern: `${symbol} pattern detected`,
      structure_bos: `${symbol} Break of Structure`,
      structure_choch: `${symbol} Change of Character`,
      ai_buy: `${symbol} AI BUY signal`,
      ai_sell: `${symbol} AI SELL signal`,
      ai_confidence: `${symbol} AI confidence above ${threshold}%`,
      risk_exposure: 'Portfolio exposure exceeded',
      risk_drawdown: 'Drawdown warning',
    };
    await createAlertRule(user.id, {
      type, symbol,
      threshold: threshold ? parseFloat(threshold) : null,
      severity, message: messages[type] ?? `${symbol} ${type}`,
    });
    setShowForm(false); setThreshold(''); loadRules();
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    await setAlertRuleEnabled(id, !enabled);
    loadRules();
  };

  const deleteRule = async (id: string) => {
    await deleteAlertRule(id);
    loadRules();
  };

  const RULE_TYPES = [
    { value: 'price_above', label: 'Price Above', needsThreshold: true },
    { value: 'price_below', label: 'Price Below', needsThreshold: true },
    { value: 'rsi_above', label: 'RSI Above', needsThreshold: true },
    { value: 'rsi_below', label: 'RSI Below', needsThreshold: true },
    { value: 'macd_cross', label: 'MACD Crossover', needsThreshold: false },
    { value: 'ema_cross', label: 'EMA Crossover', needsThreshold: false },
    { value: 'pattern', label: 'Pattern Detected', needsThreshold: false },
    { value: 'structure_bos', label: 'Break of Structure', needsThreshold: false },
    { value: 'structure_choch', label: 'Change of Character', needsThreshold: false },
    { value: 'ai_buy', label: 'AI Buy Signal', needsThreshold: false },
    { value: 'ai_sell', label: 'AI Sell Signal', needsThreshold: false },
    { value: 'ai_confidence', label: 'AI Confidence Above %', needsThreshold: true },
    { value: 'risk_exposure', label: 'Excessive Exposure', needsThreshold: false },
    { value: 'risk_drawdown', label: 'Drawdown Warning', needsThreshold: false },
  ];

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Alert Rules</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="w-3 h-3" /> New Rule
        </button>
      </div>

      {showForm && (
        <div className="mb-3 p-3 rounded-lg bg-bg border border-border space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="px-2 py-1.5 rounded bg-surface border border-border text-text text-xs">
              {RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" className="px-2 py-1.5 rounded bg-surface border border-border text-text text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RULE_TYPES.find((t) => t.value === type)?.needsThreshold ? (
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Threshold" className="px-2 py-1.5 rounded bg-surface border border-border text-text text-xs" />
            ) : <div />}
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="px-2 py-1.5 rounded bg-surface border border-border text-text text-xs">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button onClick={addRule} className="w-full py-1.5 rounded bg-primary text-black text-xs font-medium">Create Rule</button>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="py-4 text-center text-muted text-xs">No alert rules configured</div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-bg/50">
              <button onClick={() => toggleRule(r.id, r.enabled)} className={`w-8 h-4 rounded-full transition-colors ${r.enabled ? 'bg-primary' : 'bg-muted/30'}`}>
                <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="flex-1 truncate">{r.message}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded ${SEVERITY_COLORS[r.severity] ?? ''}`}>{r.severity}</span>
              <button onClick={() => deleteRule(r.id)} className="text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
