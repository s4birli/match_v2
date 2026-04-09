import { redirect } from "next/navigation";
import { getSessionContext } from "@/server/auth/session";

export default async function Index() {
  const session = await getSessionContext();
  if (session) redirect("/dashboard");
  redirect("/login");
}
