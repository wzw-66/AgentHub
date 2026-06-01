import { readFileSync, accessSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

export interface ResolvedCommand {
  command: string;
  prefixArgs: string[];
}

/**
 * Resolve a CLI command to a directly-spawnable path.
 *
 * On Unix/Mac: returns the command name as-is (shell resolves via PATH).
 *
 * On Windows: npm-installed CLIs ship as `.cmd` batch files that cannot be
 * spawned with `child_process.spawn` (EINVAL). We parse the `.cmd` wrapper
 * to extract the actual target binary (`.exe` or `.js`) and spawn that
 * directly, avoiding the need for `cmd.exe`.
 *
 * - `.exe` target → spawned directly
 * - `.js` target  → run via `process.execPath` (current Node.js binary)
 */
export function resolveCommand(name: string): ResolvedCommand {
  if (process.platform !== "win32") {
    return { command: name, prefixArgs: [] };
  }

  const cmdPath = findInPath(name);
  if (!cmdPath) {
    return { command: name, prefixArgs: [] };
  }

  const entry = parseEntryPoint(cmdPath);
  if (!entry) {
    return { command: cmdPath, prefixArgs: [] };
  }

  if (entry.endsWith(".js")) {
    // Use process.execPath if it exists, otherwise resolve "node" from PATH
    try {
      accessSync(process.execPath);
      return { command: process.execPath, prefixArgs: [entry] };
    } catch {
      const nodeEntry = resolveNodeFromPath();
      return { command: nodeEntry.command, prefixArgs: [...nodeEntry.prefixArgs, entry] };
    }
  }

  return { command: entry, prefixArgs: [] };
}

/**
 * Search PATH for the command with Windows executable extensions.
 */
function findInPath(name: string): string | null {
  const pathDirs = (process.env.PATH || "").split(";");
  const extensions = [".cmd", ".bat", ".exe"];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = join(dir, name + ext);
      try {
        accessSync(fullPath);
        return fullPath;
      } catch {
        // continue searching
      }
    }
  }
  return null;
}

/**
 * Parse a Windows `.cmd` batch file to find the real binary entry point.
 *
 * npm-generated .cmd wrappers follow a predictable template. The last
 * non-trivial line runs the actual binary via a quoted path that contains
 * `%dp0%` (the batch file's own directory). We resolve that variable and
 * return the absolute path to the actual entry point.
 *
 * Examples of parsed targets:
 *   claude.cmd   → ...\node_modules\@anthropic-ai\claude-code\cli.js
 *   opencode.cmd → ...\node_modules\opencode-ai\bin\opencode.exe
 */
function parseEntryPoint(cmdPath: string): string | null {
  const dir = dirname(cmdPath);
  const content = readFileSync(cmdPath, "utf8");

  // Resolve batch variables: %dp0% → batch file's directory, %_prog% → node path
  const resolvedContent = content
    .replace(/%dp0%/gi, dir + "\\")
    .replace(/%_prog%/g, process.execPath);

  // Find the last quoted string ending with .js or .exe
  // Walk lines bottom-up since the execution line is always near the end
  const lines = resolvedContent.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const matches = [...lines[i]!.matchAll(/"([^"]+\.(?:js|exe))"/g)];
    if (matches.length === 0) continue;

    // Take the last match (the script/binary argument)
    const target = matches[matches.length - 1]![1]!;
    return resolve(target.replace(/\\\\/g, "\\"));
  }

  return null;
}

/**
 * Resolve the `node` executable from PATH on Windows.
 * Tries node.exe directly, then falls back to parsing node.cmd.
 */
function resolveNodeFromPath(): ResolvedCommand {
  // Try node.exe directly
  const pathDirs = (process.env.PATH || "").split(";");
  for (const dir of pathDirs) {
    const exePath = join(dir, "node.exe");
    try {
      accessSync(exePath);
      return { command: exePath, prefixArgs: [] };
    } catch {
      // continue
    }
  }
  // Fall back to node.cmd parsing
  for (const dir of pathDirs) {
    const cmdPath = join(dir, "node.cmd");
    try {
      accessSync(cmdPath);
      const entry = parseEntryPoint(cmdPath);
      if (entry) {
        if (entry.endsWith(".js")) {
          // Recursive case: node.cmd wraps a .js shim — use process.execPath
          try {
            accessSync(process.execPath);
          } catch {
            // Last resort: hardcoded fallback won't help here
          }
          return { command: process.execPath, prefixArgs: [entry] };
        }
        return { command: entry, prefixArgs: [] };
      }
    } catch {
      // continue
    }
  }
  // Last resort
  return { command: "node", prefixArgs: [] };
}
