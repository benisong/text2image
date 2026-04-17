import { redirect } from "next/navigation";

import { LoginForm } from "@/components/shared/login-form";
import { getCurrentUser } from "@/server/auth/session";

export default async function UserLoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.role === "admin" ? "/admin" : "/chat");
  }

  return (
    <main className="user-shell flex min-h-screen items-center justify-center px-6 py-12">
      <LoginForm
        title="用户端登录"
        description="登录后可以创建会话、提交提示词、查看图片和可选解说。"
        redirectTo="/chat"
      />
    </main>
  );
}
