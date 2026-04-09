import { ArrowDown, ArrowUp, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { listAllLedgerForOwner } from "@/server/db/queries-owner";
import { getServerDictionary } from "@/lib/i18n/server";
import { formatCurrency, formatDate , bcp47Locale } from "@/lib/utils";

export default async function OwnerLedgerPage() {
  const { session } = await requireRole(["owner"]);
  const { t, locale } = await getServerDictionary();
  const rows = await listAllLedgerForOwner(200);

  return (
    <AppShell session={session} activePath="/owner/ledger">
      <header>
        <h1 className="text-2xl font-bold">{t.owner.ledgerPageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.owner.ledgerPageSubtitle}</p>
      </header>

      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {rows.length} {t.owner.ledgerEntries.toLowerCase()}
          </h2>
          <Wallet size={16} className="text-muted-foreground" />
        </header>
        {rows.length === 0 ? (
          <EmptyState icon={<Wallet size={24} />} title={t.owner.noLedgerEntries} />
        ) : (
          <ul className="space-y-2">
            {rows.map((tx) => {
              const credit = tx.direction === "credit";
              return (
                <li
                  key={tx.id}
                  data-testid={`ledger-${tx.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                      credit
                        ? "border border-emerald-400/30 bg-emerald-400/15 text-emerald-200"
                        : "border border-red-400/30 bg-red-400/15 text-red-200"
                    }`}
                  >
                    {credit ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {tx.member_display_name}{" "}
                      <span className="text-muted-foreground">·</span> {tx.tenant_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {tx.description ?? tx.transaction_type} ·{" "}
                      {formatDate(tx.recorded_at, bcp47Locale(locale))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        credit ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {credit ? "+" : "-"}
                      {formatCurrency(tx.amount, tx.currency_code)}
                    </p>
                    <Badge variant={credit ? "success" : "danger"}>{tx.transaction_type}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
