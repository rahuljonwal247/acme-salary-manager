import Link from 'next/link';
import { withParams, type Params } from '@/lib/query';
import { formatNumber } from '@/lib/format';

interface Props {
  basePath: string;
  params: Params;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export function Pagination({ basePath, params, page, totalPages, total, pageSize }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const href = (p: number) => `${basePath}${withParams(params, { page: p })}`;

  const linkCls = 'btn-secondary px-3 py-1.5';
  const disabledCls = 'btn-secondary px-3 py-1.5 pointer-events-none opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        Showing <strong className="text-slate-900">{formatNumber(from)}</strong>–
        <strong className="text-slate-900">{formatNumber(to)}</strong> of{' '}
        <strong className="text-slate-900">{formatNumber(total)}</strong>
      </span>
      <nav className="flex items-center gap-2" aria-label="Pagination">
        <Link href={href(1)} className={page > 1 ? linkCls : disabledCls} aria-disabled={page <= 1}>
          First
        </Link>
        <Link href={href(page - 1)} className={page > 1 ? linkCls : disabledCls} aria-disabled={page <= 1}>
          Previous
        </Link>
        <span className="px-2">
          Page {page} of {totalPages}
        </span>
        <Link
          href={href(page + 1)}
          className={page < totalPages ? linkCls : disabledCls}
          aria-disabled={page >= totalPages}
        >
          Next
        </Link>
      </nav>
    </div>
  );
}
