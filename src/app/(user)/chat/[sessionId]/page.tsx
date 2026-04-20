import { notFound } from "next/navigation";

import { ChatLayout } from "@/components/user/chat-layout";
import { ChatPanel } from "@/components/user/chat-panel";
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
    <ChatLayout
      sessionId={sessionId}
      username={user.username}
      sessionTitle={currentSession.title}
      sessions={sessions}
    >
      <ChatPanel
        sessionId={sessionId}
        initialMessages={messages}
        initialHasMore={hasMore}
      />
    </ChatLayout>
  );
}
