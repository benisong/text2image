import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoutButton } from "@/components/shared/logout-button";
import { ChatPanel } from "@/components/user/chat-panel";
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
  const { messages, hasMore } = getMessagesForSession(sessionId);

  return (
    <main className="user-shell flex h-screen flex-col overflow-hidden px-4 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-[110rem] shrink-0 items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">User Console</p>
          <h1 className="mt-1 text-2xl font-semibold">{currentSession.title}</h1>
          <p className="mt-1 text-xs text-muted">当前用户：{user.username}</p>
        </div>
        <LogoutButton redirectTo="/login" />
      </div>
      <div className="mx-auto mt-4 grid min-h-0 w-full max-w-[110rem] flex-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          <div className="card p-4">
            <CreateSessionButton />
            <div className="mt-3">
              <DeleteSessionButton sessionId={sessionId} />
            </div>
          </div>
          <div className="card p-3">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.25em] text-muted">
              会话列表
            </h2>
            <div className="mt-3 space-y-2">
              {sessions.map((session) => {
                const active = session.id === sessionId;
                return (
                  <Link
                    key={session.id}
                    href={`/chat/${session.id}`}
                    prefetch
                    className={`block rounded-2xl border px-3 py-2 transition ${
                      active
                        ? "border-accent bg-accent/8"
                        : "border-line bg-white hover:border-accent/40"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(session.lastMessageAt)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
        <section className="min-h-0">
          <ChatPanel
            sessionId={sessionId}
            initialMessages={messages}
            initialHasMore={hasMore}
          />
        </section>
      </div>
    </main>
  );
}
