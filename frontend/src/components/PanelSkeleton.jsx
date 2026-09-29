function PanelSkeleton({ rows = 3, label = 'Cargando panel...' }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <p className="text-sm font-medium text-primary-dark/70">{label}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={`stat-${item}`} className="h-24 animate-pulse rounded-2xl bg-secondary-light/70" />
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`row-${index}`} className="h-36 animate-pulse rounded-2xl bg-white ring-1 ring-secondary-light" />
        ))}
      </div>
    </div>
  );
}

export default PanelSkeleton;
