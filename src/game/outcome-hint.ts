import { itemTextReference } from "./item-text";
import { CONDITION_LABELS } from "./health-conditions";
import type { Effect, GameState, SkillUse } from "./schemas";
import { getStockMoney, getStockQuantity } from "./state-utils";
import { resolveSkillAdjustedMinutes } from "./skill-progression";

const STAT_LABELS = {
  hp: "체력",
  mind: "정신력",
  energy: "기력",
} as const;

type HintTotals = {
  money: number;
  stats: Record<keyof typeof STAT_LABELS, number>;
  items: Map<string, number>;
  durabilityDamage: Map<string, number>;
  durabilitySet: Map<string, number>;
  minutes: number;
  advancesToDaybreak: boolean;
};

function emptyHintTotals(): HintTotals {
  return {
    money: 0,
    stats: { hp: 0, mind: 0, energy: 0 },
    items: new Map(),
    durabilityDamage: new Map(),
    durabilitySet: new Map(),
    minutes: 0,
    advancesToDaybreak: false,
  };
}

function addToMap(values: Map<string, number>, key: string, amount: number) {
  values.set(key, (values.get(key) ?? 0) + amount);
}

function collectDeterministicEffect(
  totals: HintTotals,
  effect: Exclude<Effect, { type: "random_outcome" }>,
  state: GameState,
  skillUse?: SkillUse,
) {
  switch (effect.type) {
    case "change_money":
      totals.money += effect.amount;
      break;
    case "change_stat":
      totals.stats[effect.stat] += effect.value;
      break;
    case "add_item":
      addToMap(totals.items, effect.itemId, effect.amount);
      break;
    case "remove_item":
      addToMap(totals.items, effect.itemId, -effect.amount);
      break;
    case "damage_tool":
      addToMap(totals.durabilityDamage, effect.itemId, effect.amount);
      break;
    case "set_tool_durability":
      totals.durabilitySet.set(
        effect.itemId,
        effect.value - (state.toolDurability[effect.itemId] ?? 0),
      );
      break;
    case "collect_stock_item": {
      const remaining = getStockQuantity(
        state,
        effect.locationId,
        effect.nodeId,
        effect.itemId,
      );
      addToMap(totals.items, effect.itemId, Math.min(effect.amount, remaining));
      break;
    }
    case "collect_stock_item_all":
      addToMap(
        totals.items,
        effect.itemId,
        getStockQuantity(state, effect.locationId, effect.nodeId, effect.itemId),
      );
      break;
    case "collect_stock_money": {
      const remaining = getStockMoney(state, effect.locationId, effect.nodeId);
      totals.money += Math.min(effect.amount, remaining);
      break;
    }
    case "collect_stock_money_all":
      totals.money += getStockMoney(state, effect.locationId, effect.nodeId);
      break;
    case "advance_time":
      totals.minutes += resolveSkillAdjustedMinutes(
        effect.minutes,
        skillUse,
        state.skillProgress,
      );
      break;
    case "advance_to_daybreak":
      totals.advancesToDaybreak = true;
      break;
    default:
      break;
  }
}

function collectDeterministicEffects(
  effects: Array<Exclude<Effect, { type: "random_outcome" }>>,
  state: GameState,
  skillUse?: SkillUse,
) {
  const totals = emptyHintTotals();
  effects.forEach((effect) => collectDeterministicEffect(totals, effect, state, skillUse));
  return totals;
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function moneyToken(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-US")}원`;
}

function hintTokens(totals: HintTotals, includeTime = true) {
  const tokens: string[] = [];
  if (totals.money !== 0) {
    tokens.push(moneyToken(totals.money));
  }
  (Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).forEach((stat) => {
    const value = totals.stats[stat];
    if (value !== 0) {
      tokens.push(`${signedNumber(value)} ${STAT_LABELS[stat]}`);
    }
  });
  totals.items.forEach((amount, itemId) => {
    if (amount !== 0) {
      tokens.push(`${signedNumber(amount)} ${itemTextReference(itemId)}`);
    }
  });
  totals.durabilityDamage.forEach((amount, itemId) => {
    if (amount > 0) {
      tokens.push(`-${amount} ${itemTextReference(itemId)} 내구도`);
    }
  });
  totals.durabilitySet.forEach((change, itemId) => {
    if (change !== 0) {
      tokens.push(`${signedNumber(change)} ${itemTextReference(itemId)} 내구도`);
    }
  });
  if (includeTime) {
    if (totals.minutes > 0) {
      tokens.push(`+${totals.minutes}분`);
    }
    if (totals.advancesToDaybreak) {
      tokens.push("다음 날 06:00");
    }
  }
  return tokens;
}

function randomOutcomeToken(
  outcomes: Extract<Effect, { type: "random_outcome" }>["outcomes"],
  state: GameState,
  skillUse?: SkillUse,
) {
  const possibleTokens = Array.from(new Set(
    outcomes
      .map((outcome) =>
        hintTokens(collectDeterministicEffects(outcome.effects, state, skillUse), false)
          .join("·"),
      )
      .filter(Boolean),
  ));
  if (possibleTokens.length === 0) {
    return "";
  }
  return `${possibleTokens.join(" 또는 ")}${possibleTokens.length > 1 ? " 중 하나" : ""}`;
}

export function formatOutcomeHint(
  effects: Effect[],
  state: GameState,
  skillUse?: SkillUse,
) {
  const deterministicEffects = effects.filter(
    (effect): effect is Exclude<Effect, { type: "random_outcome" }> =>
      effect.type !== "random_outcome",
  );
  const totals = collectDeterministicEffects(deterministicEffects, state, skillUse);
  const tokens = hintTokens(totals, false);
  for (const effect of effects) {
    if (effect.type === "add_condition" && effect.chancePercent > 0) {
      tokens.push(`${CONDITION_LABELS[effect.condition]} +1단계 ${effect.chancePercent}%`);
    }
    if (effect.type === "random_outcome") {
      for (const outcome of effect.outcomes.filter(row => row.weight > 0)) {
        for (const risk of outcome.effects) {
          if (risk.type !== "add_condition" || risk.chancePercent <= 0) continue;
          const branch = outcome.result === "failure" ? "실패" : outcome.result === "success" ? "성공" : outcome.label || "해당 결과";
          tokens.push(`${branch} 시 ${CONDITION_LABELS[risk.condition]} +1단계 ${risk.chancePercent}%`);
        }
      }
    }
  }
  effects.forEach((effect) => {
    if (effect.type !== "random_outcome") {
      return;
    }
    const randomToken = randomOutcomeToken(effect.outcomes, state, skillUse);
    if (randomToken) {
      tokens.push(randomToken);
    }
  });
  if (totals.minutes > 0) {
    tokens.push(`+${totals.minutes}분`);
  }
  if (totals.advancesToDaybreak) {
    tokens.push("다음 날 06:00");
  }
  return tokens.join(" / ");
}
