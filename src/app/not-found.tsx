import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <h1 className="text-3xl font-black">404</h1>
        <p className="text-sm text-muted-foreground">{t.errors.pageNotFound}</p>
        <Link
          href="/dashboard"
          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          {t.errors.backToDashboard}
        </Link>
      </div>
    </div>
  );
}
