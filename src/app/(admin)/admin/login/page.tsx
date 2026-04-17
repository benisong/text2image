import { redirect } from "next/navigation";

import { LoginForm } from "@/components/shared/login-form";
import { getCurrentUser } from "@/server/auth/session";

export default async function AdminLoginPage() {
  const user = await getCurrentUser();

  if (user?.role === "admin") {
    redirect("/admin");
  }

  return (
    <main className="admin-shell flex min-h-screen items-center justify-center px-6 py-12">
      <LoginForm
        title="管理端登录"
        description="管理员可以统一管理用户账号、密码、API 配置和系统运行状态。"
        redirectTo="/admin"
        accentClassName="bg-admin text-admin-ink"
        requiredRole="admin"
      />
    </main>
  );
}
