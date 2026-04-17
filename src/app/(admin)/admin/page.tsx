import Link from "next/link";

import { LogoutButton } from "@/components/shared/logout-button";
import { formatDateTime } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/guards";
import { listSessionsForAdmin, listPendingJobs } from "@/server/services/sessions";
import { getApiSettings } from "@/server/services/settings";
import { listUsers } from "@/server/services/users";

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const users = listUsers();
  const sessions = listSessionsForAdmin().slice(0, 8);
  const jobs = listPendingJobs();
  const settings = getApiSettings();

  return (
    <main className="admin-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">Admin Console</p>
          <h1 className="mt-2 text-3xl font-semibold">系统总览</h1>
          <p className="mt-2 text-sm text-muted">欢迎回来，{admin.username}</p>
        </div>
        <LogoutButton redirectTo="/admin/login" />
      </div>
      <div className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="card p-4">
          <nav className="space-y-2">
            <Link className="block rounded-2xl bg-admin px-4 py-3 text-admin-ink" href="/admin">
              仪表盘
            </Link>
            <Link className="block rounded-2xl border border-line px-4 py-3" href="/admin/users">
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
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="card p-5">
            <p className="text-sm text-muted">用户数</p>
            <p className="mt-3 text-4xl font-semibold">{users.length}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">待处理任务</p>
            <p className="mt-3 text-4xl font-semibold">{jobs.length}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">默认模型</p>
            <p className="mt-3 text-lg font-semibold">{settings.imagenModel || "未配置"}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-muted">图片目录</p>
            <p className="mt-3 break-all text-sm font-semibold">{settings.imageRootDir}</p>
          </div>
          <div className="card p-5 md:col-span-2 xl:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">最近会话</h2>
              <Link className="text-sm text-accent" href="/admin/sessions">
                查看全部
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-3">标题</th>
                    <th className="pb-3">用户</th>
                    <th className="pb-3">最近活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-t border-line">
                      <td className="py-3">{session.title || "新会话"}</td>
                      <td className="py-3">{session.username}</td>
                      <td className="py-3">{formatDateTime(session.last_message_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
