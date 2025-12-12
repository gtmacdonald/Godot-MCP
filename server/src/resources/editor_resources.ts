import { Resource } from 'fastmcp';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';

/**
 * Resource that provides information about the current state of the Godot editor
 */
type GetConnection = () => GodotConnection;

export function createEditorStateResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/editor/state',
    name: 'Godot Editor State',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get editor state
        const result = await godot.sendCommand('get_editor_state');
        
        return {
          text: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error fetching editor state:', error);
        throw error;
      }
    }
  };
}

export const editorStateResource: Resource = createEditorStateResource();

/**
 * Resource that provides information about the currently selected node
 */
export function createSelectedNodeResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/editor/selected_node',
    name: 'Godot Selected Node',
    mimeType: 'application/json',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get selected node
        const result = await godot.sendCommand('get_selected_node');
        
        return {
          text: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error fetching selected node:', error);
        throw error;
      }
    }
  };
}

export const selectedNodeResource: Resource = createSelectedNodeResource();

/**
 * Resource that provides information about the currently edited script
 */
export function createCurrentScriptResource(getConnection: GetConnection = getGodotConnection): Resource {
  return {
    uri: 'godot/editor/current_script',
    name: 'Current Script in Editor',
    mimeType: 'text/plain',
    async load() {
      const godot = getConnection();
    
      try {
        // Call a command on the Godot side to get current script
        const result = await godot.sendCommand('get_current_script');
        
        // If we got a script path, return script content and metadata
        if (result && result.script_found && result.content) {
          return {
            text: result.content,
            metadata: {
              path: result.script_path,
              language: result.script_path.endsWith('.gd') ? 'gdscript' : 
                       result.script_path.endsWith('.cs') ? 'csharp' : 'unknown'
            }
          };
        } else {
          return {
            text: '',
            metadata: {
              error: 'No script currently being edited',
              script_found: false
            }
          };
        }
      } catch (error) {
        console.error('Error fetching current script:', error);
        throw error;
      }
    }
  };
}

export const currentScriptResource: Resource = createCurrentScriptResource();
