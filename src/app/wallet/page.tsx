import { ArrowDown, ArrowUp, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireNonOwner } from "@/server/auth/session";
import { getWalletBalance, listLedgerForMembership } from "@/server/db/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function WalletPage() {
  const { session, membership } = await requireNonOwner();
  const { t, locale } = await getServerDictionary();

  const [{ balance, currency }, ledger] = await Promise.all([
    getWalletBalance(membership.tenant_id, membership.id),
    listLedgerForMembership(membership.tenant_id, membership.id),
  ]);

  return (
    <AppShell session={session} activePath="/wallet">
      <header>
        <h1 className="text-2xl font-bold">{t.nav.wallet}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <section className="hero-card">
        <p className="text-[11px] uppercase tracking-wider text-foreground/70">{t.wallet.balance}</p>
        <p
          data-testid="wallet-balance"
          className={`mt-2 text-4xl font-black ${balance >= 0 ? "text-emerald-300" : "text-red-300"}`}
        >
          {formatCurrency(balance, currency, locale === "tr" ? "tr-TR" : "en-GB")}
        </p>
        <p className="mt-2 text-xs text-foreground/70">
          Derived from {ledger.length} ledger entr{ledger.length === 1 ? "y" : "ies"}.
        </p>
      </section>

      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.wallet.transactions}</h2>
          <Wallet size={16} className="text-muted-foreground" />
        </header>
        {ledger.length === 0 ? (
          <EmptyState icon={<Wallet size={24} />} title={t.wallet.noTransactions} />
        ) : (
          <ul className="space-y-2">
            {ledger.map((tx) => {
              const credit = tx.direction === "credit";
              const matchTitle =
                (tx as { match?: { title?: string } }).match?.title ?? null;
              return (
                <li
                  key={tx.id}
                  data-testid={`tx-${tx.id}`}
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
                      {tx.description ?? tx.transaction_type}
                      {matchTitle ? ` · ${matchTitle}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(tx.recorded_at, locale === "tr" ? "tr-TR" : "en-GB")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${credit ? "text-emerald-300" : "text-red-300"}`}>
                      {credit ? "+" : "-"}
                      {formatCurrency(tx.amount, tx.currency_code, locale === "tr" ? "tr-TR" : "en-GB")}
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
