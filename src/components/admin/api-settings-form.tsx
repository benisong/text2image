"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PublicApiSettings = {
  vertexProjectId: string;
  vertexLocation: string;
  imagenModel: string;
  hasServiceAccountJson: boolean;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
};

type FormState = Omit<PublicApiSettings, "hasServiceAccountJson"> & {
  serviceAccountJson: string;
};

export function ApiSettingsForm({ initial }: { initial: PublicApiSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    vertexProjectId: initial.vertexProjectId,
    vertexLocation: initial.vertexLocation,
    imagenModel: initial.imagenModel,
    promptOptimizerModel: initial.promptOptimizerModel,
    maxConcurrency: initial.maxConcurrency,
    imageRootDir: initial.imageRootDir,
    serviceAccountJson: "",
  });
  const [hasStoredCredential, setHasStoredCredential] = useState(
    initial.hasServiceAccountJson,
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, startTransition] = useTransition();

  const patch = (key: keyof FormState, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaved("");

    if (!hasStoredCredential && !form.serviceAccountJson.trim()) {
      setError("首次保存需要填入服务账号 JSON。");
      return;
    }

    const payload = {
      vertexProjectId: form.vertexProjectId,
      vertexLocation: form.vertexLocation,
      imagenModel: form.imagenModel,
      promptOptimizerModel: form.promptOptimizerModel,
      maxConcurrency: form.maxConcurrency,
      imageRootDir: form.imageRootDir,
      serviceAccountJson: form.serviceAccountJson,
    };

    startTransition(async () => {
      const response = await fetch("/api/admin/settings/api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "保存失败。");
        return;
      }

      setSaved("配置已保存。");
      setForm((current) => ({ ...current, serviceAccountJson: "" }));
      if (payload.serviceAccountJson.trim()) {
        setHasStoredCredential(true);
      }
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
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium">服务账号 JSON</label>
          <span className="text-xs text-muted">
            {hasStoredCredential ? "已配置，留空表示保留原值" : "尚未配置"}
          </span>
        </div>
        <textarea
          className="field mt-2 min-h-48 font-mono text-sm"
          placeholder={
            hasStoredCredential
              ? "如需替换服务账号 JSON 请在此粘贴新内容，否则保持为空。"
              : "首次保存需要粘贴完整的服务账号 JSON。"
          }
          value={form.serviceAccountJson}
          onChange={(event) => patch("serviceAccountJson", event.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          出于安全考虑，已保存的服务账号 JSON 不会回显到浏览器。
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {saved ? <p className="mt-3 text-sm text-green-700">{saved}</p> : null}
      <button className="btn-primary mt-4" type="submit" disabled={isPending}>
        {isPending ? "保存中..." : "保存 API 配置"}
      </button>
    </form>
  );
}
