/* Pure editing operations, shared by the browser and node regression tests. */
const StudioWriterTools = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);

  function history(document, selection, limit = 60) {
    let entries = [{ json: JSON.stringify(document), selection: copy(selection) }], cursor = 0, lastGroup, lastTime = 0;
    return {
      get canUndo() { return cursor > 0; },
      get canRedo() { return cursor < entries.length - 1; },
      visit(selection) { entries[cursor].selection = copy(selection); },
      record(document, selection, group, now = Date.now()) {
        const json = JSON.stringify(document);
        if (json === entries[cursor].json) return false;
        const merge = group && group === lastGroup && now - lastTime < 900 && cursor > 0 && cursor === entries.length - 1;
        entries = entries.slice(0, cursor + 1);
        if (merge) entries[cursor] = { json, selection: copy(selection) };
        else { entries.push({ json, selection: copy(selection) }); cursor++; }
        while (entries.length > 2 && (entries.length > limit || entries.reduce((n, e) => n + e.json.length * 2, 0) > 24 * 1024 * 1024)) { entries.shift(); cursor--; }
        lastGroup = group; lastTime = now;
        return true;
      },
      move(direction) {
        const next = cursor + direction;
        if (next < 0 || next >= entries.length) return null;
        cursor = next; lastGroup = undefined;
        return { document: JSON.parse(entries[cursor].json), selection: copy(entries[cursor].selection) };
      },
    };
  }
  function move(array, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= array.length) return false;
    array.splice(next, 0, array.splice(index, 1)[0]); return true;
  }
  function duplicateChoice(choice, id) {
    if (!id || id === choice.id) throw new Error('복제한 선택지에는 새 ID가 필요합니다.');
    return { ...copy(choice), id };
  }
  function hasAdvancedRoute(choice) {
    const walk = effects => (effects ?? []).some(e => ['set_scene', 'set_random_scene', 'travel', 'focus_stock_node', 'clear_stock_focus'].includes(e.type)
      || (e.type === 'random_outcome' && e.outcomes.some(o => walk(o.effects))));
    return walk(choice.effects) || walk(choice.failureEffects) || Boolean(choice.endsStory && (choice.nextSceneId || choice.nextStoryId || choice.nextEventId));
  }
  function destination(choice) {
    if (hasAdvancedRoute(choice)) return 'advanced';
    return choice.nextSceneId ? 'scene' : choice.nextStoryId || choice.nextEventId ? 'story' : choice.endsStory ? 'end' : '';
  }
  function connect(choice, mode, id) {
    if (hasAdvancedRoute(choice)) throw new Error('고급 실행 결과의 이동 규칙을 상세 설정에서 먼저 확인해 주세요.');
    if (!['scene', 'story', 'end'].includes(mode) || (mode !== 'end' && !id)) throw new Error('연결할 대상을 선택해 주세요.');
    delete choice.nextSceneId; delete choice.nextStoryId; delete choice.nextEventId; delete choice.endsStory;
    if (mode === 'scene') choice.nextSceneId = id;
    if (mode === 'story') choice.nextStoryId = id;
    if (mode === 'end') choice.endsStory = true;
  }
  function sharedScenes(document, id) {
    return document.stories.flatMap(story => story.scenes.filter(scene => scene.choices.some(choice => choice.id === id)).map(scene => ({ storyId: story.id, sceneId: scene.id, title: `${story.title} / ${scene.title}` })));
  }
  function changes(before, after) {
    const result = [];
    const compare = (kind, oldRows, newRows) => {
      const left = new Map(oldRows.map(row => [row.id, row])), right = new Map(newRows.map(row => [row.id, row]));
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const old = left.get(id), next = right.get(id);
        if (stable(old) === stable(next)) continue;
        result.push({ kind, id, name: (next ?? old).title ?? (next ?? old).name ?? (next ?? old).label ?? id,
          type: !old ? '추가' : !next ? '삭제' : '수정', before: old, after: next });
      }
    };
    for (const [key, label] of [['stories','이야기'],['locations','지역'],['people','인물'],['items','아이템'],['recipes','레시피']]) compare(label, before[key] ?? [], after[key] ?? []);
    const choices = doc => [...doc.stories.flatMap(s => [...s.scenes.flatMap(sc => sc.choices), ...(s.actions ?? [])]), ...(doc.recipes ?? []), ...(doc.locations ?? []).flatMap(l => l.interactionChoices ?? [])];
    compare('선택지', choices(before), choices(after));
    if (stable(before.layout) !== stable(after.layout)) result.push({ kind:'배치', id:'layout', name:'전체 흐름도 배치', type:'수정', before:before.layout, after:after.layout });
    return result;
  }
  return { history, move, duplicateChoice, hasAdvancedRoute, destination, connect, sharedScenes, changes };
})();
if (typeof module !== 'undefined') module.exports = StudioWriterTools;
