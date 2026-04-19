import "server-only";

import { getApiSettings } from "@/server/services/settings";

const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
  "You rewrite users' free-form descriptions (often in Chinese) into a single concise English prompt for text-to-image models (DALL·E / Stable Diffusion / Midjourney style).",
  "Keep the user's core intent; expand only with visual details that help the image model: subject, style, composition, lighting, palette, camera, mood.",
  "Do NOT mention the user, chat, or that you are rewriting. Do NOT wrap in quotes or markdown.",
  "Output a single prompt, 60–200 words, English only.",
].join(" ");

const MODIFY_SYSTEM_PROMPT = [
  "You are refining an existing image prompt based on a user's modification request (which may be in Chinese).",
  "You will be given the previous full prompt and the user's change. Merge them into a single new English prompt that keeps the core subject and overall composition of the previous prompt but incorporates the requested change.",
  "Output a single prompt, 60–200 words, English only. No quotes, no markdown, no preamble.",
].join(" ");

const SKIP_TOKENS = new Set(["", "template", "none", "off", "disabled"]);

export async function optimizePromptWithLlm(input: {
  originalPrompt: string;
  mode: "new_image" | "modify_last";
  parentPrompt?: string | null;
}): Promise<{ prompt: string; model: string } | null> {
  const settings = getApiSettings();
  const model = settings.promptOptimizerModel.trim();

  if (SKIP_TOKENS.has(model.toLowerCase())) {
    return null;
  }

  const baseUrl = settings.imageApiBaseUrl.trim().replace(/\/+$/, "");
  const apiKey = settings.imageApiKey.trim();

  if (!baseUrl || !apiKey) {
    return null;
  }

  const systemPrompt =
    input.mode === "modify_last" && input.parentPrompt
      ? MODIFY_SYSTEM_PROMPT
      : SYSTEM_PROMPT;

  const userContent =
    input.mode === "modify_last" && input.parentPrompt
      ? [
          "Previous prompt:",
          input.parentPrompt,
          "",
          "User's modification request:",
          input.originalPrompt,
        ].join("\n")
      : `User description:\n${input.originalPrompt}`;

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    console.error("[prompt-llm] fetch failed", {
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  clearTimeout(timer);

  const rawText = await response.text();

  if (!response.ok) {
    console.error("[prompt-llm] upstream non-2xx", {
      model,
      status: response.status,
      body: rawText.slice(0, 500),
    });
    return null;
  }

  let parsed: {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[prompt-llm] non-JSON body", {
      model,
      preview: rawText.slice(0, 300),
    });
    return null;
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("[prompt-llm] missing content in response", {
      model,
      body: rawText.slice(0, 300),
    });
    return null;
  }

  const cleaned = content
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (cleaned.length === 0) {
    return null;
  }

  return { prompt: cleaned, model };
}
