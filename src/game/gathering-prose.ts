// Correct only the shipped manual-gathering prose. Custom writing is left as authored.
const corrections = new Map([
  ["당신은 마른 나무와 부서진 가지를 골라 칼날을 세운다. 젖지 않은 부분만 따로 떼어 내자, 손에 들 만한 판자들이 묵직하게 모인다.", "쓰러진 나무 옆에서 마른 가지를 골라낸다. 부러진 끝을 잡고 젖은 부분을 떼어 내자, 품에 안을 만한 목재가 하나씩 모인다."],
  ["넘어진 가로수의 마른 부분을 찾아내자, 톱니처럼 갈라진 나무껍질이 손끝에 걸린다. 당신은 쓸 만한 부분만 잘라 한쪽에 차곡차곡 쌓는다.", "넘어진 가로수의 마른 부분을 찾아내자, 톱니처럼 갈라진 나무껍질이 손끝에 걸린다. 이미 부러진 가지 중 단단한 것만 골라 한쪽에 차곡차곡 쌓는다."],
  ["당신은 무너진 울타리 너머로 들어가 아직 단단한 목재만 골라낸다. 갈라진 끝을 다듬고 끈으로 묶자, 제법 쓸 만한 자재가 품에 안긴다.", "무너진 울타리 너머에서 떨어진 나뭇가지를 골라낸다. 무른 조각을 빼고 단단한 것끼리 모으자, 쓸 만한 목재가 품에 안긴다."],
]);
export function correctGatheringScene<T extends { id: string; paragraphs?: string[]; blocks?: { text: string }[] }>(scene: T): T {
  if (!["forest_chop_result_1", "forest_chop_result_2", "forest_chop_result_3"].includes(scene.id)) return scene;
  if (!scene.paragraphs?.some(text => corrections.has(text)) && !scene.blocks?.some(block => corrections.has(block.text))) return scene;
  return { ...scene, paragraphs: scene.paragraphs?.map(text => corrections.get(text) ?? text), ...(scene.blocks ? { blocks: scene.blocks.map(block => ({ ...block, text: corrections.get(block.text) ?? block.text })) } : {}) };
}
