import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeTools } from './node_tools.js';

const sendCommand = vi.fn();
const mockConnection = { sendCommand } as any;
const getConnection = () => mockConnection;

describe('nodeTools', () => {
  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('create_node sends the correct command and formats output', async () => {
    sendCommand.mockResolvedValue({ node_path: '/root/Foo' });

    const tools = createNodeTools(getConnection);
    const tool = tools.find(t => t.name === 'create_node')!;

    const result = await tool.execute({
      parent_path: '/root',
      node_type: 'Node2D',
      node_name: 'Foo',
    } as any);

    expect(sendCommand).toHaveBeenCalledWith('create_node', {
      parent_path: '/root',
      node_type: 'Node2D',
      node_name: 'Foo',
    });
    expect(result).toBe('Created Node2D node named "Foo" at /root/Foo');
  });

  it('list_nodes returns a friendly message when empty', async () => {
    sendCommand.mockResolvedValue({ children: [] });

    const tools = createNodeTools(getConnection);
    const tool = tools.find(t => t.name === 'list_nodes')!;

    const result = await tool.execute({ parent_path: '/root' } as any);

    expect(sendCommand).toHaveBeenCalledWith('list_nodes', { parent_path: '/root' });
    expect(result).toBe('No child nodes found under /root');
  });
});
