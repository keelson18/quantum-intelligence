import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Terminal, BrainCircuit, Radar, ScanSearch, BarChart3,
  Wallet, ShieldAlert, Newspaper, GraduationCap, Microscope, Settings,
  PanelLeftClose, PanelLeft, Activity, Sun, Moon, LogOut, Bell,
  BookOpen, Star,
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAlertStore } from '../store/alertStore';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/terminal', label: 'Trading Terminal', icon: Terminal, roles: ['trader', 'analyst', 'admin', 'super_admin'] },
  { to: '/ai-center', label: 'AI Trade Center', icon: BrainCircuit },
  { to: '/scanner', label: 'Market Scanner', icon: Radar },
  { to: '/patterns', label: 'Pattern Scanner', icon: ScanSearch },
  { to: '/backtesting', label: 'Backtesting', icon: BarChart3, roles: ['trader', 'analyst', 'admin', 'super_admin'] },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet, roles: ['trader', 'admin', 'super_admin'] },
  { to: '/journal', label: 'Trading Journal', icon: BookOpen, roles: ['trader', 'analyst', 'admin', 'super_admin'] },
  { to: '/watchlist', label: 'Watchlists', icon: Star },
  { to: '/risk', label: 'Risk Center', icon: ShieldAlert },
  { to: '/news', label: 'News & Sentiment', icon: Newspaper },
  { to: '/learning', label: 'AI Learning', icon: GraduationCap, roles: ['trader', 'analyst', 'admin', 'super_admin'] },
  { to: '/research', label: 'Research Terminal', icon: Microscope, roles: ['analyst', 'admin', 'super_admin'] },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User', trader: 'Trader', analyst: 'Analyst', admin: 'Admin', super_admin: 'Super Admin',
};

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const { signOut, role } = useAuth();
  const unreadCount = useAlertStore((s) => s.unreadCount);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-30 bg-surface border-r border-border flex flex-col transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo / brand */}
      <div className={`h-14 flex items-center border-b border-border shrink-0 ${collapsed ? 'justify-center' : 'px-4'}`}>
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="ml-3 font-semibold tracking-tight text-sm whitespace-nowrap overflow-hidden">
            Quantum Intelligence
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg transition-colors group ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted hover:bg-bg hover:text-text'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 py-2 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-muted">{ROLE_LABELS[role]}</span>
            <button className="ml-auto relative text-muted hover:text-text transition-colors" title="Alerts">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[8px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer controls */}
      <div className="border-t border-border p-2 space-y-0.5 shrink-0">
        {collapsed && (
          <button className="relative flex items-center justify-center w-full py-2 text-muted hover:text-text transition-colors" title={`Alerts (${unreadCount})`}>
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-2 w-3.5 h-3.5 rounded-full bg-danger text-white text-[7px] flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 w-full rounded-lg text-muted hover:bg-bg hover:text-text transition-colors ${
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Toggle theme' : undefined}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          {!collapsed && <span className="text-sm">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        <button
          onClick={signOut}
          className={`flex items-center gap-3 w-full rounded-lg text-muted hover:bg-bg hover:text-text transition-colors ${
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm">Sign out</span>}
        </button>
        <button
          onClick={toggle}
          className={`flex items-center gap-3 w-full rounded-lg text-muted hover:bg-bg hover:text-text transition-colors ${
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <PanelLeft className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
