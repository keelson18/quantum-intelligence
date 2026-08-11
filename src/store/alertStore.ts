import { create } from 'zustand';
import type { AlertRow } from '../lib/types';

interface AlertState {
  alerts: AlertRow[];
  unreadCount: number;
  setAlerts: (alerts: AlertRow[]) => void;
  addAlert: (alert: AlertRow) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,
  setAlerts: (alerts) =>
    set({ alerts, unreadCount: alerts.filter((a) => !a.read).length }),
  addAlert: (alert) =>
    set((s) => ({
      alerts: [alert, ...s.alerts].slice(0, 100),
      unreadCount: s.unreadCount + (alert.read ? 0 : 1),
    })),
  markRead: (id) =>
    set((s) => {
      const alerts = s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    }),
  markAllRead: () =>
    set((s) => ({
      alerts: s.alerts.map((a) => ({ ...a, read: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ alerts: [], unreadCount: 0 }),
}));
