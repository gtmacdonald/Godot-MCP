import { z } from 'zod';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';
import { MCPTool, CommandResult } from '../utils/types.js';
import { generateScenePatch, ScenePatchOperation, DesiredSceneNode, SceneTreeNode } from '../utils/scene_patch.js';

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

type ApplyScenePatchOperation =
  | {
      op: 'create_node';
      parent_path?: string;
      parent_id?: string;
      node_type?: string;
      node_name: string;
      properties?: Record<string, any>;
      set_owner?: boolean;
    }
  | {
      op: 'delete_node';
      node_path?: string;
      node_id?: string;
    }
  | {
      op: 'set_property';
      node_path?: string;
      node_id?: string;
      property: string;
      value: any;
    }
  | {
      op: 'rename_node';
      node_path?: string;
      node_id?: string;
      new_name: string;
    }
  | {
      op: 'reparent_node';
      node_path?: string;
      node_id?: string;
      new_parent_path?: string;
      new_parent_id?: string;
      keep_global_transform?: boolean;
      index?: number;
    };

interface ApplyScenePatchParams {
  operations: ApplyScenePatchOperation[];
  strict?: boolean;
}

interface GenerateScenePatchParams {
  desired: { children: DesiredSceneNode[] };
  allow_delete?: boolean;
  strict_types?: boolean;
  detect_renames?: boolean;
  reorder_children?: boolean;
  diff_properties?: boolean;
  apply?: boolean;
}

/**
 * Definition for scene tools - operations that manipulate Godot scenes
 */
type GetConnection = () => GodotConnection;

