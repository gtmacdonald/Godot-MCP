import { z } from 'zod';
import { getGodotConnection, GodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Type definitions for asset tool parameters
 */

interface AssetInfo {
  path: string;
  category: string;
  file_size: number;
  lfs_tracked: boolean;
  lfs_pointer?: {
    oid: string;
    size: number;
  };
  metadata: Record<string, any>;
}

interface GetAssetInfoParams {
  path: string;
}

interface ImportAssetParams {
  source_path: string;
  target_path: string;
  category: 'texture' | 'audio' | 'model' | 'font' | 'video';
}

interface ExportAssetParams {
  path: string;
  destination: string;
}

interface GetLFSStatusParams {
  path: string;
}

interface ListAssetsParams {
  category?: 'texture' | 'audio' | 'model' | 'font' | 'video' | 'all';
  directory?: string;
}

interface BatchImportAssetsParams {
  source_paths: string[];
  target_dir: string;
  category: string;
}

type GetConnection = () => GodotConnection;

/**
 * Definition for asset tools - operations for managing binary assets with Git LFS
 */
export function createAssetTools(getConnection: GetConnection = getGodotConnection): MCPTool[] {
  return [
    {
      name: 'get_asset_info',
      description: 'Get detailed information about a binary asset including LFS status',
      parameters: z.object({
        path: z.string()
          .describe('Asset path (e.g. "res://textures/player.png")'),
      }),
      execute: async ({ path }: GetAssetInfoParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand<AssetInfo>('get_asset_info', { path });

          const lfsInfo = result.lfs_tracked
            ? `\nLFS Tracking:\n  OID: ${result.lfs_pointer?.oid}\n  Size: ${result.lfs_pointer?.size} bytes`
            : '\nLFS Tracking: Not tracked';

          return `Asset Info for: ${result.path}\nCategory: ${result.category}\nFile Size: ${result.file_size} bytes${lfsInfo}\nMetadata: ${JSON.stringify(result.metadata, null, 2)}`;
        } catch (error) {
          throw new Error(`Failed to get asset info: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'import_asset',
      description: 'Import a binary asset into the project with Git LFS support',
      parameters: z.object({
        source_path: z.string()
          .describe('Source file path on local filesystem'),
        target_path: z.string()
          .describe('Target path in Godot project (e.g. "res://textures/player.png")'),
        category: z.enum(['texture', 'audio', 'model', 'font', 'video'])
          .describe('Asset category'),
      }),
      execute: async ({ source_path, target_path, category }: ImportAssetParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('import_asset', {
            source_path,
            target_path,
            category,
          });

          return `Imported asset to: ${result.target_path}\nCategory: ${category}\nLFS OID: ${result.lfs_oid}\nFile Size: ${result.file_size} bytes`;
        } catch (error) {
          throw new Error(`Failed to import asset: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'export_asset',
      description: 'Export a binary asset from the project to a local file',
      parameters: z.object({
        path: z.string()
          .describe('Asset path in Godot project (e.g. "res://textures/player.png")'),
        destination: z.string()
          .describe('Destination path on local filesystem'),
      }),
      execute: async ({ path, destination }: ExportAssetParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('export_asset', {
            path,
            destination,
          });

          return `Exported asset from ${result.source_path} to ${result.destination}\nBytes written: ${result.bytes_written}`;
        } catch (error) {
          throw new Error(`Failed to export asset: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'get_lfs_status',
      description: 'Check Git LFS status for an asset file',
      parameters: z.object({
        path: z.string()
          .describe('Asset path to check (e.g. "res://textures/player.png")'),
      }),
      execute: async ({ path }: GetLFSStatusParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('get_lfs_status', { path });

          if (result.lfs_tracked) {
            return `LFS Status for: ${result.path}\nTracked: Yes\nOID: ${result.oid}\nStored Size: ${result.stored_size} bytes\nPointer File: Yes`;
          } else {
            return `LFS Status for: ${result.path}\nTracked: No\nCategory: ${result.category}\nShould be LFS: ${result.should_be_lfs ? 'Yes' : 'No'}\nActual Size: ${result.actual_size} bytes`;
          }
        } catch (error) {
          throw new Error(`Failed to get LFS status: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'list_assets',
      description: 'List assets by category with LFS status',
      parameters: z.object({
        category: z.enum(['texture', 'audio', 'model', 'font', 'video', 'all']).optional()
          .describe('Asset category to filter (default: all)'),
        directory: z.string().optional()
          .describe('Directory to scan (default: res://)'),
      }),
      execute: async ({ category = 'all', directory = 'res://' }: ListAssetsParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('list_assets', {
            category,
            directory,
          });

          if (result.count === 0) {
            return `No ${category === 'all' ? '' : category + ' '}assets found in ${directory}`;
          }

          const formattedAssets = result.assets.map((asset: any) =>
            `${asset.path}\n  Size: ${asset.size} bytes\n  LFS: ${asset.lfs_tracked ? 'Yes' : 'No'}`
          ).join('\n\n');

          return `Found ${result.count} ${category === 'all' ? '' : category + ' '}assets in ${directory}:\n\n${formattedAssets}`;
        } catch (error) {
          throw new Error(`Failed to list assets: ${(error as Error).message}`);
        }
      },
    },

    {
      name: 'batch_import_assets',
      description: 'Import multiple assets at once with Git LFS',
      parameters: z.object({
        source_paths: z.array(z.string())
          .describe('Array of source file paths to import'),
        target_dir: z.string()
          .describe('Target directory in Godot project (e.g. "res://textures/")'),
        category: z.string()
          .describe('Asset category for all files'),
      }),
      execute: async ({ source_paths, target_dir, category }: BatchImportAssetsParams): Promise<string> => {
        const godot = getConnection();

        try {
          const result = await godot.sendCommand('batch_import_assets', {
            source_paths,
            target_dir,
            category,
          });

          let output = `Batch import complete:\nTotal: ${result.total}\nImported: ${result.imported}\nFailed: ${result.failed}\n`;

          if (result.results && result.results.length > 0) {
            output += '\nSuccessfully imported:\n';
            for (const item of result.results) {
              output += `  ${item.source} -> ${item.target}\n`;
            }
          }

          if (result.errors && result.errors.length > 0) {
            output += '\nFailed to import:\n';
            for (const error of result.errors) {
              output += `  ${error.source}: ${error.error}\n`;
            }
          }

          return output;
        } catch (error) {
          throw new Error(`Failed to batch import assets: ${(error as Error).message}`);
        }
      },
    },
  ];
}

export const assetTools: MCPTool[] = createAssetTools();
