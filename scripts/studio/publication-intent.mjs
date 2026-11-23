/** Publication permission comes from authenticated user commands, never model output. */
export const ARCANA_STUDIO_PUBLICATION_TARGET = Object.freeze({
  targetId: 'arcana-studio',
  siteId: 'appgprj_6aec31b8ed408191954e0d6ed0fa3151',
  scope: 'sites/arcana-studio',
  hostname: 'arcana-production-desk-bang.seoulprince.chatgpt.site',
});

const INTENT_FIELDS = ['version', 'action', 'targetId', 'siteId', 'scope', 'sourceCommandId', 'actorUserId', 'sourceText', 'context'];
const CONTEXT_FIELDS = ['commandId', 'actorUserId', 'text'];

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function strictObject(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function validCommand(command) {
  return command !== null && typeof command === 'object' && !Array.isArray(command)
    && nonempty(command.id) && nonempty(command.actorUserId) && nonempty(command.text);
}

function normalizedText(value) {
  return value.normalize('NFKC').trim();
}

function explicitPublicationCommand(value) {
  const text = normalizedText(value);
  // Quotes, questions and future user approval do not authorize a publication now.
  if (/[?"'`“”‘’「」『』<>]/u.test(text)) return false;
  const compact = text.replace(/\s+/gu, '').replace(/[.!~。]+$/gu, '');
  if (/(?:하지마|하지말|하지않|하지못|안(?:배포|게시|발행|푸시|올려)|(?:배포|게시|발행|푸시)(?:안해|안하|금지)|취소|보류|대기|아직|나중에)/u.test(compact)) return false;
  if (/(?:승인|허락|확인)(?:하면|되면|한후|한뒤|하기전|전까지)|만약|가정|예시|예를들|아니(?:야|에요|라고|고|었)/u.test(compact)) return false;
  const ending = '(?:해(?:줘(?:요)?|주세요|주십시오|요)?|하(?:라고(?:요)?|세요|십시오)|합시다|부탁(?:드립니다|드려요|해요))';
  const publish = new RegExp('(?:웹(?:에|으로)?푸시|(?:웹(?:에|으로)?|사이트(?:에|로)?)?(?:배포|게시|발행))(?:를|을)?(?:진행)?' + ending + '$', 'u');
  const reflect = new RegExp('(?:웹(?:에|으로)?|사이트(?:에|로)?)(?:반영|적용)(?:을)?' + ending + '$', 'u');
  const upload = /(?:웹(?:에|으로)?|사이트(?:에|로)?)올려(?:줘(?:요)?|주세요|주십시오|라|요)?$/u;
  if (publish.test(compact) || reflect.test(compact) || upload.test(compact)) return true;
  if (/\b(?:do\s+not|don't|not\s+yet|if|when\s+i\s+approve|after\s+i\s+approve)\b/iu.test(text)) return false;
  return /^(?:please\s+)?(?:deploy|publish)(?:\s+(?:it|this|the\s+(?:site|website)))?(?:\s+now)?[.!]*$/iu.test(text);
}

function targetInText(value) {
  const text = normalizedText(value);
  const compact = text.replace(/\s+/gu, '');
  const known = /(?:아르카나)?제작실|arcana-production-desk|sites\/arcana-studio|appgprj_6aec31b8ed408191954e0d6ed0fa3151/iu.test(compact);
  let otherUrl = false;
  let knownUrl = false;
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/giu)) {
    try {
      const url = new URL(match[0].replace(/[),.!;\]}。]+$/gu, ''));
      if (url.hostname.toLowerCase() === ARCANA_STUDIO_PUBLICATION_TARGET.hostname) knownUrl = true;
      else otherUrl = true;
    } catch {
      otherUrl = true;
    }
  }
  if (otherUrl) return known || knownUrl ? 'ambiguous' : 'other';
  const otherTarget = /(?:게임|game|요리|마법학교|godot|github|깃허브|저장소|브랜치|다른(?:제작실|사이트)|제작실(?:이)?말고)/iu.test(compact);
  if (otherTarget) return known || knownUrl ? 'ambiguous' : 'other';
  if (known || knownUrl) {
    if (/(?:둘다|모두배포)/u.test(compact)) return 'ambiguous';
    return 'studio';
  }
  return 'none';
}

/** Resolve only the known production desk, using the current directive and same-user context. */
export function derivePublicationIntent(command, history = []) {
  if (!validCommand(command) || !explicitPublicationCommand(command.text)) return null;
  const currentTarget = targetInText(command.text);
  if (currentTarget === 'other' || currentTarget === 'ambiguous') return null;
  let context = null;
  if (currentTarget === 'studio') {
    context = { commandId: command.id, actorUserId: command.actorUserId, text: command.text };
  } else if (Array.isArray(history)) {
    for (const entry of history.slice(-16).reverse()) {
      if (!entry || entry.role !== 'user' || entry.actorUserId !== command.actorUserId
        || !nonempty(entry.commandId) || !nonempty(entry.text)) continue;
      const target = targetInText(entry.text);
      if (target === 'other' || target === 'ambiguous') return null;
      if (target === 'studio') {
        context = { commandId: entry.commandId, actorUserId: entry.actorUserId, text: entry.text };
        break;
      }
    }
  }
  if (!context) return null;
  return {
    version: 1, action: 'publish',
    targetId: ARCANA_STUDIO_PUBLICATION_TARGET.targetId,
    siteId: ARCANA_STUDIO_PUBLICATION_TARGET.siteId,
    scope: ARCANA_STUDIO_PUBLICATION_TARGET.scope,
    sourceCommandId: command.id, actorUserId: command.actorUserId, sourceText: command.text, context,
  };
}

/** Recheck a frozen bridge-created intent against its real command and exact target evidence. */
export function verifyPublicationIntent(command, intent) {
  if (intent === null || intent === undefined) return null;
  const invalid = () => { throw new Error('웹 게시 계약: 실제 사용자 명령·대상 근거와 일치하지 않는 게시 권한입니다.'); };
  if (!validCommand(command) || !strictObject(intent, INTENT_FIELDS) || !strictObject(intent.context, CONTEXT_FIELDS)) invalid();
  if (intent.version !== 1 || intent.action !== 'publish'
    || intent.targetId !== ARCANA_STUDIO_PUBLICATION_TARGET.targetId
    || intent.siteId !== ARCANA_STUDIO_PUBLICATION_TARGET.siteId || intent.scope !== ARCANA_STUDIO_PUBLICATION_TARGET.scope
    || intent.sourceCommandId !== command.id || intent.actorUserId !== command.actorUserId || intent.sourceText !== command.text
    || intent.context.actorUserId !== command.actorUserId || !nonempty(intent.context.commandId) || !nonempty(intent.context.text)) invalid();
  if (intent.context.commandId === command.id && intent.context.text !== command.text) invalid();
  const expected = derivePublicationIntent(command, [{ role: 'user', ...intent.context }]);
  if (!expected) invalid();
  for (const field of INTENT_FIELDS.filter((field) => field !== 'context')) if (intent[field] !== expected[field]) invalid();
  for (const field of CONTEXT_FIELDS) if (intent.context[field] !== expected.context[field]) invalid();
  return expected;
}