import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { getCurrentUser } from "@/server/auth/session";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const redirectTo = user.role === "admin" ? "/admin" : "/chat";

  return (
    <main className="user-shell flex min-h-screen items-center justify-center px-6 py-12">
      <ChangePasswordForm redirectTo={redirectTo} />
    </main>
  );
}
