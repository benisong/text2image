"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PublicApiSettings = {
  imageApiBaseUrl: string;
  imageApiModel: string;
  imageApiSize: string;
  hasImageApiKey: boolean;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
};

type FormState = Omit<PublicApiSettings, "hasImageApiKey"> & {
  imageApiKey: string;
};

export function ApiSettingsForm({ initial }: { initial: PublicApiSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    imageApiBaseUrl: initial.imageApiBaseUrl,
    imageApiModel: initial.imageApiModel,
    imageApiSize: initial.imageApiSize,
    promptOptimizerModel: initial.promptOptimizerModel,
    maxConcurrency: initial.maxConcurrency,
    imageRootDir: initial.imageRootDir,
    imageApiKey: "",
  });
  const [hasStoredKey, setHasStoredKey] = useState(initial.hasImageApiKey);
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

    if (!hasStoredKey && !form.imageApiKey.trim()) {
      setError("首次保存需要填入 API Key。");
      return;
    }

    const payload = { ...form };

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
      setForm((current) => ({ ...current, imageApiKey: "" }));
      if (payload.imageApiKey.trim()) {
        setHasStoredKey(true);
      }
      router.refresh();
    });
  };

  return (
    <form className="card p-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">API Base URL</span>
          <input
            className="field"
            placeholder="https://api.openai.com/v1"
            value={form.imageApiBaseUrl}
            onChange={(event) => patch("imageApiBaseUrl", event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">模型名</span>
          <input
            className="field"
            placeholder="dall-e-3"
            value={form.imageApiModel}
            onChange={(event) => patch("imageApiModel", event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">默认尺寸</span>
          <input
            className="field"
            placeholder="1024x1024"
            value={form.imageApiSize}
            onChange={(event) => patch("imageApiSize", event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Prompt 优化模型</span>
          <input
            className="field"
            placeholder="template"
            value={form.promptOptimizerModel}
            onChange={(event) => patch("promptOptimizerModel", event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">最大并发</span>
          <input
            className="field"
            placeholder="2"
            type="number"
            min={1}
            max={4}
            value={form.maxConcurrency}
            onChange={(event) => patch("maxConcurrency", Number(event.target.value))}
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">图片目录</span>
          <input
            className="field"
            placeholder="data/images"
            value={form.imageRootDir}
            onChange={(event) => patch("imageRootDir", event.target.value)}
          />
        </label>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium">API Key</label>
          <span className="text-xs text-muted">
            {hasStoredKey ? "已配置，留空表示保留原值" : "尚未配置"}
          </span>
        </div>
        <input
          className="field mt-2 font-mono text-sm"
          type="password"
          autoComplete="new-password"
          placeholder={
            hasStoredKey
              ? "粘贴新的 API Key 可替换；留空保留原值。"
              : "请粘贴 OpenAI 兼容 API 的 Key (sk-...)。"
          }
          value={form.imageApiKey}
          onChange={(event) => patch("imageApiKey", event.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          出于安全考虑，已保存的 API Key 不会回显到浏览器。
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
