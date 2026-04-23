export const SidebarSkeleton = () => (
  <div className="w-full space-y-3 p-4">
    <div className="shimmer h-5 w-3/4 rounded" />
    <div className="shimmer h-3 w-1/3 rounded" />
    <div className="shimmer h-12 w-full rounded" />
    <div className="shimmer h-2 w-full rounded" />
    <div className="space-y-2 pt-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="shimmer h-9 w-full rounded" />
      ))}
    </div>
  </div>
);

export const CanvasSkeleton = () => (
  <div className="relative h-full w-full blueprint-grid">
    <div className="absolute inset-6 shimmer rounded-lg opacity-60" />
    <div className="absolute inset-0 grid place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  </div>
);
