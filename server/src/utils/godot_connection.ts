import WebSocket from 'ws';

/**
 * Response from Godot server
 */
export interface GodotResponse {
  status: 'success' | 'error';
  result?: any;
  message?: string;
  commandId?: string;
}

/**
 * Command to send to Godot
 */
export interface GodotCommand {
  type: string;
  params: Record<string, any>;
  commandId: string;
}

/**
 * Manages WebSocket connection to the Godot editor
 */
export class GodotConnection {
  private ws: WebSocket | null = null;
  private connected = false;
  private mockMode = false;
  private agentId: string = '';
  private apiKey: string = '';
  private commandQueue: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private commandId = 0;

  /**
   * Creates a new Godot connection
   * @param url WebSocket URL for the Godot server
   * @param timeout Command timeout in ms
   * @param maxRetries Maximum number of connection retries
   * @param retryDelay Delay between retries in ms
   * @param apiKey Optional API key for agent authentication
   */
  constructor(
    private url: string = 'ws://localhost:9080',
    private timeout: number = 20000,
    private maxRetries: number = 3,
    private retryDelay: number = 2000,
    apiKey?: string
  ) {
    this.mockMode = this.url.startsWith('mock://');
    this.apiKey = apiKey || process.env.GODOT_MCP_API_KEY || '';
    console.error('GodotConnection created with URL:', this.url);
  }

  private async mockSendCommand<T = any>(type: string, params: Record<string, any> = {}): Promise<T> {
    switch (type) {
      case 'get_edited_scene_structure': {
        const includeProperties = Boolean(params.include_properties);
        const properties = Array.isArray(params.properties) ? params.properties : [];
        const outProps =
          includeProperties && properties.length > 0
            ? Object.fromEntries(properties.map((p: unknown) => [String(p), 'MOCK']))
            : undefined;

        return {
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
        } as T;
      }

      case 'apply_scene_patch': {
        const operations = Array.isArray(params.operations) ? params.operations : [];
        return { applied: operations.length, total: operations.length, used_undo_redo: false } as T;
      }

      case 'get_scene_text': {
        const p = String(params.path ?? 'res://TestScene.tscn');
        return { path: p, content: '[gd_scene format=3]\n[node name="Root" type="Node"]\n' } as T;
      }

      case 'get_scene_structure': {
        return { root_node: { name: 'Root', type: 'Node', path: '/root' }, nodes: [] } as T;
      }

      case 'list_project_files': {
        return { files: ['res://TestScene.tscn', 'res://scripts/player.gd'] } as T;
      }

      case 'get_file_text': {
        const p = String(params.path ?? 'res://README.md');
        return { path: p, content: 'MOCK FILE CONTENT\n' } as T;
      }

      case 'get_script': {
        const scriptPath = String(params.script_path ?? 'res://scripts/player.gd');
        return { script_path: scriptPath, content: '# mock\n' } as T;
      }

      case 'get_script_metadata': {
        const scriptPath = String(params.path ?? 'res://scripts/player.gd');
        return { path: scriptPath, language: 'gdscript' } as T;
      }

      default:
        throw new Error(`Mock Godot does not implement command: ${type}`);
    }
  }
  
