"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LogoutButton({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError("退出失败，请稍后重试。");
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button className="btn-secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "退出中..." : "退出登录"}
      </button>
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
