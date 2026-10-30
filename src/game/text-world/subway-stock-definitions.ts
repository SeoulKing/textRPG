import type { ContentStudioDocument } from "../content-studio";
import type { ContentRegistry, GameAction } from "../schemas";
import type { TextRoom } from "../schemas/text-world";

const nodeId = "subway_signal_box";
function signalBox(): TextRoom["entities"][number] {
  return { id: nodeId, name: "역무실 신호함", description: "벽면에 신호함이 고정되어 있다.",
    details: { anchor: "entrance-wall", placement: "역무실 입구 곁의 벽면", outline: "벽면 신호함", surface: "벽면에 신호함이 고정되어 있다.", posture: "standing" },
    components: { position: { zone: "office" }, stockNode: { nodeId }, container: { items: [] }, openable: { isOpen: false, locked: false } } };
}
/** Reuse the authored stock ledger; custom bindings and ID collisions are never overwritten. */
export function withSubwayStockRooms<T extends Pick<ContentRegistry, "textRooms" | "locations">>(registry: T): T {
  if (!registry.locations.subway?.stockNodes.some(n => n.id === nodeId) || !registry.textRooms?.some(r => r.id === "office" && r.locationId === "subway")) return registry;
  if (registry.textRooms.some(r => r.entities.some(e => e.components.stockNode?.nodeId === nodeId || e.id === nodeId))) return registry;
  return { ...registry, textRooms: registry.textRooms.map(r => r.id === "office" && r.locationId === "subway" ? { ...r, entities: [...r.entities, signalBox()] } : r) };
}
export function withSubwayStockDocumentDefaults(document: ContentStudioDocument): ContentStudioDocument {
  const registry = withSubwayStockRooms({ textRooms: document.textRooms, locations: Object.fromEntries(document.locations.map(l => [l.id, l])) });
  return { ...document, textRooms: registry.textRooms };
}
export function hasSubwayStockBinding(registry: ContentRegistry) {
  return Boolean(registry.textRooms?.some(r => r.locationId === "subway" && r.entities.some(e => e.components.stockNode?.nodeId === nodeId)));
}
export function isSubwayStockMenuAction(action: GameAction, registry: ContentRegistry) {
  if (!hasSubwayStockBinding(registry)) return false;
  const definition = action.type === "content_action" ? registry.actions[action.actionId] : action.type === "content_choice" ? registry.choices[action.choiceId] : undefined;
  return Boolean(definition?.effects.some(e => "nodeId" in e && e.nodeId === nodeId));
}
