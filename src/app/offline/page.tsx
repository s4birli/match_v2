export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-3xl">
          ⚽
        </div>
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          Match Club needs a network connection to load the latest match data.
          We&apos;ll be right back as soon as you reconnect.
        </p>
      </div>
    </div>
  );
}
