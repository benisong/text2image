import Link from "next/link";

import { LogoutButton } from "@/components/shared/logout-button";
import { formatDateTime } from "@/lib/utils";
import { requireAdmin } from "@/server/auth/guards";
import { listPendingJobs, listSessionsForAdmin } from "@/server/services/sessions";

export default async function AdminSessionsPage() {
  await requireAdmin();
  const sessions = listSessionsForAdmin();
  const jobs = listPendingJobs();

  return (
    <main className="admin-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">Admin Console</p>
          <h1 className="mt-2 text-3xl font-semibold">会话与任务</h1>
        </div>
        <LogoutButton redirectTo="/admin/login" />
      </div>
      <div className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="card p-4">
          <nav className="space-y-2">
            <Link className="block rounded-2xl border border-line px-4 py-3" href="/admin">
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
            <Link
              className="block rounded-2xl bg-admin px-4 py-3 text-admin-ink"
              href="/admin/sessions"
            >
              会话记录
            </Link>
          </nav>
        </aside>
        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="text-xl font-semibold">待处理任务</h2>
            <div className="mt-4 space-y-2 text-sm">
              {jobs.length === 0 ? <p className="text-muted">当前没有待处理任务。</p> : null}
              {jobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-line bg-white px-4 py-3">
                  <p>Job ID: {job.id}</p>
                  <p className="text-muted">Generation ID: {job.generation_id}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-xl font-semibold">所有会话</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-3">标题</th>
                    <th className="pb-3">用户</th>
                    <th className="pb-3">创建时间</th>
                    <th className="pb-3">最近活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-t border-line">
                      <td className="py-3">{session.title || "新会话"}</td>
                      <td className="py-3">{session.username}</td>
                      <td className="py-3">{formatDateTime(session.created_at)}</td>
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
