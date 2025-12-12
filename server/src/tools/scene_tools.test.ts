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
});
