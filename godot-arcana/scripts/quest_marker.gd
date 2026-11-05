extends Sprite3D
## A native PixelPen asset; this node only displays server-owned quest state.
@export var quest_id: String = ""
@export var progress_flag: String = ""
@export var required_count: int = 10

var question_texture: Texture2D
var complete_texture: Texture2D

func _ready() -> void:
	question_texture = load("res://art/export/ui/quest-question.png") as Texture2D
	complete_texture = load("res://art/export/ui/quest-complete.png") as Texture2D
	texture = question_texture
	texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	pixel_size = 1.0 / 64.0
	billboard = BaseMaterial3D.BILLBOARD_ENABLED
	shaded = false
	double_sided = true
	no_depth_test = true
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# NPC foot anchor (116px); marker bottom sits 8 source pixels above the head.
	offset = Vector2(0,137)
	visible = false
	add_to_group("arcana_quest_markers")

func sync_quest(state: Dictionary, quests: Array = []) -> void:
	visible = false
	if quest_id.is_empty(): return
	# An NPC alone is never enough: the server must actually offer this quest.
	var offered: bool = false
	for quest in quests:
		if quest is Dictionary and str(quest.get("id","")) == quest_id:
			offered = true
			break
	if not offered: return
	var status: String = str(state.get("quests",{}).get(quest_id,"inactive"))
	var progress: int = int(state.get("flags",{}).get(progress_flag,0))
	if status == "inactive":
		texture = question_texture
		visible = true
	elif status == "active" and progress >= required_count:
		texture = complete_texture
		visible = true
