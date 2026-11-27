import { skillMastery } from "../game/arcana-skill-training";
import type { GameState } from "../game/schemas";
import type { Actor } from "./model";
import { marketSellerProgress, type PlazaMarket } from "./plaza-market";

export const LIVELIHOOD_FOCI = ["none", "fishing", "cooking", "merchant", "crafting"] as const;
export type LivelihoodFocus = typeof LIVELIHOOD_FOCI[number];

const focusFlag = "arcana_livelihood_focus";

export function livelihoodFocus(state: GameState): LivelihoodFocus {
  const saved = state.flags[focusFlag];
  return LIVELIHOOD_FOCI.find(focus => focus === saved) ?? "none";
}

export function chooseLivelihood(state: GameState, focus: LivelihoodFocus) {
  if (focus === livelihoodFocus(state)) return false;
  if (focus === "none") delete state.flags[focusFlag];
  else state.flags[focusFlag] = focus;
  return true;
}

export function livelihoodView(actor: Actor, market: PlazaMarket | undefined) {
  const { state } = actor.game;
  const characterId = actor.character.id;
  return {
    focus: livelihoodFocus(state),
    fishing: {
      mastery: skillMastery(state, "fishing"),
      fishOwned: state.inventory.riverFish ?? 0,
    },
    cooking: {
      mastery: skillMastery(state, "cooking"),
      cookedMeals: state.arcanaLife?.cookedMeals ?? 0,
    },
    crafting: {
      mastery: skillMastery(state, "crafting"),
      craftedItems: state.arcanaLife?.craftedItems ?? 0,
    },
    merchant: {
      ...marketSellerProgress(market, characterId),
      listed: market?.listings.filter(listing => listing.sellerId === characterId).length ?? 0,
      proceeds: market?.proceeds[characterId] ?? 0,
    },
  };
}
