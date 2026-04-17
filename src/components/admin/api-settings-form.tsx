"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ApiSettings = {
  vertexProjectId: string;
  vertexLocation: string;
  imagenModel: string;
  serviceAccountJson: string;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
};

export function ApiSettingsForm({ initial }: { initial: ApiSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<ApiSettings>(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, startTransition] = useTransition();

  const patch = (key: keyof ApiSettings, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaved("");

    startTransition(async () => {
      const response = await fetch("/api/admin/settings/api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "保存失败。");
        return;
      }

      setSaved("配置已保存。");
      router.refresh();
    });
  };

  return (
    <form className="card p-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <input
          className="field"
          placeholder="Vertex 项目 ID"
          value={form.vertexProjectId}
          onChange={(event) => patch("vertexProjectId", event.target.value)}
        />
        <input
          className="field"
          placeholder="地区，如 us-central1"
          value={form.vertexLocation}
          onChange={(event) => patch("vertexLocation", event.target.value)}
        />
        <input
          className="field"
          placeholder="Imagen 模型名"
          value={form.imagenModel}
          onChange={(event) => patch("imagenModel", event.target.value)}
        />
        <input
          className="field"
          placeholder="Prompt 优化模型名"
          value={form.promptOptimizerModel}
          onChange={(event) => patch("promptOptimizerModel", event.target.value)}
        />
        <input
          className="field"
          placeholder="最大并发"
          type="number"
          min={1}
          max={4}
          value={form.maxConcurrency}
          onChange={(event) => patch("maxConcurrency", Number(event.target.value))}
        />
        <input
          className="field"
          placeholder="图片目录，如 data/images"
          value={form.imageRootDir}
          onChange={(event) => patch("imageRootDir", event.target.value)}
        />
      </div>
      <textarea
        className="field mt-4 min-h-72 font-mono text-sm"
        placeholder="服务账号 JSON"
        value={form.serviceAccountJson}
        onChange={(event) => patch("serviceAccountJson", event.target.value)}
      />
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="mt-3 text-sm text-green-700">{saved}</p> : null}
      <button className="btn-primary mt-4" type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存 API 配置"}
      </button>
    </form>
  );
}
