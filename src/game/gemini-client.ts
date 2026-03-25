import "../load-env";

type GeminiJsonOptions = {
  model?: string;
  temperature?: number;
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
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

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
    throw new Error(`Gemini request failed: ${response.status}${body ? ` ${body}` : ""}`);
  }

  const payload = await response.json() as GeminiGenerateResponse;
  return JSON.parse(stripCodeFence(extractCandidateText(payload))) as T;
}