  /**
   * Connects to the Godot WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.mockMode) {
      this.connected = true;
      return;
    }
    
    let retries = 0;
    
    const tryConnect = (): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        console.error(`Connecting to Godot WebSocket server at ${this.url}... (Attempt ${retries + 1}/${this.maxRetries + 1})`);
        let settled = false;
        
        // Use protocol option to match Godot's supported_protocols
        this.ws = new WebSocket(this.url, {
          protocol: 'json',
          handshakeTimeout: 8000,  // Increase handshake timeout
          perMessageDeflate: false, // Disable compression for compatibility
          headers: {
            'X-API-Key': this.apiKey  // Send API key in handshake header
          }
        });
        
        this.ws.on('open', () => {
          if (settled) return;
          settled = true;
          this.connected = true;
          console.error('Connected to Godot WebSocket server');
          resolve();
        });
        
        this.ws.on('message', (data: Buffer) => {
          try {
            const response: GodotResponse = JSON.parse(data.toString());
            console.error('Received response:', response);
            
            // Handle command responses
            if ('commandId' in response) {
              const commandId = response.commandId as string;
              const pendingCommand = this.commandQueue.get(commandId);
              
              if (pendingCommand) {
                clearTimeout(pendingCommand.timeout);
                this.commandQueue.delete(commandId);
                
                if (response.status === 'success') {
                  pendingCommand.resolve(response.result);
                } else {
                  pendingCommand.reject(new Error(response.message || 'Unknown error'));
                }
              }
            }
          } catch (error) {
            console.error('Error parsing response:', error);
          }
        });
        
        this.ws.on('error', (error) => {
          const err = error as Error;
          console.error('WebSocket error:', err);
          if (settled) return;
          settled = true;
          clearTimeout(connectionTimeout);
          try {
            this.ws?.terminate();
          } catch {
            // ignore
          }
          this.ws = null;
          reject(err);
        });
        
        this.ws.on('close', () => {
          if (this.connected) {
            console.error('Disconnected from Godot WebSocket server');
            this.connected = false;
          }
        });
        
        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            if (this.ws) {
              this.ws.terminate();
              this.ws = null;
            }
            if (settled) return;
            settled = true;
            reject(new Error('Connection timeout'));
          }
        }, this.timeout);
        
        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
        });
      });
    };
    
    // Try connecting with retries
    while (retries <= this.maxRetries) {
      try {
        await tryConnect();
        return;
      } catch (error) {
        retries++;
        
        if (retries <= this.maxRetries) {
          console.error(`Connection attempt failed. Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          throw error;
        }
      }
    }
  }
  
  /**
   * Sends a command to Godot and waits for a response
   * @param type Command type
   * @param params Command parameters
   * @returns Promise that resolves with the command result
   */
  async sendCommand<T = any>(type: string, params: Record<string, any> = {}): Promise<T> {
    if (this.mockMode) {
      return this.mockSendCommand(type, params);
    }
    if (!this.ws || !this.connected) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Failed to connect: ${(error as Error).message}`);
      }
    }
    
    return new Promise<T>((resolve, reject) => {
      const commandId = `cmd_${this.commandId++}`;
      
      const command: GodotCommand = {
        type,
        params,
        commandId
      };
      
      // Set timeout for command
      const timeoutId = setTimeout(() => {
        if (this.commandQueue.has(commandId)) {
          this.commandQueue.delete(commandId);
          reject(new Error(`Command timed out: ${type}`));
        }
      }, this.timeout);
      
      // Store the promise resolvers
      this.commandQueue.set(commandId, {
        resolve,
        reject,
        timeout: timeoutId
      });
      
      // Send the command
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(command));
      } else {
        clearTimeout(timeoutId);
        this.commandQueue.delete(commandId);
        reject(new Error('WebSocket not connected'));
      }
    });
  }
  
  /**
   * Disconnects from the Godot WebSocket server
   */
  disconnect(): void {
    if (this.mockMode) {
      this.connected = false;
      return;
    }
    if (this.ws) {
      // Clear all pending commands
      this.commandQueue.forEach((command, commandId) => {
        clearTimeout(command.timeout);
        command.reject(new Error('Connection closed'));
        this.commandQueue.delete(commandId);
      });
      
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
  
  /**
   * Checks if connected to Godot
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let connectionInstance: GodotConnection | null = null;

/**
 * Gets the singleton instance of GodotConnection
 * @param apiKey Optional API key for authentication
 */
export function getGodotConnection(apiKey?: string): GodotConnection {
  if (!connectionInstance) {
    const url = process.env.GODOT_WS_URL || 'ws://localhost:9080';
    const key = apiKey || process.env.GODOT_MCP_API_KEY || '';
    connectionInstance = new GodotConnection(url, 20000, 3, 2000, key);
  }
  return connectionInstance;
}
