import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateSessionButton } from "@/components/user/create-session-button";
import { LogoutButton } from "@/components/shared/logout-button";
import { requireUser } from "@/server/auth/guards";
import { listSessionsForUser } from "@/server/services/sessions";

export default async function ChatIndexPage() {
  const user = await requireUser();
  const sessions = listSessionsForUser(user.id);

  if (sessions.length > 0) {
    redirect(`/chat/${sessions[0].id}`);
  }

  return (
    <main className="user-shell min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">User Console</p>
          <h1 className="mt-2 text-3xl font-semibold">欢迎来到 Text2Image</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            当前还没有会话。先创建一个新会话，然后输入提示词开始生成。
          </p>
        </div>
        <LogoutButton redirectTo="/login" />
      </div>
      <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-[320px_1fr]">
        <aside className="card p-5">
          <CreateSessionButton />
        </aside>
        <section className="card flex min-h-[420px] items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-semibold">先从一张图开始</h2>
            <p className="text-sm leading-6 text-muted">
              你可以在新会话里直接输入提示词，或者之后基于上一张图继续修改。前端不会处理
              base64，图片和解说都由后端整理完成。
            </p>
            <Link className="btn-secondary inline-flex" href="/login">
              返回登录页
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
