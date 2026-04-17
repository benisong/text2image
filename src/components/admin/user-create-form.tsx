"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminUserCreateForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          role,
          displayName,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "创建失败。");
        return;
      }

      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      router.refresh();
    });
  };

  return (
    <form className="card p-5" onSubmit={handleSubmit}>
      <h2 className="text-lg font-semibold">创建用户</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input
          className="field"
          placeholder="用户名"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          className="field"
          placeholder="显示名"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <input
          className="field"
          type="password"
          placeholder="初始密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <select
          className="field"
          value={role}
          onChange={(event) => setRole(event.target.value as "admin" | "user")}
        >
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <button className="btn-primary mt-4" type="submit" disabled={isPending}>
        {isPending ? "创建中..." : "创建用户"}
      </button>
    </form>
  );
}
