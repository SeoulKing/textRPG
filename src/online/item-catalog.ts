import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import assets from "../game/data/arcana-item-assets.json";
import { baseItems } from "../game/data/items";
import { ItemCardSchema } from "../game/schemas";
import { ARCANA_SHOP_GOODS } from "../game/arcana-shop";
import { CAMPFIRES, FOODS } from "./life";
import { OnlineStore } from "./store";

import { ArcanaItemMasterSchema, ArcanaThumbnailSchema, ArcanaItemCategorySchema, type ArcanaItemMaster } from "../game/schemas/arcana-item";
const AssetSchema=z.object({category:ArcanaItemCategorySchema,equipmentSlot:z.literal("lifeTool").optional(),thumbnail:ArcanaThumbnailSchema});
const StoredSchema=z.object({schemaVersion:z.literal(1),fingerprint:z.string(),updatedAt:z.string(),item:ArcanaItemMasterSchema});
const KIND="arcana_item_master";
const hash=(value:unknown)=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Existing gameplay definitions are the authoring source; the DB stores a synchronized, queryable master catalog. */
export function buildArcanaItemMaster(root=process.cwd()):ArcanaItemMaster[] {
  return Object.entries(assets.items).map(([id,raw])=>{
    const asset=AssetSchema.parse(raw);
    const base=baseItems[id as keyof typeof baseItems];
    if(!base)throw new Error("Unknown Arcana item in asset catalog: "+id);
    if(asset.thumbnail.path && !existsSync(resolve(root,"godot-arcana",asset.thumbnail.path.slice(6))))throw new Error("Missing Arcana item thumbnail: "+id);
    const definition=ItemCardSchema.parse({...base,source:"template",generatedAt:"static"});
    const food=FOODS[id],fire=CAMPFIRES[id];
    if(food) {
      definition.name=food.name+" · "+food.quality;
      definition.description="허기 "+food.hunger+" 회복";
      definition.effects={...definition.effects,hp:0,mind:0,energy:0};definition.useMinutes=0;
    }
    if(id==="manaPotion") {
      definition.effects={...definition.effects,hp:0,mind:0,energy:0};definition.useMinutes=0;
      definition.description=base.description+" MP 20 회복.";
    }
    const good=ARCANA_SHOP_GOODS.find(g=>g.itemId===id);
    return ArcanaItemMasterSchema.parse({id,realm:"arcana",definition,...asset,
      lifeEffects:food?{hungerRestore:food.hunger,quality:food.quality}:fire?{durationMinutes:fire.minutes,cookSeconds:fire.cookSeconds,quality:fire.quality}:id==="manaPotion"?{manaRestore:20}:undefined,
      trade:good?{buy:good.buy,sell:good.sell,currency:"gold"}:undefined,
    });
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
export class ArcanaItemCatalog {
  private cached:ArcanaItemMaster[]=[];
  constructor(private store:OnlineStore,private root:string) {}
  async init() {
    const authored=buildArcanaItemMaster(this.root);
    this.cached=await this.store.transaction(async tx=>{
      const result:ArcanaItemMaster[]=[];
      for(const item of authored) {
        const expected=hash(item);
        const old=StoredSchema.safeParse(await tx.get(KIND,item.id));
        // Compare actual contents too, so stale fingerprints cannot hide a partial DB edit.
        if(!old.success || old.data.fingerprint!==expected || hash(old.data.item)!==expected)
          await tx.put(KIND,item.id,{schemaVersion:1,fingerprint:expected,updatedAt:new Date().toISOString(),item});
        const saved=StoredSchema.parse(await tx.get(KIND,item.id));
        result.push(saved.item);
      }
      return result;
    });
  }
  list():ArcanaItemMaster[] { return structuredClone(this.cached); }
  summary() {
    return {schemaVersion:1,realm:"arcana",count:this.cached.length,items:this.list(),missingThumbnails:this.cached.filter(item=>item.thumbnail.status==="missing").map(item=>item.id)};
  }
}
