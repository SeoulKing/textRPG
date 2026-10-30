@tool
extends EditorPlugin
const Gizmos = preload("res://addons/arcana_layout/placement_gizmo.gd")
var gizmos: EditorNode3DGizmoPlugin
var toolbar: HBoxContainer

func _enter_tree() -> void:
	gizmos = Gizmos.new()
	add_node_3d_gizmo_plugin(gizmos)
	toolbar = HBoxContainer.new()
	var open = Button.new()
	open.text = "광장 함께 편집"
	open.tooltip_text = "같은 plaza.tscn을 편집합니다. 저장하면 실행 중인 로컬 게임에도 반영됩니다."
	open.pressed.connect(_open_plaza)
	toolbar.add_child(open)
	var help = Button.new()
	help.text = "배치 방법"
	help.pressed.connect(_show_help)
	toolbar.add_child(help)
	var hint = Label.new()
	hint.text = "  X/Z로 이동 · Ctrl+S 저장 → 로컬 게임 자동 반영"
	toolbar.add_child(hint)
	add_control_to_container(EditorPlugin.CONTAINER_SPATIAL_EDITOR_MENU,toolbar)
	_open_plaza.call_deferred()

func _open_plaza() -> void:
	EditorInterface.open_scene_from_path("res://scenes/plaza.tscn")

func _exit_tree() -> void:
	remove_node_3d_gizmo_plugin(gizmos)
	if is_instance_valid(toolbar):
		remove_control_from_container(EditorPlugin.CONTAINER_SPATIAL_EDITOR_MENU,toolbar)
		toolbar.queue_free()

func _show_help() -> void:
	var dialog = AcceptDialog.new()
	dialog.title = "광장을 함께 만드는 방법"
	dialog.dialog_text = "1. 건물이나 캐릭터를 선택하고 F로 시점을 맞춥니다.\n2. W 이동 도구의 X/Z 화살표로 배치합니다.\n3. Ctrl+S로 저장하면 실행 중인 로컬 게임에 반영됩니다.\n4. F6 또는 F5로 실행합니다. 게임 진행에는 로컬 서버가 필요합니다.\n\n건물의 Interaction 자식은 문 앞 출입점입니다.\n장식으로 복제한 물체는 Gameplay Id를 비워 주세요.\n미저장 드래그는 공유되지 않으며 웹 버전은 내보내기가 필요합니다.\n자세한 내용은 프로젝트의 EDITOR_GUIDE.md에 있습니다."
	dialog.confirmed.connect(dialog.queue_free)
	EditorInterface.get_base_control().add_child(dialog)
	dialog.popup_centered()
