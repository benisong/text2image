"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ImageApiRoute = "auto" | "images" | "chat";

type PublicApiSettings = {
  imageApiBaseUrl: string;
  imageApiModel: string;
  imageApiSize: string;
  imageApiRoute: ImageApiRoute;
  hasImageApiKey: boolean;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
};

type FormState = Omit<PublicApiSettings, "hasImageApiKey"> & {
  imageApiKey: string;
};

type ModelEntry = {
  id: string;
  ownedBy: string | null;
};

export function ApiSettingsForm({ initial }: { initial: PublicApiSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    imageApiBaseUrl: initial.imageApiBaseUrl,
    imageApiModel: initial.imageApiModel,
    imageApiSize: initial.imageApiSize,
    imageApiRoute: initial.imageApiRoute ?? "auto",
    promptOptimizerModel: initial.promptOptimizerModel,
    maxConcurrency: initial.maxConcurrency,
    imageRootDir: initial.imageRootDir,
    imageApiKey: "",
  });
  const [hasStoredKey, setHasStoredKey] = useState(initial.hasImageApiKey);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, startTransition] = useTransition();

  const [models, setModels] = useState<ModelEntry[] | null>(null);
  const [modelsError, setModelsError] = useState("");
  const [fetchingModels, setFetchingModels] = useState(false);

  const patch = (key: keyof FormState, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const fetchModels = async () => {
    setModelsError("");
    setFetchingModels(true);
    try {
      const response = await fetch("/api/admin/settings/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: form.imageApiBaseUrl,
          apiKey: form.imageApiKey,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        models?: ModelEntry[];
        error?: string;
      };

      if (!response.ok) {
        setModelsError(data.error || "拉取模型列表失败。");
        return;
      }

      const list = data.models ?? [];
      setModels(list);
      if (list.length === 0) {
        setModelsError("API 返回空的模型列表。");
      }
    } catch {
      setModelsError("拉取模型列表失败。");
    } finally {
      setFetchingModels(false);
    }
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
            list="image-api-models"
            placeholder={
              models && models.length > 0
                ? "下拉选择或手动输入"
                : "先拉取模型列表，或手动输入"
            }
            value={form.imageApiModel}
            onChange={(event) => patch("imageApiModel", event.target.value)}
          />
          {models && models.length > 0 ? (
            <datalist id="image-api-models">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ownedBy ?? ""}
                </option>
              ))}
            </datalist>
          ) : null}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="btn-secondary py-1 text-xs"
              onClick={fetchModels}
              disabled={fetchingModels}
            >
              {fetchingModels ? "拉取中..." : "拉取模型列表"}
            </button>
            {models && !modelsError ? (
              <span className="text-muted">共 {models.length} 个模型</span>
            ) : null}
            {modelsError ? (
              <span className="text-red-600">{modelsError}</span>
            ) : null}
          </div>
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
          <span className="text-sm font-medium">接口协议</span>
          <select
            className="field"
            value={form.imageApiRoute}
            onChange={(event) =>
              patch("imageApiRoute", event.target.value as ImageApiRoute)
            }
          >
            <option value="auto">自动（先试 images，失败回退 chat）</option>
            <option value="images">始终 /v1/images/generations</option>
            <option value="chat">始终 /v1/chat/completions（如 gemini 图像）</option>
          </select>
          <p className="text-xs text-muted">
            DALL·E / FLUX / SD 选 images；Gemini 2.5 Image、聊天式出图模型选 chat。
          </p>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Prompt 优化模型</span>
          <input
            className="field"
            list="image-api-models"
            placeholder="可选：填 chat 模型 (gpt-4o-mini 等)；template 表示不走 LLM"
            value={form.promptOptimizerModel}
            onChange={(event) => patch("promptOptimizerModel", event.target.value)}
          />
          <p className="text-xs text-muted">
            留空 / 填 <code>template</code> / <code>none</code>：直接把用户输入送给图像 API。
            <br />
            填 chat 模型名：先调 <code>/v1/chat/completions</code> 把自然语言改写成英文图像 prompt，再送图像 API。共用上方的 API Base URL 和 API Key。
          </p>
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
          出于安全考虑，已保存的 API Key 不会回显到浏览器。拉取模型会用你当前输入的
          Key；留空时会用已保存的 Key。
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
