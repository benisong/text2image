"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const ok = window.confirm("删除会话会同步删除该会话下的图片，确定继续吗？");

    if (!ok) {
      return;
    }

    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("删除失败，请稍后重试。");
        return;
      }

      router.push("/chat");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <button className="btn-secondary" onClick={handleDelete} disabled={isPending}>
        {isPending ? "删除中..." : "删除会话"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
