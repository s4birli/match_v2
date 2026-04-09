import Link from "next/link";
import { ForgotForm } from "./forgot-form";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{t.auth.forgotTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {t.auth.checkInbox}
          </p>
        </header>
        <ForgotForm
          labels={{
            email: t.common.email,
            sending: t.common.loading,
            send: t.auth.sendResetLink,
            checkInbox: t.auth.checkInbox,
          }}
        />
        <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">
          {t.auth.backToLogin}
        </Link>
      </div>
    </div>
  );
}
