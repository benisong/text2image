"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type LoginFormProps = {
  title: string;
  description: string;
  redirectTo: string;
  accentClassName?: string;
  requiredRole?: "admin" | "user";
};

export function LoginForm({
  title,
  description,
  redirectTo,
  accentClassName,
  requiredRole,
}: LoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password, requiredRole }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "登录失败，请检查账号和密码。");
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <form className="card w-full max-w-md p-8" onSubmit={handleSubmit}>
      <div className="space-y-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${accentClassName || "bg-accent/10 text-accent"}`}
        >
          Text2Image
        </span>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">用户名</label>
          <input
            className="field"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入用户名"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">密码</label>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
          />
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      <button className="btn-primary mt-6 w-full" type="submit" disabled={isPending}>
        {isPending ? "登录中..." : "登录"}
      </button>
    </form>
  );
}
