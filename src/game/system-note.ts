import type { GameState, SystemNoteEntry } from "./schemas";

function signedAmount(amount: number) {
  return `${amount > 0 ? "+" : "-"}${Math.abs(amount)}`;
}

function elapsedTimeText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}분`);
  return `+${parts.join(" ")}`;
}

export function formatSystemNoteEntry(entry: SystemNoteEntry) {
  if (entry.type === "text") return entry.text;
  if (entry.type === "damage") return `${entry.target}: ${entry.amount}피해`;
  if (entry.type === "time") return elapsedTimeText(entry.minutes);
  if (entry.subject === "money") {
    return `${signedAmount(entry.amount)}${entry.label}`;
  }
  if (entry.subject === "durability") {
    return `${entry.label} 내구도 ${signedAmount(entry.amount)}`;
  }
  return `${signedAmount(entry.amount)} ${entry.label}`;
}

export function formatSystemNote(entries: SystemNoteEntry[]) {
  return entries.map(formatSystemNoteEntry).join(" / ");
}

export function setSystemNote(
  state: GameState,
  entries: SystemNoteEntry[],
) {
  state.systemNoteEntries = structuredClone(entries);
  state.systemNote = formatSystemNote(entries);
}

export function clearSystemNote(state: GameState) {
  state.systemNoteEntries = [];
  state.systemNote = "";
}
