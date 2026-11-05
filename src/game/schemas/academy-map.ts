import { z } from "zod";

export const AcademyMapSchema = z.object({
  currentRoomId: z.string(), blockedReason: z.string(),
  rooms: z.array(z.object({
    id: z.string(), name: z.string(), summary: z.string(), q: z.number().int(), r: z.number().int(),
    icon: z.enum(["gate", "arch", "desk", "classroom", "crystal", "books", "telescope", "garden"]),
    neighbors: z.array(z.string()), isCurrent: z.boolean(), lockedReason: z.string(),
    route: z.array(z.string()), minutes: z.number().int().nonnegative(),
    action: z.object({ type: z.literal("academy_move"), roomId: z.string() }).nullable(),
  })),
});
export type AcademyMap = z.infer<typeof AcademyMapSchema>;
