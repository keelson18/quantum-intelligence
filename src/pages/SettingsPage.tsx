import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, Bell, Shield, User, Sliders, Save, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useSettingsStore, type RiskTolerance } from '../store/settingsStore';
import { getUserSettings, saveUserSettings } from '../lib/data/settings.repo';
import type { UserRole } from '../lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User', trader: 'Trader', analyst: 'Analyst', admin: 'Admin', super_admin: 'Super Admin',
};

export default function SettingsPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, role } = useAuth();
  const store = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings from DB on mount
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const data = await getUserSettings(user.id);
      if (data) {
        store.bulkSet({
          defaultTimeframe: data.default_timeframe,
          riskTolerance: data.risk_tolerance,
          notifPriceAlerts: data.notif_price_alerts,
          notifAISignals: data.notif_ai_signals,
          notifRiskWarnings: data.notif_risk_warnings,
          notifStrategyTriggers: data.notif_strategy_triggers,
        });
      }
    })();
  }, [user?.id]);

  const saveSettings = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    await saveUserSettings(user.id, {
      defaultTimeframe: store.defaultTimeframe,
      riskTolerance: store.riskTolerance,
      theme,
      notifPriceAlerts: store.notifPriceAlerts,
      notifAISignals: store.notifAISignals,
      notifRiskWarnings: store.notifRiskWarnings,
      notifStrategyTriggers: store.notifStrategyTriggers,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [user, store, theme]);

  return (
    <div className="px-4 lg:px-6 py-4 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-base font-semibold tracking-tight">Settings</h1>
      </div>

      <Section icon={User} title="Account">
        <Row label="Email" value={user?.email ?? 'Not signed in'} />
        <Row label="Role" value={ROLE_LABELS[role]} />
      </Section>

      <Section icon={theme === 'dark' ? Moon : Sun} title="Appearance">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="text-xs text-muted">Switch between light and dark mode</div>
          </div>
          <button onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg border border-border text-sm hover:border-primary transition-colors">
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </Section>

      <Section icon={Sliders} title="Trading Preferences">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium">Default Timeframe</div>
            <div className="text-xs text-muted">Timeframe used when opening the dashboard</div>
          </div>
          <select value={store.defaultTimeframe} onChange={(e) => store.setSetting('defaultTimeframe', e.target.value as typeof store.defaultTimeframe)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary">
            {['15m', '1h', '4h', '1d'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between py-2 border-t border-border/50">
          <div>
            <div className="text-sm font-medium">Risk Tolerance</div>
            <div className="text-xs text-muted">Affects position sizing and stop placement</div>
          </div>
          <select value={store.riskTolerance} onChange={(e) => store.setSetting('riskTolerance', e.target.value as RiskTolerance)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm focus:outline-none focus:border-primary">
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div className="flex items-center justify-between py-2 border-t border-border/50">
          <div>
            <div className="text-sm font-medium">Portfolio Equity ($)</div>
            <div className="text-xs text-muted">Virtual capital for paper trading</div>
          </div>
          <input type="number" value={store.portfolioEquity} onChange={(e) => store.setSetting('portfolioEquity', parseFloat(e.target.value) || 0)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums w-32 focus:outline-none focus:border-primary" />
        </div>
        <div className="flex items-center justify-between py-2 border-t border-border/50">
          <div>
            <div className="text-sm font-medium">Max Risk Per Trade (%)</div>
            <div className="text-xs text-muted">Maximum capital risked on a single position</div>
          </div>
          <input type="number" step="0.5" value={store.maxRiskPerTrade * 100} onChange={(e) => store.setSetting('maxRiskPerTrade', (parseFloat(e.target.value) || 0) / 100)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums w-20 focus:outline-none focus:border-primary" />
        </div>
      </Section>

      <Section icon={Bell} title="Notifications">
        <Toggle label="Price Alerts" description="Get notified on significant price movements"
          value={store.notifPriceAlerts} onChange={(v) => store.setSetting('notifPriceAlerts', v)} />
        <Toggle label="AI Signal Alerts" description="Get notified when the AI generates a new trade signal"
          value={store.notifAISignals} onChange={(v) => store.setSetting('notifAISignals', v)} />
        <Toggle label="Risk Warnings" description="Get alerted when portfolio risk limits are breached"
          value={store.notifRiskWarnings} onChange={(v) => store.setSetting('notifRiskWarnings', v)} />
        <Toggle label="Strategy Triggers" description="Get notified when a strategy fires a signal"
          value={store.notifStrategyTriggers} onChange={(v) => store.setSetting('notifStrategyTriggers', v)} />
      </Section>

      <Section icon={Shield} title="Security">
        <Row label="Two-Factor Auth" value="Not enabled" />
        <Row label="Session" value="Active" />
        <Row label="Auth Method" value="Email & Password" />
      </Section>

      <button onClick={saveSettings} disabled={saving}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-black text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors">
        {saved ? <Check className="w-4 h-4" /> : saving ? <Save className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 border-t border-border/50 first:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
