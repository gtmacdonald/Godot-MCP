import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScriptTools } from './script_tools.js';

const sendCommand = vi.fn();
const mockConnection = { sendCommand } as any;
const getConnection = () => mockConnection;

describe('scriptTools', () => {
  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('create_script passes through params and formats attach message', async () => {
    sendCommand.mockResolvedValue({ script_path: 'res://scripts/foo.gd' });

    const tools = createScriptTools(getConnection);
    const tool = tools.find(t => t.name === 'create_script')!;

    const result = await tool.execute({
      script_path: 'res://scripts/foo.gd',
      content: 'extends Node',
      node_path: '/root/Foo',
    } as any);

    expect(sendCommand).toHaveBeenCalledWith('create_script', {
      script_path: 'res://scripts/foo.gd',
      content: 'extends Node',
      node_path: '/root/Foo',
    });
    expect(result).toBe('Created script at res://scripts/foo.gd and attached to node at /root/Foo');
  });

  it('edit_script calls edit_script and returns updated path message', async () => {
    sendCommand.mockResolvedValue({});

    const tools = createScriptTools(getConnection);
    const tool = tools.find(t => t.name === 'edit_script')!;

    const result = await tool.execute({
      script_path: 'res://scripts/foo.gd',
      content: 'extends Node2D',
    } as any);

    expect(sendCommand).toHaveBeenCalledWith('edit_script', {
      script_path: 'res://scripts/foo.gd',
      content: 'extends Node2D',
    });
    expect(result).toBe('Updated script at res://scripts/foo.gd');
  });

  it('get_script returns fenced gdscript content', async () => {
    sendCommand.mockResolvedValue({
      script_path: 'res://scripts/foo.gd',
      content: 'extends Node\nfunc _ready(): pass',
    });

    const tools = createScriptTools(getConnection);
    const tool = tools.find(t => t.name === 'get_script')!;

    const result = await tool.execute({ script_path: 'res://scripts/foo.gd' } as any);

    expect(sendCommand).toHaveBeenCalledWith('get_script', {
      script_path: 'res://scripts/foo.gd',
      node_path: undefined,
    });
    expect(result).toContain('```gdscript');
    expect(result).toContain('extends Node');
  });

  it('create_script_template generates local boilerplate', async () => {
    const tools = createScriptTools(getConnection);
    const tool = tools.find(t => t.name === 'create_script_template')!;

    const result = await tool.execute({
      class_name: 'Player',
      extends_type: 'Node2D',
      include_ready: true,
      include_process: false,
      include_input: false,
      include_physics: false,
    } as any);

    expect(sendCommand).not.toHaveBeenCalled();
    expect(result).toContain('class_name Player');
    expect(result).toContain('extends Node2D');
    expect(result).toContain('func _ready()');
  });
});

