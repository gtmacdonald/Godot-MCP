/**
 * Git LFS pointer file utilities
 */

export interface LFSPointer {
  valid: boolean;
  oid: string;
  size: number;
}

const POINTER_VERSION = 'https://git-lfs.github.com/spec/v1';

/**
 * Parse a Git LFS pointer file content
 */
export function parseLFSPointer(content: string): LFSPointer {
  const lines = content.split('\n');
  const result: LFSPointer = {
    valid: false,
    oid: '',
    size: 0
  };

  if (lines.length < 3 || !lines[0]?.startsWith('version ' + POINTER_VERSION)) {
    return result;
  }

  for (const line of lines) {
    if (line.startsWith('oid sha256:')) {
      result.oid = line.split(':')[1].trim();
    } else if (line.startsWith('size ')) {
      result.size = parseInt(line.split(' ')[1] || '0', 10);
    }
  }

  result.valid = result.oid !== '';
  return result;
}

/**
 * Generate a Git LFS pointer file content
 */
export function generateLFSPointer(oid: string, size: number): string {
  return `version ${POINTER_VERSION}\noid sha256:${oid}\nsize ${size}\n`;
}

/**
 * Check if file content is a Git LFS pointer
 */
export function isLFSPointer(content: string): boolean {
  return content.trim().startsWith('version ' + POINTER_VERSION);
}

/**
 * Calculate SHA256 hash of a buffer for LFS OID
 */
export function calculateSHA256(buffer: Buffer): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
