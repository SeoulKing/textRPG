import { worldRegistry } from "./data/registry";
import type { DynamicWorldRegistry } from "./schemas";

const LOCATION_NAME_QUALIFIERS = [
  "동쪽",
  "서쪽",
  "남쪽",
  "북쪽",
  "안쪽",
  "바깥쪽",
  "뒤편",
  "골목 건너",
  "북동쪽",
  "북서쪽",
  "남동쪽",
  "남서쪽",
];

export function extractDynamicSequence(id: string) {
  const matched = id.match(/^dyn_[a-z]+_(\d+)_/);
  if (!matched) {
    return null;
  }

  return Number.parseInt(matched[1] ?? "", 10) || null;
}

function orderedQualifiers(preferredSequence?: number | null) {
  if (!preferredSequence) {
    return LOCATION_NAME_QUALIFIERS;
  }

  const offset = (preferredSequence - 1) % LOCATION_NAME_QUALIFIERS.length;
  return LOCATION_NAME_QUALIFIERS.map((_, index) => LOCATION_NAME_QUALIFIERS[(offset + index) % LOCATION_NAME_QUALIFIERS.length]);
}

export function createUniqueDynamicLocationName(
  baseName: string,
  usedNames: Iterable<string>,
  preferredSequence?: number | null,
) {
  const trimmedBaseName = baseName.trim();
  const used = new Set(Array.from(usedNames).map((name) => name.trim()).filter(Boolean));
  if (!used.has(trimmedBaseName)) {
    return trimmedBaseName;
  }

  for (const qualifier of orderedQualifiers(preferredSequence)) {
    const candidate = `${qualifier} ${trimmedBaseName}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  let index = 2;
  while (used.has(`${trimmedBaseName} ${index}구역`)) {
    index += 1;
  }
  return `${trimmedBaseName} ${index}구역`;
}

export function normalizeDynamicLocationNames(
  dynamicContent: DynamicWorldRegistry,
  reservedNames: Iterable<string> = Object.values(worldRegistry.locations).map((location) => location.name),
) {
  const normalized: DynamicWorldRegistry = structuredClone(dynamicContent);
  const usedNames = new Set(Array.from(reservedNames).filter(Boolean));
  const locations = Object.values(normalized.locations).sort((left, right) => {
    const leftSeq = extractDynamicSequence(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightSeq = extractDynamicSequence(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftSeq - rightSeq;
  });

  for (const location of locations) {
    const uniqueName = createUniqueDynamicLocationName(location.name, usedNames, extractDynamicSequence(location.id));
    location.name = uniqueName;
    usedNames.add(uniqueName);
  }

  return normalized;
}
