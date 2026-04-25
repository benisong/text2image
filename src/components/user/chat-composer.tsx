"use client";

import { useState, useTransition } from "react";

type SubmitPayload = {
  content: string;
  mode: "new_image" | "modify_last";
  parentGenerationId: string | null;
  keepSeed: boolean;
  outputMode: "image_only" | "image_with_commentary";
};

type ChatComposerProps = {
  latestGenerationId: string | null;
  onSubmit: (payload: SubmitPayload) => Promise<void>;
};

export function ChatComposer({
  latestGenerationId,
  onSubmit,
}: ChatComposerProps) {
  const [content, setContent] = useState("");
  const [keepSeed, setKeepSeed] = useState(true);
  // null = 跟随默认（有上一张就自动勾上）；true/false = 用户在本会话内的明确选择
  const [continueLastOverride, setContinueLastOverride] = useState<boolean | null>(
    null,
  );
  const [outputMode, setOutputMode] = useState<"image_only" | "image_with_commentary">(
    "image_only",
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const continueLast =
    continueLastOverride !== null
      ? continueLastOverride
      : Boolean(latestGenerationId);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = content.trim();
    if (!trimmed) {
      setError("请输入提示词。");
      return;
    }

    setError("");
    const payload: SubmitPayload = {
      content: trimmed,
      mode: continueLast && latestGenerationId ? "modify_last" : "new_image",
      parentGenerationId: continueLast ? latestGenerationId : null,
      keepSeed,
      outputMode,
    };

    // Clear immediately for snappier feel; restore on error.
    setContent("");

    startTransition(async () => {
      try {
        await onSubmit(payload);
        // 一次性 override：成功提交后回到默认（跟随是否有上一张图）
        setContinueLastOverride(null);
      } catch (err) {
        setContent(trimmed);
        setError(err instanceof Error ? err.message : "发送失败，请稍后重试。");
      }
    });
  };

  return (
    <form className="card p-3 md:p-4" onSubmit={handleSubmit}>
      <textarea
        className="field min-h-20 resize-y md:min-h-28"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="输入提示词，或说明你想如何修改上一张图。"
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted md:mt-4 md:text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            checked={continueLast}
            disabled={!latestGenerationId}
            onChange={(event) => setContinueLastOverride(event.target.checked)}
            type="checkbox"
          />
          继续上一张
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={keepSeed}
            onChange={(event) => setKeepSeed(event.target.checked)}
            type="checkbox"
          />
          保留种子
        </label>
        <label className="inline-flex items-center gap-2">
          <span>输出</span>
          <select
            className="field min-w-32 py-1.5 text-xs md:min-w-44 md:py-2 md:text-sm"
            value={outputMode}
            onChange={(event) =>
              setOutputMode(event.target.value as "image_only" | "image_with_commentary")
            }
          >
            <option value="image_only">仅生图</option>
            <option value="image_with_commentary">生图+解说</option>
          </select>
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex items-center justify-end md:mt-4">
        <button className="btn-primary" type="submit" disabled={isPending}>
          {isPending ? "提交中..." : "开始生成"}
        </button>
      </div>
    </form>
  );
}
