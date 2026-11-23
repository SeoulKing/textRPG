import { defineLocation } from "./data/location-helpers";
import type { SceneDefinition } from "./schemas";

/** Private online place; access is authorized by ArcanaWorld, never HTTP travel. */
export const ARCANA_HOME_LOCATION=defineLocation({
  id:"arcana_home",name:"내 집",risk:"low",
  summary:"요리할 주방과 편안한 침실, 작은 거실을 갖춘 나만의 집.",
  tags:["magic-city","home","realm:magic"],traits:["kitchen","bedroom","living room"],
  obtainableItemIds:[],neighbors:[],links:{},
});
export const ARCANA_HOME_SCENE:SceneDefinition={
  id:"arcana_home_intro",locationId:"arcana_home",title:"내 집",
  paragraphs:["문을 닫고 집 안으로 들어선다. 주방에는 요리할 자리가 마련되어 있고, 거실의 탁자와 소파 너머로 침실이 이어진다."],
  choiceIds:[],conditions:[{type:"location",locationId:"arcana_home"}],
};
