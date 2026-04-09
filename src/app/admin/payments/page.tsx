import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { listTenantMembers } from "@/server/db/queries";
import { PaymentForm } from "./payment-form";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export default async function AdminPaymentsPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const members = await listTenantMembers(membership.tenant_id);

  // Compute balances for each member from ledger
  const admin = createSupabaseServiceClient();
  const { data: txs } = await admin
    .from("ledger_transactions")
    .select("membership_id, amount, direction, currency_code")
    .eq("tenant_id", membership.tenant_id);

  const balances = new Map<string, { balance: number; currency: string }>();
  for (const t of txs ?? []) {
    const cur = balances.get(t.membership_id) ?? { balance: 0, currency: t.currency_code };
    cur.balance += (t.direction === "credit" ? 1 : -1) * Number(t.amount);
    cur.currency = t.currency_code;
    balances.set(t.membership_id, cur);
  }

  return (
    <AppShell session={session} activePath="/admin/payments">
      <header>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>
      <Card>
        <h2 className="mb-3 text-base font-semibold">Record payment</h2>
        <PaymentForm
          members={members.map((m) => ({
            id: m.id,
            name: (m as { person?: { display_name?: string } }).person?.display_name ?? "Player",
          }))}
        />
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">Member balances</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => {
            const display =
              (m as { person?: { display_name?: string } }).person?.display_name ?? "Player";
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
                  {b ? `${b.balance.toFixed(2)} ${b.currency}` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </AppShell>
  );
}
