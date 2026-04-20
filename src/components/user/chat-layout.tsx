"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/shared/logout-button";
import { CreateSessionButton } from "@/components/user/create-session-button";
import { DeleteSessionButton } from "@/components/user/delete-session-button";
import { formatDateTime } from "@/lib/utils";

type SessionItem = {
  id: string;
  title: string;
  lastMessageAt: string;
};

type ChatLayoutProps = {
  sessionId: string | null;
  username: string;
  sessionTitle: string;
  sessions: SessionItem[];
  children: React.ReactNode;
};

export function ChatLayout({
  sessionId,
  username,
  sessionTitle,
  sessions,
  children,
}: ChatLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ESC 关抽屉
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <main className="user-shell flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-line/60 bg-panel/60 px-3 py-3 backdrop-blur md:px-6">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xl border border-line bg-white/60 p-2 text-foreground lg:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开会话列表"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.3em] text-muted md:text-xs">
            User Console
          </p>
          <h1 className="truncate text-base font-semibold md:text-xl">
            {sessionTitle}
          </h1>
        </div>
        <span className="hidden text-xs text-muted md:inline">
          当前用户：{username}
        </span>
        <LogoutButton redirectTo="/login" />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* 移动端遮罩 */}
        {drawerOpen ? (
          <button
            type="button"
            aria-label="关闭会话列表"
            className="absolute inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        {/* 侧栏：移动端是抽屉，桌面是常驻列 */}
        <aside
          className={`
            absolute inset-y-0 left-0 z-40 flex w-[86%] max-w-[320px] flex-col gap-3 bg-panel p-3 shadow-2xl
            transform transition-transform duration-200 ease-out
            ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
            lg:static lg:w-72 lg:translate-x-0 lg:border-r lg:border-line/60 lg:bg-transparent lg:p-4 lg:shadow-none
          `}
        >
          <div className="flex items-center justify-between lg:hidden">
            <span className="text-sm font-medium text-muted">{username}</span>
            <button
              type="button"
              className="rounded-lg border border-line p-1.5 text-sm"
              onClick={() => setDrawerOpen(false)}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          <div className="card p-4">
            <CreateSessionButton />
            {sessionId ? (
              <div className="mt-3">
                <DeleteSessionButton sessionId={sessionId} />
              </div>
            ) : null}
          </div>

          <div className="card flex min-h-0 flex-1 flex-col p-3">
            <h2 className="shrink-0 px-1 text-xs font-semibold uppercase tracking-[0.25em] text-muted">
              会话列表
            </h2>
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {sessions.length === 0 ? (
                <p className="px-1 text-sm text-muted">还没有会话，新建一个开始吧。</p>
              ) : null}
              {sessions.map((s) => {
                const active = s.id === sessionId;
                return (
                  <Link
                    key={s.id}
                    href={`/chat/${s.id}`}
                    prefetch
                    onClick={() => setDrawerOpen(false)}
                    className={`block rounded-2xl border px-3 py-2 transition ${
                      active
                        ? "border-accent bg-accent/8"
                        : "border-line bg-white hover:border-accent/40"
                    }`}
                  >
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(s.lastMessageAt)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 主区 */}
        <section className="flex min-h-0 flex-1 flex-col px-3 py-3 md:px-6 md:py-4">
          {children}
        </section>
      </div>
    </main>
  );
}
