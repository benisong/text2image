import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoutButton } from "@/components/shared/logout-button";
import { ChatAutoRefresh } from "@/components/user/chat-auto-refresh";
import { ChatComposer } from "@/components/user/chat-composer";
import { CreateSessionButton } from "@/components/user/create-session-button";
import { DeleteSessionButton } from "@/components/user/delete-session-button";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/auth/guards";
import {
  getMessagesForSession,
  getSessionById,
  listSessionsForUser,
} from "@/server/services/sessions";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireUser();
  const { sessionId } = await params;
  const currentSession = getSessionById(sessionId);

  if (!currentSession || currentSession.userId !== user.id) {
    notFound();
  }

  const sessions = listSessionsForUser(user.id);
  const messages = getMessagesForSession(sessionId);
  const latestGeneration =
    [...messages].reverse().find((message) => message.generationId)?.generationId ?? null;
  const hasPending = messages.some((message) =>
    ["queued", "generating"].includes(message.generationStatus || ""),
  );

  return (
    <main className="user-shell min-h-screen px-4 py-6 md:px-8">
      <ChatAutoRefresh enabled={hasPending} />
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">User Console</p>
          <h1 className="mt-2 text-3xl font-semibold">{currentSession.title}</h1>
          <p className="mt-2 text-sm text-muted">当前用户：{user.username}</p>
        </div>
        <LogoutButton redirectTo="/login" />
      </div>
      <div className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="card p-5">
            <CreateSessionButton />
            <div className="mt-4">
              <DeleteSessionButton sessionId={sessionId} />
            </div>
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-muted">
              会话列表
            </h2>
            <div className="mt-4 space-y-2">
              {sessions.map((session) => {
                const active = session.id === sessionId;
                return (
                  <Link
                    key={session.id}
                    href={`/chat/${session.id}`}
                    className={`block rounded-2xl border px-4 py-3 transition ${
                      active
                        ? "border-accent bg-accent/8"
                        : "border-line bg-white hover:border-accent/40"
                    }`}
                  >
                    <p className="font-medium">{session.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(session.lastMessageAt)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
        <section className="space-y-4">
          <ChatComposer sessionId={sessionId} latestGenerationId={latestGeneration} />
          <div className="card min-h-[520px] space-y-4 p-5">
            {messages.length === 0 ? (
              <div className="flex min-h-[360px] items-center justify-center text-center">
                <div className="max-w-md space-y-3">
                  <h2 className="text-2xl font-semibold">开始描述你想要的画面</h2>
                  <p className="text-sm leading-6 text-muted">
                    选择“仅生图”或“生图附带解说”，后端会负责图片落盘和结果整理。
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-3xl border p-4 ${
                    message.role === "user"
                      ? "ml-auto max-w-3xl border-accent/25 bg-white"
                      : "border-line bg-[#fffaf3]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">
                      {message.role === "user" ? "用户" : "系统"}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  {message.contentText ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                      {message.contentText}
                    </p>
                  ) : null}
                  {message.publicUrl ? (
                    <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                      <Image
                        alt="生成图片"
                        className="h-auto w-full object-cover"
                        src={message.publicUrl}
                        width={1200}
                        height={1200}
                        unoptimized
                      />
                    </div>
                  ) : null}
                  {message.generationStatus === "queued" ||
                  message.generationStatus === "generating" ? (
                    <p className="mt-3 text-sm text-accent">
                      正在生成，页面会自动刷新，请稍候。
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
