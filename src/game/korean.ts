/** Shared deterministic Korean grammar; no world or service dependencies. */
export function particle(name: string, consonant: string, vowel: string) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const finalIndex = code >= 0 && code <= 11171 ? code % 28 : 0;
  return name + (finalIndex !== 0 && !(consonant === "으로" && finalIndex === 8) ? consonant : vowel);
}
export function quantity(amount: number, unit = "개") {
  return (["", "한", "두", "세", "네"][amount] || String(amount)) + " " + unit;
}
export function list(names: string[]) {
  if (names.length < 2) return names[0] ?? "";
  return names.slice(0, -2).map(n => n + ", ").join("") + particle(names.at(-2)!, "과", "와") + " " + names.at(-1);
}
