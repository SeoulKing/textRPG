/** Parse SSE with UTF-8 and event boundaries independent of network chunk boundaries. */
export async function readGeminiStream(response: Response, onText: (text: string) => void) {
  if (!response.body) throw new Error("Gemini stream has no body.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", rawText = "", usageMetadata: Record<string, number> | undefined;
  const event = (frame: string) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const payload = JSON.parse(data);
    if (payload.error) throw new Error("Gemini stream reported an error.");
    usageMetadata = payload.usageMetadata ?? usageMetadata;
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error("Gemini stream ended: " + candidate.finishReason);
    const delta = (candidate?.content?.parts ?? []).filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text ?? "").join("");
    if (delta) {
      rawText += delta;
      if (rawText.length > 100_000) throw new Error("Gemini response exceeded the narrative limit.");
      onText(rawText);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (buffer.length > 200_000) throw new Error("Gemini stream frame exceeded the limit.");
      if (done) { if (buffer.trim()) event(buffer); break; }
    }
    if (!rawText.trim()) throw new Error("Gemini returned no text.");
    return { rawText, usageMetadata };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Only complete objects in the first, paragraphs property are exposed. Strings may contain braces. */
export function completedParagraphs(raw: string): unknown[] {
  const start = /^\s*\{\s*"paragraphs"\s*:\s*\[/.exec(raw);
  if (!start) return [];
  const result: unknown[] = [];
  let depth = 0, quoted = false, escaped = false, objectStart = -1;
  for (let i = start[0].length; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") { if (depth === 0) objectStart = i; depth++; }
    else if (char === "}" || char === "]") {
      if (depth === 0) break;
      if (--depth === 0) {
        try { result.push(JSON.parse(raw.slice(objectStart, i + 1))); } catch { break; }
      }
    }
  }
  return result;
}
