import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MarketplaceBreadcrumbs({ items }: { items: Array<{ name: string; path: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500">
      {items.map((item, index) => (
        <span key={`${item.path}-${item.name}`} className="inline-flex items-center gap-1.5">
          {index > 0 ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-neutral-300" /> : null}
          <Link to={item.path} className="hover:text-neutral-950 hover:underline">{item.name}</Link>
        </span>
      ))}
    </nav>
  );
}
