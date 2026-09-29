import { AsyncLocalStorage } from "node:async_hooks";

export type NarrativeParagraph = { type: "paragraph"; index: number; text: string; source: "llm" | "template" };
export type ActionTiming = {
  totalMs: number; queueMs?: number; loadMs?: number; rulesMs?: number; saveMs?: number;
  firstParagraphMs?: number; generationMs?: number; firstChunkMs?: number;
  model?: string; providerCalls: number; inputCharacters?: number; inputTokens?: number;
  outputTokens?: number; thoughtTokens?: number; narration?: "llm" | "template" | "mixed";
  fallbackReason?: string; replayed?: boolean;
};
export type ActionObserver = { requestId?: string; onParagraph?: (event: NarrativeParagraph) => void; onTiming?: (timing: ActionTiming) => void };
type Observation = { started: number; timing: ActionTiming; observer: ActionObserver; paragraphs: NarrativeParagraph[] };
const observations = new AsyncLocalStorage<Observation>();
export const currentObservation = () => observations.getStore();
export function markAction(name: "queueMs" | "loadMs" | "rulesMs") {
  const observation = currentObservation();
  if (observation) observation.timing[name] = Math.round(performance.now() - observation.started);
}
export function recordActionTiming(fields: Partial<ActionTiming>) {
  const observation = currentObservation();
  if (observation) Object.assign(observation.timing, fields);
}
export function publishParagraph(text: string, source: NarrativeParagraph["source"]) {
  const observation = currentObservation();
  if (!observation) return;
  observation.timing.firstParagraphMs ??= Math.round(performance.now() - observation.started);
  const event: NarrativeParagraph = { type: "paragraph", index: observation.paragraphs.length, text, source };
  observation.paragraphs.push(event);
  // A disconnected reader must never cancel a game action or its save.
  try { observation.observer.onParagraph?.(event); } catch { /* The final state can be retrieved again. */ }
}
export async function observeAction<T>(observer: ActionObserver, operation: () => Promise<T>): Promise<T> {
  const observation: Observation = { started: performance.now(), timing: { totalMs: 0, providerCalls: 0 }, observer, paragraphs: [] };
  return observations.run(observation, async () => {
    try { return await operation(); }
    finally {
      observation.timing.totalMs = Math.round(performance.now() - observation.started);
      try { observer.onTiming?.({ ...observation.timing }); } catch { /* Telemetry is not a game rule. */ }
    }
  });
}
