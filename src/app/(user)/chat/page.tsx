import { redirect } from "next/navigation";

import { ChatLayout } from "@/components/user/chat-layout";
import { requireUser } from "@/server/auth/guards";
import { listSessionsForUser } from "@/server/services/sessions";

export default async function ChatIndexPage() {
  const user = await requireUser();
  const sessions = listSessionsForUser(user.id);

  if (sessions.length > 0) {
    redirect(`/chat/${sessions[0].id}`);
  }

  return (
    <ChatLayout
      sessionId={null}
      username={user.username}
      sessionTitle="Text2Image"
      sessions={sessions}
    >
      <div className="card flex flex-1 items-center justify-center p-6 text-center md:p-10">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-semibold md:text-2xl">先从一张图开始</h2>
          <p className="text-sm leading-6 text-muted">
            还没有会话。点左上角 <span className="font-medium">☰</span> 打开列表，新建一个会话后就能开始生成。
          </p>
        </div>
      </div>
    </ChatLayout>
  );
}
