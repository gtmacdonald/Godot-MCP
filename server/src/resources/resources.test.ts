import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSceneListResource,
  createSceneStructureResource,
} from './scene_resources.js';
import {
  createScriptListResource,
  createScriptMetadataResource,
} from './script_resources.js';
import {
  createProjectStructureResource,
  createProjectSettingsResource,
  createProjectResourcesResource,
} from './project_resources.js';
import {
  createEditorStateResource,
  createSelectedNodeResource,
  createCurrentScriptResource,
} from './editor_resources.js';

const sendCommand = vi.fn();
const mockConnection = { sendCommand } as any;
const getConnection = () => mockConnection;

describe('resources', () => {
  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('sceneListResource returns list payload', async () => {
    sendCommand.mockResolvedValue({ files: ['res://a.tscn'] });
    const res = createSceneListResource(getConnection);
    const out = await res.load();
    expect(sendCommand).toHaveBeenCalledWith('list_project_files', {
      extensions: ['.tscn', '.scn'],
    });
    expect(JSON.parse(out.text)).toEqual({ scenes: ['res://a.tscn'], count: 1 });
  });

  it('sceneStructureResource passes through current structure', async () => {
    sendCommand.mockResolvedValue({ ok: true });
    const res = createSceneStructureResource(getConnection);
    const out = await res.load();
    expect(sendCommand).toHaveBeenCalledWith('get_current_scene_structure', {});
    expect(JSON.parse(out.text)).toEqual({ ok: true });
  });

  it('scriptListResource splits gd/cs', async () => {
    sendCommand.mockResolvedValue({ files: ['res://a.gd', 'res://b.cs'] });
    const res = createScriptListResource(getConnection);
    const out = await res.load();
    const parsed = JSON.parse(out.text);
    expect(parsed.gdscripts).toEqual(['res://a.gd']);
    expect(parsed.csharp_scripts).toEqual(['res://b.cs']);
  });

  it('scriptMetadataResource returns json text', async () => {
    sendCommand.mockResolvedValue({ meta: 1 });
    const res = createScriptMetadataResource(getConnection);
    const out = await res.load();
    expect(sendCommand).toHaveBeenCalledWith('get_script_metadata', {
      path: 'res://default_script.gd',
    });
    expect(JSON.parse(out.text)).toEqual({ meta: 1 });
  });

  it('project resources call correct commands', async () => {
    sendCommand.mockResolvedValue({ a: 1 });
    const structure = await createProjectStructureResource(getConnection).load();
    const settings = await createProjectSettingsResource(getConnection).load();
    const resources = await createProjectResourcesResource(getConnection).load();
    expect(sendCommand).toHaveBeenCalledWith('get_project_structure');
    expect(sendCommand).toHaveBeenCalledWith('get_project_settings');
    expect(sendCommand).toHaveBeenCalledWith('list_project_resources');
    expect(JSON.parse(structure.text)).toEqual({ a: 1 });
    expect(JSON.parse(settings.text)).toEqual({ a: 1 });
    expect(JSON.parse(resources.text)).toEqual({ a: 1 });
  });

  it('editor resources handle current script missing', async () => {
    sendCommand.mockResolvedValue({ script_found: false });
    await createEditorStateResource(getConnection).load();
    await createSelectedNodeResource(getConnection).load();
    const script = await createCurrentScriptResource(getConnection).load();
    expect(sendCommand).toHaveBeenCalledWith('get_editor_state');
    expect(sendCommand).toHaveBeenCalledWith('get_selected_node');
    expect(sendCommand).toHaveBeenCalledWith('get_current_script');
    expect(script.text).toBe('');
    expect(script.metadata?.script_found).toBe(false);
  });
});

