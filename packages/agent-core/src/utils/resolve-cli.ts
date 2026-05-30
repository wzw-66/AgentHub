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
    return { command: process.execPath, prefixArgs: [entry] };
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
