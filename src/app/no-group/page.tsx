import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function NoGroupPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
      <div className="glass space-y-4 p-6">
        <h1 className="text-2xl font-bold">{t.errors.noGroupTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.errors.noGroupHint}</p>
        <Link href="/join" className="text-emerald-300 hover:underline">
          {t.errors.joinWithCode}
        </Link>
      </div>
    </div>
  );
}
