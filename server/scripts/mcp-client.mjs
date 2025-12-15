#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function usage() {
  const msg = `
Usage:
  ./scripts/mcp list-tools
  ./scripts/mcp list-resources
  ./scripts/mcp list-templates
  ./scripts/mcp read <uri>
  ./scripts/mcp call <toolName> [--json <json>] [--file <path>]

Notes:
  - Spawns the MCP server at server/dist/index.js via stdio.
  - Pass GODOT_WS_URL to target a specific Godot editor websocket.

Examples:
  ./scripts/mcp read godot/scene/edited
  ./scripts/mcp call generate_scene_patch --json '{"apply":false,"desired":{"children":[]}}'
`;
  process.stderr.write(msg.trimStart());
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        flags.set(key, true);
      } else {
        flags.set(key, value);
        i++;
      }
    } else {
      positional.push(a);
    }
  }

  return { positional, flags };
}

async function readJsonArg(flags) {
  if (flags.has('file')) {
    const filePath = String(flags.get('file'));
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
  if (flags.has('json')) {
    return JSON.parse(String(flags.get('json')));
  }
  return {};
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || flags.has('help') || command === '-h' || command === '--help') {
    usage();
    process.exit(command ? 0 : 2);
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');
  const buildSentinel = path.join(repoRoot, 'server', 'dist', 'tools', 'node_tools.js');

  try {
    await fs.access(serverEntry);
    await fs.access(buildSentinel);
  } catch {
    process.stderr.write(
      'error: server is not built. Run: ./scripts/build-server (or: npm -C server run build)\n',
    );
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: repoRoot,
    env: {
      ...process.env,
    },
  });

  const client = new Client(
    { name: 'godot-mcp-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  try {
    if (command === 'list-tools') {
      const res = await client.listTools();
      process.stdout.write(JSON.stringify(res.tools, null, 2) + '\n');
      return;
    }

    if (command === 'list-resources') {
      const res = await client.listResources();
      process.stdout.write(JSON.stringify(res.resources, null, 2) + '\n');
      return;
    }

    if (command === 'list-templates') {
      const res = await client.listResourceTemplates();
      process.stdout.write(JSON.stringify(res.resourceTemplates, null, 2) + '\n');
      return;
    }

    if (command === 'read') {
      const uri = positional[1];
      if (!uri) {
        process.stderr.write('error: missing <uri>\n');
        process.exit(2);
      }
      const res = await client.readResource({ uri });
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      return;
    }

    if (command === 'call') {
      const toolName = positional[1];
      if (!toolName) {
        process.stderr.write('error: missing <toolName>\n');
        process.exit(2);
      }
      const args = await readJsonArg(flags);
      const res = await client.callTool({ name: toolName, arguments: args });
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      return;
    }

    process.stderr.write(`error: unknown command "${command}"\n`);
    usage();
    process.exit(2);
  } finally {
    await transport.close();
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err?.stack || err}\n`);
  process.exit(1);
});
