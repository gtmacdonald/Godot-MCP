extends "res://addons/gut/test.gd"

class MockServer:
	var last_client_id: int = -1
	var last_response: Dictionary = {}
	func send_response(client_id: int, response: Dictionary) -> void:
		last_client_id = client_id
		last_response = response


func test_unknown_command_sends_error_with_command_id():
	var handler := MCPCommandHandler.new()
	var server := MockServer.new()
	handler._websocket_server = server
	handler._command_processors = []
	
	handler._handle_command(1, {
		"type": "bogus_command",
		"params": {},
		"commandId": "c1"
	})
	
	assert_eq(server.last_client_id, 1)
	assert_eq(server.last_response.status, "error")
	assert_true(String(server.last_response.message).contains("Unknown command"))
	assert_eq(server.last_response.commandId, "c1")


func test_unknown_command_sends_error_without_command_id():
	var handler := MCPCommandHandler.new()
	var server := MockServer.new()
	handler._websocket_server = server
	handler._command_processors = []
	
	handler._handle_command(2, {
		"type": "bogus_command",
		"params": {}
	})
	
	assert_eq(server.last_client_id, 2)
	assert_eq(server.last_response.status, "error")
	assert_false(server.last_response.has("commandId"))

