"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminUserActions({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const updateStatus = (nextActive: boolean) => {
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!response.ok) {
        setError("状态更新失败。");
        return;
      }

      router.refresh();
    });
  };

  const resetPassword = () => {
    if (!password) {
      setError("请输入新密码。");
      return;
    }

    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("密码重置失败。");
        return;
      }

      setPassword("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-secondary"
          onClick={() => updateStatus(!isActive)}
          disabled={isPending}
        >
          {isActive ? "禁用" : "启用"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="field max-w-48 py-2"
          type="password"
          placeholder="新密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="btn-secondary" onClick={resetPassword} disabled={isPending}>
          重置密码
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
