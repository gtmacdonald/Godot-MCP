@tool
extends EditorPlugin

var tcp_server := TCPServer.new()
var port := 9080
var handshake_timeout := 3000 # ms
var debug_mode := true
var log_detailed := true  # Enable detailed logging
var command_handler = null  # Command handler reference
var _panel: Control = null  # UI panel instance

signal client_connected(client_id, agent_id)
signal client_disconnected(client_id, agent_id)
signal command_received(client_id, agent_id, command)

class WebSocketClient:
	var tcp: StreamPeerTCP
	var id: int
	var ws: WebSocketPeer
	var state: int = -1 # -1: handshaking, 0: connected, 1: error/closed
	var handshake_time: int
	var last_poll_time: int
	var agent_id: String = ""  # Agent identifier
	var api_key: String = ""  # API key for this client

	func _init(p_tcp: StreamPeerTCP, p_id: int):
		tcp = p_tcp
		id = p_id
		handshake_time = Time.get_ticks_msec()
	
	func upgrade_to_websocket() -> bool:
		ws = WebSocketPeer.new()
		var err = ws.accept_stream(tcp)
		return err == OK

var clients := {}
var next_client_id := 1
var _agent_config: Dictionary

signal client_connected(client_id, agent_id)

func _enter_tree():
	# Store plugin instance for EditorInterface access
	Engine.set_meta("GodotMCPPlugin", self)

	# Load agent configuration
	_agent_config = load_agent_config()
	
	print("\n=== MCP SERVER STARTING ===")
	
	# Initialize the command handler
	print("Creating command handler...")
	command_handler = preload("res://addons/godot_mcp/command_handler.gd").new()
	command_handler.name = "CommandHandler"
	add_child(command_handler)
	
	# Connect signals
	print("Connecting command handler signals...")
	self.connect("command_received", Callable(command_handler, "_handle_command"))
	
	# Add the MCP panel (bottom panel)
	var panel_scene := load("res://addons/godot_mcp/ui/mcp_panel.tscn")
	if panel_scene:
		_panel = panel_scene.instantiate()
		_panel.websocket_server = self
		add_control_to_bottom_panel(_panel, "Godot MCP")
	else:
		printerr("Failed to load MCP panel scene")
	
	# Start WebSocket server
	var err := start_server()
	if err != OK:
		printerr("Failed to listen on port", port, "error:", err)
	
	print("=== MCP SERVER INITIALIZED ===\n")

func _exit_tree():
	# Remove plugin instance from Engine metadata
	if Engine.has_meta("GodotMCPPlugin"):
		Engine.remove_meta("GodotMCPPlugin")
	
	if tcp_server and tcp_server.is_listening():
		tcp_server.stop()
	
	clients.clear()
	
	if _panel:
		remove_control_from_bottom_panel(_panel)
		_panel.queue_free()
		_panel = null
	
	print("=== MCP SERVER SHUTDOWN ===")

func _log(client_id, message):
	if log_detailed:
		print("[Client ", client_id, "] ", message)

