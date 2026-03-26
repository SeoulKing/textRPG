import type { DevLlmTraceEntry } from "./schemas";
import { DevLlmTraceEntrySchema } from "./schemas";

const traceStore = new Map<string, DevLlmTraceEntry[]>();
const MAX_TRACE_ENTRIES = 10;
const MAX_TEXT_LENGTH = 12000;

function clip(value: string, max = MAX_TEXT_LENGTH) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n...<truncated>`;
}

function safeStringify(value: unknown) {
  try {
    return clip(JSON.stringify(value, null, 2));
  } catch {
    return clip(String(value));
  }
}

export function clearDevLlmTrace(gameId: string) {
  traceStore.set(gameId, []);
}

export function appendDevLlmTraceForGame(
  gameId: string,
  entry: Omit<DevLlmTraceEntry, "id" | "at">,
) {
  const nextEntry = DevLlmTraceEntrySchema.parse({
    id: `${entry.scope}:${entry.target}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
    request: clip(entry.request),
    response: clip(entry.response),
    message: clip(entry.message, 4000),
  });

  const existing = traceStore.get(gameId) ?? [];
  existing.unshift(nextEntry);
  traceStore.set(gameId, existing.slice(0, MAX_TRACE_ENTRIES));
}

export function getDevLlmTrace(gameId: string) {
  return structuredClone(traceStore.get(gameId) ?? []);
}

export function toTraceRequest(payload: unknown, systemPrompt?: string) {
  return safeStringify({
    systemPrompt: systemPrompt ? clip(systemPrompt, 2500) : "",
    payload,
  });
}
