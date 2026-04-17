"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { formatDateTime } from "@/lib/utils";

export type MessageView = {
  id: string;
  role: string;
  messageType: string;
  contentText: string | null;
  createdAt: string;
  generationId: string | null;
  publicUrl: string | null;
  outputMode: string | null;
  explanationText: string | null;
  generationStatus: string | null;
  generationPublicError: string | null;
};

type MessageListProps = {
  sessionId: string;
  initialMessages: MessageView[];
  initialHasMore: boolean;
};

const PENDING_STATUSES = new Set(["queued", "generating"]);

export function MessageList(props: MessageListProps) {
  return (
    <MessageListInner
      key={messagesSignature(props.initialMessages)}
      {...props}
    />
  );
}

function messagesSignature(messages: MessageView[]) {
  if (messages.length === 0) {
    return "empty";
  }
  const last = messages[messages.length - 1];
  return `${messages.length}:${last.id}:${last.generationStatus ?? ""}`;
}

function MessageListInner({
  sessionId,
  initialMessages,
  initialHasMore,
}: MessageListProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");

  const pendingIds = messages
    .filter(
      (message) =>
        message.generationId &&
        PENDING_STATUSES.has(message.generationStatus ?? ""),
    )
    .map((message) => message.generationId as string);

  usePendingPolling(pendingIds, () => router.refresh());

  const loadMore = useCallback(async () => {
    if (loadingMore || messages.length === 0) {
      return;
    }
    setLoadError("");
    setLoadingMore(true);
    try {
      const oldest = messages[0].createdAt;
      const response = await fetch(
        `/api/sessions/${sessionId}/messages?before=${encodeURIComponent(oldest)}&limit=50`,
      );

      if (!response.ok) {
        setLoadError("加载更早的消息失败。");
        return;
      }

      const data = (await response.json()) as {
        messages: MessageView[];
        hasMore: boolean;
      };

      setMessages((current) => [...data.messages, ...current]);
      setHasMore(data.hasMore);
    } catch {
      setLoadError("加载更早的消息失败。");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, messages, sessionId]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-center">
        <div className="max-w-md space-y-3">
          <h2 className="text-2xl font-semibold">开始描述你想要的画面</h2>
          <p className="text-sm leading-6 text-muted">
            选择 {"\u201C"}仅生图{"\u201D"} 或 {"\u201C"}生图附带解说{"\u201D"}
            ，后端会负责图片落盘和结果整理。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasMore ? (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "加载中..." : "加载更早消息"}
          </button>
          {loadError ? (
            <p className="text-xs text-red-600">{loadError}</p>
          ) : null}
        </div>
      ) : null}
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageItem({ message }: { message: MessageView }) {
  const isPending = PENDING_STATUSES.has(message.generationStatus ?? "");
  const isFailed = message.generationStatus === "failed";

  return (
    <article
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
      {isPending ? (
        <p className="mt-3 text-sm text-accent">
          正在生成，进度会自动更新。
        </p>
      ) : null}
      {isFailed && message.generationId ? (
        <RetryBlock
          generationId={message.generationId}
          message={message.generationPublicError ?? "生成失败，请稍后重试。"}
        />
      ) : null}
    </article>
  );
}

function RetryBlock({
  generationId,
  message,
}: {
  generationId: string;
  message: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    setError("");
    startTransition(async () => {
      const response = await fetch(
        `/api/generations/${generationId}/retry`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error || "重试失败。");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-red-600">{message}</p>
      <button
        type="button"
        className="btn-secondary text-sm"
        onClick={handleRetry}
        disabled={isPending}
      >
        {isPending ? "重试中..." : "重试"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function usePendingPolling(
  pendingIds: string[],
  onAnyCompleted: () => void,
) {
  const onCompletedRef = useRef(onAnyCompleted);

  useEffect(() => {
    onCompletedRef.current = onAnyCompleted;
  }, [onAnyCompleted]);

  const key = pendingIds.slice().sort().join("|");

  useEffect(() => {
    if (!key) {
      return;
    }

    const ids = key.split("|");
    let cancelled = false;
    const resolved = new Set<string>();

    const tick = async () => {
      for (const id of ids) {
        if (cancelled || resolved.has(id)) {
          continue;
        }
        try {
          const response = await fetch(`/api/generations/${id}`, {
            cache: "no-store",
          });
          if (!response.ok) {
            continue;
          }
          const data = (await response.json()) as { status?: string };
          if (data.status && !PENDING_STATUSES.has(data.status)) {
            resolved.add(id);
            if (!cancelled) {
              onCompletedRef.current();
              return;
            }
          }
        } catch {
          // transient polling errors are ignored
        }
      }
    };

    const timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key]);
}
