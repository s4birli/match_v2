import Link from "next/link";
import { RegisterForm } from "./register-form";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/layout/language-toggle";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; code?: string }>;
}) {
  const { t, locale } = await getServerDictionary();
  const sp = await searchParams;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 flex justify-end">
        <LanguageToggle current={locale} />
      </div>
      <div className="glass space-y-6 p-6">
        <header className="space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-2xl">
            ⚽
          </div>
          <h1 className="text-2xl font-bold">{t.auth.registerTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.common.tagline}</p>
        </header>
        <RegisterForm
          inviteToken={sp.token}
          inviteCode={sp.code}
          labels={{
            name: locale === "tr" ? "Görünen ad" : "Display name",
            email: t.common.email,
            password: t.common.password,
            inviteCode: t.auth.inviteCodePlaceholder,
            submit: t.common.signUp,
            pending: t.common.loading,
          }}
        />
        <p className="text-center text-sm text-muted-foreground">
          {t.auth.hasAccount}{" "}
          <Link href="/login" className="font-semibold text-foreground hover:underline">
            {t.common.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
