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
};

export class ImageGenerationError extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.publicMessage = publicMessage;
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

export async function generateImage(input: GenerateImageInput) {
  const { getApiSettings } = await import("@/server/services/settings");
  const settings = getApiSettings() as unknown as ImageApiSettings;
  const baseUrl = (settings.imageApiBaseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = (settings.imageApiKey || "").trim();
  const model = (settings.imageApiModel || "").trim();
  const defaultSize = (settings.imageApiSize || "1024x1024").trim();

  if (!baseUrl || !apiKey || !model) {
    throw new ImageGenerationError(
      "图像生成 API 未配置，请联系管理员完善配置。",
      "image API base URL / key / model 缺失",
    );
  }

  const size = aspectRatioToSize(input.aspectRatio, defaultSize);

  // 注意：不带 response_format，让服务端按模型自己的默认返回；
  // gpt-image-1 等模型明确拒绝 response_format 参数，DALL-E 3 / SD 系默认返回 url。
  const body: Record<string, unknown> = {
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

    let publicMessage: string;
    if (response.status === 401 || response.status === 403) {
      publicMessage = "图像生成 API 凭据无效，请联系管理员。";
    } else if (response.status === 404) {
      publicMessage =
        "API 端点返回 404：请检查 Base URL 是否正确（通常以 /v1 结尾）。";
    } else if (response.status === 429) {
      publicMessage = "图像生成 API 当前繁忙或额度不足，请稍后重试。";
    } else if (notImageCapable) {
      publicMessage = `所选模型 "${model}" 不支持图像生成，请在管理端换一个图像模型（如 dall-e-3、gpt-image-1、flux、sd-xl、mj 等）。`;
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

  // 某些代理即便 2xx 也把 {error: ...} 塞进 body
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
    let imgRes: Response;
    try {
      imgRes = await fetch(item.url!);
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
    bytes = Buffer.from(await imgRes.arrayBuffer());
  }

  return {
    bytes,
    mimeType: "image/png",
    effectivePrompt: item.revised_prompt || input.prompt,
  };
}
