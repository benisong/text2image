export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}
