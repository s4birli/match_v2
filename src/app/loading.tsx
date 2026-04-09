export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4">
      <div className="h-12 w-12 animate-pulse rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600" />
      <p className="mt-4 text-xs text-muted-foreground">Loading…</p>
    </div>
  );
}
