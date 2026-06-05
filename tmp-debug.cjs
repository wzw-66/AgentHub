const { accessSync, readFileSync, existsSync } = require("fs");
const { join, dirname, resolve } = require("path");

const pathDirs = (process.env.PATH || "").split(";");
const extensions = [".cmd", ".bat", ".exe"];
let foundPath = null;
for (const dir of pathDirs) {
  for (const ext of extensions) {
    const fullPath = join(dir.trim(), "opencode" + ext);
    try {
      accessSync(fullPath);
      foundPath = fullPath;
      console.log("Found:", fullPath);
      break;
    } catch {}
  }
  if (foundPath) break;
}

if (foundPath && foundPath.endsWith(".cmd")) {
  const dir = dirname(foundPath);
  const content = readFileSync(foundPath, "utf8");
  console.log("CMD content:", JSON.stringify(content));

  const resolvedContent = content
    .replace(/%dp0%/gi, dir + "\\")
    .replace(/%_prog%/g, process.execPath);

  console.log("Resolved content:", JSON.stringify(resolvedContent));

  const lines = resolvedContent.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const matches = [...lines[i].matchAll(/"([^"]+\.(?:js|exe))"/g)];
    if (matches.length > 0) {
      const target = matches[matches.length - 1][1];
      const finalPath = resolve(target.replace(/\\\\/g, "\\"));
      console.log("Entry point:", finalPath);
      console.log("Exists:", existsSync(finalPath));
      break;
    }
  }
}
