import type { ContentRegistry } from "./schemas";

const ITEM_REFERENCE_SOURCE = String.raw`\{\{item:([A-Za-z0-9_-]+)(?:\|([^{}]+))?\}\}`;

const PARTICLE_PAIRS = {
  은는: ["은", "는"],
  이가: ["이", "가"],
  을를: ["을", "를"],
  과와: ["과", "와"],
  이랑랑: ["이랑", "랑"],
  아야: ["아", "야"],
  이에요예요: ["이에요", "예요"],
} as const;

type ItemTextRegistry = Pick<ContentRegistry, "items">;
type ParticleKey = keyof typeof PARTICLE_PAIRS | "으로로";

export type ItemTextReference = {
  itemId: string;
  particle?: string;
};

function normalizedParticle(value: string | undefined) {
  return value?.replaceAll("/", "").trim();
}

function finalConsonantIndex(value: string) {
  const lastCharacter = Array.from(value.trim())
    .reverse()
    .find((character) => /[가-힣A-Za-z0-9]/.test(character));
  if (!lastCharacter) {
    return 0;
  }

  const codePoint = lastCharacter.codePointAt(0) ?? 0;
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
    return (codePoint - 0xac00) % 28;
  }

  if (/\d/.test(lastCharacter)) {
    return ["0", "1", "3", "6", "7", "8"].includes(lastCharacter) ? 1 : 0;
  }

  return 0;
}

function particleFor(name: string, particle: string | undefined) {
  const normalized = normalizedParticle(particle);
  if (!normalized) {
    return "";
  }

  const finalIndex = finalConsonantIndex(name);
  if (normalized === "으로로") {
    return finalIndex === 0 || finalIndex === 8 ? "로" : "으로";
  }

  const pair = PARTICLE_PAIRS[normalized as keyof typeof PARTICLE_PAIRS];
  if (!pair) {
    return "";
  }
  return finalIndex === 0 ? pair[1] : pair[0];
}

export function itemTextReference(itemId: string, particle?: ParticleKey) {
  return `{{item:${itemId}${particle ? `|${particle}` : ""}}}`;
}

export function extractItemTextReferences(text: string): ItemTextReference[] {
  return Array.from(text.matchAll(new RegExp(ITEM_REFERENCE_SOURCE, "g")), (match) => ({
    itemId: match[1],
    particle: match[2],
  }));
}

export function resolveItemText(text: string, registry: ItemTextRegistry) {
  return text.replace(
    new RegExp(ITEM_REFERENCE_SOURCE, "g"),
    (_reference, itemId: string, particle: string | undefined) => {
      const item = registry.items[itemId] as { name?: string } | undefined;
      const name = String(item?.name ?? itemId);
      return `${name}${particleFor(name, particle)}`;
    },
  );
}

export function validateItemTextReferences(
  text: string | null | undefined,
  registry: ItemTextRegistry,
  source: string,
) {
  if (!text) {
    return;
  }

  extractItemTextReferences(text).forEach(({ itemId, particle }) => {
    if (!registry.items[itemId]) {
      throw new Error(`${source} references unknown item text '${itemId}'.`);
    }

    const normalized = normalizedParticle(particle);
    if (
      normalized &&
      normalized !== "으로로" &&
      !Object.hasOwn(PARTICLE_PAIRS, normalized)
    ) {
      throw new Error(`${source} uses unsupported item particle '${particle}'.`);
    }
  });
}
