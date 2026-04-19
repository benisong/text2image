"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

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
  messages: MessageView[];
  hasMore: boolean;
  onLoadMore: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onRetry: (generationId: string) => Promise<void>;
};

const PENDING_STATUSES = new Set(["queued", "generating"]);

export function MessageList({
  messages,
  hasMore,
  onLoadMore,
  onRetry,
}: MessageListProps) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");

  const handleLoadMore = async () => {
    setLoadError("");
    setLoadingMore(true);
    try {
      const result = await onLoadMore();
      if (!result.ok) {
        setLoadError(result.error);
      }
    } finally {
      setLoadingMore(false);
    }
  };

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
            onClick={handleLoadMore}
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
        <MessageItem
          key={message.id}
          message={message}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}

function MessageItem({
  message,
  onRetry,
}: {
  message: MessageView;
  onRetry: (generationId: string) => Promise<void>;
}) {
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
            loading="lazy"
          />
        </div>
      ) : null}
      {isPending ? <PendingIndicator /> : null}
      {isFailed && message.generationId ? (
        <RetryBlock
          generationId={message.generationId}
          message={message.generationPublicError ?? "生成失败，请稍后重试。"}
          onRetry={onRetry}
        />
      ) : null}
    </article>
  );
}

function PendingIndicator() {
  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-accent">
      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-accent" />
      <span>正在生成...</span>
    </div>
  );
}

function RetryBlock({
  generationId,
  message,
  onRetry,
}: {
  generationId: string;
  message: string;
  onRetry: (generationId: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    setError("");
    startTransition(async () => {
      try {
        await onRetry(generationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "重试失败。");
      }
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
