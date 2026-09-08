/** Skeleton shown while live weather is fetched for the lake page. */
export default function LakeLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 animate-pulse">
      <div className="h-3 w-32 rounded bg-surface-2" />
      <div className="mt-3 h-8 w-64 rounded bg-surface-2" />
      <div className="mt-2 h-3 w-48 rounded bg-surface-2" />

      <div className="mt-6 rounded-xl border border-edge bg-surface/60 p-5">
        <div className="flex gap-6 items-center">
          <div className="h-32 w-32 rounded-full bg-surface-2 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-surface-2" />
            <div className="h-4 w-full max-w-sm rounded bg-surface-2" />
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
