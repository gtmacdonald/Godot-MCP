import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneTools } from './scene_tools.js';

const sendCommand = vi.fn();
const mockConnection = { sendCommand } as any;
const getConnection = () => mockConnection;

describe('sceneTools', () => {
  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('create_scene defaults root_node_type to Node', async () => {
    sendCommand.mockResolvedValue({
      scene_path: 'res://scenes/new_scene.tscn',
      root_node_type: 'Node',
    });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'create_scene')!;

    const result = await tool.execute({ path: 'res://scenes/new_scene.tscn' } as any);

    expect(sendCommand).toHaveBeenCalledWith('create_scene', {
      path: 'res://scenes/new_scene.tscn',
      root_node_type: 'Node',
    });
    expect(result).toBe(
      'Created new scene at res://scenes/new_scene.tscn with root node type Node',
    );
  });

  it('get_project_info formats output and handles current scene', async () => {
    sendCommand.mockResolvedValue({
      project_name: 'Godot MCP',
      project_version: '1.0.0',
      project_path: '/tmp/project',
      godot_version: { major: 4, minor: 2, patch: 1 },
      current_scene: 'res://TestScene.tscn',
    });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'get_project_info')!;

    const result = await tool.execute({} as any);

    expect(sendCommand).toHaveBeenCalledWith('get_project_info', {});
    expect(result).toContain('Project Name: Godot MCP');
    expect(result).toContain('Project Version: 1.0.0');
    expect(result).toContain('Project Path: /tmp/project');
    expect(result).toContain('Godot Version: 4.2.1');
    expect(result).toContain('Current Scene: res://TestScene.tscn');
  });

  it('apply_scene_patch passes operations through and formats summary', async () => {
    sendCommand.mockResolvedValue({ applied: 2, total: 2, errors: [] });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'apply_scene_patch')!;

    const result = await tool.execute({
      strict: true,
      operations: [
        { op: 'create_node', parent_path: '/root', node_type: 'Node2D', node_name: 'Foo' },
        { op: 'set_property', node_path: '/root/Foo', property: 'name', value: 'Foo' },
      ],
    } as any);

    expect(sendCommand).toHaveBeenCalledWith('apply_scene_patch', {
      strict: true,
      operations: [
        { op: 'create_node', parent_path: '/root', node_type: 'Node2D', node_name: 'Foo' },
        { op: 'set_property', node_path: '/root/Foo', property: 'name', value: 'Foo' },
      ],
    });
    expect(result).toBe('Applied 2/2 operations');
  });

  it('generate_scene_patch generates create operations for missing nodes', async () => {
    sendCommand
      .mockResolvedValueOnce({
        scene_path: 'res://scenes/main.tscn',
        structure: {
          name: 'Root',
          type: 'Node',
          path: '/root',
          children: [],
        },
      })
      .mockResolvedValueOnce({ applied: 1, total: 1 });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'generate_scene_patch')!;

    const out = await tool.execute({
      desired: { children: [{ name: 'Player', type: 'Node2D' }] },
      apply: true,
    } as any);

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'get_edited_scene_structure', {});
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'apply_scene_patch', {
      operations: [
        {
          op: 'create_node',
          parent_path: '/root',
          node_type: 'Node2D',
          node_name: 'Player',
          properties: {},
          set_owner: true,
        },
      ],
      strict: true,
    });
    expect(out).toContain('Generated 1 operations');
    expect(out).toContain('Apply result: 1/1');
  });

  it('generate_scene_patch filters set_property when value is unchanged', async () => {
    sendCommand
      .mockResolvedValueOnce({
        scene_path: 'res://scenes/main.tscn',
        structure: {
          name: 'Root',
          type: 'Node',
          path: '/root',
          children: [
            {
              name: 'Player',
              type: 'Node2D',
              path: '/root/Player',
              properties: { health: 5 },
              children: [],
            },
          ],
        },
      });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'generate_scene_patch')!;

    const out = await tool.execute({
      desired: { children: [{ name: 'Player', type: 'Node2D', properties: { health: 5 } }] },
      apply: true,
    } as any);

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'get_edited_scene_structure', {
      include_properties: true,
      properties: ['health'],
    });
    expect(sendCommand).not.toHaveBeenCalledWith('apply_scene_patch', expect.anything());
    expect(out).toContain('Generated 0 operations');
  });

  it('generate_scene_patch can detect a simple rename within a parent', async () => {
    sendCommand
      .mockResolvedValueOnce({
        scene_path: 'res://scenes/main.tscn',
        structure: {
          name: 'Root',
          type: 'Node',
          path: '/root',
          children: [{ name: 'OldName', type: 'Node2D', path: '/root/OldName', children: [] }],
        },
      })
      .mockResolvedValueOnce({ applied: 1, total: 1 });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'generate_scene_patch')!;

    const out = await tool.execute({
      desired: { children: [{ name: 'NewName', type: 'Node2D' }] },
      detect_renames: true,
      apply: true,
      diff_properties: false,
    } as any);

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'get_edited_scene_structure', {});
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'apply_scene_patch', {
      operations: [{ op: 'rename_node', node_path: '/root/OldName', new_name: 'NewName' }],
      strict: true,
    });
    expect(out).toContain('Generated 1 operations');
  });

  it('generate_scene_patch can emit reorder operations', async () => {
    sendCommand
      .mockResolvedValueOnce({
        scene_path: 'res://scenes/main.tscn',
        structure: {
          name: 'Root',
          type: 'Node',
          path: '/root',
          children: [
            { name: 'B', type: 'Node', path: '/root/B', children: [] },
            { name: 'A', type: 'Node', path: '/root/A', children: [] },
          ],
        },
      })
      .mockResolvedValueOnce({ applied: 2, total: 2 });

    const tools = createSceneTools(getConnection);
    const tool = tools.find(t => t.name === 'generate_scene_patch')!;

    await tool.execute({
      desired: { children: [{ name: 'A', type: 'Node' }, { name: 'B', type: 'Node' }] },
      reorder_children: true,
      apply: true,
      diff_properties: false,
    } as any);

    expect(sendCommand).toHaveBeenNthCalledWith(1, 'get_edited_scene_structure', {});
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'apply_scene_patch', {
      operations: [
        {
          op: 'reparent_node',
          node_path: '/root/A',
          new_parent_path: '/root',
          index: 0,
          keep_global_transform: false,
        },
        {
          op: 'reparent_node',
          node_path: '/root/B',
          new_parent_path: '/root',
          index: 1,
          keep_global_transform: false,
        },
      ],
      strict: true,
    });
  });
});
