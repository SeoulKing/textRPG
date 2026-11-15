extends Sprite2D
@export var quest_id: String=""
@export var progress_flag: String=""
@export var required_count: int=10
var question_texture: Texture2D
var complete_texture: Texture2D
func _ready() -> void:
    question_texture=preload("res://art/export/ui/quest-question.png")
    complete_texture=preload("res://art/export/ui/quest-complete.png")
    texture=question_texture;visible=false;z_index=3900
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
