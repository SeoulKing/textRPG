extends RefCounted
## Bounded numeric diagnostics; never stores player state, input payloads or identity.
const INCIDENT_KEY: String = "arcana-network-last-incident-v1"
const MAX_SAMPLES: int = 256
const MAX_HISTORY: int = 120
const MAX_EVENTS: int = 48
var measurements: Dictionary = {}
var history: Array[Dictionary] = []
var events: Array[Dictionary] = []
var server: Dictionary = {}
var previous_incident: Dictionary = {}
var loaded_previous: bool = false
var server_received_at: int = 0
var last_received_at: int = 0
var last_world_at: int = 0
var summary_at: int = -1000
var summary_cache: Dictionary = {}
var sample_at: int = 0
var rate_at: int = 0
var received_bytes: int = 0
var received_packets: int = 0
var rate_bytes: int = 0
var rate_packets: int = 0
var bytes_per_second: int = 0
var packets_per_second: float = 0.0
var last_slow_at: int = -3000

func record(name: String, value: float) -> void:
	if not is_finite(value) or value<0: return
	if not measurements.has(name): measurements[name] = []
	var values: Array = measurements[name]
	values.append(value)
	if values.size()>MAX_SAMPLES: values.pop_front()

func receive(bytes: int, parse_ms: float, world: bool, network: Dictionary, active: bool = true) -> void:
	var now: int = Time.get_ticks_msec()
	if active:
		if last_received_at>0: record("receiveGapMs",float(now-last_received_at))
		last_received_at = now
		if world:
			if last_world_at>0: record("worldGapMs",float(now-last_world_at))
			last_world_at = now
	else:
		last_received_at = 0
		last_world_at = 0
	record("parseMs",parse_ms)
	received_bytes += bytes
	received_packets += 1
	rate_bytes += bytes
	rate_packets += 1
	if not network.is_empty():
		server = network
		server_received_at = now

func acknowledgement(elapsed: float, processing: float, queue: float) -> void:
	record("roundTripMs",elapsed)
	var now: int = Time.get_ticks_msec()
	if elapsed>300 and now-last_slow_at>=3000:
		last_slow_at = now
		event("slow_ack",{"roundTripMs":elapsed,"serverProcessingMs":processing,"serverReplyQueueMs":queue})
	record("serverProcessingMs",processing)
	record("serverReplyQueueMs",queue)
	# Includes the network and client receive scheduling; not a pure wire ping.
	record("outsideServerMs",maxf(0,elapsed-processing-queue))

func event(kind: String, detail: Dictionary = {}) -> void:
	var value: Dictionary = detail.duplicate(true)
	value.kind = kind
	value.atMs = Time.get_ticks_msec()
	events.append(value)
	if events.size()>MAX_EVENTS: events.pop_front()

func summary() -> Dictionary:
	var now: int = Time.get_ticks_msec()
	if now-summary_at<1000: return summary_cache
	var result: Dictionary = {}
	for name in measurements:
		var values: Array = measurements[name].duplicate()
		values.sort()
		if values.is_empty(): continue
		result[name] = {"samples":values.size(),"p50":snappedf(float(values[ceili((values.size()-1)*.5)]),.01),"p95":snappedf(float(values[ceili((values.size()-1)*.95)]),.01),"p99":snappedf(float(values[ceili((values.size()-1)*.99)]),.01),"max":snappedf(float(values.back()),.01)}
	summary_cache = result
	summary_at = now
	return result

func _metric(source: Dictionary, name: String, field: String = "p95") -> float:
	return float(source.get(name,{}).get(field,0))

