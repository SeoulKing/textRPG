extends SceneTree
func _initialize() -> void:call_deferred("export_layout")
func _properties(state: SceneState,index: int) -> Dictionary:
    var result: Dictionary={}
    for item in state.get_node_property_count(index):result[str(state.get_node_property_name(index,item))]=state.get_node_property_value(index,item)
    return result
func _saved_nodes(state: SceneState, origin: Vector2 = Vector2.ZERO) -> Array[Dictionary]:
    # Instanced quarters own their placements. Include their saved local offsets
    # without creating runtime sprites or flattening the editable source scene.
    var result: Array[Dictionary] = []
    var origins: Dictionary = {}
    var visual_offsets: Dictionary = {}
    for index in state.get_node_count():
        var child_path: String = str(state.get_node_path(index))
        if str(state.get_node_name(index)) == "Visual":
            visual_offsets[child_path.get_base_dir()] = _properties(state,index).get("position", Vector2.ZERO)
    for index in state.get_node_count():
        var values: Dictionary = _properties(state,index)
        var path: String = str(state.get_node_path(index))
        var parent_origin: Vector2 = origins.get(path.get_base_dir(),origin)
        var offset: Vector2 = parent_origin + values.get("position",Vector2.ZERO)
        origins[path] = offset
        # Visual can have been moved directly in the editor; match the runtime
        # placement without changing the transform inherited by other children.
        values["position"] = offset + visual_offsets.get(path, Vector2.ZERO)
        values["node_name"] = str(state.get_node_name(index))
        result.append(values)
        var instance: PackedScene = state.get_node_instance(index)
        if instance != null:
            result.append_array(_saved_nodes(instance.get_state(),offset))
    return result
func export_layout() -> void:
    # Read saved placement data without instantiating sprite/texture render nodes.
    var packed=load("res://scenes/native_2d/plaza.tscn") as PackedScene
    var state=packed.get_state()
    var rectangles: Array=[]
    var root_values=_properties(state,0)
    var saved_walls: Dictionary = preload("res://scripts/native_2d_wall_layer.gd").saved_collision_rects(state)
    var wall_parts: Array = saved_walls.rectangles if saved_walls.found else root_values.get("wall_rectangles", [])
    for rect in wall_parts:rectangles.append({"x":rect.position.x,"y":rect.position.y,"w":rect.size.x,"h":rect.size.y})
    var circles: Array=[]
    var spawn=Vector2(576,500)
    var home=Vector2.ZERO
    for values in _saved_nodes(state):
        if values.node_name=="PlazaSlimeSpawn":home=values.get("position",Vector2.ZERO)/4.0
        if not values.has("model_kind") and not values.has("logical_anchor"):continue
        var offset: Vector2=values.get("position",Vector2.ZERO)/4.0
        if values.get("gameplay_id","")=="player_spawn":spawn=values.get("logical_anchor",Vector2.ZERO)+offset
        for rect in values.get("collision_parts",[]):
            rectangles.append({"x":rect.position.x+offset.x,"y":rect.position.y+offset.y,"w":rect.size.x,"h":rect.size.y})
        var circle: Dictionary=values.get("round_collision",{})
        if not circle.is_empty():
            var inverse: Transform2D=circle.inverse
            var forward=inverse.affine_inverse();forward.origin+=offset;inverse=forward.affine_inverse()
            circles.append({"x":forward.origin.x,"y":forward.origin.y,"radius":circle.radius*maxf(forward.x.length(),forward.y.length()),"localRadius":circle.radius,"inverse":[inverse.x.x,inverse.x.y,inverse.y.x,inverse.y.y,inverse.origin.x,inverse.origin.y]})
    if home==Vector2.ZERO:push_error("Missing plaza_slime encounter anchor");quit(1);return
    var data={"encounterId":"plaza_slime","home":{"x":home.x,"y":home.y},"spawn":{"x":spawn.x,"y":spawn.y},"rectangles":rectangles,"circles":circles,"bounds":_outdoor_bounds(),"tuning":{"tile":16,"range":96,"projectileSpeed":128,"projectileRadius":2.4,"enemyRadius":7.2,"playerRadius":4.8,"chaseLimit":160,"chaseSpeed":32,"returnSpeed":64,"jumpRange":48,"jumpDuration":.72,"attackInterval":6}}
    var file=FileAccess.open("res://art/export/combat-layout.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(data,"  "));file.close()
    print("Exported combat layout from native 2D scene: ",data.home)
    state=null;packed=null
    await process_frame
    quit()

func _outdoor_bounds() -> Dictionary:
    var box: Rect2 = preload("res://scripts/city_map.gd").WALK_BOUNDS
    return {"x":box.position.x,"y":box.position.y,"w":box.size.x,"h":box.size.y}
