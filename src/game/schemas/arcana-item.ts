import { z } from "zod";
import { ItemCardSchema } from "./item";
export const ArcanaItemCategorySchema=z.enum(["life_tool","ingredient","food","material","placeable","potion","tool"]);
export const ArcanaThumbnailSchema=z.object({
  status:z.enum(["ready","atlas","missing"]),
  path:z.string().regex(/^res:\/\/art\/export\/[a-zA-Z0-9_/-]+\.png$/).optional(),
  region:z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative(),z.number().int().positive(),z.number().int().positive()]).optional(),
  source:z.string().optional(),
}).superRefine((value,ctx)=>{
  if(value.status!=="missing" && !value.path)ctx.addIssue({code:"custom",message:"Registered thumbnail requires a resource path"});
  if(value.status==="atlas" && !value.region)ctx.addIssue({code:"custom",message:"Atlas thumbnail requires a region"});
});
export const ArcanaItemMasterSchema=z.object({
  id:z.string(),realm:z.literal("arcana"),definition:ItemCardSchema,category:ArcanaItemCategorySchema,
  equipmentSlot:z.literal("lifeTool").optional(),thumbnail:ArcanaThumbnailSchema,
  lifeEffects:z.object({hungerRestore:z.number().nonnegative().optional(),manaRestore:z.number().nonnegative().optional(),durationMinutes:z.number().positive().optional(),cookSeconds:z.number().positive().optional(),quality:z.string().optional()}).optional(),
  trade:z.object({buy:z.number().nonnegative(),sell:z.number().nonnegative(),currency:z.literal("gold")}).optional(),
}).refine(item=>item.id===item.definition.id,{message:"Item ID and definition ID must match"});
export type ArcanaItemMaster=z.infer<typeof ArcanaItemMasterSchema>;