export function createSceneTools(getConnection: GetConnection = getGodotConnection): MCPTool[] {
  const desiredNodeSchema: z.ZodType<DesiredSceneNode> = z.lazy(() =>
    z.object({
      id: z.string().optional().describe('Stable node id from get_edited_scene_structure (recommended for moves/renames)'),
      name: z.string(),
      type: z.string().optional(),
      properties: z.record(z.any()).optional(),
      children: z.array(desiredNodeSchema).optional(),
    }),
  );

  const resolveScenePatchOperations = async (
    godot: GodotConnection,
    operations: ApplyScenePatchOperation[],
  ): Promise<ScenePatchOperation[]> => {
    for (const op of operations) {
      switch (op.op) {
        case 'create_node':
          if (!op.node_name) {
            throw new Error('create_node requires node_name');
          }
          break;
        case 'delete_node':
          if (!op.node_path && !op.node_id) {
            throw new Error('delete_node requires node_path or node_id');
          }
          break;
        case 'set_property':
          if (!op.node_path && !op.node_id) {
            throw new Error('set_property requires node_path or node_id');
          }
          break;
        case 'rename_node':
          if (!op.node_path && !op.node_id) {
            throw new Error('rename_node requires node_path or node_id');
          }
          break;
        case 'reparent_node':
          if (!op.node_path && !op.node_id) {
            throw new Error('reparent_node requires node_path or node_id');
          }
          if (!op.new_parent_path && !op.new_parent_id) {
            throw new Error('reparent_node requires new_parent_path or new_parent_id');
          }
          break;
      }
    }

    const needsIds = operations.some(
      op =>
        (op.op === 'create_node' && !!op.parent_id) ||
        (op.op !== 'create_node' && 'node_id' in op && !!op.node_id) ||
        (op.op === 'reparent_node' && !!op.new_parent_id),
    );

    const normalizeWithoutIds = (op: ApplyScenePatchOperation): ScenePatchOperation => {
      switch (op.op) {
        case 'create_node':
          return {
            op: 'create_node',
            parent_path: op.parent_path,
            node_type: op.node_type,
            node_name: op.node_name,
            properties: op.properties,
            set_owner: op.set_owner,
          };
        case 'delete_node':
          return { op: 'delete_node', node_path: op.node_path ?? '' };
        case 'set_property':
          return { op: 'set_property', node_path: op.node_path ?? '', property: op.property, value: op.value };
        case 'rename_node':
          return { op: 'rename_node', node_path: op.node_path ?? '', new_name: op.new_name };
        case 'reparent_node':
          return {
            op: 'reparent_node',
            node_path: op.node_path ?? '',
            new_parent_path: op.new_parent_path ?? '',
            keep_global_transform: op.keep_global_transform,
            index: op.index,
          };
      }
    };

    if (!needsIds) {
      return operations.map(normalizeWithoutIds);
    }

    const edited = await godot.sendCommand<{ structure: SceneTreeNode }>('get_edited_scene_structure', {
      ensure_ids: true,
    });

    const currentPathById = new Map<string, string>();
    const indexIds = (node: SceneTreeNode) => {
      if (node.id) currentPathById.set(node.id, node.path);
      for (const child of node.children ?? []) indexIds(child);
    };
    indexIds(edited.structure);

    const resolveIdToPath = (id: string, label: string): string => {
      const path = currentPathById.get(id);
      if (!path) throw new Error(`${label} id not found in edited scene: ${id}`);
      return path;
    };

    const resolved: ScenePatchOperation[] = [];
    for (const op of operations) {
      switch (op.op) {
        case 'create_node': {
          let parentPath = op.parent_path ?? '/root';
          if (op.parent_id) {
            const resolvedParentPath = resolveIdToPath(op.parent_id, 'parent');
            if (op.parent_path && op.parent_path !== resolvedParentPath) {
              throw new Error(
                `parent_id ${op.parent_id} resolves to ${resolvedParentPath}, but parent_path was ${op.parent_path}`,
              );
            }
            parentPath = resolvedParentPath;
          }
          resolved.push({
            op: 'create_node',
            parent_path: parentPath,
            node_type: op.node_type,
            node_name: op.node_name,
            properties: op.properties,
            set_owner: op.set_owner,
          });
          break;
        }
        case 'delete_node': {
          let nodePath = op.node_path ?? '';
          if (op.node_id) {
            const resolvedNodePath = resolveIdToPath(op.node_id, 'node');
            if (op.node_path && op.node_path !== resolvedNodePath) {
              throw new Error(
                `node_id ${op.node_id} resolves to ${resolvedNodePath}, but node_path was ${op.node_path}`,
              );
            }
            nodePath = resolvedNodePath;
            currentPathById.delete(op.node_id);
          }
          resolved.push({ op: 'delete_node', node_path: nodePath });
          break;
        }
        case 'set_property': {
          let nodePath = op.node_path ?? '';
          if (op.node_id) {
            const resolvedNodePath = resolveIdToPath(op.node_id, 'node');
            if (op.node_path && op.node_path !== resolvedNodePath) {
              throw new Error(
                `node_id ${op.node_id} resolves to ${resolvedNodePath}, but node_path was ${op.node_path}`,
              );
            }
            nodePath = resolvedNodePath;
          }
          resolved.push({ op: 'set_property', node_path: nodePath, property: op.property, value: op.value });
          break;
        }
        case 'rename_node': {
          let nodePath = op.node_path ?? '';
          if (op.node_id) {
            const resolvedNodePath = resolveIdToPath(op.node_id, 'node');
            if (op.node_path && op.node_path !== resolvedNodePath) {
              throw new Error(
                `node_id ${op.node_id} resolves to ${resolvedNodePath}, but node_path was ${op.node_path}`,
              );
            }
            nodePath = resolvedNodePath;
            const parentPath = nodePath.substring(0, nodePath.lastIndexOf('/'));
            currentPathById.set(op.node_id, `${parentPath}/${op.new_name}`);
          }
          resolved.push({ op: 'rename_node', node_path: nodePath, new_name: op.new_name });
          break;
        }
        case 'reparent_node': {
          let nodePath = op.node_path ?? '';
          let newParentPath = op.new_parent_path ?? '';
          if (op.node_id) {
            const resolvedNodePath = resolveIdToPath(op.node_id, 'node');
            if (op.node_path && op.node_path !== resolvedNodePath) {
              throw new Error(
                `node_id ${op.node_id} resolves to ${resolvedNodePath}, but node_path was ${op.node_path}`,
              );
            }
            nodePath = resolvedNodePath;
          }
          if (op.new_parent_id) {
            const resolvedParentPath = resolveIdToPath(op.new_parent_id, 'new_parent');
            if (op.new_parent_path && op.new_parent_path !== resolvedParentPath) {
              throw new Error(
                `new_parent_id ${op.new_parent_id} resolves to ${resolvedParentPath}, but new_parent_path was ${op.new_parent_path}`,
              );
            }
            newParentPath = resolvedParentPath;
          }
          if (op.node_id && newParentPath) {
            const nodeName = nodePath.split('/').pop()!;
            currentPathById.set(op.node_id, `${newParentPath}/${nodeName}`);
          }
          resolved.push({
            op: 'reparent_node',
            node_path: nodePath,
            new_parent_path: newParentPath,
            keep_global_transform: op.keep_global_transform,
            index: op.index,
          });
          break;
        }
      }
    }

    return resolved;
  };

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
          parent_id: z.string().optional().describe('Parent node id (preferred over parent_path)'),
          node_type: z.string().optional().describe('Node type to create (default: "Node")'),
          node_name: z.string().describe('Name for the new node'),
          properties: z.record(z.any()).optional().describe('Optional properties to set after creation'),
          set_owner: z.boolean().optional().describe('Whether to set owner for serialization (default: true)'),
        }),
        z.object({
          op: z.literal('delete_node'),
          node_path: z.string().optional().describe('Path to the node to delete'),
          node_id: z.string().optional().describe('Stable node id from get_edited_scene_structure'),
        }),
        z.object({
          op: z.literal('set_property'),
          node_path: z.string().optional().describe('Path to the node to edit'),
          node_id: z.string().optional().describe('Stable node id from get_edited_scene_structure'),
          property: z.string().describe('Property name to set'),
          value: z.any().describe('New value for the property'),
        }),
        z.object({
          op: z.literal('rename_node'),
          node_path: z.string().optional().describe('Path to the node to rename'),
          node_id: z.string().optional().describe('Stable node id from get_edited_scene_structure'),
          new_name: z.string().describe('New node name'),
        }),
        z.object({
          op: z.literal('reparent_node'),
          node_path: z.string().optional().describe('Path to the node to move'),
          node_id: z.string().optional().describe('Stable node id from get_edited_scene_structure'),
          new_parent_path: z.string().optional().describe('New parent node path'),
          new_parent_id: z.string().optional().describe('Stable node id for the new parent'),
          keep_global_transform: z.boolean().optional().describe('Preserve global transform while reparenting'),
          index: z.number().int().nonnegative().optional().describe('Optional child index under new parent'),
        }),
      ])).min(1),
      strict: z.boolean().optional().describe('If true, stop on first error (default: true)'),
    }),
    execute: async ({ operations, strict = true }: ApplyScenePatchParams): Promise<string> => {
      const godot = getConnection();

      try {
        const resolvedOperations = await resolveScenePatchOperations(godot, operations);
        const result = await godot.sendCommand<CommandResult>('apply_scene_patch', {
          operations: resolvedOperations,
          strict,
        });
        const errors: string[] = Array.isArray(result.errors) ? result.errors : [];
        let msg = `Applied ${result.applied}/${result.total} operations`;
        if (errors.length) msg += ` (${errors.length} errors)`;
        return msg;
      } catch (error) {
        throw new Error(`Failed to apply scene patch: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'generate_scene_patch',
    description: 'Generate a scene patch (operations) to transform the edited scene toward a desired tree',
    parameters: z.object({
      desired: z.object({
        children: z.array(desiredNodeSchema).min(1),
      }),
      allow_delete: z.boolean().optional().describe('If true, delete nodes not present in desired (default: false)'),
      strict_types: z.boolean().optional().describe('If true, error on node type mismatches (default: true)'),
      detect_renames: z.boolean().optional().describe('If true, attempt safe rename detection within a parent (default: false)'),
      reorder_children: z.boolean().optional().describe('If true, attempt to reorder children to match desired order (default: false)'),
      diff_properties: z.boolean().optional().describe('If true, only emit set_property when value differs (default: true)'),
      apply: z.boolean().optional().describe('If true, also apply the generated patch (default: false)'),
    }),
    execute: async ({
      desired,
      allow_delete = false,
      strict_types = true,
      detect_renames = false,
      reorder_children = false,
      diff_properties = true,
      apply = false,
    }: GenerateScenePatchParams): Promise<string> => {
      const godot = getConnection();

      try {
        const collectDesiredPropertyNames = (nodes: DesiredSceneNode[], into: Set<string>) => {
          for (const node of nodes) {
            for (const key of Object.keys(node.properties ?? {})) into.add(key);
            collectDesiredPropertyNames(node.children ?? [], into);
          }
        };

        const desiredPropertyNames = new Set<string>();
        if (diff_properties) {
          collectDesiredPropertyNames(desired.children ?? [], desiredPropertyNames);
        }

        const edited = await godot.sendCommand<{ scene_path: string; structure: SceneTreeNode }>(
          'get_edited_scene_structure',
          diff_properties && desiredPropertyNames.size > 0
            ? { include_properties: true, properties: Array.from(desiredPropertyNames), ensure_ids: true }
            : { ensure_ids: true },
        );

        const stableStringify = (value: any): string => {
          if (value === undefined) return 'undefined';
          if (value === null || typeof value !== 'object') return JSON.stringify(value);
          if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
          const keys = Object.keys(value).sort();
          return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
        };

        const { operations: generated, errors, aliases } = generateScenePatch(edited.structure, desired, {
          allow_delete,
          strict_types,
          detect_renames,
          reorder_children,
        });

        if (strict_types && errors.length) {
          throw new Error(errors[0]);
        }

        const reverseAliases = new Map<string, string>();
        for (const [oldPath, newPath] of Object.entries(aliases)) reverseAliases.set(newPath, oldPath);

        let operations = generated;

        if (diff_properties) {
          const propsByPath = new Map<string, Record<string, any>>();
          const buildPropsIndex = (node: any) => {
            if (node && typeof node === 'object') {
              if (typeof node.path === 'string' && node.properties && typeof node.properties === 'object') {
                propsByPath.set(node.path, node.properties);
              }
              for (const child of node.children ?? []) buildPropsIndex(child);
            }
          };
          buildPropsIndex(edited.structure as any);

          const getNodeProps = async (nodePath: string): Promise<Record<string, any> | null> => {
            if (propsByPath.has(nodePath)) return propsByPath.get(nodePath)!;
            try {
              const result = await godot.sendCommand<CommandResult>('get_node_properties', { node_path: nodePath });
              const props = (result as any)?.properties ?? null;
              if (props) propsByPath.set(nodePath, props);
              return props;
            } catch {
              return null;
            }
          };

          const filtered: ScenePatchOperation[] = [];
          for (const op of operations) {
            if (op.op !== 'set_property') {
              filtered.push(op);
              continue;
            }

            const queryPath = reverseAliases.get(op.node_path) ?? op.node_path;
            const props = await getNodeProps(queryPath);
            if (!props || !(op.property in props)) {
              filtered.push(op);
              continue;
            }

            const current = props[op.property];
            if (stableStringify(current) === stableStringify(op.value)) {
              continue;
            }

            filtered.push(op);
          }
          operations = filtered;
        }

        let output = `Generated ${operations.length} operations for ${edited.scene_path}`;
        if (errors.length) output += ` (${errors.length} warnings)`;
        output += `\n\n\`\`\`json\n${JSON.stringify(operations, null, 2)}\n\`\`\``;

        if (apply && operations.length) {
          const applied = await godot.sendCommand<CommandResult>('apply_scene_patch', {
            operations,
            strict: true,
          });
          output += `\n\nApply result: ${applied.applied}/${applied.total}`;
        }

        return output;
      } catch (error) {
        throw new Error(`Failed to generate scene patch: ${(error as Error).message}`);
      }
    },
  },
];
}

export const sceneTools: MCPTool[] = createSceneTools();
