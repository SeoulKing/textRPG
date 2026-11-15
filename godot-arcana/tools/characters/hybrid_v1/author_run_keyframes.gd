extends SceneTree
## First-time import of the preserved shared run. Never overwrites artist keys.
const Clip = preload("res://scripts/characters/hybrid_v1/run_keyframe_clip.gd")
const SOURCE := "res://art/characters/hybrid-v1/shared-run.json"

func _initialize() -> void: call_deferred("_author")

func _author() -> void:
	if FileAccess.file_exists(Clip.DEFAULT_PATH):
		push_error("Preserving existing run keyframes: " + Clip.DEFAULT_PATH)
		quit(1)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SOURCE))
	if not parsed is Dictionary or not parsed.get("samples") is Array or not parsed.get("neutral") is Dictionary:
		push_error("Missing source run and neutral pose")
		quit(1)
		return
	var data: Dictionary = parsed
	var samples: Array = data.samples
	var animation := Animation.new()
	animation.resource_name = "run"
	animation.length = float(data.duration)
	animation.loop_mode = Animation.LOOP_LINEAR
	var channels: Array = Clip.channel_specs()
	var previous := {}
	for channel: Dictionary in channels:
		var track: int = animation.add_track(Animation.TYPE_VALUE)
		animation.track_set_path(track, NodePath(channel.path))
		animation.track_set_interpolation_type(track, Animation.INTERPOLATION_LINEAR)
		animation.value_track_set_update_mode(track, Animation.UPDATE_CONTINUOUS)
		for index: int in samples.size():
			var values: Dictionary = Clip.pose_to_deltas(samples[index], data.neutral)
			var value: Variant = values[channel.path]
			if channel.property == "rotation":
				if index > 0: value = Clip.unwrap_delta(float(value), float(previous[channel.path]))
				previous[channel.path] = value
			animation.track_insert_key(track, animation.length * float(index) / float(samples.size() - 1), value)
	var library := AnimationLibrary.new()
	library.add_animation(Clip.CLIP_NAME, animation)
	var error: Error = ResourceSaver.save(library, Clip.DEFAULT_PATH)
	if error != OK:
		push_error("Could not save run keyframes: " + error_string(error))
		quit(1)
		return
	print("RUN_KEYFRAMES_CREATED tracks=", channels.size(), " keys_per_track=", samples.size(), " source_preserved=true")
	quit()
