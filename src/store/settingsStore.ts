import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Timeframe } from '../lib/types';

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

interface SettingsState {
  defaultTimeframe: Timeframe;
  riskTolerance: RiskTolerance;
  notifPriceAlerts: boolean;
  notifAISignals: boolean;
  notifRiskWarnings: boolean;
  notifStrategyTriggers: boolean;
  portfolioEquity: number;
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  bulkSet: (partial: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultTimeframe: '1h',
      riskTolerance: 'moderate',
      notifPriceAlerts: true,
      notifAISignals: true,
      notifRiskWarnings: true,
      notifStrategyTriggers: false,
      portfolioEquity: 100000,
      maxRiskPerTrade: 0.02,
      maxDailyLoss: 0.06,
      setSetting: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      bulkSet: (partial) => set(partial),
    }),
    { name: 'qi-settings' },
  ),
);
