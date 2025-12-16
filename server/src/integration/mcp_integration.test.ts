import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { startFakeGodotServer } from './fake_godot_server.js';

function repoRootFromHere() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
}

describe('MCP integration (with fake Godot)', () => {
  it('lists tools/resources/templates and can read edited scene', async () => {
    const fakeGodot = await startFakeGodotServer();
    const repoRoot = repoRootFromHere();
    const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverEntry],
      cwd: repoRoot,
      env: {
        ...process.env,
        GODOT_WS_URL: fakeGodot.url,
      },
      stderr: 'pipe',
    });

    const client = new Client({ name: 'integration-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toContain('generate_scene_patch');
      expect(toolNames).toContain('apply_scene_patch');

      const resources = await client.listResources();
      const uris = resources.resources.map((r) => r.uri);
      expect(uris).toContain('godot/scene/edited');

      const templates = await client.listResourceTemplates();
      const templateUris = templates.resourceTemplates.map((t) => t.uriTemplate);
      expect(templateUris).toContain('godot/scene/edited/{properties_csv}');

      const edited = await client.readResource({ uri: 'godot/scene/edited' });
      const first = edited.contents[0];
      expect(first.type).toBe('resource');
      const text = (first as any).resource.text as string;
      const parsed = JSON.parse(text);
      expect(parsed.structure.id).toBe('root-1');
      expect(parsed.structure.children[0].id).toBe('child-1');

      const applied = await client.callTool({
        name: 'apply_scene_patch',
        arguments: { operations: [{ op: 'create_node', parent_path: '/root', node_type: 'Node', node_name: 'X' }] },
      });
      expect(applied.content[0].type).toBe('text');
    } finally {
      await transport.close();
      await fakeGodot.close();
    }
  });
});

