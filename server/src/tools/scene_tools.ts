import { z } from 'zod';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';
import { MCPTool, CommandResult } from '../utils/types.js';

/**
 * Type definitions for scene tool parameters
 */
interface SaveSceneParams {
  path?: string;
}

interface OpenSceneParams {
  path: string;
}

interface CreateSceneParams {
  path: string;
  root_node_type?: string;
}

interface CreateResourceParams {
  resource_type: string;
  resource_path: string;
  properties?: Record<string, any>;
}

type ScenePatchOperation =
  | {
      op: 'create_node';
      parent_path?: string;
      node_type?: string;
      node_name: string;
      properties?: Record<string, any>;
      set_owner?: boolean;
    }
  | {
      op: 'delete_node';
      node_path: string;
    }
  | {
      op: 'set_property';
      node_path: string;
      property: string;
      value: any;
    }
  | {
      op: 'rename_node';
      node_path: string;
      new_name: string;
    }
  | {
      op: 'reparent_node';
      node_path: string;
      new_parent_path: string;
      keep_global_transform?: boolean;
      index?: number;
    };

interface ApplyScenePatchParams {
  operations: ScenePatchOperation[];
  strict?: boolean;
}

/**
 * Definition for scene tools - operations that manipulate Godot scenes
 */
type GetConnection = () => GodotConnection;

export function createSceneTools(getConnection: GetConnection = getGodotConnection): MCPTool[] {
  return [
  {
    name: 'create_scene',
    description: 'Create a new empty scene with optional root node type',
    parameters: z.object({
      path: z.string()
        .describe('Path where the new scene will be saved (e.g. "res://scenes/new_scene.tscn")'),
      root_node_type: z.string().optional()
        .describe('Type of root node to create (e.g. "Node2D", "Node3D", "Control"). Defaults to "Node" if not specified'),
    }),
    execute: async ({ path, root_node_type = "Node" }: CreateSceneParams): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('create_scene', { path, root_node_type });
        return `Created new scene at ${result.scene_path} with root node type ${result.root_node_type}`;
      } catch (error) {
        throw new Error(`Failed to create scene: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'save_scene',
    description: 'Save the current scene to disk',
    parameters: z.object({
      path: z.string().optional()
        .describe('Path where the scene will be saved (e.g. "res://scenes/main.tscn"). If not provided, uses current scene path.'),
    }),
    execute: async ({ path }: SaveSceneParams): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('save_scene', { path });
        return `Saved scene to ${result.scene_path}`;
      } catch (error) {
        throw new Error(`Failed to save scene: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'open_scene',
    description: 'Open a scene in the editor',
    parameters: z.object({
      path: z.string()
        .describe('Path to the scene file to open (e.g. "res://scenes/main.tscn")'),
    }),
    execute: async ({ path }: OpenSceneParams): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('open_scene', { path });
        return `Opened scene at ${result.scene_path}`;
      } catch (error) {
        throw new Error(`Failed to open scene: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'get_current_scene',
    description: 'Get information about the currently open scene',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('get_current_scene', {});
        
        return `Current scene: ${result.scene_path}\nRoot node: ${result.root_node_name} (${result.root_node_type})`;
      } catch (error) {
        throw new Error(`Failed to get current scene: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'get_project_info',
    description: 'Get information about the current Godot project',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('get_project_info', {});
        
        const godotVersion = `${result.godot_version.major}.${result.godot_version.minor}.${result.godot_version.patch}`;
        
        let output = `Project Name: ${result.project_name}\n`;
        output += `Project Version: ${result.project_version}\n`;
        output += `Project Path: ${result.project_path}\n`;
        output += `Godot Version: ${godotVersion}\n`;
        
        if (result.current_scene) {
          output += `Current Scene: ${result.current_scene}`;
        } else {
          output += "No scene is currently open";
        }
        
        return output;
      } catch (error) {
        throw new Error(`Failed to get project info: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'create_resource',
    description: 'Create a new resource in the project',
    parameters: z.object({
      resource_type: z.string()
        .describe('Type of resource to create (e.g. "ImageTexture", "AudioStreamMP3", "StyleBoxFlat")'),
      resource_path: z.string()
        .describe('Path where the resource will be saved (e.g. "res://resources/style.tres")'),
      properties: z.record(z.any()).optional()
        .describe('Dictionary of property values to set on the resource'),
    }),
    execute: async ({ resource_type, resource_path, properties = {} }: CreateResourceParams): Promise<string> => {
      const godot = getConnection();
      
      try {
        const result = await godot.sendCommand<CommandResult>('create_resource', {
          resource_type,
          resource_path,
          properties,
        });
        
        return `Created ${resource_type} resource at ${result.resource_path}`;
      } catch (error) {
        throw new Error(`Failed to create resource: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'apply_scene_patch',
    description: 'Apply a sequence of node operations to the currently edited scene',
    parameters: z.object({
      operations: z.array(z.discriminatedUnion('op', [
        z.object({
          op: z.literal('create_node'),
          parent_path: z.string().optional().describe('Parent node path (default: "/root")'),
          node_type: z.string().optional().describe('Node type to create (default: "Node")'),
          node_name: z.string().describe('Name for the new node'),
          properties: z.record(z.any()).optional().describe('Optional properties to set after creation'),
          set_owner: z.boolean().optional().describe('Whether to set owner for serialization (default: true)'),
        }),
        z.object({
          op: z.literal('delete_node'),
          node_path: z.string().describe('Path to the node to delete'),
        }),
        z.object({
          op: z.literal('set_property'),
          node_path: z.string().describe('Path to the node to edit'),
          property: z.string().describe('Property name to set'),
          value: z.any().describe('New value for the property'),
        }),
        z.object({
          op: z.literal('rename_node'),
          node_path: z.string().describe('Path to the node to rename'),
          new_name: z.string().describe('New node name'),
        }),
        z.object({
          op: z.literal('reparent_node'),
          node_path: z.string().describe('Path to the node to move'),
          new_parent_path: z.string().describe('New parent node path'),
          keep_global_transform: z.boolean().optional().describe('Preserve global transform while reparenting'),
          index: z.number().int().nonnegative().optional().describe('Optional child index under new parent'),
        }),
      ])).min(1),
      strict: z.boolean().optional().describe('If true, stop on first error (default: true)'),
    }),
    execute: async ({ operations, strict = true }: ApplyScenePatchParams): Promise<string> => {
      const godot = getConnection();

      try {
        const result = await godot.sendCommand<CommandResult>('apply_scene_patch', { operations, strict });
        const errors: string[] = Array.isArray(result.errors) ? result.errors : [];
        let msg = `Applied ${result.applied}/${result.total} operations`;
        if (errors.length) msg += ` (${errors.length} errors)`;
        return msg;
      } catch (error) {
        throw new Error(`Failed to apply scene patch: ${(error as Error).message}`);
      }
    },
  },
];
}

export const sceneTools: MCPTool[] = createSceneTools();
