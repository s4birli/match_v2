import Link from "next/link";

export default function NoGroupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <h1 className="text-2xl font-bold">No group yet</h1>
        <p className="text-sm text-muted-foreground">
          Ask your group admin for an invite link or invite code, then come back.
        </p>
        <Link href="/join" className="text-emerald-300 hover:underline">
          Join with a code →
        </Link>
      </div>
    </div>
  );
}