func tick(main: Node) -> void:
	if not main.online_world: return
	var now: int = Time.get_ticks_msec()
	if rate_at==0: rate_at = now
	var elapsed: int = now-rate_at
	if elapsed>=1000:
		bytes_per_second = roundi(float(rate_bytes)*1000/elapsed)
		packets_per_second = snappedf(float(rate_packets)*1000/elapsed,.1)
		rate_bytes = 0
		rate_packets = 0
		rate_at = now
	if now-sample_at<1000 or not main.page_active: return
	sample_at = now
	var timing: Dictionary = summary()
	var world: Dictionary = server.get("world",{})
	var world_timing: Dictionary = world.get("timing",{})
	var persistence: Dictionary = world.get("persistence",{})
	var transport: Dictionary = server.get("transport",{})
	var motion: Dictionary = main.online_presence.diagnostics()
	var frame: Dictionary = main.frame_timing
	var sample: Dictionary = {"atMs":now,"ready":main.combat_socket.socket_ready,"rttP95Ms":_metric(timing,"roundTripMs"),"rttP99Ms":_metric(timing,"roundTripMs","p99"),"worldGapP95Ms":_metric(timing,"worldGapMs"),"parseP95Ms":_metric(timing,"parseMs"),"applyP95Ms":_metric(timing,"applyMs"),"frameP95Ms":float(frame.get("p95Ms",0)),"frameP99Ms":float(frame.get("p99Ms",0)),"frameMaxMs":float(frame.get("maxMs",0)),"serverQueueP95Ms":_metric(world_timing,"queueWaitMs"),"serverTickP95Ms":_metric(world_timing,"tickWorkMs"),"saveP95Ms":_metric(persistence.get("timing",{}),"commitMs"),"saveLagMs":int(persistence.get("lagMs",0)),"sendBufferBytes":int(transport.get("bufferedBytes",0)),"stateWaitMs":int(transport.get("stateWaitMs",0)),"coalescedStates":int(transport.get("coalescedStates",0)),"receiveBytesPerSecond":bytes_per_second,"serverSampleAgeMs":now-server_received_at if server_received_at>0 else -1,"corrections":int(motion.get("corrections",0)),"hardCorrections":int(motion.get("hardCorrections",0))}
	# Keep rare one-off spikes visible after rolling percentiles have moved on.
	sample.rttMaxMs = _metric(timing,"roundTripMs","max")
	sample.worldGapMaxMs = _metric(timing,"worldGapMs","max")
	sample.parseMaxMs = _metric(timing,"parseMs","max")
	sample.applyMaxMs = _metric(timing,"applyMs","max")
	sample.serverQueueMaxMs = _metric(world_timing,"queueWaitMs","max")
	sample.serverTickMaxMs = _metric(world_timing,"tickWorkMs","max")
	sample.saveMaxMs = _metric(persistence.get("timing",{}),"commitMs","max")
	history.append(sample)
	if history.size()>MAX_HISTORY: history.pop_front()
	if now-last_slow_at>=3000 and (sample.rttP95Ms>300 or sample.frameMaxMs>100 or sample.stateWaitMs>500 or sample.saveLagMs>1000):
		last_slow_at = now
		event("slow_sample",sample)

func diagnostics() -> Dictionary:
	return {"timing":summary(),"receivedBytes":received_bytes,"receivedPackets":received_packets,"bytesPerSecond":bytes_per_second,"packetsPerSecond":packets_per_second,"serverSampleAgeMs":Time.get_ticks_msec()-server_received_at if server_received_at>0 else -1,"server":server}

func report(main: Node, include_previous: bool = true) -> Dictionary:
	var result: Dictionary = {"format":"arcana-network-v1","createdAtUnixMs":int(Time.get_unix_time_from_system()*1000),"client":diagnostics(),"connection":main.combat_socket.connection_status(),"motion":main.online_presence.diagnostics(),"frame":main.frame_timing.duplicate(true),"http":main.network_timing.duplicate(true),"history":history.duplicate(true),"events":events.duplicate(true)}
	if include_previous:
		if not loaded_previous:
			loaded_previous = true
			var saved: Variant = main._stored_json(INCIDENT_KEY)
			if saved is Dictionary: previous_incident = saved
		if not previous_incident.is_empty(): result.previousIncident = previous_incident
	return result

func preserve_incident(main: Node) -> void:
	previous_incident = report(main,false)
	loaded_previous = true
	main._store(INCIDENT_KEY,JSON.stringify(previous_incident))
