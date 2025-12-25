import { FastMCP } from 'fastmcp';
import { nodeTools } from './tools/node_tools.js';
import { scriptTools } from './tools/script_tools.js';
import { sceneTools } from './tools/scene_tools.js';
import { editorTools } from './tools/editor_tools.js';
import { assetTools } from './tools/asset_tools.js';
import { getGodotConnection } from './utils/godot_connection.js';

// Import resources
import { 
  sceneListResource, 
  sceneStructureResource,
  sceneContentTemplate,
  sceneStructureTemplate,
  editedSceneStructureResource,
  editedSceneStructureTemplate
} from './resources/scene_resources.js';
import { 
  scriptResource, 
  scriptListResource,
  scriptMetadataResource,
  scriptContentTemplate,
  scriptMetadataTemplate
} from './resources/script_resources.js';
import { 
  projectStructureResource,
  projectSettingsResource,
  projectResourcesResource,
  resourceTextTemplate
} from './resources/project_resources.js';
import { 
  editorStateResource,
  selectedNodeResource,
  currentScriptResource 
} from './resources/editor_resources.js';

/**
 * Main entry point for the Godot MCP server
 */
async function main() {
  console.error('Starting Godot MCP server...');

  // Create FastMCP instance
  const server = new FastMCP({
    name: 'GodotMCP',
    version: '1.0.0',
  });

  // Register all tools
  [...nodeTools, ...scriptTools, ...sceneTools, ...editorTools, ...assetTools].forEach(tool => {
    server.addTool(tool);
  });

  // Register all resources
  // Static resources
  server.addResource(sceneListResource);
  server.addResource(scriptListResource);
  server.addResource(projectStructureResource);
  server.addResource(projectSettingsResource);
  server.addResource(projectResourcesResource);
  server.addResource(editorStateResource);
  server.addResource(selectedNodeResource);
  server.addResource(currentScriptResource);
  server.addResource(sceneStructureResource);
  server.addResource(editedSceneStructureResource);
  server.addResource(scriptResource);
  server.addResource(scriptMetadataResource);

  // Resource templates (dynamic resources)
  server.addResourceTemplate(scriptContentTemplate);
  server.addResourceTemplate(scriptMetadataTemplate);
  // Register specific templates before generic scene-by-path templates.
  server.addResourceTemplate(editedSceneStructureTemplate);
  server.addResourceTemplate(sceneContentTemplate);
  server.addResourceTemplate(sceneStructureTemplate);
  server.addResourceTemplate(resourceTextTemplate);

  // Try to connect to Godot in the background (tools/resources will also reconnect on demand).
  const godot = getGodotConnection();
  void godot
    .connect()
    .then(() => {
      console.error('Successfully connected to Godot WebSocket server');
    })
    .catch((error) => {
      const err = error as Error;
      console.warn(`Could not connect to Godot (startup): ${err.message}`);
      console.warn('Will retry connection when commands are executed');
    });

  // Start the server
  server.start({
    transportType: 'stdio',
  });

  console.error('Godot MCP server started');

  // Handle cleanup
  const cleanup = () => {
    console.error('Shutting down Godot MCP server...');
    const godot = getGodotConnection();
    godot.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// Start the server
main().catch(error => {
  console.error('Failed to start Godot MCP server:', error);
  process.exit(1);
});
