import { ResetForm } from "./reset-form";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const { t } = await getServerDictionary();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <h1 className="text-2xl font-bold">{t.auth.resetTitle}</h1>
        <ResetForm
          labels={{
            password: t.common.password,
            saving: t.common.loading,
            save: t.common.save,
            updated: t.auth.passwordUpdated,
          }}
        />
      </div>
    </div>
  );
}
