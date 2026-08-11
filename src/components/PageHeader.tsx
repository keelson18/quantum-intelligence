import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// PageHeader — consistent page title + description for every route.
export default function PageHeader({ icon: Icon, title, subtitle, children }: {
  icon: LucideIcon; title: string; subtitle?: string; children?: ReactNode;
}) {
  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {children && <div className="ml-auto">{children}</div>}
      </div>
    </div>
  );
}
