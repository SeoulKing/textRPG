import "../load-env";
import { appendDevLlmTraceForGame, toTraceRequest } from "./dev-llm-trace";

type GeminiJsonOptions = {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  trace?: {
    gameId: string;
    scope: "planner" | "card" | "subway";
    target: string;
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

type GeminiModelResponse = {
  name?: string;
  version?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

export type GeminiConnectionTestResult = {
  model: string;
  displayName: string | null;
  version: string | null;
  supportsGenerateContent: boolean;
  latencyMs: number;
};

const DEFAULT_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractCandidateText(payload: GeminiGenerateResponse) {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const blockReason = payload.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Gemini blocked the response: ${blockReason}` : "Gemini returned no text.");
  }

  return text;
}

export function hasGeminiConfig() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function geminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export async function testGeminiConnection(timeoutMs = 10_000): Promise<GeminiConnectionTestResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 필요합니다.");
  }

  const apiUrl = (process.env.GEMINI_API_URL || DEFAULT_GEMINI_API_URL).replace(/\/$/, "");
  const model = geminiModel().replace(/^models\//, "");
  const startedAt = Date.now();
  const response = await fetch(`${apiUrl}/models/${encodeURIComponent(model)}`, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = "";
    if (body) {
      try {
        const payload = JSON.parse(body) as { error?: { message?: string } };
        detail = payload.error?.message?.trim() || "";
      } catch {
        detail = body.trim().slice(0, 240);
      }
    }
    throw new Error(
      `Gemini API 연결 실패 (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const payload = await response.json() as GeminiModelResponse;
  return {
    model: payload.name?.replace(/^models\//, "") || model,
    displayName: payload.displayName?.trim() || null,
    version: payload.version?.trim() || null,
    supportsGenerateContent:
      payload.supportedGenerationMethods?.includes("generateContent") ?? false,
    latencyMs: Date.now() - startedAt,
  };
}

export async function generateGeminiJson<T>(
  systemPrompt: string,
  userPayload: Record<string, unknown>,
  options: GeminiJsonOptions = {},
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const apiUrl = (process.env.GEMINI_API_URL || DEFAULT_GEMINI_API_URL).replace(/\/$/, "");
  const model = options.model || geminiModel();
  const supportsSamplingParameters = !/^gemini-(?:3\.5-flash-lite|3\.6-flash)(?:$|-)/.test(
    model.replace(/^models\//, ""),
  );
  const traceRequest = options.trace ? toTraceRequest(userPayload, systemPrompt) : "";
  let traceLogged = false;

  try {
    const response = await fetch(`${apiUrl}/models/${model}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(userPayload) }],
          },
        ],
        generationConfig: {
          ...(supportsSamplingParameters
            ? { temperature: options.temperature ?? 0.8 }
            : {}),
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = `Gemini request failed: ${response.status}${body ? ` ${body}` : ""}`;
      if (options.trace) {
        appendDevLlmTraceForGame(options.trace.gameId, {
          scope: options.trace.scope,
          target: options.trace.target,
          stage: "request",
          model,
          status: "error",
          request: traceRequest,
          response: body,
          message,
          errorReason: message,
        });
        traceLogged = true;
      }
      throw new Error(message);
    }

    const payload = await response.json() as GeminiGenerateResponse;
    const rawText = extractCandidateText(payload);
    try {
      const parsed = JSON.parse(stripCodeFence(rawText)) as T;
      if (options.trace) {
        appendDevLlmTraceForGame(options.trace.gameId, {
          scope: options.trace.scope,
          target: options.trace.target,
          stage: "request",
          model,
          status: "success",
          request: traceRequest,
          response: rawText,
          message: "Gemini response parsed successfully.",
        });
      }
      return parsed;
    } catch (error) {
      if (options.trace) {
        appendDevLlmTraceForGame(options.trace.gameId, {
          scope: options.trace.scope,
          target: options.trace.target,
          stage: "error",
          model,
          status: "error",
          request: traceRequest,
          response: rawText,
          message: error instanceof Error ? error.message : "Failed to parse Gemini JSON response.",
          errorReason: error instanceof Error ? error.message : "Failed to parse Gemini JSON response.",
        });
      }
      throw error;
    }
  } catch (error) {
    if (options.trace && !traceLogged && !(error instanceof SyntaxError)) {
        appendDevLlmTraceForGame(options.trace.gameId, {
          scope: options.trace.scope,
          target: options.trace.target,
          stage: "error",
          model,
          status: "error",
          request: traceRequest,
          response: "",
          message: error instanceof Error ? error.message : "Gemini request failed.",
          errorReason: error instanceof Error ? error.message : "Gemini request failed.",
        });
    }
    throw error;
  }
}
