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
  switch (ratio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "1:1":
      return defaultSize.includes("x") ? defaultSize : "1024x1024";
    default:
      return defaultSize.includes("x") ? defaultSize : "1024x1024";
  }
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

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: 1,
    size,
    response_format: "b64_json",
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ImageGenerationError(
      "无法连接图像生成 API，请稍后重试。",
      error instanceof Error ? error.message : "fetch failed",
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const publicMessage =
      response.status === 401 || response.status === 403
        ? "图像生成 API 凭据无效，请联系管理员。"
        : response.status === 429
          ? "图像生成 API 当前繁忙或额度不足，请稍后重试。"
          : response.status >= 500
            ? "图像生成 API 暂时不可用，请稍后重试。"
            : "生成失败，请检查提示词后重试。";
    throw new ImageGenerationError(
      publicMessage,
      `image API ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }

  type ImageItem = {
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  };
  const data = (await response.json()) as { data?: ImageItem[] };
  const item = data.data?.[0];

  if (!item || (!item.b64_json && !item.url)) {
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
