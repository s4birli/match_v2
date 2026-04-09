import { getServerDictionary } from "@/lib/i18n/server";

export const dynamic = "force-static";

export default async function OfflinePage() {
  // Note: this page is force-static and the SW caches it, so the bilingual
  // text will be locked to whatever locale was active at build time. We
  // include both languages in the markup so users on either side see
  // their language regardless of which one was cached.
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-3xl">
          ⚽
        </div>
        <h1 className="text-2xl font-bold">{t.errors.offlineTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.errors.offlineHint}</p>
      </div>
    </div>
  );
}
