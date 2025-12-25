import { z } from 'zod';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Type definitions for game tool parameters
 */

interface CaptureGameFrameParams {
  include_instrumentation?: boolean;
  save_to_file?: string;
  format?: 'png' | 'jpg' | 'jpeg' | 'webp';
}

interface CaptureNodeViewportParams {
  node_path: string;
}

interface SaveScreenshotParams {
  path: string;
  format?: 'png' | 'jpg' | 'jpeg' | 'webp';
}

interface GetGameStateParams {
  // No parameters needed
}

type GetConnection = () => GodotConnection;

/**
 * Definition for game tools - operations for game screenshots and runtime state
 */
export function createGameTools(getConnection: GetConnection = getGodotConnection): MCPTool[] {
  return [
    {
      name: 'capture_game_frame',
      description: 'Capture the current game viewport with optional instrumentation data. Returns base64-encoded image data with metadata.',
      parameters: z.object({
        include_instrumentation: z.boolean().optional()
          .describe('Include instrumentation data (timestamp, scene info, player state, camera position)'),
        save_to_file: z.string().optional()
          .describe('Optional file path to save the screenshot (e.g., "res://screenshots/frame.png")'),
        format: z.enum(['png', 'jpg', 'jpeg', 'webp']).optional()
          .describe('Image format (default: png)'),
      }),
      execute: async ({ include_instrumentation = true, save_to_file = '', format = 'png' }: CaptureGameFrameParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('capture_game_frame', {
            include_instrumentation,
            save_to_file,
            format,
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to capture game frame');
          }

          let output = `Captured game frame:\n`;
          output += `Resolution: ${result.width}x${result.height}\n`;
          output += `Format: ${result.format}\n`;
          output += `Image Data: ${result.image_data.substring(0, 50)}... (${result.image_data.length} chars base64)\n`;

          if (save_to_file && result.saved_path) {
            output += `Saved to: ${result.saved_path}\n`;
          }

          if (result.instrumentation && Object.keys(result.instrumentation).length > 0) {
            output += `\nInstrumentation:\n${JSON.stringify(result.instrumentation, null, 2)}`;
          }

          return output;
        } catch (error) {
          throw new Error(`Failed to capture game frame: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'capture_node_viewport',
      description: 'Capture a specific node\'s viewport (useful for SubViewport containers or specific CanvasItem nodes)',
      parameters: z.object({
        node_path: z.string()
          .describe('Path to the node to capture (e.g. "/root/Main/SubViewport")'),
      }),
      execute: async ({ node_path }: CaptureNodeViewportParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('capture_node_viewport', { node_path });

          if (!result.success) {
            throw new Error(result.error || 'Failed to capture node viewport');
          }

          let output = `Captured node viewport:\n`;
          output += `Node: ${result.instrumentation?.node?.name || node_path}\n`;
          output += `Resolution: ${result.width}x${result.height}\n`;
          output += `Format: ${result.format}\n`;
          output += `Image Data: ${result.image_data.substring(0, 50)}... (${result.image_data.length} chars base64)\n`;

          if (result.instrumentation) {
            output += `\nNode Info:\n${JSON.stringify(result.instrumentation, null, 2)}`;
          }

          return output;
        } catch (error) {
          throw new Error(`Failed to capture node viewport: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'save_screenshot',
      description: 'Save a screenshot of the current game viewport to a file',
      parameters: z.object({
        path: z.string()
          .describe('File path to save the screenshot (e.g. "res://screenshots/game.png")'),
        format: z.enum(['png', 'jpg', 'jpeg', 'webp']).optional()
          .describe('Image format (default: png)'),
      }),
      execute: async ({ path, format = 'png' }: SaveScreenshotParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('save_screenshot', {
            path,
            format,
          });

          return `Screenshot saved successfully!\nPath: ${result.path}\nFormat: ${result.format}\nResolution: ${result.width}x${result.height}`;
        } catch (error) {
          throw new Error(`Failed to save screenshot: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'get_game_state',
      description: 'Get the current game state without capturing an image. Returns whether game is playing, scene info, FPS, and timestamp.',
      parameters: z.object({}),
      execute: async (_params: GetGameStateParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('get_game_state', {});

          let output = `Game State:\n`;
          output += `Playing: ${result.is_playing ? 'Yes' : 'No'}\n`;
          output += `FPS: ${result.fps}\n`;
          output += `Current Scene: ${result.current_scene || 'None'}\n`;
          output += `Timestamp: ${result.timestamp}\n`;

          if (result.runtime_scene) {
            output += `\nRuntime Scene:\n`;
            output += `  Name: ${result.runtime_scene.name}\n`;
            output += `  Type: ${result.runtime_scene.root_type}\n`;
            output += `  Children: ${result.runtime_scene.child_count}\n`;
          }

          return output;
        } catch (error) {
          throw new Error(`Failed to get game state: ${(error as Error).message}`);
        }
      },
    },
  ];
}

export const gameTools: MCPTool[] = createGameTools();
