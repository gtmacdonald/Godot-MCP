import { describe, expect, it, vi } from 'vitest';

describe('godot_connection (mock mode + env)', () => {
  it('uses GODOT_WS_URL on first getGodotConnection()', async () => {
    vi.resetModules();
    process.env.GODOT_WS_URL = 'mock://godot';

    const mod = await import('./godot_connection.js');
    const conn = mod.getGodotConnection() as any;

    expect(conn.url).toBe('mock://godot');
  });

  it('mock:// connects and returns stable fake data', async () => {
    vi.resetModules();
    process.env.GODOT_WS_URL = 'mock://godot';

    const mod = await import('./godot_connection.js');
    const conn = mod.getGodotConnection();

    expect(conn.isConnected()).toBe(false);
    await conn.connect();
    expect(conn.isConnected()).toBe(true);

    const edited = await conn.sendCommand<any>('get_edited_scene_structure', { ensure_ids: true });
    expect(edited.structure.id).toBe('root-1');
    expect(edited.structure.children[0].id).toBe('child-1');

    const editedWithProps = await conn.sendCommand<any>('get_edited_scene_structure', {
      ensure_ids: true,
      include_properties: true,
      properties: ['position'],
    });
    expect(editedWithProps.structure.properties.position).toBe('MOCK');

    conn.disconnect();
    expect(conn.isConnected()).toBe(false);
  });
});

