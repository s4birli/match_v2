import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * One-line shim around audit_logs insert. Always best-effort: a failure to
 * audit must NEVER block the user-visible action. Per CLAUDE.md every
 * meaningful admin / finance / membership action MUST be auditable.
 */
export async function audit(entry: {
  tenantId?: string | null;
  actorAccountId?: string | null;
  actorMembershipId?: string | null;
  entityType: string;
  entityId: string;
  actionType: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const admin = createSupabaseServiceClient();
    await admin.from("audit_logs").insert({
      tenant_id: entry.tenantId ?? null,
      actor_account_id: entry.actorAccountId ?? null,
      actor_membership_id: entry.actorMembershipId ?? null,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action_type: entry.actionType,
      before_json: entry.before ?? null,
      after_json: entry.after ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[audit] insert failed", (err as Error).message);
  }
}
