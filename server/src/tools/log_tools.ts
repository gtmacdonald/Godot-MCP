import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCPTool } from '../utils/types.js';

/**
 * Get the default Godot log directory based on platform
 */
function getDefaultLogBaseDir(): string {
  const platform = process.platform;
  const home = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Godot', 'app_userdata');
    case 'linux':
      return path.join(home, '.local', 'share', 'godot', 'app_userdata');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Godot', 'app_userdata');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the log directory, respecting environment variable overrides
 */
function getLogDir(projectName?: string): string {
  // Check for explicit override
  const envLogDir = process.env.GODOT_LOG_DIR;
  if (envLogDir) {
    return envLogDir;
  }

  const baseDir = getDefaultLogBaseDir();
  const project = projectName || process.env.GODOT_PROJECT_NAME;

  if (project) {
    return path.join(baseDir, project, 'logs');
  }

  // Return base dir - caller will need to enumerate projects
  return baseDir;
}

interface LogFileInfo {
  name: string;
  path: string;
  project: string;
  modifiedTime: Date;
  size: number;
}

/**
 * Find all log files across projects
 */
function findLogFiles(projectFilter?: string): LogFileInfo[] {
  const logFiles: LogFileInfo[] = [];
  const envLogDir = process.env.GODOT_LOG_DIR;

  if (envLogDir) {
    // Direct log directory specified
    if (fs.existsSync(envLogDir)) {
      const files = fs.readdirSync(envLogDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(envLogDir, file);
          const stats = fs.statSync(filePath);
          logFiles.push({
            name: file,
            path: filePath,
            project: 'custom',
            modifiedTime: stats.mtime,
            size: stats.size,
          });
        }
      }
    }
    return logFiles;
  }

  const baseDir = getDefaultLogBaseDir();
  if (!fs.existsSync(baseDir)) {
    return logFiles;
  }

  // Enumerate project directories
  const projectDirs = fs.readdirSync(baseDir);
  for (const projectDir of projectDirs) {
    // Apply project filter if specified
    if (projectFilter && !projectDir.toLowerCase().includes(projectFilter.toLowerCase())) {
      continue;
    }

    const logsDir = path.join(baseDir, projectDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      continue;
    }

    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        try {
          const stats = fs.statSync(filePath);
          logFiles.push({
            name: file,
            path: filePath,
            project: projectDir,
            modifiedTime: stats.mtime,
            size: stats.size,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  return logFiles;
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ListLogsParams {
  project?: string;
  limit?: number;
}

interface ReadLogParams {
  file: string;
  tail?: number;
  grep?: string;
}

export function createLogTools(): MCPTool[] {
  return [
    {
      name: 'list_godot_logs',
      description: 'List Godot log files sorted by modification time (newest first). Searches the standard Godot log directories for all projects, or filter by project name.',
      parameters: z.object({
        project: z.string().optional().describe('Filter by project name (partial match, case-insensitive)'),
        limit: z.number().int().positive().optional().describe('Maximum number of log files to return (default: 20)'),
      }),
      execute: async ({ project, limit = 20 }: ListLogsParams): Promise<string> => {
        try {
          const logFiles = findLogFiles(project);

          if (logFiles.length === 0) {
            const baseDir = process.env.GODOT_LOG_DIR || getDefaultLogBaseDir();
            return `No log files found.\n\nSearched in: ${baseDir}\n\nTip: Set GODOT_LOG_DIR environment variable to specify a custom log directory.`;
          }

          // Sort by modification time, newest first
          logFiles.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());

          // Apply limit
          const limitedFiles = logFiles.slice(0, limit);

          const lines: string[] = [`Found ${logFiles.length} log file(s)${limit < logFiles.length ? ` (showing ${limit})` : ''}:\n`];

          for (const file of limitedFiles) {
            const timestamp = file.modifiedTime.toISOString().replace('T', ' ').substring(0, 19);
            lines.push(`[${file.project}] ${file.name}`);
            lines.push(`  Path: ${file.path}`);
            lines.push(`  Modified: ${timestamp}  Size: ${formatSize(file.size)}`);
            lines.push('');
          }

          return lines.join('\n');
        } catch (error) {
          throw new Error(`Failed to list log files: ${(error as Error).message}`);
        }
      },
    },
    {
      name: 'read_godot_log',
      description: 'Read contents of a Godot log file. Supports reading the last N lines (tail) and filtering by pattern (grep).',
      parameters: z.object({
        file: z.string().describe('Path to the log file (full path or filename if in standard location)'),
        tail: z.number().int().positive().optional().describe('Return only the last N lines'),
        grep: z.string().optional().describe('Filter lines containing this pattern (case-insensitive)'),
      }),
      execute: async ({ file, tail, grep }: ReadLogParams): Promise<string> => {
        try {
          let filePath = file;

          // If not an absolute path, try to find it in standard locations
          if (!path.isAbsolute(file)) {
            const logFiles = findLogFiles();
            const match = logFiles.find(f => f.name === file || f.path.endsWith(file));
            if (match) {
              filePath = match.path;
            } else {
              throw new Error(`Log file not found: ${file}. Use list_godot_logs to see available files.`);
            }
          }

          if (!fs.existsSync(filePath)) {
            throw new Error(`Log file does not exist: ${filePath}`);
          }

          const content = fs.readFileSync(filePath, 'utf-8');
          let lines = content.split('\n');

          // Apply grep filter
          if (grep) {
            const pattern = grep.toLowerCase();
            lines = lines.filter(line => line.toLowerCase().includes(pattern));
          }

          // Apply tail
          if (tail && lines.length > tail) {
            lines = lines.slice(-tail);
          }

          const result = lines.join('\n');

          if (result.trim().length === 0) {
            if (grep) {
              return `No lines matching "${grep}" found in ${path.basename(filePath)}`;
            }
            return `Log file is empty: ${path.basename(filePath)}`;
          }

          const header = [`=== ${path.basename(filePath)} ===`];
          if (grep) {
            header.push(`Filter: "${grep}"`);
          }
          if (tail) {
            header.push(`Last ${Math.min(tail, lines.length)} lines`);
          }
          header.push('');

          return header.join('\n') + result;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Log file not found: ${file}`);
          }
          throw new Error(`Failed to read log file: ${(error as Error).message}`);
        }
      },
    },
  ];
}

export const logTools: MCPTool[] = createLogTools();
