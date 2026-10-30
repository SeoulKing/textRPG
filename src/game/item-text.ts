import type { ContentRegistry } from "./schemas";

const ITEM_REFERENCE_SOURCE = String.raw`\{\{item:([A-Za-z0-9_-]+)(?:\|([^{}]+))?\}\}`;

const KOREAN_PARTICLE_REFERENCES = [
  ["이에요", "이에요예요"],
  ["예요", "이에요예요"],
  ["으로", "으로로"],
  ["이랑", "이랑랑"],
  ["은", "은는"],
  ["는", "은는"],
  ["이", "이가"],
  ["가", "이가"],
  ["을", "을를"],
  ["를", "을를"],
  ["과", "과와"],
  ["와", "과와"],
  ["로", "으로로"],
  ["랑", "이랑랑"],
  ["아", "아야"],
  ["야", "아야"],
] as const;

const PARTICLE_PAIRS = {
  은는: ["은", "는"],
  이가: ["이", "가"],
  을를: ["을", "를"],
  과와: ["과", "와"],
  이랑랑: ["이랑", "랑"],
  아야: ["아", "야"],
  이에요예요: ["이에요", "예요"],
} as const;

export type ItemTextRegistry = Pick<ContentRegistry, "items">;
type ParticleKey = keyof typeof PARTICLE_PAIRS | "으로로";

export type ItemTextReference = {
  itemId: string;
  particle?: string;
};

function normalizedParticle(value: string | undefined) {
  return value?.replaceAll("/", "").trim();
}

function itemReferenceRegex() {
  return new RegExp(ITEM_REFERENCE_SOURCE, "g");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceItemDisplayName(
  text: string,
  itemId: string,
  displayName: string,
) {
  const name = displayName.trim();
  if (!name) {
    return text;
  }

  let canonical = text;
  const escapedName = escapeRegExp(name);
  const plainReference = itemTextReference(itemId);

  KOREAN_PARTICLE_REFERENCES.forEach(([surface, particle]) => {
    canonical = canonical.replace(
      new RegExp(
        `(?<![가-힣A-Za-z0-9])${escapedName}${surface}(?![가-힣A-Za-z0-9])`,
        "g",
      ),
      itemTextReference(itemId, particle),
    );
    canonical = canonical.replace(
      new RegExp(
        `(?<![가-힣A-Za-z0-9])${escapedName}들${surface}(?![가-힣A-Za-z0-9])`,
        "g",
      ),
      `${plainReference}들${surface}`,
    );
  });

  canonical = canonical.replace(
    new RegExp(`(?<![가-힣A-Za-z0-9])${escapedName}들`, "g"),
    `${plainReference}들`,
  );
  return canonical.replace(
    new RegExp(`(?<![가-힣A-Za-z0-9])${escapedName}`, "g"),
    plainReference,
  );
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
  return Array.from(text.matchAll(itemReferenceRegex()), (match) => ({
    itemId: match[1],
    particle: match[2],
  }));
}

export function canonicalizeItemText(
  text: string,
  registry: ItemTextRegistry,
) {
  return Object.entries(registry.items)
    .map(([itemId, item]) => ({
      itemId,
      name: String((item as { name?: string }).name ?? "").trim(),
    }))
    .filter((entry) => entry.name)
    .sort((left, right) => right.name.length - left.name.length)
    .reduce(
      (canonical, entry) =>
        // References are opaque, including ones inserted earlier in this pass.
        // A slash phrase is still being authored: only the editor's explicit
        // confirmation turns it into a reference. Preserve it across autosaves.
        canonical.split(/(\{\{item:[^{}]*\}\}|(?<![^\s(\[{"'「『“‘])\/[^\/\\\r\n{}:]*)/g)
          .map((part, index) => index % 2 ? part : replaceItemDisplayName(part, entry.itemId, entry.name))
          .join(""),
      text,
    );
}

export function resolveItemText(text: string, registry: ItemTextRegistry) {
  return text.replace(
    itemReferenceRegex(),
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

  const withoutValidReferences = text.replace(itemReferenceRegex(), "");
  if (withoutValidReferences.includes("{{item:")) {
    throw new Error(`${source} contains a malformed item text reference.`);
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
