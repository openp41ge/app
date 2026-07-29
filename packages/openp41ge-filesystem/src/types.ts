/**
 * Types used by the filesystem service layer.
 *
 * Pure data — no platform dependencies. The host app maps its domain
 * model to these types.
 */

export interface WorktreeData {
  branch: string;
  path: string;
  exists: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}
