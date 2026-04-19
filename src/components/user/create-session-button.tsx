"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateSessionButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "新会话" }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!response.ok || !data.id) {
        setError(data.error || "创建会话失败。");
        return;
      }

      router.push(`/chat/${data.id}`);
    });
  };

  return (
    <div className="space-y-2">
      <button className="btn-primary w-full" onClick={handleCreate} disabled={isPending}>
        {isPending ? "创建中..." : "新建会话"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
