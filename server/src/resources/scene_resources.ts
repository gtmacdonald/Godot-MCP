import { Resource, ResourceTemplate } from 'fastmcp';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';
import { z } from 'zod';

/**
 * Resource that provides a list of all scenes in the project
 */
type GetConnection = () => GodotConnection;

export function createSceneListResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/scenes',
    name: 'Godot Scene List',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to list all scenes
        const result = await godot.sendCommand('list_project_files', {
          extensions: ['.tscn', '.scn']
        });
        
        if (result && result.files) {
          return {
            text: JSON.stringify({
              scenes: result.files,
              count: result.files.length
            })
          };
        } else {
          return {
            text: JSON.stringify({
              scenes: [],
              count: 0
            })
          };
        }
      } catch (error) {
        console.error('Error fetching scene list:', error);
        throw error;
      }
    }
  };
}

export const sceneListResource: Resource = createSceneListResource();

/**
 * Resource that provides detailed information about a specific scene
 */
export function createSceneStructureResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
      uri: 'godot/scene/current',
      name: 'Godot Scene Structure',
      mimeType: 'application/json',
      async load() {
          const godot = getConnection();
        
          try {
              // Call a command on the Godot side to get current scene structure
              const result = await godot.sendCommand('get_current_scene_structure', {});
              
              return {
                  text: JSON.stringify(result)
              };
          } catch (error) {
              console.error('Error fetching scene structure:', error);
              throw error;
          }
      }
  };
}

export const sceneStructureResource: Resource = createSceneStructureResource();

/**
 * Resource template that provides raw scene text by path.
 */
export function createSceneContentTemplate(
  getConnection: GetConnection = getGodotConnection,
): ResourceTemplate {
  return {
    uriTemplate: 'godot/scene/{path}',
    name: 'Godot Scene Content (by path)',
    mimeType: 'text/plain',
    arguments: [
      {
        name: 'path',
        description: 'Scene path (e.g. "res://scenes/main.tscn")',
        required: true,
        complete: async (value) => {
          const godot = getConnection();
          try {
            const result = await godot.sendCommand('list_project_files', {
              extensions: ['.tscn', '.scn'],
            });
            const files: string[] = result?.files ?? [];
            return { values: files.filter(f => f.includes(value ?? '')) };
          } catch {
            return { values: [] };
          }
        },
      },
    ],
    async load({ path }: { path: string }) {
      const godot = getConnection();
      const result = await godot.sendCommand('get_scene_text', { path });
      return { text: result.content ?? '' };
    },
  };
}

export const sceneContentTemplate: ResourceTemplate = createSceneContentTemplate();

/**
 * Resource template that provides scene structure by path.
 */
export function createSceneStructureTemplate(
  getConnection: GetConnection = getGodotConnection,
): ResourceTemplate {
  return {
    uriTemplate: 'godot/scene/{path}/structure',
    name: 'Godot Scene Structure (by path)',
    mimeType: 'application/json',
    arguments: [
      {
        name: 'path',
        description: 'Scene path (e.g. "res://scenes/main.tscn")',
        required: true,
        complete: async (value) => {
          const godot = getConnection();
          try {
            const result = await godot.sendCommand('list_project_files', {
              extensions: ['.tscn', '.scn'],
            });
            const files: string[] = result?.files ?? [];
            return { values: files.filter(f => f.includes(value ?? '')) };
          } catch {
            return { values: [] };
          }
        },
      },
    ],
    async load({ path }: { path: string }) {
      const godot = getConnection();
      const result = await godot.sendCommand('get_scene_structure', { path });
      return { text: JSON.stringify(result) };
    },
  };
}

export const sceneStructureTemplate: ResourceTemplate = createSceneStructureTemplate();
