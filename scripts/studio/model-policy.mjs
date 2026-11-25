const FALLBACK = { profile: 'standard', model: 'gpt-6.1-terra', reasoningEffort: 'medium', reason: '모델 정책이 없는 이전 원장의 호환 기본값입니다.' };
const MODELS = new Set(['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6.2-astra']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'ultra']);
const modelId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const effortId = (value) => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
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
  if (policy.departmentDefaults !== undefined) {
    if (!policy.departmentDefaults || typeof policy.departmentDefaults !== 'object' || Array.isArray(policy.departmentDefaults)) {
      throw new Error('부서별 기본 모델 설정을 확인해 주세요.');
    }
    for (const [role, entry] of Object.entries(policy.departmentDefaults)) {
      if (!organizations.includes(role) || !entry || !modelId(entry.model) || !effortId(entry.reasoningEffort)) {
        throw new Error('부서별 기본 모델과 추론 강도를 확인해 주세요: ' + role);
      }
    }
  }
  for (const organization of organizations) {
    if (!Object.hasOwn(policy.profiles, policy.organizations[organization])) throw new Error('조직의 기본 모델 프로필이 없습니다: ' + organization);
  }
  for (const organization of Object.keys(policy.organizations)) {
    if (!organizations.includes(organization)) throw new Error('알 수 없는 모델 정책 조직입니다: ' + organization);
  }
}

export function resolveExecution(board, task = null, phase = 'producer', { models, goalId = task?.goalId } = {}) {
  if (!['producer', 'reviewer', 'director'].includes(phase)) throw new Error('모델 선택 단계가 올바르지 않습니다.');
  const role = phase === 'director' ? 'director' : phase === 'reviewer' ? 'quality' : task?.organization;
  if (!role) throw new Error('모델을 선택할 담당 조직이 필요합니다.');
  const goal = board.goals?.find((item) => item.id === goalId);
  if (goal?.studioWorkflow === 'autonomous-v1') {
    const visualReview = goal.visualContract && (phase === 'reviewer' && task?.visualStage || phase === 'producer' && task?.visualStage === 'visual_review');
    const direction = phase === 'director' || phase === 'producer' && role === 'director';
    const modeling = phase === 'producer' && task?.productionMethod === 'blender';
    if (visualReview || direction || modeling) {
      const model = modeling ? 'gpt-6.1-terra' : 'gpt-6.2-astra';
      const reasoningEffort = modeling ? 'ultra' : visualReview ? 'xhigh' : 'high';
      const profile = modeling ? 'blender-modeling' : visualReview ? 'visual-review' : 'studio-direction';
      const selection = { role, profile, model, reasoningEffort, reason: modeling ? 'Blender 모델링 배정입니다.' : visualReview ? '실제 이미지 독립 시각 검토입니다.' : '총괄 방향 결정 및 최종 인수 배정입니다.' };
      const needsVision = Boolean(goal.visualContract && !modeling);
      if (!models?.length) return selection;
      const options = models.filter((item) => !item.hidden && (needsVision ? item.inputModalities?.includes('image') : (item.inputModalities ?? ['text']).includes('text')));
      const supports = (item, effort) => item.supportedReasoningEfforts?.some((entry) => (entry.reasoningEffort ?? entry.effort) === effort);
      if (options.some((item) => (item.model ?? item.id) === model && supports(item, reasoningEffort))) return selection;
      if (modeling) throw new Error('현재 계정에서 Blender 모델링 배정인 Terra Ultra를 지원하지 않습니다.');
      const defaultId = board.settings.modelPolicy?.departmentDefaults?.[role]?.model;
      const policy = board.settings.modelPolicy;
      const organizationId = policy?.profiles?.[policy.organizations?.[role]]?.model;
      const preferred = [defaultId, organizationId, model, 'gpt-6.1-terra', 'gpt-6.1-sol'].filter(Boolean);
      const byPreference = (item) => { const index = preferred.indexOf(item.model ?? item.id); return index === -1 ? preferred.length : index; };
      options.sort((a, b) => byPreference(a) - byPreference(b));
      for (const effort of [...new Set([reasoningEffort, 'high', 'medium', 'low'])]) {
        const fallback = options.find((item) => supports(item, effort));
        if (fallback) return { ...selection, model: fallback.model ?? fallback.id, reasoningEffort: effort, reason: '계정 목록에서 ' + (needsVision ? '이미지' : '텍스트') + ' 입력과 추론 강도를 확인한 대체 배정입니다.' };
      }
      throw new Error('현재 계정에서 필요한 입력과 추론 강도를 지원하는 총괄·검토 모델이 없습니다.');
    }
  }
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
  const departmentDefault = policy.departmentDefaults?.[role];
  if (override === undefined && inherited === undefined && departmentDefault) {
    return { role, profile: 'department-default', ...departmentDefault, reason: '사용자가 설정한 담당 부서의 기본 배정입니다.' };
  }
  const name = override ?? inherited ?? policy.organizations[role];
  if (!Object.hasOwn(policy.profiles, name)) throw new Error('정의되지 않은 모델 프로필입니다: ' + name);
  if (inherited && override === undefined) reason = task.modelReason;
  return { role, profile: name, ...policy.profiles[name], reason: reason ?? '담당 조직의 기본 배정입니다.' };
}

export function codexModelArgs(execution) {
  return ['--model', execution.model, '--config', 'model_reasoning_effort=' + JSON.stringify(execution.reasoningEffort)];
}

// Picker choices come from the authenticated app-server, never a guessed model list.
export function modelCatalog(models = []) {
  return models.filter((item) => !item.hidden).flatMap((item) => {
    const model = item.model ?? item.id;
    const reasoningEfforts = [...new Set((item.supportedReasoningEfforts ?? [])
      .map((entry) => entry.reasoningEffort ?? entry.effort).filter(effortId))];
    if (!modelId(model) || !reasoningEfforts.length) return [];
    return [{ model, displayName: item.displayName || model, reasoningEfforts,
      defaultReasoningEffort: reasoningEfforts.includes(item.defaultReasoningEffort) ? item.defaultReasoningEffort : reasoningEfforts[0] }];
  });
}

export function setDepartmentDefault(board, role, selection, organizations) {
  if (!organizations.includes(role) || !selection || !modelId(selection.model) || !effortId(selection.reasoningEffort)) {
    throw new Error('부서와 모델 설정을 확인해 주세요.');
  }
  board.settings.modelPolicy ??= {
    profiles: { standard: { model: FALLBACK.model, reasoningEffort: FALLBACK.reasoningEffort } },
    organizations: Object.fromEntries(organizations.map((id) => [id, 'standard'])),
  };
  board.settings.modelPolicy.departmentDefaults ??= {};
  board.settings.modelPolicy.departmentDefaults[role] = { model: selection.model, reasoningEffort: selection.reasoningEffort };
  validateModelPolicy(board.settings, organizations);
}
