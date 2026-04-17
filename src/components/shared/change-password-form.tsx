"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "密码修改失败。");
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    });
  };

  return (
    <form className="card w-full max-w-md p-8" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">修改密码</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        首次登录或密码被重置后，需要设置一个新密码才能继续使用系统。
      </p>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">当前密码</label>
          <input
            className="field"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="请输入当前密码"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">新密码</label>
          <input
            className="field"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="至少 8 位"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">确认新密码</label>
          <input
            className="field"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="再次输入新密码"
          />
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <button className="btn-primary mt-6 w-full" type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存新密码"}
      </button>
    </form>
  );
}
