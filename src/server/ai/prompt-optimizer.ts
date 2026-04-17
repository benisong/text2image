import "server-only";

import { DEFAULT_NEGATIVE_PROMPT, OUTPUT_MODE } from "@/lib/constants";

type ParentGeneration = {
  effectivePrompt: string;
  negativePrompt: string | null;
  seed: number | null;
  aspectRatio: string;
};

export function buildOptimizedPrompt(input: {
  content: string;
  mode: "new_image" | "modify_last";
  keepSeed: boolean;
  outputMode: (typeof OUTPUT_MODE)[keyof typeof OUTPUT_MODE];
  parent?: ParentGeneration | null;
}) {
  const trimmed = input.content.trim();
  const aspectRatio = input.parent?.aspectRatio ?? "1:1";
  const negativePrompt = input.parent?.negativePrompt || DEFAULT_NEGATIVE_PROMPT;
  const seed =
    input.keepSeed && input.parent?.seed
      ? input.parent.seed
      : Math.floor(Math.random() * 1_000_000_000);

  let prompt = trimmed;

  if (input.mode === "modify_last" && input.parent?.effectivePrompt) {
    prompt = [
      input.parent.effectivePrompt,
      "Keep the core subject and overall composition as much as possible.",
      `Apply this modification request: ${trimmed}`,
    ].join(" ");
  }

  return {
    action: input.mode,
    prompt,
    negativePrompt,
    aspectRatio,
    keepSeed: input.keepSeed,
    outputMode: input.outputMode,
    seed,
    styleTags: [],
  };
}
