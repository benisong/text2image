import "server-only";

type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  seed?: number | null;
};

type ImageApiSettings = {
  imageApiBaseUrl: string;
  imageApiKey: string;
  imageApiModel: string;
  imageApiSize: string;
  imageApiRoute: "auto" | "images" | "chat";
};

type GeneratedImage = {
  bytes: Buffer;
  mimeType: string;
  effectivePrompt: string;
};

type ResolvedSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
};

export class ImageGenerationError extends Error {
  readonly publicMessage: string;
  readonly canFallbackToChat: boolean;

  constructor(
    publicMessage: string,
    internalMessage?: string,
    options: { canFallbackToChat?: boolean } = {},
  ) {
    super(internalMessage ?? publicMessage);
    this.publicMessage = publicMessage;
    this.canFallbackToChat = options.canFallbackToChat ?? false;
    this.name = "ImageGenerationError";
  }
}

function aspectRatioToSize(ratio: string, defaultSize: string): string {
  const fallback = defaultSize.includes("x") ? defaultSize : "1024x1024";
  switch (ratio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "1:1":
      return fallback;
    default:
      return fallback;
  }
}

function truncate(value: string, max = 800) {
  return value.length <= max ? value : `${value.slice(0, max)}...(truncated)`;
}

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const { getApiSettings } = await import("@/server/services/settings");
  const settings = getApiSettings() as unknown as ImageApiSettings;
  const baseUrl = (settings.imageApiBaseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = (settings.imageApiKey || "").trim();
  const model = (settings.imageApiModel || "").trim();
  const defaultSize = (settings.imageApiSize || "1024x1024").trim();
  const route = settings.imageApiRoute ?? "auto";

  if (!baseUrl || !apiKey || !model) {
    throw new ImageGenerationError(
      "图像生成 API 未配置，请联系管理员完善配置。",
      "image API base URL / key / model 缺失",
    );
  }

  const size = aspectRatioToSize(input.aspectRatio, defaultSize);
  const resolved: ResolvedSettings = { baseUrl, apiKey, model, size };

  if (route === "chat") {
    return await generateViaChatApi(resolved, input);
  }

  try {
    return await generateViaImagesApi(resolved, input);
  } catch (error) {
    if (
      route === "auto" &&
      error instanceof ImageGenerationError &&
      error.canFallbackToChat
    ) {
      console.warn(
        `[image-generator] images endpoint 不支持 "${model}"，回退到 chat completions`,
      );
      return await generateViaChatApi(resolved, input);
    }
    throw error;
  }
}

// -------- /v1/images/generations --------

