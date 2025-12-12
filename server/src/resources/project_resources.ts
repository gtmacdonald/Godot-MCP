import { Resource } from 'fastmcp';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';

/**
 * Resource that provides information about the Godot project structure
 */
type GetConnection = () => GodotConnection;

export function createProjectStructureResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/project/structure',
    name: 'Godot Project Structure',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get project structure
        const result = await godot.sendCommand('get_project_structure');
        
        return {
          text: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error fetching project structure:', error);
        throw error;
      }
    }
  };
}

export const projectStructureResource: Resource = createProjectStructureResource();

/**
 * Resource that provides project settings
 */
export function createProjectSettingsResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/project/settings',
    name: 'Godot Project Settings',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get project settings
        const result = await godot.sendCommand('get_project_settings');
        
        return {
          text: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error fetching project settings:', error);
        throw error;
      }
    }
  };
}

export const projectSettingsResource: Resource = createProjectSettingsResource();

/**
 * Resource that provides a list of all project resources
 */
export function createProjectResourcesResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/project/resources',
    name: 'Godot Project Resources',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get a list of all resources
        const result = await godot.sendCommand('list_project_resources');
        
        return {
          text: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error fetching project resources:', error);
        throw error;
      }
    }
  };
}

export const projectResourcesResource: Resource = createProjectResourcesResource();
