/**
 * 스토리 템플릿
 * - 장면/이벤트 문단을 여기서 관리
 * - LLM이 나중에 이 템플릿을 대체하거나 보강
 */

export type SceneParagraphTemplate = (ctx: {
  locationSummary: string;
  localPeople: string;
  localItems: string;
  recentLog: string;
  phase: string;
}) => string;

export const sceneParagraphTemplates: SceneParagraphTemplate[] = [
  (ctx) => `${ctx.locationSummary} 이 캠프에서 버티려면 물자를 모으고, 끼니를 해결해야 한다.`,
  (ctx) =>
    ctx.localPeople
      ? `이곳에는 ${ctx.localPeople} 같은 인물들이 있고, ${ctx.localItems || "쓸 만한 물자"}를 구할 수 있다.`
      : `이곳에 선 지금, 파밍할 곳과 끼니를 가늠하며 다음 움직임을 고른다.`,
  (ctx) =>
    ctx.recentLog
      ? `방금까지 ${ctx.recentLog} 같은 일이 있었다.`
      : "편의점, 마트, 급식소를 돌며 물자를 모아야 한다.",
];

export const eventSummaryTemplate = (locationName: string) =>
  `${locationName}에서 작은 변수 하나가 생겼다.`;
