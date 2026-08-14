import type { ReactNode } from 'react';

const tone = (value: string) => {
  if (['APPROVED', 'DELIVERED', 'CLAIMED', 'SENT', 'ACTIVE'].includes(value)) return 'bg-emerald-100 text-emerald-800';
  if (['REJECTED', 'FAILED', 'HIDDEN'].includes(value)) return 'bg-rose-100 text-rose-800';
  if (['CONTACTED', 'QUEUED'].includes(value)) return 'bg-blue-100 text-blue-800';
  if (['NEW', 'PENDING', 'HELD', 'UNCLAIMED', 'NOT_SENT'].includes(value)) return 'bg-amber-100 text-amber-800';
  return 'bg-neutral-100 text-neutral-700';
};

export const StatusBadge = ({ value }: { value: string }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide ${tone(value)}`}>
    {value.replace(/_/g, ' ')}
  </span>
);

export const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
  <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 py-14 text-center">
    <p className="text-sm font-bold text-neutral-800">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-neutral-500">{detail}</p>
  </div>
);

export const PanelError = ({ message, retry }: { message: string; retry: () => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
    <span>{message}</span><button onClick={retry} className="rounded-lg bg-white px-3 py-1.5 font-bold shadow-sm">Try again</button>
  </div>
);

export const Drawer = ({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) => (
  <div className="fixed inset-0 z-40 bg-neutral-950/30" role="presentation">
    <aside aria-label={title} className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl max-md:inset-0 max-md:max-w-none">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4 sm:px-7">
        <div><h2 className="text-base font-black tracking-tight text-neutral-950">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}</div>
        <button onClick={onClose} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-bold hover:bg-neutral-50" aria-label="Close details">Close</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">{children}</div>
    </aside>
  </div>
);

export const TableSkeleton = () => <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-neutral-100" />)}</div>;
