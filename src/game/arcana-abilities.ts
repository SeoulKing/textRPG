import { z } from "zod";

const abilityScore = z.number().int().positive();
const startingAbilityScore = abilityScore.default(10);

export const ArcanaAbilitiesSchema = z.object({
  strength: startingAbilityScore,
  dexterity: startingAbilityScore,
  constitution: startingAbilityScore,
  intelligence: startingAbilityScore,
  wisdom: startingAbilityScore,
  charisma: startingAbilityScore,
});

const ArcanaAbilityIdSchema = ArcanaAbilitiesSchema.keyof();
type ArcanaAbilities = z.infer<typeof ArcanaAbilitiesSchema>;

const abilityNames: Record<keyof ArcanaAbilities, string> = {
  strength: "근력",
  dexterity: "민첩",
  constitution: "건강",
  intelligence: "지능",
  wisdom: "지혜",
  charisma: "매력",
};

export const ArcanaAbilitySummarySchema = z.object({
  id: ArcanaAbilityIdSchema,
  name: z.string(),
  score: abilityScore,
  modifier: z.number().int(),
});

export function initializeArcanaAbilities(state: { arcanaAbilities?: ArcanaAbilities }) {
  return state.arcanaAbilities ??= ArcanaAbilitiesSchema.parse({});
}

export function arcanaAbilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function buildArcanaAbilities(scores: ArcanaAbilities) {
  return ArcanaAbilityIdSchema.options.map(id => ({
    id,
    name: abilityNames[id],
    score: scores[id],
    modifier: arcanaAbilityModifier(scores[id]),
  }));
}
