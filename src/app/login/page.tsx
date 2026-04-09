import Link from "next/link";
import { LoginForm } from "./login-form";
import { getServerDictionary } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/layout/language-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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
          <h1 className="text-2xl font-bold text-balance">{t.auth.loginTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.auth.loginSubtitle}</p>
        </header>

        <LoginForm
          next={sp.next}
          labels={{
            email: t.common.email,
            password: t.common.password,
            submit: t.common.signIn,
            pending: t.common.loading,
          }}
        />

        <div className="space-y-3 text-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="block text-emerald-300 hover:underline">
            {t.auth.forgot}
          </Link>
          <p>
            {t.auth.noAccount}{" "}
            <Link href="/register" className="font-semibold text-foreground hover:underline">
              {t.common.signUp}
            </Link>
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-2 text-center text-[11px] text-muted-foreground">
        <p>Demo accounts (password: <code className="rounded bg-white/[0.04] px-1">Test1234!</code>)</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          <code className="rounded-lg bg-white/[0.04] px-2 py-1">owner@example.com</code>
          <code className="rounded-lg bg-white/[0.04] px-2 py-1">admin.demo@example.com</code>
          <code className="rounded-lg bg-white/[0.04] px-2 py-1">assistant.demo@example.com</code>
          <code className="rounded-lg bg-white/[0.04] px-2 py-1">user.demo@example.com</code>
        </div>
      </div>
    </div>
  );
}
