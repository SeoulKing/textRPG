import { particle } from "../korean";
import type { Choice, Command, Observation, World } from "./model";
import { matchingKey, manipulationSeconds } from "./actions";
import { reachable } from "./world";

/** Both the catalogue and its first page use only this finalized observation and command contract. */
export function choices(world: World, observation: Observation): Choice[] {
  const result: Choice[] = [];
  const costs = reachable(world);
  const add = (label: string, command: Command, seconds: number) => result.push({
    id: command.type + ("targetId" in command ? ":" + command.targetId : ""), label, command, seconds, revision: world.revision,
  });
  const objects = observation.facts.filter(f => f.kind === "object").sort((a, b) => Number(b.near) - Number(a.near) || a.targetId.localeCompare(b.targetId));
  for (const fact of objects) {
    if (!fact.near) continue;
    if (fact.portable) add(particle(fact.name, "을", "를") + " 챙긴다", { type: "take", targetId: fact.targetId }, manipulationSeconds.take);
    if (fact.openable) {
      if (fact.open) add(particle(fact.name, "을", "를") + " 닫는다", { type: "close", targetId: fact.targetId }, manipulationSeconds.close);
      else {
        add(particle(fact.name, "을", "를") + " 연다", { type: "open", targetId: fact.targetId }, manipulationSeconds.open);
        if (world.memory.get("lock:" + fact.targetId)?.fact.locked && matchingKey(world, fact.targetId)) add(fact.name + "의 잠금을 푼다", { type: "unlock", targetId: fact.targetId }, manipulationSeconds.unlock);
      }
    }
  }
  for (const fact of objects) if (!fact.near && costs.has(fact.nodeId!)) add(particle(fact.name, "으로", "로") + " 간다", { type: "approach", targetId: fact.targetId }, costs.get(fact.nodeId!)!);
  for (const fact of observation.facts) if (fact.kind === "exit" && costs.has(fact.nodeId!)) add(particle(fact.name, "으로", "로") + " 간다", { type: "move", targetId: fact.targetId }, costs.get(fact.nodeId!)!);
  add(observation.focusId ? "지금 대상을 다시 확인한다" : "주변을 둘러본다", { type: "look" }, 0);
  if (observation.focusId) add("관심을 거두고 주변을 둘러본다", { type: "defocus" }, 0);
  return result;
}
export function choicePage(catalogue: Choice[], page = 0) {
  const pageCount = Math.max(1, Math.ceil(catalogue.length / 4));
  const current = Math.max(0, Math.min(pageCount - 1, Math.trunc(page)));
  return { choices: catalogue.slice(current * 4, current * 4 + 4), page: current, pageCount };
}