async function generateViaImagesApi(
  settings: ResolvedSettings,
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  const { baseUrl, apiKey, model, size } = settings;

  const body = {
    model,
    prompt: input.prompt,
    n: 1,
    size,
  };
  const requestUrl = `${baseUrl}/images/generations`;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[image-generator] fetch failed", {
      url: requestUrl,
      model,
      size,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ImageGenerationError(
      "无法连接图像生成 API，请稍后重试。",
      error instanceof Error ? error.message : "fetch failed",
    );
  }

  const rawText = await response.text();

  if (!response.ok) {
    console.error("[image-generator] upstream non-2xx", {
      url: requestUrl,
      model,
      size,
      status: response.status,
      body: truncate(rawText),
    });

    let upstreamMsg = "";
    let upstreamCode = "";
    try {
      const maybe = JSON.parse(rawText) as {
        error?: { message?: unknown; code?: unknown };
      };
      if (maybe && typeof maybe.error === "object" && maybe.error) {
        if (typeof maybe.error.message === "string") upstreamMsg = maybe.error.message;
        if (typeof maybe.error.code === "string") upstreamCode = maybe.error.code;
      }
    } catch {
      // ignore non-JSON body
    }

    const notImageCapable =
      upstreamCode === "convert_request_failed" ||
      /not supported model for image generation/i.test(upstreamMsg) ||
      /model.*not.*support.*image/i.test(upstreamMsg);

    if (notImageCapable) {
      throw new ImageGenerationError(
        `所选模型 "${model}" 不支持 /v1/images/generations 协议`,
        `image API ${response.status}: ${truncate(rawText)}`,
        { canFallbackToChat: true },
      );
    }

    let publicMessage: string;
    if (response.status === 401 || response.status === 403) {
      publicMessage = "图像生成 API 凭据无效，请联系管理员。";
    } else if (response.status === 404) {
      publicMessage =
        "API 端点返回 404：请检查 Base URL 是否正确（通常以 /v1 结尾）。";
    } else if (response.status === 429) {
      publicMessage = "图像生成 API 当前繁忙或额度不足，请稍后重试。";
    } else if (response.status === 400 || response.status === 422) {
      publicMessage = upstreamMsg
        ? `生成请求被 API 拒绝：${upstreamMsg.slice(0, 120)}`
        : "生成请求被 API 拒绝，请检查模型名或提示词。";
    } else if (response.status >= 500) {
      publicMessage = "图像生成 API 暂时不可用，请稍后重试。";
    } else {
      publicMessage = "生成失败，请检查提示词后重试。";
    }

    throw new ImageGenerationError(
      publicMessage,
      `image API ${response.status}: ${truncate(rawText)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("[image-generator] non-JSON body", {
      url: requestUrl,
      preview: truncate(rawText, 400),
    });
    throw new ImageGenerationError(
      "API 返回不是合法 JSON。",
      `non-JSON body: ${truncate(rawText, 400)}`,
    );
  }

  const parsedObject =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  if (parsedObject.error) {
    console.error("[image-generator] upstream error in 2xx body", {
      url: requestUrl,
      body: truncate(rawText),
    });
    throw new ImageGenerationError(
      "生成失败，API 返回错误。",
      `embedded error: ${truncate(JSON.stringify(parsedObject.error), 400)}`,
    );
  }

  type ImageItem = {
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  };
  const data = parsedObject as { data?: ImageItem[] };
  const item = data.data?.[0];

  if (!item || (!item.b64_json && !item.url)) {
    console.error("[image-generator] no image in response", {
      url: requestUrl,
      body: truncate(rawText),
    });
    throw new ImageGenerationError(
      "生成失败，请稍后重试。",
      "image API returned no data",
    );
  }

  let bytes: Buffer;
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, "base64");
  } else {
    bytes = await downloadImage(item.url!);
  }

  return {
    bytes,
    mimeType: "image/png",
    effectivePrompt: item.revised_prompt || input.prompt,
  };
}

// -------- /v1/chat/completions 回退 --------

async function generateViaChatApi(
  settings: ResolvedSettings,
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  const { baseUrl, apiKey, model } = settings;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: input.prompt,
      },
    ],
  };
  const requestUrl = `${baseUrl}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("[image-generator] chat fetch failed", {
      url: requestUrl,
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ImageGenerationError(
      "无法连接图像生成 API，请稍后重试。",
      error instanceof Error ? error.message : "fetch failed",
    );
  }

  const rawText = await response.text();

  if (!response.ok) {
    console.error("[image-generator] chat upstream non-2xx", {
      url: requestUrl,
      model,
      status: response.status,
      body: truncate(rawText),
    });
    throw new ImageGenerationError(
      response.status === 401 || response.status === 403
        ? "图像生成 API 凭据无效，请联系管理员。"
        : response.status === 429
          ? "图像生成 API 当前繁忙或额度不足，请稍后重试。"
          : `生成失败（${response.status}），请稍后重试。`,
      `chat API ${response.status}: ${truncate(rawText)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ImageGenerationError(
      "API 返回不是合法 JSON。",
      `non-JSON body: ${truncate(rawText, 400)}`,
    );
  }

  const parsedObject =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  if (parsedObject.error) {
    throw new ImageGenerationError(
      "生成失败，API 返回错误。",
      `embedded error: ${truncate(JSON.stringify(parsedObject.error), 400)}`,
    );
  }

  const refs = extractImageRefsFromChat(parsedObject);
  if (refs.length === 0) {
    console.error("[image-generator] chat response contained no image", {
      url: requestUrl,
      body: truncate(rawText),
    });
    throw new ImageGenerationError(
      "模型没有返回图片，换个模型或换种描述再试。",
      "chat response had no image parts",
    );
  }

  let bytes: Buffer | null = null;
  for (const ref of refs) {
    try {
      bytes = await resolveImageRef(ref);
      if (bytes) break;
    } catch (error) {
      console.error("[image-generator] failed to load image ref", {
        refPreview: ref.slice(0, 60),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!bytes) {
    throw new ImageGenerationError(
      "解析返回的图片数据失败。",
      `could not decode any of ${refs.length} image refs`,
    );
  }

  return {
    bytes,
    mimeType: "image/png",
    effectivePrompt: input.prompt,
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function extractImageRefsFromChat(body: UnknownRecord): string[] {
  const refs: string[] = [];

  const choices = Array.isArray(body.choices) ? body.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const message = choice.message;
    if (!isRecord(message)) continue;

    // shape: message.images: [{ image_url: { url } }] or [{ url }]
    const images = message.images;
    if (Array.isArray(images)) {
      for (const im of images) {
        if (!isRecord(im)) continue;
        const nested = isRecord(im.image_url) ? im.image_url.url : undefined;
        const candidate =
          typeof nested === "string"
            ? nested
            : typeof im.url === "string"
              ? im.url
              : typeof im.b64_json === "string"
                ? `data:image/png;base64,${im.b64_json}`
                : null;
        if (candidate) refs.push(candidate);
      }
    }

    // shape: message.content is array of parts
    const content = message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!isRecord(part)) continue;
        if (part.type === "image_url") {
          const url =
            isRecord(part.image_url) && typeof part.image_url.url === "string"
              ? part.image_url.url
              : typeof part.image_url === "string"
                ? part.image_url
                : null;
          if (url) refs.push(url);
        } else if (part.type === "image" && typeof part.source === "object") {
          const source = part.source as UnknownRecord;
          if (typeof source.data === "string") {
            const media = typeof source.media_type === "string" ? source.media_type : "image/png";
            refs.push(`data:${media};base64,${source.data}`);
          }
        }
      }
    }

    // shape: content is string with markdown / data URI
    if (typeof content === "string") {
      const markdown = [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)];
      for (const m of markdown) refs.push(m[1]);

      const dataUris = [
        ...content.matchAll(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g),
      ];
      for (const m of dataUris) {
        if (!refs.includes(m[0])) refs.push(m[0]);
      }
    }
  }

  return refs;
}

async function resolveImageRef(ref: string): Promise<Buffer | null> {
  if (ref.startsWith("data:")) {
    const comma = ref.indexOf(",");
    if (comma === -1) return null;
    const meta = ref.slice(5, comma);
    const payload = ref.slice(comma + 1);
    if (meta.includes("base64")) {
      return Buffer.from(payload, "base64");
    }
    return Buffer.from(decodeURIComponent(payload), "utf8");
  }
  if (/^https?:\/\//i.test(ref)) {
    return await downloadImage(ref);
  }
  return null;
}

async function downloadImage(url: string): Promise<Buffer> {
  let imgRes: Response;
  try {
    imgRes = await fetch(url);
  } catch (error) {
    throw new ImageGenerationError(
      "下载生成的图片失败。",
      error instanceof Error ? error.message : "download failed",
    );
  }
  if (!imgRes.ok) {
    throw new ImageGenerationError(
      "下载生成的图片失败。",
      `download failed: ${imgRes.status}`,
    );
  }
  return Buffer.from(await imgRes.arrayBuffer());
}
