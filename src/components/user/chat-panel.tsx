"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ChatComposer } from "@/components/user/chat-composer";
import { MessageList, type MessageView } from "@/components/user/message-list";

const PENDING_STATUSES = new Set(["queued", "generating"]);
const POLL_INTERVAL_MS = 2500;

type SubmitPayload = {
  content: string;
  mode: "new_image" | "modify_last";
  parentGenerationId: string | null;
  keepSeed: boolean;
  outputMode: "image_only" | "image_with_commentary";
};

type ChatPanelProps = {
  sessionId: string;
  initialMessages: MessageView[];
  initialHasMore: boolean;
};

export function ChatPanel(props: ChatPanelProps) {
  // Re-mount when navigating between sessions so initial state is fresh.
  return <ChatPanelInner key={props.sessionId} {...props} />;
}

function ChatPanelInner({
  sessionId,
  initialMessages,
  initialHasMore,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);

  const latestGenerationId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (
        m.generationId &&
        !m.generationId.startsWith("tmp-") &&
        m.generationStatus === "completed"
      ) {
        return m.generationId;
      }
    }
    return null;
  }, [messages]);

  const handleSubmit = async (payload: SubmitPayload) => {
    const tempMessageId = `tmp-msg-${tempId()}`;
    const tempGenerationId = `tmp-gen-${tempId()}`;
    const now = new Date().toISOString();

    const optimistic: MessageView = {
      id: tempMessageId,
      role: "user",
      messageType: "text",
      contentText: payload.content,
      createdAt: now,
      generationId: tempGenerationId,
      publicUrl: null,
      outputMode: payload.outputMode,
      explanationText: null,
      generationStatus: "queued",
      generationPublicError: null,
    };
    setMessages((prev) => [...prev, optimistic]);

    let response: Response;
    try {
      response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessageId));
      throw new Error("网络异常，请重试。");
    }

    const data = (await response.json().catch(() => ({}))) as {
      messageId?: string;
      generationId?: string;
      error?: string;
    };

    if (!response.ok || !data.messageId || !data.generationId) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessageId));
      throw new Error(data.error || "发送失败，请稍后重试。");
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempMessageId
          ? { ...m, id: data.messageId!, generationId: data.generationId! }
          : m,
      ),
    );
  };

  const handleLoadMore = async () => {
    let oldest: string | undefined;
    setMessages((prev) => {
      oldest = prev[0]?.createdAt;
      return prev;
    });
    if (!oldest) {
      return { ok: true as const };
    }

    let response: Response;
    try {
      response = await fetch(
        `/api/sessions/${sessionId}/messages?before=${encodeURIComponent(oldest)}&limit=50`,
      );
    } catch {
      return { ok: false as const, error: "加载更早的消息失败。" };
    }

    if (!response.ok) {
      return { ok: false as const, error: "加载更早的消息失败。" };
    }

    const data = (await response.json()) as {
      messages: MessageView[];
      hasMore: boolean;
    };
    setMessages((prev) => [...data.messages, ...prev]);
    setHasMore(data.hasMore);
    return { ok: true as const };
  };

  const handleRetry = async (generationId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.generationId === generationId
          ? { ...m, generationStatus: "queued", generationPublicError: null }
          : m,
      ),
    );

    const response = await fetch(
      `/api/generations/${generationId}/retry`,
      { method: "POST" },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.generationId === generationId
            ? { ...m, generationStatus: "failed" }
            : m,
        ),
      );
      throw new Error(data.error || "重试失败。");
    }
  };

  // Polling for pending generations — fetches latest 50 server-side and merges.
  const hasPending = messages.some(
    (m) =>
      m.generationStatus &&
      PENDING_STATUSES.has(m.generationStatus) &&
      m.generationId &&
      !m.generationId.startsWith("tmp-"),
  );

  useEffect(() => {
    if (!hasPending) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/messages?limit=50`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as {
          messages: MessageView[];
          hasMore: boolean;
        };
        if (cancelled) {
          return;
        }
        setMessages((prev) => mergeMessages(prev, data.messages));
      } catch {
        // ignore transient polling errors
      }
    };

    void tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [hasPending, sessionId]);

  // 自动滚到底；用户主动往上滑后不打扰
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastSignatureRef = useRef("");

  const messagesSignature = `${messages.length}|${
    messages[messages.length - 1]?.id ?? ""
  }|${messages[messages.length - 1]?.generationStatus ?? ""}`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (lastSignatureRef.current === "") {
      // 初次挂载：直接到底
      el.scrollTop = el.scrollHeight;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastSignatureRef.current = messagesSignature;
  }, [messagesSignature]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="card min-h-0 flex-1 overflow-y-auto p-4 md:p-5"
      >
        <MessageList
          messages={messages}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onRetry={handleRetry}
        />
      </div>
      <div className="shrink-0">
        <ChatComposer
          latestGenerationId={latestGenerationId}
          onSubmit={async (payload) => {
            stickToBottomRef.current = true;
            await handleSubmit(payload);
          }}
        />
      </div>
    </div>
  );
}

function tempId(): string {
  // 浏览器在 HTTP 直连时没有 crypto.randomUUID，这里只是给本地占位 id 用，无需密码学强度
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeMessages(
  current: MessageView[],
  incoming: MessageView[],
): MessageView[] {
  if (incoming.length === 0) {
    return current;
  }

  const incomingById = new Map(incoming.map((m) => [m.id, m]));
  const oldestIncomingTime = Math.min(
    ...incoming.map((m) => Date.parse(m.createdAt)),
  );

  const merged: MessageView[] = [];
  const seen = new Set<string>();

  for (const m of current) {
    const next = incomingById.get(m.id);
    if (next) {
      merged.push(next);
      seen.add(m.id);
      continue;
    }
    if (
      m.id.startsWith("tmp-") &&
      Date.parse(m.createdAt) < oldestIncomingTime
    ) {
      // optimistic msg older than what server returned; assume it dropped
      continue;
    }
    merged.push(m);
  }

  for (const m of incoming) {
    if (!seen.has(m.id)) {
      merged.push(m);
    }
  }

  merged.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return merged;
}
