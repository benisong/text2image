import Link from "next/link";

import { AdminUserActions } from "@/components/admin/user-actions";
import { AdminUserCreateForm } from "@/components/admin/user-create-form";
import { LogoutButton } from "@/components/shared/logout-button";
import { formatDateTime } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/guards";
import { listUsers } from "@/server/services/users";

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = listUsers();

  return (
    <main className="admin-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">Admin Console</p>
          <h1 className="mt-2 text-3xl font-semibold">用户管理</h1>
        </div>
        <LogoutButton redirectTo="/admin/login" />
      </div>
      <div className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="card p-4">
          <nav className="space-y-2">
            <Link className="block rounded-2xl border border-line px-4 py-3" href="/admin">
              仪表盘
            </Link>
            <Link className="block rounded-2xl bg-admin px-4 py-3 text-admin-ink" href="/admin/users">
              用户管理
            </Link>
            <Link
              className="block rounded-2xl border border-line px-4 py-3"
              href="/admin/settings/api"
            >
              API 配置
            </Link>
            <Link className="block rounded-2xl border border-line px-4 py-3" href="/admin/sessions">
              会话记录
            </Link>
          </nav>
        </aside>
        <section className="space-y-6">
          <AdminUserCreateForm />
          <div className="card p-5">
            <h2 className="text-xl font-semibold">已有用户</h2>
            <div className="mt-4 space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="rounded-3xl border border-line bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold">{user.username}</p>
                      <p className="mt-1 text-sm text-muted">
                        {user.role === "admin" ? "管理员" : "普通用户"} ·{" "}
                        {user.isActive ? "已启用" : "已禁用"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        创建时间：{formatDateTime(user.createdAt)}
                        {user.lastLoginAt
                          ? ` · 最近登录：${formatDateTime(user.lastLoginAt)}`
                          : ""}
                      </p>
                    </div>
                    <AdminUserActions userId={user.id} isActive={user.isActive} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
