import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">No water here</h1>
      <p className="mt-2 text-muted">
        That lake isn&rsquo;t in the dataset. It may be under 5 acres, unnamed, or a
        river rather than a lake.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg border border-edge bg-surface px-4 py-2 text-sm
                   hover:border-accent hover:text-accent transition-colors"
      >
        Search all lakes
      </Link>
    </div>
  );
}
