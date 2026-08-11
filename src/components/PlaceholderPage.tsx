import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// PlaceholderPage — used for routes that aren't fully built yet.
// Shows the page title and a "coming soon" state with relevant context.
export default function PlaceholderPage({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description: string;
}) {
  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        </div>
      </div>
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <Icon className="w-10 h-10 text-muted mx-auto mb-4" />
        <h2 className="text-sm font-medium mb-2">{title}</h2>
        <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// Reusable section wrapper for page content.
export function PageSection({ children }: { children: ReactNode }) {
  return <div className="px-4 lg:px-6 py-4 space-y-4">{children}</div>;
}
