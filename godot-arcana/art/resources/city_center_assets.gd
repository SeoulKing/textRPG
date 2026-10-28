@tool
extends RefCounted
## Independent city sprites, registered from the approved source sheet.
const ITEMS = {
 "city-townhouse": {"texture":preload("res://art/export/regions/arcana-city-center/city-townhouse.png"),"foot":Vector2(196.0,499),"shadow":Vector2(3.9,0.65)},
 "city-workshops": {"texture":preload("res://art/export/regions/arcana-city-center/city-workshops.png"),"foot":Vector2(260.0,441),"shadow":Vector2(5.2,0.65)},
 "city-bookshop": {"texture":preload("res://art/export/regions/arcana-city-center/city-bookshop.png"),"foot":Vector2(164.0,478),"shadow":Vector2(3.25,0.65)},
 "city-market": {"texture":preload("res://art/export/regions/arcana-city-center/city-market.png"),"foot":Vector2(132.0,158),"shadow":Vector2(2.6,0.35)},
 "city-cafe": {"texture":preload("res://art/export/regions/arcana-city-center/city-cafe.png"),"foot":Vector2(100.0,193),"shadow":Vector2(1.95,0.35)},
 "city-hedge": {"texture":preload("res://art/export/regions/arcana-city-center/city-hedge.png"),"foot":Vector2(100.0,71),"shadow":Vector2(1.95,0.35)},
}
