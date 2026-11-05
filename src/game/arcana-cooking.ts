/** Shared Arcana-only cooking definitions. Result order is normal / fine / excellent. */
export type CookingRecipe = { name:string; ingredients:ReadonlyArray<{itemId:string;count:number}>; results:readonly [string,string,string] };
export const COOKING_RECIPES: Record<string,CookingRecipe> = {
  grilledFish:{name:"생선구이",ingredients:[{itemId:"riverFish",count:1}],results:["grilledFish","grilledFishFine","grilledFishExcellent"]},
  grilledMushroom:{name:"버섯구이",ingredients:[{itemId:"mushroom",count:1}],results:["grilledMushroom","grilledMushroomFine","grilledMushroomExcellent"]},
  roastedPotato:{name:"구운감자",ingredients:[{itemId:"potato",count:1}],results:["roastedPotato","roastedPotatoFine","roastedPotatoExcellent"]},
  meatSkewer:{name:"고기꼬치",ingredients:[{itemId:"rawMeat",count:1},{itemId:"treeBranch",count:1}],results:["meatSkewer","meatSkewerFine","meatSkewerExcellent"]},
};
export const FOODS: Record<string,{name:string;quality:string;hunger:number}> = Object.fromEntries(
  Object.values(COOKING_RECIPES).flatMap(recipe=>recipe.results.map((id,tier)=>[id,{name:recipe.name,quality:["보통","양호","우수"][tier],hunger:[40,50,60][tier]}])),
);
export const COOKING_MATERIAL_IDS = ["mushroom","potato","rawMeat","treeBranch"] as const;
