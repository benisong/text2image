export function nowIso() {
  return new Date().toISOString();
}

export function titleFromPrompt(prompt: string) {
  const text = prompt.trim().replace(/\s+/g, " ");

  if (!text) {
    return "新会话";
  }

  return text.slice(0, 24);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function joinUrlPath(...segments: string[]) {
  return segments
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .join("/");
}

export function formatDateTime(input: string | null | undefined) {
  if (!input) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(input));
}
