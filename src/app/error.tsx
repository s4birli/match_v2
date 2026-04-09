"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {error?.message ?? "An unexpected error occurred."}
        </p>
        {error?.digest ? (
          <p className="text-[10px] text-muted-foreground">digest: {error.digest}</p>
        ) : null}
        <button
          onClick={() => reset()}
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
