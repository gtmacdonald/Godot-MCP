import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorTools } from './editor_tools.js';

const sendCommand = vi.fn();
const mockConnection = { sendCommand } as any;
const getConnection = () => mockConnection;

describe('editorTools', () => {
  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('execute_editor_script formats output and result', async () => {
    sendCommand.mockResolvedValue({
      output: ['hello', 'world'],
      result: { ok: true },
    });

    const tools = createEditorTools(getConnection);
    const tool = tools.find(t => t.name === 'execute_editor_script')!;

    const result = await tool.execute({ code: 'print("hi")' } as any);

    expect(sendCommand).toHaveBeenCalledWith('execute_editor_script', { code: 'print("hi")' });
    expect(result).toContain('Output:');
    expect(result).toContain('hello');
    expect(result).toContain('Result:');
    expect(result).toContain('"ok": true');
  });
});

