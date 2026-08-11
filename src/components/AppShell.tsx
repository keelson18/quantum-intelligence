import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useSidebar } from '../context/SidebarContext';
import { AlertBell } from './AlertPanel';

// AppShell — the persistent layout: sidebar + main content area + top alert bar.
export default function AppShell() {
  const { collapsed } = useSidebar();
  return (
    <div className="min-h-screen bg-bg text-text">
      <Sidebar />
      <main
        className={`transition-all duration-300 ease-in-out ${
          collapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <div className="sticky top-0 z-30 bg-bg/80 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-end">
          <AlertBell />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
