extends Node
const Flame=preload("res://scripts/native_2d_flame.gd")
const Charge=preload("res://scripts/native_2d_charge.gd")
var renderer: Node2D
var charge: Node2D
var prepared=false
var created_flames=0
var created_labels=0
var cast_material_prepared=true
var gpu_warmup_completed=false
var free_flames: Array[Node2D]=[]
var free_labels: Array[Label]=[]
func prepare(target: Node2D,_caster: Node2D=null) -> void:
    renderer=target;charge=Charge.new();renderer.add_child(charge);charge.hide();prepared=true
func take_flame(burst: bool=false,dissipate: bool=false) -> Node2D:
    var node=free_flames.pop_back() if not free_flames.is_empty() else Flame.new()
    if node.get_parent()==null:renderer.add_child(node);created_flames+=1
    node.elapsed=0.0;node.burst=burst;node.dissipate=dissipate
    node.flight_distance=0.0;node.flight_started=false;node.show()
    return node
func take_label(text: String,color: Color) -> Label:
    var node=free_labels.pop_back() if not free_labels.is_empty() else Label.new()
    if node.get_parent()==null:
        renderer.add_child(node);created_labels+=1;node.z_index=4001
        node.add_theme_font_override("font",preload("res://fonts/NotoSansKR-SemiBold.tres"))
        node.add_theme_font_size_override("font_size",22)
    node.text=text;node.modulate=color;node.show()
    return node
func release_flame(node: Node2D) -> void:
    node.hide()
    if not free_flames.has(node):free_flames.append(node)
func release_label(node: Label) -> void:
    node.hide()
    if not free_labels.has(node):free_labels.append(node)
