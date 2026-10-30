import type { ActionDefinition, ContentRegistry, GameState } from "../schemas";
import type { TextWorld } from "../schemas/text-world";
import { performAction } from "../rules";
import { resolveItemText } from "../item-text";
import { recordEvent } from "./engine";

/** The native rules execute once. Capture the selected branch, never the action's possible outcomes. */
export function performPointAction(state: GameState, registry: ContentRegistry, world: TextWorld, action: ActionDefinition, entityId: string) {
  const before = structuredClone(state), start = world.elapsedSeconds;
  const logs: string[] = [], scenes: string[] = [];
  performAction(state, { type: "content_action", actionId: action.id }, { onNarrative: result => {
    if (result.type === "text") logs.push(result.text);
    else scenes.push(result.sceneId);
  } });
  const scene = scenes.length ? registry.scenes[scenes.at(-1)!] : undefined;
  const paragraphs = (scene?.paragraphs ?? logs).map(p => resolveItemText(p, registry).replace(/당신은\s*/g, "").replace(/당신의\s*/g, ""));
  const rewards = Object.entries(state.inventory).filter(([id, amount]) => amount > (before.inventory[id] ?? 0)).map(([itemId, quantity]) => {
    const amount = quantity - (before.inventory[itemId] ?? 0), name = String((registry.items[itemId] as { name?: string } | undefined)?.name ?? itemId);
    const id = "received:" + before.location + ":" + world.revision + ":" + itemId;
    world.entities[id] = { id, name, description: name, inventoryRegistered: true, components: { position: { zone: "player" }, portable: { itemId, amount } } };
    world.observations[id] = { stages: ["outline", "surface"], collected: true };
    return { itemId, name, amount };
  });
  recordEvent(world, { type: "SERVICE", targetId: entityId, before: { actionId: action.id }, after: {
    label: resolveItemText(action.label, registry), paragraphs, rewards, sceneId: scene?.id,
    elapsedSeconds: world.elapsedSeconds - start, interrupted: state.isGameOver || state.stageClear,
    moneyDelta: state.money - before.money,
    stats: Object.fromEntries(Object.entries(state.stats).map(([key, value]) => [key, value - before.stats[key as keyof typeof before.stats]])),
  } });
  if (state.isGameOver || state.stageClear) recordEvent(world, { type: "STOPPED", attemptedAction: "SERVICE", reason: state.gameOverReason || "더는 행동을 이어갈 수 없다.", before: {}, after: {} });
  if (state.location !== before.location) world.active = false;
}
