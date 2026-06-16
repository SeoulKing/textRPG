import { appendDevLlmTraceForGame } from "./dev-llm-trace";
import { compileNarrativeAnchorDraft, compileNarrativeSceneDraft } from "./narrative-compiler";
import {
  plannerSourceFromDraftId,
  validateCompiledRegionPackage,
  validateCompiledStoryBeat,
} from "./narrative-planner-validation";
import type {
  ContentRegistry,
  GeneratedRegionPackage,
  GeneratedStoryBeat,
  NarrativeAnchorDraft,
  NarrativeSceneDraft,
} from "./schemas";
import type { PlannerInput, StoryBeatPlannerInput } from "./narrative-planner-types";

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function errorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function compileAnchorDraftForRuntime(
  gameId: string,
  input: PlannerInput,
  draft: NarrativeAnchorDraft,
): GeneratedRegionPackage {
  const plannerSource = plannerSourceFromDraftId(draft.id);
  try {
    const compiled = compileNarrativeAnchorDraft({
      draft,
      plannerInput: input,
      plannerSource,
    });
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `region:${input.sequence}:compiler`,
      stage: "compiler_summary",
      model: "server-compiler",
      status: "success",
      request: stringify(draft),
      response: stringify(compiled.compiler ?? {}),
      message: compiled.compiler?.summary ?? "앵커 지역 초안을 서버 게임 데이터로 컴파일했습니다.",
    });

    const validated = validateCompiledRegionPackage(input.state, input.registry, compiled);
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `region:${input.sequence}:compiled-result`,
      stage: "compiled_result",
      model: "server-compiler",
      status: "success",
      request: "",
      response: stringify(validated),
      message: "컴파일된 앵커 지역 패키지를 저장 가능한 형태로 확정했습니다.",
    });
    return validated;
  } catch (error) {
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `region:${input.sequence}:compiler-error`,
      stage: "fallback",
      model: "server-compiler",
      status: "error",
      request: stringify(draft),
      response: "",
      message: "앵커 지역 컴파일 또는 guardrail 검증에 실패했습니다.",
      errorReason: errorReason(error),
    });
    throw error;
  }
}

export function compileSceneDraftForRuntime(
  gameId: string,
  request: StoryBeatPlannerInput,
  draft: NarrativeSceneDraft,
): GeneratedStoryBeat {
  const plannerSource = plannerSourceFromDraftId(draft.id);
  try {
    const compiled = compileNarrativeSceneDraft({
      draft,
      request,
      registry: request.registry as ContentRegistry,
      plannerSource,
    });
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `beat:${request.sequence}:compiler`,
      stage: "compiler_summary",
      model: "server-compiler",
      status: "success",
      request: stringify(draft),
      response: stringify(compiled.compiler ?? {}),
      message: compiled.compiler?.summary ?? "다음 씬 초안을 서버 게임 데이터로 컴파일했습니다.",
    });

    const validated = validateCompiledStoryBeat(request, compiled);
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `beat:${request.sequence}:compiled-result`,
      stage: "compiled_result",
      model: "server-compiler",
      status: "success",
      request: "",
      response: stringify(validated),
      message: "컴파일된 다음 씬을 저장 가능한 형태로 확정했습니다.",
    });
    return validated;
  } catch (error) {
    appendDevLlmTraceForGame(gameId, {
      scope: "planner",
      target: `beat:${request.sequence}:compiler-error`,
      stage: "fallback",
      model: "server-compiler",
      status: "error",
      request: stringify(draft),
      response: "",
      message: "다음 씬 컴파일 또는 guardrail 검증에 실패했습니다.",
      errorReason: errorReason(error),
    });
    throw error;
  }
}
