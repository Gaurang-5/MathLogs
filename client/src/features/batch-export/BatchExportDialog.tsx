import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, X } from 'lucide-react';

export type BatchExportColumn = { id: string; label: string; group: 'Student details' | 'Performance' | 'Fees' };

type Props = {
  columns: BatchExportColumn[];
  onClose: () => void;
  onDownload: (columnIds: string[]) => Promise<void>;
};

export function BatchExportDialog({ columns, onClose, onDownload }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const toggle = (id: string) => setSelected(current => current.includes(id)
    ? current.filter(value => value !== id)
    : [...current, id]);

  const submit = async () => {
    if (selected.length === 0 || downloading) return;
    setDownloading(true);
    try { await onDownload(selected); } finally { setDownloading(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end bg-black/45 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="batch-export-title">
      <div className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <header className="flex items-start gap-3 border-b border-black/[0.06] px-5 py-5 sm:px-6">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-neutral-100"><Download className="h-4.5 w-4.5" /></div>
          <div className="min-w-0 flex-1"><h2 id="batch-export-title" className="text-xl font-black text-black">Choose columns</h2><p className="mt-1 text-sm text-app-text-secondary">Only selected columns will appear in the PDF.</p></div>
          <button type="button" onClick={onClose} aria-label="Close column chooser" className="rounded-xl p-2 text-app-text-tertiary hover:bg-neutral-100 hover:text-black"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3 text-xs font-black uppercase tracking-wider sm:px-6">
          <span className="text-app-text-tertiary">{selected.length} selected</span>
          <div className="flex gap-4"><button type="button" onClick={() => setSelected(columns.map(column => column.id))}>Select all</button><button type="button" onClick={() => setSelected([])} className="text-app-text-secondary">Clear all</button></div>
        </div>
        <div className="overflow-y-auto px-5 py-4 sm:px-6">
          {(['Student details', 'Performance', 'Fees'] as const).map(group => {
            const groupColumns = columns.filter(column => column.group === group);
            if (groupColumns.length === 0) return null;
            return <section key={group} className="mb-5 last:mb-0"><h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-app-text-tertiary">{group}</h3><div className="grid gap-2 sm:grid-cols-2">{groupColumns.map(column => {
              const checked = selected.includes(column.id);
              return <label key={column.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-bold transition-colors ${checked ? 'border-black bg-neutral-50 text-black' : 'border-black/[0.08] text-app-text-secondary hover:border-black/20'}`}>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(column.id)} />
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-black bg-black text-white' : 'border-black/20 bg-white'}`}>{checked ? <Check className="h-3.5 w-3.5" /> : null}</span>
                <span>{column.label}</span>
              </label>;
            })}</div></section>;
          })}
        </div>
        <footer className="border-t border-black/[0.06] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex sm:justify-end sm:gap-3 sm:px-6 sm:pb-5">
          <button type="button" onClick={onClose} className="hidden rounded-xl px-4 py-3 text-sm font-bold sm:block">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={selected.length === 0 || downloading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300 sm:w-auto">
            <Download className="h-4 w-4" />{downloading ? 'Generating…' : 'Download PDF'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
