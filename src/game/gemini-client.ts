import "../load-env";
import { appendDevLlmTraceForGame, toTraceRequest } from "./dev-llm-trace";

type GeminiJsonOptions = {
  model?: string;
  temperature?: number;
  trace?: {
    gameId: string;
    scope: "planner" | "card";
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

const DEFAULT_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

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
  const traceRequest = options.trace ? toTraceRequest(userPayload, systemPrompt) : "";
  let traceLogged = false;

  try {
    const response = await fetch(`${apiUrl}/models/${model}:generateContent`, {
      method: "POST",
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
          temperature: options.temperature ?? 0.8,
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
          model,
          status: "error",
          request: traceRequest,
          response: body,
          message,
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
          model,
          status: "error",
          request: traceRequest,
          response: rawText,
          message: error instanceof Error ? error.message : "Failed to parse Gemini JSON response.",
        });
      }
      throw error;
    }
  } catch (error) {
    if (options.trace && !traceLogged && !(error instanceof SyntaxError)) {
      appendDevLlmTraceForGame(options.trace.gameId, {
        scope: options.trace.scope,
        target: options.trace.target,
        model,
        status: "error",
        request: traceRequest,
        response: "",
        message: error instanceof Error ? error.message : "Gemini request failed.",
      });
    }
    throw error;
  }
}
