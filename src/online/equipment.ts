import { z } from "zod";
import assets from "../game/data/arcana-item-assets.json";
import { arcanaEquipmentItems } from "../game/data/arcana-equipment-items";
import { ArcanaWearableSlotSchema } from "../game/schemas/arcana-item";
import type { GameState } from "../game/schemas";
import { OnlineError } from "./accounts";
import type { Actor } from "./model";

type Slot = z.infer<typeof ArcanaWearableSlotSchema>;
type Loadout = Partial<Record<Slot, string>>;
const slots = ArcanaWearableSlotSchema.options;
const defaults: Loadout = { top: "travelShirt", bottom: "travelTrousers", feet: "travelBoots" };
const itemSlots: Record<string, { category: string; equipmentSlot?: string }> = assets.items;
const flag = (slot: Slot) => "arcana_equipped_" + slot;
const itemSlot = (slot: Slot) => slot === "ringLeft" || slot === "ringRight" ? "ring" : slot;

export function equipmentLoadout(state: Pick<GameState, "flags" | "inventory">): Loadout {
  const loadout: Loadout = {};
  const used = new Map<string, number>();
  for (const slot of slots) {
    const equipped = state.flags[flag(slot)];
    if (typeof equipped === "string" && Object.hasOwn(itemSlots, equipped) && itemSlots[equipped].equipmentSlot === itemSlot(slot)) {
      const count = (used.get(equipped) ?? 0) + 1;
      if (count <= (state.inventory[equipped] ?? 0)) {
        used.set(equipped, count);
        loadout[slot] = equipped;
        continue;
      }
    }
    if (defaults[slot]) loadout[slot] = defaults[slot];
  }
  return loadout;
}

export function ensureStarterEquipment(actor: Actor) {
  const { flags, inventory } = actor.game.state;
  if (flags.arcana_starter_equipment_received === true) return;
  for (const [id, item] of Object.entries(arcanaEquipmentItems)) {
    inventory[id] = Math.max(1, inventory[id] ?? 0);
    actor.game.world.itemCards[id] ??= { ...item, source: "template", generatedAt: "static" };
  }
  flags.arcana_starter_equipment_received = true;
}

export function setEquipment(actor: Actor, slot: Slot, itemId?: string) {
  const { state } = actor.game;
  if (actor.pending || state.npcDialogue.active || state.subwayExpedition.active || state.arcanaCombat.hp <= 0)
    throw new OnlineError("equipment_unavailable", "현재 행동을 마친 뒤 장비를 바꿔 주세요.");
  if (itemId === undefined) {
    delete state.flags[flag(slot)];
    return;
  }
  if (!Object.hasOwn(itemSlots, itemId) || itemSlots[itemId].equipmentSlot !== itemSlot(slot))
    throw new OnlineError("wrong_equipment_slot", "이 부위에 장착할 수 없는 아이템입니다.", 400);
  const equippedElsewhere = Object.entries(equipmentLoadout(state))
    .filter(([other, equipped]) => other !== slot && equipped === itemId).length;
  if ((state.inventory[itemId] ?? 0) <= equippedElsewhere)
    throw new OnlineError("equipment_not_owned", "장착할 수 있는 여분의 아이템이 없습니다.");
  state.flags[flag(slot)] = itemId;
}
