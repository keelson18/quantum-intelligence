import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import AppShell from "@/components/AppShell";
import AuthScreen from "@/components/AuthScreen";
import { useAuth } from "@/context/AuthContext";
import { SidebarProvider } from "@/context/SidebarContext";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center animate-pulse">
        <Activity className="w-5 h-5 text-primary" />
      </div>
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}

function ShellLayout() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session && false) return <AuthScreen />;

  return (
    <SidebarProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </SidebarProvider>
  );
}
