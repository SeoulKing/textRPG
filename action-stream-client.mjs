/** Transport parsing is independent of animation; slow typing never blocks the response reader. */
export async function readActionStream(response, onEvent = () => {}, requestId) {
  if (!response.body) throw new Error("응답 연결이 비어 있습니다.");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", snapshot, count = 0;
  const consume = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "accepted" && requestId && event.requestId !== requestId) throw new Error("다른 행동의 응답입니다.");
    if (event.type === "error") { const error = new Error(event.message); error.status = 400; throw error; }
    if (event.type === "paragraph") {
      if (snapshot || event.index !== count++ || typeof event.text !== "string" || !event.text.trim() || !["llm", "template"].includes(event.source)) throw new Error("서사 응답 순서가 올바르지 않습니다.");
    }
    if (event.type === "complete") {
      if (!event.snapshot?.gameId || snapshot) throw new Error("완료 응답이 올바르지 않습니다.");
      snapshot = event.snapshot;
    }
    onEvent(event);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (buffer.length > 8_000_000) throw new Error("응답이 너무 큽니다.");
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    if (!snapshot) throw new Error("결과를 받기 전에 연결이 끊겼습니다.");
    return snapshot;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
