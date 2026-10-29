extends SceneTree
func _initialize() -> void:call_deferred("export_layout")
func _properties(state: SceneState,index: int) -> Dictionary:
    var result: Dictionary={}
    for item in state.get_node_property_count(index):result[str(state.get_node_property_name(index,item))]=state.get_node_property_value(index,item)
    return result
func export_layout() -> void:
    # Read saved placement data without instantiating sprite/texture render nodes.
    var packed=load("res://scenes/native_2d/plaza.tscn") as PackedScene
    var state=packed.get_state()
    var rectangles: Array=[{"x":930,"y":840,"w":222,"h":360}]
    var root_values=_properties(state,0)
    for rect in root_values.get("wall_rectangles",[]):rectangles.append({"x":rect.position.x,"y":rect.position.y,"w":rect.size.x,"h":rect.size.y})
    var circles: Array=[]
    var spawn=Vector2(576,500)
    var home=Vector2.ZERO
    for index in state.get_node_count():
        var values=_properties(state,index)
        if str(state.get_node_name(index))=="PlazaSlimeSpawn":home=values.get("position",Vector2.ZERO)/4.0
        if not values.has("logical_anchor"):continue
        var offset: Vector2=values.get("position",Vector2.ZERO)/4.0
        if values.get("gameplay_id","")=="player_spawn":spawn=values.logical_anchor+offset
        for rect in values.get("collision_parts",[]):
            rectangles.append({"x":rect.position.x+offset.x,"y":rect.position.y+offset.y,"w":rect.size.x,"h":rect.size.y})
        var circle: Dictionary=values.get("round_collision",{})
        if not circle.is_empty():
            var inverse: Transform2D=circle.inverse
            var forward=inverse.affine_inverse();forward.origin+=offset;inverse=forward.affine_inverse()
            circles.append({"x":forward.origin.x,"y":forward.origin.y,"radius":circle.radius*maxf(forward.x.length(),forward.y.length()),"localRadius":circle.radius,"inverse":[inverse.x.x,inverse.x.y,inverse.y.x,inverse.y.y,inverse.origin.x,inverse.origin.y]})
    if home==Vector2.ZERO:push_error("Missing plaza_slime encounter anchor");quit(1);return
    var data={"encounterId":"plaza_slime","home":{"x":home.x,"y":home.y},"spawn":{"x":spawn.x,"y":spawn.y},"rectangles":rectangles,"circles":circles,"bounds":{"x":32,"y":48,"w":1078,"h":1352},"tuning":{"tile":16,"range":96,"projectileSpeed":128,"projectileRadius":2.4,"enemyRadius":7.2,"playerRadius":4.8,"chaseLimit":160,"chaseSpeed":32,"returnSpeed":64,"jumpRange":48,"jumpDuration":.72,"attackInterval":6}}
    var file=FileAccess.open("res://art/export/combat-layout.json",FileAccess.WRITE)
    file.store_string(JSON.stringify(data,"  "));file.close()
    print("Exported combat layout from native 2D scene: ",data.home)
    state=null;packed=null
    await process_frame
    quit()
