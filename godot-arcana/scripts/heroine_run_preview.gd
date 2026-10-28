extends Control
## F6 art preview; no server or saved-game interaction.
const FRAMES=preload("res://art/export/heroine-fullbody-v6/heroine-run.tres")
const DIRECTIONS=["s","se","e","ne","n","nw","w","sw"]
func _ready() -> void:
    var background=ColorRect.new();background.color=Color("8292a7");background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(background)
    var column=VBoxContainer.new();column.position=Vector2(24,20);add_child(column)
    var title=Label.new();title.text="8-direction run · Space: pause/resume · 14 fps";column.add_child(title)
    var grid=GridContainer.new();grid.columns=4;column.add_child(grid)
    for direction in DIRECTIONS:
        var box=VBoxContainer.new();grid.add_child(box)
        var label=Label.new();label.text=direction.to_upper();label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;box.add_child(label)
        var space=Control.new();space.custom_minimum_size=Vector2(192,272);box.add_child(space)
        var sprite=AnimatedSprite2D.new();sprite.sprite_frames=FRAMES;sprite.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
        sprite.position=Vector2(96,136);sprite.scale=Vector2(2,2);space.add_child(sprite);sprite.add_to_group("run_art_preview");sprite.play("run_"+direction)
func _unhandled_key_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept"):
        for sprite in get_tree().get_nodes_in_group("run_art_preview"):
            if sprite.is_playing():sprite.pause()
            else:sprite.play()
