import "server-only";

import { GoogleAuth } from "google-auth-library";

import { DEFAULT_VERTEX_LOCATION, DEFAULT_VERTEX_MODEL } from "@/lib/constants";
import { getApiSettings } from "@/server/services/settings";

type GenerateImageInput = {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  seed?: number | null;
};

export class VertexImagenError extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.publicMessage = publicMessage;
    this.name = "VertexImagenError";
  }
}

export async function generateImageWithVertex(input: GenerateImageInput) {
  const settings = getApiSettings();
  const location = settings.vertexLocation || DEFAULT_VERTEX_LOCATION;
  const projectId = settings.vertexProjectId;
  const model = settings.imagenModel || DEFAULT_VERTEX_MODEL;
  const credentialsText = settings.serviceAccountJson;

  if (!projectId || !credentialsText) {
    throw new VertexImagenError(
      "Vertex AI 未配置，请联系管理员完善配置。",
      "Vertex AI 配置未完成，请先在管理端填写项目和服务账号 JSON。",
    );
  }

  let credentials: object;

  try {
    credentials = JSON.parse(credentialsText);
  } catch {
    throw new VertexImagenError(
      "Vertex AI 凭据无效，请联系管理员。",
      "服务账号 JSON 格式不正确。",
    );
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse.token;

  if (!accessToken) {
    throw new VertexImagenError(
      "Vertex AI 凭据无效，请联系管理员。",
      "无法获取 Vertex AI 访问令牌。",
    );
  }

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: input.prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: input.aspectRatio,
        enhancePrompt: false,
        negativePrompt: input.negativePrompt || undefined,
        seed: input.seed ?? undefined,
        outputOptions: {
          mimeType: "image/png",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const publicMessage =
      response.status === 429
        ? "Vertex AI 当前繁忙或额度不足，请稍后重试。"
        : response.status >= 500
          ? "Vertex AI 暂时不可用，请稍后重试。"
          : "生成失败，请检查提示词后重试。";
    throw new VertexImagenError(
      publicMessage,
      `Vertex AI 请求失败: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    predictions?: Array<{
      bytesBase64Encoded?: string;
      mimeType?: string;
      prompt?: string;
    }>;
  };

  const prediction = data.predictions?.[0];

  if (!prediction?.bytesBase64Encoded) {
    throw new VertexImagenError(
      "生成失败，请稍后重试。",
      "Vertex AI 没有返回图片数据。",
    );
  }

  return {
    bytes: Buffer.from(prediction.bytesBase64Encoded, "base64"),
    mimeType: prediction.mimeType || "image/png",
    effectivePrompt: prediction.prompt || input.prompt,
  };
}
