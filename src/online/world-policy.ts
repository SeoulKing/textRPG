import { developmentAccess } from "./accounts";
/** Admission control is independent of the world's identity, persistence and membership. */
export function developmentConnectionLimit(developing = developmentAccess(), configured = process.env.ARCANA_DEV_CONNECTION_LIMIT): number | null {
  if (!developing) return null;
  if (configured === undefined || configured === "") return 4;
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("ARCANA_DEV_CONNECTION_LIMIT must be a positive safe integer");
  return limit;
}
