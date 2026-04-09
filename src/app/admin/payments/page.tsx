import { AlertTriangle, Banknote, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import {
  listFundCollections,
  listOverdueMembers,
  listTenantMembers,
} from "@/server/db/queries";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatCurrency, initials, formatDate } from "@/lib/utils";
import { PaymentForm } from "./payment-form";
import { CreateFundForm } from "./create-fund-form";
import { ReminderButton } from "./reminder-button";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminPaymentsPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const { t } = await getServerDictionary();
  const [members, overdue, funds] = await Promise.all([
    listTenantMembers(membership.tenant_id),
    listOverdueMembers(membership.tenant_id),
    listFundCollections(membership.tenant_id),
  ]);
  const memberOptions = members.map((m) => ({
    id: m.id,
    name:
      (m as { person?: { display_name?: string } }).person?.display_name ?? "Player",
  }));

  // Member balances (full list, not just overdue).
  const admin = createSupabaseServiceClient();
  const { data: txs } = await admin
    .from("ledger_transactions")
    .select("membership_id, amount, direction, currency_code")
    .eq("tenant_id", membership.tenant_id);
  const balances = new Map<string, { balance: number; currency: string }>();
  for (const t of txs ?? []) {
    const cur = balances.get(t.membership_id) ?? {
      balance: 0,
      currency: t.currency_code,
    };
    cur.balance += (t.direction === "credit" ? 1 : -1) * Number(t.amount);
    cur.currency = t.currency_code;
    balances.set(t.membership_id, cur);
  }

  return (
    <AppShell session={session} activePath="/admin/payments">
      <header>
        <h1 className="text-2xl font-bold">{t.admin.paymentsTitle}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      {/* Overdue list — top of page so admin sees who owes first */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-300" />
          <h2 className="text-base font-semibold">
            {t.admin.overdue} · {overdue.length}
          </h2>
        </header>
        {overdue.length === 0 ? (
          <EmptyState title={t.admin.noOverdue} />
        ) : (
          <ul className="space-y-2">
            {overdue.map((row) => (
              <li
                key={row.membership_id}
                data-testid={`overdue-${row.membership_id}`}
                className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(row.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.displayName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.admin.owes} {formatCurrency(Math.abs(row.balance), row.currency)}
                  </p>
                </div>
                <span className="text-sm font-bold text-amber-300">
                  -{formatCurrency(Math.abs(row.balance), row.currency)}
                </span>
                <ReminderButton membershipId={row.membership_id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record manual payment */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <Wallet size={16} className="text-emerald-300" />
          <h2 className="text-base font-semibold">{t.admin.recordPayment}</h2>
        </header>
        <PaymentForm members={memberOptions} />
      </Card>

      {/* Fund collection */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <Banknote size={16} className="text-violet-300" />
          <h2 className="text-base font-semibold">{t.admin.openFundCollection}</h2>
        </header>
        <p className="mb-3 text-xs text-muted-foreground">{t.admin.fundCollectionHint}</p>
        <CreateFundForm
          members={memberOptions}
          currencyCode={membership.tenant.currency_code}
        />
        {funds.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.admin.pastCollections}
            </h3>
            <ul className="space-y-2">
              {funds.map((f) => (
                <li
                  key={f.id}
                  data-testid={`fund-${f.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {f.charged_count} members charged ·{" "}
                      {formatCurrency(
                        Number(f.total_charged),
                        f.currency_code,
                      )}{" "}
                      · {formatDate(f.created_at)}
                    </p>
                  </div>
                  <Badge variant="accent">
                    {formatCurrency(
                      Number(f.amount_per_member),
                      f.currency_code,
                    )}{" "}
                    {t.admin.perHead}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* All member balances */}
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.allBalances}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => {
            const display =
              (m as { person?: { display_name?: string } }).person?.display_name ??
              "Player";
            const b = balances.get(m.id);
            return (
              <li
                key={m.id}
                data-testid={`balance-${m.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <span className="text-sm font-semibold">{display}</span>
                <span
                  className={`text-sm font-bold ${
                    !b || b.balance >= 0 ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {b
                    ? formatCurrency(b.balance, b.currency)
                    : formatCurrency(0, membership.tenant.currency_code)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </AppShell>
  );
}
