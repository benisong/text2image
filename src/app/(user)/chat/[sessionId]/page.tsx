import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoutButton } from "@/components/shared/logout-button";
import { ChatComposer } from "@/components/user/chat-composer";
import { CreateSessionButton } from "@/components/user/create-session-button";
import { DeleteSessionButton } from "@/components/user/delete-session-button";
import { MessageList } from "@/components/user/message-list";
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
  const latestGeneration =
    [...messages].reverse().find((message) => message.generationId)?.generationId ?? null;

  return (
    <main className="user-shell min-h-screen px-4 py-6 md:px-8">
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
          <div className="card min-h-[520px] p-5">
            <MessageList
              sessionId={sessionId}
              initialMessages={messages}
              initialHasMore={hasMore}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
