import { resolve, relative, join, sep } from "node:path";
import { mkdir, writeFile, readFile, opendir, unlink, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getConversation, updateConversation } from "@agenthub/db";
import { WORKSPACE_ROOT } from "../config/env.js";

// ─── Types ─────────────────────────────────────────────────────────────

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  encoding: string;
}

const MAX_PREVIEW_SIZE = 1_000_000; // 1MB
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".htm",
  ".css", ".scss", ".less", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
  ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".php", ".swift", ".kt", ".kts", ".sh", ".bash", ".zsh", ".ps1", ".bat",
  ".sql", ".graphql", ".svg", ".env", ".gitignore", ".dockerfile",
  ".npmrc", ".yarnrc", ".editorconfig", ".prettierrc", ".eslintrc",
]);

// ─── File Service ──────────────────────────────────────────────────────

export class FileService {
  /**
   * Resolve the absolute workspace directory path for a conversation.
   * If the conversation has no workspacePath, auto-create one and persist it.
   */
  async getWorkspaceDir(conversationId: string): Promise<string> {
    const conv = await getConversation(conversationId);
    if (!conv) throw new Error(`Conversation ${conversationId} not found`);

    let wsPath = conv.workspacePath;
    if (!wsPath) {
      wsPath = `workspace/conv_${conversationId}`;
      await updateConversation(conversationId, { workspacePath: wsPath });
    }

    return resolve(WORKSPACE_ROOT, wsPath);
  }

  /**
   * Ensure the workspace directory exists, creating it if necessary.
   * Returns the resolved absolute path.
   */
  async ensureWorkspace(conversationId: string): Promise<string> {
    const dir = await this.getWorkspaceDir(conversationId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Validate that a file path stays within the workspace directory.
   * Prevents path traversal attacks.
   */
  private resolveSafePath(workspaceDir: string, filePath: string): string {
    // Normalize and resolve the requested path
    const resolved = resolve(workspaceDir, filePath);
    // Verify it's still within the workspace
    if (!resolved.startsWith(workspaceDir + sep) && resolved !== workspaceDir) {
      throw new Error("Path traversal detected");
    }
    return resolved;
  }

  /**
   * Save content to a file in the conversation workspace.
   * Creates parent directories as needed.
   */
  async saveFile(
    conversationId: string,
    filePath: string,
    content: string,
  ): Promise<{ path: string; size: number }> {
    const workspaceDir = await this.ensureWorkspace(conversationId);
    const safePath = this.resolveSafePath(workspaceDir, filePath);

    // Ensure parent directory exists
    await mkdir(resolve(safePath, ".."), { recursive: true });

    // Write file atomically: write to temp then rename
    const tmpPath = safePath + ".tmp";
    await writeFile(tmpPath, content, "utf-8");

    // Rename (atomic on same filesystem)
    await rm(safePath, { force: true });
    // Use copyFile + unlink since rename across devices can fail
    const { copyFile, unlink: removeFile } = await import("node:fs/promises");
    await copyFile(tmpPath, safePath);
    await removeFile(tmpPath);

    const stats = await stat(safePath);
    // Return path relative to workspace
    const relPath = relative(workspaceDir, safePath).replace(/\\/g, "/");
    return { path: relPath, size: stats.size };
  }

  /**
   * Read a file's content from the conversation workspace.
   * Only allows text files under MAX_PREVIEW_SIZE.
   */
  async readFile(
    conversationId: string,
    filePath: string,
  ): Promise<FileContent> {
    const workspaceDir = await this.ensureWorkspace(conversationId);
    const safePath = this.resolveSafePath(workspaceDir, filePath);

    const stats = await stat(safePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    if (stats.size > MAX_PREVIEW_SIZE) {
      throw new Error(`File too large (${stats.size} bytes). Max preview size: ${MAX_PREVIEW_SIZE} bytes`);
    }

    const content = await readFile(safePath, "utf-8");
    const relPath = relative(workspaceDir, safePath).replace(/\\/g, "/");

    return {
      path: relPath,
      content,
      size: stats.size,
      encoding: "utf-8",
    };
  }

  /**
   * Recursively list files and directories in the workspace.
   * Returns a tree structure.
   */
  async listFiles(
    conversationId: string,
    subPath?: string,
  ): Promise<FileNode[]> {
    const workspaceDir = await this.ensureWorkspace(conversationId);
    const targetDir = subPath
      ? this.resolveSafePath(workspaceDir, subPath)
      : workspaceDir;

    if (!existsSync(targetDir)) {
      return [];
    }

    const entries: FileNode[] = [];
    const dir = await opendir(targetDir);

    for await (const entry of dir) {
      // Skip hidden files and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = join(targetDir, entry.name);
      const relPath = relative(workspaceDir, fullPath).replace(/\\/g, "/");
      const stats = await stat(fullPath);

      if (entry.isDirectory()) {
        const children = await this._listDirRecursive(fullPath, workspaceDir);
        entries.push({
          name: entry.name,
          path: relPath,
          type: "dir",
          children,
        });
      } else if (entry.isFile()) {
        entries.push({
          name: entry.name,
          path: relPath,
          type: "file",
          size: stats.size,
        });
      }
    }

    // Sort: directories first, then by name
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  /**
   * Internal recursive directory listing (flat depth, 1 level by default).
   * Only lists immediate children, not full recursion (to avoid huge trees).
   */
  private async _listDirRecursive(
    dirPath: string,
    workspaceDir: string,
    maxDepth = 1,
    currentDepth = 0,
  ): Promise<FileNode[]> {
    if (currentDepth >= maxDepth) return [];

    const entries: FileNode[] = [];
    try {
      const dir = await opendir(dirPath);
      for await (const entry of dir) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const fullPath = join(dirPath, entry.name);
        const relPath = relative(workspaceDir, fullPath).replace(/\\/g, "/");
        const stats = await stat(fullPath);

        if (entry.isDirectory()) {
          const children = await this._listDirRecursive(
            fullPath, workspaceDir, maxDepth, currentDepth + 1,
          );
          entries.push({ name: entry.name, path: relPath, type: "dir", children });
        } else if (entry.isFile()) {
          entries.push({ name: entry.name, path: relPath, type: "file", size: stats.size });
        }
      }
    } catch {
      // Skip directories we can't read
    }

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  /**
   * Delete a file or directory from the workspace.
   */
  async deleteFile(
    conversationId: string,
    filePath: string,
  ): Promise<void> {
    const workspaceDir = await this.ensureWorkspace(conversationId);
    const safePath = this.resolveSafePath(workspaceDir, filePath);

    const stats = await stat(safePath);
    if (stats.isDirectory()) {
      await rm(safePath, { recursive: true, force: true });
    } else {
      await unlink(safePath);
    }
  }

  /**
   * Check if a file is a text file based on its extension.
   */
  isTextFile(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext) return true;
    return TEXT_EXTENSIONS.has("." + ext);
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────

export const fileService = new FileService();
