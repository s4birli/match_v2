import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function InviteLanding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseServiceClient();
  const { data: invite } = await supabase
    .from("tenant_invites")
    .select("*, tenant:tenants(*)")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <div className="glass p-6 text-center">
          <h1 className="text-xl font-bold">Invite not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">The link is invalid or has expired.</p>
          <Link href="/login" className="mt-4 inline-block text-emerald-300 hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="glass space-y-5 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-violet-600 text-2xl">
          ⚽
        </div>
        <h1 className="text-2xl font-bold">{invite.tenant.name}</h1>
        <p className="text-sm text-muted-foreground">You've been invited to join this football group.</p>
        <div className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={`/register?token=${token}`} data-testid="invite-register">Create account & join</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/login?next=/dashboard`} data-testid="invite-login">I already have an account</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
