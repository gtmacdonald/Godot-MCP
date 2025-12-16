import { WebSocketServer } from 'ws';

type FakeGodotServer = {
  url: string;
  close: () => Promise<void>;
};

type GodotCommand = {
  type?: string;
  params?: Record<string, unknown>;
  commandId?: string;
};

function jsonResponse(commandId: string | undefined, result: unknown) {
  return JSON.stringify({ status: 'success', result, commandId });
}

function jsonError(commandId: string | undefined, message: string) {
  return JSON.stringify({ status: 'error', message, commandId });
}

export async function startFakeGodotServer(): Promise<FakeGodotServer> {
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    handleProtocols: (protocols) => (protocols.has('json') ? 'json' : false),
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      let command: GodotCommand;
      try {
        command = JSON.parse(data.toString());
      } catch {
        ws.send(jsonError(undefined, 'Invalid JSON'));
        return;
      }

      const type = command.type ?? '';
      const commandId = command.commandId;

      switch (type) {
        case 'get_edited_scene_structure': {
          const includeProperties = Boolean(command.params?.include_properties);
          const properties = Array.isArray(command.params?.properties) ? command.params?.properties : [];
          const outProps =
            includeProperties && properties.length > 0
              ? Object.fromEntries(properties.map((p) => [String(p), 'FAKE']))
              : undefined;

          ws.send(
            jsonResponse(commandId, {
              scene_path: 'res://TestScene.tscn',
              structure: {
                name: 'Root',
                type: 'Node',
                path: '/root',
                id: 'root-1',
                properties: outProps,
                children: [
                  {
                    name: 'Child',
                    type: 'Node',
                    path: '/root/Child',
                    id: 'child-1',
                    children: [],
                  },
                ],
              },
            }),
          );
          return;
        }

        case 'apply_scene_patch': {
          const operations = Array.isArray(command.params?.operations) ? command.params?.operations : [];
          ws.send(
            jsonResponse(commandId, {
              applied: operations.length,
              total: operations.length,
              used_undo_redo: false,
            }),
          );
          return;
        }

        case 'get_scene_text': {
          const path = String(command.params?.path ?? 'res://TestScene.tscn');
          ws.send(
            jsonResponse(commandId, {
              path,
              content: '[gd_scene format=3]\n[node name="Root" type="Node"]\n',
            }),
          );
          return;
        }

        case 'get_scene_structure': {
          ws.send(
            jsonResponse(commandId, {
              root_node: { name: 'Root', type: 'Node', path: '/root' },
              nodes: [],
            }),
          );
          return;
        }

        case 'list_project_files': {
          ws.send(
            jsonResponse(commandId, {
              files: ['res://TestScene.tscn', 'res://scripts/player.gd'],
            }),
          );
          return;
        }

        case 'get_file_text': {
          const path = String(command.params?.path ?? 'res://README.md');
          ws.send(jsonResponse(commandId, { path, content: 'FAKE FILE CONTENT\n' }));
          return;
        }

        case 'get_script': {
          const scriptPath = String(command.params?.script_path ?? 'res://scripts/player.gd');
          ws.send(jsonResponse(commandId, { script_path: scriptPath, content: '# fake\n' }));
          return;
        }

        case 'get_script_metadata': {
          const scriptPath = String(command.params?.path ?? 'res://scripts/player.gd');
          ws.send(jsonResponse(commandId, { path: scriptPath, language: 'gdscript' }));
          return;
        }

        default: {
          ws.send(jsonError(commandId, `Unknown command: ${type}`));
        }
      }
    });
  });

  await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
  const address = wss.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind fake Godot server');
  }

  const url = `ws://127.0.0.1:${address.port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