func _process(_delta):
	if not tcp_server.is_listening():
		return
	
	# Poll for new connections
	if tcp_server.is_connection_available():
		var tcp = tcp_server.take_connection()
		var id = next_client_id
		next_client_id += 1
		
		var client = WebSocketClient.new(tcp, id)
		clients[id] = client
		
		print("[Client ", id, "] New TCP connection")
		
		# Try to upgrade immediately
		if client.upgrade_to_websocket():
			print("[Client ", id, "] WebSocket handshake started")
		else:
			print("[Client ", id, "] Failed to start WebSocket handshake")
			clients.erase(id)
	
	# Update clients
	var current_time = Time.get_ticks_msec()
	var ids_to_remove := []
	
	for id in clients:
		var client = clients[id]
		client.last_poll_time = current_time
		
		# Process client based on its state
		if client.state == -1: # Handshaking
			if client.ws != null:
				# Poll the WebSocket peer
				client.ws.poll()
				
				# Check WebSocket state
				var ws_state = client.ws.get_ready_state()
				if debug_mode:
					_log(id, "State: " + str(ws_state))
					
				if ws_state == WebSocketPeer.STATE_OPEN:
					# Extract API key from WebSocket handshake headers
					var provided_key = ""

					# Note: Godot's WebSocketPeer doesn't expose headers directly
					# In production, you'd need to implement a custom handshake
					# For now, we'll accept the connection and validate on first command
					var agent_id = validate_api_key(provided_key)

					if agent_id.is_empty() and _agent_config.get("auth_required", false):
						print("[Client ", id, "] Authentication required but no API key provided")
						# Close connection with auth error
						ids_to_remove.append(id)
						continue

					client.agent_id = agent_id
					client.api_key = provided_key
					print("[Client ", id, "] WebSocket handshake completed (agent: ", agent_id, ")")
					client.state = 0

					# Emit connected signal with agent_id
					emit_signal("client_connected", id, agent_id)
					
					# Send welcome message
					var msg = JSON.stringify({
						"type": "welcome",
						"message": "Welcome to Godot MCP WebSocket Server"
					})
					client.ws.send_text(msg)
					
				elif ws_state != WebSocketPeer.STATE_CONNECTING:
					print("[Client ", id, "] WebSocket handshake failed, state: ", ws_state)
					ids_to_remove.append(id)
				
				# Check for handshake timeout
				elif current_time - client.handshake_time > handshake_timeout:
					print("[Client ", id, "] WebSocket handshake timed out")
					ids_to_remove.append(id)
			else:
				# If TCP is still connected, try upgrading
				if client.tcp.get_status() == StreamPeerTCP.STATUS_CONNECTED:
					if client.upgrade_to_websocket():
						print("[Client ", id, "] WebSocket handshake started")
					else:
						print("[Client ", id, "] Failed to start WebSocket handshake")
						ids_to_remove.append(id)
				else:
					print("[Client ", id, "] TCP disconnected during handshake")
					ids_to_remove.append(id)
		
		elif client.state == 0: # Connected
			# Poll the WebSocket
			client.ws.poll()
			
			# Check state
			var ws_state = client.ws.get_ready_state()
			if ws_state != WebSocketPeer.STATE_OPEN:
				print("[Client ", id, "] WebSocket connection closed, state: ", ws_state)
				emit_signal("client_disconnected", id)
				ids_to_remove.append(id)
				continue
			
			# Process messages
			while client.ws.get_available_packet_count() > 0:
				var packet = client.ws.get_packet()
				var text = packet.get_string_from_utf8()
				
				print("[Client ", id, "] RECEIVED RAW DATA: ", text)
				
				# Parse as JSON
				var json = JSON.new()
				var parse_result = json.parse(text)
				_log(id, "JSON parse result: " + str(parse_result))
				
				if parse_result == OK:
					var data = json.get_data()
					_log(id, "Parsed JSON: " + str(data))
					
					# Handle JSON-RPC protocol
					if data.has("jsonrpc") and data.get("jsonrpc") == "2.0":
						# Handle ping method
						if data.has("method") and data.get("method") == "ping":
							print("[Client ", id, "] Received PING with id: ", data.get("id"))
							var response = {
								"jsonrpc": "2.0",
								"id": data.get("id"),
								"result": null  # FastMCP expects null result for pings
							}
							var response_text = JSON.stringify(response)
							var send_result = client.ws.send_text(response_text)
							print("[Client ", id, "] SENDING PING RESPONSE: ", response_text, " (result: ", send_result, ")")
						
						# Handle other MCP commands
						elif data.has("method"):
							var method_name = data.get("method")
							var params = data.get("params", {})
							var req_id = data.get("id")
							
							print("[Client ", id, "] Processing JSON-RPC method: ", method_name)
							
							# For now, just send a generic success response
							# TODO: Route these to command handler as well
							var response = {
								"jsonrpc": "2.0",
								"id": req_id,
								"result": {
									"status": "success",
									"message": "Command processed"
								}
							}
							
							var response_text = JSON.stringify(response)
							var send_result = client.ws.send_text(response_text)
							print("[Client ", id, "] SENT RESPONSE: ", response_text, " (result: ", send_result, ")")
					
					# Handle legacy command format - This is what Claude Code uses
					elif data.has("type"):
						var cmd_type = data.get("type")
						var params = data.get("params", {})
						var cmd_id = data.get("commandId", "")

						print("[Client ", id, ":", client.agent_id, "] Processing command: ", cmd_type)

						# Route command to command handler via signal
						# The command handler will handle the response via send_response
						emit_signal("command_received", id, client.agent_id, data)
				else:
					print("[Client ", id, "] Failed to parse JSON: ", json.get_error_message())
	
	# Remove clients that need to be removed
	for id in ids_to_remove:
		clients.erase(id)

# Function for command handler to send responses back to clients
func send_response(client_id: int, response: Dictionary) -> int:
	if not clients.has(client_id):
		print("Error: Client %d not found" % client_id)
		return ERR_DOES_NOT_EXIST
	
	var client = clients[client_id]
	var json_text = JSON.stringify(response)
	
	print("Sending response to client %d: %s" % [client_id, json_text])
	
	if client.ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		print("Error: Client %d connection not open" % client_id)
		return ERR_UNAVAILABLE
	
	var result = client.ws.send_text(json_text)
	if result != OK:
		print("Error sending response to client %d: %d" % [client_id, result])
	
	return result

func is_server_active() -> bool:
	return tcp_server.is_listening()

func start_server() -> int:
	if is_server_active():
		return ERR_ALREADY_IN_USE
	
	var err := tcp_server.listen(port)
	if err == OK:
		print("Listening on port", port)
		set_process(true)
	
	return err

func stop_server() -> void:
	if is_server_active():
		tcp_server.stop()
		clients.clear()
		set_process(false)
		print("MCP WebSocket server stopped")
		
func get_port() -> int:
	return port

func set_port(new_port: int) -> void:
	if is_server_active():
		push_error("Cannot change port while server is active")
		return
	port = new_port

func get_client_count() -> int:
	return clients.size()

## Load agent configuration from mcp_agents.json
func load_agent_config() -> Dictionary:
	var config_path = "res://../mcp_agents.json"
	if FileAccess.file_exists(config_path):
		var file = FileAccess.open(config_path, FileAccess.READ)
		if file:
			var json_text = file.get_as_text()
			file.close()
			var json = JSON.new()
			var error = json.parse(json_text)
			if error == OK:
				print("MCP: Loaded agent configuration")
				return json.data
			else:
				printerr("MCP: Failed to parse agent config: ", json.get_error_message())
		else:
			printerr("MCP: Failed to open agent config file")
	else:
		print("MCP: No agent config found, using defaults (auth disabled)")

	return {"auth_required": false, "agents": []}

## Validate API key and return agent_id
func validate_api_key(provided_key: String) -> String:
	# If auth is not required, allow anonymous access
	if not _agent_config.get("auth_required", false):
		return "anonymous"

	# Check against configured agents
	for agent in _agent_config.get("agents", []):
		if agent.get("api_key", "") == provided_key:
			return agent.get("id", "")

	return ""  # Invalid key

## Sanitize API key for logging (show only last 4 chars)
func _sanitize_api_key(api_key: String) -> String:
	if api_key.length() <= 4:
		return "****"
	return "*" * (api_key.length() - 4) + api_key.right(4)
