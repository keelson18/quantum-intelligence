// ============================================================================
// Reusable async-state primitives (loading / error / empty / skeleton).
//
// Presentation only: no data access, no domain logic. Every screen that reads
// remote data should render one of these instead of hand-rolling markup, so
// loading and failure UX stays consistent and accessible across the app.
// ============================================================================

import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface BaseProps {
  className?: string;
}

/** Inline spinner with an accessible live-region label. */
export function LoadingState({ label = "Loading…", className }: BaseProps & { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Failure state with an optional retry affordance. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  onRetry,
  className,
}: BaseProps & { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

/** Zero-results state, distinct from an error so users aren't alarmed. */
export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon,
  className,
}: BaseProps & {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="text-muted-foreground" aria-hidden="true">
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Content-shaped placeholder used while first data loads. */
export function SkeletonList({ rows = 5, className }: BaseProps & { rows?: number }) {
  return (
    <div aria-hidden="true" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card-grid placeholder for dashboard panels. */
export function SkeletonCards({ count = 3, className }: BaseProps & { count?: number }) {
  return (
    <div aria-hidden="true" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-4">
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
