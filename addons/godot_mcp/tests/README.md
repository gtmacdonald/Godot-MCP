# Addon Tests

The GDScript addon doesn’t ship with a built‑in runner. We use the GUT (Godot Unit Test) plugin.

## Setup

1. Install GUT from the Godot Asset Library, or add it to your project under:
   - `res://addons/gut/`
2. Restart Godot and enable the GUT plugin.

## Running tests

From the project root:

```bash
godot4 --headless --script res://addons/gut/gut_cmdln.gd \
  -gdir=res://addons/godot_mcp/tests -gexit
```

Tests live in `res://addons/godot_mcp/tests/` and follow GUT naming (`test_*.gd`).

