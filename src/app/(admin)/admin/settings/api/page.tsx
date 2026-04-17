import Link from "next/link";

import { ApiSettingsForm } from "@/components/admin/api-settings-form";
import { LogoutButton } from "@/components/shared/logout-button";
import { requireAdmin } from "@/server/auth/guards";
import { getApiSettings } from "@/server/services/settings";

export default async function AdminApiSettingsPage() {
  await requireAdmin();
  const settings = getApiSettings();

  return (
    <main className="admin-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">Admin Console</p>
          <h1 className="mt-2 text-3xl font-semibold">API 配置</h1>
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
              className="block rounded-2xl bg-admin px-4 py-3 text-admin-ink"
              href="/admin/settings/api"
            >
              API 配置
            </Link>
            <Link className="block rounded-2xl border border-line px-4 py-3" href="/admin/sessions">
              会话记录
            </Link>
          </nav>
        </aside>
        <section className="space-y-4">
          <ApiSettingsForm initial={settings} />
        </section>
      </div>
    </main>
  );
}
