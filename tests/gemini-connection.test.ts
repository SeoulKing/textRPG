import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { testGeminiConnection } from "../src/game/gemini-client";

const originalFetch = globalThis.fetch;
const originalGeminiApiKey = process.env.GEMINI_API_KEY;
const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
const originalGeminiModel = process.env.GEMINI_MODEL;
const originalGeminiApiUrl = process.env.GEMINI_API_URL;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("GEMINI_API_KEY", originalGeminiApiKey);
  restoreEnv("GOOGLE_API_KEY", originalGoogleApiKey);
  restoreEnv("GEMINI_MODEL", originalGeminiModel);
  restoreEnv("GEMINI_API_URL", originalGeminiApiUrl);
});

test("API 키가 없으면 Gemini 연결 테스트를 시작하지 않는다", async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  await assert.rejects(
    () => testGeminiConnection(),
    /GEMINI_API_KEY 환경변수가 필요합니다/,
  );
});

test("모델 조회 응답으로 Gemini 연결 상태를 확인한다", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GOOGLE_API_KEY;
  process.env.GEMINI_MODEL = "gemini-test";
  process.env.GEMINI_API_URL = "https://gemini.example.test/v1beta/";

  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://gemini.example.test/v1beta/models/gemini-test",
    );
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key");
    return new Response(JSON.stringify({
      name: "models/gemini-test",
      version: "001",
      displayName: "Gemini Test",
      supportedGenerationMethods: ["generateContent"],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await testGeminiConnection();

  assert.equal(result.model, "gemini-test");
  assert.equal(result.displayName, "Gemini Test");
  assert.equal(result.version, "001");
  assert.equal(result.supportsGenerateContent, true);
  assert.ok(result.latencyMs >= 0);
});
