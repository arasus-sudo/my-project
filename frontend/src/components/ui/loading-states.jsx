import { Skeleton } from "./skeleton";

/**
 * Shared skeleton building blocks — content-shaped loading states instead of
 * a blank page + spinner/"Loading…" text. Perceived-load research (and every
 * comparable product: Linear, Stripe, Notion, GitHub) consistently shows
 * skeletons matching the final layout read as faster than blank+spinner at
 * identical real latency.
 */

export function SkeletonKpiGrid({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-flat shadow-card p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 6, cols = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="p-3"><Skeleton className="h-4 w-full max-w-[160px]" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonListRows({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-flat shadow-card p-3 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 4, cardsPerColumn = 2 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: cardsPerColumn }).map((_, i) => (
            <div key={i} className="card-flat shadow-card p-3 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-flat shadow-card p-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
