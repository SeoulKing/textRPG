const FALLBACK = { profile: 'standard', model: 'gpt-6.1-terra', reasoningEffort: 'medium', reason: '모델 정책이 없는 이전 원장의 호환 기본값입니다.' };
const MODELS = new Set(['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

export function validateModelPolicy(settings, organizations) {
  const policy = settings.modelPolicy;
  if (policy === undefined) return;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
    || !policy.profiles || typeof policy.profiles !== 'object' || Array.isArray(policy.profiles)
    || !policy.organizations || typeof policy.organizations !== 'object' || Array.isArray(policy.organizations)) {
    throw new Error('settings.modelPolicy의 profiles와 organizations 객체를 확인해 주세요.');
  }
  for (const [name, profile] of Object.entries(policy.profiles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !profile || !MODELS.has(profile.model) || !EFFORTS.has(profile.reasoningEffort)) {
      throw new Error('절약 정책의 모델과 추론 강도를 확인해 주세요: ' + name);
    }
  }
  for (const organization of organizations) {
    if (!Object.hasOwn(policy.profiles, policy.organizations[organization])) throw new Error('조직의 기본 모델 프로필이 없습니다: ' + organization);
  }
  for (const organization of Object.keys(policy.organizations)) {
    if (!organizations.includes(organization)) throw new Error('알 수 없는 모델 정책 조직입니다: ' + organization);
  }
}

export function resolveExecution(board, task = null, phase = 'producer') {
  if (!['producer', 'reviewer', 'director'].includes(phase)) throw new Error('모델 선택 단계가 올바르지 않습니다.');
  const role = phase === 'director' ? 'director' : phase === 'reviewer' ? 'quality' : task?.organization;
  if (!role) throw new Error('모델을 선택할 담당 조직이 필요합니다.');
  const override = phase === 'director' ? undefined : task?.[phase === 'reviewer' ? 'reviewModelProfile' : 'modelProfile'];
  let reason = phase === 'director' ? undefined : task?.[phase === 'reviewer' ? 'reviewModelReason' : 'modelReason'];
  if (override !== undefined && !nonempty(reason)) throw new Error('작업별 모델 변경 이유가 필요합니다: ' + task.id + ' / ' + phase);
  const policy = board.settings.modelPolicy;
  if (!policy) {
    if (override !== undefined) throw new Error('작업별 모델 선택에는 settings.modelPolicy가 필요합니다.');
    return { ...FALLBACK, role };
  }
  const producerProfile = task?.modelProfile ?? policy.organizations[task?.organization];
  const inherited = phase === 'reviewer' && producerProfile === 'critical' ? 'critical' : undefined;
  const name = override ?? inherited ?? policy.organizations[role];
  if (!Object.hasOwn(policy.profiles, name)) throw new Error('정의되지 않은 모델 프로필입니다: ' + name);
  if (inherited && override === undefined) reason = task.modelReason;
  return { role, profile: name, ...policy.profiles[name], reason: reason ?? '담당 조직의 기본 배정입니다.' };
}

export function codexModelArgs(execution) {
  return ['--model', execution.model, '--config', 'model_reasoning_effort=' + JSON.stringify(execution.reasoningEffort)];
}
